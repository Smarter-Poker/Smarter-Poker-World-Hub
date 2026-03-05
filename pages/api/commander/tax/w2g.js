/**
 * W-2G Tax Compliance API
 * GET /api/commander/tax/w2g — List tax events for venue
 * POST /api/commander/tax/w2g — Generate W-2G for a tax event
 * PATCH /api/commander/tax/w2g — Update tax event (SSN, acknowledge, notes)
 *
 * IRS W-2G: Required for poker tournament winnings >= $5,000 (net of buy-in)
 * Federal withholding: 24% on reportable gambling winnings
 */
import { createClient } from '@supabase/supabase-js';
import { guardStaff } from '../../../../src/lib/commander/auth';
import { applyRateLimit, LIMITS } from '../../../../src/lib/apiRateLimit';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const FEDERAL_WITHHOLDING_RATE = 0.24;

export default async function handler(req, res) {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    if (!applyRateLimit(req, res, LIMITS.write)) return;
  }

  // Auth guard: require staff auth
  const _staff = await guardStaff(req, res);
  if (!_staff) return;

  if (req.method === 'GET') return listTaxEvents(req, res);
  if (req.method === 'POST') return generateW2G(req, res);
  if (req.method === 'PATCH') return updateTaxEvent(req, res);
  return res.status(405).json({ success: false, error: { code: 'METHOD_NOT_ALLOWED' } });
}

