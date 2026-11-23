import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useEmpresa } from '../lib/empresa'
import { ESTADOS_NEUMATICO, etiqueta } from '../lib/catalogos'
import { dinero, fecha } from '../lib/formato'
import { nombrePosicion } from '../lib/ejes'
import { estadoProfundidad } from '../lib/calculos'
import { FormNeumatico } from '../components/formularios'
import { Pill, Vacio } from '../components/ui'
import type { Neumatico } from '../lib/tipos'

export default function Neumaticos() {
  const e = useEmpresa()
  const [estado, setEstado] = useState('')
  const [texto, setTexto] = useState('')
  const [editar, setEditar] = useState<Neumatico | 'nuevo' | null>(null)
  const base = `/e/${e.empresa!.id}`

  // Última profundidad medida de cada neumático
  const profundidad = useMemo(() => {
    const fechaInsp = new Map(e.datos.inspecciones.map((i) => [i.id, i.fecha]))
    const m = new Map<string, { mm: number | null; fecha: string }>()
    for (const x of e.datos.inspeccionNeumaticos) {
      if (!x.neumatico_id) continue
      const f = fechaInsp.get(x.inspeccion_id) ?? ''
      const prev = m.get(x.neumatico_id)
      if (!prev || f > prev.fecha) m.set(x.neumatico_id, { mm: x.profundidad_min_mm, fecha: f })
    }
    return m
  }, [e.datos.inspecciones, e.datos.inspeccionNeumaticos])

  const lista = e.datos.neumaticos
    .filter((n) => (!estado ? n.estado !== 'desecho' : n.estado === estado))
    .filter((n) => !texto || [n.marca_fuego, n.marca, n.medida, n.dot].some((x) => (x ?? '').toLowerCase().includes(texto.toLowerCase())))
    .sort((a, b) => a.marca_fuego.localeCompare(b.marca_fuego, 'es', { numeric: true }))
  const cuenta = (s: string) => e.datos.neumaticos.filter((n) => n.estado === s).length

  return (
    <div className="pila" style={{ gap: 14 }}>
      <div className="titulo-pagina">
        <div>
          <h1>Neumáticos</h1>
          <div className="sec chico">
            {cuenta('montado')} montados · {cuenta('inventario')} en inventario · {cuenta('reparacion')} en reparación
          </div>
        </div>
        {e.puedeEscribir && <button className="primario" onClick={() => setEditar('nuevo')}>+ Nuevo neumático</button>}
      </div>
      <div className="fila">
        <input placeholder="Marca a fuego, marca, medida o DOT" value={texto} onChange={(x) => setTexto(x.target.value)} style={{ maxWidth: 300 }} />
        <select value={estado} onChange={(x) => setEstado(x.target.value)} style={{ maxWidth: 200 }}>
          <option value="">Todos menos desechados</option>
          {Object.entries(ESTADOS_NEUMATICO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <p className="sec chico" style={{ margin: 0 }}>Para montar, rotar o inspeccionar, entra al activo y abre la pestaña Neumáticos.</p>
      {lista.length === 0 ? (
        <Vacio>{e.datos.neumaticos.length ? 'Ninguno coincide.' : 'Registra los neumáticos con su marca a fuego para seguirlos por posición.'}</Vacio>
      ) : (
        <div className="tarjeta tabla-wrap" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr><th>Marca a fuego</th><th>Neumático</th><th>Estado</th><th>Última profundidad</th>{!e.reportesBloqueados && <th>Costo</th>}</tr>
            </thead>
            <tbody>
              {lista.map((n) => {
                const a = e.datos.activos.find((x) => x.id === n.activo_id)
                const p = profundidad.get(n.id)
                const ep = estadoProfundidad(p?.mm ?? null)
                return (
                  <tr key={n.id} className="clic" onClick={() => e.puedeEscribir && setEditar(n)}>
                    <td><b className="mono">{n.marca_fuego}</b><div className="sec chico">DOT {n.dot ?? '—'}</div></td>
                    <td>{[n.marca, n.modelo].filter(Boolean).join(' ') || '—'}<div className="sec chico">{n.medida ?? ''}</div></td>
                    <td>
                      {n.estado === 'montado' && a ? (
                        <>
                          <Link to={`${base}/activos/${a.id}?p=neumaticos`} onClick={(x) => x.stopPropagation()}>{a.codigo}</Link>
                          <div className="sec chico">{nombrePosicion(n.posicion!)}</div>
                        </>
                      ) : (
                        etiqueta(ESTADOS_NEUMATICO, n.estado)
                      )}
                    </td>
                    <td>
                      {p?.mm != null ? (
                        <>
                          <Pill tono={ep === 'critico' ? 'critico' : ep === 'alerta' ? 'alerta' : 'ok'}>{p.mm} mm</Pill>
                          <div className="sec chico">{fecha(p.fecha)}{n.profundidad_inicial_mm ? ` · nuevo ${n.profundidad_inicial_mm} mm` : ''}</div>
                        </>
                      ) : (
                        <span className="sec chico">{n.profundidad_inicial_mm ? `nuevo ${n.profundidad_inicial_mm} mm` : '—'}</span>
                      )}
                    </td>
                    {!e.reportesBloqueados && <td className="num">{dinero(n.costo)}</td>}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {editar && <FormNeumatico neumatico={editar === 'nuevo' ? undefined : editar} abierto onCerrar={() => setEditar(null)} />}
    </div>
  )
}
