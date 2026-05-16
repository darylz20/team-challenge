-- ============================================
-- MIGRATION: Open Deur challenge type
-- + challenge_progress + single-device sessions
-- Run this in the Supabase SQL Editor
-- ============================================

-- Required extensions for fuzzy matching
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;

-- ── 1. Extend challenge type whitelist ──
ALTER TABLE challenges DROP CONSTRAINT IF EXISTS challenges_type_check;
ALTER TABLE challenges ADD CONSTRAINT challenges_type_check
  CHECK (type IN (
    'multiple_choice', 'free_text', 'photo_upload', 'gps_check',
    'open_door'
  ));

-- ── 2. Single-device session enforcement ──
ALTER TABLE teams ADD COLUMN IF NOT EXISTS active_session_token uuid;
-- Realtime needs full row on update so we can see token changes
ALTER TABLE teams REPLICA IDENTITY FULL;

-- Add teams to realtime publication if not already there
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE teams;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 3. Update login_team to issue session token ──
CREATE OR REPLACE FUNCTION login_team(p_team_name text, p_passcode text)
RETURNS json AS $$
DECLARE
  v_team teams%ROWTYPE;
  v_game games%ROWTYPE;
  v_token uuid := gen_random_uuid();
BEGIN
  SELECT t.* INTO v_team
  FROM teams t
  JOIN games g ON g.id = t.game_id
  WHERE lower(t.name) = lower(p_team_name)
    AND t.passcode = upper(p_passcode)
    AND g.status IN ('published', 'active')
  LIMIT 1;

  IF v_team IS NULL THEN
    RETURN json_build_object('error', 'Invalid team name or passcode');
  END IF;

  -- Issue new session token (invalidates any previous device)
  UPDATE teams SET active_session_token = v_token WHERE id = v_team.id;

  SELECT * INTO v_game FROM games WHERE id = v_team.game_id;

  RETURN json_build_object(
    'team', json_build_object(
      'id', v_team.id,
      'game_id', v_team.game_id,
      'name', v_team.name,
      'color', v_team.color
    ),
    'game', json_build_object(
      'id', v_game.id,
      'title', v_game.title,
      'status', v_game.status
    ),
    'session_token', v_token
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper: validate session token
CREATE OR REPLACE FUNCTION validate_session_token(p_team_id uuid, p_token uuid)
RETURNS boolean AS $$
  SELECT EXISTS(
    SELECT 1 FROM teams
    WHERE id = p_team_id
      AND active_session_token IS NOT NULL
      AND active_session_token = p_token
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- ── 4. challenge_progress table ──
CREATE TABLE IF NOT EXISTS challenge_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid REFERENCES teams(id) ON DELETE CASCADE,
  challenge_id uuid REFERENCES challenges(id) ON DELETE CASCADE,
  game_id uuid REFERENCES games(id) ON DELETE CASCADE,
  state jsonb NOT NULL DEFAULT '{}',
  started_at timestamptz DEFAULT now(),
  last_updated_at timestamptz DEFAULT now(),
  finalized boolean DEFAULT false,
  UNIQUE(team_id, challenge_id)
);

ALTER TABLE challenge_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read progress for published/active games" ON challenge_progress;
CREATE POLICY "Anyone can read progress for published/active games"
  ON challenge_progress FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM games WHERE id = challenge_progress.game_id
        AND status IN ('published', 'active')
    )
  );

DROP POLICY IF EXISTS "Admins can do everything with progress" ON challenge_progress;
CREATE POLICY "Admins can do everything with progress"
  ON challenge_progress FOR ALL USING (is_admin());

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE challenge_progress;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 5. Normalization helper ──
CREATE OR REPLACE FUNCTION normalize_answer(p_text text)
RETURNS text AS $$
  SELECT lower(unaccent(trim(coalesce(p_text, ''))));
$$ LANGUAGE sql IMMUTABLE;

-- ── 6. get_or_init_progress ──
CREATE OR REPLACE FUNCTION get_or_init_progress(
  p_team_id uuid,
  p_challenge_id uuid,
  p_game_id uuid,
  p_session_token uuid
)
RETURNS json AS $$
DECLARE
  v_progress challenge_progress%ROWTYPE;
