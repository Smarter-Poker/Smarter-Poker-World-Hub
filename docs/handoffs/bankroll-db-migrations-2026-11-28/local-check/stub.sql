DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$; DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA auth; CREATE SCHEMA extensions;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
CREATE TABLE public.profiles (id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE, settings jsonb DEFAULT '{}'::jsonb, username text);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY profiles_update ON public.profiles FOR UPDATE USING ((SELECT auth.uid()) = id) WITH CHECK ((SELECT auth.uid()) = id);
GRANT SELECT (id, settings, username), UPDATE (settings) ON public.profiles TO authenticated;
CREATE TABLE public.bankroll_locations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, name text);
CREATE TABLE public.bankroll_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  category text NOT NULL CHECK (category = ANY (ARRAY['poker_cash','poker_mtt','casino_table','slots','sports','expense','deposit','withdrawal'])),
  location_id uuid REFERENCES public.bankroll_locations(id),
  trip_id uuid,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  start_time timestamptz, end_time timestamptz,
  gross_in numeric NOT NULL DEFAULT 0, gross_out numeric NOT NULL DEFAULT 0,
  net_result numeric GENERATED ALWAYS AS (gross_out - gross_in) STORED,
  notes text, created_at timestamptz NOT NULL DEFAULT now(),
  is_revision boolean DEFAULT false, original_entry_id uuid REFERENCES public.bankroll_ledger(id),
  CONSTRAINT bankroll_ledger_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT fk_bankroll_ledger_user_id_profiles FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE
);
ALTER TABLE public.bankroll_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own ledger" ON public.bankroll_ledger FOR SELECT USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users can insert own ledger" ON public.bankroll_ledger FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users can update own ledger" ON public.bankroll_ledger FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "Users can delete own ledger" ON public.bankroll_ledger FOR DELETE TO authenticated USING ((SELECT auth.uid()) = user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bankroll_ledger TO anon, authenticated;
CREATE TABLE public.bankroll_segments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, segment_type text NOT NULL, initial_deposit numeric DEFAULT 0);
ALTER TABLE public.bankroll_segments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own segments" ON public.bankroll_segments FOR SELECT USING ((SELECT auth.uid()) = user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bankroll_segments TO anon, authenticated;
CREATE TABLE public.staking_arrangements (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, backer_name text NOT NULL, backer_email text, split_percentage int NOT NULL DEFAULT 50, notes text);
ALTER TABLE public.staking_arrangements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own staking arrangements" ON public.staking_arrangements USING ((SELECT auth.uid()) = user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staking_arrangements TO anon, authenticated;
CREATE TABLE public.staking_sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), arrangement_id uuid NOT NULL REFERENCES public.staking_arrangements(id) ON DELETE CASCADE, ledger_entry_id uuid NOT NULL REFERENCES public.bankroll_ledger(id) ON DELETE CASCADE, gross_result numeric NOT NULL, player_share numeric NOT NULL, backer_share numeric NOT NULL, makeup_before numeric, makeup_after numeric, created_at timestamptz DEFAULT now());
ALTER TABLE public.staking_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own staking sessions" ON public.staking_sessions USING (arrangement_id IN (SELECT staking_arrangements.id FROM staking_arrangements WHERE staking_arrangements.user_id = (SELECT auth.uid())));
GRANT SELECT, INSERT ON public.staking_sessions TO authenticated;
-- Supabase's default privileges: new tables and functions in public are granted to the API roles.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
