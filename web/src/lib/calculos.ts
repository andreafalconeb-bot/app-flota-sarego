// Cálculos de Flota SAREGO. Funciones puras, con pruebas en
// calculos.test.ts.
import type { Activo, Carga, Compartimiento, Costo, Datos, Medidor, Neumatico, Plan, Servicio } from './tipos'

const DIA = 86_400_000

// ------------------------------------------------------------
// Bloqueo por falta de sincronización
// ------------------------------------------------------------
export type EstadoBloqueo = 'ok' | 'aviso' | 'bloqueada' | 'sin_copia'

/**
 * Andrea: "la app se tranca si se desconecta más que un cierto tiempo y
 * no actualiza la base". Solo aplica a la versión pago (la gratis
 * trabaja siempre contra la nube). Al trancarse se puede seguir
 * cargando, pero no se ven reportes ni costos.
 */
export function estadoBloqueo(p: {
  plan: Plan
  ultimaSync: string | null
  diasBloqueo: number
  diasAviso: number
  ahora?: number
}): { estado: EstadoBloqueo; diasSinSync: number | null; diasRestantes: number | null } {
  if (!p.ultimaSync) return { estado: 'sin_copia', diasSinSync: null, diasRestantes: null }
  const ahora = p.ahora ?? Date.now()
  const transcurrido = ahora - new Date(p.ultimaSync).getTime()
  const diasSinSync = Math.max(0, Math.floor(transcurrido / DIA))
  const diasRestantes = Math.max(0, Math.ceil((p.diasBloqueo * DIA - transcurrido) / DIA))
  if (p.plan !== 'pago') return { estado: 'ok', diasSinSync, diasRestantes: null }
  if (transcurrido > p.diasBloqueo * DIA) return { estado: 'bloqueada', diasSinSync, diasRestantes: 0 }
  if (transcurrido > Math.max(0, p.diasBloqueo - p.diasAviso) * DIA) return { estado: 'aviso', diasSinSync, diasRestantes }
  return { estado: 'ok', diasSinSync, diasRestantes }
}

// ------------------------------------------------------------
// Versión gratis y pago
// ------------------------------------------------------------
export type Funcion =
  | 'sin_conexion'
  | 'combustible'
  | 'costo_por_hora'
  | 'intervalo_sugerido'
  | 'informe_aditivo'
  | 'alarmas'

/**
 * Funciones extendidas: solo en la versión pago (Andrea, formulario 2).
 * Alarmas (cambios de aceite vencidos o próximos y neumáticos con
 * alerta): solo pago (Andrea, 23/nov/2026); en la gratis el cliente ve
 * los datos y lo verifica a mano.
 */
const SOLO_PAGO: Funcion[] = ['sin_conexion', 'combustible', 'costo_por_hora', 'intervalo_sugerido', 'informe_aditivo', 'alarmas']

export function disponible(plan: Plan, f: Funcion): boolean {
  return plan === 'pago' || !SOLO_PAGO.includes(f)
}

// ------------------------------------------------------------
// Medidores
// ------------------------------------------------------------
export type Unidad = 'km' | 'horas'

/** Unidad principal de un activo para intervalos y rendimientos. */
export function unidadPrincipal(m: Medidor): Unidad {
  return m === 'horas' ? 'horas' : 'km'
}

export function lectura(x: { km: number | null; horas: number | null }, u: Unidad): number | null {
  return u === 'km' ? x.km : x.horas
}

export function lecturaActual(a: Activo, u: Unidad): number | null {
  return u === 'km' ? a.km_actual : a.horas_actual
}

/** Cada activo pide odómetro u horómetro cada 7 días (Andrea, 24/nov/2026). */
export const DIAS_LECTURA = 7

export interface EstadoLectura {
  /** 'al_dia' | 'pendiente' (pasaron 7 días o nunca se leyó) | 'inactivo' (parado: no pide) | 'baja' */
  estado: 'al_dia' | 'pendiente' | 'inactivo' | 'baja'
  /** Días desde la última lectura (null si nunca) */
  dias: number | null
  /** Días que faltan para pedir la próxima (negativo = atrasada) */
  faltan: number | null
}

/**
 * Lectura semanal: pendiente si nunca se leyó o pasaron DIAS_LECTURA días.
 * Un activo en inactividad está parado, su medidor no avanza y no pide
 * lectura (sus fluidos solo vencen por tiempo); uno dado de baja tampoco.
 */
export function estadoLectura(a: Pick<Activo, 'activo' | 'lectura_at'> & { en_inactividad?: boolean | null }, hoy = Date.now()): EstadoLectura {
  const dias = a.lectura_at ? Math.max(0, Math.floor((hoy - new Date(a.lectura_at).getTime()) / DIA)) : null
  if (!a.activo) return { estado: 'baja', dias, faltan: null }
  if (a.en_inactividad) return { estado: 'inactivo', dias, faltan: null }
  if (dias == null) return { estado: 'pendiente', dias, faltan: null }
  const faltan = DIAS_LECTURA - dias
  return { estado: faltan <= 0 ? 'pendiente' : 'al_dia', dias, faltan }
}

// ------------------------------------------------------------
// Fluidos: próximo cambio y costo por hora / km
// ------------------------------------------------------------
export type EstadoServicio = 'ok' | 'proximo' | 'vencido' | 'sin_datos'

export interface ProximoCambio {
  ultimo: Servicio | null
  intervalo: number | null
  unidad: Unidad
  vence: number | null
  restante: number | null
  venceFecha: string | null
  diasRestantes: number | null
  estado: EstadoServicio
}

/**
 * Próximo cambio de un compartimiento según el intervalo que usa el
 * cliente (el sugerido por SAREGO se muestra aparte). Vence lo que
 * llegue primero: lectura o días. "Próximo" = queda menos del 10 % del
 * intervalo o menos de 7 días.
 */
export function proximoCambio(c: Compartimiento, activo: Activo, servicios: Servicio[], hoy = Date.now()): ProximoCambio {
  const unidad = unidadPrincipal(activo.medidor)
  const ultimo =
    servicios
      .filter((s) => s.compartimiento_id === c.id && s.tipo === 'cambio')
      .sort((a, b) => b.fecha.localeCompare(a.fecha) || (lectura(b, unidad) ?? 0) - (lectura(a, unidad) ?? 0))[0] ?? null
  const intervalo = unidad === 'km' ? c.intervalo_km : c.intervalo_horas
  const actual = lecturaActual(activo, unidad)
  const base = ultimo ? lectura(ultimo, unidad) : null
  const vence = intervalo && base != null ? base + intervalo : null
  const restante = vence != null && actual != null ? vence - actual : null
  const venceFecha = c.intervalo_dias && ultimo ? new Date(new Date(ultimo.fecha + 'T12:00:00').getTime() + c.intervalo_dias * DIA).toISOString().slice(0, 10) : null
  const diasRestantes = venceFecha ? Math.floor((new Date(venceFecha + 'T12:00:00').getTime() - hoy) / DIA) : null

  let estado: EstadoServicio = 'sin_datos'
  if (restante != null || diasRestantes != null) {
    const vencido = (restante != null && restante <= 0) || (diasRestantes != null && diasRestantes <= 0)
    const proximo = (restante != null && intervalo != null && restante <= intervalo * 0.1) || (diasRestantes != null && diasRestantes <= 7)
    estado = vencido ? 'vencido' : proximo ? 'proximo' : 'ok'
  }
  return { ultimo, intervalo, unidad, vence, restante, venceFecha, diasRestantes, estado }
}

export interface CostoPorUso {
  total: number
  uso: number
  porUnidad: number
  unidad: Unidad
  desde: number
  hasta: number
}

/**
 * Costo real de fluidos por hora o por km: todo lo gastado en servicios
 * (lubricante, filtros, mano de obra) dividido entre lo que trabajó el
 * activo desde el primer servicio registrado hasta la lectura actual.
 * Null si todavía no hay recorrido suficiente para dividir.
 */
export function costoPorUso(servicios: Servicio[], activo: Activo, compartimientoId?: string): CostoPorUso | null {
  const unidad = unidadPrincipal(activo.medidor)
  const lista = servicios.filter((s) => s.activo_id === activo.id && (!compartimientoId || s.compartimiento_id === compartimientoId))
  const lecturas = lista.map((s) => lectura(s, unidad)).filter((v): v is number => v != null)
  const actual = lecturaActual(activo, unidad)
  if (!lecturas.length || actual == null) return null
  const desde = Math.min(...lecturas)
  const hasta = Math.max(actual, ...lecturas)
  const uso = hasta - desde
  if (uso <= 0) return null
  const total = lista.reduce((t, s) => t + totalServicio(s), 0)
  return { total, uso, porUnidad: total / uso, unidad, desde, hasta }
}

