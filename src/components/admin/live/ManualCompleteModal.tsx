import { useState, useMemo } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '../../ui/Modal'
import { Input } from '../../ui/Input'
import { Textarea } from '../../ui/Textarea'
import { Button } from '../../ui/Button'
import { supabase } from '../../../lib/supabase'
import type { Challenge } from '../../../types'

interface Props {
  open: boolean
  onClose: () => void
  teamId: string
  teamName: string
  gameId: string
  allChallenges: Challenge[]
  // challenge_ids the team already has a correct submission for — pre-filtered out
  completedChallengeIds: Set<string>
  onDone?: () => void
}

export function ManualCompleteModal({
  open,
  onClose,
  teamId,
  teamName,
  gameId,
  allChallenges,
  completedChallengeIds,
  onDone,
}: Props) {
  const available = useMemo(
    () => allChallenges.filter((c) => !completedChallengeIds.has(c.id)),
    [allChallenges, completedChallengeIds],
  )

  const [challengeId, setChallengeId] = useState<string>(available[0]?.id ?? '')
  const [points, setPoints] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  // Auto-select first challenge + suggest its default points when modal opens or list changes
  useMemo(() => {
    if (available.length === 0) {
      setChallengeId('')
      setPoints('')
      return
    }
    if (!available.find((c) => c.id === challengeId)) {
      setChallengeId(available[0].id)
      setPoints(String(available[0].points))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available])

  function handleChallengeChange(id: string) {
    setChallengeId(id)
    const ch = available.find((c) => c.id === id)
    if (ch) setPoints(String(ch.points))
  }

  function handleClose() {
    if (saving) return
    setNote('')
    onClose()
  }

  async function handleSubmit() {
    const ptsNum = parseInt(points)
    if (!challengeId) return
    if (Number.isNaN(ptsNum)) {
      toast.error('Voer een aantal punten in')
      return
    }
    setSaving(true)
    const { data, error } = await supabase.rpc('admin_complete_challenge', {
      p_team_id: teamId,
      p_challenge_id: challengeId,
      p_game_id: gameId,
      p_points: ptsNum,
      p_note: note.trim() || null,
    })
    setSaving(false)
    if (error || data?.error) {
      toast.error('Afronden mislukt', { description: error?.message ?? data?.error })
      return
    }
    const challengeName = available.find((c) => c.id === challengeId)?.title ?? 'Challenge'
    toast.success(`"${challengeName}" toegekend aan ${teamName}`, {
      description: `+${ptsNum} ptn`,
    })
    setNote('')
    onDone?.()
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title={`Manual complete — ${teamName}`}>
      {available.length === 0 ? (
        <p className="text-sm text-text-muted">Dit team heeft alle challenges al opgelost.</p>
      ) : (
        <div className="space-y-4">
          <div>
            <label htmlFor="challenge-picker" className="text-sm text-text-muted">Challenge</label>
            <select
              id="challenge-picker"
              value={challengeId}
              onChange={(e) => handleChallengeChange(e.target.value)}
              className="w-full mt-1.5 bg-surface border border-surface-overlay rounded-lg px-3 py-2.5 text-text outline-none focus:border-neon"
            >
              {available.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} (standaard {c.points} ptn)
                </option>
              ))}
            </select>
          </div>

          <Input
            id="points"
            label="Punten toekennen"
            type="number"
            value={points}
            onChange={(e) => setPoints(e.target.value)}
          />

          <Textarea
            id="note"
            label="Notitie (optioneel)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Bv. handmatig goedgekeurd na bug, partial credit voor foto..."
            rows={2}
          />

          <p className="text-xs text-text-faint">
            Eerdere foute pogingen blijven staan (voor audit), maar de challenge telt nu als opgelost.
          </p>

          <div className="flex gap-2 pt-2">
            <Button onClick={handleSubmit} disabled={saving || !challengeId} className="flex-1">
              {saving ? <Loader2 size={16} className="animate-spin" /> : 'Toekennen'}
            </Button>
            <Button variant="ghost" onClick={handleClose} disabled={saving}>Annuleren</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
