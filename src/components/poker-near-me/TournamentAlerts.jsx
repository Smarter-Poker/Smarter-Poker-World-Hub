/**
 * TournamentAlerts.jsx — Feature #6: Tournament Alerts Engine
 * Custom notification preferences for tournament matching.
 */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { normalizeGameName } from './normalize-game';
import { haversineMiles } from './pnm-utils';
import { getAccessToken } from '../../lib/authUtils';
import { PokerNearMeConsoleIcon, PokerNearMePanelShell } from './PokerNearMeConsole';

const GAME_TYPES = ['NLH', 'PLO', 'Mixed', 'Omaha Hi-Lo', 'Stud'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const STORAGE_KEY = 'poker-tournament-alert-prefs';
const SYNC_DEBOUNCE_MS = 400;
const EMPTY_LIST = Object.freeze([]);

function loadPrefs() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch { return null; }
}

function writePrefsLocal(prefs) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch { /* ignore */ }
}

// Sync to Supabase if authed (fire-and-forget). The API requires a Bearer
// token, only accepts POST for writes, and expects snake_case pref fields.
function syncPrefsToServer(prefs, authToken) {
    if (!authToken) return;
    fetch('/api/poker/tournament-alerts', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
            game_types: prefs.gameTypes || [],
            min_buyin: prefs.minBuyin || null,
            max_buyin: prefs.maxBuyin || null,
            distance_mi: prefs.distanceMi || 50,
            days: prefs.days || [],
            push_enabled: !!prefs.pushEnabled,
            enabled: !!prefs.enabled,
        }),
    }).catch(e => { console.warn('[App] Handled promise rejection:', e?.message || e); });
}

/**
 * Normalize a tournament day_of_week value to a 'Sun'..'Sat' abbreviation.
 * The API emits mixed-case names ('saturday', 'MONDAY'), the literal 'Daily'
 * for recurring events, and raw date strings for charity / tour / home rows,
 * so exact-string comparison against the DAYS constants never matched.
 * Returns 'DAILY' for always-on events and null when nothing can be resolved.
 */
function normalizeDayToken(value) {
    if (value == null) return null;
    const raw = String(value).trim();
    if (!raw) return null;
    const lower = raw.toLowerCase();
    if (lower === 'daily' || lower === 'everyday' || lower === 'every day') return 'DAILY';

    // ISO date ('2026-03-05' / '2026-03-05T18:00:00Z') — parse as a calendar
    // date so a timezone offset cannot shift it to the previous weekday.
    const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
        const dt = new Date(Date.UTC(+isoMatch[1], +isoMatch[2] - 1, +isoMatch[3]));
        if (!Number.isNaN(dt.getTime())) return DAYS[dt.getUTCDay()];
    }

    const idx = DAYS.findIndex(d => lower.startsWith(d.toLowerCase()));
    if (idx >= 0) return DAYS[idx];

    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) return DAYS[parsed.getDay()];
    return null;
}

function matchesTournament(prefs, tournament, userLocation, venueCoords) {
    if (!prefs || !prefs.enabled) return false;
    // Game type filter — normalize both sides so 'NLH' matches "No Limit Hold'em",
    // 'Omaha Hi-Lo' matches "PLO8"/"Omaha 8", etc. (substring matching failed here).
    if ((prefs.gameTypes || []).length > 0) {
        const tType = normalizeGameName(tournament.game_type || tournament.game || '').type;
        const matchesType = prefs.gameTypes.some(g => {
            const pType = normalizeGameName(g).type;
            if (tType === pType) return true;
            // Family matches: a 'Stud' alert covers Stud Hi-Lo too
            if (pType === 'Stud' && tType === 'Stud8') return true;
            return false;
        });
        if (!matchesType) return false;
    }
    // Buy-in range
    const buyIn = tournament.buy_in || tournament.buyin || 0;
    if (prefs.minBuyin && buyIn < prefs.minBuyin) return false;
    if (prefs.maxBuyin && buyIn > prefs.maxBuyin) return false;
    // Day filter — normalize both sides ('saturday'/'MONDAY'/'Daily'/date strings
    // vs the 'Sun'..'Sat' chips). 'Daily' events always match; a value we cannot
    // resolve is left in rather than silently hidden.
    if ((prefs.days || []).length > 0 && prefs.days.length < 7) {
        const tDay = tournament.day_of_week != null && String(tournament.day_of_week).trim()
            ? normalizeDayToken(tournament.day_of_week)
            : DAYS[new Date().getDay()];
        if (tDay && tDay !== 'DAILY' && !prefs.days.includes(tDay)) return false;
    }
    // Distance filter — only enforceable when we know both the user's location
    // and the tournament venue's coordinates. The daily-tournaments payload
    // carries no lat/lng, so fall back to resolving them from the loaded venue
    // list by venue_id (supplied via the `venues` prop).
    if (prefs.distanceMi && userLocation?.lat != null && userLocation?.lng != null) {
        const fromVenue = venueCoords?.get?.(String(tournament.venue_id ?? ''));
        const tLat = tournament.latitude ?? tournament.venue_lat ?? tournament.lat ?? fromVenue?.lat;
        const tLng = tournament.longitude ?? tournament.venue_lng ?? tournament.lng ?? fromVenue?.lng;
        if (tLat != null && tLng != null) {
            const dist = haversineMiles(userLocation.lat, userLocation.lng, tLat, tLng);
            if (dist > prefs.distanceMi) return false;
        }
    }
    return true;
}

