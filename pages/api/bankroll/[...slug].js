/**
 * /api/bankroll/* — Hono catch-all router (Phase 4.4 module #14, 2026-04-28)
 *
 * Consolidates 8 previously-separate handlers under a single Hono app, mirroring
 * the venues/calls/messenger/rewards/avatar pilots. Auth + rate-limit middleware
 * lives once at the top instead of being duplicated per file.
 *
 * Routes (mounted at /api/bankroll):
 *   GET  /linked-venues           — list user's bankroll_locations w/ poker_venue_id
 *   POST /geofence-visit          — record geofence entry (6h dedup window)
 *   POST /export                  — CSV / JSON export of ledger (premium)
 *   POST /projection              — Monte Carlo bankroll projection (premium)
 *   POST /scan-receipt            — Grok Vision OCR for expense receipts (premium)
 *   POST /scan-dealer-document    — Grok Vision OCR for licenses/W-2s (premium)
 *   GET  /export-pdf              — jspdf bankroll report (premium)
 *   GET  /tax-report              — jspdf IRS-ready session log w/ W-2G tracking (premium)
 *
 * Replaces:
 *   pages/api/bankroll/linked-venues.js          (99 LOC)
 *   pages/api/bankroll/geofence-visit.js         (106 LOC)
 *   pages/api/bankroll/export.js                 (194 LOC)
 *   pages/api/bankroll/projection.js             (188 LOC)
 *   pages/api/bankroll/scan-receipt.js           (174 LOC)
 *   pages/api/bankroll/scan-dealer-document.js   (158 LOC)
 *   pages/api/bankroll/export-pdf.js             (224 LOC)
 *   pages/api/bankroll/tax-report.js             (378 LOC)
 *   = 1521 LOC of boilerplate, now ~720 LOC with shared middleware.
 *
 * Auth pattern (post-4.1d ESM-clean):
 *   `getServerUserWithFallback(req, supabase)` — local HMAC verify (Web Crypto)
 *   first, GoTrue network fallback if JWT secret missing. Distinct from the
 *   older direct GoTrue call.
 *
 * Premium gate:
 *   `checkFeatureAccess(userId, 'bankroll_pro')` runs as a route-scoped middleware
 *   on the 6 routes that require it (export, projection, scan-receipt,
 *   scan-dealer-document, export-pdf, tax-report).
 *   linked-venues + geofence-visit do NOT require Bankroll Pro.
 *
 * jspdf strategy:
 *   Dynamic-import inside the handler (after auth + gate pass) — keeps the cold
 *   bundle small. Matches the Phase 4.3 pattern.
 *
 * Pages Router config:
 *   bodyParser sizeLimit 10mb (covers scan handlers; harmless elsewhere).
 *   responseLimit:false because export-pdf and tax-report can stream multi-MB PDFs.
 */

import { Hono } from 'hono';
import { handle } from 'hono/vercel';
import { createClient } from '../../../src/lib/supabaseServerClient';
import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { checkFeatureAccess } from '../../../src/lib/gates/premiumFeatureGate';
import { reportApiError } from '../../../src/lib/sentryWrap';
const { getServerUserWithFallback } = require('../../../src/lib/serverAuth');

// Pages Router config — covers the heaviest handler in the bundle.
export const config = {
  api: {
    bodyParser: { sizeLimit: '10mb' },
    responseLimit: false,
  },
};

// ─── Cached Supabase service-role client ──────────────────────────────────
let _supabase = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    _supabase = createClient(url, key);
  }
  return _supabase;
}

// ─── Hono app ─────────────────────────────────────────────────────────────
const app = new Hono().basePath('/api/bankroll');

// ─── Auth middleware (all bankroll routes require a logged-in user) ──────
app.use('*', async (c, next) => {
  const req = c.env?.req;
  try {
    const supabase = getSupabase();
    const { user: localUser } = await getServerUserWithFallback(req, supabase);
    if (!localUser) {
      return c.json({ success: false, error: 'Auth required' }, 401);
    }
    c.set('user', localUser);
    c.set('supabase', supabase);
    await next();
  } catch (err) {
    console.warn('[bankroll] auth error:', err);
    return c.json({ success: false, error: 'Invalid token' }, 401);
  }
});

