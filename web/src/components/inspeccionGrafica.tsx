// Inspección de presión y profundidad, gráfica (Andrea, 23/nov/2026: "la
// inspección de las presiones la quiero gráfica y con gráfico
// profesional"). Arriba la planta del vehículo con cada neumático
// coloreado por su estado; abajo, el neumático elegido con un manómetro
// (presión contra la ideal, bandas de la curva TMC: ±10 % alerta, ±20 %
// crítico) y el perfil de la banda (3 ranuras contra la profundidad de
// nuevo, con las líneas de 5 mm y 3 mm). Cada estado lleva su texto; el
// color nunca va solo.
import { useEffect, useMemo, useRef, useState } from 'react'
import { nombrePosicion } from '../lib/ejes'
import { PlantaVehiculo } from './planta'
import { VALVULAS } from '../lib/catalogos'
import { REMANENTE_MM, desviacionPresion, errorProfundidad, estadoPresion, estadoProfundidad, minimo, type EstadoMedida, type EvaluacionMedida } from '../lib/calculos'
import { fecha, nombreNeumatico, numero } from '../lib/formato'
import type { Activo, Neumatico } from '../lib/tipos'
import { num } from './ui'

export interface FilaInspeccion {
  /** Presión encontrada */
  presion: string
  /** Presión dejada después de ajustar (vacía = no se ajustó) */
  dejada: string
  p1: string
  p2: string
  p3: string
  valvula: string
  observacion: string
  /** Lo que se encontró al revisar la banda (claves de PATRONES, separadas por coma) */
  desgaste: string
}

/**
 * Lo que se puede encontrar al revisar la banda con el vehículo al frente,
 * con su causa más común (Michelin, Continental: guías de desgaste
 * irregular de camión).
 */
export const PATRONES: Record<string, { t: string; causa: string }> = {
  confirmada: { t: 'Medí de nuevo: está bien', causa: 'Desgaste parejo; la medida se confirmó.' },
  plumas: { t: 'Arrastre lateral (plumas)', causa: 'Convergencia fuera de medida o eje trasero desalineado: el caucho rueda arrastrándose de lado. Puede gastarse parejo pero rápido. Alinear.' },
  hombro_ext: { t: 'Hombro externo', causa: 'Caída (camber) o convergencia, o curvas a mucha velocidad. Revisar alineación.' },
  hombro_int: { t: 'Hombro interno', causa: 'Caída (camber) negativa, divergencia, rótulas o bujes gastados. Revisar alineación y tren delantero.' },
  ambos_hombros: { t: 'Ambos hombros', causa: 'Baja presión o sobrecarga.' },
  centro: { t: 'Centro', causa: 'Sobrepresión para la carga que lleva.' },
  copas: { t: 'Copas o escalones', causa: 'Amortiguadores, rodamientos o terminales gastados, o rueda desbalanceada.' },
  diagonal: { t: 'Diagonal', causa: 'Ejes traseros desalineados (paralelismo) o duales de distinto diámetro.' },
  plano: { t: 'Zona plana', causa: 'Frenada con rueda bloqueada o freno pegado.' },
  dano: { t: 'Cortes, bultos o impactos', causa: 'Daño de carcasa: revisar si se puede reparar o renovar.' },
}

const COLOR: Record<EstadoMedida, string> = {
  ok: 'var(--ok)',
  alerta: 'var(--alerta)',
  critico: 'var(--critico)',
  sin_dato: 'var(--texto-2)',
}
const TEXTO_PRESION: Record<EstadoMedida, string> = { ok: 'Bien', alerta: 'Revisar', critico: 'Crítica', sin_dato: 'Sin medir' }
const TEXTO_BANDA: Record<EstadoMedida, string> = { ok: 'Bien', alerta: 'Planificar cambio', critico: 'Retirar', sin_dato: 'Sin medir' }

const peor = (a: EstadoMedida, b: EstadoMedida): EstadoMedida =>
  [a, b].includes('critico') ? 'critico' : [a, b].includes('alerta') ? 'alerta' : [a, b].includes('ok') ? 'ok' : 'sin_dato'

