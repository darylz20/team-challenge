-- ============================================
-- MIGRATION: Losser antwoorden matchen + meerdere goede antwoorden
--
-- 1. normalize_answer negeert nu ALLE witruimte (was: alleen begin/eind).
--    "Van Gogh" == "vangogh" == "van  gogh".
-- 2. Nieuwe helper answer_matches(): vergelijkt een genormaliseerde poging
--    met het hoofdantwoord EN met config.alternatives, met optionele
--    typotolerantie. Vervangt het matching-blok dat in open_door,
--    gallery en collective_memory drie keer gedupliceerd stond.
-- 3. free_text matcht nu via dezelfde weg (dus ook accent- en
--    witruimte-ongevoelig) en accepteert alternatives. De case_sensitive
--    vlag wordt genegeerd.
--
-- Achterwaarts compatibel: geen alternatives = huidige gedrag.
-- Puzzle deelt normalize_answer en wordt daarmee ook witruimte-ongevoelig;
-- meerdere antwoorden gelden daar bewust niet.
--
-- Run in de Supabase SQL Editor, NA alle eerdere migraties.
-- ============================================

-- ── 1. normalize_answer: alle witruimte eruit ──
CREATE OR REPLACE FUNCTION normalize_answer(p_text text)
RETURNS text AS $$
  SELECT lower(unaccent(regexp_replace(coalesce(p_text, ''), '\s+', '', 'g')));
$$ LANGUAGE sql IMMUTABLE;

-- ── 2. answer_matches: hoofdantwoord + alternatives, optioneel fuzzy ──
-- p_attempt_norm moet al genormaliseerd zijn. Kandidaten worden hier
-- genormaliseerd, zodat de admin ze mag intypen zoals hij wil.
CREATE OR REPLACE FUNCTION answer_matches(
  p_attempt_norm text,
  p_target text,
  p_alternatives jsonb,
  p_fuzzy boolean
)
RETURNS boolean AS $$
DECLARE
  v_candidate text;
  v_norm text;
  v_max_dist integer;
BEGIN
  IF COALESCE(p_attempt_norm, '') = '' THEN
    RETURN false;
  END IF;

  FOR v_candidate IN
    SELECT COALESCE(p_target, '')
    UNION ALL
    SELECT value FROM jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(p_alternatives) = 'array'
           THEN p_alternatives ELSE '[]'::jsonb END
    )
  LOOP
    v_norm := normalize_answer(v_candidate);
    CONTINUE WHEN v_norm = '';

    IF v_norm = p_attempt_norm THEN
      RETURN true;
    END IF;

    IF p_fuzzy THEN
      IF length(v_norm) <= 4 THEN
        v_max_dist := 1;
      ELSE
        v_max_dist := 2;
      END IF;
      IF levenshtein(v_norm, p_attempt_norm) <= v_max_dist THEN
        RETURN true;
      END IF;
    END IF;
  END LOOP;

  RETURN false;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

GRANT EXECUTE ON FUNCTION answer_matches(text, text, jsonb, boolean) TO anon, authenticated;

-- ── 3. Attempt-functies: matching via answer_matches ──
-- Onderstaande functies zijn hun huidige versie met alleen het matching-blok
-- vervangen; scoring, placement, pogingen en finalize zijn ongewijzigd.

-- ── open_door_attempt ──
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
      IF answer_matches(v_attempt_norm, v_answer->>'text', v_answer->'alternatives', v_fuzzy) THEN
        v_matched_idx := v_idx;
        EXIT;
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
  v_time_limit integer;
  v_elapsed integer;
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
  v_time_limit integer;
  v_elapsed integer;
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

-- ── 4. submit_answer: free_text-branch via answer_matches ──
CREATE OR REPLACE FUNCTION submit_answer(
  p_team_id uuid,
  p_challenge_id uuid,
  p_game_id uuid,
  p_answer jsonb
)
RETURNS json AS $$
DECLARE
  v_team teams%ROWTYPE;
  v_challenge challenges%ROWTYPE;
  v_config jsonb;
  v_attempts jsonb;
  v_is_correct boolean := false;
  v_points integer := 0;
  v_scoring jsonb;
  v_hints_used integer := 0;
  v_hint_deduction integer := 0;
  v_attempt_count integer;
  v_has_correct boolean;
  v_max_attempts integer;
  v_unlimited boolean;
  v_submission_id uuid;
  v_placement integer;
