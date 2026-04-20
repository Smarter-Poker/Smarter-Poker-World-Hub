-- Pass 24b: PostgreSQL RLS OR's multiple policies of the same cmd.
-- The old permissive 'home_follows_insert_own' was still present
-- alongside my new restrictive 'home_group_follows_insert', so the
-- old policy let private-group follows through. Drop the old one.
DROP POLICY IF EXISTS home_follows_insert_own ON public.commander_home_group_follows;
