-- ============================================
-- MIGRATION: Mandatory game introduction carousel
-- - games.intro_pages: array of { text, media? } shown before the game starts
-- - teams.intro_acknowledged_at: when this team clicked through the intro
-- - acknowledge_intro RPC: validates session token, stamps the team row
-- ============================================

ALTER TABLE games ADD COLUMN IF NOT EXISTS intro_pages jsonb NOT NULL DEFAULT '[]';
ALTER TABLE teams ADD COLUMN IF NOT EXISTS intro_acknowledged_at timestamptz;

-- RPC: team marks intro as acknowledged. Requires valid session token.
CREATE OR REPLACE FUNCTION acknowledge_intro(
  p_team_id uuid,
  p_session_token uuid
)
RETURNS json AS $$
DECLARE
  v_now timestamptz := now();
BEGIN
  IF NOT validate_session_token(p_team_id, p_session_token) THEN
    RETURN json_build_object('error', 'Session invalidated');
  END IF;

  UPDATE teams
  SET intro_acknowledged_at = v_now
  WHERE id = p_team_id;

  RETURN json_build_object('acknowledged_at', v_now);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION acknowledge_intro(uuid, uuid) TO anon, authenticated;

-- Admin-only reset helper: clear acknowledgements for all teams in a game.
-- Useful after editing the intro to force everyone to re-watch.
CREATE OR REPLACE FUNCTION reset_intro_acknowledgements(p_game_id uuid)
RETURNS integer AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  UPDATE teams
  SET intro_acknowledged_at = NULL
  WHERE game_id = p_game_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION reset_intro_acknowledgements(uuid) TO authenticated;
