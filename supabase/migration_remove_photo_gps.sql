-- ============================================
-- MIGRATION: Remove photo_upload + gps_check challenge types
-- These two types are no longer used. Existing challenges of these
-- types (and their submissions via CASCADE) are deleted.
-- Run AFTER all previous migrations.
-- ============================================

-- ── 1. Report what we're about to delete (visible in psql output) ──
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count FROM challenges WHERE type IN ('photo_upload', 'gps_check');
  RAISE NOTICE 'Deleting % challenge(s) of type photo_upload/gps_check (submissions CASCADE)', v_count;
END $$;

-- ── 2. Delete obsolete challenges (CASCADE removes their submissions/progress) ──
DELETE FROM challenges WHERE type IN ('photo_upload', 'gps_check');

-- ── 3. Update CHECK constraint to disallow these types going forward ──
ALTER TABLE challenges DROP CONSTRAINT IF EXISTS challenges_type_check;
ALTER TABLE challenges ADD CONSTRAINT challenges_type_check
  CHECK (type IN (
    'multiple_choice', 'free_text',
    'open_door', 'puzzle', 'gallery', 'collective_memory'
  ));

-- ── 4. Recreate submit_answer without photo_upload/gps_check cases ──
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