function medida(f: FilaInspeccion, n: Neumatico) {
  const presion = num(f.presion)
  const ranuras = [num(f.p1), num(f.p2), num(f.p3)]
  const mm = minimo(ranuras)
  const ep = estadoPresion(presion, n.presion_ideal_psi)
  const ed = estadoProfundidad(mm)
  return { presion, ranuras, mm, ep, ed, d: desviacionPresion(presion, n.presion_ideal_psi), estado: peor(ep, ed) }
}

// ------------------------------------------------------------
// Manómetro: arco de 240°, de 0 a 1,5 × la presión ideal
// ------------------------------------------------------------
function Manometro({ presion, ideal }: { presion: number | null; ideal: number | null }) {
  const max = ideal ? ideal * 1.5 : 150
  const R = 80
  const C = { x: 100, y: 100 }
  const A0 = 150 // grados: el arco va de 150° a 390° (240°)
  const ang = (v: number) => A0 + (Math.max(0, Math.min(v, max)) / max) * 240
  const punto = (a: number, r = R) => ({ x: C.x + r * Math.cos((a * Math.PI) / 180), y: C.y + r * Math.sin((a * Math.PI) / 180) })
  const arco = (v1: number, v2: number) => {
    const p1 = punto(ang(v1))
    const p2 = punto(ang(v2))
    const grande = ang(v2) - ang(v1) > 180 ? 1 : 0
    return `M ${p1.x} ${p1.y} A ${R} ${R} 0 ${grande} 1 ${p2.x} ${p2.y}`
  }
  const bandas: { de: number; a: number; e: EstadoMedida }[] = ideal
    ? [
        { de: 0, a: ideal * 0.8, e: 'critico' },
        { de: ideal * 0.8, a: ideal * 0.9, e: 'alerta' },
        { de: ideal * 0.9, a: ideal * 1.1, e: 'ok' },
        { de: ideal * 1.1, a: ideal * 1.2, e: 'alerta' },
        { de: ideal * 1.2, a: max, e: 'critico' },
      ]
    : [{ de: 0, a: max, e: 'sin_dato' }]
  const marcas = Array.from({ length: 7 }, (_, i) => (max / 6) * i)
  const estado = estadoPresion(presion, ideal)
  const d = desviacionPresion(presion, ideal)
  const aguja = presion != null ? punto(ang(presion), R - 14) : null
  return (
    <svg viewBox="0 0 200 200" className="manometro" role="img" aria-label={`Presión ${presion ?? 'sin medir'} psi, ideal ${ideal ?? '—'} psi`}>
      <circle cx={C.x} cy={C.y} r={R + 12} fill="var(--superficie-2)" stroke="var(--borde)" />
      {bandas.map((b) => (
        <path key={b.de} d={arco(b.de, b.a)} fill="none" stroke={COLOR[b.e]} strokeWidth="12" opacity={b.e === 'sin_dato' ? 0.25 : 0.9} />
      ))}
      {marcas.map((m) => {
        const a = punto(ang(m), R - 9)
        const b = punto(ang(m), R - 16)
        const t = punto(ang(m), R - 26)
        return (
          <g key={m}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--texto-2)" strokeWidth="1.5" />
            <text x={t.x} y={t.y} fontSize="8.5" textAnchor="middle" dominantBaseline="middle" fill="var(--texto-2)">{Math.round(m)}</text>
          </g>
        )
      })}
      {ideal && (() => {
        const a = punto(ang(ideal), R + 8)
        const b = punto(ang(ideal), R - 8)
        return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--texto)" strokeWidth="2.5" strokeLinecap="round" />
      })()}
      {aguja && (
        <>
          <line x1={C.x} y1={C.y} x2={aguja.x} y2={aguja.y} stroke={COLOR[estado]} strokeWidth="3.5" strokeLinecap="round" />
        </>
      )}
      <circle cx={C.x} cy={C.y} r="7" fill="var(--superficie)" stroke="var(--texto)" strokeWidth="2" />
      <text x={C.x} y={C.y + 32} textAnchor="middle" fontSize="24" fontWeight="700" fill="var(--texto)" fontFamily="var(--f-mono)">
        {presion ?? '—'}
      </text>
      <text x={C.x} y={C.y + 47} textAnchor="middle" fontSize="9.5" fill="var(--texto-2)">
        psi · ideal {ideal ?? '—'}
      </text>
      <text x={C.x} y={C.y + 64} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--texto)">
        {d != null ? `${d > 0 ? '+' : ''}${Math.round(d * 100)} % · ${TEXTO_PRESION[estado]}` : ideal ? 'Anota la presión' : 'Sin presión ideal'}
      </text>
    </svg>
  )
}

