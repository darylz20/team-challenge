import { useEffect, useRef, useState } from 'react'
import { DoorOpen, DoorClosed, CheckCircle2, XCircle, Loader2, Send, Flag } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '../../lib/utils'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { useChallengeProgress } from '../../hooks/useChallengeProgress'
import type { Challenge, OpenDoorConfig } from '../../types'

interface OpenDoorPlayProps {
  challenge: Challenge
}

type Feedback =
  | { type: 'hit'; index: number; text: string; points: number }
  | { type: 'miss' }
  | null

export function OpenDoorPlay({ challenge }: OpenDoorPlayProps) {
  const config = challenge.config as OpenDoorConfig
  const answers = config.answers ?? []
  const scoringMode = config.scoring_mode ?? 'fixed'
  const placements = config.placements ?? []
  const attempts = config.attempts ?? { unlimited: true, max: 0 }
  // Max points awardable per answer (used for display on unfound doors)
  const maxPerAnswerForMode = (i: number) =>
    scoringMode === 'placement' ? (placements[0]?.points ?? 0) : (answers[i]?.points ?? 0)

  const {
    state,
    loading,
    finalized,
    error,
    attemptOpenDoor,
    finalize,
  } = useChallengeProgress({
    challengeId: challenge.id,
  })

  const [input, setInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [finalResult, setFinalResult] = useState<{ points: number; isCorrect: boolean } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const found = state.found ?? []
  const allFound = found.length >= answers.length
  const attemptsUsed = state.attempts_used ?? 0
  const attemptsRemaining = attempts.unlimited ? Infinity : Math.max(0, attempts.max - attemptsUsed)
  const noAttemptsLeft = !attempts.unlimited && attemptsRemaining <= 0

  // Auto-finalize when all 4 found or the attempt budget runs out
  const finalizingRef = useRef(false)
  useEffect(() => {
    if (finalized || finalizingRef.current) return
    if (allFound || noAttemptsLeft) {
      finalizingRef.current = true
      finalize().then((res) => {
        if (res && !res.error) {
          setFinalResult({ points: res.points_awarded, isCorrect: res.is_correct })
          if (allFound) {
            toast.success('Alle deuren open!', { description: `Eindscore: ${res.points_awarded} ptn` })
          } else {
            toast(`Geen pogingen meer — ${res.points_awarded} ptn verdiend`, { duration: 4000 })
          }
        }
      })
    }
  }, [allFound, noAttemptsLeft, finalized, finalize])

  // Refocus input after submit (mobile keyboard stays up)
  useEffect(() => {
    if (!submitting && !finalized && inputRef.current) {
      inputRef.current.focus()
    }
  }, [submitting, finalized])

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!input.trim() || submitting || finalized) return

    setSubmitting(true)
    const text = input.trim()
    setInput('')

    const result = await attemptOpenDoor(text)
    setSubmitting(false)

    if (result.error) {
      if (result.attempts_exhausted) {
        toast.error('Geen pogingen meer over')
      } else {
        toast.error('Insturen mislukt', { description: result.error })
      }
      return
    }

    if (result.matched && result.index !== undefined) {
      const answer = answers[result.index]
      setFeedback({
        type: 'hit',
        index: result.index,
        text: answer?.text ?? '',
        points: result.points ?? 0,
      })
      const placeLabel = result.place
        ? ` (${result.place}e team)`
        : ''
      toast.success(`+${result.points} ptn${placeLabel}`, { description: answer?.text })
    } else {
      setFeedback({ type: 'miss' })
    }

    // Auto-clear feedback after a moment
    setTimeout(() => setFeedback(null), 1800)
  }

  async function handleFinalizeNow() {
    if (finalized || finalizingRef.current) return
    if (!window.confirm('Score nu insturen? Je kunt daarna niet meer verder met deze challenge.')) return
    finalizingRef.current = true
    const res = await finalize()
    if (res && !res.error) {
      setFinalResult({ points: res.points_awarded, isCorrect: res.is_correct })
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={24} className="text-neon animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <Card className="border border-magenta/30 bg-magenta/5 text-center py-6">
        <p className="text-sm text-magenta">{error}</p>
      </Card>
    )
  }

  const pointsPerFind = state.points_per_find ?? {}
  // Max possible per team: in placement mode = best place × 4; in fixed = sum of per-answer points
  const totalPossible =
    scoringMode === 'placement'
      ? (placements[0]?.points ?? 0) * answers.length
      : answers.reduce((s, a) => s + (a.points || 0), 0)
  // Earned so far: prefer per-find awards (always set by attempt RPC),
  // fall back to fixed answer.points for legacy progress data.
  const earnedSoFar = found.reduce((s, idx) => {
    const award = pointsPerFind[String(idx)]
    return s + (award != null ? award : (answers[idx]?.points || 0))
  }, 0)

  return (
    <div className="space-y-4">
      {/* Score so far */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-text-muted">
          {found.length} / {answers.length} gevonden
        </span>
        <div className="flex items-center gap-3">
          {!attempts.unlimited && (
            <span className="text-xs text-text-muted">
              <span className={cn('font-mono', attemptsRemaining <= 1 && 'text-magenta')}>{attemptsRemaining}</span>
              <span className="text-text-faint"> pog.</span>
            </span>
          )}
          <span className="font-mono">
            <span className="text-neon font-bold">{earnedSoFar}</span>
            <span className="text-text-faint"> / {totalPossible} ptn</span>
          </span>
        </div>
      </div>

      {/* 4 doors */}
      <div className="grid grid-cols-2 gap-2.5">
        {answers.map((answer, i) => {
          const isFound = found.includes(i)
          const justFound = feedback?.type === 'hit' && feedback.index === i
          const awarded = isFound
            ? (pointsPerFind[String(i)] ?? answer.points ?? 0)
            : null
          const maxForUnfound = maxPerAnswerForMode(i)
          return (
            <div
              key={i}
              className={cn(
                'flex items-center gap-2.5 p-3 rounded-lg border-2 transition-all',
                isFound
                  ? 'border-lime/50 bg-lime/10'
                  : 'border-surface-overlay bg-surface-raised',
                justFound && 'animate-pulse ring-2 ring-lime',
              )}
            >
              {isFound ? (
                <DoorOpen size={18} className="text-lime shrink-0" />
              ) : (
                <DoorClosed size={18} className="text-text-faint shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                {isFound ? (
                  <p className="text-sm font-medium text-text truncate">{answer.text}</p>
                ) : (
                  <p className="text-xs text-text-faint">Deur {i + 1}</p>
                )}
                <p className={cn(
                  'text-xs font-mono',
                  isFound ? 'text-lime' : 'text-text-faint',
                )}>
                  {isFound
                    ? `+${awarded} ptn`
                    : scoringMode === 'placement'
                      ? `tot ${maxForUnfound} ptn`
                      : `${maxForUnfound} ptn`}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      {/* Final result banner */}
      {(finalized || finalResult) && (
        <Card className={cn(
          'flex items-center gap-3',
          finalResult?.isCorrect || finalized
            ? 'border border-lime/30 bg-lime/5'
            : 'border border-magenta/30 bg-magenta/5',
        )}>
          {found.length > 0 ? (
            <CheckCircle2 size={22} className="text-lime shrink-0" />
          ) : (
            <XCircle size={22} className="text-magenta shrink-0" />
          )}
          <div className="flex-1">
            <p className="font-semibold text-sm">
              {allFound
                ? 'Alle deuren open!'
                : noAttemptsLeft
                  ? 'Geen pogingen meer'
                  : 'Challenge afgerond'}
            </p>
            <p className="text-xs text-text-muted">
              {finalResult ? `${finalResult.points} punten` : `${earnedSoFar} punten`} • {found.length}/{answers.length} antwoorden
            </p>
          </div>
        </Card>
      )}

      {/* Input + finalize */}
      {!finalized && !allFound && !noAttemptsLeft && (
        <form onSubmit={handleSubmit} className="space-y-2">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={submitting || finalized}
              placeholder="Typ een antwoord..."
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              className={cn(
                'flex-1 bg-surface-raised border-2 rounded-lg px-4 py-3 text-text placeholder:text-text-faint outline-none transition-colors',
                feedback?.type === 'miss' && 'border-magenta animate-shake',
                feedback?.type === 'hit' && 'border-lime',
                !feedback && 'border-surface-overlay focus:border-neon',
              )}
            />
            <Button
              type="submit"
              disabled={submitting || !input.trim()}
              className="px-4"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </Button>
          </div>
          {feedback?.type === 'miss' && (
            <p className="text-xs text-magenta">
              Geen match{!attempts.unlimited ? ` — ${attemptsRemaining} pog. over` : ' — probeer een ander antwoord'}
            </p>
          )}

          {/* Manual finalize */}
          <button
            type="button"
            onClick={handleFinalizeNow}
            className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text mt-2 mx-auto"
          >
            <Flag size={12} /> Klaar — score insturen
          </button>
        </form>
      )}
    </div>
  )
}
