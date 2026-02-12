/**
 * Cash Game Transactions API
 * GET /api/commander/cashier?venue_id=X - List transactions (optional: table_number, session_id, type, date)
 * POST /api/commander/cashier - Record buy-in, cash-out, or add-on
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method === 'GET') return handleGet(req, res);
  if (req.method === 'POST') return handlePost(req, res);
  return res.status(405).json({ success: false, error: 'Method not allowed' });
}

async function handleGet(req, res) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, error: 'Auth required' });
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return res.status(401).json({ success: false, error: 'Invalid token' });

    const { venue_id, table_number, session_id, type, date, limit = 100 } = req.query;
    if (!venue_id) return res.status(400).json({ success: false, error: 'venue_id required' });

    let query = supabase
      .from('commander_cash_transactions')
      .select('*')
      .eq('venue_id', venue_id)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (table_number) query = query.eq('table_number', parseInt(table_number));
    if (session_id) query = query.eq('session_id', session_id);
    if (type) query = query.eq('type', type);
    if (date) {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      query = query.gte('created_at', start.toISOString()).lte('created_at', end.toISOString());
    }

    const { data, error } = await query;
    if (error) throw error;

    // Compute summary
    const transactions = data || [];
    const buyIns = transactions.filter(t => t.type === 'buy_in' || t.type === 'add_on');
    const cashOuts = transactions.filter(t => t.type === 'cash_out');

    const summary = {
      total_buy_ins: buyIns.reduce((s, t) => s + parseFloat(t.amount), 0),
      total_cash_outs: cashOuts.reduce((s, t) => s + parseFloat(t.amount), 0),
      buy_in_count: buyIns.length,
      cash_out_count: cashOuts.length,
      net_drop: buyIns.reduce((s, t) => s + parseFloat(t.amount), 0) - cashOuts.reduce((s, t) => s + parseFloat(t.amount), 0),
    };

    return res.status(200).json({ success: true, data: transactions, summary });
  } catch (err) {
    console.error('Cashier GET error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

async function handlePost(req, res) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, error: 'Auth required' });
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return res.status(401).json({ success: false, error: 'Invalid token' });

    const { venue_id, session_id, player_name, table_number, seat_number, type, amount, chip_count, payment_method, notes } = req.body;

    if (!venue_id || !player_name || !type || !amount) {
      return res.status(400).json({ success: false, error: 'venue_id, player_name, type, and amount required' });
    }
    if (!['buy_in', 'cash_out', 'add_on'].includes(type)) {
      return res.status(400).json({ success: false, error: 'type must be buy_in, cash_out, or add_on' });
    }
    if (parseFloat(amount) <= 0) {
      return res.status(400).json({ success: false, error: 'amount must be positive' });
    }

    const { data, error } = await supabase
      .from('commander_cash_transactions')
      .insert({
        venue_id,
        session_id: session_id || null,
        player_name,
        table_number: table_number ? parseInt(table_number) : null,
        seat_number: seat_number ? parseInt(seat_number) : null,
        type,
        amount: parseFloat(amount),
        chip_count: chip_count ? parseFloat(chip_count) : parseFloat(amount),
        payment_method: payment_method || 'cash',
        processed_by: user.id,
        notes: notes || null,
      })
      .select()
      .single();

    if (error) throw error;

    // Get updated player totals for this session
    let playerTotals = null;
    if (session_id) {
      const { data: txns } = await supabase
        .from('commander_cash_transactions')
        .select('type, amount')
        .eq('session_id', session_id);

      if (txns) {
        const ins = txns.filter(t => t.type === 'buy_in' || t.type === 'add_on').reduce((s, t) => s + parseFloat(t.amount), 0);
        const outs = txns.filter(t => t.type === 'cash_out').reduce((s, t) => s + parseFloat(t.amount), 0);
        playerTotals = { total_bought: ins, total_cashed: outs, net: outs - ins };
      }
    }

    return res.status(201).json({ success: true, data, player_totals: playerTotals });
  } catch (err) {
    console.error('Cashier POST error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
