-- EMERGENCY: Restore profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  display_name TEXT,
  first_name TEXT,
  last_name TEXT,
  username TEXT UNIQUE,
  email TEXT,
  phone TEXT,
  bio TEXT,
  city TEXT,
  state TEXT,
  alias TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'user',
  status TEXT DEFAULT 'active',
  is_vip BOOLEAN DEFAULT FALSE,
  is_horse BOOLEAN DEFAULT FALSE,
  is_admin BOOLEAN DEFAULT FALSE,
  is_online BOOLEAN DEFAULT FALSE,
  player_number TEXT,
  diamonds INTEGER DEFAULT 0,
  diamond_balance INTEGER DEFAULT 0,
  diamond_multiplier DECIMAL(3,2) DEFAULT 1.00,
  xp INTEGER DEFAULT 0,
  xp_total INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  tier TEXT DEFAULT 'Newcomer',
  skill_tier TEXT DEFAULT 'Newcomer',
  login_streak INTEGER DEFAULT 0,
  streak_days INTEGER DEFAULT 0,
  settings JSONB DEFAULT '{}'::jsonb,
  preferences JSONB DEFAULT '{}'::jsonb,
  social_page_id UUID,
  favorite_venue UUID,
  home_poker_club UUID,
  referred_by UUID,
  friends_count INTEGER DEFAULT 0,
  hendon_total_cashes INTEGER DEFAULT 0,
  hendon_total_earnings NUMERIC DEFAULT 0,
  email_verified BOOLEAN DEFAULT FALSE,
  phone_verified BOOLEAN DEFAULT FALSE,
  onboarding_complete BOOLEAN DEFAULT FALSE,
  last_login TIMESTAMPTZ DEFAULT NOW(),
  last_login_date DATE DEFAULT CURRENT_DATE,
  last_seen TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles FOR SELECT USING (true);
DROP POLICY IF EXISTS profiles_insert ON public.profiles;
CREATE POLICY profiles_insert ON public.profiles FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS profiles_update ON public.profiles;
CREATE POLICY profiles_update ON public.profiles FOR UPDATE USING (true);
DROP POLICY IF EXISTS profiles_delete ON public.profiles;
CREATE POLICY profiles_delete ON public.profiles FOR DELETE USING (true);

GRANT ALL ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;

-- Re-populate from auth.users
INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
SELECT id, email, COALESCE(raw_user_meta_data->>'full_name', ''), created_at, NOW()
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- Recreate auth trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Restore topic_cooldowns
CREATE TABLE IF NOT EXISTS public.topic_cooldowns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  topic_id TEXT NOT NULL,
  last_used_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, topic_id)
);
ALTER TABLE public.topic_cooldowns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS topic_cooldowns_sel ON public.topic_cooldowns;
CREATE POLICY topic_cooldowns_sel ON public.topic_cooldowns FOR SELECT USING (true);
DROP POLICY IF EXISTS topic_cooldowns_ins ON public.topic_cooldowns;
CREATE POLICY topic_cooldowns_ins ON public.topic_cooldowns FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS topic_cooldowns_upd ON public.topic_cooldowns;
CREATE POLICY topic_cooldowns_upd ON public.topic_cooldowns FOR UPDATE USING (true);

-- Restore news_articles
CREATE TABLE IF NOT EXISTS public.news_articles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT,
  content TEXT,
  url TEXT,
  source TEXT,
  image_url TEXT,
  category TEXT DEFAULT 'general',
  views INTEGER DEFAULT 0,
  published_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.news_articles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS news_articles_sel ON public.news_articles;
CREATE POLICY news_articles_sel ON public.news_articles FOR SELECT USING (true);
DROP POLICY IF EXISTS news_articles_ins ON public.news_articles;
CREATE POLICY news_articles_ins ON public.news_articles FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS news_articles_upd ON public.news_articles;
CREATE POLICY news_articles_upd ON public.news_articles FOR UPDATE USING (true);

-- LOCK exec_sql and run_sql permanently
DROP FUNCTION IF EXISTS public.exec_sql(text);
CREATE OR REPLACE FUNCTION public.exec_sql(p_sql text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'exec_sql is permanently disabled for security';
END; $$;

DROP FUNCTION IF EXISTS public.run_sql(text);
CREATE OR REPLACE FUNCTION public.run_sql(p_sql text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'run_sql is permanently disabled for security';
END; $$;
-- fn_add_xp negative guard
DROP FUNCTION IF EXISTS public.fn_add_xp(uuid, integer);
CREATE OR REPLACE FUNCTION public.fn_add_xp(p_user_id uuid, p_amount integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF p_amount <= 0 THEN RETURN; END IF;
  UPDATE profiles SET xp = COALESCE(xp, 0) + p_amount, updated_at = now() WHERE id = p_user_id;
END; $fn$;
