export type Plan = 'gratis' | 'pago'
export type RolFlota = 'admin' | 'operador' | 'consulta'
export type Medidor = 'km' | 'horas' | 'km_horas'

export interface Empresa {
  id: string
  nombre: string
  rif: string | null
  telefono: string | null
  direccion: string | null
  sucursal: '01' | '02' | '03' | null
  plan: Plan
  max_activos: number
  dias_bloqueo: number
  dias_aviso: number
  ultima_sincronizacion_at: string | null
  ingeniero_id: string | null
  b2b_proyecto_id: string | null
  cliente_erp_id: string | null
  activa: boolean
  notas: string | null
  created_at: string
}

export interface EmpresaEstado extends Empresa {
  activos: number
  usuarios: number
  dias_sin_sincronizar: number | null
  estado_sincronizacion: 'ok' | 'aviso' | 'bloqueada'
  facturas_por_recibir?: number
}

export interface Membresia {
  empresa_id: string
  rol: RolFlota
  activo: boolean
  terminos_version: number | null
}

export interface UsuarioEmpresa {
  user_id: string
  nombre: string
  email: string | null
  rol: RolFlota
  activo: boolean
  terminos_version: number | null
  terminos_aceptados_at: string | null
}

interface Base {
  id: string
  empresa_id: string
  created_at?: string
}

export interface Sitio extends Base {
  nombre: string
  direccion: string | null
  lat: number | null
  lng: number | null
}

export interface Activo extends Base {
  sitio_id: string | null
  codigo: string
  tipo: string
  marca: string | null
  modelo: string | null
  anio: number | null
  placa: string | null
  serial: string | null
  combustible: 'diesel' | 'gasolina' | 'gas' | 'electrico' | 'otro'
  medidor: Medidor
  km_actual: number | null
  horas_actual: number | null
  lectura_at: string | null
  configuracion: string | null
  aditivo: string | null
  aditivo_desde: string | null
  /** Presión ideal por eje según el trabajo del activo: {"1": 110, "2": 100, "R": 110} (0136) */
  presiones_eje?: Record<string, number>
  presiones_nota?: string | null
  presiones_at?: string | null
  presiones_por?: string | null
  activo: boolean
  notas: string | null
}

export interface Lectura extends Base {
  activo_id: string
  fecha: string
  km: number | null
  horas: number | null
  notas: string | null
  registrado_por?: string | null
}

export interface Compartimiento extends Base {
  activo_id: string
  componente: string
  capacidad_l: number | null
  /** Fluido en uso (el del último cambio) y su SKU de SAREGO (null = otro proveedor) */
  producto: string | null
  producto_codigo?: string | null
  intervalo_km: number | null
  intervalo_horas: number | null
  intervalo_dias: number | null
  sugerido_km: number | null
  sugerido_horas: number | null
  sugerencia_nota: string | null
  sugerido_por: string | null
  sugerido_at: string | null
  notas: string | null
}

export type TipoServicio = 'cambio' | 'relleno' | 'filtro' | 'engrase' | 'muestra'

export interface Servicio extends Base {
  activo_id: string
  compartimiento_id: string | null
  fecha: string
  tipo: TipoServicio
  km: number | null
  horas: number | null
  producto: string | null
  /** SKU de SAREGO del producto (null = otro proveedor) */
  producto_codigo?: string | null
  litros: number | null
  filtros: string | null
  costo_lubricante: number
  costo_filtros: number
  costo_mano_obra: number
  costo_otros: number
  /** Columna calculada en la base; no se envía al guardar */
  costo_total?: number
  notas: string | null
  registrado_por?: string | null
}

export interface Carga extends Base {
  activo_id: string
  fecha: string
  litros: number
  costo_total: number | null
  km: number | null
  horas: number | null
  tanque_lleno: boolean
  con_aditivo: boolean
  aditivo: string | null
  aditivo_ml: number | null
  proveedor: string | null
  notas: string | null
  registrado_por?: string | null
}

export interface Costo extends Base {
  activo_id: string | null
  fecha: string
  cuenta: string
  tipo: 'repuesto' | 'mano_obra' | 'servicio' | 'otro'
  descripcion: string
  proveedor: string | null
  factura: string | null
  monto: number
  km: number | null
  horas: number | null
  registrado_por?: string | null
}

export type EstadoNeumatico = 'por_recibir' | 'inventario' | 'montado' | 'reparacion' | 'renovacion' | 'desecho'

