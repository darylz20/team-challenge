import { type HTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

type BadgeVariant = 'neon' | 'magenta' | 'lime' | 'amber' | 'muted'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
}

const variantStyles: Record<BadgeVariant, string> = {
  neon: 'bg-neon/15 text-neon border-neon/30',
  magenta: 'bg-magenta/15 text-magenta border-magenta/30',
  lime: 'bg-lime/15 text-lime border-lime/30',
  amber: 'bg-amber/15 text-amber border-amber/30',
  muted: 'bg-surface-overlay text-text-muted border-surface-overlay',
}

export function Badge({ variant = 'neon', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border',
        variantStyles[variant],
        className,
      )}
      {...props}
    />
  )
}
