import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Gamepad2, Trash2 } from 'lucide-react'
import { PageHeader } from '../../components/layout/PageHeader'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Modal } from '../../components/ui/Modal'
import { Input } from '../../components/ui/Input'
import { Textarea } from '../../components/ui/Textarea'
import { EmptyState } from '../../components/ui/EmptyState'
import { useGames } from '../../hooks/useGames'
import type { GameStatus } from '../../types'

const statusFilters: { value: GameStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'active', label: 'Active' },
  { value: 'finished', label: 'Finished' },
]

export function GameList() {
  const navigate = useNavigate()
  const { games, loading, createGame, deleteGame } = useGames()
  const [filter, setFilter] = useState<GameStatus | 'all'>('all')
  const [showCreate, setShowCreate] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)

  const filtered = filter === 'all' ? games : games.filter((g) => g.status === filter)

  async function handleCreate() {
    if (!title.trim()) return
    setCreating(true)
    const { data } = await createGame(title.trim(), description.trim())
    setCreating(false)
    setShowCreate(false)
    setTitle('')
    setDescription('')
    if (data) navigate(`/admin/games/${data.id}`)
  }

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <PageHeader title="Games" subtitle="Manage your challenge games" className="mb-0" />
        <Button className="gap-2" onClick={() => setShowCreate(true)}>
          <Plus size={16} /> New Game
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {statusFilters.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors whitespace-nowrap ${
              filter === f.value
                ? 'bg-neon/15 text-neon border border-neon/30'
                : 'bg-surface-overlay text-text-muted hover:text-text'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Game cards */}
      <div className="flex flex-col gap-3">
        {filtered.map((game) => (
          <Card
            key={game.id}
            className="cursor-pointer hover:bg-surface-overlay/50 transition-colors"
            onClick={() => navigate(`/admin/games/${game.id}`)}
          >
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <p className="font-semibold truncate">{game.title}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-text-muted font-mono">{game.code}</span>
                  {game.description && (
                    <span className="text-xs text-text-faint truncate">— {game.description}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 ml-3">
                <Badge
                  variant={
                    game.status === 'active' ? 'lime' :
                    game.status === 'published' ? 'neon' :
                    game.status === 'finished' ? 'amber' : 'muted'
                  }
                >
                  {game.status}
                </Badge>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteGame(game.id) }}
                  className="p-1.5 text-text-faint hover:text-magenta transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {!loading && filtered.length === 0 && (
        <EmptyState
          icon={Gamepad2}
          title="No games yet"
          description="Create your first game to get started"
          actionLabel="Create Game"
          onAction={() => setShowCreate(true)}
        />
      )}

      {/* Create Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Game">
        <div className="flex flex-col gap-4">
          <Input
            id="game-title"
            label="Game Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Weekend Escape Room"
          />
          <Textarea
            id="game-desc"
            label="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What's this game about?"
          />
          <Button onClick={handleCreate} disabled={!title.trim() || creating} className="w-full">
            {creating ? 'Creating...' : 'Create Game'}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
