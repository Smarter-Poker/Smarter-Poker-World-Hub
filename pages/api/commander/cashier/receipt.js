/**
 * Cash Transaction Receipt API
 * GET /api/commander/cashier/receipt?transaction_id=X
 * Returns receipt data for thermal printer (80mm)
 * Also supports: ?session_id=X (full session summary receipt)
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method not allowed' });

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, error: 'Auth required' });
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return res.status(401).json({ success: false, error: 'Invalid token' });

    const { transaction_id, session_id } = req.query;

    if (transaction_id) {
      // Single transaction receipt
      const { data: tx } = await supabase
        .from('commander_cash_transactions')
        .select('*')
        .eq('id', transaction_id)
        .single();

      if (!tx) return res.status(404).json({ success: false, error: 'Transaction not found' });

      // Get venue name
      let venueName = 'Poker Room';
      const { data: venue } = await supabase.from('poker_venues').select('name').eq('id', tx.venue_id).single();
      if (venue?.name) venueName = venue.name;

      return res.status(200).json({
        success: true,
        data: {
          type: 'single',
          venue_name: venueName,
          transaction: {
            id: tx.id,
            type: tx.type,
            type_label: tx.type === 'buy_in' ? 'BUY-IN' : tx.type === 'add_on' ? 'ADD-ON' : 'CASH OUT',
            player_name: tx.player_name,
            table_number: tx.table_number,
            seat_number: tx.seat_number,
            amount: parseFloat(tx.amount),
            payment_method: tx.payment_method,
            timestamp: tx.created_at,
          }
        }
      });
    }

    if (session_id) {
      // Full session summary receipt (cash-out receipt with all transactions)
      const { data: session } = await supabase
        .from('commander_table_sessions')
        .select('*')
        .eq('id', session_id)
        .single();

      if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

      const { data: txns } = await supabase
        .from('commander_cash_transactions')
        .select('*')
        .eq('session_id', session_id)
        .order('created_at', { ascending: true });

      let venueName = 'Poker Room';
      const { data: venue } = await supabase.from('poker_venues').select('name').eq('id', session.venue_id).single();
      if (venue?.name) venueName = venue.name;

      const transactions = txns || [];
      const totalBought = transactions.filter(t => t.type === 'buy_in' || t.type === 'add_on').reduce((s, t) => s + parseFloat(t.amount), 0);
      const totalCashed = transactions.filter(t => t.type === 'cash_out').reduce((s, t) => s + parseFloat(t.amount), 0);
      const duration = session.ended_at
        ? Math.round((new Date(session.ended_at) - new Date(session.started_at)) / 60000)
        : Math.round((Date.now() - new Date(session.started_at)) / 60000);

      return res.status(200).json({
        success: true,
        data: {
          type: 'session_summary',
          venue_name: venueName,
          player_name: session.player_name,
          table_number: session.table_number,
          seat_number: session.seat_number,
          session_start: session.started_at,
          session_end: session.ended_at || new Date().toISOString(),
          duration_minutes: duration,
          total_bought: totalBought,
          total_cashed: totalCashed,
          net_result: totalCashed - totalBought,
          time_charge: parseFloat(session.total_charge || 0),
          transactions: transactions.map(t => ({
            type: t.type,
            type_label: t.type === 'buy_in' ? 'Buy-in' : t.type === 'add_on' ? 'Add-on' : 'Cash-out',
            amount: parseFloat(t.amount),
            payment_method: t.payment_method,
            time: t.created_at,
          })),
        }
      });
    }

    return res.status(400).json({ success: false, error: 'transaction_id or session_id required' });
  } catch (err) {
    console.error('Receipt error:', err);
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
