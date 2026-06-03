-- ============================================
-- MIGRATION: Remove time limits globally
-- - Drop challenges.time_limit column
-- - Replace 4 attempt RPCs to remove their timer-check blocks
-- ============================================

-- ── 1. open_door_attempt — timer check removed ──
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

  v_found_indices := COALESCE(v_progress.state->'found', '[]'::jsonb);
  v_points_per_find := COALESCE(v_progress.state->'points_per_find', '{}'::jsonb);
  v_attempt_norm := normalize_answer(p_attempt);

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

-- ── 2. puzzle_attempt — timer check removed ──
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

  v_solved := COALESCE(v_progress.state->'solved', '[]'::jsonb);
  v_locked := COALESCE(v_progress.state->'locked', '[]'::jsonb);
  v_attempts_remaining := COALESCE(v_progress.state->'attempts_remaining', '[]'::jsonb);
  v_points_per_solve := COALESCE(v_progress.state->'points_per_solve', '{}'::jsonb);
  v_attempt_norm := normalize_answer(p_attempt);

  IF v_attempt_norm = '' THEN
    RETURN json_build_object('matched', false);
  END IF;

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

  IF v_matched_idx >= 0 THEN
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

-- ── 3. gallery_attempt — timer check removed ──
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
      v_target_norm := normalize_answer(v_item->>'answer');
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

-- ── 4. collective_memory_attempt — timer check removed ──
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

-- ── 5. Drop the column ──
ALTER TABLE challenges DROP COLUMN IF EXISTS time_limit;
