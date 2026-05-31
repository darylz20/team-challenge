import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Copy, Check, Plus, Trash2, GripVertical, RefreshCw, X, ChevronUp, ChevronDown, ImagePlus, Loader2 } from 'lucide-react'
import { PageHeader } from '../../components/layout/PageHeader'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Textarea } from '../../components/ui/Textarea'
import { Badge } from '../../components/ui/Badge'
import { Tabs } from '../../components/ui/Tabs'
import { EmptyState } from '../../components/ui/EmptyState'
import { useGame } from '../../hooks/useGames'
import { useChallenges } from '../../hooks/useChallenges'
import { useTeams } from '../../hooks/useTeams'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Challenge, IntroPage, Game } from '../../types'
import { uploadChallengeMedia, deleteChallengeMedia } from '../../lib/storage'
import { supabase } from '../../lib/supabase'
import { LeaderboardView } from '../Leaderboard'

export function GameEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { game, loading, updateGame, publishGame, unpublishGame, startGame, endGame, reopenGame } = useGame(id)
  const { challenges, deleteChallenge, reorderChallenges } = useChallenges(id)
  const { teams, createTeam, deleteTeam, regeneratePasscode, updateMembers } = useTeams(id)

  if (loading || !game) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-neon border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const tabs = [
    { label: 'Details', content: <DetailsTab game={game} updateGame={updateGame} publishGame={publishGame} unpublishGame={unpublishGame} startGame={startGame} endGame={endGame} reopenGame={reopenGame} /> },
    { label: 'Challenges', content: <ChallengesTab gameId={game.id} challenges={challenges} deleteChallenge={deleteChallenge} reorderChallenges={reorderChallenges} navigate={navigate} /> },
    { label: 'Teams', content: <TeamsTab teams={teams} createTeam={createTeam} deleteTeam={deleteTeam} regeneratePasscode={regeneratePasscode} updateMembers={updateMembers} /> },
    { label: 'Intro', content: <IntroTab game={game} updateGame={updateGame} /> },
    { label: 'Leaderboard', content: <div className="max-w-2xl"><LeaderboardView gameId={game.id} /></div> },
  ]

  return (
    <div className="animate-fade-in">
      <button onClick={() => navigate('/admin/games')} className="flex items-center gap-1 text-sm text-text-muted hover:text-neon transition-colors mb-4">
        <ArrowLeft size={16} /> Back to Games
      </button>
      <PageHeader title={game.title} subtitle={`Code: ${game.code}`} />
      <Tabs tabs={tabs} />
    </div>
  )
}

// ── Details Tab ──
function DetailsTab({ game, updateGame, publishGame, unpublishGame, startGame, endGame, reopenGame }: {
  game: NonNullable<ReturnType<typeof useGame>['game']>
  updateGame: ReturnType<typeof useGame>['updateGame']
  publishGame: ReturnType<typeof useGame>['publishGame']
  unpublishGame: ReturnType<typeof useGame>['unpublishGame']
  startGame: ReturnType<typeof useGame>['startGame']
  endGame: ReturnType<typeof useGame>['endGame']
  reopenGame: ReturnType<typeof useGame>['reopenGame']
}) {
  const [title, setTitle] = useState(game.title)
  const [description, setDescription] = useState(game.description ?? '')
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  async function handleSave() {
    setSaving(true)
    await updateGame({ title, description })
    setSaving(false)
  }

  function copyCode() {
    navigator.clipboard.writeText(game.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-4 max-w-lg">
      <div className="flex items-center gap-3">
        <Badge
          variant={
            game.status === 'active' ? 'lime' :
            game.status === 'published' ? 'neon' :
            game.status === 'finished' ? 'amber' : 'muted'
          }
        >
          {game.status}
        </Badge>
        <button onClick={copyCode} className="flex items-center gap-1 text-xs font-mono text-text-muted hover:text-neon transition-colors">
          {game.code}
          {copied ? <Check size={12} className="text-lime" /> : <Copy size={12} />}
        </button>
      </div>

      <Input id="title" label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <Textarea id="desc" label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />

      <div className="flex flex-wrap gap-3 pt-2">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>

        {game.status === 'draft' && (
          <Button variant="secondary" onClick={publishGame}>Publish</Button>
        )}

        {game.status === 'published' && (
          <>
            <Button variant="secondary" onClick={startGame}>Start game</Button>
            <Button variant="ghost" onClick={unpublishGame}>Unpublish</Button>
          </>
        )}

        {game.status === 'active' && (
          <Button
            variant="ghost"
            onClick={() => {
              if (confirm('Game beëindigen? Teams kunnen daarna geen challenges meer doen.')) {
                endGame()
              }
            }}
          >
            End game
          </Button>
        )}

        {game.status === 'finished' && (
          <Button variant="ghost" onClick={reopenGame}>Reopen game</Button>
        )}
      </div>

      {/* Status flow hint */}
      <div className="text-xs text-text-faint pt-1">
        <span className="font-mono">draft → published → active → finished</span>
        <span className="ml-2">
          {game.status === 'draft' && '• Players can\'t see this game yet.'}
          {game.status === 'published' && '• Teams can log in. Intro is hidden until you Start game.'}
          {game.status === 'active' && '• Game is live. Intro carousel is shown, challenges are playable.'}
          {game.status === 'finished' && '• Game is closed. Leaderboard remains visible.'}
        </span>
      </div>
    </div>
  )
}

// ── Challenges Tab ──
function SortableChallenge({ challenge, onDelete, onEdit }: { challenge: Challenge; onDelete: () => void; onEdit: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: challenge.id })
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <div ref={setNodeRef} style={style}>
      <Card className="flex items-center gap-3 cursor-pointer hover:bg-surface-overlay/50 transition-colors" onClick={onEdit}>
        <button {...attributes} {...listeners} className="text-text-faint hover:text-text cursor-grab active:cursor-grabbing p-1">
          <GripVertical size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">{challenge.title}</p>
          <p className="text-xs text-text-muted capitalize">{challenge.type.replace('_', ' ')}</p>
        </div>
        <Badge variant="neon">{challenge.points} pts</Badge>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          className="p-1.5 text-text-faint hover:text-magenta transition-colors"
        >
          <Trash2 size={14} />
        </button>
      </Card>
    </div>
  )
}

