import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export interface LeaderboardEntry {
  team_id: string
  team_name: string
  team_color: string
  total_points: number
  challenges_solved: number
  last_submission_at: string | null
}

export function useLeaderboard(gameId: string | undefined) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!gameId) return
    setLoading(true)

    // Aggregate submissions per team, join with teams table
    const { data: submissions } = await supabase
      .from('submissions')
      .select('team_id, points_awarded, is_correct, submitted_at, teams(name, color)')
      .eq('game_id', gameId)

    if (!submissions) {
      setLoading(false)
      return
    }

    // Also fetch all teams in the game so teams with 0 points still appear
    const { data: teams } = await supabase
      .from('teams')
      .select('id, name, color')
      .eq('game_id', gameId)

    if (!teams) {
      setLoading(false)
      return
    }

    // Build map: team_id → aggregated stats
    const statsMap = new Map<string, LeaderboardEntry>()

    // Seed with all teams at 0
    for (const team of teams) {
      statsMap.set(team.id, {
        team_id: team.id,
        team_name: team.name,
        team_color: team.color,
        total_points: 0,
        challenges_solved: 0,
        last_submission_at: null,
      })
    }

    // Aggregate correct submissions
    for (const sub of submissions) {
      if (!sub.is_correct) continue
      const entry = statsMap.get(sub.team_id)
      if (!entry) continue
      entry.total_points += sub.points_awarded ?? 0
      entry.challenges_solved += 1
      if (!entry.last_submission_at || sub.submitted_at > entry.last_submission_at) {
        entry.last_submission_at = sub.submitted_at
      }
    }

    // Sort: highest points first, then fewest seconds elapsed as tiebreaker
    const sorted = [...statsMap.values()].sort((a, b) => {
      if (b.total_points !== a.total_points) return b.total_points - a.total_points
      // Tiebreaker: earlier last submission wins
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

  // Realtime: re-fetch whenever a submission is inserted/updated for this game
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
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [gameId, fetch])

  return { entries, loading, refetch: fetch }
}
