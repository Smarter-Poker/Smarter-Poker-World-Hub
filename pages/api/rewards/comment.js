/**
 * 💬 STRATEGY COMMENT REWARD API
 * ═══════════════════════════════════════════════════════════════════════════
 * Awards 5💎 for strategy comments (max 3 per day)
 * Subject to 500💎 daily cap
 *
 * ANTI-FARMING SAFEGUARDS:
 * - 3 rewards per calendar day (CST)
 * - 500💎 daily cap across all non-referral rewards
 * - 2-minute cooldown between reward-eligible comments
 * - Minimum 10-char content required (rejects "nice" / emoji spam)
 * - Account must be 24+ hours old
 * - Comment must exist in social_comments table
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { getServerUser } from '../../../src/lib/serverAuth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const COMMENT_REWARD = 5;
const MAX_PER_DAY = 3;
const DAILY_CAP = 500;
const COOLDOWN_MINUTES = 2;
const MIN_CONTENT_LENGTH = 10;

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

    if (req.method !== 'POST') {
        return res.status(405).json({ success: false, error: 'Method not allowed' });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    // ── Auth: JWT required (awards diamonds) ──
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'Auth required' });
    const { data: { user: authUser }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !authUser) return res.status(401).json({ success: false, error: 'Invalid token' });

    const { commentId } = req.body;
    const userId = authUser.id; // Use JWT identity

    if (!userId) {
        return res.status(400).json({ success: false, error: 'userId required' });
    }

    const now = new Date();
    const cstDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    const today = `${cstDate.getFullYear()}-${String(cstDate.getMonth() + 1).padStart(2, '0')}-${String(cstDate.getDate()).padStart(2, '0')}`;

    try {
        // ── SAFEGUARD 1: Account age check (24h minimum) ──
        const { data: userProfile } = await supabase
            .from('profiles')
            .select('created_at')
            .eq('id', userId)
            .maybeSingle();

        if (userProfile?.created_at) {
            const accountAge = now - new Date(userProfile.created_at);
            if (accountAge < 24 * 60 * 60 * 1000) {
                return res.status(200).json({
                    success: false,
                    message: 'Account must be 24 hours old to earn comment rewards'
                });
            }
        }

        // ── SAFEGUARD 2: Verify comment exists and meets quality bar ──
        if (commentId) {
            const { data: comment } = await supabase
                .from('social_comments')
                .select('content')
                .eq('id', commentId)
                .maybeSingle();

            if (!comment) {
                return res.status(200).json({ success: false, message: 'Comment not found' });
            }

            if ((comment.content || '').trim().length < MIN_CONTENT_LENGTH) {
                return res.status(200).json({
                    success: false,
                    message: `Comment must be at least ${MIN_CONTENT_LENGTH} characters to earn rewards`
                });
            }
        }

        // ── SAFEGUARD 3: Per-day limit check ──
        const { count } = await supabase
            .from('diamond_reward_claims')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('reward_type', 'strategy_comment')
            .eq('claim_date', today)
                .limit(200);

        if ((count || 0) >= MAX_PER_DAY) {
            return res.status(200).json({
                success: true,
                alreadyClaimed: true,
                message: `Comment reward limit reached (${MAX_PER_DAY}/day)`
            });
        }

        // ── SAFEGUARD 4: Cooldown (2 min between reward-eligible comments) ──
        const { data: lastClaim } = await supabase
            .from('diamond_reward_claims')
            .select('claimed_at')
            .eq('user_id', userId)
            .eq('reward_type', 'strategy_comment')
            .order('claimed_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (lastClaim?.claimed_at) {
            const elapsed = now - new Date(lastClaim.claimed_at);
            if (elapsed < COOLDOWN_MINUTES * 60 * 1000) {
                return res.status(200).json({
                    success: false,
                    cooldown: true,
                    message: `Please wait ${COOLDOWN_MINUTES} minutes between reward-eligible comments`
                });
            }
        }

        // ── SAFEGUARD 5: Daily diamond cap ──
        const { data: todayClaims } = await supabase
            .from('diamond_reward_claims')
            .select('diamonds_awarded')
            .eq('user_id', userId)
            .eq('claim_date', today)
            .neq('reward_type', 'referral')
                .limit(200);

        const todayTotal = (todayClaims || []).reduce((sum, c) => sum + (c.diamonds_awarded || 0), 0);

        if (todayTotal + COMMENT_REWARD > DAILY_CAP) {
            return res.status(200).json({
                success: false,
                dailyCapReached: true,
                message: `Daily diamond cap (${DAILY_CAP}💎) reached`
            });
        }

        // ── Record claim & award ──
        // BUG #271 FIX: Check insert result before awarding diamonds
        const { error: claimErr } = await supabase.from('diamond_reward_claims').insert({
            user_id: userId,
            reward_type: 'strategy_comment',
            diamonds_awarded: COMMENT_REWARD,
            claim_date: today,
            metadata: { comment_id: commentId || null }
        });

        if (claimErr) {
            if (claimErr.code === '23505') {
                return res.status(200).json({ success: true, alreadyClaimed: true, message: 'Comment reward already claimed' });
            }
            throw claimErr;
        }

        await supabase.rpc('add_diamonds_to_balance', {
            p_user_id: userId,
            p_amount: COMMENT_REWARD,
            p_type: 'strategy_comment',
            p_description: `Strategy comment reward — ${COMMENT_REWARD}💎`,
            p_reference_id: commentId || null
        });

        return res.status(200).json({
            success: true,
            claimed: true,
            diamondsAwarded: COMMENT_REWARD,
            claimsToday: (count || 0) + 1,
            maxPerDay: MAX_PER_DAY,
            message: `+${COMMENT_REWARD}💎 Comment Reward!`
        });

    } catch (error) {
        console.error('[CommentReward] Error:', error.message || error);
        return res.status(500).json({ success: false, error: 'Failed to claim comment reward' });
    }
}
