// Presión ideal por eje de cada activo (Andrea, 24/nov/2026): no la
// indica solo el fabricante, se calcula según el trabajo del activo.
// Es la misma en todo el eje y es la que ve el personal en la inspección.
import { useState } from 'react'
import { useEmpresa } from '../lib/empresa'
import { useSesion } from '../lib/sesion'
import { PLANTILLAS, ejeDe } from '../lib/ejes'
import { fecha } from '../lib/formato'
import type { Activo, Neumatico } from '../lib/tipos'
import { PlantaVehiculo } from './planta'
import { buscarMedida } from '../lib/medidas'
import { presionSugerida } from '../lib/calculos'
import { ErrorMsg, Modal, mensajeError, num } from './ui'

/** Ejes de la plantilla con su clave ("1", "2"… y "R"). */
function ejesDe(activo: Activo): { clave: string; nombre: string; posiciones: string[] }[] {
  const pl = PLANTILLAS[activo.configuracion ?? ''] ?? PLANTILLAS.ninguna
  const ejes = pl.ejes.map((e) => ({ clave: ejeDe(e.posiciones[0]), nombre: e.nombre, posiciones: e.posiciones }))
  return pl.repuesto ? [...ejes, { clave: 'R', nombre: 'Repuesto', posiciones: ['R'] }] : ejes
}

/** Presión del fabricante más usada entre los neumáticos montados en el eje (para proponer). */
function delFabricante(posiciones: string[], montados: Map<string, Neumatico>): number | null {
  const v = posiciones.map((p) => montados.get(p)?.presion_ideal_psi).filter((x): x is number => x != null)
  if (!v.length) return null
  const cuenta = new Map<number, number>()
  v.forEach((x) => cuenta.set(x, (cuenta.get(x) ?? 0) + 1))
  return [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0][0]
}

/** Resumen arriba de la planta: presiones ideales del activo y botón para definirlas. */
export function ResumenPresiones({ activo, montados, puedeEditar }: { activo: Activo; montados: Map<string, Neumatico>; puedeEditar: boolean }) {
  const [abierto, setAbierto] = useState(false)
  const ejes = ejesDe(activo)
  const definidas = activo.presiones_eje ?? {}
  const faltan = ejes.filter((e) => definidas[e.clave] == null)
  if (!ejes.length) return null
  return (
    <div className={'tarjeta pila presiones-resumen' + (faltan.length ? ' falta' : '')} style={{ margin: 0 }}>
      <div className="fila-entre">
        <b>Presiones ideales de este activo</b>
        {puedeEditar && (
          <button className={faltan.length ? 'primario chico' : 'chico'} onClick={() => setAbierto(true)}>
            {faltan.length === ejes.length ? 'Definir presiones ideales' : 'Presiones ideales'}
          </button>
        )}
      </div>
      <div className="fila">
        {ejes.map((e) => (
          <span key={e.clave} className={'chip-eje' + (definidas[e.clave] == null ? ' vacio' : '')}>
            <span className="sec">{e.nombre}</span> <b className="mono">{definidas[e.clave] ?? '—'}</b> <span className="sec">psi</span>
          </span>
        ))}
      </div>
      {faltan.length > 0 ? (
        <span className="chico sec">
          {faltan.length === ejes.length ? 'Sin calcular todavía' : `Faltan: ${faltan.map((e) => e.nombre).join(', ')}`}. Mientras tanto la inspección usa
          la presión del fabricante de cada neumático.
        </span>
      ) : (
        activo.presiones_at && (
          <span className="chico sec">
            Definidas el {fecha(activo.presiones_at.slice(0, 10))}
            {activo.presiones_nota ? ` · ${activo.presiones_nota}` : ''}
          </span>
        )
      )}
      {abierto && <FormPresiones activo={activo} montados={montados} onCerrar={() => setAbierto(false)} />}
    </div>
  )
}

