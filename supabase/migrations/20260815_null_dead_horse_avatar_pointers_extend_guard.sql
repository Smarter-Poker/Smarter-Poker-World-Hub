-- 16 of the 407 restored horse avatar URLs point at storage objects that no
-- longer exist (verified against storage.objects; e.g. darktunnel's returned
-- HTTP 400). The originals are unrecoverable. NULL the dead pointers in both
-- tables: the UI falls back to the default avatar instead of a broken image,
-- and /api/horses/generate-avatars queues on avatar_url IS NULL, so the
-- admin pipeline regenerates real headshots for exactly these 16.
WITH dead AS (
  SELECT p.id AS profile_id, ca.id AS author_id
  FROM public.profiles p
  JOIN public.content_authors ca ON ca.profile_id = p.id AND ca.avatar_url IS NOT NULL
  LEFT JOIN storage.objects so
    ON so.bucket_id = 'social-media'
   AND so.name = replace(ca.avatar_url, 'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/', '')
  WHERE p.is_horse AND so.id IS NULL
), upd_ca AS (
  UPDATE public.content_authors ca SET avatar_url = NULL
  FROM dead d WHERE ca.id = d.author_id
  RETURNING ca.id
)
UPDATE public.profiles p SET avatar_url = NULL
FROM dead d WHERE p.id = d.profile_id;

-- Extend the guard: also refuse stock-library writes onto a horse whose
-- avatar is NULL (pending regeneration) — previously only real->stock was
-- blocked, leaving NULL horses open to the stale Hetzner daemon's writes.
CREATE OR REPLACE FUNCTION public.fn_guard_horse_avatar()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.is_horse IS TRUE
     AND NEW.avatar_url LIKE '/avatars/%'
     AND (OLD.avatar_url IS NULL OR OLD.avatar_url NOT LIKE '/avatars/%') THEN
    NEW.avatar_url := OLD.avatar_url;  -- keep photo (or stay NULL for regeneration)
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE dead_left int; econ int;
BEGIN
  SELECT count(*) INTO dead_left
  FROM public.profiles p
  JOIN public.content_authors ca ON ca.profile_id = p.id AND ca.avatar_url IS NOT NULL
  LEFT JOIN storage.objects so
    ON so.bucket_id = 'social-media'
   AND so.name = replace(ca.avatar_url, 'https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/social-media/', '')
  WHERE p.is_horse AND so.id IS NULL;
  IF dead_left > 0 THEN
    RAISE EXCEPTION 'still % dead avatar pointers', dead_left;
  END IF;
  SELECT count(*) INTO econ FROM public.economy_invariants() WHERE NOT ok;
  IF econ > 0 THEN
    RAISE EXCEPTION 'economy_invariants failing: %', econ;
  END IF;
END $$;
