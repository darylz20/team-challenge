import { useNavigate } from 'react-router-dom'
import { LogOut, ChevronRight, CheckCircle2, Lock } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { useAuth } from '../providers/AuthProvider'
import { useChallenges } from '../hooks/useChallenges'
import { useTeamSubmissions } from '../hooks/useSubmissions'
import { useSections } from '../hooks/useSections'
import { cn } from '../lib/utils'

export function Home() {
  const navigate = useNavigate()
  const { teamSession, signOut } = useAuth()
  const { challenges, loading } = useChallenges(teamSession?.game.id)
  const { submissions } = useTeamSubmissions(teamSession?.team.id, teamSession?.game.id)
  const { sections } = useSections(teamSession?.game.id)

  // Map of challenge_id → submission for quick lookup
  const submissionMap = new Map(submissions.map((s) => [s.challenge_id, s]))

  if (!teamSession) return null

  // Group challenges by section, keep challenges sort_order within each
  const bySection = new Map<string, typeof challenges>()
  for (const c of challenges) {
    const list = bySection.get(c.section_id) ?? []
    list.push(c)
    bySection.set(c.section_id, list)
  }

  return (
    <div className="animate-fade-in">
      {/* Team header */}
      <div className="flex items-center justify-between py-4">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-void"
            style={{ backgroundColor: teamSession.team.color }}
          >
            {teamSession.team.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-display text-sm font-bold tracking-wider text-text">
              {teamSession.team.name}
            </p>
            <p className="text-xs text-text-muted">{teamSession.game.title}</p>
          </div>
        </div>
        <button
          onClick={signOut}
          className="p-2 text-text-faint hover:text-text-muted transition-colors"
          title="Sign out"
        >
          <LogOut size={18} />
        </button>
      </div>

      {/* Game title */}
      <div className="mb-6">
        <h1 className="font-display text-2xl font-black text-neon tracking-wider">
          {teamSession.game.title}
        </h1>
        <p className="text-sm text-text-muted mt-1">
          {submissions.length}/{challenges.length} completed
        </p>
      </div>

      {/* Sections + challenges */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-neon border-t-transparent rounded-full animate-spin" />
        </div>
      ) : challenges.length === 0 ? (
        <Card className="text-center py-8">
          <p className="text-text-muted">No challenges available yet.</p>
          <p className="text-xs text-text-faint mt-1">Check back when the game starts!</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          {sections.map((section) => {
            const sectionChallenges = bySection.get(section.id) ?? []
            if (sectionChallenges.length === 0) return null // hide empty sections
            return (
              <div key={section.id} className="space-y-2">
                {/* Section header */}
                <div className="flex items-center gap-2 px-1">
                  <h2 className={cn(
                    'font-display text-sm font-bold uppercase tracking-wider',
                    section.is_open ? 'text-text' : 'text-text-faint',
                  )}>
                    {section.title}
                  </h2>
                  {!section.is_open && (
                    <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-mono uppercase bg-surface-overlay text-text-faint border border-surface-overlay">
                      <Lock size={9} /> Wordt later geopend
                    </span>
                  )}
                </div>
                {section.description && (
                  <p className="text-xs text-text-muted px-1">{section.description}</p>
                )}
                <div className="flex flex-col gap-3">
                  {sectionChallenges.map((challenge, i) => {
                    const sub = submissionMap.get(challenge.id)
                    const completed = !!sub
                    const correct = sub?.is_correct
                    const locked = !section.is_open

                    return (
                      <Card
                        key={challenge.id}
                        className={cn(
                          'flex items-center gap-3 transition-transform',
                          locked
                            ? 'opacity-40 cursor-not-allowed'
                            : 'cursor-pointer active:scale-[0.98]',
                        )}
                        onClick={() => !locked && navigate(`/challenge/${challenge.id}`)}
                      >
                        {locked ? (
                          <span className="w-8 h-8 rounded-lg bg-surface-overlay flex items-center justify-center shrink-0">
                            <Lock size={14} className="text-text-faint" />
                          </span>
                        ) : completed ? (
                          <CheckCircle2
                            size={20}
                            className={correct ? 'text-lime shrink-0' : 'text-magenta shrink-0'}
                          />
                        ) : (
                          <span className="w-8 h-8 rounded-lg bg-surface-overlay flex items-center justify-center text-sm font-mono text-text-faint shrink-0">
                            {i + 1}
                          </span>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold truncate">{challenge.title}</p>
                          <p className="text-xs text-text-muted capitalize">{challenge.type.replace('_', ' ')}</p>
                        </div>
                        {completed && !locked ? (
                          <Badge variant={correct ? 'lime' : 'magenta'}>{sub.points_awarded} pts</Badge>
                        ) : (
                          <Badge variant={locked ? 'muted' : 'neon'}>{challenge.points} pts</Badge>
                        )}
                        {!locked && <ChevronRight size={16} className="text-text-faint shrink-0" />}
                      </Card>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
