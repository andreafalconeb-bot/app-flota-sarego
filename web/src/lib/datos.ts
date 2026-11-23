// Base local de Flota SAREGO.
//
// Andrea (formulario 2): la base vive en el equipo del cliente y la nube
// es el respaldo y la vía para que SAREGO monitoree. Fase 1 (opción A):
// la base local es IndexedDB en el navegador del equipo; cada cambio se
// aplica primero aquí y queda en una cola que sube a Supabase al
// sincronizar. Al sincronizar se sube la cola y se baja la copia
// completa de la empresa (las flotas son chicas: miles de filas, no
// millones).
//
// Versión gratis: solo en la nube. Usa el mismo mecanismo, pero sin
// internet no deja cargar nada (ver puedeTrabajarSinConexion).
import { openDB, type IDBPDatabase } from 'idb'
import { supabase } from './supabase'
import { ORDEN_COLECCIONES, TABLAS, datosVacios, type Coleccion, type Datos } from './tipos'

export interface Cambio {
  n?: number
  empresa: string
  coleccion: Coleccion
  op: 'upsert' | 'delete'
  id: string
  fila?: Record<string, unknown>
  at: string
}

export interface Rechazo {
  coleccion: Coleccion
  id: string
  error: string
  at: string
}

interface Meta {
  /** Hora del servidor de la última sincronización completa en este equipo */
  ultimaSync: string | null
  rechazos: Rechazo[]
}

let dbPromesa: Promise<IDBPDatabase> | null = null
function db() {
  dbPromesa ??= openDB('flota-sarego', 1, {
    upgrade(d) {
      d.createObjectStore('copia')
      d.createObjectStore('cola', { keyPath: 'n', autoIncrement: true })
      d.createObjectStore('meta')
    },
  })
  return dbPromesa
}

// Columnas que calcula la base y no se envían
const NO_ENVIAR: Partial<Record<Coleccion, string[]>> = {
  servicios: ['costo_total'],
  // El serial lo pone la base
  neumaticos: ['numero'],
}

const oyentes = new Set<() => void>()
export function alCambiar(fn: () => void) {
  oyentes.add(fn)
  return () => void oyentes.delete(fn)
}
function avisar() {
  oyentes.forEach((f) => f())
}

// Subir la cola y bajar la copia nunca corren a la vez: si un guardado
// subía su cambio mientras una sincronización bajaba la copia, la copia
// bajada (sin el cambio) pisaba la local y el registro nuevo no se veía
// hasta la siguiente sincronización.
let turno: Promise<unknown> = Promise.resolve()
function enSerie<T>(fn: () => Promise<T>): Promise<T> {
  const r = turno.then(fn, fn)
  turno = r.catch(() => undefined)
  return r
}

/** Aplica un cambio a la copia en memoria (sin tocar el original). */
export function aplicar(datos: Datos, c: Pick<Cambio, 'coleccion' | 'op' | 'id' | 'fila'>): Datos {
  const lista = datos[c.coleccion] as unknown as { id: string }[]
  let nueva: { id: string }[]
  if (c.op === 'delete') {
    nueva = lista.filter((f) => f.id !== c.id)
  } else {
    const i = lista.findIndex((f) => f.id === c.id)
    const fila = { ...(i >= 0 ? lista[i] : {}), ...c.fila, id: c.id }
    nueva = i >= 0 ? lista.map((f, j) => (j === i ? fila : f)) : [...lista, fila]
  }
  return { ...datos, [c.coleccion]: nueva }
}

export async function leerCopia(empresa: string): Promise<Datos> {
  const guardado = (await (await db()).get('copia', empresa)) as Datos | undefined
  return { ...datosVacios(), ...(guardado ?? {}) }
}

async function escribirCopia(empresa: string, datos: Datos) {
  await (await db()).put('copia', datos, empresa)
}

export async function leerMeta(empresa: string): Promise<Meta> {
  const m = (await (await db()).get('meta', empresa)) as Meta | undefined
  return { ultimaSync: m?.ultimaSync ?? null, rechazos: m?.rechazos ?? [] }
}

async function escribirMeta(empresa: string, m: Meta) {
  await (await db()).put('meta', m, empresa)
}

export async function cola(empresa: string): Promise<Cambio[]> {
  const todos = (await (await db()).getAll('cola')) as Cambio[]
  return todos.filter((c) => c.empresa === empresa)
}

/**
 * Guarda un cambio: primero en la base local (queda visible de
 * inmediato) y en la cola. Si hay internet, intenta subirlo enseguida.
 */
export async function registrarCambio(c: Omit<Cambio, 'at' | 'n'>): Promise<Datos> {
  const d = await db()
  const cambio: Cambio = { ...c, at: new Date().toISOString() }
  // Leer y escribir la copia en la misma transacción, para no pisar una
  // copia que la sincronización esté escribiendo al mismo tiempo
  const tx = d.transaction(['copia', 'cola'], 'readwrite')
  const guardado = (await tx.objectStore('copia').get(c.empresa)) as Datos | undefined
  const datos = aplicar({ ...datosVacios(), ...(guardado ?? {}) }, cambio)
  await tx.objectStore('copia').put(datos, c.empresa)
  await tx.objectStore('cola').add(cambio)
  await tx.done
  avisar()
  return datos
}

