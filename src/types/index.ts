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

// Intro carousel: ordered pages shown to teams before the game starts.
export interface IntroPage {
  text: string
  media: MediaItem | null
}

export interface Game {
  id: string
  title: string
  description: string | null
  code: string
  status: GameStatus
  created_by: string
  settings: Record<string, unknown>
  intro_pages: IntroPage[]
  created_at: string
  published_at: string | null
}

// ── Challenge Types ──
export type ChallengeType =
  | 'multiple_choice'
  | 'free_text'
  | 'open_door'
  | 'puzzle'
  | 'gallery'
  | 'collective_memory'
  | 'photo_upload'
export type MediaType = 'image' | 'audio' | 'video'

// Dutch display names per type. Single source for the builder's type picker
// and anywhere a challenge's type is shown to a player.
export const CHALLENGE_TYPE_LABELS: Record<ChallengeType, string> = {
  multiple_choice: 'Meerkeuze',
  free_text: 'Vrije tekst',
  open_door: 'Open Deur',
  puzzle: 'Puzzel',
  gallery: 'Galerij',
  collective_memory: 'Collectief Geheugen',
  photo_upload: 'Foto Upload',
}

export interface MediaItem {
  url: string
  type: MediaType
}

export interface Challenge {
  id: string
  game_id: string
  section_id: string
  title: string
  description: string | null
  type: ChallengeType
  points: number
  hint: string | null
  sort_order: number
  media_url: string | null
  media_type: MediaType | null
  config: ChallengeConfig
  created_at: string
}

