import { useEffect, useRef, useState } from 'react'
import { DoorOpen, DoorClosed, CheckCircle2, XCircle, Loader2, Send, Flag } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '../../lib/utils'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { CountdownTimer } from './CountdownTimer'
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

  const {
    state,
    loading,
    finalized,
    error,
    timeRemaining,
    attemptOpenDoor,
    finalize,
  } = useChallengeProgress({
    challengeId: challenge.id,
    timeLimitSeconds: challenge.time_limit,
  })

  const [input, setInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [finalResult, setFinalResult] = useState<{ points: number; isCorrect: boolean } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const found = state.found ?? []
  const allFound = found.length >= answers.length

  // Auto-finalize when time runs out OR all 4 found
  // Use a ref to track if we've already kicked off finalize, to avoid double-calls.
  const finalizingRef = useRef(false)
  useEffect(() => {
    if (finalized || finalizingRef.current) return
    const timesUp = timeRemaining !== null && timeRemaining <= 0
    if (timesUp || allFound) {
      finalizingRef.current = true
      finalize().then((res) => {
        if (res && !res.error) {
          setFinalResult({ points: res.points_awarded, isCorrect: res.is_correct })
          if (allFound) {
            toast.success('Alle deuren open!', { description: `Eindscore: ${res.points_awarded} pt` })
          } else {
            toast(`Tijd voorbij — ${res.points_awarded} pt verdiend`, { duration: 4000 })
          }
        }
      })
    }
  }, [timeRemaining, allFound, finalized, finalize])

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
      if (result.time_expired) {
        toast.error('Tijd is voorbij')
      } else {
        toast.error('Submit mislukt', { description: result.error })
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
      toast.success(`+${result.points} pt`, { description: answer?.text })
    } else {
      setFeedback({ type: 'miss' })
    }

    // Auto-clear feedback after a moment
    setTimeout(() => setFeedback(null), 1800)
  }

  async function handleFinalizeNow() {
    if (finalized || finalizingRef.current) return
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

  const totalPossible = answers.reduce((s, a) => s + (a.points || 0), 0)
  const earnedSoFar = found.reduce((s, idx) => s + (answers[idx]?.points || 0), 0)

  return (
    <div className="space-y-4">
      {/* Timer */}
      {challenge.time_limit && !finalized && (
        <CountdownTimer
          secondsRemaining={timeRemaining}
          totalSeconds={challenge.time_limit}
        />
      )}

      {/* Score so far */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-text-muted">
          {found.length} / {answers.length} gevonden
        </span>
        <span className="font-mono">
          <span className="text-neon font-bold">{earnedSoFar}</span>
          <span className="text-text-faint"> / {totalPossible} pt</span>
        </span>
      </div>

      {/* 4 doors */}
      <div className="grid grid-cols-2 gap-2.5">
        {answers.map((answer, i) => {
          const isFound = found.includes(i)
          const justFound = feedback?.type === 'hit' && feedback.index === i
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
                  {isFound ? `+${answer.points} pt` : `${answer.points} pt`}
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
              {allFound ? 'Alle deuren open!' : 'Challenge afgerond'}
            </p>
            <p className="text-xs text-text-muted">
              {finalResult ? `${finalResult.points} punten` : `${earnedSoFar} punten`} • {found.length}/{answers.length} antwoorden
            </p>
          </div>
        </Card>
      )}

      {/* Input + finalize */}
      {!finalized && !allFound && (
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
            <p className="text-xs text-magenta">Geen match — probeer een ander antwoord</p>
          )}

          {/* Manual finalize: only show when no time limit is set */}
          {!challenge.time_limit && (
            <button
              type="button"
              onClick={handleFinalizeNow}
              className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text mt-2 mx-auto"
            >
              <Flag size={12} /> Klaar — score insturen
            </button>
          )}
        </form>
      )}
    </div>
  )
}
