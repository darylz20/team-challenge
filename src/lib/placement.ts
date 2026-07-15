import type { Challenge, ChallengeType, ChallengeProgressState, PlacementReward } from '../types'

/**
 * Placement scoring, mirrored from the server RPCs so the UI can preview how
 * many points a team can still claim.
 *
 * Two shapes exist:
 *  - Interactive types (open_door/puzzle/gallery/collective_memory): placement
 *    is applied PER sub-item. The Nth team to find sub-item i earns
 *    placements[place=N].points. Found sub-items live in each team's
 *    challenge_progress.state (`found` indices, or `solved` for puzzle).
 *  - multiple_choice / free_text: a single placement event for the whole
 *    challenge, keyed off how many teams already have a correct submission.
 *    Placements live under config.scoring.placements.
 */

// Which progress-state key holds this type's solved sub-item indices.
const FOUND_KEY: Partial<Record<ChallengeType, 'found' | 'solved'>> = {
  open_door: 'found',
  gallery: 'found',
  collective_memory: 'found',
  puzzle: 'solved',
}

export interface PlacementProgressRow {
  team_id: string
  challenge_id: string
  state: ChallengeProgressState
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cfg(challenge: Challenge): any {
  return challenge.config ?? {}
}

function placementsOf(challenge: Challenge): PlacementReward[] {
  const c = cfg(challenge)
  return (c.placements ?? c.scoring?.placements ?? []) as PlacementReward[]
}

function pointsForPlace(placements: PlacementReward[], place: number): number {
  return placements.find((p) => p.place === place)?.points ?? 0
}

// Number of independently-scored sub-items for interactive types.
function subItemCount(challenge: Challenge): number {
  const c = cfg(challenge)
  switch (challenge.type) {
    case 'open_door': return c.answers?.length ?? 0
    case 'puzzle': return c.themes?.length ?? 0
    case 'gallery': return c.items?.length ?? 0
    case 'collective_memory': return c.keywords?.length ?? 0
    default: return 0
  }
}

function foundIndices(state: ChallengeProgressState | undefined, key: 'found' | 'solved'): number[] {
  if (!state) return []
  const arr = key === 'solved' ? state.solved : state.found
  return (arr ?? []).map(Number)
}

/**
 * Points a team can still earn from a placement challenge given the current
 * standings. For a challenge nobody has touched this equals the theoretical
 * maximum; it shrinks as other teams claim the higher placements first.
 */
export function placementRemainingForTeam(
  challenge: Challenge,
  myTeamId: string,
  opts: {
    allProgress?: PlacementProgressRow[]
    othersSolvedCount?: number
    iSolved?: boolean
  },
): number {
  const placements = placementsOf(challenge)
  if (placements.length === 0) return 0

  const key = FOUND_KEY[challenge.type]

  // multiple_choice / free_text — one placement event for the whole challenge.
  if (!key) {
    if (opts.iSolved) return 0
    return pointsForPlace(placements, (opts.othersSolvedCount ?? 0) + 1)
  }

  // Interactive — sum the best still-available placement per unclaimed sub-item.
  const rows = (opts.allProgress ?? []).filter((p) => p.challenge_id === challenge.id)
  const mine = rows.find((p) => p.team_id === myTeamId)
  const myFound = new Set(foundIndices(mine?.state, key))

  let remaining = 0
  for (let i = 0; i < subItemCount(challenge); i++) {
    if (myFound.has(i)) continue
    let others = 0
    for (const p of rows) {
      if (p.team_id === myTeamId) continue
      if (foundIndices(p.state, key).includes(i)) others++
    }
    remaining += pointsForPlace(placements, others + 1)
  }
  return remaining
}