BEGIN
  IF NOT validate_session_token(p_team_id, p_session_token) THEN
    RETURN json_build_object('error', 'Session invalidated');
  END IF;

  SELECT * INTO v_progress
  FROM challenge_progress
  WHERE team_id = p_team_id AND challenge_id = p_challenge_id;

  IF NOT FOUND THEN
    INSERT INTO challenge_progress (team_id, challenge_id, game_id, state)
    VALUES (p_team_id, p_challenge_id, p_game_id, '{}'::jsonb)
    RETURNING * INTO v_progress;
  END IF;

  RETURN json_build_object(
    'state', v_progress.state,
    'started_at', v_progress.started_at,
    'finalized', v_progress.finalized
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 7. open_door_attempt ──
-- Server-side fuzzy match. Returns matched index + points if hit, otherwise miss.
-- Updates challenge_progress.state.found atomically.
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
  v_attempt_norm text;
  v_answer jsonb;
  v_idx integer := 0;
  v_found_indices jsonb;
  v_matched_idx integer := -1;
  v_matched_points integer := 0;
  v_target_norm text;
  v_time_limit integer;
  v_elapsed integer;
  v_max_dist integer;
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

  SELECT * INTO v_progress
  FROM challenge_progress
  WHERE team_id = p_team_id AND challenge_id = p_challenge_id;

  IF NOT FOUND THEN
    INSERT INTO challenge_progress (team_id, challenge_id, game_id, state)
    VALUES (p_team_id, p_challenge_id, p_game_id,
            jsonb_build_object('found', '[]'::jsonb))
    RETURNING * INTO v_progress;
  END IF;

  IF v_progress.finalized THEN
    RETURN json_build_object('error', 'Challenge already finalized');
  END IF;

  -- Server-authoritative timer check
  v_time_limit := v_challenge.time_limit;
  IF v_time_limit IS NOT NULL THEN
    v_elapsed := EXTRACT(EPOCH FROM (now() - v_progress.started_at))::integer;
    IF v_elapsed > v_time_limit THEN
      RETURN json_build_object('error', 'Time expired', 'time_expired', true);
    END IF;
  END IF;

  v_found_indices := COALESCE(v_progress.state->'found', '[]'::jsonb);
  v_attempt_norm := normalize_answer(p_attempt);

  IF v_attempt_norm = '' THEN
    RETURN json_build_object('matched', false);
  END IF;

  -- Iterate answers, find first match that hasn't been found yet
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
        v_matched_points := COALESCE((v_answer->>'points')::integer, 0);
        EXIT;
      ELSIF v_fuzzy AND v_target_norm != '' THEN
        -- 1 typo allowed for short words, 2 for longer
        IF length(v_target_norm) <= 4 THEN
          v_max_dist := 1;
        ELSE
          v_max_dist := 2;
        END IF;
        IF levenshtein(v_target_norm, v_attempt_norm) <= v_max_dist THEN
          v_matched_idx := v_idx;
          v_matched_points := COALESCE((v_answer->>'points')::integer, 0);
          EXIT;
        END IF;
      END IF;
    END IF;
    v_idx := v_idx + 1;
  END LOOP;

  IF v_matched_idx >= 0 THEN
    v_found_indices := v_found_indices || to_jsonb(v_matched_idx);
    UPDATE challenge_progress
    SET state = jsonb_set(state, '{found}', v_found_indices),
        last_updated_at = now()
    WHERE id = v_progress.id;

    RETURN json_build_object(
      'matched', true,
      'index', v_matched_idx,
      'points', v_matched_points,
      'state', jsonb_build_object('found', v_found_indices)
    );
  END IF;

  RETURN json_build_object('matched', false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 8. finalize_challenge (dispatches per type) ──
-- Reads progress state, computes total score, writes ONE submissions row.
-- Idempotent: re-finalizing returns the existing submission.
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

  -- Idempotent: if already finalized, return existing submission
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
      v_found_count := jsonb_array_length(v_found_indices);

      FOR v_idx_elem IN SELECT jsonb_array_elements(v_found_indices)
      LOOP
        v_idx := (v_idx_elem::text)::integer;
        v_answer := v_answers->v_idx;
        v_total_points := v_total_points + COALESCE((v_answer->>'points')::integer, 0);
      END LOOP;

      v_is_correct := (v_found_count > 0);
      v_answer_payload := jsonb_build_object(
        'found_indices', v_found_indices,
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

-- ── 9. Grants ──
GRANT EXECUTE ON FUNCTION validate_session_token(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_or_init_progress(uuid, uuid, uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION open_door_attempt(uuid, uuid, uuid, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION finalize_challenge(uuid, uuid, uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION normalize_answer(text) TO anon, authenticated;
