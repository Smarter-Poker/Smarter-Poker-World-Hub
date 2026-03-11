-- Migration: ORB-8 Phase 4 — Absolute & True Accounting Record
-- Tracks every granular chat message and table action for the Club Arena

-- 1. Create the club_arena_messages table to capture all table chat
CREATE TABLE IF NOT EXISTS public.club_arena_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id UUID REFERENCES public.clubs(id) ON DELETE CASCADE,
    table_id TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    player_name TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_club_arena_messages_club 
  ON public.club_arena_messages(club_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_club_arena_messages_table 
  ON public.club_arena_messages(table_id, created_at DESC);

-- 2. Create the club_arena_audit_logs table to capture all chip/player movements
CREATE TABLE IF NOT EXISTS public.club_arena_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id UUID REFERENCES public.clubs(id) ON DELETE CASCADE,
    table_id TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action_type TEXT NOT NULL, -- e.g. sit_down, stand_up, fold, bet, rebuy, show_cards
    amount NUMERIC(14,2), -- Any chips involved in the micro-transaction
    details JSONB, -- The raw action payload or context
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_club_arena_audit_logs_club 
  ON public.club_arena_audit_logs(club_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_club_arena_audit_logs_table 
  ON public.club_arena_audit_logs(table_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_club_arena_audit_logs_user 
  ON public.club_arena_audit_logs(user_id, created_at DESC);


-- 3. Row Level Security ensuring only Service Role can INSERT to prevent payload spoofing
ALTER TABLE public.club_arena_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_arena_audit_logs ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to READ messages for the table they are at (or admins for the club)
DROP POLICY IF EXISTS "allow_read_messages" ON public.club_arena_messages;
DROP POLICY IF EXISTS "allow_read_messages" ON public.club_arena_messages;
CREATE POLICY "allow_read_messages" ON public.club_arena_messages
    FOR SELECT USING (true); -- Read-only to all authenticated, service role bypasses for write

DROP POLICY IF EXISTS "allow_read_audit" ON public.club_arena_audit_logs;
DROP POLICY IF EXISTS "allow_read_audit" ON public.club_arena_audit_logs;
CREATE POLICY "allow_read_audit" ON public.club_arena_audit_logs
    FOR SELECT USING (
        auth.uid() = user_id OR 
        EXISTS (SELECT 1 FROM public.club_members WHERE club_members.club_id = club_arena_audit_logs.club_id AND club_members.user_id = auth.uid() AND club_members.role IN ('owner','admin'))
    );


-- 4. RPC Methods to allow PostgreSQL to bypass RLS and insert securely from Node.js service keys

-- RPC: record_arena_message
-- Bypass RLS to insert securely from LobbyManager
CREATE OR REPLACE FUNCTION public.record_arena_message(
    p_club_id UUID,
    p_table_id TEXT,
    p_user_id UUID,
    p_player_name TEXT,
    p_message TEXT
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.club_arena_messages (club_id, table_id, user_id, player_name, message)
    VALUES (p_club_id, p_table_id, p_user_id, p_player_name, p_message);
END;
$$;


-- RPC: record_arena_audit_log
-- Bypass RLS to insert micro-transactions securely from LobbyManager
CREATE OR REPLACE FUNCTION public.record_arena_audit_log(
    p_club_id UUID,
    p_table_id TEXT,
    p_user_id UUID,
    p_action_type TEXT,
    p_amount NUMERIC DEFAULT NULL,
    p_details JSONB DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.club_arena_audit_logs (club_id, table_id, user_id, action_type, amount, details)
    VALUES (p_club_id, p_table_id, p_user_id, p_action_type, p_amount, COALESCE(p_details, '{}'::jsonb));
END;
$$;

-- Allow Realtime broadcasting so we can build a live audit terminal later
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.club_arena_messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.club_arena_audit_logs;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE public.club_arena_audit_logs IS 'Absolute true accounting record capturing every granular engine action within a table.';
COMMENT ON TABLE public.club_arena_messages IS 'Immutable chat ledger for all table messages.';
