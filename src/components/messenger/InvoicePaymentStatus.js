import React, { useEffect, useState } from 'react';
import { authedFetch, getAccessToken } from '../../lib/authUtils';
import { statementAmount } from './AccountingStatementCard';
export default function InvoicePaymentStatus({ invoiceId, theme: C }) {
    const [result, setResult] = useState(null);
    const [error, setError] = useState(false);
    const [retry, setRetry] = useState(0);
    useEffect(() => {
        if (!invoiceId) return;
        let active = true; setResult(null); setError(false);
        authedFetch('/api/messenger/receivables', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getAccessToken()}` }, body: JSON.stringify({ action: 'status', invoiceId }) })
            .then(async response => { const data = await response.json(); if (!response.ok || !data.success) throw new Error('Unavailable'); if (active) setResult(data); })
            .catch(() => { if (active) setError(true); });
        return () => { active = false; };
    }, [invoiceId, retry]);
    if (!invoiceId) return null;
    if (error) return <p role="status" style={{ fontSize: 12 }}>Current payment status unavailable. <button onClick={() => setRetry(n => n + 1)} style={{ color: C.blue }}>Retry</button></p>;
    if (!result) return <p style={{ color: C.textSec, fontSize: 12 }}>Loading current payment status...</p>;
    if (!result.payable) return null;
    return <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12, marginTop: 12, fontSize: 13 }}>
        <strong>{result.status === 'partial' ? 'Partially paid' : result.status === 'paid' ? 'Paid' : result.status === 'cancelled' ? 'Cancelled' : result.status === 'disputed' ? 'Disputed' : 'Unpaid'}</strong>
        <p>Paid {statementAmount(result.paid)} · Remaining {statementAmount(result.remaining)} chips</p>
        <button type="button" onClick={() => setRetry(n => n + 1)} style={{ color: C.blue, fontSize: 12 }}>Refresh payment status</button>
    </div>;
}
