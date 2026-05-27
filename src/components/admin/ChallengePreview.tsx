import { useState } from 'react'
import { Clock, Lightbulb, Camera, MapPin, Trophy, HelpCircle } from 'lucide-react'
import { cn } from '../../lib/utils'
import { MediaGallery } from '../shared/MediaGallery'
import type {
  ChallengeType,
  ChallengeConfig,
  DisplayConfig,
  MediaItem,
  ScoringConfig,
  HintsConfig,
  MultipleChoiceConfig,
  OpenDoorConfig,
  PuzzleConfig,
  GalleryConfig,
  CollectiveMemoryConfig,
} from '../../types'

interface ChallengePreviewProps {
  title: string
  description: string
  type: ChallengeType
  config: ChallengeConfig
  display: DisplayConfig
  mediaItems: MediaItem[]
  scoring: ScoringConfig
  hints: HintsConfig
  timeLimit: string
}

// ── Answer Renderers ──

function MultipleChoicePreview({ config, columns }: { config: MultipleChoiceConfig; columns: number }) {
  const [selected, setSelected] = useState<number[]>([])

  function toggle(i: number) {
    if (config.allow_multiple) {
      setSelected((prev) => prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i])
    } else {
      setSelected([i])
    }
  }

  return (
    <div className={cn(
      'grid gap-2',
      columns === 2 && 'grid-cols-2',
      columns === 3 && 'grid-cols-3',
      columns === 4 && 'grid-cols-4',
    )}>
      {config.options.filter((o) => o.text || o.image_url).map((option, i) => (
        <button
          key={i}
          type="button"
          onClick={() => toggle(i)}
          className={cn(
            'flex flex-col items-center gap-2 p-3 rounded-lg border-2 text-left transition-all',
            selected.includes(i)
              ? 'border-neon bg-neon/10 shadow-glow-soft'
              : 'border-surface-overlay bg-surface-raised hover:border-text-faint',
          )}
        >
          {option.image_url && (
            <img src={option.image_url} alt="" className="w-full h-24 object-cover rounded" />
          )}
          <span className="text-sm text-text w-full">{option.text || `Option ${i + 1}`}</span>
        </button>
      ))}
    </div>
  )
}

function FreeTextPreview() {
  return (
    <div className="relative">
      <input
        type="text"
        readOnly
        placeholder="Type your answer..."
        className="w-full bg-surface-raised border border-surface-overlay rounded-lg px-4 py-3 text-text placeholder:text-text-faint outline-none"
      />
    </div>
  )
}

function PhotoUploadPreview() {
  return (
    <div className="flex flex-col items-center gap-3 p-8 rounded-lg border-2 border-dashed border-surface-overlay">
      <Camera size={32} className="text-text-faint" />
      <span className="text-sm text-text-muted">Tap to take a photo or upload</span>
    </div>
  )
}

function GpsCheckPreview() {
  return (
    <div className="flex flex-col items-center gap-3 p-8 rounded-lg border-2 border-dashed border-surface-overlay">
      <MapPin size={32} className="text-text-faint" />
      <span className="text-sm text-text-muted">Check in at this location</span>
    </div>
  )
}

function OpenDoorPreview({ config }: { config: OpenDoorConfig }) {
  const answers = config.answers ?? []
  const mode = config.scoring_mode ?? 'fixed'
  const placements = config.placements ?? []
  const bestPlace = placements[0]?.points ?? 0
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {answers.slice(0, 4).map((answer, i) => {
          const display = mode === 'placement' ? `tot ${bestPlace}` : `${answer.points}`
          return (
            <div
              key={i}
              className="flex items-center justify-between gap-2 p-3 rounded-lg border-2 border-surface-overlay bg-surface-raised"
            >
              <div className="flex items-center gap-2 min-w-0">
                <HelpCircle size={16} className="text-text-faint shrink-0" />
                <span className="text-xs text-text-faint">Deur {i + 1}</span>
              </div>
              <span className="text-xs text-amber font-mono shrink-0">{display} pt</span>
            </div>
          )
        })}
      </div>
      <input
        type="text"
        readOnly
        placeholder="Typ een antwoord..."
        className="w-full bg-surface-raised border border-surface-overlay rounded-lg px-4 py-3 text-text placeholder:text-text-faint outline-none"
      />
    </div>
  )
}

