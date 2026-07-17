import { Plus, Trash2, Trophy, Hash } from 'lucide-react'
import { Input } from '../ui/Input'
import { Button } from '../ui/Button'
import type { ScoringConfig } from '../../types'

interface ScoringEditorProps {
  scoring: ScoringConfig
  onChange: (scoring: ScoringConfig) => void
}

function ordinal(n: number) {
  return `${n}e`
}

export function ScoringEditor({ scoring, onChange }: ScoringEditorProps) {
  function setMode(mode: 'fixed' | 'placement') {
    onChange({ ...scoring, mode })
  }

  function setFixedPoints(points: number) {
    onChange({ ...scoring, fixed_points: points })
  }

  function updatePlacement(index: number, points: number) {
    const placements = [...scoring.placements]
    placements[index] = { ...placements[index], points }
    onChange({ ...scoring, placements })
  }

  function addPlacement() {
    const nextPlace = scoring.placements.length + 1
    const lastPoints = scoring.placements[scoring.placements.length - 1]?.points ?? 5
    onChange({
      ...scoring,
      placements: [...scoring.placements, { place: nextPlace, points: Math.max(1, lastPoints - 2) }],
    })
  }

  function removePlacement(index: number) {
    if (scoring.placements.length <= 1) return
    const placements = scoring.placements
      .filter((_, i) => i !== index)
      .map((p, i) => ({ ...p, place: i + 1 }))
    onChange({ ...scoring, placements })
  }

  return (
    <div className="space-y-4">
      {/* Mode selector */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode('fixed')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            scoring.mode === 'fixed'
              ? 'bg-neon/15 text-neon border border-neon/40'
              : 'bg-surface-overlay/50 text-text-muted border border-surface-overlay hover:border-text-faint'
          }`}
        >
          <Hash size={14} />
          Vaste punten
        </button>
        <button
          type="button"
          onClick={() => setMode('placement')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            scoring.mode === 'placement'
              ? 'bg-neon/15 text-neon border border-neon/40'
              : 'bg-surface-overlay/50 text-text-muted border border-surface-overlay hover:border-text-faint'
          }`}
        >
          <Trophy size={14} />
          Placement
        </button>
      </div>

      {/* Fixed mode */}
      {scoring.mode === 'fixed' && (
        <Input
          id="fixed-points"
          label="Punten"
          type="number"
          value={scoring.fixed_points}
          onChange={(e) => setFixedPoints(parseInt(e.target.value) || 0)}
        />
      )}

      {/* Placement mode */}
      {scoring.mode === 'placement' && (
        <div className="space-y-2">
          <p className="text-sm text-text-muted">Punten toegekend op volgorde van binnenkomst</p>
          {scoring.placements.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-10 text-sm font-mono text-text-faint text-right shrink-0">
                {ordinal(p.place)}
              </span>
              <Input
                type="number"
                value={p.points}
                onChange={(e) => updatePlacement(i, parseInt(e.target.value) || 0)}
                className="flex-1"
              />
              <span className="text-xs text-text-faint shrink-0">ptn</span>
              <button
                type="button"
                onClick={() => removePlacement(i)}
                className="p-1.5 text-text-faint hover:text-magenta transition-colors"
                disabled={scoring.placements.length <= 1}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={addPlacement}>
            <Plus size={14} /> Plaats toevoegen
          </Button>
        </div>
      )}
    </div>
  )
}
