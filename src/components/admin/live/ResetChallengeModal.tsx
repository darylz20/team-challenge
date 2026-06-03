import { useState } from 'react'
import { Loader2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '../../ui/Modal'
import { Button } from '../../ui/Button'
import { supabase } from '../../../lib/supabase'
import type { CompletedChallenge, ActiveProgress } from '../../../hooks/useLiveMonitor'

interface Props {
  open: boolean
  onClose: () => void
  teamId: string
  teamName: string
  completed: CompletedChallenge[]
  active: ActiveProgress | null
  onDone?: () => void
}

export function ResetChallengeModal({ open, onClose, teamId, teamName, completed, active, onDone }: Props) {
  // Combined list of resettable challenges: anything they've started/completed
  const options: { id: string; title: string; note: string }[] = []
  if (active) {
    options.push({
      id: active.challenge_id,
      title: active.challenge_title,
      note: 'In progress',
    })
  }
  for (const c of completed) {
    if (active?.challenge_id !== c.challenge_id) {
      options.push({
        id: c.challenge_id,
        title: c.challenge_title,
        note: `Solved · ${c.points} pt`,
      })
    }
  }

  const [challengeId, setChallengeId] = useState<string>(options[0]?.id ?? '')
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)

  function handleClose() {
    if (saving) return
    setConfirming(false)
    onClose()
  }

  async function handleSubmit() {
    if (!confirming) {
      setConfirming(true)
      return
    }
    setSaving(true)
    const { data, error } = await supabase.rpc('admin_reset_challenge', {
      p_team_id: teamId,
      p_challenge_id: challengeId,
    })
    setSaving(false)
    if (error || data?.error) {
      toast.error('Reset failed', { description: error?.message ?? data?.error })
      return
    }
    const title = options.find((o) => o.id === challengeId)?.title ?? 'Challenge'
    toast.success(`"${title}" gereset voor ${teamName}`, {
      description: 'Team kan opnieuw beginnen',
    })
    setConfirming(false)
    onDone?.()
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title={`Reset challenge — ${teamName}`}>
      {options.length === 0 ? (
        <p className="text-sm text-text-muted">Dit team is nog niet bezig met een challenge.</p>
      ) : (
        <div className="space-y-4">
          <div>
            <label htmlFor="reset-picker" className="text-sm text-text-muted">Welke challenge resetten?</label>
            <select
              id="reset-picker"
              value={challengeId}
              onChange={(e) => { setChallengeId(e.target.value); setConfirming(false) }}
              className="w-full mt-1.5 bg-surface border border-surface-overlay rounded-lg px-3 py-2.5 text-text outline-none focus:border-neon"
            >
              {options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.title} · {o.note}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-start gap-2 p-3 rounded-lg bg-magenta/5 border border-magenta/30">
            <AlertTriangle size={16} className="text-magenta shrink-0 mt-0.5" />
            <p className="text-xs text-magenta">
              Verwijdert <strong>alle</strong> submissions en progress voor deze challenge voor dit team. Het team
              kan de challenge daarna opnieuw beginnen alsof ze er nooit aan begonnen waren. Punten gaan verloren.
            </p>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              variant={confirming ? 'secondary' : 'primary'}
              onClick={handleSubmit}
              disabled={saving || !challengeId}
              className="flex-1"
            >
              {saving ? (
                <Loader2 size={16} className="animate-spin" />
              ) : confirming ? (
                'Klik nogmaals om te bevestigen'
              ) : (
                'Reset'
              )}
            </Button>
            <Button variant="ghost" onClick={handleClose} disabled={saving}>Annuleren</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
