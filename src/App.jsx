import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Login from './pages/Login'
import Admin from './pages/Admin'
import Gallery from './pages/Gallery'

const ProtectedAdmin = ({ children }) => {
  const { user, loading } = useAuth()
  if (loading) return <Spinner />
  if (!user || user.email !== import.meta.env.VITE_ADMIN_EMAIL) return <Navigate to="/" />
  return children
}

const ProtectedClient = ({ children }) => {
  const { user, loading } = useAuth()
  if (loading) return <Spinner />
  if (!user) return <Navigate to="/" />
  if (user.email === import.meta.env.VITE_ADMIN_EMAIL) return <Navigate to="/admin" />
  return children
}

const Spinner = () => (
  <div className="min-h-screen bg-black flex items-center justify-center">
    <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
  </div>
)

const AppRoutes = () => {
  const { user, loading } = useAuth()
  if (loading) return <Spinner />

  return (
    <Routes>
      <Route path="/" element={
        user
          ? user.email === import.meta.env.VITE_ADMIN_EMAIL
            ? <Navigate to="/admin" />
            : <Navigate to="/gallery" />
          : <Login />
      } />
      <Route path="/admin" element={<ProtectedAdmin><Admin /></ProtectedAdmin>} />
      <Route path="/gallery" element={<ProtectedClient><Gallery /></ProtectedClient>} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  )
}