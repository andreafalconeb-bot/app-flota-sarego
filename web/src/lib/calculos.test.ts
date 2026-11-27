import { describe, expect, it } from 'vitest'
import { compararAditivo, costoPorUso, disponible, estadoBloqueo, estadoPresion, estadoProfundidad, gastoPorCuenta, marcasParaLote, condicionNeumatico, resumenInventario, claseNeumatico, profundidadMaxima, errorProfundidad, fugaLenta, presionActual, presionIdeal, presionSugerida, kgPorIndice, datosCaucho, proximoCambio, tramosConsumo, estadoLectura, DIAS_LECTURA, costoOperacion, proyeccionNeumatico } from './calculos'
import { aplicar } from './datos'
import { datosVacios, type Activo, type Carga, type Compartimiento, type Costo, type InspeccionNeumatico, type Movimiento, type Neumatico, type Servicio } from './tipos'

const DIA = 86_400_000
const activo = (x: Partial<Activo> = {}): Activo => ({
  id: 'a1', empresa_id: 'e', sitio_id: null, codigo: 'U-01', tipo: 'camion', marca: null, modelo: null, anio: null,
  placa: null, serial: null, combustible: 'diesel', medidor: 'km', km_actual: 120000, horas_actual: null, lectura_at: null,
  configuracion: null, aditivo: null, aditivo_desde: null, activo: true, notas: null, ...x,
})
const comp = (x: Partial<Compartimiento> = {}): Compartimiento => ({
  id: 'c1', empresa_id: 'e', activo_id: 'a1', componente: 'motor', capacidad_l: 38, producto: null, intervalo_km: 10000,
  intervalo_horas: null, intervalo_dias: null, sugerido_km: null, sugerido_horas: null, sugerencia_nota: null,
  sugerido_por: null, sugerido_at: null, notas: null, ...x,
})
const serv = (x: Partial<Servicio>): Servicio => ({
  id: crypto.randomUUID(), empresa_id: 'e', activo_id: 'a1', compartimiento_id: 'c1', fecha: '2026-10-01', tipo: 'cambio',
  km: null, horas: null, producto: null, litros: null, filtros: null, costo_lubricante: 0, costo_filtros: 0,
  costo_mano_obra: 0, costo_otros: 0, notas: null, ...x,
})
const carga = (fecha: string, km: number, litros: number, x: Partial<Carga> = {}): Carga => ({
  id: crypto.randomUUID(), empresa_id: 'e', activo_id: 'a1', fecha, litros, costo_total: litros * 0.5, km, horas: null,
  tanque_lleno: true, con_aditivo: false, aditivo: null, aditivo_ml: null, proveedor: null, notas: null, ...x,
})

describe('estadoBloqueo', () => {
  const ahora = Date.parse('2026-11-23T12:00:00Z')
  const hace = (d: number) => new Date(ahora - d * DIA).toISOString()
  it('la versión gratis nunca se tranca', () => {
    expect(estadoBloqueo({ plan: 'gratis', ultimaSync: hace(90), diasBloqueo: 30, diasAviso: 7, ahora }).estado).toBe('ok')
  })
  it('avisa en los últimos días y se tranca pasado el plazo', () => {
    expect(estadoBloqueo({ plan: 'pago', ultimaSync: hace(10), diasBloqueo: 30, diasAviso: 7, ahora }).estado).toBe('ok')
    const aviso = estadoBloqueo({ plan: 'pago', ultimaSync: hace(25), diasBloqueo: 30, diasAviso: 7, ahora })
    expect(aviso.estado).toBe('aviso')
    expect(aviso.diasRestantes).toBe(5)
    expect(estadoBloqueo({ plan: 'pago', ultimaSync: hace(31), diasBloqueo: 30, diasAviso: 7, ahora }).estado).toBe('bloqueada')
  })
  it('sin copia local pide sincronizar', () => {
    expect(estadoBloqueo({ plan: 'pago', ultimaSync: null, diasBloqueo: 30, diasAviso: 7, ahora }).estado).toBe('sin_copia')
  })
})