function CollectiveMemoryPreview({ config }: { config: CollectiveMemoryConfig }) {
  const keywords = config.keywords ?? []
  const mode = config.scoring_mode ?? 'fixed'
  const bestPlace = config.placements?.[0]?.points ?? 0
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-5 gap-1.5">
        {keywords.slice(0, 5).map((kw, i) => {
          const display = mode === 'placement' ? `tot ${bestPlace}` : `${kw.points}`
          return (
            <div
              key={i}
              className="flex flex-col items-center justify-center p-2 rounded border-2 border-surface-overlay bg-surface-raised"
            >
              <HelpCircle size={14} className="text-text-faint mb-0.5" />
              <span className="text-[10px] font-mono text-amber">{display}</span>
            </div>
          )
        })}
      </div>
      <input
        type="text"
        readOnly
        placeholder="Typ een trefwoord..."
        className="w-full bg-surface-raised border border-surface-overlay rounded-lg px-4 py-3 text-text placeholder:text-text-faint outline-none"
      />
    </div>
  )
}

function GalleryPreview({ config }: { config: GalleryConfig }) {
  const items = config.items ?? []
  const mode = config.scoring_mode ?? 'fixed'
  const bestPlace = config.placements?.[0]?.points ?? 0
  return (
    <div className="space-y-3">
      {config.show_theme && config.theme && (
        <div className="text-center">
          <p className="text-xs text-text-faint uppercase tracking-wider">Thema</p>
          <p className="text-sm font-semibold text-text">{config.theme}</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        {items.length === 0 ? (
          <p className="col-span-2 text-xs text-text-faint italic text-center py-4">Nog geen foto's toegevoegd</p>
        ) : (
          items.map((item, i) => (
            <div key={i} className="relative rounded border-2 border-surface-overlay bg-surface-raised overflow-hidden">
              {item.media?.url ? (
                <img src={item.media.url} alt="" className="w-full h-24 object-cover" />
              ) : (
                <div className="w-full h-24 flex items-center justify-center bg-surface-overlay/30">
                  <HelpCircle size={20} className="text-text-faint" />
                </div>
              )}
              <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-void/80 text-[10px] font-mono text-amber">
                {mode === 'placement' ? `tot ${bestPlace}` : `${item.points}`} pt
              </div>
            </div>
          ))
        )}
      </div>
      <input
        type="text"
        readOnly
        placeholder="Typ een antwoord..."
        className="w-full bg-surface-raised border border-surface-overlay rounded-lg px-4 py-3 text-text placeholder:text-text-faint outline-none"
      />
    </div>
  )
}

function PuzzlePreview({ config }: { config: PuzzleConfig }) {
  const terms = config.terms ?? []
  const themes = config.themes ?? []
  const themeColors = ['border-neon bg-neon/15', 'border-amber bg-amber/15', 'border-magenta bg-magenta/15']
  function colorForTerm(i: number): string | null {
    for (let t = 0; t < themes.length; t++) {
      if (themes[t].term_indices?.includes(i)) return themeColors[t] ?? null
    }
    return null
  }
  return (
    <div className="space-y-3">
      {/* Theme slots — all unsolved in preview */}
      <div className="grid grid-cols-3 gap-2">
        {themes.map((t, i) => (
          <div
            key={i}
            className={cn(
              'rounded-lg p-2 text-center border-2',
              themeColors[i].replace('/15', '/5'),
            )}
          >
            <p className="text-xs text-text-faint">Thema {i + 1}</p>
            <p className="text-sm font-bold text-text-muted">?</p>
            <p className="text-xs text-text-faint">{t.max_attempts} pog.</p>
          </div>
        ))}
      </div>
      {/* 12 terms grid */}
      <div className="grid grid-cols-4 gap-1.5">
        {terms.slice(0, 12).map((term, i) => {
          const color = colorForTerm(i)
          return (
            <div
              key={i}
              className={cn(
                'px-2 py-2 rounded text-xs text-center border truncate',
                color ?? 'border-surface-overlay bg-surface-raised text-text-muted',
              )}
            >
              {term || `—`}
            </div>
          )
        })}
      </div>
      <input
        type="text"
        readOnly
        placeholder="Typ een themanaam..."
        className="w-full bg-surface-raised border border-surface-overlay rounded-lg px-4 py-3 text-text placeholder:text-text-faint outline-none"
      />
    </div>
  )
}

// Horizontal media width based on media size
const horizontalWidthClass: Record<string, string> = {
  small: 'w-1/4',
  medium: 'w-1/3',
  large: 'w-2/5',
  full: 'w-1/2',
}

// ── Main Preview ──

export function ChallengePreview({
  title,
  description,
  type,
  config,
  display,
  mediaItems,
  scoring,
  hints,
  timeLimit,
}: ChallengePreviewProps) {
  const [revealedHints, setRevealedHints] = useState(0)

  // Points label depends on type — interactive types compute from their own config
  let pointsLabel: string
  if (type === 'open_door') {
    const od = config as OpenDoorConfig
    const mode = od.scoring_mode ?? 'fixed'
    const total = mode === 'placement'
      ? (od.placements?.[0]?.points ?? 0) * (od.answers?.length ?? 0)
      : od.answers?.reduce((s, a) => s + (a.points || 0), 0) ?? 0
    pointsLabel = `max ${total} pt`
  } else if (type === 'puzzle') {
    const pz = config as PuzzleConfig
    const mode = pz.scoring_mode ?? 'fixed'
    const total = mode === 'placement'
      ? (pz.placements?.[0]?.points ?? 0) * (pz.themes?.length ?? 0)
      : pz.themes?.reduce((s, t) => s + (t.points || 0), 0) ?? 0
    pointsLabel = `max ${total} pt`
  } else if (type === 'gallery') {
    const g = config as GalleryConfig
    const mode = g.scoring_mode ?? 'fixed'
    const total = mode === 'placement'
      ? (g.placements?.[0]?.points ?? 0) * (g.items?.length ?? 0)
      : g.items?.reduce((s, it) => s + (it.points || 0), 0) ?? 0
    pointsLabel = `max ${total} pt`
  } else if (type === 'collective_memory') {
    const cm = config as CollectiveMemoryConfig
    const mode = cm.scoring_mode ?? 'fixed'
    const total = mode === 'placement'
      ? (cm.placements?.[0]?.points ?? 0) * (cm.keywords?.length ?? 0)
      : cm.keywords?.reduce((s, k) => s + (k.points || 0), 0) ?? 0
    pointsLabel = `max ${total} pt`
  } else if (scoring.mode === 'fixed') {
    pointsLabel = `${scoring.fixed_points} pts`
  } else {
    pointsLabel = scoring.placements.map((p) => `${p.points}`).join(' / ') + ' pts'
  }

  const hasMedia = mediaItems.length > 0
  const isHorizontalMedia = display.media_position === 'left' || display.media_position === 'right'
  const isBackground = display.media_position === 'background'
  const isCompact = display.compact

  // Content block: description text
  const descriptionBlock = (
    <div className={cn('space-y-1', display.description_align === 'center' && 'text-center')}>
      {description ? (
        <p className={cn('text-text leading-relaxed whitespace-pre-wrap', isCompact ? 'text-xs' : 'text-sm')}>{description}</p>
      ) : (
        <p className="text-text-faint text-sm italic">No description provided</p>
      )}
    </div>
  )

  // Media block
  const mediaBlock = hasMedia ? (
    <MediaGallery items={mediaItems} layout={display.media_layout} size={display.media_size} />
  ) : null

  // Compose description + media based on position
  function renderPromptContent() {
    if (!hasMedia) return descriptionBlock

    if (isBackground && mediaItems[0]?.type === 'image') {
      return (
        <div
          className="relative rounded-lg overflow-hidden p-6 min-h-[120px] flex items-end"
          style={{
            backgroundImage: `url(${mediaItems[0].url})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-void/90 via-void/50 to-transparent" />
          <div className="relative z-10">{descriptionBlock}</div>
        </div>
      )
    }

    if (isHorizontalMedia) {
      const widthCls = horizontalWidthClass[display.media_size] ?? 'w-2/5'
      const media = <div className={cn(widthCls, 'shrink-0')}>{mediaBlock}</div>
      const text = <div className="flex-1 min-w-0">{descriptionBlock}</div>
      return (
        <div className={cn('flex', isCompact ? 'gap-2' : 'gap-4')}>
          {display.media_position === 'left' ? <>{media}{text}</> : <>{text}{media}</>}
        </div>
      )
    }

    // above / below
    return (
      <div className={isCompact ? 'space-y-1.5' : 'space-y-3'}>
        {display.media_position === 'above' && mediaBlock}
        {descriptionBlock}
        {display.media_position === 'below' && mediaBlock}
      </div>
    )
  }

  // Answer block
  function renderAnswer() {
    switch (type) {
      case 'multiple_choice':
        return <MultipleChoicePreview config={config as MultipleChoiceConfig} columns={display.columns} />
      case 'free_text':
        return <FreeTextPreview />
      case 'photo_upload':
        return <PhotoUploadPreview />
      case 'gps_check':
        return <GpsCheckPreview />
      case 'open_door':
        return <OpenDoorPreview config={config as OpenDoorConfig} />
      case 'puzzle':
        return <PuzzlePreview config={config as PuzzleConfig} />
      case 'gallery':
        return <GalleryPreview config={config as GalleryConfig} />
      case 'collective_memory':
        return <CollectiveMemoryPreview config={config as CollectiveMemoryConfig} />
    }
  }

  return (
    <div className="bg-void rounded-xl border border-surface-overlay overflow-hidden">
      {/* Phone-style header bar */}
      <div className="bg-surface px-4 py-3 border-b border-surface-overlay flex items-center justify-between">
        <span className="text-xs text-text-faint font-mono">PLAYER VIEW</span>
        <div className="flex items-center gap-3">
          {timeLimit && (
            <div className="flex items-center gap-1 text-amber text-xs font-mono">
              <Clock size={12} />
              {timeLimit}s
            </div>
          )}
          <div className="flex items-center gap-1 text-neon text-xs font-mono">
            <Trophy size={12} />
            {pointsLabel}
          </div>
        </div>
      </div>

      {/* Challenge content */}
      <div className={cn('p-4', isCompact ? 'space-y-3' : 'space-y-5')}>
        {/* Title */}
        <h2 className={cn('font-display font-bold text-text', isCompact ? 'text-base' : 'text-lg')}>
          {title || <span className="text-text-faint italic font-sans font-normal">Untitled Challenge</span>}
        </h2>

        {/* Description + Media */}
        {renderPromptContent()}

        {/* Divider */}
        <div className="border-t border-surface-overlay" />

        {/* Answer section */}
        {renderAnswer()}

        {/* Hints */}
        {hints.items.length > 0 && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setRevealedHints((prev) => Math.min(prev + 1, hints.items.length))}
              disabled={revealedHints >= hints.items.length}
              className={cn(
                'flex items-center gap-2 text-sm transition-colors',
                revealedHints >= hints.items.length
                  ? 'text-text-faint cursor-not-allowed'
                  : 'text-amber hover:text-amber-dim cursor-pointer',
              )}
            >
              <Lightbulb size={14} />
              {revealedHints >= hints.items.length
                ? 'No more hints'
                : `Get hint (−${hints.items[revealedHints]?.deduction ?? 0} pts)`}
            </button>
            {revealedHints > 0 && (
              <div className="space-y-1.5">
                {hints.items.slice(0, revealedHints).map((h, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm bg-amber/5 border border-amber/20 rounded-lg px-3 py-2">
                    <Lightbulb size={14} className="text-amber shrink-0 mt-0.5" />
                    <span className="text-text-muted">{h.text || <em className="text-text-faint">Empty hint</em>}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Submit button */}
        <button
          type="button"
          className="w-full py-3 rounded-lg bg-neon text-void font-bold text-sm tracking-wide cursor-default"
        >
          Submit Answer
        </button>
      </div>
    </div>
  )
}
