/**
 * Comp Transactions API
 * Reference: IMPLEMENTATION_PHASES.md - Phase 5
 * GET /api/club-commander/comps/transactions - List transactions
 * POST /api/club-commander/comps/transactions - Issue manual comp or adjustment
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return listTransactions(req, res);
  }

  if (req.method === 'POST') {
    return createTransaction(req, res);
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).json({ error: 'Method not allowed' });
}

async function listTransactions(req, res) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization required' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const {
      venue_id,
      player_id,
      transaction_type,
      limit = 50,
      offset = 0
    } = req.query;

    let query = supabase
      .from('captain_comp_transactions')
      .select(`
        *,
        profiles:player_id (id, display_name, avatar_url),
        captain_staff:approved_by (id, display_name),
        captain_comp_rates:rate_id (id, name, rate_type)
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    // Check if staff for venue access
    if (venue_id) {
      const { data: staff } = await supabase
        .from('captain_staff')
        .select('id, role')
        .eq('venue_id', parseInt(venue_id))
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single();

      if (staff) {
        query = query.eq('venue_id', parseInt(venue_id));
        if (player_id) {
          query = query.eq('player_id', player_id);
        }
      } else {
        // Non-staff can only see their own
        query = query.eq('venue_id', parseInt(venue_id)).eq('player_id', user.id);
      }
    } else {
      // No venue specified, show user's transactions
      query = query.eq('player_id', user.id);
    }

    if (transaction_type) {
      query = query.eq('transaction_type', transaction_type);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    return res.status(200).json({
      transactions: data,
      total: count,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('List transactions error:', error);
    return res.status(500).json({ error: error.message });
  }
}

async function createTransaction(req, res) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Authorization required' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const { venue_id, player_id, amount, description, transaction_type = 'bonus' } = req.body;

    if (!venue_id || !player_id || amount === undefined) {
      return res.status(400).json({ error: 'Venue ID, player ID, and amount are required' });
    }

    // Check if user is staff at this venue
    const { data: staff } = await supabase
      .from('captain_staff')
      .select('id, role')
      .eq('venue_id', parseInt(venue_id))
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (!staff) {
      return res.status(403).json({ error: 'Staff access required to issue comps' });
    }

    // For adjustments (negative), require supervisor or higher
    if (amount < 0 && !['owner', 'manager', 'supervisor'].includes(staff.role)) {
      return res.status(403).json({ error: 'Supervisor role or higher required for adjustments' });
    }

    // Use the database function to issue manual comp
    const { data, error } = await supabase.rpc('issue_manual_comp', {
      p_venue_id: parseInt(venue_id),
      p_player_id: player_id,
      p_amount: parseFloat(amount),
      p_description: description || (amount >= 0 ? 'Manual comp issued' : 'Manual adjustment'),
      p_staff_id: staff.id
    });

    if (error) throw error;

    // Get the created transaction
    const { data: transaction } = await supabase
      .from('captain_comp_transactions')
      .select(`
        *,
        profiles:player_id (id, display_name, avatar_url),
        captain_staff:approved_by (id, display_name)
      `)
      .eq('id', data)
      .single();

    // Get updated balance
    const { data: balance } = await supabase
      .from('captain_comp_balances')
      .select('*')
      .eq('venue_id', parseInt(venue_id))
      .eq('player_id', player_id)
      .single();

    return res.status(201).json({
      transaction,
      balance,
      message: amount >= 0
        ? `$${amount.toFixed(2)} comp issued successfully`
        : `$${Math.abs(amount).toFixed(2)} adjustment applied`
    });
  } catch (error) {
    console.error('Create transaction error:', error);
    return res.status(500).json({ error: error.message });
  }
}
