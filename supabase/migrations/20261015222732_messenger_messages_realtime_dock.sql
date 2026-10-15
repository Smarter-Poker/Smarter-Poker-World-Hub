-- TIER: 2. AUTHOR: Codex. AFFECTS: supabase_realtime publication only.
-- Reversible: remove public.social_messages from this publication in a new migration.
-- Messenger already subscribes to social_messages but the serving publication
-- omits it. This enables the existing RLS-protected INSERT/UPDATE stream for
-- active conversations and the native desktop/mobile chat dock. No grants,
-- policies, message content, financial records or engine behavior change.
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '15s';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime' AND NOT puballtables)
     OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='public.social_messages'::regclass AND relrowsecurity)
     OR NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='public.social_messages'::regclass
        AND polname='messenger_private_message_content' AND NOT polpermissive AND polcmd='r')
  THEN RAISE EXCEPTION 'Messenger realtime prerequisites are unavailable'; END IF;
  IF EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime'
      AND schemaname='public' AND tablename='social_messages')
  THEN RAISE EXCEPTION 'Messenger realtime is already installed; do not replay'; END IF;
END $$;
ALTER PUBLICATION supabase_realtime ADD TABLE public.social_messages;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime'
       AND schemaname='public' AND tablename='social_messages')
  THEN RAISE EXCEPTION 'Messenger realtime publication verification failed'; END IF;
END $$;
COMMIT;
