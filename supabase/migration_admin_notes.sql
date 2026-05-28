-- ============================================
-- MIGRATION: Admin notes
-- Personal scratch pad for an admin to jot down challenge ideas.
-- Each note belongs to one admin (admin_id). RLS restricts read/write
-- to the owner who is also an admin.
-- ============================================

CREATE TABLE IF NOT EXISTS admin_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_notes_admin_id_idx ON admin_notes(admin_id);
CREATE INDEX IF NOT EXISTS admin_notes_updated_at_idx ON admin_notes(updated_at DESC);

ALTER TABLE admin_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage own notes" ON admin_notes;
CREATE POLICY "Admins manage own notes"
  ON admin_notes FOR ALL
  USING (admin_id = auth.uid() AND is_admin())
  WITH CHECK (admin_id = auth.uid() AND is_admin());
