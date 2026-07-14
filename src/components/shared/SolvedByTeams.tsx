import { Users } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { ChallengeSolver } from '../../hooks/useSubmissions'

/**
 * A light competitive nudge: shows the rival teams that have already solved
 * this challenge, oldest solve first (so the frontrunners lead). Renders
 * nothing when no other team has solved yet.
 */
export function SolvedByTeams({
  solvers,
  max = 6,
  className,
}: {
  solvers: ChallengeSolver[]
  max?: number
  className?: string
}) {
  if (solvers.length === 0) return null
  const shown = solvers.slice(0, max)
  const extra = solvers.length - shown.length

  return (
    <div
      className={cn(
        'flex items-center gap-x-2 gap-y-1 flex-wrap rounded-lg bg-surface-raised border border-surface-overlay px-3 py-2',
        className,
      )}
    >
      <span className="inline-flex items-center gap-1.5 text-xs text-text-muted">
        <Users size={13} className="text-amber" />
        Al opgelost door
      </span>
      {shown.map((t) => (
        <span
          key={t.team_id}
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface-overlay text-xs text-text"
        >
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: t.team_color }} />
          {t.team_name}
        </span>
      ))}
      {extra > 0 && <span className="text-xs text-text-faint">+{extra}</span>}
    </div>
  )
}
