import { Trophy, Star, Loader2 } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { Card } from '../components/ui/Card'
import { useAuth } from '../providers/AuthProvider'
import { useLeaderboard } from '../hooks/useLeaderboard'
import { cn } from '../lib/utils'

const placeColors = ['text-amber', 'text-text-muted', 'text-amber/60']
const placeLabels = ['🥇', '🥈', '🥉']

export function Leaderboard() {
  const { teamSession } = useAuth()
  const { entries, loading } = useLeaderboard(teamSession?.game.id)

  const topScore = entries[0]?.total_points ?? 0

  return (
    <div className="animate-fade-in">
      <PageHeader title="Leaderboard" subtitle="Live team rankings" />

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="text-neon animate-spin" />
        </div>
      ) : entries.length === 0 ? (
        <Card className="text-center py-10">
          <Trophy size={32} className="text-text-faint mx-auto mb-3" />
          <p className="text-text-muted font-medium">No scores yet</p>
          <p className="text-xs text-text-faint mt-1">Be the first to complete a challenge!</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {entries.map((entry, i) => {
            const isCurrentTeam = entry.team_id === teamSession?.team.id
            const isFirst = i === 0
            const barWidth = topScore > 0 ? (entry.total_points / topScore) * 100 : 0

            return (
              <Card
                key={entry.team_id}
                glow={isFirst && entry.total_points > 0}
                className={cn(
                  'flex items-center gap-4 transition-all',
                  isCurrentTeam && 'ring-1 ring-neon/40',
                )}
              >
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
                    {/* Color dot */}
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

                  {/* Score bar */}
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

                  {/* Challenges solved */}
                  <p className="text-xs text-text-faint mt-1">
                    {entry.challenges_solved} challenge{entry.challenges_solved !== 1 ? 's' : ''} solved
                  </p>
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
              </Card>
            )
          })}
        </div>
      )}

      {/* Realtime indicator */}
      <div className="flex items-center justify-center gap-1.5 mt-6">
        <span className="w-1.5 h-1.5 rounded-full bg-lime animate-pulse" />
        <span className="text-xs text-text-faint">Updates live</span>
      </div>
    </div>
  )
}
