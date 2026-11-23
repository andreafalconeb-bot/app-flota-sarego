// Neumáticos de un activo: diagrama de ejes, montaje / desmontaje /
// rotación e inspección de presión y profundidad (fase 1, básico).
import { useMemo, useState } from 'react'
import { useEmpresa } from '../lib/empresa'
import { hoyISO, fecha, nombreNeumatico, serialNeumatico } from '../lib/formato'
import { PLANTILLAS, nombrePosicion, posicionesDe } from '../lib/ejes'
import { condicionNeumatico, estadoPresion, estadoProfundidad, minimo, type CondicionNeumatico, type EstadoMedida } from '../lib/calculos'
import type { Activo, InspeccionNeumatico, Neumatico } from '../lib/tipos'
import { InspeccionGrafica, type FilaInspeccion } from './inspeccionGrafica'
import { Campo, ErrorMsg, Modal, Pill, Selector, Vacio, mensajeError, num } from './ui'


/** Última medición de cada posición del activo. */
export function ultimasMediciones(activoId: string, d: ReturnType<typeof useEmpresa>['datos']): Map<string, InspeccionNeumatico & { fecha: string }> {
  const insp = d.inspecciones.filter((i) => i.activo_id === activoId).sort((a, b) => b.fecha.localeCompare(a.fecha))
  const mapa = new Map<string, InspeccionNeumatico & { fecha: string }>()
  for (const i of insp) {
    for (const m of d.inspeccionNeumaticos.filter((x) => x.inspeccion_id === i.id)) {
      if (!mapa.has(m.posicion)) mapa.set(m.posicion, { ...m, fecha: i.fecha })
    }
  }
  return mapa
}

/** Profundidades medidas en inspecciones, con su fecha. */
function medidasConFecha(d: ReturnType<typeof useEmpresa>['datos']) {
  const fechas = new Map(d.inspecciones.map((i) => [i.id, i.fecha]))
  return d.inspeccionNeumaticos.map((m) => ({ neumatico_id: m.neumatico_id, profundidad_min_mm: m.profundidad_min_mm, fecha: fechas.get(m.inspeccion_id) ?? '' }))
}

/** Condición (nuevo o usado, con su profundidad) de cada neumático. */
export function condiciones(d: ReturnType<typeof useEmpresa>['datos']): Map<string, CondicionNeumatico> {
  const medidas = medidasConFecha(d)
  return new Map(d.neumaticos.map((n) => [n.id, condicionNeumatico(n, d.movimientos, medidas)]))
}

/** "Nuevo · 17 mm" o "Usado · 11 mm (desmontado de TG010 el 20/11/2026)". */
export function textoCondicion(c: CondicionNeumatico, activos: { id: string; codigo: string }[]): string {
  const mm = c.mm != null ? ` · ${c.mm} mm` : ' · sin profundidad'
  if (c.nuevo) return `Nuevo${mm}`
  const de = c.activoId ? activos.find((a) => a.id === c.activoId)?.codigo : null
  const cuando = c.fecha ? ` el ${fecha(c.fecha.slice(0, 10))}` : ''
  return `Usado${mm}${c.origen === 'inspeccion' ? ` (inspección${cuando})` : de ? ` (desmontado de ${de}${cuando})` : cuando ? ` (medido${cuando})` : ''}`
}

