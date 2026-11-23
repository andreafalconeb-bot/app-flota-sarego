import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { Membresia } from './tipos'

export interface Yo {
  id: string
  nombre: string
  email: string
  role: string
  debeCambiarClave: boolean
  /** Personal de SAREGO (usuario B2B interno): ve todas las empresas */
  esSarego: boolean
  /** Gerente u oficina B2B: cambia planes y límites */
  esGestion: boolean
  membresias: (Membresia & { empresa_nombre: string })[]
  terminosVigentes: number
}

interface Sesion {
  cargando: boolean
  session: Session | null
  yo: Yo | null
  error: string | null
  recargar: () => Promise<void>
  salir: () => Promise<void>
}

const Ctx = createContext<Sesion | null>(null)
const CLAVE_CACHE = 'flota-sesion:'

/** Lo de la sesión queda guardado para poder entrar sin internet (versión pago). */
function leerCache(id: string): Yo | null {
  try {
    const t = localStorage.getItem(CLAVE_CACHE + id)
    return t ? (JSON.parse(t) as Yo) : null
  } catch {
    return null
  }
}

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [cargando, setCargando] = useState(true)
  const [yo, setYo] = useState<Yo | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async (s: Session | null) => {
    setError(null)
    if (!s) {
      setYo(null)
      setCargando(false)
      return
    }
    try {
      const [perfil, sarego, gestion, membresias, terminos] = await Promise.all([
        supabase.from('profiles').select('nombre_completo, role, debe_cambiar_password').eq('id', s.user.id).maybeSingle(),
        supabase.rpc('flota_es_sarego'),
        supabase.rpc('flota_es_gestion'),
        supabase.from('flota_usuarios').select('empresa_id, rol, activo, terminos_version, flota_empresas(nombre)').eq('user_id', s.user.id).eq('activo', true),
        supabase.rpc('flota_terminos_vigentes'),
      ])
      for (const r of [perfil, sarego, gestion, membresias, terminos]) if (r.error) throw new Error(r.error.message)
      const nuevo: Yo = {
        id: s.user.id,
        email: s.user.email ?? '',
        nombre: (perfil.data?.nombre_completo as string | undefined) ?? s.user.email ?? '',
        role: (perfil.data?.role as string | undefined) ?? '',
        debeCambiarClave: Boolean(perfil.data?.debe_cambiar_password),
        esSarego: Boolean(sarego.data),
        esGestion: Boolean(gestion.data),
        membresias: (membresias.data ?? []).map((m) => {
          const e = m.flota_empresas as unknown as { nombre: string } | null
          return {
            empresa_id: m.empresa_id as string,
            rol: m.rol as Membresia['rol'],
            activo: m.activo as boolean,
            terminos_version: m.terminos_version as number | null,
            empresa_nombre: e?.nombre ?? 'Empresa',
          }
        }),
        terminosVigentes: (terminos.data as number | null) ?? 0,
      }
      try {
        localStorage.setItem(CLAVE_CACHE + s.user.id, JSON.stringify(nuevo))
      } catch {
        /* sin espacio: se sigue sin cache */
      }
      setYo(nuevo)
    } catch (e) {
      const guardado = leerCache(s.user.id)
      if (guardado) setYo(guardado)
      else setError(e instanceof Error ? e.message : String(e))
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      void cargar(data.session)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((evento, s) => {
      setSession(s)
      if (evento === 'SIGNED_IN' || evento === 'SIGNED_OUT') void cargar(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [cargar])

  const valor: Sesion = {
    cargando,
    session,
    yo,
    error,
    recargar: () => cargar(session),
    salir: async () => {
      await supabase.auth.signOut()
    },
  }
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export function useSesion(): Sesion {
  const c = useContext(Ctx)
  if (!c) throw new Error('useSesion fuera de ProveedorSesion')
  return c
}

/** ¿Le falta aceptar los términos vigentes? (solo clientes) */
export function faltanTerminos(yo: Yo): boolean {
  return !yo.esSarego && yo.membresias.some((m) => (m.terminos_version ?? 0) < yo.terminosVigentes)
}
