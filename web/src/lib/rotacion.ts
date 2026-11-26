// Rotación de neumáticos: desgaste irregular y sugerencia de rotación
// (Andrea, 26/nov/2026: "debe sugerir cómo rotarlos en función del
// desgaste irregular"). Puro, con pruebas en rotacion.test.ts.
//
// Reglas que usa (prácticas de TMC y de los fabricantes):
// - Duales: entre las dos ruedas de un par, máximo 3 mm de diferencia de
//   profundidad (CLAUDE.md del repo retail). Si un par se pasa, se
//   reacomodan las ruedas de todos los pares para juntar las parecidas, y
//   la de más banda va por fuera.
// - Eje direccional: lleva los neumáticos en mejor estado. Uno con
//   desgaste irregular, o con 3 mm o más de banda menos que el mejor
//   disponible de su misma medida, pasa atrás.
// - El desgaste irregular por sí solo no se arregla rotando: se anota la
//   causa probable (alineación, presión alta o baja) para corregirla.
import type { Plantilla } from './ejes'

export const DIF_MAX_DUALES_MM = 3
export const DIF_DESGASTE_IRREGULAR_MM = 2

export type TipoDesgaste = 'hombro' | 'centro' | 'hombros'

export interface Desgaste {
  tipo: TipoDesgaste
  dif: number
}

/** Ranura 1 y 3 = hombros, 2 = centro (como en la inspección). */
export function desgasteIrregular(ranuras: (number | null | undefined)[] | null | undefined): Desgaste | null {
  if (!ranuras) return null
  const [a, b, c] = ranuras.map((x) => (x == null ? null : Number(x)))
  if (a != null && c != null && Math.abs(a - c) >= DIF_DESGASTE_IRREGULAR_MM) return { tipo: 'hombro', dif: redondo(Math.abs(a - c)) }
  if (a != null && b != null && c != null) {
    if (b <= Math.min(a, c) - 1.5) return { tipo: 'centro', dif: redondo(Math.min(a, c) - b) }
    if (b >= Math.max(a, c) + 1.5) return { tipo: 'hombros', dif: redondo(b - Math.max(a, c)) }
  }
  return null
}

export const CAUSA_DESGASTE: Record<TipoDesgaste, string> = {
  hombro: 'gasta más un hombro: revisa la alineación (convergencia y caída); si lo desmontas del rin, móntalo volteado',
  centro: 'gasta por el centro: anda con presión alta para su carga',
  hombros: 'gasta por los dos hombros: anda con presión baja o sobrecargado',
}

function redondo(x: number) {
  return Math.round(x * 10) / 10
}

export interface InfoNeumatico {
  id: string
  /** Profundidad mínima (mm) de la última medición o del inventario */
  mm: number | null
  medida: string | null
  ranuras?: (number | null)[] | null
}

export interface Paso {
  id: string
  de: string
  a: string
  razon: string
}

export interface Sugerencia {
  /** Posición → neumático, como quedaría */
  asignacion: Map<string, string>
  pasos: Paso[]
  notas: { pos: string; texto: string }[]
}

const esDual = (posiciones: string[]) => posiciones.length === 4