describe('disponible', () => {
  it('lo extendido solo en la versión pago', () => {
    expect(disponible('gratis', 'combustible')).toBe(false)
    expect(disponible('pago', 'combustible')).toBe(true)
  })
  it('las alarmas solo en la versión pago', () => {
    expect(disponible('gratis', 'alarmas')).toBe(false)
    expect(disponible('pago', 'alarmas')).toBe(true)
  })
})

describe('proximoCambio', () => {
  it('calcula lo que falta para el próximo cambio', () => {
    const p = proximoCambio(comp(), activo({ km_actual: 118000 }), [serv({ km: 100000, fecha: '2026-01-01' }), serv({ km: 110000, fecha: '2026-06-01' })])
    expect(p.vence).toBe(120000)
    expect(p.restante).toBe(2000)
    expect(p.estado).toBe('ok')
  })
  it('marca próximo con menos del 10 % y vencido al pasarse', () => {
    expect(proximoCambio(comp(), activo({ km_actual: 119500 }), [serv({ km: 110000 })]).estado).toBe('proximo')
    expect(proximoCambio(comp(), activo({ km_actual: 121000 }), [serv({ km: 110000 })]).estado).toBe('vencido')
  })
  it('vence por días aunque no llegue al kilometraje', () => {
    const p = proximoCambio(comp({ intervalo_dias: 180 }), activo({ km_actual: 111000 }), [serv({ km: 110000, fecha: '2026-01-01' })], Date.parse('2026-11-23'))
    expect(p.estado).toBe('vencido')
  })
  it('sin servicios no hay datos', () => {
    expect(proximoCambio(comp(), activo(), []).estado).toBe('sin_datos')
  })
})

describe('costoPorUso', () => {
  it('divide lo gastado entre lo trabajado desde el primer servicio', () => {
    const r = costoPorUso(
      [serv({ km: 100000, costo_lubricante: 200, costo_filtros: 50 }), serv({ km: 110000, costo_lubricante: 200, costo_mano_obra: 50 })],
      activo({ km_actual: 120000 }),
    )
    expect(r?.total).toBe(500)
    expect(r?.uso).toBe(20000)
    expect(r?.porUnidad).toBeCloseTo(0.025)
  })
  it('en horas para equipos con horómetro', () => {
    const r = costoPorUso([serv({ horas: 1000, costo_lubricante: 300 })], activo({ medidor: 'horas', horas_actual: 1250, km_actual: null }))
    expect(r?.unidad).toBe('horas')
    expect(r?.porUnidad).toBeCloseTo(1.2)
  })
  it('null sin recorrido', () => {
    expect(costoPorUso([serv({ km: 120000, costo_lubricante: 100 })], activo({ km_actual: 120000 }))).toBeNull()
  })
})

describe('tramosConsumo', () => {
  it('suma las cargas parciales al tramo entre llenados completos', () => {
    const t = tramosConsumo(
      [carga('2026-01-01', 1000, 50), carga('2026-01-03', 1200, 30, { tanque_lleno: false }), carga('2026-01-05', 1500, 70)],
      'km',
    )
    expect(t).toHaveLength(1)
    expect(t[0].litros).toBe(100)
    expect(t[0].uso).toBe(500)
    expect(t[0].consumo).toBe(20)
  })
  it('ignora lo anterior al primer tanque lleno', () => {
    expect(tramosConsumo([carga('2026-01-01', 900, 10, { tanque_lleno: false }), carga('2026-01-02', 1000, 50)], 'km')).toHaveLength(0)
  })
})

