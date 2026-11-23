// Formularios de carga de Flota SAREGO. Todos guardan con useEmpresa(),
// que escribe primero en la base local y sube a la nube cuando puede.
import { useState } from 'react'
import { useEmpresa } from '../lib/empresa'
import { hoyISO, nombreNeumatico, serialNeumatico } from '../lib/formato'
import { ADITIVOS, COMBUSTIBLES, COMPONENTES, CUENTAS, MEDIDORES, TIPOS_COSTO, TIPOS_SERVICIO, compartimientosSugeridos } from '../lib/catalogos'
import { marcasParaLote } from '../lib/calculos'
import { plantillaPorTipo } from '../lib/ejes'
import { SelectorEjes, SelectorTipo } from './dibujos'
import type { Activo, Carga, Compartimiento, Costo, Neumatico, Servicio } from '../lib/tipos'
import { Campo, ErrorMsg, Modal, Selector, mensajeError, num } from './ui'

function usaKm(a: Activo | null | undefined) {
  return !a || a.medidor !== 'horas'
}
function usaHoras(a: Activo | null | undefined) {
  return !!a && a.medidor !== 'km'
}

function Pie({ onCerrar, onGuardar, enviando, deshabilitado, texto = 'Guardar' }: {
  onCerrar: () => void
  onGuardar: () => void
  enviando: boolean
  deshabilitado?: boolean
  texto?: string
}) {
  return (
    <>
      <button onClick={onCerrar}>Cancelar</button>
      <button className="primario" disabled={enviando || deshabilitado} onClick={onGuardar}>
        {enviando ? 'Guardando…' : texto}
      </button>
    </>
  )
}

function useEnvio(onCerrar: () => void) {
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const enviar = async (fn: () => Promise<string | void>) => {
    setEnviando(true)
    setError(null)
    try {
      const r = await fn()
      if (typeof r === 'string') setError(r)
      else onCerrar()
    } catch (e) {
      setError(mensajeError(e))
    } finally {
      setEnviando(false)
    }
  }
  return { error, enviando, enviar }
}

/** Campos de odómetro / horómetro según el medidor del activo. */
function Medidores({ activo, km, horas, setKm, setHoras }: {
  activo: Activo | null | undefined
  km: string
  horas: string
  setKm: (v: string) => void
  setHoras: (v: string) => void
}) {
  return (
    <>
      {usaKm(activo) && (
        <Campo etiqueta="Odómetro (km)">
          <input inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} />
        </Campo>
      )}
      {usaHoras(activo) && (
        <Campo etiqueta="Horómetro (horas)">
          <input inputMode="decimal" value={horas} onChange={(e) => setHoras(e.target.value)} />
        </Campo>
      )}
    </>
  )
}

const txt = (v: number | null | undefined) => (v == null ? '' : String(v))

// ------------------------------------------------------------
// Lectura de odómetro / horómetro
// ------------------------------------------------------------
export function FormLectura({ activo, abierto, onCerrar }: { activo: Activo; abierto: boolean; onCerrar: () => void }) {
  const { guardar, parchar } = useEmpresa()
  const [km, setKm] = useState('')
  const [horas, setHoras] = useState('')
  const [notas, setNotas] = useState('')
  const { error, enviando, enviar } = useEnvio(() => {
    setKm('')
    setHoras('')
    setNotas('')
    onCerrar()
  })
  const nKm = num(km)
  const nHoras = num(horas)
  const baja = (nKm != null && activo.km_actual != null && nKm < activo.km_actual) || (nHoras != null && activo.horas_actual != null && nHoras < activo.horas_actual)

  return (
    <Modal
      abierto={abierto}
      titulo={`Lectura de ${activo.codigo}`}
      onCerrar={onCerrar}
      pie={
        <Pie
          onCerrar={onCerrar}
          enviando={enviando}
          deshabilitado={nKm == null && nHoras == null}
          onGuardar={() =>
            void enviar(async () => {
              const fecha = new Date().toISOString()
              await guardar('lecturas', { activo_id: activo.id, fecha, km: nKm, horas: nHoras, notas: notas.trim() || null })
              // La base actualiza la lectura del activo; aquí se refleja en la copia local
              await parchar('activos', activo.id, {
                km_actual: Math.max(activo.km_actual ?? 0, nKm ?? 0) || activo.km_actual,
                horas_actual: Math.max(activo.horas_actual ?? 0, nHoras ?? 0) || activo.horas_actual,
                lectura_at: fecha,
              })
            })
          }
        />
      }
    >
      <p className="sec chico" style={{ margin: 0 }}>
        Lectura actual: {activo.km_actual != null ? `${activo.km_actual} km` : ''} {activo.horas_actual != null ? `${activo.horas_actual} h` : ''}
      </p>
      <div className="grid grid-2">
        <Medidores activo={activo} km={km} horas={horas} setKm={setKm} setHoras={setHoras} />
      </div>
      {baja && <div className="aviso alerta">La lectura es menor que la actual. Si cambiaron el tablero, anótalo en las notas.</div>}
      <Campo etiqueta="Notas">
        <input value={notas} onChange={(e) => setNotas(e.target.value)} />
      </Campo>
      <ErrorMsg error={error} />
    </Modal>
  )
}

