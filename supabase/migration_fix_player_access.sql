-- ============================================
-- FIX: Player challenge access + answer scoring
-- Run this in the Supabase SQL Editor
-- ============================================

-- ── 1. Fix RLS policies: allow published AND active ──

-- Challenges: players need to see them once the game is published
DROP POLICY IF EXISTS "Anyone can read challenges for active games" ON challenges;
DROP POLICY IF EXISTS "Anyone can read challenges for published/active games" ON challenges;
CREATE POLICY "Anyone can read challenges for published/active games"
  ON challenges FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM games WHERE id = challenges.game_id AND status IN ('published', 'active')
    )
  );

-- Submissions: readable for published + active games (for leaderboard + completion status)
DROP POLICY IF EXISTS "Anyone can read submissions for active games" ON submissions;
DROP POLICY IF EXISTS "Anyone can read submissions for published/active games" ON submissions;
CREATE POLICY "Anyone can read submissions for published/active games"
  ON submissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM games WHERE id = submissions.game_id AND status IN ('published', 'active')
    )
  );

-- ── 2. Replace submit_answer with real scoring logic ──

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
  -- Validate team exists and belongs to this game
  SELECT * INTO v_team FROM teams WHERE id = p_team_id AND game_id = p_game_id;
  IF v_team IS NULL THEN
    RETURN json_build_object('error', 'Invalid team');
  END IF;

  -- Validate challenge exists and belongs to this game
  SELECT * INTO v_challenge FROM challenges WHERE id = p_challenge_id AND game_id = p_game_id;
  IF v_challenge IS NULL THEN
    RETURN json_build_object('error', 'Invalid challenge');
  END IF;

  v_config := v_challenge.config::jsonb;

  -- Check if already solved
  SELECT EXISTS(
    SELECT 1 FROM submissions
    WHERE team_id = p_team_id AND challenge_id = p_challenge_id AND is_correct = true
  ) INTO v_has_correct;
  IF v_has_correct THEN
    RETURN json_build_object('error', 'Already solved');
  END IF;

  -- Check attempt limits
  v_attempts := v_config->'attempts';
  v_unlimited := COALESCE((v_attempts->>'unlimited')::boolean, true);
  v_max_attempts := COALESCE((v_attempts->>'max')::integer, 1);

  SELECT COUNT(*) INTO v_attempt_count
  FROM submissions
  WHERE team_id = p_team_id AND challenge_id = p_challenge_id;

  IF NOT v_unlimited AND v_attempt_count >= v_max_attempts THEN
    RETURN json_build_object('error', 'No attempts remaining');
  END IF;

  -- ── Check correctness based on challenge type ──
  CASE v_challenge.type
    WHEN 'multiple_choice' THEN
      -- Check if selected options match the correct ones
      DECLARE
        v_correct_indices jsonb := '[]'::jsonb;
        v_selected jsonb;
        v_opt jsonb;
        v_idx integer := 0;
      BEGIN
        v_selected := COALESCE(p_answer->'selected', '[]'::jsonb);
        -- Build array of correct option indices
        FOR v_opt IN SELECT jsonb_array_elements(v_config->'options')
        LOOP
          IF (v_opt->>'is_correct')::boolean = true THEN
            v_correct_indices := v_correct_indices || to_jsonb(v_idx);
          END IF;
          v_idx := v_idx + 1;
        END LOOP;
        -- Compare sorted arrays
        v_is_correct := (
          (SELECT jsonb_agg(v ORDER BY v) FROM jsonb_array_elements(v_selected) AS t(v))
          =
          (SELECT jsonb_agg(v ORDER BY v) FROM jsonb_array_elements(v_correct_indices) AS t(v))
        );
      END;

    WHEN 'free_text' THEN
      -- Compare answer text
      DECLARE
        v_correct text;
        v_given text;
        v_case_sensitive boolean;
      BEGIN
        v_correct := v_config->>'correct_answer';
        v_given := p_answer->>'text';
        v_case_sensitive := COALESCE((v_config->>'case_sensitive')::boolean, false);
        IF v_case_sensitive THEN
          v_is_correct := (trim(v_given) = trim(v_correct));
        ELSE
          v_is_correct := (lower(trim(v_given)) = lower(trim(v_correct)));
        END IF;
      END;

    WHEN 'gps_check' THEN
      -- Check if coordinates are within radius
      DECLARE
        v_target_lat double precision;
        v_target_lng double precision;
        v_given_lat double precision;
        v_given_lng double precision;
        v_radius double precision;
        v_distance double precision;
      BEGIN
        v_target_lat := (v_config->>'lat')::double precision;
        v_target_lng := (v_config->>'lng')::double precision;
        v_radius := COALESCE((v_config->>'radius_meters')::double precision, 50);
        v_given_lat := (p_answer->>'lat')::double precision;
        v_given_lng := (p_answer->>'lng')::double precision;
        -- Haversine approximation (good enough for short distances)
        v_distance := 6371000 * 2 * asin(sqrt(
          power(sin(radians(v_given_lat - v_target_lat) / 2), 2) +
          cos(radians(v_target_lat)) * cos(radians(v_given_lat)) *
          power(sin(radians(v_given_lng - v_target_lng) / 2), 2)
        ));
        v_is_correct := (v_distance <= v_radius);
      END;

    WHEN 'photo_upload' THEN
      -- Photo uploads require manual review, mark as pending (null)
      v_is_correct := NULL;

    ELSE
      v_is_correct := false;
  END CASE;

  -- ── Calculate points ──
  IF v_is_correct IS TRUE THEN
    v_scoring := v_config->'scoring';

    IF v_scoring IS NOT NULL AND v_scoring->>'mode' = 'placement' THEN
      -- Count how many correct submissions exist before this one
      SELECT COUNT(*) + 1 INTO v_placement
      FROM submissions
      WHERE challenge_id = p_challenge_id AND is_correct = true;

      -- Find matching placement reward
      SELECT COALESCE((elem->>'points')::integer, 0) INTO v_points
      FROM jsonb_array_elements(v_scoring->'placements') AS elem
      WHERE (elem->>'place')::integer = v_placement;

      -- If placement not found (e.g., 4th place but only 3 defined), give 0
      v_points := COALESCE(v_points, 0);
    ELSE
      -- Fixed scoring: use scoring config or fall back to challenge.points
      v_points := COALESCE(
        (v_scoring->>'fixed_points')::integer,
        v_challenge.points
      );
    END IF;

    -- Subtract hint deductions
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

  -- ── Insert submission ──
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
