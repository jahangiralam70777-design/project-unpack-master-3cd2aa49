-- =============================================================================
-- Study Routine module — final, self-contained schema.
-- Apply via: supabase db push (or paste into SQL editor).
-- Idempotent: drops and recreates study_routines / study_routine_tasks /
-- study_routine_settings plus all enums, indexes, triggers, RLS, realtime.
-- No seed / demo / sample rows.
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE public.study_routine_tasks;    EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE public.study_routines;         EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime DROP TABLE public.study_routine_settings; EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
END $$;

DROP TABLE IF EXISTS public.study_routine_tasks    CASCADE;
DROP TABLE IF EXISTS public.study_routines         CASCADE;
DROP TABLE IF EXISTS public.study_routine_settings CASCADE;
DROP FUNCTION IF EXISTS public.study_routine_touch_updated_at() CASCADE;
DROP TYPE IF EXISTS public.study_task_status   CASCADE;
DROP TYPE IF EXISTS public.study_task_priority CASCADE;
DROP TYPE IF EXISTS public.study_task_type     CASCADE;
DROP TYPE IF EXISTS public.study_routine_type  CASCADE;

CREATE TYPE public.study_routine_type  AS ENUM ('daily','weekly','monthly','custom');
CREATE TYPE public.study_task_type     AS ENUM ('study','mcq','quiz','mock','revision','custom');
CREATE TYPE public.study_task_priority AS ENUM ('low','medium','high');
CREATE TYPE public.study_task_status   AS ENUM ('pending','in_progress','completed');

CREATE TABLE public.study_routines (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         text NOT NULL DEFAULT 'My Routine',
  type         public.study_routine_type NOT NULL DEFAULT 'daily',
  level_code   text,
  subject_id   uuid,
  chapter_id   uuid,
  is_active    boolean NOT NULL DEFAULT true,
  is_archived  boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.study_routine_tasks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  routine_id    uuid REFERENCES public.study_routines(id) ON DELETE SET NULL,
  level_code    text,
  subject_id    uuid,
  chapter_id    uuid,
  title         text NOT NULL,
  description   text,
  task_type     public.study_task_type NOT NULL DEFAULT 'study',
  task_date     date NOT NULL DEFAULT CURRENT_DATE,
  start_time    time NOT NULL DEFAULT '09:00',
  end_time      time NOT NULL DEFAULT '10:00',
  priority      public.study_task_priority NOT NULL DEFAULT 'medium',
  status        public.study_task_status   NOT NULL DEFAULT 'pending',
  completion    integer NOT NULL DEFAULT 0 CHECK (completion BETWEEN 0 AND 100),
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT study_routine_tasks_time_valid CHECK (end_time > start_time)
);

CREATE TABLE public.study_routine_settings (
  id         boolean PRIMARY KEY DEFAULT true,
  enabled    boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL,
  CONSTRAINT study_routine_settings_singleton CHECK (id = true)
);
-- No seed row: getStudyRoutineModuleEnabled() defaults to enabled=true when
-- the row is absent; setStudyRoutineModuleEnabled() upserts on first write.

CREATE INDEX study_routines_user_idx            ON public.study_routines(user_id);
CREATE INDEX study_routines_user_active_idx     ON public.study_routines(user_id, is_archived, is_active);
CREATE INDEX study_routines_updated_at_idx      ON public.study_routines(updated_at DESC);
CREATE INDEX study_routine_tasks_user_idx       ON public.study_routine_tasks(user_id);
CREATE INDEX study_routine_tasks_user_date_idx  ON public.study_routine_tasks(user_id, task_date);
CREATE INDEX study_routine_tasks_routine_idx    ON public.study_routine_tasks(routine_id);
CREATE INDEX study_routine_tasks_status_idx     ON public.study_routine_tasks(status);
CREATE INDEX study_routine_tasks_updated_at_idx ON public.study_routine_tasks(updated_at DESC);

CREATE OR REPLACE FUNCTION public.study_routine_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_study_routines_updated_at
  BEFORE UPDATE ON public.study_routines
  FOR EACH ROW EXECUTE FUNCTION public.study_routine_touch_updated_at();
CREATE TRIGGER trg_study_routine_tasks_updated_at
  BEFORE UPDATE ON public.study_routine_tasks
  FOR EACH ROW EXECUTE FUNCTION public.study_routine_touch_updated_at();
CREATE TRIGGER trg_study_routine_settings_updated_at
  BEFORE UPDATE ON public.study_routine_settings
  FOR EACH ROW EXECUTE FUNCTION public.study_routine_touch_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_routines         TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.study_routine_tasks    TO authenticated;
GRANT SELECT                          ON public.study_routine_settings TO anon, authenticated;
GRANT ALL ON public.study_routines         TO service_role;
GRANT ALL ON public.study_routine_tasks    TO service_role;
GRANT ALL ON public.study_routine_settings TO service_role;

ALTER TABLE public.study_routines         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_routine_tasks    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_routine_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY study_routines_owner_all
  ON public.study_routines FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY study_routine_tasks_owner_all
  ON public.study_routine_tasks FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Admin monitoring (fixes gap where admin queries returned only admin's own rows).
-- Requires public.has_role(uuid, app_role) — already present in project.
CREATE POLICY study_routines_admin_read
  ON public.study_routines FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

CREATE POLICY study_routine_tasks_admin_read
  ON public.study_routine_tasks FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'super_admin'::public.app_role)
  );

CREATE POLICY study_routine_settings_public_read
  ON public.study_routine_settings FOR SELECT USING (true);
CREATE POLICY study_routine_settings_no_direct_write
  ON public.study_routine_settings FOR ALL USING (false) WITH CHECK (false);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.study_routines;         EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.study_routine_tasks;    EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.study_routine_settings; EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;

ALTER TABLE public.study_routines         REPLICA IDENTITY FULL;
ALTER TABLE public.study_routine_tasks    REPLICA IDENTITY FULL;
ALTER TABLE public.study_routine_settings REPLICA IDENTITY FULL;