// ------------------------------------------------------------
// Activo
// ------------------------------------------------------------
export function FormActivo({ activo, abierto, onCerrar, onCreado }: {
  activo?: Activo
  abierto: boolean
  onCerrar: () => void
  onCreado?: (id: string) => void
}) {
  const { guardar, datos, empresa } = useEmpresa()
  const [f, setF] = useState(() => ({
    codigo: activo?.codigo ?? '',
    tipo: activo?.tipo ?? 'camion',
    marca: activo?.marca ?? '',
    modelo: activo?.modelo ?? '',
    anio: txt(activo?.anio),
    placa: activo?.placa ?? '',
    serial: activo?.serial ?? '',
    combustible: activo?.combustible ?? 'diesel',
    medidor: activo?.medidor ?? 'km',
    configuracion: activo?.configuracion ?? plantillaPorTipo(activo?.tipo ?? 'camion'),
    sitio_id: activo?.sitio_id ?? '',
    notas: activo?.notas ?? '',
  }))
  const [km, setKm] = useState('')
  const [horas, setHoras] = useState('')
  const [comps, setComps] = useState<string[]>(() => compartimientosSugeridos('camion'))
  const { error, enviando, enviar } = useEnvio(onCerrar)
  const nuevo = !activo
  const activos = datos.activos.filter((a) => a.activo).length
  const sinCupo = nuevo && empresa?.plan === 'gratis' && activos >= (empresa?.max_activos ?? 10)

  const cambiarTipo = (tipo: string) => {
    const pesado = !['carro', 'pickup', 'camion', 'autobus_mediano', 'autobus_grande', 'cisterna'].includes(tipo)
    setF({ ...f, tipo, configuracion: plantillaPorTipo(tipo), medidor: nuevo ? (pesado ? 'horas' : 'km') : f.medidor })
    if (nuevo) setComps(compartimientosSugeridos(tipo))
  }

  const guardarActivo = () =>
    enviar(async () => {
      const codigo = f.codigo.trim()
      if (!codigo) return 'Falta el número de unidad.'
      if (datos.activos.some((a) => a.codigo.toLowerCase() === codigo.toLowerCase() && a.id !== activo?.id)) return 'Ya hay un activo con ese número.'
      const fila: Partial<Activo> = {
        ...(activo ?? {
          activo: true,
          km_actual: num(km),
          horas_actual: num(horas),
          aditivo: null,
          aditivo_desde: null,
          lectura_at: num(km) != null || num(horas) != null ? new Date().toISOString() : null,
        }),
        codigo,
        tipo: f.tipo,
        marca: f.marca.trim() || null,
        modelo: f.modelo.trim() || null,
        anio: num(f.anio),
        placa: f.placa.trim() || null,
        serial: f.serial.trim() || null,
        combustible: f.combustible as Activo['combustible'],
        medidor: f.medidor as Activo['medidor'],
        configuracion: f.configuracion,
        sitio_id: f.sitio_id || null,
        notas: f.notas.trim() || null,
      }
      const id = await guardar('activos', fila)
      if (nuevo) {
        if (num(km) != null || num(horas) != null) {
          await guardar('lecturas', { activo_id: id, fecha: new Date().toISOString(), km: num(km), horas: num(horas), notas: 'Lectura inicial' })
        }
        for (const componente of comps) {
          await guardar('compartimientos', {
            activo_id: id, componente, capacidad_l: null, producto: null, intervalo_km: null, intervalo_horas: null,
            intervalo_dias: null, notas: null,
          })
        }
        onCreado?.(id)
      }
    })

  return (
    <Modal
      abierto={abierto}
      titulo={nuevo ? 'Nuevo activo' : `Editar ${activo.codigo}`}
      onCerrar={onCerrar}
      pie={<Pie onCerrar={onCerrar} enviando={enviando} deshabilitado={sinCupo} onGuardar={() => void guardarActivo()} />}
    >
      {sinCupo && (
        <div className="aviso alerta">
          La versión gratis admite hasta {empresa?.max_activos} activos. Pídele a SAREGO la versión completa para cargar más.
        </div>
      )}
      <div className="grid grid-2">
        <Campo etiqueta="Número de unidad">
          <input value={f.codigo} onChange={(e) => setF({ ...f, codigo: e.target.value })} placeholder="Ej.: U-014" />
        </Campo>
        <div className="campo ancho-completo" role="group" aria-label="Tipo">
          <span>Tipo</span>
          <SelectorTipo valor={f.tipo} onCambio={cambiarTipo} />
        </div>
        <Campo etiqueta="Marca">
          <input value={f.marca} onChange={(e) => setF({ ...f, marca: e.target.value })} />
        </Campo>
        <Campo etiqueta="Modelo">
          <input value={f.modelo} onChange={(e) => setF({ ...f, modelo: e.target.value })} />
        </Campo>
        <Campo etiqueta="Año">
          <input inputMode="numeric" value={f.anio} onChange={(e) => setF({ ...f, anio: e.target.value })} />
        </Campo>
        <Campo etiqueta="Placa">
          <input value={f.placa} onChange={(e) => setF({ ...f, placa: e.target.value })} />
        </Campo>
        <Campo etiqueta="Serial">
          <input value={f.serial} onChange={(e) => setF({ ...f, serial: e.target.value })} />
        </Campo>
        <Campo etiqueta="Combustible">
          <Selector valor={f.combustible} onCambio={(v) => setF({ ...f, combustible: v as Activo['combustible'] })} opciones={COMBUSTIBLES} />
        </Campo>
        <Campo etiqueta="Medidor">
          <Selector valor={f.medidor} onCambio={(v) => setF({ ...f, medidor: v as Activo['medidor'] })} opciones={MEDIDORES} />
        </Campo>
        <div className="campo ancho-completo" role="group" aria-label="Ejes y neumáticos">
          <span>Ejes y neumáticos (visto desde arriba, el frente arriba)</span>
          <SelectorEjes valor={f.configuracion ?? 'ninguna'} onCambio={(v) => setF({ ...f, configuracion: v })} />
        </div>
        {datos.sitios.length > 0 && (
          <Campo etiqueta="Sede">
            <Selector valor={f.sitio_id} onCambio={(v) => setF({ ...f, sitio_id: v })} opciones={Object.fromEntries(datos.sitios.map((s) => [s.id, s.nombre]))} vacio="Sin sede" />
          </Campo>
        )}
        {nuevo && <Medidores activo={{ medidor: f.medidor } as Activo} km={km} horas={horas} setKm={setKm} setHoras={setHoras} />}
      </div>
      {nuevo && (
        <div className="pila">
          <span className="chico sec">Compartimientos de aceite que vas a controlar (puedes cambiarlos después)</span>
          <div className="fila">
            {Object.entries(COMPONENTES).map(([k, v]) => (
              <label key={k} className="check chico" style={{ minWidth: 170 }}>
                <input type="checkbox" checked={comps.includes(k)} onChange={(e) => setComps(e.target.checked ? [...comps, k] : comps.filter((c) => c !== k))} />
                <span>{v}</span>
              </label>
            ))}
          </div>
        </div>
      )}
      <Campo etiqueta="Notas">
        <textarea value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} />
      </Campo>
      <ErrorMsg error={error} />
    </Modal>
  )
}

