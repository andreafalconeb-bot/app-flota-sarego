// Dibujos para elegir el tipo de activo y la configuración de ejes
// (Andrea, 23/nov/2026: "la selección del tipo de vehículo debe tener
// gráficos, al igual que la posición de los neumáticos"). Todo en SVG
// con currentColor, así sirve en claro y oscuro sin imágenes aparte.
import { useState, type ReactNode } from 'react'
import { GRUPOS_TIPO, TIPOS, etiqueta } from '../lib/catalogos'
import { PLANTILLAS } from '../lib/ejes'

// ------------------------------------------------------------
// Siluetas de tipo (vista lateral, el frente mira a la derecha)
// ------------------------------------------------------------
const r = (cx: number, cy = 31, rad = 4.5) => <circle cx={cx} cy={cy} r={rad} />
const p = (d: string) => <path d={d} />

const SILUETAS: Record<string, ReactNode> = {
  carro: (
    <>
      {p('M5 30V23q1-3 8-4l8-6q2-1 6-1h12q3 0 6 3l5 4q8 1 9 4v7')}
      {p('M23 19l4-4h8v4zM38 19v-4h2l4 4z')}
      {r(16)}
      {r(47)}
    </>
  ),
  pickup: (
    <>
      {p('M4 30V21h26l4-8h10q3 0 5 3l4 5q6 1 7 4v5')}
      {p('M35 20l3-5h5v5z')}
      {r(15)}
      {r(48)}
    </>
  ),
  camion: (
    <>
      <rect x="3" y="7" width="37" height="21" rx="1" />
      {p('M43 30V14h9l7 8v8')}
      {p('M46 21v-4h5l3 4z')}
      {r(11)}
      {r(21)}
      {r(51)}
    </>
  ),
  autobus_mediano: (
    <>
      <rect x="7" y="9" width="50" height="20" rx="3" />
      {p('M11 13h8v6h-8zM22 13h8v6h-8zM33 13h8v6h-8zM44 13h9v9h-9')}
      {r(17)}
      {r(47)}
    </>
  ),
  autobus_grande: (
    <>
      <rect x="2" y="7" width="60" height="22" rx="3" />
      {p('M6 11h7v7H6zM16 11h7v7h-7zM26 11h7v7h-7zM36 11h7v7h-7zM46 11h11v10H46')}
      {r(12)}
      {r(22)}
      {r(52)}
    </>
  ),
  cisterna: (
    <>
      <rect x="3" y="10" width="38" height="17" rx="8.5" />
      {p('M3 27h40M22 10V7')}
      {p('M43 30V14h9l7 8v8')}
      {r(10)}
      {r(20)}
      {r(51)}
    </>
  ),
  camion_articulado: (
    <>
      {p('M3 14h32l-4 14H7z')}
      {p('M35 24h5M40 30V12h9l2 6h7v12')}
      {r(11, 30, 5)}
      {r(27, 30, 5)}
      {r(51, 30, 5)}
    </>
  ),
  camion_roquero: (
    <>
      {p('M2 8h40l6 9-8 10H9z')}
      {p('M46 17h9v11h-9')}
      {r(15, 29, 6)}
      {r(49, 29, 6)}
    </>
  ),
  cargador_frontal: (
    <>
      {p('M8 27V17h12V7h12v10h9v10z')}
      {p('M41 19l9 4')}
      {p('M49 16l11 4-2 10h-9z')}
      {r(15, 29, 6)}
      {r(36, 29, 6)}
    </>
  ),
  excavadora: (
    <>
      <rect x="4" y="27" width="36" height="7" rx="3.5" />
      {p('M8 27V17h13v-7h9v7h8v10')}
      {p('M36 16L49 5l9 14')}
      {p('M58 19l-5 9 8-2z')}
    </>
  ),
  retroexcavadora: (
    <>
      {p('M15 27V17h10V7h10v10h9v10z')}
      {p('M15 21l-7 2')}
      {p('M2 19l7 2v9l-7-2z')}
      {p('M44 18l9-11 7 12')}
      {p('M60 19l-4 7 6-1z')}
      {r(21, 30, 4.5)}
      {r(38, 29, 6)}
    </>
  ),
  motoniveladora: (
    <>
      {p('M5 21h37M42 24V8h12v18')}
      {p('M22 22l14 6')}
      {r(9, 30, 4.5)}
      {r(45, 30, 4.5)}
      {r(56, 30, 4.5)}
    </>
  ),
  compactadora_tierra: (
    <>
      {p('M8 25V17h11V7h12v10h9v6')}
      <circle cx="49" cy="25" r="9" />
      {r(15, 29, 6)}
    </>
  ),
  compactadora_asfalto: (
    <>
      {p('M16 18h8V8h13v10h6')}
      <circle cx="12" cy="26" r="8" />
      <circle cx="50" cy="26" r="8" />
      {p('M20 26h22')}
    </>
  ),
  tractor: (
    <>
      {p('M27 22h29v-5H32V7H19v9')}
      <circle cx="18" cy="25" r="9" />
      {r(49, 30, 5)}
    </>
  ),
  montacargas: (
    <>
      {p('M8 29V16h11V6h15v10h11v13z')}
      {p('M50 3v29h12')}
      {r(15, 30, 4.5)}
      {r(39, 30, 4.5)}
    </>
  ),
  maquinaria_pesada: (
    <>
      <rect x="5" y="27" width="40" height="7" rx="3.5" />
      {p('M9 27V15h15V6h11v9h9v12')}
      {p('M44 18h5M50 9l5 25h-8')}
    </>
  ),
  generador: (
    <>
      <rect x="6" y="9" width="52" height="21" rx="2" />
      {p('M34 12l-7 9h6l-4 7 9-10h-6z')}
      {p('M10 30v4M54 30v4')}
    </>
  ),
  compresor: (
    <>
      <rect x="5" y="16" width="42" height="13" rx="6.5" />
      <rect x="13" y="6" width="18" height="10" rx="1" />
      {p('M47 22h7v-9')}
      {r(13, 32, 3)}
      {r(39, 32, 3)}
    </>
  ),
  bomba: (
    <>
      <circle cx="26" cy="19" r="10" />
      <circle cx="26" cy="19" r="3" />
      {p('M36 19h22M26 9V4h14')}
      {p('M12 33h34M18 29v4M34 29v4')}
    </>
  ),
  otro: (
    <>
      <rect x="10" y="7" width="44" height="25" rx="4" />
      {p('M27 15q0-4 5-4t5 4q0 3-5 5v3')}
      <circle cx="32" cy="27" r=".8" />
    </>
  ),
}

