// Tax Packet (2026-11-28): one PDF for a tax year that a player can hand to
// a preparer. It is built from the same rules as the Tax Report:
// - winnings, losses and the deductible share from taxMath.taxYearTotals
//   (from 2026 only 90% of losses, and never more than winnings);
// - W-2G thresholds from taxMath.w2gThresholds (slots $2,000 from 2026);
// - mileage at the IRS rate in force on each gig's own date
//   (tokeReport.irsMileageRate: 72.5 cents through 2026-06-30, 76 cents from
//   2026-07-01).
// Every figure is US dollars and summed in cents. Nothing here is tax advice
// and the document says so on every page.

import { CATEGORY_NAMES, SESSION_CATEGORIES, formatUsd } from './ledgerReport.mjs';
import { lossDeductionRate, taxYearTotals, w2gThresholds } from './taxMath.mjs';
import { irsMileageRate } from './tokeReport.mjs';

const cents = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
const inYear = (day, year) => String(day || '').slice(0, 4) === String(year);
const title = (key) => String(key || 'other').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

export const NOT_TAX_ADVICE = 'Not tax advice. These are records and estimates from your Bankroll Manager entries. Confirm every figure with a tax professional before you file.';

/**
 * Everything the packet prints, computed once.
 * - rows: bankroll_ledger rows (is_revision false), with bankroll_locations(name)
 * - w2gForms: w2g_forms rows for the year
 * - gigs: toke_gigs rows (start_date, venue_name, mileage)
 */
export function buildTaxPacket({ rows = [], w2gForms = [], gigs = [], year }) {
  const y = Number(year);
  const current = rows.filter((r) => r && !r.is_revision && inYear(r.entry_date, y));
  const totals = taxYearTotals(current, y);

  const sessions = current
    .filter((r) => SESSION_CATEGORIES.includes(r.category))
    .sort((a, b) => String(a.entry_date).localeCompare(String(b.entry_date)) || String(a.created_at || '').localeCompare(String(b.created_at || '')))
    .map((r) => ({
      date: r.entry_date,
      venue: r.bankroll_locations?.name || r.tournament_name || '',
      type: CATEGORY_NAMES[r.category] || r.category,
      buyIn: cents(r.gross_in) / 100,
      cashOut: cents(r.gross_out) / 100,
      net: (cents(r.gross_out) - cents(r.gross_in)) / 100,
    }));

  // Expenses by type, the same amount rule as taxYearTotals.recordedExpenses.
  const byType = new Map();
  for (const r of current) {
    if (r.category !== 'expense') continue;
    const amount = Math.abs(cents(r.gross_in) || cents(r.gross_out) - cents(r.gross_in));
    const key = r.expense_type || 'other';
    byType.set(key, (byType.get(key) || 0) + amount);
  }
  const expenses = [...byType.entries()].map(([type, c]) => ({ type, label: title(type), amount: c / 100 })).sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label));

  const w2g = w2gForms
    .filter((f) => f && Number(f.tax_year) === y)
    .map((f) => ({
      date: f.upload_date || String(f.created_at || '').slice(0, 10) || '',
      type: title(f.form_type),
      description: f.source_description || f.file_name || '',
      gross: num(f.gross_amount),
      federalWithheld: num(f.federal_withheld),
      stateWithheld: num(f.state_withheld),
      withheld: num(f.withholding_amount),
      fileUrl: f.file_url || '',
    }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const w2gGross = w2g.reduce((s, f) => s + cents(f.gross), 0) / 100;
  const w2gWithheld = w2g.reduce((s, f) => s + cents(f.federalWithheld ?? f.withheld), 0) / 100;

  let mileageCents = 0;
  let miles = 0;
  const mileage = gigs
    .filter((g) => g && inYear(g.start_date, y) && Number(g.mileage) > 0)
    .sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)))
    .map((g) => {
      const m = Math.round(Number(g.mileage) * 10) / 10;
      const rate = irsMileageRate(g.start_date);
      const amount = Math.round(m * rate * 100);
      mileageCents += amount;
      miles += m;
      return { date: String(g.start_date).slice(0, 10), venue: g.venue_name || '', miles: m, rate, amount: amount / 100 };
    });

  const thresholds = w2gThresholds(y);
  return {
    year: y,
    currency: 'USD',
    cover: {
      sessions: totals.sessions,
      winnings: totals.winnings,
      losses: totals.losses,
      lossDeductionRate: lossDeductionRate(y),
      deductibleLosses: totals.deductibleLosses,
      net: totals.net,
      taxableGamblingIncome: Math.round((totals.winnings - totals.deductibleLosses) * 100) / 100,
      expenses: totals.recordedExpenses,
      w2gCount: w2g.length,
      w2gGross,
      w2gWithheld,
      miles: Math.round(miles * 10) / 10,
      mileageDeduction: mileageCents / 100,
      thresholds,
    },
    quarters: totals.quarters,
    sessions,
    expenses,
    w2g,
    mileage,
  };
}

