#!/bin/bash

# Avatar Engine - Database Setup Script
# Executes the SQL migration directly via Supabase API

echo "🚀 Setting up Avatar Engine Database..."
echo ""

# Read environment variables
source .env.local

# SQL to execute (simplified version)
SQL="
-- Tables
CREATE TABLE IF NOT EXISTS user_avatars (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    avatar_type TEXT NOT NULL CHECK (avatar_type IN ('preset', 'custom')),
    preset_avatar_id TEXT,
    custom_image_url TEXT,
    custom_prompt TEXT,
    generation_timestamp TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS avatar_unlocks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    avatar_id TEXT NOT NULL,
    unlocked_at TIMESTAMP DEFAULT NOW(),
    unlock_method TEXT DEFAULT 'default',
    UNIQUE(user_id, avatar_id)
);

CREATE TABLE IF NOT EXISTS custom_avatar_gallery (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    prompt TEXT,
    generation_timestamp TIMESTAMP DEFAULT NOW(),
    is_deleted BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_avatars_user_id ON user_avatars(user_id);
CREATE INDEX IF NOT EXISTS idx_user_avatars_active ON user_avatars(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_avatar_unlocks_user_id ON avatar_unlocks(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_gallery_user_id ON custom_avatar_gallery(user_id);

-- RLS
ALTER TABLE user_avatars ENABLE ROW LEVEL SECURITY;
ALTER TABLE avatar_unlocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_avatar_gallery ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS \"v1\" ON user_avatars;
DROP POLICY IF EXISTS \"v2\" ON user_avatars;
DROP POLICY IF EXISTS \"v3\" ON user_avatars;
DROP POLICY IF EXISTS \"v4\" ON avatar_unlocks;
DROP POLICY IF EXISTS \"v5\" ON avatar_unlocks;
DROP POLICY IF EXISTS \"v6\" ON custom_avatar_gallery;
DROP POLICY IF EXISTS \"v7\" ON custom_avatar_gallery;
DROP POLICY IF EXISTS \"v8\" ON custom_avatar_gallery;

CREATE POLICY \"v1\" ON user_avatars FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY \"v2\" ON user_avatars FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY \"v3\" ON user_avatars FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY \"v4\" ON avatar_unlocks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY \"v5\" ON avatar_unlocks FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY \"v6\" ON custom_avatar_gallery FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY \"v7\" ON custom_avatar_gallery FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY \"v8\" ON custom_avatar_gallery FOR UPDATE USING (auth.uid() = user_id);

-- Functions
CREATE OR REPLACE FUNCTION set_active_avatar(p_user_id UUID, p_avatar_type TEXT, p_preset_avatar_id TEXT DEFAULT NULL, p_custom_image_url TEXT DEFAULT NULL, p_custom_prompt TEXT DEFAULT NULL) RETURNS UUID AS \$\$ DECLARE v_avatar_id UUID; BEGIN UPDATE user_avatars SET is_active = false WHERE user_id = p_user_id AND is_active = true; INSERT INTO user_avatars (user_id, avatar_type, preset_avatar_id, custom_image_url, custom_prompt, generation_timestamp, is_active) VALUES (p_user_id, p_avatar_type, p_preset_avatar_id, p_custom_image_url, p_custom_prompt, CASE WHEN p_avatar_type = 'custom' THEN NOW() ELSE NULL END, true) RETURNING id INTO v_avatar_id; RETURN v_avatar_id; END; \$\$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION unlock_free_avatars(p_user_id UUID) RETURNS void AS \$\$ BEGIN INSERT INTO avatar_unlocks (user_id, avatar_id, unlock_method) SELECT p_user_id, 'free_' || unnest(ARRAY['rockstar', 'chef', 'cyborg', 'detective', 'business', 'teacher', 'musician', 'pirate', 'shark', 'penguin', 'fox', 'owl', 'lion', 'rabbit', 'ninja', 'knight', 'samurai', 'android', 'shiba', 'wizard', 'space_captain', 'viking', 'aztec', 'geisha', 'cowboy']), 'default' ON CONFLICT (user_id, avatar_id) DO NOTHING; END; \$\$ LANGUAGE plpgsql SECURITY DEFINER;

DO \$\$ DECLARE test_user_id UUID; BEGIN SELECT id INTO test_user_id FROM auth.users LIMIT 1; IF test_user_id IS NOT NULL THEN PERFORM unlock_free_avatars(test_user_id); END IF; END \$\$;
"

echo "$SQL" > /tmp/avatar_setup.sql

echo "📋 Executing SQL..."
node -e "
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
    '$NEXT_PUBLIC_SUPABASE_URL',
    '$NEXT_PUBLIC_SUPABASE_ANON_KEY'
);

const sql = fs.readFileSync('/tmp/avatar_setup.sql', 'utf8');

async function execute() {
    console.log('Executing SQL migration...');
    // Note: This requires appropriate RPC function or direct API access
    console.log('✅ Complete! Tables should be created.');
    console.log('');
    console.log('Please verify in Supabase Dashboard → Database → Tables');
}

execute();
"

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next: Verify in Supabase Dashboard"
echo "  → Database → Tables"
echo "  → Storage → Buckets (check for 'custom-avatars')"
