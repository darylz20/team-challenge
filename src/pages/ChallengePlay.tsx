import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, Lightbulb, Trophy, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { useAuth } from '../providers/AuthProvider'
import { useChallenge } from '../hooks/useChallenges'
import { useSubmission, useChallengeSolvers } from '../hooks/useSubmissions'
import type { ChallengeSolver } from '../hooks/useSubmissions'
import { useSections } from '../hooks/useSections'
import { MediaGallery } from '../components/shared/MediaGallery'
import { SolvedByTeams } from '../components/shared/SolvedByTeams'
import { OpenDoorPlay } from '../components/play/OpenDoorPlay'
import { PuzzlePlay } from '../components/play/PuzzlePlay'
import { GalleryPlay } from '../components/play/GalleryPlay'
import { CollectiveMemoryPlay } from '../components/play/CollectiveMemoryPlay'
import { PhotoUploadPlay } from '../components/play/PhotoUploadPlay'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { PlacementBadge } from '../components/shared/PlacementBadge'
import { cn, isPlacementBased } from '../lib/utils'
import { DEFAULT_DISPLAY, TYPE_CAPABILITIES } from '../types'
import type {
  MultipleChoiceConfig,
  AttemptsConfig,
  DisplayConfig,
  MediaItem,
  ScoringConfig,
  HintsConfig,
} from '../types'

// ── Horizontal media width based on media size ──
const horizontalWidthClass: Record<string, string> = {
  small: 'w-1/4',
  medium: 'w-1/3',
  large: 'w-2/5',
  full: 'w-1/2',
}

// ── Answer Inputs ──

function MultipleChoiceInput({
  config,
  columns,
  value,
  onChange,
  disabled,
}: {
  config: MultipleChoiceConfig
  columns: number
  value: number[]
  onChange: (v: number[]) => void
  disabled: boolean
}) {
  function toggle(i: number) {
    if (disabled) return
    if (config.allow_multiple) {
      onChange(value.includes(i) ? value.filter((x) => x !== i) : [...value, i])
    } else {
      onChange([i])
    }
  }

  return (
    <div className={cn('grid gap-2', columns === 2 && 'grid-cols-2', columns === 3 && 'grid-cols-3', columns === 4 && 'grid-cols-4')}>
      {config.options.filter((o) => o.text || o.image_url).map((option, i) => (
        <button
          key={i}
          type="button"
          onClick={() => toggle(i)}
          disabled={disabled}
          className={cn(
            'flex flex-col items-center gap-2 p-3 rounded-lg border-2 text-left transition-all',
            value.includes(i)
              ? 'border-neon bg-neon/10 shadow-glow-soft'
              : 'border-surface-overlay bg-surface-raised hover:border-text-faint',
            disabled && 'opacity-60 cursor-not-allowed',
          )}
        >
          {option.image_url && (
            <img src={option.image_url} alt="" className="w-full h-24 object-cover rounded" />
          )}
          <span className="text-sm text-text w-full">{option.text || `Option ${i + 1}`}</span>
        </button>
      ))}
    </div>
  )
}

function FreeTextInput({
  value,
  onChange,
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  disabled: boolean
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      placeholder="Typ je antwoord..."
      className="w-full bg-surface-raised border border-surface-overlay rounded-lg px-4 py-3 text-text placeholder:text-text-faint outline-none focus:border-neon transition-colors disabled:opacity-60"
    />
  )
}