const rateText = (rate) => `$${rate.toFixed(3).replace(/0$/, '')}/mi`;

/**
 * The packet as a PDF (ArrayBuffer). jsPDF and autoTable are passed in so the
 * route imports them only after the request is authorised.
 */
export function renderTaxPacketPdf(JsPDF, autoTable, packet, generatedDay) {
  const doc = new JsPDF();
  const width = doc.internal.pageSize.getWidth();
  const c = packet.cover;
  const heading = (text, y) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(0, 0, 0);
    doc.text(text, 14, y);
  };
  const next = (gap = 12) => {
    let y = doc.lastAutoTable.finalY + gap;
    if (y > 260) { doc.addPage(); y = 20; }
    return y;
  };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text(`Gambling Tax Packet - ${packet.year}`, width / 2, 20, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(90, 90, 90);
  doc.text(`Generated ${generatedDay} from your Smarter.Poker Bankroll Manager. All amounts are US dollars (USD).`, width / 2, 28, { align: 'center' });

  heading('Summary', 40);
  const lossLabel = c.lossDeductionRate < 1
    ? `Deductible Losses (${Math.round(c.lossDeductionRate * 100)}% Of Losses, Capped At Winnings)`
    : 'Deductible Losses (Capped At Winnings)';
  autoTable(doc, {
    startY: 44,
    head: [['Item', 'Amount (USD)']],
    body: [
      ['Gaming Sessions', String(c.sessions)],
      ['Gross Winnings (Winning Sessions)', formatUsd(c.winnings)],
      ['Gross Losses (Losing Sessions)', formatUsd(-c.losses)],
      [lossLabel, formatUsd(-c.deductibleLosses)],
      ['Net Gambling Result', formatUsd(c.net)],
      ['Gambling Income After Deductible Losses', formatUsd(c.taxableGamblingIncome)],
      [`W-2G Forms In The Vault (${c.w2gCount})`, formatUsd(c.w2gGross)],
      ['Federal Tax Withheld On Those W-2Gs', formatUsd(c.w2gWithheld)],
      ['Recorded Expenses (Deductible Only For Professional Gamblers)', formatUsd(-c.expenses)],
      [`Dealer Mileage (${c.miles} mi At The IRS Rate On Each Date)`, formatUsd(c.mileageDeduction)],
    ],
    theme: 'grid',
    styles: { fontSize: 9 },
    headStyles: { fillColor: [0, 100, 150] },
    columnStyles: { 1: { halign: 'right' } },
  });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(90, 90, 90);
  doc.text(`W-2G thresholds for ${packet.year}: slots and bingo $${c.thresholds.slots.toLocaleString('en-US')}, keno $${c.thresholds.keno.toLocaleString('en-US')}, poker tournaments $${c.thresholds.poker.toLocaleString('en-US')}.`, 14, doc.lastAutoTable.finalY + 6);

  let y = next(16);
  heading('Quarterly Results', y);
  autoTable(doc, {
    startY: y + 4,
    head: [['Quarter', 'Sessions', 'Winnings', 'Losses', 'Net']],
    body: packet.quarters.map((q) => [q.label, String(q.sessions), formatUsd(q.winnings), formatUsd(-q.losses), formatUsd(q.net)]),
    theme: 'grid',
    styles: { fontSize: 9 },
    headStyles: { fillColor: [0, 100, 150] },
  });

  y = next();
  heading('W-2G Forms Filed In The Vault', y);
  const w2gRows = packet.w2g.length
    ? packet.w2g.map((f) => [f.date || '-', f.type, String(f.description).slice(0, 40) || '-',
      f.gross === null ? '-' : formatUsd(f.gross),
      f.federalWithheld === null ? (f.withheld === null ? '-' : formatUsd(f.withheld)) : formatUsd(f.federalWithheld),
      f.stateWithheld === null ? '-' : formatUsd(f.stateWithheld),
      f.fileUrl ? 'Open Image' : '-'])
    : [['No W-2G forms are filed for this year.', '', '', '', '', '', '']];
  autoTable(doc, {
    startY: y + 4,
    head: [['Date', 'Type', 'Payer / Description', 'Gross', 'Federal Withheld', 'State Withheld', 'Image']],
    body: w2gRows,
    theme: 'grid',
    styles: { fontSize: 8 },
    headStyles: { fillColor: [180, 50, 50] },
    didDrawCell: (hook) => {
      const form = packet.w2g[hook.row.index];
      if (hook.section === 'body' && hook.column.index === 6 && form && form.fileUrl) {
        const { x, y: top, width: w, height: h } = hook.cell;
        doc.link(x, top, w, h, { url: form.fileUrl });
      }
    },
  });
  if (packet.w2g.some((f) => f.fileUrl)) {
    const links = packet.w2g.filter((f) => f.fileUrl);
    y = next(8);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(40, 40, 140);
    for (const f of links) {
      if (y > 280) { doc.addPage(); y = 20; }
      doc.textWithLink(`${f.date || '-'} ${f.type}: ${f.fileUrl}`.slice(0, 160), 14, y, { url: f.fileUrl });
      y += 4;
    }
    doc.lastAutoTable.finalY = y;
  }

  y = next();
  heading('Expenses By Type', y);
  autoTable(doc, {
    startY: y + 4,
    head: [['Type', 'Amount (USD)']],
    body: packet.expenses.length ? packet.expenses.map((e) => [e.label, formatUsd(e.amount)]) : [['No expenses are recorded for this year.', '']],
    theme: 'grid',
    styles: { fontSize: 9 },
    headStyles: { fillColor: [50, 150, 50] },
    columnStyles: { 1: { halign: 'right' } },
  });

  y = next();
  heading('Mileage By Date', y);
  autoTable(doc, {
    startY: y + 4,
    head: [['Date', 'Venue', 'Miles', 'IRS Rate', 'Amount (USD)']],
    body: packet.mileage.length
      ? packet.mileage.map((m) => [m.date, String(m.venue).slice(0, 40), String(m.miles), rateText(m.rate), formatUsd(m.amount)])
      : [['No mileage is recorded for this year.', '', '', '', '']],
    theme: 'grid',
    styles: { fontSize: 9 },
    headStyles: { fillColor: [90, 90, 160] },
  });

  doc.addPage();
  heading(`Session Log (${packet.sessions.length})`, 20);
  autoTable(doc, {
    startY: 24,
    head: [['Date', 'Venue', 'Type', 'Buy-In', 'Cash-Out', 'Net']],
    body: packet.sessions.length
      ? packet.sessions.map((s) => [s.date, String(s.venue).slice(0, 28), s.type, formatUsd(s.buyIn), formatUsd(s.cashOut), formatUsd(s.net)])
      : [['No gaming sessions are recorded for this year.', '', '', '', '', '']],
    theme: 'striped',
    styles: { fontSize: 8 },
    headStyles: { fillColor: [0, 100, 150] },
  });

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.setTextColor(110, 110, 110);
    const h = doc.internal.pageSize.getHeight();
    doc.text(doc.splitTextToSize(NOT_TAX_ADVICE, width - 50), 14, h - 10);
    doc.text(`Page ${p} of ${pages}`, width - 14, h - 10, { align: 'right' });
  }
  return doc.output('arraybuffer');
}