/** Factura de neumáticos que SAREGO le vende al cliente (migración 0129). */
export interface Factura extends Base {
  numero: string
  fecha: string
  estado: 'por_recibir' | 'recibida' | 'anulada'
  notas: string | null
  cargada_por?: string | null
  recibida_por?: string | null
  recibida_at?: string | null
  nota_recepcion?: string | null
}

export interface Neumatico extends Base {
  /** Serial propio, consecutivo por empresa; lo pone la base (null hasta subir a la nube) */
  numero?: number | null
  /** Marca a fuego: opcional y se puede repetir */
  marca_fuego: string | null
  /** Factura de SAREGO de donde vino, y código del artículo en el ERP */
  factura_id?: string | null
  articulo_codigo?: string | null
  /** Veces que se le renovó la banda (0 = original); el serial de la carcasa no cambia */
  renovaciones?: number
  razon_desecho?: string | null
  /** Construcción y capacidad de carga (0137): lo que define al neumático */
  construccion?: 'tubeless' | 'tube_type' | null
  indice_carga?: string | null
  /** Número de lonas (desaconsejado: mejor el índice de carga) */
  lonas?: number | null
  presion_max_psi?: number | null
  marca: string | null
  modelo: string | null
  medida: string | null
  dot: string | null
  profundidad_inicial_mm: number | null
  presion_ideal_psi: number | null
  costo: number | null
  fecha_compra: string | null
  estado: EstadoNeumatico
  activo_id: string | null
  posicion: string | null
  montado_at: string | null
  km_montaje: number | null
  horas_montaje: number | null
  notas: string | null
}

export interface Movimiento extends Base {
  neumatico_id: string
  tipo: 'montaje' | 'desmontaje' | 'rotacion' | 'reparacion' | 'renovacion' | 'desecho'
  razon_desecho?: string | null
  activo_id: string | null
  posicion: string | null
  posicion_anterior: string | null
  fecha: string
  km: number | null
  horas: number | null
  profundidad_mm: number | null
  motivo: string | null
  registrado_por?: string | null
}

export interface Inspeccion extends Base {
  activo_id: string
  fecha: string
  km: number | null
  horas: number | null
  notas: string | null
  registrado_por?: string | null
}

export interface InspeccionNeumatico {
  id: string
  empresa_id: string
  inspeccion_id: string
  neumatico_id: string | null
  posicion: string
  /** Presión ENCONTRADA: con la que rodó el vehículo */
  presion_psi: number | null
  /** Presión DEJADA después de ajustar (0133); igual a la encontrada si no se ajustó */
  presion_dejada_psi?: number | null
  presion_ideal_psi: number | null
  profundidades_mm: number[] | null
  profundidad_min_mm: number | null
  valvula: 'ok' | 'sin_tapa' | 'danada' | 'extension_floja' | null
  observacion: string | null
}

/** Todo lo de una empresa, tal como queda en la base local. */
export interface Datos {
  sitios: Sitio[]
  activos: Activo[]
  lecturas: Lectura[]
  compartimientos: Compartimiento[]
  servicios: Servicio[]
  combustible: Carga[]
  costos: Costo[]
  facturas: Factura[]
  neumaticos: Neumatico[]
  movimientos: Movimiento[]
  inspecciones: Inspeccion[]
  inspeccionNeumaticos: InspeccionNeumatico[]
}

export type Coleccion = keyof Datos

export const TABLAS: Record<Coleccion, string> = {
  sitios: 'flota_sitios',
  activos: 'flota_activos',
  lecturas: 'flota_lecturas',
  compartimientos: 'flota_compartimientos',
  servicios: 'flota_servicios',
  combustible: 'flota_combustible',
  costos: 'flota_costos',
  facturas: 'flota_facturas',
  neumaticos: 'flota_neumaticos',
  movimientos: 'flota_neumatico_movimientos',
  inspecciones: 'flota_inspecciones',
  inspeccionNeumaticos: 'flota_inspeccion_neumaticos',
}

/** Orden de subida y bajada: primero lo que otras tablas referencian. */
export const ORDEN_COLECCIONES: Coleccion[] = [
  'sitios', 'activos', 'lecturas', 'compartimientos', 'servicios', 'combustible',
  'costos', 'facturas', 'neumaticos', 'movimientos', 'inspecciones', 'inspeccionNeumaticos',
]

export function datosVacios(): Datos {
  return {
    sitios: [], activos: [], lecturas: [], compartimientos: [], servicios: [], combustible: [],
    costos: [], facturas: [], neumaticos: [], movimientos: [], inspecciones: [], inspeccionNeumaticos: [],
  }
}
