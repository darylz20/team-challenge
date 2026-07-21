import { Plus, Trash2, ImagePlus, X } from 'lucide-react'
import { Input } from '../ui/Input'
import { Toggle } from '../ui/Toggle'
import { Button } from '../ui/Button'
import { cn } from '../../lib/utils'
import { AlternativesEditor } from './AlternativesEditor'
import { uploadChallengeMedia, deleteChallengeMedia } from '../../lib/storage'
import type {
  ChallengeType,
  ChallengeConfig,
  MultipleChoiceConfig,
  FreeTextConfig,
  OpenDoorConfig,
  OpenDoorAnswer,
  PuzzleConfig,
  GalleryConfig,
  GalleryItem,
  CollectiveMemoryConfig,
  CollectiveMemoryKeyword,
  PlacementReward,
} from '../../types'

interface AnswerConfigEditorProps {
  type: ChallengeType
  config: ChallengeConfig
  onChange: (config: ChallengeConfig) => void
  gameId?: string
}

export function AnswerConfigEditor({ type, config, onChange, gameId }: AnswerConfigEditorProps) {
  switch (type) {
    case 'multiple_choice':
      return <MultipleChoiceEditor config={config as MultipleChoiceConfig} onChange={onChange} gameId={gameId} />
    case 'free_text':
      return <FreeTextEditor config={config as FreeTextConfig} onChange={onChange} />
    case 'open_door':
      return <OpenDoorEditor config={config as OpenDoorConfig} onChange={onChange} />
    case 'puzzle':
      return <PuzzleEditor config={config as PuzzleConfig} onChange={onChange} />
    case 'gallery':
      return <GalleryEditor config={config as GalleryConfig} onChange={onChange} gameId={gameId} />
    case 'collective_memory':
      return <CollectiveMemoryEditor config={config as CollectiveMemoryConfig} onChange={onChange} />
    case 'photo_upload':
      return <PhotoUploadEditor />
  }
}

