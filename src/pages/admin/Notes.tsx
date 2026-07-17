import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2, StickyNote, Loader2, Check } from 'lucide-react'
import { PageHeader } from '../../components/layout/PageHeader'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { useAdminNotes } from '../../hooks/useAdminNotes'
import type { AdminNote } from '../../types'
import { cn } from '../../lib/utils'

export function Notes() {
  const { notes, loading, createNote, updateNote, deleteNote } = useAdminNotes()
  const [creating, setCreating] = useState(false)

  async function handleNew() {
    setCreating(true)
    await createNote()
    setCreating(false)
  }

  return (
    <div className="animate-fade-in">
      <PageHeader title="Notities" subtitle="Ideeën, schetsen, kladblok" />

      <div className="flex justify-end mb-4">
        <Button className="gap-2" onClick={handleNew} disabled={creating}>
          {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          New note
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="text-neon animate-spin" />
        </div>
      ) : notes.length === 0 ? (
        <Card className="text-center py-10">
          <StickyNote size={32} className="text-text-faint mx-auto mb-3" />
          <p className="text-text-muted font-medium">No notes yet</p>
          <p className="text-xs text-text-faint mt-1">Click "New note" to jot down your first challenge idea.</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {notes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              onUpdate={(patch) => updateNote(note.id, patch)}
              onDelete={() => deleteNote(note.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Individual note card with debounced auto-save ──

interface NoteCardProps {
  note: AdminNote
  onUpdate: (patch: Partial<Pick<AdminNote, 'title' | 'body'>>) => Promise<void>
  onDelete: () => Promise<void>
}

function NoteCard({ note, onUpdate, onDelete }: NoteCardProps) {
  const [title, setTitle] = useState(note.title)
  const [body, setBody] = useState(note.body)
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Track latest props in refs so debounce doesn't capture stale values
  const initialTitleRef = useRef(note.title)
  const initialBodyRef = useRef(note.body)
  useEffect(() => {
    // If the server-side note updated (e.g. refetch), sync local state only when
    // it differs from what we last typed.
    if (note.title !== title && note.title !== initialTitleRef.current) {
      setTitle(note.title)
    }
    if (note.body !== body && note.body !== initialBodyRef.current) {
      setBody(note.body)
    }
    initialTitleRef.current = note.title
    initialBodyRef.current = note.body
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.title, note.body])

  // Debounced save: trigger 800ms after the last keystroke on either field
  useEffect(() => {
    const trimmedTitle = title
    const trimmedBody = body
    if (trimmedTitle === initialTitleRef.current && trimmedBody === initialBodyRef.current) return

    const t = setTimeout(async () => {
      setSaving(true)
      await onUpdate({ title: trimmedTitle, body: trimmedBody })
      initialTitleRef.current = trimmedTitle
      initialBodyRef.current = trimmedBody
      setSaving(false)
      setJustSaved(true)
      setTimeout(() => setJustSaved(false), 1500)
    }, 800)

    return () => clearTimeout(t)
  }, [title, body, onUpdate])

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true)
      setTimeout(() => setConfirmDelete(false), 3000)
      return
    }
    await onDelete()
  }

  return (
    <Card className="space-y-2">
      <div className="flex items-start gap-2">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Titel (optioneel)"
          className="flex-1 bg-transparent text-base font-semibold text-text placeholder:text-text-faint outline-none"
        />
        <div className="flex items-center gap-2 shrink-0 pt-0.5">
          {saving ? (
            <Loader2 size={12} className="text-text-faint animate-spin" />
          ) : justSaved ? (
            <Check size={12} className="text-lime" />
          ) : null}
          <button
            type="button"
            onClick={handleDelete}
            className={cn(
              'p-1.5 rounded transition-colors',
              confirmDelete
                ? 'text-magenta bg-magenta/10'
                : 'text-text-faint hover:text-magenta',
            )}
            title={confirmDelete ? 'Klik nogmaals om te bevestigen' : 'Notitie verwijderen'}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Schrijf je idee op..."
        rows={Math.max(3, body.split('\n').length)}
        className="w-full bg-transparent text-sm text-text-muted placeholder:text-text-faint outline-none resize-none leading-relaxed"
      />
      <p className="text-[10px] text-text-faint pt-1 border-t border-surface-overlay/50">
        Updated {new Date(note.updated_at).toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' })}
      </p>
    </Card>
  )
}
