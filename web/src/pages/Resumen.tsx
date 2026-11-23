import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useEmpresa } from '../lib/empresa'
import { COMPONENTES, TIPOS, etiqueta } from '../lib/catalogos'
import { dinero, fecha, fechaHora, textoRestante } from '../lib/formato'
import { estadoPresion, estadoProfundidad, gastoPorCuenta, proximoCambio, type ProximoCambio } from '../lib/calculos'
import { nombrePosicion } from '../lib/ejes'
import { ultimasMediciones } from '../components/neumaticos'
import { Metrica, Pill, Vacio } from '../components/ui'
import type { Activo, Compartimiento } from '../lib/tipos'

export default function Resumen() {
  const e = useEmpresa()
  const { datos } = e
  const base = `/e/${e.empresa!.id}`
  const activos = datos.activos.filter((a) => a.activo)

  const servicios = useMemo(() => {
    const lista: { activo: Activo; comp: Compartimiento; p: ProximoCambio }[] = []
    for (const a of activos) {
      for (const c of datos.compartimientos.filter((x) => x.activo_id === a.id)) {
        const p = proximoCambio(c, a, datos.servicios)
        if (p.estado === 'vencido' || p.estado === 'proximo') lista.push({ activo: a, comp: c, p })
      }
    }
    return lista.sort((x, y) => (x.p.estado === y.p.estado ? (x.p.restante ?? 0) - (y.p.restante ?? 0) : x.p.estado === 'vencido' ? -1 : 1))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datos])

  const llantas = useMemo(() => {
    const lista: { activo: Activo; pos: string; texto: string; critico: boolean }[] = []
    for (const a of activos) {
      for (const [pos, m] of ultimasMediciones(a.id, datos)) {
        const ep = estadoPresion(m.presion_psi, m.presion_ideal_psi)
        const ed = estadoProfundidad(m.profundidad_min_mm)
        if (ep === 'ok' && ed === 'ok') continue
        if (ep === 'sin_dato' && ed === 'sin_dato') continue
        const partes = []
        if (ep === 'alerta' || ep === 'critico') partes.push(`${m.presion_psi} psi (ideal ${m.presion_ideal_psi})`)
        if (ed === 'alerta' || ed === 'critico') partes.push(`${m.profundidad_min_mm} mm`)
        lista.push({ activo: a, pos, texto: partes.join(' · '), critico: ep === 'critico' || ed === 'critico' })
      }
    }
    return lista.sort((x, y) => Number(y.critico) - Number(x.critico))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datos])

  const gastoMes = useMemo(() => {
    const desde = new Date()
    desde.setDate(1)
    const d = desde.toISOString().slice(0, 10)
    const total = [...gastoPorCuenta(datos.costos.filter((c) => c.fecha >= d), datos.servicios.filter((s) => s.fecha >= d), datos.compartimientos).values()].reduce((t, v) => t + v, 0)
    const comb = datos.combustible.filter((c) => c.fecha.slice(0, 10) >= d).reduce((t, c) => t + (c.costo_total ?? 0), 0)
    return total + comb
  }, [datos])

  const vencidos = servicios.filter((s) => s.p.estado === 'vencido').length

  return (
    <div className="pila" style={{ gap: 16 }}>
      <div className="titulo-pagina">
        <div>
          <h1>Inicio</h1>
          <div className="sec chico">
            {e.empresa!.plan === 'pago' ? 'Versión completa' : `Versión gratis · hasta ${e.empresa!.max_activos} activos`} · Última sincronización:{' '}
            {e.ultimaSync ? fechaHora(e.ultimaSync) : 'nunca'}
          </div>
        </div>
        <Link to={`${base}/activos`} className="boton primario">Ver activos</Link>
      </div>

      <div className="grid grid-4">
        <Metrica valor={activos.length} etiqueta="Activos" />
        <Metrica valor={vencidos} etiqueta="Cambios de aceite vencidos" tono={vencidos ? 'critico' : undefined} />
        <Metrica valor={servicios.length - vencidos} etiqueta="Cambios próximos" tono={servicios.length - vencidos ? 'alerta' : undefined} />
        <Metrica valor={llantas.length} etiqueta="Neumáticos con alerta" tono={llantas.some((l) => l.critico) ? 'critico' : llantas.length ? 'alerta' : undefined} />
        {!e.reportesBloqueados && <Metrica valor={dinero(gastoMes)} etiqueta="Gasto del mes (servicios, facturas y combustible)" />}
      </div>

      {activos.length === 0 && (
        <div className="tarjeta pila">
          <b>Empieza por cargar los activos</b>
          <span className="sec chico">
            Cada vehículo o equipo con su número de unidad, su lectura de odómetro u horómetro y los compartimientos de
            aceite que quieres controlar.
          </span>
          <div><Link to={`${base}/activos`} className="boton primario">Cargar el primer activo</Link></div>
        </div>
      )}

      {e.rechazos.length > 0 && (
        <div className="tarjeta pila">
          <div className="fila-entre">
            <b>Cambios que la nube no aceptó</b>
            <button className="chico" onClick={() => void e.limpiarRechazos()}>Ocultar</button>
          </div>
          <span className="sec chico">Se hicieron en este equipo pero no quedaron guardados. Revísalos y vuelve a cargarlos.</span>
          <ul style={{ margin: 0, paddingLeft: 18 }} className="chico">
            {e.rechazos.map((r) => (
              <li key={r.id + r.at}>
                {fechaHora(r.at)} · {r.coleccion}: {r.error}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-2">
        <section className="tarjeta pila">
          <h2>Cambios de aceite</h2>
          {servicios.length === 0 ? (
            <Vacio>Nada vencido ni próximo. {datos.compartimientos.some((c) => c.intervalo_km || c.intervalo_horas || c.intervalo_dias) ? '' : 'Carga los intervalos de cada compartimiento para recibir avisos.'}</Vacio>
          ) : (
            <table>
              <tbody>
                {servicios.slice(0, 12).map(({ activo, comp, p }) => (
                  <tr key={comp.id}>
                    <td>
                      <Link to={`${base}/activos/${activo.id}`}><b>{activo.codigo}</b></Link>
                      <div className="sec chico">{etiqueta(COMPONENTES, comp.componente)}</div>
                    </td>
                    <td className="num chico">
                      {p.restante != null && textoRestante(p.restante, p.unidad)}
                      {p.venceFecha && <div className="sec">vence {fecha(p.venceFecha)}</div>}
                    </td>
                    <td>{p.estado === 'vencido' ? <Pill tono="critico">Vencido</Pill> : <Pill tono="alerta">Próximo</Pill>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
        <section className="tarjeta pila">
          <h2>Neumáticos</h2>
          {llantas.length === 0 ? (
            <Vacio>Sin alertas en la última inspección de cada activo.</Vacio>
          ) : (
            <table>
              <tbody>
                {llantas.slice(0, 12).map((l) => (
                  <tr key={l.activo.id + l.pos}>
                    <td>
                      <Link to={`${base}/activos/${l.activo.id}?p=neumaticos`}><b>{l.activo.codigo}</b></Link>
                      <div className="sec chico">{nombrePosicion(l.pos)}</div>
                    </td>
                    <td className="chico">{l.texto}</td>
                    <td>{l.critico ? <Pill tono="critico">Crítico</Pill> : <Pill tono="alerta">Revisar</Pill>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      {activos.length > 0 && (
        <section className="tarjeta pila">
          <h2>Lecturas</h2>
          <span className="sec chico">Activos sin lectura en más de 15 días.</span>
          {(() => {
            const viejos = activos.filter((a) => !a.lectura_at || Date.now() - new Date(a.lectura_at).getTime() > 15 * 86_400_000)
            return viejos.length ? (
              <div className="fila">
                {viejos.map((a) => (
                  <Link key={a.id} to={`${base}/activos/${a.id}`} className="pill acento">{a.codigo} · {etiqueta(TIPOS, a.tipo)}</Link>
                ))}
              </div>
            ) : (
              <span className="chico">Todos al día.</span>
            )
          })()}
        </section>
      )}
    </div>
  )
}