// ─── Premium gate factory (used on 6 of 8 routes) ────────────────────────
const requirePremium = async (c, next) => {
  const user = c.get('user');
  const access = await checkFeatureAccess(user.id, 'bankroll_pro');
  if (!access.hasAccess) {
    return c.json({ success: false, error: 'Premium feature access required' }, 403);
  }
  await next();
};

// ─── Write rate-limit factory ────────────────────────────────────────────
const writeLimit = async (c, next) => {
  const req = c.env?.req;
  const res = c.env?.res;
  if (req && res && !applyRateLimit(req, res, LIMITS.write)) {
    return c.body(null, 429);
  }
  await next();
};

// ─── AI rate-limit factory (Grok Vision-backed routes) ───────────────────
const aiLimit = async (c, next) => {
  const req = c.env?.req;
  const res = c.env?.res;
  if (req && res && !applyRateLimit(req, res, LIMITS.ai)) {
    return c.body(null, 429);
  }
  await next();
};

// ─── Helper: Grok Vision OCR (shared by scan-receipt + scan-dealer-doc) ──
async function callGrokVision(imageBase64, prompt) {
  const GROK_API_KEY = process.env.XAI_API_KEY || process.env.GROK_API_KEY;
  if (!GROK_API_KEY) {
    throw new Error('Document scanning is not configured. Missing API key.');
  }

  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GROK_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'grok-2-vision-latest',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: imageBase64.startsWith('data:')
                  ? imageBase64
                  : `data:image/jpeg;base64,${imageBase64}`,
              },
            },
            { type: 'text', text: prompt },
          ],
        },
      ],
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    throw new Error(`OCR API error: ${response.status}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;
  const jsonMatch = content?.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Could not extract structured data from image');
  }
  return JSON.parse(jsonMatch[0]);
}

// ═══════════════════════════════════════════════════════════════════════════
// Routes — non-premium
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/bankroll/linked-venues
app.get('/linked-venues', async (c) => {
  // CDN cache hint mirrors the original handler
  c.header('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');

  const user = c.get('user');
  const supabase = c.get('supabase');

  try {
    const { data: linkedLocations, error } = await supabase
      .from('bankroll_locations')
      .select('id, name, venue_type, latitude, longitude, poker_venue_id')
      .eq('user_id', user.id)
      .not('poker_venue_id', 'is', null)
      .limit(100);

    if (error) throw error;

    if (!linkedLocations || linkedLocations.length === 0) {
      // Fall back to all poker_venues so geofence watch still has something.
      const { data: allVenues } = await supabase
        .from('poker_venues')
        .select('id, name, venue_type, latitude, longitude')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .limit(500);

      return c.json({
        success: true,
        venues: (allVenues || []).map((v) => ({
          id: v.id,
          name: v.name,
          venue_type: v.venue_type,
          latitude: v.latitude,
          longitude: v.longitude,
          linked: false,
        })),
        total: allVenues?.length || 0,
      });
    }

    return c.json({
      success: true,
      venues: linkedLocations.map((loc) => ({
        id: loc.poker_venue_id,
        bankroll_location_id: loc.id,
        name: loc.name,
        venue_type: loc.venue_type,
        latitude: loc.latitude,
        longitude: loc.longitude,
        linked: true,
      })),
      total: linkedLocations.length,
    });
  } catch (err) {
    console.warn('[bankroll/linked-venues] error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// POST /api/bankroll/geofence-visit
app.post('/geofence-visit', writeLimit, async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');

  const body = await c.req.json().catch(() => ({}));
  const { venueId, venueName } = body;

  if (!venueId) {
    return c.json({ success: false, error: 'venueId required' }, 400);
  }

  try {
    // Dedup: skip if a visit was already logged in the last 6h.
    const sixHoursAgo = new Date();
    sixHoursAgo.setHours(sixHoursAgo.getHours() - 6);

    const { data: recentVisit } = await supabase
      .from('geofence_visits')
      .select('id')
      .eq('user_id', user.id)
      .eq('venue_id', venueId)
      .gte('entered_at', sixHoursAgo.toISOString())
      .limit(1);

    if (recentVisit && recentVisit.length > 0) {
      return c.json({
        success: true,
        message: 'Recent visit already logged',
        existingVisitId: recentVisit[0].id,
      });
    }

    const { data: newVisit, error } = await supabase
      .from('geofence_visits')
      .insert({
        user_id: user.id,
        venue_id: venueId,
        venue_name: venueName || 'Poker Venue',
        entered_at: new Date().toISOString(),
        notified: false,
        session_logged: false,
      })
      .select()
      .maybeSingle();

    if (error) {
      console.warn('[bankroll/geofence-visit] insert error:', error);
      return c.json({ success: false, error: 'Internal server error' }, 500);
    }

    return c.json({
      success: true,
      message: 'Geofence visit recorded',
      visitId: newVisit.id,
      reminderScheduledFor: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
    });
  } catch (err) {
    console.warn('[bankroll/geofence-visit] error:', err);
    return c.json({ success: false, error: 'Failed to record visit' }, 500);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Routes — premium (bankroll_pro gate)
// ═══════════════════════════════════════════════════════════════════════════

// POST /api/bankroll/export
app.post('/export', writeLimit, requirePremium, async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');
  const body = await c.req.json().catch(() => ({}));
  const { format = 'csv', dateRange } = body;

  try {
    let query = supabase
      .from('bankroll_ledger')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_revision', false)
      .order('entry_date', { ascending: false })
      .limit(500);

    if (dateRange?.start) query = query.gte('entry_date', dateRange.start).limit(500);
    if (dateRange?.end) query = query.lte('entry_date', dateRange.end).limit(500);

    const { data: entries, error } = await query;
    if (error) {
      console.warn('[bankroll/export] supabase error:', error);
      return c.json({ success: false, error: 'Internal server error' }, 500);
    }

    if (!entries || entries.length === 0) {
      return c.json({ success: false, message: 'No entries to export' });
    }

    const exportData = entries.map((entry) => {
      const netPL = (entry.gross_out || 0) - (entry.gross_in || 0);
      return {
        date: entry.entry_date,
        category: entry.category || 'Other',
        buy_in: entry.gross_in || 0,
        cash_out: entry.gross_out || 0,
        net_pl: netPL,
        stakes: entry.stakes || '',
        game_type: entry.game_type || '',
        tournament_name: entry.tournament_name || '',
        start_time: entry.start_time || '',
        end_time: entry.end_time || '',
        emotional_tag: entry.emotional_tag || '',
        notes: entry.notes || '',
      };
    });

    const totalIn = exportData.reduce((sum, e) => sum + e.buy_in, 0);
    const totalOut = exportData.reduce((sum, e) => sum + e.cash_out, 0);
    const netPL = totalOut - totalIn;

    if (format === 'csv') {
      const headers = [
        'Date', 'Category', 'Buy-In', 'Cash-Out', 'Net P/L',
        'Stakes', 'Game Type', 'Tournament', 'Start Time', 'End Time', 'Mood', 'Notes',
      ];

      const rows = exportData.map((e) => [
        e.date, e.category, e.buy_in, e.cash_out, e.net_pl, e.stakes,
        e.game_type, e.tournament_name, e.start_time, e.end_time, e.emotional_tag,
        `"${(e.notes || '').replace(/"/g, '""')}"`,
      ]);

      rows.push([]);
      rows.push(['SUMMARY']);
      rows.push(['Total Sessions', entries.length]);
      rows.push(['Total Buy-Ins', totalIn]);
      rows.push(['Total Cash-Outs', totalOut]);
      rows.push(['Net P/L', netPL]);

      const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

      return c.json({
        success: true,
        format: 'csv',
        filename: `bankroll_export_${new Date().toISOString().split('T')[0]}.csv`,
        content: csvContent,
        summary: { sessions: entries.length, totalIn, totalOut, netPL },
      });
    }

    // JSON format
    return c.json({
      success: true,
      format: 'json',
      filename: `bankroll_export_${new Date().toISOString().split('T')[0]}.json`,
      data: exportData,
      summary: {
        sessions: entries.length,
        totalIn,
        totalOut,
        netPL,
        dateRange: {
          earliest: entries[entries.length - 1]?.entry_date,
          latest: entries[0]?.entry_date,
        },
      },
    });
  } catch (err) {
    console.warn('[bankroll/export] error:', err);
    return c.json({ success: false, error: 'Export failed' }, 500);
  }
});

