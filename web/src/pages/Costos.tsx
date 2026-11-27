import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useEmpresa } from '../lib/empresa'
import { CUENTAS, TIPOS_COSTO, etiqueta } from '../lib/catalogos'
import { dinero, fecha, hoyISO } from '../lib/formato'
import { costoOperacion, gastoPorCuenta, totalServicio } from '../lib/calculos'
import { dineroUnidad, porUn } from '../components/costoOperacion'
import { FormCosto } from '../components/formularios'
import { Metrica, Vacio } from '../components/ui'

function inicioDeMes(meses: number) {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - meses)
  return d.toISOString().slice(0, 10)
}

const PERIODOS: Record<string, string> = { '0': 'Este mes', '2': 'Últimos 3 meses', '5': 'Últimos 6 meses', '11': 'Últimos 12 meses' }

export default function Costos() {
  const e = useEmpresa()
  const [periodo, setPeriodo] = useState('2')
  const [activoId, setActivoId] = useState('')
  const [nuevo, setNuevo] = useState(false)
  const base = `/e/${e.empresa!.id}`
  const desde = inicioDeMes(Number(periodo))
  const hasta = hoyISO()

  const r = useMemo(() => {
    const deActivo = <T extends { activo_id: string | null }>(x: T) => !activoId || x.activo_id === activoId
    const costos = e.datos.costos.filter((c) => c.fecha >= desde && deActivo(c))
    const servicios = e.datos.servicios.filter((s) => s.fecha >= desde && deActivo(s))
    const combustible = e.datos.combustible.filter((c) => c.fecha.slice(0, 10) >= desde && deActivo(c))
    const cuentas = gastoPorCuenta(costos, servicios, e.datos.compartimientos)
    const totalCombustible = combustible.reduce((t, c) => t + (c.costo_total ?? 0), 0)
    const totalMantenimiento = [...cuentas.values()].reduce((t, v) => t + v, 0)
    const porActivo = new Map<string, number>()
    const sumar = (id: string | null, v: number) => id && porActivo.set(id, (porActivo.get(id) ?? 0) + v)
    costos.forEach((c) => sumar(c.activo_id, c.monto))
    servicios.forEach((s) => sumar(s.activo_id, totalServicio(s)))
    combustible.forEach((c) => sumar(c.activo_id, c.costo_total ?? 0))
    // Costo de operación por km u hora de cada activo en el mismo periodo
    const operacion = new Map(e.datos.activos.map((a) => [a.id, costoOperacion(a, e.datos, desde, hasta)]))
    return { operacion, costos: costos.sort((a, b) => b.fecha.localeCompare(a.fecha)), cuentas, totalCombustible, totalMantenimiento, porActivo, fluidos: servicios.reduce((t, s) => t + totalServicio(s), 0) }
  }, [e.datos, desde, hasta, activoId])

  if (e.reportesBloqueados) return <div className="aviso error">Los costos vuelven cuando sincronices este equipo con internet.</div>

  const max = Math.max(1, ...r.cuentas.values())
  const verOperacion = e.tiene('costo_por_hora')
  const opActivo = activoId ? r.operacion.get(activoId) : null
  return (
    <div className="pila" style={{ gap: 14 }}>
      <div className="titulo-pagina">
        <div>
          <h1>Costos</h1>
          <div className="sec chico">Por sistema del vehículo (15 cuentas). Incluye facturas, servicios de aceite y combustible.</div>
        </div>
        {e.puedeEscribir && <button className="primario" onClick={() => setNuevo(true)}>Registrar gasto</button>}
      </div>
      <div className="fila">
        <select value={periodo} onChange={(x) => setPeriodo(x.target.value)} style={{ maxWidth: 200 }}>
          {Object.entries(PERIODOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={activoId} onChange={(x) => setActivoId(x.target.value)} style={{ maxWidth: 220 }}>
          <option value="">Toda la flota</option>
          {e.datos.activos.map((a) => <option key={a.id} value={a.id}>{a.codigo}</option>)}
        </select>
        <span className="sec chico">{fecha(desde)} – {fecha(hasta)}</span>
      </div>
      <div className="grid grid-4">
        <Metrica valor={dinero(r.totalMantenimiento + r.totalCombustible)} etiqueta="Total" />
        <Metrica valor={dinero(r.totalMantenimiento)} etiqueta="Mantenimiento" />
        <Metrica valor={dinero(r.fluidos)} etiqueta="De eso, servicios de aceite" />
        <Metrica valor={dinero(r.totalCombustible)} etiqueta="Combustible" />
      </div>
      {verOperacion && activoId && (
        <div className="aviso chico">
          {opActivo ? (
            <>
              Costo de operación de este activo en el periodo: <b>{dineroUnidad(opActivo.porUnidad)} {porUn(opActivo.unidad)}</b> ({dinero(opActivo.total)} en{' '}
              {opActivo.uso.toLocaleString('es-VE')} {opActivo.unidad === 'km' ? 'km' : 'h'}, con el desgaste medido de neumáticos).{' '}
              <Link to={`${base}/activos/${activoId}?p=costos`}>Ver el desglose</Link>
            </>
          ) : (
            'Sin lecturas de odómetro u horómetro en el periodo: no se puede sacar el costo por km o por hora.'
          )}
        </div>
      )}
      <div className="grid grid-2">
        <section className="tarjeta pila">
          <h2>Por cuenta</h2>
          {r.cuentas.size === 0 ? (
            <Vacio>Sin gastos en el periodo.</Vacio>
          ) : (
            <table>
              <tbody>
                {Object.keys(CUENTAS)
                  .filter((k) => r.cuentas.get(k))
                  .sort((a, b) => r.cuentas.get(b)! - r.cuentas.get(a)!)
                  .map((k) => (
                    <tr key={k}>
                      <td style={{ width: '40%' }}>{CUENTAS[k]}</td>
                      <td><div className="barra-h" style={{ width: `${(r.cuentas.get(k)! / max) * 100}%` }} /></td>
                      <td className="num" style={{ textAlign: 'right' }}>{dinero(r.cuentas.get(k))}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </section>
        {!activoId && (
          <section className="tarjeta pila">
            <h2>Por activo</h2>
            {verOperacion && <span className="sec chico">Costo de operación: todo lo gastado (con el desgaste medido de neumáticos) ÷ km u horas trabajados en el periodo.</span>}
            {r.porActivo.size === 0 ? (
              <Vacio>Sin gastos en el periodo.</Vacio>
            ) : (
              <table>
                {verOperacion && <thead><tr><th>Activo</th><th className="num">Gastado</th><th className="num">Costo de operación</th></tr></thead>}
                <tbody>
                  {[...r.porActivo.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([id, v]) => {
                    const a = e.datos.activos.find((x) => x.id === id)
                    return (
                      <tr key={id}>
                        <td>{a ? <Link to={`${base}/activos/${id}?p=costos`}>{a.codigo}</Link> : '—'}</td>
                        <td className="num" style={{ textAlign: 'right' }}>{dinero(v)}</td>
                        {verOperacion && (
                          <td className="num" style={{ textAlign: 'right' }}>
                            {r.operacion.get(id) ? `${dineroUnidad(r.operacion.get(id)!.porUnidad)} ${porUn(r.operacion.get(id)!.unidad)}` : <span className="sec chico">sin lecturas</span>}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </section>
        )}
      </div>
      <section className="tarjeta pila">
        <h2>Facturas y gastos</h2>
        {r.costos.length === 0 ? (
          <Vacio>Sin facturas en el periodo.</Vacio>
        ) : (
          <div className="tabla-wrap">
            <table>
              <thead>
                <tr><th>Fecha</th><th>Activo</th><th>Cuenta</th><th>Descripción</th><th>Monto</th><th /></tr>
              </thead>
              <tbody>
                {r.costos.map((c) => (
                  <tr key={c.id}>
                    <td>{fecha(c.fecha)}</td>
                    <td>{e.datos.activos.find((a) => a.id === c.activo_id)?.codigo ?? 'General'}</td>
                    <td>{etiqueta(CUENTAS, c.cuenta)}<div className="sec chico">{etiqueta(TIPOS_COSTO, c.tipo)}</div></td>
                    <td>{c.descripcion}<div className="sec chico">{[c.proveedor, c.factura && `Fact. ${c.factura}`].filter(Boolean).join(' · ')}</div></td>
                    <td className="num">{dinero(c.monto)}</td>
                    <td>{e.esAdminEmpresa && <button className="chico" onClick={() => confirm('¿Borrar este gasto?') && void e.borrar('costos', c.id)}>Borrar</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {nuevo && <FormCosto activoId={activoId || undefined} abierto onCerrar={() => setNuevo(false)} />}
    </div>
  )
}
