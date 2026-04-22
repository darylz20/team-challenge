import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Gamepad2, LogOut, X } from 'lucide-react'
import { useAuth } from '../../providers/AuthProvider'
import { cn } from '../../lib/utils'

const navItems = [
  { to: '/admin', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/admin/games', icon: Gamepad2, label: 'Games' },
]

interface AdminNavProps {
  open: boolean
  onClose: () => void
}

export function AdminNav({ open, onClose }: AdminNavProps) {
  const { profile, signOut } = useAuth()

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          'fixed top-0 left-0 z-50 h-dvh w-60 bg-surface border-r border-surface-overlay',
          'flex flex-col transition-transform duration-200',
          'lg:translate-x-0 lg:static lg:z-auto',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-surface-overlay">
          <h1 className="font-display text-sm font-bold text-neon tracking-wider">
            TC ADMIN
          </h1>
          <button onClick={onClose} className="lg:hidden text-text-muted hover:text-text">
            <X size={20} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onClose}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-neon/10 text-neon'
                    : 'text-text-muted hover:text-text hover:bg-surface-overlay',
                )
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div className="p-3 border-t border-surface-overlay">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-surface-overlay flex items-center justify-center text-xs font-bold text-neon">
              {profile?.display_name?.charAt(0).toUpperCase() ?? 'A'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{profile?.display_name}</p>
              <p className="text-xs text-text-faint">Admin</p>
            </div>
          </div>
          <button
            onClick={signOut}
            className="flex items-center gap-3 px-3 py-2 w-full rounded-lg text-sm text-text-muted hover:text-text hover:bg-surface-overlay transition-colors"
          >
            <LogOut size={16} />
            Sign Out
          </button>
        </div>
      </aside>
    </>
  )
}
