import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { supabase } from '../../src/lib/supabase';
import { getAuthUser, getFreshAccessToken } from '../../src/lib/authUtils';
import { useRouter } from 'next/router';
import { eventBus, EventType } from '../../src/engine/EventBus';
import { T, toCsv, downloadCsv, stampedName } from '../../src/lib/horsesAdminTokens';
import styles from './horses.module.css';

// COLOUR. Every value comes from T, which is a set of var() strings resolved
// by the custom properties horses.module.css declares on `.tokenScope`. That
// class is on EVERY root this file can return - if you add another one, put
// the class on it too or the whole state renders uncoloured. No raw hex here:
// the rule is stated at the top of src/lib/horsesAdminTokens.js.

const MAX_HISTORY = 20;

// The tag this console stamps on its own DATA_MUTATED emit, and the tag it
// looks for when deciding whether a mutation notice is its own echo. One
// constant so the emit and the suppression can never drift apart.
const SELF_EMIT_TAG = 'sql-console-execution';

// Minimum height for anything the operator taps. 44px is the WCAG 2.5.5 /
// Apple HIG floor. Applied unconditionally rather than behind a
// pointer:coarse query because this file is inline-styled and a taller
// button costs a desktop user nothing.
const TAP = 44;

/** Renders a scalar cell value from a pg result row. */
function formatCell(v) {
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'object') return JSON.stringify(v);
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    return String(v);
}

