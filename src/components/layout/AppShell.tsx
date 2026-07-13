import { type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { MobileNav } from './MobileNav'
import { ThemeToggle } from '../ui/ThemeToggle'
import { useAuth } from '../../providers/AuthProvider'
import { useSubmissionNotifications } from '../../hooks/useSubmissionNotifications'
import { useSessionEnforcement } from '../../hooks/useSessionEnforcement'
import { useGameIntro } from '../../hooks/useGameIntro'

interface AppShellProps {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const { teamSession } = useAuth()
  const location = useLocation()
  useSubmissionNotifications(teamSession?.game.id, teamSession?.team.id)
  useSessionEnforcement()

  const { required: introRequired, loading: introLoading } = useGameIntro()

  // Gate: force team through /intro before any other player page if required.
  // Don't redirect while loading (avoids flash) and don't redirect when
  // already on the intro page itself.
  const onIntroPage = location.pathname === '/intro'
  const shouldRedirectToIntro = introRequired && !introLoading && !onIntroPage

  return (
    <div className="min-h-dvh bg-abyss flex flex-col">
      {!onIntroPage && (
        <header className="max-w-lg mx-auto w-full px-4 flex items-center justify-end h-12 shrink-0">
          <ThemeToggle />
        </header>
      )}
      <main className="flex-1 pb-20 px-4 pt-1 max-w-lg mx-auto w-full">
        {shouldRedirectToIntro ? <Navigate to="/intro" replace /> : children}
      </main>
      {!onIntroPage && <MobileNav />}
    </div>
  )
}
