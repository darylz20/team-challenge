import { Navigate } from 'react-router-dom'
import { useAuth } from '../../providers/AuthProvider'

export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-dvh bg-abyss flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-neon border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (profile && profile.role !== 'admin') {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
