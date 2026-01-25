-- Create video_clips table for database-backed content system
-- Run this in Supabase SQL editor

CREATE TABLE IF NOT EXISTS video_clips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clip_id TEXT UNIQUE NOT NULL,           -- Unique identifier like 'hcl_trap_henry'
    video_id TEXT NOT NULL,                 -- YouTube video ID
    source_url TEXT NOT NULL,               -- Full YouTube URL
    source TEXT NOT NULL,                   -- HCL, PokerGO, etc.
    title TEXT,
    category TEXT,
    tags TEXT[],
    duration INTEGER,
    thumbnail_url TEXT,
    last_used_at TIMESTAMPTZ,               -- When last posted (for cooldown)
    times_used INTEGER DEFAULT 0,           -- Total usage count
    is_active BOOLEAN DEFAULT true,         -- Can be disabled
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_video_clips_last_used ON video_clips(last_used_at);
CREATE INDEX IF NOT EXISTS idx_video_clips_category ON video_clips(category);
CREATE INDEX IF NOT EXISTS idx_video_clips_active ON video_clips(is_active);
CREATE INDEX IF NOT EXISTS idx_video_clips_source ON video_clips(source);

-- Enable RLS but allow service role full access
ALTER TABLE video_clips ENABLE ROW LEVEL SECURITY;

-- Policy for service role (cron jobs)
CREATE POLICY "Service role has full access" ON video_clips
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Grant access
GRANT ALL ON video_clips TO authenticated;
GRANT ALL ON video_clips TO service_role;

