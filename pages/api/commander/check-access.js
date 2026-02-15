/**
 * Check if the logged-in user has Commander access (staff or subscription)
 * Uses service role key to bypass RLS — called by WorldHub to detect Commander accounts
 * Returns { hasAccess: true/false, staff: {...} } 
 */
import { createClient } from '@supabase/supabase-js';
import { createPagesServerClient } from '@supabase/auth-helpers-nextjs';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Get the logged-in user from the session cookie
        const supabaseServerClient = createPagesServerClient({ req, res });
        const { data: { user } } = await supabaseServerClient.auth.getUser();

        if (!user) {
            return res.status(200).json({ hasAccess: false });
        }

        // Check 1: commander_staff table (staff members: owner, manager, floor, etc.)
        const { data: staffRecords, error: staffError } = await supabase
            .from('commander_staff')
            .select('id, venue_id, role, poker_venues(id, name)')
            .eq('user_id', user.id)
            .eq('is_active', true)
            .limit(1);

        if (!staffError && staffRecords && staffRecords.length > 0) {
            const record = staffRecords[0];
            return res.status(200).json({
                hasAccess: true,
                staff: {
                    user_id: user.id,
                    id: record.id,
                    venue_id: record.venue_id,
                    role: record.role,
                    venue_name: record.poker_venues?.name || 'My Venue',
                },
            });
        }

        // Check 2: commander_subscriptions table (venue owners with active/trialing subscription)
        const { data: subs, error: subError } = await supabase
            .from('commander_subscriptions')
            .select('id, venue_id, billing_name, status, venue:poker_venues(id, name)')
            .eq('owner_id', user.id)
            .in('status', ['active', 'trialing'])
            .limit(1);

        if (!subError && subs && subs.length > 0) {
            const sub = subs[0];
            return res.status(200).json({
                hasAccess: true,
                staff: {
                    user_id: user.id,
                    role: 'owner',
                    venue_id: sub.venue_id,
                    venue_name: sub.venue?.name || 'My Venue',
                    display_name: sub.billing_name || user.email,
                },
            });
        }

        // No access found
        return res.status(200).json({ hasAccess: false });
    } catch (err) {
        console.error('[check-access] Error:', err);
        return res.status(200).json({ hasAccess: false }); // Fail open — don't block the Hub
    }
}