async function listTaxEvents(req, res) {
  const { venue_id, year, w2g_generated, limit = 50 } = req.query;

  if (!venue_id) {
    return res.status(400).json({ success: false, error: { code: 'MISSING_FIELDS', message: 'venue_id required' } });
  }

  try {
    const targetYear = year || new Date().getFullYear();

    let query = supabase
      .from('commander_tax_events')
      .select(`
        id, venue_id, player_id, event_type, event_date,
        gross_amount, buy_in, net_amount,
        withholding_required, withholding_amount, withholding_rate,
        w2g_generated, w2g_document_url,
        player_ssn_last4, player_acknowledged, acknowledged_at,
        notes, created_at
      `)
      .eq('venue_id', venue_id)
      .gte('event_date', `${targetYear}-01-01`)
      .lte('event_date', `${targetYear}-12-31`)
      .order('event_date', { ascending: false })
      .limit(parseInt(limit));

    if (w2g_generated === 'true') query = query.eq('w2g_generated', true);
    if (w2g_generated === 'false') query = query.eq('w2g_generated', false);

    const { data: events, error } = await query;
    if (error) throw error;

    // Enrich with player names
    const playerIds = [...new Set((events || []).map(e => e.player_id).filter(Boolean))];
    let playerMap = {};
    if (playerIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, full_name')
        .in('id', playerIds);
      (profiles || []).forEach(p => { playerMap[p.id] = p.display_name || p.full_name || 'Unknown'; });
    }

    const enriched = (events || []).map(e => ({
      ...e,
      player_name: playerMap[e.player_id] || 'Unknown Player'
    }));

    // Summary stats
    const summary = {
      total_events: enriched.length,
      total_gross: enriched.reduce((s, e) => s + parseFloat(e.gross_amount || 0), 0),
      total_net: enriched.reduce((s, e) => s + parseFloat(e.net_amount || 0), 0),
      total_withholding: enriched.reduce((s, e) => s + parseFloat(e.withholding_amount || 0), 0),
      w2g_generated_count: enriched.filter(e => e.w2g_generated).length,
      w2g_pending_count: enriched.filter(e => !e.w2g_generated && e.withholding_required).length
    };

    return res.status(200).json({ success: true, data: { events: enriched, summary, year: targetYear } });
  } catch (error) {
    console.error('List tax events error:', error);
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
}

async function generateW2G(req, res) {
  const { tax_event_id, payer_name, payer_ein, payer_address, player_ssn_last4 } = req.body;

  if (!tax_event_id) {
    return res.status(400).json({ success: false, error: { code: 'MISSING_FIELDS', message: 'tax_event_id required' } });
  }

  try {
    // Get the tax event
    const { data: event, error: fetchErr } = await supabase
      .from('commander_tax_events')
      .select('*')
      .eq('id', tax_event_id)
      .single();

    if (fetchErr || !event) {
      return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Tax event not found' } });
    }

    // Get player info
    let playerName = 'Unknown';
    let playerAddress = '';
    if (event.player_id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name, full_name')
        .eq('id', event.player_id)
        .single();
      playerName = profile?.full_name || profile?.display_name || 'Unknown';
    }

    // Get venue info
    const { data: venue } = await supabase
      .from('poker_venues')
      .select('name, address, city, state, zip')
      .eq('id', event.venue_id)
      .single();

    const venueAddress = venue
      ? `${venue.address || ''}, ${venue.city || ''}, ${venue.state || ''} ${venue.zip || ''}`.trim()
      : '';

    // Calculate withholding
    const grossAmount = parseFloat(event.gross_amount);
    const buyIn = parseFloat(event.buy_in || 0);
    const netWinnings = grossAmount - buyIn;
    const withholdingAmount = Math.round(netWinnings * FEDERAL_WITHHOLDING_RATE * 100) / 100;

    // Generate W-2G form data
    const w2gData = {
      // Box 1: Reportable winnings
      box1_gross_winnings: grossAmount,
      // Box 2: Date won
      box2_date_won: event.event_date,
      // Box 3: Type of wager
      box3_wager_type: 'Poker Tournament',
      // Box 4: Federal income tax withheld
      box4_federal_withheld: withholdingAmount,
      // Box 5: Transaction (tournament details)
      box5_transaction: `Tournament - Buy-in: $${buyIn.toFixed(2)}`,
      // Box 6: Race (N/A for poker)
      box6_race: '',
      // Box 7: Winnings from identical wagers
      box7_identical_winnings: netWinnings,
      // Box 8: Cashier (N/A)
      box8_cashier: '',
      // Payer info
      payer_name: payer_name || venue?.name || 'Venue',
      payer_ein: payer_ein || '',
      payer_address: payer_address || venueAddress,
      // Winner info
      winner_name: playerName,
      winner_ssn_last4: player_ssn_last4 || event.player_ssn_last4 || '',
      // Meta
      tax_year: new Date(event.event_date).getFullYear(),
      generated_at: new Date().toISOString()
    };

    // Update the tax event
    const { data: updated, error: updateErr } = await supabase
      .from('commander_tax_events')
      .update({
        w2g_generated: true,
        withholding_amount: withholdingAmount,
        withholding_rate: FEDERAL_WITHHOLDING_RATE,
        player_ssn_last4: player_ssn_last4 || event.player_ssn_last4 || null,
        w2g_document_url: `w2g://${tax_event_id}` // Reference for retrieval
      })
      .eq('id', tax_event_id)
      .select()
      .single();

    if (updateErr) throw updateErr;

    return res.status(200).json({
      success: true,
      data: {
        w2g: w2gData,
        tax_event: updated,
        message: `W-2G generated for ${playerName} — $${grossAmount.toFixed(2)} gross, $${withholdingAmount.toFixed(2)} withheld`
      }
    });
  } catch (error) {
    console.error('Generate W2G error:', error);
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
}

async function updateTaxEvent(req, res) {
  const { tax_event_id, player_ssn_last4, notes, player_acknowledged } = req.body;

  if (!tax_event_id) {
    return res.status(400).json({ success: false, error: { code: 'MISSING_FIELDS', message: 'tax_event_id required' } });
  }

  try {
    const updates = {};
    if (player_ssn_last4 !== undefined) updates.player_ssn_last4 = player_ssn_last4;
    if (notes !== undefined) updates.notes = notes;
    if (player_acknowledged) {
      updates.player_acknowledged = true;
      updates.acknowledged_at = new Date().toISOString();
    }

    const { data: event, error } = await supabase
      .from('commander_tax_events')
      .update(updates)
      .eq('id', tax_event_id)
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json({ success: true, data: { event } });
  } catch (error) {
    console.error('Update tax event error:', error);
    return res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } });
  }
}
