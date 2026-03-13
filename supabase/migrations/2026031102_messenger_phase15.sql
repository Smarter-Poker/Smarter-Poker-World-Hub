-- ====================================================================
-- Phase 15 Messenger Schema — Group Management, Security & Cross-Platform
-- Run in Supabase SQL Editor
-- ====================================================================

-- P15-6: Message Reports
CREATE TABLE IF NOT EXISTS messenger_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id UUID,
  conversation_id UUID,
  reason TEXT NOT NULL DEFAULT 'inappropriate',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- P15-5: Blocked Users
CREATE TABLE IF NOT EXISTS messenger_blocked (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  blocker_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(blocker_id, blocked_id)
);

-- P15-9/10: Add settings and read-state columns to messenger_participants
ALTER TABLE messenger_participants
  ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_read_message_id UUID,
  ADD COLUMN IF NOT EXISTS last_read_at TIMESTAMPTZ;

-- RLS: messenger_reports
ALTER TABLE messenger_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can insert their own reports" ON messenger_reports
  FOR INSERT WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "Users can view their own reports" ON messenger_reports
  FOR SELECT USING (auth.uid() = reporter_id);

-- RLS: messenger_blocked
ALTER TABLE messenger_blocked ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage their own blocks" ON messenger_blocked
  FOR ALL USING (auth.uid() = blocker_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_messenger_reports_reporter ON messenger_reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_messenger_blocked_blocker ON messenger_blocked(blocker_id);
CREATE INDEX IF NOT EXISTS idx_messenger_blocked_blocked ON messenger_blocked(blocked_id);
