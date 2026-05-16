import { Clock } from 'lucide-react'
import { cn } from '../../lib/utils'

interface CountdownTimerProps {
  secondsRemaining: number | null
  totalSeconds: number | null | undefined
}

/**
 * Visual countdown bar + numeric display.
 * - Green for >50% remaining
 * - Amber for <50%
 * - Red & pulsing for <10s
 * Returns nothing if no time limit is set.
 */
export function CountdownTimer({ secondsRemaining, totalSeconds }: CountdownTimerProps) {
  if (secondsRemaining == null || !totalSeconds) return null

  const pct = Math.max(0, Math.min(100, (secondsRemaining / totalSeconds) * 100))
  const danger = secondsRemaining <= 10
  const warning = !danger && secondsRemaining <= totalSeconds / 2

  const mins = Math.floor(secondsRemaining / 60)
  const secs = secondsRemaining % 60
  const display = mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `${secs}s`

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className={cn(
          'flex items-center gap-1.5 font-mono text-sm tabular-nums',
          danger && 'text-magenta animate-pulse',
          warning && 'text-amber',
          !danger && !warning && 'text-lime',
        )}>
          <Clock size={14} />
          {display}
        </div>
        <span className="text-xs text-text-faint">
          van {totalSeconds}s
        </span>
      </div>
      <div className="h-1.5 bg-surface-overlay rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all duration-300',
            danger ? 'bg-magenta' : warning ? 'bg-amber' : 'bg-lime',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
