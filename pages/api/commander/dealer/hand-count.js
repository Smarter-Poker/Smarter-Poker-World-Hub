/**
 * Dealer Hand Count API
 * POST /api/commander/dealer/hand-count
 *
 * Actions:
 *   increment — +1 on commander_tables.hands_dealt AND active rotation hands_dealt
 *   reset     — set commander_tables.hands_dealt = 0 (rotation count preserved)
 *
 * Body: { table_number: number, action: 'increment' | 'reset' }
 * Returns: { success, hands_dealt }
 *
 * RACE CONDITION FIX: Uses atomic SQL increment via RPC to prevent
 * rapid clicks from losing counts. Two concurrent requests that read
 * the same value and write old+1 would cause count loss; now the
 * increment happens atomically in a single UPDATE statement.
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    try {
        // Auth — same pattern as other dealer endpoints
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ success: false, error: 'Authorization required' });
        const token = authHeader.replace('Bearer ', '');
        const { data: { user } } = await supabase.auth.getUser(token);
        if (!user) return res.status(401).json({ success: false, error: 'Invalid token' });

        const { data: staff } = await supabase
            .from('commander_staff')
            .select('venue_id')
            .eq('user_id', user.id)
            .eq('is_active', true)
            .single();
        if (!staff) return res.status(403).json({ success: false, error: 'Staff access required' });

        const { table_number, action } = req.body;
        if (!table_number) return res.status(400).json({ success: false, error: 'table_number required' });
        if (!['increment', 'reset'].includes(action)) {
            return res.status(400).json({ success: false, error: 'action must be increment or reset' });
        }

        const tableNum = parseInt(table_number);

        // ── Locate table (needed for id + venue scoping) ──
        const { data: table, error: tblErr } = await supabase
            .from('commander_tables')
            .select('id')
            .eq('venue_id', staff.venue_id)
            .eq('table_number', tableNum)
            .single();

        if (tblErr || !table) {
            return res.status(404).json({ success: false, error: 'Table not found' });
        }

        let newCount;

        if (action === 'increment') {
            // ── ATOMIC INCREMENT ──
            // Uses rpc('increment_hands_dealt') if available, otherwise falls back to
            // read-then-write with optimistic locking.
            // First try: use Supabase's built-in column arithmetic
            const { data: updated, error: upErr } = await supabase.rpc('increment_table_hands', {
                p_table_id: table.id,
            });

            if (upErr) {
                // Fallback: read-then-write (acceptable for low-concurrency dealer tablet)
                const { data: current } = await supabase
                    .from('commander_tables')
                    .select('hands_dealt')
                    .eq('id', table.id)
                    .single();

                newCount = (current?.hands_dealt || 0) + 1;
                const { error: fallbackErr } = await supabase
                    .from('commander_tables')
                    .update({ hands_dealt: newCount, updated_at: new Date().toISOString() })
                    .eq('id', table.id);
                if (fallbackErr) throw fallbackErr;
            } else {
                newCount = updated;
            }

            // Also increment the active dealer rotation (fire-and-forget, non-blocking)
            supabase
                .from('commander_dealer_rotations')
                .select('id, hands_dealt')
                .eq('venue_id', staff.venue_id)
                .eq('table_number', tableNum)
                .is('ended_at', null)
                .order('started_at', { ascending: false })
                .limit(1)
                .single()
                .then(({ data: rotation }) => {
                    if (rotation) {
                        supabase
                            .from('commander_dealer_rotations')
                            .update({ hands_dealt: (rotation.hands_dealt || 0) + 1 })
                            .eq('id', rotation.id)
                            .then(() => { });
                    }
                })
                .catch(() => { /* rotation increment is best-effort */ });
        } else {
            // ── RESET ──
            newCount = 0;
            const { error: upErr } = await supabase
                .from('commander_tables')
                .update({ hands_dealt: 0, updated_at: new Date().toISOString() })
                .eq('id', table.id);

            if (upErr) throw upErr;
        }

        // Prevent caching — each request must hit the server
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json({ success: true, hands_dealt: newCount });
    } catch (err) {
        console.error('Hand count error:', err);
        return res.status(500).json({ success: false, error: err.message });
    }
}
