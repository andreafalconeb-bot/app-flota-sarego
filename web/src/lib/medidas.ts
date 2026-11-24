// Medidas de neumáticos más comunes en Venezuela (Andrea, 24/nov/2026):
// plantilla al escribir la medida de un neumático o de una compra. En las
// de camión van el índice de carga (sencillo/dual) y la presión máxima
// TÍPICOS de la versión más vendida; la calculadora de presión los usa de
// punto de partida, pero siempre hay que verificarlos en el costado del
// neumático (cambian con la capacidad de carga / número de lonas).

export interface Medida {
  medida: string
  grupo: string
  /** Índice de carga típico, "sencillo/dual" */
  indice?: string
  /** Presión máxima típica en frío (psi) */
  presionMax?: number
  nota?: string
}

export const MEDIDAS: Medida[] = [
  // Camión y autobús, radial sin cámara (rin 22.5 / 24.5)
  { medida: '295/80R22.5', grupo: 'Camión radial', indice: '152/148', presionMax: 120 },
  { medida: '11R22.5', grupo: 'Camión radial', indice: '144/142', presionMax: 105, nota: '16 lonas: 146/143 a 120 psi' },
  { medida: '12R22.5', grupo: 'Camión radial', indice: '152/148', presionMax: 120 },
  { medida: '275/80R22.5', grupo: 'Camión radial', indice: '149/146', presionMax: 120 },
  { medida: '275/70R22.5', grupo: 'Camión radial', indice: '148/145', presionMax: 120, nota: 'Autobús' },
  { medida: '315/80R22.5', grupo: 'Camión radial', indice: '156/150', presionMax: 120 },
  { medida: '385/65R22.5', grupo: 'Camión radial', indice: '160', presionMax: 120, nota: 'Remolque, solo sencillo' },
  { medida: '11R24.5', grupo: 'Camión radial', indice: '146/143', presionMax: 105 },
  // Camión con cámara (rin 20)
  { medida: '12.00R20', grupo: 'Camión rin 20', indice: '154/150', presionMax: 120 },
  { medida: '11.00R20', grupo: 'Camión rin 20', indice: '150/146', presionMax: 120 },
  { medida: '10.00R20', grupo: 'Camión rin 20', indice: '146/143', presionMax: 115 },
  { medida: '9.00R20', grupo: 'Camión rin 20', indice: '144/142', presionMax: 115 },
  { medida: '8.25R20', grupo: 'Camión rin 20', indice: '139/137', presionMax: 110 },
  { medida: '12.00-20', grupo: 'Camión rin 20', nota: 'Convencional (lonas)' },
  { medida: '11.00-20', grupo: 'Camión rin 20', nota: 'Convencional (lonas)' },
  { medida: '10.00-20', grupo: 'Camión rin 20', nota: 'Convencional (lonas)' },
  { medida: '9.00-20', grupo: 'Camión rin 20', nota: 'Convencional (lonas)' },
  { medida: '8.25-20', grupo: 'Camión rin 20', nota: 'Convencional (lonas)' },
  // Camión liviano (rin 16 / 17.5 / 19.5)
  { medida: '215/75R17.5', grupo: 'Camión liviano', indice: '135/133', presionMax: 120 },
  { medida: '235/75R17.5', grupo: 'Camión liviano', indice: '143/141', presionMax: 120 },
  { medida: '225/70R19.5', grupo: 'Camión liviano', indice: '128/126', presionMax: 95 },
  { medida: '245/70R19.5', grupo: 'Camión liviano', indice: '136/134', presionMax: 110 },
  { medida: '7.50R16', grupo: 'Camión liviano', indice: '122/118', presionMax: 110 },
  { medida: '7.00R16', grupo: 'Camión liviano', indice: '117/116', presionMax: 100 },
  { medida: '7.50-16', grupo: 'Camión liviano', nota: 'Convencional (lonas)' },
  { medida: '7.00-16', grupo: 'Camión liviano', nota: 'Convencional (lonas)' },
  // Maquinaria pesada (OTR): sin índice de carga estándar, va por estrellas o lonas
  { medida: '17.5-25', grupo: 'Maquinaria (OTR)', nota: 'Cargador, motoniveladora' },
  { medida: '20.5-25', grupo: 'Maquinaria (OTR)', nota: 'Cargador' },
  { medida: '23.5-25', grupo: 'Maquinaria (OTR)', nota: 'Cargador, camión articulado' },
  { medida: '26.5-25', grupo: 'Maquinaria (OTR)', nota: 'Cargador grande' },
  { medida: '29.5-25', grupo: 'Maquinaria (OTR)', nota: 'Cargador grande' },
  { medida: '14.00-24', grupo: 'Maquinaria (OTR)', nota: 'Motoniveladora' },
  { medida: '13.00-24', grupo: 'Maquinaria (OTR)', nota: 'Motoniveladora' },
  { medida: '17.5R25', grupo: 'Maquinaria (OTR)', nota: 'Radial' },
  { medida: '20.5R25', grupo: 'Maquinaria (OTR)', nota: 'Radial' },
  { medida: '23.5R25', grupo: 'Maquinaria (OTR)', nota: 'Radial' },
  { medida: '12.5/80-18', grupo: 'Maquinaria (OTR)', nota: 'Retroexcavadora, delantero' },
  { medida: '19.5L-24', grupo: 'Maquinaria (OTR)', nota: 'Retroexcavadora, trasero' },
  { medida: '17.5L-24', grupo: 'Maquinaria (OTR)', nota: 'Retroexcavadora, trasero' },
  { medida: '16.9-28', grupo: 'Maquinaria (OTR)', nota: 'Retroexcavadora, trasero' },
  { medida: '10-16.5', grupo: 'Maquinaria (OTR)', nota: 'Minicargador' },
  { medida: '12-16.5', grupo: 'Maquinaria (OTR)', nota: 'Minicargador' },
  // Agrícola
  { medida: '18.4-34', grupo: 'Agrícola', nota: 'Tractor, trasero' },
  { medida: '18.4-30', grupo: 'Agrícola', nota: 'Tractor, trasero' },
  { medida: '14.9-28', grupo: 'Agrícola', nota: 'Tractor' },
  { medida: '7.50-16 AG', grupo: 'Agrícola', nota: 'Tractor, delantero' },
  // Montacargas
  { medida: '6.50-10', grupo: 'Montacargas' },
  { medida: '7.00-12', grupo: 'Montacargas' },
  { medida: '28x9-15', grupo: 'Montacargas' },
  { medida: '250-15', grupo: 'Montacargas' },
  { medida: '18x7-8', grupo: 'Montacargas' },
  { medida: '5.00-8', grupo: 'Montacargas' },
]

export function buscarMedida(texto: string | null | undefined): Medida | null {
  const t = (texto ?? '').replace(/\s/g, '').toUpperCase()
  if (!t) return null
  return MEDIDAS.find((m) => m.medida.replace(/\s/g, '').toUpperCase() === t) ?? null
}

/** Lista de sugerencias para un <input list="medidas-comunes">. */
export const ID_LISTA_MEDIDAS = 'medidas-comunes'
