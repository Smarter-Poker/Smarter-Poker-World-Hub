/**
 * /api/club-arena/clubs/[clubId]/tables — Table management within a club
 * 
 * GET   → List active tables in this club
 * POST  → Create a new table (owner/agent only)
 */

import { createClient } from '@supabase/supabase-js';
import { getController } from '../../../../src/GameController';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

async function getMembership(clubId, userId) {
  const { data } = await supabase
    .from('club_members')
    .select('id, role, chip_balance, status')
    .eq('club_id', clubId)
    .eq('user_id', userId)
    .eq('status', 'active')
    .single();
  return data;
}

export default async function handler(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

  const { clubId } = req.query;
  const membership = await getMembership(clubId, user.id);
  if (!membership) return res.status(403).json({ error: 'Not a member' });

  if (req.method === 'GET') {
    const { data: tables, error } = await supabase
      .from('club_tables')
      .select('*')
      .eq('club_id', clubId)
      .in('status', ['waiting', 'active'])
      .order('created_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ tables: tables || [] });
  }

  if (req.method === 'POST') {
    // Only owner/agent can create tables
    if (membership.role === 'player') {
      return res.status(403).json({ error: 'Only owners and agents can create tables' });
    }

    const {
      name,
      gameVariant = 'nlh',
      smallBlind = 1,
      bigBlind = 2,
      ante = 0,
      minBuyIn,
      maxBuyIn,
      maxPlayers = 9,
      actionTime = 30,
      runItTwice = false,
      straddleAllowed = false,
      bombPotEnabled = false,
      rakePercent,
      rakeCapBb,
    } = req.body;

    const sb = parseInt(smallBlind) || 1;
    const bb = parseInt(bigBlind) || sb * 2;
    const tableName = name || `${sb}/${bb} ${gameVariant.toUpperCase()}`;

    // Get club defaults
    const { data: club } = await supabase
      .from('clubs')
      .select('rake_percent, rake_cap_bb, table_count, max_tables')
      .eq('id', clubId)
      .single();

    if (club && club.table_count >= club.max_tables) {
      return res.status(400).json({ error: `Max tables reached (${club.max_tables})` });
    }

    // Insert into club_tables
    const { data: table, error: insertErr } = await supabase
      .from('club_tables')
      .insert({
        club_id: clubId,
        name: tableName,
        game_variant: gameVariant,
        small_blind: sb,
        big_blind: bb,
        ante: parseInt(ante) || 0,
        min_buy_in: parseInt(minBuyIn) || bb * 40,
        max_buy_in: parseInt(maxBuyIn) || bb * 200,
        max_players: Math.min(Math.max(parseInt(maxPlayers) || 9, 2), 10),
        action_time_seconds: parseInt(actionTime) || 30,
        run_it_twice: !!runItTwice,
        straddle_allowed: !!straddleAllowed,
        bomb_pot_enabled: !!bombPotEnabled,
        rake_percent: rakePercent ?? club?.rake_percent ?? 5,
        rake_cap_bb: rakeCapBb ?? club?.rake_cap_bb ?? 3,
        created_by: user.id,
        status: 'waiting',
      })
      .select()
      .single();

    if (insertErr) return res.status(500).json({ error: insertErr.message });

    // Boot the engine for this table
    try {
      const controller = await getController();
      const engineResult = await controller.createTable({
        tableId: table.id,
        name: tableName,
        variant: gameVariant,
        maxSeats: table.max_players,
        smallBlind: sb,
        bigBlind: bb,
        minBuyIn: table.min_buy_in,
        maxBuyIn: table.max_buy_in,
        ante: table.ante,
        rakePercent: table.rake_percent,
        rakeCap: table.rake_cap_bb,
        clubId,
        createdBy: user.id,
        runItTwice: table.run_it_twice,
        straddle: table.straddle_allowed,
        bombPot: table.bomb_pot_enabled,
      });

      if (!engineResult.success) {
        // Rollback DB insert
        await supabase.from('club_tables').delete().eq('id', table.id);
        return res.status(500).json({ error: engineResult.error || 'Engine failed to start' });
      }
    } catch (err) {
      console.error('[club-tables] Engine boot failed:', err);
      // Table exists in DB, engine will connect on first player join
    }

    // Update club table count
    await supabase
      .from('clubs')
      .update({ table_count: (club?.table_count || 0) + 1 })
      .eq('id', clubId);

    return res.status(201).json({ table });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
