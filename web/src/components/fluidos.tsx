// Fluidos: el catálogo de SAREGO para elegir qué aceite, grasa o
// refrigerante se usó (Andrea, 24/nov/2026). Todos los productos de
// SAREGO están; "Otro proveedor" deja anotar uno que no es de SAREGO. El catálogo se
// guarda en el equipo para poder elegir sin internet (versión pago).
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface Fluido {
  codigo: string
  marca: string
  nombre: string
  categoria: string | null
}

/** Lo elegido: producto (texto) y su SKU de SAREGO (null = otro proveedor). */
export interface Eleccion {
  producto: string
  codigo: string | null
}

const CLAVE = 'flota-catalogo-fluidos'

function leerGuardado(): Fluido[] {
  try {
    return JSON.parse(localStorage.getItem(CLAVE) ?? '[]') as Fluido[]
  } catch {
    return []
  }
}

export function useCatalogoFluidos(): Fluido[] {
  const [lista, setLista] = useState<Fluido[]>(leerGuardado)
  useEffect(() => {
    if (!navigator.onLine) return
    let vivo = true
    void supabase.rpc('flota_catalogo_fluidos').then(({ data, error }) => {
      if (!vivo || error || !data) return
      setLista(data as Fluido[])
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

/** Palabras de la categoría que van con cada compartimiento, para ponerlas primero. */
const AFINES: Record<string, RegExp> = {
  motor: /motor/i,
  transmision: /transmis/i,
  caja_transferencia: /transmis/i,
  convertidor_par: /transmis/i,
  diferencial: /transmis|engran/i,
  mando_final: /transmis|engran/i,
  mando_final_delantero: /transmis|engran/i,
  mando_final_trasero: /transmis|engran/i,
  sistema_giro: /transmis|engran/i,
  motor_traslacion: /transmis|engran|hidr/i,
  hidraulico: /hidr/i,
  direccion: /hidr|transmis/i,
  frenos: /fren/i,
  refrigerante: /refriger|coolant/i,
  engrase: /gras/i,
}

/** Texto para mostrar un producto: "MOBIL · MOBIL DELVAC MX 15W40". */
export function textoFluido(f: Fluido): string {
  return f.nombre.toUpperCase().startsWith(f.marca.toUpperCase()) ? f.nombre : `${f.marca} · ${f.nombre}`
}

export function SelectorFluido({ valor, onCambio, componente }: {
  valor: Eleccion
  onCambio: (e: Eleccion) => void
  componente?: string | null
}) {
  const catalogo = useCatalogoFluidos()
  const [otro, setOtro] = useState(() => !!valor.producto && !valor.codigo)
  const [q, setQ] = useState('')
  const [abierto, setAbierto] = useState(false)

  const lista = useMemo(() => {
    const t = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const afin = componente ? AFINES[componente] : undefined
    return catalogo
      .filter((f) => t.every((w) => `${f.marca} ${f.nombre} ${f.categoria ?? ''}`.toLowerCase().includes(w)))
      .sort((a, b) => Number(!!afin?.test(b.categoria ?? '')) - Number(!!afin?.test(a.categoria ?? '')) || a.marca.localeCompare(b.marca) || a.nombre.localeCompare(b.nombre))
      .slice(0, 40)
  }, [catalogo, q, componente])

  if (otro) {
    return (
      <div className="pila" style={{ gap: 4 }}>
        <input value={valor.producto} onChange={(e) => onCambio({ producto: e.target.value, codigo: null })} placeholder="Marca y producto de otro proveedor (ej.: Shell Rimula R4 15W-40)" />
        <button type="button" className="chico" style={{ alignSelf: 'flex-start' }} onClick={() => { setOtro(false); onCambio({ producto: '', codigo: null }) }}>
          Elegir del catálogo de SAREGO
        </button>
      </div>
    )
  }

  return (
    <div className="pila" style={{ gap: 4, position: 'relative' }}>
      {valor.codigo && !abierto ? (
        <button type="button" className="fluido-elegido" onClick={() => setAbierto(true)}>
          <span className="pill ok">SAREGO</span> <span>{valor.producto}</span> <span className="sec chico">cambiar</span>
        </button>
      ) : (
        <input
          autoFocus={abierto}
          value={q}
          onFocus={() => setAbierto(true)}
          onChange={(e) => { setQ(e.target.value); setAbierto(true) }}
          placeholder={catalogo.length ? 'Busca por marca o tipo (ej.: Mobil 85W-140, Delvac, hidráulico 68)' : 'Conéctate a internet para cargar el catálogo de SAREGO'}
        />
      )}
      {abierto && (
        <div className="tarjeta fluido-lista">
          {lista.map((f) => (
            <button
              key={f.codigo}
              type="button"
              onClick={() => {
                onCambio({ producto: textoFluido(f), codigo: f.codigo })
                setAbierto(false)
                setQ('')
              }}
            >
              <span>{textoFluido(f)}</span>
              <span className="sec chico">{f.categoria}</span>
            </button>
          ))}
          {lista.length === 0 && <span className="sec chico" style={{ padding: 6 }}>Nada coincide en el catálogo de SAREGO.</span>}
          <button type="button" className="fluido-otro" onClick={() => { setOtro(true); setAbierto(false); onCambio({ producto: q, codigo: null }) }}>
            Otro proveedor: escribirlo a mano
          </button>
        </div>
      )}
    </div>
  )
}
