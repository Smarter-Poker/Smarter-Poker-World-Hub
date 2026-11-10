import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ReportBugWidget from '../ui/ReportBugWidget';
import { authedFetch, getAuthUserId } from '../../lib/authUtils';
import { supabase } from '../../lib/supabase';

// The Messenger "Report A Bug" widget.
//
// Every account gets the normal submission form. The one account the server
// names as the bug report recipient also gets the incoming reports here, with
// an unread badge that updates as reports arrive. Who that account is, is
// decided by /api/messenger/bug-reports from the caller's session: this file
// holds no account id, and a caller the server does not recognise as the
// recipient keeps the plain form.
//
// A failed request is not a "not the recipient" answer. Once the server has
// confirmed this account as the recipient, that fact is remembered on this
// device for this account, and a later failure shows Bug Inbox Unavailable
// with a retry instead of quietly falling back to the plain form.

const RECIPIENT_MEMORY_PREFIX = 'sp_bug_inbox_recipient:';

function recipientMemoryKey() {
    const accountId = getAuthUserId();
    return accountId ? `${RECIPIENT_MEMORY_PREFIX}${accountId}` : null;
}

function wasConfirmedRecipient() {
    try {
        const key = recipientMemoryKey();
        return Boolean(key && window.localStorage.getItem(key) === '1');
    } catch (_error) { return false; }
}

function rememberRecipient(isRecipient) {
    try {
        const key = recipientMemoryKey();
        if (!key) return;
        if (isRecipient) window.localStorage.setItem(key, '1');
        else window.localStorage.removeItem(key);
    } catch (_error) { /* private mode: the inbox still works, only the memory is lost */ }
}

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

