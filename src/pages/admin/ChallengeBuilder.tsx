import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, Save, Eye, EyeOff, Lock } from 'lucide-react'
import { tidyAlternatives } from '../../lib/utils'
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
import { useSections } from '../../hooks/useSections'
import type { ChallengeType, ChallengeConfig, ScoringConfig, HintsConfig, AttemptsConfig, DisplayConfig, MediaItem, OpenDoorConfig, PuzzleConfig, GalleryConfig, CollectiveMemoryConfig } from '../../types'
import { DEFAULT_CHALLENGE_CONFIGS, DEFAULT_SCORING, DEFAULT_DISPLAY, DEFAULT_ATTEMPTS, TYPE_CAPABILITIES } from '../../types'

export function ChallengeBuilder() {
  const { id: gameId, cid } = useParams()
  const navigate = useNavigate()
  const isEditing = !!cid
  const { challenge, loading: challengeLoading } = useChallenge(cid)
  const { createChallenge, updateChallenge } = useChallenges(gameId)
  const { sections } = useSections(gameId)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<ChallengeType>('multiple_choice')
  const [sectionId, setSectionId] = useState<string>('')
  const [config, setConfig] = useState<ChallengeConfig>(DEFAULT_CHALLENGE_CONFIGS.multiple_choice)
  const [explanation, setExplanation] = useState('')
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([])
  const [scoring, setScoring] = useState<ScoringConfig>(DEFAULT_SCORING)
  const [hints, setHints] = useState<HintsConfig>({ items: [] })
  const [attempts, setAttempts] = useState<AttemptsConfig>(DEFAULT_ATTEMPTS)
  const [display, setDisplay] = useState<DisplayConfig>(DEFAULT_DISPLAY)
  const [saving, setSaving] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  // Default section_id to the first section once sections load (new challenge only)
  useEffect(() => {
    if (!isEditing && !sectionId && sections.length > 0) {
      setSectionId(sections[0].id)
    }
  }, [isEditing, sectionId, sections])

  // Populate fields when editing
  useEffect(() => {
    if (challenge) {
      setTitle(challenge.title)
      setDescription(challenge.description ?? '')
      setType(challenge.type)
      setSectionId(challenge.section_id)
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
      // open_door/gallery/collective_memory keep their own `attempts` key inside
      // their type config (set by their own editor) — this outer state is only
      // the source of truth for types with uses_global_attempts. Reading their
      // config.attempts into it here would make it look correct until save,
      // where it gets spread back in and clobbers the real value (see below).
      setAttempts(
        TYPE_CAPABILITIES[challenge.type].uses_global_attempts
          ? (cfg.attempts as AttemptsConfig) ?? DEFAULT_ATTEMPTS
          : DEFAULT_ATTEMPTS
      )
      setDisplay({ ...DEFAULT_DISPLAY, ...(cfg.display as Partial<DisplayConfig> ?? {}) })
      setExplanation((cfg.explanation as string) ?? '')
    }
  }, [challenge])

  function handleTypeChange(newType: ChallengeType) {
    setType(newType)
    setConfig(DEFAULT_CHALLENGE_CONFIGS[newType])
  }

  async function handleSave() {
    if (!title.trim() || !sectionId) return
    setSaving(true)

    // For interactive types (uses_progress), top-level `points` is the max possible
    // so leaderboards/cards have a reasonable number.
    let topLevelPoints: number
    if (type === 'open_door') {
      const od = config as OpenDoorConfig
      const mode = od.scoring_mode ?? 'fixed'
      topLevelPoints = mode === 'placement'
        ? (od.placements?.[0]?.points ?? 0) * (od.answers?.length ?? 0)
        : od.answers?.reduce((s, a) => s + (a.points || 0), 0) ?? 0
    } else if (type === 'puzzle') {
      const pz = config as PuzzleConfig
      const mode = pz.scoring_mode ?? 'fixed'
      topLevelPoints = mode === 'placement'
        ? (pz.placements?.[0]?.points ?? 0) * (pz.themes?.length ?? 0)
        : pz.themes?.reduce((s, t) => s + (t.points || 0), 0) ?? 0
    } else if (type === 'gallery') {
      const g = config as GalleryConfig
      const mode = g.scoring_mode ?? 'fixed'
      topLevelPoints = mode === 'placement'
        ? (g.placements?.[0]?.points ?? 0) * (g.items?.length ?? 0)
        : g.items?.reduce((s, it) => s + (it.points || 0), 0) ?? 0
    } else if (type === 'collective_memory') {
      const cm = config as CollectiveMemoryConfig
      const mode = cm.scoring_mode ?? 'fixed'
      topLevelPoints = mode === 'placement'
        ? (cm.placements?.[0]?.points ?? 0) * (cm.keywords?.length ?? 0)
        : cm.keywords?.reduce((s, k) => s + (k.points || 0), 0) ?? 0
    } else if (scoring.mode === 'fixed') {
      topLevelPoints = scoring.fixed_points
    } else {
      topLevelPoints = scoring.placements[0]?.points ?? 0
    }

    const formData = {
      title: title.trim(),
      description: description.trim() || null,
      type,
      points: topLevelPoints,
      hint: hints.items[0]?.text ?? null,
      section_id: sectionId,
      config: {
        ...tidyAlternatives(type, config),
        scoring, hints, display,
        // open_door/gallery/collective_memory carry their own `attempts` key
        // inside config (set by their own editor above) — spreading this
        // outer state for them would clobber it back to the unrelated
        // multiple_choice/free_text "Pogingen" card's value.
        ...(TYPE_CAPABILITIES[type].uses_global_attempts ? { attempts } : {}),
        media: mediaItems,
        explanation: explanation.trim() || null,
      },
      media_url: mediaItems[0]?.url ?? null,
      media_type: mediaItems[0]?.type ?? null,
    }

    const { error } = isEditing && cid
      ? await updateChallenge(cid, formData)
      : await createChallenge(formData)

    setSaving(false)

    // Surface the failure and stay on the form — navigating away on a rejected
    // write made a failed save look identical to a successful one.
    if (error) {
      toast.error(isEditing ? 'Opslaan mislukt' : 'Aanmaken mislukt', {
        description: error.message,
        duration: 10000,
      })
      return
    }

    navigate(`/admin/games/${gameId}?tab=2`)
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
        onClick={() => navigate(`/admin/games/${gameId}?tab=2`)}
        className="flex items-center gap-1 text-sm text-text-muted hover:text-neon transition-colors mb-4"
      >
        <ArrowLeft size={16} /> Terug naar spel
      </button>

      <div className="flex items-start justify-between gap-4">
        <PageHeader
          title={isEditing ? 'Challenge bewerken' : 'Nieuwe challenge'}
          subtitle={isEditing ? `Je bewerkt: ${challenge?.title}` : 'Stel je challenge in'}
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
          {showPreview ? 'Preview verbergen' : 'Preview'}
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
          />
        </div>
      )}

      <div className="space-y-6">
        {/* Section assignment */}
        <Card className="space-y-3">
          <h3 className="font-display text-sm font-bold text-text-muted uppercase tracking-wider">
            Sectie
          </h3>
          {sections.length === 0 ? (
            <p className="text-xs text-amber">
              Dit spel heeft nog geen secties. Maak er eerst een aan via Spel bewerken → tab Secties.
            </p>
          ) : (
            <>
              <label htmlFor="section-picker" className="text-sm text-text-muted">Hoort bij sectie</label>
              <select
                id="section-picker"
                value={sectionId}
                onChange={(e) => setSectionId(e.target.value)}
                className="w-full bg-surface border border-surface-overlay rounded-lg px-3 py-2.5 text-text outline-none focus:border-neon"
              >
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title} {s.is_open ? '· open' : '· gesloten'}
                  </option>
                ))}
              </select>
            </>
          )}
        </Card>

        {/* Challenge Prompt */}
        <Card className="space-y-4">
          <h3 className="font-display text-sm font-bold text-text-muted uppercase tracking-wider">
            Challenge-opdracht
          </h3>
          <Input
            id="challenge-title"
            label="Titel"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="bv. De verborgen code"
          />
          <Textarea
            id="challenge-desc"
            label="Beschrijving"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Beschrijf de challenge..."
          />
          {gameId && (
            <div>
              <MultiMediaUploader
                gameId={gameId}
                items={mediaItems}
                onChange={setMediaItems}
              />
              <p className="text-xs text-text-faint mt-1.5">
                Deze media wordt aan spelers getoond naast de beschrijving van de challenge.
              </p>
            </div>
          )}
        </Card>

        {/* Answer Type */}
        <Card className="space-y-4">
          <h3 className="font-display text-sm font-bold text-text-muted uppercase tracking-wider">
            Antwoordtype
          </h3>
          <ChallengeTypeSelector value={type} onChange={handleTypeChange} />
        </Card>

        {/* Answer Configuration */}
        <Card className="space-y-4">
          <h3 className="font-display text-sm font-bold text-text-muted uppercase tracking-wider">
            Antwoordinstellingen
          </h3>
          <AnswerConfigEditor type={type} config={config} onChange={setConfig} gameId={gameId} />
        </Card>

        {/* Answer Explanation — never rendered on player screens */}
        <Card className="space-y-4">
          <div className="flex items-center gap-2">
            <h3 className="font-display text-sm font-bold text-text-muted uppercase tracking-wider">
              Antwoordtoelichting
            </h3>
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber/15 text-amber text-[10px] font-medium uppercase tracking-wider">
              <Lock size={10} /> Alleen admin
            </span>
          </div>
          <Textarea
            id="challenge-explanation"
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            placeholder="Waarom is dit het juiste antwoord? Bijv. achtergrond, weetjes of de uitleg om voor te lezen."
            rows={4}
          />
          <p className="text-xs text-text-faint">
            Naslag voor jezelf tijdens het spel. Spelers zien dit nooit.
          </p>
        </Card>

        {/* Scoring (hidden for interactive types — they score per item via answer config) */}
        {TYPE_CAPABILITIES[type].uses_global_scoring && (
          <Card className="space-y-4">
            <h3 className="font-display text-sm font-bold text-text-muted uppercase tracking-wider">
              Scoring
            </h3>
            <ScoringEditor scoring={scoring} onChange={setScoring} />
          </Card>
        )}

        {/* Hints */}
        <Card className="space-y-4">
          <h3 className="font-display text-sm font-bold text-text-muted uppercase tracking-wider">
            Hints
          </h3>
          <HintsEditor hints={hints} onChange={setHints} />
        </Card>

        {/* Attempts (hidden for interactive types — they manage attempts per item) */}
        {TYPE_CAPABILITIES[type].uses_global_attempts && (
          <Card className="space-y-4">
            <h3 className="font-display text-sm font-bold text-text-muted uppercase tracking-wider">
              Pogingen
            </h3>
            <AttemptsEditor attempts={attempts} onChange={setAttempts} />
          </Card>
        )}

        {/* Display */}
        {TYPE_CAPABILITIES[type].uses_display_config && (
          <Card className="space-y-4">
            <h3 className="font-display text-sm font-bold text-text-muted uppercase tracking-wider">
              Weergave
            </h3>
            <DisplaySettingsEditor display={display} onChange={setDisplay} />
          </Card>
        )}

        {/* Save */}
        <Button onClick={handleSave} disabled={!title.trim() || !sectionId || saving} className="w-full gap-2" size="lg">
          <Save size={18} />
          {saving ? 'Bezig met opslaan...' : isEditing ? 'Challenge bijwerken' : 'Challenge aanmaken'}
        </Button>
      </div>
    </div>
  )
}
