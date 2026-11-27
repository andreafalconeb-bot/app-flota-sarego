// Costo de operación por km o por hora de un activo, y proyección de
// duración de sus neumáticos (regla de tres km / mm hasta 1,5 mm).
import { useMemo, useState } from 'react'
import { useEmpresa } from '../lib/empresa'
import { CUENTAS, etiqueta } from '../lib/catalogos'
import { dinero, fecha, hoyISO, nombreNeumatico, numero } from '../lib/formato'
import { nombrePosicion } from '../lib/ejes'
import { MM_PROYECCION_FIRME, REMANENTE_MM, costoOperacion, perdidaPorPresion, proyeccionNeumatico, type ProyeccionNeumatico, type Rubro, type Unidad } from '../lib/calculos'
import type { Activo, Neumatico } from '../lib/tipos'
import { Metrica, Pill, SoloPago, Vacio } from './ui'

export const PERIODOS_COSTO: Record<string, string> = { '2': 'Últimos 3 meses', '5': 'Últimos 6 meses', '11': 'Últimos 12 meses', todo: 'Todo el historial' }

/** Primer día del mes, `meses` atrás; null = todo el historial. */
export function desdePeriodo(periodo: string): string | null {
  if (periodo === 'todo') return null
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - Number(periodo))
  return d.toISOString().slice(0, 10)
}

export const un = (u: Unidad) => (u === 'km' ? 'km' : 'h')
export const porUn = (u: Unidad) => (u === 'km' ? 'por km' : 'por hora')

/** Costo por unidad con 3 decimales: los centavos por km importan. */
export function dineroUnidad(v: number | null | undefined): string {
  if (v == null) return '—'
  return `US$ ${new Intl.NumberFormat('es-VE', { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(v)}`
}

const RUBROS: Record<Rubro, string> = {
  combustible: 'Combustible',
  fluidos: 'Aceites, filtros y engrase',
  neumaticos: 'Neumáticos (desgaste medido)',
  mantenimiento: 'Mantenimiento',
}

