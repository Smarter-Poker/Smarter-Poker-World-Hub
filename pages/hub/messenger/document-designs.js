import React, { useState } from 'react';
import Head from 'next/head';
import AccountingStatementCard from '../../../src/components/messenger/AccountingStatementCard';
import AccountingInvoiceCard from '../../../src/components/messenger/AccountingInvoiceCard';

const theme = { bg: '#18191b', card: '#242526', text: '#e4e6eb', textSec: '#aeb3bc', border: '#3a3b3e', blue: '#0084ff' };
const variants = [['overview', '1 · Overview', 'Prominent totals with a clear, expandable breakdown.'], ['ledger', '2 · Ledger', 'A structured accounting layout with details open.'], ['compact', '3 · Compact', 'A shorter document with details available on demand.']];
const statement = { scope: 'agent', club_name: 'Example Club', payload: {
    period_start: '2026-11-09T08:00:00Z', period_end: '2026-11-16T08:00:00Z', agent_user_id: 'example-agent',
    totals: { poker_net: 425, fees: 320, player_rakeback: 16, agent_net: 144 },
    people: [{ user_id: 'example-agent', name: 'Your account', role: 'super_agent', poker_net: 300, fees: 200, player_rakeback: 0, agent_net: 144, agent_commission: 160, own_play_commission: 100, downline_commission: 60, sent_to_agents: 0, sent_to_players: 16 },
        { user_id: 'example-player', name: 'Downline player', role: 'player', poker_net: 125, fees: 120, player_rakeback: 16, agent_net: 0 }],
} };
const clubStatement = { scope: 'club', club_name: 'Example Club', payload: {
    period_start: '2026-11-09T08:00:00Z', period_end: '2026-11-16T08:00:00Z',
    rake_earned: 3200, total_rake_funding: 1600, total_paid_by_club: 1200, retained_by_club: 400,
    paid_super_agents: 600, paid_agents: 300, paid_sub_agents: 100, paid_players: 200, downstream_redistributed: 250,
    weekly_club_details: { version: 1, period_start: '2026-11-09T08:00:00Z', period_end: '2026-11-16T08:00:00Z', timezone: 'America/Los_Angeles',
        rake_status: 'certified', cash_rake: 2800, tournament_rake: 400, total_rake: 3200,
        player_results_status: 'recorded', weekly_player_results: { version: 1, sign_convention: 'positive_club_owes_union', total_net_loss: 5000, cash_net_loss: 4500, tournament_net_loss: 500, weekly_net_due_to_union: 4650 },
        settlement_status: 'recorded', settlement: { invoice_id: '11111111-1111-4111-8111-111111111111', invoice_number: 'SAMPLE-000001', direction: 'club owes union', remaining: 1250 } },
} };
const invoice = { kind: 'accounting_invoice', accounting_verified: true, invoice_type: 'union_weekly_squareup', invoice_number: 'SAMPLE-000001', amount: 1250, status: 'generated', period_start: '2026-11-09T08:00:00Z', period_end: '2026-11-16T08:00:00Z', lines: { union_name: 'Example Union', club_name: 'Example Club', direction: 'club owes union', rake_generated: 3200, rakeback_due: 1600, union_fee_kept: 1600, eco_amount: 1250, presettled: 0 } };

export default function DocumentDesigns() {
    const [kind, setKind] = useState('statements');
    const [statementScope, setStatementScope] = useState('club');
    return <main style={{ minHeight: '100vh', background: theme.bg, color: theme.text, padding: '32px 20px 80px', fontFamily: 'Inter, system-ui, sans-serif' }}>
        <Head><title>Document Designs | Smarter.Poker</title><meta name="robots" content="noindex,nofollow" /></Head>
        <div style={{ maxWidth: 1400, margin: '0 auto' }}>
            <a href="/hub/messenger" style={{ color: theme.blue }}>Back To Messenger</a>
            <h1 style={{ fontSize: 32, marginBottom: 10 }}>Your Weekly Books, Clearly Presented.</h1>
            <p style={{ color: theme.textSec, maxWidth: 680, lineHeight: 1.6 }}>Three Design Options For Invoices And Statements. These Are Illustrative Examples With Sample Figures, Not Issued Financial Documents.</p>
            <div role="tablist" aria-label="Document Type" style={{ display: 'flex', gap: 12, margin: '24px 0' }}>{['statements', 'invoices'].map(tab => <button key={tab} role="tab" aria-selected={kind === tab}
                onClick={() => setKind(tab)} style={{ cursor: 'pointer', border: `1px solid ${kind === tab ? theme.blue : theme.border}`, borderRadius: 10, padding: '12px 24px', color: theme.text, background: theme.card }}>{tab === 'statements' ? 'Statements' : 'Invoices'}</button>)}</div>
            {kind === 'statements' && <label style={{ display: 'block', marginBottom: 20, color: theme.textSec }}>Statement Recipient <select aria-label="Statement Recipient" value={statementScope} onChange={event => setStatementScope(event.target.value)} style={{ marginLeft: 12, padding: 10, borderRadius: 8, background: theme.card, color: theme.text, border: `1px solid ${theme.border}` }}><option value="club">Club</option><option value="agent">Agent And Downline</option></select></label>}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 24 }}>
                {variants.map(([variant, title, description]) => <section key={variant}><h2 style={{ color: theme.blue }}>{title}</h2><p style={{ color: theme.textSec, minHeight: 44, fontSize: 14 }}>{description}</p>
                    {kind === 'statements' ? <AccountingStatementCard document={statementScope === 'club' ? clubStatement : statement} theme={theme} variant={variant} />
                        : <AccountingInvoiceCard theme={theme} variant={variant} fullWidth meta={invoice} content={'Issued by: Example Union\nIssued to: Example Club\nClub pays union: 1,250.00 chips\nRecorded payments: 0.00\nRemaining unpaid: 1,250.00\nDue: November 19, 2026'} />}
                </section>)}
            </div>
        </div>
    </main>;
}
