// Planta del vehículo vista desde arriba, con los neumáticos dibujados
// (banda con su labrado) sobre el chasis y los ejes. La usan la pestaña
// Neumáticos del activo y la inspección. Cada neumático lleva un anillo
// con el color de su estado, un ícono y su texto debajo: el color nunca
// va solo.
import type { ReactNode } from 'react'
import { PLANTILLAS, nombrePosicion } from '../lib/ejes'
import type { EstadoMedida } from '../lib/calculos'

export interface Celda {
  /** null = posición sin neumático */
  estado: EstadoMedida | null
  /** Primera línea bajo el neumático (por ejemplo el serial) */
  titulo?: ReactNode
  /** Segunda línea (presión y profundidad) */
  detalle?: ReactNode
  ayuda?: string
}

const ICONO: Record<EstadoMedida, string> = { ok: '✓', alerta: '!', critico: '✕', sin_dato: '' }

export function PlantaVehiculo({ configuracion, celda, elegida, onElegir, repuesto = true }: {
  configuracion: string | null
  celda: (pos: string) => Celda
  elegida?: string | null
  onElegir?: (pos: string) => void
  /** Mostrar el repuesto aunque esté vacío */
  repuesto?: boolean
}) {
  const plantilla = PLANTILLAS[configuracion ?? ''] ?? PLANTILLAS.ninguna

  const Neumatico = ({ pos }: { pos: string }) => {
    const c = celda(pos)
    const vacia = c.estado === null
    return (
      <button
        type="button"
        className={'pv-llanta' + (vacia ? ' vacia' : ' e-' + c.estado) + (pos === elegida ? ' elegida' : '')}
        onClick={() => onElegir?.(pos)}
        aria-pressed={pos === elegida}
        title={c.ayuda ?? nombrePosicion(pos)}
        disabled={!onElegir}
      >
        <span className="pv-goma" aria-hidden="true">
          {!vacia && c.estado !== 'sin_dato' && <span className="pv-icono">{ICONO[c.estado!]}</span>}
          {vacia && <span className="pv-mas">+</span>}
        </span>
        <span className="pv-pos mono">{pos}</span>
        {c.titulo != null && <span className="pv-titulo mono">{c.titulo}</span>}
        {c.detalle != null && <span className="pv-detalle">{c.detalle}</span>}
      </button>
    )
  }

  const mitad = (ps: string[]) => [ps.slice(0, ps.length / 2), ps.slice(ps.length / 2)]
  const conRepuesto = plantilla.repuesto && (repuesto || celda('R').estado !== null)

  return (
    <div className="pv">
      <div className="pv-vehiculo">
        <div className="pv-cabina"><span>FRENTE</span></div>
        <div className="pv-chasis" aria-hidden="true" />
        {plantilla.ejes.map((eje) => {
          const [izq, der] = mitad(eje.posiciones)
          return (
            <div key={eje.nombre} className="pv-eje">
              <span className="pv-nombre-eje">{eje.nombre}</span>
              <div className="pv-lado izq">{izq.map((p) => <Neumatico key={p} pos={p} />)}</div>
              <div className="pv-barra" aria-hidden="true" />
              <div className="pv-lado der">{der.map((p) => <Neumatico key={p} pos={p} />)}</div>
            </div>
          )
        })}
      </div>
      {conRepuesto && (
        <div className="pv-repuesto">
          <span className="pv-nombre-eje">Repuesto</span>
          <Neumatico pos="R" />
        </div>
      )}
    </div>
  )
}

export function LeyendaEstados() {
  return (
    <div className="fila chico pv-leyenda">
      <span><span className="pv-punto e-ok">✓</span> Bien</span>
      <span><span className="pv-punto e-alerta">!</span> Revisar: presión ±10 % o banda ≤ 5 mm</span>
      <span><span className="pv-punto e-critico">✕</span> Crítico: presión ±20 % o banda ≤ 3 mm</span>
      <span><span className="pv-punto e-sin_dato" /> Sin inspección</span>
    </div>
  )
}