export function totalServicio(s: Servicio): number {
  return s.costo_total ?? (s.costo_lubricante || 0) + (s.costo_filtros || 0) + (s.costo_mano_obra || 0) + (s.costo_otros || 0)
}

// ------------------------------------------------------------
// Combustible y aditivos
// ------------------------------------------------------------
export interface Tramo {
  desde: string
  hasta: string
  litros: number
  uso: number
  /** L/100 km o L/hora */
  consumo: number
  conAditivo: boolean
  costo: number | null
}

/**
 * Rendimiento entre llenados completos: los litros cargados después de
 * un tanque lleno hasta el siguiente tanque lleno (inclusive), entre lo
 * recorrido en ese lapso. Las cargas parciales se suman al tramo.
 */
export function tramosConsumo(cargas: Carga[], unidad: Unidad): Tramo[] {
  const lista = cargas
    .filter((c) => lectura(c, unidad) != null)
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || lectura(a, unidad)! - lectura(b, unidad)!)
  const tramos: Tramo[] = []
  let inicio: Carga | null = null
  let litros = 0
  let costo: number | null = 0
  let todasConAditivo = true
  for (const c of lista) {
    if (!inicio) {
      if (c.tanque_lleno) inicio = c
      continue
    }
    litros += c.litros
    costo = costo != null && c.costo_total != null ? costo + c.costo_total : null
    todasConAditivo &&= c.con_aditivo
    if (c.tanque_lleno) {
      const uso = lectura(c, unidad)! - lectura(inicio, unidad)!
      if (uso > 0) {
        tramos.push({
          desde: inicio.fecha,
          hasta: c.fecha,
          litros,
          uso,
          consumo: unidad === 'km' ? (litros / uso) * 100 : litros / uso,
          conAditivo: todasConAditivo,
          costo,
        })
      }
      inicio = c
      litros = 0
      costo = 0
      todasConAditivo = true
    }
  }
  return tramos
}

export interface Periodo {
  tramos: number
  litros: number
  uso: number
  consumo: number | null
  precioLitro: number | null
}

function resumir(tramos: Tramo[], unidad: Unidad): Periodo {
  const litros = tramos.reduce((t, x) => t + x.litros, 0)
  const uso = tramos.reduce((t, x) => t + x.uso, 0)
  const conCosto = tramos.filter((x) => x.costo != null)
  const litrosConCosto = conCosto.reduce((t, x) => t + x.litros, 0)
  return {
    tramos: tramos.length,
    litros,
    uso,
    consumo: uso > 0 ? (unidad === 'km' ? (litros / uso) * 100 : litros / uso) : null,
    precioLitro: litrosConCosto > 0 ? conCosto.reduce((t, x) => t + x.costo!, 0) / litrosConCosto : null,
  }
}

export interface ComparacionAditivo {
  unidad: Unidad
  base: Periodo
  conAditivo: Periodo
  /** Fracción de ahorro medida (0,15 = 15 %) */
  ahorro: number | null
  litrosAhorrados: number | null
  dineroAhorrado: number | null
  /** Inyección: gasto de la cuenta combustible_inyeccion por unidad de uso */
  inyeccionBase: number | null
  inyeccionCon: number | null
  ahorroInyeccion: number | null
}

/** Andrea: línea base de 2 meses antes de empezar el aditivo. */
export const MESES_LINEA_BASE = 2
/** Lo que promete SAREGO: ~15 % de ahorro de diésel y 50 % en inyección. */
export const AHORRO_PROMETIDO = 0.15
export const AHORRO_INYECCION_PROMETIDO = 0.5

export function inicioLineaBase(aditivoDesde: string): string {
  const d = new Date(aditivoDesde + 'T12:00:00')
  d.setMonth(d.getMonth() - MESES_LINEA_BASE)
  return d.toISOString().slice(0, 10)
}

/**
 * Compara el consumo de los 2 meses antes del aditivo con el consumo
 * desde que se usa. También compara el gasto de la cuenta de
 * inyección por km u hora en los mismos lapsos.
 */
export function compararAditivo(p: {
  cargas: Carga[]
  costos: Costo[]
  unidad: Unidad
  aditivoDesde: string
  hoy?: string
}): ComparacionAditivo {
  const desdeBase = inicioLineaBase(p.aditivoDesde)
  const tramos = tramosConsumo(p.cargas, p.unidad)
  const antes = tramos.filter((t) => t.desde.slice(0, 10) >= desdeBase && t.hasta.slice(0, 10) <= p.aditivoDesde)
  const despues = tramos.filter((t) => t.desde.slice(0, 10) >= p.aditivoDesde)
  const base = resumir(antes, p.unidad)
  const con = resumir(despues, p.unidad)

  const ahorro = base.consumo && con.consumo != null ? (base.consumo - con.consumo) / base.consumo : null
  // Litros que se habrían gastado con el consumo de la línea base
  const litrosAhorrados = base.consumo && con.uso > 0 ? (p.unidad === 'km' ? (base.consumo * con.uso) / 100 : base.consumo * con.uso) - con.litros : null
  const precio = con.precioLitro ?? base.precioLitro
  const dineroAhorrado = litrosAhorrados != null && precio != null ? litrosAhorrados * precio : null

  const hoy = p.hoy ?? new Date().toISOString().slice(0, 10)
  // [desde, hasta] por fecha; la línea base termina el día antes del aditivo
  const inyeccion = (desde: string, hasta: string) =>
    p.costos.filter((c) => c.cuenta === 'combustible_inyeccion' && c.fecha >= desde && c.fecha <= hasta).reduce((t, c) => t + c.monto, 0)
  const diaAntes = new Date(new Date(p.aditivoDesde + 'T12:00:00').getTime() - DIA).toISOString().slice(0, 10)
  const inyeccionBase = base.uso > 0 ? inyeccion(desdeBase, diaAntes) / base.uso : null
  const inyeccionCon = con.uso > 0 ? inyeccion(p.aditivoDesde, hoy) / con.uso : null
  const ahorroInyeccion = inyeccionBase && inyeccionCon != null ? (inyeccionBase - inyeccionCon) / inyeccionBase : null

  return { unidad: p.unidad, base, conAditivo: con, ahorro, litrosAhorrados, dineroAhorrado, inyeccionBase, inyeccionCon, ahorroInyeccion }
}

// ------------------------------------------------------------
// Neumáticos (básico)
// ------------------------------------------------------------
export type EstadoMedida = 'ok' | 'alerta' | 'critico' | 'sin_dato'

/** Desviación de la presión respecto a la ideal: -0,2 = 20 % baja. */
export function desviacionPresion(presion: number | null, ideal: number | null): number | null {
  if (presion == null || !ideal) return null
  return (presion - ideal) / ideal
}

/** 10 % por debajo ya gasta de más; 20 % por debajo es crítico (curva TMC). */
export function estadoPresion(presion: number | null, ideal: number | null): EstadoMedida {
  const d = desviacionPresion(presion, ideal)
  if (d == null) return 'sin_dato'
  if (d <= -0.2 || d >= 0.2) return 'critico'
  if (d <= -0.1 || d >= 0.1) return 'alerta'
  return 'ok'
}

/** Profundidad mínima de banda: 3 mm o menos = retirar; 5 mm = planificar. */
export function estadoProfundidad(mm: number | null): EstadoMedida {
  if (mm == null) return 'sin_dato'
  if (mm <= 3) return 'critico'
  if (mm <= 5) return 'alerta'
  return 'ok'
}

/**
 * Marcas a fuego para cargar varios neumáticos iguales de una vez. La
 * marca a fuego es opcional y se puede repetir (Andrea, 23/nov/2026):
 *  * vacía: todos sin marca (se distinguen por su serial);
 *  * termina en número: en serie, respetando los ceros (TG001 x 3 =
 *    TG001, TG002, TG003);
 *  * sin número al final: la misma en todos.
 */
export function marcasParaLote(inicio: string, cantidad: number): (string | null)[] {
  const marca = inicio.trim().toUpperCase()
  const n = Math.max(1, Math.floor(cantidad))
  if (!marca) return Array(n).fill(null)
  const m = /^(.*?)(\d+)$/.exec(marca)
  if (!m || n === 1) return Array(n).fill(marca)
  const [, prefijo, numero] = m
  const desde = parseInt(numero, 10)
  return Array.from({ length: n }, (_, i) => prefijo + String(desde + i).padStart(numero.length, '0'))
}

/**
 * Datos técnicos de un caucho del catálogo de SAREGO (articulos_erp,
 * línea CAUCHOS) a partir de su nombre: "275/70R22.5 PR16 HS205 (DIREC)
 * TERRAKING RIN/Otros: 22.5" → medida 275/70R22.5, modelo "PR16 HS205
 * (DIREC) TERRAKING". La marca es la categoría, salvo "VARIAS MARCAS".
 */
