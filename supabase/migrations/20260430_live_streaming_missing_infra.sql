-- ═══════════════════════════════════════════════════════════════════════
-- Missing Live Streaming Infrastructure — Idempotent
-- Ensures: storage bucket, gifts table, realtime publications all exist
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Create live-recordings storage bucket (idempotent)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('live-recordings', 'live-recordings', true, 53687091200)
ON CONFLICT (id) DO NOTHING;

-- 2. Storage policies for live-recordings (idempotent via DROP IF EXISTS)
DROP POLICY IF EXISTS "Public read live recordings" ON storage.objects;
CREATE POLICY "Public read live recordings"
ON storage.objects FOR SELECT
USING (bucket_id = 'live-recordings');

DROP POLICY IF EXISTS "Broadcasters can upload recordings" ON storage.objects;
CREATE POLICY "Broadcasters can upload recordings"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'live-recordings'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "Broadcasters can update recordings" ON storage.objects;
CREATE POLICY "Broadcasters can update recordings"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'live-recordings'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- 3. Create live_gifts table (idempotent)
CREATE TABLE IF NOT EXISTS public.live_gifts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    stream_id UUID REFERENCES public.live_streams(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    receiver_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL CHECK (amount > 0 AND amount <= 10000),
    message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_live_gifts_stream ON public.live_gifts(stream_id);
CREATE INDEX IF NOT EXISTS idx_live_gifts_sender ON public.live_gifts(sender_id);
CREATE INDEX IF NOT EXISTS idx_live_gifts_receiver ON public.live_gifts(receiver_id);

ALTER TABLE public.live_gifts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lg_sel ON public.live_gifts;
CREATE POLICY lg_sel ON public.live_gifts FOR SELECT USING (true);

DROP POLICY IF EXISTS lg_ins ON public.live_gifts;
CREATE POLICY lg_ins ON public.live_gifts FOR INSERT WITH CHECK (true);

-- 4. Enable Realtime on live_streams and live_comments
-- These must be in the supabase_realtime publication for postgres_changes to work
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'live_streams'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.live_streams;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'live_comments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.live_comments;
  END IF;
END $$;

-- 5. Ensure live_streams has reaction_count column
ALTER TABLE public.live_streams
ADD COLUMN IF NOT EXISTS reaction_count INTEGER DEFAULT 0;
