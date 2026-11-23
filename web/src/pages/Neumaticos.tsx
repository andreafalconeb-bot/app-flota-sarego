import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useEmpresa } from '../lib/empresa'
import { ESTADOS_NEUMATICO, etiqueta } from '../lib/catalogos'
import { dinero, fecha, serialNeumatico } from '../lib/formato'
import { nombrePosicion } from '../lib/ejes'
import { estadoProfundidad } from '../lib/calculos'
import { FormNeumatico } from '../components/formularios'
import { Pill, Vacio } from '../components/ui'
import { TarjetaFacturas } from '../components/facturas'
import { condiciones } from '../components/neumaticos'
import type { Neumatico } from '../lib/tipos'

export default function Neumaticos() {
  const e = useEmpresa()
  const [estado, setEstado] = useState('')
  const [texto, setTexto] = useState('')
  const [editar, setEditar] = useState<Neumatico | 'nuevo' | null>(null)
  const base = `/e/${e.empresa!.id}`

  // Nuevo o usado, con la última profundidad conocida (compra, desmontaje o inspección)
  const conds = useMemo(() => condiciones(e.datos), [e.datos])

  const lista = e.datos.neumaticos
    .filter((n) => (!estado ? n.estado !== 'desecho' : n.estado === estado))
    .filter((n) => !texto || [serialNeumatico(n), n.marca_fuego, n.marca, n.medida, n.dot].some((x) => (x ?? '').toLowerCase().includes(texto.toLowerCase())))
    .sort((a, b) => (a.numero ?? Infinity) - (b.numero ?? Infinity))
  const cuenta = (s: string) => e.datos.neumaticos.filter((n) => n.estado === s).length

  return (
    <div className="pila" style={{ gap: 14 }}>
      <div className="titulo-pagina">
        <div>
          <h1>Neumáticos</h1>
          <div className="sec chico">
            {cuenta('montado')} montados · {cuenta('inventario')} en inventario · {cuenta('reparacion')} en reparación
            {cuenta('por_recibir') > 0 && ` · ${cuenta('por_recibir')} facturados por recibir`}
          </div>
        </div>
        {e.puedeEscribir && <button className="primario" onClick={() => setEditar('nuevo')}>+ Nuevo neumático</button>}
      </div>
      <div className="fila">
        <input placeholder="Serial, marca a fuego, marca, medida o DOT" value={texto} onChange={(x) => setTexto(x.target.value)} style={{ maxWidth: 300 }} />
        <select value={estado} onChange={(x) => setEstado(x.target.value)} style={{ maxWidth: 200 }}>
          <option value="">Todos menos desechados</option>
          {Object.entries(ESTADOS_NEUMATICO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <TarjetaFacturas />
      <p className="sec chico" style={{ margin: 0 }}>Para montar, rotar o inspeccionar, entra al activo y abre la pestaña Neumáticos.</p>
      {lista.length === 0 ? (
        <Vacio>{e.datos.neumaticos.length ? 'Ninguno coincide.' : 'Registra los neumáticos para seguirlos por posición. Cada uno lleva su serial; la marca a fuego es opcional.'}</Vacio>
      ) : (
        <div className="tarjeta tabla-wrap" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr><th>Serial</th><th>Marca a fuego / DOT</th><th>Neumático</th><th>Estado</th><th>Última profundidad</th>{!e.reportesBloqueados && <th>Costo</th>}</tr>
            </thead>
            <tbody>
              {lista.map((n) => {
                const a = e.datos.activos.find((x) => x.id === n.activo_id)
                const c = conds.get(n.id)!
                const ep = estadoProfundidad(c.mm)
                return (
                  <tr key={n.id} className="clic" onClick={() => e.puedeEscribir && setEditar(n)}>
                    <td className="mono chico">{serialNeumatico(n)}</td>
                    <td><b className="mono">{n.marca_fuego ?? '—'}</b><div className="sec chico">DOT {n.dot ?? '—'}</div></td>
                    <td>{[n.marca, n.modelo].filter(Boolean).join(' ') || '—'}<div className="sec chico">{n.medida ?? ''}</div></td>
                    <td>
                      {n.estado === 'montado' && a ? (
                        <>
                          <Link to={`${base}/activos/${a.id}?p=neumaticos`} onClick={(x) => x.stopPropagation()}>{a.codigo}</Link>
                          <div className="sec chico">{nombrePosicion(n.posicion!)}</div>
                        </>
                      ) : (
                        <>
                          {n.estado === 'por_recibir' ? <Pill tono="alerta">{etiqueta(ESTADOS_NEUMATICO, n.estado)}</Pill> : etiqueta(ESTADOS_NEUMATICO, n.estado)}
                          {n.estado === 'inventario' && <div>{c.nuevo ? <Pill tono="ok">Nuevo</Pill> : <Pill>Usado</Pill>}</div>}
                        </>
                      )}
                    </td>
                    <td>
                      {c.mm != null ? (
                        <>
                          <Pill tono={ep === 'critico' ? 'critico' : ep === 'alerta' ? 'alerta' : 'ok'}>{c.mm} mm</Pill>
                          <div className="sec chico">
                            {c.origen === 'compra' ? 'de compra' : `${c.origen === 'inspeccion' ? 'inspección' : 'medida'} ${fecha(c.fecha!.slice(0, 10))}`}
                            {c.origen !== 'compra' && n.profundidad_inicial_mm ? ` · nuevo ${n.profundidad_inicial_mm} mm` : ''}
                          </div>
                        </>
                      ) : (
                        <span className="sec chico">—</span>
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
