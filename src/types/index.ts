// ── Role Types ──
export type UserRole = 'admin' | 'player'

export interface Profile {
  id: string
  display_name: string
  role: UserRole
  avatar_url: string | null
  created_at: string
}

// ── Game Types ──
export type GameStatus = 'draft' | 'published' | 'active' | 'finished'

export interface Game {
  id: string
  title: string
  description: string | null
  code: string
  status: GameStatus
  created_by: string
  settings: Record<string, unknown>
  created_at: string
  published_at: string | null
}

// ── Challenge Types ──
export type ChallengeType = 'multiple_choice' | 'free_text' | 'photo_upload' | 'gps_check'
export type MediaType = 'image' | 'audio' | 'video'

export interface MediaItem {
  url: string
  type: MediaType
}

export interface Challenge {
  id: string
  game_id: string
  title: string
  description: string | null
  type: ChallengeType
  points: number
  time_limit: number | null
  hint: string | null
  sort_order: number
  media_url: string | null
  media_type: MediaType | null
  config: ChallengeConfig
  created_at: string
}

// ── Challenge Config Shapes ──
export interface MultipleChoiceOption {
  text: string
  image_url?: string
  is_correct: boolean
}

export interface MultipleChoiceConfig {
  options: MultipleChoiceOption[]
  allow_multiple: boolean
}

export interface FreeTextConfig {
  correct_answer: string
  case_sensitive: boolean
}

export interface PhotoUploadConfig {
  requires_review: boolean
}

export interface GpsCheckConfig {
  lat: number
  lng: number
  radius_meters: number
}

export type ChallengeConfig =
  | MultipleChoiceConfig
  | FreeTextConfig
  | PhotoUploadConfig
  | GpsCheckConfig

// ── Placement-based Scoring ──
export interface PlacementReward {
  place: number
  points: number
}

export interface ScoringConfig {
  mode: 'fixed' | 'placement'
  fixed_points: number
  placements: PlacementReward[]
}

// ── Multiple Hints with Deductions ──
export interface HintItem {
  text: string
  deduction: number
}

export interface HintsConfig {
  items: HintItem[]
}

// ── Attempt Limits ──
export interface AttemptsConfig {
  unlimited: boolean
  max: number
}

// ── Display/Layout Styling ──
export type MediaPosition = 'above' | 'below' | 'left' | 'right' | 'background'
export type MediaLayout = 'vertical' | 'grid-2' | 'grid-3' | 'carousel'
export type MediaSize = 'small' | 'medium' | 'large' | 'full'

export interface DisplayConfig {
  columns: 1 | 2 | 3 | 4
  media_position: MediaPosition
  media_layout: MediaLayout
  media_size: MediaSize
  description_align: 'left' | 'center'
  compact: boolean
}

// ── Team Types ──
export interface Team {
  id: string
  game_id: string
  name: string
  color: string
  passcode: string
  created_at: string
}

// ── Team Session (player auth) ──
export interface TeamSession {
  team: {
    id: string
    game_id: string
    name: string
    color: string
  }
  game: {
    id: string
    title: string
    status: GameStatus
  }
}

// ── Submission Types ──
export interface Submission {
  id: string
  challenge_id: string
  player_id: string | null
  team_id: string
  game_id: string
  answer: Record<string, unknown>
  is_correct: boolean | null
  points_awarded: number
  submitted_at: string
}

// ── Helper Types for Forms ──
export interface GameFormData {
  title: string
  description: string
}

export interface ChallengeFormData {
  title: string
  description: string | null
  type: ChallengeType
  points: number
  time_limit: number | null
  hint: string | null
  config: ChallengeConfig
  media_url: string | null
  media_type: MediaType | null
}

export const DEFAULT_CHALLENGE_CONFIGS: Record<ChallengeType, ChallengeConfig> = {
  multiple_choice: { options: [{ text: '', is_correct: false }, { text: '', is_correct: false }], allow_multiple: false },
  free_text: { correct_answer: '', case_sensitive: false },
  photo_upload: { requires_review: true },
  gps_check: { lat: 0, lng: 0, radius_meters: 50 },
}

export const DEFAULT_SCORING: ScoringConfig = {
  mode: 'fixed',
  fixed_points: 10,
  placements: [
    { place: 1, points: 10 },
    { place: 2, points: 7 },
    { place: 3, points: 5 },
  ],
}

export const DEFAULT_DISPLAY: DisplayConfig = {
  columns: 1,
  media_position: 'above',
  media_layout: 'vertical',
  media_size: 'large',
  description_align: 'left',
  compact: false,
}

export const DEFAULT_ATTEMPTS: AttemptsConfig = {
  unlimited: true,
  max: 1,
}
