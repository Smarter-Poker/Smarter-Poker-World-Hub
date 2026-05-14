-- ═══════════════════════════════════════════════════════════════════════════
-- Pass 3 Adversarial Audit Fix: Secure social_posts INSERT RLS
-- The previous policy 'Authenticated users can post' had WITH CHECK (true),
-- allowing any authenticated user to forge posts as any other user.
-- Since the Next.js API route uses the service_role key to mirror club posts,
-- and the RPC fn_create_social_post runs as SECURITY DEFINER, enforcing
-- auth.uid() = author_id for client-side direct inserts is fully safe.
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Authenticated users can post" ON public.social_posts;
DROP POLICY IF EXISTS "Users can create their own posts" ON public.social_posts;

CREATE POLICY "Users can create their own posts" ON public.social_posts
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = author_id);
