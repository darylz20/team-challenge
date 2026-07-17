import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Camera, Loader2, Hourglass, CheckCircle2, XCircle, Trophy, X } from 'lucide-react'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { supabase } from '../../lib/supabase'
import { uploadTeamPhoto } from '../../lib/storage'
import { useSubmission } from '../../hooks/useSubmissions'
import { useAuth } from '../../providers/AuthProvider'
import type { Challenge, PhotoSubmissionAnswer } from '../../types'

/**
 * photo_upload gameplay: pick/take one photo, preview it, submit once.
 * After submitting there is nothing more to do — the team waits for an admin to
 * award points from the Live Monitor. Subscribes to realtime so the award lands
 * on screen without a refresh.
 */
export function PhotoUploadPlay({ challenge }: { challenge: Challenge }) {
  const { teamSession } = useAuth()
  const teamId = teamSession?.team.id
  const { submission, loading, submitting, submitAnswer, refetch } = useSubmission(teamId, challenge.id)

  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)

  // Derive the preview rather than storing it, then revoke on change/unmount.
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => {
    if (!previewUrl) return
    return () => URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  // The award is an UPDATE to our submission row — listen so points appear live.
  useEffect(() => {
    if (!teamId) return
    const channel = supabase
      .channel(`photo-review:${challenge.id}:${teamId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'submissions', filter: `team_id=eq.${teamId}` },
        () => { refetch() },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [challenge.id, teamId, refetch])

  async function handleSubmit() {
    if (!file || !teamSession) return
    setUploading(true)

    const url = await uploadTeamPhoto(file, teamSession.game.id, teamSession.team.id)
    if (!url) {
      setUploading(false)
      toast.error('Uploaden mislukt', { description: 'Probeer het opnieuw.' })
      return
    }

    const { error } = await submitAnswer(teamSession.game.id, { photo_url: url })
    setUploading(false)

    if (error) {
      toast.error('Versturen mislukt', { description: error })
      return
    }
    setFile(null)
    toast.success('Foto verstuurd!', { description: 'De spelleider beoordeelt hem zo.' })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 size={20} className="animate-spin text-neon" />
      </div>
    )
  }

  // ── Already submitted: show the photo + review state, no way back ──
  if (submission) {
    const answer = (submission.answer ?? {}) as unknown as PhotoSubmissionAnswer
    const reviewed = answer.reviewed === true

    return (
      <div className="space-y-3">
        {answer.photo_url && (
          <img
            src={answer.photo_url}
            alt="Jullie inzending"
            className="w-full rounded-lg border border-surface-overlay object-cover max-h-80"
          />
        )}

        {!reviewed ? (
          <Card className="flex items-center gap-3">
            <Hourglass size={18} className="text-amber shrink-0 animate-pulse" />
            <div>
              <p className="text-sm font-medium text-text">Wacht op beoordeling</p>
              <p className="text-xs text-text-muted">
                De spelleider bekijkt jullie foto. Punten verschijnen hier zodra ze toegekend zijn.
              </p>
            </div>
          </Card>
        ) : submission.is_correct ? (
          <Card className="flex items-center gap-3 border-lime/40 bg-lime/5">
            <CheckCircle2 size={18} className="text-lime shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-lime">
                Beoordeeld · +{submission.points_awarded} ptn
              </p>
              {answer.review_note && (
                <p className="text-xs text-text-muted break-words">"{answer.review_note}"</p>
              )}
            </div>
            <Trophy size={16} className="text-lime shrink-0" />
          </Card>
        ) : (
          <Card className="flex items-center gap-3 border-magenta/40 bg-magenta/5">
            <XCircle size={18} className="text-magenta shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-magenta">Beoordeeld · geen punten</p>
              {answer.review_note && (
                <p className="text-xs text-text-muted break-words">"{answer.review_note}"</p>
              )}
            </div>
          </Card>
        )}

        <p className="text-xs text-text-faint text-center">
          Eén foto per team — je kunt geen nieuwe insturen.
        </p>
      </div>
    )
  }

  // ── Nothing submitted yet: pick → preview → send ──
  const busy = uploading || submitting

  return (
    <div className="space-y-3">
      {previewUrl ? (
        <div className="relative">
          <img
            src={previewUrl}
            alt="Voorbeeld"
            className="w-full rounded-lg border border-surface-overlay object-cover max-h-80"
          />
          {!busy && (
            <button
              type="button"
              onClick={() => setFile(null)}
              className="absolute top-2 right-2 p-1.5 rounded-full bg-void/80 text-text-muted hover:text-magenta transition-colors"
              aria-label="Foto verwijderen"
            >
              <X size={16} />
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full flex flex-col items-center gap-2 p-8 rounded-lg border-2 border-dashed border-surface-overlay hover:border-neon transition-colors"
        >
          <Camera size={28} className="text-text-faint" />
          <span className="text-sm text-text-muted">Kies of maak een foto</span>
          <span className="text-xs text-text-faint">Je kunt er één insturen</span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const picked = e.target.files?.[0]
          if (picked) setFile(picked)
          e.target.value = ''
        }}
      />

      {file && (
        <>
          <Button onClick={handleSubmit} disabled={busy} className="w-full gap-2" size="lg">
            {busy ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
            {uploading ? 'Uploaden...' : submitting ? 'Versturen...' : 'Foto insturen'}
          </Button>
          <p className="text-xs text-text-faint text-center">
            Let op: insturen kan maar één keer. Daarna beoordeelt de spelleider de foto.
          </p>
        </>
      )}
    </div>
  )
}
