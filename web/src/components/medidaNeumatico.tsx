// Medida y capacidad de carga de un neumático (Andrea, 24/nov/2026). Las
// medidas salen del ERP de SAREGO (casi todas las del mercado) más las
// comunes; al poner la medida se pide la construcción (tubeless / con
// cámara) y la capacidad de carga: el índice de carga, que es lo que
// define de verdad al neumático, o las lonas (desaconsejado).
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { CONSTRUCCIONES, ID_LISTA_MEDIDAS, MEDIDAS, buscarMedida, construccionProbable, type MedidaErp } from '../lib/medidas'

const CLAVE = 'flota-medidas-erp'

function guardadas(): MedidaErp[] {
  try {
    return JSON.parse(localStorage.getItem(CLAVE) ?? '[]') as MedidaErp[]
  } catch {
    return []
  }
}

export function useMedidasErp(): MedidaErp[] {
  const [lista, setLista] = useState<MedidaErp[]>(guardadas)
  useEffect(() => {
    if (!navigator.onLine) return
    let vivo = true
    void supabase.rpc('flota_medidas_erp').then(({ data, error }) => {
      if (!vivo || error || !data) return
      setLista(data as MedidaErp[])
      try {
        localStorage.setItem(CLAVE, JSON.stringify(data))
      } catch {
        /* sin espacio */
      }
    })
    return () => {
      vivo = false
    }
  }, [])
  return lista
}

/** <datalist> con las medidas del ERP y las comunes, una sola vez en la app. */
export function ListaMedidas() {
  const erp = useMedidasErp()
  const vistas = new Set<string>()
  const opciones: { valor: string; etiqueta: string }[] = []
  for (const m of MEDIDAS) {
    vistas.add(m.medida.toUpperCase())
    opciones.push({ valor: m.medida, etiqueta: `${m.grupo}${m.nota ? ` · ${m.nota}` : ''}` })
  }
  for (const m of erp) {
    if (vistas.has(m.medida.toUpperCase())) continue
    vistas.add(m.medida.toUpperCase())
    opciones.push({ valor: m.medida, etiqueta: `${m.tipos.join(', ') || 'ERP SAREGO'}` })
  }
  return (
    <datalist id={ID_LISTA_MEDIDAS}>
      {opciones.map((o) => <option key={o.valor} value={o.valor}>{o.etiqueta}</option>)}
    </datalist>
  )
}

export interface Capacidad {
  medida: string
  construccion: '' | 'tubeless' | 'tube_type'
  modo: 'indice' | 'lonas'
  indice: string
  lonas: string
  presionMax: string
}

export function capacidadInicial(n?: { medida?: string | null; construccion?: string | null; indice_carga?: string | null; lonas?: number | null; presion_max_psi?: number | null }): Capacidad {
  return {
    medida: n?.medida ?? '',
    construccion: (n?.construccion as Capacidad['construccion']) ?? '',
    modo: n?.lonas != null && !n?.indice_carga ? 'lonas' : 'indice',
    indice: n?.indice_carga ?? '',
    lonas: n?.lonas != null ? String(n.lonas) : '',
    presionMax: n?.presion_max_psi != null ? String(n.presion_max_psi) : '',
  }
}

/** Medida + cortinas de construcción y capacidad de carga. */
export function MedidaYCapacidad({ valor, onCambio }: { valor: Capacidad; onCambio: (c: Capacidad) => void }) {
  const erp = useMedidasErp()
  const m = valor.medida.trim().toUpperCase().replace(/\s/g, '')
  const enErp = erp.find((x) => x.medida.toUpperCase() === m)
  const tipica = buscarMedida(valor.medida)
  const indices = [...new Set([...(enErp?.indices ?? []), ...(tipica?.indice ? [tipica.indice] : [])])]
  const set = (c: Partial<Capacidad>) => onCambio({ ...valor, ...c })

  const cambiarMedida = (medida: string) => {
    const t = buscarMedida(medida)
    const e = erp.find((x) => x.medida.toUpperCase() === medida.trim().toUpperCase().replace(/\s/g, ''))
    onCambio({
      ...valor,
      medida,
      construccion: valor.construccion || (e?.tubeless && !e.tube_type ? 'tubeless' : e?.tube_type && !e.tubeless ? 'tube_type' : construccionProbable(medida) ?? ''),
      indice: valor.indice || '',
      presionMax: valor.presionMax || (t?.presionMax ? String(t.presionMax) : ''),
    })
  }

  return (
    <div className="pila medida-capacidad" style={{ gap: 8 }}>
      <label className="campo">
        <span>Medida</span>
        <input list={ID_LISTA_MEDIDAS} value={valor.medida} onChange={(e) => cambiarMedida(e.target.value)} placeholder="Escribe o elige: 295/80R22.5, 11R22.5, 23.5-25…" />
      </label>
      {m.length >= 4 && (
        <div className="cortinas">
          <label className="campo">
            <span>Construcción</span>
            <select value={valor.construccion} onChange={(e) => set({ construccion: e.target.value as Capacidad['construccion'] })}>
              <option value="">Elige…</option>
              {Object.entries(CONSTRUCCIONES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <div className="campo">
            <span>Capacidad de carga</span>
            <div className="fila" style={{ gap: 12 }}>
              <label className="check"><input type="radio" checked={valor.modo === 'indice'} onChange={() => set({ modo: 'indice' })} /> Índice de carga (recomendado)</label>
              <label className="check"><input type="radio" checked={valor.modo === 'lonas'} onChange={() => set({ modo: 'lonas' })} /> Lonas</label>
            </div>
          </div>
          {valor.modo === 'indice' ? (
            <label className="campo">
              <span>Índice de carga (sencillo/dual, del costado)</span>
              <input list={`indices-${m}`} value={valor.indice} onChange={(e) => set({ indice: e.target.value })} placeholder={indices[0] ?? 'Ej.: 152/148'} />
              <datalist id={`indices-${m}`}>{indices.map((i) => <option key={i} value={i} />)}</datalist>
              {indices.length > 0 && (
                <div className="fila chips-indices">
                  {indices.map((i) => (
                    <button key={i} type="button" className={'chico' + (valor.indice === i ? ' primario' : '')} onClick={() => set({ indice: i })}>{i}</button>
                  ))}
                  <span className="sec chico">{enErp ? 'en el ERP de SAREGO' : 'típico'}</span>
                </div>
              )}
            </label>
          ) : (
            <label className="campo">
              <span>Número de lonas (PR)</span>
              <input inputMode="numeric" value={valor.lonas} onChange={(e) => set({ lonas: e.target.value.replace(/\D/g, '') })} placeholder={enErp?.lonas[0] ?? 'Ej.: 16'} />
              <span className="aviso alerta chico">
                No recomendado: las lonas son una medida antigua y no definen con precisión la capacidad de carga. Usa el índice de carga del costado
                siempre que puedas.
              </span>
            </label>
          )}
          <label className="campo">
            <span>Presión máxima del costado (psi, obligatoria)</span>
            <input inputMode="numeric" value={valor.presionMax} onChange={(e) => set({ presionMax: e.target.value.replace(/[^\d.]/g, '') })} placeholder={tipica?.presionMax ? String(tipica.presionMax) : 'Ej.: 120'} />
          </label>
        </div>
      )}
    </div>
  )
}
