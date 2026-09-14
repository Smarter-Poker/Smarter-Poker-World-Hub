import React from 'react';

const amount = value => value !== null && value !== undefined && Number.isFinite(Number(value))
    ? Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'Not Available';

export default function AccountingInvoiceCard({ meta, content, theme: C }) {
    const weekly = meta.invoice_type === 'club_weekly_accounting';
    const lines = meta.lines || {};
    const rows = weekly ? [
        ['Rake Earned', lines.rake_earned],
        ['Rake Received From Union', lines.rake_received],
        ['Rakeback Sent To Super Agents', lines.paid_super_agents],
        ['Rakeback Sent To Agents', lines.paid_agents],
        ['Rakeback Sent To Sub-Agents', lines.paid_sub_agents],
        ['Rakeback Sent To Players', lines.paid_players],
        ['Total Paid By Club', lines.total_paid_by_club],
        ['Retained By Club', lines.retained_by_club],
    ] : [['Amount', meta.amount]];
    return <article aria-label={weekly ? 'Weekly Club Statement' : 'Accounting Invoice'}
        style={{ background: C.card, color: C.text, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, width: 'min(320px, 65vw)', maxWidth: '100%', boxSizing: 'border-box' }}>
        <div style={{ fontSize: 12, color: C.textSec }}>{weekly ? 'Weekly Club Statement' : 'Invoice'} · {meta.invoice_number}</div>
        {(lines.period_start || meta.period_start) && <div style={{ fontSize: 12, marginTop: 6, color: C.textSec }}>
            {String(lines.period_start || meta.period_start).slice(0, 10)} To {String(lines.period_end || meta.period_end || '').slice(0, 10)}
        </div>}
        <dl style={{ margin: '12px 0' }}>
            {rows.map(([label, value]) => <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '7px 0', borderBottom: `1px solid ${C.border}`, fontSize: 13 }}>
                <dt>{label}</dt><dd style={{ margin: 0, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{amount(value)}</dd>
            </div>)}
        </dl>
        <div style={{ fontSize: 12, color: C.textSec }}>Chips · {String(meta.status || 'Status Unavailable').replace(/_/g, ' ')}</div>
        <details style={{ marginTop: 12 }}><summary style={{ cursor: 'pointer', color: C.blue, fontSize: 13 }}>View Invoice Details</summary>
            <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 12, lineHeight: 1.6, marginTop: 10 }}>{content}</div>
        </details>
    </article>;
}
