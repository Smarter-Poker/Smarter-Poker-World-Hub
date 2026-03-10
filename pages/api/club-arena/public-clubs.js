/**
 * GET /api/club-arena/public-clubs
 * 
 * Returns public clubs that users can discover and join.
 * No auth required — this is a discovery endpoint.
 * 
 * Query: ?limit=20&offset=0
 */
import { createClient } from '../../../src/lib/supabaseServerClient';
const { applyRateLimit } = require('../../../src/lib/poker-engine/RateLimiter');

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  if (!applyRateLimit(req, res, 'club-arena/public-clubs')) return;

  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const offset = parseInt(req.query.offset) || 0;

    const { data: clubs, error } = await supabaseAdmin
      .from('clubs')
      .select('id, club_id, name, description, avatar_url, member_count, is_public, status, created_at')
      .eq('is_public', true)
      .eq('status', 'active')
      .order('member_count', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    // Get active table counts per club
    const clubIds = (clubs || []).map(c => c.id);
    let tableCounts = {};
    if (clubIds.length > 0) {
      const { data: tables } = await supabaseAdmin
        .from('tables')
        .select('club_id')
        .in('club_id', clubIds)
        .in('status', ['active', 'running', 'waiting']);
      
      if (tables) {
        for (const t of tables) {
          tableCounts[t.club_id] = (tableCounts[t.club_id] || 0) + 1;
        }
      }
    }

    return res.json({
      success: true,
      clubs: (clubs || []).map(c => ({
        id: c.id,
        clubId: c.club_id,
        name: c.name,
        description: c.description,
        avatarUrl: c.avatar_url,
        memberCount: c.member_count || 0,
        activeTables: tableCounts[c.id] || 0,
      })),
    });
  } catch (err) {
    console.error('[public-clubs]', err);
    return res.status(500).json({ error: 'Failed to load clubs' });
  }
}
