import { useState } from 'react'
import { Trophy, Star, Loader2, ChevronDown, ChevronUp, CheckCircle2 } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { Card } from '../components/ui/Card'
import { useAuth } from '../providers/AuthProvider'
import { useLeaderboard } from '../hooks/useLeaderboard'
import { cn } from '../lib/utils'

const placeColors = ['text-amber', 'text-text-muted', 'text-amber/60']
const placeLabels = ['🥇', '🥈', '🥉']

interface LeaderboardViewProps {
  gameId: string | undefined
  currentTeamId?: string | undefined
}

/**
 * Reusable leaderboard renderer.
 * - Player route passes its team session.
 * - Admin can embed without a current team (just omit currentTeamId).
 */
export function LeaderboardView({ gameId, currentTeamId }: LeaderboardViewProps) {
  const { entries, loading } = useLeaderboard(gameId)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const topScore = entries[0]?.total_points ?? 0

  function toggleExpand(teamId: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(teamId)) next.delete(teamId)
      else next.add(teamId)
      return next
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={28} className="text-neon animate-spin" />
      </div>
    )
  }

  if (entries.length === 0) {
    return (
      <Card className="text-center py-10">
        <Trophy size={32} className="text-text-faint mx-auto mb-3" />
        <p className="text-text-muted font-medium">No teams yet</p>
        <p className="text-xs text-text-faint mt-1">Add teams to see them here.</p>
      </Card>
    )
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        {entries.map((entry, i) => {
          const isCurrentTeam = entry.team_id === currentTeamId
          const isFirst = i === 0
          const barWidth = topScore > 0 ? (entry.total_points / topScore) * 100 : 0
          const isOpen = expanded.has(entry.team_id)
          const canExpand = entry.solved_challenges.length > 0

          return (
            <Card
              key={entry.team_id}
              glow={isFirst && entry.total_points > 0}
              className={cn(
                'transition-all',
                isCurrentTeam && 'ring-1 ring-neon/40',
              )}
            >
              {/* Row */}
              <div className="flex items-center gap-4">
                {/* Rank */}
                <div className="w-8 text-center shrink-0">
                  {i < 3 && entry.total_points > 0 ? (
                    <span className="text-xl leading-none">{placeLabels[i]}</span>
                  ) : (
                    <span className={cn('font-display text-lg font-black', placeColors[i] ?? 'text-text-faint')}>
                      #{i + 1}
                    </span>
                  )}
                </div>

                {/* Team info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: entry.team_color }}
                    />
                    <p className={cn('font-semibold truncate', isCurrentTeam && 'text-neon')}>
                      {entry.team_name}
                      {isCurrentTeam && (
                        <span className="ml-1.5 text-xs font-normal text-text-faint">(you)</span>
                      )}
                    </p>
                    {isFirst && entry.total_points > 0 && (
                      <Trophy size={13} className="text-amber shrink-0" />
                    )}
                  </div>

                  {entry.team_members.length > 0 && (
                    <p className="text-xs text-text-faint truncate mb-1.5">
                      {entry.team_members.join(', ')}
                    </p>
                  )}

                  <div className="h-1.5 bg-surface-overlay rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${barWidth}%`,
                        backgroundColor: entry.team_color,
                        boxShadow: isCurrentTeam ? `0 0 6px ${entry.team_color}` : undefined,
                      }}
                    />
                  </div>

                  {/* Solved-count toggle */}
                  <button
                    type="button"
                    onClick={() => canExpand && toggleExpand(entry.team_id)}
                    disabled={!canExpand}
                    className={cn(
                      'mt-1 flex items-center gap-1 text-xs transition-colors',
                      canExpand
                        ? 'text-text-faint hover:text-text cursor-pointer'
                        : 'text-text-faint cursor-default',
                    )}
                  >
                    <span>
                      {entry.challenges_solved} challenge{entry.challenges_solved !== 1 ? 's' : ''} solved
                    </span>
                    {canExpand && (isOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />)}
                  </button>
                </div>

                {/* Points */}
                <div className="text-right shrink-0">
                  <div className="flex items-center gap-1 justify-end">
                    {isCurrentTeam && <Star size={11} className="text-neon" />}
                    <span className={cn(
                      'font-display font-bold text-base',
                      isFirst && entry.total_points > 0 ? 'text-neon' : 'text-text',
                    )}>
                      {entry.total_points}
                    </span>
                  </div>
                  <p className="text-xs text-text-faint">pts</p>
                </div>
              </div>

              {/* Expanded solved-challenges list */}
              {isOpen && entry.solved_challenges.length > 0 && (
                <div className="mt-3 pt-3 border-t border-surface-overlay space-y-1">
                  {entry.solved_challenges.map((c) => (
                    <div
                      key={c.challenge_id}
                      className="flex items-center gap-2 text-xs"
                    >
                      <CheckCircle2 size={12} className="text-lime shrink-0" />
                      <span className="flex-1 truncate text-text">{c.title}</span>
                      <span className="font-mono text-text-muted shrink-0">+{c.points} pt</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )
        })}
      </div>

      {/* Realtime indicator */}
      <div className="flex items-center justify-center gap-1.5 mt-6">
        <span className="w-1.5 h-1.5 rounded-full bg-lime animate-pulse" />
        <span className="text-xs text-text-faint">Updates live</span>
      </div>
    </>
  )
}

// ── Player route wrapper ──
export function Leaderboard() {
  const { teamSession } = useAuth()

  return (
    <div className="animate-fade-in">
      <PageHeader title="Leaderboard" subtitle="Live team rankings" />
      <LeaderboardView gameId={teamSession?.game.id} currentTeamId={teamSession?.team.id} />
    </div>
  )
}
