-- ═══════════════════════════════════════════════════════
--  DigitalStudyCenter — Production-Ready Database Migrations
--  Run this in Supabase Dashboard → SQL Editor
-- ═══════════════════════════════════════════════════════

-- 1. TABLES SETUP
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT,
  first_name  TEXT,
  last_name   TEXT,
  role        TEXT DEFAULT 'student' CHECK (role IN ('student', 'teacher', 'admin')),
  email       TEXT,
  class       TEXT,
  subject     TEXT,
  bio         TEXT,
  is_active   BOOLEAN DEFAULT TRUE,
  last_payment_month TEXT, -- Format: YYYY-MM
  last_activity      TIMESTAMPTZ,
  updated_at         TIMESTAMPTZ DEFAULT NOW(),
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.users (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT,
  role        TEXT,
  full_name   TEXT,
  first_name  TEXT,
  last_name   TEXT,
  is_active   BOOLEAN DEFAULT TRUE,
  fees_status TEXT,
  last_activity TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. HARDENED HELPER FUNCTIONS
-- Central source of truth for user role with COALESCE fallback
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT AS $$
DECLARE
  user_role TEXT;
BEGIN
  SELECT role INTO user_role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
  RETURN COALESCE(user_role, 'student');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. HARDENED TRIGGER FUNCTION (SECURITY DEFINER + search_path)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, first_name, last_name, role, class)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'student'),
    COALESCE(NEW.raw_user_meta_data->>'course', NEW.raw_user_meta_data->>'class')
  );

  INSERT INTO public.users (id, email, role, full_name, first_name, last_name, course, created_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'student'),
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'course', NEW.raw_user_meta_data->>'class'),
    NOW()
  ) ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. TRIGGER SETUP
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. ENABLE RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

-- 6. PROFILES POLICIES (Secure & Non-Recursive)
DROP POLICY IF EXISTS "Profiles: Users can read own" ON public.profiles;
CREATE POLICY "Profiles: Users can read own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Profiles: Teachers can read students" ON public.profiles;
CREATE POLICY "Profiles: Teachers can read students" ON public.profiles
  FOR SELECT USING (public.get_my_role() = 'teacher');

DROP POLICY IF EXISTS "Profiles: Users can update own" ON public.profiles;
CREATE POLICY "Profiles: Users can update own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Profiles: Authorize insert" ON public.profiles;
CREATE POLICY "Profiles: Authorize insert" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Profiles: Teachers can update students" ON public.profiles;
CREATE POLICY "Profiles: Teachers can update students" ON public.profiles
  FOR UPDATE USING (public.get_my_role() = 'teacher');

-- 7. USERS POLICIES (Restricted & Secure)
DROP POLICY IF EXISTS "Users: Personal read access" ON public.users;
CREATE POLICY "Users: Personal read access" ON public.users
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users: Teacher read access to students" ON public.users;
CREATE POLICY "Users: Teacher read access to students" ON public.users
  FOR SELECT USING (public.get_my_role() = 'teacher');

DROP POLICY IF EXISTS "Users: Personal update access" ON public.users;
CREATE POLICY "Users: Personal update access" ON public.users
  FOR UPDATE USING (auth.uid() = id);

-- 8. NOTES POLICIES (Optimized EXISTS logic)
DROP POLICY IF EXISTS "Notes: Teacher full access" ON public.notes;
CREATE POLICY "Notes: Teacher full access" ON public.notes
  FOR SELECT USING (public.get_my_role() = 'teacher');

DROP POLICY IF EXISTS "Notes: Student payment access" ON public.notes;
CREATE POLICY "Notes: Student payment access" ON public.notes
  FOR SELECT USING (
    public.get_my_role() = 'student' AND (
      EXTRACT(DAY FROM NOW()) <= 5 OR
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
        AND last_payment_month = TO_CHAR(NOW(), 'YYYY-MM')
      )
    )
  );

-- 9. RESTRICTED PERMISSIONS (Production-Grade)
-- Revoke all to start fresh
REVOKE ALL ON public.profiles FROM authenticated;
REVOKE ALL ON public.users FROM authenticated;
REVOKE ALL ON public.notes FROM authenticated;

-- Profiles: read/update own, teacher can read all
GRANT SELECT, UPDATE, INSERT ON public.profiles TO authenticated;

-- Users: read/update (restricted by RLS)
GRANT SELECT, UPDATE ON public.users TO authenticated;

-- Notes: read-only
GRANT SELECT ON public.notes TO authenticated;

-- 10. PERFORMANCE INDEXES (Optimized for 1000+ users)
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_notes_teacher_id ON public.notes(teacher_id);
CREATE INDEX IF NOT EXISTS idx_assignments_teacher_id ON public.assignments(teacher_id);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_teacher_id ON public.attendance_sessions(teacher_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_session_id ON public.attendance_records(session_id);
CREATE INDEX IF NOT EXISTS idx_attendance_records_student_id ON public.attendance_records(student_id);
