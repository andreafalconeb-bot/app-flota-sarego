import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useSesion } from '../lib/sesion'
import { ErrorMsg } from '../components/ui'

export default function CambiarClave() {
  const { yo, recargar, salir } = useSesion()
  const [clave, setClave] = useState('')
  const [repetir, setRepetir] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const guardar = async (e: FormEvent) => {
    e.preventDefault()
    if (clave.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.')
    if (clave !== repetir) return setError('Las dos contraseñas no coinciden.')
    setEnviando(true)
    setError(null)
    const r = await supabase.auth.updateUser({ password: clave })
    if (r.error) {
      setError(r.error.message)
      setEnviando(false)
      return
    }
    const p = await supabase.from('profiles').update({ debe_cambiar_password: false }).eq('id', yo!.id)
    if (p.error) setError(p.error.message)
    else await recargar()
    setEnviando(false)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>
      <form className="tarjeta pila" style={{ width: 'min(380px, 100%)', gap: 14 }} onSubmit={guardar}>
        <h1>Crea tu contraseña</h1>
        <p className="sec chico" style={{ margin: 0 }}>
          Entraste con una contraseña provisional. Elige una tuya para seguir.
        </p>
        <label className="campo">
          <span>Contraseña nueva</span>
          <input type="password" autoComplete="new-password" required value={clave} onChange={(e) => setClave(e.target.value)} />
        </label>
        <label className="campo">
          <span>Repítela</span>
          <input type="password" autoComplete="new-password" required value={repetir} onChange={(e) => setRepetir(e.target.value)} />
        </label>
        <ErrorMsg error={error} />
        <div className="fila">
          <button className="primario" disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar'}</button>
          <button type="button" onClick={() => void salir()}>Salir</button>
        </div>
      </form>
    </div>
  )
}
