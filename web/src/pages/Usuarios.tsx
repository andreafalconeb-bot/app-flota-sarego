import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useEmpresa } from '../lib/empresa'
import { useSesion } from '../lib/sesion'
import { ROLES } from '../lib/catalogos'
import { fecha } from '../lib/formato'
import type { UsuarioEmpresa } from '../lib/tipos'
import { Campo, Cargando, ErrorMsg, Modal, Pill, Selector, Vacio, mensajeError, useCarga } from '../components/ui'

const AYUDA_ROLES = 'Administrador: carga, borra e invita. Operador: carga datos. Solo consulta: mira.'

export default function Usuarios() {
  const e = useEmpresa()
  const { yo } = useSesion()
  const empresaId = e.empresa!.id
  const [invitar, setInvitar] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { datos, cargando, error: errorCarga, recargar } = useCarga(async () => {
    const { data, error } = await supabase.rpc('flota_listar_usuarios', { p_empresa: empresaId })
    if (error) throw new Error(error.message)
    return (data ?? []) as UsuarioEmpresa[]
  }, [empresaId])

  if (!e.esAdminEmpresa) return <Vacio>Solo el administrador de la empresa ve esta sección.</Vacio>
  if (!e.online) return <div className="aviso alerta">Los usuarios se administran con internet.</div>

  const cambiar = async (u: UsuarioEmpresa, cambios: Partial<Pick<UsuarioEmpresa, 'rol' | 'activo'>>) => {
    setError(null)
    const { error } = await supabase.from('flota_usuarios').update(cambios).eq('empresa_id', empresaId).eq('user_id', u.user_id)
    if (error) setError(error.message)
    await recargar()
  }

  return (
    <div className="pila" style={{ gap: 14 }}>
      <div className="titulo-pagina">
        <div>
          <h1>Usuarios</h1>
          <div className="sec chico">{AYUDA_ROLES}</div>
        </div>
        <button className="primario" onClick={() => setInvitar(true)}>+ Invitar usuario</button>
      </div>
      <ErrorMsg error={errorCarga ?? error} />
      {cargando ? (
        <Cargando />
      ) : !datos?.length ? (
        <Vacio>Todavía no hay usuarios. Invita al responsable de la flota como administrador.</Vacio>
      ) : (
        <div className="tarjeta tabla-wrap" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr><th>Nombre</th><th>Rol</th><th>Términos</th><th /></tr>
            </thead>
            <tbody>
              {datos.map((u) => {
                const soyYo = u.user_id === yo?.id
                return (
                  <tr key={u.user_id}>
                    <td>
                      <b>{u.nombre}</b> {!u.activo && <Pill tono="critico">Sin acceso</Pill>}
                      <div className="sec chico">{u.email}</div>
                    </td>
                    <td style={{ minWidth: 160 }}>
                      {soyYo ? ROLES[u.rol] : <Selector valor={u.rol} onCambio={(v) => void cambiar(u, { rol: v as UsuarioEmpresa['rol'] })} opciones={ROLES} />}
                    </td>
                    <td className="chico">{u.terminos_aceptados_at ? `Aceptó el ${fecha(u.terminos_aceptados_at)}` : <span className="sec">Todavía no entra</span>}</td>
                    <td>
                      {!soyYo && (
                        <button className="chico" onClick={() => void cambiar(u, { activo: !u.activo })}>{u.activo ? 'Quitar acceso' : 'Devolver acceso'}</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {invitar && <Invitar empresaId={empresaId} onCerrar={() => setInvitar(false)} onListo={() => void recargar()} />}
    </div>
  )
}

function Invitar({ empresaId, onCerrar, onListo }: { empresaId: string; onCerrar: () => void; onListo: () => void }) {
  const [f, setF] = useState({ nombre: '', email: '', rol: 'admin' })
  const [error, setError] = useState<string | null>(null)
  const [resultado, setResultado] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const enviar = async () => {
    setEnviando(true)
    setError(null)
    try {
      const { data, error } = await supabase.functions.invoke('flota-invitar', { body: { empresaId, ...f } })
      if (error) {
        const cuerpo = await (error as { context?: Response }).context?.json?.().catch(() => null)
        throw new Error(cuerpo?.error ?? error.message)
      }
      const r = data as { cuentaNueva: boolean; emailEnviado: boolean; claveProvisional: string | null; emailError: string | null }
      onListo()
      setResultado(
        r.emailEnviado
          ? r.cuentaNueva
            ? `Listo. Le llegó un correo a ${f.email} con su contraseña provisional.`
            : `Listo. ${f.email} ya tenía cuenta: le avisamos por correo que ya puede entrar a esta empresa.`
          : r.claveProvisional
            ? `La cuenta quedó creada pero el correo no salió (${r.emailError}). Pásale estos datos: usuario ${f.email}, contraseña provisional ${r.claveProvisional}`
            : `Quedó agregado, pero el correo no salió (${r.emailError}). Avísale que ya puede entrar con su usuario de siempre.`,
      )
    } catch (e) {
      setError(mensajeError(e))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal
      abierto
      titulo="Invitar usuario"
      onCerrar={onCerrar}
      pie={
        resultado ? (
          <button className="primario" onClick={onCerrar}>Cerrar</button>
        ) : (
          <>
            <button onClick={onCerrar}>Cancelar</button>
            <button className="primario" disabled={enviando || !f.nombre.trim() || !f.email.trim()} onClick={() => void enviar()}>
              {enviando ? 'Invitando…' : 'Invitar'}
            </button>
          </>
        )
      }
    >
      {resultado ? (
        <div className="aviso ok" style={{ userSelect: 'all' }}>{resultado}</div>
      ) : (
        <>
          <Campo etiqueta="Nombre y apellido">
            <input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
          </Campo>
          <Campo etiqueta="Correo">
            <input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          </Campo>
          <Campo etiqueta="Rol">
            <Selector valor={f.rol} onCambio={(v) => setF({ ...f, rol: v })} opciones={ROLES} />
          </Campo>
          <span className="sec chico">{AYUDA_ROLES} Al entrar por primera vez acepta los términos de uso.</span>
          <ErrorMsg error={error} />
        </>
      )}
    </Modal>
  )
}
