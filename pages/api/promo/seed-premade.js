/**
 * Seed Pre-Made Promotions
 * POST /api/promo/seed-premade — Creates 25 high-quality pre-made promo codes
 * Owner/Manager only. Each promo has a configurable code name and max reuses.
 * Only creates promos that don't already exist (idempotent).
 */
import { createClient } from '@supabase/supabase-js';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 25 High-quality pre-made promotions for poker rooms
const PREMADE_PROMOS = [
    // Welcome & New Player (5)
    { code: 'WELCOME50', description: 'Welcome Bonus — 50 Diamonds for new players', reward_type: 'signup_bonus', reward_value: 50, max_uses: 500 },
    { code: 'FIRSTHOUR', description: 'First Hour Free — waive 1hr time charge for new members', reward_type: 'time_credit', reward_value: 60, max_uses: 200 },
    { code: 'NEWMEMBER', description: 'New Member Special — 100 bonus Diamonds on first membership', reward_type: 'signup_bonus', reward_value: 100, max_uses: 300 },
    { code: 'TRYNOW', description: 'Try The Room — 30 min free time for walk-ins', reward_type: 'time_credit', reward_value: 30, max_uses: 100 },
    { code: 'BRINGAFRIEND', description: 'Bring A Friend — both get 25 Diamonds', reward_type: 'referral_bonus', reward_value: 25, max_uses: 500 },

    // Loyalty & Retention (5)
    { code: 'COMEBACK25', description: 'Come Back Bonus — 25 Diamonds for returning players (30+ days)', reward_type: 'retention_bonus', reward_value: 25, max_uses: 200 },
    { code: 'VIP100', description: 'VIP Reward — 100 Diamonds for VIP members', reward_type: 'vip_reward', reward_value: 100, max_uses: 50 },
    { code: 'LOYAL50', description: 'Loyalty Bonus — 50 Diamonds after 10th visit', reward_type: 'loyalty_bonus', reward_value: 50, max_uses: 300 },
    { code: 'WEEKLYGRIND', description: 'Weekly Grinder — 75 Diamonds for 5+ sessions in a week', reward_type: 'loyalty_bonus', reward_value: 75, max_uses: 100 },
    { code: 'ANNIVERSARY', description: 'Anniversary Bonus — 200 Diamonds on membership anniversary', reward_type: 'anniversary', reward_value: 200, max_uses: 500 },

    // Tournament Specials (5)
    { code: 'FREEENTRY', description: 'Free Tournament Entry — one free tourney registration', reward_type: 'tournament_credit', reward_value: 1, max_uses: 50 },
    { code: 'REBUY50', description: 'Rebuy Discount — 50 Diamond rebuy bonus', reward_type: 'tournament_credit', reward_value: 50, max_uses: 100 },
    { code: 'SATNIGHT', description: 'Saturday Night Special — double Diamond earnings on tourney', reward_type: 'multiplier', reward_value: 2, max_uses: 100 },
    { code: 'CHAMPBONUS', description: 'Champion Bonus — extra 150 Diamonds for tournament winner', reward_type: 'tournament_credit', reward_value: 150, max_uses: 50 },
    { code: 'FINALTABLE', description: 'Final Table Bonus — 50 Diamonds for making final table', reward_type: 'tournament_credit', reward_value: 50, max_uses: 200 },

    // Time & Session Deals (5)
    { code: 'HAPPYHOUR', description: 'Happy Hour — 2 hours for the price of 1 (off-peak)', reward_type: 'time_credit', reward_value: 60, max_uses: 200 },
    { code: 'MARATHON', description: 'Marathon Session — bonus hour after 4+ hours played', reward_type: 'time_credit', reward_value: 60, max_uses: 100 },
    { code: 'EARLYBIRD', description: 'Early Bird — free 30 min for arriving before noon', reward_type: 'time_credit', reward_value: 30, max_uses: 300 },
    { code: 'LATENIGHT', description: 'Late Night Owl — 50% more time after midnight', reward_type: 'time_credit', reward_value: 30, max_uses: 200 },
    { code: 'WEEKDAY20', description: 'Weekday Special — 20% off time during Mon-Thu', reward_type: 'discount_percent', reward_value: 20, max_uses: 500 },

    // Seasonal & Event (5)
    { code: 'NEWYEAR100', description: 'New Year Celebration — 100 bonus Diamonds', reward_type: 'event_bonus', reward_value: 100, max_uses: 200 },
    { code: 'HOLIDAY75', description: 'Holiday Special — 75 Diamonds during holiday season', reward_type: 'event_bonus', reward_value: 75, max_uses: 300 },
    { code: 'GRANDOPEN', description: 'Grand Opening — 150 Diamonds for first 100 players', reward_type: 'event_bonus', reward_value: 150, max_uses: 100 },
    { code: 'SUPERBOWL', description: 'Super Bowl Special — double Diamonds during the big game', reward_type: 'multiplier', reward_value: 2, max_uses: 200 },
    { code: 'BIRTHDAY50', description: 'Birthday Bonus — 50 free Diamonds on your birthday', reward_type: 'birthday', reward_value: 50, max_uses: 500 },
];

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });

    // Auth check
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ success: false, error: 'Unauthorized' });

    // Verify user is owner or manager
    const { data: staff } = await supabaseAdmin
        .from('commander_staff')
        .select('id, role, venue_id')
        .eq('user_id', user.id)
        .in('role', ['owner', 'manager'])
        .eq('is_active', true)
        .limit(1)
        .single();

    if (!staff) {
        return res.status(403).json({ success: false, error: 'Only owners and managers can seed promo codes' });
    }

    try {
        // Check existing codes to avoid duplicates
        const { data: existing } = await supabaseAdmin
            .from('promo_codes')
            .select('code');
        const existingCodes = new Set((existing || []).map(c => c.code));

        const toInsert = PREMADE_PROMOS
            .filter(p => !existingCodes.has(p.code))
            .map(p => ({
                ...p,
                is_active: false, // Owner must manually activate each one
                created_at: new Date().toISOString(),
            }));

        if (toInsert.length === 0) {
            return res.status(200).json({ success: true, message: 'All 25 promotions already exist', created: 0 });
        }

        const { data, error } = await supabaseAdmin
            .from('promo_codes')
            .insert(toInsert)
            .select();

        if (error) throw error;

        return res.status(201).json({
            success: true,
            message: `Created ${data.length} pre-made promotions`,
            created: data.length,
            promos: data.map(p => ({ code: p.code, description: p.description })),
        });
    } catch (err) {
        console.error('Seed promos error:', err);
        return res.status(500).json({ success: false, error: 'Failed to seed promotions' });
    }
}
