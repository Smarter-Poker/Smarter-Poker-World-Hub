-- ═══════════════════════════════════════════════════════════════════════
-- 20261118170500_marketing_contacts_and_campaigns.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2 (new tables + new service-role-only functions; nothing
--              existing is altered, no money path is touched)
-- AUTHOR:      Claude (marketing programme, Dan 2026-11-18)
-- AFFECTS:     new tables sp_marketing_{settings,contacts,suppressions,
--              campaigns,campaign_recipients,events}; new fn_sp_marketing_*
-- IRREVERSIBLE: no (rollback section at the bottom)
--
-- WHY:
--   Dan, 2026-11-18: "add all these emails that aren't in the database to the
--   database now" and build the marketing tools into /horses. Before this
--   migration the platform could only message REGISTERED players
--   (fn_sp_announce reaches smarter_private.sp_real_humans, 155 people). There
--   was nowhere to keep a person who is not a player, nothing recorded why we
--   may email them, bounces and spam complaints were never read back from
--   Resend, and an unsubscribe was a link to the settings page. Of the 102
--   addresses Dan pasted, 98 are not players.
--
-- HOW:
--   * sp_marketing_contacts - people who are not (yet) players, with where the
--     address came from and the basis on which we may email them. A contact
--     that later signs up is linked by user_id (the conversion).
--   * sp_marketing_suppressions - the ONE do-not-email list, for contacts AND
--     players. Written by unsubscribe, hard bounce and spam complaint. Every
--     campaign send and every player announcement email checks it.
--   * sp_marketing_campaigns / _campaign_recipients - a campaign is drafted,
--     test-sent, APPROVED by an operator (that is when recipients are
--     materialised), then sent in daily-capped batches by the existing hourly
--     cron (no new cron route - CLAUDE.md section 11).
--   * sp_marketing_events - every Resend webhook event, idempotent by svix id.
--     A complaint rate of 0.3% or a bounce rate over 5% pauses the campaign
--     on its own, because the same Resend account sends signup codes.
--   * Every function is SECURITY DEFINER, service_role only. No table is
--     readable by anon or authenticated.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Settings (singleton) ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sp_marketing_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  sending_enabled boolean NOT NULL DEFAULT true,
  postal_address text,
  from_name text NOT NULL DEFAULT 'Smarter.Poker',
  from_email text NOT NULL DEFAULT 'promos@mail.smarter.poker',
  reply_to text NOT NULL DEFAULT 'support@smarter.poker',
  global_daily_cap integer NOT NULL DEFAULT 300 CHECK (global_daily_cap BETWEEN 0 AND 50000),
  complaint_pause_rate numeric NOT NULL DEFAULT 0.003,
  bounce_pause_rate numeric NOT NULL DEFAULT 0.05,
  webhook_id text,
  webhook_secret text,
  webhook_connected_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