/**
 * /api/admin/execute-sql responds with
 * { success, mutating, dryRun, committed, command, rowCount, rows, ms, notice }.
 * `rows` is the tabular payload - render it as a real table when it is an array
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
        <div style={{ overflowX: 'auto', border: `1px solid ${T.line}`, borderRadius: '4px' }}>
            {/* minWidth forces the container above to actually scroll. Without
                it the table shrinks to fit and every cell shreds into a
                one-character column. */}
            <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse', fontSize: '13px', fontFamily: 'monospace' }}>
                <thead>
                    <tr>
                        {columns.map(col => (
                            <th key={col} scope="col" style={{
                                textAlign: 'left', padding: '8px 12px', color: T.accent,
                                background: T.surface, borderBottom: `1px solid ${T.line}`,
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
                                    padding: '8px 12px', color: T.text,
                                    borderBottom: `1px solid ${T.line}`,
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
    const [authError, setAuthError] = useState('');

    const [sqlQuery, setSqlQuery] = useState('-- Write your raw PostgreSQL query here\nSELECT * FROM profiles LIMIT 5;');
    const [isRunning, setIsRunning] = useState(false);
    const [result, setResult] = useState(null);
    // Session-local only. Deliberately NOT localStorage - this is a god-mode
    // console and its query text must not outlive the tab.
    const [history, setHistory] = useState([]);

    // ─── COMMIT GATE ──────────────────────────────────────────────────
    // The old UI had a checkbox labelled "Allow Destructive Operations
    // (DROP, DELETE, TRUNCATE)". It was decoration: the value was posted as
    // `allowDestructive` and /api/admin/execute-sql never read the field. The
    // operator ticked it, the label turned red, they ran their DELETE, and
    // the server returned 403 anyway.
    //
    // What replaces it is the server's real model. A mutating statement runs
    // inside BEGIN and is ROLLED BACK, so the operator first sees the row
    // count it WOULD have touched. To actually commit it they must send the
    // statement back verbatim in `confirm`. `pendingSql` is the exact string
    // that was dry-run; `confirmText` is what the operator typed back.
    const [pendingSql, setPendingSql] = useState(null);
    const [confirmText, setConfirmText] = useState('');

    // ─── STALE RESULT NOTICE ──────────────────────────────────────────
    // Set when a DATA_MUTATED event arrives from somewhere else while a
    // result is on screen. The rows above it were true when they were read
    // and may not be true now, which is exactly the case an operator cannot
    // see for themselves. The handler used to console.log and nothing else.
    const [staleSince, setStaleSince] = useState(null);

    // Auth & Bus Verification
    useEffect(() => {
        let authSubscription = null;

        const verifyAuth = async () => {
            // The argument-less client session read is banned repo-wide
            // (pre-commit CHECK C) - it round-trips and hangs when GoTrue is
            // slow. authUtils reads the same session out of storage.
            const authUser = getAuthUser();
            if (!authUser?.id) {
                // setLoadingConfig(false) has to run on EVERY exit. It used to
                // sit only at the bottom, so this branch left the page on
                // "Authenticating Agent..." for the whole navigation -- and
                // forever if the push did not go anywhere.
                setLoadingConfig(false);
                router.push('/auth/login?redirect=/horses/sql-console');
                return;
            }
            const { data: profile, error: roleErr } = await supabase
                .from('profiles').select('role').eq('id', authUser.id).maybeSingle();
            // A FAILED QUERY IS NOT A DENIAL. `error` used to be discarded, so
            // an RLS regression or a dropped connection made profile null and
            // bounced a real superadmin to the home page with no way to tell
            // "you are not an admin" from "we could not ask". Say which.
            if (roleErr) {
                setAuthError('Could not verify your role: ' + roleErr.message);
                setLoadingConfig(false);
                return;
            }
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

        // 2. Global EventBus Listener.
        // A mutation committed elsewhere (another console, another tab, an
        // admin action) can invalidate whatever is currently on screen. This
        // does not refetch - refetching a god-mode console's query behind the
        // operator's back is worse than a stale table. It marks the result
        // stale and says so, and the operator decides whether to re-run.
        const unsubMutated = eventBus.on(EventType.DATA_MUTATED, (event) => {
            // Our own commit already refreshed what the operator is looking at.
            // The bus is not in this snapshot, so BOTH shapes are tested
            // independently rather than with `a || b`: eventBus.emit is called
            // with an emitter name as its third argument, so an envelope can
            // carry its own `source` ('SQLConsole') that is truthy and shadows
            // the payload's tag, and `||` would then never look at the payload
            // at all - the console would raise "another console changed this"
            // about its own commit.
            const envelopeTag = event?.source;
            const payloadTag = event?.payload?.source;
            if (envelopeTag === SELF_EMIT_TAG || payloadTag === SELF_EMIT_TAG) return;
            setStaleSince(new Date());
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

    // Editing the query invalidates any commit that was armed for the old
    // one. Nothing may commit text the operator has not seen dry-run.
    const updateSql = (next) => {
        setSqlQuery(next);
        if (pendingSql !== null) {
            setPendingSql(null);
            setConfirmText('');
        }
    };

    /**
     * @param {string|null} confirmValue  null = dry run, string = commit attempt
     */
    const runQuery = async (confirmValue) => {
        if (!sqlQuery.trim() || isRunning) return;
        setIsRunning(true);
        setResult(null);
        // Whatever was stale is now gone from the screen; the notice belongs
        // to the result it was raised against, not to the next one.
        setStaleSince(null);
        pushHistory(sqlQuery);

        try {
            const token = await getFreshAccessToken();
            if (!token) {
                setResult({ status: 401, data: { success: false, error: 'Session expired. Please refresh the page or log in again.' } });
                return;
            }
            const body = confirmValue === null ? { sql: sqlQuery } : { sql: sqlQuery, confirm: confirmValue };
            const res = await fetch('/api/admin/execute-sql', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(body)
            });

            const data = await res.json();
            if (!res.ok) {
                // Show the actual API error message instead of generic "Request failed"
                setResult({ status: res.status, data: { success: false, error: data?.error || `Request failed (${res.status})` } });
                return;
            }
            setResult({ status: res.status, data });

            if (data.dryRun) {
                // Arm the commit control against the exact text that was run.
                setPendingSql(sqlQuery.trim());
                setConfirmText('');
            } else {
                setPendingSql(null);
                setConfirmText('');
            }

            // [HARDENING] Real-time Sync - Broadcast mutation globally.
            // Only for a mutation that actually COMMITTED. A dry run changed
            // nothing and must not make the rest of the app refetch.
            if (data.success && data.committed && data.mutating) {
                try {
                    eventBus.emit(EventType.DATA_MUTATED, { source: SELF_EMIT_TAG }, 'SQLConsole');
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

    const handleExecute = () => runQuery(null);
    const handleCommit = () => runQuery(confirmText);

    // Cmd/Ctrl + Enter runs the query from inside the editor. It can only ever
    // start a dry run - committing is never one keystroke away.
    const handleEditorKeyDown = (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            handleExecute();
        }
    };

    if (loadingConfig) {
        return <div className={styles.tokenScope} style={{ background: T.page, minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', color: T.dim }}>Authenticating Agent...</div>;
    }
    // Renders instead of a blank page, and offers a retry. `return null` for
    // this case meant a superadmin hitting a transient RLS or network failure
    // saw an empty white screen with no explanation and nothing to click.
    if (authError) {
        return (
            <div className={styles.tokenScope} style={{ background: T.page, minHeight: '100vh', display: 'flex', flexDirection: 'column',
                justifyContent: 'center', alignItems: 'center', gap: 16, color: T.text, padding: 24, textAlign: 'center' }}>
                <div role="alert" style={{ color: T.danger, fontWeight: 700 }}>{authError}</div>
                <div style={{ color: T.dim, fontSize: 14, maxWidth: 480 }}>
                    This Is A Failure To Check Your Role, Not A Refusal. Your Access Has Not Changed.
                </div>
                <button
                    onClick={() => router.reload()}
                    style={{ background: T.accent, color: T.page, border: 'none', padding: '10px 20px',
                        borderRadius: 6, cursor: 'pointer', fontWeight: 700, minHeight: 44 }}
                >
                    Retry
                </button>
            </div>
        );
    }
    if (!isAdmin) return null;

    const rows = Array.isArray(result?.data?.rows) ? result.data.rows : null;
    const isTabular = !!rows && rows.length > 0 && rows.every(r => r && typeof r === 'object' && !Array.isArray(r));

    /**
     * CSV of exactly the rows on screen.
     *
     * The columns are derived from the result rather than declared, because a
     * SQL console cannot know its own shape ahead of time. The union of keys
     * in first-seen order is the same list ResultTable renders, so the file
     * and the table always agree - which is the property that matters when
     * someone is reconciling a figure in a spreadsheet.
     */
    const exportRows = () => {
        if (!rows || rows.length === 0) return;
        const seen = [];
        for (const row of rows) {
            for (const key of Object.keys(row || {})) {
                if (!seen.includes(key)) seen.push(key);
            }
        }
        downloadCsv(stampedName('sql-console-result'), toCsv(rows, seen.map(k => [k, k])));
    };

    // Exactly the comparison the server makes, so the button never lies about
    // whether the commit will be accepted.
    const confirmMatches = pendingSql !== null && confirmText.trim() === pendingSql;

    let statusLabel = 'ERROR';
    let statusColor = T.danger;
    if (result?.data?.success) {
        if (result.data.dryRun) {
            statusLabel = 'ROLLED BACK (DRY RUN)';
            statusColor = T.danger;
        } else if (result.data.mutating) {
            statusLabel = 'COMMITTED';
            statusColor = T.accent;
        } else {
            statusLabel = 'SUCCESS (READ ONLY)';
            statusColor = T.accent;
        }
    }

    return (
        <div className={styles.tokenScope} style={{ background: T.page, minHeight: '100vh', color: T.text, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
            <Head>
                <title>Omnichannel SQL Console | Antigravity</title>
                <meta name="robots" content="noindex, nofollow" />
            </Head>

            {/* Inline styles cannot express :focus-visible, and every control
                here previously set outline:none with nothing in its place,
                a keyboard operator had no idea where focus was. */}
            <style>{`
                #sql-editor:focus-visible,
                #queryHistory:focus-visible,
                #commit-confirm:focus-visible,
                .sqlc-focusable:focus-visible {
                    outline: 2px solid ${T.accent};
                    outline-offset: 2px;
                }
            `}</style>

            <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem 1rem' }}>
                <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', marginBottom: '2rem', borderBottom: `1px solid ${T.line}`, paddingBottom: '1rem' }}>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600, color: T.text }}>Omnichannel SQL Console</h1>
                        <p style={{ margin: '0.5rem 0 0 0', color: T.dim, fontSize: '0.875rem' }}>Browser Interface For Live Supabase PostgreSQL Execution.</p>
                    </div>
                    <button
                        className="sqlc-focusable"
                        onClick={() => router.push('/horses')}
                        style={{ background: 'transparent', color: T.dim, border: `1px solid ${T.lineStrong}`, padding: '0.5rem 1rem', minHeight: TAP, borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}>
                        &larr; Back To Horses
                    </button>
                </header>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>
                    {/* Editor Box */}
                    <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: '8px', padding: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                            <h2 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, color: T.dim, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                <label htmlFor="sql-editor">SQL Query</label>
                            </h2>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.75rem', color: T.muted, whiteSpace: 'nowrap' }}>Cmd/Ctrl + Enter To Run</span>
                                <button
                                    className="sqlc-focusable"
                                    onClick={handleExecute}
                                    disabled={isRunning}
                                    style={{
                                        background: isRunning ? T.elevated : T.accent,
                                        color: isRunning ? T.dim : T.page,
                                        border: 'none', padding: '0.5rem 1.5rem', minHeight: TAP, borderRadius: '4px', cursor: isRunning ? 'not-allowed' : 'pointer',
                                        fontWeight: 700, transition: 'background 0.2s'
                                    }}>
                                    {isRunning ? 'Executing...' : 'Run Query'}
                                </button>
                            </div>
                        </div>

                        {history.length > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                                <label htmlFor="queryHistory" style={{ fontSize: '0.75rem', color: T.muted, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                                    History
                                </label>
                                <select
                                    id="queryHistory"
                                    value=""
                                    onChange={(e) => { if (e.target.value !== '') updateSql(history[Number(e.target.value)]); }}
                                    style={{
                                        flex: 1, minWidth: '180px', maxWidth: '100%', minHeight: TAP,
                                        background: T.inset, color: T.text, border: `1px solid ${T.lineStrong}`,
                                        borderRadius: '4px', padding: '0.4rem 0.5rem', fontSize: '0.75rem',
                                        fontFamily: 'monospace', cursor: 'pointer'
                                    }}>
                                    <option value="">Reload A Previous Query ({history.length} This Session)</option>
                                    {history.map((q, i) => (
                                        <option key={`${i}-${q.slice(0, 24)}`} value={i}>
                                            {q.replace(/\s+/g, ' ').slice(0, 90)}{q.length > 90 ? '...' : ''}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <textarea
                            id="sql-editor"
                            value={sqlQuery}
                            onChange={(e) => updateSql(e.target.value)}
                            onKeyDown={handleEditorKeyDown}
                            style={{
                                width: '100%',
                                boxSizing: 'border-box',
                                height: '250px',
                                background: T.inset,
                                color: T.accent,
                                border: `1px solid ${T.lineStrong}`,
                                borderRadius: '4px',
                                padding: '1rem',
                                fontFamily: 'monospace',
                                fontSize: '14px',
                                resize: 'vertical'
                            }}
                            spellCheck="false"
                        />

                        <p style={{ fontSize: '0.75rem', color: T.muted, margin: '1rem 0 0 0', lineHeight: 1.6 }}>
                            <strong style={{ color: T.dim }}>How This Runs:</strong> Reads Execute And Return Normally.
                            Anything That Changes State - INSERT, UPDATE, DELETE, TRUNCATE, DROP, ALTER, GRANT, CREATE -
                            Runs Inside A Transaction That Is <strong>Rolled Back</strong>, So You See The Row Count It
                            Would Have Affected And Nothing Is Written. To Commit It, Confirm Below. Every Committed
                            Mutation Is Written To <code>Admin_Audit_Log</code>. Hard 10 Second Statement Timeout.
                        </p>
                    </div>

                    {/* Commit Gate - only appears after a dry run that changed nothing */}
                    {pendingSql !== null && (
                        <div style={{ background: T.panel, border: `1px solid ${T.danger}`, borderRadius: '8px', padding: '1rem' }}>
                            <h2 style={{ margin: '0 0 0.75rem 0', fontSize: '0.875rem', fontWeight: 600, color: T.danger, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Commit This Mutation
                            </h2>
                            <p style={{ fontSize: '0.8125rem', color: T.dim, margin: '0 0 0.75rem 0', lineHeight: 1.6 }}>
                                The Statement Below Was Executed And Rolled Back. It affected{' '}
                                <strong style={{ color: T.text }}>{result?.data?.rowCount ?? 0}</strong> Row(S) And Wrote Nothing.
                                To Run It For Real, Type Or Paste The Statement Back Exactly As Written:
                            </p>
                            <pre style={{
                                margin: '0 0 0.75rem 0', padding: '0.75rem', background: T.inset,
                                border: `1px solid ${T.line}`, borderRadius: '4px', color: T.text,
                                fontFamily: 'monospace', fontSize: '12px', overflowX: 'auto', whiteSpace: 'pre-wrap'
                            }}>{pendingSql}</pre>
                            <label htmlFor="commit-confirm" style={{ display: 'block', fontSize: '0.75rem', color: T.muted, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: '0.4rem' }}>
                                Confirmation
                            </label>
                            <textarea
                                id="commit-confirm"
                                value={confirmText}
                                onChange={(e) => setConfirmText(e.target.value)}
                                placeholder="Retype the statement above to enable Commit"
                                style={{
                                    width: '100%', boxSizing: 'border-box', minHeight: 88,
                                    background: T.inset, color: T.text,
                                    border: `1px solid ${confirmMatches ? T.accentLine : T.lineStrong}`,
                                    borderRadius: '4px', padding: '0.75rem',
                                    fontFamily: 'monospace', fontSize: '13px', resize: 'vertical'
                                }}
                                spellCheck="false"
                            />
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                                <button
                                    className="sqlc-focusable"
                                    onClick={handleCommit}
                                    disabled={!confirmMatches || isRunning}
                                    style={{
                                        background: confirmMatches && !isRunning ? T.danger : T.elevated,
                                        color: confirmMatches && !isRunning ? T.text : T.muted,
                                        border: 'none', padding: '0.5rem 1.5rem', minHeight: TAP, borderRadius: '4px',
                                        cursor: confirmMatches && !isRunning ? 'pointer' : 'not-allowed', fontWeight: 700
                                    }}>
                                    {isRunning ? 'Committing...' : 'Commit For Real'}
                                </button>
                                <button
                                    className="sqlc-focusable"
                                    onClick={() => { setPendingSql(null); setConfirmText(''); }}
                                    disabled={isRunning}
                                    style={{
                                        background: 'transparent', color: T.dim, border: `1px solid ${T.lineStrong}`,
                                        padding: '0.5rem 1rem', minHeight: TAP, borderRadius: '4px',
                                        cursor: isRunning ? 'not-allowed' : 'pointer', fontWeight: 600
                                    }}>
                                    Cancel
                                </button>
                                <span style={{ fontSize: '0.75rem', color: confirmMatches ? T.accent : T.muted }}>
                                    {confirmMatches ? 'Confirmation matches.' : 'Confirmation does not match yet.'}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Output Box */}
                    <div style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: '8px', padding: '1rem', minHeight: '300px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                            <h2 style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, color: T.dim, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Execution Output</h2>
                            {isTabular && (
                                <button
                                    className="sqlc-focusable"
                                    type="button"
                                    onClick={exportRows}
                                    style={{
                                        background: T.accentSoft, color: T.accent, border: `1px solid ${T.accentLine}`,
                                        padding: '0.5rem 1rem', minHeight: TAP, borderRadius: '4px', cursor: 'pointer', fontWeight: 700, fontSize: '0.8125rem'
                                    }}>
                                    {`Export CSV (${rows.length} Rows)`}
                                </button>
                            )}
                        </div>

                        {/* The rows below were true when they were read. Another
                            console committing since then is invisible from here,
                            so it has to be said rather than silently tolerated. */}
                        {staleSince && result && (
                            <p role="status" style={{ margin: '0 0 1rem 0', padding: '0.6rem 0.75rem', background: T.warnSoft, border: `1px solid ${T.warn}`, borderRadius: '4px', color: T.warn, fontSize: '0.8125rem', lineHeight: 1.6 }}>
                                {`Data Changed By Another Console Since This Query Ran (${staleSince.toLocaleTimeString()}). These Rows May No Longer Be Current. Run The Query Again To Refresh.`}
                            </p>
                        )}

                        {result ? (
                            <div style={{ background: T.inset, borderRadius: '4px', padding: '1rem', border: `1px solid ${result.data.success && !result.data.dryRun ? T.accentLine : T.danger}` }}>
                                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem', paddingBottom: '0.5rem', borderBottom: `1px solid ${T.line}` }}>
                                    <span style={{ color: statusColor, fontWeight: 700, letterSpacing: '0.05em' }}>
                                        {statusLabel}
                                    </span>
                                    {result.data.ms !== undefined && (
                                        <span style={{ color: T.dim }}>Time: {result.data.ms}ms</span>
                                    )}
                                    {result.data.rowCount !== undefined && (
                                        <span style={{ color: T.dim }}>
                                            {result.data.dryRun ? 'Rows that would be affected: ' : 'Rows: '}{result.data.rowCount}
                                        </span>
                                    )}
                                    {result.data.command && (
                                        <span style={{ color: T.dim }}>Command: {result.data.command}</span>
                                    )}
                                </div>

                                {result.data.notice && (
                                    <p style={{ margin: '0 0 1rem 0', padding: '0.6rem 0.75rem', background: T.dangerWash, border: `1px solid ${T.danger}`, borderRadius: '4px', color: T.text, fontSize: '0.8125rem', lineHeight: 1.6 }}>
                                        {result.data.notice}
                                    </p>
                                )}

                                {isTabular ? (
                                    <>
                                        <ResultTable rows={rows} />
                                        <details style={{ marginTop: '1rem' }}>
                                            <summary style={{ cursor: 'pointer', color: T.dim, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, minHeight: TAP, display: 'flex', alignItems: 'center' }}>
                                                Raw JSON
                                            </summary>
                                            <pre style={{ margin: '0.75rem 0 0 0', color: T.text, fontFamily: 'monospace', fontSize: '13px', overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
                                                {JSON.stringify(result.data, null, 2)}
                                            </pre>
                                        </details>
                                    </>
                                ) : (
                                    <pre style={{ margin: 0, color: T.text, fontFamily: 'monospace', fontSize: '13px', overflowX: 'auto', whiteSpace: 'pre-wrap' }}>
                                        {JSON.stringify(result.data, null, 2)}
                                    </pre>
                                )}
                            </div>
                        ) : (
                            <div style={{ color: T.muted, textAlign: 'center', padding: '4rem 0', fontStyle: 'italic' }}>
                                Run A Query To See The Database Output Here.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
