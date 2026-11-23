const fmtFecha = new Intl.DateTimeFormat('es-VE', { day: '2-digit', month: 'short', year: 'numeric' })
const fmtFechaHora = new Intl.DateTimeFormat('es-VE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

/** Fecha sin hora ("2026-11-22") o timestamp. */
export function fecha(v: string | null | undefined): string {
  if (!v) return '—'
  const d = v.length === 10 ? new Date(v + 'T12:00:00') : new Date(v)
  return isNaN(d.getTime()) ? v : fmtFecha.format(d)
}

export function fechaHora(v: string | null | undefined): string {
  if (!v) return '—'
  const d = new Date(v)
  return isNaN(d.getTime()) ? v : fmtFechaHora.format(d)
}

export function hoyISO(): string {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

export function sumarDias(iso: string, dias: number): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + dias)
  return d.toISOString().slice(0, 10)
}

export function diasDesde(v: string | null | undefined): number | null {
  if (!v) return null
  return Math.floor((Date.now() - new Date(v).getTime()) / 86400000)
}

export function dinero(v: number | null | undefined, moneda = 'USD'): string {
  if (v == null) return '—'
  const n = new Intl.NumberFormat('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)
  return moneda === 'USD' ? `US$ ${n}` : `Bs ${n} (BCV)`
}

export function numero(v: number | null | undefined, dec = 0): string {
  if (v == null) return '—'
  return new Intl.NumberFormat('es-VE', { maximumFractionDigits: dec }).format(v)
}

/** Lo que falta para un cambio: "faltan 500 km", "toca ya", "pasado por 200 h". */
export function textoRestante(restante: number, u: 'km' | 'horas'): string {
  const un = u === 'km' ? 'km' : 'h'
  if (restante > 0) return `faltan ${numero(restante)} ${un}`
  if (restante === 0) return 'toca ya'
  return `pasado por ${numero(-restante)} ${un}`
}

/** Serial propio del neumático (lo pone la base al subirlo a la nube). */
export function serialNeumatico(n: { numero?: number | null }): string {
  return n.numero != null ? `N-${String(n.numero).padStart(4, '0')}` : 'N-…(se asigna al sincronizar)'
}

/** Cómo se nombra un neumático: su marca a fuego o, si no tiene, su serial. */
export function nombreNeumatico(n: { numero?: number | null; marca_fuego: string | null }): string {
  return n.marca_fuego || serialNeumatico(n)
}
