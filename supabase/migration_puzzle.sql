-- ============================================
-- MIGRATION: Puzzel (De Slimste Mens)
-- 12 terms grid, player finds 3 themes by typing theme name.
-- Fixed or placement scoring per theme.
-- Per-theme max_attempts: every miss decrements all unsolved themes.
-- Run AFTER migration_open_door.sql + migration_open_door_placement.sql.
-- ============================================

-- ── 1. Extend type whitelist ──
ALTER TABLE challenges DROP CONSTRAINT IF EXISTS challenges_type_check;
ALTER TABLE challenges ADD CONSTRAINT challenges_type_check
  CHECK (type IN (
    'multiple_choice', 'free_text', 'photo_upload', 'gps_check',
    'open_door', 'puzzle'
  ));

-- ── 2. puzzle_attempt ──
-- Server-side fuzzy match against unsolved theme NAMES.
-- On hit: lock the theme, compute points (placement mode counts other teams
-- that already solved this theme index). No attempts deducted.
-- On miss: every unsolved+unlocked theme loses 1 attempt; any theme whose
-- attempts hit 0 becomes "locked" (no reveal, no points possible).
CREATE OR REPLACE FUNCTION puzzle_attempt(
  p_team_id uuid,
  p_challenge_id uuid,
  p_game_id uuid,
  p_session_token uuid,
  p_attempt text
)
RETURNS json AS $$
DECLARE
  v_challenge challenges%ROWTYPE;
  v_progress challenge_progress%ROWTYPE;
  v_config jsonb;
  v_themes jsonb;
  v_fuzzy boolean;
  v_scoring_mode text;
  v_placements jsonb;
  v_attempt_norm text;
  v_theme jsonb;
  v_theme_norm text;
  v_idx integer := 0;
  v_solved jsonb;
  v_locked jsonb;
  v_attempts_remaining jsonb;
  v_points_per_solve jsonb;
  v_matched_idx integer := -1;
  v_matched_points integer := 0;
  v_time_limit integer;
  v_elapsed integer;
  v_max_dist integer;
  v_themes_total integer;
  v_other_solves integer;
  v_place integer;
  v_remaining integer;
  v_state_out jsonb;
  v_newly_locked jsonb := '[]'::jsonb;
