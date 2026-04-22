import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Challenge, ChallengeFormData } from '../types'

export function useChallenges(gameId: string | undefined) {
  const [challenges, setChallenges] = useState<Challenge[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!gameId) return
    setLoading(true)
    const { data } = await supabase
      .from('challenges')
      .select('*')
      .eq('game_id', gameId)
      .order('sort_order')
    setChallenges(data ?? [])
    setLoading(false)
  }, [gameId])

  useEffect(() => { fetch() }, [fetch])

  async function createChallenge(form: ChallengeFormData) {
    const sortOrder = challenges.length
    const { data, error } = await supabase
      .from('challenges')
      .insert({ ...form, game_id: gameId, sort_order: sortOrder })
      .select()
      .single()
    if (data) setChallenges((prev) => [...prev, data])
    return { data, error }
  }

  async function updateChallenge(id: string, updates: Partial<ChallengeFormData>) {
    const { data, error } = await supabase
      .from('challenges')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (data) setChallenges((prev) => prev.map((c) => (c.id === id ? data : c)))
    return { data, error }
  }

  async function deleteChallenge(id: string) {
    await supabase.from('challenges').delete().eq('id', id)
    setChallenges((prev) => prev.filter((c) => c.id !== id))
  }

  async function reorderChallenges(orderedIds: string[]) {
    const updates = orderedIds.map((id, i) => ({ id, sort_order: i }))
    for (const u of updates) {
      await supabase.from('challenges').update({ sort_order: u.sort_order }).eq('id', u.id)
    }
    setChallenges((prev) => {
      const map = new Map(prev.map((c) => [c.id, c]))
      return orderedIds.map((id, i) => ({ ...map.get(id)!, sort_order: i }))
    })
  }

  return { challenges, loading, createChallenge, updateChallenge, deleteChallenge, reorderChallenges, refetch: fetch }
}

export function useChallenge(id: string | undefined) {
  const [challenge, setChallenge] = useState<Challenge | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    supabase
      .from('challenges')
      .select('*')
      .eq('id', id)
      .single()
      .then(({ data }) => {
        setChallenge(data)
        setLoading(false)
      })
  }, [id])

  return { challenge, loading }
}
