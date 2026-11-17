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
const invoice = { kind: 'accounting_invoice', accounting_verified: true, invoice_type: 'union_weekly_squareup', invoice_number: 'SAMPLE-000001', amount: 1250, status: 'generated', period_start: '2026-11-09T08:00:00Z', period_end: '2026-11-16T08:00:00Z', lines: { union_name: 'Example Union', club_name: 'Example Club', direction: 'club owes union', rake_generated: 3200, rakeback_due: 1600, union_fee_kept: 1600, eco_amount: 1250, presettled: 0 } };

export default function DocumentDesigns() {
    const [kind, setKind] = useState('statements');
    return <main style={{ minHeight: '100vh', background: theme.bg, color: theme.text, padding: '32px 20px 80px', fontFamily: 'Inter, system-ui, sans-serif' }}>
        <Head><title>Document designs | Smarter.Poker</title><meta name="robots" content="noindex,nofollow" /></Head>
        <div style={{ maxWidth: 1400, margin: '0 auto' }}>
            <a href="/hub/messenger" style={{ color: theme.blue }}>Back to Messenger</a>
            <h1 style={{ fontSize: 32, marginBottom: 10 }}>Your weekly books, clearly presented.</h1>
            <p style={{ color: theme.textSec, maxWidth: 680, lineHeight: 1.6 }}>Three design options for invoices and statements. These are illustrative examples with sample figures, not issued financial documents.</p>
            <div role="tablist" aria-label="Document type" style={{ display: 'flex', gap: 12, margin: '24px 0' }}>{['statements', 'invoices'].map(tab => <button key={tab} role="tab" aria-selected={kind === tab}
                onClick={() => setKind(tab)} style={{ cursor: 'pointer', border: `1px solid ${kind === tab ? theme.blue : theme.border}`, borderRadius: 10, padding: '12px 24px', color: theme.text, background: theme.card }}>{tab === 'statements' ? 'Statements' : 'Invoices'}</button>)}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 24 }}>
                {variants.map(([variant, title, description]) => <section key={variant}><h2 style={{ color: theme.blue }}>{title}</h2><p style={{ color: theme.textSec, minHeight: 44, fontSize: 14 }}>{description}</p>
                    {kind === 'statements' ? <AccountingStatementCard document={statement} theme={theme} variant={variant} />
                        : <AccountingInvoiceCard theme={theme} variant={variant} fullWidth meta={invoice} content={'Issued by: Example Union\nIssued to: Example Club\nClub pays union: 1,250.00 chips\nRecorded payments: 0.00\nRemaining unpaid: 1,250.00\nDue: November 19, 2026'} />}
                </section>)}
            </div>
        </div>
    </main>;
}
