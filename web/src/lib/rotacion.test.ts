import { describe, expect, it } from 'vitest'
import { PLANTILLAS } from './ejes'
import { desgasteIrregular, sugerirRotacion, type InfoNeumatico } from './rotacion'

const n = (id: string, mm: number | null, ranuras: (number | null)[] | null = null, medida = '295/80R22.5'): InfoNeumatico => ({ id, mm, medida, ranuras })

describe('desgasteIrregular', () => {
  it('detecta un hombro, el centro y los dos hombros', () => {
    expect(desgasteIrregular([8, 9, 11])).toEqual({ tipo: 'hombro', dif: 3 })
    expect(desgasteIrregular([10, 8, 10])).toEqual({ tipo: 'centro', dif: 2 })
    expect(desgasteIrregular([8, 10, 8])).toEqual({ tipo: 'hombros', dif: 2 })
    expect(desgasteIrregular([10, 10, 9.5])).toBeNull()
    expect(desgasteIrregular(null)).toBeNull()
  })
})

describe('sugerirRotacion', () => {
  it('no mueve nada si todo está parejo', () => {
    const m = new Map([['1I', n('a', 12)], ['1D', n('b', 12)], ['2IE', n('c', 10)], ['2II', n('d', 10)], ['2DI', n('e', 9)], ['2DE', n('f', 9)]])
    const s = sugerirRotacion(PLANTILLAS['2e_dual'], m)
    expect(s.pasos).toEqual([])
  })

  it('junta duales parecidos y la de más banda va por fuera', () => {
    const m = new Map([['2IE', n('a', 14)], ['2II', n('b', 8)], ['2DI', n('c', 13)], ['2DE', n('d', 7)]])
    const s = sugerirRotacion(PLANTILLAS['2e_dual'], m)
    // Pares: (2IE, 2II) y (2DE, 2DI)
    expect([s.asignacion.get('2IE'), s.asignacion.get('2II')]).toEqual(['a', 'c'])
    expect([s.asignacion.get('2DE'), s.asignacion.get('2DI')]).toEqual(['b', 'd'])
    expect(s.pasos.length).toBeGreaterThan(0)
    expect(s.pasos.every((p) => p.razon.includes('duales'))).toBe(true)
  })

  it('no junta duales de medidas distintas', () => {
    const m = new Map([['2IE', n('a', 14)], ['2II', n('b', 8, null, '11R22.5')], ['2DI', n('c', 13)], ['2DE', n('d', 7, null, '11R22.5')]])
    expect(sugerirRotacion(PLANTILLAS['2e_dual'], m).pasos).toEqual([])
  })

  it('saca de la dirección un neumático con desgaste irregular', () => {
    const m = new Map([['1I', n('a', 9, [9, 10, 12])], ['1D', n('b', 12)], ['2I', n('c', 11)], ['2D', n('d', 10)]])
    const s = sugerirRotacion(PLANTILLAS['2e_simple'], m)
    expect(s.asignacion.get('1I')).toBe('c')
    expect(s.asignacion.get('2I')).toBe('a')
    expect(s.notas[0].pos).toBe('1I')
    expect(s.notas[0].texto).toContain('alineación')
  })

  it('pone en la dirección la de más banda si hay 3 mm o más de diferencia', () => {
    const m = new Map([['1I', n('a', 6)], ['1D', n('b', 12)], ['2I', n('c', 11)], ['2D', n('d', 10)]])
    const s = sugerirRotacion(PLANTILLAS['2e_simple'], m)
    expect(s.asignacion.get('1I')).toBe('c')
    expect(s.asignacion.get('2I')).toBe('a')
  })
})

describe('sugerirRotacion, dirección y duales juntos', () => {
  it('el que sale de la dirección entra al reacomodo de los duales', () => {
    const m = new Map([
      ['1I', n('t1', 7, [7, 9, 10])], ['1D', n('t2', 11)],
      ['2IE', n('t3', 14)], ['2II', n('t4', 8)], ['2DI', n('t5', 13)], ['2DE', n('t6', 7)],
    ])
    const s = sugerirRotacion(PLANTILLAS['2e_dual'], m)
    expect(s.asignacion.get('1I')).toBe('t3')
    const mm = (p: string) => m.get([...m].find(([, x]) => x.id === s.asignacion.get(p))![0])!.mm!
    // Quedan 13, 8, 7 y 7 mm: lo mejor posible es 13+8 y 7+7
    expect([mm('2IE'), mm('2II')]).toEqual([13, 8])
    expect(Math.abs(mm('2DE') - mm('2DI'))).toBe(0)
  })
})
