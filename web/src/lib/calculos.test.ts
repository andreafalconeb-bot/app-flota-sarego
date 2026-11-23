import { describe, expect, it } from 'vitest'
import { compararAditivo, costoPorUso, disponible, estadoBloqueo, estadoPresion, estadoProfundidad, gastoPorCuenta, marcasParaLote, condicionNeumatico, resumenInventario, claseNeumatico, datosCaucho, proximoCambio, tramosConsumo } from './calculos'
import { aplicar } from './datos'
import { datosVacios, type Activo, type Carga, type Compartimiento, type Costo, type Servicio } from './tipos'

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
      .toEqual({ marca: 'GENERAL TIRE', medida: '265/65R17', modelo: '112T FR GRABBER AT' })
    expect(datosCaucho({ nombre: '275/70R22.5  PR16 HS205 (DIREC) TERRAKING RIN/Otros: 22.5', categoria: 'VARIAS MARCAS' }))
      .toEqual({ marca: null, medida: '275/70R22.5', modelo: 'PR16 HS205 (DIREC) TERRAKING' })
    expect(datosCaucho({ nombre: '7.50-16 10L CONVENCIONAL DIR', categoria: 'VARIAS MARCAS' }).medida).toBe('7.50-16')
    expect(datosCaucho({ nombre: 'LT315/70R17 121/118R LRD FR GRABBER X3 GENERAL TIRE', categoria: 'GENERAL TIRE' }).medida).toBe('LT315/70R17')
    expect(datosCaucho({ nombre: '31X10.50R15LT 109R DESTINATION A/T FIRESTONE', categoria: 'FIRESTONE' }).medida).toBe('31X10.50R15LT')
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