BEGIN
  SELECT * INTO v_team FROM teams WHERE id = p_team_id AND game_id = p_game_id;
  IF v_team IS NULL THEN
    RETURN json_build_object('error', 'Invalid team');
  END IF;

  SELECT * INTO v_challenge FROM challenges WHERE id = p_challenge_id AND game_id = p_game_id;
  IF v_challenge IS NULL THEN
    RETURN json_build_object('error', 'Invalid challenge');
  END IF;

  v_config := v_challenge.config::jsonb;

  SELECT EXISTS(
    SELECT 1 FROM submissions
    WHERE team_id = p_team_id AND challenge_id = p_challenge_id AND is_correct = true
  ) INTO v_has_correct;
  IF v_has_correct THEN
    RETURN json_build_object('error', 'Already solved');
  END IF;

  v_attempts := v_config->'attempts';
  v_unlimited := COALESCE((v_attempts->>'unlimited')::boolean, true);
  v_max_attempts := COALESCE((v_attempts->>'max')::integer, 1);

  SELECT COUNT(*) INTO v_attempt_count
  FROM submissions
  WHERE team_id = p_team_id AND challenge_id = p_challenge_id;

  IF NOT v_unlimited AND v_attempt_count >= v_max_attempts THEN
    RETURN json_build_object('error', 'No attempts remaining');
  END IF;

  CASE v_challenge.type
    WHEN 'multiple_choice' THEN
      DECLARE
        v_correct_indices jsonb := '[]'::jsonb;
        v_selected jsonb;
        v_opt jsonb;
        v_idx integer := 0;
      BEGIN
        v_selected := COALESCE(p_answer->'selected', '[]'::jsonb);
        FOR v_opt IN SELECT jsonb_array_elements(v_config->'options')
        LOOP
          IF (v_opt->>'is_correct')::boolean = true THEN
            v_correct_indices := v_correct_indices || to_jsonb(v_idx);
          END IF;
          v_idx := v_idx + 1;
        END LOOP;
        v_is_correct := (
          (SELECT jsonb_agg(v ORDER BY v) FROM jsonb_array_elements(v_selected) AS t(v))
          =
          (SELECT jsonb_agg(v ORDER BY v) FROM jsonb_array_elements(v_correct_indices) AS t(v))
        );
      END;

    WHEN 'free_text' THEN
      -- Case, accents and whitespace are handled by normalize_answer; the
      -- old case_sensitive flag is deliberately ignored. Extra accepted
      -- spellings live in config.alternatives. Typo tolerance is opt-in and
      -- defaults off so challenges made before this migration keep matching
      -- exactly as they did.
      v_is_correct := answer_matches(
        normalize_answer(p_answer->>'text'),
        v_config->>'correct_answer',
        v_config->'alternatives',
        COALESCE((v_config->>'fuzzy')::boolean, false)
      );

    WHEN 'photo_upload' THEN
      -- Exactly one photo per team, ever. Any prior row (pending or reviewed)
      -- blocks a second upload. Checked here rather than via the attempts
      -- config so an admin can't accidentally widen it in the builder.
      IF v_attempt_count > 0 THEN
        RETURN json_build_object('error', 'Photo already submitted');
      END IF;

      IF COALESCE(p_answer->>'photo_url', '') = '' THEN
        RETURN json_build_object('error', 'No photo provided');
      END IF;

      -- NULL = awaiting admin review. Stays 0 points until admin_review_photo.
      v_is_correct := NULL;

    ELSE
      -- Interactive types (open_door/puzzle/gallery/collective_memory) use
      -- their own *_attempt + finalize_challenge RPCs and should not reach here.
      RETURN json_build_object('error', 'submit_answer not supported for type: ' || v_challenge.type);
  END CASE;

  IF v_is_correct IS TRUE THEN
    v_scoring := v_config->'scoring';

    IF v_scoring IS NOT NULL AND v_scoring->>'mode' = 'placement' THEN
      SELECT COUNT(*) + 1 INTO v_placement
      FROM submissions
      WHERE challenge_id = p_challenge_id AND is_correct = true;

      SELECT COALESCE((elem->>'points')::integer, 0) INTO v_points
      FROM jsonb_array_elements(v_scoring->'placements') AS elem
      WHERE (elem->>'place')::integer = v_placement;

      v_points := COALESCE(v_points, 0);
    ELSE
      v_points := COALESCE(
        (v_scoring->>'fixed_points')::integer,
        v_challenge.points
      );
    END IF;

    v_hints_used := COALESCE((p_answer->>'hints_used')::integer, 0);
    IF v_hints_used > 0 AND v_config->'hints' IS NOT NULL THEN
      SELECT COALESCE(SUM((elem->>'deduction')::integer), 0) INTO v_hint_deduction
      FROM (
        SELECT jsonb_array_elements(v_config->'hints'->'items') AS elem
        LIMIT v_hints_used
      ) sub;
      v_points := GREATEST(v_points - v_hint_deduction, 0);
    END IF;
  END IF;

  INSERT INTO submissions (challenge_id, team_id, game_id, answer, is_correct, points_awarded)
  VALUES (p_challenge_id, p_team_id, p_game_id, p_answer, v_is_correct, v_points)
  RETURNING id INTO v_submission_id;

  RETURN json_build_object(
    'id', v_submission_id,
    'is_correct', v_is_correct,
    'points_awarded', v_points,
    'success', true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 5. Grants (ongewijzigd, voor de zekerheid opnieuw) ──
GRANT EXECUTE ON FUNCTION open_door_attempt(uuid, uuid, uuid, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION gallery_attempt(uuid, uuid, uuid, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION collective_memory_attempt(uuid, uuid, uuid, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION submit_answer(uuid, uuid, uuid, jsonb) TO anon, authenticated;
