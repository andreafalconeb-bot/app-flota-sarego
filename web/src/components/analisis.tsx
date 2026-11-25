import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useEmpresa } from '../lib/empresa'
import { COMPONENTES, etiqueta } from '../lib/catalogos'
import { fecha, numero } from '../lib/formato'
import type { Activo, Analisis, Compartimiento, ResultadoAnalisis, Semaforo } from '../lib/tipos'
import { Pill, Vacio } from './ui'

// Análisis de aceite usado que hace SAREGO (laboratorio Smart Assistance).
// Andrea (25/nov/2026): al ganar la cuenta en la B2B se pasan a Flota con
// sus equipos, y los nuevos llegan solos (migración 0140). El cliente
// solo los ve.

export const SEMAFORO: Record<Semaforo, { texto: string; tono: 'ok' | 'alerta' | 'critico'; color: string }> = {
  normal: { texto: 'Normal', tono: 'ok', color: 'var(--ok)' },
  precaucion: { texto: 'Precaución', tono: 'alerta', color: 'var(--alerta)' },
  critico: { texto: 'Crítico', tono: 'critico', color: 'var(--critico)' },
}

const GRUPOS: Record<string, string> = {
  viscosidad: 'Viscosidad',
  acidez_basicidad: 'Acidez y basicidad',
  desgaste: 'Metales de desgaste',
  contaminacion: 'Contaminación',
  agua: 'Agua',
  particulas: 'Partículas',
  aditivos: 'Aditivos',
  condicion: 'Condición del aceite',
}

function ordenar(lista: Analisis[]) {
  return [...lista].sort((a, b) => (a.fecha_toma ?? '').localeCompare(b.fecha_toma ?? ''))
}

function delCompartimiento(todos: Analisis[], c: Compartimiento) {
  return todos.filter((a) => a.activo_id === c.activo_id && (a.compartimiento_id === c.id || (!a.compartimiento_id && a.componente === c.componente)))
}

/** Línea para la tarjeta del compartimiento en Fluidos */
export function UltimoAnalisis({ comp }: { comp: Compartimiento }) {
  const e = useEmpresa()
  const lista = ordenar(delCompartimiento(e.datos.analisis ?? [], comp))
  const ultimo = lista[lista.length - 1]
  if (!ultimo) return null
  const s = ultimo.semaforo ? SEMAFORO[ultimo.semaforo] : null
  return (
    <Link to="?p=analisis" className="analisis-linea chico" style={{ borderLeftColor: s?.color ?? 'var(--borde)' }}>
      <span>Análisis de aceite</span>
      {s ? <Pill tono={s.tono}>{s.texto}</Pill> : <Pill>Sin semáforo</Pill>}
      <span className="sec">{ultimo.fecha_toma ? fecha(ultimo.fecha_toma) : ''}</span>
      {lista.length > 1 && <Tira lista={lista} />}
    </Link>
  )
}

/** Puntos de colores, uno por análisis, del más viejo al más nuevo */
function Tira({ lista, sel, onSel }: { lista: Analisis[]; sel?: string; onSel?: (id: string) => void }) {
  return (
    <span className="tira-semaforo" aria-label="Historial de semáforos">
      {lista.map((a) => (
        <button
          key={a.id}
          type="button"
          title={`${a.fecha_toma ? fecha(a.fecha_toma) : 'Sin fecha'} · ${a.semaforo ? SEMAFORO[a.semaforo].texto : 'sin semáforo'}`}
          className={'punto-semaforo' + (sel === a.id ? ' sel' : '')}
          style={{ background: a.semaforo ? SEMAFORO[a.semaforo].color : 'var(--borde)' }}
          onClick={onSel ? (ev) => { ev.preventDefault(); onSel(a.id) } : undefined}
          tabIndex={onSel ? 0 : -1}
        />
      ))}
    </span>
  )
}

