// Facturas de neumáticos de SAREGO (migración 0129). El personal de
// SAREGO asignado a la empresa carga la factura con la información
// técnica completa; los neumáticos le aparecen al cliente como
// "facturado, por recibir" y el cliente acepta la recepción, que los pasa
// a su inventario (Andrea, 23/nov/2026).
import { useEffect, useState } from 'react'
import { useEmpresa } from '../lib/empresa'
import { supabase } from '../lib/supabase'
import { datosCaucho, marcasParaLote } from '../lib/calculos'
import { dinero, fecha, hoyISO, serialNeumatico } from '../lib/formato'
import type { Factura, Neumatico } from '../lib/tipos'
import { CONSTRUCCIONES, ID_LISTA_MEDIDAS, buscarMedida, construccionProbable } from '../lib/medidas'
import { Campo, ErrorMsg, Modal, Pill, mensajeError, num } from './ui'

const MAX_UNIDADES = 200

interface Linea {
  clave: number
  articulo_codigo: string
  descripcion: string
  marca: string
  modelo: string
  medida: string
  cantidad: string
  costo: string
  dot: string
  profundidad: string
  presion: string
  indice: string
  construccion: '' | 'tubeless' | 'tube_type'
}

let siguiente = 1
const lineaVacia = (): Linea => ({
  clave: siguiente++, articulo_codigo: '', descripcion: '', marca: '', modelo: '', medida: '',
  cantidad: '1', costo: '', dot: '', profundidad: '', presion: '', indice: '', construccion: '',
})

interface Articulo {
  codigo: string
  nombre: string
  categoria: string | null
  sublinea: string | null
  precio_a_la_fecha: number | string | null
}