// No answer key to configure: the team uploads one photo and the admin judges it
// by eye. This panel just makes the (unusual) flow explicit in the builder.
function PhotoUploadEditor() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-text-muted">
        Het team uploadt <span className="text-text">één foto</span>. Er is geen goed antwoord om in te
        stellen — jij bepaalt de punten met de hand.
      </p>
      <ol className="space-y-2 text-sm text-text-muted">
        {[
          'Team kiest of maakt een foto en verstuurt die.',
          'Het team ziet "wacht op beoordeling" — nog geen punten.',
          'Jij bekijkt de foto in de Live Monitor en kent punten toe.',
          'Pas dan ziet het team de punten en telt het mee in het klassement.',
        ].map((step, i) => (
          <li key={i} className="flex gap-2.5">
            <span className="font-display text-neon-ink font-bold shrink-0">{i + 1}</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <p className="text-xs text-text-faint">
        De punten die je hieronder bij <span className="text-text-muted">Scoring</span> instelt zijn een
        richtlijn: dat getal staat straks alvast ingevuld bij het beoordelen, en je kunt het per foto
        aanpassen. Eén foto per team — opnieuw insturen kan niet.
      </p>
    </div>
  )
}

function MultipleChoiceEditor({ config, onChange, gameId }: { config: MultipleChoiceConfig; onChange: (c: ChallengeConfig) => void; gameId?: string }) {
  function updateOption(index: number, text: string) {
    const options = [...config.options]
    options[index] = { ...options[index], text }
    onChange({ ...config, options })
  }

  function toggleCorrect(index: number) {
    const options = config.options.map((opt, i) => ({
      ...opt,
      is_correct: config.allow_multiple ? (i === index ? !opt.is_correct : opt.is_correct) : i === index,
    }))
    onChange({ ...config, options })
  }

  function addOption() {
    onChange({ ...config, options: [...config.options, { text: '', is_correct: false }] })
  }

  function removeOption(index: number) {
    if (config.options.length <= 2) return
    const option = config.options[index]
    if (option.image_url) deleteChallengeMedia(option.image_url)
    onChange({ ...config, options: config.options.filter((_, i) => i !== index) })
  }

  async function handleOptionImage(index: number, file: File) {
    if (!gameId) return
    const url = await uploadChallengeMedia(file, gameId)
    if (url) {
      const options = [...config.options]
      options[index] = { ...options[index], image_url: url }
      onChange({ ...config, options })
    }
  }

  async function clearOptionImage(index: number) {
    const option = config.options[index]
    if (option.image_url) {
      await deleteChallengeMedia(option.image_url)
    }
    const options = [...config.options]
    options[index] = { ...options[index], image_url: undefined }
    onChange({ ...config, options })
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-text-muted">Opties</p>
      {config.options.map((option, i) => (
        <div key={i} className="space-y-2 p-3 rounded-lg bg-surface-overlay/30">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => toggleCorrect(i)}
              className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                option.is_correct ? 'border-lime bg-lime' : 'border-surface-overlay'
              }`}
            >
              {option.is_correct && <span className="w-2 h-2 rounded-full bg-void" />}
            </button>
            <Input
              value={option.text}
              onChange={(e) => updateOption(i, e.target.value)}
              placeholder={`Optie ${i + 1}`}
              className="flex-1"
            />
            <button
              type="button"
              onClick={() => removeOption(i)}
              className="p-1.5 text-text-faint hover:text-magenta-ink transition-colors"
              disabled={config.options.length <= 2}
            >
              <Trash2 size={14} />
            </button>
          </div>
          {/* Option image */}
          {option.image_url ? (
            <div className="relative ml-7 inline-block">
              <img src={option.image_url} alt="" className="h-20 rounded object-cover" />
              <button
                type="button"
                onClick={() => clearOptionImage(i)}
                className="absolute -top-1 -right-1 p-0.5 rounded-full bg-surface text-text-muted hover:text-magenta-ink transition-colors"
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <label className="ml-7 flex items-center gap-1.5 text-xs text-text-faint hover:text-text-muted cursor-pointer transition-colors">
              <ImagePlus size={14} />
              <span>Afbeelding toevoegen</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) handleOptionImage(i, file)
                }}
              />
            </label>
          )}
        </div>
      ))}
      <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={addOption}>
        <Plus size={14} /> Optie toevoegen
      </Button>
      <Toggle
        label="Meerdere juiste antwoorden toestaan"
        checked={config.allow_multiple}
        onChange={(v) => onChange({ ...config, allow_multiple: v })}
      />
    </div>
  )
}

function FreeTextEditor({ config, onChange }: { config: FreeTextConfig; onChange: (c: ChallengeConfig) => void }) {
  return (
    <div className="space-y-3">
      <Input
        id="correct-answer"
        label="Juiste antwoord"
        value={config.correct_answer}
        onChange={(e) => onChange({ ...config, correct_answer: e.target.value })}
        placeholder="Het verwachte antwoord"
      />
      <div className="pl-1">
        <AlternativesEditor
          value={config.alternatives}
          onChange={(alternatives) => onChange({ ...config, alternatives })}
        />
      </div>
      <p className="text-xs text-text-faint">
        Hoofdletters, accenten en spaties maken niet uit — "Van Gogh" en "vangogh" tellen allebei.
        Zet hier alleen écht andere antwoorden bij.
      </p>
      <Toggle
        label="Typo's toestaan (fuzzy matching)"
        description="Klein verschil tussen invoer en juist antwoord wordt geaccepteerd (1-2 typo's afhankelijk van lengte)"
        checked={config.fuzzy ?? false}
        onChange={(v) => onChange({ ...config, fuzzy: v })}
      />
    </div>
  )
}

function OpenDoorEditor({ config, onChange }: { config: OpenDoorConfig; onChange: (c: ChallengeConfig) => void }) {
  // Ensure exactly 4 answer slots (defensive)
  const answers = config.answers.length === 4
    ? config.answers
    : [
        ...config.answers.slice(0, 4),
        ...Array(Math.max(0, 4 - config.answers.length)).fill({ text: '', points: 10 }),
      ]

  // Backward-compat defaults for fields added later
  const scoringMode = config.scoring_mode ?? 'fixed'
  const placements: PlacementReward[] = config.placements ?? [
    { place: 1, points: 30 },
    { place: 2, points: 20 },
    { place: 3, points: 10 },
  ]
  const attempts = config.attempts ?? { unlimited: true, max: 10 }

  function updateAnswer(i: number, patch: Partial<OpenDoorAnswer>) {
    const next = [...answers]
    next[i] = { ...next[i], ...patch }
    onChange({ ...config, answers: next })
  }

  function updatePlacements(next: PlacementReward[]) {
    onChange({ ...config, placements: next })
  }

  function addPlace() {
    const nextPlace = (placements[placements.length - 1]?.place ?? 0) + 1
    updatePlacements([...placements, { place: nextPlace, points: 0 }])
  }

  function removePlace(idx: number) {
    updatePlacements(placements.filter((_, i) => i !== idx))
  }

  // Totals shown to admin
  const totalFixed = answers.reduce((sum, a) => sum + (a.points || 0), 0)
  const totalPlacementBestCase = (placements[0]?.points ?? 0) * answers.length

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted">
        Vier verwachte antwoorden. Spelers typen ze één voor één in.
      </p>

      {/* Scoring mode picker */}
      <div className="flex gap-2">
        {(['fixed', 'placement'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => onChange({ ...config, scoring_mode: mode, placements })}
            className={cn(
              'flex-1 px-3 py-2 rounded-lg text-sm font-medium border-2 transition-all',
              scoringMode === mode
                ? 'border-neon bg-neon/10 text-neon-ink'
                : 'border-surface-overlay bg-surface-raised text-text-muted hover:border-text-faint',
            )}
          >
            {mode === 'fixed' ? 'Vaste punten' : 'Placement'}
          </button>
        ))}
      </div>
      <p className="text-xs text-text-faint">
        {scoringMode === 'fixed'
          ? 'Elk team krijgt dezelfde punten voor een gevonden antwoord.'
          : 'Eerste team dat een antwoord vindt krijgt de meeste punten, latere teams minder. Per antwoord apart.'}
      </p>

      {/* Answers */}
      <div className="space-y-2">
        {answers.map((answer, i) => (
          <div key={i} className="flex gap-2 items-start p-2.5 rounded-lg bg-surface-overlay/30">
            <span className="font-display text-neon-ink font-bold w-6 text-center pt-2.5">{i + 1}</span>
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="flex gap-2 items-start">
                <Input
                  value={answer.text}
                  onChange={(e) => updateAnswer(i, { text: e.target.value })}
                  placeholder={`Antwoord ${i + 1}`}
                  className="flex-1"
                />
                {scoringMode === 'fixed' && (
                  <div className="w-24">
                    <Input
                      type="number"
                      min={0}
                      value={answer.points}
                      onChange={(e) => updateAnswer(i, { points: parseInt(e.target.value) || 0 })}
                      placeholder="Pt"
                    />
                  </div>
                )}
              </div>
              <AlternativesEditor
                value={answer.alternatives}
                onChange={(alternatives) => updateAnswer(i, { alternatives })}
              />
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-text-faint">
        Hoofdletters, accenten en spaties maken niet uit. Gebruik "ook goed rekenen" voor écht
        andere antwoorden, bijvoorbeeld "JFK" naast "John F. Kennedy".
      </p>

      {/* Placement table */}
      {scoringMode === 'placement' && (
        <div className="space-y-2 p-3 rounded-lg bg-surface-overlay/20 border border-surface-overlay">
          <p className="text-xs font-medium text-text-muted uppercase tracking-wider">
            Placement (geldt per antwoord)
          </p>
          {placements.map((p, i) => (
            <div key={i} className="flex gap-2 items-center">
              <span className="text-text-muted text-sm w-16">{p.place}e team</span>
              <div className="flex-1">
                <Input
                  type="number"
                  min={0}
                  value={p.points}
                  onChange={(e) => {
                    const next = [...placements]
                    next[i] = { ...p, points: parseInt(e.target.value) || 0 }
                    updatePlacements(next)
                  }}
                />
              </div>
              <span className="text-xs text-text-faint shrink-0">ptn</span>
              <button
                type="button"
                onClick={() => removePlace(i)}
                className="p-1.5 text-text-faint hover:text-magenta-ink transition-colors"
                disabled={placements.length <= 1}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={addPlace}
            className="flex items-center gap-1 text-xs text-neon-ink hover:text-neon-ink-dim transition-colors mt-1"
          >
            <Plus size={12} /> Plaats toevoegen
          </button>
          <p className="text-xs text-text-faint">
            Teams die later komen dan {placements.length}e krijgen 0 ptn.
          </p>
        </div>
      )}

      {/* Attempts */}
      <div className="space-y-2 p-3 rounded-lg bg-surface-overlay/20 border border-surface-overlay">
        <p className="text-xs font-medium text-text-muted uppercase tracking-wider">Pogingen</p>
        <Toggle
          label="Onbeperkt"
          description="Speler kan blijven proberen tot alle 4 gevonden zijn"
          checked={attempts.unlimited}
          onChange={(v) => onChange({ ...config, attempts: { ...attempts, unlimited: v } })}
        />
        {!attempts.unlimited && (
          <div>
            <label className="text-xs text-text-muted">Max foute pogingen (totaal)</label>
            <Input
              type="number"
              min={1}
              value={attempts.max}
              onChange={(e) => onChange({ ...config, attempts: { ...attempts, max: Math.max(1, parseInt(e.target.value) || 1) } })}
            />
            <p className="text-xs text-text-faint mt-1">
              Goede antwoorden kosten geen poging. Na {attempts.max} foute pogingen wordt de
              challenge automatisch afgerond met de punten die al verdiend zijn.
            </p>
          </div>
        )}
      </div>

      <p className="text-xs text-text-faint">
        Maximaal mogelijk per team:{' '}
        <span className="text-text">
          {scoringMode === 'fixed' ? totalFixed : totalPlacementBestCase} ptn
        </span>
        {scoringMode === 'placement' && ' (als 1e voor alle 4)'}
      </p>

      <Toggle
        label="Typo's toestaan (fuzzy matching)"
        description="Klein verschil tussen invoer en juist antwoord wordt geaccepteerd (1-2 typo's afhankelijk van lengte)"
        checked={config.fuzzy}
        onChange={(v) => onChange({ ...config, fuzzy: v })}
      />
    </div>
  )
}

function PuzzleEditor({ config, onChange }: { config: PuzzleConfig; onChange: (c: ChallengeConfig) => void }) {
  // Defensive normalization: ensure 12 terms + 3 themes always
  const terms = config.terms.length === 12
    ? config.terms
    : [...config.terms, ...Array(Math.max(0, 12 - config.terms.length)).fill('')].slice(0, 12)
  const themes = config.themes.length === 3
    ? config.themes
    : [
        ...config.themes.slice(0, 3),
        ...Array(Math.max(0, 3 - config.themes.length)).fill(null).map((_, i) => ({
          name: '',
          term_indices: [i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 3],
          max_attempts: 3,
          points: 30,
        })),
      ]

  const scoringMode = config.scoring_mode ?? 'fixed'
  const placements: PlacementReward[] = config.placements ?? [
    { place: 1, points: 30 },
    { place: 2, points: 20 },
    { place: 3, points: 10 },
  ]

  function updateTerm(i: number, value: string) {
    const next = [...terms]
    next[i] = value
    onChange({ ...config, terms: next })
  }

  function updateTheme(i: number, patch: Partial<typeof themes[number]>) {
    const next = [...themes]
    next[i] = { ...next[i], ...patch }
    onChange({ ...config, themes: next })
  }

  function toggleTermInTheme(themeIdx: number, termIdx: number) {
    const theme = themes[themeIdx]
    const current = theme.term_indices
    const isSelected = current.includes(termIdx)
    let nextIndices: number[]
    if (isSelected) {
      nextIndices = current.filter((i) => i !== termIdx)
    } else {
      if (current.length >= 4) return // already at 4
      // Check if other themes use this term — if so, remove from those
      const otherThemes = themes.map((t, i) => i === themeIdx
        ? t
        : { ...t, term_indices: t.term_indices.filter((idx) => idx !== termIdx) })
      otherThemes[themeIdx] = { ...theme, term_indices: [...current, termIdx].sort((a, b) => a - b) }
      onChange({ ...config, themes: otherThemes })
      return
    }
    updateTheme(themeIdx, { term_indices: nextIndices })
  }

  // Theme-color per index for the visual grouping in the term grid
  const themeColors = ['bg-neon/20 border-neon', 'bg-amber/20 border-amber', 'bg-magenta/20 border-magenta']
  function colorForTerm(termIdx: number): string | null {
    for (let i = 0; i < themes.length; i++) {
      if (themes[i].term_indices.includes(termIdx)) return themeColors[i]
    }
    return null
  }

  // Validation hints
  const usedCount = new Map<number, number>()
  themes.forEach((t) => t.term_indices.forEach((i) => usedCount.set(i, (usedCount.get(i) ?? 0) + 1)))
  const unassigned = terms.map((_, i) => i).filter((i) => !usedCount.has(i))
  const overlapping = Array.from(usedCount.entries()).filter(([, c]) => c > 1).map(([i]) => i)
  const wrongCountThemes = themes.map((t, i) => ({ i, count: t.term_indices.length })).filter((x) => x.count !== 4)

  const totalFixed = themes.reduce((sum, t) => sum + (t.points || 0), 0)
  const totalPlacementBest = (placements[0]?.points ?? 0) * themes.length

  function updatePlacements(next: PlacementReward[]) {
    onChange({ ...config, placements: next })
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-text-muted">
        Speler ziet 12 termen en moet de 3 thema's raden. Een foute gok kost een poging bij élk nog niet
        opgelost thema — themas met meer pogingen blijven dus langer bereikbaar.
      </p>

      {/* 12 terms grid editor */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-text-muted uppercase tracking-wider">12 termen</p>
        <div className="grid grid-cols-2 gap-2">
          {terms.map((term, i) => {
            const color = colorForTerm(i)
            return (
              <div key={i} className={cn(
                'flex items-center gap-1.5 p-1.5 rounded-lg border-2',
                color ?? 'border-surface-overlay bg-surface-overlay/30',
              )}>
                <span className="text-text-faint text-xs font-mono w-5 text-center shrink-0">{i + 1}</span>
                <input
                  type="text"
                  value={term}
                  onChange={(e) => updateTerm(i, e.target.value)}
                  placeholder={`Term ${i + 1}`}
                  className="flex-1 min-w-0 bg-transparent text-sm text-text placeholder:text-text-faint outline-none"
                />
              </div>
            )
          })}
        </div>
        {unassigned.length > 0 && (
          <p className="text-xs text-amber-ink">
            ⚠ {unassigned.length} term{unassigned.length !== 1 ? 'en' : ''} niet aan een thema toegewezen
          </p>
        )}
        {overlapping.length > 0 && (
          <p className="text-xs text-magenta-ink">
            ⚠ Term{overlapping.length !== 1 ? 'en' : ''} {overlapping.map((i) => i + 1).join(', ')} zit in meerdere thema's
          </p>
        )}
      </div>

      {/* Scoring mode picker (same pattern as Open Deur) */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-text-muted uppercase tracking-wider">Scoring</p>
        <div className="flex gap-2">
          {(['fixed', 'placement'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onChange({ ...config, scoring_mode: mode, placements })}
              className={cn(
                'flex-1 px-3 py-2 rounded-lg text-sm font-medium border-2 transition-all',
                scoringMode === mode
                  ? 'border-neon bg-neon/10 text-neon-ink'
                  : 'border-surface-overlay bg-surface-raised text-text-muted hover:border-text-faint',
              )}
            >
              {mode === 'fixed' ? 'Vaste punten' : 'Placement'}
            </button>
          ))}
        </div>
        <p className="text-xs text-text-faint">
          {scoringMode === 'fixed'
            ? 'Elk team krijgt vaste punten per opgelost thema.'
            : '1e team dat een thema raadt krijgt meer ptn dan latere teams. Per thema apart.'}
        </p>
      </div>

      {/* 3 themes editor */}
      <div className="space-y-3">
        <p className="text-xs font-medium text-text-muted uppercase tracking-wider">3 thema's</p>
        {themes.map((theme, ti) => (
          <div key={ti} className={cn(
            'space-y-2 p-3 rounded-lg border-2',
            themeColors[ti].replace('bg-', 'bg-').replace('/20', '/5'),
          )}>
            <div className="flex items-center gap-2">
              <span className="font-display font-bold text-text-muted shrink-0">Thema {ti + 1}</span>
              <Input
                value={theme.name}
                onChange={(e) => updateTheme(ti, { name: e.target.value })}
                placeholder={`Themanaam (bv. Vogels)`}
                className="flex-1"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-text-muted">Max pogingen</label>
                <Input
                  type="number"
                  min={1}
                  value={theme.max_attempts}
                  onChange={(e) => updateTheme(ti, { max_attempts: Math.max(1, parseInt(e.target.value) || 1) })}
                />
              </div>
              {scoringMode === 'fixed' && (
                <div>
                  <label className="text-xs text-text-muted">Punten (vast)</label>
                  <Input
                    type="number"
                    min={0}
                    value={theme.points}
                    onChange={(e) => updateTheme(ti, { points: parseInt(e.target.value) || 0 })}
                  />
                </div>
              )}
            </div>
            <div>
              <p className="text-xs text-text-muted mb-1">
                Termen voor dit thema ({theme.term_indices.length}/4)
              </p>
              <div className="grid grid-cols-4 gap-1.5">
                {terms.map((term, ti2) => {
                  const inThis = theme.term_indices.includes(ti2)
                  const inOther = themes.some((other, oi) => oi !== ti && other.term_indices.includes(ti2))
                  return (
                    <button
                      key={ti2}
                      type="button"
                      onClick={() => toggleTermInTheme(ti, ti2)}
                      className={cn(
                        'px-2 py-1 rounded text-xs text-left transition-all border',
                        inThis
                          ? 'border-neon bg-neon/15 text-neon-ink'
                          : inOther
                            ? 'border-surface-overlay bg-surface-overlay/20 text-text-faint'
                            : 'border-surface-overlay bg-surface-raised text-text-muted hover:border-text-faint',
                      )}
                      title={inOther ? 'Zit al in een ander thema — kies dit om het over te zetten' : ''}
                    >
                      <span className="font-mono text-text-faint mr-1">{ti2 + 1}</span>
                      <span className="truncate">{term || '—'}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        ))}
        {wrongCountThemes.length > 0 && (
          <p className="text-xs text-amber-ink">
            ⚠ Elk thema moet exact 4 termen hebben.
          </p>
        )}
      </div>

      {/* Placement table */}
      {scoringMode === 'placement' && (
        <div className="space-y-2 p-3 rounded-lg bg-surface-overlay/20 border border-surface-overlay">
          <p className="text-xs font-medium text-text-muted uppercase tracking-wider">
            Placement (geldt per thema)
          </p>
          {placements.map((p, i) => (
            <div key={i} className="flex gap-2 items-center">
              <span className="text-text-muted text-sm w-16">{p.place}e team</span>
              <div className="flex-1">
                <Input
                  type="number"
                  min={0}
                  value={p.points}
                  onChange={(e) => {
                    const next = [...placements]
                    next[i] = { ...p, points: parseInt(e.target.value) || 0 }
                    updatePlacements(next)
                  }}
                />
              </div>
              <span className="text-xs text-text-faint shrink-0">ptn</span>
              <button
                type="button"
                onClick={() => updatePlacements(placements.filter((_, idx) => idx !== i))}
                className="p-1.5 text-text-faint hover:text-magenta-ink transition-colors"
                disabled={placements.length <= 1}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => {
              const nextPlace = (placements[placements.length - 1]?.place ?? 0) + 1
              updatePlacements([...placements, { place: nextPlace, points: 0 }])
            }}
            className="flex items-center gap-1 text-xs text-neon-ink hover:text-neon-ink-dim transition-colors"
          >
            <Plus size={12} /> Plaats toevoegen
          </button>
        </div>
      )}

      <p className="text-xs text-text-faint">
        Maximaal mogelijk per team:{' '}
        <span className="text-text">
          {scoringMode === 'fixed' ? totalFixed : totalPlacementBest} ptn
        </span>
        {scoringMode === 'placement' && ' (als 1e voor alle 3)'}
      </p>

      <Toggle
        label="Typo's toestaan op themanaam"
        description="Kleine spelfouten in de themanaam worden geaccepteerd"
        checked={config.fuzzy}
        onChange={(v) => onChange({ ...config, fuzzy: v })}
      />
    </div>
  )
}

function GalleryEditor({ config, onChange, gameId }: { config: GalleryConfig; onChange: (c: ChallengeConfig) => void; gameId?: string }) {
  const items = config.items ?? []
  const scoringMode = config.scoring_mode ?? 'fixed'
  const placements: PlacementReward[] = config.placements ?? [
    { place: 1, points: 20 },
    { place: 2, points: 10 },
    { place: 3, points: 5 },
  ]
  const attempts = config.attempts ?? { unlimited: true, max: 5 }

  function updateItem(i: number, patch: Partial<GalleryItem>) {
    const next = [...items]
    next[i] = { ...next[i], ...patch }
    onChange({ ...config, items: next })
  }

  function addItem() {
    onChange({
      ...config,
      items: [...items, { media: { url: '', type: 'image' }, answer: '', points: 10 }],
    })
  }

  async function removeItem(i: number) {
    const item = items[i]
    if (item?.media?.url) await deleteChallengeMedia(item.media.url)
    onChange({ ...config, items: items.filter((_, idx) => idx !== i) })
  }

  async function handleImageUpload(i: number, file: File) {
    if (!gameId) return
    const url = await uploadChallengeMedia(file, gameId)
    if (url) {
      updateItem(i, { media: { url, type: 'image' } })
    }
  }

  async function clearImage(i: number) {
    const item = items[i]
    if (item?.media?.url) await deleteChallengeMedia(item.media.url)
    updateItem(i, { media: { url: '', type: 'image' } })
  }

  function updatePlacements(next: PlacementReward[]) {
    onChange({ ...config, placements: next })
  }

  const totalFixed = items.reduce((sum, item) => sum + (item.points || 0), 0)
  const totalPlacementBest = (placements[0]?.points ?? 0) * items.length
  const itemsMissingImage = items.filter((it) => !it.media?.url).length
  const itemsMissingAnswer = items.filter((it) => !it.answer?.trim()).length

  return (
    <div className="space-y-5">
      <p className="text-sm text-text-muted">
        Set foto's met een antwoord per foto onder één thema. Speler tikt antwoorden één voor één in,
        server bepaalt zelf bij welke foto het hoort.
      </p>

      {/* Theme */}
      <div className="space-y-2">
        <Input
          label="Overkoepelend thema"
          value={config.theme ?? ''}
          onChange={(e) => onChange({ ...config, theme: e.target.value })}
          placeholder="Bijv. Acteurs in Disney-films"
        />
        <Toggle
          label="Thema tonen aan speler"
          description="Als hint zichtbaar bovenaan de challenge"
          checked={config.show_theme}
          onChange={(v) => onChange({ ...config, show_theme: v })}
        />
      </div>

      {/* Scoring mode */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-text-muted uppercase tracking-wider">Scoring</p>
        <div className="flex gap-2">
          {(['fixed', 'placement'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onChange({ ...config, scoring_mode: mode, placements })}
              className={cn(
                'flex-1 px-3 py-2 rounded-lg text-sm font-medium border-2 transition-all',
                scoringMode === mode
                  ? 'border-neon bg-neon/10 text-neon-ink'
                  : 'border-surface-overlay bg-surface-raised text-text-muted hover:border-text-faint',
              )}
            >
              {mode === 'fixed' ? 'Vaste punten' : 'Placement'}
            </button>
          ))}
        </div>
        <p className="text-xs text-text-faint">
          {scoringMode === 'fixed'
            ? 'Vaste punten per goed antwoord.'
            : '1e team met antwoord X = meeste ptn. Per foto apart.'}
        </p>
      </div>

      {/* Items */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-text-muted uppercase tracking-wider">
          Foto's ({items.length})
        </p>
        <div className="space-y-2">
          {items.map((item, i) => (
            <div key={i} className="flex gap-2 p-2 rounded-lg bg-surface-overlay/30 border border-surface-overlay">
              {/* Image */}
              <div className="shrink-0">
                {item.media?.url ? (
                  <div className="relative">
                    <img src={item.media.url} alt="" className="w-20 h-20 object-cover rounded" />
                    <button
                      type="button"
                      onClick={() => clearImage(i)}
                      className="absolute -top-1 -right-1 p-0.5 rounded-full bg-surface text-text-muted hover:text-magenta-ink transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <label className="w-20 h-20 flex flex-col items-center justify-center gap-1 rounded border-2 border-dashed border-surface-overlay cursor-pointer hover:border-text-faint transition-colors">
                    <ImagePlus size={18} className="text-text-faint" />
                    <span className="text-[10px] text-text-faint">Upload</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) handleImageUpload(i, file)
                      }}
                    />
                  </label>
                )}
              </div>
              {/* Answer + points + delete */}
              <div className="flex-1 min-w-0 space-y-1.5">
                <Input
                  value={item.answer ?? ''}
                  onChange={(e) => updateItem(i, { answer: e.target.value })}
                  placeholder={`Antwoord ${i + 1}`}
                />
                <AlternativesEditor
                  value={item.alternatives}
                  onChange={(alternatives) => updateItem(i, { alternatives })}
                />
                <div className="flex gap-2 items-center">
                  {scoringMode === 'fixed' && (
                    <div className="w-24">
                      <Input
                        type="number"
                        min={0}
                        value={item.points}
                        onChange={(e) => updateItem(i, { points: parseInt(e.target.value) || 0 })}
                        placeholder="Pt"
                      />
                    </div>
                  )}
                  <span className="text-xs text-text-faint">{scoringMode === 'fixed' ? 'ptn' : ''}</span>
                  <div className="flex-1" />
                  <button
                    type="button"
                    onClick={() => removeItem(i)}
                    className="p-1.5 text-text-faint hover:text-magenta-ink transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={addItem}>
          <Plus size={14} /> Foto toevoegen
        </Button>
        {itemsMissingImage > 0 && (
          <p className="text-xs text-amber-ink">⚠ {itemsMissingImage} foto{itemsMissingImage !== 1 ? "'s" : ''} mist een afbeelding</p>
        )}
        {itemsMissingAnswer > 0 && (
          <p className="text-xs text-amber-ink">⚠ {itemsMissingAnswer} foto{itemsMissingAnswer !== 1 ? "'s" : ''} mist een antwoord</p>
        )}
      </div>

      {/* Placement table */}
      {scoringMode === 'placement' && (
        <div className="space-y-2 p-3 rounded-lg bg-surface-overlay/20 border border-surface-overlay">
          <p className="text-xs font-medium text-text-muted uppercase tracking-wider">
            Placement (geldt per foto)
          </p>
          {placements.map((p, i) => (
            <div key={i} className="flex gap-2 items-center">
              <span className="text-text-muted text-sm w-16">{p.place}e team</span>
              <div className="flex-1">
                <Input
                  type="number"
                  min={0}
                  value={p.points}
                  onChange={(e) => {
                    const next = [...placements]
                    next[i] = { ...p, points: parseInt(e.target.value) || 0 }
                    updatePlacements(next)
                  }}
                />
              </div>
              <span className="text-xs text-text-faint shrink-0">ptn</span>
              <button
                type="button"
                onClick={() => updatePlacements(placements.filter((_, idx) => idx !== i))}
                className="p-1.5 text-text-faint hover:text-magenta-ink transition-colors"
                disabled={placements.length <= 1}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => {
              const nextPlace = (placements[placements.length - 1]?.place ?? 0) + 1
              updatePlacements([...placements, { place: nextPlace, points: 0 }])
            }}
            className="flex items-center gap-1 text-xs text-neon-ink hover:text-neon-ink-dim transition-colors"
          >
            <Plus size={12} /> Plaats toevoegen
          </button>
        </div>
      )}

      {/* Attempts */}
      <div className="space-y-2 p-3 rounded-lg bg-surface-overlay/20 border border-surface-overlay">
        <p className="text-xs font-medium text-text-muted uppercase tracking-wider">Pogingen</p>
        <Toggle
          label="Onbeperkt"
          description="Speler kan blijven proberen tot tijd op is of alle foto's gevonden"
          checked={attempts.unlimited}
          onChange={(v) => onChange({ ...config, attempts: { ...attempts, unlimited: v } })}
        />
        {!attempts.unlimited && (
          <div>
            <label className="text-xs text-text-muted">Max foute pogingen (totaal)</label>
            <Input
              type="number"
              min={1}
              value={attempts.max}
              onChange={(e) => onChange({ ...config, attempts: { ...attempts, max: Math.max(1, parseInt(e.target.value) || 1) } })}
            />
            <p className="text-xs text-text-faint mt-1">
              Na {attempts.max} foute pogingen wordt de challenge automatisch afgerond.
            </p>
          </div>
        )}
      </div>

      <p className="text-xs text-text-faint">
        Maximaal mogelijk per team:{' '}
        <span className="text-text">
          {scoringMode === 'fixed' ? totalFixed : totalPlacementBest} ptn
        </span>
        {scoringMode === 'placement' && items.length > 0 && ` (als 1e voor alle ${items.length})`}
      </p>

      <Toggle
        label="Typo's toestaan (fuzzy matching)"
        description="Klein verschil tussen invoer en juist antwoord wordt geaccepteerd"
        checked={config.fuzzy}
        onChange={(v) => onChange({ ...config, fuzzy: v })}
      />
    </div>
  )
}

function CollectiveMemoryEditor({ config, onChange }: { config: CollectiveMemoryConfig; onChange: (c: ChallengeConfig) => void }) {
  // Defensive: always exactly 5 keywords
  const keywords: CollectiveMemoryKeyword[] = config.keywords.length === 5
    ? config.keywords
    : [
        ...config.keywords.slice(0, 5),
        ...Array(Math.max(0, 5 - config.keywords.length)).fill(null).map((_, i) => ({
          text: '',
          points: (i + 1) * 10,
        })),
      ]

  const scoringMode = config.scoring_mode ?? 'fixed'
  const placements: PlacementReward[] = config.placements ?? [
    { place: 1, points: 30 },
    { place: 2, points: 20 },
    { place: 3, points: 10 },
  ]
  const attempts = config.attempts ?? { unlimited: false, max: 5 }

  function updateKeyword(i: number, patch: Partial<CollectiveMemoryKeyword>) {
    const next = [...keywords]
    next[i] = { ...next[i], ...patch }
    onChange({ ...config, keywords: next })
  }

  function updatePlacements(next: PlacementReward[]) {
    onChange({ ...config, placements: next })
  }

  const totalFixed = keywords.reduce((sum, k) => sum + (k.points || 0), 0)
  const totalPlacementBest = (placements[0]?.points ?? 0) * keywords.length

  return (
    <div className="space-y-5">
      <p className="text-sm text-text-muted">
        Voeg het beeldfragment toe via Challenge Prompt (media-upload bovenaan). Speler ziet de media + 5 trefwoord-slots
        met oplopende waardes (10/20/30/40/50 ptn typisch). Hoogste waarde = lastigste/meest specifiek.
      </p>

      {/* Scoring mode */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-text-muted uppercase tracking-wider">Scoring</p>
        <div className="flex gap-2">
          {(['fixed', 'placement'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onChange({ ...config, scoring_mode: mode, placements })}
              className={cn(
                'flex-1 px-3 py-2 rounded-lg text-sm font-medium border-2 transition-all',
                scoringMode === mode
                  ? 'border-neon bg-neon/10 text-neon-ink'
                  : 'border-surface-overlay bg-surface-raised text-text-muted hover:border-text-faint',
              )}
            >
              {mode === 'fixed' ? 'Vaste punten' : 'Placement'}
            </button>
          ))}
        </div>
        <p className="text-xs text-text-faint">
          {scoringMode === 'fixed'
            ? 'Vaste punten per trefwoord (oplopend).'
            : '1e team met trefwoord X = meeste ptn. Per trefwoord apart.'}
        </p>
      </div>

      {/* 5 keyword rows */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-text-muted uppercase tracking-wider">5 trefwoorden</p>
        {keywords.map((kw, i) => (
          <div key={i} className="flex gap-2 items-start p-2.5 rounded-lg bg-surface-overlay/30">
            <span className="font-display text-neon-ink font-bold w-6 text-center pt-2.5">{i + 1}</span>
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="flex gap-2 items-start">
                <Input
                  value={kw.text}
                  onChange={(e) => updateKeyword(i, { text: e.target.value })}
                  placeholder={`Trefwoord ${i + 1}`}
                  className="flex-1"
                />
                {scoringMode === 'fixed' && (
                  <div className="w-24">
                    <Input
                      type="number"
                      min={0}
                      value={kw.points}
                      onChange={(e) => updateKeyword(i, { points: parseInt(e.target.value) || 0 })}
                      placeholder="Pt"
                    />
                  </div>
                )}
              </div>
              <AlternativesEditor
                value={kw.alternatives}
                onChange={(alternatives) => updateKeyword(i, { alternatives })}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Placement table */}
      {scoringMode === 'placement' && (
        <div className="space-y-2 p-3 rounded-lg bg-surface-overlay/20 border border-surface-overlay">
          <p className="text-xs font-medium text-text-muted uppercase tracking-wider">
            Placement (geldt per trefwoord)
          </p>
          {placements.map((p, i) => (
            <div key={i} className="flex gap-2 items-center">
              <span className="text-text-muted text-sm w-16">{p.place}e team</span>
              <div className="flex-1">
                <Input
                  type="number"
                  min={0}
                  value={p.points}
                  onChange={(e) => {
                    const next = [...placements]
                    next[i] = { ...p, points: parseInt(e.target.value) || 0 }
                    updatePlacements(next)
                  }}
                />
              </div>
              <span className="text-xs text-text-faint shrink-0">ptn</span>
              <button
                type="button"
                onClick={() => updatePlacements(placements.filter((_, idx) => idx !== i))}
                className="p-1.5 text-text-faint hover:text-magenta-ink transition-colors"
                disabled={placements.length <= 1}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => {
              const nextPlace = (placements[placements.length - 1]?.place ?? 0) + 1
              updatePlacements([...placements, { place: nextPlace, points: 0 }])
            }}
            className="flex items-center gap-1 text-xs text-neon-ink hover:text-neon-ink-dim transition-colors"
          >
            <Plus size={12} /> Plaats toevoegen
          </button>
        </div>
      )}

      {/* Attempts */}
      <div className="space-y-2 p-3 rounded-lg bg-surface-overlay/20 border border-surface-overlay">
        <p className="text-xs font-medium text-text-muted uppercase tracking-wider">Pogingen</p>
        <Toggle
          label="Onbeperkt"
          description="Speler kan blijven proberen tot tijd op is of alle trefwoorden gevonden"
          checked={attempts.unlimited}
          onChange={(v) => onChange({ ...config, attempts: { ...attempts, unlimited: v } })}
        />
        {!attempts.unlimited && (
          <div>
            <label className="text-xs text-text-muted">Max foute pogingen (totaal)</label>
            <Input
              type="number"
              min={1}
              value={attempts.max}
              onChange={(e) => onChange({ ...config, attempts: { ...attempts, max: Math.max(1, parseInt(e.target.value) || 1) } })}
            />
            <p className="text-xs text-text-faint mt-1">
              Na {attempts.max} foute pogingen wordt de challenge automatisch afgerond.
            </p>
          </div>
        )}
      </div>

      <p className="text-xs text-text-faint">
        Maximaal mogelijk per team:{' '}
        <span className="text-text">
          {scoringMode === 'fixed' ? totalFixed : totalPlacementBest} ptn
        </span>
        {scoringMode === 'placement' && ` (als 1e voor alle 5)`}
      </p>

      <Toggle
        label="Typo's toestaan (fuzzy matching)"
        description="Klein verschil tussen invoer en juist trefwoord wordt geaccepteerd"
        checked={config.fuzzy}
        onChange={(v) => onChange({ ...config, fuzzy: v })}
      />
    </div>
  )
}

