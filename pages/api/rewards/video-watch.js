/**
 * 📺 VIDEO WATCH REWARD API
 * ═══════════════════════════════════════════════════════════════════════════
 * Awards 3💎 for watching 5+ minutes of a video (max 5 per day)
 *
 * ANTI-FARMING SAFEGUARDS:
 * - Must watch 5+ minutes (300s), verified via video_watch_history
 * - 5 unique videos per day max
 * - Same video can only earn once
 * - 500💎 daily cap
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '@supabase/supabase-js';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const WATCH_REWARD = 3;
const MAX_PER_DAY = 5;
const MIN_WATCH_SECONDS = 300;
const DAILY_CAP = 500;

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    // ── Auth: JWT required (awards diamonds) ──
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Auth required' });
    const { data: { user: authUser }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !authUser) return res.status(401).json({ error: 'Invalid token' });

    const { videoId } = req.body;
    const userId = authUser.id; // Use JWT identity

    if (!userId || !videoId) {
        return res.status(400).json({ error: 'userId and videoId required' });
    }

    const now = new Date();
    const cstDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    const today = `${cstDate.getFullYear()}-${String(cstDate.getMonth() + 1).padStart(2, '0')}-${String(cstDate.getDate()).padStart(2, '0')}`;

    try {
        // SAFEGUARD 1: Verify watch time >= 5 min
        const { data: watchRecord } = await supabase
            .from('video_watch_history')
            .select('watch_duration_seconds')
            .eq('user_id', userId)
            .eq('video_id', videoId)
            .maybeSingle();

        if (!watchRecord || (watchRecord.watch_duration_seconds || 0) < MIN_WATCH_SECONDS) {
            return res.status(200).json({ success: false, message: `Must watch at least ${MIN_WATCH_SECONDS / 60} minutes` });
        }

        // SAFEGUARD 2: Already claimed for this video (lifetime)
        const { data: videoClaim } = await supabase
            .from('diamond_reward_claims')
            .select('id')
            .eq('user_id', userId)
            .eq('reward_type', 'video_watch')
            .contains('metadata', { video_id: videoId })
            .maybeSingle();

        if (videoClaim) {
            return res.status(200).json({ success: true, alreadyClaimed: true, message: 'Already earned for this video' });
        }

        // SAFEGUARD 3: Daily limit
        const { count } = await supabase
            .from('diamond_reward_claims')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('reward_type', 'video_watch')
            .eq('claim_date', today);

        if ((count || 0) >= MAX_PER_DAY) {
            return res.status(200).json({ success: true, alreadyClaimed: true, message: `Video watch limit (${MAX_PER_DAY}/day) reached` });
        }

        // SAFEGUARD 4: Daily cap
        const { data: todayClaims } = await supabase
            .from('diamond_reward_claims')
            .select('diamonds_awarded')
            .eq('user_id', userId)
            .eq('claim_date', today)
            .neq('reward_type', 'referral');

        const todayTotal = (todayClaims || []).reduce((sum, c) => sum + (c.diamonds_awarded || 0), 0);
        if (todayTotal + WATCH_REWARD > DAILY_CAP) {
            return res.status(200).json({ success: false, dailyCapReached: true });
        }

        // Record & award
        // BUG #271 FIX: Check insert result before awarding diamonds
        const { error: claimErr } = await supabase.from('diamond_reward_claims').insert({
            user_id: userId,
            reward_type: 'video_watch',
            diamonds_awarded: WATCH_REWARD,
            claim_date: today,
            metadata: { video_id: videoId, watch_seconds: watchRecord.watch_duration_seconds }
        });

        if (claimErr) {
            if (claimErr.code === '23505') {
                return res.status(200).json({ success: true, alreadyClaimed: true });
            }
            throw claimErr;
        }

        await supabase.rpc('add_diamonds_to_balance', {
            p_user_id: userId,
            p_amount: WATCH_REWARD,
            p_type: 'video_watch',
            p_description: `Video watch reward — ${WATCH_REWARD}💎`,
            p_reference_id: videoId
        });

        return res.status(200).json({ success: true, claimed: true, diamondsAwarded: WATCH_REWARD });

    } catch (error) {
        console.error('[VideoWatchReward] Error:', error.message || error);
        return res.status(500).json({ error: 'Failed to claim video watch reward' });
    }
}