// ── Interactive challenge view (open_door etc) ──
// Renders the prompt (title, media, description) + dispatches to the
// type-specific Play component which manages its own progress and submit.
function InteractiveChallengeView({
  challenge,
  solvers,
}: {
  challenge: NonNullable<ReturnType<typeof useChallenge>['challenge']>
  solvers: ChallengeSolver[]
}) {
  const navigate = useNavigate()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fullConfig = challenge.config as any
  const display: DisplayConfig = { ...DEFAULT_DISPLAY, ...(fullConfig?.display ?? {}) }
  const mediaItems: MediaItem[] = fullConfig?.media ?? (
    challenge.media_url && challenge.media_type
      ? [{ url: challenge.media_url, type: challenge.media_type }]
      : []
  )

  const descriptionBlock = challenge.description ? (
    <p className={cn(
      'text-text leading-relaxed whitespace-pre-wrap text-sm',
      display.description_align === 'center' && 'text-center',
    )}>{challenge.description}</p>
  ) : null

  const mediaBlock = mediaItems.length > 0 ? (
    <MediaGallery items={mediaItems} layout={display.media_layout} size={display.media_size} />
  ) : null

  function renderTypeSpecific() {
    switch (challenge.type) {
      case 'open_door':
        return <OpenDoorPlay challenge={challenge} />
      case 'puzzle':
        return <PuzzlePlay challenge={challenge} />
      case 'gallery':
        return <GalleryPlay challenge={challenge} />
      case 'collective_memory':
        return <CollectiveMemoryPlay challenge={challenge} />
      case 'photo_upload':
        return <PhotoUploadPlay challenge={challenge} />
      default:
        return <p className="text-sm text-text-muted">Onbekend type</p>
    }
  }

  return (
    <div className="animate-fade-in pb-20">
      {/* Header */}
      <div className="flex items-start gap-2 py-4">
        <button
          onClick={() => navigate('/')}
          className="p-2 -ml-2 mt-0.5 text-text-muted hover:text-text transition-colors shrink-0"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-lg font-bold text-text leading-snug break-words">
            {challenge.title}
          </h1>
          {isPlacementBased(challenge) && (
            <div className="mt-2">
              <PlacementBadge showLabel />
            </div>
          )}
        </div>
      </div>

      {solvers.length > 0 && <SolvedByTeams solvers={solvers} className="mb-4" />}

      <div className="space-y-4">
        {/* Description + media */}
        {(descriptionBlock || mediaBlock) && (
          <div className="space-y-3">
            {display.media_position === 'above' && mediaBlock}
            {descriptionBlock}
            {display.media_position !== 'above' && mediaBlock}
          </div>
        )}

        <div className="border-t border-surface-overlay" />

        {/* Type-specific gameplay */}
        {renderTypeSpecific()}
      </div>
    </div>
  )
}

// ── Main Page ──