BEGIN
  IF NOT validate_session_token(p_team_id, p_session_token) THEN
    RETURN json_build_object('error', 'Session invalidated');
  END IF;

  SELECT * INTO v_challenge FROM challenges
  WHERE id = p_challenge_id AND game_id = p_game_id;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Invalid challenge');
  END IF;
  IF v_challenge.type != 'puzzle' THEN
    RETURN json_build_object('error', 'Wrong challenge type');
  END IF;

  v_config := v_challenge.config::jsonb;
  v_themes := v_config->'themes';
  v_themes_total := jsonb_array_length(v_themes);
  v_fuzzy := COALESCE((v_config->>'fuzzy')::boolean, true);
  v_scoring_mode := COALESCE(v_config->>'scoring_mode', 'fixed');
  v_placements := COALESCE(v_config->'placements', '[]'::jsonb);

  SELECT * INTO v_progress
  FROM challenge_progress
  WHERE team_id = p_team_id AND challenge_id = p_challenge_id;

  IF NOT FOUND THEN
    -- Initialize attempts_remaining from per-theme max_attempts
    SELECT jsonb_agg(COALESCE((t->>'max_attempts')::integer, 3))
      INTO v_attempts_remaining
    FROM jsonb_array_elements(v_themes) AS t;

    INSERT INTO challenge_progress (team_id, challenge_id, game_id, state)
    VALUES (p_team_id, p_challenge_id, p_game_id,
            jsonb_build_object(
              'solved', '[]'::jsonb,
              'locked', '[]'::jsonb,
              'attempts_remaining', COALESCE(v_attempts_remaining, '[]'::jsonb),
              'points_per_solve', '{}'::jsonb
            ))
    RETURNING * INTO v_progress;
  END IF;

  IF v_progress.finalized THEN
    RETURN json_build_object('error', 'Challenge already finalized');
  END IF;

  -- Timer check
  v_time_limit := v_challenge.time_limit;
  IF v_time_limit IS NOT NULL THEN
    v_elapsed := EXTRACT(EPOCH FROM (now() - v_progress.started_at))::integer;
    IF v_elapsed > v_time_limit THEN
      RETURN json_build_object('error', 'Time expired', 'time_expired', true);
    END IF;
  END IF;

  v_solved := COALESCE(v_progress.state->'solved', '[]'::jsonb);
  v_locked := COALESCE(v_progress.state->'locked', '[]'::jsonb);
  v_attempts_remaining := COALESCE(v_progress.state->'attempts_remaining', '[]'::jsonb);
  v_points_per_solve := COALESCE(v_progress.state->'points_per_solve', '{}'::jsonb);
  v_attempt_norm := normalize_answer(p_attempt);

  IF v_attempt_norm = '' THEN
    RETURN json_build_object('matched', false);
  END IF;

  -- Try to match against any theme name (solved + locked themes are also matched
  -- against, but we treat those as no-op rather than a real miss — generous to player)
  v_idx := 0;
  FOR v_theme IN SELECT jsonb_array_elements(v_themes)
  LOOP
    v_theme_norm := normalize_answer(v_theme->>'name');
    IF v_theme_norm = '' THEN
      v_idx := v_idx + 1;
      CONTINUE;
    END IF;

    IF v_theme_norm = v_attempt_norm THEN
      v_matched_idx := v_idx;
      EXIT;
    ELSIF v_fuzzy THEN
      IF length(v_theme_norm) <= 4 THEN
        v_max_dist := 1;
      ELSE
        v_max_dist := 2;
      END IF;
      IF levenshtein(v_theme_norm, v_attempt_norm) <= v_max_dist THEN
        v_matched_idx := v_idx;
        EXIT;
      END IF;
    END IF;
    v_idx := v_idx + 1;
  END LOOP;

  -- Match path
  IF v_matched_idx >= 0 THEN
    -- Already solved or locked: treat as no-op, no attempt loss
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_solved) AS t(v)
      WHERE (v::text)::integer = v_matched_idx
    ) THEN
      RETURN json_build_object('matched', false, 'already_solved', true);
    END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_locked) AS t(v)
      WHERE (v::text)::integer = v_matched_idx
    ) THEN
      RETURN json_build_object('matched', false, 'already_locked', true);
    END IF;

    -- Compute points
    IF v_scoring_mode = 'placement' THEN
      SELECT COUNT(*) INTO v_other_solves
      FROM challenge_progress cp
      WHERE cp.challenge_id = p_challenge_id
        AND cp.team_id != p_team_id
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(COALESCE(cp.state->'solved', '[]'::jsonb)) AS t(v)
          WHERE (v::text)::integer = v_matched_idx
        );
      v_place := v_other_solves + 1;
      SELECT COALESCE((elem->>'points')::integer, 0) INTO v_matched_points
      FROM jsonb_array_elements(v_placements) AS elem
      WHERE (elem->>'place')::integer = v_place
      LIMIT 1;
      v_matched_points := COALESCE(v_matched_points, 0);
    ELSE
      v_theme := v_themes->v_matched_idx;
      v_matched_points := COALESCE((v_theme->>'points')::integer, 0);
    END IF;

    v_solved := v_solved || to_jsonb(v_matched_idx);
    v_points_per_solve := jsonb_set(
      v_points_per_solve,
      ARRAY[v_matched_idx::text],
      to_jsonb(v_matched_points),
      true
    );

    v_state_out := jsonb_build_object(
      'solved', v_solved,
      'locked', v_locked,
      'attempts_remaining', v_attempts_remaining,
      'points_per_solve', v_points_per_solve
    );
    UPDATE challenge_progress
    SET state = v_state_out, last_updated_at = now()
    WHERE id = v_progress.id;

    RETURN json_build_object(
      'matched', true,
      'index', v_matched_idx,
      'points', v_matched_points,
      'place', CASE WHEN v_scoring_mode = 'placement' THEN v_place ELSE NULL END,
      'state', v_state_out
    );
  END IF;

  -- Miss path: decrement every unsolved+unlocked theme, lock those that hit 0
  v_idx := 0;
  WHILE v_idx < v_themes_total LOOP
    IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_solved) AS t(v)
      WHERE (v::text)::integer = v_idx
    ) AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_locked) AS t(v)
      WHERE (v::text)::integer = v_idx
    ) THEN
      v_remaining := COALESCE((v_attempts_remaining->>v_idx)::integer, 0);
      v_remaining := v_remaining - 1;
      v_attempts_remaining := jsonb_set(
        v_attempts_remaining,
        ARRAY[v_idx::text],
        to_jsonb(GREATEST(0, v_remaining)),
        false
      );
      IF v_remaining <= 0 THEN
        v_locked := v_locked || to_jsonb(v_idx);
        v_newly_locked := v_newly_locked || to_jsonb(v_idx);
      END IF;
    END IF;
    v_idx := v_idx + 1;
  END LOOP;

  v_state_out := jsonb_build_object(
    'solved', v_solved,
    'locked', v_locked,
    'attempts_remaining', v_attempts_remaining,
    'points_per_solve', v_points_per_solve
  );
  UPDATE challenge_progress
  SET state = v_state_out, last_updated_at = now()
  WHERE id = v_progress.id;

  RETURN json_build_object(
    'matched', false,
    'newly_locked', v_newly_locked,
    'state', v_state_out
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 3. Extend finalize_challenge to handle 'puzzle' ──
CREATE OR REPLACE FUNCTION finalize_challenge(
  p_team_id uuid,
  p_challenge_id uuid,
  p_game_id uuid,
  p_session_token uuid
)
RETURNS json AS $$
DECLARE
  v_challenge challenges%ROWTYPE;
  v_progress challenge_progress%ROWTYPE;
  v_config jsonb;
  v_total_points integer := 0;
  v_is_correct boolean := false;
  v_found_indices jsonb;
  v_points_per_find jsonb;
  v_idx_elem jsonb;
  v_idx integer;
  v_answers jsonb;
  v_themes jsonb;
  v_solved jsonb;
  v_locked jsonb;
  v_points_per_solve jsonb;
  v_answer jsonb;
  v_theme jsonb;
  v_found_count integer := 0;
  v_total_answers integer := 0;
  v_total_themes integer := 0;
  v_solved_count integer := 0;
  v_existing_id uuid;
  v_existing_points integer;
  v_existing_correct boolean;
  v_submission_id uuid;
  v_answer_payload jsonb;
  v_per_find_value text;
  v_per_solve_value text;
BEGIN
  IF NOT validate_session_token(p_team_id, p_session_token) THEN
    RETURN json_build_object('error', 'Session invalidated');
  END IF;

  SELECT * INTO v_challenge FROM challenges
  WHERE id = p_challenge_id AND game_id = p_game_id;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Invalid challenge');
  END IF;

  SELECT * INTO v_progress
  FROM challenge_progress
  WHERE team_id = p_team_id AND challenge_id = p_challenge_id;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'No progress to finalize');
  END IF;

  IF v_progress.finalized THEN
    SELECT id, points_awarded, is_correct
      INTO v_existing_id, v_existing_points, v_existing_correct
    FROM submissions
    WHERE team_id = p_team_id AND challenge_id = p_challenge_id
    ORDER BY submitted_at DESC LIMIT 1;
    RETURN json_build_object(
      'already_finalized', true,
      'id', v_existing_id,
      'points_awarded', v_existing_points,
      'is_correct', v_existing_correct
    );
  END IF;

  v_config := v_challenge.config::jsonb;

  CASE v_challenge.type
    WHEN 'open_door' THEN
      v_answers := v_config->'answers';
      v_total_answers := jsonb_array_length(v_answers);
      v_found_indices := COALESCE(v_progress.state->'found', '[]'::jsonb);
      v_points_per_find := COALESCE(v_progress.state->'points_per_find', '{}'::jsonb);
      v_found_count := jsonb_array_length(v_found_indices);

      FOR v_idx_elem IN SELECT jsonb_array_elements(v_found_indices)
      LOOP
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
        'total', v_total_answers
      );

    WHEN 'puzzle' THEN
      v_themes := v_config->'themes';
      v_total_themes := jsonb_array_length(v_themes);
      v_solved := COALESCE(v_progress.state->'solved', '[]'::jsonb);
      v_locked := COALESCE(v_progress.state->'locked', '[]'::jsonb);
      v_points_per_solve := COALESCE(v_progress.state->'points_per_solve', '{}'::jsonb);
      v_solved_count := jsonb_array_length(v_solved);

      FOR v_idx_elem IN SELECT jsonb_array_elements(v_solved)
      LOOP
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
        'total_themes', v_total_themes
      );

    ELSE
      RETURN json_build_object('error', 'Finalize not implemented for type: ' || v_challenge.type);
  END CASE;

  UPDATE challenge_progress
  SET finalized = true, last_updated_at = now()
  WHERE id = v_progress.id;

  INSERT INTO submissions (challenge_id, team_id, game_id, answer, is_correct, points_awarded)
  VALUES (p_challenge_id, p_team_id, p_game_id, v_answer_payload, v_is_correct, v_total_points)
  RETURNING id INTO v_submission_id;

  RETURN json_build_object(
    'id', v_submission_id,
    'is_correct', v_is_correct,
    'points_awarded', v_total_points,
    'state', v_progress.state
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 4. Grants ──
GRANT EXECUTE ON FUNCTION puzzle_attempt(uuid, uuid, uuid, uuid, text) TO anon, authenticated;
