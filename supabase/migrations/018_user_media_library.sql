-- ═══════════════════════════════════════════════════════════════════════════
-- USER MEDIA LIBRARY SCHEMA
-- Facebook-style photo/video library with profile picture history
-- Migration: 018_user_media_library.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 📁 USER ALBUMS (Optional organization)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_albums (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    cover_media_id UUID, -- Set after user_media table exists
    is_system BOOLEAN DEFAULT false, -- Reserved for "Profile Pictures" album
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_albums_user ON user_albums(user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 📸 USER MEDIA (Photos and Videos)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Media Type
    media_type TEXT NOT NULL CHECK (media_type IN ('photo', 'video')),
    
    -- Storage
    storage_path TEXT NOT NULL,
    public_url TEXT NOT NULL,
    thumbnail_url TEXT,
    
    -- File Metadata
    filename TEXT,
    file_size INTEGER, -- bytes
    mime_type TEXT,
    
    -- Dimensions
    width INTEGER,
    height INTEGER,
    duration_seconds INTEGER, -- for videos only
    
    -- Special Flags
    is_profile_picture BOOLEAN DEFAULT false,
    is_current_profile_picture BOOLEAN DEFAULT false, -- currently active
    is_cover_photo BOOLEAN DEFAULT false,
    is_current_cover_photo BOOLEAN DEFAULT false, -- currently active
    is_default BOOLEAN DEFAULT false, -- system default avatar (auto-delete when replaced)
    
    -- Organization
    album_id UUID REFERENCES user_albums(id) ON DELETE SET NULL,
    caption TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_media_user ON user_media(user_id);
CREATE INDEX IF NOT EXISTS idx_user_media_type ON user_media(user_id, media_type);
CREATE INDEX IF NOT EXISTS idx_user_media_profile ON user_media(user_id, is_profile_picture) WHERE is_profile_picture = true;
CREATE INDEX IF NOT EXISTS idx_user_media_album ON user_media(album_id) WHERE album_id IS NOT NULL;

-- Add foreign key for album cover
ALTER TABLE user_albums 
    ADD CONSTRAINT fk_album_cover 
    FOREIGN KEY (cover_media_id) 
    REFERENCES user_media(id) 
    ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 📜 PROFILE PICTURE HISTORY
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profile_picture_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    media_id UUID NOT NULL REFERENCES user_media(id) ON DELETE CASCADE,
    set_at TIMESTAMPTZ DEFAULT now(),
    removed_at TIMESTAMPTZ -- NULL if currently active
);

CREATE INDEX IF NOT EXISTS idx_profile_history_user ON profile_picture_history(user_id, set_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 🔒 ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────────────────

-- User Media RLS
ALTER TABLE user_media ENABLE ROW LEVEL SECURITY;

-- Users can view all public media (for profile viewing)
CREATE POLICY "user_media_select_public" ON user_media
    FOR SELECT USING (true);

-- Users can insert their own media
CREATE POLICY "user_media_insert_own" ON user_media
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own media
CREATE POLICY "user_media_update_own" ON user_media
    FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own media
CREATE POLICY "user_media_delete_own" ON user_media
    FOR DELETE USING (auth.uid() = user_id);

-- User Albums RLS
ALTER TABLE user_albums ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_albums_select_public" ON user_albums
    FOR SELECT USING (true);

CREATE POLICY "user_albums_insert_own" ON user_albums
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_albums_update_own" ON user_albums
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "user_albums_delete_own" ON user_albums
    FOR DELETE USING (auth.uid() = user_id AND is_system = false);

-- Profile Picture History RLS
ALTER TABLE profile_picture_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profile_history_select_public" ON profile_picture_history
    FOR SELECT USING (true);

CREATE POLICY "profile_history_insert_own" ON profile_picture_history
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "profile_history_update_own" ON profile_picture_history
    FOR UPDATE USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 🔧 HELPER FUNCTIONS
-- ─────────────────────────────────────────────────────────────────────────────

-- Function to set a media item as the current profile picture
CREATE OR REPLACE FUNCTION set_profile_picture(p_media_id UUID)
RETURNS void AS $$
DECLARE
    v_user_id UUID;
    v_public_url TEXT;
    v_old_media_id UUID;
BEGIN
    -- Get user_id and url from the media item
    SELECT user_id, public_url INTO v_user_id, v_public_url
    FROM user_media
    WHERE id = p_media_id;
    
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Media not found';
    END IF;
    
    -- Verify the caller owns this media
    IF v_user_id != auth.uid() THEN
        RAISE EXCEPTION 'Not authorized';
    END IF;
    
    -- Get current profile picture (if any)
    SELECT id INTO v_old_media_id
    FROM user_media
    WHERE user_id = v_user_id AND is_current_profile_picture = true;
    
    -- Mark old profile picture as no longer current
    IF v_old_media_id IS NOT NULL THEN
        UPDATE user_media 
        SET is_current_profile_picture = false, updated_at = now()
        WHERE id = v_old_media_id;
        
        -- Close the history record
        UPDATE profile_picture_history
        SET removed_at = now()
        WHERE media_id = v_old_media_id AND removed_at IS NULL;
    END IF;
    
    -- Delete any default avatar media
    DELETE FROM user_media
    WHERE user_id = v_user_id AND is_default = true;
    
    -- Set new profile picture
    UPDATE user_media
    SET is_profile_picture = true,
        is_current_profile_picture = true,
        updated_at = now()
    WHERE id = p_media_id;
    
    -- Add to history
    INSERT INTO profile_picture_history (user_id, media_id, set_at)
    VALUES (v_user_id, p_media_id, now());
    
    -- Update profiles table
    UPDATE profiles
    SET avatar_url = v_public_url, updated_at = now()
    WHERE id = v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get profile picture history
CREATE OR REPLACE FUNCTION get_profile_picture_history(p_user_id UUID)
RETURNS TABLE (
    media_id UUID,
    public_url TEXT,
    thumbnail_url TEXT,
    set_at TIMESTAMPTZ,
    removed_at TIMESTAMPTZ,
    is_current BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        h.media_id,
        m.public_url,
        m.thumbnail_url,
        h.set_at,
        h.removed_at,
        (h.removed_at IS NULL) AS is_current
    FROM profile_picture_history h
    JOIN user_media m ON h.media_id = m.id
    WHERE h.user_id = p_user_id
    ORDER BY h.set_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────
-- 🎉 GRANT PERMISSIONS
-- ─────────────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION set_profile_picture(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_profile_picture_history(UUID) TO authenticated;
