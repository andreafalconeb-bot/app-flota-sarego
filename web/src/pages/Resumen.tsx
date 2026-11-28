import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useEmpresa } from '../lib/empresa'
import { COMPONENTES, etiqueta } from '../lib/catalogos'
import { dinero, fecha, fechaHora, textoRestante } from '../lib/formato'
import { DIAS_LECTURA, estadoLectura, estadoPresion, estadoProfundidad, gastoPorCuenta, perdidaPorPresion, presionActual, profundidadIlogica, proximoCambio, type ProximoCambio } from '../lib/calculos'
import { nombrePosicion } from '../lib/ejes'
import { ultimasMediciones } from '../components/neumaticos'
import { Metrica, Pill, SoloPago, Vacio } from '../components/ui'
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
    const fechas = new Map(datos.inspecciones.map((i) => [i.id, i]))
    const profundidadAnterior = (neumaticoId: string | null, pos: string, activoId: string): number | null => {
      let mejor: { f: string; mm: number } | null = null
      for (const x of datos.inspeccionNeumaticos) {
        const i = fechas.get(x.inspeccion_id)
        if (!i || i.activo_id !== activoId || x.profundidad_min_mm == null || x.posicion !== pos || x.neumatico_id !== neumaticoId) continue
        if (!mejor || i.fecha > mejor.f) mejor = { f: i.fecha, mm: x.profundidad_min_mm }
      }
      return mejor?.mm ?? null
    }
    const lista: { activo: Activo; pos: string; texto: string; critico: boolean }[] = []
    for (const a of activos) {
      for (const [pos, m] of ultimasMediciones(a.id, datos)) {
        // Si la última inspección no midió la profundidad, vale la última medida de ese mismo neumático
        const mm = m.profundidad_min_mm ?? profundidadAnterior(m.neumatico_id, pos, a.id)
        const ep = estadoPresion(presionActual(m), m.presion_ideal_psi)
        const ed = estadoProfundidad(mm)
        // Solo lo que de verdad está mal: un dato que falta no es una alerta
        const mal = (x: string) => x === 'alerta' || x === 'critico'
        if (!mal(ep) && !mal(ed)) continue
        const partes = []
        if (ep === 'alerta' || ep === 'critico') partes.push(`${presionActual(m)} psi (ideal ${m.presion_ideal_psi})`)
        if (ed === 'alerta' || ed === 'critico') partes.push(`${mm} mm`)
        lista.push({ activo: a, pos, texto: partes.join(' · '), critico: ep === 'critico' || ed === 'critico' })
      }
    }
    // Alarma: profundidad mayor que la anterior (ilógica)
    for (const n of datos.neumaticos) {
      if (n.estado !== 'montado' || !n.activo_id) continue
      const x = profundidadIlogica(n, datos)
      const a = activos.find((y) => y.id === n.activo_id)
      if (!x || !a) continue
      const previo = lista.find((l) => l.activo.id === a.id && l.pos === n.posicion)
      const texto = `🚨 Profundidad ilógica: ${x.mm} mm > ${x.anterior} mm anterior`
      if (previo) {
        previo.texto = `${texto} · ${previo.texto}`
        previo.critico = true
      } else lista.push({ activo: a, pos: n.posicion!, texto, critico: true })
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

  // Dinero perdido por presión en los últimos 3 meses (curva TMC)
  const perdidaPresion = useMemo(() => {
    const d = new Date()
    d.setMonth(d.getMonth() - 3)
    return [...perdidaPorPresion(datos, d.toISOString().slice(0, 10), new Date().toISOString()).values()].reduce((t, p) => t + p.total, 0)
  }, [datos])

  const vencidos = servicios.filter((s) => s.p.estado === 'vencido').length
  // Alarmas solo en la versión pago (Andrea, 23/nov/2026)
  const alarmas = e.tiene('alarmas')

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
        {alarmas && (
          <>
            <Metrica valor={vencidos} etiqueta="Cambios de aceite vencidos" tono={vencidos ? 'critico' : undefined} />
            <Metrica valor={servicios.length - vencidos} etiqueta="Cambios próximos" tono={servicios.length - vencidos ? 'alerta' : undefined} />
            <Metrica valor={llantas.length} etiqueta="Neumáticos con alerta" tono={llantas.some((l) => l.critico) ? 'critico' : llantas.length ? 'alerta' : undefined} />
          </>
        )}
        {!e.reportesBloqueados && <Metrica valor={dinero(gastoMes)} etiqueta="Gasto del mes (servicios, facturas y combustible)" />}
        {!e.reportesBloqueados && perdidaPresion > 0 && (
          <Link to={`${base}/costos`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <Metrica valor={dinero(perdidaPresion)} etiqueta="Perdido por presión fuera de la ideal (últimos 3 meses)" tono="alerta" />
          </Link>
        )}
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

      {!alarmas && activos.length > 0 && (
        <SoloPago que="El aviso automático de cambios de aceite vencidos o próximos y de neumáticos con alerta" />
      )}

      {alarmas && <div className="grid grid-2">
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
      </div>}

      {activos.length > 0 && (
        <section className="tarjeta pila">
          <h2>Lecturas semanales</h2>
          <span className="sec chico">Cada activo pide odómetro u horómetro cada {DIAS_LECTURA} días. Los que están en inactividad no la piden.</span>
          {(() => {
            const estados = activos.map((a) => ({ a, l: estadoLectura(a) }))
            const pendientes = estados.filter((x) => x.l.estado === 'pendiente').sort((x, y) => (y.l.dias ?? 1e9) - (x.l.dias ?? 1e9))
            const parados = estados.filter((x) => x.l.estado === 'inactivo')
            const alDia = estados.filter((x) => x.l.estado === 'al_dia').length
            const total = alDia + pendientes.length
            return (
              <>
                {total > 0 && (
                  <div className="barra-lecturas" title={`${alDia} al día de ${total}`}>
                    <div style={{ width: `${(alDia / total) * 100}%` }} />
                    <span>{alDia} de {total} al día</span>
                  </div>
                )}
                {pendientes.length ? (
                  <div className="fila">
                    {pendientes.map(({ a, l }) => (
                      <Link key={a.id} to={`${base}/activos/${a.id}`} className="pill alerta">
                        {a.codigo} · {l.dias == null ? 'nunca' : `hace ${l.dias} días`}
                      </Link>
                    ))}
                  </div>
                ) : (
                  <span className="chico">Todos al día.</span>
                )}
                {parados.length > 0 && (
                  <div className="pila" style={{ gap: 4 }}>
                    <span className="sec chico">En inactividad (solo vencen sus fluidos por tiempo):</span>
                    <div className="fila">
                      {parados.map(({ a }) => (
                        <Link key={a.id} to={`${base}/activos/${a.id}`} className="pill inactivo">
                          {a.codigo} · desde {a.inactivo_desde ? fecha(a.inactivo_desde) : '—'}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )
          })()}
        </section>
      )}
    </div>
  )
}
