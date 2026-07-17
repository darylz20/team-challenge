import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, XCircle, Loader2, Send, Flag } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '../../lib/utils'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { useChallengeProgress } from '../../hooks/useChallengeProgress'
import type { Challenge, GalleryConfig } from '../../types'

interface GalleryPlayProps {
  challenge: Challenge
}

type Feedback =
  | { type: 'hit'; index: number; answer: string; points: number }
  | { type: 'miss' }
  | null

export function GalleryPlay({ challenge }: GalleryPlayProps) {
  const config = challenge.config as GalleryConfig
  const items = config.items ?? []
  const scoringMode = config.scoring_mode ?? 'fixed'
  const placements = config.placements ?? []
  const attempts = config.attempts ?? { unlimited: true, max: 0 }

  const maxPerItemForMode = (i: number) =>
    scoringMode === 'placement' ? (placements[0]?.points ?? 0) : (items[i]?.points ?? 0)

  const {
    state,
    loading,
    finalized,
    error,
    attemptGallery,
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
  const attemptsUsed = state.attempts_used ?? 0
  const attemptsRemaining = attempts.unlimited ? Infinity : Math.max(0, attempts.max - attemptsUsed)
  const allFound = found.length >= items.length && items.length > 0
  const noAttemptsLeft = !attempts.unlimited && attemptsRemaining <= 0

  // Auto-finalize when all found or attempts exhausted
  const finalizingRef = useRef(false)
  useEffect(() => {
    if (finalized || finalizingRef.current) return
    if (allFound || noAttemptsLeft) {
      finalizingRef.current = true
      finalize().then((res) => {
        if (res && !res.error) {
          setFinalResult({ points: res.points_awarded, isCorrect: res.is_correct })
          if (allFound) {
            toast.success('Alle foto\'s gevonden!', { description: `Eindscore: ${res.points_awarded} ptn` })
          } else {
            toast(`Geen pogingen meer — ${res.points_awarded} ptn verdiend`, { duration: 4000 })
          }
        }
      })
    }
  }, [allFound, noAttemptsLeft, finalized, finalize])

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

    const result = await attemptGallery(text)
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
      const item = items[result.index]
      setFeedback({
        type: 'hit',
        index: result.index,
        answer: item?.answer ?? '',
        points: result.points ?? 0,
      })
      const placeLabel = result.place ? ` (${result.place}e team)` : ''
      toast.success(`+${result.points} ptn${placeLabel}`, { description: item?.answer })
    } else {
      setFeedback({ type: 'miss' })
    }

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
  const totalPossible =
    scoringMode === 'placement'
      ? (placements[0]?.points ?? 0) * items.length
      : items.reduce((s, it) => s + (it.points || 0), 0)
  const earnedSoFar = found.reduce((s, idx) => {
    const award = pointsPerFind[String(idx)]
    return s + (award != null ? award : (items[idx]?.points || 0))
  }, 0)

  return (
    <div className="space-y-4">
      {/* Theme hint */}
      {config.show_theme && config.theme && (
        <div className="text-center">
          <p className="text-xs text-text-faint uppercase tracking-wider">Thema</p>
          <p className="text-base font-semibold text-text">{config.theme}</p>
        </div>
      )}

      {/* Score + attempts */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-text-muted">
          {found.length} / {items.length} gevonden
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

      {/* Image grid */}
      <div className="grid grid-cols-2 gap-2">
        {items.map((item, i) => {
          const isFound = found.includes(i)
          const justFound = feedback?.type === 'hit' && feedback.index === i
          const award = isFound ? (pointsPerFind[String(i)] ?? item.points ?? 0) : null
          return (
            <div
              key={i}
              className={cn(
                'relative rounded-lg overflow-hidden border-2 transition-all',
                isFound ? 'border-lime' : 'border-surface-overlay',
                justFound && 'ring-2 ring-lime animate-pulse',
              )}
            >
              {item.media?.url ? (
                <img
                  src={item.media.url}
                  alt=""
                  className={cn(
                    'w-full aspect-square object-cover transition-all',
                    !isFound && 'opacity-90',
                  )}
                />
              ) : (
                <div className="w-full aspect-square bg-surface-overlay/30" />
              )}
              {/* Found overlay */}
              {isFound && (
                <div className="absolute inset-0 bg-gradient-to-t from-void/95 via-void/40 to-transparent flex flex-col justify-end p-2">
                  <p className="text-sm font-bold text-lime truncate">{item.answer}</p>
                  <p className="text-xs font-mono text-lime/80">+{award} ptn</p>
                </div>
              )}
              {/* Unfound badge */}
              {!isFound && (
                <div className="absolute top-1 right-1 px-1.5 py-0.5 rounded bg-void/80 text-[10px] font-mono text-amber">
                  {scoringMode === 'placement' ? `tot ${maxPerItemForMode(i)}` : `${maxPerItemForMode(i)}`} ptn
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Final result banner */}
      {(finalized || finalResult) && (
        <Card className={cn(
          'flex items-center gap-3',
          earnedSoFar > 0
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
              {allFound ? 'Alle foto\'s gevonden!' : 'Challenge afgerond'}
            </p>
            <p className="text-xs text-text-muted">
              {finalResult ? `${finalResult.points} punten` : `${earnedSoFar} punten`} • {found.length}/{items.length} foto's
            </p>
          </div>
        </Card>
      )}

      {/* Input */}
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
              Geen match{!attempts.unlimited ? ` — ${attemptsRemaining} pog. over` : ''}
            </p>
          )}

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
