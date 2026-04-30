-- ============================================================
-- Restore profile_picture_history table + set_profile_picture RPC
-- These were dropped in 20260314_drop_orphan_tables.sql but are
-- still referenced by ProfilePictureHistory.js and MediaLibrary.js
-- ============================================================

-- 1. Restore profile_picture_history table
CREATE TABLE IF NOT EXISTS public.profile_picture_history (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    url text NOT NULL,
    media_id uuid DEFAULT NULL,
    created_at timestamptz DEFAULT now()
);

ALTER TABLE IF EXISTS public.profile_picture_history ENABLE ROW LEVEL SECURITY;

DO $p$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profile_picture_history' AND policyname='pph_select') THEN
        CREATE POLICY pph_select ON public.profile_picture_history FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profile_picture_history' AND policyname='pph_insert') THEN
        CREATE POLICY pph_insert ON public.profile_picture_history FOR INSERT WITH CHECK (auth.uid() = user_id);
    END IF;
END $p$;


-- 2. Restore social_media_library table (referenced by MediaLibrary.js)
CREATE TABLE IF NOT EXISTS public.social_media_library (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    url text NOT NULL,
    media_type text DEFAULT 'photo', -- 'photo', 'video'
    file_name text,
    file_size bigint,
    is_current_profile_picture boolean DEFAULT false,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

ALTER TABLE IF EXISTS public.social_media_library ENABLE ROW LEVEL SECURITY;

DO $p$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='social_media_library' AND policyname='sml_select') THEN
        CREATE POLICY sml_select ON public.social_media_library FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='social_media_library' AND policyname='sml_insert') THEN
        CREATE POLICY sml_insert ON public.social_media_library FOR INSERT WITH CHECK (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='social_media_library' AND policyname='sml_update') THEN
        CREATE POLICY sml_update ON public.social_media_library FOR UPDATE USING (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='social_media_library' AND policyname='sml_delete') THEN
        CREATE POLICY sml_delete ON public.social_media_library FOR DELETE USING (auth.uid() = user_id);
    END IF;
END $p$;


-- 3. Restore set_profile_picture RPC
--    Code calls with p_media_id (MediaLibrary.js / ProfilePictureHistory.js)
--    Looks up the URL from social_media_library, updates profiles.avatar_url,
--    and records history.
DROP FUNCTION IF EXISTS public.set_profile_picture(uuid);
DROP FUNCTION IF EXISTS public.set_profile_picture(uuid, text);

CREATE OR REPLACE FUNCTION public.set_profile_picture(p_media_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_url text;
    v_user_id uuid;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Get URL from media library
    SELECT url INTO v_url FROM social_media_library
    WHERE id = p_media_id AND user_id = v_user_id;

    IF v_url IS NULL THEN
        RAISE EXCEPTION 'Media not found or not owned by user';
    END IF;

    -- Clear old is_current flag
    UPDATE social_media_library SET is_current_profile_picture = false
    WHERE user_id = v_user_id AND is_current_profile_picture = true;

    -- Set new
    UPDATE social_media_library SET is_current_profile_picture = true, updated_at = now()
    WHERE id = p_media_id;

    -- Update profile
    UPDATE profiles SET avatar_url = v_url, updated_at = now()
    WHERE id = v_user_id;

    -- Record in history
    INSERT INTO profile_picture_history (user_id, url, media_id, created_at)
    VALUES (v_user_id, v_url, p_media_id, now());
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_profile_picture(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_profile_picture(uuid) TO service_role;


-- 4. Restore get_profile_picture_history RPC
DROP FUNCTION IF EXISTS public.get_profile_picture_history(uuid);

CREATE OR REPLACE FUNCTION public.get_profile_picture_history(p_user_id uuid)
RETURNS TABLE(url text, media_id uuid, created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
        SELECT pph.url, pph.media_id, pph.created_at
        FROM profile_picture_history pph
        WHERE pph.user_id = p_user_id
        ORDER BY pph.created_at DESC
        LIMIT 20;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_profile_picture_history(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_profile_picture_history(uuid) TO service_role;
