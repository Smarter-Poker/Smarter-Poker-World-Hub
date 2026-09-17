import React from 'react';
import { cashierInvoiceDisplay, correctionInvoiceDisplay, creditChangeInvoiceDisplay } from '../../lib/accountingMessage.mjs';

const amount = value => value !== null && value !== undefined && Number.isFinite(Number(value))
    ? Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'Not Available';

export default function AccountingInvoiceCard({ meta, content, theme: C }) {
    const correction = correctionInvoiceDisplay(meta);
    const credit = creditChangeInvoiceDisplay(meta);
    const weekly = !correction && meta.invoice_type === 'club_weekly_accounting';
    const cashier = cashierInvoiceDisplay(meta);
    const lines = meta.lines || {};
    const rows = credit ? credit.rows : weekly ? [
        ['Rake Earned', lines.rake_earned],
        ['Rake Received From Union', lines.rake_received],
        ['Rakeback Sent To Super Agents', lines.paid_super_agents],
        ['Rakeback Sent To Agents', lines.paid_agents],
        ['Rakeback Sent To Sub-Agents', lines.paid_sub_agents],
        ['Rakeback Sent To Players', lines.paid_players],
        ['Rakeback Awaiting Role Reconciliation', lines.paid_unclassified],
        ['Total Paid By Club', lines.total_paid_by_club],
        ['Retained By Club', lines.retained_by_club],
        ['Further Sent By Agents', lines.downstream_redistributed],
    ] : [[correction ? 'Correction amount' : 'Amount', meta.amount]];
    return <article aria-label={credit ? 'Credit Change Record' : correction ? 'Correction Record' : cashier ? 'Cashier Receipt' : weekly ? 'Weekly Club Statement' : 'Accounting Invoice'}
        style={{ background: C.card, color: C.text, border: `1px solid ${C.border}`, borderRadius: 12, padding: 16, width: 'min(320px, 65vw)', maxWidth: '100%', boxSizing: 'border-box' }}>
        <div style={{ fontSize: 12, color: C.textSec }}>{credit ? credit.label : correction ? correction.label : cashier ? cashier.label : weekly ? 'Weekly Club Statement' : 'Invoice'}{!credit && !correction && meta.invoice_number ? ` · ${meta.invoice_number}` : ''}</div>
        {!credit && !cashier && !correction && (lines.period_start || meta.period_start) && <div style={{ fontSize: 12, marginTop: 6, color: C.textSec }}>
            {String(lines.period_start || meta.period_start).slice(0, 10)} To {String(lines.period_end || meta.period_end || '').slice(0, 10)}
        </div>}
        {!credit && !correction && meta.status === 'needs_reconciliation' && <p role="status" style={{ fontSize: 12, lineHeight: 1.5 }}>Needs Reconciliation · These Posted Amounts Are Not A Certified Settlement.</p>}
        <dl style={{ margin: '12px 0' }}>
            {rows.map(([label, value]) => <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '7px 0', borderBottom: `1px solid ${C.border}`, fontSize: 13 }}>
                <dt>{label}</dt><dd style={{ margin: 0, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{credit ? value : correction ? correction.amount : cashier ? cashier.amount : amount(value)}</dd>
            </div>)}
        </dl>
        <div style={{ fontSize: 12, color: C.textSec }}>{credit ? `Credit capacity · ${credit.status}` : <>Chips · {correction ? correction.status : cashier ? cashier.verified ? cashier.label : 'Details Unavailable' : String(meta.status || 'Status Unavailable').replace(/_/g, ' ')}</>}</div>
        {credit && <p role={credit.verified ? undefined : 'status'} style={{ fontSize: 12, lineHeight: 1.5 }}>{credit.detail}</p>}
        {correction && <p role={correction.verified ? undefined : 'status'} style={{ fontSize: 12, lineHeight: 1.5 }}>{correction.detail}</p>}
        {cashier && <p role={cashier.verified ? undefined : 'status'} style={{ fontSize: 12, lineHeight: 1.5 }}>{cashier.detail}</p>}
        {weekly && <p style={{ fontSize: 12, lineHeight: 1.5 }}>{lines.note || 'Club Payments Are Counted Once. Further Payments By Agents Are Shown Separately.'}</p>}
        {!credit && !cashier && !correction && <details style={{ marginTop: 12 }}><summary style={{ cursor: 'pointer', color: C.blue, fontSize: 13 }}>{meta.preview ? 'View Statement Details' : 'View Invoice Details'}</summary>
            <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 12, lineHeight: 1.6, marginTop: 10 }}>{content}</div>
        </details>}
    </article>;
}
