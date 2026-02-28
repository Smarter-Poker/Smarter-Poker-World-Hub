/**
 * /api/club-arena/clubs — Club CRUD
 * 
 * GET    → List my clubs
 * POST   → Create a new club
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

export default async function handler(req, res) {
  // Auth
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

  if (req.method === 'GET') {
    // List clubs the user belongs to
    const { data: memberships, error } = await supabase
      .from('club_members')
      .select(`
        id, role, chip_balance, status, joined_at,
        clubs (id, name, code, description, logo_url, member_count, table_count, status, owner_id, settings)
      `)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('last_active_at', { ascending: false });

    if (error) return res.status(500).json({ error: error.message });

    const clubs = (memberships || []).map(m => ({
      membershipId: m.id,
      role: m.role,
      chipBalance: m.chip_balance,
      ...m.clubs,
    }));

    return res.json({ clubs });
  }

  if (req.method === 'POST') {
    const { name, description, gameVariants, settings } = req.body;

    if (!name || name.trim().length < 2) {
      return res.status(400).json({ error: 'Club name required (min 2 chars)' });
    }

    // Generate unique code
    const { data: codeData } = await supabase.rpc('generate_club_code');
    const code = codeData || Math.random().toString(36).slice(2, 8).toUpperCase();

    // Create club
    const { data: club, error: createErr } = await supabase
      .from('clubs')
      .insert({
        name: name.trim(),
        code,
        description: description || '',
        owner_id: user.id,
        game_variants: gameVariants || ['nlh'],
        settings: settings || {},
      })
      .select()
      .single();

    if (createErr) return res.status(500).json({ error: createErr.message });

    // Add owner as member
    await supabase.from('club_members').insert({
      club_id: club.id,
      user_id: user.id,
      role: 'owner',
      status: 'active',
    });

    return res.status(201).json({ club });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
