-- News Hub Database Schema
-- Run in Supabase SQL Editor

-- =====================================================
-- 1. POKER NEWS TABLE (Archived Posts)
-- =====================================================
CREATE TABLE IF NOT EXISTS poker_news (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    slug TEXT UNIQUE,
    content TEXT NOT NULL,
    excerpt TEXT,
    image_url TEXT,
    category TEXT NOT NULL DEFAULT 'news',
    read_time INTEGER DEFAULT 3,
    views INTEGER DEFAULT 0,
    author_id UUID REFERENCES profiles(id),
    author_name TEXT,
    source_url TEXT,
    is_featured BOOLEAN DEFAULT false,
    is_published BOOLEAN DEFAULT true,
    published_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast queries
CREATE INDEX IF NOT EXISTS idx_poker_news_published_at ON poker_news(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_poker_news_category ON poker_news(category);
CREATE INDEX IF NOT EXISTS idx_poker_news_views ON poker_news(views DESC);
CREATE INDEX IF NOT EXISTS idx_poker_news_slug ON poker_news(slug);

-- =====================================================
-- 2. POKER VIDEOS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS poker_videos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    youtube_id TEXT NOT NULL,
    thumbnail_url TEXT,
    duration TEXT,
    views INTEGER DEFAULT 0,
    category TEXT DEFAULT 'general',
    is_featured BOOLEAN DEFAULT false,
    is_published BOOLEAN DEFAULT true,
    published_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_poker_videos_published_at ON poker_videos(published_at DESC);

-- =====================================================
-- 3. NEWSLETTER SUBSCRIBERS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    source TEXT DEFAULT 'news_hub',
    subscribed_at TIMESTAMPTZ DEFAULT NOW(),
    unsubscribed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_newsletter_email ON newsletter_subscribers(email);

-- =====================================================
-- 4. PLAYER OF THE YEAR LEADERBOARD
-- =====================================================
CREATE TABLE IF NOT EXISTS poy_leaderboard (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_name TEXT NOT NULL,
    player_id UUID REFERENCES profiles(id),
    points INTEGER DEFAULT 0,
    rank INTEGER,
    year INTEGER DEFAULT EXTRACT(YEAR FROM NOW()),
    last_updated TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_poy_year_points ON poy_leaderboard(year, points DESC);

-- =====================================================
-- 5. UPCOMING EVENTS TABLE (Poker Near Me preview)
-- =====================================================
CREATE TABLE IF NOT EXISTS poker_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    venue TEXT,
    location TEXT,
    event_date DATE NOT NULL,
    end_date DATE,
    buy_in TEXT,
    guaranteed TEXT,
    event_url TEXT,
    is_featured BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_poker_events_date ON poker_events(event_date);

-- =====================================================
-- 6. RLS POLICIES
-- =====================================================

-- Enable RLS
ALTER TABLE poker_news ENABLE ROW LEVEL SECURITY;
ALTER TABLE poker_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE poy_leaderboard ENABLE ROW LEVEL SECURITY;
ALTER TABLE poker_events ENABLE ROW LEVEL SECURITY;

-- Public read for published content
CREATE POLICY "Public read poker_news" ON poker_news
    FOR SELECT USING (is_published = true);

CREATE POLICY "Public read poker_videos" ON poker_videos
    FOR SELECT USING (is_published = true);

CREATE POLICY "Public read poy_leaderboard" ON poy_leaderboard
    FOR SELECT USING (true);

CREATE POLICY "Public read poker_events" ON poker_events
    FOR SELECT USING (true);

-- Newsletter: anyone can subscribe, only admins can read list
CREATE POLICY "Anyone can subscribe" ON newsletter_subscribers
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Service role read subscribers" ON newsletter_subscribers
    FOR SELECT USING (auth.role() = 'service_role');

-- =====================================================
-- 7. SEED DATA - Sample News Articles
-- =====================================================
INSERT INTO poker_news (title, slug, content, excerpt, image_url, category, read_time, views, author_name, is_featured, published_at) VALUES
('Pro Says This is What Makes Me a Great Poker Player', 'pro-great-poker-player', 
 'Earlier this week, the 2025 Championship Freeroll took place with the top 40 players competing for the title. The winner shared insights into their mindset and approach to the game that separates the pros from the amateurs.',
 'Earlier this week, the 2025 Championship Freeroll took place with the top 40 players.',
 'https://images.unsplash.com/photo-1511193311914-0346f16efe90?w=800&q=80',
 'tournament', 4, 12450, 'Smarter.Poker', true, NOW() - INTERVAL '30 minutes'),

('Hollywood Actor Could Testify at High-Profile Trial', 'hollywood-actor-trial',
 'A famous actor may testify in an upcoming trial involving a well-known poker player. The case has drawn significant attention from both the entertainment and poker worlds.',
 'A famous actor may testify in an upcoming trial involving a well-known player.',
 'https://images.unsplash.com/photo-1596462502278-27bf2d373f1d?w=800&q=80',
 'industry', 3, 8720, 'Smarter.Poker', false, NOW() - INTERVAL '2 hours'),

('Winner Takes All Heads-Up Match Shocks Community', 'heads-up-match-shocks',
 'The latest high-stakes heads-up match ended in a controversial deal that has the poker community buzzing. Players and fans alike are debating the ethics and strategy behind the decision.',
 'The latest high-stakes heads-up match ends in a controversial deal.',
 'https://images.unsplash.com/photo-1518133910546-b6c2fb7d79e3?w=800&q=80',
 'tournament', 5, 6340, 'Smarter.Poker', false, NOW() - INTERVAL '4 hours'),

('Could You Chase This Astonishing World Record?', 'world-record-attempt',
 'A new poker world record attempt has the community buzzing. A player is attempting to break the record for longest continuous poker session while maintaining profitable play.',
 'A new poker world record attempt has the community buzzing.',
 'https://images.unsplash.com/photo-1541278107931-e006523892df?w=800&q=80',
 'news', 2, 5210, 'Smarter.Poker', false, NOW() - INTERVAL '6 hours'),

('Card Markers Caught and Instantly Banned', 'card-markers-banned',
 'Security footage revealed a sophisticated card marking scheme at a major casino. The perpetrators were immediately banned and face potential criminal charges.',
 'Security footage revealed a sophisticated card marking scheme.',
 'https://images.unsplash.com/photo-1511193311914-0346f16efe90?w=800&q=80',
 'industry', 6, 15680, 'Smarter.Poker', false, NOW() - INTERVAL '8 hours'),

('GTO Deep Dive: Optimal River Betting Frequencies', 'gto-river-betting',
 'Understanding when to bet the river is crucial for maximizing EV in todays games. This comprehensive guide breaks down the optimal betting frequencies based on board texture and opponent tendencies.',
 'Understanding when to bet the river is crucial for maximizing EV.',
 'https://images.unsplash.com/photo-1596462502278-27bf2d373f1d?w=800&q=80',
 'strategy', 8, 4890, 'Smarter.Poker', false, NOW() - INTERVAL '10 hours')
ON CONFLICT (slug) DO NOTHING;

-- =====================================================
-- 8. SEED DATA - Sample Videos
-- =====================================================
INSERT INTO poker_videos (title, description, youtube_id, thumbnail_url, duration, views, category, is_featured) VALUES
('WSOP 2025 Preview', 'Everything you need to know about the upcoming WSOP Main Event', 'dQw4w9WgXcQ', 'https://images.unsplash.com/photo-1511193311914-0346f16efe90?w=400&q=80', '12:34', 45000, 'tournament', true),
('How to Crush Live $2/5', 'Pro strategies for beating live $2/5 cash games', 'dQw4w9WgXcQ', 'https://images.unsplash.com/photo-1596462502278-27bf2d373f1d?w=400&q=80', '18:22', 89000, 'strategy', true),
('Bluff Like a Pro', 'Master the art of bluffing with these pro tips', 'dQw4w9WgXcQ', 'https://images.unsplash.com/photo-1518133910546-b6c2fb7d79e3?w=400&q=80', '8:45', 120000, 'strategy', false),
('Pocket Aces Strategy', 'How to maximize value with pocket aces', 'dQw4w9WgXcQ', 'https://images.unsplash.com/photo-1541278107931-e006523892df?w=400&q=80', '15:10', 67000, 'strategy', false)
ON CONFLICT DO NOTHING;

-- =====================================================
-- 9. SEED DATA - POY Leaderboard
-- =====================================================
INSERT INTO poy_leaderboard (player_name, points, rank, year) VALUES
('Alex F.', 2850, 1, 2025),
('Thomas B.', 2720, 2, 2025),
('Chad E.', 2580, 3, 2025),
('Stephen C.', 2410, 4, 2025),
('Daniel N.', 2290, 5, 2025)
ON CONFLICT DO NOTHING;

-- =====================================================
-- 10. SEED DATA - Upcoming Events
-- =====================================================
INSERT INTO poker_events (name, venue, location, event_date, buy_in, guaranteed, is_featured) VALUES
('WSOP Main Event', 'Paris Las Vegas', 'Las Vegas, NV', '2025-06-28', '$10,000', '$40,000,000', true),
('EPT Barcelona', 'Casino Barcelona', 'Barcelona, Spain', '2025-08-15', '€5,300', '€10,000,000', true),
('WPT Championship', 'Wynn Las Vegas', 'Las Vegas, NV', '2025-12-01', '$10,400', '$15,000,000', true)
ON CONFLICT DO NOTHING;

-- =====================================================
-- 11. FUNCTION: Increment View Count
-- =====================================================
CREATE OR REPLACE FUNCTION increment_news_views(news_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE poker_news SET views = views + 1 WHERE id = news_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
