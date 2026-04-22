import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogIn, Users, Shield } from 'lucide-react'
import { useAuth } from '../providers/AuthProvider'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Card } from '../components/ui/Card'
import { cn } from '../lib/utils'

type LoginMode = 'player' | 'admin'

export function Login() {
  const { signIn, signInAsTeam, profile, teamSession } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<LoginMode>('player')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Admin fields
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // Player fields
  const [teamName, setTeamName] = useState('')
  const [passcode, setPasscode] = useState('')

  // Redirect if already logged in
  if (profile?.role === 'admin') {
    navigate('/admin', { replace: true })
    return null
  }
  if (teamSession) {
    navigate('/', { replace: true })
    return null
  }

  async function handleAdminSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error } = await signIn(email, password)
    setSubmitting(false)
    if (error) setError(error)
  }

  async function handlePlayerSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error } = await signInAsTeam(teamName, passcode)
    setSubmitting(false)
    if (error) {
      setError(error)
    } else {
      navigate('/', { replace: true })
    }
  }

  return (
    <div className="min-h-dvh bg-abyss flex items-center justify-center px-4">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="text-center mb-8">
          <h1 className="font-display text-3xl font-black text-neon tracking-wider">
            TEAM
            <br />
            CHALLENGE
          </h1>
          <p className="mt-2 text-text-muted text-sm">Sign in to continue</p>
        </div>

        {/* Mode selector */}
        <div className="flex gap-2 mb-4">
          <button
            type="button"
            onClick={() => { setMode('player'); setError(null) }}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all',
              mode === 'player'
                ? 'bg-neon/15 text-neon border border-neon/40'
                : 'bg-surface-overlay/50 text-text-muted border border-surface-overlay hover:border-text-faint',
            )}
          >
            <Users size={16} />
            Player
          </button>
          <button
            type="button"
            onClick={() => { setMode('admin'); setError(null) }}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all',
              mode === 'admin'
                ? 'bg-neon/15 text-neon border border-neon/40'
                : 'bg-surface-overlay/50 text-text-muted border border-surface-overlay hover:border-text-faint',
            )}
          >
            <Shield size={16} />
            Admin
          </button>
        </div>

        <Card>
          {mode === 'player' ? (
            <form onSubmit={handlePlayerSubmit} className="flex flex-col gap-4">
              <Input
                id="team-name"
                label="Team Name"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="Enter your team name"
                required
                autoComplete="off"
              />
              <Input
                id="passcode"
                label="Passcode"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value.toUpperCase())}
                placeholder="e.g. A3F8B2"
                required
                autoComplete="off"
                className="font-mono tracking-widest"
              />

              {error && <p className="text-sm text-magenta">{error}</p>}

              <Button type="submit" disabled={submitting} className="w-full gap-2 mt-2">
                <LogIn size={16} />
                {submitting ? 'Joining...' : 'Join Game'}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleAdminSubmit} className="flex flex-col gap-4">
              <Input
                id="email"
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
              <Input
                id="password"
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                autoComplete="current-password"
              />

              {error && <p className="text-sm text-magenta">{error}</p>}

              <Button type="submit" disabled={submitting} className="w-full gap-2 mt-2">
                <LogIn size={16} />
                {submitting ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  )
}
