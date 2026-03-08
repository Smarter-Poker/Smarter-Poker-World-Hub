/* ═══════════════════════════════════════════════════════════════════════════
   GEEVES HELP BAR — Global "Ask Geeves" collapsed bar + expandable chat panel
   
   Renders on EVERY page via _app.js. Provides instant Geeves access even on
   pages without UniversalHeader/HamburgerMenu (e.g., Club Commander, poker
   table). Collapses to a slim bar at the bottom; click to expand.
   
   Features:
   - Slim bar at page bottom (click to open full chat panel)
   - Context-aware quick chips based on current page
   - Cross-page conversation memory via sessionStorage
   - Keyboard shortcut: Cmd+J / Ctrl+J to toggle
   - Follow-up chip rendering after Geeves responds
   ═══════════════════════════════════════════════════════════════════════════ */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { extractRoleFromToken } from '../../lib/geevesKB/rolePersonalization';
import { busEmit } from '../../engine/EventBus';

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
const HIDDEN_KEY = 'geeves-hidden'; // localStorage: persists across all pages

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
    if (p.includes('horses')) return [
        { label: 'Add a Horse persona', q: 'How do I add a new Horse persona to the Horses admin?' },
        { label: 'Content pipeline', q: 'What does the Horses content pipeline do and how do I trigger it?' },
        { label: 'View missed questions', q: 'How do I see what questions Geeves could not answer?' },
    ];
    // Default
    return [
        { label: 'What is Smarter.Poker?', q: 'What is Smarter.Poker and what can I do here?' },
        { label: 'Help with features', q: 'What are the main features of Smarter.Poker?' },
        { label: 'Diamond economy', q: 'How does the diamond economy work?' },
    ];
}

