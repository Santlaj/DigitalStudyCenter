-- ═══════════════════════════════════════════════════════
--  DigitalStudyCenter — Row Level Security (RLS) Policies
--  Run this in Supabase Dashboard → SQL Editor
--  Safe to re-run — drops existing policies first.
-- ═══════════════════════════════════════════════════════

-- Enable RLS on all tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE downloads ENABLE ROW LEVEL SECURITY;
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;

-- ── USERS ──
DROP POLICY IF EXISTS "Users can read own profile" ON users;
CREATE POLICY "Users can read own profile"
  ON users FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON users;
CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Teachers can read students" ON users;
CREATE POLICY "Teachers can read students"
  ON users FOR SELECT
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'teacher'
  );

DROP POLICY IF EXISTS "Service role full access on users" ON users;
CREATE POLICY "Service role full access on users"
  ON users FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ── NOTES ──
DROP POLICY IF EXISTS "Authenticated users can read notes" ON notes;
CREATE POLICY "Authenticated users can read notes"
  ON notes FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Teachers can insert own notes" ON notes;
CREATE POLICY "Teachers can insert own notes"
  ON notes FOR INSERT
  WITH CHECK (auth.uid() = teacher_id);

DROP POLICY IF EXISTS "Teachers can delete own notes" ON notes;
CREATE POLICY "Teachers can delete own notes"
  ON notes FOR DELETE
  USING (auth.uid() = teacher_id);

-- ── ASSIGNMENTS ──
DROP POLICY IF EXISTS "Authenticated users can read assignments" ON assignments;
CREATE POLICY "Authenticated users can read assignments"
  ON assignments FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Teachers can insert own assignments" ON assignments;
CREATE POLICY "Teachers can insert own assignments"
  ON assignments FOR INSERT
  WITH CHECK (auth.uid() = teacher_id);

DROP POLICY IF EXISTS "Teachers can delete own assignments" ON assignments;
CREATE POLICY "Teachers can delete own assignments"
  ON assignments FOR DELETE
  USING (auth.uid() = teacher_id);

-- ── SUBMISSIONS ──
DROP POLICY IF EXISTS "Students can submit assignments" ON submissions;
CREATE POLICY "Students can submit assignments"
  ON submissions FOR INSERT
  WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "Students can read own submissions" ON submissions;
CREATE POLICY "Students can read own submissions"
  ON submissions FOR SELECT
  USING (auth.uid() = student_id);

DROP POLICY IF EXISTS "Teachers can read all submissions" ON submissions;
CREATE POLICY "Teachers can read all submissions"
  ON submissions FOR SELECT
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'teacher'
  );

-- ── ATTENDANCE SESSIONS ──
DROP POLICY IF EXISTS "Teachers can CRUD own sessions" ON attendance_sessions;
CREATE POLICY "Teachers can CRUD own sessions"
  ON attendance_sessions FOR ALL
  USING (auth.uid() = teacher_id);

DROP POLICY IF EXISTS "Students can read attendance sessions" ON attendance_sessions;
CREATE POLICY "Students can read attendance sessions"
  ON attendance_sessions FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ── ATTENDANCE RECORDS ──
DROP POLICY IF EXISTS "Teachers can CRUD records" ON attendance_records;
CREATE POLICY "Teachers can CRUD records"
  ON attendance_records FOR ALL
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'teacher'
  );

DROP POLICY IF EXISTS "Students can read own records" ON attendance_records;
CREATE POLICY "Students can read own records"
  ON attendance_records FOR SELECT
  USING (auth.uid() = student_id);

-- ── FEE PAYMENTS ──
DROP POLICY IF EXISTS "Students can read own fees" ON fee_payments;
CREATE POLICY "Students can read own fees"
  ON fee_payments FOR SELECT
  USING (auth.uid() = student_id);

DROP POLICY IF EXISTS "Teachers can manage all fees" ON fee_payments;
CREATE POLICY "Teachers can manage all fees"
  ON fee_payments FOR ALL
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'teacher'
  );

-- ── ANNOUNCEMENTS ──
DROP POLICY IF EXISTS "Authenticated users can read announcements" ON announcements;
CREATE POLICY "Authenticated users can read announcements"
  ON announcements FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Teachers can insert announcements" ON announcements;
CREATE POLICY "Teachers can insert announcements"
  ON announcements FOR INSERT
  WITH CHECK (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'teacher'
  );

-- ── DOWNLOADS ──
DROP POLICY IF EXISTS "Students can insert own downloads" ON downloads;
CREATE POLICY "Students can insert own downloads"
  ON downloads FOR INSERT
  WITH CHECK (auth.uid() = student_id);

DROP POLICY IF EXISTS "Students can read own downloads" ON downloads;
CREATE POLICY "Students can read own downloads"
  ON downloads FOR SELECT
  USING (auth.uid() = student_id);

DROP POLICY IF EXISTS "Teachers can read all downloads" ON downloads;
CREATE POLICY "Teachers can read all downloads" ON downloads;
CREATE POLICY "Teachers can read all downloads"
  ON downloads FOR SELECT
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'teacher'
  );

-- ── COURSES ──
DROP POLICY IF EXISTS "Authenticated users can read courses" ON courses;
CREATE POLICY "Authenticated users can read courses"
  ON courses FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- ═══════════════════════════════════════════════════════
--  STORAGE BUCKET POLICIES
--  Run in Supabase Dashboard → Storage → Policies
-- ═══════════════════════════════════════════════════════

-- Notes bucket: teachers can upload, anyone can read
-- Submissions bucket: students can upload own, teachers can read all
-- (Configure these via Supabase Dashboard → Storage → notes/submissions → Policies)