function FormPresiones({ activo, montados, onCerrar }: { activo: Activo; montados: Map<string, Neumatico>; onCerrar: () => void }) {
  const { guardar } = useEmpresa()
  const { yo } = useSesion()
  const ejes = ejesDe(activo)
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(ejes.map((e) => [e.clave, String(activo.presiones_eje?.[e.clave] ?? delFabricante(e.posiciones, montados) ?? '')])),
  )
  const [nota, setNota] = useState(activo.presiones_nota ?? '')
  const [elegido, setElegido] = useState(ejes[0]?.clave ?? '')
  // Estimación por carga (opcional)
  const [estimar, setEstimar] = useState(false)
  const [regresaVacio, setRegresaVacio] = useState(true)
  const [calc, setCalc] = useState<Record<string, { carga: string; indice: string; pmax: string }>>(() =>
    Object.fromEntries(
      ejes.map((e) => {
        const medida = e.posiciones.map((p) => montados.get(p)?.medida).find(Boolean)
        const t = buscarMedida(medida)
        return [e.clave, { carga: '', indice: t?.indice ?? '', pmax: t?.presionMax ? String(t.presionMax) : '' }]
      }),
    ),
  )
  const medidaDe = (e: { posiciones: string[] }) => e.posiciones.map((p) => montados.get(p)?.medida).find(Boolean) ?? null
  const sugerida = (e: { clave: string; posiciones: string[] }) => {
    const c = calc[e.clave]
    if (!c || !num(c.carga)) return null
    return presionSugerida({ cargaEjeKg: num(c.carga)!, neumaticos: e.posiciones.length, dual: e.posiciones.length > 2, indice: c.indice, presionMaxPsi: num(c.pmax) ?? 0 })
  }
  const usar = (e: { clave: string; nombre: string; posiciones: string[] }) => {
    const r = sugerida(e)
    if (!r?.psi) return
    setValores((v) => ({ ...v, [e.clave]: String(r.psi) }))
    const linea = `${e.nombre}: estimada ${r.psi} psi para ${num(calc[e.clave].carga)} kg (índice ${calc[e.clave].indice}, máx. ${calc[e.clave].pmax} psi)${regresaVacio ? ', fijada para ir cargado; regresa vacío' : ''}. Pendiente de confirmar por un técnico.`
    setNota((n) => (n ? `${n}\n${linea}` : linea))
  }
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const paso = (clave: string, d: number) => setValores((v) => ({ ...v, [clave]: String(Math.max(0, (num(v[clave]) ?? 0) + d)) }))

  const guardarTodo = async () => {
    setError(null)
    const presiones: Record<string, number> = {}
    for (const e of ejes) {
      const v = num(valores[e.clave])
      if (v == null) continue
      if (v < 15 || v > 200) return setError(`${e.nombre}: ${v} psi no parece una presión válida.`)
      presiones[e.clave] = v
    }
    if (!Object.keys(presiones).length) return setError('Anota al menos la presión de un eje.')
    setEnviando(true)
    try {
      await guardar('activos', { ...activo, presiones_eje: presiones, presiones_nota: nota.trim() || null, presiones_at: new Date().toISOString(), presiones_por: yo?.id ?? null })
      onCerrar()
    } catch (x) {
      setError(mensajeError(x))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal
      abierto
      ancho="grande"
      titulo={`Presiones ideales — ${activo.codigo}`}
      onCerrar={onCerrar}
      pie={
        <>
          <button onClick={onCerrar}>Cancelar</button>
          <button className="primario" disabled={enviando} onClick={() => void guardarTodo()}>{enviando ? 'Guardando…' : 'Guardar presiones'}</button>
        </>
      }
    >
      <span className="sec chico">
        La presión ideal se calcula según el trabajo de este activo (carga, ruta, terreno, velocidad), no solo por lo que indica el fabricante. Es la misma
        para todas las posiciones de un eje y es la que verá el personal de mantenimiento al inspeccionar.
      </span>
      <div className="insp-grid">
        <PlantaVehiculo
          configuracion={activo.configuracion}
          elegida={null}
          onElegir={(p) => setElegido(ejeDe(p))}
          celda={(p) => {
            const clave = ejeDe(p)
            const v = num(valores[clave])
            return {
              estado: v != null ? 'sin_dato' : null,
              titulo: v != null ? `${v} psi` : '— psi',
              detalle: <span className={clave === elegido ? '' : 'sec'}>{clave === 'R' ? 'Repuesto' : `Eje ${clave}`}</span>,
            }
          }}
        />
        <div className="pila" style={{ gap: 8 }}>
          {ejes.map((e) => {
            const fab = delFabricante(e.posiciones, montados)
            return (
              <div key={e.clave} className={'eje-presion' + (e.clave === elegido ? ' elegido' : '')} onClick={() => setElegido(e.clave)}>
                <div className="pila" style={{ gap: 0 }}>
                  <b>{e.nombre}</b>
                  <span className="sec chico">
                    {e.posiciones.length} {e.posiciones.length === 1 ? 'neumático' : 'neumáticos'}
                    {fab != null ? ` · fabricante ${fab} psi` : ''}
                  </span>
                </div>
                <div className="paso">
                  <button type="button" aria-label={`Bajar ${e.nombre}`} onClick={() => paso(e.clave, -5)}>−</button>
                  <input
                    inputMode="decimal"
                    aria-label={`Presión ideal ${e.nombre}`}
                    value={valores[e.clave]}
                    onFocus={() => setElegido(e.clave)}
                    onChange={(x) => setValores({ ...valores, [e.clave]: x.target.value })}
                  />
                  <button type="button" aria-label={`Subir ${e.nombre}`} onClick={() => paso(e.clave, 5)}>+</button>
                  <span className="sec chico">psi</span>
                </div>
                {estimar && e.clave !== 'R' && (
                  <div className="calc-eje" onClick={(x) => x.stopPropagation()}>
                    <label className="campo"><span>Carga máx. del eje (kg)</span>
                      <input inputMode="numeric" value={calc[e.clave].carga} onChange={(x) => setCalc({ ...calc, [e.clave]: { ...calc[e.clave], carga: x.target.value } })} />
                    </label>
                    <label className="campo"><span>Índice de carga</span>
                      <input value={calc[e.clave].indice} placeholder="146/143" onChange={(x) => setCalc({ ...calc, [e.clave]: { ...calc[e.clave], indice: x.target.value } })} />
                    </label>
                    <label className="campo"><span>Presión máx. costado (psi)</span>
                      <input inputMode="numeric" value={calc[e.clave].pmax} onChange={(x) => setCalc({ ...calc, [e.clave]: { ...calc[e.clave], pmax: x.target.value } })} />
                    </label>
                    {(() => {
                      const r = sugerida(e)
                      if (!r) return <span className="sec chico">{medidaDe(e) ? `Medida montada: ${medidaDe(e)}.` : ''} Anota la carga máxima del eje.</span>
                      if (r.error) return <span className="chico" style={{ color: 'var(--critico)' }}>{r.error}</span>
                      return (
                        <div className="sugerida">
                          <span className="chico">Estimación: <b className="mono">{r.psi} psi</b> · {Math.round(r.kgPorNeumatico)} kg por neumático de {r.kgMaximo} kg que soporta</span>
                          {r.sobrecarga && <span className="chico" style={{ color: 'var(--critico)', fontWeight: 600 }}>⚠ Sobrecarga: la carga pasa lo que soporta el neumático a su presión máxima.</span>}
                          {r.enPiso && <span className="sec chico">La carga es baja: se dejó en el 60 % de la máxima como mínimo.</span>}
                          <button type="button" className="chico" onClick={() => usar(e)}>Usar {r.psi} psi</button>
                        </div>
                      )
                    })()}
                  </div>
                )}
              </div>
            )
          })}
          <label className="check" onClick={(x) => x.stopPropagation()}>
            <input type="checkbox" checked={estimar} onChange={(x) => setEstimar(x.target.checked)} /> Estimar la presión con la carga máxima (opcional)
          </label>
          {estimar && (
            <div className="aviso alerta chico pila" style={{ gap: 4 }}>
              <b>⚠ Es una estimación, no la presión indicada</b>
              <span>Se calcula con la fórmula de carga de la TRA (la base de las tablas de carga e inflación de ETRTO, Michelin, Bridgestone y otros): la carga que soporta un neumático varía con la presión elevada a 0,585.</span>
              <span>El índice de carga y la presión máxima vienen como típicos de la medida: verifícalos en el costado de cada neumático.</span>
              <span>Solo un técnico, después de una inspección meticulosa (estado de la carcasa, desgaste, temperatura, ruta, velocidad), puede indicar la presión de carga correcta.</span>
              <label className="check"><input type="checkbox" checked={regresaVacio} onChange={(x) => setRegresaVacio(x.target.checked)} /> Regresa vacío: la presión se fija para ir cargado y no se baja para el regreso</label>
            </div>
          )}
          <label className="campo">
            <span>Por qué esta presión (carga, ruta, terreno…)</span>
            <textarea value={nota} onChange={(x) => setNota(x.target.value)} placeholder="Ej.: 12 t por viaje, ruta de montaña, pavimento 80 % y tierra 20 %" />
          </label>
        </div>
      </div>
      <ErrorMsg error={error} />
    </Modal>
  )
}
