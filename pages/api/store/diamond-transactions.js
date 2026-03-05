/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  GET /api/store/diamond-transactions
 *  Returns the authenticated user's diamond transaction history
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Authenticate user from Authorization header
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Authorization required' });
        }

        const token = authHeader.replace('Bearer ', '');
        const { data: { user }, error: authError } = await supabase.auth.getUser(token);

        if (authError || !user) {
            return res.status(401).json({ error: 'Invalid session' });
        }

        // Parse query params
        const limit = Math.min(parseInt(req.query.limit) || 50, 100);
        const offset = parseInt(req.query.offset) || 0;
        const type = req.query.type; // optional filter

        // Build query
        let query = supabase
            .from('diamond_transactions')
            .select('*', { count: 'exact' })
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (type && type !== 'all') {
            // BUG #270 FIX: Sanitize type to prevent PostgREST filter injection
            const safeType = type.replace(/[,().]/g, '');
            if (safeType) {
                query = query.or(`transaction_type.eq.${safeType},type.eq.${safeType}`)
                    .limit(100);
            }
        }

        const { data, count, error } = await query;

        if (error) {
            console.error('Transaction fetch error:', error);
            return res.status(500).json({ error: 'Failed to fetch transactions' });
        }

        // Also get current balance
        const { data: profile } = await supabase
            .from('profiles')
            .select('diamonds')
            .eq('id', user.id)
            .single();

        return res.status(200).json({
            success: true,
            transactions: data || [],
            total: count || 0,
            balance: profile?.diamonds || 0,
            limit,
            offset,
        });
    } catch (err) {
        console.error('Diamond transactions error:', err);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