// ------------------------------------------------------------
// Compartimiento de aceite
// ------------------------------------------------------------
export function FormCompartimiento({ activo, comp, abierto, onCerrar }: {
  activo: Activo
  comp?: Compartimiento
  abierto: boolean
  onCerrar: () => void
}) {
  const { guardar, datos, rol, tiene } = useEmpresa()
  const [f, setF] = useState(() => ({
    componente: comp?.componente ?? '',
    capacidad_l: txt(comp?.capacidad_l),
    producto: comp?.producto ?? '',
    intervalo_km: txt(comp?.intervalo_km),
    intervalo_horas: txt(comp?.intervalo_horas),
    intervalo_dias: txt(comp?.intervalo_dias),
    sugerido_km: txt(comp?.sugerido_km),
    sugerido_horas: txt(comp?.sugerido_horas),
    sugerencia_nota: comp?.sugerencia_nota ?? '',
    notas: comp?.notas ?? '',
  }))
  const { error, enviando, enviar } = useEnvio(onCerrar)
  const usados = datos.compartimientos.filter((c) => c.activo_id === activo.id && c.id !== comp?.id).map((c) => c.componente)
  const opciones = Object.fromEntries(Object.entries(COMPONENTES).filter(([k]) => !usados.includes(k)))
  const sarego = rol === 'sarego'

  return (
    <Modal
      abierto={abierto}
      titulo={comp ? `${COMPONENTES[comp.componente] ?? comp.componente} — ${activo.codigo}` : `Nuevo compartimiento — ${activo.codigo}`}
      onCerrar={onCerrar}
      pie={
        <Pie
          onCerrar={onCerrar}
          enviando={enviando}
          deshabilitado={!f.componente}
          onGuardar={() =>
            void enviar(async () => {
              const fila: Partial<Compartimiento> = {
                ...(comp ?? {}),
                activo_id: activo.id,
                componente: f.componente,
                capacidad_l: num(f.capacidad_l),
                producto: f.producto.trim() || null,
                intervalo_km: num(f.intervalo_km),
                intervalo_horas: num(f.intervalo_horas),
                intervalo_dias: num(f.intervalo_dias),
                notas: f.notas.trim() || null,
              }
              if (sarego) {
                const cambio =
                  num(f.sugerido_km) !== (comp?.sugerido_km ?? null) ||
                  num(f.sugerido_horas) !== (comp?.sugerido_horas ?? null) ||
                  (f.sugerencia_nota.trim() || null) !== (comp?.sugerencia_nota ?? null)
                Object.assign(fila, {
                  sugerido_km: num(f.sugerido_km),
                  sugerido_horas: num(f.sugerido_horas),
                  sugerencia_nota: f.sugerencia_nota.trim() || null,
                  ...(cambio ? { sugerido_at: new Date().toISOString() } : {}),
                })
              }
              await guardar('compartimientos', fila)
            })
          }
        />
      }
    >
      <div className="grid grid-2">
        <Campo etiqueta="Compartimiento">
          <Selector valor={f.componente} onCambio={(v) => setF({ ...f, componente: v })} opciones={opciones} vacio="Elige…" />
        </Campo>
        <Campo etiqueta="Capacidad (litros)">
          <input inputMode="decimal" value={f.capacidad_l} onChange={(e) => setF({ ...f, capacidad_l: e.target.value })} />
        </Campo>
        <Campo etiqueta="Aceite que usa">
          <input value={f.producto} onChange={(e) => setF({ ...f, producto: e.target.value })} placeholder="Ej.: Mobil Delvac MX 15W-40" />
        </Campo>
      </div>
      <b className="chico">Intervalo de cambio que usan hoy</b>
      <div className="grid grid-3">
        {usaKm(activo) && (
          <Campo etiqueta="Cada (km)">
            <input inputMode="numeric" value={f.intervalo_km} onChange={(e) => setF({ ...f, intervalo_km: e.target.value })} />
          </Campo>
        )}
        {usaHoras(activo) && (
          <Campo etiqueta="Cada (horas)">
            <input inputMode="numeric" value={f.intervalo_horas} onChange={(e) => setF({ ...f, intervalo_horas: e.target.value })} />
          </Campo>
        )}
        <Campo etiqueta="O cada (días)">
          <input inputMode="numeric" value={f.intervalo_dias} onChange={(e) => setF({ ...f, intervalo_dias: e.target.value })} />
        </Campo>
      </div>
      {sarego && tiene('intervalo_sugerido') && (
        <div className="pila" style={{ background: 'var(--acento-suave)', padding: 10, borderRadius: 6 }}>
          <b className="chico">Intervalo sugerido por SAREGO (según los análisis de aceite usado)</b>
          <div className="grid grid-3">
            {usaKm(activo) && (
              <Campo etiqueta="Sugerido (km)">
                <input inputMode="numeric" value={f.sugerido_km} onChange={(e) => setF({ ...f, sugerido_km: e.target.value })} />
              </Campo>
            )}
            {usaHoras(activo) && (
              <Campo etiqueta="Sugerido (horas)">
                <input inputMode="numeric" value={f.sugerido_horas} onChange={(e) => setF({ ...f, sugerido_horas: e.target.value })} />
              </Campo>
            )}
          </div>
          <Campo etiqueta="Por qué (lo ve el cliente)">
            <input value={f.sugerencia_nota} onChange={(e) => setF({ ...f, sugerencia_nota: e.target.value })} placeholder="Ej.: 3 análisis normales a 500 h; se puede extender a 750 h" />
          </Campo>
        </div>
      )}
      <Campo etiqueta="Notas">
        <input value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} />
      </Campo>
      <ErrorMsg error={error} />
    </Modal>
  )
}

