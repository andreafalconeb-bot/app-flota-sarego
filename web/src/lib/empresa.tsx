import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { supabase } from './supabase'
import { useSesion } from './sesion'
import { alCambiar, borrarRechazos, cola, leerCopia, leerMeta, nuevoId, parcharLocal, registrarCambio, sincronizar, subirCola, type Rechazo } from './datos'
import { disponible, estadoBloqueo, type EstadoBloqueo, type Funcion } from './calculos'
import { datosVacios, type Coleccion, type Datos, type Empresa, type RolFlota } from './tipos'

/** Fila a guardar: cualquier objeto de la colección, con o sin id. */
type Fila = { id?: string; [campo: string]: unknown }

interface EstadoEmpresa {
  empresa: Empresa | null
  datos: Datos
  cargando: boolean
  error: string | null
  /** 'sarego' = personal de SAREGO */
  rol: RolFlota | 'sarego' | null
  online: boolean
  sincronizando: boolean
  ultimaSync: string | null
  enCola: number
  rechazos: Rechazo[]
  bloqueo: { estado: EstadoBloqueo; diasSinSync: number | null; diasRestantes: number | null }
  /** Reportes y costos se ocultan si la app está trancada */
  reportesBloqueados: boolean
  puedeEscribir: boolean
  motivoSoloLectura: string | null
  esAdminEmpresa: boolean
  tiene: (f: Funcion) => boolean
  sincronizarAhora: () => Promise<string | null>
  guardar: (c: Coleccion, fila: Fila) => Promise<string>
  borrar: (c: Coleccion, id: string) => Promise<void>
  parchar: (c: Coleccion, id: string, fila: Record<string, unknown>) => Promise<void>
  limpiarRechazos: () => Promise<void>
  recargarEmpresa: () => Promise<void>
}

const Ctx = createContext<EstadoEmpresa | null>(null)
const CLAVE_EMPRESA = 'flota-empresa:'

function empresaGuardada(id: string): Empresa | null {
  try {
    const t = localStorage.getItem(CLAVE_EMPRESA + id)
    return t ? (JSON.parse(t) as Empresa) : null
  } catch {
    return null
  }
}