export function datosCaucho(a: { nombre: string; categoria: string | null }): {
  marca: string | null
  medida: string | null
  modelo: string | null
  indice: string | null
  construccion: 'tubeless' | 'tube_type' | null
} {
  const limpio = a.nombre.replace(/RIN\/Otros:.*$/i, '').replace(/\s+/g, ' ').trim()
  const m = /^((?:LT)?[\d.]+(?:X[\d.]+)?(?:R|-|\/)[\d.R/]+(?:\s?LT)?)\s*(.*)$/i.exec(limpio)
  const medida = m ? m[1].replace(/\s/g, '').toUpperCase() : null
  let modelo = (m ? m[2] : limpio).trim()
  const cat = (a.categoria ?? '').trim()
  const marca = cat && !/VARIAS/i.test(cat) ? cat : null
  if (marca && modelo.toUpperCase().endsWith(marca.toUpperCase())) modelo = modelo.slice(0, -marca.length).trim()
  const indice = /(?:^|\s)(\d{3}\/\d{3})[A-Z]?(?:\s|$)/.exec(limpio)?.[1] ?? null
  const N = a.nombre.toUpperCase()
  const construccion = /(^|\s)(TL|TUBELESS|S\/C)(\s|$)/.test(N) ? 'tubeless' : /(^|\s)(TT|TUBE TYPE|C\/C|CON CAMARA)(\s|$)/.test(N) ? 'tube_type' : null
  return { marca, medida, modelo: modelo || null, indice, construccion }
}

/**
 * Condición de un neumático en inventario (Andrea, 23/nov/2026): al
 * montarlo no se pregunta la profundidad, se toma de lo que ya se sabe.
 *  * Nuevo: nunca se ha montado; su profundidad es la de compra.
 *  * Usado: ya se montó alguna vez; su profundidad es la última medida
 *    (al desmontarlo, en una rotación o en una inspección).
 */
export interface CondicionNeumatico {
  nuevo: boolean
  mm: number | null
  fecha: string | null
  origen: 'compra' | 'movimiento' | 'inspeccion' | null
  /** Activo del que se desmontó por última vez */
  activoId: string | null
}

export function condicionNeumatico(
  n: { id: string; profundidad_inicial_mm: number | null },
  movimientos: { neumatico_id: string; tipo: string; fecha: string; profundidad_mm: number | null; activo_id: string | null }[],
  medidas: { neumatico_id: string | null; fecha: string; profundidad_min_mm: number | null }[],
): CondicionNeumatico {
  const suyos = movimientos.filter((m) => m.neumatico_id === n.id)
  const nuevo = !suyos.some((m) => m.tipo === 'montaje')
  const ultimoDesmontaje = suyos.filter((m) => m.tipo !== 'montaje' && m.tipo !== 'rotacion').sort((a, b) => b.fecha.localeCompare(a.fecha))[0]
  type Lectura = { mm: number; fecha: string; origen: 'movimiento' | 'inspeccion' }
  const lecturas: Lectura[] = [
    ...suyos.filter((m) => m.profundidad_mm != null).map((m) => ({ mm: m.profundidad_mm!, fecha: m.fecha, origen: 'movimiento' as const })),
    ...medidas.filter((x) => x.neumatico_id === n.id && x.profundidad_min_mm != null).map((x) => ({ mm: x.profundidad_min_mm!, fecha: x.fecha, origen: 'inspeccion' as const })),
  ].sort((a, b) => b.fecha.localeCompare(a.fecha))
  const ultima = lecturas[0]
  if (ultima) return { nuevo, mm: ultima.mm, fecha: ultima.fecha, origen: ultima.origen, activoId: ultimoDesmontaje?.activo_id ?? null }
  return { nuevo, mm: n.profundidad_inicial_mm, fecha: null, origen: n.profundidad_inicial_mm != null ? 'compra' : null, activoId: ultimoDesmontaje?.activo_id ?? null }
}

/** Nuevo (nunca montado, banda original), usado (ya montado) o renovado (banda renovada). */
export type ClaseNeumatico = 'nuevo' | 'usado' | 'renovado'

export function claseNeumatico(n: { renovaciones?: number | null }, c: { nuevo: boolean }): ClaseNeumatico {
  if ((n.renovaciones ?? 0) > 0) return 'renovado'
  return c.nuevo ? 'nuevo' : 'usado'
}

export interface FilaResumen {
  marca: string
  nuevo: number
  usado: number
  renovado: number
  total: number
}

/**
 * Inventario disponible resumido siempre por medida (Andrea,
 * 23/nov/2026): por cada medida, sus marcas con la cantidad de nuevos,
 * usados y renovados, y el total de la medida.
 */
export function resumenInventario(
  neumaticos: { id: string; estado: string; medida: string | null; marca: string | null; renovaciones?: number | null }[],
  clase: (id: string) => ClaseNeumatico,
): { medida: string; marcas: FilaResumen[]; total: FilaResumen }[] {
  const porMedida = new Map<string, Map<string, FilaResumen>>()
  for (const n of neumaticos) {
    if (n.estado !== 'inventario') continue
    const medida = n.medida?.trim().toUpperCase() || 'Sin medida'
    const marca = n.marca?.trim().toUpperCase() || 'Sin marca'
    const marcas = porMedida.get(medida) ?? new Map<string, FilaResumen>()
    porMedida.set(medida, marcas)
    const f = marcas.get(marca) ?? { marca, nuevo: 0, usado: 0, renovado: 0, total: 0 }
    marcas.set(marca, f)
    f[clase(n.id)]++
    f.total++
  }
  return [...porMedida.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'es', { numeric: true }))
    .map(([medida, marcas]) => {
      const lista = [...marcas.values()].sort((a, b) => b.total - a.total || a.marca.localeCompare(b.marca))
      const total = lista.reduce((t, f) => ({ ...t, nuevo: t.nuevo + f.nuevo, usado: t.usado + f.usado, renovado: t.renovado + f.renovado, total: t.total + f.total }), { marca: 'Total', nuevo: 0, usado: 0, renovado: 0, total: 0 })
      return { medida, marcas: lista, total }
    })
}

/**
 * Profundidad máxima posible de un neumático (Andrea, 23/nov/2026: "la
 * profundidad nunca puede ser mayor a la del nuevo"): la de compra o, si
 * se renovó la banda, la de la última banda renovada.
 */
export function profundidadMaxima(
  n: { id: string; profundidad_inicial_mm: number | null; renovaciones?: number | null },
  movimientos: { neumatico_id: string; tipo: string; fecha: string; profundidad_mm: number | null; motivo?: string | null }[],
): number | null {
  if ((n.renovaciones ?? 0) > 0) {
    const r = movimientos
      .filter((m) => m.neumatico_id === n.id && m.profundidad_mm != null && /banda renovada/i.test(m.motivo ?? ''))
      .sort((a, b) => b.fecha.localeCompare(a.fecha))[0]
    if (r) return r.profundidad_mm
  }
  return n.profundidad_inicial_mm
}

/** Texto de error si alguna profundidad pasa la máxima, o null. */
export function errorProfundidad(valores: (number | null)[], maxima: number | null): string | null {
  if (maxima == null) return null
  const mal = valores.filter((v): v is number => v != null && v > maxima)
  return mal.length ? `No puede pasar de ${maxima} mm (profundidad de nuevo); anotaste ${mal.join(', ')} mm.` : null
}

/** Presión actual del neumático tras una inspección: la dejada, o la encontrada si no se ajustó. */
export function presionActual(m: { presion_psi: number | null; presion_dejada_psi?: number | null }): number | null {
  return m.presion_dejada_psi ?? m.presion_psi
}

/**
 * Posible fuga lenta: el neumático se ENCONTRÓ bajo (10 % o más bajo la
 * ideal) en sus 2 últimas inspecciones, aunque se haya corregido cada vez.
 */
export function fugaLenta(lecturas: { fecha: string; presion_psi: number | null; presion_ideal_psi: number | null }[]): boolean {
  const ultimas = lecturas.filter((l) => l.presion_psi != null && l.presion_ideal_psi).sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 2)
  return ultimas.length === 2 && ultimas.every((l) => (desviacionPresion(l.presion_psi, l.presion_ideal_psi) ?? 0) <= -0.1)
}

/**
 * Presión ideal de una posición (Andrea, 24/nov/2026): la que se calculó
 * para el trabajo de ese activo, por eje (igual en todo el eje); si el
 * activo no la tiene, la del neumático (fabricante).
 */
