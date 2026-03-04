/**
 * BANKROLL EXPORT API
 * Generate CSV or JSON export of ledger data (on-demand, user-initiated only)
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // BUG #249 FIX: Require JWT auth — prevent IDOR on bankroll data
  const _token = req.headers.authorization?.replace('Bearer ', '');
  if (!_token) return res.status(401).json({ error: 'Auth required' });
  const { data: { user: _authUser }, error: _authErr } = await supabase.auth.getUser(_token);
  if (_authErr || !_authUser) return res.status(401).json({ error: 'Invalid token' });

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { format = 'csv', dateRange } = req.body;

    // BUG #239 FIX: Use JWT user_id, not client-submitted userId (IDOR prevention)
    const userId = _authUser.id;

    try {
        // Build query — use select('*') to match working selectors pattern
        let query = supabase
            .from('bankroll_ledger')
            .select('*')
            .eq('user_id', userId)
            .eq('is_revision', false)
            .order('entry_date', { ascending: false });

        // Apply date range filter
        if (dateRange?.start) {
            query = query.gte('entry_date', dateRange.start);
        }
        if (dateRange?.end) {
            query = query.lte('entry_date', dateRange.end);
        }

        const { data: entries, error } = await query;

        if (error) {
            console.error('[Export] Supabase error:', error);
            return res.status(500).json({ success: false, error: error.message });
        }

        if (!entries || entries.length === 0) {
            return res.status(200).json({
                success: false,
                message: 'No entries to export'
            });
        }

        // Transform entries — use only columns that exist in the table
        const exportData = entries.map(entry => {
            const netPL = (entry.gross_out || 0) - (entry.gross_in || 0);
            return {
                date: entry.entry_date,
                category: entry.category || 'Other',
                buy_in: entry.gross_in || 0,
                cash_out: entry.gross_out || 0,
                net_pl: netPL,
                stakes: entry.stakes || '',
                game_type: entry.game_type || '',
                tournament_name: entry.tournament_name || '',
                start_time: entry.start_time || '',
                end_time: entry.end_time || '',
                emotional_tag: entry.emotional_tag || '',
                notes: entry.notes || ''
            };
        });

        // Calculate summary stats
        const totalIn = exportData.reduce((sum, e) => sum + e.buy_in, 0);
        const totalOut = exportData.reduce((sum, e) => sum + e.cash_out, 0);
        const netPL = totalOut - totalIn;

        if (format === 'csv') {
            // Generate CSV
            const headers = [
                'Date',
                'Category',
                'Buy-In',
                'Cash-Out',
                'Net P/L',
                'Stakes',
                'Game Type',
                'Tournament',
                'Start Time',
                'End Time',
                'Mood',
                'Notes'
            ];

            const rows = exportData.map(e => [
                e.date,
                e.category,
                e.buy_in,
                e.cash_out,
                e.net_pl,
                e.stakes,
                e.game_type,
                e.tournament_name,
                e.start_time,
                e.end_time,
                e.emotional_tag,
                `"${(e.notes || '').replace(/"/g, '""')}"`
            ]);

            // Add summary row
            rows.push([]);
            rows.push(['SUMMARY']);
            rows.push(['Total Sessions', entries.length]);
            rows.push(['Total Buy-Ins', totalIn]);
            rows.push(['Total Cash-Outs', totalOut]);
            rows.push(['Net P/L', netPL]);

            const csvContent = [
                headers.join(','),
                ...rows.map(r => r.join(','))
            ].join('\n');

            return res.status(200).json({
                success: true,
                format: 'csv',
                filename: `bankroll_export_${new Date().toISOString().split('T')[0]}.csv`,
                content: csvContent,
                summary: {
                    sessions: entries.length,
                    totalIn,
                    totalOut,
                    netPL
                }
            });
        }

        // JSON format
        return res.status(200).json({
            success: true,
            format: 'json',
            filename: `bankroll_export_${new Date().toISOString().split('T')[0]}.json`,
            data: exportData,
            summary: {
                sessions: entries.length,
                totalIn,
                totalOut,
                netPL,
                dateRange: {
                    earliest: entries[entries.length - 1]?.entry_date,
                    latest: entries[0]?.entry_date
                }
            }
        });

    } catch (error) {
        console.error('[Export] Server error:', error);
        return res.status(500).json({ success: false, error: 'Export failed' });
    }
}
