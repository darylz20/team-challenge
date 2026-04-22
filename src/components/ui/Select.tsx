import { type SelectHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

interface SelectOption {
  value: string
  label: string
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  options: SelectOption[]
}

export function Select({ label, options, className, id, ...props }: SelectProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className="text-sm text-text-muted">
          {label}
        </label>
      )}
      <select
        id={id}
        className={cn(
          'w-full bg-surface border border-surface-overlay rounded-lg px-4 py-2.5',
          'text-text outline-none transition-colors duration-150',
          'focus:border-neon focus:shadow-glow-soft',
          'appearance-none cursor-pointer',
          className,
        )}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}
