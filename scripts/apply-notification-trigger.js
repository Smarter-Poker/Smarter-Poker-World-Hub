#!/usr/bin/env node
/**
 * Apply Notification Trigger Fix via Supabase RPC
 */
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TRIGGER_SQL = `
-- Fix the friend request notification trigger
CREATE OR REPLACE FUNCTION public.fn_notify_friend_request()
RETURNS TRIGGER AS $$
DECLARE
    sender_name TEXT;
BEGIN
    SELECT COALESCE(full_name, username, 'Someone') INTO sender_name
    FROM public.profiles WHERE id = NEW.user_id;
    
    INSERT INTO public.notifications (user_id, type, title, message, data)
    VALUES (
        NEW.friend_id,
        CASE WHEN NEW.status = 'pending' THEN 'friend_request' ELSE 'friend_accept' END,
        sender_name,
        CASE WHEN NEW.status = 'pending'
            THEN 'sent you a friend request'
            ELSE 'accepted your friend request'
        END,
        jsonb_build_object(
            'sender_id', NEW.user_id,
            'friendship_id', NEW.id,
            'sender_name', sender_name
        )
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
`;

async function run() {
    console.log('🔧 Applying notification trigger fix...\n');

    // Try via RPC first
    const { data, error } = await supabase.rpc('pgmigrate', { sql_text: TRIGGER_SQL });

    if (error) {
        console.log('RPC pgmigrate not available, trying direct approach...');
        console.log('Error:', error.message);

        // Alternative: Use Supabase Management API or output SQL
        console.log('\n📋 SQL to apply manually:');
        console.log('='.repeat(60));
        console.log(TRIGGER_SQL);
        console.log('='.repeat(60));
        return;
    }

    console.log('✅ Trigger updated successfully!');

    // Verify by checking a sample notification
    const { data: sample } = await supabase
        .from('notifications')
        .select('title, message, type')
        .eq('type', 'friend_request')
        .limit(5);

    console.log('\n📊 Sample notifications after fix:');
    (sample || []).forEach(n => {
        console.log(`  "${n.title} ${n.message}" (${n.type})`);
    });
}

run().catch(e => console.error('Error:', e));
