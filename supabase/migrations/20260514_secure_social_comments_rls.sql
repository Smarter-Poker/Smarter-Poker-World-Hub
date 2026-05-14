-- ═══════════════════════════════════════════════════════════════════════════
-- Pass 3 Adversarial Audit Fix: Secure social_comments RLS
-- Explicitly enforce auth.uid() = author_id for INSERT, UPDATE, DELETE.
-- Prevents spoofing of comments and unauthorized modification.
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Authenticated users can comment" ON public.social_comments;
DROP POLICY IF EXISTS "Users can create their own comments" ON public.social_comments;
DROP POLICY IF EXISTS "Users can update their own comments" ON public.social_comments;
DROP POLICY IF EXISTS "Users can delete their own comments" ON public.social_comments;

CREATE POLICY "Users can create their own comments" ON public.social_comments
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Users can update their own comments" ON public.social_comments
    FOR UPDATE TO authenticated
    USING (auth.uid() = author_id)
    WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Users can delete their own comments" ON public.social_comments
    FOR DELETE TO authenticated
    USING (auth.uid() = author_id);
