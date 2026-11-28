import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * PDF EXPORT API
 * Generate PDF reports for bankroll data
 */

import { getServiceSupabase as getSupabase } from '../../../src/lib/apiSupabase';
import { checkServerFeatureAccess } from '../../../src/lib/gates/serverFeatureGate';
import { reportApiError } from '../../../src/lib/apiErrorHandler';
import { CATEGORY_NAMES, entryNetCents, fetchAllRows, formatUsd, summarizeLedger } from '../../../src/lib/bankroll/ledgerReport.mjs';



export default async function handler(req, res) {
  try {
      if (req.method !== 'GET') {
          return res.status(405).json({ error: 'Method not allowed' });
      }

      try {
          // Auth check
          const authHeader = req.headers.authorization;
          if (!authHeader) {
              return res.status(401).json({ error: 'Unauthorized' });
          }
          const token = authHeader.replace('Bearer ', '');
          const { user: authUser, error: authErr } = await getServerUserWithFallback(req, getSupabase());
    const authData = { user: authUser };
          const user = authData?.user;
          if (authErr || !user) {
              return res.status(401).json({ error: 'Invalid token' });
          }
          const userId = user.id;

          // ═══ PREMIUM GATE ═══
          const access = await checkServerFeatureAccess(getSupabase(), userId, 'bankroll_pro');
          if (!access.hasAccess) {
              return res.status(403).json({ error: 'Bankroll Pro or VIP required' });
          }

          // Query parameters
          const { startDate, endDate, category } = req.query;

          // Every current row: superseded revisions are excluded (they were
          // counted alongside the entry that replaced them) and the read pages
          // past PostgREST's row cap instead of truncating the totals.
          const entries = await fetchAllRows(() => {
              let query = getSupabase()
                  .from('bankroll_ledger')
                  .select('id, entry_date, category, gross_in, gross_out, notes, stakes, location_id, created_at, bankroll_locations(name)')
                  .eq('user_id', userId)
                  .eq('is_revision', false);
              if (startDate) query = query.gte('entry_date', startDate);
              if (endDate) query = query.lte('entry_date', endDate);
              if (category && category !== 'all') query = query.eq('category', category);
              return query
                  .order('entry_date', { ascending: false })
                  .order('created_at', { ascending: false })
                  .order('id', { ascending: false });
          });

          // Sessions, win rate and net cover gaming entries only. Deposits and
          // withdrawals are bankroll movements, not results.
          const totals = summarizeLedger(entries);
          const generatedDay = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.today || '')) ? req.query.today : new Date().toISOString().slice(0, 10);

          // Generate PDF
          // Dynamic-import jspdf only after auth + feature-gate pass (Phase 4.3)
          const { jsPDF } = await import('jspdf');
          const { default: autoTable } = await import('jspdf-autotable');

          const doc = new jsPDF();
          const pageWidth = doc.internal.pageSize.getWidth();

          // Header
          doc.setFontSize(24);
          doc.setTextColor(0, 0, 0);
          doc.text('Bankroll Report', pageWidth / 2, 20, { align: 'center' });

          // Date range
          doc.setFontSize(10);
          doc.setTextColor(100, 100, 100);
          const dateRangeText = startDate && endDate
              ? `${startDate} to ${endDate}`
              : 'All Time';
          doc.text(`Period: ${dateRangeText}`, pageWidth / 2, 28, { align: 'center' });
          doc.text(`Generated: ${generatedDay}`, pageWidth / 2, 34, { align: 'center' });

          // Summary Stats Box
          doc.setFontSize(14);
          doc.setTextColor(0, 0, 0);
          doc.text('Summary', 14, 48);

          doc.setFontSize(11);
          doc.setTextColor(60, 60, 60);

          const summaryData = [
              ['Gaming Sessions', totals.sessions.toString()],
              ['Session Net', formatUsd(totals.sessionNet)],
              ['Win Rate', `${totals.winRate}%`],
              ['Avg Session', formatUsd(totals.averageSession)],
              ['Session Buy-ins', formatUsd(totals.totalBuyIns)],
              ['Session Cash-outs', formatUsd(totals.totalCashOuts)],
              ['Expenses', formatUsd(-totals.expenses)],
              ['Net After Expenses', formatUsd(totals.netAfterExpenses)],
              ['Deposits', formatUsd(totals.deposits)],
              ['Withdrawals', formatUsd(totals.withdrawals)],
          ];

          autoTable(doc, {
              startY: 52,
              head: [],
              body: summaryData,
              theme: 'plain',
              columnStyles: {
                  0: { fontStyle: 'bold', cellWidth: 50 },
                  1: { halign: 'right' }
              },
              styles: {
                  fontSize: 11,
                  cellPadding: 3,
              },
              margin: { left: 14, right: 14 }
          });

          // Sessions Table
          let yPos = doc.lastAutoTable.finalY + 15;
          doc.setFontSize(14);
          doc.setTextColor(0, 0, 0);
          doc.text('Session Details', 14, yPos);
          yPos += 4;

          // Every entry is listed; autoTable paginates. The old 50-row cut
          // left the rest of the ledger out of the document without a word.
          const tableData = entries.map(entry => ([
              entry.entry_date,
              CATEGORY_NAMES[entry.category] || entry.category || '',
              entry.bankroll_locations?.name || '-',
              formatUsd(entry.gross_in || 0),
              formatUsd(entry.gross_out || 0),
              formatUsd(entryNetCents(entry) / 100)
          ]));

          autoTable(doc, {
              startY: yPos,
              head: [['Date', 'Category', 'Location', 'Buy-in', 'Cash-out', 'Net']],
              body: tableData,
              theme: 'striped',
              headStyles: {
                  fillColor: [30, 30, 40],
                  textColor: [255, 255, 255],
                  fontStyle: 'bold'
              },
              alternateRowStyles: {
                  fillColor: [245, 245, 245]
              },
              columnStyles: {
                  0: { cellWidth: 25 },
                  3: { halign: 'right' },
                  4: { halign: 'right' },
                  5: { halign: 'right' },
              },
              styles: {
                  fontSize: 9,
                  cellPadding: 3,
              },
              margin: { left: 14, right: 14 }
          });

          // Footer
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

          // Output PDF
          const pdfBuffer = doc.output('arraybuffer');

          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename="bankroll-report-${generatedDay}.pdf"`);
          res.send(Buffer.from(pdfBuffer));

      } catch (err) {
          console.warn('[PDF Export] Error:', err);
          res.status(500).json({ error: 'PDF export failed' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
