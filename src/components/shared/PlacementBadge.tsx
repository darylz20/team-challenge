import { Zap } from 'lucide-react'
import { cn } from '../../lib/utils'

/**
 * Marks a challenge as placement-based (points depend on how fast you are
 * relative to other teams). The lightning icon signals "be quick!". Shown
 * icon-only in tight lists, with a label where there's room.
 */
export function PlacementBadge({
  showLabel = false,
  className,
}: {
  showLabel?: boolean
  className?: string
}) {
  const title = 'Snelheidsronde — wie het eerst antwoordt, scoort de meeste punten. Wees snel!'

  if (!showLabel) {
    return (
      <span
        title={title}
        aria-label={title}
        className={cn(
          'inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber/15 text-amber border border-amber/30 shrink-0',
          className,
        )}
      >
        <Zap size={12} className="fill-current" />
      </span>
    )
  }

  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber/15 text-amber border border-amber/30',
        className,
      )}
    >
      <Zap size={12} className="fill-current" />
      Snelheidsronde
    </span>
  )
}