export function presionIdeal(
  activo: { presiones_eje?: Record<string, number> | null },
  eje: string,
  neumatico: { presion_ideal_psi: number | null } | null | undefined,
): { psi: number | null; origen: 'activo' | 'fabricante' | null } {
  const delActivo = activo.presiones_eje?.[eje]
  if (delActivo != null && !isNaN(Number(delActivo))) return { psi: Number(delActivo), origen: 'activo' }
  if (neumatico?.presion_ideal_psi != null) return { psi: neumatico.presion_ideal_psi, origen: 'fabricante' }
  return { psi: null, origen: null }
}

// ------------------------------------------------------------
// Presión sugerida por carga (estimación)
// ------------------------------------------------------------
/** Índice de carga (ISO 4223 / ETRTO / TRA) → kg por neumático. */
const INDICE_CARGA: Record<number, number> = {
  100: 800, 101: 825, 102: 850, 103: 875, 104: 900, 105: 925, 106: 950, 107: 975, 108: 1000, 109: 1030,
  110: 1060, 111: 1090, 112: 1120, 113: 1150, 114: 1180, 115: 1215, 116: 1250, 117: 1285, 118: 1320, 119: 1360,
  120: 1400, 121: 1450, 122: 1500, 123: 1550, 124: 1600, 125: 1650, 126: 1700, 127: 1750, 128: 1800, 129: 1850,
  130: 1900, 131: 1950, 132: 2000, 133: 2060, 134: 2120, 135: 2180, 136: 2240, 137: 2300, 138: 2360, 139: 2430,
  140: 2500, 141: 2575, 142: 2650, 143: 2725, 144: 2800, 145: 2900, 146: 3000, 147: 3075, 148: 3150, 149: 3250,
  150: 3350, 151: 3450, 152: 3550, 153: 3650, 154: 3750, 155: 3875, 156: 4000, 157: 4125, 158: 4250, 159: 4375,
  160: 4500, 161: 4625, 162: 4750, 163: 4875, 164: 5000, 165: 5150, 166: 5300, 167: 5450, 168: 5600, 169: 5800, 170: 6000,
}

export function kgPorIndice(indice: number): number | null {
  return INDICE_CARGA[indice] ?? null
}

/** "146/143" → { sencillo: 146, dual: 143 }; "146" → solo sencillo. */
export function leerIndice(texto: string): { sencillo: number; dual: number | null } | null {
  const m = /^\s*(\d{3})\s*(?:\/\s*(\d{3}))?\s*$/.exec(texto)
  if (!m) return null
  return { sencillo: Number(m[1]), dual: m[2] ? Number(m[2]) : null }
}

/** Exponente de la presión en la fórmula de carga de la TRA (carga ∝ presión^0,585). */
const EXPONENTE_TRA = 0.585

export interface PresionSugerida {
  psi: number | null
  kgPorNeumatico: number
  kgMaximo: number | null
  sobrecarga: boolean
  /** La sugerida quedó en el piso del 60 % de la máxima (carga muy baja) */
  enPiso: boolean
  error: string | null
}

/**
 * Presión sugerida para un eje a partir de su carga máxima (Andrea,
 * 24/nov/2026). ES UNA ESTIMACIÓN: usa la fórmula de carga de la TRA
 * (base de las tablas de carga e inflación de ETRTO y de los
 * fabricantes): la carga que soporta el neumático varía con la presión
 * elevada a 0,585. Con el índice de carga del costado (sencillo / dual) y
 * su presión máxima se despeja la presión mínima que soporta la carga
 * por neumático, redondeada hacia arriba de 5 en 5 psi. Nunca pasa de la
 * máxima del costado ni baja del 60 % de ella. Solo un técnico, tras una
 * inspección meticulosa, fija la presión de carga indicada.
 */
export function presionSugerida(p: { cargaEjeKg: number; neumaticos: number; dual: boolean; indice: string; presionMaxPsi: number }): PresionSugerida {
  const base = { psi: null, kgPorNeumatico: p.neumaticos ? p.cargaEjeKg / p.neumaticos : 0, kgMaximo: null, sobrecarga: false, enPiso: false }
  const ind = leerIndice(p.indice)
  if (!ind) return { ...base, error: 'Índice de carga no válido (ej.: 146/143).' }
  const li = p.dual ? (ind.dual ?? null) : ind.sencillo
  if (li == null) return { ...base, error: 'Para un eje dual hace falta el índice dual (el segundo número, ej.: 146/143).' }
  const kgMax = kgPorIndice(li)
  if (kgMax == null) return { ...base, error: `No tengo el índice ${li} en la tabla.` }
  if (!(p.presionMaxPsi > 0) || !(p.cargaEjeKg > 0) || !(p.neumaticos > 0)) return { ...base, kgMaximo: kgMax, error: 'Faltan la carga del eje o la presión máxima.' }
  const porNeumatico = p.cargaEjeKg / p.neumaticos
  const sobrecarga = porNeumatico > kgMax
  const exacta = p.presionMaxPsi * Math.pow(Math.min(porNeumatico / kgMax, 1), 1 / EXPONENTE_TRA)
  const piso = p.presionMaxPsi * 0.6
  const redondeada = Math.min(p.presionMaxPsi, Math.ceil(Math.max(exacta, piso) / 5) * 5)
  return { psi: redondeada, kgPorNeumatico: porNeumatico, kgMaximo: kgMax, sobrecarga, enPiso: exacta < piso, error: null }
}

export function minimo(valores: (number | null | undefined)[]): number | null {
  const v = valores.filter((x): x is number => x != null && !isNaN(x))
  return v.length ? Math.min(...v) : null
}

// ------------------------------------------------------------
// Costos
// ------------------------------------------------------------
/** Cuenta de costo a la que va cada compartimiento de fluidos. */
export const CUENTA_DE_COMPONENTE: Record<string, string> = {
  motor: 'motor',
  transmision: 'transmision',
  caja_transferencia: 'tren_motriz',
  convertidor_par: 'transmision',
  diferencial: 'tren_motriz',
  mando_final: 'tren_motriz',
  mando_final_delantero: 'tren_motriz',
  mando_final_trasero: 'tren_motriz',
  sistema_giro: 'hidraulico',
  motor_traslacion: 'hidraulico',
  hidraulico: 'hidraulico',
  direccion: 'direccion_suspension',
  frenos: 'frenos',
  refrigerante: 'refrigeracion',
  engrase: 'engrase',
}

export interface Partida {
  cuenta: string
  monto: number
}

/**
 * Gasto por cuenta: las facturas cargadas a mano más los servicios de
 * fluidos (cada uno a la cuenta de su compartimiento; los sin
 * compartimiento van a motor salvo el engrase).
 */
export function gastoPorCuenta(costos: Costo[], servicios: Servicio[], compartimientos: Compartimiento[]): Map<string, number> {
  const mapa = new Map<string, number>()
  const sumar = (cuenta: string, monto: number) => mapa.set(cuenta, (mapa.get(cuenta) ?? 0) + monto)
  for (const c of costos) sumar(c.cuenta, c.monto)
  const comp = new Map(compartimientos.map((c) => [c.id, c]))
  for (const s of servicios) {
    const componente = s.compartimiento_id ? comp.get(s.compartimiento_id)?.componente : null
    const cuenta = componente ? CUENTA_DE_COMPONENTE[componente] ?? 'motor' : s.tipo === 'engrase' ? 'engrase' : 'motor'
    sumar(cuenta, totalServicio(s))
  }
  return mapa
}

// ------------------------------------------------------------
// Costo de operación por km o por hora de cada activo
// ------------------------------------------------------------
/** Una lectura de odómetro u horómetro con su fecha (día). */
export interface PuntoUso {
  fecha: string
  valor: number
}

/**
 * Todas las lecturas conocidas de un activo en su unidad: las lecturas
 * semanales, cargas de combustible, servicios, gastos, inspecciones y
 * movimientos de neumáticos, y la lectura actual. Ordenadas por fecha.
 */
export function lecturasActivo(activo: Activo, d: Pick<Datos, 'lecturas' | 'combustible' | 'servicios' | 'costos' | 'inspecciones' | 'movimientos'>, u: Unidad = unidadPrincipal(activo.medidor)): PuntoUso[] {
  const puntos: PuntoUso[] = []
  const sumar = (fecha: string | null | undefined, x: { km: number | null; horas: number | null }) => {
    const v = lectura(x, u)
    if (fecha && v != null && !isNaN(v)) puntos.push({ fecha: fecha.slice(0, 10), valor: v })
  }
  const deEste = <T extends { activo_id: string | null }>(xs: T[]) => xs.filter((x) => x.activo_id === activo.id)
  deEste(d.lecturas).forEach((x) => sumar(x.fecha, x))
  deEste(d.combustible).forEach((x) => sumar(x.fecha, x))
  deEste(d.servicios).forEach((x) => sumar(x.fecha, x))
  deEste(d.costos).forEach((x) => sumar(x.fecha, x))
  deEste(d.inspecciones).forEach((x) => sumar(x.fecha, x))
  deEste(d.movimientos).forEach((x) => sumar(x.fecha, x))
  sumar(activo.lectura_at, { km: activo.km_actual, horas: activo.horas_actual })
  return puntos.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.valor - b.valor)
}

