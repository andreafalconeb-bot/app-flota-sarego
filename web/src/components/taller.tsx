// Modo taller de neumáticos (Andrea, 26/nov/2026): "un botón para
// desmontar por eje (los 2 o los 4) y para montarlos también por eje...
// la opción gráfica de seleccionar y arrastrar para rotarlos... debe
// sugerir cómo rotarlos en función del desgaste irregular y... al
// arrastrar un neumático de una posición a otra, desmontar el neumático
// del destino y ponerlo en un lado del camión para que lo vuelva a poner
// en otra posición".
//
// Todo es un borrador hasta "Revisar y guardar": ahí se pide lo que
// exigen las reglas (destino y profundidad de lo que sale, o la razón si
// es desecho) y se escriben los movimientos.
import { useEffect, useMemo, useRef, useState, type PointerEvent as PE } from 'react'
import { useEmpresa } from '../lib/empresa'
import { PLANTILLAS, nombrePosicion, type Eje } from '../lib/ejes'
import { errorProfundidad, profundidadMaxima, estadoProfundidad } from '../lib/calculos'
import { sugerirRotacion, desgasteIrregular, type InfoNeumatico, type Paso } from '../lib/rotacion'
import { hoyISO, nombreNeumatico } from '../lib/formato'
import type { Activo, Neumatico } from '../lib/tipos'
import { condiciones } from './neumaticos'
import { Campo, ErrorMsg, Modal, Selector, mensajeError, num } from './ui'
import { RAZONES_DESECHO } from '../lib/catalogos'

type Origen = { tipo: 'pos'; pos: string } | { tipo: 'banco' } | { tipo: 'inv' }
type Destino = { tipo: 'pos'; pos: string } | { tipo: 'banco' } | { tipo: 'inv' }
type Plan = Record<string, string | undefined>
type EstadoFinal = 'inventario' | 'reparacion' | 'renovacion' | 'desecho'

const ES_DUAL = (e: Eje) => e.posiciones.length === 4

