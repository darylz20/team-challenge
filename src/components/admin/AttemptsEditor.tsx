import { Toggle } from '../ui/Toggle'
import { Input } from '../ui/Input'

export interface AttemptsConfig {
  unlimited: boolean
  max: number
}

interface AttemptsEditorProps {
  attempts: AttemptsConfig
  onChange: (attempts: AttemptsConfig) => void
}

export function AttemptsEditor({ attempts, onChange }: AttemptsEditorProps) {
  return (
    <div className="space-y-3">
      <Toggle
        label="Onbeperkte pogingen"
        description="Spelers mogen zo vaak proberen als ze willen"
        checked={attempts.unlimited}
        onChange={(checked) => onChange({ ...attempts, unlimited: checked })}
      />
      {!attempts.unlimited && (
        <Input
          id="max-attempts"
          label="Maximaal aantal pogingen"
          type="number"
          min={1}
          value={attempts.max.toString()}
          onChange={(e) => onChange({ ...attempts, max: Math.max(1, parseInt(e.target.value) || 1) })}
          placeholder="1"
        />
      )}
    </div>
  )
}
