import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Submission } from '../types'

export interface ChallengeSolver {
  team_id: string
  team_name: string
  team_color: string
  submitted_at: string
}

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

/**
 * Teams that have correctly solved each challenge in a game, keyed by
 * challenge_id and ordered by solve time (earliest first). Readable for every
 * team while the game is active, so it powers both the placement "points left"
 * preview and the "already solved by" nudge on the challenge page. Subscribes
 * to realtime so it updates as rival teams solve.
 */
export function useChallengeSolvers(gameId: string | undefined) {
  const [solversByChallenge, setSolversByChallenge] = useState<Map<string, ChallengeSolver[]>>(new Map())
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!gameId) return
    const [{ data: subs }, { data: teams }] = await Promise.all([
      supabase
        .from('submissions')
        .select('team_id, challenge_id, submitted_at')
        .eq('game_id', gameId)
        .eq('is_correct', true),
      supabase.from('teams').select('id, name, color').eq('game_id', gameId),
    ])

    const teamMap = new Map((teams ?? []).map((t) => [t.id, t]))
    const map = new Map<string, ChallengeSolver[]>()
    for (const s of subs ?? []) {
      if (!s.challenge_id) continue // admin adjustments have no challenge
      const team = teamMap.get(s.team_id)
      if (!team) continue
      const list = map.get(s.challenge_id) ?? []
      list.push({ team_id: team.id, team_name: team.name, team_color: team.color, submitted_at: s.submitted_at })
      map.set(s.challenge_id, list)
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.submitted_at.localeCompare(b.submitted_at))
    }
    setSolversByChallenge(map)
    setLoading(false)
  }, [gameId])

  useEffect(() => { fetch() }, [fetch])

  useEffect(() => {
    if (!gameId) return
    const channel = supabase
      .channel(`challenge-solvers:${gameId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'submissions', filter: `game_id=eq.${gameId}` },
        () => { fetch() },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [gameId, fetch])

  return { solversByChallenge, loading, refetch: fetch }
}

export interface PhotoReview {
  submission_id: string
  team_id: string
  team_name: string
  team_color: string
  challenge_id: string
  challenge_title: string
  challenge_points: number // configured max — prefills the award field
  photo_url: string
  submitted_at: string
  reviewed: boolean
  points_awarded: number
  review_note: string | null
}

/**
 * Every photo_upload submission in a game, newest first, joined with its team
 * and challenge. Pending ones (not yet reviewed) come first so the admin can
 * work through a queue. Subscribes to realtime so photos appear as teams send
 * them and disappear from the queue as they're awarded.
 */
export function usePhotoReviews(gameId: string | undefined) {
  const [reviews, setReviews] = useState<PhotoReview[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!gameId) return

    const [{ data: subs }, { data: teams }, { data: challenges }] = await Promise.all([
      supabase
        .from('submissions')
        .select('id, team_id, challenge_id, answer, points_awarded, is_correct, submitted_at')
        .eq('game_id', gameId)
        .order('submitted_at', { ascending: false }),
      supabase.from('teams').select('id, name, color').eq('game_id', gameId),
      supabase.from('challenges').select('id, title, points, type').eq('game_id', gameId),
    ])

    const teamMap = new Map((teams ?? []).map((t) => [t.id, t]))
    const photoChallenges = new Map(
      (challenges ?? []).filter((c) => c.type === 'photo_upload').map((c) => [c.id, c]),
    )

    const rows: PhotoReview[] = []
    for (const s of subs ?? []) {
      if (!s.challenge_id) continue
      const challenge = photoChallenges.get(s.challenge_id)
      if (!challenge) continue
      const team = teamMap.get(s.team_id)
      if (!team) continue

      const answer = (s.answer ?? {}) as { photo_url?: string; reviewed?: boolean; review_note?: string | null }
      if (!answer.photo_url) continue

      rows.push({
        submission_id: s.id,
        team_id: team.id,
        team_name: team.name,
        team_color: team.color,
        challenge_id: challenge.id,
        challenge_title: challenge.title,
        challenge_points: challenge.points,
        photo_url: answer.photo_url,
        submitted_at: s.submitted_at,
        reviewed: answer.reviewed === true,
        points_awarded: s.points_awarded ?? 0,
        review_note: answer.review_note ?? null,
      })
    }

    // Pending first, then most recently submitted.
    rows.sort((a, b) => {
      if (a.reviewed !== b.reviewed) return a.reviewed ? 1 : -1
      return b.submitted_at.localeCompare(a.submitted_at)
    })

    setReviews(rows)
    setLoading(false)
  }, [gameId])

  useEffect(() => { fetch() }, [fetch])

  useEffect(() => {
    if (!gameId) return
    const channel = supabase
      .channel(`photo-reviews:${gameId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'submissions', filter: `game_id=eq.${gameId}` },
        () => { fetch() },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [gameId, fetch])

  const pendingCount = reviews.filter((r) => !r.reviewed).length

  return { reviews, pendingCount, loading, refetch: fetch }
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
