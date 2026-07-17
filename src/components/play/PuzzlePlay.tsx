import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, XCircle, Loader2, Send, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '../../lib/utils'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { useChallengeProgress } from '../../hooks/useChallengeProgress'
import type { Challenge, PuzzleConfig } from '../../types'

interface PuzzlePlayProps {
  challenge: Challenge
}

type Feedback =
  | { type: 'hit'; index: number; name: string; points: number }
  | { type: 'miss'; newlyLocked: number[] }
  | { type: 'noop'; reason: 'already_solved' | 'already_locked' }
  | null

// Theme colors (must match admin editor/preview for consistency)
const themeBorderColors = [
  'border-neon bg-neon/15',
  'border-amber bg-amber/15',
  'border-magenta bg-magenta/15',
]
const themeTextColors = ['text-neon', 'text-amber', 'text-magenta']

export function PuzzlePlay({ challenge }: PuzzlePlayProps) {
  const config = challenge.config as PuzzleConfig
  const terms = config.terms ?? []
  const themes = config.themes ?? []
  const scoringMode = config.scoring_mode ?? 'fixed'
  const placements = config.placements ?? []

  const maxPerThemeForMode = (i: number) =>
    scoringMode === 'placement' ? (placements[0]?.points ?? 0) : (themes[i]?.points ?? 0)

  const {
    state,
    loading,
    finalized,
    error,
    attemptPuzzle,
    finalize,
  } = useChallengeProgress({
    challengeId: challenge.id,
  })

  const [input, setInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [finalResult, setFinalResult] = useState<{ points: number; isCorrect: boolean } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const solved = state.solved ?? []
  const locked = state.locked ?? []
  const attemptsRemaining = state.attempts_remaining ?? themes.map((t) => t.max_attempts ?? 3)
  const pointsPerSolve = state.points_per_solve ?? {}

  // Game over conditions: all themes solved, or all remaining themes are locked
  const allSolved = solved.length >= themes.length
  const playableThemes = themes.map((_, i) => i).filter(
    (i) => !solved.includes(i) && !locked.includes(i),
  )
  const noneLeft = playableThemes.length === 0

  // Auto-finalize when all themes resolved (solved or locked)
  const finalizingRef = useRef(false)
  useEffect(() => {
    if (finalized || finalizingRef.current) return
    if (allSolved || noneLeft) {
      finalizingRef.current = true
      finalize().then((res) => {
        if (res && !res.error) {
          setFinalResult({ points: res.points_awarded, isCorrect: res.is_correct })
          if (allSolved) {
            toast.success('Alle thema\'s gevonden!', { description: `Eindscore: ${res.points_awarded} ptn` })
          } else {
            toast(`Geen pogingen meer — ${res.points_awarded} ptn verdiend`, { duration: 4000 })
          }
        }
      })
    }
  }, [allSolved, noneLeft, finalized, finalize])

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

    const result = await attemptPuzzle(text)
    setSubmitting(false)

    if (result.error) {
      toast.error('Insturen mislukt', { description: result.error })
      return
    }

    if (result.matched && result.index !== undefined) {
      const theme = themes[result.index]
      setFeedback({
        type: 'hit',
        index: result.index,
        name: theme?.name ?? '',
        points: result.points ?? 0,
      })
      const placeLabel = result.place ? ` (${result.place}e team)` : ''
      toast.success(`+${result.points} ptn${placeLabel}`, { description: theme?.name })
    } else if (result.already_solved) {
      setFeedback({ type: 'noop', reason: 'already_solved' })
    } else if (result.already_locked) {
      setFeedback({ type: 'noop', reason: 'already_locked' })
    } else {
      const newlyLocked = result.newly_locked ?? []
      setFeedback({ type: 'miss', newlyLocked })
      if (newlyLocked.length > 0) {
        toast.error(`${newlyLocked.length} thema${newlyLocked.length === 1 ? '' : '\'s'} gelocked`, {
          description: 'Geen pogingen meer over voor die thema\'s',
        })
      }
    }

    setTimeout(() => setFeedback(null), 1800)
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

  const totalPossible =
    scoringMode === 'placement'
      ? (placements[0]?.points ?? 0) * themes.length
      : themes.reduce((s, t) => s + (t.points || 0), 0)
  const earnedSoFar = solved.reduce((s, idx) => {
    const award = pointsPerSolve[String(idx)]
    return s + (award != null ? award : (themes[idx]?.points || 0))
  }, 0)

  // Map a term index → theme index it belongs to (or null if not assigned)
  function themeOfTerm(termIdx: number): number | null {
    for (let i = 0; i < themes.length; i++) {
      if (themes[i].term_indices?.includes(termIdx)) return i
    }
    return null
  }

  return (
    <div className="space-y-4">
      {/* Score */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-text-muted">
          {solved.length} / {themes.length} thema's
        </span>
        <span className="font-mono">
          <span className="text-neon font-bold">{earnedSoFar}</span>
          <span className="text-text-faint"> / {totalPossible} ptn</span>
        </span>
      </div>

      {/* 3 theme slots */}
      <div className="grid grid-cols-3 gap-2">
        {themes.map((theme, i) => {
          const isSolved = solved.includes(i)
          const isLocked = locked.includes(i)
          const justSolved = feedback?.type === 'hit' && feedback.index === i
          const justLocked = feedback?.type === 'miss' && feedback.newlyLocked.includes(i)
          const award = isSolved ? (pointsPerSolve[String(i)] ?? theme.points ?? 0) : null
          const remaining = attemptsRemaining[i] ?? 0
          return (
            <div
              key={i}
              className={cn(
                'rounded-lg p-2 text-center border-2 transition-all',
                isSolved
                  ? themeBorderColors[i]
                  : isLocked
                    ? 'border-surface-overlay bg-surface-overlay/30 opacity-60'
                    : 'border-surface-overlay bg-surface-raised',
                justSolved && 'ring-2 ring-lime animate-pulse',
                justLocked && 'ring-2 ring-magenta',
              )}
            >
              <p className="text-xs text-text-faint">Thema {i + 1}</p>
              {isSolved ? (
                <p className={cn('text-sm font-bold truncate', themeTextColors[i])}>{theme.name}</p>
              ) : isLocked ? (
                <p className="text-sm font-bold text-text-faint flex items-center justify-center gap-1">
                  <Lock size={12} /> dicht
                </p>
              ) : (
                <p className="text-sm font-bold text-text-muted">?</p>
              )}
              <p className={cn(
                'text-xs font-mono',
                isSolved ? themeTextColors[i] : 'text-text-faint',
              )}>
                {isSolved
                  ? `+${award} ptn`
                  : isLocked
                    ? '0 ptn'
                    : scoringMode === 'placement'
                      ? `tot ${maxPerThemeForMode(i)} ptn`
                      : `${maxPerThemeForMode(i)} ptn`}
              </p>
              {!isSolved && !isLocked && (
                <p className="text-[10px] text-text-faint mt-0.5">{remaining} pog.</p>
              )}
            </div>
          )
        })}
      </div>

      {/* 12 terms grid — color-coded once their theme is solved */}
      <div className="grid grid-cols-4 gap-1.5">
        {terms.slice(0, 12).map((term, i) => {
          const themeIdx = themeOfTerm(i)
          const themeSolved = themeIdx !== null && solved.includes(themeIdx)
          const justSolvedTerm = themeIdx !== null && feedback?.type === 'hit' && feedback.index === themeIdx
          return (
            <div
              key={i}
              className={cn(
                'px-2 py-2.5 rounded text-xs text-center border-2 truncate transition-all',
                themeSolved && themeIdx !== null
                  ? themeBorderColors[themeIdx]
                  : 'border-surface-overlay bg-surface-raised text-text-muted',
                justSolvedTerm && 'animate-pulse',
              )}
            >
              {term || '—'}
            </div>
          )
        })}
      </div>

      {/* Final result banner */}
      {(finalized || finalResult) && (
        <Card className={cn(
          'flex items-center gap-3',
          (finalResult?.isCorrect || finalized) && earnedSoFar > 0
            ? 'border border-lime/30 bg-lime/5'
            : 'border border-magenta/30 bg-magenta/5',
        )}>
          {solved.length > 0 ? (
            <CheckCircle2 size={22} className="text-lime shrink-0" />
          ) : (
            <XCircle size={22} className="text-magenta shrink-0" />
          )}
          <div className="flex-1">
            <p className="font-semibold text-sm">
              {allSolved ? 'Alle thema\'s gevonden!' : 'Challenge afgerond'}
            </p>
            <p className="text-xs text-text-muted">
              {finalResult ? `${finalResult.points} punten` : `${earnedSoFar} punten`} • {solved.length}/{themes.length} thema's
            </p>
          </div>
        </Card>
      )}

      {/* Input + finalize */}
      {!finalized && !allSolved && !noneLeft && (
        <form onSubmit={handleSubmit} className="space-y-2">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={submitting || finalized}
              placeholder="Typ een themanaam..."
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              className={cn(
                'flex-1 bg-surface-raised border-2 rounded-lg px-4 py-3 text-text placeholder:text-text-faint outline-none transition-colors',
                feedback?.type === 'miss' && 'border-magenta animate-shake',
                feedback?.type === 'hit' && 'border-lime',
                feedback?.type === 'noop' && 'border-amber',
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
              Geen match — élk nog niet opgelost thema verloor 1 poging
            </p>
          )}
          {feedback?.type === 'noop' && (
            <p className="text-xs text-amber">
              {feedback.reason === 'already_solved' ? 'Dit thema is al opgelost' : 'Dit thema is al gelocked'}
            </p>
          )}
        </form>
      )}
    </div>
  )
}
