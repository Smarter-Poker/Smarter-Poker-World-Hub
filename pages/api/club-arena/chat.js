import { getSupabase } from '../../../src/lib/supabaseClient';

/**
 * Chat API — persists table chat messages to club_chat table.
 * 
 * POST: save a new message
 * GET: load last 50 messages for a table
 */
export default async function handler(req, res) {
  const supabase = getSupabase();
  const tableId = req.query.tableId || req.body?.tableId;

  if (req.method === 'GET') {
    // Load last 50 messages for this table
    if (!tableId) return res.status(400).json({ error: 'tableId required' });

    try {
      const { data, error } = await supabase
        .from('club_chat')
        .select('id, user_id, display_name, message, message_type, created_at')
        .eq('club_id', tableId)
        .order('created_at', { ascending: true })
        .limit(50);

      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ messages: data || [] });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'POST') {
    const { message, displayName, clubId } = req.body;
    if (!message || !clubId) return res.status(400).json({ error: 'message and clubId required' });

    // Get user from auth header
    const authHeader = req.headers.authorization;
    let userId = null;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const { data: { user } } = await supabase.auth.getUser(authHeader.split(' ')[1]);
        userId = user?.id;
      } catch (_) {}
    }

    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const { data, error } = await supabase
        .from('club_chat')
        .insert({
          club_id: clubId,
          user_id: userId,
          display_name: displayName || 'Player',
          message: message.slice(0, 500), // Enforce 500 char limit
          message_type: 'message',
        })
        .select('id')
        .maybeSingle();

      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ success: true, id: data?.id });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
