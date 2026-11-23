import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useSesion } from '../lib/sesion'
import type { EmpresaEstado } from '../lib/tipos'
import { ROLES, SUCURSALES, etiqueta } from '../lib/catalogos'
import { fechaHora } from '../lib/formato'
import { Campo, Cargando, ErrorMsg, Modal, Pill, Selector, Vacio, mensajeError, useCarga } from '../components/ui'

interface PersonaSarego {
  user_id: string
  nombre: string
}

/** Inicio: el personal de SAREGO ve todas las empresas; un cliente con varias elige una. */
export default function Empresas() {
  const { yo, salir } = useSesion()
  return (
    <>
      <header className="cabecera">
        <span className="logo">
          <img src="/favicon.svg" alt="" width={26} height={26} /> Flota SAREGO
        </span>
        <div style={{ flex: 1 }} />
        <div className="usuario">
          <span className="ocultar-movil">{yo?.nombre}{yo?.esSarego ? ' · SAREGO' : ''}</span>
          <button className="chico" onClick={() => void salir()}>Salir</button>
        </div>
      </header>
      <main className="contenido">{yo?.esSarego ? <ListaSarego /> : <ElegirEmpresa />}</main>
    </>
  )
}

function ElegirEmpresa() {
  const { yo } = useSesion()
  return (
    <div className="pila" style={{ maxWidth: 520 }}>
      <h1>Elige la empresa</h1>
      {yo!.membresias.map((m) => (
        <Link key={m.empresa_id} to={`/e/${m.empresa_id}`} className="ficha">
          <div className="nom">{m.empresa_nombre}</div>
          <div className="sec chico">{ROLES[m.rol]}</div>
        </Link>
      ))}
    </div>
  )
}

