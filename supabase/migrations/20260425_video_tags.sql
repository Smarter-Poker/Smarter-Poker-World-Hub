ALTER TABLE video_library_videos ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;