/** Pestaña "Análisis" de la ficha del activo */
export function AnalisisActivo({ activo }: { activo: Activo }) {
  const e = useEmpresa()
  const todos = (e.datos.analisis ?? []).filter((a) => a.activo_id === activo.id)
  const comps = e.datos.compartimientos.filter((c) => c.activo_id === activo.id)

  if (!todos.length) {
    return (
      <Vacio>
        Todavía no hay análisis de aceite usado de este activo. Los hace SAREGO con el laboratorio Smart Assistance y aparecen aquí solos
        cuando sale el resultado. Pídeselo a tu ingeniero de SAREGO.
      </Vacio>
    )
  }

  // Un grupo por compartimiento (o por componente si el análisis no se ligó)
  const grupos = new Map<string, { titulo: string; lista: Analisis[] }>()
  for (const a of todos) {
    const c = comps.find((x) => x.id === a.compartimiento_id) ?? comps.find((x) => x.componente === a.componente)
    const clave = c?.id ?? a.componente
    const g = grupos.get(clave) ?? { titulo: etiqueta(COMPONENTES, c?.componente ?? a.componente), lista: [] }
    g.lista.push(a)
    grupos.set(clave, g)
  }

  return (
    <div className="pila" style={{ gap: 14 }}>
      <div className="fila chico sec">
        <span>Leyenda:</span>
        {Object.values(SEMAFORO).map((s) => (
          <span key={s.texto} className="fila" style={{ gap: 4 }}>
            <span className="punto-semaforo" style={{ background: s.color }} /> {s.texto}
          </span>
        ))}
      </div>
      {[...grupos.entries()].map(([clave, g]) => (
        <Compartimento key={clave} titulo={g.titulo} lista={ordenar(g.lista)} activo={activo} />
      ))}
    </div>
  )
}

