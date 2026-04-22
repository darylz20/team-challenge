import { type ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-neon text-void font-semibold shadow-glow-neon hover:bg-neon-dim',
  secondary:
    'border border-neon text-neon hover:bg-neon/10',
  danger:
    'bg-magenta text-white font-semibold shadow-glow-magenta hover:bg-magenta-dim',
  ghost:
    'text-text-muted hover:text-text hover:bg-surface-overlay',
}

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm rounded-md',
  md: 'px-5 py-2.5 text-sm rounded-lg',
  lg: 'px-6 py-3 text-base rounded-lg',
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center font-medium transition-all duration-150',
        'active:scale-95 disabled:opacity-50 disabled:pointer-events-none',
        variantStyles[variant],
        sizeStyles[size],
        className,
      )}
      disabled={disabled}
      {...props}
    />
  )
}