// ------------------------------------------------------------
// Servicio de fluidos (cambio, relleno, filtro, engrase, muestra)
// ------------------------------------------------------------
export function FormServicio({ activo, compId, abierto, onCerrar }: {
  activo: Activo
  compId?: string
  abierto: boolean
  onCerrar: () => void
}) {
  const { guardar, datos } = useEmpresa()
  const comps = datos.compartimientos.filter((c) => c.activo_id === activo.id)
  const [f, setF] = useState(() => {
    const c = comps.find((x) => x.id === compId)
    return {
      compartimiento_id: compId ?? '',
      tipo: 'cambio',
      fecha: hoyISO(),
      producto: c?.producto ?? '',
      litros: txt(c?.capacidad_l),
      filtros: '',
      costo_lubricante: '',
      costo_filtros: '',
      costo_mano_obra: '',
      costo_otros: '',
      notas: '',
    }
  })
  const [km, setKm] = useState(txt(activo.km_actual))
  const [horas, setHoras] = useState(txt(activo.horas_actual))
  const { error, enviando, enviar } = useEnvio(onCerrar)

  const elegirComp = (id: string) => {
    const c = comps.find((x) => x.id === id)
    setF({ ...f, compartimiento_id: id, producto: f.producto || c?.producto || '', litros: f.litros || txt(c?.capacidad_l) })
  }

  return (
    <Modal
      abierto={abierto}
      titulo={`Servicio de fluidos — ${activo.codigo}`}
      onCerrar={onCerrar}
      pie={
        <Pie
          onCerrar={onCerrar}
          enviando={enviando}
          onGuardar={() =>
            void enviar(async () => {
              if (f.tipo !== 'engrase' && !f.compartimiento_id) return 'Elige el compartimiento.'
              const fila: Partial<Servicio> = {
                activo_id: activo.id,
                compartimiento_id: f.compartimiento_id || null,
                tipo: f.tipo as Servicio['tipo'],
                fecha: f.fecha,
                km: num(km),
                horas: num(horas),
                producto: f.producto.trim() || null,
                litros: num(f.litros),
                filtros: f.filtros.trim() || null,
                costo_lubricante: num(f.costo_lubricante) ?? 0,
                costo_filtros: num(f.costo_filtros) ?? 0,
                costo_mano_obra: num(f.costo_mano_obra) ?? 0,
                costo_otros: num(f.costo_otros) ?? 0,
                notas: f.notas.trim() || null,
              }
              await guardar('servicios', fila)
            })
          }
        />
      }
    >
      <div className="grid grid-2">
        <Campo etiqueta="Qué se hizo">
          <Selector valor={f.tipo} onCambio={(v) => setF({ ...f, tipo: v })} opciones={TIPOS_SERVICIO} />
        </Campo>
        <Campo etiqueta="Compartimiento">
          <Selector
            valor={f.compartimiento_id}
            onCambio={elegirComp}
            opciones={Object.fromEntries(comps.map((c) => [c.id, COMPONENTES[c.componente] ?? c.componente]))}
            vacio={f.tipo === 'engrase' ? 'General' : 'Elige…'}
          />
        </Campo>
        <Campo etiqueta="Fecha">
          <input type="date" value={f.fecha} max={hoyISO()} onChange={(e) => setF({ ...f, fecha: e.target.value })} />
        </Campo>
        <Medidores activo={activo} km={km} horas={horas} setKm={setKm} setHoras={setHoras} />
        <Campo etiqueta="Aceite / grasa">
          <input value={f.producto} onChange={(e) => setF({ ...f, producto: e.target.value })} />
        </Campo>
        <Campo etiqueta="Litros">
          <input inputMode="decimal" value={f.litros} onChange={(e) => setF({ ...f, litros: e.target.value })} />
        </Campo>
        <Campo etiqueta="Filtros cambiados">
          <input value={f.filtros} onChange={(e) => setF({ ...f, filtros: e.target.value })} placeholder="Ej.: aceite y combustible" />
        </Campo>
      </div>
      <b className="chico">Costos (US$)</b>
      <div className="grid grid-4">
        <Campo etiqueta="Lubricante">
          <input inputMode="decimal" value={f.costo_lubricante} onChange={(e) => setF({ ...f, costo_lubricante: e.target.value })} />
        </Campo>
        <Campo etiqueta="Filtros">
          <input inputMode="decimal" value={f.costo_filtros} onChange={(e) => setF({ ...f, costo_filtros: e.target.value })} />
        </Campo>
        <Campo etiqueta="Mano de obra">
          <input inputMode="decimal" value={f.costo_mano_obra} onChange={(e) => setF({ ...f, costo_mano_obra: e.target.value })} />
        </Campo>
        <Campo etiqueta="Otros">
          <input inputMode="decimal" value={f.costo_otros} onChange={(e) => setF({ ...f, costo_otros: e.target.value })} />
        </Campo>
      </div>
      <Campo etiqueta="Notas">
        <input value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} />
      </Campo>
      <ErrorMsg error={error} />
    </Modal>
  )
}

