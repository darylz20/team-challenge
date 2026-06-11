-- ============================================
-- MIGRATION: Reset game for reuse
-- Wipes all play data so the same game (challenges/sections/teams) can be
-- run again from scratch, and sets status back to draft for editing.
--
-- Keeps: challenges, sections, teams (incl. passcodes + member names).
-- Clears: submissions, challenge_progress, intro acknowledgements,
--         active session tokens. Resets sections to default open-state
--         (first section open, rest closed) and game status to draft.
--
-- Admin only. Run AFTER previous migrations.
-- ============================================

CREATE OR REPLACE FUNCTION reset_game(p_game_id uuid)
RETURNS json AS $$
DECLARE
  v_subs_deleted integer;
  v_progress_deleted integer;
BEGIN
  IF NOT is_admin() THEN
    RETURN json_build_object('error', 'Admin only');
  END IF;

  -- 1. Wipe all submissions (incl. admin adjustments with NULL challenge_id)
  DELETE FROM submissions WHERE game_id = p_game_id;
  GET DIAGNOSTICS v_subs_deleted = ROW_COUNT;

  -- 2. Wipe all in-progress / finalized challenge progress
  DELETE FROM challenge_progress WHERE game_id = p_game_id;
  GET DIAGNOSTICS v_progress_deleted = ROW_COUNT;

  -- 3. Reset team play-state: force intro re-watch + invalidate any logged-in device
  UPDATE teams
  SET intro_acknowledged_at = NULL,
      active_session_token = NULL
  WHERE game_id = p_game_id;

  -- 4. Reset sections to the new-game default: first section (sort_order 0) open,
  --    all others closed — so the admin can pace the re-run from the start.
  UPDATE sections
  SET is_open = (sort_order = 0)
  WHERE game_id = p_game_id;

  -- 5. Back to draft so the admin can edit + re-publish
  UPDATE games
  SET status = 'draft', published_at = NULL
  WHERE id = p_game_id;

  RETURN json_build_object(
    'submissions_deleted', v_subs_deleted,
    'progress_deleted', v_progress_deleted
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION reset_game(uuid) TO authenticated;
