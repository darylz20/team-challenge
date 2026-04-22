import { type LucideIcon } from 'lucide-react'
import { Button } from './Button'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
}

export function EmptyState({ icon: Icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="w-14 h-14 rounded-full bg-surface-overlay flex items-center justify-center mb-4">
        <Icon size={24} className="text-text-faint" />
      </div>
      <h3 className="font-semibold text-text mb-1">{title}</h3>
      <p className="text-sm text-text-muted max-w-xs">{description}</p>
      {actionLabel && onAction && (
        <Button onClick={onAction} size="sm" className="mt-4">
          {actionLabel}
        </Button>
      )}
    </div>
  )
}