export default function TournamentAlerts({ dailyTournaments = EMPTY_LIST, userId, authToken, userLocation = null, venues = EMPTY_LIST, requireOnline }) {
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

    // Tracks the last payload we pushed to the server so an unchanged prefs
    // object (mount, echo from another tab) never costs a write.
    const lastSyncedRef = useRef(null);

    // Venue coordinates by venue_id — the daily-tournaments payload has none,
    // so the distance chips can only be enforced when a venue list is supplied.
    const venueCoords = useMemo(() => {
        const map = new Map();
        (venues || []).forEach(v => {
            const lat = v?.latitude ?? v?.lat;
            const lng = v?.longitude ?? v?.lng;
            if (v?.id != null && lat != null && lng != null) {
                map.set(String(v.id), { lat: Number(lat), lng: Number(lng) });
            }
        });
        return map;
    }, [venues]);

    // Sync prefs to localStorage immediately; debounce the authenticated POST.
    useEffect(() => {
        // BUG FIX: the second arg is the Supabase bearer token, not the user id.
        // Passing userId here made every sync 401 (auth.getUser(<uuid>) is invalid).
        // FOLLOW-UP FIX: no call site passes `authToken` (lobby.js renders
        // <TournamentAlerts dailyTournaments userId userLocation />), so requiring
        // the prop alone would have left the sync permanently dead. Fall back to the
        // same session helper VenueCard/ReportGameModal use in this directory.
        if (typeof window === 'undefined') return;
        writePrefsLocal(prefs);

        let serialized;
        try { serialized = JSON.stringify(prefs); } catch { return; }
        // First run = the loaded/default prefs. Do not create a row for every
        // visitor who merely opens the pod.
        if (lastSyncedRef.current === null) { lastSyncedRef.current = serialized; return; }
        if (serialized === lastSyncedRef.current) return;

        // Debounce so typing "250" into Min $ is one upsert, not three.
        const timer = setTimeout(() => {
            // Offline: keep the local prefs, explain, and retry on the next change
            // (mobile phase 3 online guard; the page supplies requireOnline).
            if (typeof requireOnline === 'function' && !requireOnline()) return;
            lastSyncedRef.current = serialized;
            let token = authToken;
            if (!token) {
                try { token = getAccessToken(); } catch { token = null; }
            }
            syncPrefsToServer(prefs, token);
        }, SYNC_DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [prefs, authToken, userId, requireOnline]);

    // Cross-tab sync — CustomEvents never leave the document that dispatched
    // them; only `storage` fires in other tabs, so listen for that instead.
    useEffect(() => {
        const handler = (e) => {
            if (e.key !== STORAGE_KEY || !e.newValue) return;
            let next;
            try { next = JSON.parse(e.newValue); } catch { return; }
            if (!next || typeof next !== 'object') return;
            // Another tab already persisted this; do not echo it back to the API.
            lastSyncedRef.current = e.newValue;
            setPrefs(prev => {
                try {
                    if (JSON.stringify(prev) === e.newValue) return prev;
                } catch { /* fallthrough */ }
                return next;
            });
        };
        window.addEventListener('storage', handler);
        return () => window.removeEventListener('storage', handler);
    }, []);

    // Match tournaments against prefs
    useEffect(() => {
        if (!prefs.enabled || dailyTournaments.length === 0) {
            setMatches(previous => previous.length === 0 ? previous : EMPTY_LIST);
            return;
        }
        // BUG FIX: userLocation was never threaded through, so the distanceMi
        // preference (25/50/100/250 chips) had no effect on matching.
        const matched = dailyTournaments.filter(t => matchesTournament(prefs, t, userLocation, venueCoords));
        setMatches(previous => (
            previous.length === matched.length
            && previous.every((item, index) => item === matched[index])
        ) ? previous : matched);

        // Send browser notification for first match
        if (matched.length > 0 && prefs.pushEnabled && !notificationSent) {
            if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
                try {
                    new Notification('Tournament Alert', {
                        body: `${matched.length} tournament${matched.length > 1 ? 's' : ''} match your preferences! ${matched[0].name || matched[0].venue_name || ''}`,
                        icon: '/favicon.ico',
                        tag: 'tournament-alert',
                    });
                    setNotificationSent(true);
                } catch { /* ignore */ }
            }
        }
    }, [prefs, dailyTournaments, notificationSent, userLocation, venueCoords]);

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
        <PokerNearMePanelShell
            as="section"
            className="tournament-alerts pnm-console-tool"
            bodyClassName="pnm-console-tool__body"
            aria-labelledby="pnm-tournament-alerts-title"
        >
            <div className="ta-header">
                <PokerNearMeConsoleIcon name="calendar" className="pnm-console-tool__header-icon" />
                <h2 id="pnm-tournament-alerts-title">Tournament Alerts</h2>
                <button
                    type="button"
                    className={'ta-toggle' + (prefs.enabled ? ' active' : '')}
                    aria-pressed={prefs.enabled}
                    onClick={() => setPrefs(p => ({ ...p, enabled: !p.enabled }))}
                >
                    {prefs.enabled ? 'ON' : 'OFF'}
                </button>
            </div>

            {/* Alert matches banner */}
            {prefs.enabled && matches.length > 0 && (
                <div className="ta-matches-banner">
                    <div className="ta-matches-pulse" />
                    <PokerNearMeConsoleIcon name="calendar" />
                    <span><strong>{matches.length}</strong> tournament{matches.length > 1 ? 's' : ''} Match Your Alerts!</span>
                </div>
            )}

            {/* Setup panel */}
            <button type="button" className="ta-setup-toggle" aria-expanded={showSetup} onClick={() => setShowSetup(!showSetup)}>
                <PokerNearMeConsoleIcon name="saved" />
                {showSetup ? 'Hide Preferences' : 'Set Preferences'}
                <PokerNearMeConsoleIcon
                    name="back"
                    className={'pnm-console-tool__disclosure' + (showSetup ? ' is-open' : '')}
                />
            </button>

            {showSetup && (
                <div className="ta-prefs-panel">
                    <div className="ta-pref-group">
                        <label>Game Types</label>
                        <div className="ta-chips">
                            {GAME_TYPES.map(g => (
                                <button type="button" key={g} className={'ta-chip' + (prefs.gameTypes.includes(g) ? ' active' : '')} aria-pressed={prefs.gameTypes.includes(g)} onClick={() => toggleGameType(g)}>{g}</button>
                            ))}
                        </div>
                    </div>

                    <div className="ta-pref-group">
                        <label>Buy-In Range</label>
                        <div className="ta-range-row">
                            <input type="number" aria-label="Minimum buy-in" placeholder="Min $" value={prefs.minBuyin} onChange={e => setPrefs(p => ({ ...p, minBuyin: e.target.value ? parseInt(e.target.value) : '' }))} className="ta-range-input" />
                            <span className="ta-range-sep">-</span>
                            <input type="number" aria-label="Maximum buy-in" placeholder="Max $" value={prefs.maxBuyin} onChange={e => setPrefs(p => ({ ...p, maxBuyin: e.target.value ? parseInt(e.target.value) : '' }))} className="ta-range-input" />
                        </div>
                    </div>

                    <div className="ta-pref-group">
                        <label>Distance</label>
                        <div className="ta-chips">
                            {[25, 50, 100, 250].map(d => (
                                <button type="button" key={d} className={'ta-chip' + (prefs.distanceMi === d ? ' active' : '')} aria-pressed={prefs.distanceMi === d} onClick={() => setPrefs(p => ({ ...p, distanceMi: d }))}>{d} Mi</button>
                            ))}
                        </div>
                    </div>

                    <div className="ta-pref-group">
                        <label>Days Of Week</label>
                        <div className="ta-chips">
                            {DAYS.map(d => (
                                <button type="button" key={d} className={'ta-chip small' + (prefs.days.includes(d) ? ' active' : '')} aria-pressed={prefs.days.includes(d)} onClick={() => toggleDay(d)}>{d}</button>
                            ))}
                        </div>
                    </div>

                    <div className="ta-pref-group push-row">
                        <label>Push Notifications</label>
                        <button type="button" className="ta-push-btn" onClick={enablePush}>
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
                    {matches.length > 10 && <div className="ta-more">+{matches.length - 10} More</div>}
                </div>
            )}

            {prefs.enabled && matches.length === 0 && dailyTournaments.length > 0 && (
                <div className="ta-no-matches">
                    <PokerNearMeConsoleIcon name="search" className="pnm-console-tool__state-icon" />
                    <p>No Tournaments Match Your Current Preferences.</p>
                    <p className="ta-no-matches__hint">Try Broadening Your Filters.</p>
                </div>
            )}

        </PokerNearMePanelShell>
    );
}