// POST /api/bankroll/projection
const SIMULATION_COUNT = 1000;
function gaussianRandom(mean = 0, stdev = 1) {
  // Box-Muller transform
  const u = 1 - Math.random();
  const v = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return z * stdev + mean;
}

app.post('/projection', writeLimit, requirePremium, async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');
  const body = await c.req.json().catch(() => ({}));
  const { currentBankroll = 0, sessionsPerWeek = 3, projectionDays = 90 } = body;

  try {
    const { data: entries, error } = await supabase
      .from('bankroll_ledger')
      .select('gross_in, gross_out, entry_date')
      .eq('user_id', user.id)
      .order('entry_date', { ascending: false })
      .limit(100);

    if (error) {
      console.warn('[bankroll/projection] supabase error:', error);
      return c.json({ success: false, error: 'Internal server error' }, 500);
    }

    if (!entries || entries.length < 5) {
      return c.json({
        success: false,
        message: 'Need at least 5 sessions for projection analysis',
        minRequired: 5,
        currentCount: entries?.length || 0,
      });
    }

    const sessionResults = entries.map((e) => (e.gross_out || 0) - (e.gross_in || 0));
    const avgResult = sessionResults.reduce((a, b) => a + b, 0) / sessionResults.length;
    const squaredDiffs = sessionResults.map((r) => Math.pow(r - avgResult, 2));
    const stdDev = Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / sessionResults.length);

    const projectionWeeks = Math.ceil(projectionDays / 7);
    const totalSessions = projectionWeeks * sessionsPerWeek;

    const simulations = [];
    for (let sim = 0; sim < SIMULATION_COUNT; sim++) {
      let bankroll = currentBankroll;
      const path = [bankroll];
      for (let session = 0; session < totalSessions; session++) {
        bankroll += gaussianRandom(avgResult, stdDev);
        if ((session + 1) % sessionsPerWeek === 0) path.push(bankroll);
      }
      simulations.push({
        finalBankroll: bankroll,
        peak: Math.max(...path),
        trough: Math.min(...path),
        path,
      });
    }

    const finalBankrolls = simulations.map((s) => s.finalBankroll).sort((a, b) => a - b);
    const p5 = finalBankrolls[Math.floor(SIMULATION_COUNT * 0.05)];
    const p25 = finalBankrolls[Math.floor(SIMULATION_COUNT * 0.25)];
    const p50 = finalBankrolls[Math.floor(SIMULATION_COUNT * 0.50)];
    const p75 = finalBankrolls[Math.floor(SIMULATION_COUNT * 0.75)];
    const p95 = finalBankrolls[Math.floor(SIMULATION_COUNT * 0.95)];

    const profitableRuns = finalBankrolls.filter((b) => b > currentBankroll).length;
    const winProbability = Math.round((profitableRuns / SIMULATION_COUNT) * 100);

    const ruinRuns = simulations.filter((s) => s.trough <= 0).length;
    const ruinProbability = Math.round((ruinRuns / SIMULATION_COUNT) * 100);

    const maxDrawdowns = simulations.map((s) => currentBankroll - s.trough);
    const avgMaxDrawdown = Math.round(maxDrawdowns.reduce((a, b) => a + b, 0) / SIMULATION_COUNT);

    return c.json({
      success: true,
      projection: {
        timeframe: `${projectionDays} days`,
        sessionsSimulated: totalSessions,
        simulationRuns: SIMULATION_COUNT,
        pessimistic: Math.round(p5),
        conservative: Math.round(p25),
        expected: Math.round(p50),
        optimistic: Math.round(p75),
        bestCase: Math.round(p95),
        winProbability,
        ruinProbability,
        avgMaxDrawdown,
        expectedGain: Math.round(p50 - currentBankroll),
        expectedGainPercent:
          currentBankroll > 0 ? Math.round(((p50 - currentBankroll) / currentBankroll) * 100) : 0,
      },
      inputs: {
        currentBankroll,
        sessionsPerWeek,
        projectionDays,
        avgSessionResult: Math.round(avgResult),
        sessionStdDev: Math.round(stdDev),
        historicalSessions: entries.length,
      },
    });
  } catch (err) {
    console.warn('[bankroll/projection] error:', err);
    return c.json({ success: false, error: 'Projection failed' }, 500);
  }
});