/** Busca cauchos en el catálogo de SAREGO (articulos_erp, línea CAUCHOS). */
function BuscarCaucho({ onElegir }: { onElegir: (a: Articulo) => void }) {
  const [q, setQ] = useState('')
  const [lista, setLista] = useState<Articulo[]>([])
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const t = q.trim()
    if (t.length < 3) {
      setLista([])
      return
    }
    let vivo = true
    const id = setTimeout(async () => {
      const patron = `%${t.replace(/[%_,()]/g, ' ')}%`
      const { data, error: e } = await supabase
        .from('articulos_erp')
        .select('codigo, nombre, categoria, sublinea, precio_a_la_fecha')
        .eq('linea', 'CAUCHOS')
        .eq('anulado', false)
        .or(`nombre.ilike.${patron},codigo.ilike.${patron}`)
        .order('nombre')
        .limit(15)
      if (!vivo) return
      setError(e ? e.message : null)
      setLista((data ?? []) as Articulo[])
    }, 300)
    return () => {
      vivo = false
      clearTimeout(id)
    }
  }, [q])
  return (
    <div className="pila" style={{ gap: 4 }}>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en el catálogo de SAREGO: medida, código o modelo (ej.: 295/80R22.5)" />
      {error && <span className="chico" style={{ color: 'var(--critico)' }}>{error}</span>}
      {lista.length > 0 && (
        <div className="tarjeta" style={{ padding: 4, maxHeight: 220, overflowY: 'auto' }}>
          {lista.map((a) => (
            <button
              key={a.codigo}
              type="button"
              className="chico"
              style={{ width: '100%', justifyContent: 'space-between', border: 0, textAlign: 'left' }}
              onClick={() => {
                onElegir(a)
                setQ('')
                setLista([])
              }}
            >
              <span><b className="mono">{a.codigo}</b> {a.nombre}</span>
              <span className="sec">{a.sublinea}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

interface LineaErp {
  numero: string
  fecha: string
  cliente: string
  codigo_cliente: string | null
  coincide_cliente: boolean | null
  articulo_codigo: string | null
  articulo_nombre: string | null
  categoria: string | null
  linea: string | null
  sublinea: string | null
  unidades: number
  valor_neto: number | null
}

/** Carga de una factura de SAREGO con sus neumáticos (solo personal de SAREGO). */
export function FormFactura({ onCerrar }: { onCerrar: () => void }) {
  const { datos, guardar, empresa } = useEmpresa()
  // Importar del ERP (Andrea: "debe buscar en el ERP y traerme los ítems")
  const [buscar, setBuscar] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [origen, setOrigen] = useState<{ cliente: string; coincide: boolean | null; ignorados: number } | null>(null)
  const [numero, setNumero] = useState('')
  const [dia, setDia] = useState(hoyISO())
  const [notas, setNotas] = useState('')
  const [lineas, setLineas] = useState<Linea[]>([lineaVacia()])
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const cambiar = (clave: number, cambio: Partial<Linea>) => setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, ...cambio } : l)))
  const unidades = lineas.reduce((t, l) => t + Math.max(0, Math.floor(num(l.cantidad) ?? 0)), 0)
  const total = lineas.reduce((t, l) => t + Math.max(0, Math.floor(num(l.cantidad) ?? 0)) * (num(l.costo) ?? 0), 0)

  const importar = async () => {
    setError(null)
    setOrigen(null)
    const q = buscar.trim()
    if (!q) return setError('Escribe el número de factura del ERP.')
    setBuscando(true)
    try {
      const { data, error: e } = await supabase.rpc('flota_factura_erp', { p_empresa: empresa!.id, p_numero: q })
      if (e) throw new Error(e.message)
      const filas = (data ?? []) as LineaErp[]
      if (!filas.length) {
        return setError(`No encontré la factura ${q} en el ERP. Las facturas llegan con la sincronización del ERP; si es de hoy, puede que todavía no esté.`)
      }
      const cauchos = filas.filter((f) => f.linea === 'CAUCHOS')
      setNumero(filas[0].numero)
      setDia(filas[0].fecha)
      setOrigen({ cliente: filas[0].cliente, coincide: filas[0].coincide_cliente, ignorados: filas.length - cauchos.length })
      if (!cauchos.length) return setError('Esa factura no tiene cauchos.')
      setLineas(
        cauchos.map((f) => {
          const d = datosCaucho({ nombre: f.articulo_nombre ?? '', categoria: f.categoria })
          const unidades = Math.round(Number(f.unidades))
          const valor = Number(f.valor_neto ?? 0)
          return {
            ...lineaVacia(),
            articulo_codigo: f.articulo_codigo ?? '',
            descripcion: f.articulo_nombre ?? '',
            marca: d.marca ?? '',
            medida: d.medida ?? '',
            modelo: d.modelo ?? '',
            indice: d.indice ?? buscarMedida(d.medida)?.indice ?? '',
            construccion: d.construccion ?? construccionProbable(d.medida) ?? '',
            cantidad: String(unidades),
            costo: unidades > 0 && valor > 0 ? String(Math.round((valor / unidades) * 100) / 100) : '',
          }
        }),
      )
    } catch (x) {
      setError(mensajeError(x))
    } finally {
      setBuscando(false)
    }
  }

  const guardarFactura = async () => {
    setError(null)
    const n = numero.trim().toUpperCase()
    if (!n) return setError('Falta el número de factura.')
    if (datos.facturas.some((f) => f.numero.toUpperCase() === n)) return setError('Esa factura ya está cargada en esta empresa.')
    const validas = lineas.filter((l) => (num(l.cantidad) ?? 0) > 0)
    if (!validas.length) return setError('Agrega al menos un neumático con su cantidad.')
    if (validas.some((l) => !l.medida.trim())) return setError('Cada línea necesita la medida.')
    if (unidades > MAX_UNIDADES) return setError(`Se pueden cargar hasta ${MAX_UNIDADES} neumáticos por factura.`)
    setEnviando(true)
    try {
      const facturaId = await guardar('facturas', { numero: n, fecha: dia, estado: 'por_recibir', notas: notas.trim() || null })
      for (const l of validas) {
        for (let i = 0; i < Math.floor(num(l.cantidad)!); i++) {
          await guardar('neumaticos', {
            estado: 'por_recibir', factura_id: facturaId, articulo_codigo: l.articulo_codigo || null,
            marca_fuego: null, marca: l.marca.trim() || null, modelo: l.modelo.trim() || null, medida: l.medida.trim() || null,
            dot: l.dot.trim() || null, profundidad_inicial_mm: num(l.profundidad), presion_ideal_psi: num(l.presion),
            costo: num(l.costo), fecha_compra: dia, notas: `Factura SAREGO ${n}`,
            indice_carga: l.indice.trim() || null, construccion: l.construccion || null,
            presion_max_psi: buscarMedida(l.medida)?.presionMax ?? null,
            activo_id: null, posicion: null, montado_at: null, km_montaje: null, horas_montaje: null,
          } as Partial<Neumatico>)
        }
      }
      onCerrar()
    } catch (e) {
      setError(mensajeError(e))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal
      abierto
      titulo="Importar factura de SAREGO"
      onCerrar={onCerrar}
      pie={
        <>
          <button onClick={onCerrar}>Cancelar</button>
          <button className="primario" disabled={enviando} onClick={() => void guardarFactura()}>
            {enviando ? 'Guardando…' : `Guardar factura (${unidades} neumáticos)`}
          </button>
        </>
      }
    >
      <span className="sec chico">
        El cliente verá estos neumáticos como “facturado, por recibir” y los pasará a su inventario cuando los reciba.
      </span>
      <div className="tarjeta pila" style={{ margin: 0, background: 'var(--superficie-2)' }}>
        <b>Buscar la factura en el ERP</b>
        <div className="fila">
          <input
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void importar()}
            placeholder="Número de factura (ej.: 12670)"
            style={{ maxWidth: 260 }}
          />
          <button className="primario" disabled={buscando} onClick={() => void importar()}>
            {buscando ? 'Buscando…' : 'Traer del ERP'}
          </button>
        </div>
        {origen && (
          <div className={'aviso chico' + (origen.coincide === false ? ' alerta' : '')}>
            Factura a nombre de <b>{origen.cliente}</b>.
            {origen.coincide === false && ' Ojo: no es el cliente del ERP enlazado a esta empresa.'}
            {origen.ignorados > 0 && ` Se dejaron fuera ${origen.ignorados} artículos que no son cauchos.`} Completa el DOT, la
            profundidad y la presión si los tienes.
          </div>
        )}
        <span className="sec chico">También puedes cargarla a mano con las líneas de abajo.</span>
      </div>
      <div className="grid grid-3">
        <Campo etiqueta="Número de factura">
          <input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Ej.: 22545" />
        </Campo>
        <Campo etiqueta="Fecha">
          <input type="date" value={dia} max={hoyISO()} onChange={(e) => setDia(e.target.value)} />
        </Campo>
        <Campo etiqueta="Notas">
          <input value={notas} onChange={(e) => setNotas(e.target.value)} />
        </Campo>
      </div>
      {lineas.map((l, i) => (
        <div key={l.clave} className="tarjeta pila" style={{ margin: 0 }}>
          <div className="fila-entre">
            <b>Línea {i + 1}{l.articulo_codigo ? ` · ${l.articulo_codigo}` : ''}</b>
            {lineas.length > 1 && (
              <button className="chico" onClick={() => setLineas((ls) => ls.filter((x) => x.clave !== l.clave))}>Quitar</button>
            )}
          </div>
          <BuscarCaucho
            onElegir={(a) => {
              const d = datosCaucho(a)
              const precio = Number(a.precio_a_la_fecha)
              cambiar(l.clave, {
                articulo_codigo: a.codigo, descripcion: a.nombre, marca: d.marca ?? '', medida: d.medida ?? '', modelo: d.modelo ?? '',
                indice: d.indice ?? buscarMedida(d.medida)?.indice ?? '', construccion: d.construccion ?? construccionProbable(d.medida) ?? '',
                costo: precio > 0 ? String(precio) : l.costo,
              })
            }}
          />
          {l.descripcion && <span className="sec chico">{l.descripcion}</span>}
          <div className="grid grid-4">
            <Campo etiqueta="Medida"><input list={ID_LISTA_MEDIDAS} value={l.medida} onChange={(e) => cambiar(l.clave, { medida: e.target.value })} /></Campo>
            <Campo etiqueta="Marca"><input value={l.marca} onChange={(e) => cambiar(l.clave, { marca: e.target.value })} /></Campo>
            <Campo etiqueta="Modelo / diseño"><input value={l.modelo} onChange={(e) => cambiar(l.clave, { modelo: e.target.value })} /></Campo>
            <Campo etiqueta="Construcción">
              <select value={l.construccion} onChange={(e) => cambiar(l.clave, { construccion: e.target.value as Linea['construccion'] })}>
                <option value="">Elige…</option>
                {Object.entries(CONSTRUCCIONES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Campo>
            <Campo etiqueta="Índice de carga"><input value={l.indice} onChange={(e) => cambiar(l.clave, { indice: e.target.value })} placeholder="Ej.: 152/148" /></Campo>
            <Campo etiqueta="DOT"><input value={l.dot} onChange={(e) => cambiar(l.clave, { dot: e.target.value })} placeholder="Ej.: 3524" /></Campo>
            <Campo etiqueta="Cantidad"><input inputMode="numeric" value={l.cantidad} onChange={(e) => cambiar(l.clave, { cantidad: e.target.value.replace(/\D/g, '') })} /></Campo>
            <Campo etiqueta="Precio por neumático (US$)"><input inputMode="decimal" value={l.costo} onChange={(e) => cambiar(l.clave, { costo: e.target.value })} /></Campo>
            <Campo etiqueta="Profundidad nueva (mm)"><input inputMode="decimal" value={l.profundidad} onChange={(e) => cambiar(l.clave, { profundidad: e.target.value })} /></Campo>
            <Campo etiqueta="Presión ideal (psi)"><input inputMode="decimal" value={l.presion} onChange={(e) => cambiar(l.clave, { presion: e.target.value })} /></Campo>
          </div>
        </div>
      ))}
      <div className="fila-entre">
        <button onClick={() => setLineas((ls) => [...ls, lineaVacia()])}>+ Otra medida</button>
        <span className="chico">{unidades} neumáticos · {dinero(total)}</span>
      </div>
      <ErrorMsg error={error} />
    </Modal>
  )
}

/** El cliente acepta la recepción; puede ponerles la marca a fuego en ese paso. */
export function RecibirFactura({ factura, onCerrar }: { factura: Factura; onCerrar: () => void }) {
  const { datos, online, sincronizarAhora } = useEmpresa()
  const llantas = datos.neumaticos.filter((n) => n.factura_id === factura.id).sort((a, b) => (a.numero ?? 0) - (b.numero ?? 0))
  const [marcas, setMarcas] = useState<Record<string, string>>({})
  const [primera, setPrimera] = useState('')
  const [nota, setNota] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const numerar = () => {
    const serie = marcasParaLote(primera, llantas.length)
    setMarcas(Object.fromEntries(llantas.map((n, i) => [n.id, serie[i] ?? ''])))
  }

  const recibir = async () => {
    setError(null)
    setEnviando(true)
    try {
      const limpias = Object.fromEntries(Object.entries(marcas).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim().toUpperCase()]))
      const { error: e } = await supabase.rpc('flota_recibir_factura', { p_factura: factura.id, p_marcas: limpias, p_nota: nota.trim() || null })
      if (e) throw new Error(e.message)
      await sincronizarAhora()
      onCerrar()
    } catch (e) {
      setError(mensajeError(e))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Modal
      abierto
      titulo={`Recibir factura ${factura.numero}`}
      onCerrar={onCerrar}
      pie={
        <>
          <button onClick={onCerrar}>Cancelar</button>
          <button className="primario" disabled={enviando || !online} onClick={() => void recibir()}>
            {enviando ? 'Recibiendo…' : `Recibir ${llantas.length} neumáticos`}
          </button>
        </>
      }
    >
      <span className="sec chico">
        Factura del {fecha(factura.fecha)}. Al recibirla, estos neumáticos pasan a tu inventario. La marca a fuego es opcional: si los
        marcas, anótala ahora o después.
      </span>
      {!online && <div className="aviso alerta">Necesitas internet para recibir la factura.</div>}
      <div className="fila">
        <input value={primera} onChange={(e) => setPrimera(e.target.value)} placeholder="Marca a fuego del primero (ej.: TG001)" style={{ maxWidth: 260, textTransform: 'uppercase' }} />
        <button onClick={numerar} disabled={!primera.trim()}>Numerar en serie</button>
      </div>
      <div className="tabla-wrap">
        <table>
          <thead>
            <tr><th>Serial</th><th>Neumático</th><th>DOT</th><th>Marca a fuego</th></tr>
          </thead>
          <tbody>
            {llantas.map((n) => (
              <tr key={n.id}>
                <td className="mono">{serialNeumatico(n)}</td>
                <td>{[n.marca, n.modelo].filter(Boolean).join(' ')}<div className="sec chico">{n.medida} · {dinero(n.costo)}</div></td>
                <td className="mono">{n.dot ?? '—'}</td>
                <td style={{ minWidth: 120 }}>
                  <input
                    aria-label={`Marca a fuego de ${serialNeumatico(n)}`}
                    value={marcas[n.id] ?? ''}
                    onChange={(e) => setMarcas({ ...marcas, [n.id]: e.target.value })}
                    style={{ textTransform: 'uppercase' }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Campo etiqueta="Nota de recepción (opcional: faltantes, daños…)">
        <input value={nota} onChange={(e) => setNota(e.target.value)} />
      </Campo>
      <ErrorMsg error={error} />
    </Modal>
  )
}

/** Facturas de SAREGO de la empresa, arriba de la lista de neumáticos. */
export function TarjetaFacturas() {
  const { datos, rol, puedeEscribir, borrar } = useEmpresa()
  const [cargar, setCargar] = useState(false)
  const [recibir, setRecibir] = useState<Factura | null>(null)
  const sarego = rol === 'sarego'
  const facturas = [...datos.facturas].sort((a, b) => b.fecha.localeCompare(a.fecha))
  const pendientes = facturas.filter((f) => f.estado === 'por_recibir')
  const visibles = sarego ? facturas.slice(0, 10) : pendientes
  if (!sarego && !pendientes.length) return null

  const resumen = (f: Factura) => {
    const ns = datos.neumaticos.filter((n) => n.factura_id === f.id)
    const medidas = [...new Set(ns.map((n) => n.medida).filter(Boolean))].join(', ')
    return { cantidad: ns.length, medidas, total: ns.reduce((t, n) => t + (n.costo ?? 0), 0) }
  }

  return (
    <section className="tarjeta pila">
      <div className="fila-entre">
        <div>
          <h2>Facturas de neumáticos de SAREGO</h2>
          {pendientes.length > 0 && <span className="sec chico">{pendientes.length} por recibir</span>}
        </div>
        {sarego && puedeEscribir && <button className="primario" onClick={() => setCargar(true)}>+ Importar factura</button>}
      </div>
      {visibles.length === 0 ? (
        <span className="sec chico">Todavía no hay facturas cargadas.</span>
      ) : (
        <div className="tabla-wrap">
          <table>
            <tbody>
              {visibles.map((f) => {
                const r = resumen(f)
                return (
                  <tr key={f.id}>
                    <td><b className="mono">{f.numero}</b><div className="sec chico">{fecha(f.fecha)}</div></td>
                    <td className="chico">{r.cantidad} neumáticos{r.medidas ? ` · ${r.medidas}` : ''}<div className="sec">{dinero(r.total)}</div></td>
                    <td>
                      {f.estado === 'por_recibir' ? <Pill tono="alerta">Por recibir</Pill> : f.estado === 'recibida' ? <Pill tono="ok">Recibida</Pill> : <Pill>Anulada</Pill>}
                      {f.nota_recepcion && <div className="sec chico">{f.nota_recepcion}</div>}
                    </td>
                    <td className="num">
                      {f.estado === 'por_recibir' && !sarego && puedeEscribir && (
                        <button className="primario chico" onClick={() => setRecibir(f)}>Recibir</button>
                      )}
                      {f.estado === 'por_recibir' && sarego && puedeEscribir && (
                        <button
                          className="chico peligro"
                          onClick={() => {
                            if (!confirm(`¿Borrar la factura ${f.numero} y sus ${r.cantidad} neumáticos por recibir?`)) return
                            void (async () => {
                              for (const n of datos.neumaticos.filter((x) => x.factura_id === f.id)) await borrar('neumaticos', n.id)
                              await borrar('facturas', f.id)
                            })()
                          }}
                        >
                          Borrar
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {cargar && <FormFactura onCerrar={() => setCargar(false)} />}
      {recibir && <RecibirFactura factura={recibir} onCerrar={() => setRecibir(null)} />}
    </section>
  )
}

