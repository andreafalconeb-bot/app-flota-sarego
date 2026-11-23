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

/** Funciones extendidas: solo en la versión pago (Andrea, formulario 2). */
const SOLO_PAGO: Funcion[] = ['sin_conexion', 'combustible', 'costo_por_hora', 'intervalo_sugerido', 'informe_aditivo']

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