// POST /api/bankroll/scan-receipt
app.post('/scan-receipt', aiLimit, requirePremium, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { image } = body;

  if (!image) {
    return c.json({ success: false, error: 'No image provided' }, 400);
  }

  const prompt = `Analyze this receipt image and extract the following information in JSON format:

{
  "category": "one of: buy_in, hotel, flights, rental_car, gas, meals, transport, tips, tournament, other",
  "amount": <number - total amount paid>,
  "currency": "USD or EUR",
  "vendor": "<business name>",
  "location": "<city, state if visible>",
  "date": "<YYYY-MM-DD format if visible>",
  "description": "<brief description of what was purchased>",
  "tax_deductible": <boolean - true if likely poker-related business expense>,
  "itemized": [
    {"item": "<item name>", "amount": <number>}
  ],
  "confidence": <0-100 confidence score>
}

If any field is not visible, use null. For poker buy-ins, look for "buy-in", "entry fee", "tournament", "cash", "chips". For hotels look for room rates, nights stayed. For meals look for food items, tips, total.`;

  try {
    const data = await callGrokVision(image, prompt);
    return c.json({ success: true, data });
  } catch (err) {
    console.warn('[bankroll/scan-receipt] error:', err);
    return c.json({ success: false, error: 'Failed to scan receipt' }, 500);
  }
});

