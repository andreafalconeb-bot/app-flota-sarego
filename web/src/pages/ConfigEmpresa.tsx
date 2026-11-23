import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useEmpresa } from '../lib/empresa'
import { useSesion } from '../lib/sesion'
import { SUCURSALES } from '../lib/catalogos'
import { fechaHora } from '../lib/formato'
import { Campo, ErrorMsg, Selector, Vacio, mensajeError, num, useCarga } from '../components/ui'

/** Datos de la empresa, plan y límites. Solo personal de SAREGO; plan y límites, la gerencia B2B. */
export default function ConfigEmpresa() {
  const e = useEmpresa()
  const { yo } = useSesion()
  const emp = e.empresa!
  const [f, setF] = useState(() => ({
    nombre: emp.nombre,
    rif: emp.rif ?? '',
    telefono: emp.telefono ?? '',
    direccion: emp.direccion ?? '',
    sucursal: emp.sucursal ?? '',
    ingeniero_id: emp.ingeniero_id ?? '',
    notas: emp.notas ?? '',
    plan: emp.plan,
    max_activos: String(emp.max_activos),
    dias_bloqueo: String(emp.dias_bloqueo),
    dias_aviso: String(emp.dias_aviso),
    activa: emp.activa,
  }))
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const { datos: personas } = useCarga(async () => {
    const { data } = await supabase.rpc('b2b_listar_usuarios')
    return (data ?? []) as { user_id: string; nombre: string }[]
  }, [])

  if (e.rol !== 'sarego') return <Vacio>Esta sección es del personal de SAREGO.</Vacio>
  const gestion = yo?.esGestion ?? false

  const guardar = async () => {
    setEnviando(true)
    setError(null)
    setOk(false)
    try {
      const cambios: Record<string, unknown> = {
        nombre: f.nombre.trim(),
        rif: f.rif.trim() || null,
        telefono: f.telefono.trim() || null,
        direccion: f.direccion.trim() || null,
        sucursal: f.sucursal || null,
        ingeniero_id: f.ingeniero_id || null,
        notas: f.notas.trim() || null,
        activa: f.activa,
      }
      if (gestion) {
        Object.assign(cambios, {
          plan: f.plan,
          max_activos: num(f.max_activos) ?? 10,
          dias_bloqueo: num(f.dias_bloqueo) ?? 30,
          dias_aviso: num(f.dias_aviso) ?? 7,
        })
      }
      const { error } = await supabase.from('flota_empresas').update(cambios).eq('id', emp.id)
      if (error) throw new Error(error.message)
      await e.recargarEmpresa()
      setOk(true)
    } catch (x) {
      setError(mensajeError(x))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="pila" style={{ gap: 14, maxWidth: 760 }}>
      <h1>Empresa</h1>
      <section className="tarjeta pila">
        <h2>Datos</h2>
        <div className="grid grid-2">
          <Campo etiqueta="Nombre"><input value={f.nombre} onChange={(x) => setF({ ...f, nombre: x.target.value })} /></Campo>
          <Campo etiqueta="RIF"><input value={f.rif} onChange={(x) => setF({ ...f, rif: x.target.value })} /></Campo>
          <Campo etiqueta="Teléfono"><input value={f.telefono} onChange={(x) => setF({ ...f, telefono: x.target.value })} /></Campo>
          <Campo etiqueta="Sucursal SAREGO"><Selector valor={f.sucursal} onCambio={(v) => setF({ ...f, sucursal: v })} opciones={SUCURSALES} vacio="—" /></Campo>
          <Campo etiqueta="Ingeniero responsable">
            <Selector valor={f.ingeniero_id} onCambio={(v) => setF({ ...f, ingeniero_id: v })} opciones={Object.fromEntries((personas ?? []).map((p) => [p.user_id, p.nombre]))} vacio="Sin asignar" />
          </Campo>
        </div>
        <Campo etiqueta="Dirección"><input value={f.direccion} onChange={(x) => setF({ ...f, direccion: x.target.value })} /></Campo>
        <Campo etiqueta="Notas internas de SAREGO (el cliente no las ve aquí)"><textarea value={f.notas} onChange={(x) => setF({ ...f, notas: x.target.value })} /></Campo>
        <label className="check"><input type="checkbox" checked={f.activa} onChange={(x) => setF({ ...f, activa: x.target.checked })} /> Empresa activa (si la desactivas, sus usuarios dejan de ver los datos)</label>
      </section>
      <Asignados empresaId={emp.id} gestion={gestion} online={e.online} />
      <section className="tarjeta pila">
        <h2>Versión y bloqueo</h2>
        {!gestion && <span className="sec chico">Solo la gerencia B2B (gerente u oficina) cambia la versión y los límites.</span>}
        <div className="grid grid-2">
          <Campo etiqueta="Versión">
            <select disabled={!gestion} value={f.plan} onChange={(x) => setF({ ...f, plan: x.target.value as typeof f.plan })}>
              <option value="gratis">Gratis (solo en la nube)</option>
              <option value="pago">Completa (base en el equipo del cliente)</option>
            </select>
          </Campo>
          <Campo etiqueta="Máximo de activos en la versión gratis">
            <input disabled={!gestion} inputMode="numeric" value={f.max_activos} onChange={(x) => setF({ ...f, max_activos: x.target.value })} />
          </Campo>
          <Campo etiqueta="Días sin sincronizar antes de trancar">
            <input disabled={!gestion} inputMode="numeric" value={f.dias_bloqueo} onChange={(x) => setF({ ...f, dias_bloqueo: x.target.value })} />
          </Campo>
          <Campo etiqueta="Avisar con cuántos días de anticipación">
            <input disabled={!gestion} inputMode="numeric" value={f.dias_aviso} onChange={(x) => setF({ ...f, dias_aviso: x.target.value })} />
          </Campo>
        </div>
        <span className="sec chico">Última sincronización del cliente: {emp.ultima_sincronizacion_at ? fechaHora(emp.ultima_sincronizacion_at) : 'nunca'}.</span>
      </section>
      <ErrorMsg error={error} />
      {ok && <div className="aviso ok">Guardado.</div>}
      <div><button className="primario" disabled={enviando || !e.online} onClick={() => void guardar()}>{enviando ? 'Guardando…' : 'Guardar'}</button></div>
    </div>
  )
}

interface Asignado { id: string; user_id: string; nombre: string; rol: 'ingeniero' | 'vendedor' }
interface Persona { id: string; nombre: string; tipo: 'ingeniero' | 'vendedor' }

/**
 * Personal de SAREGO asignado a la empresa (migración 0129): cada
 * ingeniero o vendedor ve solo las empresas que tiene asignadas; el
 * administrador (gestión) las ve todas y hace las asignaciones.
 */
function Asignados({ empresaId, gestion, online }: { empresaId: string; gestion: boolean; online: boolean }) {
  const { datos: asignados, recargar } = useCarga(async () => {
    const { data, error } = await supabase.rpc('flota_listar_asignados', { p_empresa: empresaId })
    if (error) throw new Error(error.message)
    return (data ?? []) as Asignado[]
  }, [empresaId])
  const { datos: personal } = useCarga(async () => {
    if (!gestion) return [] as Persona[]
    const { data, error } = await supabase.rpc('flota_personal')
    if (error) throw new Error(error.message)
    return (data ?? []) as Persona[]
  }, [gestion])
  const [quien, setQuien] = useState('')
  const [rol, setRol] = useState<'ingeniero' | 'vendedor'>('vendedor')
  const [error, setError] = useState<string | null>(null)
  const ya = new Set((asignados ?? []).map((a) => a.user_id))
  const libres = (personal ?? []).filter((p) => !ya.has(p.id))

  const asignar = async () => {
    setError(null)
    const { error: e } = await supabase.from('flota_asignaciones').insert({ empresa_id: empresaId, user_id: quien, rol })
    if (e) return setError(e.message)
    setQuien('')
    await recargar()
  }
  const quitar = async (a: Asignado) => {
    if (!confirm(`¿Quitarle la empresa a ${a.nombre}? Dejará de verla.`)) return
    setError(null)
    const { error: e } = await supabase.from('flota_asignaciones').delete().eq('id', a.id)
    if (e) return setError(e.message)
    await recargar()
  }

  return (
    <section className="tarjeta pila">
      <h2>Personal de SAREGO asignado</h2>
      <span className="sec chico">
        Los ingenieros y vendedores de SAREGO ven solo las empresas que tienen asignadas. El administrador ve todas
        {gestion ? ' y asigna aquí.' : '; pídele que te asigne o te quite empresas.'}
      </span>
      {(asignados ?? []).length === 0 ? (
        <span className="chico">Nadie asignado todavía.</span>
      ) : (
        <table>
          <tbody>
            {asignados!.map((a) => (
              <tr key={a.id}>
                <td>{a.nombre}</td>
                <td className="sec chico">{a.rol === 'ingeniero' ? 'Ingeniero' : 'Vendedor'}</td>
                <td className="num">{gestion && <button className="chico" disabled={!online} onClick={() => void quitar(a)}>Quitar</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {gestion && (
        <div className="fila">
          <select value={quien} onChange={(x) => {
            setQuien(x.target.value)
            const p = libres.find((y) => y.id === x.target.value)
            if (p) setRol(p.tipo)
          }} style={{ maxWidth: 280 }}>
            <option value="">Elige a quién asignar…</option>
            {libres.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <select value={rol} onChange={(x) => setRol(x.target.value as typeof rol)} style={{ maxWidth: 150 }}>
            <option value="vendedor">Vendedor</option>
            <option value="ingeniero">Ingeniero</option>
          </select>
          <button className="primario" disabled={!quien || !online} onClick={() => void asignar()}>Asignar</button>
        </div>
      )}
      <ErrorMsg error={error} />
    </section>
  )
}