/** Cambio solo local, sin cola (lo que la base ya calcula sola). */
export async function parcharLocal(empresa: string, coleccion: Coleccion, id: string, fila: Record<string, unknown>) {
  const datos = aplicar(await leerCopia(empresa), { coleccion, op: 'upsert', id, fila })
  await escribirCopia(empresa, datos)
  avisar()
  return datos
}

function esErrorDeRed(mensaje: string) {
  return /failed to fetch|networkerror|load failed|network request failed|fetch/i.test(mensaje)
}

/**
 * Sube la cola en orden. Un error de red deja el resto para después; un
 * rechazo de la base (permisos, datos inválidos) se saca de la cola y se
 * anota para mostrarlo, para no trabar todo lo demás.
 */
export function subirCola(empresa: string): Promise<{ enviados: number; rechazados: Rechazo[]; sinRed: boolean }> {
  return enSerie(() => subirColaYa(empresa))
}

async function subirColaYa(empresa: string): Promise<{ enviados: number; rechazados: Rechazo[]; sinRed: boolean }> {
  const d = await db()
  const pendientes = await cola(empresa)
  const rechazados: Rechazo[] = []
  let enviados = 0
  for (const c of pendientes) {
    const tabla = TABLAS[c.coleccion]
    let error: { message: string } | null = null
    try {
      if (c.op === 'delete') {
        error = (await supabase.from(tabla).delete().eq('id', c.id)).error
      } else {
        const fila = { ...c.fila, id: c.id, empresa_id: empresa }
        for (const k of NO_ENVIAR[c.coleccion] ?? []) delete (fila as Record<string, unknown>)[k]
        error = (await supabase.from(tabla).upsert(fila)).error
      }
    } catch (e) {
      error = { message: e instanceof Error ? e.message : String(e) }
    }
    if (error && esErrorDeRed(error.message)) {
      return { enviados, rechazados, sinRed: true }
    }
    if (error) rechazados.push({ coleccion: c.coleccion, id: c.id, error: error.message, at: c.at })
    else enviados++
    await d.delete('cola', c.n!)
  }
  if (rechazados.length) {
    const m = await leerMeta(empresa)
    await escribirMeta(empresa, { ...m, rechazos: [...rechazados, ...m.rechazos].slice(0, 50) })
  }
  avisar()
  return { enviados, rechazados, sinRed: false }
}

async function bajarTabla(tabla: string, empresa: string): Promise<unknown[]> {
  const filas: unknown[] = []
  const paso = 1000
  for (let desde = 0; ; desde += paso) {
    const { data, error } = await supabase
      .from(tabla)
      .select('*')
      .eq('empresa_id', empresa)
      .order('id')
      .range(desde, desde + paso - 1)
    if (error) throw new Error(error.message)
    filas.push(...(data ?? []))
    if (!data || data.length < paso) return filas
  }
}

/** Baja la copia completa de la empresa desde la nube. */
export async function bajarTodo(empresa: string): Promise<Datos> {
  const listas = await Promise.all(ORDEN_COLECCIONES.map((c) => bajarTabla(TABLAS[c], empresa)))
  const datos = datosVacios() as unknown as Record<Coleccion, unknown[]>
  ORDEN_COLECCIONES.forEach((c, i) => (datos[c] = listas[i]))
  return datos as unknown as Datos
}

export interface ResultadoSync {
  enviados: number
  rechazados: Rechazo[]
  ultimaSync: string
}

/**
 * Sincronización completa: sube la cola, baja la copia, vuelve a aplicar
 * lo que haya quedado en cola (cambios hechos mientras tanto) y registra
 * la hora en la base para el control de bloqueo.
 */
export function sincronizar(empresa: string): Promise<ResultadoSync> {
  return enSerie(() => sincronizarYa(empresa))
}

async function sincronizarYa(empresa: string): Promise<ResultadoSync> {
  const subida = await subirColaYa(empresa)
  if (subida.sinRed) throw new Error('Sin conexión con la nube. Los cambios siguen guardados en este equipo.')
  const bajada = await bajarTodo(empresa)
  // Lo que se guardó mientras bajaba sigue en la cola: se lee la cola y se
  // escribe la copia en una sola transacción para no perder nada
  const tx = (await db()).transaction(['copia', 'cola'], 'readwrite')
  const pendientes = ((await tx.objectStore('cola').getAll()) as Cambio[]).filter((c) => c.empresa === empresa)
  let datos = bajada
  for (const c of pendientes) datos = aplicar(datos, c)
  await tx.objectStore('copia').put(datos, empresa)
  await tx.done
  const { data: hora, error } = await supabase.rpc('flota_registrar_sincronizacion', { p_empresa: empresa })
  if (error) throw new Error(error.message)
  const ultimaSync = (hora as string | null) ?? new Date().toISOString()
  const m = await leerMeta(empresa)
  await escribirMeta(empresa, { ...m, ultimaSync })
  avisar()
  return { enviados: subida.enviados, rechazados: subida.rechazados, ultimaSync }
}

export async function borrarRechazos(empresa: string) {
  const m = await leerMeta(empresa)
  await escribirMeta(empresa, { ...m, rechazos: [] })
  avisar()
}

/** Borra la copia local de una empresa (al salir en un equipo prestado). */
export async function olvidarEmpresa(empresa: string) {
  const d = await db()
  await d.delete('copia', empresa)
  await d.delete('meta', empresa)
  for (const c of await cola(empresa)) await d.delete('cola', c.n!)
}

export function nuevoId(): string {
  return crypto.randomUUID()
}
