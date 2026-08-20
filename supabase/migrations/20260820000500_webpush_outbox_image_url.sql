-- ============================================================================
-- RICH MEDIA PUSH -- push_outbox.image_url
-- Applied to production 2026-08-20 via Supabase MCP.
--
-- push_outbox already carried icon_url (the small glyph) and badge_url (the
-- monochrome status-bar mark). Neither is the large hero image Chrome/Android
-- render under the notification body via the `image` option.
--
-- The genuinely valuable use is not decoration, it is IDENTITY: a message push
-- showing the sender's avatar as its icon is recognisable on a lock screen in a
-- way that "Smarter Poker" on every notification never is. `image` is the
-- secondary case (a shared hand, a tournament graphic).
--
-- Cross-platform reality, which is why this is additive and never required:
-- `image` is supported on Chrome/Android and ignored by Safari, iOS PWAs and
-- Firefox. Everything degrades to a normal notification, and worker/index.js
-- already retries showNotification with a minimal option set if an older OS
-- rejects a field it does not understand. No platform is worse off.
-- ============================================================================

ALTER TABLE public.push_outbox
  ADD COLUMN IF NOT EXISTS image_url TEXT;

COMMENT ON COLUMN public.push_outbox.image_url IS
  'Optional large hero image for the notification (Chrome/Android `image`). Ignored by Safari/iOS/Firefox.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='push_outbox' AND column_name='image_url'
  ) THEN
    RAISE EXCEPTION 'push_outbox.image_url was not created';
  END IF;

  -- icon_url must still exist: the avatar-as-icon path depends on it.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='push_outbox' AND column_name='icon_url'
  ) THEN
    RAISE EXCEPTION 'push_outbox.icon_url is missing';
  END IF;
END $$;

-- ROLLBACK
-- ALTER TABLE public.push_outbox DROP COLUMN IF EXISTS image_url;