function Compartimento({ titulo, lista, activo }: { titulo: string; lista: Analisis[]; activo: Activo }) {
  const [selId, setSelId] = useState(lista[lista.length - 1].id)
  const sel = lista.find((a) => a.id === selId) ?? lista[lista.length - 1]
  const s = sel.semaforo ? SEMAFORO[sel.semaforo] : null
  const usoAceite = sel.km_aceite != null ? `${numero(sel.km_aceite)} km` : sel.horas_aceite != null ? `${numero(sel.horas_aceite)} h` : null
  const usoEquipo = activo.medidor === 'horas'
    ? (sel.horas_equipo != null ? `${numero(sel.horas_equipo)} h` : null)
    : (sel.km_equipo != null ? `${numero(sel.km_equipo)} km` : sel.horas_equipo != null ? `${numero(sel.horas_equipo)} h` : null)

  const porGrupo = new Map<string, ResultadoAnalisis[]>()
  for (const r of sel.resultados ?? []) porGrupo.set(r.grupo, [...(porGrupo.get(r.grupo) ?? []), r])

  return (
    <section className="tarjeta pila" style={{ borderTop: `4px solid ${s?.color ?? 'var(--borde)'}` }}>
      <div className="fila-entre">
        <h3 style={{ margin: 0 }}>{titulo}</h3>
        <span className="sec chico">{lista.length} análisis</span>
      </div>

      {lista.length > 1 && (
        <div className="fila chico">
          <span className="sec">Historial:</span>
          <Tira lista={lista} sel={sel.id} onSel={setSelId} />
          <span className="sec">toca un punto para verlo</span>
        </div>
      )}

      <div className="analisis-cabecera">
        <div className={'analisis-semaforo ' + (s?.tono ?? '')}>{s?.texto ?? 'Sin semáforo'}</div>
        <div className="pila chico" style={{ gap: 2 }}>
          <span><b>Muestra {sel.numero ?? ''}</b>{sel.numero_lab ? <span className="sec"> · laboratorio {sel.numero_lab}</span> : null}</span>
          <span>Tomada el {sel.fecha_toma ? fecha(sel.fecha_toma) : '—'}{sel.fecha_resultado ? ` · resultado del ${fecha(sel.fecha_resultado)}` : ''}</span>
          {(usoEquipo || usoAceite) && (
            <span>
              {usoEquipo && <>Equipo en {usoEquipo}</>}
              {usoEquipo && usoAceite && ' · '}
              {usoAceite && <>aceite con {usoAceite} de uso</>}
            </span>
          )}
          {sel.lubricante && <span>Lubricante: <b>{sel.lubricante}</b></span>}
        </div>
      </div>

      {sel.interpretacion && (
        <div className="aviso chico">
          <b>Lo que dice el ingeniero de SAREGO:</b> {sel.interpretacion}
        </div>
      )}
      {sel.recomendacion && (
        <div className={'aviso chico ' + (sel.semaforo === 'critico' ? 'error' : sel.semaforo === 'precaucion' ? 'alerta' : 'ok')}>
          <b>Recomendación:</b> {sel.recomendacion}
        </div>
      )}

      {porGrupo.size > 0 && (
        <div className="grid grid-2">
          {[...porGrupo.entries()].map(([grupo, rs]) => (
            <div key={grupo} className="pila" style={{ gap: 4 }}>
              <span className="sec chico"><b>{GRUPOS[grupo] ?? grupo}</b></span>
              {rs.map((r) => (
                <Parametro key={r.codigo} r={r} historia={lista} />
              ))}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

/** Un parámetro con su valor, su color y la tendencia si hay varios análisis */
function Parametro({ r, historia }: { r: ResultadoAnalisis; historia: Analisis[] }) {
  const color = r.semaforo ? SEMAFORO[r.semaforo].color : 'var(--texto)'
  const puntos = historia
    .map((a) => (a.resultados ?? []).find((x) => x.codigo === r.codigo))
    .filter((x): x is ResultadoAnalisis => !!x && x.valor != null)
  return (
    <div className="parametro">
      <span className="chico">{r.nombre}</span>
      {puntos.length >= 2 ? <Tendencia puntos={puntos} /> : <span />}
      <b className="chico" style={{ color, textAlign: 'right' }}>
        {r.valor != null ? numero(r.valor, Math.abs(r.valor) < 100 ? 1 : 0) : r.valor_texto ?? '—'}
        {r.unidad && r.valor != null ? <span className="sec"> {r.unidad}</span> : null}
      </b>
    </div>
  )
}

function Tendencia({ puntos }: { puntos: ResultadoAnalisis[] }) {
  const w = 90
  const h = 22
  const vals = puntos.map((p) => p.valor as number)
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const x = (i: number) => 3 + (i * (w - 6)) / (vals.length - 1)
  const y = (v: number) => (max === min ? h / 2 : h - 3 - ((v - min) * (h - 6)) / (max - min))
  const sube = vals[vals.length - 1] > vals[0]
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Tendencia: ${sube ? 'sube' : 'baja o se mantiene'}`}>
      <polyline points={vals.map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke="var(--acento)" strokeWidth="1.5" />
      {puntos.map((p, i) => (
        <circle key={i} cx={x(i)} cy={y(vals[i])} r="2.5" fill={p.semaforo ? SEMAFORO[p.semaforo].color : 'var(--acento)'} />
      ))}
    </svg>
  )
}

/** El peor semáforo entre el último análisis de cada compartimiento */
export function peorAnalisis(todos: Analisis[], activoId: string): Semaforo | null {
  const ultimos = new Map<string, Analisis>()
  for (const a of ordenar(todos.filter((x) => x.activo_id === activoId))) ultimos.set(a.compartimiento_id ?? a.componente, a)
  const s = [...ultimos.values()].map((a) => a.semaforo)
  return s.includes('critico') ? 'critico' : s.includes('precaucion') ? 'precaucion' : s.includes('normal') ? 'normal' : null
}
