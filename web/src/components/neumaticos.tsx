// Neumáticos de un activo: diagrama de ejes, montaje / desmontaje /
// rotación e inspección de presión y profundidad (fase 1, básico).
import { useCallback, useMemo, useState } from 'react'
import { useEmpresa } from '../lib/empresa'
import { hoyISO, fecha, nombreNeumatico, serialNeumatico } from '../lib/formato'
import { PLANTILLAS, ejeDe, nombrePosicion, posicionesDe } from '../lib/ejes'
import { profundidadIlogica, evaluarMedida, parejaDual, unidadPrincipal, condicionNeumatico, errorProfundidad, fugaLenta, presionActual, presionIdeal, profundidadMaxima, estadoPresion, estadoProfundidad, minimo, type CondicionNeumatico, type EstadoMedida } from '../lib/calculos'
import type { Activo, InspeccionNeumatico, Neumatico } from '../lib/tipos'
import { InspeccionGrafica, PATRONES, type FilaInspeccion } from './inspeccionGrafica'
import { LeyendaEstados, PlantaVehiculo, type Celda } from './planta'
import { ResumenPresiones } from './presiones'
import { PerdidaPresionActivo, ProyeccionNeumaticos } from './costoOperacion'
import { RAZONES_DESECHO, VALVULAS, etiqueta } from '../lib/catalogos'
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
  const { tiene, esAdminEmpresa } = useEmpresa()
  // Fuga lenta: alarma, solo en la versión pago
  const fugas = useMemo(() => {
    if (!tiene('alarmas')) return []
    const fechas = new Map(datos.inspecciones.map((i) => [i.id, i.fecha]))
    return [...montados.entries()].filter(([, n]) =>
      fugaLenta(datos.inspeccionNeumaticos.filter((x) => x.neumatico_id === n.id).map((x) => ({ ...x, fecha: fechas.get(x.inspeccion_id) ?? '' }))),
    )
  }, [datos, montados, tiene])

  // Alarma: profundidad mayor que la anterior, hasta que una inspección la corrija
  const ilogicas = [...montados.entries()]
    .map(([p, n]) => ({ p, n, x: profundidadIlogica(n, datos) }))
    .filter((y): y is { p: string; n: Neumatico; x: NonNullable<ReturnType<typeof profundidadIlogica>> } => y.x != null)

  if (!plantilla.ejes.length) {
    return <Vacio>Este activo no lleva neumáticos (cámbialo en “Datos” si no es así).</Vacio>
  }

  const celda = (pos: string): Celda => {
    const n = montados.get(pos)
    if (!n) return { estado: null, ayuda: `${nombrePosicion(pos)}: vacía, toca para montar` }
    const m = medidas.get(pos)
    const actual = m ? presionActual(m) : null
    const ep = m ? estadoPresion(actual, m.presion_ideal_psi) : 'sin_dato'
    const ed = m ? estadoProfundidad(m.profundidad_min_mm) : 'sin_dato'
    const peor: EstadoMedida = ilogicas.some((y) => y.p === pos) || [ep, ed].includes('critico') ? 'critico' : [ep, ed].includes('alerta') ? 'alerta' : m ? 'ok' : 'sin_dato'
    // Se encontró fuera de rango y se corrigió en la inspección
    const corregida = m != null && actual !== m.presion_psi && estadoPresion(m.presion_psi, m.presion_ideal_psi) !== 'ok'
    return {
      estado: peor,
      titulo: nombreNeumatico(n),
      detalle: m ? (
        <>
          {actual ?? '–'} psi
          {corregida && <span className="sec"> (enc. {m.presion_psi})</span>}
          <br />
          {m.profundidad_min_mm ?? '–'} mm
        </>
      ) : (
        <span className="sec">sin medir</span>
      ),
      ayuda: `${nombrePosicion(pos)} · ${nombreNeumatico(n)}${corregida ? ` · se encontró en ${m!.presion_psi} psi y se ajustó` : ''}`,
    }
  }

  return (
    <div className="pila" style={{ gap: 12 }}>
      <div className="fila-entre">
        <span className="sec chico">{plantilla.nombre}. Toca una posición para montar, desmontar o rotar.</span>
        {puedeEscribir && montados.size > 0 && (
          <button className="primario" onClick={() => setInspeccionar(true)}>Inspección de presión y profundidad</button>
        )}
      </div>
      {ilogicas.length > 0 && (
        <div className="alarma-ilogica" role="alert">
          <b>🚨 ALARMA · Profundidad ilógica</b>
          {ilogicas.map(({ p, n, x }) => (
            <span key={p}>
              {nombrePosicion(p)} · {nombreNeumatico(n)}: la última medida ({x.mm} mm, {fecha(x.fecha)}) es mayor que la anterior ({x.anterior} mm, {fecha(x.fechaAnterior)}).
            </span>
          ))}
          <span className="chico">Un neumático no recupera banda. Vuelve a medir en la próxima inspección; la alarma se quita sola cuando la medida sea coherente.</span>
        </div>
      )}
      {fugas.length > 0 && (
        <div className="aviso alerta chico" role="status">
          <b>Posible fuga lenta</b> (se encontraron bajos en sus 2 últimas inspecciones, aunque se corrigieron):{' '}
          {fugas.map(([p, n]) => `${p} ${nombreNeumatico(n)}`).join(' · ')}. Revisa válvula, rin y pinchazos.
        </div>
      )}
      <ResumenPresiones activo={activo} montados={montados} puedeEditar={esAdminEmpresa} />
      <PlantaVehiculo configuracion={activo.configuracion} celda={celda} onElegir={setPosicion} />
      <LeyendaEstados />
      <ProyeccionNeumaticos activo={activo} montados={montados} />
      <PerdidaPresionActivo activo={activo} />
      {posicion && <Posicion key={posicion} activo={activo} posicion={posicion} montado={montados.get(posicion) ?? null} onCerrar={() => setPosicion(null)} />}
      {inspeccionar && <Inspeccion activo={activo} montados={montados} onCerrar={() => setInspeccionar(false)} />}
      <HistorialInspecciones activo={activo} />
    </div>
  )
}

