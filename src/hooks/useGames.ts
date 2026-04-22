import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Game } from '../types'

export function useGames() {
  const [games, setGames] = useState<Game[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('games')
      .select('*')
      .order('created_at', { ascending: false })
    setGames(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])

  async function createGame(title: string, description: string) {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase()
    const { data, error } = await supabase
      .from('games')
      .insert({ title, description, code })
      .select()
      .single()
    if (data) setGames((prev) => [data, ...prev])
    return { data, error }
  }

  async function deleteGame(id: string) {
    await supabase.from('games').delete().eq('id', id)
    setGames((prev) => prev.filter((g) => g.id !== id))
  }

  return { games, loading, createGame, deleteGame, refetch: fetch }
}

export function useGame(id: string | undefined) {
  const [game, setGame] = useState<Game | null>(null)
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!id) return
    setLoading(true)
    const { data } = await supabase.from('games').select('*').eq('id', id).single()
    setGame(data)
    setLoading(false)
  }, [id])

  useEffect(() => { fetch() }, [fetch])

  async function updateGame(updates: Partial<Game>) {
    if (!id) return
    const { data } = await supabase
      .from('games')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (data) setGame(data)
    return data
  }

  async function publishGame() {
    return updateGame({ status: 'published', published_at: new Date().toISOString() } as Partial<Game>)
  }

  async function unpublishGame() {
    return updateGame({ status: 'draft', published_at: null } as Partial<Game>)
  }

  return { game, loading, updateGame, publishGame, unpublishGame, refetch: fetch }
}
