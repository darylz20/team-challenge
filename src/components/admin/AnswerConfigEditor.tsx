import { Plus, Trash2, ImagePlus, X } from 'lucide-react'
import { Input } from '../ui/Input'
import { Toggle } from '../ui/Toggle'
import { Button } from '../ui/Button'
import { uploadChallengeMedia, deleteChallengeMedia } from '../../lib/storage'
import type {
  ChallengeType,
  ChallengeConfig,
  MultipleChoiceConfig,
  FreeTextConfig,
  PhotoUploadConfig,
  GpsCheckConfig,
} from '../../types'

interface AnswerConfigEditorProps {
  type: ChallengeType
  config: ChallengeConfig
  onChange: (config: ChallengeConfig) => void
  gameId?: string
}

export function AnswerConfigEditor({ type, config, onChange, gameId }: AnswerConfigEditorProps) {
  switch (type) {
    case 'multiple_choice':
      return <MultipleChoiceEditor config={config as MultipleChoiceConfig} onChange={onChange} gameId={gameId} />
    case 'free_text':
      return <FreeTextEditor config={config as FreeTextConfig} onChange={onChange} />
    case 'photo_upload':
      return <PhotoUploadEditor config={config as PhotoUploadConfig} onChange={onChange} />
    case 'gps_check':
      return <GpsCheckEditor config={config as GpsCheckConfig} onChange={onChange} />
  }
}

function MultipleChoiceEditor({ config, onChange, gameId }: { config: MultipleChoiceConfig; onChange: (c: ChallengeConfig) => void; gameId?: string }) {
  function updateOption(index: number, text: string) {
    const options = [...config.options]
    options[index] = { ...options[index], text }
    onChange({ ...config, options })
  }

  function toggleCorrect(index: number) {
    const options = config.options.map((opt, i) => ({
      ...opt,
      is_correct: config.allow_multiple ? (i === index ? !opt.is_correct : opt.is_correct) : i === index,
    }))
    onChange({ ...config, options })
  }

  function addOption() {
    onChange({ ...config, options: [...config.options, { text: '', is_correct: false }] })
  }

  function removeOption(index: number) {
    if (config.options.length <= 2) return
    const option = config.options[index]
    if (option.image_url) deleteChallengeMedia(option.image_url)
    onChange({ ...config, options: config.options.filter((_, i) => i !== index) })
  }

  async function handleOptionImage(index: number, file: File) {
    if (!gameId) return
    const url = await uploadChallengeMedia(file, gameId)
    if (url) {
      const options = [...config.options]
      options[index] = { ...options[index], image_url: url }
      onChange({ ...config, options })
    }
  }

  async function clearOptionImage(index: number) {
    const option = config.options[index]
    if (option.image_url) {
      await deleteChallengeMedia(option.image_url)
    }
    const options = [...config.options]
    options[index] = { ...options[index], image_url: undefined }
    onChange({ ...config, options })
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-text-muted">Options</p>
      {config.options.map((option, i) => (
        <div key={i} className="space-y-2 p-3 rounded-lg bg-surface-overlay/30">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => toggleCorrect(i)}
              className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                option.is_correct ? 'border-lime bg-lime' : 'border-surface-overlay'
              }`}
            >
              {option.is_correct && <span className="w-2 h-2 rounded-full bg-void" />}
            </button>
            <Input
              value={option.text}
              onChange={(e) => updateOption(i, e.target.value)}
              placeholder={`Option ${i + 1}`}
              className="flex-1"
            />
            <button
              type="button"
              onClick={() => removeOption(i)}
              className="p-1.5 text-text-faint hover:text-magenta transition-colors"
              disabled={config.options.length <= 2}
            >
              <Trash2 size={14} />
            </button>
          </div>
          {/* Option image */}
          {option.image_url ? (
            <div className="relative ml-7 inline-block">
              <img src={option.image_url} alt="" className="h-20 rounded object-cover" />
              <button
                type="button"
                onClick={() => clearOptionImage(i)}
                className="absolute -top-1 -right-1 p-0.5 rounded-full bg-surface text-text-muted hover:text-magenta transition-colors"
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <label className="ml-7 flex items-center gap-1.5 text-xs text-text-faint hover:text-text-muted cursor-pointer transition-colors">
              <ImagePlus size={14} />
              <span>Add image</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleOptionImage(i, file)
                }}
              />
            </label>
          )}
        </div>
      ))}
      <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={addOption}>
        <Plus size={14} /> Add Option
      </Button>
      <Toggle
        label="Allow multiple correct answers"
        checked={config.allow_multiple}
        onChange={(v) => onChange({ ...config, allow_multiple: v })}
      />
    </div>
  )
}

function FreeTextEditor({ config, onChange }: { config: FreeTextConfig; onChange: (c: ChallengeConfig) => void }) {
  return (
    <div className="space-y-3">
      <Input
        id="correct-answer"
        label="Correct Answer"
        value={config.correct_answer}
        onChange={(e) => onChange({ ...config, correct_answer: e.target.value })}
        placeholder="The expected answer"
      />
      <Toggle
        label="Case sensitive"
        description="Require exact casing to match"
        checked={config.case_sensitive}
        onChange={(v) => onChange({ ...config, case_sensitive: v })}
      />
    </div>
  )
}

function PhotoUploadEditor({ config, onChange }: { config: PhotoUploadConfig; onChange: (c: ChallengeConfig) => void }) {
  return (
    <div className="space-y-3">
      <Toggle
        label="Requires manual review"
        description="Admin must verify the photo and award points manually"
        checked={config.requires_review}
        onChange={(v) => onChange({ ...config, requires_review: v })}
      />
    </div>
  )
}

function GpsCheckEditor({ config, onChange }: { config: GpsCheckConfig; onChange: (c: ChallengeConfig) => void }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Input
          id="lat"
          label="Latitude"
          type="number"
          step="any"
          value={config.lat || ''}
          onChange={(e) => onChange({ ...config, lat: parseFloat(e.target.value) || 0 })}
          placeholder="52.3676"
        />
        <Input
          id="lng"
          label="Longitude"
          type="number"
          step="any"
          value={config.lng || ''}
          onChange={(e) => onChange({ ...config, lng: parseFloat(e.target.value) || 0 })}
          placeholder="4.9041"
        />
      </div>
      <Input
        id="radius"
        label="Radius (meters)"
        type="number"
        value={config.radius_meters || ''}
        onChange={(e) => onChange({ ...config, radius_meters: parseInt(e.target.value) || 50 })}
        placeholder="50"
      />
      <p className="text-xs text-text-faint">
        Players must be within this radius of the target location
      </p>
    </div>
  )
}
