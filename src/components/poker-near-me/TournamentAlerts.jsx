/**
 * TournamentAlerts.jsx — Feature #6: Tournament Alerts Engine
 * Custom notification preferences for tournament matching.
 */
import React, { useState, useEffect } from 'react';

const GAME_TYPES = ['NLH', 'PLO', 'Mixed', 'Omaha Hi-Lo', 'Stud'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const STORAGE_KEY = 'poker-tournament-alert-prefs';

function loadPrefs() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

function savePrefs(prefs) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
        window.dispatchEvent(new CustomEvent('tournament-alerts-sync', { detail: prefs }));
    } catch { /* ignore */ }
}

function matchesTournament(prefs, tournament) {
    if (!prefs || !prefs.enabled) return false;
    // Game type filter
    if (prefs.gameTypes.length > 0) {
        const tGame = (tournament.game_type || tournament.game || '').toLowerCase();
        if (!prefs.gameTypes.some(g => tGame.includes(g.toLowerCase()))) return false;
    }
    // Buy-in range
    const buyIn = tournament.buy_in || tournament.buyin || 0;
    if (prefs.minBuyin && buyIn < prefs.minBuyin) return false;
    if (prefs.maxBuyin && buyIn > prefs.maxBuyin) return false;
    // Day filter
    if (prefs.days.length > 0 && prefs.days.length < 7) {
        const tDay = tournament.day_of_week || new Date().toLocaleDateString('en-US', { weekday: 'short' });
        if (!prefs.days.includes(tDay)) return false;
    }
    return true;
}

