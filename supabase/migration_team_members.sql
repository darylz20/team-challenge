-- ============================================
-- MIGRATION: Team member names (display-only)
-- Just an array of names per team. No separate table needed.
-- ============================================

ALTER TABLE teams ADD COLUMN IF NOT EXISTS member_names text[] NOT NULL DEFAULT '{}';

-- Allow admins to update teams (already covered by existing
-- "Admins can do everything with teams" policy), but make sure
-- the column is in the realtime replica payload.
ALTER TABLE teams REPLICA IDENTITY FULL;
