-- Live stream comments table
CREATE TABLE IF NOT EXISTS public.live_comments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    stream_id UUID REFERENCES public.live_streams(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    author_name TEXT,
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_live_comments_stream ON public.live_comments(stream_id, created_at DESC);
ALTER TABLE public.live_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lc_sel ON public.live_comments;
CREATE POLICY lc_sel ON public.live_comments FOR SELECT USING (true);
DROP POLICY IF EXISTS lc_ins ON public.live_comments;
CREATE POLICY lc_ins ON public.live_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
