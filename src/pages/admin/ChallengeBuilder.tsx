import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Save, Eye, EyeOff } from 'lucide-react'
import { PageHeader } from '../../components/layout/PageHeader'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Textarea } from '../../components/ui/Textarea'
import { ChallengeTypeSelector } from '../../components/admin/ChallengeTypeSelector'
import { AnswerConfigEditor } from '../../components/admin/AnswerConfigEditor'
import { MultiMediaUploader } from '../../components/admin/MultiMediaUploader'
import { ScoringEditor } from '../../components/admin/ScoringEditor'
import { HintsEditor } from '../../components/admin/HintsEditor'
import { AttemptsEditor } from '../../components/admin/AttemptsEditor'
import { DisplaySettingsEditor } from '../../components/admin/DisplaySettingsEditor'
import { ChallengePreview } from '../../components/admin/ChallengePreview'
import { useChallenges, useChallenge } from '../../hooks/useChallenges'
import type { ChallengeType, ChallengeConfig, ScoringConfig, HintsConfig, AttemptsConfig, DisplayConfig, MediaItem } from '../../types'
import { DEFAULT_CHALLENGE_CONFIGS, DEFAULT_SCORING, DEFAULT_DISPLAY, DEFAULT_ATTEMPTS } from '../../types'

export function ChallengeBuilder() {
  const { id: gameId, cid } = useParams()
  const navigate = useNavigate()
  const isEditing = !!cid
  const { challenge, loading: challengeLoading } = useChallenge(cid)
  const { createChallenge, updateChallenge } = useChallenges(gameId)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<ChallengeType>('multiple_choice')
  const [timeLimit, setTimeLimit] = useState<string>('')
  const [config, setConfig] = useState<ChallengeConfig>(DEFAULT_CHALLENGE_CONFIGS.multiple_choice)
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([])
  const [scoring, setScoring] = useState<ScoringConfig>(DEFAULT_SCORING)
  const [hints, setHints] = useState<HintsConfig>({ items: [] })
  const [attempts, setAttempts] = useState<AttemptsConfig>(DEFAULT_ATTEMPTS)
  const [display, setDisplay] = useState<DisplayConfig>(DEFAULT_DISPLAY)
  const [saving, setSaving] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  // Populate fields when editing
  useEffect(() => {
    if (challenge) {
      setTitle(challenge.title)
      setDescription(challenge.description ?? '')
      setType(challenge.type)
      setTimeLimit(challenge.time_limit?.toString() ?? '')
      setConfig(challenge.config)

      // Extract new settings from config JSONB (backward-compatible)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cfg = challenge.config as any

      // Multi-media: load from config, fall back to legacy single media fields
      setMediaItems((cfg.media as MediaItem[]) ?? (
        challenge.media_url && challenge.media_type
          ? [{ url: challenge.media_url, type: challenge.media_type }]
          : []
      ))

      setScoring((cfg.scoring as ScoringConfig) ?? {
        mode: 'fixed' as const,
        fixed_points: challenge.points,
        placements: [{ place: 1, points: challenge.points }],
      })
      setHints((cfg.hints as HintsConfig) ?? {
        items: challenge.hint ? [{ text: challenge.hint, deduction: 0 }] : [],
      })
      setAttempts((cfg.attempts as AttemptsConfig) ?? DEFAULT_ATTEMPTS)
      setDisplay({ ...DEFAULT_DISPLAY, ...(cfg.display as Partial<DisplayConfig> ?? {}) })
    }
  }, [challenge])

  function handleTypeChange(newType: ChallengeType) {
    setType(newType)
    setConfig(DEFAULT_CHALLENGE_CONFIGS[newType])
  }

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)

    const formData = {
      title: title.trim(),
      description: description.trim() || null,
      type,
      points: scoring.mode === 'fixed' ? scoring.fixed_points : (scoring.placements[0]?.points ?? 0),
      time_limit: timeLimit ? parseInt(timeLimit) : null,
      hint: hints.items[0]?.text ?? null,
      config: { ...config, scoring, hints, attempts, display, media: mediaItems },
      media_url: mediaItems[0]?.url ?? null,
      media_type: mediaItems[0]?.type ?? null,
    }

    if (isEditing && cid) {
      await updateChallenge(cid, formData)
    } else {
      await createChallenge(formData)
    }

    setSaving(false)
    navigate(`/admin/games/${gameId}`)
  }

  if (isEditing && challengeLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-neon border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="animate-fade-in max-w-2xl">
      <button
        onClick={() => navigate(`/admin/games/${gameId}`)}
        className="flex items-center gap-1 text-sm text-text-muted hover:text-neon transition-colors mb-4"
      >
        <ArrowLeft size={16} /> Back to Game
      </button>

      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title={isEditing ? 'Edit Challenge' : 'New Challenge'}
          subtitle={isEditing ? `Editing: ${challenge?.title}` : 'Configure your challenge'}
        />
        <button
          type="button"
          onClick={() => setShowPreview((v) => !v)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all shrink-0 mt-1 ${
            showPreview
              ? 'bg-neon/15 text-neon border border-neon/40'
              : 'bg-surface-overlay/50 text-text-muted border border-surface-overlay hover:border-text-faint'
          }`}
        >
          {showPreview ? <EyeOff size={16} /> : <Eye size={16} />}
          {showPreview ? 'Hide Preview' : 'Preview'}
        </button>
      </div>

      {/* Live Preview */}
      {showPreview && (
        <div className="mb-6 animate-fade-in">
          <ChallengePreview
            title={title}
            description={description}
            type={type}
            config={config}
            display={display}
            mediaItems={mediaItems}
            scoring={scoring}
            hints={hints}
            timeLimit={timeLimit}
          />
        </div>
      )}

      <div className="space-y-6">
        {/* Challenge Prompt */}
        <Card className="space-y-4">
          <h3 className="font-display text-sm font-bold text-text-muted uppercase tracking-wider">
            Challenge Prompt
          </h3>
          <Input
            id="challenge-title"
            label="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. The Hidden Code"
          />
          <Textarea
            id="challenge-desc"
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the challenge..."
          />
          {gameId && (
            <div>
              <MultiMediaUploader
                gameId={gameId}
                items={mediaItems}
                onChange={setMediaItems}
              />
              <p className="text-xs text-text-faint mt-1.5">
                This media will be shown to players alongside the challenge description.
              </p>
            </div>
          )}
        </Card>

        {/* Answer Type */}
        <Card className="space-y-4">
          <h3 className="font-display text-sm font-bold text-text-muted uppercase tracking-wider">
            Answer Type
          </h3>
          <ChallengeTypeSelector value={type} onChange={handleTypeChange} />
        </Card>

        {/* Answer Configuration */}
        <Card className="space-y-4">
          <h3 className="font-display text-sm font-bold text-text-muted uppercase tracking-wider">
            Answer Configuration
          </h3>
          <AnswerConfigEditor type={type} config={config} onChange={setConfig} gameId={gameId} />
        </Card>

        {/* Scoring */}
        <Card className="space-y-4">
          <h3 className="font-display text-sm font-bold text-text-muted uppercase tracking-wider">
            Scoring
          </h3>
          <ScoringEditor scoring={scoring} onChange={setScoring} />
        </Card>

        {/* Hints */}
        <Card className="space-y-4">
          <h3 className="font-display text-sm font-bold text-text-muted uppercase tracking-wider">
            Hints
          </h3>
          <HintsEditor hints={hints} onChange={setHints} />
        </Card>

        {/* Attempts */}
        <Card className="space-y-4">
          <h3 className="font-display text-sm font-bold text-text-muted uppercase tracking-wider">
            Attempts
          </h3>
          <AttemptsEditor attempts={attempts} onChange={setAttempts} />
        </Card>

        {/* Display */}
        <Card className="space-y-4">
          <h3 className="font-display text-sm font-bold text-text-muted uppercase tracking-wider">
            Display
          </h3>
          <DisplaySettingsEditor display={display} onChange={setDisplay} />
        </Card>

        {/* Time Limit */}
        <Card className="space-y-4">
          <h3 className="font-display text-sm font-bold text-text-muted uppercase tracking-wider">
            Time Limit
          </h3>
          <Input
            id="time-limit"
            label="Time Limit (seconds)"
            type="number"
            value={timeLimit}
            onChange={(e) => setTimeLimit(e.target.value)}
            placeholder="No limit"
          />
        </Card>

        {/* Save */}
        <Button onClick={handleSave} disabled={!title.trim() || saving} className="w-full gap-2" size="lg">
          <Save size={18} />
          {saving ? 'Saving...' : isEditing ? 'Update Challenge' : 'Create Challenge'}
        </Button>
      </div>
    </div>
  )
}
