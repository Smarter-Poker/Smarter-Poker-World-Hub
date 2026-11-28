import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * TAX PACKET API (2026-11-28)
 * One PDF for a tax year: a cover summary, quarterly results, the W-2Gs filed
 * in the Vault (with links to their images), expenses by type, dealer mileage
 * at the IRS rate on each date, and the full session log. All USD. Built from
 * taxMath.mjs through src/lib/bankroll/taxPacket.mjs, so it agrees with the
 * Tax Report screen and the tax-report route.
 */

import { getServiceSupabase as getSupabase } from '../../../src/lib/apiSupabase';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { applyRateLimit } from '../../../src/lib/apiRateLimit';
import { guardBankrollRequest, taxPacketRequest } from '../../../src/lib/bankroll/apiGuard.mjs';
import { checkServerFeatureAccess } from '../../../src/lib/gates/serverFeatureGate';
import { fetchAllRows } from '../../../src/lib/bankroll/ledgerReport.mjs';
import { buildTaxPacket, renderTaxPacketPdf } from '../../../src/lib/bankroll/taxPacket.mjs';

// A whole year's ledger is read and a PDF built in this lambda.
const PACKET_LIMIT = { max: 6, windowMs: 60_000, scope: ':bankroll-tax-packet' };

export default async function handler(req, res) {
  try {
    if (!applyRateLimit(req, res, PACKET_LIMIT)) return;

    const user = await guardBankrollRequest(req, res, {
      methods: ['GET'],
      verify: (request) => getServerUserWithFallback(request, getSupabase()),
    });
    if (!user) return;

    const input = taxPacketRequest(req.query);
    if (input.error) return res.status(400).json({ success: false, error: input.error });

    // The packet is part of Tax Reports, which is Bankroll Pro.
    const access = await checkServerFeatureAccess(getSupabase(), user.id, 'bankroll_pro');
    if (!access.hasAccess) {
      return res.status(403).json({ success: false, error: 'Premium feature access required' });
    }

    const { year } = input;
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    let rows, w2gForms, gigs;
    try {
      rows = await fetchAllRows(() => getSupabase()
        .from('bankroll_ledger')
        .select('id, entry_date, category, gross_in, gross_out, expense_type, tournament_name, is_revision, created_at, bankroll_locations(name)')
        .eq('user_id', user.id)
        .eq('is_revision', false)
        .gte('entry_date', startDate)
        .lte('entry_date', endDate)
        .order('entry_date', { ascending: true })
        .order('created_at', { ascending: true })
        .order('id', { ascending: true }));
      w2gForms = await fetchAllRows(() => getSupabase()
        .from('w2g_forms')
        .select('id, tax_year, upload_date, created_at, form_type, source_description, file_name, gross_amount, withholding_amount, federal_withheld, state_withheld, file_url')
        .eq('user_id', user.id)
        .eq('tax_year', year)
        .order('upload_date', { ascending: true })
        .order('id', { ascending: true }));
      gigs = await fetchAllRows(() => getSupabase()
        .from('toke_gigs')
        .select('id, start_date, venue_name, mileage')
        .eq('user_id', user.id)
        .gte('start_date', startDate)
        .lte('start_date', endDate)
        .order('start_date', { ascending: true })
        .order('id', { ascending: true }));
    } catch (readError) {
      // A failed read is not an empty year.
      console.warn('[tax-packet] read failed:', readError?.message || readError);
      return res.status(500).json({ success: false, error: 'Could not read your records for the tax packet' });
    }

    const packet = buildTaxPacket({ rows, w2gForms, gigs, year });

    // Dynamic import only after auth, validation and the feature gate pass.
    const { jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');
    const pdf = renderTaxPacketPdf(jsPDF, autoTable, packet, input.today);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=tax_packet_${year}.pdf`);
    return res.status(200).send(Buffer.from(pdf));
  } catch (err) {
    try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
