/**
 * 📊 BANKROLL EXPORT API
 * ═══════════════════════════════════════════════════════════════════════════
 * Generate CSV or JSON export of ledger data (on-demand, user-initiated only)
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { userId, format = 'csv', dateRange } = req.body;

    if (!userId) {
        return res.status(400).json({ error: 'userId required' });
    }

    try {
        // Build query
        let query = supabase
            .from('bankroll_ledger')
            .select(`
                id,
                entry_date,
                category,
                gross_in,
                gross_out,
                tips,
                comps,
                notes,
                location_id,
                start_time,
                end_time,
                created_at
            `)
            .eq('user_id', userId)
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
            console.error('[Export] Error:', error);
            return res.status(500).json({ error: error.message });
        }

        if (!entries || entries.length === 0) {
            return res.status(200).json({
                success: false,
                message: 'No entries to export'
            });
        }

        // Transform entries
        const exportData = entries.map(entry => {
            const netPL = (entry.gross_out || 0) - (entry.gross_in || 0);
            return {
                date: entry.entry_date,
                category: entry.category || 'Other',
                buy_in: entry.gross_in || 0,
                cash_out: entry.gross_out || 0,
                net_pl: netPL,
                tips: entry.tips || 0,
                comps: entry.comps || 0,
                start_time: entry.start_time || '',
                end_time: entry.end_time || '',
                notes: entry.notes || ''
            };
        });

        // Calculate summary stats
        const totalIn = exportData.reduce((sum, e) => sum + e.buy_in, 0);
        const totalOut = exportData.reduce((sum, e) => sum + e.cash_out, 0);
        const netPL = totalOut - totalIn;
        const totalTips = exportData.reduce((sum, e) => sum + e.tips, 0);
        const totalComps = exportData.reduce((sum, e) => sum + e.comps, 0);

        if (format === 'csv') {
            // Generate CSV
            const headers = [
                'Date',
                'Category',
                'Buy-In',
                'Cash-Out',
                'Net P/L',
                'Tips',
                'Comps',
                'Start Time',
                'End Time',
                'Notes'
            ];

            const rows = exportData.map(e => [
                e.date,
                e.category,
                e.buy_in,
                e.cash_out,
                e.net_pl,
                e.tips,
                e.comps,
                e.start_time,
                e.end_time,
                `"${(e.notes || '').replace(/"/g, '""')}"`
            ]);

            // Add summary row
            rows.push([]);
            rows.push(['SUMMARY']);
            rows.push(['Total Sessions', entries.length]);
            rows.push(['Total Buy-Ins', totalIn]);
            rows.push(['Total Cash-Outs', totalOut]);
            rows.push(['Net P/L', netPL]);
            rows.push(['Total Tips', totalTips]);
            rows.push(['Total Comps', totalComps]);

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
                    netPL,
                    tips: totalTips,
                    comps: totalComps
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
                tips: totalTips,
                comps: totalComps,
                dateRange: {
                    earliest: entries[entries.length - 1]?.entry_date,
                    latest: entries[0]?.entry_date
                }
            }
        });

    } catch (error) {
        console.error('[Export] Server error:', error);
        return res.status(500).json({ error: 'Export failed' });
    }
}