/**
 * Lo que trabajó el activo entre dos fechas (inclusive): la mayor
 * lectura hasta `hasta` menos la última lectura antes de `desde` (o, si
 * no hay ninguna antes, la primera dentro del periodo).
 */
export function usoEnPeriodo(puntos: PuntoUso[], desde: string | null, hasta: string): { uso: number; desde: string; hasta: string } | null {
  const hastaD = hasta.slice(0, 10)
  const antes = desde ? puntos.filter((p) => p.fecha < desde) : []
  const dentro = puntos.filter((p) => (!desde || p.fecha >= desde) && p.fecha <= hastaD)
  if (!dentro.length) return null
  const inicio = antes.length ? antes.reduce((m, p) => (p.valor > m.valor ? p : m)) : dentro.reduce((m, p) => (p.valor < m.valor ? p : m))
  const fin = dentro.reduce((m, p) => (p.valor > m.valor ? p : m))
  const uso = fin.valor - inicio.valor
  return uso > 0 ? { uso, desde: inicio.fecha, hasta: fin.fecha } : null
}

/**
 * Cuánto trabaja el activo por día: lo recorrido en los últimos 90 días
 * con lectura (o en todo su historial si es más corto). Null si hay
 * menos de 7 días entre lecturas.
 */
export function usoPorDia(puntos: PuntoUso[]): number | null {
  if (puntos.length < 2) return null
  const ultimo = puntos.reduce((m, p) => (p.fecha > m.fecha || (p.fecha === m.fecha && p.valor > m.valor) ? p : m))
  const limite = new Date(new Date(ultimo.fecha + 'T12:00:00').getTime() - 90 * DIA).toISOString().slice(0, 10)
  const recientes = puntos.filter((p) => p.fecha >= limite && p.fecha < ultimo.fecha)
  const base = (recientes.length ? recientes : puntos.filter((p) => p.fecha < ultimo.fecha))[0]
  if (!base) return null
  const dias = (new Date(ultimo.fecha).getTime() - new Date(base.fecha).getTime()) / DIA
  if (dias < 7 || ultimo.valor <= base.valor) return null
  return (ultimo.valor - base.valor) / dias
}

export type Rubro = 'combustible' | 'fluidos' | 'neumaticos' | 'mantenimiento'

export interface ParteCosto {
  rubro: Rubro
  /** Cuenta de costo (solo en mantenimiento) */
  cuenta?: string
  monto: number
  porUnidad: number
}

export interface CostoOperacion {
  unidad: Unidad
  /** Km u horas trabajados en el periodo */
  uso: number
  desde: string
  hasta: string
  total: number
  porUnidad: number
  partes: ParteCosto[]
  /** Cargas de combustible sin costo anotado (no suman) */
  cargasSinCosto: number
  /** Neumáticos con desgaste medido pero sin costo o sin profundidad de nuevo (no suman) */
  neumaticosSinCosto: number
  /** Gastos cargados en la cuenta de neumáticos (pueden repetir la compra) */
  gastoCuentaNeumaticos: number
}

/**
 * Costo de operación de un activo por km (o por hora, si trabaja con
 * horómetro): todo lo que costó en el periodo dividido entre lo que
 * trabajó en ese mismo periodo.
 *  * Combustible: las cargas con costo.
 *  * Fluidos: los servicios de aceite, filtros y engrase.
 *  * Neumáticos: el desgaste medido en este activo, a su costo por mm
 *    útil (costo ÷ (profundidad de nuevo − 1,5 mm)).
 *  * Mantenimiento: las facturas y gastos, por cuenta.
 * Null si en el periodo no hay recorrido para dividir.
 */
export function costoOperacion(activo: Activo, d: Datos, desde: string | null, hasta: string): CostoOperacion | null {
  const unidad = unidadPrincipal(activo.medidor)
  const periodo = usoEnPeriodo(lecturasActivo(activo, d, unidad), desde, hasta)
  if (!periodo) return null
  const hastaD = hasta.slice(0, 10)
  const enPeriodo = (f: string) => (!desde || f.slice(0, 10) >= desde) && f.slice(0, 10) <= hastaD
  const suyos = <T extends { activo_id: string | null; fecha: string }>(xs: T[]) => xs.filter((x) => x.activo_id === activo.id && enPeriodo(x.fecha))

  const cargas = suyos(d.combustible)
  const combustible = cargas.reduce((t, c) => t + (c.costo_total ?? 0), 0)
  const cargasSinCosto = cargas.filter((c) => c.costo_total == null).length
  const fluidos = suyos(d.servicios).reduce((t, s) => t + totalServicio(s), 0)
  const porCuenta = new Map<string, number>()
  for (const c of suyos(d.costos)) porCuenta.set(c.cuenta, (porCuenta.get(c.cuenta) ?? 0) + c.monto)

  let neumaticos = 0
  let neumaticosSinCosto = 0
  for (const n of d.neumaticos) {
    const h = historialBanda(n, d)
    const mm = desgasteEnActivo(h, activo.id, unidad, desde, hastaD)
    if (mm <= 0) continue
    const porMm = costoPorMm(n)
    if (porMm == null) neumaticosSinCosto++
    else neumaticos += mm * porMm
  }

  const div = (v: number) => v / periodo.uso
  const partes: ParteCosto[] = []
  if (combustible) partes.push({ rubro: 'combustible', monto: combustible, porUnidad: div(combustible) })
  if (fluidos) partes.push({ rubro: 'fluidos', monto: fluidos, porUnidad: div(fluidos) })
  if (neumaticos) partes.push({ rubro: 'neumaticos', monto: neumaticos, porUnidad: div(neumaticos) })
  for (const [cuenta, monto] of [...porCuenta.entries()].sort((a, b) => b[1] - a[1])) {
    if (monto) partes.push({ rubro: 'mantenimiento', cuenta, monto, porUnidad: div(monto) })
  }
  const total = partes.reduce((t, p) => t + p.monto, 0)
  return {
    unidad,
    uso: periodo.uso,
    desde: periodo.desde,
    hasta: periodo.hasta,
    total,
    porUnidad: div(total),
    partes,
    cargasSinCosto,
    neumaticosSinCosto,
    gastoCuentaNeumaticos: porCuenta.get('neumaticos_rines') ?? 0,
  }
}

// ------------------------------------------------------------
// Proyección de duración de cada neumático (regla de tres km / mm)
// ------------------------------------------------------------
/**
 * Remanente estándar para sustituir el neumático o mandarlo a renovar si
 * la carcasa está buena (Andrea, 27/nov/2026).
 */
export const REMANENTE_MM = 1.5

/**
 * Desgaste mínimo medido para proyectar: el medidor tiene un error de
 * ±0,5 mm, que con 1 mm gastado mueve la proyección ±50 % y con 2 mm ±25 %.
 */
export const MM_MINIMO_PROYECCION = 2
/** Con menos de este desgaste medido la proyección es preliminar (error de ±12 % o más). */
export const MM_PROYECCION_FIRME = 4

/** Una medición de profundidad del neumático, con la lectura del activo donde estaba. */
export interface MedidaBanda {
  fecha: string
  mm: number
  activoId: string | null
  km: number | null
  horas: number | null
  /** Empieza un montaje (no se cuenta el recorrido desde la medición anterior) */
  inicio: boolean
  /** Termina un montaje (desmontaje, desecho, reparación, renovación) */
  fin: boolean
  /** Banda renovada: empieza una banda nueva */
  renovacion: boolean
}

/**
 * Mediciones de profundidad del neumático en orden: las de los
 * movimientos (montaje, rotación, desmontaje, renovación) y las de las
 * inspecciones.
 */
