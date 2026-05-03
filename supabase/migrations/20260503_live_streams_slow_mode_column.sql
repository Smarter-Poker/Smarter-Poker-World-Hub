-- ═══════════════════════════════════════════════════════════════════════
-- BUG FIX: Add slow_mode column to live_streams
--
-- PROBLEM: LiveStreamService.setSlowMode() writes to live_streams.slow_mode
-- and comment.js reads it for slow mode enforcement, but the column was
-- never added to any migration. Every call to setSlowMode() silently failed
-- (Supabase returns no error when updating a column that doesn't exist via
-- service role) and slow_mode enforcement in comment.js was always skipped
-- because stream.slow_mode was always undefined (falsy).
--
-- Also adds livekit_room, peak_viewers, is_posted, is_draft, video_url,
-- category, description, and thumbnail_url if missing — defensive ADD COLUMN
-- for all columns referenced in production code but not in original schema.
-- ═══════════════════════════════════════════════════════════════════════

-- slow_mode: broadcaster toggles from the live UI to throttle comment rate
ALTER TABLE public.live_streams
ADD COLUMN IF NOT EXISTS slow_mode BOOLEAN DEFAULT false;

-- livekit_room: stores the LiveKit room name (= stream id) after creation
ALTER TABLE public.live_streams
ADD COLUMN IF NOT EXISTS livekit_room TEXT;

-- peak_viewers: high-water mark of concurrent viewers
ALTER TABLE public.live_streams
ADD COLUMN IF NOT EXISTS peak_viewers INTEGER DEFAULT 0;

-- is_posted: true when broadcaster has posted the replay to their feed
ALTER TABLE public.live_streams
ADD COLUMN IF NOT EXISTS is_posted BOOLEAN DEFAULT false;

-- is_draft: true when stream is archived but not publicly posted
ALTER TABLE public.live_streams
ADD COLUMN IF NOT EXISTS is_draft BOOLEAN DEFAULT false;

-- video_url: public URL of the recorded .webm uploaded after stream ends
ALTER TABLE public.live_streams
ADD COLUMN IF NOT EXISTS video_url TEXT;

-- category: stream category tag (general, cash_game, tournament, etc.)
ALTER TABLE public.live_streams
ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general';

-- description: optional stream description set in GoLiveModal
ALTER TABLE public.live_streams
ADD COLUMN IF NOT EXISTS description TEXT;
