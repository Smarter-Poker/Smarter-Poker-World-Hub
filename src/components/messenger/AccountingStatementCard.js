import React from 'react';
import { weeklyClubStatementRows } from '../../lib/accountingMessage.mjs';

export const statementAmount = value => value !== null && value !== undefined && Number.isFinite(Number(value))
    ? Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'Unavailable';
const day = instant => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(instant));

export default function AccountingStatementCard({ document, theme: C, variant = 'overview', onOpen, onDelete }) {
    const report = document.payload;
    const agent = document.scope === 'agent';
    const totals = agent ? report.totals : report;
    const rows = agent ? [
        ['Poker win / loss', totals.poker_net], ['Fees generated', totals.fees],
        ['Player rakeback', totals.player_rakeback], ['Agent net retained', totals.agent_net],
    ] : [
        ...weeklyClubStatementRows(totals.weekly_club_details, totals.rake_earned),
        ['Rakeback funding', totals.total_rake_funding],
        ['Paid to agents and players', totals.total_paid_by_club], ['Retained by club', totals.retained_by_club],
    ];
    const button = { background: 'transparent', border: `1px solid ${C.border}`, color: C.blue, borderRadius: 8, padding: '10px 12px', cursor: 'pointer' };
    return <article aria-label="Weekly Statement" data-document-design={variant} style={{ color: C.text, background: C.card,
        border: `1px solid ${C.border}`, borderTop: variant === 'ledger' ? `3px solid ${C.blue}` : undefined,
        borderRadius: variant === 'ledger' ? 8 : 16, padding: variant === 'compact' ? 16 : 24, width: '100%', boxSizing: 'border-box' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div><div style={{ color: C.blue, fontWeight: 700, fontSize: 12, letterSpacing: 1 }}>SMARTER.POKER · STATEMENT</div>
                <h2 style={{ margin: '8px 0', fontSize: 22 }}>{document.club_name}</h2>
                <div style={{ fontSize: 13, color: C.textSec }}>{day(report.period_start)} To {day(new Date(Date.parse(report.period_end) - 1).toISOString())} · Pacific</div>
            </div>
            <div style={{ color: C.textSec, fontSize: 12 }}>{agent ? 'You and your downline' : 'Club accounting'}<br />Amounts In Chips</div>
        </header>
        <dl style={{ display: 'grid', gridTemplateColumns: variant === 'overview' ? 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))' : '1fr', gap: variant === 'overview' ? 12 : 0, margin: '24px 0' }}>
            {rows.map(([label, value]) => <div key={label} style={{ padding: variant === 'overview' ? 14 : '12px 0', border: variant === 'overview' ? `1px solid ${C.border}` : undefined,
                borderBottom: `1px solid ${C.border}`, borderRadius: variant === 'overview' ? 10 : 0, display: variant === 'overview' ? 'block' : 'flex', justifyContent: 'space-between', gap: 12 }}>
                <dt style={{ color: C.textSec, fontSize: 12 }}>{label}</dt><dd style={{ margin: variant === 'overview' ? '8px 0 0' : 0,
                    fontSize: variant === 'overview' ? 23 : 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>{statementAmount(value)}</dd>
            </div>)}
        </dl>
        {!agent && <p style={{ fontSize: 12, lineHeight: 1.6, color: C.textSec }}>Full Weekly Net Summarizes The Week And Is Not An Additional Payment Request. Invoice Unpaid Shows The Separate Invoice Balance After Recorded Payments. Unavailable Figures Are Not Assumed To Be Zero.</p>}
        {agent && <details open={variant === 'ledger'}>
            <summary style={{ color: C.blue, cursor: 'pointer', padding: '8px 0' }}>Personal And Downline Detail · {report.people?.length || 0} People</summary>
            <div style={{ overflowX: 'auto', marginTop: 12 }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead><tr>{['Player', 'Poker W/L', 'Fees', 'Player RB', 'Agent net'].map(h => <th key={h} style={{ textAlign: h === 'Player' ? 'left' : 'right', padding: 8, color: C.textSec }}>{h}</th>)}</tr></thead>
                <tbody>{(report.people || []).map(person => <tr key={person.user_id}>
                    <th scope="row" style={{ textAlign: 'left', padding: 8, borderTop: `1px solid ${C.border}`, fontWeight: 500 }}>{person.name}<div style={{ color: C.textSec, fontSize: 11 }}>{String(person.role).replace(/_/g, ' ')}</div></th>
                    {['poker_net', 'fees', 'player_rakeback', 'agent_net'].map(key => <td key={key} style={{ textAlign: 'right', padding: 8, borderTop: `1px solid ${C.border}`, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{statementAmount(person[key])}</td>)}
                </tr>)}</tbody>
            </table></div>
            {(report.people || []).filter(p => p.user_id === report.agent_user_id).map(person => <p key={person.user_id} style={{ fontSize: 12, lineHeight: 1.8, color: C.textSec }}>
                Your Commission: {statementAmount(person.agent_commission)} · Own Play: {statementAmount(person.own_play_commission)} · Downline: {statementAmount(person.downline_commission)}<br />
                Sent To Agents: {statementAmount(person.sent_to_agents)} · Sent To Players: {statementAmount(person.sent_to_players)}
            </p>)}
        </details>}
        {!agent && <details open={variant === 'ledger'}><summary style={{ color: C.blue, cursor: 'pointer' }}>Distribution Detail</summary><dl>{[['Paid to super agents', totals.paid_super_agents], ['Paid to agents', totals.paid_agents], ['Paid to sub agents', totals.paid_sub_agents], ['Paid to players', totals.paid_players], ['Downstream redistribution', totals.downstream_redistributed]].map(([label,value]) => <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', gap: 12 }}><dt>{label}</dt><dd style={{ margin: 0 }}>{statementAmount(value)}</dd></div>)}</dl><p style={{ fontSize: 12, color: C.textSec }}>Downstream Redistribution Is Already Included In Direct Club Payments And Is Not Added Again.</p></details>}
        <footer style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
            <p style={{ color: C.textSec, fontSize: 12, lineHeight: 1.6, margin: '0 0 12px' }}>Saved Statement. Retained Until You Delete It. A Statement Summarizes Activity; Invoices Show Amounts Due.</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{onOpen && <button type="button" style={button} onClick={onOpen}>Open Conversation</button>}
                {onDelete && <button type="button" style={{ ...button, color: C.textSec }} onClick={onDelete}>Delete For Me</button>}</div>
        </footer>
    </article>;
}
