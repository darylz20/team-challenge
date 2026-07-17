-- ============================================
-- MIGRATION: Fix time_limit-regressie in gallery/collective_memory
--
-- migration_answer_matching.sql genereerde deze twee attempt-functies
-- opnieuw uit hun oorspronkelijke bronbestanden (van vóór
-- migration_remove_time_limit.sql), waardoor de timer-check terugkwam:
--   record "v_challenge" has no field "time_limit"
-- De time_limit-kolom bestaat niet meer, dus elke poging faalde.
--
-- Hieronder staan beide functies opnieuw, zonder timer-check. Verder
-- byte-identiek aan de versie uit migration_answer_matching.sql, dus
-- answer_matches, placement en het pogingenplafond blijven ongewijzigd.
--
-- open_door_attempt was niet geraakt (kwam uit een nieuwer bronbestand).
-- Run in de Supabase SQL Editor, NA migration_answer_matching.sql.
-- ============================================

-- ── gallery_attempt ──
CREATE OR REPLACE FUNCTION gallery_attempt(
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
  v_items jsonb;
  v_fuzzy boolean;
  v_scoring_mode text;
  v_placements jsonb;
  v_attempts jsonb;
  v_unlimited boolean;
  v_max_attempts integer;
  v_attempts_used integer;
  v_attempt_norm text;
  v_item jsonb;
  v_idx integer := 0;
  v_found_indices jsonb;
  v_points_per_find jsonb;
  v_matched_idx integer := -1;
  v_matched_points integer := 0;
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
  IF v_challenge.type != 'gallery' THEN
    RETURN json_build_object('error', 'Wrong challenge type');
  END IF;

  v_config := v_challenge.config::jsonb;
  v_items := v_config->'items';
  v_fuzzy := COALESCE((v_config->>'fuzzy')::boolean, true);
  v_scoring_mode := COALESCE(v_config->>'scoring_mode', 'fixed');
  v_placements := COALESCE(v_config->'placements', '[]'::jsonb);
  v_attempts := COALESCE(v_config->'attempts', jsonb_build_object('unlimited', true, 'max', 0));
  v_unlimited := COALESCE((v_attempts->>'unlimited')::boolean, true);
  v_max_attempts := COALESCE((v_attempts->>'max')::integer, 0);

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
  FOR v_item IN SELECT jsonb_array_elements(v_items)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_found_indices) AS t(v)
      WHERE (v::text)::integer = v_idx
    ) THEN
      IF answer_matches(v_attempt_norm, v_item->>'answer', v_item->'alternatives', v_fuzzy) THEN
        v_matched_idx := v_idx;
        EXIT;
      END IF;
    END IF;
    v_idx := v_idx + 1;
  END LOOP;

  IF v_matched_idx >= 0 THEN
    -- Hit: compute points
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
      v_item := v_items->v_matched_idx;
      v_matched_points := COALESCE((v_item->>'points')::integer, 0);
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

-- ── collective_memory_attempt ──
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
      IF answer_matches(v_attempt_norm, v_keyword->>'text', v_keyword->'alternatives', v_fuzzy) THEN
        v_matched_idx := v_idx;
        EXIT;
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

GRANT EXECUTE ON FUNCTION gallery_attempt(uuid, uuid, uuid, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION collective_memory_attempt(uuid, uuid, uuid, uuid, text) TO anon, authenticated;
