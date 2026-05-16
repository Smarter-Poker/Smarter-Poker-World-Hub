import React, { useState, useCallback } from 'react';
import { getAccessToken } from '../../src/lib/authHelpers';

// ─── Priority config ───────────────────────────────────────────────────────
const PRIORITIES = [
    { key: 'low',    label: 'Low',    color: '#22c55e', bg: 'rgba(34,197,94,0.12)',    border: 'rgba(34,197,94,0.3)',   desc: 'Minor issue, cosmetic' },
    { key: 'medium', label: 'Medium', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',   border: 'rgba(245,158,11,0.3)',  desc: 'Feature broken but workaround exists' },
    { key: 'high',   label: 'High',   color: '#ef4444', bg: 'rgba(239,68,68,0.12)',    border: 'rgba(239,68,68,0.3)',   desc: 'Blocking — can\'t use the app' },
];

// ─── Category quick-picks ──────────────────────────────────────────────────
const CATEGORIES = [
    '🔐 Login / Auth',
    '💬 Messenger',
    '🎥 Live Streaming',
    '💎 Diamonds / Payments',
    '🃏 Poker Training',
    '📊 Club Commander',
    '🔔 Notifications',
    '📱 UI / Display',
    '🐌 Performance',
    '🔧 Other',
];

export default function ReportBugWidget({ contextPath }) {
    const [open, setOpen]               = useState(false);
    const [subject, setSubject]         = useState('');
    const [category, setCategory]       = useState('');
    const [priority, setPriority]       = useState('medium');
    const [description, setDescription] = useState('');
    const [submitting, setSubmitting]   = useState(false);
    const [result, setResult]           = useState(null); // { success, ticketId } | null

    const currentPage = contextPath || (typeof window !== 'undefined' ? window.location.pathname : 'unknown');

    const reset = useCallback(() => {
        setSubject('');
        setCategory('');
        setPriority('medium');
        setDescription('');
        setResult(null);
    }, []);

    const handleClose = useCallback(() => {
        setOpen(false);
        setTimeout(reset, 300);
    }, [reset]);

    const handleCategoryPick = (cat) => {
        setCategory(cat);
        // Pre-fill subject if empty
        if (!subject) setSubject(cat.replace(/^[^ ]+ /, '') + ' Issue');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!subject.trim() || !description.trim()) return;
        setSubmitting(true);
        try {
            const token = typeof getAccessToken === 'function' ? getAccessToken() : null;
            const resp = await fetch('/api/live-help/report-bug', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({
                    subject:     `${category ? category + ' — ' : ''}${subject.trim()}`,
                    description: description.trim(),
                    priority,
                    currentPage,
                    userAgent:   typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
                }),
            });
            const data = await resp.json();
            setResult({ success: data.success, ticketId: data.ticketId });
        } catch (err) {
            setResult({ success: false });
        } finally {
            setSubmitting(false);
        }
    };

    const selectedPriority = PRIORITIES.find(p => p.key === priority) || PRIORITIES[1];

    return (
        <>
            {/* Trigger Button */}
            <button
                id="report-bug-btn"
                onClick={() => setOpen(true)}
                style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    width: '100%', padding: '11px 16px', borderRadius: 10,
                    background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
                    color: '#f87171', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                    transition: 'all 0.2s', fontFamily: 'inherit',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.15)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.45)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.08)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.25)'; }}
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                Report A Bug
            </button>

            {/* Modal Overlay */}
            {open && (
                <div
                    onClick={handleClose}
                    style={{
                        position: 'fixed', inset: 0, zIndex: 99999,
                        background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: 16, animation: 'rbw-fadeIn 0.15s ease-out',
                    }}
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            background: 'linear-gradient(160deg, #181c2a 0%, #0d1117 100%)',
                            border: '1px solid rgba(239,68,68,0.2)',
                            borderRadius: 18, padding: 0,
                            maxWidth: 420, width: '100%',
                            boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
                            animation: 'rbw-slideUp 0.2s ease-out',
                            overflow: 'hidden',
                        }}
                    >
                        {/* ── Header ── */}
                        <div style={{
                            padding: '18px 20px 16px',
                            borderBottom: '1px solid rgba(255,255,255,0.06)',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{
                                    width: 34, height: 34, borderRadius: 10,
                                    background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                                    </svg>
                                </div>
                                <div>
                                    <div style={{ fontWeight: 700, fontSize: 15, color: '#fff' }}>Report A Bug</div>
                                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>Goes directly to Support</div>
                                </div>
                            </div>
                            <button
                                onClick={handleClose}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.35)', fontSize: 22, lineHeight: 1, padding: '4px 6px', borderRadius: 6, fontFamily: 'inherit' }}
                                onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.7)'}
                                onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.35)'}
                            >×</button>
                        </div>

                        {/* ── Success State ── */}
                        {result?.success ? (
                            <div style={{ padding: '36px 24px', textAlign: 'center' }}>
                                <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
                                <div style={{ fontWeight: 700, fontSize: 17, color: '#fff', marginBottom: 8 }}>Report Sent!</div>
                                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6, marginBottom: 4 }}>
                                    Our team has been notified and will look into it.
                                </div>
                                {result.ticketId && (
                                    <div style={{
                                        display: 'inline-block', marginTop: 12,
                                        background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.2)',
                                        borderRadius: 8, padding: '6px 14px',
                                        fontSize: 12, color: '#00d4ff', fontFamily: 'monospace',
                                    }}>
                                        Ticket #{`BUG-${result.ticketId.substring(0, 8).toUpperCase()}`}
                                    </div>
                                )}
                                <button
                                    onClick={handleClose}
                                    style={{
                                        marginTop: 24, width: '100%', padding: '11px',
                                        borderRadius: 10, border: 'none', background: 'rgba(255,255,255,0.08)',
                                        color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                                    }}
                                >
                                    Close
                                </button>
                            </div>
                        ) : result?.success === false ? (
                            /* ── Error State ── */
                            <div style={{ padding: '36px 24px', textAlign: 'center' }}>
                                <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
                                <div style={{ fontWeight: 700, fontSize: 17, color: '#fff', marginBottom: 8 }}>Submission Failed</div>
                                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>
                                    Please email <a href="mailto:support@smarter.poker" style={{ color: '#60a5fa' }}>support@smarter.poker</a> directly.
                                </div>
                                <button
                                    onClick={() => setResult(null)}
                                    style={{
                                        marginTop: 20, padding: '10px 24px',
                                        borderRadius: 10, border: 'none', background: 'rgba(239,68,68,0.15)',
                                        color: '#f87171', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                                    }}
                                >
                                    Try Again
                                </button>
                            </div>
                        ) : (
                            /* ── Form ── */
                            <form onSubmit={handleSubmit} style={{ padding: '18px 20px 20px' }}>

                                {/* Category Quick-Picks */}
                                <div style={{ marginBottom: 16 }}>
                                    <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>
                                        Category
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                        {CATEGORIES.map(cat => (
                                            <button
                                                key={cat}
                                                type="button"
                                                onClick={() => handleCategoryPick(cat)}
                                                style={{
                                                    padding: '5px 10px', borderRadius: 20, fontSize: 12, fontWeight: 500,
                                                    cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                                                    background: category === cat ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.05)',
                                                    border: category === cat ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(255,255,255,0.08)',
                                                    color: category === cat ? '#fca5a5' : 'rgba(255,255,255,0.55)',
                                                }}
                                            >
                                                {cat}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Subject */}
                                <div style={{ marginBottom: 14 }}>
                                    <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 }}>
                                        Subject <span style={{ color: '#f87171' }}>*</span>
                                    </div>
                                    <input
                                        type="text"
                                        value={subject}
                                        onChange={e => setSubject(e.target.value)}
                                        placeholder="Brief description of the issue…"
                                        maxLength={120}
                                        required
                                        style={{
                                            width: '100%', padding: '10px 12px', borderRadius: 10, fontSize: 14,
                                            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                                            color: '#fff', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                                            transition: 'border-color 0.2s',
                                        }}
                                        onFocus={e => e.target.style.borderColor = 'rgba(239,68,68,0.5)'}
                                        onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                                    />
                                </div>

                                {/* Priority */}
                                <div style={{ marginBottom: 14 }}>
                                    <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>
                                        Priority
                                    </div>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        {PRIORITIES.map(p => (
                                            <button
                                                key={p.key}
                                                type="button"
                                                onClick={() => setPriority(p.key)}
                                                style={{
                                                    flex: 1, padding: '8px 6px', borderRadius: 10, fontSize: 13,
                                                    fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                                                    transition: 'all 0.15s', textAlign: 'center',
                                                    background: priority === p.key ? p.bg : 'rgba(255,255,255,0.04)',
                                                    border: `1px solid ${priority === p.key ? p.border : 'rgba(255,255,255,0.08)'}`,
                                                    color: priority === p.key ? p.color : 'rgba(255,255,255,0.4)',
                                                }}
                                            >
                                                {p.label}
                                            </button>
                                        ))}
                                    </div>
                                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 5 }}>
                                        {selectedPriority.desc}
                                    </div>
                                </div>

                                {/* Description */}
                                <div style={{ marginBottom: 16 }}>
                                    <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 }}>
                                        What Happened? <span style={{ color: '#f87171' }}>*</span>
                                    </div>
                                    <textarea
                                        value={description}
                                        onChange={e => setDescription(e.target.value)}
                                        placeholder="Describe the bug. What were you doing when it happened? What did you expect vs what occurred?"
                                        required
                                        rows={4}
                                        maxLength={2000}
                                        style={{
                                            width: '100%', padding: '10px 12px', borderRadius: 10, fontSize: 13,
                                            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                                            color: '#fff', outline: 'none', fontFamily: 'inherit', resize: 'vertical',
                                            lineHeight: 1.6, boxSizing: 'border-box', minHeight: 96,
                                            transition: 'border-color 0.2s',
                                        }}
                                        onFocus={e => e.target.style.borderColor = 'rgba(239,68,68,0.5)'}
                                        onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                                    />
                                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', textAlign: 'right', marginTop: 3 }}>
                                        {description.length}/2000
                                    </div>
                                </div>

                                {/* Auto-captured context notice */}
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16,
                                    padding: '8px 12px', borderRadius: 8,
                                    background: 'rgba(0,212,255,0.05)', border: '1px solid rgba(0,212,255,0.1)',
                                }}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#00d4ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                                    </svg>
                                    <span style={{ fontSize: 11, color: 'rgba(0,212,255,0.7)' }}>
                                        Page URL and device info will be included automatically
                                    </span>
                                </div>

                                {/* Submit */}
                                <button
                                    type="submit"
                                    disabled={submitting || !subject.trim() || !description.trim()}
                                    style={{
                                        width: '100%', padding: '12px',
                                        borderRadius: 12, border: 'none',
                                        background: (submitting || !subject.trim() || !description.trim())
                                            ? 'rgba(255,255,255,0.08)'
                                            : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                                        color: (submitting || !subject.trim() || !description.trim())
                                            ? 'rgba(255,255,255,0.3)'
                                            : '#fff',
                                        fontSize: 15, fontWeight: 700, cursor: (submitting || !subject.trim() || !description.trim()) ? 'not-allowed' : 'pointer',
                                        fontFamily: 'inherit', transition: 'all 0.2s',
                                        boxShadow: (submitting || !subject.trim() || !description.trim()) ? 'none' : '0 4px 20px rgba(239,68,68,0.35)',
                                    }}
                                >
                                    {submitting ? (
                                        <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'rbw-spin 0.8s linear infinite' }}>
                                                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                                            </svg>
                                            Sending…
                                        </span>
                                    ) : 'Send Bug Report'}
                                </button>
                            </form>
                        )}
                    </div>
                </div>
            )}

            <style>{`
                @keyframes rbw-fadeIn  { from { opacity: 0 } to { opacity: 1 } }
                @keyframes rbw-slideUp { from { opacity: 0; transform: translateY(20px) scale(0.97) } to { opacity: 1; transform: translateY(0) scale(1) } }
                @keyframes rbw-spin    { to { transform: rotate(360deg) } }
                #report-bug-btn:active { transform: scale(0.98) }
            `}</style>
        </>
    );
}

// Legacy export kept for backward compat with GeevesFloatingOrb references
export function openBugMessenger() {
    document.getElementById('report-bug-btn')?.click();
}
export { openBugMessenger as openBugReport };
