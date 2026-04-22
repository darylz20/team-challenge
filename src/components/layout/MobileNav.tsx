import { NavLink } from 'react-router-dom'
import { Home, Trophy } from 'lucide-react'
import { cn } from '../../lib/utils'

const navItems = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/leaderboard', icon: Trophy, label: 'Leaderboard' },
]

export function MobileNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-surface/80 backdrop-blur-lg border-t border-surface-overlay">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center gap-1 px-3 py-2 text-xs transition-colors',
                isActive
                  ? 'text-neon'
                  : 'text-text-faint hover:text-text-muted',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={20} strokeWidth={isActive ? 2.5 : 1.5} />
                <span className="font-medium">{label}</span>
                {isActive && (
                  <span className="absolute bottom-1 w-1 h-1 rounded-full bg-neon shadow-glow-neon" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
