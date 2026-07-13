import { useNavigate } from 'react-router-dom'
import { LogOut, ChevronRight, CheckCircle2, Lock, Gift } from 'lucide-react'
import { Card } from '../components/ui/Card'
import { Badge } from '../components/ui/Badge'
import { ThemeToggle } from '../components/ui/ThemeToggle'
import { useAuth } from '../providers/AuthProvider'
import { useChallenges } from '../hooks/useChallenges'
import { useTeamSubmissions } from '../hooks/useSubmissions'
import { useSections } from '../hooks/useSections'
import { useGameProgress } from '../hooks/useGameProgress'
import { cn, livePointsFromState } from '../lib/utils'

type ChallengeStatus = 'solved' | 'inprogress' | 'retry' | 'done' | 'new'

export function Home() {
  const navigate = useNavigate()
  const { teamSession, signOut } = useAuth()
  const { challenges, loading } = useChallenges(teamSession?.game.id)
  const { submissions } = useTeamSubmissions(teamSession?.team.id, teamSession?.game.id)
  const { sections } = useSections(teamSession?.game.id)
  const { progress } = useGameProgress(teamSession?.game.id)

  if (!teamSession) return null

  // Best real submission per challenge (correct preferred, then highest points).
  // Rows with a null challenge_id are admin adjustments — handled separately.
  const submissionMap = new Map<string, (typeof submissions)[number]>()
  for (const s of submissions) {
    if (!s.challenge_id) continue
    const existing = submissionMap.get(s.challenge_id)
    const better =
      !existing ||
      (!!s.is_correct && !existing.is_correct) ||
      (!!s.is_correct === !!existing.is_correct && s.points_awarded > existing.points_awarded)
    if (better) submissionMap.set(s.challenge_id, s)
  }

  // This team's in-progress state per challenge (for live, pre-finalize points)
  const progressMap = new Map(
    progress.filter((p) => p.team_id === teamSession.team.id).map((p) => [p.challenge_id, p]),
  )

  // Per-challenge status + points collected so far (live)
  function evaluate(challengeId: string): { status: ChallengeStatus; collected: number } {
    const sub = submissionMap.get(challengeId)
    const prog = progressMap.get(challengeId)
    const finalized = !!prog?.finalized
    const solved = sub?.is_correct === true
    const liveP = prog && !finalized ? livePointsFromState(prog.state) : 0
    const submittedP = sub ? sub.points_awarded : 0
    const collected = solved ? submittedP : Math.max(submittedP, liveP)

    let status: ChallengeStatus
    if (solved) status = 'solved'
    else if (prog && !finalized) status = 'inprogress'
    else if (finalized) status = 'done' // finalized without a full solve
    else if (sub) status = 'retry' // classic wrong attempt, can try again
    else status = 'new'
    return { status, collected }
  }

  // Totals: points collected across challenges + signed admin adjustments
  let totalPoints = 0
  let solvedCount = 0
  for (const c of challenges) {
    const { status, collected } = evaluate(c.id)
    totalPoints += collected
    if (status === 'solved') solvedCount += 1
  }
  const bonuses = submissions.filter((s) => !s.challenge_id)
  totalPoints += bonuses.reduce((sum, b) => sum + b.points_awarded, 0)

  // Group challenges by section
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
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <button
            onClick={signOut}
            className="p-2 text-text-faint hover:text-text-muted transition-colors"
            title="Sign out"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>

      {/* Game title + live total */}
      <div className="mb-6">
        <h1 className="font-display text-2xl font-black text-neon tracking-wider">
          {teamSession.game.title}
        </h1>
        <p className="text-sm text-text-muted mt-1">
          <span className="font-bold text-neon">{totalPoints}</span> punten
          <span className="text-text-faint"> · {solvedCount}/{challenges.length} opgelost</span>
        </p>
      </div>

      {/* Sections + challenges */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-neon border-t-transparent rounded-full animate-spin" />
        </div>
      ) : challenges.length === 0 && sections.length === 0 ? (
        <Card className="text-center py-8">
          <p className="text-text-muted">No challenges available yet.</p>
          <p className="text-xs text-text-faint mt-1">Check back when the game starts!</p>
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          {sections.map((section) => {
            const sectionChallenges = bySection.get(section.id) ?? []

            // Locked section: show it exists, but never reveal or open its
            // challenges (their configs contain answers and aren't sent to us).
            if (!section.is_open) {
              return (
                <div key={section.id} className="space-y-2">
                  <div className="flex items-center gap-2 px-1">
                    <h2 className="font-display text-sm font-bold uppercase tracking-wider text-text-faint">
                      {section.title}
                    </h2>
                    <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-mono uppercase bg-surface-overlay text-text-faint border border-surface-overlay">
                      <Lock size={9} /> Wordt later geopend
                    </span>
                  </div>
                  {section.description && (
                    <p className="text-xs text-text-muted px-1">{section.description}</p>
                  )}
                  <Card className="flex items-center gap-3 opacity-50">
                    <span className="w-8 h-8 rounded-lg bg-surface-overlay flex items-center justify-center shrink-0">
                      <Lock size={14} className="text-text-faint" />
                    </span>
                    <p className="text-sm text-text-muted">
                      Deze sectie wordt later door de spelleiding geopend.
                    </p>
                  </Card>
                </div>
              )
            }

            if (sectionChallenges.length === 0) return null // hide empty open sections

            return (
              <div key={section.id} className="space-y-2">
                <div className="flex items-center gap-2 px-1">
                  <h2 className="font-display text-sm font-bold uppercase tracking-wider text-text">
                    {section.title}
                  </h2>
                </div>
                {section.description && (
                  <p className="text-xs text-text-muted px-1">{section.description}</p>
                )}
                <div className="flex flex-col gap-3">
                  {sectionChallenges.map((challenge, i) => {
                    const { status, collected } = evaluate(challenge.id)

                    return (
                      <Card
                        key={challenge.id}
                        className="flex items-center gap-3 transition-transform cursor-pointer active:scale-[0.98]"
                        onClick={() => navigate(`/challenge/${challenge.id}`)}
                      >
                        {status === 'solved' ? (
                          <CheckCircle2 size={20} className="text-lime shrink-0" />
                        ) : (
                          <span className={cn(
                            'w-8 h-8 rounded-lg flex items-center justify-center text-sm font-mono shrink-0',
                            status === 'inprogress' ? 'bg-amber/10 text-amber' :
                            status === 'retry' ? 'bg-magenta/10 text-magenta' :
                            'bg-surface-overlay text-text-faint',
                          )}>
                            {i + 1}
                          </span>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold truncate">{challenge.title}</p>
                          <p className="text-xs text-text-muted capitalize">
                            {challenge.type.replace('_', ' ')}
                            {status === 'inprogress' && <span className="text-amber"> · bezig</span>}
                            {status === 'retry' && <span className="text-magenta"> · opnieuw proberen</span>}
                            {status === 'done' && <span className="text-text-faint"> · afgerond</span>}
                          </p>
                        </div>
                        {status === 'solved' ? (
                          <Badge variant="lime">{collected} pts</Badge>
                        ) : status === 'inprogress' ? (
                          <Badge variant="amber">{collected} pts</Badge>
                        ) : status === 'done' ? (
                          <Badge variant="muted">{collected} pts</Badge>
                        ) : (
                          <Badge variant="neon">{challenge.points} pts</Badge>
                        )}
                        <ChevronRight size={16} className="text-text-faint shrink-0" />
                      </Card>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {/* Bonus / penalty points from the game leaders */}
          {bonuses.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <h2 className="font-display text-sm font-bold uppercase tracking-wider text-text">
                  Bonuspunten
                </h2>
              </div>
              <div className="flex flex-col gap-2">
                {bonuses.map((b) => {
                  const reason = (b.answer as { reason?: string })?.reason
                  const positive = b.points_awarded >= 0
                  return (
                    <Card key={b.id} className="flex items-center gap-3">
                      <span className={cn(
                        'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                        positive ? 'bg-lime/10 text-lime' : 'bg-magenta/10 text-magenta',
                      )}>
                        <Gift size={14} />
                      </span>
                      <p className="flex-1 min-w-0 text-sm text-text truncate">
                        {reason || (positive ? 'Bonuspunten' : 'Puntenaftrek')}
                      </p>
                      <Badge variant={positive ? 'lime' : 'magenta'}>
                        {positive ? '+' : ''}{b.points_awarded} pts
                      </Badge>
                    </Card>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