// POST /api/bankroll/scan-dealer-document
app.post('/scan-dealer-document', aiLimit, requirePremium, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { image } = body;

  if (!image) {
    return c.json({ success: false, error: 'No image provided' }, 400);
  }

  const prompt = `Analyze this employment/tax document or gaming license and extract the following information in JSON format:

{
  "category": "MUST BE EXACTLY ONE OF: gaming_license, tax, employment, paystub",
  "sub_type": "If category=tax: 'w2' | '1099' | 'tip_log' | 'other'. If category=employment: 'i9' | 'contract' | 'ein_letter' | 'other'. Else null.",
  "label": "<a short descriptive name, e.g. Nevada Gaming License 2025, or W-2 2024>",
  "state": "<2-letter state code if applicable, e.g. NV, FL>",
  "license_number": "<the exact license or registration number if present>",
  "issued_date": "<YYYY-MM-DD if present>",
  "expiry_date": "<YYYY-MM-DD if present>",
  "tax_year": <number, e.g. 2024 or 2025 if it's a tax form or paystub year>,
  "amount": <number, e.g. the gross pay on a paystub, or Box 1 on a W-2>,
  "confidence": <0-100 confidence score>
}

If any field is not visible or not relevant to the document type, use null. Be sure to look for expiration dates on licenses to populate expiry_date. For paystubs look for 'Gross Pay' or 'Net Pay'. For tax forms like W-2s, look for Box 1 Wages. Format dates as YYYY-MM-DD.`;

  try {
    const data = await callGrokVision(image, prompt);
    return c.json({ success: true, data });
  } catch (err) {
    console.warn('[bankroll/scan-dealer-document] error:', err);
    return c.json({ success: false, error: 'Failed to scan document' }, 500);
  }
});