export function historialBanda(n: { id: string }, d: Pick<Datos, 'movimientos' | 'inspecciones' | 'inspeccionNeumaticos'>): MedidaBanda[] {
  const lista: (MedidaBanda & { orden: number })[] = []
  for (const m of d.movimientos) {
    if (m.neumatico_id !== n.id || m.profundidad_mm == null) continue
    const renovacion = /banda renovada/i.test(m.motivo ?? '')
    const orden = m.tipo === 'montaje' ? 0 : m.tipo === 'rotacion' ? 1 : 3
    lista.push({ fecha: m.fecha.slice(0, 10), mm: m.profundidad_mm, activoId: renovacion ? null : m.activo_id, km: m.km, horas: m.horas, inicio: m.tipo === 'montaje', fin: m.tipo !== 'montaje' && m.tipo !== 'rotacion', renovacion, orden })
  }
  const insp = new Map(d.inspecciones.map((i) => [i.id, i]))
  for (const x of d.inspeccionNeumaticos) {
    const i = insp.get(x.inspeccion_id)
    if (x.neumatico_id !== n.id || x.profundidad_min_mm == null || !i) continue
    lista.push({ fecha: i.fecha.slice(0, 10), mm: x.profundidad_min_mm, activoId: i.activo_id, km: i.km, horas: i.horas, inicio: false, fin: false, renovacion: false, orden: 2 })
  }
  // Mismo día: montaje, rotación, inspección y desmontaje, en ese orden
  return lista
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.orden - b.orden || (a.km ?? a.horas ?? 0) - (b.km ?? b.horas ?? 0))
    .map(({ orden: _, ...m }) => m)
}

/** Un tramo entre dos mediciones del mismo montaje. */
export interface TramoBanda {
  activoId: string
  hasta: string
  uso: number
  mm: number
  /** Tramo de la banda original (antes de cualquier renovación) */
  original: boolean
}

/**
 * Tramos entre mediciones seguidas dentro del mismo montaje: lo que
 * recorrió (km u h, según `u`) y lo que se gastó (mm; puede salir
 * negativo por el error de medir, y así se compensa).
 */
export function tramosBanda(h: MedidaBanda[], u: Unidad | ((activoId: string) => Unidad)): TramoBanda[] {
  const tramos: TramoBanda[] = []
  let original = true
  for (let i = 1; i < h.length; i++) {
    const a = h[i - 1]
    const b = h[i]
    if (b.renovacion) original = false
    if (a.fin || b.inicio || b.renovacion || !a.activoId || a.activoId !== b.activoId) continue
    const un = typeof u === 'function' ? u(a.activoId) : u
    const la = lectura(a, un)
    const lb = lectura(b, un)
    if (la == null || lb == null || lb < la) continue
    tramos.push({ activoId: a.activoId, hasta: b.fecha, uso: lb - la, mm: a.mm - b.mm, original })
  }
  return tramos
}

/** Desgaste (mm) medido en un activo entre dos fechas, solo de la banda original. */
export function desgasteEnActivo(h: MedidaBanda[], activoId: string, u: Unidad, desde: string | null, hasta: string): number {
  const mm = tramosBanda(h, u)
    .filter((t) => t.original && t.activoId === activoId && (!desde || t.hasta >= desde) && t.hasta <= hasta)
    .reduce((s, t) => s + t.mm, 0)
  return Math.max(0, mm)
}

/** Costo de cada mm útil de la banda original: costo ÷ (profundidad de nuevo − 1,5). */
export function costoPorMm(n: Pick<Neumatico, 'costo' | 'profundidad_inicial_mm'>): number | null {
  if (n.costo == null || n.costo <= 0 || n.profundidad_inicial_mm == null) return null
  const util = n.profundidad_inicial_mm - REMANENTE_MM
  return util > 0 ? n.costo / util : null
}

export interface ProyeccionNeumatico {
  unidad: Unidad
  /** Km u horas recorridos entre mediciones */
  usoMedido: number
  mmGastados: number
  /** Km (u horas) por cada mm de banda: la base de la regla de tres */
  porMm: number
  /** Profundidad de la banda nueva (la de compra o la de la última renovación) */
  mmNuevo: number | null
  /** Duración total proyectada de la banda, de nueva a 1,5 mm */
  vidaTotal: number | null
  mmUltima: number
  fechaUltima: string
  /** Lo que le queda desde la última medición hasta 1,5 mm */
  restante: number
  /** Lectura del activo donde llega a 1,5 mm (si está montado) */
  lecturaRetiro: number | null
  /** Lo que le queda desde la lectura actual del activo */
  restanteHoy: number | null
  /** Profundidad estimada hoy (la medida menos lo recorrido después) */
  mmHoy: number | null
  /** Fecha estimada en que llega a 1,5 mm, según lo que trabaja el activo */
  fechaRetiro: string | null
  /** Costo por km (u hora) de la banda original */
  costoPorUnidad: number | null
  /** Menos de 4 mm medidos: puede moverse bastante con las próximas mediciones */
  preliminar: boolean
  /** La tasa sale de la banda anterior porque la renovada aún no tiene desgaste medido */
  tasaBandaAnterior: boolean
  /** Ya está en 1,5 mm o menos */
  llego: boolean
}

/**
 * Proyección de duración por regla de tres: con lo que recorrió y lo
 * que gastó (km por mm), cuánto le falta hasta el remanente de 1,5 mm,
 * cuando toca sustituirlo o mandarlo a renovar si la carcasa está buena.
 * Devuelve el motivo si todavía no se puede proyectar.
 */
export function proyeccionNeumatico(
  n: Pick<Neumatico, 'id' | 'costo' | 'profundidad_inicial_mm' | 'renovaciones' | 'estado' | 'activo_id'>,
  d: Pick<Datos, 'movimientos' | 'inspecciones' | 'inspeccionNeumaticos' | 'activos' | 'lecturas' | 'combustible' | 'servicios' | 'costos'>,
  hoy = new Date().toISOString().slice(0, 10),
): { proyeccion: ProyeccionNeumatico | null; motivo: string | null } {
  const h = historialBanda(n, d)
  const ultima = h[h.length - 1]
  if (!ultima) return { proyeccion: null, motivo: 'Sin profundidades medidas.' }
  const activos = new Map(d.activos.map((a) => [a.id, a]))
  const unidadDe = (id: string) => unidadPrincipal(activos.get(id)?.medidor ?? 'km')
  const montadoEn = n.estado === 'montado' && n.activo_id ? activos.get(n.activo_id) ?? null : null
  const tramos = tramosBanda(h, unidadDe)
  const unidad: Unidad = montadoEn ? unidadPrincipal(montadoEn.medidor) : tramos.length ? unidadDe(tramos[tramos.length - 1].activoId) : 'km'
  const deUnidad = tramos.filter((t) => unidadDe(t.activoId) === unidad)
  const renovado = (n.renovaciones ?? 0) > 0
  const actuales = renovado ? deUnidad.filter((t) => !t.original) : deUnidad
  const suma = (ts: TramoBanda[]) => ts.reduce((s, t) => ({ uso: s.uso + t.uso, mm: s.mm + t.mm }), { uso: 0, mm: 0 })
  let base = suma(actuales)
  let tasaBandaAnterior = false
  if (renovado && base.mm < MM_MINIMO_PROYECCION) {
    const anterior = suma(deUnidad)
    if (anterior.mm >= MM_MINIMO_PROYECCION) {
      base = anterior
      tasaBandaAnterior = true
    }
  }
  if (base.uso <= 0 || base.mm < MM_MINIMO_PROYECCION) {
    return { proyeccion: null, motivo: `Hace falta medir al menos ${MM_MINIMO_PROYECCION} mm de desgaste en el activo (montaje e inspección con ${unidad === 'km' ? 'odómetro' : 'horómetro'}) para proyectar.` }
  }
  const porMm = base.uso / base.mm
  // Banda nueva: la última renovación o la de compra
  const ultimaRenovacion = [...h].reverse().find((m) => m.renovacion)
  const mmNuevo = renovado ? ultimaRenovacion?.mm ?? null : n.profundidad_inicial_mm
  const vidaTotal = mmNuevo != null && mmNuevo > REMANENTE_MM ? (mmNuevo - REMANENTE_MM) * porMm : null
  const restante = Math.max(0, (ultima.mm - REMANENTE_MM) * porMm)

  let lecturaRetiro: number | null = null
  let restanteHoy: number | null = null
  let mmHoy: number | null = null
  let fechaRetiro: string | null = null
  if (montadoEn && ultima.activoId === montadoEn.id) {
    const enUltima = lectura(ultima, unidad)
    const actual = lecturaActual(montadoEn, unidad)
    if (enUltima != null) {
      lecturaRetiro = enUltima + restante
      if (actual != null) {
        restanteHoy = Math.max(0, lecturaRetiro - Math.max(actual, enUltima))
        mmHoy = Math.max(0, ultima.mm - (Math.max(actual, enUltima) - enUltima) / porMm)
      }
      const diario = usoPorDia(lecturasActivo(montadoEn, d, unidad))
      if (diario && restanteHoy != null) {
        const f = new Date(hoy + 'T12:00:00')
        f.setDate(f.getDate() + Math.round(restanteHoy / diario))
        fechaRetiro = f.toISOString().slice(0, 10)
      }
    }
  }
  const costo = !renovado ? costoPorMm(n) : null
  return {
    proyeccion: {
      unidad,
      usoMedido: base.uso,
      mmGastados: base.mm,
      porMm,
      mmNuevo,
      vidaTotal,
      mmUltima: ultima.mm,
      fechaUltima: ultima.fecha,
      restante,
      lecturaRetiro,
      restanteHoy,
      mmHoy,
      fechaRetiro,
      costoPorUnidad: costo != null ? costo / porMm : null,
      preliminar: base.mm < MM_PROYECCION_FIRME,
      tasaBandaAnterior,
      llego: (mmHoy ?? ultima.mm) <= REMANENTE_MM,
    },
    motivo: null,
  }
}

