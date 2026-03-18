-- ═══════════════════════════════════════════════════════
--  DigitalStudyCenter — Database Migration
--  Run this in Supabase Dashboard → SQL Editor
--  Aligns existing tables to match the backend API.
--  Then run rls-policies.sql AFTER this completes.
-- ═══════════════════════════════════════════════════════

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  1. FIX EXISTING TABLE: notes
--     Rename created_by → teacher_id
--     Add missing columns
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALTER TABLE notes RENAME COLUMN created_by TO teacher_id;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS subject        TEXT;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS course         TEXT;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS description    TEXT;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS file_url       TEXT;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS download_count INTEGER DEFAULT 0;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  2. FIX EXISTING TABLE: attendance_sessions
--     Rename session_date → date
--     Rename class_level  → class_name
--     Add text subject column (backend uses text, not FK)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALTER TABLE attendance_sessions RENAME COLUMN session_date TO date;
ALTER TABLE attendance_sessions RENAME COLUMN class_level  TO class_name;
ALTER TABLE attendance_sessions ADD COLUMN IF NOT EXISTS subject TEXT;

-- If subject_id had data, copy subject names from the subjects table
UPDATE attendance_sessions AS a
  SET subject = s.name
  FROM subjects AS s
  WHERE a.subject_id = s.id
    AND a.subject IS NULL;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  3. FIX EXISTING TABLE: users
--     Add missing column
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_activity TIMESTAMPTZ;

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  4. CREATE MISSING TABLES
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- courses
CREATE TABLE IF NOT EXISTS courses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- assignments
CREATE TABLE IF NOT EXISTS assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  subject     TEXT NOT NULL,
  description TEXT,
  deadline    TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- submissions
CREATE TABLE IF NOT EXISTS submissions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id   UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_url        TEXT NOT NULL,
  submitted_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(assignment_id, student_id)
);

-- fee_payments
CREATE TABLE IF NOT EXISTS fee_payments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month       TEXT NOT NULL,
  status      TEXT DEFAULT 'unpaid' CHECK (status IN ('paid', 'unpaid', 'pending')),
  amount      NUMERIC(10,2),
  due_date    DATE,
  paid_at     TIMESTAMPTZ,
  receipt_url TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, month)
);

-- announcements
CREATE TABLE IF NOT EXISTS announcements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  message     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- downloads
CREATE TABLE IF NOT EXISTS downloads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note_id       UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  note_title    TEXT,
  downloaded_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(student_id, note_id)
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  5. INDEXES
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE INDEX IF NOT EXISTS idx_notes_teacher          ON notes(teacher_id);
CREATE INDEX IF NOT EXISTS idx_assignments_teacher    ON assignments(teacher_id);
CREATE INDEX IF NOT EXISTS idx_assignments_deadline   ON assignments(deadline);
CREATE INDEX IF NOT EXISTS idx_submissions_student    ON submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_submissions_assign     ON submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_fee_student            ON fee_payments(student_id);
CREATE INDEX IF NOT EXISTS idx_fee_month              ON fee_payments(month);
CREATE INDEX IF NOT EXISTS idx_downloads_student      ON downloads(student_id);
CREATE INDEX IF NOT EXISTS idx_announcements_created  ON announcements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_att_sessions_teacher   ON attendance_sessions(teacher_id);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
--  6. STORAGE BUCKETS
--     Create these manually in Supabase Dashboard → Storage:
--     1. Bucket "notes"       (public)
--     2. Bucket "submissions"  (public)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

-- Done! Now run rls-policies.sql next.