// ─── Proactive tip per page (shows once per session) — NO EMOJI (Rule 8) ───
function getPageTip(path) {
    const p = (path || '').toLowerCase();
    if (p.includes('commander')) return 'Need help managing your venue? Ask me anything!';
    if (p.includes('toke-tracker')) return 'I can help you track downs, calculate EHR, and more!';
    if (p.includes('club-arena') && p.includes('table')) return 'Questions about the game? I am here to help!';
    if (p.includes('club-arena')) return 'Need help with Club Arena? Ask me!';
    if (p.includes('bankroll')) return 'I can explain ROI, bankroll math, and more!';
    if (p.includes('training') || p.includes('gto')) return 'Want to understand GTO concepts? Just ask!';
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
    const [isListening, setIsListening] = useState(false); // Voice input state
    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);
    const msgIdRef = useRef(0);
    const recognitionRef = useRef(null); // SpeechRecognition instance
    const messagesRef = useRef([]); // Always-current messages for sendMessage (avoids stale closure)
    const path = router.asPath || '';

    // ── SSR guard — only render on client ──
    const [mounted, setMounted] = useState(false);
    useEffect(() => { setMounted(true); }, []);

    // ── Hidden state — persisted in localStorage so hiding on one page hides everywhere ──
    const [isHidden, setIsHidden] = useState(false);
    // Initialize from localStorage after mount (SSR-safe)
    useEffect(() => {
        if (mounted) {
            try {
                setIsHidden(localStorage.getItem(HIDDEN_KEY) === '1');
            } catch { }
        }
    }, [mounted]);

    const hideGeeves = useCallback(() => {
        try { localStorage.setItem(HIDDEN_KEY, '1'); } catch { }
        setIsHidden(true);
        setIsOpen(false);
        setShowTip(false);
    }, []);

    const showGeeves = useCallback(() => {
        try { localStorage.removeItem(HIDDEN_KEY); } catch { }
        setIsHidden(false);
        setIsOpen(true);
        setShowTip(false);
    }, []);

    // ── Load messages from session on mount ──
    useEffect(() => {
        if (mounted) setMessages(loadSessionMessages());
    }, [mounted]);

    // ── Save messages to session when they change ──
    // Also keep messagesRef in sync so sendMessage always has the latest (avoids stale closure)
    useEffect(() => {
        if (mounted) {
            if (messages.length > 0) saveSessionMessages(messages);
            messagesRef.current = messages; // Keep ref current for API calls
        }
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
    useEffect(() => {
        const handler = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
                const hasExistingHandler = document.querySelector('[data-geeves-live-help]');
                if (hasExistingHandler) return;
                e.preventDefault();
                if (isHidden) {
                    showGeeves(); // Always un-hide when user explicitly presses Cmd+J
                } else {
                    setIsOpen(prev => !prev);
                }
            }
            if (e.key === 'Escape' && isOpen) {
                e.preventDefault();
                setIsOpen(false);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [isOpen, isHidden, showGeeves]);

    // ── Listen for geeves-open event — always clears hidden state + opens ──
    useEffect(() => {
        const handler = () => {
            showGeeves(); // clears localStorage hidden flag
            busEmit.geevesOpened();
        };
        window.addEventListener('geeves-open', handler);
        return () => window.removeEventListener('geeves-open', handler);
    }, [showGeeves]);

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

            // Feature 3: Role personalization — extract from JWT (no extra API call)
            const { role: userRole, isVIP } = token
                ? extractRoleFromToken(token)
                : { role: null, isVIP: false };

            // Feature 2: Conversation memory — pass last 6 messages for follow-up context
            // Uses messagesRef (not messages state) to avoid stale closure on the useCallback
            const conversationHistory = messagesRef.current.slice(-6).map(m => ({
                isUser: m.isUser,
                content: String(m.content || '').slice(0, 400),
            }));

            const res = await fetch('/api/geeves/chat', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    message: text.trim(),
                    currentPage: path,
                    conversationHistory,
                    userRole,
                    isVIP,
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

    // ── Enter key submit ──
    const handleKeyDown = useCallback((e) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); }
    }, [input, sendMessage]);

    // ── Feature 7: Voice Input ──
    const voiceSupported = typeof window !== 'undefined' &&
        ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

    const startVoiceInput = useCallback(() => {
        if (!voiceSupported) return;
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        const rec = new SR();
        rec.lang = 'en-US';
        rec.interimResults = false;
        rec.maxAlternatives = 1;
        recognitionRef.current = rec;
        setIsListening(true);
        rec.start();
        rec.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            setIsListening(false);
            // Auto-send the transcribed speech
            sendMessage(transcript);
        };
        rec.onerror = () => setIsListening(false);
        rec.onend = () => setIsListening(false);
        // Safety: stop after 10s
        setTimeout(() => { try { rec.stop(); } catch { } }, 10000);
    }, [voiceSupported, sendMessage]);

    // ── Suppress on: auth pages, gameplay, video, live streams, and if user hid Geeves ──
    // NOTE: All hooks must be defined ABOVE this guard (Rules of Hooks)
    if (!mounted) return null;
    // When hidden: render a faded small capital "G" button.
    if (isHidden) return (
        <button
            onClick={showGeeves}
            title="Show Geeves"
            aria-label="Show Geeves help assistant"
            style={{
                position: 'fixed',
                bottom: 'max(16px, env(safe-area-inset-bottom, 16px))',
                right: 16,
                zIndex: 99998,
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: 'rgba(0, 30, 60, 0.3)',
                border: '1px solid rgba(0, 212, 255, 0.15)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                transition: 'all 0.2s ease',
                fontSize: 12,
                fontWeight: 700,
                color: 'rgba(255, 255, 255, 0.35)',
                fontFamily: "'Rajdhani', 'Inter', sans-serif"
            }}
            onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(0, 30, 60, 0.8)';
                e.currentTarget.style.border = '1px solid rgba(0, 212, 255, 0.4)';
                e.currentTarget.style.color = '#00d4ff';
            }}
            onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(0, 30, 60, 0.3)';
                e.currentTarget.style.border = '1px solid rgba(0, 212, 255, 0.15)';
                e.currentTarget.style.color = 'rgba(255, 255, 255, 0.35)';
            }}
        >
            G
        </button>
    );
    const cleanPath = path.split('?')[0];
    const suppressedPaths = ['/', '/auth', '/login', '/signup'];
    if (
        suppressedPaths.some(p => cleanPath === p || cleanPath.startsWith(p + '/')) ||
        // Club Arena gameplay (own bottom nav / action bars)
        cleanPath.includes('/hub/club-arena/messages') ||
        cleanPath.includes('/hub/club-arena/players') ||
        cleanPath.includes('/hub/club-arena/cashier') ||
        cleanPath.includes('/hub/club-arena/player-stats') ||
        cleanPath.includes('/hub/club-arena/admin') ||
        cleanPath.includes('/hub/club-arena/table') ||    // Live poker table
        // Video / live-stream pages (immersive, full-screen)
        cleanPath.includes('/hub/video-library') ||
        cleanPath.includes('/hub/video') ||
        cleanPath.includes('/hub/live-stream') ||
        cleanPath.includes('/hub/streams') ||
        cleanPath.includes('/hub/reels') ||
        // Training gameplay pages (shot clock / GTO challenge)
        cleanPath.includes('/hub/training/daily-challenge') ||
        cleanPath.includes('/hub/training/time-attack') ||
        cleanPath.includes('/hub/training/pvp') ||
        cleanPath.includes('/hub/training/tournaments')
    ) return null;

    const chips = getPageChips(path);

    // ═══════════════════════════════════════════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════════════════════════════════════════

    return (
        <>
            {/* ── Proactive Tip Bubble (above corner button) ── */}
            {showTip && !isOpen && (
                <div
                    onClick={() => { setShowTip(false); setIsOpen(true); }}
                    style={{
                        position: 'fixed', bottom: 72, right: 16, zIndex: 99997,
                        maxWidth: 220, padding: '8px 12px', borderRadius: 10,
                        background: 'linear-gradient(135deg, #001e3c 0%, #002855 100%)',
                        border: '1px solid rgba(0, 212, 255, 0.3)',
                        color: '#e0f0ff', fontSize: 12, lineHeight: 1.4,
                        boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                        cursor: 'pointer', animation: 'geevesSlideIn 0.3s ease-out',
                    }}
                >
                    {tipText}
                    <div style={{ fontSize: 10, color: 'rgba(0,212,255,0.7)', marginTop: 3 }}>Tap to ask →</div>
                </div>
            )}

            {/* ── Collapsed Corner Button + hover-reveal Hide option ── */}
            {!isOpen && (
                <div
                    style={{ position: 'fixed', bottom: 'max(16px, env(safe-area-inset-bottom, 16px))', right: 16, zIndex: 99998 }}
                    onMouseEnter={e => {
                        const hideBtn = e.currentTarget.querySelector('[data-hide-btn]');
                        if (hideBtn) hideBtn.style.opacity = '1';
                    }}
                    onMouseLeave={e => {
                        const hideBtn = e.currentTarget.querySelector('[data-hide-btn]');
                        if (hideBtn) hideBtn.style.opacity = '0';
                    }}
                >
                    {/* Main orb button */}
                    <button
                        onClick={() => { setIsOpen(true); setShowTip(false); }}
                        title="Ask Geeves (\u2318J)"
                        aria-label="Open Geeves help"
                        style={{
                            width: 48, height: 48, borderRadius: '50%',
                            background: 'linear-gradient(135deg, #001e3c 0%, #0066cc 100%)',
                            border: '2px solid rgba(0, 212, 255, 0.45)',
                            boxShadow: '0 4px 18px rgba(0, 100, 200, 0.45)',
                            cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            padding: 0,
                            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                        }}
                        onMouseEnter={e => {
                            e.currentTarget.style.transform = 'scale(1.1)';
                            e.currentTarget.style.boxShadow = '0 6px 24px rgba(0, 150, 255, 0.55)';
                        }}
                        onMouseLeave={e => {
                            e.currentTarget.style.transform = 'scale(1)';
                            e.currentTarget.style.boxShadow = '0 4px 18px rgba(0, 100, 200, 0.45)';
                        }}
                    >
                        <img
                            src="/images/geeves-avatar.png"
                            alt="G"
                            style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }}
                            onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                        />
                        <span style={{
                            display: 'none', width: 32, height: 32, borderRadius: '50%',
                            alignItems: 'center', justifyContent: 'center',
                            fontSize: 17, fontWeight: 700, color: '#00d4ff',
                        }}>G</span>
                    </button>

                    {/* Hide button — appears on hover, sits above the orb */}
                    <button
                        data-hide-btn
                        onClick={hideGeeves}
                        title="Hide Geeves on all pages"
                        aria-label="Hide Geeves"
                        style={{
                            position: 'absolute',
                            top: -26,
                            left: '50%',
                            transform: 'translateX(-50%)',
                            background: 'rgba(10, 22, 40, 0.92)',
                            border: '1px solid rgba(255,255,255,0.15)',
                            borderRadius: 10,
                            padding: '3px 9px',
                            fontSize: 11,
                            color: 'rgba(255,255,255,0.55)',
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            opacity: 0,
                            transition: 'opacity 0.15s ease',
                            pointerEvents: 'all',
                        }}
                    >
                        Hide
                    </button>
                </div>
            )}

            {/* ── Expanded Chat Panel (anchored bottom-right, 360px wide) ── */}
            {isOpen && (
                <div style={{
                    position: 'fixed',
                    bottom: 'max(16px, env(safe-area-inset-bottom, 16px))',
                    right: 16,
                    width: 'min(360px, calc(100vw - 32px))',
                    height: 'min(520px, calc(100vh - 80px))',
                    zIndex: 99999,
                    background: 'linear-gradient(180deg, #0a1628 0%, #0d1f3c 100%)',
                    border: '1px solid rgba(0, 212, 255, 0.3)',
                    borderRadius: 16,
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,212,255,0.08)',
                    animation: 'geevesSlideUp 0.2s ease-out',
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
                        {/* Voice mic button — Feature 7: Voice Input */}
                        {voiceSupported && (
                            <button
                                onClick={startVoiceInput}
                                disabled={isListening || isTyping}
                                title={isListening ? 'Listening...' : 'Speak your question'}
                                aria-label={isListening ? 'Listening' : 'Voice input'}
                                style={{
                                    width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                                    background: isListening
                                        ? 'linear-gradient(135deg, #cc0000 0%, #ff3333 100%)'
                                        : 'rgba(255,255,255,0.07)',
                                    border: isListening
                                        ? '2px solid rgba(255,80,80,0.6)'
                                        : '1px solid rgba(0,212,255,0.2)',
                                    cursor: 'pointer',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    animation: isListening ? 'geevesListenPulse 0.8s ease-in-out infinite' : 'none',
                                    transition: 'all 0.2s',
                                }}
                            >
                                {/* Mic SVG icon */}
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                                    stroke={isListening ? '#fff' : 'rgba(0,212,255,0.7)'}
                                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <rect x="9" y="2" width="6" height="11" rx="3" />
                                    <path d="M5 10a7 7 0 0 0 14 0" />
                                    <line x1="12" y1="20" x2="12" y2="23" />
                                    <line x1="8" y1="23" x2="16" y2="23" />
                                </svg>
                            </button>
                        )}
                        <button
                            onClick={() => sendMessage(input)}
                            disabled={!input.trim() || isTyping}
                            style={{
                                width: 38, height: 38, borderRadius: '50%',
                                background: input.trim() ? 'linear-gradient(135deg, #0066cc 0%, #0088ff 100%)' : 'rgba(255,255,255,0.05)',
                                border: 'none', cursor: input.trim() ? 'pointer' : 'default',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                opacity: isTyping ? 0.5 : 1, transition: 'all 0.2s', flexShrink: 0,
                            }}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M2 21l21-9L2 3v7l15 2-15 2z" /></svg>
                        </button>
                    </div>
                </div>
            )}


            {/* ── Animations ── */}
            <style>{`
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
                @keyframes geevesListenPulse {
                    0%, 100% { box-shadow: 0 0 0 0 rgba(255,60,60,0.5); }
                    50% { box-shadow: 0 0 0 8px rgba(255,60,60,0); }
                }
            `}</style>
        </>
    );
}
