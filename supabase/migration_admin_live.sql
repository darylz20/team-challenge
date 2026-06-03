-- ============================================
-- MIGRATION: Admin live dashboard RPCs
-- - admin_adjust_points: ±delta to a team (no challenge)
-- - admin_complete_challenge: mark a challenge solved with N points
-- - admin_reset_challenge: wipe progress + submissions so team can redo
-- - admin_end_game: finalize all in-progress + set status=finished
--
-- All require is_admin(). Run AFTER previous migrations.
-- ============================================

-- ── 1. admin_adjust_points ──
-- Inserts a "virtual" submission with NULL challenge_id. This sums into the
-- leaderboard via points_awarded, but doesn't count as a challenge solved
-- (see useLeaderboard which checks challenge_id IS NOT NULL).
CREATE OR REPLACE FUNCTION admin_adjust_points(
  p_team_id uuid,
  p_game_id uuid,
  p_delta integer,
  p_reason text DEFAULT NULL
)
RETURNS json AS $$
DECLARE
  v_submission_id uuid;
BEGIN
  IF NOT is_admin() THEN
    RETURN json_build_object('error', 'Admin only');
  END IF;

  IF p_delta = 0 THEN
    RETURN json_build_object('error', 'Delta must be non-zero');
  END IF;

  INSERT INTO submissions (challenge_id, team_id, game_id, answer, is_correct, points_awarded)
  VALUES (
    NULL,
    p_team_id,
    p_game_id,
    jsonb_build_object('admin_adjustment', true, 'reason', p_reason, 'delta', p_delta),
    true,
    p_delta
  )
  RETURNING id INTO v_submission_id;

  RETURN json_build_object('id', v_submission_id, 'delta', p_delta);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION admin_adjust_points(uuid, uuid, integer, text) TO authenticated;

-- ── 2. admin_complete_challenge ──
-- Marks a challenge as solved by a team, awarding given points. Earlier
-- failed attempts remain in submissions for audit but the team now counts
-- as having solved the challenge (because hasCorrect = any is_correct=true).
CREATE OR REPLACE FUNCTION admin_complete_challenge(
  p_team_id uuid,
  p_challenge_id uuid,
  p_game_id uuid,
  p_points integer,
  p_note text DEFAULT NULL
)
RETURNS json AS $$
DECLARE
  v_submission_id uuid;
BEGIN
  IF NOT is_admin() THEN
    RETURN json_build_object('error', 'Admin only');
  END IF;

  -- If a progress row exists, mark it finalized so the player UI shows
  -- the challenge as done and doesn't try to attempt-RPC into it again.
  UPDATE challenge_progress
  SET finalized = true, last_updated_at = now()
  WHERE team_id = p_team_id AND challenge_id = p_challenge_id;

  INSERT INTO submissions (challenge_id, team_id, game_id, answer, is_correct, points_awarded)
  VALUES (
    p_challenge_id,
    p_team_id,
    p_game_id,
    jsonb_build_object('admin_completion', true, 'note', p_note),
    true,
    p_points
  )
  RETURNING id INTO v_submission_id;

  RETURN json_build_object('id', v_submission_id, 'points_awarded', p_points);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION admin_complete_challenge(uuid, uuid, uuid, integer, text) TO authenticated;

-- ── 3. admin_reset_challenge ──
-- Full reset: removes the team's progress row AND all submissions for this
-- challenge. The team can start the challenge from scratch.
CREATE OR REPLACE FUNCTION admin_reset_challenge(
  p_team_id uuid,
  p_challenge_id uuid
)
RETURNS json AS $$
DECLARE
  v_subs_deleted integer;
  v_progress_deleted integer;