// ------------------------------------------------------------
// Carga de combustible
// ------------------------------------------------------------
export function FormCarga({ activo, abierto, onCerrar }: { activo: Activo; abierto: boolean; onCerrar: () => void }) {
  const { guardar } = useEmpresa()
  const [f, setF] = useState({
    fecha: hoyISO(),
    litros: '',
    costo_total: '',
    tanque_lleno: true,
    con_aditivo: Boolean(activo.aditivo),
    aditivo: activo.aditivo ?? '',
    aditivo_ml: '',
    proveedor: '',
    notas: '',
  })
  const [km, setKm] = useState('')
  const [horas, setHoras] = useState('')
  const { error, enviando, enviar } = useEnvio(onCerrar)

  return (
    <Modal
      abierto={abierto}
      titulo={`Carga de combustible — ${activo.codigo}`}
      onCerrar={onCerrar}
      pie={
        <Pie
          onCerrar={onCerrar}
          enviando={enviando}
          deshabilitado={!num(f.litros)}
          onGuardar={() =>
            void enviar(async () => {
              if (num(km) == null && num(horas) == null) return 'Anota el odómetro u horómetro: sin eso no se puede calcular el rendimiento.'
              const fila: Partial<Carga> = {
                activo_id: activo.id,
                fecha: new Date(f.fecha + 'T12:00:00').toISOString(),
                litros: num(f.litros)!,
                costo_total: num(f.costo_total),
                km: num(km),
                horas: num(horas),
                tanque_lleno: f.tanque_lleno,
                con_aditivo: f.con_aditivo,
                aditivo: f.con_aditivo ? f.aditivo || null : null,
                aditivo_ml: f.con_aditivo ? num(f.aditivo_ml) : null,
                proveedor: f.proveedor.trim() || null,
                notas: f.notas.trim() || null,
              }
              await guardar('combustible', fila)
            })
          }
        />
      }
    >
      <div className="grid grid-2">
        <Campo etiqueta="Fecha">
          <input type="date" value={f.fecha} max={hoyISO()} onChange={(e) => setF({ ...f, fecha: e.target.value })} />
        </Campo>
        <Campo etiqueta="Litros">
          <input inputMode="decimal" value={f.litros} onChange={(e) => setF({ ...f, litros: e.target.value })} />
        </Campo>
        <Medidores activo={activo} km={km} horas={horas} setKm={setKm} setHoras={setHoras} />
        <Campo etiqueta="Costo total (US$)">
          <input inputMode="decimal" value={f.costo_total} onChange={(e) => setF({ ...f, costo_total: e.target.value })} />
        </Campo>
        <Campo etiqueta="Estación o proveedor">
          <input value={f.proveedor} onChange={(e) => setF({ ...f, proveedor: e.target.value })} />
        </Campo>
      </div>
      <label className="check">
        <input type="checkbox" checked={f.tanque_lleno} onChange={(e) => setF({ ...f, tanque_lleno: e.target.checked })} />
        <span>Se llenó el tanque (el rendimiento se calcula entre tanques llenos)</span>
      </label>
      <label className="check">
        <input type="checkbox" checked={f.con_aditivo} onChange={(e) => setF({ ...f, con_aditivo: e.target.checked })} />
        <span>Se le echó aditivo</span>
      </label>
      {f.con_aditivo && (
        <div className="grid grid-2">
          <Campo etiqueta="Aditivo">
            <Selector valor={f.aditivo} onCambio={(v) => setF({ ...f, aditivo: v })} opciones={ADITIVOS} vacio="Elige…" />
          </Campo>
          <Campo etiqueta="Cantidad (ml)">
            <input inputMode="decimal" value={f.aditivo_ml} onChange={(e) => setF({ ...f, aditivo_ml: e.target.value })} />
          </Campo>
        </div>
      )}
      <Campo etiqueta="Notas">
        <input value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} />
      </Campo>
      <ErrorMsg error={error} />
    </Modal>
  )
}

