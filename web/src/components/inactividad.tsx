// Lectura semanal e inactividad (Andrea, 24/nov/2026): cada activo pide
// odómetro u horómetro cada 7 días, salvo que esté en inactividad. Parado,
// su medidor no avanza y sus fluidos solo vencen por tiempo. No es lo
// mismo que darlo de baja.
import { useState } from 'react'
import { useEmpresa } from '../lib/empresa'
import { DIAS_LECTURA, estadoLectura } from '../lib/calculos'
import { fecha, hoyISO } from '../lib/formato'
import type { Activo } from '../lib/tipos'
import { Campo, ErrorMsg, Modal, mensajeError } from './ui'

const MOTIVOS = ['Esperando repuestos', 'En reparación mayor', 'Sin trabajo / sin contrato', 'Sin operador', 'Temporada baja', 'Por vender']

/** Siete cuadritos: los días gastados de la semana de lectura. */
export function Semana({ dias }: { dias: number | null }) {
  return (
    <span className="semana" aria-label={dias == null ? 'Sin lectura' : `Hace ${dias} días`}>
      {Array.from({ length: DIAS_LECTURA }, (_, i) => (
        <i key={i} className={dias == null || dias >= DIAS_LECTURA ? 'vencido' : i < dias ? 'gastado' : ''} />
      ))}
    </span>
  )
}

/** Aviso en la ficha: toca registrar la lectura, o el activo está parado. */
export function AvisoLectura({ activo, onLectura }: { activo: Activo; onLectura: () => void }) {
  const e = useEmpresa()
  const [error, setError] = useState<string | null>(null)
  const l = estadoLectura(activo)
  if (l.estado === 'inactivo') {
    const volver = async () => {
      try {
        await e.guardar('activos', { ...activo, en_inactividad: false, inactivo_desde: null, inactividad_motivo: null })
        onLectura()
      } catch (x) {
        setError(mensajeError(x))
      }
    }
    return (
      <div className="aviso-inactivo">
        <span className="icono-reloj" aria-hidden>⏸</span>
        <div style={{ flex: 1, minWidth: 220 }}>
          <b>En inactividad{activo.inactivo_desde ? ` desde el ${fecha(activo.inactivo_desde)}` : ''}</b>
          {activo.inactividad_motivo ? ` · ${activo.inactividad_motivo}` : ''}
          <div className="chico">
            Está parado: no pide lectura y el {activo.medidor === 'horas' ? 'horómetro' : 'odómetro'} no avanza, así que sus fluidos solo vencen por
            tiempo (los días del intervalo).
          </div>
          <ErrorMsg error={error} />
        </div>
        {e.puedeEscribir && <button className="primario" onClick={() => void volver()}>Volver a operación</button>}
      </div>
    )
  }
  if (l.estado !== 'pendiente') return null
  return (
    <div className="aviso-lectura">
      <span className="icono-reloj" aria-hidden>⏱</span>
      <div style={{ flex: 1, minWidth: 220 }}>
        <b>Toca registrar la lectura</b>
        <div className="chico">
          {l.dias == null ? 'Este activo todavía no tiene lectura.' : `La última fue hace ${l.dias} días.`} Cada {DIAS_LECTURA} días se pide el{' '}
          {activo.medidor === 'horas' ? 'horómetro' : activo.medidor === 'km_horas' ? 'odómetro y el horómetro' : 'odómetro'}. Si el activo está parado,
          ponlo en inactividad y deja de pedirla.
        </div>
        <div style={{ marginTop: 4 }}><Semana dias={l.dias} /></div>
      </div>
      {e.puedeEscribir && <button className="primario" onClick={onLectura}>Registrar lectura</button>}
    </div>
  )
}

export function FormInactividad({ activo, abierto, onCerrar }: { activo: Activo; abierto: boolean; onCerrar: () => void }) {
  const e = useEmpresa()
  const [desde, setDesde] = useState(hoyISO())
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const guardar = async () => {
    setEnviando(true)
    setError(null)
    try {
      await e.guardar('activos', { ...activo, en_inactividad: true, inactivo_desde: desde, inactividad_motivo: motivo.trim() || null })
      onCerrar()
    } catch (x) {
      setError(mensajeError(x))
    } finally {
      setEnviando(false)
    }
  }
  return (
    <Modal
      abierto={abierto}
      titulo={`Poner ${activo.codigo} en inactividad`}
      onCerrar={onCerrar}
      pie={
        <>
          <button onClick={onCerrar}>Cancelar</button>
          <button className="primario" disabled={enviando || !desde} onClick={() => void guardar()}>{enviando ? 'Guardando…' : 'Poner en inactividad'}</button>
        </>
      }
    >
      <div className="aviso-inactivo chico">
        <span className="icono-reloj" aria-hidden>⏸</span>
        <div style={{ flex: 1 }}>
          Mientras esté parado no se pide la lectura semanal y sus fluidos vencen solo por tiempo. Sigue en la flota: no es lo mismo que darlo de baja.
        </div>
      </div>
      <Campo etiqueta="Parado desde">
        <input type="date" value={desde} max={hoyISO()} onChange={(x) => setDesde(x.target.value)} />
      </Campo>
      <Campo etiqueta="Motivo">
        <input list="motivos-inactividad" value={motivo} onChange={(x) => setMotivo(x.target.value)} placeholder="Elige o escribe" />
        <datalist id="motivos-inactividad">{MOTIVOS.map((m) => <option key={m} value={m} />)}</datalist>
      </Campo>
      <div className="fila chips-indices">
        {MOTIVOS.map((m) => (
          <button key={m} type="button" className={'chico' + (motivo === m ? ' primario' : '')} onClick={() => setMotivo(m)}>{m}</button>
        ))}
      </div>
      <ErrorMsg error={error} />
    </Modal>
  )
}