// ------------------------------------------------------------
// Dinero perdido por presión fuera de la ideal
// ------------------------------------------------------------
/**
 * Vida de la banda según la presión con que rodó (presión ÷ ideal), de la
 * curva de TMC (RP 235A, citada por la prensa del ramo): 10 % por debajo
 * pierde entre 9 y 16 % de vida (se toma 12 %), 20 % por debajo pierde
 * 30 %, y 10 % por encima gasta 5 % más. Fuera de 60–120 % se queda en
 * el extremo: ahí el problema ya no es el desgaste sino la carcasa.
 */
export const CURVA_PRESION_VIDA: [number, number][] = [
  [0.6, 0.34],
  [0.8, 0.7],
  [0.9, 0.88],
  [1, 1],
  [1.1, 1 / 1.05],
  [1.2, 1 / 1.1],
]

/**
 * Combustible de más por cada 10 % de baja presión promedio del activo.
 * Las fuentes van de 0,2 % a 1 %; se toma 0,5 %, conservador.
 */
export const COMBUSTIBLE_POR_10_BAJO = 0.005

/** Fracción de la vida de la banda que se logra rodando a esa proporción de la presión ideal. */
export function vidaPorPresion(proporcion: number): number {
  const c = CURVA_PRESION_VIDA
  if (proporcion <= c[0][0]) return c[0][1]
  if (proporcion >= c[c.length - 1][0]) return c[c.length - 1][1]
  for (let i = 1; i < c.length; i++) {
    const [x1, y1] = c[i]
    const [x0, y0] = c[i - 1]
    if (proporcion <= x1) return y0 + ((proporcion - x0) / (x1 - x0)) * (y1 - y0)
  }
  return 1
}

export interface TramoPresion {
  neumaticoId: string
  activoId: string
  posicion: string
  /** Fecha de la inspección que cierra el tramo */
  fecha: string
  unidad: Unidad
  uso: number
  /** Presión con que se estima que rodó: el promedio entre la dejada en la inspección anterior y la encontrada en esta */
  presionRodada: number
  ideal: number
  proporcion: number
  /** Desgaste de más, en fracción (0,25 = 25 % más rápido) */
  desgasteExtra: number
  /** Dinero perdido por el desgaste de más; null si el neumático no tiene costo por km */
  dinero: number | null
}

export interface PerdidaActivo {
  activoId: string
  unidad: Unidad
  desgaste: number
  combustible: number
  total: number
  /** Km u horas cubiertos por las inspecciones */
  uso: number
  tramos: TramoPresion[]
  /** Tramos con presión fuera de la ideal cuyo neumático no tiene costo */
  sinCosto: number
}

/**
 * Dinero perdido por presión fuera de la ideal, entre inspecciones:
 *  * Desgaste: cada neumático rodó el tramo a una presión estimada; según
 *    la curva TMC gastó (1 ÷ vida − 1) de más, a su costo por km.
 *  * Combustible: la baja presión promedio del activo en cada inspección
 *    sube el consumo 0,5 % por cada 10 %, a su costo de combustible por km.
 * El primer tramo de cada neumático empieza en su montaje o en su
 * primera inspección; desmontarlo corta el tramo.
 */
export function perdidaPorPresion(d: Datos, desde: string | null, hasta: string): Map<string, PerdidaActivo> {
  const hastaD = hasta.slice(0, 10)
  const neumaticos = new Map(d.neumaticos.map((n) => [n.id, n]))
  // Costo por km de cada neumático: el medido, o su costo por mm al ritmo promedio de la flota
  const proyecciones = new Map(d.neumaticos.map((n) => [n.id, proyeccionNeumatico(n, d, hastaD).proyeccion]))
  const promedioPorMm = (u: Unidad) => {
    const v = [...proyecciones.values()].filter((p): p is ProyeccionNeumatico => p != null && p.unidad === u && !p.preliminar).map((p) => p.porMm)
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
  }
  const ritmo = { km: promedioPorMm('km'), horas: promedioPorMm('horas') }
  const costoPorUso = (id: string, u: Unidad): number | null => {
    const p = proyecciones.get(id)
    if (p?.costoPorUnidad != null && p.unidad === u) return p.costoPorUnidad
    const n = neumaticos.get(id)
    const porMm = n && (n.renovaciones ?? 0) === 0 ? costoPorMm(n) : null
    return porMm != null && ritmo[u] ? porMm / ritmo[u]! : null
  }

  const resultado = new Map<string, PerdidaActivo>()
  for (const activo of d.activos) {
    const u = unidadPrincipal(activo.medidor)
    const combustibleKm = costoOperacion(activo, d, null, hastaD)?.partes.find((p) => p.rubro === 'combustible')?.porUnidad ?? 0
    type Evento = { fecha: string; orden: number; fin?: string; inicio?: string; lectura: number | null; inspeccionId?: string }
    const eventos: Evento[] = []
    for (const m of d.movimientos) {
      if (m.activo_id !== activo.id) continue
      if (m.tipo === 'montaje') eventos.push({ fecha: m.fecha.slice(0, 10), orden: 0, inicio: m.neumatico_id, lectura: lectura(m, u) })
      else if (m.tipo !== 'rotacion') eventos.push({ fecha: m.fecha.slice(0, 10), orden: 2, fin: m.neumatico_id, lectura: null })
    }
    for (const i of d.inspecciones) if (i.activo_id === activo.id) eventos.push({ fecha: i.fecha.slice(0, 10), orden: 1, lectura: lectura(i, u), inspeccionId: i.id })
    eventos.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.orden - b.orden)

    const previo = new Map<string, { lectura: number; dejada: number | null }>()
    let previaInspeccion: number | null = null
    const r: PerdidaActivo = { activoId: activo.id, unidad: u, desgaste: 0, combustible: 0, total: 0, uso: 0, tramos: [], sinCosto: 0 }
    for (const ev of eventos) {
      if (ev.inicio) {
        if (ev.lectura != null) previo.set(ev.inicio, { lectura: ev.lectura, dejada: null })
        continue
      }
      if (ev.fin) {
        previo.delete(ev.fin)
        continue
      }
      if (ev.lectura == null) continue
      const enPeriodo = (!desde || ev.fecha >= desde) && ev.fecha <= hastaD
      const bajos: number[] = []
      for (const x of d.inspeccionNeumaticos) {
        if (x.inspeccion_id !== ev.inspeccionId || !x.neumatico_id) continue
        const p = previo.get(x.neumatico_id)
        const dejada = x.presion_dejada_psi ?? x.presion_psi
        if (x.presion_psi != null && x.presion_ideal_psi) {
          const rodada = p?.dejada != null ? (p.dejada + x.presion_psi) / 2 : x.presion_psi
          const proporcion = rodada / x.presion_ideal_psi
          bajos.push(Math.max(0, 1 - proporcion))
          if (p && enPeriodo && ev.lectura > p.lectura) {
            const uso = ev.lectura - p.lectura
            const desgasteExtra = 1 / vidaPorPresion(proporcion) - 1
            const costo = costoPorUso(x.neumatico_id, u)
            const dinero = costo != null ? costo * uso * desgasteExtra : null
            if (dinero == null && desgasteExtra > 0) r.sinCosto++
            r.tramos.push({ neumaticoId: x.neumatico_id, activoId: activo.id, posicion: x.posicion, fecha: ev.fecha, unidad: u, uso, presionRodada: rodada, ideal: x.presion_ideal_psi, proporcion, desgasteExtra, dinero })
            r.desgaste += dinero ?? 0
          }
        }
        previo.set(x.neumatico_id, { lectura: ev.lectura, dejada })
      }
      if (previaInspeccion != null && enPeriodo && ev.lectura > previaInspeccion && bajos.length) {
        const uso = ev.lectura - previaInspeccion
        const bajoPromedio = bajos.reduce((a, b) => a + b, 0) / bajos.length
        r.combustible += combustibleKm * uso * (bajoPromedio / 0.1) * COMBUSTIBLE_POR_10_BAJO
        r.uso += uso
      }
      previaInspeccion = ev.lectura
    }
    r.total = r.desgaste + r.combustible
    if (r.tramos.length || r.total) resultado.set(activo.id, r)
  }
  return resultado
}

