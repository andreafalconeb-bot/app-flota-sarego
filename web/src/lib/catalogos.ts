// Catálogos de Flota SAREGO. Los tipos de activo y los componentes son
// los mismos de la app B2B (migraciones 0122-0124), para que un equipo
// que SAREGO ya registró en un proyecto B2B se llame igual aquí.
export type Mapa = Record<string, string>

export const GRUPOS_TIPO: { grupo: string; tipos: Mapa }[] = [
  {
    grupo: 'Vehículos',
    tipos: {
      carro: 'Carro',
      pickup: 'Pickup',
      camion: 'Camión',
      autobus_mediano: 'Autobús mediano',
      autobus_grande: 'Autobús grande',
      cisterna: 'Cisterna',
    },
  },
  {
    grupo: 'Maquinaria pesada',
    tipos: {
      camion_articulado: 'Camión articulado',
      camion_roquero: 'Camión roquero',
      cargador_frontal: 'Cargador frontal',
      excavadora: 'Excavadora',
      retroexcavadora: 'Retroexcavadora',
      motoniveladora: 'Motoniveladora',
      compactadora_asfalto: 'Compactadora de asfalto',
      compactadora_tierra: 'Compactadora de tierra',
      tractor: 'Tractor',
      montacargas: 'Montacargas',
      maquinaria_pesada: 'Otra maquinaria pesada',
    },
  },
  {
    grupo: 'Planta y equipos fijos',
    tipos: {
      generador: 'Generador',
      compresor: 'Compresor',
      bomba: 'Bomba',
      otro: 'Otro',
    },
  },
]

export const TIPOS: Mapa = Object.assign({}, ...GRUPOS_TIPO.map((g) => g.tipos))

export const COMPONENTES: Mapa = {
  motor: 'Motor',
  transmision: 'Transmisión (caja)',
  caja_transferencia: 'Caja de transferencia',
  convertidor_par: 'Convertidor de par',
  diferencial: 'Diferencial',
  mando_final: 'Mando final',
  mando_final_delantero: 'Mando final delantero',
  mando_final_trasero: 'Mando final trasero',
  sistema_giro: 'Sistema de giro (swing)',
  motor_traslacion: 'Motor de traslación',
  hidraulico: 'Hidráulico',
  direccion: 'Dirección hidráulica',
  frenos: 'Frenos (líquido)',
  refrigerante: 'Refrigerante',
  engrase: 'Engrase (puntos de grasa)',
  // Los de planta que vienen de los puntos de muestreo de la B2B
  reductor: 'Reductor',
  compresor: 'Compresor',
  turbina: 'Turbina',
  transformador: 'Transformador',
  cojinete: 'Cojinete',
  otro: 'Otro',
}

/** Compartimientos que se proponen al crear un activo, según su tipo. */
export function compartimientosSugeridos(tipo: string): string[] {
  if (['carro', 'pickup'].includes(tipo)) return ['motor', 'transmision', 'refrigerante']
  if (['camion', 'autobus_mediano', 'autobus_grande', 'cisterna'].includes(tipo)) return ['motor', 'transmision', 'diferencial', 'refrigerante', 'engrase']
  if (['camion_articulado', 'camion_roquero'].includes(tipo)) return ['motor', 'transmision', 'convertidor_par', 'diferencial', 'mando_final', 'hidraulico', 'engrase']
  if (['cargador_frontal', 'motoniveladora', 'retroexcavadora', 'tractor'].includes(tipo)) return ['motor', 'transmision', 'diferencial', 'mando_final', 'hidraulico', 'engrase']
  if (tipo === 'excavadora') return ['motor', 'hidraulico', 'sistema_giro', 'motor_traslacion', 'mando_final', 'engrase']
  if (['compactadora_asfalto', 'compactadora_tierra'].includes(tipo)) return ['motor', 'hidraulico', 'engrase']
  return ['motor']
}

export const COMBUSTIBLES: Mapa = { diesel: 'Diésel', gasolina: 'Gasolina', gas: 'Gas', electrico: 'Eléctrico', otro: 'Otro' }

export const MEDIDORES: Mapa = { km: 'Odómetro (km)', horas: 'Horómetro (horas)', km_horas: 'Ambos' }

export const TIPOS_SERVICIO: Mapa = {
  cambio: 'Cambio de aceite',
  relleno: 'Relleno',
  filtro: 'Solo filtro',
  engrase: 'Engrase',
  muestra: 'Toma de muestra',
}

// Andrea (formulario 2): los dos aditivos de VP Racing que vende SAREGO
export const ADITIVOS: Mapa = {
  vp_diesel_all_in_one: 'VP Racing Diesel All in One',
  vp_fuel_system_cleaner: 'VP Racing Fuel System Cleaner',
  otro: 'Otro aditivo',
}

export const CUENTAS: Mapa = {
  motor: 'Motor',
  refrigeracion: 'Refrigeración',
  combustible_inyeccion: 'Combustible e inyección',
  admision_escape: 'Admisión y escape',
  electrico: 'Eléctrico',
  transmision: 'Transmisión',
  tren_motriz: 'Tren motriz',
  frenos: 'Frenos',
  direccion_suspension: 'Dirección y suspensión',
  hidraulico: 'Hidráulico',
  neumaticos_rines: 'Neumáticos y rines',
  carroceria: 'Carrocería',
  aire_acondicionado: 'Aire acondicionado',
  implementos: 'Implementos',
  engrase: 'Engrase',
}

export const TIPOS_COSTO: Mapa = { repuesto: 'Repuesto', mano_obra: 'Mano de obra', servicio: 'Servicio de taller', otro: 'Otro' }

export const ESTADOS_NEUMATICO: Mapa = { por_recibir: 'Facturado, por recibir', inventario: 'En inventario', montado: 'Montado', reparacion: 'En reparación', renovacion: 'En renovación', desecho: 'Desechado' }

export const VALVULAS: Mapa = { ok: 'Bien', sin_tapa: 'Sin tapa', danada: 'Dañada', extension_floja: 'Extensión floja' }

export const ROLES: Mapa = { admin: 'Administrador', operador: 'Operador', consulta: 'Solo consulta' }

export const SUCURSALES: Mapa = { '01': 'Caracas', '02': 'Valencia', '03': 'Ciudad Bolívar' }

export function etiqueta(m: Mapa, v: string | null | undefined): string {
  if (!v) return '—'
  return m[v] ?? v
}

/** Razones de desecho de un neumático (Andrea, 23/nov/2026). */
export const RAZONES_DESECHO: Mapa = {
  desgaste_completo: 'Desgaste completo',
  falla_carcasa: 'Falla de carcasa',
  mala_reparacion: 'Mala reparación que causó la falla de carcasa',
  impacto_corte: 'Daño por impacto o corte',
  baja_presion: 'Rodado con baja presión',
  desgaste_irregular: 'Desgaste irregular',
}