export function TallerNeumaticos({ activo, onCerrar }: { activo: Activo; onCerrar: () => void }) {
  const { datos, guardar } = useEmpresa()
  const plantilla = PLANTILLAS[activo.configuracion ?? ''] ?? PLANTILLAS.ninguna
  const conds = useMemo(() => condiciones(datos), [datos])
  const porId = useMemo(() => new Map(datos.neumaticos.map((n) => [n.id, n])), [datos.neumaticos])

  // Como está hoy el camión
  const inicial = useMemo(() => {
    const p: Plan = {}
    for (const n of datos.neumaticos) if (n.activo_id === activo.id && n.estado === 'montado' && n.posicion) p[n.posicion] = n.id
    return p
  }, [datos.neumaticos, activo.id])
  const posInicial = useMemo(() => new Map(Object.entries(inicial).map(([p, id]) => [id!, p])), [inicial])

  const [plan, setPlan] = useState<Plan>(inicial)
  const [banco, setBanco] = useState<string[]>([])
  const [sel, setSel] = useState<{ id: string; origen: Origen } | null>(null)
  const [razones, setRazones] = useState<Map<string, string>>(new Map())
  const [notas, setNotas] = useState<{ pos: string; texto: string }[] | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [revisar, setRevisar] = useState(false)

  // Última inspección de cada neumático: profundidad y ranuras
  const ultimaMedida = useMemo(() => {
    const fechas = new Map(datos.inspecciones.map((i) => [i.id, i.fecha]))
    const m = new Map<string, { mm: number | null; ranuras: (number | null)[] | null; fecha: string }>()
    for (const x of datos.inspeccionNeumaticos) {
      if (!x.neumatico_id) continue
      const f = fechas.get(x.inspeccion_id) ?? ''
      const prev = m.get(x.neumatico_id)
      if (x.profundidad_min_mm == null && !x.profundidades_mm?.length) continue
      if (!prev || f > prev.fecha) m.set(x.neumatico_id, { mm: x.profundidad_min_mm, ranuras: x.profundidades_mm, fecha: f })
    }
    return m
  }, [datos.inspecciones, datos.inspeccionNeumaticos])
  const mmDe = (id: string) => ultimaMedida.get(id)?.mm ?? conds.get(id)?.mm ?? null

  const enUso = new Set([...Object.values(plan).filter(Boolean), ...banco] as string[])
  const inventario = datos.neumaticos
    .filter((n) => n.estado === 'inventario' && !enUso.has(n.id))
    .sort((a, b) => Number(conds.get(b.id)?.nuevo) - Number(conds.get(a.id)?.nuevo) || (mmDe(b.id) ?? 0) - (mmDe(a.id) ?? 0))
  const medidaActivo = useMemo(() => {
    const cuenta = new Map<string, number>()
    for (const id of Object.values(inicial)) {
      const m = id ? porId.get(id)?.medida : null
      if (m) cuenta.set(m, (cuenta.get(m) ?? 0) + 1)
    }
    return [...cuenta].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  }, [inicial, porId])

  // ---------------- Movimientos del borrador ----------------
  const quitar = (id: string, p: Plan, b: string[]) => {
    for (const k of Object.keys(p)) if (p[k] === id) p[k] = undefined
    return b.filter((x) => x !== id)
  }

  const mover = (id: string, destino: Destino) => {
    const p = { ...plan }
    let b = quitar(id, p, banco)
    if (destino.tipo === 'pos') {
      const otro = p[destino.pos]
      // El que estaba en el destino queda al lado del camión
      if (otro && otro !== id) b = [...b, otro]
      p[destino.pos] = id
    } else if (destino.tipo === 'banco') {
      b = [...b, id]
    } else if (destino.tipo === 'inv') {
      // Solo vuelve al inventario uno que salió de ahí; uno del camión
      // queda al lado, porque al sacarlo hay que medirlo
      if (posInicial.has(id)) b = [...b, id]
    }
    setPlan(p)
    setBanco(b)
    setSel(null)
    setAviso(null)
  }

  const desmontarEje = (eje: Eje) => {
    const p = { ...plan }
    let b = [...banco]
    for (const pos of eje.posiciones) {
      const id = p[pos]
      if (id) {
        p[pos] = undefined
        b = [...b, id]
      }
    }
    setPlan(p)
    setBanco(b)
    setAviso(null)
  }

  const montarEje = (eje: Eje) => {
    const vacias = eje.posiciones.filter((pos) => !plan[pos])
    if (!vacias.length) return setAviso(`El ${eje.nombre.toLowerCase()} ya está completo.`)
    // Misma medida del camión; primero nuevos y de más banda
    const candidatos = inventario.filter((n) => !medidaActivo || n.medida === medidaActivo)
    if (!candidatos.length) {
      return setAviso(`No hay neumáticos ${medidaActivo ? `${medidaActivo} ` : ''}en inventario para montar. Arrástralos desde el lado del camión o regístralos en la pestaña Neumáticos.`)
    }
    // En duales, los pares quedan con ruedas parecidas: se toman seguidas
    const elegidos = candidatos.slice(0, vacias.length).sort((a, b) => (mmDe(b.id) ?? 0) - (mmDe(a.id) ?? 0))
    const orden = ES_DUAL(eje) ? [eje.posiciones[0], eje.posiciones[1], eje.posiciones[3], eje.posiciones[2]].filter((x) => vacias.includes(x)) : vacias
    const p = { ...plan }
    orden.forEach((pos, i) => {
      if (elegidos[i]) p[pos] = elegidos[i].id
    })
    setPlan(p)
    setAviso(elegidos.length < vacias.length ? `Solo había ${elegidos.length} en inventario para ${vacias.length} posiciones.` : null)
  }

  const sugerir = () => {
    const montados = new Map<string, InfoNeumatico>()
    for (const [pos, id] of Object.entries(plan)) {
      if (!id) continue
      montados.set(pos, { id, mm: mmDe(id), medida: porId.get(id)?.medida ?? null, ranuras: ultimaMedida.get(id)?.ranuras ?? null })
    }
    const s = sugerirRotacion(plantilla, montados)
    setNotas(s.notas)
    if (!s.pasos.length) {
      setAviso(montados.size ? 'Con las últimas medidas, no hace falta rotar: los duales están parejos y la dirección tiene la mejor banda.' : 'No hay neumáticos montados.')
      return
    }
    const p = { ...plan }
    for (const [pos, id] of s.asignacion) p[pos] = id
    setPlan(p)
    setRazones(new Map(s.pasos.map((x: Paso) => [x.id, x.razon])))
    setAviso(null)
  }

  const deshacer = () => {
    setPlan(inicial)
    setBanco([])
    setRazones(new Map())
    setNotas(null)
    setAviso(null)
    setSel(null)
  }

  // ---------------- Arrastrar (mouse y dedo) ----------------
  const [arrastre, setArrastre] = useState<{ id: string; x: number; y: number; sobre: string | null } | null>(null)
  const inicio = useRef<{ id: string; origen: Origen; x: number; y: number; movio: boolean } | null>(null)
  // Al soltar un arrastre el navegador puede mandar un clic: se ignora
  const soltadoAt = useRef(0)

  const destinoEn = (x: number, y: number): { clave: string; destino: Destino } | null => {
    const el = document.elementFromPoint(x, y)?.closest('[data-destino]') as HTMLElement | null
    const clave = el?.dataset.destino
    if (!clave) return null
    if (clave === 'banco') return { clave, destino: { tipo: 'banco' } }
    if (clave === 'inv') return { clave, destino: { tipo: 'inv' } }
    return { clave, destino: { tipo: 'pos', pos: clave.slice(4) } }
  }

  useEffect(() => {
    const mov = (e: PointerEvent) => {
      const i = inicio.current
      if (!i) return
      if (!i.movio && Math.hypot(e.clientX - i.x, e.clientY - i.y) < 6) return
      i.movio = true
      setArrastre({ id: i.id, x: e.clientX, y: e.clientY, sobre: destinoEn(e.clientX, e.clientY)?.clave ?? null })
    }
    const fin = (e: PointerEvent) => {
      const i = inicio.current
      inicio.current = null
      if (!i) return
      setArrastre(null)
      if (!i.movio) return // fue un toque: lo maneja onClick
      soltadoAt.current = Date.now()
      const d = destinoEn(e.clientX, e.clientY)
      if (d) mover(i.id, d.destino)
    }
    window.addEventListener('pointermove', mov)
    window.addEventListener('pointerup', fin)
    window.addEventListener('pointercancel', fin)
    return () => {
      window.removeEventListener('pointermove', mov)
      window.removeEventListener('pointerup', fin)
      window.removeEventListener('pointercancel', fin)
    }
  })

  const agarrar = (id: string, origen: Origen) => (e: PE) => {
    if (e.button !== 0) return
    inicio.current = { id, origen, x: e.clientX, y: e.clientY, movio: false }
  }

  // Toque: elegir y después tocar el destino (sirve sin arrastrar)
  const tocarFicha = (id: string, origen: Origen, destino: Destino) => {
    if (arrastre || Date.now() - soltadoAt.current < 300) return
    if (!sel) return setSel({ id, origen })
    if (sel.id === id) return setSel(null)
    mover(sel.id, destino)
  }
  const tocarHueco = (destino: Destino) => {
    if (Date.now() - soltadoAt.current < 300) return
    if (sel) mover(sel.id, destino)
  }

  // ---------------- Dibujo ----------------
  const etiquetaOrigen = (id: string, pos: string | null): { texto: string; tono: 'nuevo' | 'movido' | null } => {
    const de = posInicial.get(id)
    if (!de) return { texto: conds.get(id)?.nuevo ? 'nuevo' : 'del inventario', tono: 'nuevo' }
    if (pos && de !== pos) return { texto: `de ${de}`, tono: 'movido' }
    return { texto: '', tono: null }
  }

  const Ficha = ({ id, origen, destino, pos }: { id: string; origen: Origen; destino: Destino; pos: string | null }) => {
    const n = porId.get(id)
    if (!n) return null
    const mm = mmDe(id)
    const e = estadoProfundidad(mm)
    const irregular = desgasteIrregular(ultimaMedida.get(id)?.ranuras)
    const o = etiquetaOrigen(id, pos)
    const razon = razones.get(id)
    return (
      <button
        type="button"
        className={'tl-ficha e-' + e + (sel?.id === id ? ' elegida' : '') + (arrastre?.id === id ? ' arrastrando' : '') + (o.tono ? ' ' + o.tono : '')}
        onPointerDown={agarrar(id, origen)}
        onClick={() => tocarFicha(id, origen, destino)}
        title={`${nombreNeumatico(n)} · ${n.marca ?? ''} ${n.medida ?? ''} · ${mm ?? '—'} mm${irregular ? ' · desgaste irregular' : ''}${razon ? ` · ${razon}` : ''}`}
      >
        <span className="tl-goma">
          <span className="tl-mm">{mm ?? '–'}</span>
          <span className="tl-mm-u">mm</span>
          {irregular && <span className="tl-irregular" title="Desgaste irregular">⚠</span>}
        </span>
        <span className="tl-nombre mono">{nombreNeumatico(n)}</span>
        {o.texto && <span className={'tl-origen ' + (o.tono ?? '')}>{o.texto}</span>}
        {medidaActivo && n.medida && n.medida !== medidaActivo && <span className="tl-origen otra-medida">{n.medida}</span>}
      </button>
    )
  }

  const Hueco = ({ pos }: { pos: string }) => {
    const id = plan[pos]
    const clave = 'pos:' + pos
    return (
      <div
        className={'tl-hueco' + (arrastre?.sobre === clave ? ' sobre' : '') + (!id ? ' vacio' : '') + (sel && !id ? ' listo' : '')}
        data-destino={clave}
        onClick={() => !id && tocarHueco({ tipo: 'pos', pos })}
      >
        {id ? <Ficha id={id} origen={{ tipo: 'pos', pos }} destino={{ tipo: 'pos', pos }} pos={pos} /> : <span className="tl-vacio">+</span>}
        <span className="pv-pos mono">{pos}</span>
      </div>
    )
  }

  const mitad = (ps: string[]) => [ps.slice(0, ps.length / 2), ps.slice(ps.length / 2)]
  const cambios = resumenCambios(inicial, plan, banco, posInicial)
  const hayCambios = cambios.salen.length + cambios.rotan.length + cambios.entran.length > 0
  const pasosSugeridos = [...razones].filter(([id]) => cambios.rotan.some((r) => r.id === id))

  return (
    <Modal
      abierto
      ancho="grande"
      titulo={`${activo.codigo} · Taller de neumáticos`}
      onCerrar={onCerrar}
      pie={
        <>
          <button onClick={onCerrar}>Cerrar sin guardar</button>
          <button className="primario" disabled={!hayCambios} onClick={() => setRevisar(true)}>
            Revisar y guardar{hayCambios ? ` (${cambios.salen.length + cambios.rotan.length + cambios.entran.length})` : ''}
          </button>
        </>
      }
    >
      <div className="fila-entre">
        <span className="sec chico">
          Arrastra un neumático a otra posición; el que estaba ahí queda al lado del camión. También puedes tocar uno y después tocar a dónde va.
        </span>
        <div className="fila">
          <button onClick={sugerir}>Sugerir rotación</button>
          <button onClick={deshacer} disabled={!hayCambios}>Deshacer todo</button>
        </div>
      </div>
      {aviso && <div className="aviso alerta chico">{aviso}</div>}
      {(pasosSugeridos.length > 0 || (notas && notas.length > 0)) && (
        <details open className="aviso chico">
          <summary><b>{pasosSugeridos.length > 0 ? `Rotación sugerida: ${pasosSugeridos.length} movimientos (ya están en el dibujo; puedes ajustarlos)` : 'Desgaste irregular'}</b></summary>
          <div className="pila" style={{ gap: 4, marginTop: 6 }}>
          {pasosSugeridos.map(([id, r]) => {
            const c = cambios.rotan.find((x) => x.id === id)!
            return (
              <span key={id}>
                <span className="mono">{nombreNeumatico(porId.get(id)!)}</span>: {c.de} → {c.a} · {r}
              </span>
            )
          })}
          {notas && notas.length > 0 && <b style={{ marginTop: 4 }}>Desgaste irregular (rotar no lo corrige; hay que buscar la causa):</b>}
          {notas?.map((x) => (
            <span key={x.pos}>⚠ {nombrePosicion(x.pos)}: {x.texto}</span>
          ))}
          </div>
        </details>
      )}

      <div className="tl">
        <div className="pv tl-camion">
          <div className="pv-vehiculo">
            <div className="pv-cabina"><span>FRENTE</span></div>
            <div className="pv-chasis" aria-hidden="true" />
            {plantilla.ejes.map((eje) => {
              const [izq, der] = mitad(eje.posiciones)
              const montadas = eje.posiciones.filter((p) => plan[p]).length
              return (
                <div key={eje.nombre} className="pv-eje">
                  <div className="tl-eje-cab">
                    <span className="pv-nombre-eje" style={{ margin: 0 }}>{eje.nombre}</span>
                    <button className="chico" disabled={!montadas} onClick={() => desmontarEje(eje)} title={`Bajar los ${montadas} del eje y dejarlos al lado del camión`}>
                      ↧ Desmontar eje
                    </button>
                    <button className="chico" disabled={montadas === eje.posiciones.length} onClick={() => montarEje(eje)} title="Llenar las posiciones vacías con neumáticos del inventario">
                      ↥ Montar eje
                    </button>
                  </div>
                  <div className="pv-lado izq">{izq.map((p) => <Hueco key={p} pos={p} />)}</div>
                  <div className="pv-barra" aria-hidden="true" />
                  <div className="pv-lado der">{der.map((p) => <Hueco key={p} pos={p} />)}</div>
                </div>
              )
            })}
          </div>
          {plantilla.repuesto && (
            <div className="pv-repuesto">
              <span className="pv-nombre-eje">Repuesto</span>
              <Hueco pos="R" />
            </div>
          )}
        </div>

        <div className="pila tl-lados">
          <div
            className={'tl-zona tl-banco' + (arrastre?.sobre === 'banco' ? ' sobre' : '') + (sel ? ' listo' : '')}
            data-destino="banco"
            onClick={(e) => e.target === e.currentTarget && tocarHueco({ tipo: 'banco' })}
          >
            <b className="chico">Al lado del camión ({banco.length})</b>
            <span className="sec chico">Los desmontados esperan aquí para volver a montarse o para decidir a dónde van.</span>
            <div className="tl-fichas">
              {banco.map((id) => <Ficha key={id} id={id} origen={{ tipo: 'banco' }} destino={{ tipo: 'banco' }} pos={null} />)}
            </div>
          </div>
          <div className={'tl-zona tl-inv' + (arrastre?.sobre === 'inv' ? ' sobre' : '')} data-destino="inv">
            <b className="chico">Inventario ({inventario.length}){medidaActivo ? <span className="sec"> · este camión usa {medidaActivo}</span> : null}</b>
            <div className="tl-fichas">
              {inventario.slice(0, 40).map((n) => <Ficha key={n.id} id={n.id} origen={{ tipo: 'inv' }} destino={{ tipo: 'inv' }} pos={null} />)}
            </div>
            {inventario.length > 40 && <span className="sec chico">y {inventario.length - 40} más</span>}
          </div>
          <div className="fila chico sec tl-leyenda">
            <span><span className="tl-muestra movido" /> movido</span>
            <span><span className="tl-muestra nuevo" /> entra del inventario</span>
            <span>⚠ desgaste irregular</span>
          </div>
        </div>
      </div>

      {arrastre && (
        <div className="tl-fantasma" style={{ left: arrastre.x, top: arrastre.y }}>
          <span className="tl-goma"><span className="tl-mm">{mmDe(arrastre.id) ?? '–'}</span></span>
        </div>
      )}

      {revisar && (
        <Guardar
          activo={activo}
          cambios={cambios}
          porId={porId}
          mmDe={mmDe}
          onVolver={() => setRevisar(false)}
          onListo={onCerrar}
          guardar={guardar}
          datos={datos}
          conds={conds}
        />
      )}
    </Modal>
  )
}