export function ProveedorEmpresa({ empresaId, children }: { empresaId: string; children: ReactNode }) {
  const { yo } = useSesion()
  const [empresa, setEmpresa] = useState<Empresa | null>(() => empresaGuardada(empresaId))
  const [datos, setDatos] = useState<Datos>(datosVacios())
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [online, setOnline] = useState(navigator.onLine)
  const [sincronizando, setSincronizando] = useState(false)
  const [ultimaSync, setUltimaSync] = useState<string | null>(null)
  const [enCola, setEnCola] = useState(0)
  const [rechazos, setRechazos] = useState<Rechazo[]>([])
  const enCurso = useRef(false)

  const rol: EstadoEmpresa['rol'] = yo?.esSarego ? 'sarego' : (yo?.membresias.find((m) => m.empresa_id === empresaId)?.rol ?? null)

  const refrescarLocal = useCallback(async () => {
    const [d, m, c] = await Promise.all([leerCopia(empresaId), leerMeta(empresaId), cola(empresaId)])
    setDatos(d)
    setUltimaSync(m.ultimaSync)
    setRechazos(m.rechazos)
    setEnCola(c.length)
  }, [empresaId])

  const recargarEmpresa = useCallback(async () => {
    const { data, error: e } = await supabase.from('flota_empresas').select('*').eq('id', empresaId).maybeSingle()
    if (e) throw new Error(e.message)
    if (!data) throw new Error('No tienes acceso a esta empresa.')
    setEmpresa(data as Empresa)
    try {
      localStorage.setItem(CLAVE_EMPRESA + empresaId, JSON.stringify(data))
    } catch {
      /* sin espacio */
    }
  }, [empresaId])

  const sincronizarAhora = useCallback(async (): Promise<string | null> => {
    if (enCurso.current) return null
    enCurso.current = true
    setSincronizando(true)
    try {
      await recargarEmpresa()
      const r = await sincronizar(empresaId)
      await refrescarLocal()
      setError(null)
      return r.rechazados.length ? `${r.rechazados.length} cambios no se aceptaron en la nube (ver detalle en Inicio).` : null
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
      return msg
    } finally {
      enCurso.current = false
      setSincronizando(false)
    }
  }, [empresaId, recargarEmpresa, refrescarLocal])

  // Después de cada cambio solo se sube la cola (rápido). Si la nube
  // rechaza algo, se baja la copia completa para no mostrar datos que no
  // quedaron guardados.
  const subir = useCallback(async () => {
    if (!navigator.onLine || enCurso.current) return
    try {
      const r = await subirCola(empresaId)
      await refrescarLocal()
      if (r.rechazados.length) await sincronizarAhora()
    } catch {
      /* se reintenta en la próxima sincronización */
    }
  }, [empresaId, refrescarLocal, sincronizarAhora])

  // Al entrar: muestra la copia local y sincroniza si hay internet
  useEffect(() => {
    let vivo = true
    void (async () => {
      await refrescarLocal()
      if (vivo) setCargando(false)
      if (navigator.onLine) await sincronizarAhora()
    })()
    const quitar = alCambiar(() => void refrescarLocal())
    const on = () => {
      setOnline(true)
      void sincronizarAhora()
    }
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    // Sincroniza cada 10 minutos mientras la app está abierta
    const t = setInterval(() => navigator.onLine && void sincronizarAhora(), 10 * 60_000)
    return () => {
      vivo = false
      quitar()
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
      clearInterval(t)
    }
  }, [refrescarLocal, sincronizarAhora])

  const plan = empresa?.plan ?? 'gratis'
  const bloqueo = useMemo(
    () =>
      rol === 'sarego'
        ? { estado: 'ok' as EstadoBloqueo, diasSinSync: null, diasRestantes: null }
        : estadoBloqueo({ plan, ultimaSync, diasBloqueo: empresa?.dias_bloqueo ?? 30, diasAviso: empresa?.dias_aviso ?? 7 }),
    [rol, plan, ultimaSync, empresa?.dias_bloqueo, empresa?.dias_aviso],
  )

  let motivoSoloLectura: string | null = null
  if (rol === 'consulta') motivoSoloLectura = 'Tu usuario es de solo consulta.'
  else if (!rol) motivoSoloLectura = 'No tienes acceso a esta empresa.'
  else if (!online && (rol === 'sarego' || !disponible(plan, 'sin_conexion')))
    motivoSoloLectura = rol === 'sarego' ? 'Sin internet: el personal de SAREGO carga datos en línea.' : 'La versión gratis funciona solo con internet.'

  const guardar = useCallback(
    async (c: Coleccion, fila: Fila) => {
      const id = fila.id ?? nuevoId()
      await registrarCambio({ empresa: empresaId, coleccion: c, op: 'upsert', id, fila: { ...fila, id, empresa_id: empresaId } })
      await refrescarLocal()
      void subir()
      return id
    },
    [empresaId, refrescarLocal, subir],
  )

  const borrar = useCallback(
    async (c: Coleccion, id: string) => {
      await registrarCambio({ empresa: empresaId, coleccion: c, op: 'delete', id })
      await refrescarLocal()
      void subir()
    },
    [empresaId, refrescarLocal, subir],
  )

  const valor: EstadoEmpresa = {
    empresa,
    datos,
    cargando,
    error,
    rol,
    online,
    sincronizando,
    ultimaSync,
    enCola,
    rechazos,
    bloqueo,
    reportesBloqueados: bloqueo.estado === 'bloqueada' || (bloqueo.estado === 'sin_copia' && rol !== 'sarego'),
    puedeEscribir: motivoSoloLectura === null,
    motivoSoloLectura,
    esAdminEmpresa: rol === 'sarego' || rol === 'admin',
    tiene: (f) => disponible(plan, f),
    sincronizarAhora,
    guardar,
    borrar,
    parchar: async (c, id, fila) => {
      await parcharLocal(empresaId, c, id, fila)
      await refrescarLocal()
    },
    limpiarRechazos: async () => {
      await borrarRechazos(empresaId)
      await refrescarLocal()
    },
    recargarEmpresa,
  }
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

export function useEmpresa(): EstadoEmpresa {
  const c = useContext(Ctx)
  if (!c) throw new Error('useEmpresa fuera de ProveedorEmpresa')
  return c
}
