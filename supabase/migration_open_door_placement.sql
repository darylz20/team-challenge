-- ============================================
-- MIGRATION: Open Deur placement scoring
-- Adds per-answer placement scoring (1st team to find answer X gets bonus).
-- Run AFTER migration_open_door.sql.
-- ============================================

-- Replace open_door_attempt:
--   - In 'placement' mode: count other teams that already found this answer,
--     award points based on shared placements table at config.placements.
--   - Store awarded points per find in state.points_per_find for use at finalize.
CREATE OR REPLACE FUNCTION open_door_attempt(
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
  v_answers jsonb;
  v_fuzzy boolean;
  v_scoring_mode text;
  v_placements jsonb;
  v_attempt_norm text;
  v_answer jsonb;
  v_idx integer := 0;
  v_found_indices jsonb;
  v_points_per_find jsonb;
  v_matched_idx integer := -1;
  v_matched_points integer := 0;
  v_target_norm text;
  v_time_limit integer;
  v_elapsed integer;
  v_max_dist integer;
  v_other_finds integer;
  v_place integer;
BEGIN
  IF NOT validate_session_token(p_team_id, p_session_token) THEN
    RETURN json_build_object('error', 'Session invalidated');
  END IF;

  SELECT * INTO v_challenge FROM challenges
  WHERE id = p_challenge_id AND game_id = p_game_id;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Invalid challenge');
  END IF;
  IF v_challenge.type != 'open_door' THEN
    RETURN json_build_object('error', 'Wrong challenge type');
  END IF;

  v_config := v_challenge.config::jsonb;
  v_answers := v_config->'answers';
  v_fuzzy := COALESCE((v_config->>'fuzzy')::boolean, true);
  v_scoring_mode := COALESCE(v_config->>'scoring_mode', 'fixed');
  v_placements := COALESCE(v_config->'placements', '[]'::jsonb);

  SELECT * INTO v_progress
  FROM challenge_progress
  WHERE team_id = p_team_id AND challenge_id = p_challenge_id;

  IF NOT FOUND THEN
    INSERT INTO challenge_progress (team_id, challenge_id, game_id, state)
    VALUES (p_team_id, p_challenge_id, p_game_id,
            jsonb_build_object('found', '[]'::jsonb, 'points_per_find', '{}'::jsonb))
    RETURNING * INTO v_progress;
  END IF;

  IF v_progress.finalized THEN
    RETURN json_build_object('error', 'Challenge already finalized');
  END IF;

  v_time_limit := v_challenge.time_limit;
  IF v_time_limit IS NOT NULL THEN
    v_elapsed := EXTRACT(EPOCH FROM (now() - v_progress.started_at))::integer;
    IF v_elapsed > v_time_limit THEN
      RETURN json_build_object('error', 'Time expired', 'time_expired', true);
    END IF;
  END IF;

  v_found_indices := COALESCE(v_progress.state->'found', '[]'::jsonb);
  v_points_per_find := COALESCE(v_progress.state->'points_per_find', '{}'::jsonb);
  v_attempt_norm := normalize_answer(p_attempt);

  IF v_attempt_norm = '' THEN
    RETURN json_build_object('matched', false);
  END IF;

  -- Match against unfound answers
  v_idx := 0;
  FOR v_answer IN SELECT jsonb_array_elements(v_answers)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_found_indices) AS t(v)
      WHERE (v::text)::integer = v_idx
    ) THEN
      v_target_norm := normalize_answer(v_answer->>'text');
      IF v_target_norm = v_attempt_norm THEN
        v_matched_idx := v_idx;
        EXIT;
      ELSIF v_fuzzy AND v_target_norm != '' THEN
        IF length(v_target_norm) <= 4 THEN
          v_max_dist := 1;
        ELSE
          v_max_dist := 2;
        END IF;
        IF levenshtein(v_target_norm, v_attempt_norm) <= v_max_dist THEN
          v_matched_idx := v_idx;
          EXIT;
        END IF;
      END IF;
    END IF;
    v_idx := v_idx + 1;
  END LOOP;

  IF v_matched_idx < 0 THEN
    RETURN json_build_object('matched', false);
  END IF;

  -- ── Determine points for this find ──
  IF v_scoring_mode = 'placement' THEN
    -- Count other teams (in this game) that have this index in their found list
    SELECT COUNT(*) INTO v_other_finds
    FROM challenge_progress cp
    WHERE cp.challenge_id = p_challenge_id
      AND cp.team_id != p_team_id
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(COALESCE(cp.state->'found', '[]'::jsonb)) AS t(v)
        WHERE (v::text)::integer = v_matched_idx
      );
    v_place := v_other_finds + 1;

    -- Look up points for this place
    SELECT COALESCE((elem->>'points')::integer, 0) INTO v_matched_points
    FROM jsonb_array_elements(v_placements) AS elem
    WHERE (elem->>'place')::integer = v_place
    LIMIT 1;
    v_matched_points := COALESCE(v_matched_points, 0);
  ELSE
    -- Fixed: take points from the answer entry
    v_answer := v_answers->v_matched_idx;
    v_matched_points := COALESCE((v_answer->>'points')::integer, 0);
  END IF;

  -- Append to state
  v_found_indices := v_found_indices || to_jsonb(v_matched_idx);
  v_points_per_find := jsonb_set(
    v_points_per_find,
    ARRAY[v_matched_idx::text],
    to_jsonb(v_matched_points),
    true
  );

  UPDATE challenge_progress
  SET state = jsonb_build_object(
        'found', v_found_indices,
        'points_per_find', v_points_per_find
      ),
      last_updated_at = now()
  WHERE id = v_progress.id;

  RETURN json_build_object(
    'matched', true,
    'index', v_matched_idx,
    'points', v_matched_points,
    'place', CASE WHEN v_scoring_mode = 'placement' THEN v_place ELSE NULL END,
    'state', jsonb_build_object(
      'found', v_found_indices,
      'points_per_find', v_points_per_find
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Replace finalize_challenge open_door branch: prefer points_per_find when present,
-- fall back to summing answer.points (legacy progress without points_per_find).
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
  v_answer jsonb;
  v_found_count integer := 0;
  v_total_answers integer := 0;
  v_existing_id uuid;
  v_existing_points integer;
  v_existing_correct boolean;
  v_submission_id uuid;
  v_answer_payload jsonb;
  v_per_find_value text;
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
        -- Prefer stored per-find award (set by attempt RPC under either mode)
        v_per_find_value := v_points_per_find->>v_idx::text;
        IF v_per_find_value IS NOT NULL THEN
          v_total_points := v_total_points + v_per_find_value::integer;
        ELSE
          -- Legacy: progress predates points_per_find. Fall back to answer.points.
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
