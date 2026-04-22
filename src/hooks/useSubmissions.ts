import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Submission } from '../types'

export function useSubmission(teamId: string | undefined, challengeId: string | undefined) {
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const fetch = useCallback(async () => {
    if (!teamId || !challengeId) return
    setLoading(true)
    const { data } = await supabase
      .from('submissions')
      .select('*')
      .eq('team_id', teamId)
      .eq('challenge_id', challengeId)
      .order('submitted_at', { ascending: false })
    setSubmissions(data ?? [])
    setLoading(false)
  }, [teamId, challengeId])

  // Latest submission (most recent attempt)
  const submission = submissions.length > 0 ? submissions[0] : null
  // Best submission (highest points)
  const bestSubmission = submissions.reduce<Submission | null>(
    (best, s) => (!best || s.points_awarded > best.points_awarded ? s : best),
    null,
  )
  const attemptCount = submissions.length
  const hasCorrect = submissions.some((s) => s.is_correct === true)

  useEffect(() => { fetch() }, [fetch])

  async function submitAnswer(gameId: string, answer: Record<string, unknown>) {
    if (!teamId || !challengeId) return { error: 'Missing team or challenge' }
    setSubmitting(true)
    const { data, error } = await supabase.rpc('submit_answer', {
      p_team_id: teamId,
      p_challenge_id: challengeId,
      p_game_id: gameId,
      p_answer: answer,
    })
    setSubmitting(false)

    if (error) return { error: error.message }
    if (data?.error) return { error: data.error as string }

    // Refetch the submission to get the full row
    await fetch()
    return { error: null, result: data }
  }

  return { submission, bestSubmission, attemptCount, hasCorrect, loading, submitting, submitAnswer, refetch: fetch }
}

export function useTeamSubmissions(teamId: string | undefined, gameId: string | undefined) {
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!teamId || !gameId) return
    supabase
      .from('submissions')
      .select('*')
      .eq('team_id', teamId)
      .eq('game_id', gameId)
      .then(({ data }) => {
        setSubmissions(data ?? [])
        setLoading(false)
      })
  }, [teamId, gameId])

  return { submissions, loading }
}
