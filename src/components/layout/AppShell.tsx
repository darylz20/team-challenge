import { type ReactNode } from 'react'
import { MobileNav } from './MobileNav'
import { useAuth } from '../../providers/AuthProvider'
import { useSubmissionNotifications } from '../../hooks/useSubmissionNotifications'

interface AppShellProps {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const { teamSession } = useAuth()
  useSubmissionNotifications(teamSession?.game.id, teamSession?.team.id)

  return (
    <div className="min-h-dvh bg-abyss flex flex-col">
      <main className="flex-1 pb-20 px-4 pt-4 max-w-lg mx-auto w-full">
        {children}
      </main>
      <MobileNav />
    </div>
  )
}
