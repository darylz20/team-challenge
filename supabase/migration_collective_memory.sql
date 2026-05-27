-- ============================================
-- MIGRATION: Collectief Geheugen (De Slimste Mens)
-- Beeldfragment + 5 trefwoorden met oplopende waardes.
-- Single input → server fuzzy-matches against unfound keywords.
-- Fixed or placement scoring per keyword.
-- One global max-attempts counter (configurable).
-- Run AFTER previous migrations.
-- ============================================

ALTER TABLE challenges DROP CONSTRAINT IF EXISTS challenges_type_check;
ALTER TABLE challenges ADD CONSTRAINT challenges_type_check
  CHECK (type IN (
    'multiple_choice', 'free_text', 'photo_upload', 'gps_check',
    'open_door', 'puzzle', 'gallery', 'collective_memory'
  ));

CREATE OR REPLACE FUNCTION collective_memory_attempt(
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
  v_keywords jsonb;
  v_fuzzy boolean;
  v_scoring_mode text;
  v_placements jsonb;
  v_attempts jsonb;
  v_unlimited boolean;
  v_max_attempts integer;
  v_attempts_used integer;
  v_attempt_norm text;
  v_keyword jsonb;
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
  v_state_out jsonb;
BEGIN
  IF NOT validate_session_token(p_team_id, p_session_token) THEN
    RETURN json_build_object('error', 'Session invalidated');
  END IF;

  SELECT * INTO v_challenge FROM challenges
  WHERE id = p_challenge_id AND game_id = p_game_id;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'Invalid challenge');
  END IF;
  IF v_challenge.type != 'collective_memory' THEN
    RETURN json_build_object('error', 'Wrong challenge type');
  END IF;

  v_config := v_challenge.config::jsonb;
  v_keywords := v_config->'keywords';
  v_fuzzy := COALESCE((v_config->>'fuzzy')::boolean, true);
  v_scoring_mode := COALESCE(v_config->>'scoring_mode', 'fixed');
  v_placements := COALESCE(v_config->'placements', '[]'::jsonb);
  v_attempts := COALESCE(v_config->'attempts', jsonb_build_object('unlimited', false, 'max', 5));
  v_unlimited := COALESCE((v_attempts->>'unlimited')::boolean, false);
  v_max_attempts := COALESCE((v_attempts->>'max')::integer, 5);

  SELECT * INTO v_progress
  FROM challenge_progress
  WHERE team_id = p_team_id AND challenge_id = p_challenge_id;

  IF NOT FOUND THEN
    INSERT INTO challenge_progress (team_id, challenge_id, game_id, state)
    VALUES (p_team_id, p_challenge_id, p_game_id,
            jsonb_build_object(
              'found', '[]'::jsonb,
              'points_per_find', '{}'::jsonb,
              'attempts_used', 0
            ))
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

  v_attempts_used := COALESCE((v_progress.state->>'attempts_used')::integer, 0);

  IF NOT v_unlimited AND v_attempts_used >= v_max_attempts THEN
    RETURN json_build_object('error', 'No attempts remaining', 'attempts_exhausted', true);
  END IF;

  v_found_indices := COALESCE(v_progress.state->'found', '[]'::jsonb);
  v_points_per_find := COALESCE(v_progress.state->'points_per_find', '{}'::jsonb);
  v_attempt_norm := normalize_answer(p_attempt);

  IF v_attempt_norm = '' THEN
    RETURN json_build_object('matched', false);
  END IF;

  v_idx := 0;
  FOR v_keyword IN SELECT jsonb_array_elements(v_keywords)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_found_indices) AS t(v)
      WHERE (v::text)::integer = v_idx
    ) THEN
      v_target_norm := normalize_answer(v_keyword->>'text');
      IF v_target_norm != '' AND v_target_norm = v_attempt_norm THEN
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

  IF v_matched_idx >= 0 THEN
    IF v_scoring_mode = 'placement' THEN
      SELECT COUNT(*) INTO v_other_finds
      FROM challenge_progress cp
      WHERE cp.challenge_id = p_challenge_id
        AND cp.team_id != p_team_id
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(COALESCE(cp.state->'found', '[]'::jsonb)) AS t(v)
          WHERE (v::text)::integer = v_matched_idx
        );
      v_place := v_other_finds + 1;
      SELECT COALESCE((elem->>'points')::integer, 0) INTO v_matched_points
      FROM jsonb_array_elements(v_placements) AS elem
      WHERE (elem->>'place')::integer = v_place
      LIMIT 1;
      v_matched_points := COALESCE(v_matched_points, 0);
    ELSE
      v_keyword := v_keywords->v_matched_idx;
      v_matched_points := COALESCE((v_keyword->>'points')::integer, 0);
    END IF;

    v_found_indices := v_found_indices || to_jsonb(v_matched_idx);
    v_points_per_find := jsonb_set(
      v_points_per_find,
      ARRAY[v_matched_idx::text],
      to_jsonb(v_matched_points),
      true
    );

    v_state_out := jsonb_build_object(
      'found', v_found_indices,
      'points_per_find', v_points_per_find,
      'attempts_used', v_attempts_used
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

  -- Miss: increment attempts_used
  v_attempts_used := v_attempts_used + 1;
  v_state_out := jsonb_build_object(
    'found', v_found_indices,
    'points_per_find', v_points_per_find,
    'attempts_used', v_attempts_used
  );
  UPDATE challenge_progress
  SET state = v_state_out, last_updated_at = now()
  WHERE id = v_progress.id;

  RETURN json_build_object(
    'matched', false,
    'attempts_used', v_attempts_used,
    'attempts_exhausted', NOT v_unlimited AND v_attempts_used >= v_max_attempts,
    'state', v_state_out
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Extend finalize_challenge to handle 'collective_memory'
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
  v_items jsonb;
  v_keywords jsonb;
  v_solved jsonb;
  v_locked jsonb;
  v_points_per_solve jsonb;
  v_answer jsonb;
  v_theme jsonb;
  v_item jsonb;
  v_keyword jsonb;
  v_found_count integer := 0;
  v_total_answers integer := 0;
  v_total_themes integer := 0;
  v_solved_count integer := 0;
  v_total_items integer := 0;
  v_total_keywords integer := 0;
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
        'total', v_total_answers
      );

    WHEN 'puzzle' THEN
      v_themes := v_config->'themes';
      v_total_themes := jsonb_array_length(v_themes);
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
        'total_themes', v_total_themes
      );

    WHEN 'gallery' THEN
      v_items := v_config->'items';
      v_total_items := jsonb_array_length(v_items);
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
        'total', v_total_items,
        'attempts_used', COALESCE((v_progress.state->>'attempts_used')::integer, 0)
      );

    WHEN 'collective_memory' THEN
      v_keywords := v_config->'keywords';
      v_total_keywords := jsonb_array_length(v_keywords);
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
        'total', v_total_keywords,
        'attempts_used', COALESCE((v_progress.state->>'attempts_used')::integer, 0)
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

GRANT EXECUTE ON FUNCTION collective_memory_attempt(uuid, uuid, uuid, uuid, text) TO anon, authenticated;
