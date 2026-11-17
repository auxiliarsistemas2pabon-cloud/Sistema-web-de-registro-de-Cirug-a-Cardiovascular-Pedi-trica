import { Navigate, Route, BrowserRouter, Routes } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { AppShell } from './layout/AppShell'
import { AdministracionPage } from './pages/AdministracionPage'
import { AlertasPage } from './pages/AlertasPage'
import { IndicadoresPage } from './pages/IndicadoresPage'
import { InicioPage } from './pages/InicioPage'
import { LoginPage } from './pages/LoginPage'
import { PacienteAdultoFichaPage } from './pages/PacienteAdultoFichaPage'
import { PacienteFichaPage } from './pages/PacienteFichaPage'
import { PacientesAdultosListaPage } from './pages/PacientesAdultosListaPage'
import { PacientesListaPage } from './pages/PacientesListaPage'
import { SeguridadCuentaPage } from './pages/SeguridadCuentaPage'

const ImportacionExportacionPage = lazy(async () => {
  const modulo = await import('./pages/ImportacionExportacionPage')
  return { default: modulo.ImportacionExportacionPage }
})

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path="/" element={<Navigate to="/inicio" replace />} />
            <Route path="/inicio" element={<InicioPage />} />
            <Route path="/pacientes" element={<PacientesListaPage />} />
            <Route element={<ProtectedRoute escritura />}><Route path="/pacientes/nuevo" element={<PacienteFichaPage />} /></Route>
            <Route path="/pacientes/:id" element={<PacienteFichaPage />} />
            <Route path="/adultos" element={<PacientesAdultosListaPage />} />
            <Route element={<ProtectedRoute escritura />}><Route path="/adultos/nuevo" element={<PacienteAdultoFichaPage />} /></Route>
            <Route path="/adultos/:id" element={<PacienteAdultoFichaPage />} />
            <Route path="/alertas" element={<AlertasPage />} />
            <Route path="/indicadores" element={<IndicadoresPage />} />

            <Route element={<ProtectedRoute administrador />}><Route
              path="/datos"
              element={
                <Suspense fallback={<p className="text-sm text-slate-500">Cargando…</p>}>
                  <ImportacionExportacionPage />
                </Suspense>
              }
            />
            <Route path="/administracion" element={<AdministracionPage />} /></Route>
            <Route path="/seguridad" element={<SeguridadCuentaPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/inicio" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
