/* ═══════════════════════════════════════════════════════════════════════════
   GEEVES FLOATING ORB — Global "Ask Geeves" button + expandable chat panel
   
   Renders on EVERY page via _app.js. Provides instant Geeves access even on
   pages without UniversalHeader/HamburgerMenu (e.g., Club Commander, poker
   table). Auto-hides when HamburgerMenu is already open.
   
   Features:
   - Floating circular button (bottom-right, above bottom nav)
   - Expands to a full chat panel on click
   - Context-aware quick chips based on current page
   - Cross-page conversation memory via sessionStorage
   - Keyboard shortcut: Cmd+J / Ctrl+J to toggle
   - Pulsing glow animation to draw attention
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';

// ─── Auth helper (SSR-safe) ───
function getAuthToken() {
    if (typeof window === 'undefined') return null;
    try {
        const keys = ['smarter-poker-auth', 'smarter_poker_auth', 'sp_auth'];
        for (const key of keys) {
            const raw = localStorage.getItem(key);
            if (raw) { const p = JSON.parse(raw); if (p?.access_token) return p.access_token; }
        }
    } catch { }
    return null;
}

// ─── Session storage key for cross-page memory ───
const SESSION_KEY = 'geeves-orb-messages';
const SEEN_PAGES_KEY = 'geeves-seen-pages';

function loadSessionMessages() {
    try {
        const raw = sessionStorage.getItem(SESSION_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}

function saveSessionMessages(msgs) {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(msgs.slice(-30))); } catch { }
}

// ─── Context-aware quick chips ───
function getPageChips(path) {
    const p = (path || '').toLowerCase();
    if (p.includes('toke-tracker')) return [
        { label: 'How do I log a down?', q: 'How do I log a down in the Toke Tracker?' },
        { label: 'What is EHR?', q: 'What is EHR and how is it calculated?' },
        { label: 'Export my data', q: 'How do I export my Toke Tracker data?' },
    ];
    if (p.includes('commander') && p.includes('tournament')) return [
        { label: 'Start a tournament', q: 'How do I start a tournament in Club Commander?' },
        { label: 'Table balancing', q: 'How does table balancing work?' },
        { label: 'Blind structure', q: 'How do I set up a blind structure?' },
    ];
    if (p.includes('commander')) return [
        { label: 'Venue management', q: 'How do I manage my venue in Club Commander?' },
        { label: 'Player check-in', q: 'How does player check-in work?' },
        { label: 'Waitlist setup', q: 'How do I set up a waitlist?' },
    ];
    if (p.includes('club-arena') && p.includes('table')) return [
        { label: 'Game rules', q: 'What are the game rules in Club Arena?' },
        { label: 'How to bet', q: 'How do I place a bet at the table?' },
        { label: 'Chat at table', q: 'How do I use the chat at the poker table?' },
    ];
    if (p.includes('club-arena')) return [
        { label: 'Join a club', q: 'How do I join a club in Club Arena?' },
        { label: 'Chip balance', q: 'How does my chip balance work in Club Arena?' },
        { label: 'Create a game', q: 'How do I create a new game in Club Arena?' },
    ];
    if (p.includes('training') || p.includes('gto')) return [
        { label: 'What is GTO?', q: 'What is GTO strategy in poker?' },
        { label: 'Range charts', q: 'How do I read range charts?' },
        { label: 'Bet sizing', q: 'Explain bet sizing theory in GTO.' },
    ];
    if (p.includes('bankroll')) return [
        { label: 'Add a session', q: 'How do I add a session in Bankroll Manager?' },
        { label: 'What is ROI?', q: 'How is ROI calculated in the Bankroll Manager?' },
        { label: 'Set goals', q: 'How do I set financial goals for my bankroll?' },
    ];
    if (p.includes('trivia')) return [
        { label: 'Game modes', q: 'What game modes are available in Poker Trivia?' },
        { label: 'Win diamonds', q: 'How do I win diamonds playing trivia?' },
        { label: 'Hand rankings', q: 'What are the poker hand rankings?' },
    ];
    if (p.includes('social') || p.includes('friends')) return [
        { label: 'Add friends', q: 'How do I add friends on Smarter.Poker?' },
        { label: 'Post content', q: 'How do I create a post on the social feed?' },
        { label: 'Privacy settings', q: 'How do I manage my privacy settings?' },
    ];
    if (p.includes('sandbox')) return [
        { label: 'Analyze a hand', q: 'How do I set up a hand to analyze in the sandbox?' },
        { label: 'Pot odds', q: 'How are pot odds calculated?' },
        { label: 'Equity', q: 'What is equity realization?' },
    ];
    // Default
    return [
        { label: 'What is Smarter.Poker?', q: 'What is Smarter.Poker and what can I do here?' },
        { label: 'Help with features', q: 'What are the main features of Smarter.Poker?' },
        { label: 'Diamond economy', q: 'How does the diamond economy work?' },
    ];
}

// ─── Proactive tip per page (shows once per session) ───
function getPageTip(path) {
    const p = (path || '').toLowerCase();
    if (p.includes('commander')) return '💡 Need help managing your venue? Ask me anything!';
    if (p.includes('toke-tracker')) return '💡 I can help you track downs, calculate EHR, and more!';
    if (p.includes('club-arena') && p.includes('table')) return '💡 Questions about the game? I\'m here to help!';
    if (p.includes('club-arena')) return '💡 Need help with Club Arena? Ask me!';
    if (p.includes('bankroll')) return '💡 I can explain ROI, bankroll math, and more!';
    if (p.includes('training') || p.includes('gto')) return '💡 Want to understand GTO concepts? Just ask!';
    return null;
}

export default function GeevesFloatingOrb() {
    const router = useRouter();
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [showTip, setShowTip] = useState(false);
    const [tipText, setTipText] = useState('');
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);
    const msgIdRef = useRef(0); // ← atomic counter avoids Date.now() ID collisions
    const path = router.asPath || '';

    // ── SSR guard — only render on client ──
    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);

    // ── Load messages from session on mount ──
    useEffect(() => {
        if (mounted) setMessages(loadSessionMessages());
    }, [mounted]);

    // ── Save messages to session when they change ──
    useEffect(() => {
        if (mounted && messages.length > 0) saveSessionMessages(messages);
    }, [messages, mounted]);

    // ── Auto-scroll ──
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isTyping]);

    // ── Focus input on open ──
    useEffect(() => {
        if (isOpen) setTimeout(() => inputRef.current?.focus(), 200);
    }, [isOpen]);

    // ── Proactive tip (once per page per session) ──
    useEffect(() => {
        if (!mounted || isOpen) return;
        const tip = getPageTip(path);
        if (!tip) return;
        try {
            const seen = JSON.parse(sessionStorage.getItem(SEEN_PAGES_KEY) || '{}');
            const pageKey = path.split('?')[0];
            if (seen[pageKey]) return;
            seen[pageKey] = true;
            sessionStorage.setItem(SEEN_PAGES_KEY, JSON.stringify(seen));
        } catch { return; }
        const timer = setTimeout(() => {
            setTipText(tip);
            setShowTip(true);
            setTimeout(() => setShowTip(false), 6000);
        }, 3000);
        return () => clearTimeout(timer);
    }, [path, mounted, isOpen]);

    // ── Keyboard shortcut: Cmd+J / Ctrl+J ──
    // IMPORTANT: Only register if LiveHelpPanel's KeyboardShortcuts isn't active
    // (detected by checking for the Geeves shortcut marker in the DOM)
    useEffect(() => {
        const handler = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
                // If LiveHelpPanel's shortcut handler exists, let it handle Cmd+J
                // (pages with UniversalHeader/ThreePillHeader already have Cmd+J wired)
                const hasExistingHandler = document.querySelector('[data-geeves-live-help]');
                if (hasExistingHandler) return; // Don't conflict — let LiveHelpPanel handle it
                e.preventDefault();
                setIsOpen(prev => !prev);
            }
            // Escape closes the panel
            if (e.key === 'Escape' && isOpen) {
                e.preventDefault();
                setIsOpen(false);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [isOpen]);

    // ── Send message — MUST be above any early returns (Rules of Hooks) ──
    const sendMessage = useCallback(async (text) => {
        if (!text?.trim()) return;
        const uid = ++msgIdRef.current; // unique, collision-free ID
        const userMsg = { id: uid, content: text.trim(), isUser: true };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsTyping(true);

        try {
            const token = getAuthToken();
            const headers = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const res = await fetch('/api/geeves/chat', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    message: text.trim(),
                    currentPage: path,
                }),
            });

            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const answer = data.response || data.message || data.reply || data.answer || 'I had trouble with that. Try again!';
            const followUps = Array.isArray(data.followUps) ? data.followUps : [];
            setMessages(prev => [...prev, {
                id: ++msgIdRef.current, // guaranteed unique
                content: answer,
                isUser: false,
                followUps,
            }]);
        } catch (err) {
            console.warn('[GeevesOrb] Chat error:', err.message);
            setMessages(prev => [...prev, {
                id: ++msgIdRef.current,
                content: "I'm having trouble connecting. Please try again in a moment.",
                isUser: false,
            }]);
        } finally {
            setIsTyping(false);
        }
    }, [path]);

    // ── Enter key submit — memoized so it doesn't recreate every render ──
    const handleKeyDown = useCallback((e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
    }, [input, sendMessage]);

    // ── Don't render on landing/auth pages ──
    // NOTE: All hooks must be defined ABOVE this guard (Rules of Hooks)
    if (!mounted) return null;
    const cleanPath = path.split('?')[0];
    if (cleanPath === '/' || cleanPath.startsWith('/auth') || cleanPath.startsWith('/login') || cleanPath.startsWith('/signup')) return null;

    const chips = getPageChips(path);

    // ═══════════════════════════════════════════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════════════════════════════════════════

    return (
        <>
            {/* ── Proactive Tip Bubble — floats above the collapsed bar ── */}
            {showTip && !isOpen && (
                <div
                    onClick={() => { setShowTip(false); setIsOpen(true); }}
                    style={{
                        position: 'fixed', bottom: 58, right: 16, zIndex: 99997,
                        maxWidth: 240, padding: '9px 13px', borderRadius: 10,
                        background: 'linear-gradient(135deg, #001e3c 0%, #002855 100%)',
                        border: '1px solid rgba(0, 212, 255, 0.3)',
                        color: '#e0f0ff', fontSize: 12, lineHeight: 1.4,
                        boxShadow: '0 4px 16px rgba(0,0,0,0.45)',
                        cursor: 'pointer', animation: 'geevesSlideIn 0.3s ease-out',
                    }}
                >
                    {tipText}
                    <div style={{ fontSize: 10, color: 'rgba(0,212,255,0.7)', marginTop: 3 }}>Tap to ask →</div>
                </div>
            )}

            {/* ── Collapsed Bottom Bar (click to open) ── */}
            {!isOpen && (
                <button
                    onClick={() => { setIsOpen(true); setShowTip(false); }}
                    title="Ask Geeves (⌘J)"
                    style={{
                        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 99998,
                        height: 44,
                        paddingBottom: 'env(safe-area-inset-bottom)',
                        background: 'linear-gradient(90deg, #001e3c 0%, #002855 60%, #001e3c 100%)',
                        borderTop: '1px solid rgba(0, 212, 255, 0.25)',
                        cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
                        padding: '0 20px',
                    }}
                >
                    <img
                        src="/images/geeves-avatar.png"
                        alt="Geeves"
                        style={{ width: 26, height: 26, borderRadius: '50%', objectFit: 'cover', border: '1px solid rgba(0,212,255,0.35)', flexShrink: 0 }}
                        onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                    />
                    <span style={{
                        display: 'none', width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                        background: 'rgba(0, 212, 255, 0.15)', alignItems: 'center', justifyContent: 'center',
                        fontSize: 14, color: '#00d4ff', border: '1px solid rgba(0,212,255,0.35)',
                    }}>G</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#e0f4ff', letterSpacing: '0.3px' }}>
                        Ask Geeves
                    </span>
                    <span style={{ fontSize: 11, color: 'rgba(0,212,255,0.5)', marginLeft: 4 }}>⌘J</span>
                    <svg style={{ marginLeft: 'auto', opacity: 0.4 }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00d4ff" strokeWidth="2.5" strokeLinecap="round">
                        <polyline points="18 15 12 9 6 15" />
                    </svg>
                </button>
            )}

            {/* ── Expanded Chat Panel (slide-up) ── */}
            {isOpen && (
                <div style={{
                    position: 'fixed', bottom: 0, right: 0, left: 0, zIndex: 99999,
                    height: '70vh', maxHeight: 520,
                    background: 'linear-gradient(180deg, #0a1628 0%, #0d1f3c 100%)',
                    borderTop: '2px solid rgba(0, 212, 255, 0.3)',
                    borderRadius: '20px 20px 0 0',
                    display: 'flex', flexDirection: 'column',
                    boxShadow: '0 -8px 40px rgba(0,0,0,0.5)',
                    animation: 'geevesSlideUp 0.25s ease-out',
                }}>
                    {/* Panel Header */}
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '14px 18px', borderBottom: '1px solid rgba(0,212,255,0.15)',
                        flexShrink: 0,
                    }}>
                        <img
                            src="/images/geeves-avatar.png"
                            alt="Geeves"
                            style={{ width: 36, height: 36, borderRadius: '50%', border: '2px solid rgba(0,212,255,0.4)', objectFit: 'cover' }}
                            onError={(e) => { e.target.style.display = 'none'; }}
                        />
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', letterSpacing: '0.5px' }}>Ask Geeves</div>
                            <div style={{ fontSize: 11, color: 'rgba(0,212,255,0.6)' }}>Your AI Help Expert · ⌘J</div>
                        </div>
                        <button onClick={() => { setMessages([]); try { sessionStorage.removeItem(SESSION_KEY); } catch { } }} title="Clear chat"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', fontSize: 13, padding: '4px 8px' }}>
                            Clear
                        </button>
                        <button onClick={() => setIsOpen(false)} title="Close"
                            style={{ background: 'rgba(255,255,255,0.08)', border: 'none', cursor: 'pointer', color: '#fff', fontSize: 20, width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            ×
                        </button>
                    </div>

                    {/* Messages Area */}
                    <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {/* Welcome message if empty */}
                        {messages.length === 0 && (
                            <div style={{ textAlign: 'center', padding: '20px 10px' }}>
                                <div style={{ fontSize: 15, fontWeight: 600, color: '#fff', marginBottom: 6 }}>
                                    Hey! I'm Geeves 👋
                                </div>
                                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 16, lineHeight: 1.5 }}>
                                    I know everything about Smarter.Poker, Club Commander, and Club Arena. Ask me anything!
                                </div>
                                {/* Quick Chips */}
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                                    {chips.map((chip, i) => (
                                        <button
                                            key={i}
                                            onClick={() => sendMessage(chip.q)}
                                            style={{
                                                padding: '8px 14px', borderRadius: 20,
                                                background: 'rgba(0, 212, 255, 0.08)',
                                                border: '1px solid rgba(0, 212, 255, 0.25)',
                                                color: '#00d4ff', fontSize: 12, fontWeight: 500,
                                                cursor: 'pointer', transition: 'all 0.2s',
                                            }}
                                            onMouseEnter={e => { e.target.style.background = 'rgba(0,212,255,0.18)'; }}
                                            onMouseLeave={e => { e.target.style.background = 'rgba(0,212,255,0.08)'; }}
                                        >
                                            {chip.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Chat Messages */}
                        {messages.map((msg, idx) => (
                            <div key={msg.id}>
                                <div style={{
                                    alignSelf: msg.isUser ? 'flex-end' : 'flex-start',
                                    maxWidth: '80%',
                                    padding: '10px 14px', borderRadius: msg.isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                                    background: msg.isUser
                                        ? 'linear-gradient(135deg, #0066cc 0%, #0088ff 100%)'
                                        : 'rgba(255,255,255,0.06)',
                                    color: '#fff', fontSize: 14, lineHeight: 1.5,
                                    border: msg.isUser ? 'none' : '1px solid rgba(255,255,255,0.08)',
                                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                                    marginLeft: msg.isUser ? 'auto' : 0,
                                }}>
                                    {msg.content}
                                </div>
                                {/* Follow-up chips — only on last bot message */}
                                {!msg.isUser && msg.followUps?.length > 0 && idx === messages.length - 1 && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, paddingLeft: 4 }}>
                                        {msg.followUps.map((fu, fi) => (
                                            <button
                                                key={fi}
                                                onClick={() => sendMessage(typeof fu === 'string' ? fu : fu.text || fu.label || fu)}
                                                style={{
                                                    padding: '6px 12px', borderRadius: 16,
                                                    background: 'rgba(0, 212, 255, 0.06)',
                                                    border: '1px solid rgba(0, 212, 255, 0.2)',
                                                    color: '#00d4ff', fontSize: 12, fontWeight: 500,
                                                    cursor: 'pointer', transition: 'all 0.2s',
                                                }}
                                                onMouseEnter={e => { e.target.style.background = 'rgba(0,212,255,0.15)'; }}
                                                onMouseLeave={e => { e.target.style.background = 'rgba(0,212,255,0.06)'; }}
                                            >
                                                {typeof fu === 'string' ? fu : fu.text || fu.label || fu}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}

                        {/* Typing indicator */}
                        {isTyping && (
                            <div style={{
                                alignSelf: 'flex-start', padding: '10px 16px',
                                borderRadius: '16px 16px 16px 4px',
                                background: 'rgba(255,255,255,0.06)',
                                border: '1px solid rgba(255,255,255,0.08)',
                                display: 'flex', gap: 4,
                            }}>
                                {[0, 1, 2].map(i => (
                                    <span key={i} style={{
                                        width: 6, height: 6, borderRadius: '50%',
                                        background: 'rgba(0, 212, 255, 0.6)',
                                        animation: `geevesOrbDot 1s ease-in-out ${i * 0.15}s infinite`,
                                    }} />
                                ))}
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input Bar */}
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '12px 14px', borderTop: '1px solid rgba(0,212,255,0.15)',
                        flexShrink: 0, paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
                    }}>
                        <input
                            ref={inputRef}
                            type="text"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Ask me anything..."
                            style={{
                                flex: 1, padding: '12px 16px', borderRadius: 24,
                                border: '1px solid rgba(0,212,255,0.2)',
                                background: 'rgba(255,255,255,0.05)', color: '#fff',
                                fontSize: 15, outline: 'none',
                            }}
                        />
                        <button
                            onClick={() => sendMessage(input)}
                            disabled={!input.trim() || isTyping}
                            style={{
                                width: 42, height: 42, borderRadius: '50%',
                                background: input.trim() ? 'linear-gradient(135deg, #0066cc 0%, #0088ff 100%)' : 'rgba(255,255,255,0.05)',
                                border: 'none', cursor: input.trim() ? 'pointer' : 'default',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                opacity: isTyping ? 0.5 : 1, transition: 'all 0.2s',
                            }}
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M2 21l21-9L2 3v7l15 2-15 2z" /></svg>
                        </button>
                    </div>
                </div>
            )}

            {/* ── Animations ── */}
            <style>{`
                @keyframes geevesPulse {
                    0%, 100% { box-shadow: 0 4px 20px rgba(0,0,0,0.4), 0 0 15px rgba(0,212,255,0.15); }
                    50% { box-shadow: 0 4px 20px rgba(0,0,0,0.4), 0 0 25px rgba(0,212,255,0.3); }
                }
                @keyframes geevesSlideUp {
                    from { transform: translateY(100%); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                @keyframes geevesSlideIn {
                    from { transform: translateX(20px); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @keyframes geevesOrbDot {
                    0%, 100% { transform: scale(0.7); opacity: 0.4; }
                    50% { transform: scale(1); opacity: 1; }
                }
            `}</style>
        </>
    );
}
