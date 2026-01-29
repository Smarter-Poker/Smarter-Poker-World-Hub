/**
 * Streaming Index API
 * GET /api/commander/streaming - List streams for a venue
 */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Only GET allowed' }
    });
  }

  const { venue_id } = req.query;

  if (!venue_id) {
    return res.status(400).json({
      success: false,
      error: { code: 'MISSING_FIELDS', message: 'venue_id required' }
    });
  }

  try {
    // Get all tables for venue
    const { data: tables, error: tablesError } = await supabase
      .from('commander_tables')
      .select('id, table_number, status, capacity')
      .eq('venue_id', venue_id)
      .eq('is_active', true)
      .order('table_number');

    if (tablesError) throw tablesError;

    // Get existing stream records
    const tableIds = (tables || []).map(t => t.id);

    let streams = [];
    if (tableIds.length > 0) {
      const { data: streamData, error: streamError } = await supabase
        .from('commander_streams')
        .select('*')
        .in('table_id', tableIds);

      if (!streamError) {
        streams = streamData || [];
      }
    }

    // Get active games for tables
    const { data: games } = await supabase
      .from('commander_games')
      .select('id, table_id, game_type, stakes, current_players')
      .in('table_id', tableIds)
      .in('status', ['waiting', 'running']);

    const gamesByTable = {};
    (games || []).forEach(g => {
      gamesByTable[g.table_id] = g;
    });

    const streamsByTable = {};
    streams.forEach(s => {
      streamsByTable[s.table_id] = s;
    });

    // Build response with all tables and their stream status
    const result = (tables || []).map(table => {
      const stream = streamsByTable[table.id];
      const game = gamesByTable[table.id];

      return {
        table_id: table.id,
        table_number: table.table_number,
        status: stream?.status || 'offline',
        platforms: stream?.platforms || [],
        delay_minutes: stream?.delay_minutes || 15,
        overlay_config: stream?.overlay_config || {},
        started_at: stream?.started_at || null,
        viewer_count: stream?.viewer_count || 0,
        game_info: game ? `${game.stakes} ${game.game_type?.toUpperCase() || 'NLH'}` : null
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        streams: result,
        summary: {
          total_tables: result.length,
          live_count: result.filter(s => s.status === 'live').length
        }
      }
    });
  } catch (error) {
    console.error('List streams error:', error);
    return res.status(500).json({
      success: false,
      error: { code: 'SERVER_ERROR', message: 'Failed to fetch streams' }
    });
  }
}
