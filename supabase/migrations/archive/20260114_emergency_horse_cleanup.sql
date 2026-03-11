-- Emergency cleanup: Delete all AI-generated photo posts from horses
-- This migration removes violating content that bypasses RLS

-- Delete photo posts from content_authors (horses)
DELETE FROM public.social_posts 
WHERE content_type = 'photo' 
AND author_id IN (
    SELECT profile_id 
    FROM public.content_authors 
    WHERE profile_id IS NOT NULL
);

-- Delete image stories from horses
DELETE FROM public.stories 
WHERE media_type = 'image' 
AND author_id IN (
    SELECT profile_id 
    FROM public.content_authors 
    WHERE profile_id IS NOT NULL
);

-- Log the cleanup
DO $$
BEGIN
    RAISE NOTICE 'Emergency cleanup complete: Removed all AI-generated horse content';
END $$;
