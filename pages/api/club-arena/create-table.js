import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * POST /api/club-arena/create-table
 * Create a new poker table in a club.
 * Auth: Bearer token (owner or admin only)
 *
 * RED TEAM HARDENED — E-01/E-02/E-03/E-04/E-13
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
import { notifyClubMembers } from '../../../src/lib/club-arena/notify';
import { applyRateLimit } from '../../../src/lib/poker-engine/RateLimiter';
import { reportApiError } from '../../../src/lib/sentryWrap';

const { isUUID } = require('../../../src/lib/club-arena/validate');
const { sanitizeTableName, clampFloat, sanitizeSettings, safeErrorResponse } = require('../../../src/lib/club-arena/sanitize');
const { checkIdempotency, cacheResponse } = require('../../../src/lib/club-arena/idempotency');

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured');
        _supabase = createClient(url, key);
    }
    return _supabase;
}

const VALID_VARIANTS = ['nlh', 'flh', 'plo4', 'plo5', 'plo6', 'plo8', 'short_deck', 'flo', 'mixed', 'ofc', 'pineapple'];
const VALID_GAME_TYPES = ['cash', 'tournament', 'sng'];

export default async function handler(req, res) {
  const supabaseAdmin = getSupabase(); // FIX: was undefined — alias to getSupabase() for settlement-lock, audit, velocity, notify
  try {
      // ── E-13: Rate limiter ───────────────────────────────────
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
          try {
              const { applyRateLimit: rl, LIMITS } = require('../../../src/lib/apiRateLimit');
              if (!rl(req, res, LIMITS.write)) return;
          } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
      }

      if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

      // ── C-05: Idempotency Guard (Fat-Finger Defense) ──
      if (checkIdempotency(req, res)) return;

      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) return res.status(401).json({ error: 'No auth token' });

      const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
      const user = authData?.user;
      if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

      const { clubId, name, variant, gameType, smallBlind, bigBlind, maxPlayers, minBuyIn, maxBuyIn, ante, actionTime, settings } = req.body;

      // ── E-04: UUID validation ──────────────────────────────────
      if (!clubId || !isUUID(clubId)) {
          return res.status(400).json({ error: 'clubId must be a valid UUID' });
      }

      try {
          // Load club info (needed for BBJ config + union admin fallback)
          const { data: clubInfo } = await getSupabase()
              .from('clubs')
              .select('union_id, bbj_enabled')
              .eq('id', clubId)
              .maybeSingle();

          // Verify role — ALWAYS uses JWT user.id, never body userId
          const { data: member } = await getSupabase()
              .from('club_members')
              .select('role')
              .eq('club_id', clubId)
              .eq('user_id', user.id)
              .maybeSingle();

          if (!member || !['owner', 'admin'].includes(member.role)) {
              // Union admin fallback
              let unionAuth = false;
              if (clubInfo?.union_id) {
                  const { data: ua } = await getSupabase().from('union_admins').select('role').eq('union_id', clubInfo.union_id).eq('user_id', user.id).maybeSingle();
                  if (ua) {
                      unionAuth = true;
                  } else {
                      // Owner fallback
                      const { data: union } = await getSupabase().from('unions').select('id').eq('id', clubInfo.union_id).eq('owner_id', user.id).maybeSingle();
                      if (union) unionAuth = true;
                  }
              }
              if (!unionAuth) {
                  return res.status(403).json({ error: 'Only owners, admins, or union admins can create tables' });
              }
          }

          // ── UNION GOVERNANCE (2026-08-19) ─────────────────────────────
          // Hard rule: clubs inside a union do not create union-visible games.
          //   - Union admins create UNION tables (union_id stamped).
          //   - Club owners/admins may still create PRIVATE club games
          //     (is_private = true — visible only inside the club).
          // The trg_tables_union_ownership DB trigger enforces the same rule
          // for every other writer.
          let tableUnionId = null;
          let tableIsPrivate = false;
          if (clubInfo?.union_id) {
              const requestedPrivate = req.body.isPrivate === true || settings?.private_game === true;
              let isUnionAdminCaller = false;
              const { data: uaGov } = await getSupabase()
                  .from('union_admins')
                  .select('role')
                  .eq('union_id', clubInfo.union_id)
                  .eq('user_id', user.id)
                  .maybeSingle();
              if (uaGov) {
                  isUnionAdminCaller = true;
              } else {
                  const { data: unGov } = await getSupabase()
                      .from('unions')
                      .select('id')
                      .eq('id', clubInfo.union_id)
                      .eq('owner_id', user.id)
                      .maybeSingle();
                  if (unGov) isUnionAdminCaller = true;
              }
              if (requestedPrivate) {
                  tableIsPrivate = true; // private club game — never union-visible
              } else if (isUnionAdminCaller) {
                  tableUnionId = clubInfo.union_id; // union-owned table
              } else {
                  return res.status(403).json({
                      error: 'This club is in a union. Only union admins create union tables — set isPrivate: true to create a private club game instead.',
                  });
              }
          }

          // ── E-02: Validate numeric inputs — reject NaN/Infinity ────────
          const sbResult = clampFloat(smallBlind, 0.01, 100000, 1);
          const bbResult = clampFloat(bigBlind, 0.02, 200000, 2);
          if (!sbResult.valid) return res.status(400).json({ error: `smallBlind: ${sbResult.error}` });
          if (!bbResult.valid) return res.status(400).json({ error: `bigBlind: ${bbResult.error}` });
          const sb = sbResult.value;
          const bb = bbResult.value;

          // Validate BB > SB
          if (bb <= sb) {
              return res.status(400).json({ error: 'bigBlind must be greater than smallBlind' });
          }

          const seats = Math.min(Math.max(parseInt(maxPlayers) || 9, 2), 10);
          const gv = VALID_VARIANTS.includes(variant) ? variant : 'nlh';
          const gt = VALID_GAME_TYPES.includes(gameType) ? gameType : 'cash';

          // Ante validation
          const anteResult = clampFloat(ante, 0, bb * 10, 0);
          if (!anteResult.valid) return res.status(400).json({ error: `ante: ${anteResult.error}` });
          const cleanAnte = anteResult.value;

          // Action time validation
          const atResult = clampFloat(actionTime, 10, 120, 30);
          const cleanActionTime = atResult.value;

          // Auto-fill rake/BBJ from tier config based on stakes
          const { getRakeConfig, findScheduleMatch, getAllowedStakes } = require('../../../src/lib/poker-engine/RakeConfig');
          const tierConfig = getRakeConfig(bb, gv, sb);

          // Validate stakes against official schedule for cash games
          if (gt === 'cash') {
              const scheduleMatch = findScheduleMatch(sb, bb);
              if (!scheduleMatch) {
                  const allowed = getAllowedStakes().map(s => s.label).join(', ');
                  return res.status(400).json({
                      error: `Invalid stakes ${sb}/${bb}. Allowed cash game stakes: ${allowed}`,
                  });
              }
          }

          // Buy-in validation with cross-field check (E-07 defense-in-depth)
          const minBuyResult = clampFloat(minBuyIn, bb, bb * 500, bb * 40);
          const maxBuyResult = clampFloat(maxBuyIn, bb * 2, bb * 1000, bb * 200);
          const resolvedMinBuyIn = minBuyResult.value;
          let resolvedMaxBuyIn = maxBuyResult.value;
          // Ensure max >= min
          if (resolvedMaxBuyIn < resolvedMinBuyIn) resolvedMaxBuyIn = resolvedMinBuyIn;

          // ── E-01: Sanitize table name (strip HTML/XSS) ──────────────
          const cleanName = sanitizeTableName(name, 50) || `New ${gv.toUpperCase()} Table`;

          // ── E-03: Whitelist settings keys ──────────────────────────────
          const cleanSettings = sanitizeSettings(settings || {});

          const { data: table, error: createErr } = await getSupabase()
              .from('tables')
              .insert({
                  club_id: clubId,
                  union_id: tableUnionId,
                  is_private: tableIsPrivate,
                  created_by: user.id,
                  name: cleanName,
                  game_type: gt,
                  game_variant: gv,
                  stakes: `${sb}/${bb}`,
                  max_players: seats,
                  small_blind: sb,
                  big_blind: bb,
                  min_buy_in: resolvedMinBuyIn,
                  max_buy_in: resolvedMaxBuyIn,
                  ante: cleanAnte,
                  action_time_seconds: Math.round(cleanActionTime),
                  // Cash games: rake/BBJ locked to official schedule (no overrides)
                  rake_percent: gt === 'cash'
                      ? tierConfig.rakePercent
                      : Math.min(Math.max(parseFloat(cleanSettings.rakePercent) || tierConfig.rakePercent, 0), 33),
                  rake_cap_bb: gt === 'cash'
                      ? tierConfig.rakeCap
                      : Math.max(parseFloat(cleanSettings.rakeCap) || tierConfig.rakeCapBB, 0),
                  bbj_percent: (clubInfo?.bbj_enabled === false ? false : tierConfig.bbjEnabled)
                      ? (gt === 'cash' ? tierConfig.bbjFeeBB : parseFloat(cleanSettings.bbjPercent) || tierConfig.bbjFeeBB)
                      : 0,
                  current_players: 0,
                  status: 'waiting',
                  settings: {
                      // ── Core Game Options ──
                      straddle_enabled: cleanSettings.straddle_enabled || cleanSettings.auto_utg_straddle || cleanSettings.voluntary_straddle || false,
                      auto_utg_straddle: cleanSettings.auto_utg_straddle || false,
                      voluntary_straddle: cleanSettings.voluntary_straddle || false,
                      run_it_twice: cleanSettings.run_it_twice || false,
                      run_it_thrice: cleanSettings.run_it_thrice || false,
                      run_it_mode: cleanSettings.run_it_mode || 'none',
                      insurance: cleanSettings.insurance || false,
                      bomb_pot_enabled: cleanSettings.bomb_pot || cleanSettings.bomb_pot_enabled || false,
                      bomb_pot_frequency: parseInt(cleanSettings.bomb_pot_frequency) || 0,
                      bomb_pot_ante_multiplier: Math.max(1, Math.min(10, parseInt(cleanSettings.bomb_pot_ante_multiplier) || 2)),
                      auto_muck: cleanSettings.auto_muck !== false,
                      // ── Game Modes ──
                      private_game: cleanSettings.private_game || tableIsPrivate || false,
                      vip_only: cleanSettings.vip_only || false,
                      double_board: cleanSettings.double_board || false,
                      triple_board: cleanSettings.triple_board || false,
                      pineapple: cleanSettings.pineapple || false,
                      seven_deuce: cleanSettings.seven_deuce || false,
                      nit_game: cleanSettings.nit_game || false,
                      anonymous_table: cleanSettings.anonymous_table || false,
                      cap: cleanSettings.cap || false,
                      cap_amount: cleanSettings.cap_amount || 0,
                      ban_chat: cleanSettings.ban_chat || false,
                      label_new: cleanSettings.label_new || false,
                      featured_table: cleanSettings.featured_table || false,
                      no_rathole: cleanSettings.no_rathole || false,
                      // ── Player Requirements ──
                      calltime: cleanSettings.calltime || false,
                      career_percent: cleanSettings.career_percent || 0,
                      maintain_percent: cleanSettings.maintain_percent || 0,
                      maintain_hands: cleanSettings.maintain_hands || 10,
                      // ── Auto Settings ──
                      auto_start_players: cleanSettings.auto_start_players || 2,
                      auto_extension: cleanSettings.auto_extension || false,
                      auto_restart: cleanSettings.auto_restart || false,
                      auto_create_table: cleanSettings.auto_create_table || false,
                      // ── Rake/Fee ──
                      fee_cap_bb: cleanSettings.fee_cap_bb || 3,
                      same_agent_downline_limit: cleanSettings.same_agent_downline_limit || 0,
                      buy_in_authorization: cleanSettings.buy_in_authorization || false,
                      // ── Security/Restrictions ──
                      restrict_device: cleanSettings.restrict_device !== false,
                      restrict_observers: cleanSettings.restrict_observers || false,
                      gps_restriction: cleanSettings.gps_restriction !== false,
                      ip_restriction: cleanSettings.ip_restriction !== false,
                      emulator_restriction: cleanSettings.emulator_restriction || false,
                      photo_rotation_verification: cleanSettings.photo_rotation_verification || false,
                      hide_club_name: cleanSettings.hide_club_name || false,
                      game_length_hours: cleanSettings.game_length_hours || 12,
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
              .maybeSingle();

          if (createErr) throw createErr;

          // ── C-03: Update table count on club (prioritize atomic RPC) ──
          const { error: rpcErr } = await getSupabase().rpc('increment_club_table_count', { p_club_id: clubId });
          if (rpcErr) {
              // Fallback: Optimistic lock table count update if RPC doesn't exist
              const { data: club } = await getSupabase().from('clubs').select('table_count').eq('id', clubId).maybeSingle();
              if (club) {
                  const oldCount = club.table_count || 0;
                  const { data: upd } = await getSupabase()
                      .from('clubs')
                      .update({ table_count: oldCount + 1 })
                      .eq('id', clubId)
                      .eq('table_count', oldCount)
                      .select('id')
                      .limit(200);

                  if (!upd?.length) {
                      const { data: fresh } = await getSupabase().from('clubs').select('table_count').eq('id', clubId).maybeSingle();
                      if (fresh) {
                          const { error: err_clubs_sihp9 } = await getSupabase().from('clubs').update({ table_count: (fresh.table_count || 0) + 1 }).eq('id', clubId);
                          if (err_clubs_sihp9) console.warn('[Supabase] Silent mutation failed in clubs:', err_clubs_sihp9.message);
                      }
                  }
              }
          }

          // Notify club members of new table (fire-and-forget)
          const tableName = table?.name || `${gv.toUpperCase()} ${sb}/${bb}`;
          await notifyClubMembers(supabaseAdmin, {
              clubId, type: 'table_created',
              title: `🎲 New Table: ${tableName}`,
              message: `A new ${gv.toUpperCase()} ${sb}/${bb} cash game is now open!`,
              data: { tableId: table?.id, variant: gv, stakes: `${sb}/${bb}` },
              pushUrl: `/hub/club-arena?club=${clubId}`,
              excludeUserId: user.id,
          }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));

          const responseBody = { success: true, table };
          cacheResponse(req, 200, responseBody);
          return res.status(200).json(responseBody);
      } catch (err) {
          console.warn('[create-table]', err);
          return res.status(500).json(safeErrorResponse(err, 'Failed to create table'));
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
