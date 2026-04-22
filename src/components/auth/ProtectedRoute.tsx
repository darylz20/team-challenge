import { Navigate } from 'react-router-dom'
import { useAuth } from '../../providers/AuthProvider'

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { teamSession, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-dvh bg-abyss flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-neon border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!teamSession) {
    return <Navigate to="/login" replace />
  }

  return <>{children}</>
}