function ListaSarego() {
  const { yo } = useSesion()
  const navegar = useNavigate()
  const [filtro, setFiltro] = useState('')
  const [nueva, setNueva] = useState(false)
  const { datos, error, cargando, recargar } = useCarga(async () => {
    const [e, p] = await Promise.all([
      supabase.from('flota_empresas_estado').select('*').order('nombre'),
      supabase.rpc('b2b_listar_usuarios'),
    ])
    if (e.error) throw new Error(e.error.message)
    return { empresas: (e.data ?? []) as EmpresaEstado[], personas: (p.data ?? []) as PersonaSarego[] }
  }, [])

  const lista = useMemo(() => {
    const t = filtro.trim().toLowerCase()
    return (datos?.empresas ?? []).filter((e) => !t || e.nombre.toLowerCase().includes(t) || (e.rif ?? '').toLowerCase().includes(t))
  }, [datos, filtro])

  const nombre = (id: string | null) => datos?.personas.find((p) => p.user_id === id)?.nombre ?? '—'
  const alertas = (datos?.empresas ?? []).filter((e) => e.estado_sincronizacion !== 'ok')

  return (
    <div className="pila" style={{ gap: 16 }}>
      <div className="titulo-pagina">
        <div>
          <h1>Empresas cliente</h1>
          <div className="sec chico">Todas las flotas que usan la app. SAREGO ve y puede cargar en todas.</div>
        </div>
        <button className="primario" onClick={() => setNueva(true)}>+ Nueva empresa</button>
      </div>
      <ErrorMsg error={error} />
      {alertas.length > 0 && (
        <div className="aviso alerta">
          <b>Sin sincronizar:</b>{' '}
          {alertas.map((e) => `${e.nombre} (${e.dias_sin_sincronizar} días${e.estado_sincronizacion === 'bloqueada' ? ', trancada' : ''})`).join(' · ')}
        </div>
      )}
      <input placeholder="Buscar por nombre o RIF" value={filtro} onChange={(e) => setFiltro(e.target.value)} style={{ maxWidth: 360 }} />
      {cargando ? (
        <Cargando />
      ) : lista.length === 0 ? (
        <Vacio>Todavía no hay empresas. Crea la primera con “Nueva empresa”.</Vacio>
      ) : (
        <div className="tarjeta tabla-wrap" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Empresa</th>
                <th>Versión</th>
                <th>Activos</th>
                <th>Usuarios</th>
                <th>Última sincronización</th>
                <th>Ingeniero</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((e) => (
                <tr key={e.id} className="clic" onClick={() => navegar(`/e/${e.id}`)}>
                  <td>
                    <b>{e.nombre}</b>
                    <div className="sec chico">{e.rif ?? ''} {e.sucursal ? '· ' + etiqueta(SUCURSALES, e.sucursal) : ''}</div>
                  </td>
                  <td>{e.plan === 'pago' ? <Pill tono="ok">Completa</Pill> : <Pill>Gratis</Pill>} {!e.activa && <Pill tono="critico">Inactiva</Pill>}</td>
                  <td className="num">{e.activos}{e.plan === 'gratis' ? ` / ${e.max_activos}` : ''}</td>
                  <td className="num">{e.usuarios}</td>
                  <td>
                    {e.ultima_sincronizacion_at ? fechaHora(e.ultima_sincronizacion_at) : <span className="sec">Nunca</span>}{' '}
                    {e.estado_sincronizacion === 'aviso' && <Pill tono="alerta">Por trancarse</Pill>}
                    {e.estado_sincronizacion === 'bloqueada' && <Pill tono="critico">Trancada</Pill>}
                  </td>
                  <td>{nombre(e.ingeniero_id)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <NuevaEmpresa
        abierto={nueva}
        yoId={yo!.id}
        personas={datos?.personas ?? []}
        onCerrar={() => setNueva(false)}
        onCreada={(id) => {
          void recargar()
          navegar(`/e/${id}/usuarios`)
        }}
      />
    </div>
  )
}

function NuevaEmpresa({ abierto, yoId, personas, onCerrar, onCreada }: {
  abierto: boolean
  yoId: string
  personas: PersonaSarego[]
  onCerrar: () => void
  onCreada: (id: string) => void
}) {
  const [f, setF] = useState({ nombre: '', rif: '', telefono: '', direccion: '', sucursal: '01', ingeniero_id: yoId })
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const crear = async () => {
    if (!f.nombre.trim()) return setError('Falta el nombre.')
    setEnviando(true)
    setError(null)
    try {
      const id = crypto.randomUUID()
      const { error } = await supabase.from('flota_empresas').insert({
        id,
        nombre: f.nombre.trim(),
        rif: f.rif.trim() || null,
        telefono: f.telefono.trim() || null,
        direccion: f.direccion.trim() || null,
        sucursal: f.sucursal,
        ingeniero_id: f.ingeniero_id || null,
      })
      if (error) throw new Error(error.message)
      onCerrar()
      onCreada(id)
    } catch (e) {
      setError(mensajeError(e))
    } finally {
      setEnviando(false)
    }
  }
  return (
    <Modal
      abierto={abierto}
      titulo="Nueva empresa cliente"
      onCerrar={onCerrar}
      pie={
        <>
          <button onClick={onCerrar}>Cancelar</button>
          <button className="primario" disabled={enviando} onClick={() => void crear()}>Crear y agregar usuarios</button>
        </>
      }
    >
      <Campo etiqueta="Nombre de la empresa">
        <input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
      </Campo>
      <div className="grid grid-2">
        <Campo etiqueta="RIF">
          <input value={f.rif} onChange={(e) => setF({ ...f, rif: e.target.value })} />
        </Campo>
        <Campo etiqueta="Teléfono">
          <input value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} />
        </Campo>
        <Campo etiqueta="Sucursal SAREGO">
          <Selector valor={f.sucursal} onCambio={(v) => setF({ ...f, sucursal: v })} opciones={SUCURSALES} />
        </Campo>
        <Campo etiqueta="Ingeniero responsable">
          <Selector
            valor={f.ingeniero_id}
            onCambio={(v) => setF({ ...f, ingeniero_id: v })}
            opciones={Object.fromEntries(personas.map((p) => [p.user_id, p.nombre]))}
            vacio="Sin asignar"
          />
        </Campo>
      </div>
      <Campo etiqueta="Dirección">
        <input value={f.direccion} onChange={(e) => setF({ ...f, direccion: e.target.value })} />
      </Campo>
      <p className="sec chico" style={{ margin: 0 }}>
        Empieza en la versión gratis (hasta 10 activos). La gerencia B2B la pasa a la versión completa desde “Empresa”.
      </p>
      <ErrorMsg error={error} />
    </Modal>
  )
}
