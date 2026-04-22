import { type HTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  glow?: boolean
}

export function Card({ glow = false, className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'bg-surface-raised rounded-lg shadow-card p-4',
        glow && 'shadow-glow-neon animate-glow-pulse',
        className,
      )}
      {...props}
    />
  )
}
