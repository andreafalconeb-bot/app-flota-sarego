// Cálculos de Flota SAREGO. Funciones puras, con pruebas en
// calculos.test.ts.
import type { Activo, Carga, Compartimiento, Costo, Medidor, Plan, Servicio } from './tipos'

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