describe('compararAditivo', () => {
  it('compara los 2 meses antes con el periodo con aditivo', () => {
    // Antes: 30 L/100 km. Con aditivo: 25.5 L/100 km (15 % menos)
    const cargas = [
      carga('2026-07-01', 10000, 100),
      carga('2026-07-20', 11000, 300),
      carga('2026-08-25', 12000, 300),
      carga('2026-09-05', 13000, 255, { con_aditivo: true }),
      carga('2026-09-25', 14000, 255, { con_aditivo: true }),
    ]
    const costos: Costo[] = [
      { id: 'x', empresa_id: 'e', activo_id: 'a1', fecha: '2026-08-10', cuenta: 'combustible_inyeccion', tipo: 'repuesto', descripcion: 'Inyector', proveedor: null, factura: null, monto: 400, km: null, horas: null },
      { id: 'y', empresa_id: 'e', activo_id: 'a1', fecha: '2026-09-20', cuenta: 'combustible_inyeccion', tipo: 'repuesto', descripcion: 'Filtro', proveedor: null, factura: null, monto: 100, km: null, horas: null },
    ]
    const r = compararAditivo({ cargas, costos, unidad: 'km', aditivoDesde: '2026-09-01', hoy: '2026-10-01' })
    expect(r.base.consumo).toBeCloseTo(30)
    expect(r.conAditivo.consumo).toBeCloseTo(25.5)
    expect(r.ahorro).toBeCloseTo(0.15)
    // El tramo 25/ago-5/sep cruza el inicio del aditivo: no cuenta en ninguno
    expect(r.base.tramos).toBe(2)
    expect(r.conAditivo.tramos).toBe(1)
    expect(r.litrosAhorrados).toBeCloseTo(45)
    expect(r.dineroAhorrado).toBeCloseTo(22.5)
    expect(r.inyeccionBase).toBeCloseTo(0.2)
    expect(r.inyeccionCon).toBeCloseTo(0.1)
    expect(r.ahorroInyeccion).toBeCloseTo(0.5)
  })
})

describe('neumáticos', () => {
  it('presión: 10 % baja alerta, 20 % crítico', () => {
    expect(estadoPresion(100, 105)).toBe('ok')
    expect(estadoPresion(90, 100)).toBe('alerta')
    expect(estadoPresion(80, 100)).toBe('critico')
    expect(estadoPresion(null, 100)).toBe('sin_dato')
  })
  it('profundidad: 5 mm planificar, 3 mm retirar', () => {
    expect(estadoProfundidad(8)).toBe('ok')
    expect(estadoProfundidad(5)).toBe('alerta')
    expect(estadoProfundidad(3)).toBe('critico')
  })
})

describe('gastoPorCuenta', () => {
  it('suma facturas y servicios a la cuenta de su compartimiento', () => {
    const m = gastoPorCuenta(
      [{ id: 'x', empresa_id: 'e', activo_id: 'a1', fecha: '2026-10-01', cuenta: 'frenos', tipo: 'repuesto', descripcion: 'Pastillas', proveedor: null, factura: null, monto: 180, km: null, horas: null }],
      [serv({ costo_lubricante: 100 }), serv({ compartimiento_id: 'c2', costo_lubricante: 60 })],
      [comp(), comp({ id: 'c2', componente: 'hidraulico' })],
    )
    expect(m.get('frenos')).toBe(180)
    expect(m.get('motor')).toBe(100)
    expect(m.get('hidraulico')).toBe(60)
  })
})

describe('aplicar', () => {
  it('inserta, actualiza y borra en la copia local', () => {
    let d = datosVacios()
    d = aplicar(d, { coleccion: 'activos', op: 'upsert', id: 'a1', fila: { codigo: 'U-01' } })
    d = aplicar(d, { coleccion: 'activos', op: 'upsert', id: 'a1', fila: { placa: 'A1B' } })
    expect(d.activos).toEqual([{ id: 'a1', codigo: 'U-01', placa: 'A1B' }])
    d = aplicar(d, { coleccion: 'activos', op: 'delete', id: 'a1' })
    expect(d.activos).toHaveLength(0)
  })
})

describe('marcasParaLote', () => {
  it('en serie si termina en número, respetando los ceros', () => {
    expect(marcasParaLote('tg001', 3)).toEqual(['TG001', 'TG002', 'TG003'])
    expect(marcasParaLote('A-98', 3)).toEqual(['A-98', 'A-99', 'A-100'])
  })
  it('la misma si no termina en número, y vacía si no hay marca', () => {
    expect(marcasParaLote('TGX', 2)).toEqual(['TGX', 'TGX'])
    expect(marcasParaLote(' ', 3)).toEqual([null, null, null])
    expect(marcasParaLote('TG010', 1)).toEqual(['TG010'])
  })
})