export function NeumaticosActivo({ activo }: { activo: Activo }) {
  const { datos, puedeEscribir } = useEmpresa()
  const [posicion, setPosicion] = useState<string | null>(null)
  const [inspeccionar, setInspeccionar] = useState(false)
  const plantilla = PLANTILLAS[activo.configuracion ?? ''] ?? PLANTILLAS.ninguna
  const montados = useMemo(
    () => new Map(datos.neumaticos.filter((n) => n.activo_id === activo.id && n.estado === 'montado').map((n) => [n.posicion!, n])),
    [datos.neumaticos, activo.id],
  )
  const medidas = useMemo(() => ultimasMediciones(activo.id, datos), [activo.id, datos])

  if (!plantilla.ejes.length) {
    return <Vacio>Este activo no lleva neumáticos (cámbialo en “Datos” si no es así).</Vacio>
  }

  const Llanta = ({ pos }: { pos: string }) => {
    const n = montados.get(pos)
    const m = medidas.get(pos)
    const ep = m ? estadoPresion(m.presion_psi, m.presion_ideal_psi) : 'sin_dato'
    const ed = m ? estadoProfundidad(m.profundidad_min_mm) : 'sin_dato'
    const peor: EstadoMedida = [ep, ed].includes('critico') ? 'critico' : [ep, ed].includes('alerta') ? 'alerta' : n ? 'ok' : 'sin_dato'
    return (
      <button className={'llanta ' + (n ? peor : 'vacia')} onClick={() => setPosicion(pos)} title={nombrePosicion(pos)}>
        <span className="mono">{pos}</span>
        <b>{n ? nombreNeumatico(n) : '—'}</b>
        {m && (
          <span className="chico">
            {m.presion_psi ?? '–'} psi · {m.profundidad_min_mm ?? '–'} mm
          </span>
        )}
      </button>
    )
  }

  return (
    <div className="pila" style={{ gap: 12 }}>
      <div className="fila-entre">
        <span className="sec chico">{plantilla.nombre}. Toca una posición para montar, desmontar o rotar.</span>
        {puedeEscribir && montados.size > 0 && (
          <button className="primario" onClick={() => setInspeccionar(true)}>Inspección de presión y profundidad</button>
        )}
      </div>
      <div className="ejes">
        <div className="planta">
          <div className="cabina">Frente</div>
          {plantilla.ejes.map((eje) => (
            <div key={eje.nombre} className="eje">
              <span className="sec chico">{eje.nombre}</span>
              <div className="fila-eje">
                {eje.posiciones.slice(0, eje.posiciones.length / 2).map((p) => <Llanta key={p} pos={p} />)}
                <span className="barra" />
                {eje.posiciones.slice(eje.posiciones.length / 2).map((p) => <Llanta key={p} pos={p} />)}
              </div>
            </div>
          ))}
        </div>
        {plantilla.repuesto && (
          <div className="eje">
            <span className="sec chico">Repuesto</span>
            <div className="fila-eje"><Llanta pos="R" /></div>
          </div>
        )}
      </div>
      <div className="fila chico sec">
        <Pill tono="ok">Bien</Pill> <Pill tono="alerta">Presión ±10 % o ≤ 5 mm</Pill> <Pill tono="critico">Presión ±20 % o ≤ 3 mm</Pill>
      </div>
      {posicion && <Posicion key={posicion} activo={activo} posicion={posicion} montado={montados.get(posicion) ?? null} onCerrar={() => setPosicion(null)} />}
      {inspeccionar && <Inspeccion activo={activo} montados={montados} onCerrar={() => setInspeccionar(false)} />}
    </div>
  )
}

