import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { supabase } from '../lib/supabase'

interface SubmissionPayload {
  id: string
  team_id: string
  challenge_id: string
  game_id: string
  is_correct: boolean
  points_awarded: number | null
}

/**
 * Subscribes to realtime submission inserts for this game.
 * When ANOTHER team submits a correct answer, shows a clickable toast
 * that navigates to the leaderboard.
 */
export function useSubmissionNotifications(
  gameId: string | undefined,
  currentTeamId: string | undefined,
) {
  const navigate = useNavigate()

  useEffect(() => {
    if (!gameId || !currentTeamId) return

    const channel = supabase
      .channel(`submission-notifications:${gameId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'submissions',
          filter: `game_id=eq.${gameId}`,
        },
        async (payload) => {
          const sub = payload.new as SubmissionPayload
          // Only care about OTHER teams' correct submissions
          if (!sub.is_correct) return
          if (sub.team_id === currentTeamId) return
          // Admin point adjustments have no challenge_id — not a real solve
          if (!sub.challenge_id) return

          // Fetch team & challenge names to enrich the toast
          const [{ data: team }, { data: challenge }] = await Promise.all([
            supabase.from('teams').select('name, color').eq('id', sub.team_id).single(),
            supabase.from('challenges').select('title').eq('id', sub.challenge_id).single(),
          ])

          const teamName = team?.name ?? 'Een ander team'
          const challengeTitle = challenge?.title ?? 'een challenge'
          const points = sub.points_awarded ?? 0

          toast(`${teamName} loste "${challengeTitle}" op`, {
            description: `+${points} ptn · Tik om het leaderboard te zien`,
            action: {
              label: 'Bekijk',
              onClick: () => navigate('/leaderboard'),
            },
            onDismiss: () => {},
            duration: 6000,
          })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [gameId, currentTeamId, navigate])
}
