import { useState, type ReactNode } from 'react'
import { Menu } from 'lucide-react'
import { AdminNav } from './AdminNav'
import { ThemeToggle } from '../ui/ThemeToggle'

interface AdminShellProps {
  children: ReactNode
}

export function AdminShell({ children }: AdminShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-dvh bg-abyss flex">
      <AdminNav open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="flex items-center gap-3 px-4 h-14 bg-surface border-b border-surface-overlay">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden text-text-muted hover:text-text"
          >
            <Menu size={22} />
          </button>
          <h1 className="lg:hidden font-display text-sm font-bold text-neon tracking-wider">
            TC ADMIN
          </h1>
          <ThemeToggle className="ml-auto" />
        </header>

        {/* Content */}
        <main className="flex-1 p-4 lg:p-8 max-w-5xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
