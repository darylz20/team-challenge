import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Play, Loader2 } from 'lucide-react'
import { useGameIntro } from '../hooks/useGameIntro'
import { useAuth } from '../providers/AuthProvider'
import { Button } from '../components/ui/Button'
import { cn } from '../lib/utils'

export function Intro() {
  const navigate = useNavigate()
  const { teamSession } = useAuth()
  const { introPages, loading, required, acknowledge } = useGameIntro()
  const [pageIdx, setPageIdx] = useState(0)
  const [acking, setAcking] = useState(false)

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 size={24} className="text-neon animate-spin" />
      </div>
    )
  }

  // No intro needed → bounce home. Handles direct navigation to /intro
  // when there is nothing to show (admin removed pages, team already ack'd, etc.)
  if (!required) {
    return <Navigate to="/" replace />
  }

  const page = introPages[pageIdx]
  const isLast = pageIdx === introPages.length - 1
  const isFirst = pageIdx === 0

  async function handleStart() {
    setAcking(true)
    const res = await acknowledge()
    setAcking(false)
    if (!res.error) {
      navigate('/', { replace: true })
    }
  }

  return (
    <div className="animate-fade-in pb-20">
      {/* Header */}
      <div className="py-4 text-center">
        <p className="text-xs text-text-faint uppercase tracking-wider">Welkom</p>
        <h1 className="font-display text-lg font-bold text-text">
          {teamSession?.game.title ?? 'Game'}
        </h1>
      </div>

      {/* Media */}
      {page?.media?.url && (
        <div className="mb-4 rounded-xl overflow-hidden border border-surface-overlay">
          {page.media.type === 'video' ? (
            <video
              src={page.media.url}
              controls
              playsInline
              className="w-full max-h-[50vh] object-contain bg-void"
            />
          ) : (
            <img
              src={page.media.url}
              alt=""
              className="w-full max-h-[50vh] object-contain bg-void"
            />
          )}
        </div>
      )}

      {/* Text */}
      <div className="bg-surface-raised border border-surface-overlay rounded-xl p-5 min-h-[140px]">
        <p className="text-text leading-relaxed whitespace-pre-wrap">
          {page?.text || <span className="text-text-faint italic">Geen tekst</span>}
        </p>
      </div>

      {/* Dot indicator */}
      <div className="flex justify-center gap-1.5 my-5">
        {introPages.map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setPageIdx(i)}
            className={cn(
              'h-1.5 rounded-full transition-all',
              i === pageIdx ? 'w-6 bg-neon' : 'w-1.5 bg-surface-overlay hover:bg-text-faint',
            )}
            aria-label={`Pagina ${i + 1}`}
          />
        ))}
      </div>

      {/* Navigation */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setPageIdx((i) => Math.max(0, i - 1))}
          disabled={isFirst}
          className={cn(
            'p-3 rounded-lg border-2 transition-colors',
            isFirst
              ? 'border-surface-overlay text-text-faint cursor-not-allowed opacity-40'
              : 'border-surface-overlay text-text-muted hover:text-text hover:border-text-faint',
          )}
          aria-label="Vorige"
        >
          <ChevronLeft size={18} />
        </button>

        {isLast ? (
          <Button
            className="flex-1 gap-2"
            size="lg"
            onClick={handleStart}
            disabled={acking}
          >
            {acking ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
            Start het spel
          </Button>
        ) : (
          <button
            type="button"
            onClick={() => setPageIdx((i) => Math.min(introPages.length - 1, i + 1))}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg bg-neon/10 border-2 border-neon/40 text-neon font-medium hover:bg-neon/20 transition-colors"
          >
            Volgende
            <ChevronRight size={18} />
          </button>
        )}
      </div>

      <p className="text-center text-xs text-text-faint mt-4">
        Pagina {pageIdx + 1} van {introPages.length}
      </p>
    </div>
  )
}
