import { useNavigate } from 'react-router-dom'
import { Gamepad2, Plus, Zap } from 'lucide-react'
import { PageHeader } from '../../components/layout/PageHeader'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { useGames } from '../../hooks/useGames'

export function Dashboard() {
  const navigate = useNavigate()
  const { games, loading } = useGames()

  const activeGames = games.filter((g) => g.status === 'active').length

  return (
    <div className="animate-fade-in">
      <PageHeader title="Dashboard" subtitle="Manage your games" />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <Card>
          <div className="flex items-center gap-3">
            <Gamepad2 size={20} className="text-neon" />
            <div>
              <p className="font-display text-xl font-bold">{loading ? '—' : games.length}</p>
              <p className="text-xs text-text-muted">Total Games</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <Zap size={20} className="text-lime" />
            <div>
              <p className="font-display text-xl font-bold">{loading ? '—' : activeGames}</p>
              <p className="text-xs text-text-muted">Active</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3 mb-6">
        <Button className="gap-2" onClick={() => navigate('/admin/games/new')}>
          <Plus size={16} /> Create Game
        </Button>
      </div>

      {/* Recent Games */}
      <h2 className="font-display text-sm font-bold text-text-muted uppercase tracking-wider mb-3">
        Recent Games
      </h2>
      <div className="flex flex-col gap-2">
        {games.slice(0, 5).map((game) => (
          <Card
            key={game.id}
            className="cursor-pointer hover:bg-surface-overlay/50 transition-colors"
            onClick={() => navigate(`/admin/games/${game.id}`)}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">{game.title}</p>
                <p className="text-xs text-text-muted font-mono">{game.code}</p>
              </div>
              <Badge
                variant={
                  game.status === 'active' ? 'lime' :
                  game.status === 'published' ? 'neon' :
                  game.status === 'finished' ? 'amber' : 'muted'
                }
              >
                {game.status}
              </Badge>
            </div>
          </Card>
        ))}
        {!loading && games.length === 0 && (
          <p className="text-sm text-text-muted py-4 text-center">No games yet. Create your first one!</p>
        )}
      </div>
    </div>
  )
}