function formatWhen(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function BugReportInboxWidget({ contextPath, theme = 'dark' }) {
    const isLight = theme === 'light';
    const [inbox, setInbox] = useState(null); // null until the server says this account is the recipient
    const [open, setOpen] = useState(false);
    const [selectedId, setSelectedId] = useState(null);
    const [loadError, setLoadError] = useState(false);
    const [busy, setBusy] = useState(false);
    const [knownRecipient, setKnownRecipient] = useState(false);
    const [portalReady, setPortalReady] = useState(false);
    const requestRef = useRef(0);
    const triggerRef = useRef(null);
    const dialogRef = useRef(null);
    const closeRef = useRef(null);

    useEffect(() => {
        setPortalReady(true);
        setKnownRecipient(wasConfirmedRecipient());
    }, []);

    // One request shape for listing and for marking read: every answer is the
    // refreshed inbox, so the badge always shows the saved state.
    const request = useCallback(async (body = {}) => {
        const sequence = ++requestRef.current;
        setBusy(true);
        try {
            const response = await authedFetch('/api/messenger/bug-reports', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await response.json().catch(() => null);
            if (sequence !== requestRef.current) return;
            if (!response.ok || !data?.success) {
                // Could not tell. Never treated as "not the recipient".
                setLoadError(true);
                return;
            }
            setLoadError(false);
            const isRecipient = data.owner === true;
            rememberRecipient(isRecipient);
            setKnownRecipient(isRecipient);
            setInbox(isRecipient ? data : null);
        } catch (_error) {
            if (sequence === requestRef.current) setLoadError(true);
        } finally {
            if (sequence === requestRef.current) setBusy(false);
        }
    }, []);
    const load = useCallback(() => request({}), [request]);

    useEffect(() => { load(); }, [load]);

    const isOwner = inbox?.owner === true;
    const conversationId = inbox?.conversationId || null;

    // Live arrival: the recipient is a participant of the report conversation,
    // so the same realtime feed Messenger already uses carries each new report.
    useEffect(() => {
        if (!isOwner) return undefined;
        const channel = supabase
            .channel(`bug-reports:${conversationId || 'pending'}:${Math.random().toString(36).slice(2, 8)}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'social_messages',
                ...(conversationId ? { filter: `conversation_id=eq.${conversationId}` } : {}),
            }, (payload) => {
                if (conversationId || payload?.new?.media_metadata?.kind === 'bug_report') load();
            })
            .subscribe();
        const onVisible = () => { if (document.visibilityState === 'visible') load(); };
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('focus', onVisible);
        return () => {
            document.removeEventListener('visibilitychange', onVisible);
            window.removeEventListener('focus', onVisible);
            supabase.removeChannel(channel);
        };
    }, [isOwner, conversationId, load]);

    const handleClose = useCallback(() => {
        setOpen(false);
        setSelectedId(null);
    }, []);

    useEffect(() => {
        if (!open) return undefined;
        load();
        const previousFocus = document.activeElement;
        const focusTimer = window.setTimeout(() => closeRef.current?.focus(), 0);
        const onKeyDown = (event) => {
            // The submission form opens above this dialog and owns its own keys.
            if (document.querySelectorAll('[data-world-command-child-dialog="true"]').length > 1) return;
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                handleClose();
                return;
            }
            if (event.key !== 'Tab' || !dialogRef.current) return;
            const controls = Array.from(dialogRef.current.querySelectorAll(FOCUSABLE))
                .filter((element) => element.offsetParent !== null);
            if (!controls.length) return;
            const first = controls[0];
            const last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', onKeyDown, true);
        return () => {
            window.clearTimeout(focusTimer);
            document.removeEventListener('keydown', onKeyDown, true);
            const target = triggerRef.current?.isConnected ? triggerRef.current : previousFocus;
            target?.focus?.();
        };
    }, [open, load, handleClose]);

    // Opening a report marks that one report read and no other.
    const openReport = useCallback((report) => {
        setSelectedId(report.id);
        if (report.unread) request({ action: 'read', reportId: report.id });
    }, [request]);

    if (!isOwner) {
        if (loadError && knownRecipient) {
            // This account is the recipient and its inbox could not be read.
            return (
                <div data-bug-report-inbox-unavailable="true" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div role="alert" style={{
                        padding: '10px 12px', borderRadius: 10, textAlign: 'left',
                        border: '1px solid rgba(239,68,68,0.5)', background: 'rgba(239,68,68,0.10)',
                        color: isLight ? '#b91c1c' : '#fecaca', fontSize: 13, fontWeight: 600,
                    }}>
                        Bug Inbox Unavailable
                        <div style={{ marginTop: 2, fontSize: 12, fontWeight: 400 }}>
                            Incoming Reports Could Not Be Loaded.
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={load}
                        disabled={busy}
                        style={{
                            minHeight: 44, borderRadius: 10, cursor: busy ? 'default' : 'pointer',
                            border: '1px solid rgba(239,68,68,0.5)', background: 'transparent',
                            color: isLight ? '#b91c1c' : '#fecaca', fontSize: 14, fontWeight: 600, fontFamily: 'inherit',
                        }}
                    >{busy ? 'Retrying' : 'Retry Bug Inbox'}</button>
                    <ReportBugWidget contextPath={contextPath} theme={theme} />
                </div>
            );
        }
        return <ReportBugWidget contextPath={contextPath} theme={theme} />;
    }

    const reports = Array.isArray(inbox.reports) ? inbox.reports : [];
    const unreadCount = Number(inbox.unreadCount) || 0;
    const selected = reports.find((report) => report.id === selectedId) || null;
    const badgeLabel = unreadCount > 99 ? '99+' : unreadCount.toLocaleString();

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                data-bug-report-inbox-trigger="true"
                aria-label={unreadCount > 0 ? `Report A Bug, ${unreadCount.toLocaleString()} Unread ${unreadCount === 1 ? 'Report' : 'Reports'}` : 'Report A Bug'}
                onClick={() => setOpen(true)}
                style={{
                    position: 'relative',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    width: '100%', minHeight: 44, padding: '11px 16px', borderRadius: 10,
                    background: isLight ? 'transparent' : 'rgba(255,255,255,0.08)',
                    border: isLight ? '1px solid rgba(0,132,255,0.35)' : '1px solid rgba(255,255,255,0.25)',
                    color: isLight ? '#0084FF' : '#e5e7eb',
                    fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                }}
            >
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                Report A Bug
                {unreadCount > 0 && (
                    <span
                        data-bug-report-unread-badge="true"
                        aria-hidden="true"
                        style={{
                            minWidth: 22, height: 22, padding: '0 6px', borderRadius: 11,
                            background: '#ef4444', color: '#fff', fontSize: 12, fontWeight: 700,
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                        }}
                    >{badgeLabel}</span>
                )}
            </button>

            {open && portalReady && createPortal((
                <div
                    onClick={handleClose}
                    style={{
                        position: 'fixed', inset: 0, zIndex: 99998,
                        background: 'rgba(0,0,0,0.72)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: 'max(16px, env(safe-area-inset-top, 0px)) max(16px, env(safe-area-inset-right, 0px)) max(16px, env(safe-area-inset-bottom, 0px)) max(16px, env(safe-area-inset-left, 0px))',
                    }}
                >
                    <div
                        ref={dialogRef}
                        role="dialog"
                        aria-modal="true"
                        aria-label="Bug Reports"
                        data-world-command-child-dialog="true"
                        data-bug-report-inbox="true"
                        onClick={(event) => event.stopPropagation()}
                        style={{
                            background: 'linear-gradient(160deg, #181c2a 0%, #0d1117 100%)',
                            border: '1px solid rgba(255,255,255,0.2)', borderRadius: 18,
                            maxWidth: 460, width: '100%', maxHeight: 'calc(100dvh - 32px)',
                            display: 'flex', flexDirection: 'column', overflow: 'hidden',
                            boxShadow: '0 24px 80px rgba(0,0,0,0.6)', color: '#fff', textAlign: 'left',
                        }}
                    >
                        <div style={{
                            padding: '10px 8px 10px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)',
                            display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
                        }}>
                            {selected && (
                                <button
                                    type="button"
                                    aria-label="Back To Bug Reports"
                                    onClick={() => setSelectedId(null)}
                                    style={{ width: 44, height: 44, marginLeft: -12, background: 'none', border: 'none', color: '#e5e7eb', fontSize: 22, cursor: 'pointer', fontFamily: 'inherit' }}
                                >{'‹'}</button>
                            )}
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 700, fontSize: 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {selected ? (selected.reference || selected.kind) : 'Bug Reports'}
                                </div>
                                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 1 }}>
                                    {selected
                                        ? `${selected.kind} From ${selected.source}`
                                        : (unreadCount > 0 ? `${unreadCount.toLocaleString()} Unread` : 'All Caught Up')}
                                </div>
                            </div>
                            <button
                                ref={closeRef}
                                type="button"
                                aria-label="Close Bug Reports"
                                onClick={handleClose}
                                style={{ width: 44, height: 44, background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: 22, lineHeight: 1, cursor: 'pointer', fontFamily: 'inherit' }}
                            >{'×'}</button>
                        </div>

                        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain' }}>
                            {loadError && (
                                <div role="alert" style={{ padding: '6px 8px 6px 16px', fontSize: 12, color: '#fecaca', background: 'rgba(239,68,68,0.12)', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ flex: 1 }}>Bug Inbox Unavailable. Showing The Last Loaded List.</span>
                                    <button type="button" onClick={load} disabled={busy} style={{ minHeight: 44, padding: '0 12px', background: 'none', border: '1px solid rgba(239,68,68,0.5)', borderRadius: 8, color: '#fecaca', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Retry</button>
                                </div>
                            )}
                            {selected ? (
                                <div data-bug-report-detail="true" style={{ padding: 16 }}>
                                    <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.3, overflowWrap: 'anywhere' }}>{selected.subject}</div>
                                    <dl style={{ margin: '14px 0 0', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 12px', fontSize: 13 }}>
                                        {[
                                            ['Reporter', selected.reporter],
                                            ['Priority', selected.priority],
                                            ['Page', selected.page],
                                            ['Reported', formatWhen(selected.reportedAt)],
                                            ['Reference', selected.reference],
                                        ].filter(([, value]) => value).map(([label, value]) => (
                                            <React.Fragment key={label}>
                                                <dt style={{ color: 'rgba(255,255,255,0.5)' }}>{label}</dt>
                                                <dd style={{ margin: 0, overflowWrap: 'anywhere' }}>{value}</dd>
                                            </React.Fragment>
                                        ))}
                                    </dl>
                                    <div style={{
                                        marginTop: 14, padding: 12, borderRadius: 10, fontSize: 14, lineHeight: 1.5,
                                        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                                        whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
                                    }}>{selected.description || 'No Description Provided'}</div>
                                    <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {[
                                            ['Open In Messenger', `/hub/messenger?conversation=${selected.conversationId}`],
                                            ['Open Ticket Queue', selected.queueUrl],
                                            ['Open Reporter Profile', selected.profileUrl],
                                        ].filter(([, href]) => href).map(([label, href]) => (
                                            <a key={label} href={href} style={{
                                                minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                borderRadius: 10, border: '1px solid rgba(255,255,255,0.2)', color: '#e5e7eb',
                                                fontSize: 14, fontWeight: 600, textDecoration: 'none',
                                            }}>{label}</a>
                                        ))}
                                    </div>
                                </div>
                            ) : reports.length === 0 ? (
                                <div style={{ padding: '32px 16px', textAlign: 'center', fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>
                                    No Bug Reports Yet
                                </div>
                            ) : (
                                <ul data-bug-report-list="true" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                                    {reports.map((report) => (
                                        <li key={report.id}>
                                            <button
                                                type="button"
                                                data-bug-report-unread={report.unread ? 'true' : 'false'}
                                                onClick={() => openReport(report)}
                                                style={{
                                                    width: '100%', minHeight: 64, padding: '12px 16px', textAlign: 'left',
                                                    display: 'flex', alignItems: 'flex-start', gap: 10,
                                                    background: report.unread ? 'rgba(59,130,246,0.10)' : 'transparent',
                                                    border: 'none', borderBottom: '1px solid rgba(255,255,255,0.06)',
                                                    color: '#fff', cursor: 'pointer', fontFamily: 'inherit',
                                                }}
                                            >
                                                <span aria-hidden="true" style={{
                                                    width: 8, height: 8, borderRadius: 4, marginTop: 6, flexShrink: 0,
                                                    background: report.unread ? '#3b82f6' : 'transparent',
                                                }} />
                                                <span style={{ flex: 1, minWidth: 0 }}>
                                                    <span style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                                                        <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: report.unread ? 700 : 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                            {report.subject}
                                                        </span>
                                                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', flexShrink: 0 }}>{formatWhen(report.reportedAt)}</span>
                                                    </span>
                                                    <span style={{ display: 'block', marginTop: 3, fontSize: 12, color: 'rgba(255,255,255,0.6)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {[report.unread ? 'New' : '', report.kind, report.priority, report.reporter].filter(Boolean).join(' · ')}
                                                    </span>
                                                </span>
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        {!selected && (
                            <div style={{ padding: 12, borderTop: '1px solid rgba(255,255,255,0.08)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {unreadCount > 0 && (
                                    <button
                                        type="button"
                                        data-bug-report-mark-all-read="true"
                                        onClick={() => request({ action: 'read_all' })}
                                        disabled={busy}
                                        style={{
                                            minHeight: 44, borderRadius: 10, border: '1px solid rgba(255,255,255,0.2)',
                                            background: 'transparent', color: '#e5e7eb', fontSize: 14, fontWeight: 600,
                                            cursor: 'pointer', fontFamily: 'inherit',
                                        }}
                                    >Mark All Read</button>
                                )}
                                <ReportBugWidget contextPath={contextPath} theme="dark" instanceId="messenger-owner-inbox" />
                            </div>
                        )}
                    </div>
                </div>
            ), document.body)}
        </>
    );
}
