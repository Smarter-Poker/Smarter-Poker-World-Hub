-- Migration: 20260310221400_club_arena_reminder_sent.sql
-- Description: Adds the reminder_sent boolean flag to club_tournaments to prevent duplicate notifications.
-- Idempotent: Uses DO block to check if column exists before adding.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'club_tournaments'
          AND column_name = 'reminder_sent'
    ) THEN
        ALTER TABLE public.club_tournaments
            ADD COLUMN reminder_sent BOOLEAN DEFAULT FALSE;
    END IF;
END $$;
