-- ══════════════════════════════════════════════════════════════════════════
-- Migration 002: Capture sessions (phone-to-laptop video relay)
-- Safe to re-run: uses IF NOT EXISTS / ON CONFLICT throughout.
-- ══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS capture_sessions (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status             TEXT NOT NULL DEFAULT 'waiting'
                         CHECK (status IN ('waiting', 'uploaded', 'expired')),
    video_storage_path TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at         TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 minutes'
);

ALTER TABLE capture_sessions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'capture_sessions_all_service'
      AND tablename  = 'capture_sessions'
      AND schemaname = 'public'
  ) THEN
    CREATE POLICY "capture_sessions_all_service" ON capture_sessions FOR ALL TO service_role USING (true);
  END IF;
END $$;

-- Storage bucket for temporary capture videos
INSERT INTO storage.buckets (id, name, public)
VALUES ('capture-videos', 'capture-videos', false)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'service_role_all_capture_videos'
      AND tablename  = 'objects'
      AND schemaname = 'storage'
  ) THEN
    CREATE POLICY "service_role_all_capture_videos"
      ON storage.objects FOR ALL TO service_role
      USING (bucket_id = 'capture-videos');
  END IF;
END $$;

COMMIT;
