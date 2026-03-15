-- ══════════════════════════════════════════════════════════════════════
-- COMPREHENSIVE DATA RECOVERY
-- Part 1: Restore all profile data from auth.users raw_user_meta_data
-- Part 2: Reconstruct diamond balances from diamond_transactions
-- Part 3: Recreate 15 missing tables
-- ══════════════════════════════════════════════════════════════════════

-- ═══ PART 1: RESTORE PROFILE DATA FROM AUTH METADATA ═══

-- Restore display_name, username, avatar_url, name, city, state, phone,
-- role, is_vip, is_horse, is_bot, alias, poker_alias, email/phone verified
UPDATE profiles p SET
  display_name  = COALESCE(p.display_name, u.raw_user_meta_data->>'display_name', u.raw_user_meta_data->>'name', u.raw_user_meta_data->>'full_name'),
  full_name     = COALESCE(NULLIF(p.full_name, ''), u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name'),
  username      = COALESCE(p.username, u.raw_user_meta_data->>'username'),
  avatar_url    = COALESCE(p.avatar_url, u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture'),
  city          = COALESCE(p.city, u.raw_user_meta_data->>'city'),
  state         = COALESCE(p.state, u.raw_user_meta_data->>'state'),
  phone         = COALESCE(p.phone, u.raw_user_meta_data->>'phone'),
  alias         = COALESCE(p.alias, u.raw_user_meta_data->>'alias', u.raw_user_meta_data->>'poker_alias'),
  role          = COALESCE(NULLIF(p.role, 'user'), u.raw_user_meta_data->>'role', 'user'),
  is_vip        = COALESCE(p.is_vip, (u.raw_user_meta_data->>'is_vip')::boolean, false),
  is_horse      = COALESCE(p.is_horse, (u.raw_user_meta_data->>'is_horse')::boolean, (u.raw_user_meta_data->>'is_bot')::boolean, false),
  email_verified = COALESCE(p.email_verified, (u.raw_user_meta_data->>'email_verified')::boolean, false),
  phone_verified = COALESCE(p.phone_verified, (u.raw_user_meta_data->>'phone_verified')::boolean, false),
  player_number  = COALESCE(p.player_number, u.raw_user_meta_data->>'horse_number'),
  updated_at     = NOW()
FROM auth.users u
WHERE p.id = u.id;

-- ═══ PART 2: RECONSTRUCT DIAMOND BALANCES FROM TRANSACTIONS ═══

-- Reconstruct from diamond_transactions
UPDATE profiles p SET
  diamonds = sub.balance,
  diamond_balance = sub.balance
FROM (
  SELECT user_id, GREATEST(0, SUM(amount)) as balance
  FROM diamond_transactions
  GROUP BY user_id
) sub
WHERE p.id = sub.user_id AND sub.balance > 0;

-- ═══ PART 3: RECREATE 15 MISSING TABLES ═══

-- social_follows
CREATE TABLE IF NOT EXISTS public.social_follows (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  follower_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  following_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(follower_id, following_id)
);
ALTER TABLE public.social_follows ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sf_sel ON public.social_follows;
CREATE POLICY sf_sel ON public.social_follows FOR SELECT USING (true);
DROP POLICY IF EXISTS sf_ins ON public.social_follows;
CREATE POLICY sf_ins ON public.social_follows FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS sf_del ON public.social_follows;
CREATE POLICY sf_del ON public.social_follows FOR DELETE USING (true);

-- notification_preferences
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  push_enabled BOOLEAN DEFAULT TRUE,
  email_enabled BOOLEAN DEFAULT TRUE,
  sms_enabled BOOLEAN DEFAULT FALSE,
  marketing_enabled BOOLEAN DEFAULT FALSE,
  tournament_alerts BOOLEAN DEFAULT TRUE,
  social_alerts BOOLEAN DEFAULT TRUE,
  training_alerts BOOLEAN DEFAULT TRUE,
  preferences JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS np_sel ON public.notification_preferences;
CREATE POLICY np_sel ON public.notification_preferences FOR SELECT USING (true);
DROP POLICY IF EXISTS np_ins ON public.notification_preferences;
CREATE POLICY np_ins ON public.notification_preferences FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS np_upd ON public.notification_preferences;
CREATE POLICY np_upd ON public.notification_preferences FOR UPDATE USING (true);

-- user_notifications
CREATE TABLE IF NOT EXISTS public.user_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'info',
  title TEXT,
  message TEXT,
  data JSONB DEFAULT '{}'::jsonb,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS un_sel ON public.user_notifications;
CREATE POLICY un_sel ON public.user_notifications FOR SELECT USING (true);
DROP POLICY IF EXISTS un_ins ON public.user_notifications;
CREATE POLICY un_ins ON public.user_notifications FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS un_upd ON public.user_notifications;
CREATE POLICY un_upd ON public.user_notifications FOR UPDATE USING (true);
CREATE INDEX IF NOT EXISTS idx_user_notifications_user ON public.user_notifications(user_id);

-- user_bookmarks
CREATE TABLE IF NOT EXISTS public.user_bookmarks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  bookmark_type TEXT DEFAULT 'post',
  target_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, bookmark_type, target_id)
);
ALTER TABLE public.user_bookmarks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ub_sel ON public.user_bookmarks;
CREATE POLICY ub_sel ON public.user_bookmarks FOR SELECT USING (true);
DROP POLICY IF EXISTS ub_ins ON public.user_bookmarks;
CREATE POLICY ub_ins ON public.user_bookmarks FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS ub_del ON public.user_bookmarks;
CREATE POLICY ub_del ON public.user_bookmarks FOR DELETE USING (true);

