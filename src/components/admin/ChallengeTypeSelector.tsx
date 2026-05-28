import { ListChecks, Type, DoorOpen, Grid3x3, Images, Brain } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { ChallengeType } from '../../types'

const types: { value: ChallengeType; label: string; icon: typeof ListChecks; description: string }[] = [
  { value: 'multiple_choice', label: 'Multiple Choice', icon: ListChecks, description: 'Pick from options' },
  { value: 'free_text', label: 'Free Text', icon: Type, description: 'Type an answer' },
  { value: 'open_door', label: 'Open Deur', icon: DoorOpen, description: '4 antwoorden, tegen de klok' },
  { value: 'puzzle', label: 'Puzzel', icon: Grid3x3, description: '12 termen, 3 thema\'s raden' },
  { value: 'gallery', label: 'Galerij', icon: Images, description: 'Antwoord per foto onder thema' },
  { value: 'collective_memory', label: 'Collectief Geheugen', icon: Brain, description: 'Beeldfragment + 5 trefwoorden' },
]

interface ChallengeTypeSelectorProps {
  value: ChallengeType
  onChange: (type: ChallengeType) => void
}

export function ChallengeTypeSelector({ value, onChange }: ChallengeTypeSelectorProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {types.map(({ value: type, label, icon: Icon, description }) => (
        <button
          key={type}
          type="button"
          onClick={() => onChange(type)}
          className={cn(
            'flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all text-center',
            value === type
              ? 'border-neon bg-neon/5 shadow-glow-neon'
              : 'border-surface-overlay hover:border-text-faint',
          )}
        >
          <Icon size={24} className={value === type ? 'text-neon' : 'text-text-muted'} />
          <div>
            <p className={cn('text-sm font-medium', value === type ? 'text-neon' : 'text-text')}>{label}</p>
            <p className="text-xs text-text-muted">{description}</p>
          </div>
        </button>
      ))}
    </div>
  )
}
