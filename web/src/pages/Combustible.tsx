import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useEmpresa } from '../lib/empresa'
import { ADITIVOS, TIPOS, etiqueta } from '../lib/catalogos'
import { dinero, fecha, numero } from '../lib/formato'
import { AHORRO_INYECCION_PROMETIDO, AHORRO_PROMETIDO, compararAditivo, tramosConsumo, unidadPrincipal } from '../lib/calculos'
import { Metrica, Pill, SoloPago, Vacio } from '../components/ui'

/** Informe de combustible y aditivos de toda la flota (versión completa). */
export default function Combustible() {
  const e = useEmpresa()
  const base = `/e/${e.empresa!.id}`

  const filas = useMemo(
    () =>
      e.datos.activos
        .filter((a) => a.activo)
        .map((a) => {
          const u = unidadPrincipal(a.medidor)
          const cargas = e.datos.combustible.filter((c) => c.activo_id === a.id)
          const tramos = tramosConsumo(cargas, u)
          const ultimos = tramos.slice(-3)
          const litros = ultimos.reduce((t, x) => t + x.litros, 0)
          const uso = ultimos.reduce((t, x) => t + x.uso, 0)
          const consumo = uso > 0 ? (u === 'km' ? (litros / uso) * 100 : litros / uso) : null
          const comp = a.aditivo_desde
            ? compararAditivo({ cargas, costos: e.datos.costos.filter((c) => c.activo_id === a.id), unidad: u, aditivoDesde: a.aditivo_desde })
            : null
          return { a, u, cargas: cargas.length, consumo, comp }
        })
        .filter((f) => f.cargas > 0 || f.a.aditivo),
    [e.datos],
  )

  if (!e.tiene('informe_aditivo')) return <SoloPago que="El control de combustible y el informe de ahorro con aditivos" />
  if (e.reportesBloqueados) return <div className="aviso error">Los reportes vuelven cuando sincronices este equipo con internet.</div>

  const conAditivo = filas.filter((f) => f.comp && f.comp.ahorro != null)
  const dineroTotal = conAditivo.reduce((t, f) => t + (f.comp!.dineroAhorrado ?? 0), 0)
  const litrosTotal = conAditivo.reduce((t, f) => t + (f.comp!.litrosAhorrados ?? 0), 0)
  const promedio = conAditivo.length ? conAditivo.reduce((t, f) => t + f.comp!.ahorro!, 0) / conAditivo.length : null
  const consumoTxt = (v: number | null, u: 'km' | 'horas') => (v == null ? '—' : u === 'km' ? `${numero(v, 1)} L/100 km` : `${numero(v, 1)} L/h`)

  return (
    <div className="pila" style={{ gap: 14 }}>
      <div className="titulo-pagina">
        <div>
          <h1>Combustible y aditivos</h1>
          <div className="sec chico">
            Ahorro medido contra los 2 meses anteriores al aditivo. SAREGO espera alrededor de {Math.round(AHORRO_PROMETIDO * 100)} % menos
            combustible y {Math.round(AHORRO_INYECCION_PROMETIDO * 100)} % menos gasto en inyección.
          </div>
        </div>
      </div>
      <div className="grid grid-4">
        <Metrica valor={conAditivo.length} etiqueta="Activos con aditivo medido" />
        <Metrica valor={promedio == null ? '—' : `${numero(promedio * 100, 1)} %`} etiqueta="Ahorro promedio medido" />
        <Metrica valor={`${numero(litrosTotal)} L`} etiqueta="Combustible ahorrado" />
        <Metrica valor={dinero(dineroTotal)} etiqueta="Dinero ahorrado" />
      </div>
      {filas.length === 0 ? (
        <Vacio>Registra cargas de combustible desde cada activo (pestaña Combustible) para ver el rendimiento.</Vacio>
      ) : (
        <div className="tarjeta tabla-wrap" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr><th>Unidad</th><th>Consumo reciente</th><th>Aditivo</th><th>Antes</th><th>Con aditivo</th><th>Ahorro</th><th>Dinero</th></tr>
            </thead>
            <tbody>
              {filas.map(({ a, u, consumo, comp }) => (
                <tr key={a.id}>
                  <td>
                    <Link to={`${base}/activos/${a.id}?p=combustible`}><b>{a.codigo}</b></Link>
                    <div className="sec chico">{etiqueta(TIPOS, a.tipo)}</div>
                  </td>
                  <td className="num">{consumoTxt(consumo, u)}</td>
                  <td className="chico">{a.aditivo ? <>{etiqueta(ADITIVOS, a.aditivo)}<div className="sec">desde {fecha(a.aditivo_desde)}</div></> : '—'}</td>
                  <td className="num">{comp ? consumoTxt(comp.base.consumo, u) : '—'}</td>
                  <td className="num">{comp ? consumoTxt(comp.conAditivo.consumo, u) : '—'}</td>
                  <td>
                    {comp?.ahorro != null ? (
                      <Pill tono={comp.ahorro >= AHORRO_PROMETIDO * 0.66 ? 'ok' : comp.ahorro > 0 ? 'alerta' : 'critico'}>{numero(comp.ahorro * 100, 1)} %</Pill>
                    ) : comp ? (
                      <span className="sec chico">{comp.base.tramos === 0 ? 'Sin línea base' : 'Faltan datos'}</span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="num">{comp?.dineroAhorrado != null ? dinero(comp.dineroAhorrado) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