// ------------------------------------------------------------
// Evaluación de la medición en la inspección
// ------------------------------------------------------------
/** Rendimiento (km/mm) por debajo de este % del promedio o de su propio historial: revisar. */
export const RENDIMIENTO_MINIMO = 0.75
/** Diferencia entre ranuras de un mismo neumático que ya es desgaste irregular (mm). */
export const DIFERENCIA_RANURAS_MM = 2
/** Diferencia máxima de profundidad entre duales (mm). */
export const DIFERENCIA_DUALES_MM = 3

export type TipoAlertaMedida = 'sube' | 'acelerado' | 'bajo_promedio' | 'irregular' | 'duales' | 'remanente'

export interface AlertaMedida {
  tipo: TipoAlertaMedida
  texto: string
}

export interface EvaluacionMedida {
  /** Última profundidad conocida antes de esta inspección */
  previa: { mm: number; fecha: string; lectura: number | null } | null
  /** Rendimiento de este tramo (desde la medición anterior del mismo montaje) */
  tramo: { uso: number; mm: number; porMm: number | null } | null
  antes: ProyeccionNeumatico | null
  /** Proyección contando esta medición */
  ahora: ProyeccionNeumatico | null
  /** Rendimiento promedio de la flota (misma medida si hay, si no todas) */
  promedio: { porMm: number; neumaticos: number; deMedida: boolean } | null
  alertas: AlertaMedida[]
}

/** Pareja dual de una posición ("2IE" ↔ "2II", "2DI" ↔ "2DE"); null si es sencilla. */
/** Número con hasta 1 decimal, con coma. */
const mm1 = (v: number) => (Math.round(v * 10) / 10).toLocaleString('es-VE')

export function parejaDual(pos: string): string | null {
  const m = /^(\d+)(IE|II|DI|DE)$/.exec(pos)
  if (!m) return null
  const otra: Record<string, string> = { IE: 'II', II: 'IE', DI: 'DE', DE: 'DI' }
  return m[1] + otra[m[2]]
}

/**
 * Evalúa la profundidad que se está anotando: la compara con la última,
 * calcula la proyección con esta medida (regla de tres km/mm) y la
 * compara con su propio historial y con el promedio de la flota. Las
 * alertas piden revisar en el momento, con el vehículo al frente: volver
 * a medir y mirar si hay desgaste irregular o arrastre lateral.
 */
export function evaluarMedida(p: {
  n: Neumatico
  activo: Activo
  d: Datos
  /** Lectura del activo en esta inspección (km u h) */
  lectura: number | null
  ranuras: (number | null)[]
  /** Profundidad mínima del par dual en esta inspección */
  mmPareja?: number | null
  hoy?: string
}): EvaluacionMedida {
  const { n, activo, d } = p
  const u = unidadPrincipal(activo.medidor)
  const hoy = p.hoy ?? new Date().toISOString().slice(0, 10)
  const valores = p.ranuras.filter((x): x is number => x != null && !isNaN(x))
  const mm = valores.length ? Math.min(...valores) : null
  const alertas: AlertaMedida[] = []
  const h = historialBanda(n, d)
  const ultima = h[h.length - 1]
  const previa = ultima ? { mm: ultima.mm, fecha: ultima.fecha, lectura: lectura(ultima, u) } : null
  const antes = proyeccionNeumatico(n, d, hoy).proyeccion

  // Promedio de la flota (sin este neumático), con proyecciones firmes
  const firmes = d.neumaticos
    .filter((x) => x.id !== n.id)
    .map((x) => ({ x, pr: proyeccionNeumatico(x, d, hoy).proyeccion }))
    .filter((y): y is { x: Neumatico; pr: ProyeccionNeumatico } => y.pr != null && !y.pr.preliminar && y.pr.unidad === u)
  const deMedida = firmes.filter((y) => n.medida && y.x.medida?.toUpperCase() === n.medida.toUpperCase())
  const base = deMedida.length >= 2 ? deMedida : firmes.length >= 2 ? firmes : []
  const promedio = base.length ? { porMm: base.reduce((t, y) => t + y.pr.porMm, 0) / base.length, neumaticos: base.length, deMedida: base === deMedida } : null

  let tramo: EvaluacionMedida['tramo'] = null
  let ahora: ProyeccionNeumatico | null = null
  if (mm != null) {
    if (valores.length >= 2 && Math.max(...valores) - mm >= DIFERENCIA_RANURAS_MM) {
      alertas.push({ tipo: 'irregular', texto: `Las ranuras difieren ${mm1(Math.max(...valores) - mm)} mm: desgaste irregular. Mira si un hombro está más gastado o si hay arrastre lateral (plumas).` })
    }
    if (p.mmPareja != null && Math.abs(p.mmPareja - mm) > DIFERENCIA_DUALES_MM) {
      alertas.push({ tipo: 'duales', texto: `Difiere ${mm1(Math.abs(p.mmPareja - mm))} mm de su pareja dual (máximo ${DIFERENCIA_DUALES_MM} mm): el más gastado arrastra y se gasta más rápido.` })
    }
    // Un neumático no recupera banda: cualquier valor mayor que la lectura
    // anterior es ilógico y hay que chequearlo o confirmarlo (Andrea, 28/nov/2026)
    if (previa && mm > previa.mm) {
      alertas.push({ tipo: 'sube', texto: `Ilógico: ${mm1(mm)} mm es más que la lectura anterior (${mm1(previa.mm)} mm, ${previa.fecha.split('-').reverse().join('/')}) y un neumático no recupera banda. Chequea la medida (fuera de los testigos de desgaste, sin piedras, profundímetro en cero) o confírmala.` })
    }
    if (mm <= REMANENTE_MM) {
      alertas.push({ tipo: 'remanente', texto: `Llegó al remanente de ${mm1(REMANENTE_MM)} mm: sustituirlo, o mandarlo a renovar si la carcasa está buena (sin cortes, bultos ni separaciones).` })
    }
    // Tramo desde la medición anterior del mismo montaje
    if (ultima && !ultima.fin && ultima.activoId === activo.id && p.lectura != null) {
      const la = lectura(ultima, u)
      if (la != null && p.lectura >= la) {
        const gasto = ultima.mm - mm
        tramo = { uso: p.lectura - la, mm: gasto, porMm: gasto > 0 ? (p.lectura - la) / gasto : null }
      }
    }
    // Proyección con esta medición: se agrega como una inspección más
    if (p.lectura != null && n.estado === 'montado' && n.activo_id === activo.id) {
      const idI = '__nueva__'
      const d2: Datos = {
        ...d,
        inspecciones: [...d.inspecciones, { id: idI, empresa_id: n.empresa_id, activo_id: activo.id, fecha: hoy + 'T23:59:59Z', km: u === 'km' ? p.lectura : null, horas: u === 'horas' ? p.lectura : null, notas: null }],
        inspeccionNeumaticos: [...d.inspeccionNeumaticos, { id: idI, empresa_id: n.empresa_id, inspeccion_id: idI, neumatico_id: n.id, posicion: n.posicion ?? '', presion_psi: null, presion_ideal_psi: null, profundidades_mm: valores, profundidad_min_mm: mm, valvula: null, observacion: null }],
      }
      ahora = proyeccionNeumatico(n, d2, hoy).proyeccion
    }
    const pct = (x: number) => Math.round((1 - x) * 100)
    if (tramo?.porMm != null && tramo.mm >= 1 && antes && tramo.porMm < antes.porMm * RENDIMIENTO_MINIMO) {
      alertas.push({ tipo: 'acelerado', texto: `En este tramo rindió ${Math.round(tramo.porMm).toLocaleString('es-VE')} ${u === 'km' ? 'km' : 'h'}/mm, ${pct(tramo.porMm / antes.porMm)} % menos que su historial: se aceleró el desgaste.` })
    }
    if (ahora && promedio && ahora.porMm < promedio.porMm * RENDIMIENTO_MINIMO) {
      alertas.push({ tipo: 'bajo_promedio', texto: `Rinde ${Math.round(ahora.porMm).toLocaleString('es-VE')} ${u === 'km' ? 'km' : 'h'}/mm, ${pct(ahora.porMm / promedio.porMm)} % menos que el promedio de ${promedio.deMedida ? `la medida ${n.medida}` : 'la flota'} (${Math.round(promedio.porMm).toLocaleString('es-VE')}).` })
    }
  }
  return { previa, tramo, antes, ahora, promedio, alertas }
}
