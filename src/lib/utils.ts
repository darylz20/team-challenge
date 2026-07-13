import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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
