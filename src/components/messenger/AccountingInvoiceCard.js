import React from 'react';
import { cashierInvoiceDisplay, correctionInvoiceDisplay, creditChangeInvoiceDisplay } from '../../lib/accountingMessage.mjs';

const periodDay = value => { const time = Date.parse(value); return Number.isFinite(time) ? new Date(time).toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', year: 'numeric' }) : 'Unavailable'; };
const amount = value => value !== null && value !== undefined && Number.isFinite(Number(value))
    ? Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : 'Not Available';

// renderRequestedPayout is supplied by the live messenger (it owns the network
// client); the card itself stays a pure renderer of verified receipt fields.
export default function AccountingInvoiceCard({ meta, content, theme: C, currentUserId = null, renderRequestedPayout = null, renderPaymentStatus = null, variant = 'overview', fullWidth = false }) {
    const correction = correctionInvoiceDisplay(meta);
    const credit = creditChangeInvoiceDisplay(meta);
    const weekly = !correction && meta.invoice_type === 'club_weekly_accounting';
    const cashier = cashierInvoiceDisplay(meta);
    // A held cashout is the player's Requested Payout. Its live state and the
    // agent's Accept / Cancel come from the server, never from this metadata.
    const requestedPayout = cashier?.verified && meta.cashier?.event_kind === 'hold' && meta.cashier?.cashout_id
        && typeof renderRequestedPayout === 'function'
        ? { cashoutId: meta.cashier.cashout_id, isPlayer: meta.cashier.player_id === currentUserId } : null;
    if (requestedPayout) cashier.label = requestedPayout.isPlayer ? 'Cashout Requested' : 'Requested Payout';
    const lines = meta.lines || {};
    const unionInvoice = meta.invoice_type === 'union_weekly_squareup';
    const statementFields = unionInvoice ? [['Fees generated', lines.rake_generated], ['Club rakeback', lines.rakeback_due], ['Union fee', lines.union_fee_kept], ['ECO', lines.eco_amount], ['Presettlements', lines.presettled]] : [];
    const payable = unionInvoice || !!meta.source_credit_invoice_id;
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
    ] : [[correction ? 'Correction amount' : payable ? 'Invoice amount' : 'Amount', payable ? Math.abs(Number(meta.amount)) : meta.amount]];
    return <article aria-label={credit ? 'Credit Change Record' : correction ? 'Correction Record' : cashier ? 'Cashier Receipt' : weekly ? 'Weekly Club Statement' : 'Accounting Invoice'}
        data-document-design={variant}
        style={{ background: C.card, color: C.text, border: `1px solid ${C.border}`, borderTop: variant === 'ledger' ? `3px solid ${C.blue}` : undefined,
            borderRadius: variant === 'ledger' ? 8 : 16, padding: variant === 'compact' ? 16 : 24,
            width: fullWidth ? '100%' : 'min(420px, 75vw)', maxWidth: '100%', boxSizing: 'border-box' }}>
        <div style={{ fontSize: 11, color: C.blue, fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>SMARTER.POKER</div>
        <div style={{ fontSize: 17, fontWeight: 700 }}>{credit ? credit.label : correction ? correction.label : cashier ? cashier.label : weekly ? 'Weekly Club Statement' : 'Invoice'}</div>
        {unionInvoice && (lines.union_name || lines.club_name) && <p style={{ color: C.textSec, fontSize: 13, lineHeight: 1.7 }}>{lines.union_name} · {lines.club_name}<br />{lines.direction === 'union owes club' ? 'Union pays club' : 'Club pays union'}</p>}
        {!credit && !correction && meta.invoice_number && <div style={{ marginTop: 6, fontSize: 12, color: C.textSec }}>{meta.invoice_number}</div>}
        {!credit && !cashier && !correction && (lines.period_start || meta.period_start) && <div style={{ fontSize: 12, marginTop: 6, color: C.textSec }}>
            {periodDay(lines.period_start || meta.period_start)} through {periodDay(Number.isFinite(Date.parse(lines.period_end || meta.period_end)) ? new Date(Date.parse(lines.period_end || meta.period_end) - 1).toISOString() : '')} · Pacific
        </div>}
        {!credit && !correction && meta.status === 'needs_reconciliation' && <p role="status" style={{ fontSize: 12, lineHeight: 1.5 }}>Needs Reconciliation · These Posted Amounts Are Not A Certified Settlement.</p>}
        <dl style={{ margin: '20px 0' }}>
            {rows.map(([label, value]) => <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '7px 0', borderBottom: `1px solid ${C.border}`, fontSize: 13 }}>
                <dt>{label}</dt><dd style={{ margin: 0, fontSize: variant === 'overview' && rows.length === 1 ? 24 : 15, fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{credit ? value : correction ? correction.amount : cashier ? cashier.amount : amount(value)}</dd>
            </div>)}
        </dl>
        <div style={{ fontSize: 12, color: C.textSec }}>{credit ? `Credit capacity · ${credit.status}` : <>Chips · {correction ? correction.status : cashier ? cashier.verified ? cashier.label : 'Details Unavailable' : (meta.invoice_type === 'union_weekly_squareup' || meta.source_credit_invoice_id) && renderPaymentStatus ? 'Issued invoice' : String(meta.status || 'Status Unavailable').replace(/_/g, ' ')}</>}</div>
        {typeof renderPaymentStatus === 'function' && (meta.invoice_type === 'union_weekly_squareup' || meta.source_credit_invoice_id) && renderPaymentStatus(meta.invoice_id)}
        {credit && <p role={credit.verified ? undefined : 'status'} style={{ fontSize: 12, lineHeight: 1.5 }}>{credit.detail}</p>}
        {correction && <p role={correction.verified ? undefined : 'status'} style={{ fontSize: 12, lineHeight: 1.5 }}>{correction.detail}</p>}
        {cashier && !requestedPayout && <p role={cashier.verified ? undefined : 'status'} style={{ fontSize: 12, lineHeight: 1.5 }}>{cashier.detail}</p>}
        {requestedPayout && renderRequestedPayout(requestedPayout.cashoutId)}
        {weekly && <p style={{ fontSize: 12, lineHeight: 1.5 }}>{lines.note || 'Club Payments Are Counted Once. Further Payments By Agents Are Shown Separately.'}</p>}
        {!credit && !cashier && !correction && <details open={variant === 'ledger'} style={{ marginTop: 20 }}><summary style={{ cursor: 'pointer', color: C.blue, fontSize: 13 }}>{meta.preview ? 'View Statement Details' : 'View Invoice Details'}</summary>
            {unionInvoice && statementFields.some(([,value]) => value != null) ? <dl>{statementFields.map(([label,value]) => <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '9px 0', borderBottom: `1px solid ${C.border}`, fontSize: 13 }}><dt style={{ color: C.textSec }}>{label}</dt><dd style={{ margin: 0 }}>{amount(value)}</dd></div>)}</dl> : <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 12, lineHeight: 1.6, marginTop: 10 }}>{content}</div>}
        </details>}
    </article>;
}
