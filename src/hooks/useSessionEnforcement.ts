import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase } from '../lib/supabase'
import { useAuth } from '../providers/AuthProvider'

/**
 * Single-device enforcement (last-write-wins).
 *
 * Subscribes to UPDATE events on this team's row. When the
 * `active_session_token` no longer matches the one we got at login,
 * a newer device has claimed the team — sign this device out.
 */
export function useSessionEnforcement() {
  const { teamSession, signOut } = useAuth()
  const navigate = useNavigate()
  const teamId = teamSession?.team.id
  const ourToken = teamSession?.session_token

  // Keep latest signOut/navigate in a ref so the channel doesn't tear down on every render
  const signOutRef = useRef(signOut)
  const navigateRef = useRef(navigate)
  signOutRef.current = signOut
  navigateRef.current = navigate

  useEffect(() => {
    if (!teamId || !ourToken) return

    const channel = supabase
      .channel(`team-session:${teamId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'teams',
          filter: `id=eq.${teamId}`,
        },
        (payload) => {
          const newRow = payload.new as { active_session_token?: string | null }
          const newToken = newRow?.active_session_token
          if (newToken && newToken !== ourToken) {
            toast.error('Je bent op een ander apparaat ingelogd', {
              description: 'Deze sessie wordt afgesloten.',
              duration: 6000,
            })
            signOutRef.current()
            navigateRef.current('/login')
          }
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [teamId, ourToken])
}
