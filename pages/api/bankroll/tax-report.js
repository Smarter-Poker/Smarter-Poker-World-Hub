import { getServerUserWithFallback } from '../../../src/lib/serverAuth';
/**
 * TAX REPORT GENERATOR API
 * Generate IRS-ready session logs with W2-G tracking
 */

import { getServiceSupabase as getSupabase } from '../../../src/lib/apiSupabase';
import { reportApiError } from '../../../src/lib/apiErrorHandler';

import { applyRateLimit } from '../../../src/lib/apiRateLimit';
import { guardBankrollRequest, taxReportRequest } from '../../../src/lib/bankroll/apiGuard.mjs';
import { checkServerFeatureAccess } from '../../../src/lib/gates/serverFeatureGate';


import { fetchAllRows, formatUsd, SESSION_CATEGORIES } from '../../../src/lib/bankroll/ledgerReport.mjs';
import { taxYearTotals, w2gThresholds } from '../../../src/lib/bankroll/taxMath.mjs';

const TAX_LIMIT = { max: 20, windowMs: 60_000, scope: ':bankroll-tax' };

export default async function handler(req, res) {
  try {
      // Its own bucket. LIMITS.ai (5 a minute) was written for a billed model
      // call; this is a ledger read, and the panel loads a preview on every
      // year switch, so the fifth switch in a minute failed with a 429 the
      // panel reported as "Could Not Generate The Report".
      if (!applyRateLimit(req, res, TAX_LIMIT)) return;

      const user = await guardBankrollRequest(req, res, {
          methods: ['GET'],
          verify: (request) => getServerUserWithFallback(request, getSupabase()),
      });
      if (!user) return;

      // SERVER-SIDE GUARD: Verify user has Bankroll Pro access
      const access = await checkServerFeatureAccess(getSupabase(), user.id, 'bankroll_pro');
      if (!access.hasAccess) {
          return res.status(403).json({ success: false, error: 'Premium feature access required' });
      }

      // A strict four-digit year: parseInt('2025abc') used to read as 2025,
      // and an unknown format silently became a PDF.
      const input = taxReportRequest(req.query);
      if (input.error) return res.status(400).json({ success: false, error: input.error });
      const { format } = input;

      try {
          // Fetch every current ledger row for the year. Superseded revisions
          // used to be counted next to the entry that replaced them, and the
          // read stopped at 500 rows.
          const taxYear = input.year;
          const startDate = `${taxYear}-01-01`;
          const endDate = `${taxYear}-12-31`;

          const sessions = await fetchAllRows(() => getSupabase()
              .from('bankroll_ledger')
              .select('id, entry_date, category, gross_in, gross_out, expense_type, tournament_name, is_revision, created_at, bankroll_locations(name)')
              .eq('user_id', user.id)
              .eq('is_revision', false)
              .gte('entry_date', startDate)
              .lte('entry_date', endDate)
              .order('entry_date', { ascending: true })
              .order('created_at', { ascending: true })
              .order('id', { ascending: true }));

          // Trips the player actually keeps (bankroll_trips) that overlap the year.
          const { data: trips, error: tripsError } = await getSupabase()
              .from('bankroll_trips')
              .select('id, start_date, end_date, status')
              .eq('user_id', user.id)
              .neq('status', 'deleted')
              .lte('start_date', endDate)
              .or(`end_date.is.null,end_date.gte.${startDate}`)
              .limit(1000);
          // A failed read used to print "0 trips" as if it were true.
          if (tripsError) throw tripsError;

          // Fetch uploaded W-2G forms for the year
          const { data: uploadedW2g, error: w2gError } = await getSupabase()
              .from('w2g_forms')
              .select('upload_date, created_at, form_type, source_description, file_name, gross_amount, withholding_amount, federal_withheld, state_withheld, file_url')
              .eq('user_id', user.id)
              .eq('tax_year', taxYear)
              .order('upload_date', { ascending: true })
              .limit(1000);
          // Same for the uploaded forms: a failed read is not "no W-2Gs".
          if (w2gError) throw w2gError;

          // Calculate totals
          const report = calculateTaxReport(sessions || [], trips || [], taxYear);

          // Merge uploaded W-2G forms into report
          // w2g_forms holds gross_amount and withholding_amount. This read
          // said `f.amount`, a column that does not exist, so every uploaded
          // W-2G printed "-" for its amount on the tax report.
          report.uploadedW2gForms = (uploadedW2g || []).map(f => ({
              date: f.upload_date || f.created_at?.split('T')[0],
              type: f.form_type,
              description: f.source_description || f.file_name,
              amount: f.gross_amount !== null && f.gross_amount !== undefined ? parseFloat(f.gross_amount) : null,
              withheld: f.withholding_amount !== null && f.withholding_amount !== undefined ? parseFloat(f.withholding_amount) : null,
              // A return wants the two figures APART, which is why migration
              // 20260908232953 split them and why the reader has been filling
              // both in since. Reporting only the total gave a player a number
              // they could not get back to the two the form actually prints.
              federalWithheld: f.federal_withheld !== null && f.federal_withheld !== undefined ? parseFloat(f.federal_withheld) : null,
              stateWithheld: f.state_withheld !== null && f.state_withheld !== undefined ? parseFloat(f.state_withheld) : null,
              fileUrl: f.file_url,
          }));

          if (format === 'json') {
              return res.status(200).json(report);
          }

          // Generate PDF
          const pdfBuffer = await generateTaxPDF(report, input.today);

          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename=poker_tax_report_${taxYear}.pdf`);
          return res.send(Buffer.from(pdfBuffer));

      } catch (error) {
          console.warn('Tax report error:', error);
          return res.status(500).json({ success: false, error: 'Failed to generate tax report' });
      }

  } catch (err) {
      try { reportApiError(err, req); } catch (_reportError) { console.warn('[App] Handled exception:', _reportError?.message || _reportError); }
    console.warn('[API Error]', err);
    if (!res.headersSent) return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

function calculateTaxReport(rows, trips, year) {
    const totals = taxYearTotals(rows, year);
    const threshold = w2gThresholds(year).poker;
    const venueOf = (row) => row.bankroll_locations?.name || row.tournament_name || 'Unknown';
    const games = rows.filter(row => !row.is_revision && SESSION_CATEGORIES.includes(row.category));
    const net = (row) => Math.round(((Number(row.gross_out) || 0) - (Number(row.gross_in) || 0)) * 100) / 100;

    const side = (match) => {
        let winnings = 0, losses = 0;
        for (const row of games.filter(match)) {
            const n = net(row);
            if (n > 0) winnings += n; else losses += -n;
        }
        winnings = Math.round(winnings * 100) / 100;
        losses = Math.round(losses * 100) / 100;
        return { winnings, losses, net: Math.round((winnings - losses) * 100) / 100 };
    };

    // A poker tournament win is W-2G reportable at $5,000 or more net of the buy-in.
    const w2gEvents = games
        .filter(row => row.category === 'poker_mtt' && net(row) >= threshold)
        .map(row => ({ date: row.entry_date, type: 'Tournament', venue: venueOf(row), amount: net(row), threshold }));

    // Expenses are the ledger's own expense entries, by type. The old read
    // took them from a `trips.expenses` object that is a number column, so
    // every report showed $0 of expenses.
    const expenses = {};
    for (const row of rows) {
        if (row.is_revision || row.category !== 'expense') continue;
        const key = row.expense_type || 'other';
        expenses[key] = Math.round(((expenses[key] || 0) + Math.abs(Number(row.gross_in) || 0)) * 100) / 100;
    }

    return {
        year,
        summary: {
            totalSessions: totals.sessions,
            totalTrips: trips.length,
            totalWinnings: totals.winnings,
            totalLosses: totals.losses,
            netGamblingResult: totals.net,
            lossDeductionRate: totals.lossDeductionRate,
            deductibleLosses: totals.deductibleLosses,
            totalExpenses: totals.recordedExpenses,
            // Gambling income left after the losses the law allows. Expenses
            // are listed apart: only a professional gambler may deduct them.
            taxableIncome: Math.round((totals.winnings - totals.deductibleLosses) * 100) / 100,
        },
        quarters: totals.quarters,
        breakdown: {
            cashGame: side(row => row.category !== 'poker_mtt'),
            tournament: side(row => row.category === 'poker_mtt'),
        },
        expenses,
        w2gEvents,
        sessions: games.map(s => ({
            date: s.entry_date,
            venue: venueOf(s),
            type: s.category === 'poker_mtt' ? 'Tournament' : s.category === 'poker_cash' ? 'Cash' : s.category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            buyIn: Number(s.gross_in) || 0,
            cashOut: Number(s.gross_out) || 0,
            net: net(s),
        }))
    };
}

async function generateTaxPDF(report, generatedDay) {
        // Dynamic-import jspdf only after auth + feature-gate pass (Phase 4.3)
    const { default: jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;

    // Header
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(`Poker Tax Report - ${report.year}`, pageWidth / 2, 20, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${generatedDay}`, pageWidth / 2, 28, { align: 'center' });

    let yPos = 40;

    // Annual Summary
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
            ['Gross Winnings', formatUsd(report.summary.totalWinnings)],
            ['Gross Losses', formatUsd(-report.summary.totalLosses)],
            ['Net Gambling Result', formatUsd(report.summary.netGamblingResult)],
            [report.summary.lossDeductionRate < 1 ? 'Deductible Losses (90%, Capped At Winnings)' : 'Deductible Losses (Capped At Winnings)', formatUsd(-report.summary.deductibleLosses)],
            ['Taxable Gambling Income', formatUsd(report.summary.taxableIncome)],
            ['Recorded Expenses (Professional Gamblers Only)', formatUsd(-report.summary.totalExpenses)],
        ],
        theme: 'grid',
        styles: { fontSize: 10 },
        headStyles: { fillColor: [0, 100, 150] },
    });

    yPos = doc.lastAutoTable.finalY + 15;

    // W2-G Events
    if (report.w2gEvents.length > 0) {
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('W2-G Reportable Events', 14, yPos);
        yPos += 8;

        autoTable(doc, {
            startY: yPos,
            head: [['Date', 'Type', 'Venue', 'Amount', 'Threshold']],
            body: report.w2gEvents.map(e => [
                e.date,
                e.type,
                e.venue,
                formatUsd(e.amount),
                formatUsd(e.threshold)
            ]),
            theme: 'grid',
            styles: { fontSize: 9 },
            headStyles: { fillColor: [180, 50, 50] },
        });

        yPos = doc.lastAutoTable.finalY + 15;
    }

    // Uploaded W-2G Forms
    if (report.uploadedW2gForms && report.uploadedW2gForms.length > 0) {
        if (yPos > 240) { doc.addPage(); yPos = 20; }
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Uploaded W-2G Forms', 14, yPos);
        yPos += 8;

        autoTable(doc, {
            startY: yPos,
            head: [['Date', 'Type', 'Description', 'Gross', 'Withheld']],
            body: report.uploadedW2gForms.map(f => [
                f.date || '-',
                f.type || '-',
                (f.description || '-').substring(0, 30),
                f.amount !== null ? formatUsd(f.amount) : '-',
                f.withheld !== null ? formatUsd(f.withheld) : '-'
            ]),
            theme: 'grid',
            styles: { fontSize: 9 },
            headStyles: { fillColor: [35, 116, 225] },
        });

        yPos = doc.lastAutoTable.finalY + 15;
    }

    // Expense Breakdown
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Recorded Expense Breakdown', 14, yPos);
    yPos += 8;

    autoTable(doc, {
        startY: yPos,
        head: [['Category', 'Amount']],
        body: Object.entries(report.expenses || {})
            .filter(([, amount]) => amount > 0)
            .map(([cat, amount]) => [
                cat.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                formatUsd(amount)
            ]),
        theme: 'grid',
        styles: { fontSize: 10 },
        headStyles: { fillColor: [50, 150, 50] },
    });

    yPos = doc.lastAutoTable.finalY + 15;

    // Session Log (new page)
    doc.addPage();
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Session-by-Session Log', 14, 20);

    autoTable(doc, {
        startY: 28,
        head: [['Date', 'Venue', 'Type', 'Buy-In', 'Cash Out', 'Net']],
        body: report.sessions.map(s => [
            s.date,
            String(s.venue).substring(0, 25),
            s.type,
            formatUsd(s.buyIn),
            formatUsd(s.cashOut),
            formatUsd(s.net)
        ]),
        theme: 'striped',
        styles: { fontSize: 8 },
        headStyles: { fillColor: [0, 100, 150] },
    });

    // Disclaimer
    const lastY = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.text(
        'This report is for informational purposes only. Consult a tax professional for official filing.',
        14, lastY
    );

    return doc.output('arraybuffer');
}
