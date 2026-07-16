-- ============================================
-- MIGRATION: Open Deur total attempt limit
-- Adds an optional cap on WRONG attempts for the whole challenge, matching
-- the semantics gallery + collective_memory already use (config.attempts,
-- state.attempts_used). A correct guess never costs an attempt.
--
-- Backward compatible: existing open_door challenges have no config.attempts
-- key, which COALESCEs to unlimited=true — their behaviour is unchanged.
--
-- Based on the open_door_attempt from migration_remove_time_limit.sql (the
-- current definition: placement scoring, no timer block).
-- Run AFTER migration_remove_time_limit.sql.
-- ============================================

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
  v_attempts jsonb;
  v_unlimited boolean;
  v_max_attempts integer;
  v_attempts_used integer;
  v_attempt_norm text;
  v_answer jsonb;
  v_idx integer := 0;
  v_found_indices jsonb;
  v_points_per_find jsonb;
  v_matched_idx integer := -1;
  v_matched_points integer := 0;
  v_target_norm text;
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
  IF v_challenge.type != 'open_door' THEN
    RETURN json_build_object('error', 'Wrong challenge type');
  END IF;

  v_config := v_challenge.config::jsonb;
  v_answers := v_config->'answers';
  v_fuzzy := COALESCE((v_config->>'fuzzy')::boolean, true);
  v_scoring_mode := COALESCE(v_config->>'scoring_mode', 'fixed');
  v_placements := COALESCE(v_config->'placements', '[]'::jsonb);
  -- Absent attempts config => unlimited (pre-existing challenges keep working)
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

  -- Blank input is a no-op: it must not burn an attempt.
  IF v_attempt_norm = '' THEN
    RETURN json_build_object('matched', false);
  END IF;

  v_idx := 0;
  FOR v_answer IN SELECT jsonb_array_elements(v_answers)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_found_indices) AS t(v)
      WHERE (v::text)::integer = v_idx
    ) THEN
      v_target_norm := normalize_answer(v_answer->>'text');
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

  -- ── Hit: award points, attempts_used untouched ──
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
      v_answer := v_answers->v_matched_idx;
      v_matched_points := COALESCE((v_answer->>'points')::integer, 0);
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

  -- ── Miss: burn one attempt ──
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

GRANT EXECUTE ON FUNCTION open_door_attempt(uuid, uuid, uuid, uuid, text) TO anon, authenticated;

-- finalize_challenge needs no change: its open_door branch reads state->'found'
-- and state->'points_per_find', and ignores the added attempts_used key.