export function TarjetaCostoOperacion({ activo }: { activo: Activo }) {
  const e = useEmpresa()
  const [periodo, setPeriodo] = useState('5')
  const desde = desdePeriodo(periodo)
  const c = useMemo(() => costoOperacion(activo, e.datos, desde, hoyISO()), [activo, e.datos, desde])
  if (!e.tiene('costo_por_hora')) return <SoloPago que={`El costo de operación ${porUn(activo.medidor === 'horas' ? 'horas' : 'km')}`} />
  return (
    <section className="tarjeta pila">
      <div className="fila-entre">
        <h2>Costo de operación {activo.medidor === 'horas' ? 'por hora' : 'por km'}</h2>
        <select value={periodo} onChange={(x) => setPeriodo(x.target.value)} style={{ maxWidth: 200 }}>
          {Object.entries(PERIODOS_COSTO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      {!c ? (
        <Vacio>
          Sin recorrido en el periodo para dividir. Registra las lecturas de {activo.medidor === 'horas' ? 'horómetro' : 'odómetro'} (la app las pide cada 7 días).
        </Vacio>
      ) : (
        <>
          <div className="grid grid-3">
            <Metrica valor={dineroUnidad(c.porUnidad)} etiqueta={`Costo total ${porUn(c.unidad)}`} />
            <Metrica valor={dinero(c.total)} etiqueta="Gastado en el periodo" />
            <Metrica valor={`${numero(c.uso)} ${un(c.unidad)}`} etiqueta={`Trabajados del ${fecha(c.desde)} al ${fecha(c.hasta)}`} />
          </div>
          <div className="sec chico">
            Cálculo: {dinero(c.total)} ÷ {numero(c.uso)} {un(c.unidad)} = <b>{dineroUnidad(c.porUnidad)} {porUn(c.unidad)}</b>. Lo trabajado es la
            diferencia entre la última lectura antes del periodo y la mayor lectura dentro de él.
          </div>
          {c.partes.length === 0 ? (
            <Vacio>Sin gastos registrados en el periodo.</Vacio>
          ) : (
            <div className="tabla-wrap">
              <table>
                <thead>
                  <tr><th>Rubro</th><th className="num">Gastado</th><th className="num">{porUn(c.unidad).replace('por ', 'Por ')}</th><th className="num">%</th></tr>
                </thead>
                <tbody>
                  {c.partes.map((p) => (
                    <tr key={p.rubro + (p.cuenta ?? '')}>
                      <td>{p.rubro === 'mantenimiento' ? <>{RUBROS.mantenimiento}: {etiqueta(CUENTAS, p.cuenta!)}</> : RUBROS[p.rubro]}</td>
                      <td className="num">{dinero(p.monto)}</td>
                      <td className="num">{dineroUnidad(p.porUnidad)}</td>
                      <td className="num">{numero((p.monto / c.total) * 100, 1)} %</td>
                    </tr>
                  ))}
                  <tr style={{ background: 'var(--superficie-2)' }}>
                    <td><b>Total</b></td>
                    <td className="num"><b>{dinero(c.total)}</b></td>
                    <td className="num"><b>{dineroUnidad(c.porUnidad)}</b></td>
                    <td className="num">100 %</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          <ul className="sec chico" style={{ margin: 0, paddingLeft: 18 }}>
            <li>
              Neumáticos: cada mm gastado y medido en este activo vale costo del neumático ÷ (profundidad de nuevo − {numero(REMANENTE_MM, 1)} mm).
              El desgaste después de la última medición entra cuando se vuelve a medir.
            </li>
            {c.cargasSinCosto > 0 && <li>{c.cargasSinCosto} {c.cargasSinCosto === 1 ? 'carga de combustible no tiene costo y no suma' : 'cargas de combustible no tienen costo y no suman'}.</li>}
            {c.neumaticosSinCosto > 0 && <li>{c.neumaticosSinCosto} {c.neumaticosSinCosto === 1 ? 'neumático gastó banda pero no tiene costo o profundidad de nuevo: no suma' : 'neumáticos gastaron banda pero no tienen costo o profundidad de nuevo: no suman'}.</li>}
            {c.gastoCuentaNeumaticos > 0 && (
              <li>
                Hay {dinero(c.gastoCuentaNeumaticos)} en la cuenta Neumáticos y rines. Si alguno es la compra de un caucho que ya tiene su costo cargado, se está contando dos veces:
                deja ahí solo reparaciones, renovaciones y rines.
              </li>
            )}
          </ul>
        </>
      )}
    </section>
  )
}

/** Texto corto de la proyección para listas. */
export function textoProyeccion(p: ProyeccionNeumatico): string {
  if (p.llego) return `Llegó a ${numero(REMANENTE_MM, 1)} mm`
  const queda = p.restanteHoy ?? p.restante
  return `Quedan ~${numero(queda)} ${un(p.unidad)}`
}

/** Proyección de duración de los neumáticos montados en el activo. */
export function ProyeccionNeumaticos({ activo, montados }: { activo: Activo; montados: Map<string, Neumatico> }) {
  const e = useEmpresa()
  const filas = useMemo(
    () => [...montados.entries()].sort(([a], [b]) => a.localeCompare(b, 'es', { numeric: true })).map(([pos, n]) => ({ pos, n, ...proyeccionNeumatico(n, e.datos) })),
    [montados, e.datos],
  )
  const verCostos = !e.reportesBloqueados
  if (!filas.length) return null
  const u = activo.medidor === 'horas' ? 'h' : 'km'
  return (
    <section className="tarjeta pila">
      <h2>Proyección de duración</h2>
      <span className="sec chico">
        Regla de tres: {u} recorridos ÷ mm gastados = {u} por mm. Con eso se calcula cuánto le falta hasta {numero(REMANENTE_MM, 1)} mm, el remanente para
        sustituirlo o mandarlo a renovar si la carcasa está buena.
      </span>
      <div className="tabla-wrap">
        <table>
          <thead>
            <tr>
              <th>Posición</th><th>Neumático</th><th className="num">Última medida</th><th className="num">{u} por mm</th>
              <th className="num">Vida proyectada</th><th>Le queda</th>{verCostos && <th className="num">Costo {u === 'km' ? 'por km' : 'por hora'}</th>}
            </tr>
          </thead>
          <tbody>
            {filas.map(({ pos, n, proyeccion: p, motivo }) => (
              <tr key={pos}>
                <td>{nombrePosicion(pos)}</td>
                <td>{nombreNeumatico(n)}<div className="sec chico">{[n.marca, n.medida].filter(Boolean).join(' · ')}</div></td>
                {!p ? (
                  <td colSpan={verCostos ? 5 : 4} className="sec chico">{motivo}</td>
                ) : (
                  <>
                    <td className="num">
                      {numero(p.mmUltima, 1)} mm<div className="sec chico">{fecha(p.fechaUltima)}</div>
                      {p.mmHoy != null && p.mmHoy < p.mmUltima && <div className="sec chico">hoy ~{numero(p.mmHoy, 1)} mm</div>}
                    </td>
                    <td className="num">
                      {numero(p.porMm)}
                      <div className="sec chico">{numero(p.usoMedido)} {un(p.unidad)} ÷ {numero(p.mmGastados, 1)} mm</div>
                    </td>
                    <td className="num">
                      {p.vidaTotal != null ? `${numero(p.vidaTotal)} ${un(p.unidad)}` : '—'}
                      {p.mmNuevo != null && <div className="sec chico">de {numero(p.mmNuevo, 1)} a {numero(REMANENTE_MM, 1)} mm</div>}
                    </td>
                    <td>
                      {p.llego ? (
                        <Pill tono="critico">Sustituir o renovar</Pill>
                      ) : (
                        <>
                          <b>~{numero(p.restanteHoy ?? p.restante)} {un(p.unidad)}</b>
                          {p.lecturaRetiro != null && <div className="sec chico">a los {numero(p.lecturaRetiro)} {un(p.unidad)} del activo</div>}
                          {p.fechaRetiro && <div className="sec chico">cerca del {fecha(p.fechaRetiro)}</div>}
                        </>
                      )}
                      {p.preliminar && <div><Pill tono="alerta">Preliminar</Pill> <span className="sec chico">menos de {MM_PROYECCION_FIRME} mm medidos</span></div>}
                      {p.tasaBandaAnterior && <div className="sec chico">Banda renovada: usa el desgaste de la banda anterior.</div>}
                    </td>
                    {verCostos && (
                      <td className="num">
                        {p.costoPorUnidad != null ? dineroUnidad(p.costoPorUnidad) : <span className="sec chico">{(n.renovaciones ?? 0) > 0 ? 'renovado' : 'sin costo'}</span>}
                      </td>
                    )}
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/** Dinero perdido por presión fuera de la ideal en este activo (curva TMC). */
export function PerdidaPresionActivo({ activo }: { activo: Activo }) {
  const e = useEmpresa()
  const [periodo, setPeriodo] = useState('5')
  const desde = desdePeriodo(periodo)
  const r = useMemo(() => perdidaPorPresion(e.datos, desde, hoyISO()).get(activo.id) ?? null, [e.datos, desde, activo.id])
  if (e.reportesBloqueados) return null
  const porNeumatico = new Map<string, { pos: string; uso: number; dinero: number; peor: number; tramos: number; sinCosto: boolean }>()
  for (const t of r?.tramos ?? []) {
    const f = porNeumatico.get(t.neumaticoId) ?? { pos: t.posicion, uso: 0, dinero: 0, peor: 1, tramos: 0, sinCosto: false }
    f.pos = t.posicion
    f.uso += t.uso
    f.dinero += t.dinero ?? 0
    f.sinCosto ||= t.dinero == null && t.desgasteExtra > 0
    if (Math.abs(1 - t.proporcion) > Math.abs(1 - f.peor)) f.peor = t.proporcion
    f.tramos++
    porNeumatico.set(t.neumaticoId, f)
  }
  const filas = [...porNeumatico.entries()].sort((a, b) => b[1].dinero - a[1].dinero)
  const dias = desde ? (Date.now() - new Date(desde).getTime()) / 86_400_000 : null
  return (
    <section className="tarjeta pila">
      <div className="fila-entre">
        <h2>Dinero perdido por presión</h2>
        <select value={periodo} onChange={(x) => setPeriodo(x.target.value)} style={{ maxWidth: 200 }}>
          {Object.entries(PERIODOS_COSTO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      {!r || !r.tramos.length ? (
        <Vacio>Hacen falta dos inspecciones de presión (o un montaje y una inspección) con {activo.medidor === 'horas' ? 'horómetro' : 'odómetro'} para calcularlo.</Vacio>
      ) : (
        <>
          <div className="grid grid-3">
            <Metrica valor={dinero(r.total)} etiqueta="Perdido en el periodo" tono={r.total > 0 ? 'alerta' : undefined} />
            <Metrica valor={dinero(r.desgaste)} etiqueta="Neumáticos gastados de más" />
            <Metrica valor={dinero(r.combustible)} etiqueta="Combustible de más (estimado)" />
          </div>
          {dias != null && dias > 20 && r.total > 0 && (
            <div className="aviso alerta chico">A este ritmo son cerca de <b>{dinero((r.total / dias) * 365)} al año</b> solo en este activo.</div>
          )}
          <div className="tabla-wrap">
            <table>
              <thead>
                <tr><th>Neumático</th><th>Posición</th><th className="num">Peor presión</th><th className="num">Recorrido</th><th className="num">Perdido</th></tr>
              </thead>
              <tbody>
                {filas.map(([id, f]) => {
                  const n = e.datos.neumaticos.find((x) => x.id === id)
                  const pct = Math.round((f.peor - 1) * 100)
                  return (
                    <tr key={id}>
                      <td>{n ? nombreNeumatico(n) : '—'}</td>
                      <td>{nombrePosicion(f.pos)}</td>
                      <td className="num">
                        {pct === 0 ? 'en la ideal' : <Pill tono={pct <= -20 ? 'critico' : pct < -5 || pct > 10 ? 'alerta' : undefined}>{pct > 0 ? '+' : ''}{pct} %</Pill>}
                      </td>
                      <td className="num">{numero(f.uso)} {un(r.unidad)}</td>
                      <td className="num">{f.sinCosto && !f.dinero ? <span className="sec chico">sin costo</span> : dinero(f.dinero)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <ul className="sec chico" style={{ margin: 0, paddingLeft: 18 }}>
            <li>
              Presión con que rodó cada tramo: el promedio entre la que se dejó en la inspección anterior y la que se encontró en esta (la primera vez, la encontrada).
            </li>
            <li>
              Desgaste (curva TMC): 10 % bajo = 12 % menos vida; 20 % bajo = 30 % menos; 10 % alto = 5 % más desgaste. Lo perdido es ese desgaste de más al costo
              por {un(r.unidad)} de cada neumático.
            </li>
            <li>Combustible: 0,5 % más por cada 10 % de baja presión promedio del activo, a su costo de combustible por {un(r.unidad)} (las fuentes dan de 0,2 a 1 %).</li>
            {r.sinCosto > 0 && <li>Hay neumáticos sin costo cargado: su desgaste de más no se puede pasar a dinero.</li>}
          </ul>
        </>
      )}
    </section>
  )
}
