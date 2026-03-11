DO $$ 
BEGIN 
  REVOKE ALL ON FUNCTION public.fn_tournament_atomic_register(UUID, UUID, UUID, NUMERIC) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.fn_tournament_atomic_register(UUID, UUID, UUID, NUMERIC) FROM anon;
  REVOKE ALL ON FUNCTION public.fn_tournament_atomic_register(UUID, UUID, UUID, NUMERIC) FROM authenticated;
END $$;