export function sugerirRotacion(plantilla: Plantilla, montados: Map<string, InfoNeumatico>): Sugerencia {
  const asig = new Map<string, string>()
  for (const [p, n] of montados) asig.set(p, n.id)
  const info = new Map([...montados.values()].map((n) => [n.id, n]))
  const razones = new Map<string, string>()
  const mm = (id: string | undefined) => (id ? info.get(id)?.mm ?? null : null)

  // 1) Eje direccional (primero: lo que sale de la dirección entra en el
  // reacomodo de los duales): el primero, si es sencillo y hay más ejes
  const primero = plantilla.ejes[0]
  if (primero && !esDual(primero.posiciones) && plantilla.ejes.length > 1) {
    const atras = plantilla.ejes.slice(1).flatMap((e) => e.posiciones)
    for (const pos of primero.posiciones) {
      const id = asig.get(pos)
      if (!id) continue
      const n = info.get(id)!
      const irregular = desgasteIrregular(n.ranuras)
      // Mejor candidata atrás: misma medida, sin desgaste irregular, más banda
      const candidatas = atras
        .map((p) => ({ p, id: asig.get(p) }))
        .filter((x): x is { p: string; id: string } => !!x.id)
        .map((x) => ({ ...x, n: info.get(x.id)! }))
        .filter((x) => x.n.mm != null && (x.n.medida ?? '') === (n.medida ?? '') && !desgasteIrregular(x.n.ranuras))
        .sort((a, b) => b.n.mm! - a.n.mm!)
      const mejor = candidatas[0]
      if (!mejor) continue
      const pocaBanda = n.mm != null && mejor.n.mm! - n.mm >= DIF_MAX_DUALES_MM
      if (!irregular && !pocaBanda) continue
      if (n.mm != null && mejor.n.mm! <= n.mm && !irregular) continue
      asig.set(pos, mejor.id)
      asig.set(mejor.p, id)
      razones.set(mejor.id, `al eje direccional va la de más banda sin desgaste irregular (${mejor.n.mm} mm)`)
      razones.set(id, irregular ? `sale de la dirección por desgaste irregular (${irregular.dif} mm)` : `sale de la dirección: tenía ${n.mm} mm`)
    }
  }

  // 2) Duales: juntar ruedas parecidas, por medida
  const pares: [string, string][] = plantilla.ejes
    .filter((e) => esDual(e.posiciones))
    .flatMap((e) => [[e.posiciones[0], e.posiciones[1]] as [string, string], [e.posiciones[3], e.posiciones[2]] as [string, string]])
  const difPar = (p: [string, string], a = asig) => {
    const x = mm(a.get(p[0]))
    const y = mm(a.get(p[1]))
    return x == null || y == null ? 0 : Math.abs(x - y)
  }
  const malos = pares.filter((p) => difPar(p) > DIF_MAX_DUALES_MM)
  if (malos.length) {
    const porMedida = new Map<string, [string, string][]>()
    for (const p of pares) {
      const a = asig.get(p[0])
      const b = asig.get(p[1])
      if (!a || !b || mm(a) == null || mm(b) == null) continue
      const med = info.get(a)!.medida ?? ''
      if ((info.get(b)!.medida ?? '') !== med) continue
      porMedida.set(med, [...(porMedida.get(med) ?? []), p])
    }
    for (const grupo of porMedida.values()) {
      const ids = grupo.flatMap((p) => [asig.get(p[0])!, asig.get(p[1])!]).sort((x, y) => mm(y)! - mm(x)!)
      const nueva = new Map(asig)
      grupo.forEach((p, i) => {
        // La de más banda (más diámetro) va por fuera
        nueva.set(p[0], ids[2 * i])
        nueva.set(p[1], ids[2 * i + 1])
      })
      // Si un par ya tenía las mismas dos ruedas, se dejan donde estaban
      for (const p of grupo) {
        const antes = new Set([asig.get(p[0]), asig.get(p[1])])
        if (antes.has(nueva.get(p[0])) && antes.has(nueva.get(p[1]))) {
          nueva.set(p[0], asig.get(p[0])!)
          nueva.set(p[1], asig.get(p[1])!)
        }
      }
      const peorAntes = Math.max(...grupo.map((p) => difPar(p)))
      const peorDespues = Math.max(...grupo.map((p) => difPar(p, nueva)))
      if (peorDespues < peorAntes) {
        for (const p of grupo) {
          for (const pos of p) {
            const id = nueva.get(pos)!
            if (id !== asig.get(pos) && !razones.has(id)) {
              const d = redondo(difPar(p, nueva))
              razones.set(id, d <= DIF_MAX_DUALES_MM
                ? `juntar duales parecidos (quedan con ${d} mm de diferencia; máximo ${DIF_MAX_DUALES_MM})`
                : `lo más parejo posible con lo que hay: quedan ${d} mm de diferencia y lo ideal es máximo ${DIF_MAX_DUALES_MM}; conviene cambiar uno`)
            }
          }
        }
        for (const [k, v] of nueva) asig.set(k, v)
      }
    }
  }

  // Pasos: de dónde a dónde va cada neumático que cambió
  const dondeEstaba = new Map([...montados].map(([p, n]) => [n.id, p]))
  const pasos: Paso[] = []
  for (const [pos, id] of asig) {
    const de = dondeEstaba.get(id)!
    if (de !== pos) pasos.push({ id, de, a: pos, razon: razones.get(id) ?? 'rotación' })
  }

  const notas = [...montados]
    .map(([pos, n]) => ({ pos, d: desgasteIrregular(n.ranuras) }))
    .filter((x): x is { pos: string; d: Desgaste } => !!x.d)
    .map((x) => ({ pos: x.pos, texto: `${CAUSA_DESGASTE[x.d.tipo]} (${x.d.dif} mm)` }))

  return { asignacion: asig, pasos, notas }
}
