import { useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { useSesion } from '../lib/sesion'
import { useEmpresa } from '../lib/empresa'
import { fechaHora } from '../lib/formato'
import { ROLES } from '../lib/catalogos'
import { Cargando, Pill } from './ui'

import { ListaMedidas } from './medidaNeumatico'

export default function Layout() {
  const { yo, salir } = useSesion()
  const e = useEmpresa()
  const [msg, setMsg] = useState<string | null>(null)
  const base = `/e/${e.empresa?.id ?? ''}`
  const varias = yo?.esSarego || (yo?.membresias.length ?? 0) > 1

  const sincronizar = async () => {
    const r = await e.sincronizarAhora()
    setMsg(r ?? 'Todo sincronizado con la nube.')
  }

  if (!e.empresa) {
    return e.error ? (
      <div className="contenido">
        <div className="aviso error">{e.error}</div>
        <p><Link to="/">Volver</Link></p>
      </div>
    ) : (
      <Cargando />
    )
  }

  return (
    <>
      {/* Medidas del ERP y comunes, para sugerir al escribir una medida */}
      <ListaMedidas />
      <header className="cabecera">
        <Link to={varias ? '/' : base} className="logo" title={varias ? 'Cambiar de empresa' : undefined}>
          <img src="/favicon.svg" alt="" width={26} height={26} /> {e.empresa.nombre}
        </Link>
        <nav>
          <NavLink to={base} end>Inicio</NavLink>
          <NavLink to={`${base}/activos`}>Activos</NavLink>
          <NavLink to={`${base}/neumaticos`}>Neumáticos</NavLink>
          <NavLink to={`${base}/combustible`}>Combustible</NavLink>
          <NavLink to={`${base}/costos`}>Costos</NavLink>
          {e.esAdminEmpresa && <NavLink to={`${base}/usuarios`}>Usuarios</NavLink>}
          {e.rol === 'sarego' && <NavLink to={`${base}/empresa`}>Empresa</NavLink>}
        </nav>
        <div className="usuario">
          {!e.online && <span className="pill alerta">Sin internet</span>}
          {e.enCola > 0 && (
            <button className="cola" onClick={() => void sincronizar()} title="Cambios guardados en este equipo, pendientes de subir">
              {e.enCola} sin subir
            </button>
          )}
          <button className="chico" disabled={e.sincronizando || !e.online} onClick={() => void sincronizar()} title={e.ultimaSync ? 'Última: ' + fechaHora(e.ultimaSync) : 'Nunca sincronizado'}>
            {e.sincronizando ? 'Sincronizando…' : '⟳ Sincronizar'}
          </button>
          <span className="ocultar-movil">
            {yo?.nombre} · {e.rol === 'sarego' ? 'SAREGO' : e.rol ? ROLES[e.rol] : ''}
          </span>
          <button className="chico" onClick={() => void salir()}>Salir</button>
        </div>
      </header>
      <main className="contenido">
        <div className="pila" style={{ marginBottom: 12 }}>
          {e.empresa.plan === 'gratis' && e.rol === 'sarego' && <span><Pill>Versión gratis</Pill></span>}
          {e.bloqueo.estado === 'aviso' && (
            <div className="aviso alerta">
              Este equipo lleva {e.bloqueo.diasSinSync} días sin sincronizar con la nube. Conéctate a internet y
              sincroniza: en {e.bloqueo.diasRestantes} días la app se tranca y no podrás ver reportes ni costos.
            </div>
          )}
          {e.bloqueo.estado === 'bloqueada' && (
            <div className="aviso error">
              <b>App trancada:</b> este equipo lleva {e.bloqueo.diasSinSync} días sin sincronizar. Puedes seguir cargando
              datos, pero los reportes y los costos vuelven cuando sincronices con internet.
            </div>
          )}
          {e.bloqueo.estado === 'sin_copia' && e.rol !== 'sarego' && !e.sincronizando && (
            <div className="aviso alerta">Este equipo todavía no tiene la copia de la flota. Conéctate a internet para descargarla.</div>
          )}
          {e.motivoSoloLectura && e.rol !== 'consulta' && <div className="aviso alerta">{e.motivoSoloLectura}</div>}
          {e.error && e.online && <div className="aviso error">No se pudo sincronizar: {e.error}</div>}
          {e.rechazos.length > 0 && (
            <div className="aviso error">
              {e.rechazos.length} cambios no se aceptaron en la nube. <Link to={base}>Ver el detalle en Inicio</Link>.
            </div>
          )}
          {msg && (
            <div className="aviso" onClick={() => setMsg(null)} role="status">
              {msg}
            </div>
          )}
        </div>
        {e.cargando ? <Cargando /> : <Outlet />}
      </main>
    </>
  )
}
