import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { livePointsFromState } from '../lib/utils'

export interface SolvedChallenge {
  challenge_id: string
  title: string
  points: number
  submitted_at: string
  sort_order: number
}

export interface BonusAdjustment {
  reason: string | null
  points: number
}

export interface LeaderboardEntry {
  team_id: string
  team_name: string
  team_color: string
  team_members: string[]
  total_points: number
  challenges_solved: number
  solved_challenges: SolvedChallenge[]
  bonuses: BonusAdjustment[]
  last_submission_at: string | null
}

interface SubmissionRow {
  team_id: string
  challenge_id: string | null // null = admin point adjustment
  points_awarded: number | null
  is_correct: boolean | null
  submitted_at: string
  answer: { reason?: string } | null
  challenges: { title: string; sort_order: number } | { title: string; sort_order: number }[] | null
}

export function useLeaderboard(gameId: string | undefined) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!gameId) return
    setLoading(true)

    // Submissions with embedded challenge title + sort_order
    const { data: submissions } = await supabase
      .from('submissions')
      .select('team_id, challenge_id, points_awarded, is_correct, submitted_at, answer, challenges(title, sort_order)')
      .eq('game_id', gameId)

    if (!submissions) {
      setLoading(false)
      return
    }

    // All teams (so 0-point teams still appear)
    const { data: teams } = await supabase
      .from('teams')
      .select('id, name, color, member_names')
      .eq('game_id', gameId)

    if (!teams) {
      setLoading(false)
      return
    }

    const statsMap = new Map<string, LeaderboardEntry>()
    for (const team of teams) {
      statsMap.set(team.id, {
        team_id: team.id,
        team_name: team.name,
        team_color: team.color,
        team_members: team.member_names ?? [],
        total_points: 0,
        challenges_solved: 0,
        solved_challenges: [],
        bonuses: [],
        last_submission_at: null,
      })
    }

    for (const sub of submissions as SubmissionRow[]) {
      if (!sub.is_correct) continue
      const entry = statsMap.get(sub.team_id)
      if (!entry) continue

      // Supabase returns nested relations as object (single fk) — handle both shapes defensively
      const ch = Array.isArray(sub.challenges) ? sub.challenges[0] : sub.challenges
      const pts = sub.points_awarded ?? 0
      // Admin point adjustments have NULL challenge_id — they count toward
      // total points but not toward challenges_solved or the solved list.
      const isAdminAdjustment = !sub.challenge_id

      entry.total_points += pts
      if (isAdminAdjustment) {
        entry.bonuses.push({ reason: sub.answer?.reason ?? null, points: pts })
      } else if (sub.challenge_id) {
        entry.challenges_solved += 1
        entry.solved_challenges.push({
          challenge_id: sub.challenge_id,
          title: ch?.title ?? 'Onbekend',
          points: pts,
          submitted_at: sub.submitted_at,
          sort_order: ch?.sort_order ?? 0,
        })
      }

      if (!entry.last_submission_at || sub.submitted_at > entry.last_submission_at) {
        entry.last_submission_at = sub.submitted_at
      }
    }

    // Live points: add collected-but-not-yet-finalized points from in-progress
    // challenges. Finalized rows already have a submission counted above, so
    // we skip them to avoid double-counting.
    const { data: progressRows } = await supabase
      .from('challenge_progress')
      .select('team_id, state, finalized')
      .eq('game_id', gameId)

    for (const p of progressRows ?? []) {
      if (p.finalized) continue
      const entry = statsMap.get(p.team_id)
      if (!entry) continue
      entry.total_points += livePointsFromState(p.state)
    }

    // Per team: sort solved challenges by sort_order (challenge order in the game)
    for (const entry of statsMap.values()) {
      entry.solved_challenges.sort((a, b) => a.sort_order - b.sort_order)
    }

    // Standings: highest points first; tie-break = earliest last submission
    const sorted = [...statsMap.values()].sort((a, b) => {
      if (b.total_points !== a.total_points) return b.total_points - a.total_points
      if (a.last_submission_at && b.last_submission_at) {
        return a.last_submission_at.localeCompare(b.last_submission_at)
      }
      return 0
    })

    setEntries(sorted)
    setLoading(false)
  }, [gameId])

  useEffect(() => {
    fetch()
  }, [fetch])

  // Realtime: re-fetch on any submission change for this game
  useEffect(() => {
    if (!gameId) return

    const channel = supabase
      .channel(`leaderboard:${gameId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'submissions',
          filter: `game_id=eq.${gameId}`,
        },
        () => {
          fetch()
        },
      )
      // Also refresh as teams collect live points mid-challenge
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'challenge_progress',
          filter: `game_id=eq.${gameId}`,
        },
        () => {
          fetch()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [gameId, fetch])

  return { entries, loading, refetch: fetch }
}