// ------------------------------------------------------------
// Costo (factura o gasto por cuenta)
// ------------------------------------------------------------
export function FormCosto({ activoId, abierto, onCerrar }: { activoId?: string; abierto: boolean; onCerrar: () => void }) {
  const { guardar, datos } = useEmpresa()
  const [f, setF] = useState({
    activo_id: activoId ?? '',
    fecha: hoyISO(),
    cuenta: '',
    tipo: 'repuesto',
    descripcion: '',
    proveedor: '',
    factura: '',
    monto: '',
  })
  const activo = datos.activos.find((a) => a.id === f.activo_id)
  const [km, setKm] = useState('')
  const [horas, setHoras] = useState('')
  const { error, enviando, enviar } = useEnvio(onCerrar)

  return (
    <Modal
      abierto={abierto}
      titulo="Registrar gasto"
      onCerrar={onCerrar}
      pie={
        <Pie
          onCerrar={onCerrar}
          enviando={enviando}
          onGuardar={() =>
            void enviar(async () => {
              if (!f.cuenta) return 'Elige la cuenta.'
              if (!f.descripcion.trim()) return 'Describe el gasto.'
              if (num(f.monto) == null) return 'Falta el monto.'
              const fila: Partial<Costo> = {
                activo_id: f.activo_id || null,
                fecha: f.fecha,
                cuenta: f.cuenta,
                tipo: f.tipo as Costo['tipo'],
                descripcion: f.descripcion.trim(),
                proveedor: f.proveedor.trim() || null,
                factura: f.factura.trim() || null,
                monto: num(f.monto)!,
                km: num(km),
                horas: num(horas),
              }
              await guardar('costos', fila)
            })
          }
        />
      }
    >
      <div className="grid grid-2">
        {!activoId && (
          <Campo etiqueta="Activo">
            <Selector
              valor={f.activo_id}
              onCambio={(v) => setF({ ...f, activo_id: v })}
              opciones={Object.fromEntries(datos.activos.map((a) => [a.id, a.codigo]))}
              vacio="Gasto general de la flota"
            />
          </Campo>
        )}
        <Campo etiqueta="Cuenta (sistema)">
          <Selector valor={f.cuenta} onCambio={(v) => setF({ ...f, cuenta: v })} opciones={CUENTAS} vacio="Elige…" />
        </Campo>
        <Campo etiqueta="Tipo">
          <Selector valor={f.tipo} onCambio={(v) => setF({ ...f, tipo: v })} opciones={TIPOS_COSTO} />
        </Campo>
        <Campo etiqueta="Fecha">
          <input type="date" value={f.fecha} max={hoyISO()} onChange={(e) => setF({ ...f, fecha: e.target.value })} />
        </Campo>
        <Campo etiqueta="Monto (US$)">
          <input inputMode="decimal" value={f.monto} onChange={(e) => setF({ ...f, monto: e.target.value })} />
        </Campo>
        <Campo etiqueta="Proveedor">
          <input value={f.proveedor} onChange={(e) => setF({ ...f, proveedor: e.target.value })} />
        </Campo>
        <Campo etiqueta="N.º de factura">
          <input value={f.factura} onChange={(e) => setF({ ...f, factura: e.target.value })} />
        </Campo>
        {activo && <Medidores activo={activo} km={km} horas={horas} setKm={setKm} setHoras={setHoras} />}
      </div>
      <Campo etiqueta="Descripción">
        <input value={f.descripcion} onChange={(e) => setF({ ...f, descripcion: e.target.value })} placeholder="Ej.: Cambio de 2 inyectores" />
      </Campo>
      <ErrorMsg error={error} />
    </Modal>
  )
}

