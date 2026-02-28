/**
 * POST /api/club-arena/create-table
 * Create a new poker table in a club.
 * Auth: Bearer token (owner or admin only)
 */
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const VALID_VARIANTS = ['nlh', 'plo4', 'plo5', 'plo6', 'plo8', 'short_deck', 'ofc'];
const VALID_GAME_TYPES = ['cash', 'tournament', 'sng'];

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'No auth token' });

    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

    const { clubId, name, variant, gameType, smallBlind, bigBlind, maxPlayers, settings } = req.body;
    if (!clubId) return res.status(400).json({ error: 'clubId required' });

    try {
        // Verify role
        const { data: member } = await supabaseAdmin
            .from('club_members')
            .select('role')
            .eq('club_id', clubId)
            .eq('user_id', user.id)
            .single();

        if (!member || !['owner', 'admin'].includes(member.role)) {
            return res.status(403).json({ error: 'Only owners and admins can create tables' });
        }

        // Validate inputs
        const sb = parseFloat(smallBlind) || 1;
        const bb = parseFloat(bigBlind) || 2;
        const seats = Math.min(Math.max(parseInt(maxPlayers) || 9, 2), 10);
        const gv = VALID_VARIANTS.includes(variant) ? variant : 'nlh';
        const gt = VALID_GAME_TYPES.includes(gameType) ? gameType : 'cash';

        // Auto-fill rake/BBJ from tier config based on stakes
        const { getRakeConfig } = require('../../src/lib/poker-engine/RakeConfig');
        const tierConfig = getRakeConfig(bb, gv);

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
                min_buy_in: sb * 40,
                max_buy_in: bb * 200,
                rake_percent: Math.min(Math.max(
                  parseFloat(settings?.rakePercent) || tierConfig.rakePercent, 0), 33),
                rake_cap_bb: Math.max(
                  parseFloat(settings?.rakeCap) || tierConfig.rakeCapBB, 0),
                bbj_percent: tierConfig.bbjEnabled
                  ? parseFloat(settings?.bbjFeeBB) || tierConfig.bbjFeeBB
                  : 0,
                current_players: 0,
                status: 'waiting',
                settings: {
                    straddle_enabled: settings?.straddle || false,
                    run_it_twice: settings?.runItTwice || false,
                    bomb_pot_enabled: settings?.bombPots || false,
                    auto_muck: settings?.autoMuck !== false,
                    // Tier info for reference
                    stakes_tier: tierConfig.tier,
                    // BBJ payout config (% of main pool when hit)
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

        // Update table count on club
        const { data: club } = await supabaseAdmin
            .from('clubs')
            .select('table_count')
            .eq('id', clubId)
            .single();

        if (club) {
            await supabaseAdmin
                .from('clubs')
                .update({ table_count: (club.table_count || 0) + 1 })
                .eq('id', clubId);
        }

        return res.status(200).json({ success: true, table });
    } catch (err) {
        console.error('[create-table]', err);
        return res.status(500).json({ error: err.message || 'Failed to create table' });
    }
}
