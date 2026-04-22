import { useEffect, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '../../lib/utils'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  className?: string
}

export function Modal({ open, onClose, title, children, className }: ModalProps) {
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn(
          'relative bg-surface-raised rounded-xl shadow-card border border-surface-overlay',
          'w-full max-w-md max-h-[85dvh] overflow-y-auto animate-slide-up',
          className,
        )}
      >
        <div className="flex items-center justify-between p-4 border-b border-surface-overlay">
          <h2 className="font-display text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}
