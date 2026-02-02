-- =============================================================================
-- COMPREHENSIVE DATABASE MIGRATION
-- Creates all 16 missing tables for Smarter.Poker ecosystem
-- Date: February 2, 2026
-- =============================================================================

-- =============================================================================
-- MESSENGER SYSTEM
-- =============================================================================

-- Messenger participants (for group DMs and conversation membership)
CREATE TABLE IF NOT EXISTS public.messenger_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    last_read_at TIMESTAMPTZ,
    is_muted BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(conversation_id, user_id)
);

-- Enable RLS
ALTER TABLE public.messenger_participants ENABLE ROW LEVEL SECURITY;

-- Users can see their own participation
CREATE POLICY "Users can view own participations" ON public.messenger_participants
    FOR SELECT USING (auth.uid() = user_id);

-- Users can update their own participation (mute, mark read)
CREATE POLICY "Users can update own participations" ON public.messenger_participants
    FOR UPDATE USING (auth.uid() = user_id);

-- =============================================================================
-- CLUB ARENA SYSTEM
-- =============================================================================

-- Club tables (live poker tables within clubs)
CREATE TABLE IF NOT EXISTS public.club_tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    game_type TEXT DEFAULT 'nlh' CHECK (game_type IN ('nlh', 'plo', 'plo5', 'ofc')),
    stakes TEXT NOT NULL, -- e.g. "1/2", "2/5"
    min_buyin INTEGER DEFAULT 20, -- in BB
    max_buyin INTEGER DEFAULT 100, -- in BB
    max_players INTEGER DEFAULT 9 CHECK (max_players BETWEEN 2 AND 10),
    current_players INTEGER DEFAULT 0,
    status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'running', 'paused', 'closed')),
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.club_tables ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Club members can view tables" ON public.club_tables
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.club_members WHERE club_id = club_tables.club_id AND user_id = auth.uid())
    );

-- Marketplace orders (merchandise purchases)
CREATE TABLE IF NOT EXISTS public.marketplace_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    order_number TEXT UNIQUE NOT NULL,
    items JSONB NOT NULL DEFAULT '[]',
    subtotal INTEGER NOT NULL, -- in cents
    shipping_cost INTEGER DEFAULT 0,
    tax_amount INTEGER DEFAULT 0,
    total_amount INTEGER NOT NULL,
    payment_method TEXT CHECK (payment_method IN ('stripe', 'diamonds')),
    payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'failed', 'refunded')),
    shipping_address JSONB,
    tracking_number TEXT,
    fulfillment_status TEXT DEFAULT 'pending' CHECK (fulfillment_status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled')),
    stripe_payment_intent_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.marketplace_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own orders" ON public.marketplace_orders
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create orders" ON public.marketplace_orders
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- =============================================================================
-- TOURNAMENT/VENUE SYSTEM
-- =============================================================================

-- Tournament schedules (traveling poker tours)
CREATE TABLE IF NOT EXISTS public.tournament_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tour_code TEXT NOT NULL, -- e.g. 'wpt', 'wsop', 'mspt'
    tour_name TEXT NOT NULL,
    event_name TEXT NOT NULL,
    venue_id UUID REFERENCES public.poker_venues(id),
    venue_name TEXT,
    city TEXT,
    state TEXT,
    country TEXT DEFAULT 'USA',
    start_date DATE NOT NULL,
    end_date DATE,
    buyin_min INTEGER, -- in dollars
    buyin_max INTEGER,
    guaranteed_prize INTEGER,
    event_url TEXT,
    scraped_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.tournament_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view schedules" ON public.tournament_schedules
    FOR SELECT USING (true);

-- Venue tournaments (venue-specific recurring events)
CREATE TABLE IF NOT EXISTS public.venue_tournaments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    venue_id UUID NOT NULL REFERENCES public.poker_venues(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    day_of_week INTEGER CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sunday
    start_time TIME,
    buyin INTEGER, -- in dollars
    guaranteed_prize INTEGER,
    structure TEXT, -- 'freezeout', 'rebuy', 'bounty'
    is_recurring BOOLEAN DEFAULT TRUE,
    next_date DATE,
    scraped_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.venue_tournaments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view venue tournaments" ON public.venue_tournaments
    FOR SELECT USING (true);

-- =============================================================================
-- USER CONTENT TRACKING
-- =============================================================================

-- User favorites (articles, videos, horses, venues)
CREATE TABLE IF NOT EXISTS public.user_favorites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    content_type TEXT NOT NULL CHECK (content_type IN ('article', 'video', 'horse', 'venue', 'post', 'reel')),
    content_id TEXT NOT NULL, -- UUID or external ID
    title TEXT,
    thumbnail_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, content_type, content_id)
);

