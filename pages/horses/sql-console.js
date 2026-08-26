import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { supabase } from '../../src/lib/supabase';
import { getAuthUser, getFreshAccessToken } from '../../src/lib/authUtils';
import { useRouter } from 'next/router';
import { eventBus, EventType } from '../../src/engine/EventBus';

// smarter.poker / Club Arena palette. Cyan #00d4ff is THE accent and also means
// SUCCESS. No purples, no greens.
const C = {
    page: '#0a0e17',
    panel: '#111827',
    surface: '#1a2234',
    elevated: '#1f2937',
    inset: '#0d1520',
    accent: '#00d4ff',
    accentDim: '#0099cc',
    accentSoft: 'rgba(0,212,255,0.12)',
    accentLine: 'rgba(0,212,255,0.30)',
    danger: '#ef4444',
    dangerSoft: 'rgba(239,68,68,0.12)',
    text: '#f3f4f6',
    textDim: '#9ca3af',
    textMuted: '#6b7280',
    line: 'rgba(255,255,255,0.08)',
    lineStrong: 'rgba(255,255,255,0.15)',
};

const MAX_HISTORY = 20;

/** Renders a scalar cell value from a pg result row. */
function formatCell(v) {
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'object') return JSON.stringify(v);
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    return String(v);
}

/**
 * /api/admin/execute-sql responds with { success, command, rowCount, rows, ms }.
 * `rows` is the tabular payload — render it as a real table when it is an array
 * of objects, and keep the raw JSON behind a details toggle either way.
 */
