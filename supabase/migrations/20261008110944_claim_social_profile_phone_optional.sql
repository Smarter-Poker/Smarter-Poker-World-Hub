-- ═══════════════════════════════════════════════════════════════════════
-- 20261008110944_claim_social_profile_phone_optional.sql
-- ═══════════════════════════════════════════════════════════════════════
-- TIER:        2
-- AUTHOR:      Claude (Cowork session), owner audit instruction Dan 2026-10-08
-- AFFECTS:     function public.claim_social_profile(text, text, text)
-- IRREVERSIBLE: no
--
-- WHY:
--   Phone numbers are verified on /hub/verify-phone (2026-10-07), which is
--   what pays the welcome package and arms the one-handset-one-account guard
--   (profiles.phone in E.164 + phone_verified). The Social Media completion
--   gate still REQUIRED a phone and wrote it unverified, in a "+1 5551234567"
--   shape the guard's exact match could never see. The gate no longer collects
--   a phone; this function stops demanding one. A phone that IS supplied by a
--   legacy client is kept, normalised to E.164 when it is a 10/11-digit US
--   number, and never overwrites a VERIFIED number.
--
-- HOW:
--   * p_phone NULL/blank  -> profiles.phone untouched, no error.
--   * p_phone supplied    -> same 7-15 digit validation as before; stored as
--                            +1XXXXXXXXXX for US shapes, digits-only '+...'
--                            otherwise; skipped when phone_verified is true.
--   * Signature unchanged (text, text, text) so the API's RPC call and the
--     existing GRANTs keep working; no second overload is created.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                   WHERE n.nspname = 'public' AND p.proname = 'claim_social_profile'
                     AND pg_get_function_identity_arguments(p.oid) = 'p_full_name text, p_username text, p_phone text') THEN
        RAISE EXCEPTION 'pre-flight failed: public.claim_social_profile(text, text, text) not found';
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.claim_social_profile(p_full_name text, p_username text, p_phone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_clean_username text;
  v_clean_phone    text;
  v_clean_name     text;
  v_phone_digits   text;
  v_phone_verified boolean := false;
  v_profile        public.profiles;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'unauthenticated');
  END IF;

  v_clean_name     := nullif(btrim(coalesce(p_full_name, '')), '');
  v_clean_username := lower(trim(both ' @' from coalesce(p_username, '')));
  v_clean_phone    := nullif(btrim(coalesce(p_phone, '')), '');

  IF v_clean_name IS NULL OR length(v_clean_name) < 2 OR length(v_clean_name) > 80
     OR v_clean_name !~ '[A-Za-zÀ-ÖØ-öø-ÿ]' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_name',
      'message', 'Please Enter Your Full Name (2-80 Characters).');
  END IF;

  IF v_clean_username !~ '^[a-z0-9][a-z0-9_.]{2,19}$' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_username',
      'message', 'Username Must Be 3-20 Characters Using Letters, Numbers, Underscores, Or Periods.');
  END IF;

  IF public.is_reserved_username(v_clean_username) THEN
    RETURN jsonb_build_object('success', false, 'error', 'username_reserved',
      'message', 'That Username Is Reserved. Pick A Different One.');
  END IF;

  -- PHONE IS OPTIONAL HERE (2026-10-08): verification lives on /hub/verify-phone.
  IF v_clean_phone IS NOT NULL THEN
    v_phone_digits := regexp_replace(v_clean_phone, '[^0-9]', '', 'g');
    IF length(v_phone_digits) < 7 OR length(v_phone_digits) > 15 THEN
      RETURN jsonb_build_object('success', false, 'error', 'invalid_phone',
        'message', 'Enter A Valid Phone Number (7-15 Digits).');
    END IF;
    -- E.164, the shape pages/api/sms/verify-otp.js writes and matches on.
    v_clean_phone := CASE
      WHEN length(v_phone_digits) = 10 THEN '+1' || v_phone_digits
      WHEN length(v_phone_digits) = 11 AND left(v_phone_digits, 1) = '1' THEN '+' || v_phone_digits
      ELSE '+' || v_phone_digits
    END;
    SELECT coalesce(phone_verified, false) INTO v_phone_verified FROM public.profiles WHERE id = v_uid;
    IF v_phone_verified THEN
      v_clean_phone := NULL; -- never overwrite a verified number with an unverified one
    END IF;
  END IF;

  BEGIN
    UPDATE public.profiles
       SET full_name                 = v_clean_name,
           username                  = v_clean_username,
           phone                     = coalesce(v_clean_phone, phone),
           social_profile_completed  = true,
           last_active               = now()
     WHERE id = v_uid
     RETURNING * INTO v_profile;
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object('success', false, 'error', 'username_taken',
        'message', 'That Username Was Just Claimed By Someone Else. Pick Another.');
  END;

  IF v_profile.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'profile_missing',
      'message', 'Your Profile Row Is Missing - Refresh And Try Again.');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'profile', jsonb_build_object(
      'id',        v_profile.id,
      'full_name', v_profile.full_name,
      'username',  v_profile.username,
      'phone',     v_profile.phone,
      'social_profile_completed', v_profile.social_profile_completed
    )
  );
END;
$function$;

-- POST-APPLY ASSERTIONS
DO $$
DECLARE v_src TEXT; v_count INT;
BEGIN
    SELECT count(*) INTO v_count FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'claim_social_profile';
    IF v_count <> 1 THEN
        RAISE EXCEPTION 'post-apply failed: expected exactly one claim_social_profile, found %', v_count;
    END IF;
    SELECT pg_get_functiondef('public.claim_social_profile'::regproc) INTO v_src;
    IF v_src NOT LIKE '%PHONE IS OPTIONAL HERE%' THEN
        RAISE EXCEPTION 'post-apply failed: new claim_social_profile body not installed';
    END IF;
END $$;

COMMIT;