// ------------------------------------------------------------
// Neumático nuevo
// ------------------------------------------------------------
const MAX_LOTE = 100

export function FormNeumatico({ neumatico, abierto, onCerrar }: { neumatico?: Neumatico; abierto: boolean; onCerrar: () => void }) {
  const { guardar, rol } = useEmpresa()
  const [f, setF] = useState(() => ({
    marca_fuego: neumatico?.marca_fuego ?? '',
    marca: neumatico?.marca ?? '',
    modelo: neumatico?.modelo ?? '',
    medida: neumatico?.medida ?? '',
    dot: neumatico?.dot ?? '',
    profundidad_inicial_mm: txt(neumatico?.profundidad_inicial_mm),
    presion_ideal_psi: txt(neumatico?.presion_ideal_psi),
    costo: txt(neumatico?.costo),
    fecha_compra: neumatico?.fecha_compra ?? '',
    notas: neumatico?.notas ?? '',
  }))
  // Compra de varios iguales: una sola carga (Andrea, 23/nov/2026)
  const [cantidad, setCantidad] = useState('1')
  const { error, enviando, enviar } = useEnvio(onCerrar)
  const cant = neumatico ? 1 : Math.max(1, Math.floor(num(cantidad) ?? 1))
  const marcas = marcasParaLote(f.marca_fuego, cant)
  // Lo facturado por SAREGO lo cambia SAREGO hasta que el cliente lo recibe
  const bloqueado = neumatico?.estado === 'por_recibir' && rol !== 'sarego'

  return (
    <Modal
      abierto={abierto}
      titulo={neumatico ? `Neumático ${nombreNeumatico(neumatico)}` : 'Nuevo neumático'}
      onCerrar={onCerrar}
      pie={
        bloqueado ? undefined : (
          <Pie
            onCerrar={onCerrar}
            enviando={enviando}
            texto={cant > 1 ? `Guardar ${cant} neumáticos` : 'Guardar'}
            onGuardar={() =>
              void enviar(async () => {
                if (cant > MAX_LOTE) return `Se pueden cargar hasta ${MAX_LOTE} neumáticos de una vez.`
                const comun: Partial<Neumatico> = {
                  ...(neumatico ?? { estado: 'inventario', activo_id: null, posicion: null, montado_at: null, km_montaje: null, horas_montaje: null }),
                  marca: f.marca.trim() || null,
                  modelo: f.modelo.trim() || null,
                  medida: f.medida.trim() || null,
                  dot: f.dot.trim() || null,
                  profundidad_inicial_mm: num(f.profundidad_inicial_mm),
                  presion_ideal_psi: num(f.presion_ideal_psi),
                  costo: num(f.costo),
                  fecha_compra: f.fecha_compra || null,
                  notas: f.notas.trim() || null,
                }
                for (const marca of marcas) await guardar('neumaticos', { ...comun, marca_fuego: marca })
              })
            }
          />
        )
      }
    >
      {neumatico && (
        <div className="fila chico">
          <span>Serial <b className="mono">{serialNeumatico(neumatico)}</b></span>
          {neumatico.estado === 'por_recibir' && <span className="pill alerta">Facturado por SAREGO, por recibir</span>}
        </div>
      )}
      {neumatico && !bloqueado && (neumatico.estado === 'inventario' || neumatico.estado === 'reparacion' || neumatico.estado === 'renovacion') && (
        <RenovarBanda neumatico={neumatico} onListo={onCerrar} />
      )}
      {bloqueado && <div className="aviso alerta">Este neumático viene en una factura de SAREGO. Recibe la factura en Neumáticos para pasarlo a tu inventario.</div>}
      <fieldset disabled={bloqueado} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }} className="pila">
        <div className="grid grid-2">
          {!neumatico && (
            <Campo etiqueta="Cantidad (neumáticos iguales de la misma compra)">
              <input inputMode="numeric" value={cantidad} onChange={(e) => setCantidad(e.target.value.replace(/\D/g, ''))} />
            </Campo>
          )}
          <Campo etiqueta={cant > 1 ? 'Marca a fuego del primero (opcional)' : 'Marca a fuego (opcional)'}>
            <input value={f.marca_fuego} onChange={(e) => setF({ ...f, marca_fuego: e.target.value })} style={{ textTransform: 'uppercase' }} placeholder={cant > 1 ? 'Ej.: TG001' : undefined} />
          </Campo>
          {cant > 1 && (
            <div className="aviso chico ancho-completo">
              Se cargan {cant} neumáticos con los mismos datos, cada uno con su serial.{' '}
              {marcas[0] == null
                ? 'Sin marca a fuego.'
                : marcas[0] === marcas[cant - 1]
                  ? `Todos con la marca ${marcas[0]}.`
                  : `Marcas ${marcas[0]} a ${marcas[cant - 1]}.`}
            </div>
          )}
          <Campo etiqueta="DOT">
            <input value={f.dot} onChange={(e) => setF({ ...f, dot: e.target.value })} placeholder="Ej.: 3524 (semana 35 de 2024)" />
          </Campo>
          <Campo etiqueta="Marca">
            <input value={f.marca} onChange={(e) => setF({ ...f, marca: e.target.value })} />
          </Campo>
          <Campo etiqueta="Modelo / diseño">
            <input value={f.modelo} onChange={(e) => setF({ ...f, modelo: e.target.value })} />
          </Campo>
          <Campo etiqueta="Medida">
            <input value={f.medida} onChange={(e) => setF({ ...f, medida: e.target.value })} placeholder="Ej.: 11R22.5" />
          </Campo>
          <Campo etiqueta="Profundidad nueva (mm)">
            <input inputMode="decimal" value={f.profundidad_inicial_mm} onChange={(e) => setF({ ...f, profundidad_inicial_mm: e.target.value })} />
          </Campo>
          <Campo etiqueta="Presión ideal (psi)">
            <input inputMode="decimal" value={f.presion_ideal_psi} onChange={(e) => setF({ ...f, presion_ideal_psi: e.target.value })} />
          </Campo>
          <Campo etiqueta={cant > 1 ? 'Costo por neumático (US$)' : 'Costo (US$)'}>
            <input inputMode="decimal" value={f.costo} onChange={(e) => setF({ ...f, costo: e.target.value })} />
          </Campo>
          <Campo etiqueta="Fecha de compra">
            <input type="date" value={f.fecha_compra} max={hoyISO()} onChange={(e) => setF({ ...f, fecha_compra: e.target.value })} />
          </Campo>
        </div>
        <Campo etiqueta="Notas">
          <input value={f.notas} onChange={(e) => setF({ ...f, notas: e.target.value })} />
        </Campo>
      </fieldset>
      <ErrorMsg error={error} />
    </Modal>
  )
}

