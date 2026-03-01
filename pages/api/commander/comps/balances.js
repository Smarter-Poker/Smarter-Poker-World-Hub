/**
 * Comp Balances API
 * Reference: IMPLEMENTATION_PHASES.md - Phase 5
 * GET /api/commander/comps/balances - List player balances (staff) or get own balance
 */
import { createClient } from '@supabase/supabase-js';
import { guardWriteStaff } from '../../../../src/lib/commander/auth';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  const staffAuth = await guardWriteStaff(req, res); if (!staffAuth) return;

  if (req.method === 'GET') {
    return getBalances(req, res);
  }
  if (req.method === 'POST') {
    return awardComp(req, res, staffAuth);
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: 'Method not allowed' });
}

async function awardComp(req, res, staffAuth) {
  try {
    // staffAuth: { id, venue_id, role, is_active } from guardWriteStaff
    // display_name comes from request body (authorized_by) — set by PIN verifier
    const staffRecord = staffAuth;

    const { member_id, amount, reason, type, authorized_by, authorized_pin, comp_category, notes } = req.body;
    if (!member_id || !amount) return res.status(400).json({ success: false, error: 'member_id and amount required' });

    // Get the member to find venue_id
    const { data: member, error: memberErr } = await supabase
      .from('commander_members')
      .select('id, venue_id, first_name, last_name, comp_balance, comp_lifetime_earned, comp_lifetime_redeemed')
      .eq('id', member_id)
      .single();

    if (memberErr || !member) return res.status(404).json({ success: false, error: 'Member not found' });

    // Verify staff is at the same venue as the member
    if (String(staffRecord.venue_id) !== String(member.venue_id)) {
      return res.status(403).json({ success: false, error: 'Staff not authorized for this venue' });
    }

    const parsedAmount = parseFloat(amount);
    const newBalance = (member.comp_balance || 0) + parsedAmount;

    // Update member's comp balance
    const updateFields = { comp_balance: Math.round(newBalance * 100) / 100 };
    if (parsedAmount > 0) {
      updateFields.comp_lifetime_earned = (member.comp_lifetime_earned || 0) + parsedAmount;
    } else {
      updateFields.comp_lifetime_redeemed = (member.comp_lifetime_redeemed || 0) + Math.abs(parsedAmount);
    }

    const { error: updateErr } = await supabase
      .from('commander_members')
      .update(updateFields)
      .eq('id', member_id);

    if (updateErr) throw updateErr;

    // Log the transaction with category and notes
    await supabase
      .from('commander_member_comp_log')
      .insert({
        venue_id: member.venue_id,
        member_id: member_id,
        amount: parsedAmount,
        type: type || 'award',
        reason: reason || 'Manual comp award',
        authorized_by: authorized_by || staffRecord.display_name,
        authorized_pin: authorized_pin || false,
        processed_by: staffRecord.id,
        balance_after: Math.round(newBalance * 100) / 100,
        comp_category: comp_category || 'cash_bonus',
        notes: notes || null
      });

    // Ignore log error if table doesn't have all columns - comp was still awarded
    return res.json({
      success: true,
      data: {
        member_id,
        amount: parsedAmount,
        new_balance: Math.round(newBalance * 100) / 100,
        authorized_by: authorized_by || staffRecord.display_name
      }
    });
  } catch (error) {
    console.error('Award comp error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}

async function getBalances(req, res) {
  try {
    const { venue_id, history } = req.query;

    // If history=true, return comp log for the venue
    if (history && venue_id) {
      const { data: logs, error } = await supabase
        .from('commander_member_comp_log')
        .select('*')
        .eq('venue_id', venue_id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) return res.json({ success: true, data: { transactions: [] } });

      // Enrich with member names
      const memberIds = [...new Set(logs.map(l => l.member_id))];
      const { data: members } = await supabase
        .from('commander_members')
        .select('id, first_name, last_name')
        .in('id', memberIds.length > 0 ? memberIds : ['none']);

      const memberMap = {};
      (members || []).forEach(m => { memberMap[m.id] = `${m.first_name} ${m.last_name}`; });

      return res.json({
        success: true,
        data: {
          transactions: logs.map(l => ({
            ...l,
            member_name: memberMap[l.member_id] || 'Unknown'
          }))
        }
      });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization required' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const { player_id, sort_by = 'current_balance', limit = 50, offset = 0 } = req.query;

    // If no venue_id, return user's balances across all venues
    if (!venue_id) {
      const { data: balances, error } = await supabase
        .from('commander_comp_balances')
        .select(`
          *,
          poker_venues:venue_id (id, name, city, state)
        `)
        .eq('player_id', user.id)
        .order('current_balance', { ascending: false });

      if (error) throw error;

      // Calculate totals
      const totalBalance = balances?.reduce((sum, b) => sum + parseFloat(b.current_balance || 0), 0) || 0;
      const totalLifetime = balances?.reduce((sum, b) => sum + parseFloat(b.lifetime_earned || 0), 0) || 0;

      // Get total hours from sessions
      const { data: sessions } = await supabase
        .from('commander_player_sessions')
        .select('total_time_minutes')
        .eq('player_id', user.id);

      const totalHours = sessions?.reduce((sum, s) => sum + ((s.total_time_minutes || 0) / 60), 0) || 0;

      return res.status(200).json({
        success: true,
        data: {
          balances,
          balance: Math.round(totalBalance * 100) / 100,
          lifetime_earned: Math.round(totalLifetime * 100) / 100,
          total_hours: Math.round(totalHours * 10) / 10
        }
      });
    }

    // Check if user is staff at this venue
    const { data: staff } = await supabase
      .from('commander_staff')
      .select('id, role')
      .eq('venue_id', venue_id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    // If staff, can view all balances
    if (staff) {
      let query = supabase
        .from('commander_comp_balances')
        .select(`
          *,
          profiles:player_id (id, display_name, avatar_url, email)
        `, { count: 'exact' })
        .eq('venue_id', venue_id);

      if (player_id) {
        query = query.eq('player_id', player_id);
      }

      const validSortFields = ['current_balance', 'lifetime_earned', 'lifetime_redeemed', 'last_earned_at'];
      const sortField = validSortFields.includes(sort_by) ? sort_by : 'current_balance';
      query = query.order(sortField, { ascending: false });

      query = query.range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

      const { data, error, count } = await query;

      if (error) throw error;

      // Calculate totals
      const { data: totals } = await supabase
        .from('commander_comp_balances')
        .select('current_balance, lifetime_earned, lifetime_redeemed')
        .eq('venue_id', venue_id);

      const summary = totals?.reduce((acc, b) => ({
        total_outstanding: acc.total_outstanding + parseFloat(b.current_balance || 0),
        total_earned: acc.total_earned + parseFloat(b.lifetime_earned || 0),
        total_redeemed: acc.total_redeemed + parseFloat(b.lifetime_redeemed || 0)
      }), { total_outstanding: 0, total_earned: 0, total_redeemed: 0 });

      return res.status(200).json({
        balances: data,
        total: count,
        summary,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
    }

    // Non-staff can only see their own balance
    const { data: balance, error } = await supabase
      .from('commander_comp_balances')
      .select(`
        *,
        poker_venues:venue_id (id, name, city, state)
      `)
      .eq('venue_id', venue_id)
      .eq('player_id', user.id)
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    return res.status(200).json({
      balance: balance || {
        current_balance: 0,
        lifetime_earned: 0,
        lifetime_redeemed: 0
      }
    });
  } catch (error) {
    console.error('Get comp balances error:', error);
    return res.status(500).json({ error: error.message });
  }
}