describe('datosCaucho', () => {
  it('saca medida, modelo y marca del nombre del artículo', () => {
    expect(datosCaucho({ nombre: '265/65R17 112T FR GRABBER AT GENERAL TIRE', categoria: 'GENERAL TIRE' }))
      .toMatchObject({ marca: 'GENERAL TIRE', medida: '265/65R17', modelo: '112T FR GRABBER AT' })
    expect(datosCaucho({ nombre: '275/70R22.5  PR16 HS205 (DIREC) TERRAKING RIN/Otros: 22.5', categoria: 'VARIAS MARCAS' }))
      .toMatchObject({ marca: null, medida: '275/70R22.5', modelo: 'PR16 HS205 (DIREC) TERRAKING' })
    expect(datosCaucho({ nombre: '7.50-16 10L CONVENCIONAL DIR', categoria: 'VARIAS MARCAS' }).medida).toBe('7.50-16')
    expect(datosCaucho({ nombre: 'LT315/70R17 121/118R LRD FR GRABBER X3 GENERAL TIRE', categoria: 'GENERAL TIRE' }).medida).toBe('LT315/70R17')
    expect(datosCaucho({ nombre: '31X10.50R15LT 109R DESTINATION A/T FIRESTONE', categoria: 'FIRESTONE' }).medida).toBe('31X10.50R15LT')
    expect(datosCaucho({ nombre: '295/80R22.5 152/148M TL EV600 EVERTON', categoria: 'VARIAS MARCAS' })).toMatchObject({ indice: '152/148', construccion: 'tubeless' })
  })
})

describe('condicionNeumatico', () => {
  const n = { id: 'n1', profundidad_inicial_mm: 17 }
  it('nuevo: nunca montado, con la profundidad de compra', () => {
    expect(condicionNeumatico(n, [], [])).toMatchObject({ nuevo: true, mm: 17, origen: 'compra' })
  })
  it('usado: toma la última profundidad medida, de movimiento o inspección', () => {
    const movs = [
      { neumatico_id: 'n1', tipo: 'montaje', fecha: '2026-01-10', profundidad_mm: 17, activo_id: 'a1' },
      { neumatico_id: 'n1', tipo: 'desmontaje', fecha: '2026-09-01', profundidad_mm: 11, activo_id: 'a1' },
    ]
    expect(condicionNeumatico(n, movs, [{ neumatico_id: 'n1', fecha: '2026-06-01T10:00:00Z', profundidad_min_mm: 13 }]))
      .toMatchObject({ nuevo: false, mm: 11, origen: 'movimiento', activoId: 'a1' })
    expect(condicionNeumatico(n, movs.slice(0, 1), [{ neumatico_id: 'n1', fecha: '2026-06-01T10:00:00Z', profundidad_min_mm: 13 }]))
      .toMatchObject({ nuevo: false, mm: 13, origen: 'inspeccion' })
  })
})

describe('resumenInventario', () => {
  it('agrupa el inventario por medida y marca, con nuevos, usados y renovados', () => {
    const ns = [
      { id: 'a', estado: 'inventario', medida: '295/80R22.5', marca: 'Everton' },
      { id: 'b', estado: 'inventario', medida: '295/80r22.5', marca: 'EVERTON' },
      { id: 'c', estado: 'inventario', medida: '295/80R22.5', marca: 'Evergreen', renovaciones: 1 },
      { id: 'd', estado: 'montado', medida: '295/80R22.5', marca: 'Everton' },
      { id: 'e', estado: 'inventario', medida: '11R22.5', marca: null },
    ]
    const usados = new Set(['b', 'c'])
    const r = resumenInventario(ns, (id) => claseNeumatico(ns.find((n) => n.id === id)!, { nuevo: !usados.has(id) }))
    expect(r.map((x) => x.medida)).toEqual(['11R22.5', '295/80R22.5'])
    expect(r[1].marcas).toEqual([
      { marca: 'EVERTON', nuevo: 1, usado: 1, renovado: 0, total: 2 },
      { marca: 'EVERGREEN', nuevo: 0, usado: 0, renovado: 1, total: 1 },
    ])
    expect(r[1].total).toMatchObject({ nuevo: 1, usado: 1, renovado: 1, total: 3 })
    expect(r[0].marcas[0].marca).toBe('Sin marca')
  })
})