ALTER TABLE public.user_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own favorites" ON public.user_favorites
    FOR ALL USING (auth.uid() = user_id);

-- User bookmarks
CREATE TABLE IF NOT EXISTS public.user_bookmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    content_type TEXT NOT NULL CHECK (content_type IN ('article', 'video', 'post')),
    content_id TEXT NOT NULL,
    title TEXT,
    url TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, content_type, content_id)
);

ALTER TABLE public.user_bookmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own bookmarks" ON public.user_bookmarks
    FOR ALL USING (auth.uid() = user_id);

-- Watch later queue
CREATE TABLE IF NOT EXISTS public.user_watch_later (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    content_type TEXT NOT NULL CHECK (content_type IN ('video', 'reel', 'article')),
    content_id TEXT NOT NULL,
    title TEXT,
    thumbnail_url TEXT,
    duration_seconds INTEGER,
    watched BOOLEAN DEFAULT FALSE,
    watched_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, content_type, content_id)
);

ALTER TABLE public.user_watch_later ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own watch later" ON public.user_watch_later
    FOR ALL USING (auth.uid() = user_id);

-- =============================================================================
-- PUSH NOTIFICATIONS
-- =============================================================================

-- Push notification subscriptions
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh_key TEXT NOT NULL, -- Public key
    auth_key TEXT NOT NULL, -- Auth secret
    device_type TEXT CHECK (device_type IN ('web', 'ios', 'android')),
    user_agent TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    last_used_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own subscriptions" ON public.push_subscriptions
    FOR ALL USING (auth.uid() = user_id);

-- =============================================================================
-- JARVIS AI SYSTEM
-- =============================================================================

-- Jarvis chat message history
CREATE TABLE IF NOT EXISTS public.jarvis_chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id UUID, -- Optional session grouping
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    tool_calls JSONB, -- For function calling
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.jarvis_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own messages" ON public.jarvis_chat_messages
    FOR ALL USING (auth.uid() = user_id);

-- Jarvis goals tracking
CREATE TABLE IF NOT EXISTS public.jarvis_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    goal_type TEXT CHECK (goal_type IN ('daily', 'weekly', 'monthly', 'custom')),
    target_value NUMERIC,
    current_value NUMERIC DEFAULT 0,
    unit TEXT, -- 'hands', 'hours', 'profit', etc.
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'failed', 'paused')),
    due_date DATE,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.jarvis_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own goals" ON public.jarvis_goals
    FOR ALL USING (auth.uid() = user_id);

-- Jarvis bankroll logs
CREATE TABLE IF NOT EXISTS public.jarvis_bankroll_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_date DATE NOT NULL,
    venue_name TEXT,
    game_type TEXT, -- 'cash', 'tournament'
    stakes TEXT, -- '1/2', '2/5', etc.
    buyin INTEGER, -- in cents
    cashout INTEGER, -- in cents
    hours_played NUMERIC(4,2),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.jarvis_bankroll_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own logs" ON public.jarvis_bankroll_logs
    FOR ALL USING (auth.uid() = user_id);

-- =============================================================================
-- AI HORSES SYSTEM
-- =============================================================================

-- AI Horse profiles (the 100 AI personalities)
CREATE TABLE IF NOT EXISTS public.ai_horses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    horse_number INTEGER UNIQUE NOT NULL CHECK (horse_number BETWEEN 1 AND 100),
    name TEXT NOT NULL,
    username TEXT UNIQUE NOT NULL,
    avatar_url TEXT,
    personality TEXT NOT NULL, -- Brief personality description
    style TEXT, -- 'aggressive', 'conservative', 'tricky', etc.
    specialty TEXT, -- 'cash', 'mtt', 'mixed'
    bio TEXT,
    follower_count INTEGER DEFAULT 0,
    content_sources JSONB DEFAULT '[]', -- Assigned content sources
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.ai_horses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view horses" ON public.ai_horses
    FOR SELECT USING (true);

