import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, Clock, Lightbulb, Camera, MapPin, Trophy, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { useAuth } from '../providers/AuthProvider'
import { useChallenge } from '../hooks/useChallenges'
import { useSubmission } from '../hooks/useSubmissions'
import { MediaGallery } from '../components/shared/MediaGallery'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { cn } from '../lib/utils'
import { DEFAULT_DISPLAY } from '../types'
import type {
  MultipleChoiceConfig,
  GpsCheckConfig,
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
      placeholder="Type your answer..."
      className="w-full bg-surface-raised border border-surface-overlay rounded-lg px-4 py-3 text-text placeholder:text-text-faint outline-none focus:border-neon transition-colors disabled:opacity-60"
    />
  )
}

function PhotoUploadInput({ disabled }: { disabled: boolean }) {
  return (
    <div className={cn(
      'flex flex-col items-center gap-3 p-8 rounded-lg border-2 border-dashed border-surface-overlay',
      disabled && 'opacity-60',
    )}>
      <Camera size={32} className="text-text-faint" />
      <span className="text-sm text-text-muted">
        {disabled ? 'Already submitted' : 'Tap to take a photo or upload'}
      </span>
    </div>
  )
}

function GpsCheckInput({
  onCheck,
  disabled,
}: {
  config: GpsCheckConfig
  onCheck: (coords: { lat: number; lng: number }) => void
  disabled: boolean
}) {
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleCheck() {
    if (disabled) return
    setChecking(true)
    setError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setChecking(false)
        onCheck({ lat: pos.coords.latitude, lng: pos.coords.longitude })
      },
      (err) => {
        setChecking(false)
        setError(err.message)
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={handleCheck}
        disabled={disabled || checking}
        className={cn(
          'flex flex-col items-center gap-3 p-8 rounded-lg border-2 border-dashed border-surface-overlay w-full transition-colors',
          !disabled && 'hover:border-neon/50 cursor-pointer',
          disabled && 'opacity-60 cursor-not-allowed',
        )}
      >
        {checking ? (
          <Loader2 size={32} className="text-neon animate-spin" />
        ) : (
          <MapPin size={32} className="text-text-faint" />
        )}
        <span className="text-sm text-text-muted">
          {checking ? 'Getting your location...' : disabled ? 'Already checked in' : 'Check in at this location'}
        </span>
      </button>
      {error && <p className="text-xs text-magenta">{error}</p>}
    </div>
  )
}

// ── Main Page ──

export function ChallengePlay() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { teamSession } = useAuth()
  const { challenge, loading: challengeLoading } = useChallenge(id)
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
        <p className="text-text-muted">Challenge not found.</p>
        <Button variant="ghost" className="mt-4" onClick={() => navigate('/')}>Go back</Button>
      </div>
    )
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
      ? `${scoring.fixed_points} pts`
      : scoring.placements.map((p) => `${p.points}`).join('/') + ' pts'

  // Total hint deduction so far
  const hintDeduction = hints.items.slice(0, revealedHints).reduce((sum, h) => sum + h.deduction, 0)

  // ── Submit handler ──
  async function handleSubmit() {
    if (!challenge) return
    let answer: Record<string, unknown> = {}

    switch (challenge.type) {
      case 'multiple_choice':
        answer = { selected: selectedOptions }
        break
      case 'free_text':
        if (!freeText.trim()) return
        answer = { text: freeText.trim() }
        break
      case 'photo_upload':
        // Future: handle photo upload
        answer = { photo_url: '' }
        break
      case 'gps_check':
        // Handled via onCheck callback
        return
    }

    answer.hints_used = revealedHints

    setSubmitError(null)
    const { error, result } = await submitAnswer(teamSession!.game.id, answer)
    if (error) {
      setSubmitError(error)
      toast.error('Submission failed', { description: error })
    } else if (result) {
      setSubmitResult({ correct: result.is_correct, points: result.points_awarded })
      if (result.is_correct) {
        toast.success('Correct!', {
          description: `+${result.points_awarded} pts awarded`,
        })
      } else {
        toast.error('Incorrect answer', {
          description: 'Try again or use a hint',
        })
      }
    }
  }

  async function handleGpsCheck(coords: { lat: number; lng: number }) {
    const answer: Record<string, unknown> = {
      lat: coords.lat,
      lng: coords.lng,
      hints_used: revealedHints,
    }
    setSubmitError(null)
    const { error, result } = await submitAnswer(teamSession!.game.id, answer)
    if (error) {
      setSubmitError(error)
      toast.error('Check-in failed', { description: error })
    } else if (result) {
      setSubmitResult({ correct: result.is_correct, points: result.points_awarded })
      if (result.is_correct) {
        toast.success('You made it!', {
          description: `+${result.points_awarded} pts awarded`,
        })
      } else {
        toast.error('Not quite there yet', {
          description: 'Get closer to the target location',
        })
      }
    }
  }

  const isCompact = display.compact

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
      case 'photo_upload':
        return <PhotoUploadInput disabled={disabled} />
      case 'gps_check':
        return (
          <GpsCheckInput
            config={challenge!.config as GpsCheckConfig}
            onCheck={handleGpsCheck}
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
            {challenge.time_limit && (
              <Badge variant="amber">
                <Clock size={12} className="mr-1" />
                {challenge.time_limit}s
              </Badge>
            )}
            <Badge variant="neon">
              <Trophy size={12} className="mr-1" />
              {pointsLabel}
            </Badge>
          </div>
        </div>
      </div>

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
                {(submission?.is_correct ?? submitResult?.correct) ? 'Correct!' : 'Incorrect'}
              </p>
              <p className="text-xs text-text-muted">
                {submission
                  ? `${submission.points_awarded} points awarded`
                  : submitResult
                    ? `${submitResult.points} points awarded`
                    : ''}
              </p>
            </div>
          </Card>
        )}

        {/* Attempts indicator */}
        {attemptCount > 0 && !isSolved && (
          <p className="text-xs text-text-muted text-center">
            {isLocked
              ? `No attempts remaining (${attemptCount}/${attemptsConfig.max} used)`
              : attemptsConfig.unlimited
                ? `${attemptCount} attempt${attemptCount !== 1 ? 's' : ''} used`
                : `${attemptsRemaining} of ${attemptsConfig.max} attempt${attemptsConfig.max !== 1 ? 's' : ''} remaining`}
          </p>
        )}

        {/* Locked banner */}
        {isLocked && (
          <Card className="border border-surface-overlay text-center py-3">
            <p className="text-sm text-text-muted">You've used all your attempts for this challenge.</p>
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
                ? 'No more hints'
                : `Get hint (−${hints.items[revealedHints]?.deduction ?? 0} pts)`}
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
                  <p className="text-xs text-amber/70 pl-6">Total hint deduction: −{hintDeduction} pts</p>
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
        {canRetry && challenge.type !== 'gps_check' && (
          <Button
            className="w-full"
            size="lg"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <Loader2 size={16} className="animate-spin mr-2" />
                Submitting...
              </>
            ) : attemptCount > 0 ? (
              'Try Again'
            ) : (
              'Submit Answer'
            )}
          </Button>
        )}
      </div>
    </div>
  )
}