function ChallengesTab({ gameId, challenges, deleteChallenge, reorderChallenges, navigate }: {
  gameId: string
  challenges: Challenge[]
  deleteChallenge: (id: string) => Promise<void>
  reorderChallenges: (ids: string[]) => Promise<void>
  navigate: ReturnType<typeof useNavigate>
}) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = challenges.findIndex((c) => c.id === active.id)
    const newIndex = challenges.findIndex((c) => c.id === over.id)
    const newOrder = [...challenges]
    const [moved] = newOrder.splice(oldIndex, 1)
    newOrder.splice(newIndex, 0, moved)
    reorderChallenges(newOrder.map((c) => c.id))
  }

  return (
    <div className="space-y-3">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={challenges.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {challenges.map((c) => (
            <SortableChallenge
              key={c.id}
              challenge={c}
              onDelete={() => deleteChallenge(c.id)}
              onEdit={() => navigate(`/admin/games/${gameId}/challenges/${c.id}`)}
            />
          ))}
        </SortableContext>
      </DndContext>

      {challenges.length === 0 && (
        <EmptyState
          icon={Plus}
          title="No challenges yet"
          description="Add challenges for players to complete"
          actionLabel="Add Challenge"
          onAction={() => navigate(`/admin/games/${gameId}/challenges/new`)}
        />
      )}

      {challenges.length > 0 && (
        <Button
          variant="secondary"
          className="w-full gap-2"
          onClick={() => navigate(`/admin/games/${gameId}/challenges/new`)}
        >
          <Plus size={16} /> Add Challenge
        </Button>
      )}
    </div>
  )
}

