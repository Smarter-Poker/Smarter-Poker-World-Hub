/* ═══════════════════════════════════════════════════════════════════════════
   ONESIGNAL — IMPORT USERS FROM SUPABASE
   POST /api/notifications/import-users
   
   Imports existing users from Supabase profiles to OneSignal as external users
   ═══════════════════════════════════════════════════════════════════════════ */

import { createClient } from '@supabase/supabase-js';

const ONESIGNAL_APP_ID = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Simple auth check - require a secret header for admin endpoints
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${ONESIGNAL_REST_API_KEY?.slice(0, 20)}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
        return res.status(500).json({ error: 'OneSignal not configured' });
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
        return res.status(500).json({ error: 'Supabase not configured' });
    }

    try {
        // Create Supabase admin client
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

        // Fetch all users from profiles
        const { data: users, error: fetchError } = await supabase
            .from('profiles')
            .select('id, username, email, player_number, skill_tier, state, created_at')
            .order('player_number', { ascending: true });

        if (fetchError) {
            throw new Error(`Failed to fetch users: ${fetchError.message}`);
        }

        console.log(`Found ${users.length} users to import`);

        // Import users to OneSignal in batches
        const batchSize = 100;
        const imported = [];
        const errors = [];

        for (let i = 0; i < users.length; i += batchSize) {
            const batch = users.slice(i, i + batchSize);

            for (const user of batch) {
                try {
                    // Create/update user in OneSignal
                    const response = await fetch(`https://onesignal.com/api/v1/players`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`,
                        },
                        body: JSON.stringify({
                            app_id: ONESIGNAL_APP_ID,
                            device_type: 5, // Web push
                            external_user_id: user.id,
                            tags: {
                                username: user.username || '',
                                email: user.email || '',
                                player_number: user.player_number?.toString() || '',
                                skill_tier: user.skill_tier || 'Newcomer',
                                state: user.state || '',
                                registered: 'true',
                            },
                        }),
                    });

                    const result = await response.json();

                    if (response.ok) {
                        imported.push({
                            userId: user.id,
                            username: user.username,
                            oneSignalId: result.id,
                        });
                    } else {
                        errors.push({
                            userId: user.id,
                            username: user.username,
                            error: result.errors?.[0] || 'Unknown error',
                        });
                    }
                } catch (err) {
                    errors.push({
                        userId: user.id,
                        username: user.username,
                        error: err.message,
                    });
                }
            }

            // Small delay between batches to avoid rate limiting
            if (i + batchSize < users.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        console.log(`Import complete: ${imported.length} success, ${errors.length} errors`);

        return res.status(200).json({
            success: true,
            totalUsers: users.length,
            imported: imported.length,
            errors: errors.length,
            errorDetails: errors.slice(0, 10), // Only return first 10 errors
        });

    } catch (error) {
        console.error('Import users error:', error);
        return res.status(500).json({ error: error.message });
    }
}
