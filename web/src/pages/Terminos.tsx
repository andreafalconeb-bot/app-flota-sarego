import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useSesion } from '../lib/sesion'
import { Cargando, ErrorMsg, mensajeError, useCarga } from '../components/ui'

/** Andrea: una línea clara en los términos sobre el acceso de SAREGO y la IA a los datos. */
export default function Terminos() {
  const { yo, recargar, salir } = useSesion()
  const [acepto, setAcepto] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const { datos, error: errorCarga, cargando } = useCarga(async () => {
    const { data, error } = await supabase.from('flota_terminos').select('version, texto').eq('version', yo!.terminosVigentes).maybeSingle()
    if (error) throw new Error(error.message)
    return data as { version: number; texto: string } | null
  }, [yo?.terminosVigentes])

  const aceptar = async () => {
    setEnviando(true)
    setError(null)
    try {
      const { error } = await supabase.rpc('flota_aceptar_terminos', { p_version: datos!.version })
      if (error) throw new Error(error.message)
      await recargar()
    } catch (e) {
      setError(mensajeError(e))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div className="tarjeta pila" style={{ width: 'min(680px, 100%)', gap: 14 }}>
        <h1>Términos de uso</h1>
        {cargando ? (
          <Cargando />
        ) : (
          <>
            <ErrorMsg error={errorCarga} />
            {datos && (
              <div style={{ whiteSpace: 'pre-wrap', maxHeight: '50vh', overflow: 'auto', background: 'var(--superficie-2)', padding: 12, borderRadius: 6, fontSize: '.9rem' }}>
                {datos.texto.trim()}
              </div>
            )}
            <div className="aviso alerta">
              <b>Importante:</b> SAREGO, sus ingenieros y sus asistentes de inteligencia artificial pueden ver y analizar
              todos los datos que cargues en Flota SAREGO.
            </div>
            <label className="check">
              <input type="checkbox" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} />
              <span>Leí los términos y los acepto, incluido el acceso de SAREGO y de sus asistentes de IA a los datos.</span>
            </label>
            <ErrorMsg error={error} />
            <div className="fila">
              <button className="primario" disabled={!acepto || !datos || enviando} onClick={() => void aceptar()}>
                {enviando ? 'Guardando…' : 'Aceptar y entrar'}
              </button>
              <button onClick={() => void salir()}>Salir</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
