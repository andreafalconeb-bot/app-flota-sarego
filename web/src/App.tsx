import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { configFaltante } from './lib/supabase'
import { faltanTerminos, useSesion } from './lib/sesion'
import { ProveedorEmpresa } from './lib/empresa'
import { Cargando, ErrorMsg } from './components/ui'
import Layout from './components/Layout'
import Login from './pages/Login'
import CambiarClave from './pages/CambiarClave'
import Terminos from './pages/Terminos'
import Empresas from './pages/Empresas'
import Resumen from './pages/Resumen'
import Activos from './pages/Activos'
import ActivoFicha from './pages/ActivoFicha'
import Neumaticos from './pages/Neumaticos'
import Combustible from './pages/Combustible'
import Costos from './pages/Costos'
import Usuarios from './pages/Usuarios'
import ConfigEmpresa from './pages/ConfigEmpresa'

function EmpresaRaiz() {
  const { empresaId } = useParams()
  return (
    <ProveedorEmpresa key={empresaId} empresaId={empresaId!}>
      <Layout />
    </ProveedorEmpresa>
  )
}

function Pantalla({ children }: { children: React.ReactNode }) {
  return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 16 }}>{children}</div>
}

export default function App() {
  const { cargando, session, yo, error, salir, recargar } = useSesion()

  if (configFaltante) {
    return (
      <Pantalla>
        <div className="aviso error">Faltan VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en la configuración.</div>
      </Pantalla>
    )
  }
  if (cargando) return <Cargando />
  if (!session) return <Login />
  if (!yo) {
    return (
      <Pantalla>
        <div className="tarjeta pila" style={{ width: 'min(420px, 100%)' }}>
          <ErrorMsg error={error ?? 'No se pudo cargar tu cuenta.'} />
          <div className="fila">
            <button className="primario" onClick={() => void recargar()}>Reintentar</button>
            <button onClick={() => void salir()}>Salir</button>
          </div>
        </div>
      </Pantalla>
    )
  }
  if (yo.debeCambiarClave) return <CambiarClave />
  if (faltanTerminos(yo)) return <Terminos />
  if (!yo.esSarego && yo.membresias.length === 0) {
    return (
      <Pantalla>
        <div className="tarjeta pila" style={{ width: 'min(440px, 100%)' }}>
          <h1>Flota SAREGO</h1>
          <p style={{ margin: 0 }}>
            Tu cuenta ({yo.email}) todavía no está asociada a ninguna empresa. Pídele a tu ingeniero de SAREGO o al
            administrador de tu empresa que te invite.
          </p>
          <div className="fila">
            <button onClick={() => void recargar()}>Volver a revisar</button>
            <button onClick={() => void salir()}>Salir</button>
          </div>
        </div>
      </Pantalla>
    )
  }

  const inicio = !yo.esSarego && yo.membresias.length === 1 ? `/e/${yo.membresias[0].empresa_id}` : null
  return (
    <Routes>
      <Route path="/" element={inicio ? <Navigate to={inicio} replace /> : <Empresas />} />
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="/e/:empresaId" element={<EmpresaRaiz />}>
        <Route index element={<Resumen />} />
        <Route path="activos" element={<Activos />} />
        <Route path="activos/:activoId" element={<ActivoFicha />} />
        <Route path="neumaticos" element={<Neumaticos />} />
        <Route path="combustible" element={<Combustible />} />
        <Route path="costos" element={<Costos />} />
        <Route path="usuarios" element={<Usuarios />} />
        <Route path="empresa" element={<ConfigEmpresa />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
