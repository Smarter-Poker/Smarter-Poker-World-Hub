import React, { useEffect, useRef, useState } from 'react';
import AccountingStatementCard from './AccountingStatementCard';
import { authedFetch, getAccessToken } from '../../lib/authUtils';

export default function StatementsPanel({ club, userId, theme: C, onBack, onOpen }) {
    const [documents, setDocuments] = useState([]);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const [more, setMore] = useState(false);
    const [deleting, setDeleting] = useState(null);
    const [confirmDelete, setConfirmDelete] = useState(null);
    const generation = useRef(0);
    const request = async (url, body) => {
        const token = getAccessToken();
        const response = await authedFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || 'Request failed. Please retry.');
        return data;
    };
    const load = async (before = null) => {
        const ticket = ++generation.current;
        setLoading(true); setError(null);
        try {
            const data = await request('/api/messenger/statements', { clubId: club.id, before });
            if (ticket !== generation.current) return;
            setDocuments(previous => before ? [...previous, ...data.documents] : data.documents);
            setMore(new Set(data.documents.map(d => d.period_end)).size === 20);
        } catch (e) { if (ticket === generation.current) setError(e.message); }
        finally { if (ticket === generation.current) setLoading(false); }
    };
    useEffect(() => { setDocuments([]); setConfirmDelete(null); setDeleting(null); load(); return () => { generation.current++; }; }, [club.id, userId]); // eslint-disable-line react-hooks/exhaustive-deps
    const remove = async document => {
        const ticket = generation.current;
        setDeleting(document.message_id); setError(null);
        try {
            await request('/api/messenger/delete-message', { messageId: document.message_id, deleteType: 'for_me' });
            if (ticket !== generation.current) return;
            setDocuments(rows => rows.filter(row => row.message_id !== document.message_id));
            setConfirmDelete(null);
        } catch (e) { if (ticket === generation.current) setError(e.message); }
        finally { if (ticket === generation.current) setDeleting(null); }
    };
    const button = { border: `1px solid ${C.border}`, background: C.card, color: C.blue, borderRadius: 8, padding: '10px 14px', cursor: 'pointer' };
    return <section aria-label="Statements" style={{ padding: 20, overflowY: 'auto', minHeight: 0 }}>
        <header style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20 }}><button type="button" style={button} onClick={onBack}>Back</button><h1 style={{ margin: 0, fontSize: 24, color: C.text }}>Statements</h1></header>
        {error && <div role="alert" style={{ color: C.text, marginBottom: 16 }}>{error} <button style={button} onClick={() => load()} disabled={loading || !!deleting}>Retry</button></div>}
        {loading && <p role="status" style={{ color: C.textSec }}>Loading Saved Statements...</p>}
        {!loading && !error && documents.length === 0 && <p style={{ color: C.textSec }}>No Saved Statements For This Club Yet.</p>}
        <div style={{ display: 'grid', gap: 20, maxWidth: 860, margin: '0 auto' }}>{documents.map(document => <div key={document.message_id}>
            <AccountingStatementCard document={document} theme={C} onOpen={() => onOpen(document.conversation_id)} onDelete={() => setConfirmDelete(document.message_id)} />
            {confirmDelete === document.message_id && <div role="alert" style={{ padding: 16, color: C.text }}>Delete This Statement From Your Messenger? Other Recipients Keep Their Copies.
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}><button style={button} disabled={!!deleting} onClick={() => remove(document)}>Delete For Me</button><button style={button} disabled={!!deleting} onClick={() => setConfirmDelete(null)}>Keep Statement</button></div>
            </div>}
        </div>)}</div>
        {more && <button type="button" style={{ ...button, marginTop: 20 }} disabled={loading || !!deleting} onClick={() => load(documents.at(-1).period_end)}>Older Statements</button>}
    </section>;
}
