// Add actor_id column to notifications table and populate it
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    const sb = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const steps = [];

    // Step 1: Check if actor_id column exists by getting a notification
    const { data: testNotification, error: testError } = await sb
        .from('notifications')
        .select('*')
        .limit(1)
        .single();

    steps.push({
        step: 1,
        action: 'Check notification structure',
        columns: testNotification ? Object.keys(testNotification) : [],
        hasActorId: testNotification ? 'actor_id' in testNotification : false
    });

    // Step 2: Get all notifications
    const { data: notifications } = await sb
        .from('notifications')
        .select('*')
        .limit(50);

    steps.push({
        step: 2,
        action: 'Fetched notifications',
        count: notifications?.length || 0
    });

    // Step 3: Get all profiles with avatar_url
    const { data: profiles } = await sb
        .from('profiles')
        .select('id, full_name, username, avatar_url');

    const profileByName = {};
    (profiles || []).forEach(p => {
        if (p.full_name) profileByName[p.full_name.toLowerCase()] = p;
    });

    steps.push({
        step: 3,
        action: 'Built profile lookup map',
        profileCount: profiles?.length || 0,
        sampleNames: Object.keys(profileByName).slice(0, 5)
    });

    // Step 4: Parse notification titles and find matching profiles
    const matches = [];
    for (const n of (notifications || [])) {
        // Parse name from title like "Lauren Garcia commented on your post"
        const match = n.title?.match(/^([A-Za-z]+\s+[A-Za-z]+)/);
        if (match) {
            const fullName = match[1].toLowerCase();
            const profile = profileByName[fullName];
            matches.push({
                notificationId: n.id,
                title: n.title,
                parsedName: match[1],
                matchedProfile: profile ? { id: profile.id, avatar: !!profile.avatar_url } : null
            });
        }
    }

    steps.push({
        step: 4,
        action: 'Parsed notification titles',
        matches: matches
    });

    res.json({ steps });
}
