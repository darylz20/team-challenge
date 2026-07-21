import { Plus, Trash2 } from 'lucide-react'
import { Input } from '../ui/Input'
import { Textarea } from '../ui/Textarea'
import { Button } from '../ui/Button'
import type { HintsConfig } from '../../types'

interface HintsEditorProps {
  hints: HintsConfig
  onChange: (hints: HintsConfig) => void
}

export function HintsEditor({ hints, onChange }: HintsEditorProps) {
  function updateHintText(index: number, text: string) {
    const items = [...hints.items]
    items[index] = { ...items[index], text }
    onChange({ ...hints, items })
  }

  function updateHintDeduction(index: number, deduction: number) {
    const items = [...hints.items]
    items[index] = { ...items[index], deduction }
    onChange({ ...hints, items })
  }

  function addHint() {
    onChange({ ...hints, items: [...hints.items, { text: '', deduction: 2 }] })
  }

  function removeHint(index: number) {
    onChange({ ...hints, items: hints.items.filter((_, i) => i !== index) })
  }

  return (
    <div className="space-y-3">
      {hints.items.length === 0 ? (
        <p className="text-sm text-text-faint">
          Geen hints ingesteld. Spelers kunnen dan geen hulp opvragen.
        </p>
      ) : (
        hints.items.map((item, i) => (
          <div key={i} className="space-y-2 p-3 rounded-lg bg-surface-overlay/30">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-text-muted">Hint {i + 1}</span>
              <button
                type="button"
                onClick={() => removeHint(i)}
                className="p-1.5 text-text-faint hover:text-magenta-ink transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
            <Textarea
              value={item.text}
              onChange={(e) => updateHintText(i, e.target.value)}
              placeholder="Een aanwijzing om spelers te helpen..."
              rows={2}
            />
            <Input
              label="Puntenaftrek"
              type="number"
              value={item.deduction}
              onChange={(e) => updateHintDeduction(i, parseInt(e.target.value) || 0)}
              placeholder="0"
            />
          </div>
        ))
      )}
      <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={addHint}>
        <Plus size={14} /> Hint toevoegen
      </Button>
    </div>
  )
}
