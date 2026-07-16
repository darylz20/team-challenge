-- ============================================
-- MIGRATION: photo_upload challenge type (manual review)
--
-- Teams upload exactly ONE photo per photo_upload challenge. The submission
-- lands with is_correct = NULL and 0 points ("pending review"). An admin then
-- awards points from the Live Monitor via admin_review_photo.
--
-- Because useLeaderboard/useChallengeSolvers both skip rows where is_correct
-- is not true, a pending photo scores nothing and shows nowhere until the
-- admin acts. That is what keeps points invisible to the team until awarded.
--
-- NOTE: photo_upload existed before and was dropped in migration_remove_photo_gps.sql.
-- This re-adds it. Run AFTER all previous migrations.
-- ============================================

-- ── 1. Re-allow the type ──
ALTER TABLE challenges DROP CONSTRAINT IF EXISTS challenges_type_check;
ALTER TABLE challenges ADD CONSTRAINT challenges_type_check
  CHECK (type IN (
    'multiple_choice', 'free_text',
    'open_door', 'puzzle', 'gallery', 'collective_memory',
    'photo_upload'
  ));

-- ── 2. Storage bucket for team-submitted photos ──
-- Public bucket, same as challenge-media: URLs are unguessable (UUID paths) but
-- not secret. Players are anonymous (see login_team), so anon must be able to
-- INSERT. Uploads are therefore not authenticated — acceptable for a private
-- weekend game, but it does mean anyone who knows the project URL could upload
-- into this bucket.
INSERT INTO storage.buckets (id, name, public)
VALUES ('team-photos', 'team-photos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Anyone can upload a team photo" ON storage.objects;
CREATE POLICY "Anyone can upload a team photo"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'team-photos');

DROP POLICY IF EXISTS "Anyone can read team photos" ON storage.objects;
CREATE POLICY "Anyone can read team photos"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'team-photos');

-- Admins may delete team photos (e.g. clearing out a game).
DROP POLICY IF EXISTS "Admins can delete team photos" ON storage.objects;
CREATE POLICY "Admins can delete team photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'team-photos' AND is_admin());

-- ── 3. submit_answer: add the photo_upload branch ──
-- Same body as migration_remove_photo_gps.sql, plus a photo_upload case.
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

GRANT EXECUTE ON FUNCTION submit_answer(uuid, uuid, uuid, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION submit_answer(uuid, uuid, uuid, jsonb) TO authenticated;

-- ── 4. admin_review_photo ──
-- Awards points to a pending photo submission, in place. is_correct is set
-- from the points: awarding 0 marks the photo reviewed-but-not-solved, so it
-- neither scores nor counts as a solve, while still leaving review state on
-- the row so the team stops seeing "waiting for review".
CREATE OR REPLACE FUNCTION admin_review_photo(
  p_submission_id uuid,
  p_points integer,
  p_note text DEFAULT NULL
)
RETURNS json AS $$
DECLARE
  v_submission submissions%ROWTYPE;
  v_challenge challenges%ROWTYPE;
BEGIN
  IF NOT is_admin() THEN
    RETURN json_build_object('error', 'Admin only');
  END IF;

  IF p_points IS NULL OR p_points < 0 THEN
    RETURN json_build_object('error', 'Points must be zero or more');
  END IF;

  SELECT * INTO v_submission FROM submissions WHERE id = p_submission_id;
  IF v_submission IS NULL THEN
    RETURN json_build_object('error', 'Submission not found');
  END IF;

  SELECT * INTO v_challenge FROM challenges WHERE id = v_submission.challenge_id;
  IF v_challenge IS NULL OR v_challenge.type <> 'photo_upload' THEN
    RETURN json_build_object('error', 'Not a photo submission');
  END IF;

  UPDATE submissions
  SET is_correct = (p_points > 0),
      points_awarded = p_points,
      answer = answer || jsonb_build_object(
        'reviewed', true,
        'review_note', p_note,
        'reviewed_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      )
  WHERE id = p_submission_id;

  RETURN json_build_object(
    'id', p_submission_id,
    'points_awarded', p_points,
    'is_correct', (p_points > 0),
    'success', true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION admin_review_photo(uuid, integer, text) TO authenticated;
</content>
