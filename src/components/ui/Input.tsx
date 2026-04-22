import { type InputHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
}

export function Input({ label, className, id, ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-sm text-text-muted">
          {label}
        </label>
      )}
      <input
        id={id}
        className={cn(
          'w-full bg-surface border border-surface-overlay rounded-lg px-4 py-2.5',
          'text-text placeholder:text-text-faint',
          'outline-none transition-colors duration-150',
          'focus:border-neon focus:shadow-glow-soft',
          className,
        )}
        {...props}
      />
    </div>
  )
}
