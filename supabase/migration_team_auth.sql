-- ============================================
-- MIGRATION: Team-based Auth (passcode login)
-- Run this in the Supabase SQL Editor
-- ============================================

-- 1. Add passcode column to teams
ALTER TABLE teams ADD COLUMN IF NOT EXISTS passcode text;

-- Generate passcodes for any existing teams
UPDATE teams SET passcode = upper(substr(md5(random()::text), 1, 6))
WHERE passcode IS NULL;

-- Make passcode non-nullable going forward
ALTER TABLE teams ALTER COLUMN passcode SET NOT NULL;
ALTER TABLE teams ALTER COLUMN passcode SET DEFAULT upper(substr(md5(random()::text), 1, 6));

-- 2. Create RPC function for team login
CREATE OR REPLACE FUNCTION login_team(p_team_name text, p_passcode text)
RETURNS json AS $$
DECLARE
  v_team teams%ROWTYPE;
  v_game games%ROWTYPE;
BEGIN
  -- Find team by name + passcode in an active/published game
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

  -- Fetch the game
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
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Create RPC function for submitting answers
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
  v_is_correct boolean;
  v_points integer;
  v_submission_id uuid;
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

  -- Insert the submission (scoring logic can be added later)
  INSERT INTO submissions (challenge_id, team_id, game_id, answer, is_correct, points_awarded)
  VALUES (p_challenge_id, p_team_id, p_game_id, p_answer, NULL, 0)
  RETURNING id INTO v_submission_id;

  RETURN json_build_object('id', v_submission_id, 'success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Make player_id nullable on submissions (teams are the primary identifier now)
ALTER TABLE submissions ALTER COLUMN player_id DROP NOT NULL;

-- 5. Update RLS policies for anonymous access to active game data

-- Allow anyone to read challenges for active games
DROP POLICY IF EXISTS "Players can read challenges for active games they are in" ON challenges;
CREATE POLICY "Anyone can read challenges for active games"
  ON challenges FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM games WHERE id = challenges.game_id AND status = 'active'
    )
  );

-- Allow anyone to read teams for active/published games
DROP POLICY IF EXISTS "Players can read teams for their games" ON teams;
CREATE POLICY "Anyone can read teams for active games"
  ON teams FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM games WHERE id = teams.game_id AND status IN ('published', 'active')
    )
  );

-- Allow anyone to read published/active games (no player check needed)
DROP POLICY IF EXISTS "Players can read published/active games they are in" ON games;
CREATE POLICY "Anyone can read active games"
  ON games FOR SELECT
  USING (status IN ('published', 'active'));

-- Allow anyone to read submissions for active games (for leaderboard)
DROP POLICY IF EXISTS "Players can read own submissions" ON submissions;
CREATE POLICY "Anyone can read submissions for active games"
  ON submissions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM games WHERE id = submissions.game_id AND status = 'active'
    )
  );

-- Drop the old player insert policy (submissions now go through RPC)
DROP POLICY IF EXISTS "Players can insert own submissions" ON submissions;

-- 6. Grant anon access to the RPC functions
GRANT EXECUTE ON FUNCTION login_team(text, text) TO anon;
GRANT EXECUTE ON FUNCTION login_team(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION submit_answer(uuid, uuid, uuid, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION submit_answer(uuid, uuid, uuid, jsonb) TO authenticated;
