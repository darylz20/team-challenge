import { useState } from 'react'
import { Loader2, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '../../ui/Modal'
import { Input } from '../../ui/Input'
import { Textarea } from '../../ui/Textarea'
import { Button } from '../../ui/Button'
import { supabase } from '../../../lib/supabase'
import type { PhotoReview } from '../../../hooks/useSubmissions'

interface Props {
  review: PhotoReview | null
  onClose: () => void
  onDone?: () => void
}

/**
 * Award points for one photo. Points prefill from the challenge's configured
 * value; awarding 0 marks it reviewed without scoring it. Re-opening an already
 * reviewed photo lets the admin correct the number.
 */
export function ReviewPhotoModal({ review, onClose, onDone }: Props) {
  return (
    <Modal
      open={!!review}
      onClose={onClose}
      title={review ? `Foto van ${review.team_name}` : 'Foto beoordelen'}
    >
      {/* Keyed on the submission so opening a different photo remounts the form
          with fresh field values, instead of syncing props into state. */}
      {review && (
        <ReviewForm key={review.submission_id} review={review} onClose={onClose} onDone={onDone} />
      )}
    </Modal>
  )
}

function ReviewForm({ review, onClose, onDone }: { review: PhotoReview } & Omit<Props, 'review'>) {
  const [points, setPoints] = useState(
    String(review.reviewed ? review.points_awarded : review.challenge_points),
  )
  const [note, setNote] = useState(review.review_note ?? '')
  const [saving, setSaving] = useState(false)

  function handleClose() {
    if (saving) return
    onClose()
  }

  async function handleAward() {
    const ptsNum = parseInt(points)
    if (Number.isNaN(ptsNum) || ptsNum < 0) {
      toast.error('Voer een geldig aantal punten in (0 of meer)')
      return
    }

    setSaving(true)
    const { data, error } = await supabase.rpc('admin_review_photo', {
      p_submission_id: review.submission_id,
      p_points: ptsNum,
      p_note: note.trim() || null,
    })
    setSaving(false)

    if (error || data?.error) {
      toast.error('Beoordelen mislukt', { description: error?.message ?? data?.error })
      return
    }

    toast.success(`${review.team_name}: ${ptsNum} ptn toegekend`, {
      description: ptsNum > 0 ? review.challenge_title : `Geen punten voor "${review.challenge_title}"`,
    })
    onDone?.()
    onClose()
  }

  return (
    <div className="space-y-4">
          <div>
            <img
              src={review.photo_url}
              alt={`Inzending van ${review.team_name}`}
              className="w-full rounded-lg border border-surface-overlay object-contain max-h-[50vh] bg-void"
            />
            <a
              href={review.photo_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 mt-1.5 text-xs text-neon-ink hover:text-neon-ink-dim transition-colors"
            >
              <ExternalLink size={12} /> Open op volledig formaat
            </a>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: review.team_color }}
            />
            <span className="text-text">{review.team_name}</span>
            <span className="text-text-faint">·</span>
            <span className="text-text-muted truncate">{review.challenge_title}</span>
          </div>

          <Input
            id="award-points"
            label={`Punten toekennen (richtlijn: ${review.challenge_points} ptn)`}
            type="number"
            min={0}
            value={points}
            onChange={(e) => setPoints(e.target.value)}
          />

          <Textarea
            id="review-note"
            label="Notitie voor het team (optioneel)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Bv. creatief! of: net niet de goede locatie"
            rows={2}
          />

          <p className="text-xs text-text-faint">
            {review.reviewed
              ? 'Deze foto is al beoordeeld — toekennen overschrijft de vorige punten.'
              : 'Het team ziet de punten en de notitie direct na het toekennen. 0 ptn = beoordeeld zonder punten.'}
          </p>

          <div className="flex gap-2 pt-2">
            <Button onClick={handleAward} disabled={saving} className="flex-1">
              {saving ? <Loader2 size={16} className="animate-spin" /> : 'Punten toekennen'}
            </Button>
            <Button variant="ghost" onClick={handleClose} disabled={saving}>Annuleren</Button>
          </div>
    </div>
  )
}
