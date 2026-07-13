import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { ChallengeProgressState } from '../types'

export interface ProgressRow {
  team_id: string
  challenge_id: string
  state: ChallengeProgressState
  finalized: boolean
}

/**
 * All challenge_progress rows for a game (readable for every team while the
 * game is active). Used to surface live, not-yet-finalized points on Home and
 * the leaderboard. Subscribes to realtime so scores update as teams play.
 */
export function useGameProgress(gameId: string | undefined) {
  const [progress, setProgress] = useState<ProgressRow[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!gameId) return
    const { data } = await supabase
      .from('challenge_progress')
      .select('team_id, challenge_id, state, finalized')
      .eq('game_id', gameId)
    setProgress((data as ProgressRow[]) ?? [])
    setLoading(false)
  }, [gameId])

  useEffect(() => { fetch() }, [fetch])

  useEffect(() => {
    if (!gameId) return
    const channel = supabase
      .channel(`game-progress:${gameId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'challenge_progress', filter: `game_id=eq.${gameId}` },
        () => { fetch() },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [gameId, fetch])

  return { progress, loading, refetch: fetch }
}
