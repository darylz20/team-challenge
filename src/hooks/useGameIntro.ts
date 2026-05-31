import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../providers/AuthProvider'
import type { IntroPage } from '../types'

/**
 * Player-side hook: fetches the game's intro pages + this team's
 * acknowledgement timestamp, and exposes an acknowledge() action.
 *
 * The 'required' flag drives the redirect gate in AppShell — true when
 * the team must view the intro before doing anything else.
 */
export function useGameIntro() {
  const { teamSession } = useAuth()
  const gameId = teamSession?.game.id
  const teamId = teamSession?.team.id
  const sessionToken = teamSession?.session_token
  const gameStatus = teamSession?.game.status

  const [introPages, setIntroPages] = useState<IntroPage[]>([])
  const [acknowledgedAt, setAcknowledgedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!gameId || !teamId) {
      setLoading(false)
      return
    }
    setLoading(true)
    const [{ data: game }, { data: team }] = await Promise.all([
      supabase.from('games').select('intro_pages').eq('id', gameId).single(),
      supabase.from('teams').select('intro_acknowledged_at').eq('id', teamId).single(),
    ])
    setIntroPages((game?.intro_pages as IntroPage[]) ?? [])
    setAcknowledgedAt(team?.intro_acknowledged_at ?? null)
    setLoading(false)
  }, [gameId, teamId])

  useEffect(() => { fetch() }, [fetch])

  const acknowledge = useCallback(async () => {
    if (!teamId || !sessionToken) return { error: 'No session' }
    const { data, error } = await supabase.rpc('acknowledge_intro', {
      p_team_id: teamId,
      p_session_token: sessionToken,
    })
    if (error) return { error: error.message }
    if (data?.error) return { error: data.error as string }
    setAcknowledgedAt(data?.acknowledged_at ?? new Date().toISOString())
    return { error: null }
  }, [teamId, sessionToken])

  // Intro is "required" when the game is active, the admin has configured
  // at least one page, and this team hasn't acknowledged yet.
  const required = gameStatus === 'active' && introPages.length > 0 && !acknowledgedAt

  return { introPages, acknowledgedAt, required, loading, acknowledge, refetch: fetch }
}
