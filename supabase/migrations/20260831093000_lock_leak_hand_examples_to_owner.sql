-- Leak hand examples contain private poker context (hero cards, board and
-- action history). They must never be readable through the anonymous REST
-- role. Reads are restricted to the authenticated owner of the parent leak;
-- server-side service-role writes and reads continue to bypass RLS.

ALTER TABLE public.leak_hand_examples ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS anyone_read_examples ON public.leak_hand_examples;
DROP POLICY IF EXISTS users_read_own_leak_examples ON public.leak_hand_examples;

REVOKE ALL ON TABLE public.leak_hand_examples FROM anon;
REVOKE INSERT, REFERENCES, TRIGGER ON TABLE public.leak_hand_examples FROM authenticated;
GRANT SELECT ON TABLE public.leak_hand_examples TO authenticated;

CREATE POLICY users_read_own_leak_examples
ON public.leak_hand_examples
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.user_leaks
    WHERE user_leaks.id = leak_hand_examples.leak_id
      AND user_leaks.user_id = (SELECT auth.uid())
  )
);

COMMENT ON TABLE public.leak_hand_examples IS
  'Private Leak Finder examples. Readable only by the authenticated owner of the parent user_leaks row.';
