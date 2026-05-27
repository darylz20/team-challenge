import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../providers/AuthProvider'
import type { ChallengeProgressState } from '../types'

interface UseChallengeProgressArgs {
  challengeId: string | undefined
  timeLimitSeconds: number | null | undefined
}

export interface OpenDoorAttemptResult {
  matched: boolean
  index?: number
  points?: number
  place?: number | null // populated when scoring_mode is 'placement'
  error?: string
  time_expired?: boolean
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
  time_expired?: boolean
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
  time_expired?: boolean
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
 * - Server-authoritative timer based on started_at
 * - attempt() and finalize() are type-specific RPC wrappers
 * - State refreshes on every action so refresh / revisit resumes exactly
 */
export function useChallengeProgress({ challengeId, timeLimitSeconds }: UseChallengeProgressArgs) {
  const { teamSession } = useAuth()
  const teamId = teamSession?.team.id
  const gameId = teamSession?.game.id
  const sessionToken = teamSession?.session_token

  const [state, setState] = useState<ChallengeProgressState>({})
  const [startedAt, setStartedAt] = useState<number | null>(null) // ms since epoch
  const [finalized, setFinalized] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

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
      setStartedAt(data?.started_at ? new Date(data.started_at).getTime() : null)
      setFinalized(!!data?.finalized)
      setLoading(false)
    })

    return () => { cancelled = true }
  }, [challengeId, teamId, gameId, sessionToken])

  // Clock tick (only while timer is active and not finalized)
  useEffect(() => {
    if (!timeLimitSeconds || finalized) return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [timeLimitSeconds, finalized])

  const timeRemaining: number | null =
    timeLimitSeconds && startedAt
      ? Math.max(0, timeLimitSeconds - Math.floor((now - startedAt) / 1000))
      : null

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
      if (data?.error) return { matched: false, error: data.error as string, time_expired: data.time_expired }
      if (data?.matched && data.state) {
        setState(data.state as ChallengeProgressState)
      }
      return data as OpenDoorAttemptResult
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
      if (data?.error) return { matched: false, error: data.error as string, time_expired: data.time_expired, attempts_exhausted: data.attempts_exhausted }
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
      if (data?.error) return { matched: false, error: data.error as string, time_expired: data.time_expired }
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
    startedAt,
    finalized,
    loading,
    error,
    timeRemaining, // null if no time limit set
    attemptOpenDoor,
    attemptPuzzle,
    attemptGallery,
    finalize,
  }
}