-- Seed with existing clips
INSERT INTO video_clips (clip_id, video_id, source_url, source, title, category, tags, duration)
VALUES 
    ('hcl_trap_henry', 'hrcKuXcRhCc', 'https://www.youtube.com/watch?v=hrcKuXcRhCc', 'HCL', 'He Set The PERFECT TRAP', 'soul_read', ARRAY['hcl', 'trap'], 45),
    ('hcl_warn_laugh', 'ecNLi6z8bSk', 'https://www.youtube.com/watch?v=ecNLi6z8bSk', 'HCL', 'He WARNED Him To NEVER Laugh Again', 'table_drama', ARRAY['hcl', 'drama'], 45),
    ('hcl_desperate_92k', '6zCDWw2wskQ', 'https://www.youtube.com/watch?v=6zCDWw2wskQ', 'HCL', 'DESPERATE In $92,000 Hand', 'massive_pot', ARRAY['hcl', 'massive_pot'], 50),
    ('hcl_pain_genius', 'CTUh5LohLV8', 'https://www.youtube.com/watch?v=CTUh5LohLV8', 'HCL', 'The GENIUS Shows His Hand', 'bad_beat', ARRAY['hcl', 'bad_beat'], 45),
    ('hcl_airball_small', 'ShI-eFe8PLQ', 'https://www.youtube.com/watch?v=ShI-eFe8PLQ', 'HCL', 'Game Is Too Small For Nik Airball', 'celebrity', ARRAY['hcl', 'nik_airball'], 45),
    ('hcl_airball_hero', 'Wp5G4CDS2Tk', 'https://www.youtube.com/watch?v=Wp5G4CDS2Tk', 'HCL', 'Nik Airball Hero Play', 'bluff', ARRAY['hcl', 'nik_airball'], 50),
    ('hcl_mariano_crushing', 'h1YsGpdcf7Y', 'https://www.youtube.com/watch?v=h1YsGpdcf7Y', 'HCL', 'Mariano Is CRUSHING Him', 'massive_pot', ARRAY['hcl', 'mariano'], 45),
    ('hcl_mariano_disbelief', 'aSRhwwXnWtg', 'https://www.youtube.com/watch?v=aSRhwwXnWtg', 'HCL', 'Mariano Cannot Believe It', 'bad_beat', ARRAY['hcl', 'mariano'], 45),
    ('hcl_mariano_3x_river', '3ovHEAWhhzg', 'https://www.youtube.com/watch?v=3ovHEAWhhzg', 'HCL', 'Mariano Raises 3X Pot On River', 'bluff', ARRAY['hcl', 'mariano'], 50),
    ('hcl_mariano_miracle', 'ZW14QdHMtKk', 'https://www.youtube.com/watch?v=ZW14QdHMtKk', 'HCL', 'Mariano $125,000 Miracle', 'massive_pot', ARRAY['hcl', 'mariano', '125k'], 55),
    ('hcl_mariano_outrageous', 'ktO22X37VzE', 'https://www.youtube.com/watch?v=ktO22X37VzE', 'HCL', 'Mariano Makes OUTRAGEOUS Play', 'bluff', ARRAY['hcl', 'mariano'], 50),
    ('hcl_britney_revenge', '8eG3f0K3eas', 'https://www.youtube.com/watch?v=8eG3f0K3eas', 'HCL', 'Britney Is Out For REVENGE', 'table_drama', ARRAY['hcl', 'britney'], 55),
    ('hcl_britney_devastated', 'qbVkC0sUTlY', 'https://www.youtube.com/watch?v=qbVkC0sUTlY', 'HCL', 'Britney OUTPLAYED', 'bad_beat', ARRAY['hcl', 'britney'], 50),
    ('hcl_straight_speechless', 'B_YCUAq86s8', 'https://www.youtube.com/watch?v=B_YCUAq86s8', 'HCL', 'He Flopped A Straight But...', 'soul_read', ARRAY['hcl'], 45),
    ('hcl_couldnt_take', 'IeW8wan12Yo', 'https://www.youtube.com/watch?v=IeW8wan12Yo', 'HCL', 'He Just Couldnt Take It', 'table_drama', ARRAY['hcl', 'tilt'], 45),
    ('hcl_stubborn_save', 't5AWRr9TM74', 'https://www.youtube.com/watch?v=t5AWRr9TM74', 'HCL', 'Tried Saving Her Money', 'funny', ARRAY['hcl', 'funny'], 50),
    ('hcl_never_sat', 'CvhEPtf-GC8', 'https://www.youtube.com/watch?v=CvhEPtf-GC8', 'HCL', 'He Should Never Sat In This Game', 'bad_beat', ARRAY['hcl'], 50),
    ('hcl_destroy_not_done', 'qqHDqxTKY5Q', 'https://www.youtube.com/watch?v=qqHDqxTKY5Q', 'HCL', 'She Thought She Could Destroy Him', 'soul_read', ARRAY['hcl'], 50),
    ('hcl_mikex_speechless', 'GcfgcuyVugA', 'https://www.youtube.com/watch?v=GcfgcuyVugA', 'HCL', 'Mike X Is Speechless', 'funny', ARRAY['hcl', 'mike_x'], 45),
    ('hcl_mariano_june2023', 'dNbp--c1Y5M', 'https://www.youtube.com/watch?v=dNbp--c1Y5M', 'HCL', 'Best Mariano Hands June 2023', 'celebrity', ARRAY['hcl', 'mariano', 'compilation'], 55),
    ('hcl_top20_2022', 'r3FHXdutAWQ', 'https://www.youtube.com/watch?v=r3FHXdutAWQ', 'HCL', 'Top 20 Hands of 2022', 'massive_pot', ARRAY['hcl', 'compilation', '2022'], 60),
    ('hcl_biggest_pots_2022', 'fwr4hulh-Y0', 'https://www.youtube.com/watch?v=fwr4hulh-Y0', 'HCL', 'Top 25 Biggest Pots 2022', 'massive_pot', ARRAY['hcl', 'compilation', '2022'], 60),
    ('hcl_mikki_keating', 'eajgQEhEBuM', 'https://www.youtube.com/watch?v=eajgQEhEBuM', 'HCL', 'Mikki vs Keating $250k Hands', 'massive_pot', ARRAY['hcl', 'alan_keating', 'mikki'], 55)
ON CONFLICT (clip_id) DO NOTHING;