export default function TournamentAlerts({ dailyTournaments = [], userId, authToken }) {
    const [prefs, setPrefs] = useState(() => {
        const saved = typeof window !== 'undefined' ? loadPrefs() : null;
        return saved || {
            enabled: false,
            gameTypes: [],
            minBuyin: '',
            maxBuyin: '',
            distanceMi: 50,
            days: [],
            pushEnabled: false,
        };
    });

    const [matches, setMatches] = useState([]);
    const [showSetup, setShowSetup] = useState(false);
    const [notificationSent, setNotificationSent] = useState(false);

    // Sync prefs
    useEffect(() => {
        if (typeof window !== 'undefined') savePrefs(prefs);
    }, [prefs]);

    // Cross-tab sync
    useEffect(() => {
        const handler = (e) => {
            if (e.detail) setPrefs(e.detail);
        };
        window.addEventListener('tournament-alerts-sync', handler);
        return () => window.removeEventListener('tournament-alerts-sync', handler);
    }, []);

    // Match tournaments against prefs
    useEffect(() => {
        if (!prefs.enabled || dailyTournaments.length === 0) { setMatches([]); return; }
        const matched = dailyTournaments.filter(t => matchesTournament(prefs, t));
        setMatches(matched);

        // Send browser notification for first match
        if (matched.length > 0 && prefs.pushEnabled && !notificationSent) {
            if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
                try {
                    new Notification('Tournament Alert 🏆', {
                        body: `${matched.length} tournament${matched.length > 1 ? 's' : ''} match your preferences! ${matched[0].name || matched[0].venue_name || ''}`,
                        icon: '/favicon.ico',
                        tag: 'tournament-alert',
                    });
                    setNotificationSent(true);
                } catch { /* ignore */ }
            }
        }
    }, [prefs, dailyTournaments, notificationSent]);

    const toggleGameType = (type) => {
        setPrefs(p => ({
            ...p,
            gameTypes: p.gameTypes.includes(type)
                ? p.gameTypes.filter(g => g !== type)
                : [...p.gameTypes, type],
        }));
    };

    const toggleDay = (day) => {
        setPrefs(p => ({
            ...p,
            days: p.days.includes(day)
                ? p.days.filter(d => d !== day)
                : [...p.days, day],
        }));
    };

    const enablePush = async () => {
        if (!('Notification' in window)) return;

        try {
            const permissionPromise = new Promise((resolve) => {
                const req = Notification.requestPermission(resolve);
                if (req && typeof req.then === 'function') {
                    req.then(resolve).catch(() => resolve('default'));
                }
            });

            const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve('default'), 2000));
            const result = await Promise.race([permissionPromise, timeoutPromise]);

            setPrefs(p => ({ ...p, pushEnabled: result === 'granted' }));
        } catch {
            setPrefs(p => ({ ...p, pushEnabled: false }));
        }
    };

    return (
        <div className="tournament-alerts">
            <div className="ta-header">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#d4a853" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 01-3.46 0" />
                    <circle cx="18" cy="4" r="3" fill="#ef4444" stroke="none" />
                </svg>
                <h2>Tournament Alerts</h2>
                <button
                    className={'ta-toggle' + (prefs.enabled ? ' active' : '')}
                    onClick={() => setPrefs(p => ({ ...p, enabled: !p.enabled }))}
                >
                    {prefs.enabled ? 'ON' : 'OFF'}
                </button>
            </div>

            {/* Alert matches banner */}
            {prefs.enabled && matches.length > 0 && (
                <div className="ta-matches-banner">
                    <div className="ta-matches-pulse" />
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
                        <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                    <span><strong>{matches.length}</strong> tournament{matches.length > 1 ? 's' : ''} match your alerts!</span>
                </div>
            )}

            {/* Setup panel */}
            <button className="ta-setup-toggle" onClick={() => setShowSetup(!showSetup)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
                </svg>
                {showSetup ? 'Hide Preferences' : 'Set Preferences'}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: showSetup ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                    <polyline points="6 9 12 15 18 9" />
                </svg>
            </button>

            {showSetup && (
                <div className="ta-prefs-panel">
                    <div className="ta-pref-group">
                        <label>Game Types</label>
                        <div className="ta-chips">
                            {GAME_TYPES.map(g => (
                                <button key={g} className={'ta-chip' + (prefs.gameTypes.includes(g) ? ' active' : '')} onClick={() => toggleGameType(g)}>{g}</button>
                            ))}
                        </div>
                    </div>

                    <div className="ta-pref-group">
                        <label>Buy-In Range</label>
                        <div className="ta-range-row">
                            <input type="number" placeholder="Min $" value={prefs.minBuyin} onChange={e => setPrefs(p => ({ ...p, minBuyin: e.target.value ? parseInt(e.target.value) : '' }))} className="ta-range-input" />
                            <span className="ta-range-sep">—</span>
                            <input type="number" placeholder="Max $" value={prefs.maxBuyin} onChange={e => setPrefs(p => ({ ...p, maxBuyin: e.target.value ? parseInt(e.target.value) : '' }))} className="ta-range-input" />
                        </div>
                    </div>

                    <div className="ta-pref-group">
                        <label>Distance</label>
                        <div className="ta-chips">
                            {[25, 50, 100, 250].map(d => (
                                <button key={d} className={'ta-chip' + (prefs.distanceMi === d ? ' active' : '')} onClick={() => setPrefs(p => ({ ...p, distanceMi: d }))}>{d} mi</button>
                            ))}
                        </div>
                    </div>

                    <div className="ta-pref-group">
                        <label>Days of Week</label>
                        <div className="ta-chips">
                            {DAYS.map(d => (
                                <button key={d} className={'ta-chip small' + (prefs.days.includes(d) ? ' active' : '')} onClick={() => toggleDay(d)}>{d}</button>
                            ))}
                        </div>
                    </div>

                    <div className="ta-pref-group push-row">
                        <label>Push Notifications</label>
                        <button className="ta-push-btn" onClick={enablePush}>
                            {prefs.pushEnabled ? '✓ Enabled' : 'Enable Push'}
                        </button>
                    </div>
                </div>
            )}

            {/* Matching tournaments */}
            {prefs.enabled && matches.length > 0 && (
                <div className="ta-match-list">
                    <h3>Matching Tournaments</h3>
                    {matches.slice(0, 10).map((t, i) => (
                        <div key={i} className="ta-match-card">
                            <div className="ta-match-header">
                                <span className="ta-match-name">{t.name || t.tournament_name || 'Tournament'}</span>
                                {t.buy_in > 0 && <span className="ta-match-buyin">${t.buy_in}</span>}
                            </div>
                            <div className="ta-match-details">
                                {t.venue_name && <span>{t.venue_name}</span>}
                                {t.game_type && <span> · {t.game_type}</span>}
                                {t.start_time && <span> · {t.start_time}</span>}
                                {t.day_of_week && <span> · {t.day_of_week}</span>}
                            </div>
                        </div>
                    ))}
                    {matches.length > 10 && <div className="ta-more">+{matches.length - 10} more</div>}
                </div>
            )}

            {prefs.enabled && matches.length === 0 && dailyTournaments.length > 0 && (
                <div className="ta-no-matches">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <p>No tournaments match your current preferences.</p>
                    <p style={{ fontSize: 12 }}>Try broadening your filters.</p>
                </div>
            )}

            <style jsx>{`
        .tournament-alerts { padding: 0 0 20px; }
        .ta-header { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
        .ta-header h2 { font-size: 22px; font-weight: 700; color: #fff; margin: 0; flex: 1; }
        .ta-toggle { padding: 6px 16px; border-radius: 20px; font-size: 12px; font-weight: 700; cursor: pointer; transition: all 0.2s; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.5); }
        .ta-toggle.active { background: rgba(34,197,94,0.2); border-color: rgba(34,197,94,0.5); color: #22c55e; }
        .ta-matches-banner { display: flex; align-items: center; gap: 10px; padding: 14px 16px; background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.3); border-radius: 12px; margin-bottom: 16px; position: relative; overflow: hidden; }
        .ta-matches-banner span { font-size: 14px; color: #fff; }
        .ta-matches-pulse { position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: #22c55e; animation: alertPulse 2s ease-in-out infinite; }
        @keyframes alertPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        .ta-setup-toggle { display: flex; align-items: center; gap: 8px; padding: 10px 16px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; color: rgba(255,255,255,0.6); font-size: 13px; font-weight: 500; cursor: pointer; width: 100%; transition: all 0.2s; }
        .ta-setup-toggle:hover { background: rgba(255,255,255,0.08); }
        .ta-prefs-panel { background: rgba(15,23,42,0.6); border: 1px solid rgba(255,255,255,0.1); border-radius: 14px; padding: 20px; margin-top: 12px; }
        .ta-pref-group { margin-bottom: 18px; }
        .ta-pref-group:last-child { margin-bottom: 0; }
        .ta-pref-group label { display: block; font-size: 12px; font-weight: 500; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
        .ta-chips { display: flex; flex-wrap: wrap; gap: 6px; }
        .ta-chip { padding: 8px 14px; border-radius: 8px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.7); font-size: 13px; cursor: pointer; transition: all 0.2s; }
        .ta-chip.small { padding: 6px 10px; font-size: 12px; }
        .ta-chip.active { background: rgba(212,168,83,0.2); border-color: rgba(212,168,83,0.5); color: #d4a853; }
        .ta-range-row { display: flex; align-items: center; gap: 8px; }
        .ta-range-input { flex: 1; padding: 10px 12px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.12); border-radius: 8px; color: #fff; font-size: 14px; font-family: inherit; }
        .ta-range-input::placeholder { color: rgba(255,255,255,0.3); }
        .ta-range-sep { color: rgba(255,255,255,0.3); }
        .push-row { display: flex; align-items: center; justify-content: space-between; }
        .ta-push-btn { padding: 8px 16px; border-radius: 8px; background: rgba(59,130,246,0.15); border: 1px solid rgba(59,130,246,0.3); color: #3b82f6; font-size: 13px; font-weight: 500; cursor: pointer; }
        .ta-match-list { margin-top: 16px; }
        .ta-match-list h3 { font-size: 16px; font-weight: 600; color: #fff; margin: 0 0 12px; }
        .ta-match-card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 14px; margin-bottom: 8px; transition: all 0.2s; }
        .ta-match-card:hover { border-color: rgba(212,168,83,0.3); }
        .ta-match-header { display: flex; justify-content: space-between; align-items: center; }
        .ta-match-name { font-size: 14px; font-weight: 600; color: #fff; }
        .ta-match-buyin { padding: 2px 8px; border-radius: 4px; background: rgba(34,197,94,0.15); color: #22c55e; font-size: 12px; font-weight: 600; }
        .ta-match-details { font-size: 12px; color: rgba(255,255,255,0.4); margin-top: 4px; }
        .ta-more { text-align: center; padding: 10px; color: rgba(255,255,255,0.4); font-size: 13px; }
        .ta-no-matches { display: flex; flex-direction: column; align-items: center; padding: 40px 20px; text-align: center; }
        .ta-no-matches p { color: rgba(255,255,255,0.4); font-size: 14px; margin: 8px 0 0; }
      `}</style>
        </div>
    );
}
