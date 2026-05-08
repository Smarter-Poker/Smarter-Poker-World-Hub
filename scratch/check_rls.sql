SELECT pol.policyname, pol.permissive, pol.roles, pol.cmd, pol.qual, pol.with_check
FROM pg_policies pol
WHERE pol.tablename = 'profiles';