describe('profundidadMaxima', () => {
  it('la de compra, o la de la última banda renovada', () => {
    const movs = [
      { neumatico_id: 'n1', tipo: 'reparacion', fecha: '2026-05-01', profundidad_mm: 15, motivo: 'Banda renovada (1ª vez)' },
      { neumatico_id: 'n1', tipo: 'desmontaje', fecha: '2026-09-01', profundidad_mm: 8, motivo: null },
    ]
    expect(profundidadMaxima({ id: 'n1', profundidad_inicial_mm: 17 }, movs)).toBe(17)
    expect(profundidadMaxima({ id: 'n1', profundidad_inicial_mm: 17, renovaciones: 1 }, movs)).toBe(15)
  })
  it('error si una ranura pasa la máxima', () => {
    expect(errorProfundidad([14, 15, null], 14)).toMatch(/No puede pasar de 14 mm/)
    expect(errorProfundidad([14, 12], 14)).toBeNull()
    expect(errorProfundidad([20], null)).toBeNull()
  })
})

describe('presión encontrada y dejada', () => {
  it('la actual es la dejada, o la encontrada si no se ajustó', () => {
    expect(presionActual({ presion_psi: 85, presion_dejada_psi: 110 })).toBe(110)
    expect(presionActual({ presion_psi: 105, presion_dejada_psi: null })).toBe(105)
  })
  it('fuga lenta: encontrado bajo en las 2 últimas inspecciones', () => {
    const l = (fecha: string, presion_psi: number) => ({ fecha, presion_psi, presion_ideal_psi: 110 })
    expect(fugaLenta([l('2026-11-01', 90), l('2026-11-15', 95)])).toBe(true)
    expect(fugaLenta([l('2026-11-01', 90), l('2026-11-15', 108)])).toBe(false)
    expect(fugaLenta([l('2026-11-15', 90)])).toBe(false)
  })
})

describe('presionIdeal', () => {
  it('la del activo por eje manda sobre la del neumático', () => {
    expect(presionIdeal({ presiones_eje: { '1': 105, R: 110 } }, '1', { presion_ideal_psi: 120 })).toEqual({ psi: 105, origen: 'activo' })
    expect(presionIdeal({ presiones_eje: { '1': 105 } }, '2', { presion_ideal_psi: 120 })).toEqual({ psi: 120, origen: 'fabricante' })
    expect(presionIdeal({}, '2', null)).toEqual({ psi: null, origen: null })
  })
})

describe('presionSugerida (estimación por carga)', () => {
  it('índice de carga a kg', () => {
    expect(kgPorIndice(146)).toBe(3000)
    expect(kgPorIndice(143)).toBe(2725)
  })
  it('a plena carga del índice da la presión máxima', () => {
    const r = presionSugerida({ cargaEjeKg: 6000, neumaticos: 2, dual: false, indice: '146/143', presionMaxPsi: 120 })
    expect(r.psi).toBe(120)
    expect(r.sobrecarga).toBe(false)
  })
  it('con menos carga sugiere menos presión, redondeada de 5 en 5 hacia arriba', () => {
    // 4 duales con 9000 kg: 2250 kg c/u; 143 = 2725 kg → 120 × (2250/2725)^(1/0,585) ≈ 86 → 90
    const r = presionSugerida({ cargaEjeKg: 9000, neumaticos: 4, dual: true, indice: '146/143', presionMaxPsi: 120 })
    expect(r.psi).toBe(90)
  })
  it('avisa sobrecarga y no pasa de la máxima', () => {
    const r = presionSugerida({ cargaEjeKg: 13000, neumaticos: 4, dual: true, indice: '146/143', presionMaxPsi: 120 })
    expect(r.sobrecarga).toBe(true)
    expect(r.psi).toBe(120)
  })
  it('pide el índice dual en un eje dual', () => {
    expect(presionSugerida({ cargaEjeKg: 9000, neumaticos: 4, dual: true, indice: '146', presionMaxPsi: 120 }).error).toMatch(/dual/)
  })
})

