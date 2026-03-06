/**
 * 🛡️ ANTI-ABUSE ADMIN API
 * GET /api/admin/anti-abuse — Returns abuse log, audit log, alerts, and economy data
 * Used by the /horses Anti-Abuse dashboard tab
 */
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    // Auth check
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Auth required' });
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const section = req.query.section || 'all';

    try {
        const result = {};

        // ── ABUSE LOG ──
        if (section === 'all' || section === 'abuse') {
            const { data: abuseLog } = await supabaseAdmin
                .from('signup_abuse_log')
                .select('*')
                .order('last_signup_at', { ascending: false })
                .limit(100);

            // Stats
            const totalSignups = abuseLog?.length || 0;
            const blocked = abuseLog?.filter(a => a.deleted_account_count > 0 || (a.abuse_flags && a.abuse_flags.length > 0)).length || 0;
            const disposable = abuseLog?.filter(a => {
                const flags = a.abuse_flags || [];
                return flags.some(f => f.reason?.includes('disposable'));
            }).length || 0;

            // Top IPs
            const ipCounts = {};
            abuseLog?.forEach(entry => {
                if (entry.ip_address && entry.ip_address !== 'unknown') {
                    ipCounts[entry.ip_address] = (ipCounts[entry.ip_address] || 0) + 1;
                }
            });
            const topIPs = Object.entries(ipCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([ip, count]) => ({ ip, count }));

            result.abuse = {
                log: abuseLog || [],
                stats: { totalSignups, blocked, disposable },
                topIPs,
            };
        }

        // ── ADMIN AUDIT LOG ──
        if (section === 'all' || section === 'audit') {
            const { data: auditLog } = await supabaseAdmin
                .from('admin_audit_log')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(50);

            result.audit = auditLog || [];
        }

        // ── DIAMOND ECONOMY ──
        if (section === 'all' || section === 'economy') {
            // Diamond source breakdown
            const { data: transactions } = await supabaseAdmin
                .from('diamond_transactions')
                .select('transaction_type, amount')
                .limit(5000);

            const sourceBreakdown = {};
            let totalGranted = 0;
            let totalSpent = 0;

            (transactions || []).forEach(tx => {
                const type = tx.transaction_type || 'unknown';
                sourceBreakdown[type] = (sourceBreakdown[type] || 0) + Math.abs(tx.amount);
                if (tx.amount > 0) totalGranted += tx.amount;
                else totalSpent += Math.abs(tx.amount);
            });

            // Top diamond holders
            const { data: topHolders } = await supabaseAdmin
                .from('profiles')
                .select('id, username, email, diamonds, is_vip, vip_tier, phone_verified')
                .order('diamonds', { ascending: false })
                .limit(20);

            result.economy = {
                sourceBreakdown,
                totalGranted,
                totalSpent,
                topHolders: topHolders || [],
            };
        }

        // ── RECENT ALERTS (abuse events in last 24h) ──
        if (section === 'all' || section === 'alerts') {
            const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

            const { data: recentAbuse } = await supabaseAdmin
                .from('signup_abuse_log')
                .select('*')
                .gt('last_signup_at', twentyFourHoursAgo)
                .order('last_signup_at', { ascending: false });

            const alerts = (recentAbuse || [])
                .filter(a => a.abuse_flags && a.abuse_flags.length > 0)
                .map(a => ({
                    id: a.id,
                    email: a.raw_email,
                    ip: a.ip_address,
                    reason: a.abuse_flags[a.abuse_flags.length - 1]?.reason || 'Unknown',
                    at: a.last_signup_at,
                    deletions: a.deleted_account_count,
                }));

            result.alerts = alerts;
        }

        return res.status(200).json({ success: true, ...result });
    } catch (err) {
        console.error('[Anti-Abuse API] Error:', err);
        return res.status(500).json({ error: 'Server error' });
    }
}
