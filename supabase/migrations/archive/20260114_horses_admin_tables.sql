-- Create missing tables for horses admin dashboard
-- These tables are optional but enable pipeline tracking

-- Content settings table
CREATE TABLE IF NOT EXISTS public.content_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    posts_per_day integer DEFAULT 20,
    min_delay_minutes integer DEFAULT 30,
    max_delay_minutes integer DEFAULT 120,
    ai_model text DEFAULT 'gpt-4o',
    temperature numeric DEFAULT 0.8,
    engine_enabled boolean DEFAULT true,
    auto_publish boolean DEFAULT true,
    peak_hours integer[] DEFAULT ARRAY[9,10,11,12,13,14,15,16,17,18,19,20,21],
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Pipeline runs table
CREATE TABLE IF NOT EXISTS public.pipeline_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    run_type text NOT NULL,
    started_at timestamptz DEFAULT now(),
    completed_at timestamptz,
    text_posts_created integer DEFAULT 0,
    videos_created integer DEFAULT 0,
    memes_created integer DEFAULT 0,
    news_shared integer DEFAULT 0,
    errors integer DEFAULT 0,
    duration_seconds integer,
    metadata jsonb DEFAULT '{}'
);

-- Insert default settings if none exist
INSERT INTO public.content_settings (posts_per_day, engine_enabled)
SELECT 20, true
WHERE NOT EXISTS (SELECT 1 FROM public.content_settings LIMIT 1);

-- Enable RLS
ALTER TABLE public.content_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_runs ENABLE ROW LEVEL SECURITY;

-- Allow public read for these tables (admin page uses anon key)
CREATE POLICY "Allow public read on content_settings" ON public.content_settings
    FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Allow public read on pipeline_runs" ON public.pipeline_runs  
    FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Allow service role write on content_settings" ON public.content_settings
    FOR ALL TO service_role USING (true);

CREATE POLICY "Allow service role write on pipeline_runs" ON public.pipeline_runs
    FOR ALL TO service_role USING (true);

-- Index for pipeline runs
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_started_at ON public.pipeline_runs(started_at DESC);