-- Horse-generated posts
CREATE TABLE IF NOT EXISTS public.horse_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    horse_id UUID NOT NULL REFERENCES public.ai_horses(id) ON DELETE CASCADE,
    post_type TEXT NOT NULL CHECK (post_type IN ('text', 'quote', 'meme', 'clip', 'news')),
    content TEXT NOT NULL,
    media_url TEXT,
    source_url TEXT, -- Original content source
    likes_count INTEGER DEFAULT 0,
    comments_count INTEGER DEFAULT 0,
    is_published BOOLEAN DEFAULT TRUE,
    published_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.horse_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view horse posts" ON public.horse_posts
    FOR SELECT USING (is_published = true);

-- Horse stories (ephemeral content)
CREATE TABLE IF NOT EXISTS public.horse_stories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    horse_id UUID NOT NULL REFERENCES public.ai_horses(id) ON DELETE CASCADE,
    story_type TEXT NOT NULL CHECK (story_type IN ('image', 'video', 'text', 'poll')),
    content TEXT,
    media_url TEXT,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
    view_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.horse_stories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active stories" ON public.horse_stories
    FOR SELECT USING (expires_at > NOW());

-- Horse content queue (pending content to post)
CREATE TABLE IF NOT EXISTS public.horse_content_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    horse_id UUID NOT NULL REFERENCES public.ai_horses(id) ON DELETE CASCADE,
    content_type TEXT NOT NULL CHECK (content_type IN ('post', 'story', 'comment', 'reply')),
    content TEXT NOT NULL,
    media_url TEXT,
    scheduled_for TIMESTAMPTZ,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'published', 'failed')),
    attempt_count INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.horse_content_queue ENABLE ROW LEVEL SECURITY;

-- Service role only for queue management
CREATE POLICY "Service role manages queue" ON public.horse_content_queue
    FOR ALL USING (false);

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_messenger_participants_user ON public.messenger_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_messenger_participants_conv ON public.messenger_participants(conversation_id);
CREATE INDEX IF NOT EXISTS idx_club_tables_club ON public.club_tables(club_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_orders_user ON public.marketplace_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_tournament_schedules_tour ON public.tournament_schedules(tour_code);
CREATE INDEX IF NOT EXISTS idx_tournament_schedules_dates ON public.tournament_schedules(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_venue_tournaments_venue ON public.venue_tournaments(venue_id);
CREATE INDEX IF NOT EXISTS idx_user_favorites_user ON public.user_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_user_bookmarks_user ON public.user_bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_user_watch_later_user ON public.user_watch_later(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON public.push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_jarvis_messages_user ON public.jarvis_chat_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_jarvis_goals_user ON public.jarvis_goals(user_id);
CREATE INDEX IF NOT EXISTS idx_jarvis_bankroll_user ON public.jarvis_bankroll_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_horse_posts_horse ON public.horse_posts(horse_id);
CREATE INDEX IF NOT EXISTS idx_horse_stories_horse ON public.horse_stories(horse_id);
CREATE INDEX IF NOT EXISTS idx_horse_queue_status ON public.horse_content_queue(status, scheduled_for);

-- =============================================================================
-- GRANT SERVICE ROLE ACCESS
-- =============================================================================

GRANT ALL ON public.messenger_participants TO service_role;
GRANT ALL ON public.club_tables TO service_role;
GRANT ALL ON public.marketplace_orders TO service_role;
GRANT ALL ON public.tournament_schedules TO service_role;
GRANT ALL ON public.venue_tournaments TO service_role;
GRANT ALL ON public.user_favorites TO service_role;
GRANT ALL ON public.user_bookmarks TO service_role;
GRANT ALL ON public.user_watch_later TO service_role;
GRANT ALL ON public.push_subscriptions TO service_role;
GRANT ALL ON public.jarvis_chat_messages TO service_role;
GRANT ALL ON public.jarvis_goals TO service_role;
GRANT ALL ON public.jarvis_bankroll_logs TO service_role;
GRANT ALL ON public.ai_horses TO service_role;
GRANT ALL ON public.horse_posts TO service_role;
GRANT ALL ON public.horse_stories TO service_role;
GRANT ALL ON public.horse_content_queue TO service_role;