interface Cambios {
  salen: { id: string; de: string }[]
  rotan: { id: string; de: string; a: string }[]
  entran: { id: string; a: string }[]
}

function resumenCambios(inicial: Plan, plan: Plan, banco: string[], posInicial: Map<string, string>): Cambios {
  const salen: Cambios['salen'] = []
  const rotan: Cambios['rotan'] = []
  const entran: Cambios['entran'] = []
  const posNueva = new Map(Object.entries(plan).filter(([, id]) => id).map(([p, id]) => [id!, p]))
  for (const [de, id] of Object.entries(inicial)) {
    if (!id) continue
    const a = posNueva.get(id)
    if (!a) salen.push({ id, de })
    else if (a !== de) rotan.push({ id, de, a })
  }
  for (const [a, id] of Object.entries(plan)) if (id && !posInicial.has(id)) entran.push({ id, a })
  void banco
  return { salen, rotan, entran }
}

/** Último paso: lo que piden las reglas y escribir los movimientos */
function Guardar({ activo, cambios, porId, mmDe, onVolver, onListo, guardar, datos, conds }: {
  activo: Activo
  cambios: Cambios
  porId: Map<string, Neumatico>
  mmDe: (id: string) => number | null
  onVolver: () => void
  onListo: () => void
  guardar: ReturnType<typeof useEmpresa>['guardar']
  datos: ReturnType<typeof useEmpresa>['datos']
  conds: ReturnType<typeof condiciones>
}) {
  const [destino, setDestino] = useState<Record<string, EstadoFinal>>(() => Object.fromEntries(cambios.salen.map((s) => [s.id, 'inventario'])))
  const [razon, setRazon] = useState<Record<string, string>>({})
  const [prof, setProf] = useState<Record<string, string>>({})
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const ejecutar = async () => {
    setEnviando(true)
    setError(null)
    try {
      // Validar todo antes de escribir nada
      for (const s of cambios.salen) {
        const n = porId.get(s.id)!
        if (destino[s.id] === 'desecho') {
          if (!razon[s.id]) throw new Error(`${nombreNeumatico(n)}: elige la razón del desecho.`)
        } else if (num(prof[s.id] ?? '') == null) {
          throw new Error(`${nombreNeumatico(n)}: anota la profundidad al desmontar (es obligatoria).`)
        }
      }
      for (const x of [...cambios.salen, ...cambios.rotan]) {
        const n = porId.get(x.id)!
        const e = errorProfundidad([num(prof[x.id] ?? '')], profundidadMaxima(n, datos.movimientos))
        if (e) throw new Error(`${nombreNeumatico(n)}: ${e}`)
      }
      const base = { fecha: hoyISO(), km: activo.km_actual, horas: activo.horas_actual, motivo: motivo.trim() || null }

      // 1) Los que salen del camión
      for (const s of cambios.salen) {
        const n = porId.get(s.id)!
        const est = destino[s.id]
        const desecho = est === 'desecho'
        await guardar('neumaticos', { ...n, estado: est, activo_id: null, posicion: null, razon_desecho: desecho ? razon[s.id] : null })
        await guardar('movimientos', {
          ...base,
          neumatico_id: n.id,
          tipo: desecho ? 'desecho' : est === 'inventario' ? 'desmontaje' : est,
          activo_id: activo.id,
          posicion: null,
          posicion_anterior: s.de,
          profundidad_mm: num(prof[s.id] ?? ''),
          razon_desecho: desecho ? razon[s.id] : null,
        })
      }
      // 2) Rotaciones: primero se liberan todas las posiciones (una llanta por posición)
      for (const r of cambios.rotan) {
        const n = porId.get(r.id)!
        await guardar('neumaticos', { ...n, estado: 'inventario', activo_id: null, posicion: null })
      }
      for (const r of cambios.rotan) {
        const n = porId.get(r.id)!
        await guardar('neumaticos', { ...n, estado: 'montado', activo_id: activo.id, posicion: r.a })
        await guardar('movimientos', { ...base, neumatico_id: n.id, tipo: 'rotacion', activo_id: activo.id, posicion: r.a, posicion_anterior: r.de, profundidad_mm: num(prof[r.id] ?? '') })
      }
      // 3) Los que entran del inventario: la profundidad sale del inventario
      for (const m of cambios.entran) {
        const n = porId.get(m.id)!
        await guardar('neumaticos', { ...n, estado: 'montado', activo_id: activo.id, posicion: m.a, montado_at: hoyISO(), km_montaje: activo.km_actual, horas_montaje: activo.horas_actual })
        await guardar('movimientos', { ...base, neumatico_id: n.id, tipo: 'montaje', activo_id: activo.id, posicion: m.a, posicion_anterior: null, profundidad_mm: conds.get(n.id)?.mm ?? null })
      }
      onListo()
    } catch (e) {
      setError(mensajeError(e))
    } finally {
      setEnviando(false)
    }
  }

  const nombre = (id: string) => {
    const n = porId.get(id)!
    return <span className="mono"><b>{nombreNeumatico(n)}</b></span>
  }

  return (
    <Modal
      abierto
      titulo="Revisar y guardar"
      onCerrar={onVolver}
      pie={
        <>
          <button onClick={onVolver}>Volver al taller</button>
          <button className="primario" disabled={enviando} onClick={() => void ejecutar()}>{enviando ? 'Guardando…' : 'Guardar todo'}</button>
        </>
      }
    >
      {cambios.salen.length > 0 && (
        <section className="pila" style={{ gap: 8 }}>
          <h3 style={{ margin: 0 }}>Salen del camión ({cambios.salen.length})</h3>
          <span className="sec chico">La profundidad es obligatoria, salvo si va a desecho: ahí se pide la razón.</span>
          {cambios.salen.map((s) => (
            <div key={s.id} className="tl-fila">
              <span>{nombre(s.id)} <span className="sec chico">de {s.de} · última {mmDe(s.id) ?? '—'} mm</span></span>
              <Selector
                valor={destino[s.id]}
                onCambio={(v) => setDestino((d) => ({ ...d, [s.id]: v as EstadoFinal }))}
                opciones={{ inventario: 'Inventario', reparacion: 'Reparación', renovacion: 'Renovación', desecho: 'Desecho' }}
              />
              {destino[s.id] === 'desecho' ? (
                <Selector valor={razon[s.id] ?? ''} onCambio={(v) => setRazon((r) => ({ ...r, [s.id]: v }))} opciones={RAZONES_DESECHO} vacio="Razón…" />
              ) : (
                <input inputMode="decimal" placeholder="mm" aria-label="Profundidad al desmontar" value={prof[s.id] ?? ''} onChange={(e) => setProf((p) => ({ ...p, [s.id]: e.target.value }))} />
              )}
            </div>
          ))}
        </section>
      )}
      {cambios.rotan.length > 0 && (
        <section className="pila" style={{ gap: 8 }}>
          <h3 style={{ margin: 0 }}>Se rotan ({cambios.rotan.length})</h3>
          <span className="sec chico">La profundidad es opcional: si la mides al rotar, queda en el historial.</span>
          {cambios.rotan.map((r) => (
            <div key={r.id} className="tl-fila">
              <span>{nombre(r.id)} <span className="sec chico">{r.de} → {r.a}</span></span>
              <span />
              <input inputMode="decimal" placeholder="mm (opcional)" aria-label="Profundidad medida" value={prof[r.id] ?? ''} onChange={(e) => setProf((p) => ({ ...p, [r.id]: e.target.value }))} />
            </div>
          ))}
        </section>
      )}
      {cambios.entran.length > 0 && (
        <section className="pila" style={{ gap: 4 }}>
          <h3 style={{ margin: 0 }}>Se montan del inventario ({cambios.entran.length})</h3>
          {cambios.entran.map((m) => (
            <span key={m.id} className="chico">
              {nombre(m.id)} → {m.a} · {conds.get(m.id)?.nuevo ? 'nuevo' : 'usado'} con {conds.get(m.id)?.mm ?? '—'} mm
            </span>
          ))}
        </section>
      )}
      <Campo etiqueta="Motivo (opcional, queda en el historial de cada neumático)">
        <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Rotación programada, cambio de eje…" />
      </Campo>
      <ErrorMsg error={error} />
    </Modal>
  )
}