-- daily_challenges
CREATE TABLE IF NOT EXISTS public.daily_challenges (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  challenge_date DATE DEFAULT CURRENT_DATE,
  challenge_type TEXT,
  challenge_data JSONB DEFAULT '{}'::jsonb,
  completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  reward_claimed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, challenge_date, challenge_type)
);
ALTER TABLE public.daily_challenges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dc_sel ON public.daily_challenges;
CREATE POLICY dc_sel ON public.daily_challenges FOR SELECT USING (true);
DROP POLICY IF EXISTS dc_ins ON public.daily_challenges;
CREATE POLICY dc_ins ON public.daily_challenges FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS dc_upd ON public.daily_challenges;
CREATE POLICY dc_upd ON public.daily_challenges FOR UPDATE USING (true);

-- user_streaks
CREATE TABLE IF NOT EXISTS public.user_streaks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  last_activity_date DATE,
  streak_type TEXT DEFAULT 'login',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.user_streaks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS us_sel ON public.user_streaks;
CREATE POLICY us_sel ON public.user_streaks FOR SELECT USING (true);
DROP POLICY IF EXISTS us_ins ON public.user_streaks;
CREATE POLICY us_ins ON public.user_streaks FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS us_upd ON public.user_streaks;
CREATE POLICY us_upd ON public.user_streaks FOR UPDATE USING (true);

-- user_devices
CREATE TABLE IF NOT EXISTS public.user_devices (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  device_id TEXT,
  device_type TEXT,
  push_token TEXT,
  platform TEXT,
  last_active TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, device_id)
);
ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ud_sel ON public.user_devices;
CREATE POLICY ud_sel ON public.user_devices FOR SELECT USING (true);
DROP POLICY IF EXISTS ud_ins ON public.user_devices;
CREATE POLICY ud_ins ON public.user_devices FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS ud_upd ON public.user_devices;
CREATE POLICY ud_upd ON public.user_devices FOR UPDATE USING (true);

-- referrals
CREATE TABLE IF NOT EXISTS public.referrals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  referred_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  referral_code TEXT,
  status TEXT DEFAULT 'pending',
  reward_claimed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(referrer_id, referred_id)
);
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ref_sel ON public.referrals;
CREATE POLICY ref_sel ON public.referrals FOR SELECT USING (true);
DROP POLICY IF EXISTS ref_ins ON public.referrals;
CREATE POLICY ref_ins ON public.referrals FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS ref_upd ON public.referrals;
CREATE POLICY ref_upd ON public.referrals FOR UPDATE USING (true);

-- user_badges
CREATE TABLE IF NOT EXISTS public.user_badges (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  badge_key TEXT NOT NULL,
  badge_name TEXT,
  earned_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  UNIQUE(user_id, badge_key)
);
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ubadge_sel ON public.user_badges;
CREATE POLICY ubadge_sel ON public.user_badges FOR SELECT USING (true);
DROP POLICY IF EXISTS ubadge_ins ON public.user_badges;
CREATE POLICY ubadge_ins ON public.user_badges FOR INSERT WITH CHECK (true);

-- leaderboard_entries
CREATE TABLE IF NOT EXISTS public.leaderboard_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  leaderboard_id UUID,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  score NUMERIC DEFAULT 0,
  rank INTEGER,
  metadata JSONB DEFAULT '{}'::jsonb,
  period TEXT DEFAULT 'weekly',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.leaderboard_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS le_sel ON public.leaderboard_entries;
