/**
 * API Endpoint to run Jarvis database migrations
 * Creates opponent_profiles, hand_history, and jarvis_conversations tables
 */

import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const results = {
        opponent_profiles: { success: false, message: '' },
        hand_history: { success: false, message: '' },
        jarvis_conversations: { success: false, message: '' }
    };

    try {
        // 1. Create opponent_profiles table
        const { error: opponentError } = await supabaseAdmin.rpc('exec_sql', {
            sql: `
                CREATE TABLE IF NOT EXISTS opponent_profiles (
                    id TEXT PRIMARY KEY,
                    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
                    name TEXT NOT NULL DEFAULT 'Villain',
                    position TEXT DEFAULT 'Unknown',
                    notes JSONB DEFAULT '[]'::jsonb,
                    style TEXT DEFAULT 'unknown',
                    stats JSONB DEFAULT '{"vpip": "?", "pfr": "?", "aggression": "?", "foldToRaise": "?"}'::jsonb,
                    tags JSONB DEFAULT '[]'::jsonb,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                );
                
                CREATE INDEX IF NOT EXISTS idx_opponent_profiles_user_id ON opponent_profiles(user_id);
                
                ALTER TABLE opponent_profiles ENABLE ROW LEVEL SECURITY;
                
                DO $$ BEGIN
                    CREATE POLICY "Users can view their own opponent profiles"
                        ON opponent_profiles FOR SELECT USING (auth.uid() = user_id);
                EXCEPTION WHEN duplicate_object THEN NULL; END $$;
                
                DO $$ BEGIN
                    CREATE POLICY "Users can create their own opponent profiles"
                        ON opponent_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
                EXCEPTION WHEN duplicate_object THEN NULL; END $$;
                
                DO $$ BEGIN
                    CREATE POLICY "Users can update their own opponent profiles"
                        ON opponent_profiles FOR UPDATE USING (auth.uid() = user_id);
                EXCEPTION WHEN duplicate_object THEN NULL; END $$;
                
                DO $$ BEGIN
                    CREATE POLICY "Users can delete their own opponent profiles"
                        ON opponent_profiles FOR DELETE USING (auth.uid() = user_id);
                EXCEPTION WHEN duplicate_object THEN NULL; END $$;
                
                GRANT ALL ON opponent_profiles TO authenticated;
                GRANT ALL ON opponent_profiles TO service_role;
            `
        });

        if (opponentError) {
            // Try direct SQL approach
            const { error: directError } = await supabaseAdmin.from('opponent_profiles').select('id').limit(1);
            if (directError && directError.code === '42P01') {
                // Table doesn't exist, create it via direct query
                results.opponent_profiles = { success: false, message: `Table needs manual creation: ${opponentError.message}` };
            } else {
                results.opponent_profiles = { success: true, message: 'Table already exists' };
            }
        } else {
            results.opponent_profiles = { success: true, message: 'Created successfully' };
        }

        // 2. Create hand_history table
        const { error: handError } = await supabaseAdmin.rpc('exec_sql', {
            sql: `
                CREATE TABLE IF NOT EXISTS hand_history (
                    id TEXT PRIMARY KEY,
                    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
                    title TEXT,
                    hand TEXT NOT NULL,
                    villain_hand TEXT,
                    board TEXT,
                    action TEXT,
                    result TEXT DEFAULT 'unknown',
                    pot_size INTEGER,
                    position TEXT DEFAULT 'BTN',
                    tags JSONB DEFAULT '[]'::jsonb,
                    notes TEXT,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                );
                
                CREATE INDEX IF NOT EXISTS idx_hand_history_user_id ON hand_history(user_id);
                CREATE INDEX IF NOT EXISTS idx_hand_history_created_at ON hand_history(created_at DESC);
                
                ALTER TABLE hand_history ENABLE ROW LEVEL SECURITY;
                
                DO $$ BEGIN
                    CREATE POLICY "Users can view their own hand history"
                        ON hand_history FOR SELECT USING (auth.uid() = user_id);
                EXCEPTION WHEN duplicate_object THEN NULL; END $$;
                
                DO $$ BEGIN
                    CREATE POLICY "Users can insert their own hand history"
                        ON hand_history FOR INSERT WITH CHECK (auth.uid() = user_id);
                EXCEPTION WHEN duplicate_object THEN NULL; END $$;
                
                DO $$ BEGIN
                    CREATE POLICY "Users can update their own hand history"
                        ON hand_history FOR UPDATE USING (auth.uid() = user_id);
                EXCEPTION WHEN duplicate_object THEN NULL; END $$;
                
                DO $$ BEGIN
                    CREATE POLICY "Users can delete their own hand history"
                        ON hand_history FOR DELETE USING (auth.uid() = user_id);
                EXCEPTION WHEN duplicate_object THEN NULL; END $$;
                
                GRANT ALL ON hand_history TO authenticated;
                GRANT ALL ON hand_history TO service_role;
            `
        });

        if (handError) {
            const { error: directError } = await supabaseAdmin.from('hand_history').select('id').limit(1);
            if (directError && directError.code === '42P01') {
                results.hand_history = { success: false, message: `Table needs manual creation: ${handError.message}` };
            } else {
                results.hand_history = { success: true, message: 'Table already exists' };
            }
        } else {
            results.hand_history = { success: true, message: 'Created successfully' };
        }

        // 3. Create jarvis_conversations table
        const { error: convError } = await supabaseAdmin.rpc('exec_sql', {
            sql: `
                CREATE TABLE IF NOT EXISTS jarvis_conversations (
                    id TEXT PRIMARY KEY,
                    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
                    title TEXT DEFAULT 'Conversation',
                    messages JSONB DEFAULT '[]'::jsonb,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                );
                
                CREATE INDEX IF NOT EXISTS idx_jarvis_conversations_user_id ON jarvis_conversations(user_id);
                CREATE INDEX IF NOT EXISTS idx_jarvis_conversations_updated_at ON jarvis_conversations(updated_at DESC);
                
                ALTER TABLE jarvis_conversations ENABLE ROW LEVEL SECURITY;
                
                DO $$ BEGIN
                    CREATE POLICY "Users can view their own conversations"
                        ON jarvis_conversations FOR SELECT USING (auth.uid() = user_id);
                EXCEPTION WHEN duplicate_object THEN NULL; END $$;
                
                DO $$ BEGIN
                    CREATE POLICY "Users can insert their own conversations"
                        ON jarvis_conversations FOR INSERT WITH CHECK (auth.uid() = user_id);
                EXCEPTION WHEN duplicate_object THEN NULL; END $$;
                
                DO $$ BEGIN
                    CREATE POLICY "Users can update their own conversations"
                        ON jarvis_conversations FOR UPDATE USING (auth.uid() = user_id);
                EXCEPTION WHEN duplicate_object THEN NULL; END $$;
                
                DO $$ BEGIN
                    CREATE POLICY "Users can delete their own conversations"
                        ON jarvis_conversations FOR DELETE USING (auth.uid() = user_id);
                EXCEPTION WHEN duplicate_object THEN NULL; END $$;
                
                GRANT ALL ON jarvis_conversations TO authenticated;
                GRANT ALL ON jarvis_conversations TO service_role;
            `
        });

        if (convError) {
            const { error: directError } = await supabaseAdmin.from('jarvis_conversations').select('id').limit(1);
            if (directError && directError.code === '42P01') {
                results.jarvis_conversations = { success: false, message: `Table needs manual creation: ${convError.message}` };
            } else {
                results.jarvis_conversations = { success: true, message: 'Table already exists' };
            }
        } else {
            results.jarvis_conversations = { success: true, message: 'Created successfully' };
        }

        return res.status(200).json({
            message: 'Migration complete',
            results
        });

    } catch (error) {
        console.error('Migration error:', error);
        return res.status(500).json({ error: error.message, results });
    }
}