/**
 * Renovar la banda (reencauche): el serial de la carcasa no cambia; se
 * suma una renovación y la profundidad de la banda nueva queda como la
 * última medida (así el inventario lo muestra como renovado).
 */
function RenovarBanda({ neumatico, onListo }: { neumatico: Neumatico; onListo: () => void }) {
  const { guardar, puedeEscribir } = useEmpresa()
  const [abierto, setAbierto] = useState(false)
  const [mm, setMm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const veces = neumatico.renovaciones ?? 0
  if (!puedeEscribir) return null
  if (!abierto) {
    return (
      <div className="fila chico">
        <span className="sec">{veces ? `Banda renovada ${veces} ${veces === 1 ? 'vez' : 'veces'}.` : 'Banda original.'}</span>
        <button className="chico" onClick={() => setAbierto(true)}>Registrar banda renovada (reencauche)</button>
      </div>
    )
  }
  const renovar = async () => {
    const p = num(mm)
    if (p == null) return setError('Anota la profundidad de la banda renovada.')
    try {
      await guardar('neumaticos', { ...neumatico, estado: 'inventario', renovaciones: veces + 1 })
      await guardar('movimientos', {
        neumatico_id: neumatico.id, tipo: 'reparacion', activo_id: null, posicion: null, posicion_anterior: null,
        fecha: hoyISO(), km: null, horas: null, profundidad_mm: p, motivo: `Banda renovada (${veces + 1}ª vez)`,
      })
      onListo()
    } catch (e) {
      setError(mensajeError(e))
    }
  }
  return (
    <div className="tarjeta pila" style={{ margin: 0 }}>
      <b>Banda renovada</b>
      <span className="sec chico">El serial {serialNeumatico(neumatico)} sigue siendo el de la carcasa. Queda en inventario como renovado.</span>
      <div className="fila">
        <input inputMode="decimal" placeholder="Profundidad de la banda renovada (mm)" value={mm} onChange={(e) => setMm(e.target.value)} style={{ maxWidth: 260 }} />
        <button className="primario" onClick={() => void renovar()}>Guardar renovación</button>
        <button onClick={() => setAbierto(false)}>Cancelar</button>
      </div>
      <ErrorMsg error={error} />
    </div>
  )
}
