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
        jarvis_conversations: { success: false, message: '' },
        poker_goals: { success: false, message: '' },
        tilt_journal: { success: false, message: '' },
        bankroll_history: { success: false, message: '' }
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

        // 4. Create poker_goals table
        const { error: goalsError } = await supabaseAdmin.rpc('exec_sql', {
            sql: `
                CREATE TABLE IF NOT EXISTS poker_goals (
                    id TEXT PRIMARY KEY,
                    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
                    title TEXT NOT NULL,
                    description TEXT,
                    category TEXT NOT NULL DEFAULT 'training',
                    target INTEGER NOT NULL DEFAULT 10,
                    current INTEGER NOT NULL DEFAULT 0,
                    unit TEXT NOT NULL DEFAULT 'units',
                    deadline DATE,
                    completed BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                );
                
                CREATE INDEX IF NOT EXISTS idx_poker_goals_user_id ON poker_goals(user_id);
                
                ALTER TABLE poker_goals ENABLE ROW LEVEL SECURITY;
                
                DO $$ BEGIN
                    CREATE POLICY "poker_goals_select" ON poker_goals FOR SELECT USING (auth.uid() = user_id);
                EXCEPTION WHEN duplicate_object THEN NULL; END $$;
                
                DO $$ BEGIN
                    CREATE POLICY "poker_goals_insert" ON poker_goals FOR INSERT WITH CHECK (auth.uid() = user_id);
                EXCEPTION WHEN duplicate_object THEN NULL; END $$;
                
                DO $$ BEGIN
                    CREATE POLICY "poker_goals_update" ON poker_goals FOR UPDATE USING (auth.uid() = user_id);
                EXCEPTION WHEN duplicate_object THEN NULL; END $$;
                
                DO $$ BEGIN
                    CREATE POLICY "poker_goals_delete" ON poker_goals FOR DELETE USING (auth.uid() = user_id);
                EXCEPTION WHEN duplicate_object THEN NULL; END $$;
                
                GRANT ALL ON poker_goals TO authenticated;
                GRANT ALL ON poker_goals TO service_role;
            `
        });

        if (goalsError) {
            const { error: directError } = await supabaseAdmin.from('poker_goals').select('id').limit(1);
            results.poker_goals = directError && directError.code === '42P01'
                ? { success: false, message: `Needs manual creation` }
                : { success: true, message: 'Table already exists' };
        } else {
            results.poker_goals = { success: true, message: 'Created successfully' };
        }

        // 5. Create tilt_journal table
        const { error: tiltError } = await supabaseAdmin.rpc('exec_sql', {
            sql: `
                CREATE TABLE IF NOT EXISTS tilt_journal (
                    id TEXT PRIMARY KEY,
                    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
                    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    trigger TEXT NOT NULL,
                    intensity INTEGER NOT NULL DEFAULT 3 CHECK (intensity >= 1 AND intensity <= 5),
                    situation TEXT,
                    response TEXT,
                    outcome TEXT,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
                
                CREATE INDEX IF NOT EXISTS idx_tilt_journal_user_id ON tilt_journal(user_id);
                
                ALTER TABLE tilt_journal ENABLE ROW LEVEL SECURITY;
                
                DO $$ BEGIN
                    CREATE POLICY "tilt_journal_select" ON tilt_journal FOR SELECT USING (auth.uid() = user_id);
                EXCEPTION WHEN duplicate_object THEN NULL; END $$;
                
                DO $$ BEGIN
                    CREATE POLICY "tilt_journal_insert" ON tilt_journal FOR INSERT WITH CHECK (auth.uid() = user_id);
                EXCEPTION WHEN duplicate_object THEN NULL; END $$;
                
                DO $$ BEGIN
                    CREATE POLICY "tilt_journal_update" ON tilt_journal FOR UPDATE USING (auth.uid() = user_id);
                EXCEPTION WHEN duplicate_object THEN NULL; END $$;
                
                DO $$ BEGIN
                    CREATE POLICY "tilt_journal_delete" ON tilt_journal FOR DELETE USING (auth.uid() = user_id);
                EXCEPTION WHEN duplicate_object THEN NULL; END $$;
                
                GRANT ALL ON tilt_journal TO authenticated;
                GRANT ALL ON tilt_journal TO service_role;
            `
        });

        if (tiltError) {
            const { error: directError } = await supabaseAdmin.from('tilt_journal').select('id').limit(1);
            results.tilt_journal = directError && directError.code === '42P01'
                ? { success: false, message: `Needs manual creation` }
                : { success: true, message: 'Table already exists' };
        } else {
            results.tilt_journal = { success: true, message: 'Created successfully' };
        }

        // 6. Create bankroll_history table
        const { error: bankrollError } = await supabaseAdmin.rpc('exec_sql', {
            sql: `
                CREATE TABLE IF NOT EXISTS bankroll_history (
                    id TEXT PRIMARY KEY,
                    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
                    current_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
                    history JSONB DEFAULT '[]'::jsonb,
                    stakes TEXT DEFAULT '1/2',
                    buy_ins INTEGER DEFAULT 25,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                );
                
                CREATE INDEX IF NOT EXISTS idx_bankroll_history_user_id ON bankroll_history(user_id);
                
                ALTER TABLE bankroll_history ENABLE ROW LEVEL SECURITY;
                
                DO $$ BEGIN
                    CREATE POLICY "bankroll_history_select" ON bankroll_history FOR SELECT USING (auth.uid() = user_id);
                EXCEPTION WHEN duplicate_object THEN NULL; END $$;
                
                DO $$ BEGIN
                    CREATE POLICY "bankroll_history_insert" ON bankroll_history FOR INSERT WITH CHECK (auth.uid() = user_id);
                EXCEPTION WHEN duplicate_object THEN NULL; END $$;
                
                DO $$ BEGIN
                    CREATE POLICY "bankroll_history_update" ON bankroll_history FOR UPDATE USING (auth.uid() = user_id);
                EXCEPTION WHEN duplicate_object THEN NULL; END $$;
                
                DO $$ BEGIN
                    CREATE POLICY "bankroll_history_delete" ON bankroll_history FOR DELETE USING (auth.uid() = user_id);
                EXCEPTION WHEN duplicate_object THEN NULL; END $$;
                
                GRANT ALL ON bankroll_history TO authenticated;
                GRANT ALL ON bankroll_history TO service_role;
            `
        });

        if (bankrollError) {
            const { error: directError } = await supabaseAdmin.from('bankroll_history').select('id').limit(1);
            results.bankroll_history = directError && directError.code === '42P01'
                ? { success: false, message: `Needs manual creation` }
                : { success: true, message: 'Table already exists' };
        } else {
            results.bankroll_history = { success: true, message: 'Created successfully' };
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
