import { Plus, X } from 'lucide-react'
import type { AnswerAlternatives } from '../../types'

interface AlternativesEditorProps {
  value: AnswerAlternatives | undefined
  onChange: (next: AnswerAlternatives) => void
  /** Shown when there are none yet. Keeps the row compact until used. */
  addLabel?: string
}

/**
 * Extra accepted spellings for one answer. Used by every type where the
 * player types a free answer (open_door, free_text, gallery,
 * collective_memory) so they all behave the same.
 *
 * Empty strings are kept while editing (so a fresh row doesn't vanish under
 * the cursor) and dropped on save by stripAlternatives.
 */
export function AlternativesEditor({ value, onChange, addLabel = 'Ook goed rekenen' }: AlternativesEditorProps) {
  const items = value ?? []

  function update(i: number, text: string) {
    const next = [...items]
    next[i] = text
    onChange(next)
  }

  function add() {
    onChange([...items, ''])
  }

  function remove(i: number) {
    onChange(items.filter((_, idx) => idx !== i))
  }

  return (
    <div className="space-y-1.5">
      {items.map((alt, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span className="text-text-faint text-xs shrink-0">of</span>
          <input
            type="text"
            value={alt}
            onChange={(e) => update(i, e.target.value)}
            placeholder="Andere schrijfwijze"
            className="flex-1 min-w-0 bg-surface border border-surface-overlay rounded px-2 py-1 text-sm text-text placeholder:text-text-faint outline-none focus:border-neon"
          />
          <button
            type="button"
            onClick={() => remove(i)}
            className="p-1 text-text-faint hover:text-magenta transition-colors shrink-0"
          >
            <X size={12} />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="flex items-center gap-1 text-xs text-text-faint hover:text-neon transition-colors"
      >
        <Plus size={12} /> {addLabel}
      </button>
    </div>
  )
}
