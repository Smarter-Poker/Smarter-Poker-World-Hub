/**
 * POST /api/club-arena/create-table
 * Create a new poker table in a club.
 * Auth: Bearer token (owner or admin only)
 */
import { createClient } from '@supabase/supabase-js';

const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const VALID_VARIANTS = ['nlh', 'flh', 'plo4', 'plo5', 'plo6', 'plo8', 'short_deck', 'flo', 'mixed', 'ofc'];
const VALID_GAME_TYPES = ['cash', 'tournament', 'sng'];

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'POST only' });

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ success: false, error: 'No auth token' });

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ success: false, error: 'Invalid token' });

    const { clubId, name, variant, gameType, smallBlind, bigBlind, maxPlayers, minBuyIn, maxBuyIn, ante, actionTime, settings } = req.body;
    if (!clubId) return res.status(400).json({ success: false, error: 'clubId required' });

    try {
        // Verify role
        const { data: member } = await supabaseAdmin
            .from('club_members')
            .select('role')
            .eq('club_id', clubId)
            .eq('user_id', user.id)
            .single();

        if (!member || !['owner', 'admin'].includes(member.role)) {
            // Union admin fallback
            const { data: clubInfo } = await supabaseAdmin.from('clubs').select('union_id').eq('id', clubId).single();
            let unionAuth = false;
            if (clubInfo?.union_id) {
                const { data: ua } = await supabaseAdmin.from('union_admins').select('role').eq('union_id', clubInfo.union_id).eq('user_id', user.id).single();
                unionAuth = !!ua;
            }
            if (!unionAuth) {
                return res.status(403).json({ success: false, error: 'Only owners, admins, or union admins can create tables' });
            }
        }

        // Validate inputs
        const sb = parseFloat(smallBlind) || 1;
        const bb = parseFloat(bigBlind) || 2;
        const seats = Math.min(Math.max(parseInt(maxPlayers) || 9, 2), 10);
        const gv = VALID_VARIANTS.includes(variant) ? variant : 'nlh';
        const gt = VALID_GAME_TYPES.includes(gameType) ? gameType : 'cash';

        // Auto-fill rake/BBJ from tier config based on stakes
        const { getRakeConfig, findScheduleMatch, getAllowedStakes } = require('../../../src/lib/poker-engine/RakeConfig');
        const tierConfig = getRakeConfig(bb, gv, sb);

        // Validate stakes against official schedule for cash games
        if (gt === 'cash') {
            const scheduleMatch = findScheduleMatch(sb, bb);
            if (!scheduleMatch) {
                const allowed = getAllowedStakes().map(s => s.label).join(', ');
                return res.status(400).json({
                    success: false, error: `Invalid stakes ${sb}/${bb}. Allowed cash game stakes: ${allowed}`,
                });
            }
        }

        // Buy-in defaults: min=40BB, max=200BB (or custom)
        const resolvedMinBuyIn = minBuyIn ? parseFloat(minBuyIn) : bb * 40;
        const resolvedMaxBuyIn = maxBuyIn ? parseFloat(maxBuyIn) : bb * 200;

        const { data: table, error: createErr } = await supabaseAdmin
            .from('tables')
            .insert({
                club_id: clubId,
                created_by: user.id,
                name: (name || `New ${gv.toUpperCase()} Table`).slice(0, 50),
                game_type: gt,
                game_variant: gv,
                stakes: `${sb}/${bb}`,
                max_players: seats,
                small_blind: sb,
                big_blind: bb,
                min_buy_in: resolvedMinBuyIn,
                max_buy_in: resolvedMaxBuyIn,
                ante: parseFloat(ante) || 0,
                action_time_seconds: Math.min(Math.max(parseInt(actionTime) || 30, 10), 120),
                // Cash games: rake/BBJ locked to official schedule (no overrides)
                // Tournaments/SNG: use tier defaults (overrides allowed for custom structures)
                rake_percent: gt === 'cash'
                    ? tierConfig.rakePercent
                    : Math.min(Math.max(parseFloat(settings?.rakePercent) || tierConfig.rakePercent, 0), 33),
                rake_cap_bb: gt === 'cash'
                    ? tierConfig.rakeCap
                    : Math.max(parseFloat(settings?.rakeCap) || tierConfig.rakeCapBB, 0),
                bbj_percent: tierConfig.bbjEnabled
                    ? (gt === 'cash' ? tierConfig.bbjFeeBB : parseFloat(settings?.bbjPercent) || tierConfig.bbjFeeBB)
                    : 0,
                current_players: 0,
                status: 'waiting',
                settings: {
                    // ── Core Game Options ──
                    straddle_enabled: settings?.straddle_enabled || settings?.auto_utg_straddle || settings?.voluntary_straddle || false,
                    auto_utg_straddle: settings?.auto_utg_straddle || false,
                    voluntary_straddle: settings?.voluntary_straddle || false,
                    run_it_twice: settings?.run_it_twice || false,
                    run_it_thrice: settings?.run_it_thrice || false,
                    run_it_mode: settings?.run_it_mode || 'none',
                    insurance: settings?.insurance || false,
                    bomb_pot_enabled: settings?.bomb_pot || settings?.bomb_pots || false,
                    auto_muck: settings?.auto_muck !== false,
                    // ── Game Modes (PokerBros Image 1) ──
                    private_game: settings?.private_game || false,
                    vip_only: settings?.vip_only || false,
                    double_board: settings?.double_board || false,
                    triple_board: settings?.triple_board || false,
                    pineapple: settings?.pineapple || false,
                    seven_deuce: settings?.seven_deuce || false,
                    nit_game: settings?.nit_game || false,
                    anonymous_table: settings?.anonymous_table || false,
                    cap: settings?.cap || false,
                    cap_amount: settings?.cap_amount || 0,
                    ban_chat: settings?.ban_chat || false,
                    label_new: settings?.label_new || false,
                    featured_table: settings?.featured_table || false,
                    no_rathole: settings?.no_rathole || false,
                    // ── Player Requirements (Image 3) ──
                    calltime: settings?.calltime || false,
                    career_percent: settings?.career_percent || 0,
                    maintain_percent: settings?.maintain_percent || 0,
                    maintain_hands: settings?.maintain_hands || 10,
                    // ── Auto Settings (Image 4) ──
                    auto_start_players: settings?.auto_start_players || 2,
                    auto_extension: settings?.auto_extension || false,
                    auto_restart: settings?.auto_restart || false,
                    auto_create_table: settings?.auto_create_table || false,
                    // ── Rake/Fee (Image 5) ──
                    fee_cap_bb: settings?.fee_cap_bb || 3,
                    same_agent_downline_limit: settings?.same_agent_downline_limit || 0,
                    buy_in_authorization: settings?.buy_in_authorization || false,
                    // ── Security/Restrictions (Image 5-6) ──
                    restrict_device: settings?.restrict_device !== false,
                    restrict_observers: settings?.restrict_observers || false,
                    gps_restriction: settings?.gps_restriction !== false,
                    ip_restriction: settings?.ip_restriction !== false,
                    emulator_restriction: settings?.emulator_restriction || false,
                    photo_rotation_verification: settings?.photo_rotation_verification || false,
                    hide_club_name: settings?.hide_club_name || false,
                    game_length_hours: settings?.game_length_hours || 12,
                    // ── Tier/BBJ info ──
                    stakes_tier: tierConfig.tier,
                    bbj_payout_total: tierConfig.bbjPayoutTotal,
                    bbj_payout_loser: tierConfig.bbjPayoutLoser,
                    bbj_payout_winner: tierConfig.bbjPayoutWinner,
                    bbj_payout_table: tierConfig.bbjPayoutTable,
                    bbj_qualifying_hand: tierConfig.qualifyingHand?.minLosingHand || null,
                    bbj_eligible: tierConfig.bbjEnabled,
                },
            })
            .select()
            .single();

        if (createErr) throw createErr;

        // Update table count on club with optimistic lock
        const { data: club } = await supabaseAdmin
            .from('clubs')
            .select('table_count')
            .eq('id', clubId)
            .single();

        if (club) {
            const oldCount = club.table_count || 0;
            const { data: upd } = await supabaseAdmin
                .from('clubs')
                .update({ table_count: oldCount + 1 })
                .eq('id', clubId)
                .eq('table_count', oldCount)
                .select('id')

            if (!upd?.length) {
                const { data: fresh } = await supabaseAdmin.from('clubs').select('table_count').eq('id', clubId).single();
                if (fresh) {
                    await supabaseAdmin.from('clubs').update({ table_count: (fresh.table_count || 0) + 1 }).eq('id', clubId);
                }
            }
        }

        return res.status(200).json({ success: true, table });
    } catch (err) {
        console.error('[create-table]', err);
        return res.status(500).json({ success: false, error: err.message || 'Failed to create table' });
    }
}
