import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { Challenge } from '../types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Whether a challenge awards points based on placement (order teams solve it),
 * rather than a fixed amount. Being first is worth more, so speed matters.
 * Two storage shapes exist: interactive types (open_door/puzzle/gallery/
 * collective_memory) keep `scoring_mode` on the config directly, while
 * multiple_choice/free_text keep a global ScoringConfig under `config.scoring`.
 */
export function isPlacementBased(challenge: Challenge): boolean {
  const config = challenge.config as
    | { scoring_mode?: string; scoring?: { mode?: string } }
    | null
    | undefined
  if (!config) return false
  if (config.scoring_mode === 'placement') return true
  if (config.scoring?.mode === 'placement') return true
  return false
}

/**
 * Points a team has already collected in an interactive challenge, read
 * straight from challenge_progress.state. Every *_attempt RPC records the
 * awarded value per find/solve, so summing them gives the live score even
 * before the challenge is finalized. Type-agnostic: open_door/gallery/
 * collective_memory use points_per_find, puzzle uses points_per_solve.
 */
export function livePointsFromState(
  state: { points_per_find?: Record<string, number>; points_per_solve?: Record<string, number> } | null | undefined,
): number {
  if (!state) return 0
  let sum = 0
  for (const v of Object.values(state.points_per_find ?? {})) sum += Number(v) || 0
  for (const v of Object.values(state.points_per_solve ?? {})) sum += Number(v) || 0
  return sum
}