function ResultTable({ rows }) {
    const columns = React.useMemo(() => {
        const seen = [];
        for (const row of rows) {
            for (const key of Object.keys(row || {})) {
                if (!seen.includes(key)) seen.push(key);
            }
        }
        return seen;
    }, [rows]);

    if (columns.length === 0) return null;

    return (
        <div style={{ overflowX: 'auto', border: `1px solid ${C.line}`, borderRadius: '4px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', fontFamily: 'monospace' }}>
                <thead>
                    <tr>
                        {columns.map(col => (
                            <th key={col} style={{
                                textAlign: 'left', padding: '8px 12px', color: C.accent,
                                background: C.surface, borderBottom: `1px solid ${C.line}`,
                                whiteSpace: 'nowrap', fontWeight: 700
                            }}>{col}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, i) => (
                        <tr key={i}>
                            {columns.map(col => (
                                <td key={col} style={{
                                    padding: '8px 12px', color: C.text,
                                    borderBottom: `1px solid ${C.line}`,
                                    verticalAlign: 'top', maxWidth: '360px',
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word'
                                }}>{formatCell(row?.[col])}</td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export default function OmnichannelSQLConsole() {
    const router = useRouter();
    const [loadingConfig, setLoadingConfig] = useState(true);
    const [isAdmin, setIsAdmin] = useState(false);

    const [sqlQuery, setSqlQuery] = useState('-- Write your raw PostgreSQL query here\nSELECT * FROM profiles LIMIT 5;');
    const [isRunning, setIsRunning] = useState(false);
    const [allowDestructive, setAllowDestructive] = useState(false);
    const [result, setResult] = useState(null);
    // Session-local only. Deliberately NOT localStorage — this is a god-mode
    // console and its query text must not outlive the tab.
    const [history, setHistory] = useState([]);

    // Auth & Bus Verification
    useEffect(() => {
        let authSubscription = null;

        const verifyAuth = async () => {
            // The argument-less client session read is banned repo-wide
            // (pre-commit CHECK C) - it round-trips and hangs when GoTrue is
            // slow. authUtils reads the same session out of storage.
            const authUser = getAuthUser();
            if (!authUser?.id) {
                router.push('/auth/login?redirect=/horses/sql-console');
                return;
            }
            const { data: profile } = await supabase.from('profiles').select('role').eq('id', authUser.id).maybeSingle();
            if (profile && ['admin', 'superadmin', 'god'].includes(profile.role)) {
                setIsAdmin(true);
            } else {
                router.push('/');
            }
            setLoadingConfig(false);
        };
        verifyAuth();

        // 1. Strict Auth Listener
        const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_OUT' || !session) router.push('/auth/login?redirect=/horses/sql-console');
        });
        authSubscription = authListener?.subscription;

        // 2. Global EventBus Listener
        const unsubMutated = eventBus.on(EventType.DATA_MUTATED, (event) => {
            console.log('Global data mutation detected, console remains active.', event);
        });

        return () => {
            authSubscription?.unsubscribe();
            unsubMutated();
        };
    }, [router]);

    const pushHistory = (q) => {
        const trimmed = q.trim();
        if (!trimmed) return;
        setHistory(prev => [trimmed, ...prev.filter(item => item !== trimmed)].slice(0, MAX_HISTORY));
    };

    const handleExecute = async () => {
        if (!sqlQuery.trim() || isRunning) return;
        setIsRunning(true);
        setResult(null);
        pushHistory(sqlQuery);

        try {
            const token = await getFreshAccessToken();
            if (!token) {
                setResult({ status: 401, data: { success: false, error: 'Session expired. Please refresh the page or log in again.' } });
                return;
            }
            const res = await fetch('/api/admin/execute-sql', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ sql: sqlQuery, allowDestructive })
            });

            const data = await res.json();
            if (!res.ok) {
                // Show the actual API error message instead of generic "Request failed"
                setResult({ status: res.status, data: { success: false, error: data?.error || `Request failed (${res.status})` } });
                return;
            }
            setResult({ status: res.status, data });

            // [HARDENING] Real-time Sync — Broadcast mutation globally
            if (data.success && data.command && /(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE)/i.test(data.command)) {
                try {
                    eventBus.emit(EventType.DATA_MUTATED, { source: 'sql-console-execution' }, 'SQLConsole');
                } catch (e) {
                    console.warn('Failed to emit mutation event:', e);
                }
            }
        } catch (err) {
            setResult({ status: 500, data: { success: false, error: err.message } });
        } finally {
            setIsRunning(false);
        }
    };

    // Cmd/Ctrl + Enter runs the query from inside the editor.
    const handleEditorKeyDown = (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            handleExecute();
        }
    };

    if (loadingConfig) {
        return <div style={{ background: C.page, minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', color: C.textDim }}>Authenticating Agent...</div>;
    }
    if (!isAdmin) return null;

    const rows = Array.isArray(result?.data?.rows) ? result.data.rows : null;
    const isTabular = !!rows && rows.length > 0 && rows.every(r => r && typeof r === 'object' && !Array.isArray(r));

    return (
        <div style={{ background: C.page, minHeight: '100vh', color: C.text, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
            <Head>
                <title>Omnichannel SQL Console | Antigravity</title>
                <meta name="robots" content="noindex, nofollow" />
            </Head>

            <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem 1rem' }}>
                <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '2rem', borderBottom: `1px solid ${C.line}`, paddingBottom: '1rem' }}>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600, color: C.text }}>Omnichannel SQL Console</h1>
                        <p style={{ margin: '0.5rem 0 0 0', color: C.textDim, fontSize: '0.875rem' }}>Browser Interface for live Supabase PostgreSQL execution.</p>
                    </div>
                    <button
                        onClick={() => router.push('/horses')}
                        style={{ background: 'transparent', color: C.textDim, border: `1px solid ${C.lineStrong}`, padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}>
                        &larr; Back to Horses
                    </button>
                </header>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>
                    {/* Editor Box */}
                    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: '8px', padding: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.05em' }}>SQL Query</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.75rem', color: C.textMuted, whiteSpace: 'nowrap' }}>Cmd/Ctrl + Enter to run</span>
                                <button
                                    onClick={handleExecute}
                                    disabled={isRunning}
                                    style={{
                                        background: isRunning ? C.elevated : C.accent,
                                        color: isRunning ? C.textDim : C.page,
                                        border: 'none', padding: '0.5rem 1.5rem', borderRadius: '4px', cursor: isRunning ? 'not-allowed' : 'pointer',
                                        fontWeight: 700, transition: 'background 0.2s'
                                    }}>
                                    {isRunning ? 'Executing...' : 'Run Query'}
                                </button>
                            </div>
                        </div>

                        {history.length > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                                <label htmlFor="queryHistory" style={{ fontSize: '0.75rem', color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                                    History
                                </label>
                                <select
                                    id="queryHistory"
                                    value=""
                                    onChange={(e) => { if (e.target.value !== '') setSqlQuery(history[Number(e.target.value)]); }}
                                    style={{
                                        flex: 1, minWidth: '180px', maxWidth: '100%',
                                        background: C.inset, color: C.text, border: `1px solid ${C.lineStrong}`,
                                        borderRadius: '4px', padding: '0.4rem 0.5rem', fontSize: '0.75rem',
                                        fontFamily: 'monospace', outline: 'none', cursor: 'pointer'
                                    }}>
                                    <option value="">Reload a previous query ({history.length} this session)</option>
                                    {history.map((q, i) => (
                                        <option key={`${i}-${q.slice(0, 24)}`} value={i}>
                                            {q.replace(/\s+/g, ' ').slice(0, 90)}{q.length > 90 ? '…' : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <textarea
                            value={sqlQuery}
                            onChange={(e) => setSqlQuery(e.target.value)}
                            onKeyDown={handleEditorKeyDown}
                            style={{
                                width: '100%',
                                boxSizing: 'border-box',
                                height: '250px',
                                background: C.inset,
                                color: C.accent,
                                border: `1px solid ${C.lineStrong}`,
                                borderRadius: '4px',
                                padding: '1rem',
                                fontFamily: 'monospace',
                                fontSize: '14px',
                                resize: 'vertical',
                                outline: 'none'
                            }}
                            spellCheck="false"
                        />

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1rem', marginBottom: '0.5rem' }}>
                            <input
                                type="checkbox"
                                id="allowDestructive"
                                checked={allowDestructive}
                                onChange={(e) => setAllowDestructive(e.target.checked)}
                                style={{ accentColor: C.danger, width: '16px', height: '16px' }}
                            />
                            <label htmlFor="allowDestructive" style={{ fontSize: '0.875rem', color: allowDestructive ? C.danger : C.textDim, fontWeight: 600, cursor: 'pointer' }}>
                                Allow Destructive Operations (DROP, DELETE, TRUNCATE)
                            </label>
                        </div>

                        <p style={{ fontSize: '0.75rem', color: C.textMuted, margin: 0 }}>
                            <strong>Caution:</strong> Executions are strictly wrapped in a 10s timeout `BEGIN`/`COMMIT` block with Immutable Forensics Logging.
                        </p>
                    </div>

                    {/* Output Box */}
                    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: '8px', padding: '1rem', minHeight: '300px' }}>
                        <div style={{ fontSize: '0.875rem', fontWeight: 600, color: C.textDim, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>Execution Output</div>

                        {result ? (
                            <div style={{ background: C.inset, borderRadius: '4px', padding: '1rem', border: `1px solid ${result.data.success ? C.accentLine : C.danger}` }}>
                                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem', paddingBottom: '0.5rem', borderBottom: `1px solid ${C.line}` }}>
                                    <span style={{ color: result.data.success ? C.accent : C.danger, fontWeight: 700, letterSpacing: '0.05em' }}>
                                        {result.data.success ? 'SUCCESS' : 'ERROR'}
                                    </span>
                                    {result.data.ms !== undefined && (
                                        <span style={{ color: C.textDim }}>Time: {result.data.ms}ms</span>
                                    )}
                                    {result.data.rowCount !== undefined && (
                                        <span style={{ color: C.textDim }}>Rows: {result.data.rowCount}</span>
                                    )}
                                    {result.data.command && (
                                        <span style={{ color: C.textDim }}>Command: {result.data.command}</span>
                                    )}
                                </div>

                                {isTabular ? (
                                    <>
                                        <ResultTable rows={rows} />
                                        <details style={{ marginTop: '1rem' }}>
                                            <summary style={{ cursor: 'pointer', color: C.textDim, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                                                Raw JSON
                                            </summary>
                                            <pre style={{ margin: '0.75rem 0 0 0', color: C.text, fontFamily: 'monospace', fontSize: '13px', overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
                                                {JSON.stringify(result.data, null, 2)}
                                            </pre>
                                        </details>
                                    </>
                                ) : (
                                    <pre style={{ margin: 0, color: C.text, fontFamily: 'monospace', fontSize: '13px', overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
                                        {JSON.stringify(result.data, null, 2)}
                                    </pre>
                                )}
                            </div>
                        ) : (
                            <div style={{ color: C.textMuted, textAlign: 'center', padding: '4rem 0', fontStyle: 'italic' }}>
                                Run a query to see the database output here.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