// ------------------------------------------------------------
// Perfil de banda: 3 ranuras contra la profundidad de nuevo
// ------------------------------------------------------------
function PerfilBanda({ ranuras, nuevo }: { ranuras: (number | null)[]; nuevo: number | null }) {
  const tope = Math.max(nuevo ?? 0, ...ranuras.map((r) => r ?? 0), 10)
  const H = 110
  const y = (mm: number) => 14 + H - (Math.min(mm, tope) / tope) * H
  const ancho = 34
  const xs = [42, 89, 136]
  return (
    <svg viewBox="0 0 200 172" className="perfil-banda" role="img" aria-label={`Ranuras ${ranuras.map((r) => r ?? '—').join(', ')} mm`}>
      {/* carcasa */}
      <rect x="14" y={y(0)} width="150" height="12" rx="3" fill="var(--texto-2)" opacity="0.35" />
      {/* líneas de 5 y 3 mm, y la de nuevo */}
      {[
        { mm: 5, t: '5 mm', c: 'var(--alerta)' },
        { mm: 3, t: '3 mm', c: 'var(--critico)' },
      ].map((l) => (
        <g key={l.mm}>
          <line x1="14" x2="164" y1={y(l.mm)} y2={y(l.mm)} stroke={l.c} strokeDasharray="4 3" strokeWidth="1.2" />
          <text x="167" y={y(l.mm)} fontSize="8.5" dominantBaseline="middle" fill="var(--texto-2)">{l.t}</text>
        </g>
      ))}
      {nuevo != null && (
        <g>
          <line x1="14" x2="164" y1={y(nuevo)} y2={y(nuevo)} stroke="var(--texto-2)" strokeWidth="1" />
          <text x="167" y={y(nuevo)} fontSize="8.5" dominantBaseline="middle" fill="var(--texto-2)">nuevo</text>
        </g>
      )}
      {xs.map((x, i) => {
        const mm = ranuras[i]
        const e = estadoProfundidad(mm)
        return (
          <g key={x}>
            {mm != null ? (
              <rect x={x - ancho / 2} y={y(mm)} width={ancho} height={y(0) - y(mm)} rx="4" fill={COLOR[e]} opacity="0.85" />
            ) : (
              <rect x={x - ancho / 2} y={y(tope * 0.6)} width={ancho} height={y(0) - y(tope * 0.6)} rx="4" fill="none" stroke="var(--borde)" strokeDasharray="3 3" />
            )}
            <text x={x} y={y(0) + 26} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--texto)" fontFamily="var(--f-mono)">
              {mm ?? '—'}
            </text>
            <text x={x} y={y(0) + 38} textAnchor="middle" fontSize="8" fill="var(--texto-2)">ranura {i + 1}</text>
          </g>
        )
      })}
    </svg>
  )
}

