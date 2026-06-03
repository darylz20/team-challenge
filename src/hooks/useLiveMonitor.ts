import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Challenge, Team } from '../types'

export interface ActiveProgress {
  challenge_id: string
  challenge_title: string
  challenge_type: string
  time_limit: number | null
  started_at: string // ISO
  state: Record<string, unknown>
  finalized: boolean
}

export interface CompletedChallenge {
  challenge_id: string
  challenge_title: string
  points: number
  submitted_at: string
}

export interface TeamLiveState {
  team: Team
  rank: number // 1-based
  total_points: number
  challenges_solved: number
  active: ActiveProgress | null // currently in-flight challenge (non-finalized progress)
  completed: CompletedChallenge[]
}

/**
 * Composite hook for the admin Live monitor.
 * Pulls teams + non-finalized challenge_progress + all submissions, joins
 * them client-side per team, subscribes to realtime on all three so the
 * dashboard updates without a refresh.
 */
export function useLiveMonitor(gameId: string | undefined) {
  const [states, setStates] = useState<TeamLiveState[]>([])
  const [allChallenges, setAllChallenges] = useState<Challenge[]>([])
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  const fetch = useCallback(async () => {
    if (!gameId) return

    const [teamsRes, progressRes, submissionsRes, challengesRes] = await Promise.all([
      supabase
        .from('teams')
        .select('*')
        .eq('game_id', gameId)
        .order('created_at'),
      supabase
        .from('challenge_progress')
        .select('*, challenges(title, type)')
        .eq('game_id', gameId)
        .eq('finalized', false),
      supabase
        .from('submissions')
        .select('team_id, challenge_id, points_awarded, is_correct, submitted_at, challenges(title)')
        .eq('game_id', gameId),
      supabase
        .from('challenges')
        .select('*')
        .eq('game_id', gameId)
        .order('sort_order'),
    ])

    const teams = (teamsRes.data ?? []) as Team[]
    const progress = (progressRes.data ?? []) as Array<{
      team_id: string
      challenge_id: string
      state: Record<string, unknown>
      started_at: string
      finalized: boolean
      challenges: { title: string; type: string } | { title: string; type: string }[] | null
    }>
    const subs = (submissionsRes.data ?? []) as Array<{
      team_id: string
      challenge_id: string | null
      points_awarded: number | null
      is_correct: boolean | null
      submitted_at: string
      challenges: { title: string } | { title: string }[] | null
    }>
    const challenges = (challengesRes.data ?? []) as Challenge[]

    // Build per-team state
    const stateMap = new Map<string, TeamLiveState>()
    for (const t of teams) {
      stateMap.set(t.id, {
        team: t,
        rank: 0,
        total_points: 0,
        challenges_solved: 0,
        active: null,
        completed: [],
      })
    }

    // Look up active progress challenge meta from joined data (with challenges list as fallback)
    const challengeById = new Map(challenges.map((c) => [c.id, c]))
    for (const p of progress) {
      const entry = stateMap.get(p.team_id)
      if (!entry) continue
      const meta = challengeById.get(p.challenge_id)
      const joined = Array.isArray(p.challenges) ? p.challenges[0] : p.challenges
      entry.active = {
        challenge_id: p.challenge_id,
        challenge_title: joined?.title ?? meta?.title ?? 'Unknown',
        challenge_type: joined?.type ?? meta?.type ?? 'unknown',
        time_limit: meta?.time_limit ?? null,
        started_at: p.started_at,
        state: p.state,
        finalized: p.finalized,
      }
    }

    // Aggregate submissions
    for (const s of subs) {
      if (!s.is_correct) continue
      const entry = stateMap.get(s.team_id)
      if (!entry) continue
      const pts = s.points_awarded ?? 0
      entry.total_points += pts
      // Skip admin adjustments (challenge_id is NULL) for the completed list
      if (!s.challenge_id) continue
      const joined = Array.isArray(s.challenges) ? s.challenges[0] : s.challenges
      const title = joined?.title ?? challengeById.get(s.challenge_id)?.title ?? 'Unknown'
      entry.challenges_solved += 1
      entry.completed.push({
        challenge_id: s.challenge_id,
        challenge_title: title,
        points: pts,
        submitted_at: s.submitted_at,
      })
    }

    // Rank: descending on total_points
    const sorted = [...stateMap.values()].sort((a, b) => {
      if (b.total_points !== a.total_points) return b.total_points - a.total_points
      return a.team.name.localeCompare(b.team.name)
    })
    sorted.forEach((s, i) => { s.rank = i + 1 })

    setStates(sorted)
    setAllChallenges(challenges)
    setLoading(false)
    setLastUpdate(new Date())
  }, [gameId])

  useEffect(() => {
    fetch()
  }, [fetch])

  // Realtime: any change to submissions, challenge_progress, or teams → refetch
  useEffect(() => {
    if (!gameId) return

    const channel = supabase
      .channel(`live-monitor:${gameId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'submissions', filter: `game_id=eq.${gameId}` },
        () => fetch(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'challenge_progress', filter: `game_id=eq.${gameId}` },
        () => fetch(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'teams', filter: `game_id=eq.${gameId}` },
        () => fetch(),
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [gameId, fetch])

  return { states, allChallenges, loading, lastUpdate, refetch: fetch }
}
