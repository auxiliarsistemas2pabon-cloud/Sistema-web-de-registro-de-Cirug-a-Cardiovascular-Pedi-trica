import { Navigate, Route, BrowserRouter, Routes } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { ProtectedRoute } from './auth/ProtectedRoute'
import { AppShell } from './layout/AppShell'
import { AdministracionPage } from './pages/AdministracionPage'
import { AlertasPage } from './pages/AlertasPage'
import { IndicadoresPage } from './pages/IndicadoresPage'
import { LoginPage } from './pages/LoginPage'
import { PacienteFichaPage } from './pages/PacienteFichaPage'
import { PacientesListaPage } from './pages/PacientesListaPage'

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
            <Route path="/" element={<Navigate to="/pacientes" replace />} />
            <Route path="/pacientes" element={<PacientesListaPage />} />
            <Route path="/pacientes/nuevo" element={<PacienteFichaPage />} />
            <Route path="/pacientes/:id" element={<PacienteFichaPage />} />
            <Route path="/alertas" element={<AlertasPage />} />
            <Route path="/indicadores" element={<IndicadoresPage />} />

            <Route element={<ProtectedRoute rolesPermitidos={['administrador', 'registrador']} />}>
              <Route
                path="/datos"
                element={
                  <Suspense fallback={<p className="text-sm text-slate-500">Cargando…</p>}>
                    <ImportacionExportacionPage />
                  </Suspense>
                }
              />
            </Route>

            <Route element={<ProtectedRoute rolesPermitidos={['administrador']} />}>
              <Route path="/administracion" element={<AdministracionPage />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/pacientes" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
