import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Loader2, Trophy, Users, Activity, Plus, Minus, Check, RotateCw,
  AlertTriangle, CheckCircle2, Power, Camera,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Modal } from '../../components/ui/Modal'
import { useGame } from '../../hooks/useGames'
import { useLiveMonitor, type TeamLiveState } from '../../hooks/useLiveMonitor'
import { usePhotoReviews, type PhotoReview } from '../../hooks/useSubmissions'
import { AdjustPointsModal } from '../../components/admin/live/AdjustPointsModal'
import { ManualCompleteModal } from '../../components/admin/live/ManualCompleteModal'
import { ResetChallengeModal } from '../../components/admin/live/ResetChallengeModal'
import { ReviewPhotoModal } from '../../components/admin/live/ReviewPhotoModal'
import { supabase } from '../../lib/supabase'
import { cn } from '../../lib/utils'

export function LiveMonitor() {
  const { id: gameId } = useParams()
  const navigate = useNavigate()
  const { game, refetch: refetchGame } = useGame(gameId)
  const { states, allChallenges, loading, lastUpdate } = useLiveMonitor(gameId)
  const { reviews: photoReviews, pendingCount, refetch: refetchPhotos } = usePhotoReviews(gameId)

  // Modals
  const [reviewTarget, setReviewTarget] = useState<PhotoReview | null>(null)
  const [adjustTarget, setAdjustTarget] = useState<TeamLiveState | null>(null)
  const [completeTarget, setCompleteTarget] = useState<TeamLiveState | null>(null)
  const [resetTarget, setResetTarget] = useState<TeamLiveState | null>(null)
  const [endingGame, setEndingGame] = useState(false)
  const [endConfirmOpen, setEndConfirmOpen] = useState(false)

  // Sum across all teams for the header stat
  const totals = useMemo(() => {
    let completed = 0
    for (const s of states) completed += s.challenges_solved
    return { completed, total: allChallenges.length * states.length }
  }, [states, allChallenges])

  async function handleEndGame() {
    if (!gameId) return
    setEndingGame(true)
    const { data, error } = await supabase.rpc('admin_end_game', { p_game_id: gameId })
    setEndingGame(false)
    setEndConfirmOpen(false)
    if (error || data?.error) {
      toast.error('End game failed', { description: error?.message ?? data?.error })
      return
    }
    toast.success(`Game beëindigd`, {
      description: `${data?.finalized ?? 0} in-progress challenges gefinaliseerd`,
    })
    refetchGame()
  }

  if (!game && !loading) {
    return (
      <div className="py-20 text-center">
        <p className="text-text-muted">Game not found</p>
        <Button variant="ghost" className="mt-4" onClick={() => navigate('/admin/games')}>Back to games</Button>
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <button
        onClick={() => navigate(`/admin/games/${gameId}`)}
        className="flex items-center gap-1 text-sm text-text-muted hover:text-neon transition-colors mb-4"
      >
        <ArrowLeft size={16} /> Back to Game Editor
      </button>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="font-display text-2xl font-black text-text">Live Monitor</h1>
            {game && (
              <Badge
                variant={
                  game.status === 'active' ? 'lime' :
                  game.status === 'published' ? 'neon' :
                  game.status === 'finished' ? 'amber' : 'muted'
                }
              >
                {game.status}
              </Badge>
            )}
          </div>
          {game && (
            <p className="text-sm text-text-muted">
              {game.title} · <span className="font-mono">{game.code}</span>
            </p>
          )}
        </div>
        {game?.status !== 'finished' && (
          <Button
            variant="ghost"
            onClick={() => setEndConfirmOpen(true)}
            disabled={endingGame}
            className="shrink-0 gap-2 text-magenta hover:bg-magenta/10"
          >
            <Power size={16} /> End game now
          </Button>
        )}
      </div>

      {/* Top stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <Card className="text-center">
          <Users size={16} className="text-neon mx-auto mb-1" />
          <p className="font-display text-xl font-bold">{states.length}</p>
          <p className="text-[10px] text-text-faint uppercase tracking-wider">Teams</p>
        </Card>
        <Card className="text-center">
          <Trophy size={16} className="text-amber mx-auto mb-1" />
          <p className="font-display text-xl font-bold">{allChallenges.length}</p>
          <p className="text-[10px] text-text-faint uppercase tracking-wider">Challenges</p>
        </Card>
        <Card className="text-center">
          <CheckCircle2 size={16} className="text-lime mx-auto mb-1" />
          <p className="font-display text-xl font-bold">{totals.completed}</p>
          <p className="text-[10px] text-text-faint uppercase tracking-wider">Total solves</p>
        </Card>
      </div>

      {/* Photo review queue — only rendered when the game has photo challenges */}
      {photoReviews.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2 px-1">
            <Camera size={16} className="text-neon" />
            <h2 className="font-display text-sm font-bold uppercase tracking-wider text-text">
              Foto's beoordelen
            </h2>
            {pendingCount > 0 ? (
              <Badge variant="amber">{pendingCount} wacht{pendingCount !== 1 ? 'en' : ''}</Badge>
            ) : (
              <Badge variant="muted">alles beoordeeld</Badge>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {photoReviews.map((r) => (
              <button
                key={r.submission_id}
                type="button"
                onClick={() => setReviewTarget(r)}
                className={cn(
                  'group text-left rounded-lg overflow-hidden border-2 transition-all',
                  r.reviewed
                    ? 'border-surface-overlay opacity-70 hover:opacity-100'
                    : 'border-amber/50 hover:border-amber shadow-glow-soft',
                )}
              >
                <img
                  src={r.photo_url}
                  alt={`Inzending van ${r.team_name}`}
                  loading="lazy"
                  className="w-full h-28 object-cover bg-void"
                />
                <div className="p-2 bg-surface-raised">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: r.team_color }}
                    />
                    <span className="text-xs font-medium text-text truncate">{r.team_name}</span>
                  </div>
                  <p className="text-[10px] text-text-muted truncate mt-0.5">{r.challenge_title}</p>
                  <p className="text-[10px] mt-1">
                    {r.reviewed ? (
                      <span className={r.points_awarded > 0 ? 'text-lime' : 'text-text-faint'}>
                        {r.points_awarded} pt toegekend
                      </span>
                    ) : (
                      <span className="text-amber">Wacht op beoordeling</span>
                    )}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="text-neon animate-spin" />
        </div>
      ) : states.length === 0 ? (
        <Card className="text-center py-10">
          <Users size={32} className="text-text-faint mx-auto mb-3" />
          <p className="text-text-muted">No teams yet</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {states.map((s) => (
            <TeamPanel
              key={s.team.id}
              state={s}
              onAdjust={() => setAdjustTarget(s)}
              onComplete={() => setCompleteTarget(s)}
              onReset={() => setResetTarget(s)}
            />
          ))}
        </div>
      )}

      {/* Realtime indicator */}
      <div className="flex items-center justify-center gap-1.5 mt-6">
        <span className="w-1.5 h-1.5 rounded-full bg-lime animate-pulse" />
        <span className="text-xs text-text-faint">
          Updates live{lastUpdate && ` · last ${lastUpdate.toLocaleTimeString('nl-NL')}`}
        </span>
      </div>

      {/* End-game confirm */}
      <Modal open={endConfirmOpen} onClose={() => !endingGame && setEndConfirmOpen(false)} title="End game now?">
        <div className="space-y-4">
          <div className="flex items-start gap-2 p-3 rounded-lg bg-magenta/5 border border-magenta/30">
            <AlertTriangle size={16} className="text-magenta shrink-0 mt-0.5" />
            <div className="text-sm space-y-1">
              <p className="text-magenta font-medium">Dit kan niet ongedaan worden gemaakt.</p>
              <p className="text-text-muted">
                Alle in-progress challenges worden gefinaliseerd op de huidige state. De game status
                wordt 'finished' en teams kunnen geen challenges meer doen.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleEndGame} disabled={endingGame} className="flex-1">
              {endingGame ? <Loader2 size={16} className="animate-spin" /> : 'Ja, beëindig game'}
            </Button>
            <Button variant="ghost" onClick={() => setEndConfirmOpen(false)} disabled={endingGame}>
              Annuleren
            </Button>
          </div>
        </div>
      </Modal>

      {/* Photo review */}
      <ReviewPhotoModal
        review={reviewTarget}
        onClose={() => setReviewTarget(null)}
        onDone={refetchPhotos}
      />

      {/* Per-team action modals */}
      {adjustTarget && gameId && (
        <AdjustPointsModal
          open={!!adjustTarget}
          onClose={() => setAdjustTarget(null)}
          teamId={adjustTarget.team.id}
          teamName={adjustTarget.team.name}
          gameId={gameId}
        />
      )}
      {completeTarget && gameId && (
        <ManualCompleteModal
          open={!!completeTarget}
          onClose={() => setCompleteTarget(null)}
          teamId={completeTarget.team.id}
          teamName={completeTarget.team.name}
          gameId={gameId}
          allChallenges={allChallenges}
          completedChallengeIds={new Set(completeTarget.completed.map((c) => c.challenge_id))}
        />
      )}
      {resetTarget && (
        <ResetChallengeModal
          open={!!resetTarget}
          onClose={() => setResetTarget(null)}
          teamId={resetTarget.team.id}
          teamName={resetTarget.team.name}
          completed={resetTarget.completed}
          active={resetTarget.active}
        />
      )}
    </div>
  )
}

// ── Per-team panel ──

function TeamPanel({
  state,
  onAdjust,
  onComplete,
  onReset,
}: {
  state: TeamLiveState
  onAdjust: () => void
  onComplete: () => void
  onReset: () => void
}) {
  const [showCompleted, setShowCompleted] = useState(false)
  const { team, rank, total_points, challenges_solved, active, completed } = state

  return (
    <Card className="space-y-3">
      {/* Top row */}
      <div className="flex items-center gap-3">
        <div className="w-8 text-center shrink-0">
          <span className="font-display text-lg font-black text-text-muted">#{rank}</span>
        </div>
        <span
          className="w-3 h-3 rounded-full shrink-0"
          style={{ backgroundColor: team.color }}
        />
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">{team.name}</p>
          {team.member_names?.length > 0 && (
            <p className="text-xs text-text-faint truncate">{team.member_names.join(', ')}</p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="font-display font-bold text-base">{total_points}</p>
          <p className="text-xs text-text-faint">pts</p>
        </div>
      </div>

      {/* Current activity */}
      <div className={cn(
        'rounded-lg p-3 border-2',
        active
          ? 'border-neon/40 bg-neon/5'
          : 'border-surface-overlay bg-surface-overlay/30',
      )}>
        {active ? (
          <ActiveBlock active={active} />
        ) : (
          <div className="flex items-center gap-2 text-text-muted">
            <Activity size={14} className="text-text-faint" />
            <span className="text-sm">Niet actief</span>
          </div>
        )}
      </div>

      {/* Completed list (collapsible) */}
      <div>
        <button
          type="button"
          onClick={() => setShowCompleted((v) => !v)}
          disabled={completed.length === 0}
          className={cn(
            'text-xs',
            completed.length > 0
              ? 'text-text-muted hover:text-text cursor-pointer'
              : 'text-text-faint cursor-default',
          )}
        >
          {challenges_solved} challenge{challenges_solved !== 1 ? 's' : ''} opgelost
          {completed.length > 0 && (showCompleted ? ' ▲' : ' ▼')}
        </button>
        {showCompleted && completed.length > 0 && (
          <div className="mt-2 space-y-1">
            {completed.map((c) => (
              <div key={c.challenge_id} className="flex items-center gap-2 text-xs">
                <CheckCircle2 size={11} className="text-lime shrink-0" />
                <span className="flex-1 truncate text-text">{c.challenge_title}</span>
                <span className="font-mono text-text-muted shrink-0">+{c.points}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Admin actions */}
      <div className="flex flex-wrap gap-2 pt-2 border-t border-surface-overlay">
        <button
          type="button"
          onClick={onAdjust}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-surface-overlay text-text hover:bg-surface-overlay/80 transition-colors"
        >
          <Plus size={12} /><Minus size={12} className="-ml-1.5" /> Points
        </button>
        <button
          type="button"
          onClick={onComplete}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-lime/10 text-lime hover:bg-lime/20 transition-colors"
        >
          <Check size={12} /> Manual complete
        </button>
        <button
          type="button"
          onClick={onReset}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-amber/10 text-amber hover:bg-amber/20 transition-colors"
        >
          <RotateCw size={12} /> Reset
        </button>
      </div>
    </Card>
  )
}

// ── Active progress block ──

function ActiveBlock({ active }: { active: import('../../hooks/useLiveMonitor').ActiveProgress }) {
  const progressLabel = summariseProgress(active)

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 min-w-0">
        <Activity size={14} className="text-neon shrink-0" />
        <p className="text-sm font-medium text-text truncate flex-1">{active.challenge_title}</p>
        <span className="text-[10px] font-mono uppercase text-text-faint shrink-0">{active.challenge_type.replace('_', ' ')}</span>
      </div>

      {progressLabel && (
        <p className="text-xs text-text-muted">{progressLabel}</p>
      )}
    </div>
  )
}

function summariseProgress(active: import('../../hooks/useLiveMonitor').ActiveProgress): string | null {
  const s = active.state ?? {}
  switch (active.challenge_type) {
    case 'open_door': {
      const found = (s.found as number[] | undefined)?.length ?? 0
      return `${found}/4 deuren open`
    }
    case 'puzzle': {
      const solved = (s.solved as number[] | undefined)?.length ?? 0
      const locked = (s.locked as number[] | undefined)?.length ?? 0
      return `${solved}/3 thema's opgelost${locked > 0 ? `, ${locked} gelocked` : ''}`
    }
    case 'gallery': {
      const found = (s.found as number[] | undefined)?.length ?? 0
      const used = (s.attempts_used as number | undefined) ?? 0
      return `${found} gevonden${used > 0 ? `, ${used} foute pogingen` : ''}`
    }
    case 'collective_memory': {
      const found = (s.found as number[] | undefined)?.length ?? 0
      const used = (s.attempts_used as number | undefined) ?? 0
      return `${found}/5 trefwoorden${used > 0 ? `, ${used} foute pogingen` : ''}`
    }
    default:
      return null
  }
}
