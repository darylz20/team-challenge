import { cn } from '../../lib/utils'

interface PageHeaderProps {
  title: string
  subtitle?: string
  className?: string
}

export function PageHeader({ title, subtitle, className }: PageHeaderProps) {
  return (
    <div className={cn('mb-6', className)}>
      <h1 className="font-display text-2xl font-bold text-neon">{title}</h1>
      {subtitle && (
        <p className="mt-1 text-sm text-text-muted">{subtitle}</p>
      )}
    </div>
  )
}
