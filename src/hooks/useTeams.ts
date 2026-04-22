import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { Team } from '../types'

function generatePasscode(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(3)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}

export function useTeams(gameId: string | undefined) {
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!gameId) return
    setLoading(true)
    const { data } = await supabase
      .from('teams')
      .select('*')
      .eq('game_id', gameId)
      .order('created_at')
    setTeams(data ?? [])
    setLoading(false)
  }, [gameId])

  useEffect(() => { fetch() }, [fetch])

  async function createTeam(name: string, color: string) {
    const passcode = generatePasscode()
    const { data, error } = await supabase
      .from('teams')
      .insert({ name, color, passcode, game_id: gameId })
      .select()
      .single()
    if (data) setTeams((prev) => [...prev, data])
    return { data, error }
  }

  async function deleteTeam(id: string) {
    await supabase.from('teams').delete().eq('id', id)
    setTeams((prev) => prev.filter((t) => t.id !== id))
  }

  async function regeneratePasscode(id: string) {
    const passcode = generatePasscode()
    const { data } = await supabase
      .from('teams')
      .update({ passcode })
      .eq('id', id)
      .select()
      .single()
    if (data) setTeams((prev) => prev.map((t) => (t.id === id ? data : t)))
  }

  return { teams, loading, createTeam, deleteTeam, regeneratePasscode, refetch: fetch }
}