/** Historial de inspecciones de presión, profundidad y válvula del activo. */
function HistorialInspecciones({ activo }: { activo: Activo }) {
  const { datos, esAdminEmpresa, borrar } = useEmpresa()
  const inspecciones = datos.inspecciones.filter((i) => i.activo_id === activo.id).sort((a, b) => b.fecha.localeCompare(a.fecha))
  const tono = { ok: 'ok', alerta: 'alerta', critico: 'critico', sin_dato: undefined } as const

  return (
    <section className="tarjeta pila">
      <h2>Historial de inspecciones</h2>
      {inspecciones.length === 0 ? (
        <Vacio>Sin inspecciones. Usa “Inspección de presión y profundidad”.</Vacio>
      ) : (
        inspecciones.map((i) => {
          const filas = datos.inspeccionNeumaticos
            .filter((x) => x.inspeccion_id === i.id)
            .sort((a, b) => posicionesDe(activo.configuracion).indexOf(a.posicion) - posicionesDe(activo.configuracion).indexOf(b.posicion))
          const estados = filas.map((x) => {
            const ep = estadoPresion(x.presion_psi, x.presion_ideal_psi)
            const ed = estadoProfundidad(x.profundidad_min_mm)
            return [ep, ed].includes('critico') ? 'critico' : [ep, ed].includes('alerta') ? 'alerta' : 'ok'
          })
          const criticos = estados.filter((e) => e === 'critico').length
          const revisar = estados.filter((e) => e === 'alerta').length
          const ajustados = filas.filter((x) => x.presion_dejada_psi != null && x.presion_dejada_psi !== x.presion_psi).length
          return (
            <details key={i.id} className="insp-hist">
              <summary>
                <b>{fecha(i.fecha.slice(0, 10))}</b>
                <span className="sec chico">
                  {i.km != null && `${Math.round(i.km).toLocaleString('es-VE')} km`} {i.horas != null && `${Math.round(i.horas).toLocaleString('es-VE')} h`}
                </span>
                <span className="chico">{filas.length} neumáticos</span>
                {criticos > 0 && <Pill tono="critico">✕ {criticos} críticos</Pill>}
                {revisar > 0 && <Pill tono="alerta">! {revisar} por revisar</Pill>}
                {criticos + revisar === 0 && filas.length > 0 && <Pill tono="ok">✓ Todo bien</Pill>}
                {ajustados > 0 && <span className="sec chico">{ajustados} presiones ajustadas</span>}
              </summary>
              <div className="tabla-wrap">
                <table>
                  <thead>
                    <tr><th>Posición</th><th>Neumático</th><th>Presión (psi)</th><th>Ranuras (mm)</th><th>Válvula</th><th>Observación</th></tr>
                  </thead>
                  <tbody>
                    {filas.map((x) => {
                      const n = datos.neumaticos.find((y) => y.id === x.neumatico_id)
                      const d = x.presion_psi != null && x.presion_ideal_psi ? (x.presion_psi - x.presion_ideal_psi) / x.presion_ideal_psi : null
                      const ep = estadoPresion(x.presion_psi, x.presion_ideal_psi)
                      const ed = estadoProfundidad(x.profundidad_min_mm)
                      return (
                        <tr key={x.id}>
                          <td><b className="mono">{x.posicion}</b><div className="sec chico">{nombrePosicion(x.posicion)}</div></td>
                          <td className="mono chico">{n ? nombreNeumatico(n) : '—'}{n?.marca_fuego && <div className="sec">{serialNeumatico(n)}</div>}</td>
                          <td className="chico">
                            {x.presion_psi ?? '—'}
                            {x.presion_dejada_psi != null && x.presion_dejada_psi !== x.presion_psi && <> → <b>{x.presion_dejada_psi}</b> <span className="sec">(ajustada)</span></>}
                            <div>
                              {d != null && <Pill tono={tono[ep]}>{d > 0 ? '+' : ''}{Math.round(d * 100)} %</Pill>}{' '}
                              <span className="sec">ideal {x.presion_ideal_psi ?? '—'}</span>
                            </div>
                          </td>
                          <td className="chico">
                            {x.profundidades_mm?.length ? x.profundidades_mm.join(' · ') : '—'}
                            {x.profundidad_min_mm != null && <div><Pill tono={tono[ed]}>mín {x.profundidad_min_mm}</Pill></div>}
                          </td>
                          <td className="chico">{x.valvula ? etiqueta(VALVULAS, x.valvula) : '—'}</td>
                          <td className="chico">{x.observacion ?? ''}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {i.notas && <p className="chico" style={{ margin: '6px 0' }}>Notas: {i.notas}</p>}
              {esAdminEmpresa && (
                <button
                  className="chico"
                  onClick={() => {
                    if (!confirm('¿Borrar esta inspección?')) return
                    void (async () => {
                      for (const x of filas) await borrar('inspeccionNeumaticos', x.id)
                      await borrar('inspecciones', i.id)
                    })()
                  }}
                >
                  Borrar inspección
                </button>
              )}
            </details>
          )
        })
      )}
    </section>
  )
}

function Posicion({ activo, posicion, montado, onCerrar }: { activo: Activo; posicion: string; montado: Neumatico | null; onCerrar: () => void }) {
  const { datos, guardar, puedeEscribir } = useEmpresa()
  const [accion, setAccion] = useState<'montar' | 'desmontar' | 'rotar'>(montado ? 'desmontar' : 'montar')
  const [elegido, setElegido] = useState('')
  const [destino, setDestino] = useState('')
  const [estadoFinal, setEstadoFinal] = useState<'inventario' | 'reparacion' | 'renovacion' | 'desecho'>('inventario')
  const [razon, setRazon] = useState('')
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
      if (montado && accion !== 'montar') {
        const e = errorProfundidad([num(profundidad)], profundidadMaxima(montado, datos.movimientos))
        if (e) throw new Error(e)
      }
      if (accion === 'montar') {
        const n = datos.neumaticos.find((x) => x.id === elegido)
        if (!n) throw new Error('Elige el neumático.')
        await guardar('neumaticos', { ...n, estado: 'montado', activo_id: activo.id, posicion, montado_at: hoyISO(), km_montaje: activo.km_actual, horas_montaje: activo.horas_actual })
        // La profundidad al montar sale del inventario: la de compra si es
        // nuevo, la última medida si es usado (no se pregunta)
        await guardar('movimientos', { ...base, profundidad_mm: conds.get(n.id)?.mm ?? null, neumatico_id: n.id, tipo: 'montaje', activo_id: activo.id, posicion, posicion_anterior: null })
      } else if (accion === 'desmontar' && montado) {
        // Al desincorporar es obligatoria la profundidad, salvo el desecho,
        // que pide la razón (Andrea, 23/nov/2026)
        const desecho = estadoFinal === 'desecho'
        if (desecho && !razon) throw new Error('Elige la razón del desecho.')
        if (!desecho && num(profundidad) == null) throw new Error('Anota la profundidad al desmontar: es obligatoria.')
        await guardar('neumaticos', { ...montado, estado: estadoFinal, activo_id: null, posicion: null, razon_desecho: desecho ? razon : null })
        await guardar('movimientos', {
          ...base,
          razon_desecho: desecho ? razon : null,
          neumatico_id: montado.id,
          tipo: desecho ? 'desecho' : estadoFinal === 'inventario' ? 'desmontaje' : estadoFinal,
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
                        return [n.id, `${(n.renovaciones ?? 0) > 0 ? 'RENOVADO' : c.nuevo ? 'NUEVO' : 'USADO'} ${c.mm != null ? c.mm + ' mm' : ''} · ${nombreNeumatico(n)}${n.marca_fuego ? ` (${serialNeumatico(n)})` : ''} · ${n.marca ?? ''} ${n.medida ?? ''} · DOT ${n.dot ?? '—'}`]
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
              <Selector
                valor={estadoFinal}
                onCambio={(v) => setEstadoFinal(v as typeof estadoFinal)}
                opciones={{ inventario: 'Inventario', reparacion: 'Reparación', renovacion: 'Renovación (enviado a reencauchar)', desecho: 'Desecho' }}
              />
            </Campo>
          )}
          {accion === 'desmontar' && estadoFinal === 'desecho' && (
            <Campo etiqueta="Razón del desecho (obligatoria)">
              <Selector valor={razon} onCambio={setRazon} opciones={RAZONES_DESECHO} vacio="Elige…" />
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
            {accion !== 'montar' && !(accion === 'desmontar' && estadoFinal === 'desecho') && (
              <Campo etiqueta={accion === 'desmontar' ? 'Profundidad al desmontar (mm, obligatoria)' : 'Profundidad medida (mm)'}>
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


function Inspeccion({ activo, montados: montadosReales, onCerrar }: { activo: Activo; montados: Map<string, Neumatico>; onCerrar: () => void }) {
  const { guardar, datos, parchar } = useEmpresa()
  // La presión ideal es la calculada para este activo, por eje; si no
  // está definida, la del neumático (fabricante)
  const ideales = useMemo(
    () => new Map([...montadosReales.entries()].map(([p, n]) => [p, presionIdeal(activo, ejeDe(p), n)])),
    [montadosReales, activo],
  )
  const montados = useMemo(
    () => new Map([...montadosReales.entries()].map(([p, n]) => [p, { ...n, presion_ideal_psi: ideales.get(p)!.psi }])),
    [montadosReales, ideales],
  )
  const posiciones = posicionesDe(activo.configuracion).filter((p) => montados.has(p))
  const [filas, setFilas] = useState<Record<string, FilaInspeccion>>(() =>
    Object.fromEntries(posiciones.map((p) => [p, { presion: '', dejada: '', p1: '', p2: '', p3: '', valvula: 'ok', observacion: '', desgaste: '' }])),
  )
  // Primero la lectura del activo (obligatoria): sin ella no hay km por mm
  // ni proyección. Arranca vacía para que se lea el tablero, no se copie.
  const [paso, setPaso] = useState<'lectura' | 'medir'>('lectura')
  const [km, setKm] = useState('')
  const [horas, setHoras] = useState('')
  const u = unidadPrincipal(activo.medidor)
  const actual = u === 'km' ? activo.km_actual : activo.horas_actual
  const lecturaNueva = num(u === 'km' ? km : horas)
  const errorLectura =
    lecturaNueva == null
      ? `Anota ${u === 'km' ? 'el odómetro' : 'el horómetro'} antes de medir.`
      : actual != null && lecturaNueva < actual
        ? `Es menor que la última lectura (${actual.toLocaleString('es-VE')} ${u === 'km' ? 'km' : 'h'}). Revisa el tablero.`
        : null
  const evaluar = useCallback(
    (p: string) => {
      const n = montadosReales.get(p)
      if (!n) return null
      const f = filas[p]
      const par = parejaDual(p)
      const fp = par ? filas[par] : null
      return evaluarMedida({
        n,
        activo,
        d: datos,
        lectura: lecturaNueva,
        ranuras: [num(f.p1), num(f.p2), num(f.p3)],
        mmPareja: fp ? minimo([num(fp.p1), num(fp.p2), num(fp.p3)]) : null,
      })
    },
    [montadosReales, filas, activo, datos, lecturaNueva],
  )
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
      if (errorLectura) throw new Error(errorLectura)
      for (const p of conDatos) {
        const e = errorProfundidad([num(filas[p].p1), num(filas[p].p2), num(filas[p].p3)], profundidadMaxima(montados.get(p)!, datos.movimientos))
        if (e) throw new Error(`${nombrePosicion(p)}: ${e}`)
      }
      // Con alerta hay que revisar el neumático y marcar lo que se encontró
      const sinRevisar = conDatos.filter((p) => (evaluar(p)?.alertas.length ?? 0) > 0 && !filas[p].desgaste)
      if (sinRevisar.length) throw new Error(`Revisa y marca lo que encontraste en: ${sinRevisar.map(nombrePosicion).join(', ')}.`)
      const fechaInsp = new Date().toISOString()
      if (actual == null || lecturaNueva! > actual) {
        await guardar('lecturas', { activo_id: activo.id, fecha: fechaInsp, km: num(km), horas: num(horas), notas: 'Inspección de neumáticos' })
        await parchar('activos', activo.id, {
          km_actual: Math.max(activo.km_actual ?? 0, num(km) ?? 0) || activo.km_actual,
          horas_actual: Math.max(activo.horas_actual ?? 0, num(horas) ?? 0) || activo.horas_actual,
          lectura_at: fechaInsp,
        })
      }
      const inspeccionId = await guardar('inspecciones', {
        activo_id: activo.id,
        fecha: fechaInsp,
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
          presion_dejada_psi: num(f.dejada) ?? num(f.presion),
          presion_ideal_psi: n.presion_ideal_psi,
          profundidades_mm: profundidades.length ? profundidades : null,
          profundidad_min_mm: minimo(profundidades),
          valvula: f.valvula as InspeccionNeumatico['valvula'],
          observacion:
            [f.desgaste ? `Revisado: ${f.desgaste.split(',').map((k) => PATRONES[k]?.t ?? k).join(', ')}` : null, f.observacion.trim() || null].filter(Boolean).join('. ') || null,
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
        paso === 'lectura' ? (
          <>
            <button onClick={onCerrar}>Cancelar</button>
            <button className="primario" disabled={!!errorLectura} onClick={() => setPaso('medir')}>Empezar la inspección →</button>
          </>
        ) : (
          <>
            <button onClick={() => setPaso('lectura')}>← Lectura</button>
            <button className="primario" disabled={enviando} onClick={() => void guardarTodo()}>{enviando ? 'Guardando…' : 'Guardar inspección'}</button>
          </>
        )
      }
    >
      {paso === 'lectura' ? (
        <div className="inspeccion-antes">
          <div className="tarjeta pila" style={{ margin: 0 }}>
            <b>Antes de empezar</b>
            <ol className="chico">
              <li><b>Hazla con la tablet o el teléfono, parado frente al vehículo.</b> Si salta una alerta, revisas ese neumático en el momento: no hay que volver.</li>
              <li>Presión en frío: antes de rodar o con 3 horas parado. Manómetro calibrado.</li>
              <li>Mide 3 ranuras principales (exterior, centro e interior), lejos de los testigos de desgaste y sin piedras.</li>
              <li>Pasa la mano por la banda de adentro hacia afuera y al revés: un filo en un solo sentido (plumas) es arrastre lateral por desalineación, aunque el desgaste se vea parejo.</li>
            </ol>
          </div>
          <div className="grid grid-2">
            {activo.medidor !== 'horas' && (
              <Campo etiqueta="Odómetro de hoy (km) · obligatorio"><input className="entrada-grande" inputMode="decimal" autoFocus={u === 'km'} value={km} onChange={(e) => setKm(e.target.value)} /></Campo>
            )}
            {activo.medidor !== 'km' && (
              <Campo etiqueta={`Horómetro de hoy (h)${u === 'horas' ? ' · obligatorio' : ''}`}><input className="entrada-grande" inputMode="decimal" autoFocus={u === 'horas'} value={horas} onChange={(e) => setHoras(e.target.value)} /></Campo>
            )}
          </div>
          <span className="sec chico">
            {actual != null ? `Última lectura: ${actual.toLocaleString('es-VE')} ${u === 'km' ? 'km' : 'h'}${activo.lectura_at ? ` (${fecha(activo.lectura_at.slice(0, 10))})` : ''}` : 'Sin lecturas anteriores.'}
            {lecturaNueva != null && actual != null && lecturaNueva >= actual && ` · +${(lecturaNueva - actual).toLocaleString('es-VE')} ${u === 'km' ? 'km' : 'h'} desde entonces`}
            . Con esta lectura se calcula cuánto rindió cada neumático por mm y su proyección.
          </span>
          {(km || horas) && errorLectura && <div className="aviso error chico">{errorLectura}</div>}
        </div>
      ) : (
        <>
      <div className="fila chico">
        <span>{u === 'km' ? 'Odómetro' : 'Horómetro'}: <b>{lecturaNueva?.toLocaleString('es-VE')} {u === 'km' ? 'km' : 'h'}</b></span>
      </div>
      {[...ideales.values()].some((x) => x.origen !== 'activo') && (
        <div className="aviso alerta chico">
          Este activo todavía no tiene la presión ideal calculada para {[...ideales.values()].every((x) => x.origen !== 'activo') ? 'sus ejes' : 'algunos ejes'}; se usa la del fabricante del neumático. Defínela en “Presiones ideales”.
        </div>
      )}
      <InspeccionGrafica
        activo={activo}
        montados={montados}
        posiciones={posiciones}
        filas={filas}
        set={set}
        maxima={(n) => profundidadMaxima(n, datos.movimientos)}
        origenIdeal={(p) => ideales.get(p)?.origen ?? null}
        evaluar={evaluar}
      />
      <Campo etiqueta="Notas"><input value={notas} onChange={(e) => setNotas(e.target.value)} /></Campo>
        </>
      )}
      <ErrorMsg error={error} />
    </Modal>
  )
}
