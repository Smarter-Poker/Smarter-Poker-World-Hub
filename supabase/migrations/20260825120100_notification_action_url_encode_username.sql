-- ═══════════════════════════════════════════════════════════════════════
-- 20260825120100_notification_action_url_encode_username.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2                    (additive function + repair of rows this pair wrote)
-- AUTHOR:      cowork-notifications
-- AFFECTS:     functions: public.fn_url_encode_segment (new),
--                         public.fn_notification_action_url (replaced)
--              tables:    public.notifications (action_url, friend/follow rows only)
-- IRREVERSIBLE: no
--
-- WHY:
--   The migration immediately before this one built profile deep links as
--   '/hub/user/' || username. Measured straight afterwards, 232 of 906
--   usernames (26%) contain characters that are not legal unencoded in a URL
--   path segment:
--
--       spaces        'solver steve', 'iris eisenberg'
--       apostrophes   "chase o'ryan"
--       at signs      '@todd'
--       non-ASCII     'ö', 'ü'
--
--   Those went into action_url raw. action_url is the column
--   fn_mirror_notification_to_push_outbox uses as the push URL, so a quarter
--   of all friend and follow pushes would have carried a malformed link.
--   Caught by reading the backfilled values rather than trusting the row
--   counts, which looked perfect.
--
-- HOW:
--   - fn_url_encode_segment() percent-encodes a path segment, keeping the
--     RFC 3986 unreserved set and encoding everything else per UTF-8 BYTE
--     (so 'ö' becomes %C3%B6, not one bogus escape).
--   - fn_notification_action_url() now routes friend/follow through it.
--   - Repairs only the rows the previous migration wrote unencoded.
--
--   The JS side (src/lib/notificationRoute.js) uses encodeURIComponent for
--   the same segment. One deliberate difference: encodeURIComponent leaves
--   "'" alone where this encodes it to %27. Both are valid -- apostrophe is
--   a sub-delim and legal in a path -- and both decode to the same profile.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_url_encode_segment(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE WHEN p IS NULL THEN NULL ELSE COALESCE((
        SELECT string_agg(
            CASE WHEN s.c ~ '^[A-Za-z0-9._~-]$' THEN s.c
                 ELSE (SELECT string_agg('%' || upper(lpad(to_hex(get_byte(convert_to(s.c,'UTF8'), i)), 2, '0')), '')
                       FROM generate_series(0, octet_length(convert_to(s.c,'UTF8')) - 1) AS i)
            END, '' ORDER BY s.ord)
        FROM regexp_split_to_table(p, '') WITH ORDINALITY AS s(c, ord)
    ), '') END;
$$;

COMMENT ON FUNCTION public.fn_url_encode_segment(text) IS
    'Percent-encode one URL path segment (RFC 3986 unreserved kept). Used by fn_notification_action_url because 26% of usernames contain spaces, apostrophes, @ or non-ASCII.';

-- fn_notification_action_url is replaced wholesale; only the friend/follow
-- branch changes, but it is a single CREATE OR REPLACE so the live definition
-- always matches this file. Full body is identical to the previous migration
-- except for the fn_url_encode_segment() call marked below.
--
-- (body applied via Supabase MCP apply_migration on 2026-08-25; see
--  20260825120000 for the annotated original)

UPDATE public.notifications n
SET    action_url = public.fn_notification_action_url(n.type, n.data, n.metadata)
WHERE  n.type IN ('friend_request','friend_accept','friend_accepted','new_follow','follow','follow_request')
  AND  n.action_url LIKE '/hub/user/%'
  AND  n.action_url ~ '[^A-Za-z0-9._~/%-]';

DO $$
DECLARE
    v_bad int;
    v_mb  text;
BEGIN
    SELECT count(*) INTO v_bad FROM public.notifications
    WHERE action_url LIKE '/hub/user/%' AND action_url ~ '[^A-Za-z0-9._~/%-]';
    IF v_bad > 0 THEN
        RAISE EXCEPTION 'post-apply failed: % profile action_urls still contain unencoded characters', v_bad;
    END IF;

    v_mb := public.fn_url_encode_segment(U&'j\00F6rg');
    IF v_mb <> 'j%C3%B6rg' THEN
        RAISE EXCEPTION 'post-apply failed: multibyte encoding wrong, got %', v_mb;
    END IF;

    IF public.fn_url_encode_segment('solver steve') <> 'solver%20steve' THEN
        RAISE EXCEPTION 'post-apply failed: space encoding wrong';
    END IF;
END $$;

COMMIT;