describe('lectura semanal', () => {
  const hoy = new Date('2026-11-24T12:00:00Z').getTime()
  const hace = (d: number) => new Date(hoy - d * 86_400_000).toISOString()
  it('pide lectura a los 7 días o si nunca se leyó', () => {
    expect(DIAS_LECTURA).toBe(7)
    expect(estadoLectura(activo({ lectura_at: hace(3) }), hoy)).toEqual({ estado: 'al_dia', dias: 3, faltan: 4 })
    expect(estadoLectura(activo({ lectura_at: hace(7) }), hoy).estado).toBe('pendiente')
    expect(estadoLectura(activo({ lectura_at: hace(12) }), hoy).faltan).toBe(-5)
    expect(estadoLectura(activo({ lectura_at: null }), hoy).estado).toBe('pendiente')
  })
  it('en inactividad o de baja no pide lectura', () => {
    expect(estadoLectura(activo({ lectura_at: hace(40), en_inactividad: true }), hoy).estado).toBe('inactivo')
    expect(estadoLectura(activo({ lectura_at: hace(40), activo: false }), hoy).estado).toBe('baja')
  })
  it('en inactividad el fluido vence solo por tiempo', () => {
    const a = activo({ km_actual: 105000, en_inactividad: true })
    const s = { id: 's', empresa_id: 'e', activo_id: 'a1', compartimiento_id: 'c1', tipo: 'cambio', fecha: '2026-05-01', km: 100000, horas: null } as unknown as Servicio
    const r = proximoCambio(comp({ intervalo_km: 10000, intervalo_dias: 180 }), a, [s], hoy)
    expect(r.restante).toBe(5000)
    expect(r.estado).toBe('vencido')
  })
})