/** Planta + detalle del neumático elegido con manómetro y perfil de banda. */
export function InspeccionGrafica({ activo, montados, posiciones, filas, set, maxima, origenIdeal, evaluar }: {
  maxima: (n: Neumatico) => number | null
  /** Evaluación de la profundidad anotada: historial, proyección y alertas */
  evaluar?: (pos: string) => EvaluacionMedida | null
  /** De dónde sale la presión ideal de esa posición */
  origenIdeal?: (pos: string) => 'activo' | 'fabricante' | null
  activo: Activo
  montados: Map<string, Neumatico>
  posiciones: string[]
  filas: Record<string, FilaInspeccion>
  set: (p: string, k: keyof FilaInspeccion, v: string) => void
}) {
  const [elegida, setElegida] = useState(posiciones[0] ?? '')
  const refPresion = useRef<HTMLInputElement>(null)
  const refs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)]
  const n = montados.get(elegida)
  const i = posiciones.indexOf(elegida)
  const ir = (p: string) => {
    setElegida(p)
    setTimeout(() => refPresion.current?.focus(), 0)
  }
  const siguiente = () => i < posiciones.length - 1 && ir(posiciones[i + 1])

  const resumen = useMemo(() => {
    const ms = posiciones.map((p) => medida(filas[p], montados.get(p)!))
    return {
      medidas: ms.filter((m) => m.presion != null || m.mm != null).length,
      criticas: ms.filter((m) => m.estado === 'critico').length,
      alertas: ms.filter((m) => m.estado === 'alerta').length,
      porRevisar: posiciones.filter((p) => (evaluar?.(p)?.alertas.length ?? 0) > 0 && !filas[p].desgaste).length,
    }
  }, [posiciones, filas, montados, evaluar])

  if (!n) return null
  const f = filas[elegida]
  const m = medida(f, n)

  return (
    <div className="pila" style={{ gap: 12 }}>
      <div className="fila chico">
        <span><b>{resumen.medidas}</b> de {posiciones.length} medidos</span>
        {resumen.criticas > 0 && <span className="pill critico">⚠ {resumen.criticas} críticos</span>}
        {resumen.alertas > 0 && <span className="pill alerta">● {resumen.alertas} por revisar</span>}
        {resumen.porRevisar > 0 && <span className="pill critico">🔍 {resumen.porRevisar} con desgaste por chequear</span>}
        <span className="sec">Toca un neumático en la planta para medirlo.</span>
      </div>
      <div className="insp-grid">
        <PlantaVehiculo
          configuracion={activo.configuracion}
          repuesto={false}
          elegida={elegida}
          onElegir={(p) => montados.has(p) && ir(p)}
          celda={(p) => {
            const nn = montados.get(p)
            if (!nn) return { estado: null, ayuda: `${nombrePosicion(p)}: sin neumático` }
            const mm = medida(filas[p], nn)
            const conAlerta = (evaluar?.(p)?.alertas.length ?? 0) > 0
            return {
              estado: conAlerta && mm.estado !== 'critico' ? 'critico' : mm.estado,
              titulo: mm.presion != null ? (num(filas[p].dejada) != null && num(filas[p].dejada) !== mm.presion ? `${mm.presion}→${filas[p].dejada}` : `${mm.presion} psi`) : '— psi',
              detalle: mm.mm != null ? `${mm.mm} mm` : <span className="sec">— mm</span>,
              ayuda: `${nombrePosicion(p)} · ${nombreNeumatico(nn)}`,
            }
          }}
        />
        <div className="tarjeta pila insp-detalle">
          <div className="fila-entre">
            <div>
              <b>{nombrePosicion(elegida)}</b>
              <div className="sec chico mono">{nombreNeumatico(n)}{n.dot ? ` · DOT ${n.dot}` : ''}{n.medida ? ` · ${n.medida}` : ''}</div>
            </div>
            <span className="sec chico">{i + 1} / {posiciones.length}</span>
          </div>
          <div className="insp-medidas">
            <div className="pila" style={{ gap: 6, alignItems: 'center' }}>
              <div className={'ideal-eje' + (origenIdeal?.(elegida) === 'activo' ? '' : ' fabricante')}>
                <span className="chico">Presión ideal de este eje</span>
                <b className="mono">{n.presion_ideal_psi ?? '—'} <small>psi</small></b>
                <span className="chico">
                  {origenIdeal?.(elegida) === 'activo' ? 'Calculada para el trabajo de este activo' : origenIdeal?.(elegida) === 'fabricante' ? 'Del fabricante (falta calcularla para este activo)' : 'Sin definir'}
                </span>
              </div>
              <Manometro presion={m.presion} ideal={n.presion_ideal_psi} />
              <label className="campo" style={{ width: '100%' }}>
                <span>Presión encontrada, en frío (psi)</span>
                <input
                  ref={refPresion}
                  className="entrada-grande"
                  inputMode="decimal"
                  value={f.presion}
                  onChange={(e) => set(elegida, 'presion', e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && refs[0].current?.focus()}
                />
              </label>
              {(m.ep === 'alerta' || m.ep === 'critico') && (
                <div className="aviso chico pila" style={{ gap: 6, width: '100%' }}>
                  <b>¿La ajustaste?</b>
                  <span className="sec">La encontrada queda registrada: es con la que rodó el vehículo.</span>
                  <div className="fila">
                    {n.presion_ideal_psi != null && (
                      <button type="button" className={'chico' + (num(f.dejada) === n.presion_ideal_psi ? ' primario' : '')} onClick={() => set(elegida, 'dejada', String(n.presion_ideal_psi))}>
                        Ajusté a la ideal ({n.presion_ideal_psi})
                      </button>
                    )}
                    <input inputMode="decimal" placeholder="Dejada (psi)" aria-label="Presión dejada" value={f.dejada} onChange={(e) => set(elegida, 'dejada', e.target.value)} style={{ maxWidth: 120 }} />
                    {f.dejada && <button type="button" className="chico" onClick={() => set(elegida, 'dejada', '')}>No la ajusté</button>}
                  </div>
                  {num(f.dejada) != null && (
                    <span>Quedó en <b>{f.dejada} psi</b> · {TEXTO_PRESION[estadoPresion(num(f.dejada), n.presion_ideal_psi)]}</span>
                  )}
                </div>
              )}
            </div>
            <div className="pila" style={{ gap: 6, alignItems: 'center' }}>
              <PerfilBanda ranuras={m.ranuras} nuevo={maxima(n)} />
              <div className="fila" style={{ flexWrap: 'nowrap', gap: 6, width: '100%' }}>
                {(['p1', 'p2', 'p3'] as const).map((k, j) => (
                  <label key={k} className="campo" style={{ flex: 1 }}>
                    <span>Ranura {j + 1} · mm</span>
                    <input
                      ref={refs[j]}
                      inputMode="decimal"
                      value={f[k]}
                      onChange={(e) => set(elegida, k, e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (j < 2 ? refs[j + 1].current?.focus() : siguiente())}
                    />
                  </label>
                ))}
              </div>
              <span className="chico">Banda: <b>{m.mm != null ? `${m.mm} mm` : '—'}</b> · {TEXTO_BANDA[m.ed]}{maxima(n) != null ? ` · nuevo ${maxima(n)} mm` : ''}</span>
              {errorProfundidad(m.ranuras, maxima(n)) && (
                <span className="chico" role="alert" style={{ color: 'var(--critico)', fontWeight: 600 }}>⚠ {errorProfundidad(m.ranuras, maxima(n))}</span>
              )}
            </div>
          </div>
          {evaluar && <DatosBanda ev={evaluar(elegida)} nuevo={maxima(n)} unidad={activo.medidor === 'horas' ? 'h' : 'km'} desgaste={f.desgaste} onDesgaste={(v) => set(elegida, 'desgaste', v)} />}
          <div className="fila" role="group" aria-label="Válvula">
            <span className="chico sec">Válvula:</span>
            {Object.entries(VALVULAS).map(([k, v]) => (
              <button key={k} type="button" className={'chico' + (f.valvula === k ? ' primario' : '')} aria-pressed={f.valvula === k} onClick={() => set(elegida, 'valvula', k)}>
                {v}
              </button>
            ))}
          </div>
          <input placeholder="Observación de este neumático (opcional)" value={f.observacion} onChange={(e) => set(elegida, 'observacion', e.target.value)} />
          <div className="fila-entre">
            <button type="button" disabled={i <= 0} onClick={() => ir(posiciones[i - 1])}>← Anterior</button>
            <button type="button" className="primario" disabled={i >= posiciones.length - 1} onClick={siguiente}>Siguiente →</button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Profundidad de nuevo y de la última inspección, rendimiento y
 * proyección con la medida que se está anotando, y las alertas que piden
 * revisar el neumático en el momento.
 */
function DatosBanda({ ev, nuevo, unidad, desgaste, onDesgaste }: {
  ev: EvaluacionMedida | null
  nuevo: number | null
  unidad: string
  desgaste: string
  onDesgaste: (v: string) => void
}) {
  const ilogica = ev?.alertas.find((a) => a.tipo === 'sube') ?? null
  // Alarma: la tablet vibra cuando la profundidad sale mayor que la anterior
  useEffect(() => {
    if (ilogica) navigator.vibrate?.([200, 100, 200])
  }, [!!ilogica]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!ev) return null
  // Con una medida ilógica la proyección no sirve: se muestra la de antes
  const pr = ilogica ? ev.antes : ev.ahora ?? ev.antes
  const otras = ev.alertas.filter((a) => a.tipo !== 'sube')
  const marcados = desgaste ? desgaste.split(',') : []
  const alternar = (k: string) => {
    const nuevos = marcados.includes(k) ? marcados.filter((x) => x !== k) : [...marcados.filter((x) => (k === 'confirmada' ? false : x !== 'confirmada')), k]
    onDesgaste(nuevos.join(','))
  }
  return (
    <div className="pila" style={{ gap: 8 }}>
      <div className="banda-datos">
        <div><span className="sec chico">Nuevo</span><b className="mono">{nuevo != null ? `${numero(nuevo, 1)} mm` : '—'}</b></div>
        <div>
          <span className="sec chico">Última inspección</span>
          <b className="mono">{ev.previa ? `${numero(ev.previa.mm, 1)} mm` : '—'}</b>
          {ev.previa && <span className="sec chico">{fecha(ev.previa.fecha)}{ev.previa.lectura != null ? ` · ${numero(ev.previa.lectura)} ${unidad}` : ''}</span>}
        </div>
        <div>
          <span className="sec chico">Este tramo</span>
          <b className="mono">{ev.tramo ? (ev.tramo.porMm != null ? `${numero(ev.tramo.porMm)} ${unidad}/mm` : 'sin desgaste') : '—'}</b>
          {ev.tramo && <span className="sec chico">{numero(ev.tramo.uso)} {unidad} · {numero(ev.tramo.mm, 1)} mm</span>}
        </div>
        <div>
          <span className="sec chico">Proyección {ilogica ? '(sin esta medida: es ilógica)' : ev.ahora ? 'con esta medida' : ''}</span>
          <b className="mono">{pr ? `${numero(pr.porMm)} ${unidad}/mm` : '—'}</b>
          <span className="sec chico">
            {pr
              ? `${pr.vidaTotal != null ? `vida ${numero(pr.vidaTotal)} ${unidad} · ` : ''}le quedan ~${numero(pr.restante)} ${unidad} a ${numero(REMANENTE_MM, 1)} mm${pr.preliminar ? ' · preliminar' : ''}`
              : 'falta desgaste medido'}
          </span>
          {ev.promedio && <span className="sec chico">promedio {ev.promedio.deMedida ? 'de la medida' : 'de la flota'}: {numero(ev.promedio.porMm)} {unidad}/mm</span>}
        </div>
      </div>
      {ilogica && (
        <div className="alarma-ilogica" role="alert">
          <b>🚨 ALARMA · Profundidad ilógica</b>
          <span>{ilogica.texto}</span>
          <span className="chico">Corrige las ranuras si mediste mal. Si al medir de nuevo da lo mismo, confírmala abajo: queda en alarma para que la revise el ingeniero.</span>
        </div>
      )}
      {ev.alertas.length > 0 && (
        <div className={'aviso pila ' + (marcados.length ? 'alerta' : 'error')} role="alert" style={{ gap: 6 }}>
          <b>🔍 Revisa este neumático ahora, con el vehículo al frente</b>
          {otras.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {otras.map((a) => <li key={a.tipo}>{a.texto}</li>)}
            </ul>
          )}
          <span className="chico">
            Vuelve a medir las 3 ranuras. Pasa la mano por la banda de adentro hacia afuera y al revés: si se siente un filo en un solo sentido son plumas
            (arrastre lateral por desalineación). Mira los dos hombros y el centro. Marca lo que encontraste:
          </span>
          <div className="fila" role="group" aria-label="Lo que encontraste">
            {Object.entries(PATRONES).map(([k, v]) => (
              <button key={k} type="button" className={'chico' + (marcados.includes(k) ? ' primario' : '')} aria-pressed={marcados.includes(k)} onClick={() => alternar(k)}>
                {k === 'confirmada' && ilogica ? 'Medí de nuevo: confirmo la medida' : v.t}
              </button>
            ))}
          </div>
          {marcados.filter((k) => k !== 'confirmada').map((k) => (
            <span key={k} className="chico"><b>{PATRONES[k]?.t}:</b> {PATRONES[k]?.causa}</span>
          ))}
        </div>
      )}
    </div>
  )
}
