import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import type { User } from '@supabase/supabase-js'
import type { Profile, TeamSession } from '../types'

const TEAM_SESSION_KEY = 'tc_team_session'

interface AuthContextType {
  // Admin auth (Supabase)
  user: User | null
  profile: Profile | null
  // Player auth (team session)
  teamSession: TeamSession | null
  // State
  loading: boolean
  isAdmin: boolean
  isPlayer: boolean
  // Actions
  signIn: (email: string, password: string) => Promise<{ error: string | null }>
  signInAsTeam: (teamName: string, passcode: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [teamSession, setTeamSession] = useState<TeamSession | null>(null)
  const [loading, setLoading] = useState(true)

  async function fetchProfile(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    setProfile(data)
  }

  // Load admin auth from Supabase + team session from localStorage
  useEffect(() => {
    // Restore team session from localStorage
    const stored = localStorage.getItem(TEAM_SESSION_KEY)
    if (stored) {
      try {
        setTeamSession(JSON.parse(stored))
      } catch {
        localStorage.removeItem(TEAM_SESSION_KEY)
      }
    }

    // Restore admin auth from Supabase
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id)
      }
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id)
      } else {
        setProfile(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // Admin sign in (email/password)
  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message ?? null }
  }

  // Player sign in (team name + passcode)
  async function signInAsTeam(teamName: string, passcode: string) {
    const { data, error } = await supabase.rpc('login_team', {
      p_team_name: teamName,
      p_passcode: passcode,
    })

    if (error) {
      return { error: error.message }
    }

    if (data?.error) {
      return { error: data.error as string }
    }

    const session: TeamSession = {
      team: data.team,
      game: data.game,
    }

    setTeamSession(session)
    localStorage.setItem(TEAM_SESSION_KEY, JSON.stringify(session))
    return { error: null }
  }

  async function signOut() {
    // Clear admin auth
    if (user) {
      await supabase.auth.signOut()
      setUser(null)
      setProfile(null)
    }
    // Clear team session
    if (teamSession) {
      setTeamSession(null)
      localStorage.removeItem(TEAM_SESSION_KEY)
    }
  }

  const isAdmin = !!user && profile?.role === 'admin'
  const isPlayer = !!teamSession

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      teamSession,
      loading,
      isAdmin,
      isPlayer,
      signIn,
      signInAsTeam,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  )
}
