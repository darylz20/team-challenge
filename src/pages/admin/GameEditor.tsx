import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Copy, Check, Plus, Trash2, GripVertical, RefreshCw } from 'lucide-react'
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
import type { Challenge } from '../../types'

export function GameEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { game, loading, updateGame, publishGame, unpublishGame } = useGame(id)
  const { challenges, deleteChallenge, reorderChallenges } = useChallenges(id)
  const { teams, createTeam, deleteTeam, regeneratePasscode } = useTeams(id)

  if (loading || !game) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-neon border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const tabs = [
    { label: 'Details', content: <DetailsTab game={game} updateGame={updateGame} publishGame={publishGame} unpublishGame={unpublishGame} /> },
    { label: 'Challenges', content: <ChallengesTab gameId={game.id} challenges={challenges} deleteChallenge={deleteChallenge} reorderChallenges={reorderChallenges} navigate={navigate} /> },
    { label: 'Teams', content: <TeamsTab teams={teams} createTeam={createTeam} deleteTeam={deleteTeam} regeneratePasscode={regeneratePasscode} /> },
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
function DetailsTab({ game, updateGame, publishGame, unpublishGame }: {
  game: NonNullable<ReturnType<typeof useGame>['game']>
  updateGame: ReturnType<typeof useGame>['updateGame']
  publishGame: ReturnType<typeof useGame>['publishGame']
  unpublishGame: ReturnType<typeof useGame>['unpublishGame']
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

      <div className="flex gap-3 pt-2">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
        {game.status === 'draft' && (
          <Button variant="secondary" onClick={publishGame}>Publish</Button>
        )}
        {game.status === 'published' && (
          <Button variant="ghost" onClick={unpublishGame}>Unpublish</Button>
        )}
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
function TeamsTab({ teams, createTeam, deleteTeam, regeneratePasscode }: {
  teams: ReturnType<typeof useTeams>['teams']
  createTeam: ReturnType<typeof useTeams>['createTeam']
  deleteTeam: ReturnType<typeof useTeams>['deleteTeam']
  regeneratePasscode: ReturnType<typeof useTeams>['regeneratePasscode']
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
          <Card key={team.id} className="flex items-center gap-3">
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
          </Card>
        ))}
      </div>

      {teams.length === 0 && (
        <p className="text-sm text-text-muted text-center py-4">No teams yet. Add teams for players to log in.</p>
      )}
    </div>
  )
}
