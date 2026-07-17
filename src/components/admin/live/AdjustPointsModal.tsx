import { useState } from 'react'
import { Loader2, Plus, Minus } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '../../ui/Modal'
import { Input } from '../../ui/Input'
import { Textarea } from '../../ui/Textarea'
import { Button } from '../../ui/Button'
import { supabase } from '../../../lib/supabase'
import { cn } from '../../../lib/utils'

interface Props {
  open: boolean
  onClose: () => void
  teamId: string
  teamName: string
  gameId: string
  onDone?: () => void
}

export function AdjustPointsModal({ open, onClose, teamId, teamName, gameId, onDone }: Props) {
  const [direction, setDirection] = useState<'plus' | 'minus'>('plus')
  const [amount, setAmount] = useState('10')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  function reset() {
    setDirection('plus')
    setAmount('10')
    setReason('')
  }

  function handleClose() {
    if (saving) return
    reset()
    onClose()
  }

  async function handleSubmit() {
    const value = parseInt(amount)
    if (!value || value <= 0) {
      toast.error('Voer een geldig aantal in')
      return
    }
    setSaving(true)
    const delta = direction === 'plus' ? value : -value
    const { data, error } = await supabase.rpc('admin_adjust_points', {
      p_team_id: teamId,
      p_game_id: gameId,
      p_delta: delta,
      p_reason: reason.trim() || null,
    })
    setSaving(false)
    if (error || data?.error) {
      toast.error('Punten aanpassen mislukt', { description: error?.message ?? data?.error })
      return
    }
    toast.success(`${direction === 'plus' ? '+' : '−'}${value} ptn voor ${teamName}`, {
      description: reason.trim() || undefined,
    })
    onDone?.()
    reset()
    onClose()
  }

  return (
    <Modal open={open} onClose={handleClose} title={`Adjust points — ${teamName}`}>
      <div className="space-y-4">
        {/* Direction */}
        <div className="flex gap-2">
          {([
            { v: 'plus' as const, label: 'Toevoegen', icon: Plus, color: 'lime' },
            { v: 'minus' as const, label: 'Aftrekken', icon: Minus, color: 'magenta' },
          ] as const).map(({ v, label, icon: Icon, color }) => (
            <button
              key={v}
              type="button"
              onClick={() => setDirection(v)}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border-2 text-sm font-medium transition-all',
                direction === v
                  ? color === 'lime'
                    ? 'border-lime bg-lime/10 text-lime'
                    : 'border-magenta bg-magenta/10 text-magenta'
                  : 'border-surface-overlay bg-surface text-text-muted hover:border-text-faint',
              )}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>

        <Input
          id="amount"
          label="Aantal punten"
          type="number"
          min={1}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          autoFocus
        />

        <Textarea
          id="reason"
          label="Reden (optioneel)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Bv. bonus voor creativiteit, technische pech compensatie..."
          rows={2}
        />

        <div className="flex gap-2 pt-2">
          <Button onClick={handleSubmit} disabled={saving} className="flex-1">
            {saving ? <Loader2 size={16} className="animate-spin" /> : 'Toepassen'}
          </Button>
          <Button variant="ghost" onClick={handleClose} disabled={saving}>Annuleren</Button>
        </div>
      </div>
    </Modal>
  )
}