CREATE POLICY le_sel ON public.leaderboard_entries FOR SELECT USING (true);
DROP POLICY IF EXISTS le_ins ON public.leaderboard_entries;
CREATE POLICY le_ins ON public.leaderboard_entries FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS le_upd ON public.leaderboard_entries;
CREATE POLICY le_upd ON public.leaderboard_entries FOR UPDATE USING (true);
CREATE INDEX IF NOT EXISTS idx_leaderboard_user ON public.leaderboard_entries(user_id);

-- bankroll_sessions
CREATE TABLE IF NOT EXISTS public.bankroll_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  venue_name TEXT,
  game_type TEXT,
  stakes TEXT,
  buy_in NUMERIC DEFAULT 0,
  cash_out NUMERIC DEFAULT 0,
  duration_minutes INTEGER DEFAULT 0,
  notes TEXT,
  session_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.bankroll_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bs_sel ON public.bankroll_sessions;
CREATE POLICY bs_sel ON public.bankroll_sessions FOR SELECT USING (true);
DROP POLICY IF EXISTS bs_ins ON public.bankroll_sessions;
CREATE POLICY bs_ins ON public.bankroll_sessions FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS bs_upd ON public.bankroll_sessions;
CREATE POLICY bs_upd ON public.bankroll_sessions FOR UPDATE USING (true);
DROP POLICY IF EXISTS bs_del ON public.bankroll_sessions;
CREATE POLICY bs_del ON public.bankroll_sessions FOR DELETE USING (true);

-- toke_entries
CREATE TABLE IF NOT EXISTS public.toke_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  session_id UUID REFERENCES bankroll_sessions(id) ON DELETE CASCADE,
  amount NUMERIC DEFAULT 0,
  toke_type TEXT DEFAULT 'dealer',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.toke_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS te_sel ON public.toke_entries;
CREATE POLICY te_sel ON public.toke_entries FOR SELECT USING (true);
DROP POLICY IF EXISTS te_ins ON public.toke_entries;
CREATE POLICY te_ins ON public.toke_entries FOR INSERT WITH CHECK (true);

-- abuse_logs
CREATE TABLE IF NOT EXISTS public.abuse_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  action TEXT,
  severity TEXT DEFAULT 'low',
  details JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  fingerprint TEXT,
  resolved BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.abuse_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS al_sel ON public.abuse_logs;
CREATE POLICY al_sel ON public.abuse_logs FOR SELECT USING (true);
DROP POLICY IF EXISTS al_ins ON public.abuse_logs;
CREATE POLICY al_ins ON public.abuse_logs FOR INSERT WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_abuse_logs_user ON public.abuse_logs(user_id);

-- purchase_history
CREATE TABLE IF NOT EXISTS public.purchase_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  product_id TEXT,
  product_name TEXT,
  amount NUMERIC DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  payment_method TEXT,
  stripe_session_id TEXT,
  status TEXT DEFAULT 'completed',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.purchase_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ph_sel ON public.purchase_history;
CREATE POLICY ph_sel ON public.purchase_history FOR SELECT USING (true);
DROP POLICY IF EXISTS ph_ins ON public.purchase_history;
CREATE POLICY ph_ins ON public.purchase_history FOR INSERT WITH CHECK (true);

-- promo_codes_used
CREATE TABLE IF NOT EXISTS public.promo_codes_used (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  promo_id UUID,
  reward_type TEXT,
  reward_amount INTEGER DEFAULT 0,
  used_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, code)
);
ALTER TABLE public.promo_codes_used ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pcu_sel ON public.promo_codes_used;
CREATE POLICY pcu_sel ON public.promo_codes_used FOR SELECT USING (true);
DROP POLICY IF EXISTS pcu_ins ON public.promo_codes_used;
CREATE POLICY pcu_ins ON public.promo_codes_used FOR INSERT WITH CHECK (true);

-- Part 4: Fix boolean flags from auth metadata
UPDATE profiles p SET is_vip = true
FROM auth.users u
WHERE p.id = u.id AND u.raw_user_meta_data->>'is_vip' = 'true';

UPDATE profiles p SET is_horse = true
FROM auth.users u
WHERE p.id = u.id AND (u.raw_user_meta_data->>'is_horse' = 'true' OR u.raw_user_meta_data->>'is_bot' = 'true');

UPDATE profiles p SET email_verified = true
FROM auth.users u
WHERE p.id = u.id AND u.raw_user_meta_data->>'email_verified' = 'true';

UPDATE profiles p SET phone_verified = true
FROM auth.users u
WHERE p.id = u.id AND u.raw_user_meta_data->>'phone_verified' = 'true';

