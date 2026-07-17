import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type {
  Challenge,
  ChallengeType,
  ChallengeConfig,
  FreeTextConfig,
  OpenDoorConfig,
  GalleryConfig,
  CollectiveMemoryConfig,
} from '../types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Trim and drop blank rows; undefined when nothing is left, so the key stays out of the config. */
function tidy(alts: string[] | undefined): string[] | undefined {
  const cleaned = (alts ?? []).map((a) => a.trim()).filter(Boolean)
  return cleaned.length > 0 ? cleaned : undefined
}

/**
 * Strip the empty alternative rows the editor keeps around while typing, so
 * they never reach the database. Only the types where a player types a free
 * answer carry alternatives; the rest pass through untouched.
 */
export function tidyAlternatives(type: ChallengeType, config: ChallengeConfig): ChallengeConfig {
  switch (type) {
    case 'free_text': {
      const c = config as FreeTextConfig
      return { ...c, alternatives: tidy(c.alternatives) }
    }
    case 'open_door': {
      const c = config as OpenDoorConfig
      return { ...c, answers: c.answers.map((a) => ({ ...a, alternatives: tidy(a.alternatives) })) }
    }
    case 'gallery': {
      const c = config as GalleryConfig
      return { ...c, items: (c.items ?? []).map((i) => ({ ...i, alternatives: tidy(i.alternatives) })) }
    }
    case 'collective_memory': {
      const c = config as CollectiveMemoryConfig
      return { ...c, keywords: c.keywords.map((k) => ({ ...k, alternatives: tidy(k.alternatives) })) }
    }
    default:
      return config
  }
}

/**
 * Whether a challenge awards points based on placement (order teams solve it),
 * rather than a fixed amount. Being first is worth more, so speed matters.
 * Two storage shapes exist: interactive types (open_door/puzzle/gallery/
 * collective_memory) keep `scoring_mode` on the config directly, while
 * multiple_choice/free_text keep a global ScoringConfig under `config.scoring`.
 */
export function isPlacementBased(challenge: Challenge): boolean {
  // photo_upload points are set by hand at review time, so no placement race
  // applies even if a scoring mode is left on the config.
  if (challenge.type === 'photo_upload') return false
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