BEGIN
  IF NOT is_admin() THEN
    RETURN json_build_object('error', 'Admin only');
  END IF;

  DELETE FROM submissions
  WHERE team_id = p_team_id AND challenge_id = p_challenge_id;
  GET DIAGNOSTICS v_subs_deleted = ROW_COUNT;

  DELETE FROM challenge_progress
  WHERE team_id = p_team_id AND challenge_id = p_challenge_id;
  GET DIAGNOSTICS v_progress_deleted = ROW_COUNT;

  RETURN json_build_object(
    'submissions_deleted', v_subs_deleted,
    'progress_deleted', v_progress_deleted
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION admin_reset_challenge(uuid, uuid) TO authenticated;

-- ── 4. admin_end_game ──
-- Finalizes every non-finalized challenge_progress row (by inserting a
-- submission based on the current state) and sets games.status='finished'.
--
-- We re-use the existing finalize logic per type by COPYING the same
-- scoring branches here. This avoids needing a valid session token (admin
-- bypasses session validation) and lets us finalize on behalf of any team.
CREATE OR REPLACE FUNCTION admin_end_game(p_game_id uuid)
RETURNS json AS $$
DECLARE
  v_progress challenge_progress%ROWTYPE;
  v_challenge challenges%ROWTYPE;
  v_config jsonb;
  v_total_points integer;
  v_is_correct boolean;
  v_finalized_count integer := 0;
  v_skipped_count integer := 0;
  v_found_indices jsonb;
  v_points_per_find jsonb;
  v_solved jsonb;
  v_locked jsonb;
  v_points_per_solve jsonb;
  v_idx_elem jsonb;
  v_idx integer;
  v_answers jsonb;
  v_themes jsonb;
  v_items jsonb;
  v_keywords jsonb;
  v_answer jsonb;
  v_theme jsonb;
  v_item jsonb;
  v_keyword jsonb;
  v_found_count integer;
  v_solved_count integer;
  v_per_find_value text;
  v_per_solve_value text;
  v_answer_payload jsonb;
BEGIN
  IF NOT is_admin() THEN
    RETURN json_build_object('error', 'Admin only');
  END IF;

  -- Loop all non-finalized progress for this game
  FOR v_progress IN
    SELECT * FROM challenge_progress
    WHERE game_id = p_game_id AND finalized = false
  LOOP
    SELECT * INTO v_challenge FROM challenges WHERE id = v_progress.challenge_id;
    IF NOT FOUND THEN
      v_skipped_count := v_skipped_count + 1;
      CONTINUE;
    END IF;

    v_config := v_challenge.config::jsonb;
    v_total_points := 0;
    v_is_correct := false;
    v_answer_payload := '{}'::jsonb;

    CASE v_challenge.type
      WHEN 'open_door' THEN
        v_answers := v_config->'answers';
        v_found_indices := COALESCE(v_progress.state->'found', '[]'::jsonb);
        v_points_per_find := COALESCE(v_progress.state->'points_per_find', '{}'::jsonb);
        v_found_count := jsonb_array_length(v_found_indices);
        FOR v_idx_elem IN SELECT jsonb_array_elements(v_found_indices) LOOP
          v_idx := (v_idx_elem::text)::integer;
          v_per_find_value := v_points_per_find->>v_idx::text;
          IF v_per_find_value IS NOT NULL THEN
            v_total_points := v_total_points + v_per_find_value::integer;
          ELSE
            v_answer := v_answers->v_idx;
            v_total_points := v_total_points + COALESCE((v_answer->>'points')::integer, 0);
          END IF;
        END LOOP;
        v_is_correct := (v_found_count > 0);
        v_answer_payload := jsonb_build_object(
          'found_indices', v_found_indices,
          'points_per_find', v_points_per_find,
          'found_count', v_found_count,
          'admin_ended', true
        );

      WHEN 'puzzle' THEN
        v_themes := v_config->'themes';
        v_solved := COALESCE(v_progress.state->'solved', '[]'::jsonb);
        v_locked := COALESCE(v_progress.state->'locked', '[]'::jsonb);
        v_points_per_solve := COALESCE(v_progress.state->'points_per_solve', '{}'::jsonb);
        v_solved_count := jsonb_array_length(v_solved);
        FOR v_idx_elem IN SELECT jsonb_array_elements(v_solved) LOOP
          v_idx := (v_idx_elem::text)::integer;
          v_per_solve_value := v_points_per_solve->>v_idx::text;
          IF v_per_solve_value IS NOT NULL THEN
            v_total_points := v_total_points + v_per_solve_value::integer;
          ELSE
            v_theme := v_themes->v_idx;
            v_total_points := v_total_points + COALESCE((v_theme->>'points')::integer, 0);
          END IF;
        END LOOP;
        v_is_correct := (v_solved_count > 0);
        v_answer_payload := jsonb_build_object(
          'solved_indices', v_solved,
          'locked_indices', v_locked,
          'points_per_solve', v_points_per_solve,
          'solved_count', v_solved_count,
          'admin_ended', true
        );

      WHEN 'gallery' THEN
        v_items := v_config->'items';
        v_found_indices := COALESCE(v_progress.state->'found', '[]'::jsonb);
        v_points_per_find := COALESCE(v_progress.state->'points_per_find', '{}'::jsonb);
        v_found_count := jsonb_array_length(v_found_indices);
        FOR v_idx_elem IN SELECT jsonb_array_elements(v_found_indices) LOOP
          v_idx := (v_idx_elem::text)::integer;
          v_per_find_value := v_points_per_find->>v_idx::text;
          IF v_per_find_value IS NOT NULL THEN
            v_total_points := v_total_points + v_per_find_value::integer;
          ELSE
            v_item := v_items->v_idx;
            v_total_points := v_total_points + COALESCE((v_item->>'points')::integer, 0);
          END IF;
        END LOOP;
        v_is_correct := (v_found_count > 0);
        v_answer_payload := jsonb_build_object(
          'found_indices', v_found_indices,
          'points_per_find', v_points_per_find,
          'found_count', v_found_count,
          'admin_ended', true
        );

      WHEN 'collective_memory' THEN
        v_keywords := v_config->'keywords';
        v_found_indices := COALESCE(v_progress.state->'found', '[]'::jsonb);
        v_points_per_find := COALESCE(v_progress.state->'points_per_find', '{}'::jsonb);
        v_found_count := jsonb_array_length(v_found_indices);
        FOR v_idx_elem IN SELECT jsonb_array_elements(v_found_indices) LOOP
          v_idx := (v_idx_elem::text)::integer;
          v_per_find_value := v_points_per_find->>v_idx::text;
          IF v_per_find_value IS NOT NULL THEN
            v_total_points := v_total_points + v_per_find_value::integer;
          ELSE
            v_keyword := v_keywords->v_idx;
            v_total_points := v_total_points + COALESCE((v_keyword->>'points')::integer, 0);
          END IF;
        END LOOP;
        v_is_correct := (v_found_count > 0);
        v_answer_payload := jsonb_build_object(
          'found_indices', v_found_indices,
          'points_per_find', v_points_per_find,
          'found_count', v_found_count,
          'admin_ended', true
        );

      ELSE
        v_skipped_count := v_skipped_count + 1;
        CONTINUE;
    END CASE;

    UPDATE challenge_progress
    SET finalized = true, last_updated_at = now()
    WHERE id = v_progress.id;

    INSERT INTO submissions (challenge_id, team_id, game_id, answer, is_correct, points_awarded)
    VALUES (v_progress.challenge_id, v_progress.team_id, p_game_id, v_answer_payload, v_is_correct, v_total_points);

    v_finalized_count := v_finalized_count + 1;
  END LOOP;

  UPDATE games SET status = 'finished' WHERE id = p_game_id;

  RETURN json_build_object(
    'finalized', v_finalized_count,
    'skipped', v_skipped_count
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION admin_end_game(uuid) TO authenticated;