function Posicion({ activo, posicion, montado, onCerrar }: { activo: Activo; posicion: string; montado: Neumatico | null; onCerrar: () => void }) {
  const { datos, guardar, puedeEscribir } = useEmpresa()
  const [accion, setAccion] = useState<'montar' | 'desmontar' | 'rotar'>(montado ? 'desmontar' : 'montar')
  const [elegido, setElegido] = useState('')
  const [destino, setDestino] = useState('')
  const [estadoFinal, setEstadoFinal] = useState<'inventario' | 'reparacion' | 'desecho'>('inventario')
  const [profundidad, setProfundidad] = useState('')
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const conds = useMemo(() => condiciones(datos), [datos])
  // Primero los nuevos, después los usados con más banda
  const disponibles = datos.neumaticos
    .filter((n) => n.estado === 'inventario')
    .sort((a, b) => Number(conds.get(b.id)?.nuevo) - Number(conds.get(a.id)?.nuevo) || (conds.get(b.id)?.mm ?? 0) - (conds.get(a.id)?.mm ?? 0))
  const condElegido = elegido ? conds.get(elegido) : undefined
  const posiciones = posicionesDe(activo.configuracion).filter((p) => p !== posicion)
  const ocupado = (p: string) => datos.neumaticos.find((n) => n.activo_id === activo.id && n.estado === 'montado' && n.posicion === p)
  const historial = montado ? datos.movimientos.filter((m) => m.neumatico_id === montado.id).sort((a, b) => b.fecha.localeCompare(a.fecha)) : []

  const base = { fecha: hoyISO(), km: activo.km_actual, horas: activo.horas_actual, profundidad_mm: num(profundidad), motivo: motivo.trim() || null }

  const ejecutar = async () => {
    setEnviando(true)
    setError(null)
    try {
      if (accion === 'montar') {
        const n = datos.neumaticos.find((x) => x.id === elegido)
        if (!n) throw new Error('Elige el neumático.')
        await guardar('neumaticos', { ...n, estado: 'montado', activo_id: activo.id, posicion, montado_at: hoyISO(), km_montaje: activo.km_actual, horas_montaje: activo.horas_actual })
        // La profundidad al montar sale del inventario: la de compra si es
        // nuevo, la última medida si es usado (no se pregunta)
        await guardar('movimientos', { ...base, profundidad_mm: conds.get(n.id)?.mm ?? null, neumatico_id: n.id, tipo: 'montaje', activo_id: activo.id, posicion, posicion_anterior: null })
      } else if (accion === 'desmontar' && montado) {
        await guardar('neumaticos', { ...montado, estado: estadoFinal, activo_id: null, posicion: null })
        await guardar('movimientos', {
          ...base,
          neumatico_id: montado.id,
          tipo: estadoFinal === 'desecho' ? 'desecho' : estadoFinal === 'reparacion' ? 'reparacion' : 'desmontaje',
          activo_id: activo.id,
          posicion: null,
          posicion_anterior: posicion,
        })
      } else if (accion === 'rotar' && montado) {
        if (!destino) throw new Error('Elige la posición nueva.')
        const otro = ocupado(destino)
        // Intercambio: primero se libera la posición destino para no chocar con "una llanta por posición"
        if (otro) await guardar('neumaticos', { ...otro, estado: 'inventario', activo_id: null, posicion: null })
        await guardar('neumaticos', { ...montado, posicion: destino })
        await guardar('movimientos', { ...base, neumatico_id: montado.id, tipo: 'rotacion', activo_id: activo.id, posicion: destino, posicion_anterior: posicion })
        if (otro) {
          await guardar('neumaticos', { ...otro, estado: 'montado', activo_id: activo.id, posicion })
          await guardar('movimientos', { ...base, neumatico_id: otro.id, tipo: 'rotacion', activo_id: activo.id, posicion, posicion_anterior: destino })
        }
      }
      onCerrar()
    } catch (e) {
      setError(mensajeError(e))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal
      abierto
      titulo={`${activo.codigo} · ${nombrePosicion(posicion)}`}
      onCerrar={onCerrar}
      pie={
        puedeEscribir ? (
          <>
            <button onClick={onCerrar}>Cerrar</button>
            <button className="primario" disabled={enviando} onClick={() => void ejecutar()}>
              {accion === 'montar' ? 'Montar' : accion === 'rotar' ? 'Rotar' : 'Desmontar'}
            </button>
          </>
        ) : undefined
      }
    >
      {montado ? (
        <div className="pila chico">
          <span>
            Montado: <b className="mono">{nombreNeumatico(montado)}</b> <span className="sec mono">{serialNeumatico(montado)}</span> {montado.marca ?? ''} {montado.modelo ?? ''} {montado.medida ?? ''} · DOT {montado.dot ?? '—'}
          </span>
          <span className="sec">
            Desde {fecha(montado.montado_at)}
            {montado.km_montaje != null && activo.km_actual != null && ` · ${Math.round(activo.km_actual - montado.km_montaje)} km en este activo`}
            {montado.horas_montaje != null && activo.horas_actual != null && ` · ${Math.round(activo.horas_actual - montado.horas_montaje)} h en este activo`}
          </span>
          {historial.length > 0 && (
            <details>
              <summary>Historial ({historial.length})</summary>
              <ul style={{ margin: '6px 0', paddingLeft: 18 }}>
                {historial.map((m) => (
                  <li key={m.id}>
                    {fecha(m.fecha)}: {m.tipo} {m.posicion_anterior ? `de ${m.posicion_anterior}` : ''} {m.posicion ? `a ${m.posicion}` : ''} {m.motivo ? `· ${m.motivo}` : ''}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      ) : (
        <span className="sec chico">Posición vacía.</span>
      )}
      {puedeEscribir && (
        <>
          {montado && (
            <div className="fila">
              <label className="check"><input type="radio" checked={accion === 'desmontar'} onChange={() => setAccion('desmontar')} /> Desmontar</label>
              <label className="check"><input type="radio" checked={accion === 'rotar'} onChange={() => setAccion('rotar')} /> Rotar a otra posición</label>
            </div>
          )}
          {accion === 'montar' &&
            (disponibles.length ? (
              <>
                <Campo etiqueta="Neumático del inventario">
                  <Selector
                    valor={elegido}
                    onCambio={setElegido}
                    opciones={Object.fromEntries(
                      disponibles.map((n) => {
                        const c = conds.get(n.id)!
                        return [n.id, `${c.nuevo ? 'NUEVO' : 'USADO'} ${c.mm != null ? c.mm + ' mm' : ''} · ${nombreNeumatico(n)}${n.marca_fuego ? ` (${serialNeumatico(n)})` : ''} · ${n.marca ?? ''} ${n.medida ?? ''} · DOT ${n.dot ?? '—'}`]
                      }),
                    )}
                    vacio="Elige…"
                  />
                </Campo>
                {condElegido && (
                  <div className={'aviso chico' + (condElegido.nuevo ? ' ok' : '')}>
                    {textoCondicion(condElegido, datos.activos)}. Esa es la profundidad con que se monta.
                  </div>
                )}
              </>
            ) : (
              <div className="aviso alerta">No hay neumáticos en inventario. Regístralos primero en la pestaña Neumáticos.</div>
            ))}
          {accion === 'desmontar' && (
            <Campo etiqueta="Va a">
              <Selector valor={estadoFinal} onCambio={(v) => setEstadoFinal(v as typeof estadoFinal)} opciones={{ inventario: 'Inventario', reparacion: 'Reparación', desecho: 'Desecho' }} />
            </Campo>
          )}
          {accion === 'rotar' && (
            <Campo etiqueta="Posición nueva">
              <Selector
                valor={destino}
                onCambio={setDestino}
                opciones={Object.fromEntries(posiciones.map((p) => [p, `${nombrePosicion(p)}${ocupado(p) ? ` (intercambia con ${nombreNeumatico(ocupado(p)!)})` : ''}`]))}
                vacio="Elige…"
              />
            </Campo>
          )}
          <div className="grid grid-2">
            {accion !== 'montar' && (
              <Campo etiqueta={accion === 'desmontar' ? 'Profundidad al desmontar (mm)' : 'Profundidad medida (mm)'}>
                <input inputMode="decimal" value={profundidad} onChange={(e) => setProfundidad(e.target.value)} />
              </Campo>
            )}
            <Campo etiqueta="Motivo">
              <input value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </Campo>
          </div>
        </>
      )}
      <ErrorMsg error={error} />
    </Modal>
  )
}


function Inspeccion({ activo, montados, onCerrar }: { activo: Activo; montados: Map<string, Neumatico>; onCerrar: () => void }) {
  const { guardar } = useEmpresa()
  const posiciones = posicionesDe(activo.configuracion).filter((p) => montados.has(p))
  const [filas, setFilas] = useState<Record<string, FilaInspeccion>>(() =>
    Object.fromEntries(posiciones.map((p) => [p, { presion: '', p1: '', p2: '', p3: '', valvula: 'ok', observacion: '' }])),
  )
  const [km, setKm] = useState(activo.km_actual != null ? String(activo.km_actual) : '')
  const [horas, setHoras] = useState(activo.horas_actual != null ? String(activo.horas_actual) : '')
  const [notas, setNotas] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const set = (p: string, k: keyof FilaInspeccion, v: string) => setFilas((fs) => ({ ...fs, [p]: { ...fs[p], [k]: v } }))

  const guardarTodo = async () => {
    setEnviando(true)
    setError(null)
    try {
      const conDatos = posiciones.filter((p) => filas[p].presion || filas[p].p1 || filas[p].p2 || filas[p].p3)
      if (!conDatos.length) throw new Error('Anota al menos una presión o profundidad.')
      const inspeccionId = await guardar('inspecciones', {
        activo_id: activo.id,
        fecha: new Date().toISOString(),
        km: num(km),
        horas: num(horas),
        notas: notas.trim() || null,
      })
      for (const p of conDatos) {
        const f = filas[p]
        const n = montados.get(p)!
        const profundidades = [num(f.p1), num(f.p2), num(f.p3)].filter((x): x is number => x != null)
        await guardar('inspeccionNeumaticos', {
          inspeccion_id: inspeccionId,
          neumatico_id: n.id,
          posicion: p,
          presion_psi: num(f.presion),
          presion_ideal_psi: n.presion_ideal_psi,
          profundidades_mm: profundidades.length ? profundidades : null,
          profundidad_min_mm: minimo(profundidades),
          valvula: f.valvula as InspeccionNeumatico['valvula'],
          observacion: f.observacion.trim() || null,
        })
      }
      onCerrar()
    } catch (e) {
      setError(mensajeError(e))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal
      abierto
      titulo={`Inspección de neumáticos — ${activo.codigo}`}
      ancho="grande"
      onCerrar={onCerrar}
      pie={
        <>
          <button onClick={onCerrar}>Cancelar</button>
          <button className="primario" disabled={enviando} onClick={() => void guardarTodo()}>{enviando ? 'Guardando…' : 'Guardar inspección'}</button>
        </>
      }
    >
      <div className="grid grid-2">
        {activo.medidor !== 'horas' && (
          <Campo etiqueta="Odómetro (km)"><input inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} /></Campo>
        )}
        {activo.medidor !== 'km' && (
          <Campo etiqueta="Horómetro (h)"><input inputMode="decimal" value={horas} onChange={(e) => setHoras(e.target.value)} /></Campo>
        )}
      </div>
      <InspeccionGrafica activo={activo} montados={montados} posiciones={posiciones} filas={filas} set={set} />
      <Campo etiqueta="Notas"><input value={notas} onChange={(e) => setNotas(e.target.value)} /></Campo>
      <ErrorMsg error={error} />
    </Modal>
  )
}
