import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../providers/AuthProvider'
import type { ChallengeProgressState } from '../types'

interface UseChallengeProgressArgs {
  challengeId: string | undefined
}

export interface OpenDoorAttemptResult {
  matched: boolean
  index?: number
  points?: number
  place?: number | null // populated when scoring_mode is 'placement'
  attempts_used?: number
  attempts_exhausted?: boolean
  state?: import('../types').ChallengeProgressState
  error?: string
}

export interface CollectiveMemoryAttemptResult {
  matched: boolean
  index?: number
  points?: number
  place?: number | null
  attempts_used?: number
  attempts_exhausted?: boolean
  state?: import('../types').ChallengeProgressState
  error?: string
}

export interface GalleryAttemptResult {
  matched: boolean
  index?: number
  points?: number
  place?: number | null
  attempts_used?: number
  attempts_exhausted?: boolean
  state?: import('../types').ChallengeProgressState
  error?: string
}

export interface PuzzleAttemptResult {
  matched: boolean
  index?: number
  points?: number
  place?: number | null
  already_solved?: boolean
  already_locked?: boolean
  newly_locked?: number[]
  state?: import('../types').ChallengeProgressState
  error?: string
}

export interface FinalizeResult {
  id?: string
  is_correct: boolean
  points_awarded: number
  already_finalized?: boolean
  error?: string
}

/**
 * Progress lifecycle for stateful challenge types (Open Deur etc).
 *
 * - On mount: get_or_init_progress (creates row + started_at on first visit)
 * - attempt() and finalize() are type-specific RPC wrappers
 * - State refreshes on every action so refresh / revisit resumes exactly
 *
 * Note: time limits were removed globally. Players finalize manually via the
 * Klaar button, or auto-finalize when all items are found / attempts run out.
 */
export function useChallengeProgress({ challengeId }: UseChallengeProgressArgs) {
  const { teamSession } = useAuth()
  const teamId = teamSession?.team.id
  const gameId = teamSession?.game.id
  const sessionToken = teamSession?.session_token

  const [state, setState] = useState<ChallengeProgressState>({})
  const [finalized, setFinalized] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Init progress row
  useEffect(() => {
    if (!challengeId || !teamId || !gameId || !sessionToken) return
    let cancelled = false
    setLoading(true)
    setError(null)

    supabase.rpc('get_or_init_progress', {
      p_team_id: teamId,
      p_challenge_id: challengeId,
      p_game_id: gameId,
      p_session_token: sessionToken,
    }).then(({ data, error: rpcError }) => {
      if (cancelled) return
      if (rpcError) { setError(rpcError.message); setLoading(false); return }
      if (data?.error) { setError(data.error as string); setLoading(false); return }
      setState((data?.state ?? {}) as ChallengeProgressState)
      setFinalized(!!data?.finalized)
      setLoading(false)
    })

    return () => { cancelled = true }
  }, [challengeId, teamId, gameId, sessionToken])

  const attemptOpenDoor = useCallback(
    async (text: string): Promise<OpenDoorAttemptResult> => {
      if (!challengeId || !teamId || !gameId || !sessionToken) {
        return { matched: false, error: 'Session missing' }
      }
      const { data, error: rpcError } = await supabase.rpc('open_door_attempt', {
        p_team_id: teamId,
        p_challenge_id: challengeId,
        p_game_id: gameId,
        p_session_token: sessionToken,
        p_attempt: text,
      })
      if (rpcError) return { matched: false, error: rpcError.message }
      if (data?.error) return { matched: false, error: data.error as string, attempts_exhausted: data.attempts_exhausted }
      // Sync on misses too — a miss is what increments attempts_used.
      if (data?.state) {
        setState(data.state as ChallengeProgressState)
      }
      return data as OpenDoorAttemptResult
    },
    [challengeId, teamId, gameId, sessionToken],
  )

  const attemptCollectiveMemory = useCallback(
    async (text: string): Promise<CollectiveMemoryAttemptResult> => {
      if (!challengeId || !teamId || !gameId || !sessionToken) {
        return { matched: false, error: 'Session missing' }
      }
      const { data, error: rpcError } = await supabase.rpc('collective_memory_attempt', {
        p_team_id: teamId,
        p_challenge_id: challengeId,
        p_game_id: gameId,
        p_session_token: sessionToken,
        p_attempt: text,
      })
      if (rpcError) return { matched: false, error: rpcError.message }
      if (data?.error) return { matched: false, error: data.error as string, attempts_exhausted: data.attempts_exhausted }
      if (data?.state) {
        setState(data.state as ChallengeProgressState)
      }
      return data as CollectiveMemoryAttemptResult
    },
    [challengeId, teamId, gameId, sessionToken],
  )

  const attemptGallery = useCallback(
    async (text: string): Promise<GalleryAttemptResult> => {
      if (!challengeId || !teamId || !gameId || !sessionToken) {
        return { matched: false, error: 'Session missing' }
      }
      const { data, error: rpcError } = await supabase.rpc('gallery_attempt', {
        p_team_id: teamId,
        p_challenge_id: challengeId,
        p_game_id: gameId,
        p_session_token: sessionToken,
        p_attempt: text,
      })
      if (rpcError) return { matched: false, error: rpcError.message }
      if (data?.error) return { matched: false, error: data.error as string, attempts_exhausted: data.attempts_exhausted }
      if (data?.state) {
        setState(data.state as ChallengeProgressState)
      }
      return data as GalleryAttemptResult
    },
    [challengeId, teamId, gameId, sessionToken],
  )

  const attemptPuzzle = useCallback(
    async (text: string): Promise<PuzzleAttemptResult> => {
      if (!challengeId || !teamId || !gameId || !sessionToken) {
        return { matched: false, error: 'Session missing' }
      }
      const { data, error: rpcError } = await supabase.rpc('puzzle_attempt', {
        p_team_id: teamId,
        p_challenge_id: challengeId,
        p_game_id: gameId,
        p_session_token: sessionToken,
        p_attempt: text,
      })
      if (rpcError) return { matched: false, error: rpcError.message }
      if (data?.error) return { matched: false, error: data.error as string }
      if (data?.state) {
        setState(data.state as ChallengeProgressState)
      }
      return data as PuzzleAttemptResult
    },
    [challengeId, teamId, gameId, sessionToken],
  )

  const finalize = useCallback(async (): Promise<FinalizeResult | null> => {
    if (!challengeId || !teamId || !gameId || !sessionToken) return null
    const { data, error: rpcError } = await supabase.rpc('finalize_challenge', {
      p_team_id: teamId,
      p_challenge_id: challengeId,
      p_game_id: gameId,
      p_session_token: sessionToken,
    })
    if (rpcError) return { error: rpcError.message, is_correct: false, points_awarded: 0 }
    if (data?.error) return { error: data.error as string, is_correct: false, points_awarded: 0 }
    setFinalized(true)
    return data as FinalizeResult
  }, [challengeId, teamId, gameId, sessionToken])

  return {
    state,
    finalized,
    loading,
    error,
    attemptOpenDoor,
    attemptPuzzle,
    attemptGallery,
    attemptCollectiveMemory,
    finalize,
  }
}
