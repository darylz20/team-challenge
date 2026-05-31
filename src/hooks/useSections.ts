import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Section } from '../types'

export function useSections(gameId: string | undefined) {
  const [sections, setSections] = useState<Section[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!gameId) return
    setLoading(true)
    const { data } = await supabase
      .from('sections')
      .select('*')
      .eq('game_id', gameId)
      .order('sort_order')
    setSections(data ?? [])
    setLoading(false)
  }, [gameId])

  useEffect(() => { fetch() }, [fetch])

  // Realtime: any change to sections in this game → refetch.
  // Mainly so players see is_open flips live.
  useEffect(() => {
    if (!gameId) return
    const channel = supabase
      .channel(`sections:${gameId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sections', filter: `game_id=eq.${gameId}` },
        () => { fetch() },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [gameId, fetch])

  async function createSection(title: string, description: string | null = null) {
    if (!gameId) return null
    const sortOrder = sections.length
    const { data, error } = await supabase
      .from('sections')
      .insert({ game_id: gameId, title, description, sort_order: sortOrder, is_open: false })
      .select()
      .single()
    if (error || !data) return null
    setSections((prev) => [...prev, data])
    return data
  }

  async function updateSection(id: string, patch: Partial<Pick<Section, 'title' | 'description' | 'is_open'>>) {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
    const { error } = await supabase.from('sections').update(patch).eq('id', id)
    if (error) fetch()
  }

  async function deleteSection(id: string) {
    // RESTRICT FK will prevent delete if challenges still reference this section;
    // caller should check first and tell the user.
    const { error } = await supabase.from('sections').delete().eq('id', id)
    if (error) return { error: error.message }
    setSections((prev) => prev.filter((s) => s.id !== id))
    return { error: null }
  }

  async function reorderSections(orderedIds: string[]) {
    setSections((prev) => {
      const map = new Map(prev.map((s) => [s.id, s]))
      return orderedIds.map((id, i) => ({ ...map.get(id)!, sort_order: i }))
    })
    // Persist in parallel
    await Promise.all(
      orderedIds.map((id, i) =>
        supabase.from('sections').update({ sort_order: i }).eq('id', id),
      ),
    )
  }

  return {
    sections,
    loading,
    createSection,
    updateSection,
    deleteSection,
    reorderSections,
    refetch: fetch,
  }
}