export function IconoTipo({ tipo, ancho = 64 }: { tipo: string; ancho?: number }) {
  return (
    <svg
      viewBox="0 0 64 38"
      width={ancho}
      height={(ancho * 38) / 64}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {SILUETAS[tipo] ?? SILUETAS.otro}
    </svg>
  )
}

/** Tipo de activo con dibujos: muestra el elegido y, al tocarlo, todos agrupados. */
export function SelectorTipo({ valor, onCambio }: { valor: string; onCambio: (v: string) => void }) {
  const [abierto, setAbierto] = useState(false)
  return (
    <div className="pila" style={{ gap: 8 }}>
      <button type="button" className="tipo-actual" onClick={() => setAbierto(!abierto)} aria-expanded={abierto}>
        <IconoTipo tipo={valor} ancho={56} />
        <span>
          <b>{etiqueta(TIPOS, valor)}</b>
          <span className="sec chico">{abierto ? 'Elige el tipo' : 'Toca para cambiar'}</span>
        </span>
      </button>
      {abierto &&
        GRUPOS_TIPO.map((g) => (
          <div key={g.grupo} className="pila" style={{ gap: 6 }}>
            <span className="sec chico">{g.grupo}</span>
            <div className="opciones-dibujo">
              {Object.entries(g.tipos).map(([k, v]) => (
                <button
                  key={k}
                  type="button"
                  className={'opcion-dibujo' + (k === valor ? ' elegida' : '')}
                  aria-pressed={k === valor}
                  onClick={() => {
                    onCambio(k)
                    setAbierto(false)
                  }}
                >
                  <IconoTipo tipo={k} ancho={60} />
                  <span>{v}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
    </div>
  )
}

// ------------------------------------------------------------
// Ejes vistos desde arriba (el frente arriba)
// ------------------------------------------------------------
const ANCHO = 64
const LLANTA = { w: 7, h: 13 }

/** Planta de una configuración de ejes: cabina, chasis y cada neumático. */
export function PlantaEjes({ codigo, alto = 96 }: { codigo: string; alto?: number }) {
  const pl = PLANTILLAS[codigo] ?? PLANTILLAS.ninguna
  const H = 104
  if (!pl.ejes.length) {
    // Orugas o equipo fijo
    return (
      <svg viewBox={`0 0 ${ANCHO} ${H}`} height={alto} width={(alto * ANCHO) / H} aria-hidden="true">
        <rect x="20" y="20" width="24" height="64" rx="3" fill="var(--superficie-2)" stroke="currentColor" strokeWidth="1.5" />
        <rect x="8" y="14" width="9" height="76" rx="4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2" />
        <rect x="47" y="14" width="9" height="76" rx="4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2" />
      </svg>
    )
  }
  const delanteros = pl.ejes.filter((e) => e.nombre.startsWith('Delantero'))
  const traseros = pl.ejes.filter((e) => !e.nombre.startsWith('Delantero'))
  const ys = [
    ...delanteros.map((_, i) => 26 + i * 17),
    ...traseros.map((_, i) => H - 14 - (traseros.length - 1 - i) * 17),
  ]
  const xs = (n: number) => (n === 2 ? [12, 45] : [5, 13, 44, 52])
  return (
    <svg viewBox={`0 0 ${ANCHO} ${H}`} height={alto} width={(alto * ANCHO) / H} aria-hidden="true">
      {/* chasis */}
      <rect x="26" y="14" width="12" height={H - 20} rx="2" fill="var(--superficie-2)" stroke="var(--borde)" strokeWidth="1" />
      {/* cabina */}
      <rect x="16" y="3" width="32" height="15" rx="4" fill="var(--acento-suave)" stroke="var(--acento)" strokeWidth="1.5" />
      {pl.ejes.map((eje, i) => {
        const y = ys[i]
        const x = xs(eje.posiciones.length)
        return (
          <g key={eje.nombre}>
            <line x1={x[0] + LLANTA.w} x2={x[x.length - 1]} y1={y} y2={y} stroke="currentColor" strokeWidth="2" />
            {x.map((xx) => (
              <rect key={xx} x={xx} y={y - LLANTA.h / 2} width={LLANTA.w} height={LLANTA.h} rx="1.5" fill="currentColor" />
            ))}
          </g>
        )
      })}
      {pl.repuesto && (
        <rect x="27" y={H / 2 + 4} width="10" height="6" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 1.5" />
      )}
    </svg>
  )
}

/** Configuración de ejes con dibujos (vista desde arriba). */
export function SelectorEjes({ valor, onCambio }: { valor: string; onCambio: (v: string) => void }) {
  return (
    <div className="opciones-dibujo ejes-opciones">
      {Object.entries(PLANTILLAS).map(([k, pl]) => (
        <button
          key={k}
          type="button"
          className={'opcion-dibujo' + (k === valor ? ' elegida' : '')}
          aria-pressed={k === valor}
          title={pl.nombre}
          onClick={() => onCambio(k)}
        >
          <PlantaEjes codigo={k} alto={96} />
          <span>{pl.nombre}</span>
        </button>
      ))}
    </div>
  )
}
