/**
 * TAX REPORT GENERATOR API
 * Generate IRS-ready session logs with W2-G tracking
 */

import { createClient } from '@supabase/supabase-js';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import { applyRateLimit, LIMITS } from '../../../src/lib/apiRateLimit';
import { checkFeatureAccess } from '../../../src/lib/gates/premiumFeatureGate';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// W2-G thresholds
const W2G_THRESHOLDS = {
    poker: 5000,      // $5,000+ net from poker tournament
    slots: 1200,      // $1,200+ jackpot  
    keno: 1500,       // $1,500+ keno win
    bingo: 1200,      // $1,200+ bingo
};

export default async function handler(req, res) {
    if (!applyRateLimit(req, res, LIMITS.ai)) return;

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
        return res.status(401).json({ error: 'Invalid token' });
    }

    // SERVER-SIDE GUARD: Verify user has Bankroll Pro access
    const access = await checkFeatureAccess(user.id, 'bankroll_pro');
    if (!access.hasAccess) {
        return res.status(403).json({ error: 'Premium feature access required' });
    }

    const { year = new Date().getFullYear(), format = 'pdf' } = req.query;

    try {
        // Fetch all sessions for the year
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

        // Fetch all expenses for the year (from trips)
        const { data: trips } = await supabase
            .from('trips')
            .select('*')
            .eq('user_id', user.id)
            .gte('start_date', startDate)
            .lte('end_date', endDate)
            .limit(100);

        // Fetch uploaded W-2G forms for the year
        const { data: uploadedW2g } = await supabase
            .from('w2g_forms')
            .select('*')
            .eq('user_id', user.id)
            .eq('tax_year', parseInt(year))
            .order('upload_date', { ascending: true })
            .limit(100);

        // Calculate totals
        const report = calculateTaxReport(sessions || [], trips || [], year);

        // Merge uploaded W-2G forms into report
        report.uploadedW2gForms = (uploadedW2g || []).map(f => ({
            date: f.upload_date || f.created_at?.split('T')[0],
            type: f.form_type,
            description: f.source_description || f.file_name,
            amount: f.amount ? parseFloat(f.amount) : null,
            fileUrl: f.file_url,
        }));

        if (format === 'json') {
            return res.status(200).json(report);
        }

        // Generate PDF
        const pdfBuffer = generateTaxPDF(report, user);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=poker_tax_report_${year}.pdf`);
        return res.send(Buffer.from(pdfBuffer));

    } catch (error) {
        console.error('Tax report error:', error);
        return res.status(500).json({ error: 'Failed to generate tax report' });
    }
}

function calculateTaxReport(sessions, trips, year) {
    // Session stats
    let totalWinnings = 0;
    let totalLosses = 0;
    let cashGameWinnings = 0;
    let cashGameLosses = 0;
    let tournamentWinnings = 0;
    let tournamentLosses = 0;
    const w2gEvents = [];

    sessions.forEach(session => {
        const net = (session.gross_out || 0) - (session.gross_in || 0);
        const isTournament = session.category === 'poker_mtt';

        if (net > 0) {
            totalWinnings += net;
            if (isTournament) {
                tournamentWinnings += net;
                // Check W2-G threshold for tournaments
                if (net >= W2G_THRESHOLDS.poker) {
                    w2gEvents.push({
                        date: session.entry_date,
                        type: 'Tournament',
                        venue: session.venue_name || session.location,
                        amount: net,
                        threshold: W2G_THRESHOLDS.poker
                    });
                }
            } else {
                cashGameWinnings += net;
            }
        } else {
            totalLosses += Math.abs(net);
            if (isTournament) {
                tournamentLosses += Math.abs(net);
            } else {
                cashGameLosses += Math.abs(net);
            }
        }
    });

    // Expense totals from trips
    let totalExpenses = 0;
    const expenseBreakdown = {
        hotel: 0,
        flights: 0,
        rental_car: 0,
        gas: 0,
        meals: 0,
        transport: 0,
        tips: 0,
        other: 0
    };

    trips.forEach(trip => {
        if (trip.expenses) {
            Object.keys(expenseBreakdown).forEach(key => {
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
                net: cashGameWinnings - cashGameLosses
            },
            tournament: {
                winnings: tournamentWinnings,
                losses: tournamentLosses,
                net: tournamentWinnings - tournamentLosses
            }
        },
        expenses: expenseBreakdown,
        w2gEvents,
        sessions: sessions.map(s => ({
            date: s.entry_date,
            venue: s.venue_name || s.location || 'Unknown',
            type: s.category === 'poker_mtt' ? 'Tournament' : 'Cash',
            buyIn: s.gross_in || 0,
            cashOut: s.gross_out || 0,
            net: (s.gross_out || 0) - (s.gross_in || 0)
        }))
    };
}

function generateTaxPDF(report, user) {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;

    // Header
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(`Poker Tax Report - ${report.year}`, pageWidth / 2, 20, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth / 2, 28, { align: 'center' });

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
                `$${e.amount.toLocaleString()}`,
                `$${e.threshold.toLocaleString()}`
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
            head: [['Date', 'Type', 'Description', 'Amount']],
            body: report.uploadedW2gForms.map(f => [
                f.date || '—',
                f.type || '—',
                (f.description || '—').substring(0, 30),
                f.amount ? `$${f.amount.toLocaleString()}` : '—'
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
    doc.text('Deductible Expense Breakdown', 14, yPos);
    yPos += 8;

    autoTable(doc, {
        startY: yPos,
        head: [['Category', 'Amount']],
        body: Object.entries(report.expenses)
            .filter(([, amount]) => amount > 0)
            .map(([cat, amount]) => [
                cat.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
                `$${amount.toLocaleString()}`
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
            s.venue.substring(0, 25),
            s.type,
            `$${s.buyIn.toLocaleString()}`,
            `$${s.cashOut.toLocaleString()}`,
            `$${s.net.toLocaleString()}`
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
