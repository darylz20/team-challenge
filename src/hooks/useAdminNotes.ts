import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../providers/AuthProvider'
import type { AdminNote } from '../types'

export function useAdminNotes() {
  const { user } = useAuth()
  const [notes, setNotes] = useState<AdminNote[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data } = await supabase
      .from('admin_notes')
      .select('*')
      .order('updated_at', { ascending: false })
    setNotes(data ?? [])
    setLoading(false)
  }, [user])

  useEffect(() => { fetch() }, [fetch])

  async function createNote(): Promise<AdminNote | null> {
    if (!user) return null
    const { data, error } = await supabase
      .from('admin_notes')
      .insert({ admin_id: user.id, title: '', body: '' })
      .select()
      .single()
    if (error || !data) return null
    setNotes((prev) => [data, ...prev])
    return data
  }

  async function updateNote(id: string, patch: Partial<Pick<AdminNote, 'title' | 'body'>>) {
    const now = new Date().toISOString()
    // Optimistic update
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch, updated_at: now } : n)))
    const { error } = await supabase
      .from('admin_notes')
      .update({ ...patch, updated_at: now })
      .eq('id', id)
    if (error) {
      // Refetch on error to sync
      fetch()
    }
  }

  async function deleteNote(id: string) {
    setNotes((prev) => prev.filter((n) => n.id !== id))
    await supabase.from('admin_notes').delete().eq('id', id)
  }

  return { notes, loading, createNote, updateNote, deleteNote, refetch: fetch }
}