INSERT INTO public.sp_marketing_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ── Contacts ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sp_marketing_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_key text NOT NULL UNIQUE,
  email text,
  email_key text GENERATED ALWAYS AS (nullif(lower(btrim(email)), '')) STORED,
  full_name text,
  agent_name text,
  phone text,
  alt_phones text[] NOT NULL DEFAULT '{}',
  alt_emails text[] NOT NULL DEFAULT '{}',
  external_id text,
  downlines integer,
  source text NOT NULL,
  consent_basis text NOT NULL CHECK (consent_basis IN ('existing_relationship','opt_in','imported_unverified')),
  tags text[] NOT NULL DEFAULT '{}',
  sheet_color text,
  notes text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','unsubscribed','bounced','complained','invalid')),
  status_changed_at timestamptz,
  user_id uuid,
  converted_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (email IS NOT NULL OR phone IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS sp_marketing_contacts_email_key_uq ON public.sp_marketing_contacts (email_key) WHERE email_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS sp_marketing_contacts_tags_gin ON public.sp_marketing_contacts USING gin (tags);
CREATE INDEX IF NOT EXISTS sp_marketing_contacts_status_idx ON public.sp_marketing_contacts (status);

-- ── Suppressions ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sp_marketing_suppressions (
  email_key text PRIMARY KEY,
  reason text NOT NULL CHECK (reason IN ('unsubscribed','hard_bounce','complaint','operator','invalid')),
  source text,
  campaign_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── Campaigns ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sp_marketing_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{2,60}$'),
  name text NOT NULL,
  subject text NOT NULL,
  preheader text,
  headline text NOT NULL,
  body text NOT NULL,
  cta_label text NOT NULL DEFAULT 'Play Now',
  cta_url text NOT NULL DEFAULT 'https://smarter.poker/hub/club-arena/',
  promo_code text,
  audience text NOT NULL CHECK (audience IN ('contacts','real_players','lapsed_players','active_players')),
  audience_tags text[] NOT NULL DEFAULT '{}',
  lapsed_days integer NOT NULL DEFAULT 14 CHECK (lapsed_days BETWEEN 1 AND 365),
  daily_cap integer NOT NULL DEFAULT 100 CHECK (daily_cap BETWEEN 1 AND 10000),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sending','paused','completed','cancelled')),
  paused_reason text,
  test_sent_at timestamptz,
  test_sent_to text,
  approved_by uuid,
  approved_at timestamptz,
  completed_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sp_marketing_campaign_recipients (
  campaign_id uuid NOT NULL REFERENCES public.sp_marketing_campaigns(id) ON DELETE CASCADE,
  email_key text NOT NULL,
  email text NOT NULL,
  display_name text,
  contact_id uuid,
  user_id uuid,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','suppressed')),
  skip_reason text,
  attempts integer NOT NULL DEFAULT 0,
  provider_id text,
  error text,
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  click_count integer NOT NULL DEFAULT 0,
  bounced_at timestamptz,
  complained_at timestamptz,
  unsubscribed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, email_key)
);
CREATE INDEX IF NOT EXISTS sp_marketing_recipients_pending_idx ON public.sp_marketing_campaign_recipients (campaign_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS sp_marketing_recipients_provider_idx ON public.sp_marketing_campaign_recipients (provider_id) WHERE provider_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sp_marketing_recipients_sent_at_idx ON public.sp_marketing_campaign_recipients (sent_at) WHERE sent_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.sp_marketing_events (
  id bigserial PRIMARY KEY,
  provider_event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  provider_message_id text,
  email_key text,
  campaign_id uuid,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sp_marketing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sp_marketing_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sp_marketing_suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sp_marketing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sp_marketing_campaign_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sp_marketing_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sp_marketing_settings, public.sp_marketing_contacts, public.sp_marketing_suppressions,
  public.sp_marketing_campaigns, public.sp_marketing_campaign_recipients, public.sp_marketing_events FROM anon, authenticated;
GRANT ALL ON public.sp_marketing_settings, public.sp_marketing_contacts, public.sp_marketing_suppressions,
  public.sp_marketing_campaigns, public.sp_marketing_campaign_recipients, public.sp_marketing_events TO service_role;
GRANT USAGE ON SEQUENCE public.sp_marketing_events_id_seq TO service_role;

-- ── Helpers ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_sp_marketing_email_key(p_email text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN btrim(coalesce(p_email,'')) ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN lower(btrim(p_email)) END;
$$;

CREATE OR REPLACE FUNCTION public.fn_sp_marketing_is_player_email(p_email_key text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT u.id FROM auth.users u WHERE lower(u.email) = p_email_key LIMIT 1;
$$;

-- ── Import: upsert by address, never resurrect a suppressed contact ───────
CREATE OR REPLACE FUNCTION public.fn_sp_marketing_import_contacts(
  p_rows jsonb, p_source text, p_consent_basis text, p_tags text[] DEFAULT '{}', p_actor uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  r jsonb; v_email text; v_key text; v_phone text; v_ckey text; v_user uuid;
  v_inserted int := 0; v_updated int := 0; v_players int := 0; v_invalid int := 0; v_suppressed int := 0;
  v_existing record; v_players_list text[] := '{}';
BEGIN
  IF p_consent_basis NOT IN ('existing_relationship','opt_in','imported_unverified') THEN
    RAISE EXCEPTION 'unknown consent basis %', p_consent_basis USING errcode = '22023';
  END IF;
  IF coalesce(btrim(p_source),'') = '' THEN RAISE EXCEPTION 'source is required' USING errcode = '22023'; END IF;
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) > 5000 THEN
    RAISE EXCEPTION 'rows must be an array of at most 5000' USING errcode = '22023';
  END IF;

  FOR r IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    v_email := nullif(btrim(r->>'email'), '');
    v_key := fn_sp_marketing_email_key(v_email);
    v_phone := nullif(regexp_replace(coalesce(r->>'phone',''), '\D', '', 'g'), '');
    IF v_email IS NOT NULL AND v_key IS NULL THEN v_invalid := v_invalid + 1; CONTINUE; END IF;
    IF v_key IS NULL AND v_phone IS NULL THEN v_invalid := v_invalid + 1; CONTINUE; END IF;

    IF v_key IS NOT NULL THEN
      v_user := fn_sp_marketing_is_player_email(v_key);
      IF v_user IS NOT NULL THEN
        v_players := v_players + 1; v_players_list := v_players_list || v_key; CONTINUE;
      END IF;
    END IF;

    v_ckey := coalesce(v_key, 'phone:' || v_phone);
    SELECT * INTO v_existing FROM sp_marketing_contacts WHERE contact_key = v_ckey;
    IF FOUND THEN
      UPDATE sp_marketing_contacts SET
        full_name = coalesce(nullif(btrim(r->>'full_name'),''), full_name),
        agent_name = coalesce(nullif(btrim(r->>'agent_name'),''), agent_name),
        phone = coalesce(nullif(btrim(r->>'phone'),''), phone),
        external_id = coalesce(nullif(btrim(r->>'external_id'),''), external_id),
        downlines = coalesce((nullif(r->>'downlines',''))::int, downlines),
        sheet_color = coalesce(nullif(r->>'sheet_color',''), sheet_color),
        alt_phones = (SELECT coalesce(array_agg(DISTINCT x), '{}') FROM unnest(alt_phones || coalesce(ARRAY(SELECT jsonb_array_elements_text(coalesce(r->'alt_phones','[]'::jsonb))), '{}')) x WHERE x <> ''),
        alt_emails = (SELECT coalesce(array_agg(DISTINCT lower(x)), '{}') FROM unnest(alt_emails || coalesce(ARRAY(SELECT jsonb_array_elements_text(coalesce(r->'alt_emails','[]'::jsonb))), '{}')) x WHERE x <> ''),
        tags = (SELECT coalesce(array_agg(DISTINCT t ORDER BY t), '{}') FROM unnest(tags || coalesce(p_tags,'{}') || coalesce(ARRAY(SELECT jsonb_array_elements_text(coalesce(r->'tags','[]'::jsonb))), '{}')) t WHERE t <> ''),
        updated_at = now()
      WHERE id = v_existing.id;
      v_updated := v_updated + 1;
    ELSE
      INSERT INTO sp_marketing_contacts (contact_key, email, full_name, agent_name, phone, alt_phones, alt_emails,
        external_id, downlines, source, consent_basis, tags, sheet_color, notes, created_by, status, status_changed_at)
      VALUES (v_ckey, v_key, nullif(btrim(r->>'full_name'),''), nullif(btrim(r->>'agent_name'),''), nullif(btrim(r->>'phone'),''),
        coalesce(ARRAY(SELECT jsonb_array_elements_text(coalesce(r->'alt_phones','[]'::jsonb))), '{}'),
        coalesce(ARRAY(SELECT lower(x) FROM jsonb_array_elements_text(coalesce(r->'alt_emails','[]'::jsonb)) x), '{}'),
        nullif(btrim(r->>'external_id'),''), (nullif(r->>'downlines',''))::int, p_source, p_consent_basis,
        (SELECT coalesce(array_agg(DISTINCT t ORDER BY t), '{}') FROM unnest(coalesce(p_tags,'{}') || coalesce(ARRAY(SELECT jsonb_array_elements_text(coalesce(r->'tags','[]'::jsonb))), '{}')) t WHERE t <> ''),
        nullif(r->>'sheet_color',''), nullif(btrim(r->>'notes'),''), p_actor,
        CASE WHEN v_key IS NOT NULL AND EXISTS (SELECT 1 FROM sp_marketing_suppressions s WHERE s.email_key = v_key) THEN 'unsubscribed' ELSE 'active' END,
        CASE WHEN v_key IS NOT NULL AND EXISTS (SELECT 1 FROM sp_marketing_suppressions s WHERE s.email_key = v_key) THEN now() END);
      IF v_key IS NOT NULL AND EXISTS (SELECT 1 FROM sp_marketing_suppressions s WHERE s.email_key = v_key) THEN v_suppressed := v_suppressed + 1; END IF;
      v_inserted := v_inserted + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('inserted', v_inserted, 'updated', v_updated, 'already_players', v_players,
    'already_players_emails', to_jsonb(v_players_list), 'invalid', v_invalid, 'inserted_suppressed', v_suppressed);
END $$;

-- ── Conversions: a contact who signed up becomes a player ─────────────────
CREATE OR REPLACE FUNCTION public.fn_sp_marketing_link_conversions()
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path = public, auth AS $$
  WITH hit AS (
    UPDATE sp_marketing_contacts c SET user_id = u.id, converted_at = coalesce(c.converted_at, u.created_at), updated_at = now()
      FROM auth.users u
     WHERE c.user_id IS NULL AND c.email_key IS NOT NULL AND lower(u.email) = c.email_key
    RETURNING 1)
  SELECT count(*)::int FROM hit;
$$;

-- ── Approve: materialise recipients, then start sending ───────────────────
CREATE OR REPLACE FUNCTION public.fn_sp_marketing_campaign_approve(p_campaign_id uuid, p_actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, smarter_private AS $$
DECLARE c sp_marketing_campaigns; v_total int; v_suppressed int; v_pending int; s sp_marketing_settings;
BEGIN
  SELECT * INTO c FROM sp_marketing_campaigns WHERE id = p_campaign_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'campaign not found' USING errcode = 'P0002'; END IF;
  IF c.status <> 'draft' THEN RAISE EXCEPTION 'only a draft can be approved (status %)', c.status USING errcode = '55000'; END IF;
  IF c.test_sent_at IS NULL THEN RAISE EXCEPTION 'send a test to yourself before approving' USING errcode = '55000'; END IF;
  SELECT * INTO s FROM sp_marketing_settings WHERE id = 1;
  IF coalesce(btrim(s.postal_address),'') = '' THEN
    RAISE EXCEPTION 'set the mailing address in Marketing settings first (CAN-SPAM)' USING errcode = '55000';
  END IF;

  PERFORM fn_sp_marketing_link_conversions();

  IF c.audience = 'contacts' THEN
    INSERT INTO sp_marketing_campaign_recipients (campaign_id, email_key, email, display_name, contact_id)
    SELECT c.id, k.email_key, k.email_key, coalesce(k.full_name, k.agent_name), k.id
      FROM sp_marketing_contacts k
     WHERE k.email_key IS NOT NULL AND k.status = 'active' AND k.user_id IS NULL
       AND (cardinality(c.audience_tags) = 0 OR k.tags && c.audience_tags)
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO sp_marketing_campaign_recipients (campaign_id, email_key, email, display_name, user_id)
    SELECT DISTINCT ON (lower(u.email)) c.id, lower(u.email), lower(u.email), h.username, h.id
      FROM smarter_private.sp_real_humans h JOIN auth.users u ON u.id = h.id
     WHERE fn_sp_marketing_email_key(u.email) IS NOT NULL
       AND (c.audience = 'real_players'
         OR (c.audience = 'lapsed_players' AND coalesce(u.last_sign_in_at, u.created_at) < now() - make_interval(days => c.lapsed_days))
         OR (c.audience = 'active_players' AND coalesce(u.last_sign_in_at, u.created_at) >= now() - make_interval(days => c.lapsed_days)))
    ON CONFLICT DO NOTHING;
  END IF;

  UPDATE sp_marketing_campaign_recipients r SET status = 'suppressed', skip_reason = 'suppressed'
   WHERE r.campaign_id = c.id AND r.status = 'pending'
     AND EXISTS (SELECT 1 FROM sp_marketing_suppressions s2 WHERE s2.email_key = r.email_key);
  UPDATE sp_marketing_campaign_recipients r SET status = 'suppressed', skip_reason = 'player_opted_out'
   WHERE r.campaign_id = c.id AND r.status = 'pending' AND r.user_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM notification_preferences np WHERE np.user_id = r.user_id AND (np.mute_all IS TRUE OR np.email_enabled IS FALSE));

  SELECT count(*), count(*) FILTER (WHERE status = 'suppressed'), count(*) FILTER (WHERE status = 'pending')
    INTO v_total, v_suppressed, v_pending FROM sp_marketing_campaign_recipients WHERE campaign_id = c.id;
  IF v_pending = 0 THEN RAISE EXCEPTION 'this audience has nobody left to email' USING errcode = '55000'; END IF;

  UPDATE sp_marketing_campaigns SET status = 'sending', approved_by = p_actor, approved_at = now(), updated_at = now()
   WHERE id = c.id;
  RETURN jsonb_build_object('recipients', v_total, 'suppressed', v_suppressed, 'pending', v_pending);
END $$;

-- ── The next batch, inside the per-campaign and global daily caps ─────────
CREATE OR REPLACE FUNCTION public.fn_sp_marketing_next_batch(p_limit integer DEFAULT 50)
RETURNS TABLE (campaign_id uuid, slug text, email_key text, email text, display_name text, user_id uuid, contact_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s sp_marketing_settings; v_global_left int;
BEGIN
  SELECT * INTO s FROM sp_marketing_settings WHERE id = 1;
  IF NOT coalesce(s.sending_enabled, false) OR coalesce(btrim(s.postal_address),'') = '' THEN RETURN; END IF;
  SELECT greatest(s.global_daily_cap - count(*), 0) INTO v_global_left
    FROM sp_marketing_campaign_recipients WHERE sent_at > now() - interval '24 hours';
  IF v_global_left <= 0 THEN RETURN; END IF;

  RETURN QUERY
  WITH caps AS (
    SELECT c.id, c.slug, c.approved_at,
           greatest(c.daily_cap - (SELECT count(*) FROM sp_marketing_campaign_recipients x
                                    WHERE x.campaign_id = c.id AND x.sent_at > now() - interval '24 hours'), 0) AS room
      FROM sp_marketing_campaigns c WHERE c.status = 'sending'
  ), ranked AS (
    SELECT r.campaign_id, k.slug, r.email_key, r.email, r.display_name, r.user_id, r.contact_id,
           row_number() OVER (PARTITION BY r.campaign_id ORDER BY r.created_at, r.email_key) AS rn, k.room, k.approved_at
      FROM sp_marketing_campaign_recipients r JOIN caps k ON k.id = r.campaign_id
     WHERE r.status = 'pending' AND r.attempts < 3
  )
  SELECT ranked.campaign_id, ranked.slug, ranked.email_key, ranked.email, ranked.display_name, ranked.user_id, ranked.contact_id
    FROM ranked WHERE rn <= room
   ORDER BY approved_at, rn
   LIMIT least(greatest(coalesce(p_limit, 50), 1), 500, v_global_left);
END $$;

-- ── Record one send attempt; finish the campaign when nothing is left ─────
CREATE OR REPLACE FUNCTION public.fn_sp_marketing_mark_sent(
  p_campaign_id uuid, p_email_key text, p_ok boolean, p_provider_id text DEFAULT NULL, p_error text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE sp_marketing_campaign_recipients SET
    attempts = attempts + 1,
    status = CASE WHEN p_ok THEN 'sent' WHEN attempts + 1 >= 3 THEN 'failed' ELSE 'pending' END,
    provider_id = coalesce(p_provider_id, provider_id),
    sent_at = CASE WHEN p_ok THEN now() ELSE sent_at END,
    error = CASE WHEN p_ok THEN NULL ELSE left(p_error, 500) END
  WHERE campaign_id = p_campaign_id AND email_key = p_email_key AND status = 'pending';

  UPDATE sp_marketing_campaigns c SET status = 'completed', completed_at = now(), updated_at = now()
   WHERE c.id = p_campaign_id AND c.status = 'sending'
     AND NOT EXISTS (SELECT 1 FROM sp_marketing_campaign_recipients r WHERE r.campaign_id = c.id AND r.status = 'pending');
END $$;

-- ── Suppress (unsubscribe / bounce / complaint / operator) ────────────────
CREATE OR REPLACE FUNCTION public.fn_sp_marketing_suppress(
  p_email text, p_reason text, p_source text DEFAULT NULL, p_campaign_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_key text := fn_sp_marketing_email_key(p_email); v_status text;
BEGIN
  IF v_key IS NULL THEN RETURN false; END IF;
  INSERT INTO sp_marketing_suppressions (email_key, reason, source, campaign_id)
  VALUES (v_key, p_reason, p_source, p_campaign_id)
  ON CONFLICT (email_key) DO UPDATE SET
    reason = CASE WHEN EXCLUDED.reason IN ('complaint','hard_bounce') THEN EXCLUDED.reason ELSE sp_marketing_suppressions.reason END;
  v_status := CASE p_reason WHEN 'complaint' THEN 'complained' WHEN 'hard_bounce' THEN 'bounced' WHEN 'invalid' THEN 'invalid' ELSE 'unsubscribed' END;
  UPDATE sp_marketing_contacts SET status = v_status, status_changed_at = now(), updated_at = now()
   WHERE email_key = v_key AND status = 'active';
  UPDATE sp_marketing_campaign_recipients SET status = 'suppressed', skip_reason = p_reason
   WHERE email_key = v_key AND status = 'pending';
  IF p_reason = 'unsubscribed' THEN
    UPDATE sp_marketing_campaign_recipients SET unsubscribed_at = coalesce(unsubscribed_at, now())
     WHERE email_key = v_key AND (p_campaign_id IS NULL OR campaign_id = p_campaign_id) AND status = 'sent';
  END IF;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.fn_sp_marketing_unsuppress(p_email text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_key text := fn_sp_marketing_email_key(p_email);
BEGIN
  DELETE FROM sp_marketing_suppressions WHERE email_key = v_key AND reason IN ('unsubscribed','operator');
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE sp_marketing_contacts SET status = 'active', status_changed_at = now(), updated_at = now()
   WHERE email_key = v_key AND status = 'unsubscribed';
  RETURN true;
END $$;

-- ── Click ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_sp_marketing_record_click(p_campaign_id uuid, p_email_key text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE sp_marketing_campaign_recipients SET clicked_at = coalesce(clicked_at, now()), click_count = click_count + 1
   WHERE campaign_id = p_campaign_id AND email_key = p_email_key;
$$;

-- ── Provider event (Resend webhook), idempotent, with the auto-pause ──────
CREATE OR REPLACE FUNCTION public.fn_sp_marketing_record_event(
  p_event_id text, p_type text, p_message_id text, p_email text, p_payload jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_key text := fn_sp_marketing_email_key(p_email); r record; s sp_marketing_settings;
        v_sent int; v_bad int; v_paused text := NULL; v_bounce_type text;
BEGIN
  INSERT INTO sp_marketing_events (provider_event_id, event_type, provider_message_id, email_key, payload)
  VALUES (p_event_id, p_type, p_message_id, v_key, p_payload)
  ON CONFLICT (provider_event_id) DO NOTHING;
  IF NOT FOUND THEN RETURN jsonb_build_object('duplicate', true); END IF;

  SELECT campaign_id, email_key INTO r FROM sp_marketing_campaign_recipients
   WHERE provider_id = p_message_id AND p_message_id IS NOT NULL LIMIT 1;
  IF r.campaign_id IS NOT NULL THEN
    UPDATE sp_marketing_events SET campaign_id = r.campaign_id WHERE provider_event_id = p_event_id;
    v_key := coalesce(v_key, r.email_key);
  END IF;

  IF p_type = 'email.delivered' THEN
    UPDATE sp_marketing_campaign_recipients SET delivered_at = coalesce(delivered_at, now()) WHERE provider_id = p_message_id;
  ELSIF p_type = 'email.opened' THEN
    UPDATE sp_marketing_campaign_recipients SET opened_at = coalesce(opened_at, now()) WHERE provider_id = p_message_id;
  ELSIF p_type = 'email.clicked' THEN
    UPDATE sp_marketing_campaign_recipients SET clicked_at = coalesce(clicked_at, now()) WHERE provider_id = p_message_id;
  ELSIF p_type = 'email.bounced' THEN
    v_bounce_type := lower(coalesce(p_payload #>> '{data,bounce,type}', 'permanent'));
    UPDATE sp_marketing_campaign_recipients SET bounced_at = coalesce(bounced_at, now()) WHERE provider_id = p_message_id;
    IF v_bounce_type NOT IN ('transient','temporary','undetermined') THEN
      PERFORM fn_sp_marketing_suppress(v_key, 'hard_bounce', 'resend_webhook', r.campaign_id);
    END IF;
  ELSIF p_type = 'email.complained' THEN
    UPDATE sp_marketing_campaign_recipients SET complained_at = coalesce(complained_at, now()) WHERE provider_id = p_message_id;
    PERFORM fn_sp_marketing_suppress(v_key, 'complaint', 'resend_webhook', r.campaign_id);
  END IF;

  -- The auto-pause. One Resend account also sends signup codes, so a
  -- campaign that draws complaints or bounces stops itself before it can
  -- damage that.
  IF r.campaign_id IS NOT NULL AND p_type IN ('email.bounced','email.complained') THEN
    SELECT * INTO s FROM sp_marketing_settings WHERE id = 1;
    SELECT count(*) FILTER (WHERE sent_at IS NOT NULL),
           count(*) FILTER (WHERE CASE WHEN p_type = 'email.complained' THEN complained_at IS NOT NULL ELSE bounced_at IS NOT NULL END)
      INTO v_sent, v_bad FROM sp_marketing_campaign_recipients WHERE campaign_id = r.campaign_id;
    IF p_type = 'email.complained' AND v_bad::numeric / greatest(v_sent, 1) >= s.complaint_pause_rate THEN
      v_paused := 'complaint_rate';
    ELSIF p_type = 'email.bounced' AND v_sent >= 20 AND v_bad::numeric / v_sent > s.bounce_pause_rate THEN
      v_paused := 'bounce_rate';
    END IF;
    IF v_paused IS NOT NULL THEN
      UPDATE sp_marketing_campaigns SET status = 'paused', paused_reason = v_paused, updated_at = now()
       WHERE id = r.campaign_id AND status = 'sending';
    END IF;
  END IF;
  RETURN jsonb_build_object('duplicate', false, 'campaign_id', r.campaign_id, 'paused', v_paused);
END $$;

-- ── Console read: everything the Marketing tab shows in one call ──────────
CREATE OR REPLACE FUNCTION public.fn_sp_marketing_overview()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth, smarter_private AS $$
  SELECT jsonb_build_object(
    'settings', (SELECT jsonb_build_object('sending_enabled', sending_enabled, 'postal_address', postal_address,
        'from_name', from_name, 'from_email', from_email, 'reply_to', reply_to, 'global_daily_cap', global_daily_cap,
        'complaint_pause_rate', complaint_pause_rate, 'bounce_pause_rate', bounce_pause_rate,
        'webhook_connected', webhook_secret IS NOT NULL, 'webhook_connected_at', webhook_connected_at)
      FROM sp_marketing_settings WHERE id = 1),
    'contacts', jsonb_build_object(
      'total', (SELECT count(*) FROM sp_marketing_contacts),
      'with_email', (SELECT count(*) FROM sp_marketing_contacts WHERE email_key IS NOT NULL),
      'active', (SELECT count(*) FROM sp_marketing_contacts WHERE status = 'active' AND email_key IS NOT NULL AND user_id IS NULL),
      'converted', (SELECT count(*) FROM sp_marketing_contacts WHERE user_id IS NOT NULL),
      'by_status', (SELECT coalesce(jsonb_object_agg(status, n), '{}') FROM (SELECT status, count(*) n FROM sp_marketing_contacts GROUP BY 1) x),
      'tags', (SELECT coalesce(jsonb_agg(jsonb_build_object('tag', t, 'count', n) ORDER BY n DESC), '[]')
                 FROM (SELECT unnest(tags) t, count(*) n FROM sp_marketing_contacts GROUP BY 1) y)),
    'players', jsonb_build_object(
      'real', (SELECT count(*) FROM smarter_private.sp_real_humans),
      'lapsed_14d', (SELECT count(*) FROM smarter_private.sp_real_humans h JOIN auth.users u ON u.id = h.id
                      WHERE coalesce(u.last_sign_in_at, u.created_at) < now() - interval '14 days')),
    'suppressions', (SELECT count(*) FROM sp_marketing_suppressions),
    'sent_24h', (SELECT count(*) FROM sp_marketing_campaign_recipients WHERE sent_at > now() - interval '24 hours'),
    'campaigns', (SELECT coalesce(jsonb_agg(row_to_json(z) ORDER BY z.created_at DESC), '[]') FROM (
      SELECT c.id, c.slug, c.name, c.subject, c.preheader, c.headline, c.body, c.cta_label, c.cta_url, c.promo_code,
             c.audience, c.audience_tags, c.lapsed_days, c.daily_cap, c.status, c.paused_reason, c.test_sent_at,
             c.test_sent_to, c.approved_at, c.completed_at, c.created_at, c.updated_at,
             count(r.*) AS recipients,
             count(*) FILTER (WHERE r.status = 'pending') AS pending,
             count(*) FILTER (WHERE r.status = 'sent') AS sent,
             count(*) FILTER (WHERE r.status = 'failed') AS failed,
             count(*) FILTER (WHERE r.status = 'suppressed') AS suppressed,
             count(r.delivered_at) AS delivered, count(r.opened_at) AS opened, count(r.clicked_at) AS clicked,
             count(r.bounced_at) AS bounced, count(r.complained_at) AS complained, count(r.unsubscribed_at) AS unsubscribed,
             (SELECT count(*) FROM sp_marketing_contacts k JOIN sp_marketing_campaign_recipients rr
                 ON rr.contact_id = k.id AND rr.campaign_id = c.id AND rr.status = 'sent'
               WHERE k.converted_at IS NOT NULL AND k.converted_at > rr.sent_at) AS signups
        FROM sp_marketing_campaigns c LEFT JOIN sp_marketing_campaign_recipients r ON r.campaign_id = c.id
       GROUP BY c.id) z)
  );
$$;

-- ── Retention funnel by signup week (real players only) ───────────────────
CREATE OR REPLACE FUNCTION public.fn_sp_marketing_funnel(p_weeks integer DEFAULT 8)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth, smarter_private AS $$
  WITH base AS (
    SELECT h.id, u.created_at, coalesce(u.last_sign_in_at, u.created_at) AS last_seen,
           EXISTS (SELECT 1 FROM player_stats ps WHERE ps.user_id = h.id
                    AND (coalesce(ps.hands_played,0) > 0 OR coalesce(ps.tournaments_played,0) > 0)) AS played
      FROM smarter_private.sp_real_humans h JOIN auth.users u ON u.id = h.id
     WHERE u.created_at >= date_trunc('week', now()) - make_interval(weeks => greatest(least(coalesce(p_weeks,8), 52), 1) - 1)
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'week', to_char(wk, 'YYYY-MM-DD'), 'signed_up', n, 'played', played,
      'seen_after_1d', d1, 'seen_after_7d', CASE WHEN wk + interval '14 days' <= now() THEN d7 END,
      'seen_after_30d', CASE WHEN wk + interval '37 days' <= now() THEN d30 END,
      'seen_last_7d', recent) ORDER BY wk DESC), '[]')
  FROM (
    SELECT date_trunc('week', created_at) wk, count(*) n, count(*) FILTER (WHERE played) played,
           count(*) FILTER (WHERE last_seen > created_at + interval '1 day') d1,
           count(*) FILTER (WHERE last_seen > created_at + interval '7 days') d7,
           count(*) FILTER (WHERE last_seen > created_at + interval '30 days') d30,
           count(*) FILTER (WHERE last_seen > now() - interval '7 days') recent
      FROM base GROUP BY 1) w;
$$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'fn_sp_marketing_email_key(text)', 'fn_sp_marketing_is_player_email(text)',
    'fn_sp_marketing_import_contacts(jsonb,text,text,text[],uuid)', 'fn_sp_marketing_link_conversions()',
    'fn_sp_marketing_campaign_approve(uuid,uuid)', 'fn_sp_marketing_next_batch(integer)',
    'fn_sp_marketing_mark_sent(uuid,text,boolean,text,text)', 'fn_sp_marketing_suppress(text,text,text,uuid)',
    'fn_sp_marketing_unsuppress(text)', 'fn_sp_marketing_record_click(uuid,text)',
    'fn_sp_marketing_record_event(text,text,text,text,jsonb)', 'fn_sp_marketing_overview()',
    'fn_sp_marketing_funnel(integer)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
END $$;

-- ── Assertions ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF (SELECT count(*) FROM sp_marketing_settings) <> 1 THEN RAISE EXCEPTION 'settings singleton missing'; END IF;
  IF has_table_privilege('anon', 'public.sp_marketing_contacts', 'SELECT') THEN RAISE EXCEPTION 'anon can read contacts'; END IF;
  IF has_function_privilege('authenticated', 'public.fn_sp_marketing_overview()', 'EXECUTE') THEN RAISE EXCEPTION 'authenticated can execute overview'; END IF;
END $$;

COMMIT;

-- ── ROLLBACK (copy-paste) ─────────────────────────────────────────────────
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.fn_sp_marketing_funnel(integer), public.fn_sp_marketing_overview(),
--   public.fn_sp_marketing_record_event(text,text,text,text,jsonb), public.fn_sp_marketing_record_click(uuid,text),
--   public.fn_sp_marketing_unsuppress(text), public.fn_sp_marketing_suppress(text,text,text,uuid),
--   public.fn_sp_marketing_mark_sent(uuid,text,boolean,text,text), public.fn_sp_marketing_next_batch(integer),
--   public.fn_sp_marketing_campaign_approve(uuid,uuid), public.fn_sp_marketing_link_conversions(),
--   public.fn_sp_marketing_import_contacts(jsonb,text,text,text[],uuid), public.fn_sp_marketing_is_player_email(text),
--   public.fn_sp_marketing_email_key(text);
-- DROP TABLE IF EXISTS public.sp_marketing_events, public.sp_marketing_campaign_recipients, public.sp_marketing_campaigns,
--   public.sp_marketing_suppressions, public.sp_marketing_contacts, public.sp_marketing_settings;
-- COMMIT;