// GET /api/bankroll/export-pdf
app.get('/export-pdf', requirePremium, async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');
  const startDate = c.req.query('startDate');
  const endDate = c.req.query('endDate');
  const category = c.req.query('category');

  try {
    let query = supabase
      .from('bankroll_ledger')
      .select(
        'id, entry_date, category, gross_in, gross_out, notes, stakes, location_id, bankroll_locations(name)'
      )
      .eq('user_id', user.id)
      .order('entry_date', { ascending: false });

    if (startDate) query = query.gte('entry_date', startDate);
    if (endDate) query = query.lte('entry_date', endDate);
    if (category && category !== 'all') query = query.eq('category', category);

    const { data: entries, error } = await query;
    if (error) throw error;

    let totalGrossIn = 0;
    let totalGrossOut = 0;
    let winCount = 0;
    const sessionCount = entries?.length || 0;

    entries?.forEach((entry) => {
      totalGrossIn += entry.gross_in || 0;
      totalGrossOut += entry.gross_out || 0;
      if (((entry.gross_out || 0) - (entry.gross_in || 0)) > 0) winCount++;
    });

    const netResult = totalGrossOut - totalGrossIn;
    const winRate = sessionCount > 0 ? ((winCount / sessionCount) * 100).toFixed(1) : 0;
    const avgSession = sessionCount > 0 ? (netResult / sessionCount).toFixed(0) : 0;

    // Dynamic-import jspdf only after auth + feature-gate pass.
    const { jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFontSize(24);
    doc.setTextColor(0, 0, 0);
    doc.text('Bankroll Report', pageWidth / 2, 20, { align: 'center' });

    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    const dateRangeText = startDate && endDate ? `${startDate} to ${endDate}` : 'All Time';
    doc.text(`Period: ${dateRangeText}`, pageWidth / 2, 28, { align: 'center' });
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth / 2, 34, { align: 'center' });

    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text('Summary', 14, 48);

    autoTable(doc, {
      startY: 52,
      head: [],
      body: [
        ['Total Sessions', sessionCount.toString()],
        ['Net Result', `$${netResult.toLocaleString()}`],
        ['Win Rate', `${winRate}%`],
        ['Avg Session', `$${avgSession}`],
        ['Total Buy-ins', `$${totalGrossIn.toLocaleString()}`],
        ['Total Cash-outs', `$${totalGrossOut.toLocaleString()}`],
      ],
      theme: 'plain',
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 50 },
        1: { halign: 'right' },
      },
      styles: { fontSize: 11, cellPadding: 3 },
      margin: { left: 14, right: 14 },
    });

    let yPos = doc.lastAutoTable.finalY + 15;
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text('Session Details', 14, yPos);
    yPos += 4;

    const tableData =
      entries?.slice(0, 50).map((entry) => [
        entry.entry_date,
        entry.category
          ?.replace(/_/g, ' ')
          .split(' ')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ') || '',
        entry.bankroll_locations?.name || '-',
        `$${entry.gross_in?.toLocaleString() || 0}`,
        `$${entry.gross_out?.toLocaleString() || 0}`,
        `$${((entry.gross_out || 0) - (entry.gross_in || 0)).toLocaleString()}`,
      ]) || [];

    autoTable(doc, {
      startY: yPos,
      head: [['Date', 'Category', 'Location', 'Buy-in', 'Cash-out', 'Net']],
      body: tableData,
      theme: 'striped',
      headStyles: {
        fillColor: [30, 30, 40],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      alternateRowStyles: { fillColor: [245, 245, 245] },
      columnStyles: {
        0: { cellWidth: 25 },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
      },
      styles: { fontSize: 9, cellPadding: 3 },
      margin: { left: 14, right: 14 },
    });

    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(
        `Page ${i} of ${totalPages} | smarter.poker`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 10,
        { align: 'center' }
      );
    }

    const pdfBuffer = doc.output('arraybuffer');
    return new Response(Buffer.from(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="bankroll-report-${new Date().toISOString().split('T')[0]}.pdf"`,
      },
    });
  } catch (err) {
    console.warn('[bankroll/export-pdf] error:', err);
    return c.json({ error: err.message || 'Internal server error' }, 500);
  }
});

// GET /api/bankroll/tax-report
const W2G_THRESHOLDS = {
  poker: 5000, // $5,000+ net from poker tournament
  slots: 1200, // $1,200+ jackpot
  keno: 1500,  // $1,500+ keno win
  bingo: 1200, // $1,200+ bingo
};

function calculateTaxReport(sessions, trips, year) {
  let totalWinnings = 0;
  let totalLosses = 0;
  let cashGameWinnings = 0;
  let cashGameLosses = 0;
  let tournamentWinnings = 0;
  let tournamentLosses = 0;
  const w2gEvents = [];

  sessions.forEach((session) => {
    const net = (session.gross_out || 0) - (session.gross_in || 0);
    const isTournament = session.category === 'poker_mtt';

    if (net > 0) {
      totalWinnings += net;
      if (isTournament) {
        tournamentWinnings += net;
        if (net >= W2G_THRESHOLDS.poker) {
          w2gEvents.push({
            date: session.entry_date,
            type: 'Tournament',
            venue: session.venue_name || session.location,
            amount: net,
            threshold: W2G_THRESHOLDS.poker,
          });
        }
      } else {
        cashGameWinnings += net;
      }
    } else {
      totalLosses += Math.abs(net);
      if (isTournament) tournamentLosses += Math.abs(net);
      else cashGameLosses += Math.abs(net);
    }
  });

  let totalExpenses = 0;
  const expenseBreakdown = {
    hotel: 0, flights: 0, rental_car: 0, gas: 0, meals: 0,
    transport: 0, tips: 0, other: 0,
  };

  trips.forEach((trip) => {
    if (trip.expenses) {
      Object.keys(expenseBreakdown).forEach((key) => {
        const amount = trip.expenses[key] || 0;
        expenseBreakdown[key] += amount;
        totalExpenses += amount;
      });
    }
  });

  const netResult = totalWinnings - totalLosses;
  const taxableIncome = Math.max(0, netResult - totalExpenses);

  return {
    year,
    summary: {
      totalSessions: sessions.length,
      totalTrips: trips.length,
      totalWinnings,
      totalLosses,
      netGamblingResult: netResult,
      totalExpenses,
      taxableIncome,
    },
    breakdown: {
      cashGame: {
        winnings: cashGameWinnings,
        losses: cashGameLosses,
        net: cashGameWinnings - cashGameLosses,
      },
      tournament: {
        winnings: tournamentWinnings,
        losses: tournamentLosses,
        net: tournamentWinnings - tournamentLosses,
      },
    },
    expenses: expenseBreakdown,
    w2gEvents,
    sessions: sessions.map((s) => ({
      date: s.entry_date,
      venue: s.venue_name || s.location || 'Unknown',
      type: s.category === 'poker_mtt' ? 'Tournament' : 'Cash',
      buyIn: s.gross_in || 0,
      cashOut: s.gross_out || 0,
      net: (s.gross_out || 0) - (s.gross_in || 0),
    })),
  };
}

async function generateTaxPDF(report) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;

  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(`Poker Tax Report - ${report.year}`, pageWidth / 2, 20, { align: 'center' });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth / 2, 28, { align: 'center' });

  let yPos = 40;

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Annual Summary', 14, yPos);
  yPos += 8;

  autoTable(doc, {
    startY: yPos,
    head: [['Metric', 'Amount']],
    body: [
      ['Total Sessions', report.summary.totalSessions.toString()],
      ['Total Trips', report.summary.totalTrips.toString()],
      ['Gross Winnings', `$${report.summary.totalWinnings.toLocaleString()}`],
      ['Gross Losses', `($${report.summary.totalLosses.toLocaleString()})`],
      ['Net Gambling Result', `$${report.summary.netGamblingResult.toLocaleString()}`],
      ['Total Deductible Expenses', `($${report.summary.totalExpenses.toLocaleString()})`],
      ['Taxable Income', `$${report.summary.taxableIncome.toLocaleString()}`],
    ],
    theme: 'grid',
    styles: { fontSize: 10 },
    headStyles: { fillColor: [0, 100, 150] },
  });

  yPos = doc.lastAutoTable.finalY + 15;

  if (report.w2gEvents.length > 0) {
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('W2-G Reportable Events', 14, yPos);
    yPos += 8;

    autoTable(doc, {
      startY: yPos,
      head: [['Date', 'Type', 'Venue', 'Amount', 'Threshold']],
      body: report.w2gEvents.map((e) => [
        e.date,
        e.type,
        e.venue,
        `$${e.amount.toLocaleString()}`,
        `$${e.threshold.toLocaleString()}`,
      ]),
      theme: 'grid',
      styles: { fontSize: 9 },
      headStyles: { fillColor: [180, 50, 50] },
    });

    yPos = doc.lastAutoTable.finalY + 15;
  }

  if (report.uploadedW2gForms && report.uploadedW2gForms.length > 0) {
    if (yPos > 240) {
      doc.addPage();
      yPos = 20;
    }
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Uploaded W-2G Forms', 14, yPos);
    yPos += 8;

    autoTable(doc, {
      startY: yPos,
      head: [['Date', 'Type', 'Description', 'Amount']],
      body: report.uploadedW2gForms.map((f) => [
        f.date || '—',
        f.type || '—',
        (f.description || '—').substring(0, 30),
        f.amount ? `$${f.amount.toLocaleString()}` : '—',
      ]),
      theme: 'grid',
      styles: { fontSize: 9 },
      headStyles: { fillColor: [35, 116, 225] },
    });

    yPos = doc.lastAutoTable.finalY + 15;
  }

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Deductible Expense Breakdown', 14, yPos);
  yPos += 8;

  autoTable(doc, {
    startY: yPos,
    head: [['Category', 'Amount']],
    body: Object.entries(report.expenses || {})
      .filter(([, amount]) => amount > 0)
      .map(([cat, amount]) => [
        cat.replace('_', ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
        `$${amount.toLocaleString()}`,
      ]),
    theme: 'grid',
    styles: { fontSize: 10 },
    headStyles: { fillColor: [50, 150, 50] },
  });

  doc.addPage();
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Session-by-Session Log', 14, 20);

  autoTable(doc, {
    startY: 28,
    head: [['Date', 'Venue', 'Type', 'Buy-In', 'Cash Out', 'Net']],
    body: report.sessions.map((s) => [
      s.date,
      (s.venue || '').substring(0, 25),
      s.type,
      `$${s.buyIn.toLocaleString()}`,
      `$${s.cashOut.toLocaleString()}`,
      `$${s.net.toLocaleString()}`,
    ]),
    theme: 'striped',
    styles: { fontSize: 8 },
    headStyles: { fillColor: [0, 100, 150] },
  });

  const lastY = doc.lastAutoTable.finalY + 10;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.text(
    'This report is for informational purposes only. Consult a tax professional for official filing.',
    14,
    lastY
  );

  return doc.output('arraybuffer');
}

app.get('/tax-report', aiLimit, requirePremium, async (c) => {
  const user = c.get('user');
  const supabase = c.get('supabase');
  const yearRaw = c.req.query('year');
  const year = yearRaw ? parseInt(yearRaw, 10) : new Date().getFullYear();
  const format = c.req.query('format') || 'pdf';

  try {
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    const { data: sessions, error: sessionsError } = await supabase
      .from('bankroll_ledger')
      .select('*')
      .eq('user_id', user.id)
      .gte('entry_date', startDate)
      .lte('entry_date', endDate)
      .order('entry_date', { ascending: true })
      .limit(500);

    if (sessionsError) throw sessionsError;

    const { data: trips } = await supabase
      .from('trips')
      .select('*')
      .eq('user_id', user.id)
      .gte('start_date', startDate)
      .lte('end_date', endDate)
      .limit(100);

    const { data: uploadedW2g } = await supabase
      .from('w2g_forms')
      .select('*')
      .eq('user_id', user.id)
      .eq('tax_year', parseInt(year, 10))
      .order('upload_date', { ascending: true })
      .limit(100);

    const report = calculateTaxReport(sessions || [], trips || [], year);
    report.uploadedW2gForms = (uploadedW2g || []).map((f) => ({
      date: f.upload_date || f.created_at?.split('T')[0],
      type: f.form_type,
      description: f.source_description || f.file_name,
      amount: f.amount ? parseFloat(f.amount) : null,
      fileUrl: f.file_url,
    }));

    if (format === 'json') {
      return c.json(report);
    }

    const pdfBuffer = await generateTaxPDF(report);
    return new Response(Buffer.from(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename=poker_tax_report_${year}.pdf`,
      },
    });
  } catch (err) {
    console.warn('[bankroll/tax-report] error:', err);
    return c.json({ error: 'Failed to generate tax report' }, 500);
  }
});

// ─── Vercel adapter ───────────────────────────────────────────────────────
const handler = handle(app);

export default async function vercelHandler(req, res) {
  try {
    return await handler(req, res);
  } catch (err) {
    try {
      reportApiError(err, req);
    } catch (_sentryErr) {
      console.warn('[bankroll] handled exception:', _sentryErr?.message ?? _sentryErr);
    }
    console.warn('[bankroll] router error:', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}