// ── Teams Tab ──
function TeamsTab({ teams, createTeam, deleteTeam, regeneratePasscode, updateMembers }: {
  teams: ReturnType<typeof useTeams>['teams']
  createTeam: ReturnType<typeof useTeams>['createTeam']
  deleteTeam: ReturnType<typeof useTeams>['deleteTeam']
  regeneratePasscode: ReturnType<typeof useTeams>['regeneratePasscode']
  updateMembers: ReturnType<typeof useTeams>['updateMembers']
}) {
  const [name, setName] = useState('')
  const [color, setColor] = useState('#00f0ff')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  async function handleCreate() {
    if (!name.trim()) return
    await createTeam(name.trim(), color)
    setName('')
  }

  function copyPasscode(team: { id: string; name: string; passcode: string }) {
    const text = `Team: ${team.name}\nPasscode: ${team.passcode}`
    navigator.clipboard.writeText(text)
    setCopiedId(team.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <div className="space-y-4 max-w-lg">
      <p className="text-sm text-text-muted">
        Each team gets a unique passcode. Share it with the player so they can log in.
      </p>

      <div className="flex gap-3">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Team name"
          className="flex-1"
        />
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="w-10 h-10 rounded-lg bg-surface border border-surface-overlay cursor-pointer"
        />
        <Button onClick={handleCreate} disabled={!name.trim()}>Add</Button>
      </div>

      <div className="space-y-2">
        {teams.map((team) => (
          <Card key={team.id} className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: team.color }} />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{team.name}</p>
                <p className="text-xs font-mono text-text-muted tracking-wider">{team.passcode}</p>
              </div>
              <button
                onClick={() => copyPasscode(team)}
                className="p-1.5 text-text-faint hover:text-neon transition-colors"
                title="Copy credentials"
              >
                {copiedId === team.id ? <Check size={14} className="text-lime" /> : <Copy size={14} />}
              </button>
              <button
                onClick={() => regeneratePasscode(team.id)}
                className="p-1.5 text-text-faint hover:text-amber transition-colors"
                title="Regenerate passcode"
              >
                <RefreshCw size={14} />
              </button>
              <button
                onClick={() => deleteTeam(team.id)}
                className="p-1.5 text-text-faint hover:text-magenta transition-colors"
                title="Delete team"
              >
                <Trash2 size={14} />
              </button>
            </div>
            <TeamMembersEditor
              members={team.member_names ?? []}
              onChange={(names) => updateMembers(team.id, names)}
            />
          </Card>
        ))}
      </div>

      {teams.length === 0 && (
        <p className="text-sm text-text-muted text-center py-4">No teams yet. Add teams for players to log in.</p>
      )}
    </div>
  )
}

