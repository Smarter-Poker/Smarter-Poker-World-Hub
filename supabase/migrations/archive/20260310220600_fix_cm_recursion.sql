-- Fix infinite recursion in club_members RLS

CREATE OR REPLACE FUNCTION public.is_club_admin(p_club_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.club_members
    WHERE club_id = p_club_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin', 'manager', 'agent')
  );
END;
$$;

DROP POLICY IF EXISTS "cm_select_own" ON public.club_members;
CREATE POLICY "cm_select_own" ON public.club_members FOR SELECT USING (
  user_id = auth.uid() OR public.is_club_admin(club_id)
);

DROP POLICY IF EXISTS "cm_update_admin" ON public.club_members;
CREATE POLICY "cm_update_admin" ON public.club_members FOR UPDATE USING (
  user_id = auth.uid() OR public.is_club_admin(club_id)
);
