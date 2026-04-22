import { type TextareaHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
}

export function Textarea({ label, className, id, ...props }: TextareaProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-sm text-text-muted">
          {label}
        </label>
      )}
      <textarea
        id={id}
        rows={3}
        className={cn(
          'w-full bg-surface border border-surface-overlay rounded-lg px-4 py-2.5',
          'text-text placeholder:text-text-faint resize-y',
          'outline-none transition-colors duration-150',
          'focus:border-neon focus:shadow-glow-soft',
          className,
        )}
        {...props}
      />
    </div>
  )
}
