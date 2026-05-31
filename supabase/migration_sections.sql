-- ============================================
-- MIGRATION: Sections (chapters) within a game
-- Every challenge belongs to exactly one section. Admin opens sections
-- one by one to pace the game. Locked sections are visible to players
-- but their challenges are not playable.
-- ============================================

-- ── 1. sections table ──
CREATE TABLE IF NOT EXISTS sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Untitled section',
  description text,
  is_open boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sections_game_id_idx ON sections(game_id);
CREATE INDEX IF NOT EXISTS sections_sort_order_idx ON sections(game_id, sort_order);

-- Realtime so players see is_open flips immediately
ALTER TABLE sections REPLICA IDENTITY FULL;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE sections;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE sections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage sections" ON sections;
CREATE POLICY "Admins manage sections"
  ON sections FOR ALL
  USING (is_admin());

DROP POLICY IF EXISTS "Anyone can read sections for published/active games" ON sections;
CREATE POLICY "Anyone can read sections for published/active games"
  ON sections FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM games
      WHERE id = sections.game_id
        AND status IN ('published', 'active')
    )
  );

-- ── 2. challenges.section_id ──
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS section_id uuid
  REFERENCES sections(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS challenges_section_id_idx ON challenges(section_id);

-- ── 3. Backfill: for every existing game, create "Sectie 1" (open) and
--       assign every existing challenge to it. ──
DO $$
DECLARE
  v_game record;
  v_section_id uuid;
BEGIN
  FOR v_game IN SELECT id FROM games LOOP
    -- Skip if this game already has a section (re-running migration)
    IF EXISTS (SELECT 1 FROM sections WHERE game_id = v_game.id) THEN
      CONTINUE;
    END IF;

    INSERT INTO sections (game_id, title, is_open, sort_order)
    VALUES (v_game.id, 'Sectie 1', true, 0)
    RETURNING id INTO v_section_id;

    UPDATE challenges
    SET section_id = v_section_id
    WHERE game_id = v_game.id AND section_id IS NULL;
  END LOOP;
END $$;

-- ── 4. Enforce NOT NULL going forward ──
ALTER TABLE challenges ALTER COLUMN section_id SET NOT NULL;

-- ── 5. Auto-create default section for every new game ──
CREATE OR REPLACE FUNCTION create_default_section_for_game()
RETURNS trigger AS $$
BEGIN
  INSERT INTO sections (game_id, title, is_open, sort_order)
  VALUES (NEW.id, 'Sectie 1', true, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_game_created ON games;
CREATE TRIGGER on_game_created
  AFTER INSERT ON games
  FOR EACH ROW EXECUTE FUNCTION create_default_section_for_game();
