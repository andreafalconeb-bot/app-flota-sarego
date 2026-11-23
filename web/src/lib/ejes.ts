// Plantillas de ejes para ubicar los neumáticos. Código de posición:
// número de eje + lado (I/D) y, en ejes duales, exterior/interior:
// "2IE" = eje 2, izquierda exterior. Repuesto = "R".
export interface Eje {
  nombre: string
  /** Posiciones de izquierda a derecha */
  posiciones: string[]
}

export interface Plantilla {
  nombre: string
  ejes: Eje[]
  repuesto: boolean
}

const simple = (n: number, nombre: string): Eje => ({ nombre, posiciones: [`${n}I`, `${n}D`] })
const dual = (n: number, nombre: string): Eje => ({ nombre, posiciones: [`${n}IE`, `${n}II`, `${n}DI`, `${n}DE`] })

export const PLANTILLAS: Record<string, Plantilla> = {
  '2e_simple': { nombre: '2 ejes, ruedas sencillas', ejes: [simple(1, 'Delantero'), simple(2, 'Trasero')], repuesto: true },
  '2e_dual': { nombre: '2 ejes, trasero dual', ejes: [simple(1, 'Delantero'), dual(2, 'Trasero')], repuesto: true },
  '3e_dual': { nombre: '3 ejes, dos traseros duales', ejes: [simple(1, 'Delantero'), dual(2, 'Trasero 1'), dual(3, 'Trasero 2')], repuesto: true },
  '4e_dual': { nombre: '4 ejes, dos delanteros y dos traseros duales', ejes: [simple(1, 'Delantero 1'), simple(2, 'Delantero 2'), dual(3, 'Trasero 1'), dual(4, 'Trasero 2')], repuesto: true },
  '3e_simple': { nombre: '3 ejes, ruedas sencillas (articulado, motoniveladora)', ejes: [simple(1, 'Delantero'), simple(2, 'Central'), simple(3, 'Trasero')], repuesto: false },
  '2e_simple_sin_repuesto': { nombre: '2 ejes, ruedas sencillas, sin repuesto (cargador, retro)', ejes: [simple(1, 'Delantero'), simple(2, 'Trasero')], repuesto: false },
  ninguna: { nombre: 'Sin neumáticos (orugas o equipo fijo)', ejes: [], repuesto: false },
}

export function plantillaPorTipo(tipo: string): string {
  if (['carro', 'pickup'].includes(tipo)) return '2e_simple'
  if (['camion', 'autobus_mediano', 'autobus_grande', 'camion_roquero'].includes(tipo)) return '2e_dual'
  if (tipo === 'cisterna') return '3e_dual'
  if (['camion_articulado', 'motoniveladora'].includes(tipo)) return '3e_simple'
  if (['cargador_frontal', 'retroexcavadora', 'compactadora_tierra', 'compactadora_asfalto', 'tractor', 'montacargas'].includes(tipo)) return '2e_simple_sin_repuesto'
  return 'ninguna'
}

export function posicionesDe(codigo: string | null | undefined): string[] {
  const p = PLANTILLAS[codigo ?? ''] ?? PLANTILLAS.ninguna
  return [...p.ejes.flatMap((e) => e.posiciones), ...(p.repuesto ? ['R'] : [])]
}

const LADOS: Record<string, string> = {
  I: 'izquierda',
  D: 'derecha',
  IE: 'izquierda exterior',
  II: 'izquierda interior',
  DI: 'derecha interior',
  DE: 'derecha exterior',
}

export function nombrePosicion(pos: string): string {
  if (pos === 'R') return 'Repuesto'
  const m = /^(\d+)([A-Z]+)$/.exec(pos)
  if (!m) return pos
  return `Eje ${m[1]}, ${LADOS[m[2]] ?? m[2]}`
}
