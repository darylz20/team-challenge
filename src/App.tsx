import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AuthProvider } from './providers/AuthProvider'
import { ProtectedRoute } from './components/auth/ProtectedRoute'
import { AdminRoute } from './components/auth/AdminRoute'
import { AppShell } from './components/layout/AppShell'
import { AdminShell } from './components/admin/AdminShell'

// Public
import { Login } from './pages/Login'

// Player pages
import { Home } from './pages/Home'
import { ChallengePlay } from './pages/ChallengePlay'
import { Leaderboard } from './pages/Leaderboard'

// Admin pages
import { Dashboard } from './pages/admin/Dashboard'
import { GameList } from './pages/admin/GameList'
import { GameEditor } from './pages/admin/GameEditor'
import { ChallengeBuilder } from './pages/admin/ChallengeBuilder'

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster
          position="top-center"
          theme="dark"
          richColors
          toastOptions={{
            style: {
              background: 'rgb(20 22 30)',
              border: '1px solid rgb(40 44 56)',
              color: 'rgb(230 232 240)',
            },
          }}
        />
        <Routes>
          {/* Public */}
          <Route path="/login" element={<Login />} />

          {/* Admin */}
          <Route path="/admin/*" element={
            <AdminRoute>
              <AdminShell>
                <Routes>
                  <Route index element={<Dashboard />} />
                  <Route path="games" element={<GameList />} />
                  <Route path="games/new" element={<GameEditor />} />
                  <Route path="games/:id" element={<GameEditor />} />
                  <Route path="games/:id/challenges/new" element={<ChallengeBuilder />} />
                  <Route path="games/:id/challenges/:cid" element={<ChallengeBuilder />} />
                </Routes>
              </AdminShell>
            </AdminRoute>
          } />

          {/* Player */}
          <Route path="/*" element={
            <ProtectedRoute>
              <AppShell>
                <Routes>
                  <Route index element={<Home />} />
                  <Route path="challenge/:id" element={<ChallengePlay />} />
                  <Route path="leaderboard" element={<Leaderboard />} />
                </Routes>
              </AppShell>
            </ProtectedRoute>
          } />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
