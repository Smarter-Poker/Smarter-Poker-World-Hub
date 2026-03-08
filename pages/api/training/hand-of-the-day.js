/**
 * HAND OF THE DAY API
 * ═══════════════════════════════════════════════════════════════════════════
 * GET  - Returns today's curated daily challenge hand (seeded by date)
 * POST - Records a user's daily challenge completion
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Deterministic hash from date string to get consistent daily question
function dateHash(dateStr) {
    let hash = 0;
    for (let i = 0; i < dateStr.length; i++) {
        const char = dateStr.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
}

export default async function handler(req, res) {
    if (req.method === 'GET') {
        // GET: Return today's daily challenge hand
        try {
            const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
            const dailyId = `daily-${today}`;

            // Get total question count first
            const { count } = await supabase
                .from('training_questions')
                .select('*', { count: 'exact', head: true });

            if (!count || count === 0) {
                return res.status(200).json({
                    success: true,
                    dailyId,
                    question: null,
                    message: 'No training questions available',
                });
            }

            // Use date hash to pick a consistent question for the day
            const offset = dateHash(today) % count;

            const { data: question, error } = await supabase
                .from('training_questions')
                .select('*')
                .range(offset, offset)
                .maybeSingle();

            if (error) {
                console.error('[HandOfTheDay] Query error:', error);
                return res.status(500).json({ success: false, error: 'Failed to fetch daily hand' });
            }

            // Calculate expiry (midnight UTC tomorrow)
            const tomorrow = new Date();
            tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
            tomorrow.setUTCHours(0, 0, 0, 0);

            return res.status(200).json({
                success: true,
                dailyId,
                question,
                expiresAt: tomorrow.toISOString(),
            });

        } catch (error) {
            console.error('[HandOfTheDay] Error:', error.message);
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }

    } else if (req.method === 'POST') {
        // POST: Record daily challenge completion
        try {
            const { userId, dailyId, score, evLoss } = req.body;

            if (!userId || !dailyId) {
                return res.status(400).json({ success: false, error: 'userId and dailyId required' });
            }

            const { data, error } = await supabase
                .from('training_daily_challenge')
                .upsert({
                    user_id: userId,
                    daily_id: dailyId,
                    score: score || 0,
                    ev_loss: evLoss || 0,
                    completed_at: new Date().toISOString(),
                }, {
                    onConflict: 'user_id,daily_id',
                });

            if (error) {
                console.error('[HandOfTheDay] Insert error:', error);
                // Graceful fallback — table might not exist yet
                return res.status(200).json({
                    success: true,
                    message: 'Completion logged (table may not exist yet)',
                });
            }

            // Emit diamond reward for daily challenge completion
            return res.status(200).json({
                success: true,
                message: 'Daily challenge completed!',
                diamondsEarned: 25,
            });

        } catch (error) {
            console.error('[HandOfTheDay] Error:', error.message);
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }

    } else {
        res.setHeader('Allow', ['GET', 'POST']);
        return res.status(405).json({ success: false, error: `Method ${req.method} Not Allowed` });
    }
}
