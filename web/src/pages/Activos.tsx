import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEmpresa } from '../lib/empresa'
import { COMPONENTES, GRUPOS_TIPO, TIPOS, etiqueta } from '../lib/catalogos'
import { fecha, numero, textoRestante } from '../lib/formato'
import { estadoLectura, proximoCambio, type EstadoServicio } from '../lib/calculos'
import { FormActivo } from '../components/formularios'
import { Pill, Vacio } from '../components/ui'
import { SEMAFORO, peorAnalisis } from '../components/analisis'

const ORDEN: EstadoServicio[] = ['vencido', 'proximo', 'ok', 'sin_datos']

export default function Activos() {
  const e = useEmpresa()
  const navegar = useNavigate()
  const [texto, setTexto] = useState('')
  const [tipo, setTipo] = useState('')
  const [inactivos, setInactivos] = useState(false)
  const [nuevo, setNuevo] = useState(false)

  const filas = useMemo(() => {
    const t = texto.trim().toLowerCase()
    return e.datos.activos
      .filter((a) => (inactivos || a.activo) && (!tipo || a.tipo === tipo))
      .filter((a) => !t || [a.codigo, a.placa, a.marca, a.modelo, a.serial].some((x) => (x ?? '').toLowerCase().includes(t)))
      .map((a) => {
        const comps = e.datos.compartimientos.filter((c) => c.activo_id === a.id).map((c) => ({ c, p: proximoCambio(c, a, e.datos.servicios) }))
        const peor = ORDEN.find((o) => comps.some((x) => x.p.estado === o)) ?? 'sin_datos'
        // Cuáles compartimientos y por qué (Andrea: "¿cuál fluido está vencido? ¿en base a qué?")
        const cuales = comps.filter((x) => x.p.estado === peor && (peor === 'vencido' || peor === 'proximo')).map(({ c, p }) => {
          const nombre = etiqueta(COMPONENTES, c.componente)
          const motivo = p.restante != null && (p.diasRestantes == null || p.restante <= 0 || p.restante <= (p.intervalo ?? 0) * 0.1)
            ? textoRestante(p.restante, p.unidad)
            : p.diasRestantes != null
              ? p.diasRestantes <= 0 ? `vencido por fecha (${fecha(p.venceFecha)})` : `vence el ${fecha(p.venceFecha)}`
              : ''
          return { nombre, motivo, ayuda: `${nombre}: último cambio ${p.ultimo ? fecha(p.ultimo.fecha) : '—'}${p.vence != null ? `, toca a los ${numero(p.vence)} ${p.unidad === 'km' ? 'km' : 'h'}` : ''}${p.venceFecha ? ` o el ${fecha(p.venceFecha)}` : ''}; ${motivo}` }
        })
        return { a, peor, cuales }
      })
      .sort((x, y) => x.a.codigo.localeCompare(y.a.codigo, 'es', { numeric: true }))
  }, [e.datos, texto, tipo, inactivos])

  const activos = e.datos.activos.filter((a) => a.activo).length
  const alarmas = e.tiene('alarmas')
  const tiposUsados = new Set(e.datos.activos.map((a) => a.tipo))

  return (
    <div className="pila" style={{ gap: 14 }}>
      <div className="titulo-pagina">
        <div>
          <h1>Activos</h1>
          <div className="sec chico">
            {activos} activos{e.empresa!.plan === 'gratis' ? ` de ${e.empresa!.max_activos} de la versión gratis` : ''}
          </div>
        </div>
        {e.puedeEscribir && <button className="primario" onClick={() => setNuevo(true)}>+ Nuevo activo</button>}
      </div>
      <div className="fila">
        <input placeholder="Buscar por unidad, placa, marca…" value={texto} onChange={(x) => setTexto(x.target.value)} style={{ maxWidth: 300 }} />
        <select value={tipo} onChange={(x) => setTipo(x.target.value)} style={{ maxWidth: 220 }}>
          <option value="">Todos los tipos</option>
          {GRUPOS_TIPO.map((g) => (
            <optgroup key={g.grupo} label={g.grupo}>
              {Object.entries(g.tipos).filter(([k]) => tiposUsados.has(k)).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </optgroup>
          ))}
        </select>
        <label className="check chico"><input type="checkbox" checked={inactivos} onChange={(x) => setInactivos(x.target.checked)} /> Ver dados de baja</label>
      </div>
      {filas.length === 0 ? (
        <Vacio>{e.datos.activos.length ? 'Ningún activo coincide con la búsqueda.' : 'Todavía no hay activos cargados.'}</Vacio>
      ) : (
        <div className="tarjeta tabla-wrap" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr><th>Unidad</th><th>Tipo</th><th>Marca y modelo</th><th>Lectura</th><th>Aceite</th></tr>
            </thead>
            <tbody>
              {filas.map(({ a, peor, cuales }) => (
                <tr key={a.id} className="clic" onClick={() => navegar(a.id)}>
                  <td>
                    <b>{a.codigo}</b> {!a.activo && <Pill>De baja</Pill>}
                    {a.activo && a.en_inactividad && <span className="pill inactivo" title={a.inactividad_motivo ?? ''}>En inactividad</span>}
                    <div className="sec chico">{a.placa ?? ''}</div>
                  </td>
                  <td>{etiqueta(TIPOS, a.tipo)}</td>
                  <td>{[a.marca, a.modelo, a.anio].filter(Boolean).join(' ') || '—'}</td>
                  <td className="num">
                    {a.medidor !== 'horas' && a.km_actual != null && <div>{numero(a.km_actual)} km</div>}
                    {a.medidor !== 'km' && a.horas_actual != null && <div>{numero(a.horas_actual)} h</div>}
                    {(() => {
                      const l = estadoLectura(a)
                      if (l.estado === 'pendiente') return <Pill tono="alerta">{l.dias == null ? 'Lectura pendiente' : `Lectura pendiente · hace ${l.dias} d`}</Pill>
                      if (l.estado === 'inactivo') return <div className="sec chico">Parado · no pide lectura</div>
                      return <div className="sec chico">{a.lectura_at ? fecha(a.lectura_at) : 'sin lectura'}</div>
                    })()}
                  </td>
                  <td>
                    {!alarmas && peor !== 'sin_datos' && <span className="sec chico">Ver en la ficha</span>}
                    {alarmas && (peor === 'vencido' || peor === 'proximo') && (
                      <div title={cuales.map((x) => x.ayuda).join('\n')}>
                        <Pill tono={peor === 'vencido' ? 'critico' : 'alerta'}>{peor === 'vencido' ? 'Cambio vencido' : 'Cambio próximo'}</Pill>
                        {cuales.map((x) => (
                          <div key={x.nombre} className="chico">{x.nombre}{x.motivo ? <span className="sec"> · {x.motivo}</span> : null}</div>
                        ))}
                      </div>
                    )}
                    {alarmas && peor === 'ok' && <Pill tono="ok">Al día</Pill>}
                    {peor === 'sin_datos' && <span className="sec chico">Sin intervalo</span>}
                    {(() => {
                      const pa = peorAnalisis(e.datos.analisis ?? [], a.id)
                      if (pa !== 'critico' && pa !== 'precaucion') return null
                      return (
                        <div style={{ marginTop: 4 }}>
                          <Pill tono={SEMAFORO[pa].tono}>Análisis de aceite: {SEMAFORO[pa].texto.toLowerCase()}</Pill>
                        </div>
                      )
                    })()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {nuevo && <FormActivo abierto onCerrar={() => setNuevo(false)} onCreado={(id) => navegar(id)} />}
    </div>
  )
}
