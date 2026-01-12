-- 1. Posts Table
CREATE TABLE IF NOT EXISTS social_posts (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    author_id UUID REFERENCES auth.users(id) NOT NULL,
    content TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_deleted BOOLEAN DEFAULT FALSE
);

-- 2. Media Table
CREATE TABLE IF NOT EXISTS social_post_media (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    post_id UUID REFERENCES social_posts(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    file_type TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_post_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public posts are viewable by everyone" ON social_posts FOR SELECT USING (true);
CREATE POLICY "Users can create posts" ON social_posts FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Media is viewable by everyone" ON social_post_media FOR SELECT USING (true);
CREATE POLICY "Users can upload media" ON social_post_media FOR INSERT WITH CHECK (true);