describe('costo por km y proyección de neumáticos', () => {
  const neu = (x: Partial<Neumatico> = {}): Neumatico => ({
    id: 'n1', empresa_id: 'e', marca_fuego: null, marca: null, modelo: null, medida: null, dot: null,
    profundidad_inicial_mm: 16, presion_ideal_psi: null, costo: 450, fecha_compra: null, estado: 'montado',
    activo_id: 'a1', posicion: '1I', montado_at: '2026-06-01', km_montaje: 100000, horas_montaje: null, notas: null, ...x,
  })
  const mov = (x: Partial<Movimiento>): Movimiento => ({
    id: crypto.randomUUID(), empresa_id: 'e', neumatico_id: 'n1', tipo: 'montaje', activo_id: 'a1', posicion: '1I',
    posicion_anterior: null, fecha: '2026-06-01', km: 100000, horas: null, profundidad_mm: 16, motivo: null, ...x,
  })
  const base = () => {
    const d = datosVacios()
    d.activos = [activo({ km_actual: 124000, lectura_at: '2026-11-01T10:00:00Z' })]
    d.neumaticos = [neu()]
    d.movimientos = [mov({})]
    d.inspecciones = [
      { id: 'i1', empresa_id: 'e', activo_id: 'a1', fecha: '2026-08-01T10:00:00Z', km: 110000, horas: null, notas: null },
      { id: 'i2', empresa_id: 'e', activo_id: 'a1', fecha: '2026-10-01T10:00:00Z', km: 120000, horas: null, notas: null },
    ]
    const med = (id: string, inspeccion_id: string, mm: number): InspeccionNeumatico => ({
      id, empresa_id: 'e', inspeccion_id, neumatico_id: 'n1', posicion: '1I', presion_psi: null, presion_ideal_psi: null,
      profundidades_mm: [mm], profundidad_min_mm: mm, valvula: 'ok', observacion: null,
    })
    d.inspeccionNeumaticos = [med('m1', 'i1', 13), med('m2', 'i2', 11)]
    return d
  }

  it('proyecta por regla de tres hasta 1,5 mm', () => {
    const { proyeccion: p } = proyeccionNeumatico(neu(), base(), '2026-11-27')
    expect(p).not.toBeNull()
    expect(p!.porMm).toBe(4000) // 20.000 km / 5 mm
    expect(p!.vidaTotal).toBe(58000) // (16 − 1,5) × 4.000
    expect(p!.restante).toBe(38000) // (11 − 1,5) × 4.000
    expect(p!.lecturaRetiro).toBe(158000)
    expect(p!.restanteHoy).toBe(34000)
    expect(p!.mmHoy).toBe(10)
    expect(p!.costoPorUnidad).toBeCloseTo(450 / 14.5 / 4000, 8)
    expect(p!.preliminar).toBe(false) // 5 mm medidos
    expect(p!.fechaRetiro).toBe('2027-08-18') // 34.000 km a 4.000 km en 31 días
  })

  it('no cuenta lo que pasó entre un desmontaje y el montaje siguiente', () => {
    const d = base()
    d.movimientos.push(
      mov({ tipo: 'desmontaje', fecha: '2026-10-02', km: 120000, profundidad_mm: 11 }),
      mov({ tipo: 'montaje', fecha: '2026-10-20', km: 130000, profundidad_mm: 11 }),
    )
    expect(proyeccionNeumatico(neu(), d).proyeccion!.porMm).toBe(4000)
  })

  it('pide desgaste medido antes de proyectar', () => {
    const d = base()
    d.inspeccionNeumaticos = d.inspeccionNeumaticos.slice(0, 0)
    const r = proyeccionNeumatico(neu(), d)
    expect(r.proyeccion).toBeNull()
    expect(r.motivo).toMatch(/al menos 2 mm/)
  })

  it('una banda renovada sin desgaste propio usa la tasa de la anterior y no tiene costo por km', () => {
    const d = base()
    d.movimientos.push(
      mov({ tipo: 'desmontaje', fecha: '2026-10-02', km: 120000, profundidad_mm: 11 }),
      mov({ tipo: 'reparacion', activo_id: null, fecha: '2026-10-10', km: null, profundidad_mm: 14, motivo: 'Banda renovada (1ª vez)' }),
    )
    const n = neu({ renovaciones: 1, estado: 'inventario', activo_id: null })
    const p = proyeccionNeumatico(n, d).proyeccion!
    expect(p.tasaBandaAnterior).toBe(true)
    expect(p.mmNuevo).toBe(14)
    expect(p.vidaTotal).toBe(50000)
    expect(p.costoPorUnidad).toBeNull()
  })

  it('costo por km del activo con todos sus rubros', () => {
    const d = base()
    d.combustible = [carga('2026-09-01', 115000, 400, { costo_total: 200 })]
    d.servicios = [serv({ fecha: '2026-09-15', km: 117000, costo_lubricante: 100 })]
    d.costos = [{ id: 'k1', empresa_id: 'e', activo_id: 'a1', fecha: '2026-10-10', cuenta: 'frenos', tipo: 'repuesto', descripcion: 'Pastillas', proveedor: null, factura: null, monto: 300, km: null, horas: null }]
    const c = costoOperacion(d.activos[0], d, '2026-07-01', '2026-11-27')!
    expect(c.uso).toBe(24000) // 124.000 − 100.000 (última lectura antes del periodo)
    const llanta = (450 / 14.5) * 5
    expect(c.total).toBeCloseTo(200 + 100 + 300 + llanta, 6)
    expect(c.porUnidad).toBeCloseTo((600 + llanta) / 24000, 8)
    expect(c.partes.map((p) => p.rubro)).toEqual(['combustible', 'fluidos', 'neumaticos', 'mantenimiento'])
  })

  it('sin recorrido en el periodo no hay costo por km', () => {
    const d = base()
    expect(costoOperacion(d.activos[0], d, '2026-11-15', '2026-11-27')).toBeNull()
  })
})
