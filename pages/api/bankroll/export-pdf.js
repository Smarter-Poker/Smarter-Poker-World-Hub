import { getServerUserWithFallback } from '../../src/lib/serverAuth';
/**
 * PDF EXPORT API
 * Generate PDF reports for bankroll data
 */

import { createClient } from '../../../src/lib/supabaseServerClient';
import { checkFeatureAccess } from '../../../src/lib/gates/premiumFeatureGate';
import { reportApiError } from '../../../src/lib/sentryWrap';


let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://kuklfnapbkmacvwxktbh.supabase.co';
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

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
          const access = await checkFeatureAccess(userId, 'bankroll_pro');
          if (!access.hasAccess) {
              return res.status(403).json({ error: 'Bankroll Pro or VIP required' });
          }

          // Query parameters
          const { startDate, endDate, category } = req.query;

          // Build query
          let query = getSupabase()
              .from('bankroll_ledger')
              .select(`
          id,
          entry_date,
          category,
          gross_in,
          gross_out,
          notes,
          stakes,
          location_id,
          bankroll_locations(name)
        `)
              .eq('user_id', userId)
              .order('entry_date', { ascending: false });

          if (startDate) {
              query = query.gte('entry_date', startDate);
          }
          if (endDate) {
              query = query.lte('entry_date', endDate);
          }
          if (category && category !== 'all') {
              query = query.eq('category', category);
          }

          const { data: entries, error } = await query;
          if (error) throw error;

          // Calculate summary stats
          let totalGrossIn = 0;
          let totalGrossOut = 0;
          let winCount = 0;
          let sessionCount = entries?.length || 0;

          entries?.forEach(entry => {
              totalGrossIn += entry.gross_in || 0;
              totalGrossOut += entry.gross_out || 0;
              if ((entry.gross_out - entry.gross_in) > 0) winCount++;
          });

          const netResult = totalGrossOut - totalGrossIn;
          const winRate = sessionCount > 0 ? ((winCount / sessionCount) * 100).toFixed(1) : 0;
          const avgSession = sessionCount > 0 ? (netResult / sessionCount).toFixed(0) : 0;

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
          doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth / 2, 34, { align: 'center' });

          // Summary Stats Box
          doc.setFontSize(14);
          doc.setTextColor(0, 0, 0);
          doc.text('Summary', 14, 48);

          doc.setFontSize(11);
          doc.setTextColor(60, 60, 60);

          const summaryData = [
              ['Total Sessions', sessionCount.toString()],
              ['Net Result', `$${netResult.toLocaleString()}`],
              ['Win Rate', `${winRate}%`],
              ['Avg Session', `$${avgSession}`],
              ['Total Buy-ins', `$${totalGrossIn.toLocaleString()}`],
              ['Total Cash-outs', `$${totalGrossOut.toLocaleString()}`],
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

          const tableData = entries?.slice(0, 50).map(entry => ([
              entry.entry_date,
              entry.category?.replace(/_/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || '',
              entry.bankroll_locations?.name || '-',
              `$${entry.gross_in?.toLocaleString() || 0}`,
              `$${entry.gross_out?.toLocaleString() || 0}`,
              `$${((entry.gross_out || 0) - (entry.gross_in || 0)).toLocaleString()}`
          ])) || [];

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
          res.setHeader('Content-Disposition', `attachment; filename="bankroll-report-${new Date().toISOString().split('T')[0]}.pdf"`);
          res.send(Buffer.from(pdfBuffer));

      } catch (err) {
          console.warn('[PDF Export] Error:', err);
          res.status(500).json({ error: err.message });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_sentryErr) { console.warn('[App] Handled exception:', _sentryErr?.message || _sentryErr); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
