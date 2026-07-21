import { useState } from 'react'
import { Sun, Moon } from 'lucide-react'
import { cn } from '../../lib/utils'

const THEME_KEY = 'tc_theme'

function isLightActive() {
  if (typeof document === 'undefined') return false
  return document.documentElement.classList.contains('light')
}

/**
 * Toggles between the default dark theme and a light theme by flipping a
 * `light` class on <html>. The initial theme is applied by an inline script
 * in index.html (before paint), so this only needs to react to clicks.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const [light, setLight] = useState(isLightActive)

  function toggle() {
    const next = !light
    setLight(next)
    document.documentElement.classList.toggle('light', next)
    try {
      localStorage.setItem(THEME_KEY, next ? 'light' : 'dark')
    } catch {
      /* ignore storage errors (private mode etc.) */
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={light ? 'Schakel naar donkere modus' : 'Schakel naar lichte modus'}
      title={light ? 'Donkere modus' : 'Lichte modus'}
      className={cn(
        'p-2 rounded-lg text-text-muted hover:text-neon-ink hover:bg-surface-overlay/50 transition-colors',
        className,
      )}
    >
      {light ? <Moon size={18} /> : <Sun size={18} />}
    </button>
  )
}