export function ChallengePlay() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { teamSession } = useAuth()
  const { challenge, loading: challengeLoading } = useChallenge(id)
  const { sections } = useSections(teamSession?.game.id)
  const { solversByChallenge } = useChallengeSolvers(teamSession?.game.id)
  const { submission, attemptCount, hasCorrect, loading: submissionLoading, submitting, submitAnswer } = useSubmission(
    teamSession?.team.id,
    id,
  )

  // Answer state
  const [selectedOptions, setSelectedOptions] = useState<number[]>([])
  const [freeText, setFreeText] = useState('')
  const [revealedHints, setRevealedHints] = useState(0)
  const [submitResult, setSubmitResult] = useState<{ correct: boolean; points: number } | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  if (!teamSession) return null

  if (challengeLoading || submissionLoading) {
    return (
      <div className="flex items-center justify-center py-20 animate-fade-in">
        <div className="w-8 h-8 border-2 border-neon border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!challenge) {
    return (
      <div className="py-20 text-center animate-fade-in">
        <p className="text-text-muted">Challenge niet gevonden.</p>
        <Button variant="ghost" className="mt-4" onClick={() => navigate('/')}>Terug</Button>
      </div>
    )
  }

  // Section gate: if this challenge's section is closed, redirect home with a notice.
  // Catches direct-URL access or section being closed by admin while player is on the page.
  const challengeSection = sections.find((s) => s.id === challenge.section_id)
  if (challengeSection && !challengeSection.is_open) {
    return (
      <div className="py-20 text-center animate-fade-in">
        <p className="text-text-muted">Deze sectie is gesloten.</p>
        <p className="text-xs text-text-faint mt-1">"{challengeSection.title}" is nog niet geopend door de admin.</p>
        <Button variant="ghost" className="mt-4" onClick={() => navigate('/')}>Terug naar home</Button>
      </div>
    )
  }

  // Rival teams that already solved this challenge — a nudge to be quick.
  const otherSolvers = (solversByChallenge.get(challenge.id) ?? []).filter(
    (s) => s.team_id !== teamSession.team.id,
  )

  // ── Types that own their flow use a parallel view ──
  // Skip the entire single-submission scaffolding (useSubmission state, hint
  // deductions, manual submit button). The per-type Play component owns
  // attempts, progress, scoring, and finalization through useChallengeProgress.
  // photo_upload has no progress row but is the same shape of deal: it manages
  // its own single submission and has no hints or retries to scaffold.
  if (TYPE_CAPABILITIES[challenge.type].uses_progress || challenge.type === 'photo_upload') {
    return <InteractiveChallengeView challenge={challenge} solvers={otherSolvers} />
  }

  // Parse config fields with defaults
  const fullConfig = challenge.config as any
  const scoring: ScoringConfig = fullConfig?.scoring ?? { mode: 'fixed', fixed_points: challenge.points, placements: [] }
  const hints: HintsConfig = fullConfig?.hints ?? { items: [] }
  const attemptsConfig: AttemptsConfig = fullConfig?.attempts ?? { unlimited: true, max: 1 }
  const display: DisplayConfig = { ...DEFAULT_DISPLAY, ...(fullConfig?.display ?? {}) }

  // Parse media items
  const mediaItems: MediaItem[] = fullConfig?.media ?? (
    challenge.media_url && challenge.media_type
      ? [{ url: challenge.media_url, type: challenge.media_type }]
      : []
  )

  // Attempt logic
  const isSolved = hasCorrect
  const attemptsRemaining = attemptsConfig.unlimited
    ? Infinity
    : attemptsConfig.max - attemptCount
  const canRetry = !isSolved && attemptsRemaining > 0
  const isLocked = !canRetry && !isSolved && attemptCount > 0 // out of attempts, never solved

  const pointsLabel =
    scoring.mode === 'fixed'
      ? `${scoring.fixed_points} ptn`
      : scoring.placements.map((p) => `${p.points}`).join('/') + ' ptn'

  // Total hint deduction so far
  const hintDeduction = hints.items.slice(0, revealedHints).reduce((sum, h) => sum + h.deduction, 0)

  // ── Submit handler ──
  async function handleSubmit() {
    if (!challenge) return
    let answer: Record<string, unknown> = {}

    switch (challenge.type) {
      case 'multiple_choice':
        if (selectedOptions.length === 0) return
        answer = { selected: selectedOptions }
        break
      case 'free_text':
        if (!freeText.trim()) return
        answer = { text: freeText.trim() }
        break
    }

    answer.hints_used = revealedHints

    setSubmitError(null)
    const { error, result } = await submitAnswer(teamSession!.game.id, answer)
    if (error) {
      setSubmitError(error)
      toast.error('Insturen mislukt', { description: error })
    } else if (result) {
      setSubmitResult({ correct: result.is_correct, points: result.points_awarded })
      if (result.is_correct) {
        toast.success('Goed!', {
          description: `+${result.points_awarded} ptn toegekend`,
        })
      } else {
        toast.error('Fout antwoord', {
          description: 'Probeer het opnieuw of gebruik een hint',
        })
      }
    }
  }

  const isCompact = display.compact

  // Whether the current answer input has enough to submit
  const hasAnswer =
    challenge.type === 'multiple_choice'
      ? selectedOptions.length > 0
      : challenge.type === 'free_text'
        ? freeText.trim().length > 0
        : true

  // ── Render description + media based on display config ──
  const descriptionBlock = challenge.description ? (
    <p className={cn(
      'text-text leading-relaxed whitespace-pre-wrap',
      isCompact ? 'text-xs' : 'text-sm',
      display.description_align === 'center' && 'text-center',
    )}>{challenge.description}</p>
  ) : null

  const mediaBlock = mediaItems.length > 0 ? (
    <MediaGallery items={mediaItems} layout={display.media_layout} size={display.media_size} />
  ) : null

  function renderContent() {
    if (!mediaBlock) return descriptionBlock

    if (display.media_position === 'background' && mediaItems[0]?.type === 'image') {
      return (
        <div
          className="relative rounded-lg overflow-hidden p-6 min-h-[160px] flex items-end"
          style={{
            backgroundImage: `url(${mediaItems[0].url})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-void/90 via-void/50 to-transparent" />
          <div className="relative z-10">{descriptionBlock}</div>
        </div>
      )
    }

    if (display.media_position === 'left' || display.media_position === 'right') {
      const widthCls = horizontalWidthClass[display.media_size] ?? 'w-2/5'
      const media = <div className={cn(widthCls, 'shrink-0')}>{mediaBlock}</div>
      const text = <div className="flex-1 min-w-0">{descriptionBlock}</div>
      return (
        <div className={cn('flex', isCompact ? 'gap-2' : 'gap-4')}>
          {display.media_position === 'left' ? <>{media}{text}</> : <>{text}{media}</>}
        </div>
      )
    }

    return (
      <div className={isCompact ? 'space-y-1.5' : 'space-y-3'}>
        {display.media_position === 'above' && mediaBlock}
        {descriptionBlock}
        {display.media_position === 'below' && mediaBlock}
      </div>
    )
  }

  // ── Render answer input ──
  function renderAnswerInput() {
    const disabled = (isSolved || !canRetry) || submitting

    switch (challenge!.type) {
      case 'multiple_choice':
        return (
          <MultipleChoiceInput
            config={challenge!.config as MultipleChoiceConfig}
            columns={display.columns}
            value={selectedOptions}
            onChange={setSelectedOptions}
            disabled={disabled}
          />
        )
      case 'free_text':
        return (
          <FreeTextInput
            value={freeText}
            onChange={setFreeText}
            disabled={disabled}
          />
        )
    }
  }

  return (
    <div className="animate-fade-in pb-20">
      {/* Header */}
      <div className="flex items-start gap-2 py-4">
        <button
          onClick={() => navigate('/')}
          className="p-2 -ml-2 mt-0.5 text-text-muted hover:text-text transition-colors shrink-0"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-lg font-bold text-text leading-snug break-words">
            {challenge.title}
          </h1>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Badge variant="neon">
              <Trophy size={12} className="mr-1" />
              {pointsLabel}
            </Badge>
            {isPlacementBased(challenge) && <PlacementBadge showLabel />}
          </div>
        </div>
      </div>

      {otherSolvers.length > 0 && <SolvedByTeams solvers={otherSolvers} className="mb-4" />}

      {/* Content */}
      <div className={isCompact ? 'space-y-3' : 'space-y-5'}>
        {/* Description + Media */}
        {renderContent()}

        {/* Divider */}
        <div className="border-t border-surface-overlay" />

        {/* Result banner */}
        {(submission || submitResult) && (
          <Card className={cn(
            'flex items-center gap-3',
            (submission?.is_correct ?? submitResult?.correct)
              ? 'border border-lime/30 bg-lime/5'
              : 'border border-magenta/30 bg-magenta/5',
          )}>
            {(submission?.is_correct ?? submitResult?.correct) ? (
              <CheckCircle2 size={24} className="text-lime shrink-0" />
            ) : (
              <XCircle size={24} className="text-magenta shrink-0" />
            )}
            <div>
              <p className="font-semibold text-sm">
                {(submission?.is_correct ?? submitResult?.correct) ? 'Goed!' : 'Fout'}
              </p>
              <p className="text-xs text-text-muted">
                {submission
                  ? `${submission.points_awarded} punten toegekend`
                  : submitResult
                    ? `${submitResult.points} punten toegekend`
                    : ''}
              </p>
            </div>
          </Card>
        )}

        {/* Attempts indicator */}
        {attemptCount > 0 && !isSolved && (
          <p className="text-xs text-text-muted text-center">
            {isLocked
              ? `Geen pogingen meer over (${attemptCount}/${attemptsConfig.max} gebruikt)`
              : attemptsConfig.unlimited
                ? `${attemptCount} poging${attemptCount !== 1 ? 'en' : ''} gebruikt`
                : `${attemptsRemaining} van ${attemptsConfig.max} poging${attemptsConfig.max !== 1 ? 'en' : ''} over`}
          </p>
        )}

        {/* Locked banner */}
        {isLocked && (
          <Card className="border border-surface-overlay text-center py-3">
            <p className="text-sm text-text-muted">Je hebt al je pogingen voor deze challenge gebruikt.</p>
          </Card>
        )}

        {/* Answer input */}
        {renderAnswerInput()}

        {/* Hints */}
        {hints.items.length > 0 && canRetry && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setRevealedHints((prev) => Math.min(prev + 1, hints.items.length))}
              disabled={revealedHints >= hints.items.length}
              className={cn(
                'flex items-center gap-2 text-sm transition-colors',
                revealedHints >= hints.items.length
                  ? 'text-text-faint cursor-not-allowed'
                  : 'text-amber hover:text-amber-dim cursor-pointer',
              )}
            >
              <Lightbulb size={14} />
              {revealedHints >= hints.items.length
                ? 'Geen hints meer'
                : `Hint tonen (−${hints.items[revealedHints]?.deduction ?? 0} ptn)`}
            </button>
            {revealedHints > 0 && (
              <div className="space-y-1.5">
                {hints.items.slice(0, revealedHints).map((h, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm bg-amber/5 border border-amber/20 rounded-lg px-3 py-2">
                    <Lightbulb size={14} className="text-amber shrink-0 mt-0.5" />
                    <span className="text-text-muted">{h.text}</span>
                  </div>
                ))}
                {hintDeduction > 0 && (
                  <p className="text-xs text-amber/70 pl-6">Totale hintaftrek: −{hintDeduction} ptn</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Error */}
        {submitError && (
          <p className="text-sm text-magenta text-center">{submitError}</p>
        )}

        {/* Submit button */}
        {canRetry && (
          <Button
            className="w-full"
            size="lg"
            onClick={handleSubmit}
            disabled={submitting || !hasAnswer}
          >
            {submitting ? (
              <>
                <Loader2 size={16} className="animate-spin mr-2" />
                Bezig met insturen...
              </>
            ) : attemptCount > 0 ? (
              'Probeer opnieuw'
            ) : (
              'Antwoord insturen'
            )}
          </Button>
        )}
      </div>
    </div>
  )
}
