import React, { useEffect, useRef, useState } from 'react';
import { authedFetch, getAccessToken } from '../../lib/authUtils';
import { statementAmount } from './AccountingStatementCard';

export default function InvoicePaymentsPanel({ clubId, userId, theme: C }) {
    const [data, setData] = useState(null);
    const [week, setWeek] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [selection, setSelection] = useState(null);
    const [amount, setAmount] = useState('');
    const [reference, setReference] = useState('');
    const [pending, setPending] = useState(null);
    const generation = useRef(0);
    const request = async body => {
        const response = await authedFetch('/api/messenger/receivables', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAccessToken()}` }, body: JSON.stringify(body) });
        const result = await response.json();
        if (!response.ok || !result.success) { const e = new Error(result.error || 'Request failed'); e.status = response.status; throw e; }
        return result;
    };
    const load = async (periodEnd = week) => {
        const ticket = ++generation.current; setBusy(true); setError('');
        try { const result = await request({ clubId, periodEnd: periodEnd || null }); if (ticket === generation.current) setData(result); }
        catch (e) { if (ticket === generation.current) setError(e.message); }
        finally { if (ticket === generation.current) setBusy(false); }
    };
    useEffect(() => { setData(null); setWeek(''); setSelection(null); setPending(null); load(''); return () => { generation.current++; }; }, [clubId, userId]); // eslint-disable-line react-hooks/exhaustive-deps
    const choose = rows => { setSelection(rows); setAmount(rows.length === 1 ? String(rows[0].remaining) : ''); setReference(''); setError(''); };
    const submit = async () => {
        const ticket = generation.current;
        const payments = pending || selection.map(row => ({ invoice_id: row.id, operation_id: crypto.randomUUID(), expected_remaining: Number(row.remaining),
            amount: selection.length === 1 ? Number(amount) : Number(row.remaining), reference: reference.trim() }));
        // Retain the exact operation after an uncertain network outcome. Retry cannot pay twice.
        setPending(payments); setBusy(true); setError('');
        try {
            await request({ action: 'record', payments });
            if (ticket !== generation.current) return;
            setPending(null); setSelection(null); await load();
        } catch (e) {
            if (ticket === generation.current) { setError(e.message); if ([400, 403, 409].includes(e.status)) setPending(null); }
        } finally { if (ticket === generation.current) setBusy(false); }
    };
    const button = { padding: '9px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.card, color: C.blue, cursor: 'pointer' };
    const unpaid = (data?.invoices || []).filter(i => Number(i.remaining) > 0);
    return <details style={{ padding: 12, borderBottom: `1px solid ${C.border}`, color: C.text }}>
        <summary style={{ cursor: 'pointer', color: C.blue, padding: '8px 0' }}>Weekly Payment Tracking</summary>
        <p style={{ color: C.textSec, fontSize: 12 }}>Record Payments Made Outside The App. Only Invoice Balances Change; Credit Availability And Chip Wallets Stay Unchanged.</p>
        {error && <p role="alert">{error} {!selection && <button style={button} disabled={busy} onClick={() => load()}>Retry</button>}</p>}
        {busy && <p role="status">Loading...</p>}
        {data && <>
            <select aria-label="Accounting Week" value={week || data.weeks[0] || ''} disabled={busy || !!selection} onChange={e => { setWeek(e.target.value); load(e.target.value); }} style={{ ...button, width: '100%', marginBottom: 12 }}>
                {data.weeks.map(w => <option key={w} value={w}>Week Ending {new Date(Date.parse(w) - 1).toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' })}</option>)}
            </select>
            {data.invoices.length === 0 && <p>No Invoices You Can Manage For This Club.</p>}
            {['union', 'credit'].map(kind => { const group = unpaid.filter(row => row.kind === kind); return group.length > 1 ? <button key={kind} style={{ ...button, marginBottom: 8 }} disabled={busy || !!selection} onClick={() => choose(group)}>Mark All {kind === 'union' ? 'clubs' : 'agents'} Paid ({group.length})</button> : null; })}
            {data.invoices.map(row => <article key={row.id} style={{ borderTop: `1px solid ${C.border}`, marginTop: 12, paddingTop: 12 }}>
                <strong>{row.recipient}</strong><div style={{ color: C.textSec, fontSize: 12 }}>{row.number} · {row.direction}</div>
                <p style={{ fontSize: 13 }}>Paid {statementAmount(row.paid)} · Remaining {statementAmount(row.remaining)}<br /><strong>{row.status === 'partial' ? 'Partially paid' : row.status === 'paid' ? 'Paid' : 'Unpaid'}</strong></p>
                {Number(row.remaining) > 0 && <button style={button} disabled={busy || !!selection} onClick={() => choose([row])}>Record Payment</button>}
                {row.receipts.length > 0 && <details><summary style={{ marginTop: 8 }}>Payment History</summary>{row.receipts.map((r, i) => <p key={i} style={{ fontSize: 12 }}>{statementAmount(r.amount)} · {r.reference}<br />{new Date(r.received_at).toLocaleString()}</p>)}</details>}
            </article>)}
        </>}
        {selection && <form onSubmit={e => { e.preventDefault(); submit(); }} style={{ marginTop: 16 }}>
            <strong>{selection.length === 1 ? `Payment for ${selection[0].recipient}` : `Confirm ${selection.length} invoices paid in full`}</strong>
            {selection.length === 1 && <label style={{ display: 'block', marginTop: 12 }}>Amount In Chips<input aria-label="Payment Amount" type="number" min="0.01" step="0.01" max={selection[0].remaining} required disabled={busy || !!pending} value={amount} onChange={e => setAmount(e.target.value)} style={{ ...button, width: '100%', boxSizing: 'border-box' }} /></label>}
            <label style={{ display: 'block', marginTop: 12 }}>Payment Reference<input aria-label="Payment Reference" required maxLength={256} disabled={busy || !!pending} value={reference} onChange={e => setReference(e.target.value)} style={{ ...button, width: '100%', boxSizing: 'border-box' }} /></label>
            <p style={{ fontSize: 12 }}>Confirm Only Payments Actually Received Or Made For These Invoices.</p>
            <button style={button} disabled={busy} type="submit">{pending ? 'Retry same payment' : 'Confirm payment'}</button>{!pending && <button style={button} disabled={busy} type="button" onClick={() => setSelection(null)}>Cancel</button>}
        </form>}
    </details>;
}