// ── Sections (chapters within a game) ──
export interface Section {
  id: string
  game_id: string
  title: string
  description: string | null
  is_open: boolean
  sort_order: number
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

// ── Open Deur (De Slimste Mens) ──
export interface OpenDoorAnswer {
  text: string
  points: number // used in 'fixed' scoring mode
}

export type OpenDoorScoringMode = 'fixed' | 'placement'

export interface OpenDoorConfig {
  answers: OpenDoorAnswer[] // fixed length: 4
  scoring_mode: OpenDoorScoringMode
  // Used in 'placement' mode — applied independently PER answer:
  // 1st team to find answer X gets placements[place=1].points, 2nd team gets placements[place=2].points, etc.
  placements: PlacementReward[]
  attempts: AttemptsConfig // total wrong-attempt counter across the whole challenge
  fuzzy: boolean
}

// ── Puzzel (De Slimste Mens) ──
// 12 terms in a grid. Player must identify 3 themes by typing their names.
// Each theme groups 4 of the 12 terms.
// Per-theme max_attempts: a wrong guess decrements ALL unsolved+unlocked themes.
// Theme "locked" when its attempts hit 0 — no reveal.
export interface PuzzleTheme {
  name: string
  // Indices into PuzzleConfig.terms (each between 0 and 11, exactly 4, no overlap with other themes)
  term_indices: number[]
  max_attempts: number
  points: number // used in 'fixed' scoring mode
}

export interface PuzzleConfig {
  terms: string[] // exactly 12
  themes: PuzzleTheme[] // exactly 3
  scoring_mode: OpenDoorScoringMode // 'fixed' | 'placement' (reused alias)
  placements: PlacementReward[] // applied per-theme in 'placement' mode
  fuzzy: boolean
}

// ── Galerij (De Slimste Mens) ──
// Set of images, each with an answer. Optional shared theme shown as hint.
// Single shared input: server fuzzy-matches against unfound items.
// One global max-attempts counter for the whole challenge.
export interface GalleryItem {
  media: MediaItem
  answer: string
  points: number // used in 'fixed' scoring mode
}

export interface GalleryConfig {
  theme: string
  show_theme: boolean // tonen aan speler als hint?
  items: GalleryItem[] // variable length (admin chooses)
  scoring_mode: OpenDoorScoringMode
  placements: PlacementReward[] // per-item placement in 'placement' mode
  attempts: AttemptsConfig // total wrong-attempt counter across the whole challenge
  fuzzy: boolean
}

// ── Collectief Geheugen (De Slimste Mens) ──
// One media fragment (image/video) + 5 keywords with ascending point values.
// Single input, server fuzzy-matches against unfound keywords.
// One global max-attempts counter.
// Media is supplied via the standard challenge media (config.media[0]).
export interface CollectiveMemoryKeyword {
  text: string
  points: number // used in 'fixed' scoring mode (typical: 10/20/30/40/50)
}

export interface CollectiveMemoryConfig {
  keywords: CollectiveMemoryKeyword[] // fixed length: 5
  scoring_mode: OpenDoorScoringMode
  placements: PlacementReward[] // per-keyword placement in 'placement' mode
  attempts: AttemptsConfig // total wrong-attempt counter
  fuzzy: boolean
}

// ── Photo Upload (manually reviewed) ──
// No answer key to configure: the team uploads exactly one photo, and the admin
// awards points by eye from the Live Monitor. The global scoring config supplies
// the number that prefills the award field.
// The submission sits at is_correct=NULL / 0 pts until admin_review_photo runs,
// which is what keeps the score hidden from the team until it's awarded.
// The marker field carries no information beyond challenge.type — it exists so
// ChallengeConfig stays a sound union. An empty object type here would make
// every other config member assignable to this one.
export interface PhotoUploadConfig {
  photo_upload: true
}

// Shape of submissions.answer for a photo_upload challenge.
export interface PhotoSubmissionAnswer {
  photo_url: string
  // Set by admin_review_photo once an admin has judged it.
  reviewed?: boolean
  review_note?: string | null
  reviewed_at?: string
}

export type ChallengeConfig =
  | MultipleChoiceConfig
  | FreeTextConfig
  | OpenDoorConfig
  | PuzzleConfig
  | GalleryConfig
  | CollectiveMemoryConfig
  | PhotoUploadConfig

// ── Type capabilities registry ──
// Drives builder UI visibility + player flow routing.
export interface TypeCapabilities {
  uses_global_scoring: boolean    // show ScoringEditor card?
  uses_global_attempts: boolean   // show AttemptsEditor card?
  uses_progress: boolean          // uses challenge_progress + finalize_challenge?
  uses_display_config: boolean    // show DisplaySettingsEditor card?
}

export const TYPE_CAPABILITIES: Record<ChallengeType, TypeCapabilities> = {
  multiple_choice:   { uses_global_scoring: true,  uses_global_attempts: true,  uses_progress: false, uses_display_config: true  },
  free_text:         { uses_global_scoring: true,  uses_global_attempts: true,  uses_progress: false, uses_display_config: true  },
  open_door:         { uses_global_scoring: false, uses_global_attempts: false, uses_progress: true,  uses_display_config: true  },
  puzzle:            { uses_global_scoring: false, uses_global_attempts: false, uses_progress: true,  uses_display_config: false },
  gallery:           { uses_global_scoring: false, uses_global_attempts: false, uses_progress: true,  uses_display_config: true  },
  collective_memory: { uses_global_scoring: false, uses_global_attempts: false, uses_progress: true,  uses_display_config: true  },
  // Attempts are fixed at one photo (enforced in submit_answer), so no attempts card.
  photo_upload:      { uses_global_scoring: true,  uses_global_attempts: false, uses_progress: false, uses_display_config: true  },
}

// ── Challenge Progress (interactive types) ──
export interface ChallengeProgressState {
  // open_door: which answer indices have been found so far
  found?: number[]
  // open_door: actual points awarded for each find (key = index as string)
  points_per_find?: Record<string, number>
  // puzzle: which theme indices have been solved
  solved?: number[]
  // puzzle: which theme indices are locked (out of attempts, no reveal)
  locked?: number[]
  // puzzle: attempts remaining per theme (same order as themes config)
  attempts_remaining?: number[]
  // puzzle: actual points awarded per solved theme
  points_per_solve?: Record<string, number>
  // gallery: total wrong-attempts used so far (across whole challenge)
  attempts_used?: number
  // future types add their own keys here
}

export interface ChallengeProgress {
  state: ChallengeProgressState
  started_at: string
  finalized: boolean
}

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
  member_names: string[]
  intro_acknowledged_at: string | null
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
  // Single-device enforcement: issued by login_team RPC.
  // Required for stateful RPCs (get_or_init_progress, *_attempt, finalize_challenge).
  // Optional for backward compat with sessions stored before this field existed.
  session_token?: string
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

// ── Admin Notes ──
export interface AdminNote {
  id: string
  admin_id: string
  title: string
  body: string
  created_at: string
  updated_at: string
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
  hint: string | null
  section_id: string
  config: ChallengeConfig
  media_url: string | null
  media_type: MediaType | null
}

export const DEFAULT_CHALLENGE_CONFIGS: Record<ChallengeType, ChallengeConfig> = {
  multiple_choice: { options: [{ text: '', is_correct: false }, { text: '', is_correct: false }], allow_multiple: false },
  free_text: { correct_answer: '', case_sensitive: false },
  open_door: {
    answers: [
      { text: '', points: 10 },
      { text: '', points: 10 },
      { text: '', points: 10 },
      { text: '', points: 10 },
    ],
    scoring_mode: 'fixed',
    placements: [
      { place: 1, points: 30 },
      { place: 2, points: 20 },
      { place: 3, points: 10 },
    ],
    attempts: { unlimited: true, max: 10 },
    fuzzy: true,
  },
  puzzle: {
    terms: Array.from({ length: 12 }, () => ''),
    themes: [
      { name: '', term_indices: [0, 1, 2, 3], max_attempts: 3, points: 30 },
      { name: '', term_indices: [4, 5, 6, 7], max_attempts: 3, points: 30 },
      { name: '', term_indices: [8, 9, 10, 11], max_attempts: 3, points: 30 },
    ],
    scoring_mode: 'fixed',
    placements: [
      { place: 1, points: 30 },
      { place: 2, points: 20 },
      { place: 3, points: 10 },
    ],
    fuzzy: true,
  },
  gallery: {
    theme: '',
    show_theme: false,
    items: [],
    scoring_mode: 'fixed',
    placements: [
      { place: 1, points: 20 },
      { place: 2, points: 10 },
      { place: 3, points: 5 },
    ],
    attempts: { unlimited: true, max: 5 },
    fuzzy: true,
  },
  collective_memory: {
    keywords: [
      { text: '', points: 10 },
      { text: '', points: 20 },
      { text: '', points: 30 },
      { text: '', points: 40 },
      { text: '', points: 50 },
    ],
    scoring_mode: 'fixed',
    placements: [
      { place: 1, points: 30 },
      { place: 2, points: 20 },
      { place: 3, points: 10 },
    ],
    attempts: { unlimited: false, max: 5 },
    fuzzy: true,
  },
  photo_upload: { photo_upload: true },
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