// Member-names editor: chip list + inline add input
function TeamMembersEditor({ members, onChange }: { members: string[]; onChange: (next: string[]) => void }) {
  const [newName, setNewName] = useState('')

  function addMember() {
    const trimmed = newName.trim()
    if (!trimmed) return
    // Skip duplicates (case-insensitive)
    if (members.some((m) => m.toLowerCase() === trimmed.toLowerCase())) {
      setNewName('')
      return
    }
    onChange([...members, trimmed])
    setNewName('')
  }

  function removeMember(i: number) {
    onChange(members.filter((_, idx) => idx !== i))
  }

  return (
    <div className="border-t border-surface-overlay pt-2 space-y-2">
      <p className="text-[10px] font-medium text-text-faint uppercase tracking-wider">
        Members ({members.length})
      </p>
      {members.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {members.map((name, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-overlay/50 text-xs text-text"
            >
              {name}
              <button
                type="button"
                onClick={() => removeMember(i)}
                className="text-text-faint hover:text-magenta transition-colors"
                title="Remove"
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-1.5">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addMember()
            }
          }}
          placeholder="Add member name..."
          className="flex-1 bg-surface border border-surface-overlay rounded px-2.5 py-1 text-xs text-text placeholder:text-text-faint outline-none focus:border-neon"
        />
        <button
          type="button"
          onClick={addMember}
          disabled={!newName.trim()}
          className="px-2.5 py-1 rounded text-xs bg-neon/10 text-neon border border-neon/40 hover:bg-neon/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Add
        </button>
      </div>
    </div>
  )
}

// ── Intro Tab ──
function IntroTab({ game, updateGame }: {
  game: NonNullable<ReturnType<typeof useGame>['game']>
  updateGame: ReturnType<typeof useGame>['updateGame']
}) {
  const initialPages: IntroPage[] = game.intro_pages ?? []
  const [pages, setPages] = useState<IntroPage[]>(initialPages)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [resetting, setResetting] = useState(false)
  const [resetCount, setResetCount] = useState<number | null>(null)

  const dirty = JSON.stringify(pages) !== JSON.stringify(initialPages)

  async function handleSave() {
    setSaving(true)
    await updateGame({ intro_pages: pages } as Partial<Game>)
    setSaving(false)
    setSavedAt(Date.now())
    setTimeout(() => setSavedAt(null), 2000)
  }

  function addPage() {
    setPages((prev) => [...prev, { text: '', media: null }])
  }

  function removePage(i: number) {
    const removedMedia = pages[i]?.media?.url
    if (removedMedia) deleteChallengeMedia(removedMedia)
    setPages((prev) => prev.filter((_, idx) => idx !== i))
  }

  function movePage(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= pages.length) return
    setPages((prev) => {
      const next = [...prev]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  function updatePage(i: number, patch: Partial<IntroPage>) {
    setPages((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...patch } : p)))
  }

  async function handlePageMedia(i: number, file: File) {
    const url = await uploadChallengeMedia(file, game.id)
    if (!url) return
    const type: 'image' | 'video' = file.type.startsWith('video/') ? 'video' : 'image'
    // Clean up previous media if any
    const prevUrl = pages[i]?.media?.url
    if (prevUrl) deleteChallengeMedia(prevUrl)
    updatePage(i, { media: { url, type } })
  }

  async function clearPageMedia(i: number) {
    const url = pages[i]?.media?.url
    if (url) await deleteChallengeMedia(url)
    updatePage(i, { media: null })
  }

  async function handleResetAcks() {
    if (!confirm('Alle teams hun acknowledge resetten? Ze moeten dan opnieuw door de intro.')) return
    setResetting(true)
    setResetCount(null)
    const { data } = await supabase.rpc('reset_intro_acknowledgements', { p_game_id: game.id })
    setResetting(false)
    setResetCount((data as number) ?? 0)
    setTimeout(() => setResetCount(null), 3000)
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="space-y-1">
        <p className="text-sm text-text-muted">
          Verplichte intro carousel die teams zien voor ze kunnen beginnen. Werkt alleen wanneer de game status <strong>active</strong> is.
          Laat leeg om geen intro te tonen.
        </p>
      </div>

      {/* Pages */}
      <div className="space-y-3">
        {pages.map((page, i) => (
          <Card key={i} className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="font-display text-neon font-bold text-sm">Pagina {i + 1}</span>
              <div className="flex-1" />
              <button
                type="button"
                onClick={() => movePage(i, -1)}
                disabled={i === 0}
                className="p-1 text-text-faint hover:text-text disabled:opacity-30 disabled:cursor-not-allowed"
                title="Omhoog"
              >
                <ChevronUp size={14} />
              </button>
              <button
                type="button"
                onClick={() => movePage(i, 1)}
                disabled={i === pages.length - 1}
                className="p-1 text-text-faint hover:text-text disabled:opacity-30 disabled:cursor-not-allowed"
                title="Omlaag"
              >
                <ChevronDown size={14} />
              </button>
              <button
                type="button"
                onClick={() => removePage(i)}
                className="p-1 text-text-faint hover:text-magenta"
                title="Verwijder pagina"
              >
                <Trash2 size={14} />
              </button>
            </div>

            <Textarea
              value={page.text}
              onChange={(e) => updatePage(i, { text: e.target.value })}
              placeholder="Tekst van deze pagina..."
              rows={4}
            />

            {/* Media */}
            <div>
              <p className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">Media (optioneel)</p>
              {page.media?.url ? (
                <div className="relative inline-block">
                  {page.media.type === 'video' ? (
                    <video
                      src={page.media.url}
                      controls
                      className="max-h-48 rounded border border-surface-overlay"
                    />
                  ) : (
                    <img
                      src={page.media.url}
                      alt=""
                      className="max-h-48 rounded border border-surface-overlay"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => clearPageMedia(i)}
                    className="absolute -top-1.5 -right-1.5 p-1 rounded-full bg-surface text-text-muted hover:text-magenta border border-surface-overlay"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <label className="flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-dashed border-surface-overlay text-sm text-text-muted hover:border-text-faint cursor-pointer w-fit transition-colors">
                  <ImagePlus size={14} />
                  Upload afbeelding of video
                  <input
                    type="file"
                    accept="image/*,video/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handlePageMedia(i, file)
                    }}
                  />
                </label>
              )}
            </div>
          </Card>
        ))}

        <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={addPage}>
          <Plus size={14} /> Pagina toevoegen
        </Button>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3 pt-2 border-t border-surface-overlay">
        <Button onClick={handleSave} disabled={!dirty || saving} className="gap-2">
          {saving ? <Loader2 size={14} className="animate-spin" /> : null}
          {saving ? 'Opslaan...' : 'Wijzigingen opslaan'}
        </Button>
        {savedAt && <span className="text-xs text-lime flex items-center gap-1"><Check size={12} /> Opgeslagen</span>}
        {dirty && !saving && !savedAt && <span className="text-xs text-amber">Niet-opgeslagen wijzigingen</span>}
      </div>

      {/* Reset acks */}
      <div className="pt-4 border-t border-surface-overlay space-y-2">
        <p className="text-xs text-text-muted">
          Na een edit kun je alle teams hun acknowledge resetten — ze moeten dan opnieuw door de intro klikken.
        </p>
        <Button
          onClick={handleResetAcks}
          disabled={resetting}
          variant="ghost"
          size="sm"
          className="gap-2 text-amber border-amber/30 hover:bg-amber/10"
        >
          {resetting ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Reset acknowledgements voor alle teams
        </Button>
        {resetCount !== null && (
          <span className="text-xs text-lime block">✓ {resetCount} team{resetCount !== 1 ? 's' : ''} gereset</span>
        )}
      </div>
    </div>
  )
}
