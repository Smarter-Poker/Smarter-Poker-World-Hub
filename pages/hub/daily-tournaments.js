/**
 * DAILY TOURNAMENTS - Find poker tournaments happening today
 * Live data from venue_daily_tournaments — 324+ venues, 4,500+ records
 */

import SEOHead from '../../src/components/seo/SEOHead';
import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import useSWR from 'swr';
import useVenueRealtime from '../../src/hooks/useVenueRealtime';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import HamburgerMenu from '../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../src/config/hamburgerMenus';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const POPULAR_STATES = [
    { name: 'Texas', abbr: 'TX' },
    { name: 'California', abbr: 'CA' },
    { name: 'Florida', abbr: 'FL' },
    { name: 'Nevada', abbr: 'NV' },
];

const VENUE_TYPES = [
    { label: 'All Venues', value: '' },
    { label: 'Casinos', value: 'Casino' },
    { label: 'Card Rooms', value: 'Card Room' },
    { label: 'Charity', value: 'Charity' },
];

const BUYIN_RANGES = [
    { label: 'All Buy-Ins', min: null, max: null },
    { label: 'Under $50', min: null, max: 50 },
    { label: '$50 - $100', min: 50, max: 100 },
    { label: '$100 - $200', min: 100, max: 200 },
    { label: '$200+', min: 200, max: null },
];

function formatTime(timeStr) {
    if (!timeStr) return '';

    // ── Step 1: Strip HH:MM:SS seconds (keep only HH:MM) ──────────────────
    const clean = timeStr.trim().replace(/^(\d{1,2}:\d{2}):\d{2}\s*(AM|PM)?/i, (_, hm, ap) => ap ? `${hm}${ap}` : hm);

    // ── Step 2: Handle bare 24-hr or ambiguous HH:MM (no AM/PM) ──────────
    if (!clean.match(/[AP]M/i)) {
        const parts = clean.split(':');
        if (parts.length >= 2) {
            let h = parseInt(parts[0], 10);
            const m = parts[1].replace(/\D/g, '').slice(0, 2).padStart(2, '0');
            if (!isNaN(h)) {
                const ampm = h >= 12 ? 'PM' : 'AM';
                if (h === 0) h = 12;
                else if (h > 12) h -= 12;
                return `${h}:${m} ${ampm}`;
            }
        }
        // No-colon bare hour: "10AM", "6PM"
        const noColon = clean.match(/^(\d{1,2})([AP]M)$/i);
        if (noColon) {
            return `${parseInt(noColon[1])}:00 ${noColon[2].toUpperCase()}`;
        }
        return clean;
    }

    // ── Step 3: Already has AM/PM — normalize whitespace & capitalization ──
    // Handles: "7:00PM" → "7:00 PM", "1 PM" → "1:00 PM", "10AM" → "10:00 AM"
    // No-colon with period: "7PM" "1 PM"
    const noColonAMPM = clean.match(/^(\d{1,2})\s*([AP]M)$/i);
    if (noColonAMPM) {
        return `${parseInt(noColonAMPM[1])}:00 ${noColonAMPM[2].toUpperCase()}`;
    }

    // HH:MM[AM/PM] with optional space — strip leading hour zero, collapse double spaces
    return clean
        .replace(/(\d)(([AP]M))$/i, (_, d, ampm) => `${d} ${ampm.toUpperCase()}`)
        .replace(/\s{2,}/g, ' ')
        .replace(/([ap]m)/i, s => s.toUpperCase())
        .replace(/^0(\d)/, '$1'); // "06:00 PM" → "6:00 PM"
}

function formatGameType(raw) {
    if (!raw) return 'NLH';
    const lower = raw.toLowerCase();
    if (lower === 'holdem' || lower === 'hold\'em' || lower === 'texas hold\'em') return 'Hold\'em';
    if (lower === 'nlh' || lower === 'no limit holdem' || lower === 'no limit hold\'em') return 'NLH';
    if (lower === 'plo' || lower === 'omaha') return 'PLO';
    if (lower === 'horse') return 'HORSE';
    if (lower === 'mixed') return 'Mixed';
    if (lower === 'stud') return 'Stud';
    if (lower === 'deepstack' || lower === 'deep stack') return 'Deep Stack';
    // Capitalize first letter of each word for anything else
    return raw.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatVenueType(raw) {
    if (!raw || raw === 'Unknown') return null;
    return raw.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function formatMoney(amount) {
    if (amount === null || amount === undefined || amount === '') return '';
    if (amount === 0) return 'Free'; // BUG FIX: freerolls show 'Free' — must check BEFORE !amount (0 is falsy)
    if (!amount) return '';
    if (amount >= 1000) return `$${(amount / 1000).toFixed(0)}K`;
    return `$${amount.toLocaleString()}`;
}

function safeHref(url) {
    if (!url) return '';
    const cleanUrl = String(url).replace(/[\x00-\x20]/g, '');
    const lower = cleanUrl.toLowerCase();
    if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('vbscript:')) return '#';
    return cleanUrl;
}

export default function DailyTournaments() {
    const router = useRouter();
    const [menuOpen, setMenuOpen] = useState(false);
    const [selectedDay, setSelectedDay] = useState(DAYS[new Date().getDay()]);
    const [selectedState, setSelectedState] = useState(null);
    const [selectedType, setSelectedType] = useState('');
    const [selectedBuyin, setSelectedBuyin] = useState(BUYIN_RANGES[0]);
    const [searchQuery, setSearchQuery] = useState('');

    const menuConfig = getMenuConfig('tournaments', null, {}, {});

    // Debounce search query — only fires API request after 500ms of no typing
    const [debouncedSearch, setDebouncedSearch] = useState(searchQuery);
    const searchDebounceRef = useRef(null);
    const handleSearchChange = (val) => {
        setSearchQuery(val);
        if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
        searchDebounceRef.current = setTimeout(() => setDebouncedSearch(val), 500);
    };
    useEffect(() => () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); }, []);

    const swrParams = new URLSearchParams({ day: selectedDay });
    if (selectedState) swrParams.set('state', selectedState.abbr);
    if (selectedType) swrParams.set('type', selectedType);
    if (selectedBuyin.min) swrParams.set('minBuyin', selectedBuyin.min.toString());
    if (selectedBuyin.max) swrParams.set('maxBuyin', selectedBuyin.max.toString());
    if (debouncedSearch) swrParams.set('venue', debouncedSearch);

    const { data: swrData, error, isLoading: loading, mutate: refreshTournaments } = useSWR(
        `/api/poker/daily-tournaments?${swrParams}`,
        (url) => fetch(url).then(r => r.json()).then(d => {
            // BUG FIX: SWR gracefully passes soft 200 JSON errors. Force strict extraction.
            if (d && d.success === false) throw new Error(d.error || 'Failed to fetch API events');
            return d;
        }),
        {
            // dedupingInterval=0 ensures realtime triggers always cause a fresh fetch
            dedupingInterval: 0,
            // Don’t auto-refetch on window focus (realtime handles updates)
            revalidateOnFocus: false,
        }
    );

    // [HARDENING] Real-time synchronization for global table/venue changes.
    // Punches through the 15s S-Maxage Edge Cache securely using a monotonic _rt query parameter
    // and injects the bypassed result directly into SWR.
    useVenueRealtime(() => {
        const rtUrl = `/api/poker/daily-tournaments?${swrParams.toString()}&_rt=${Date.now()}`;
        fetch(rtUrl)
            .then(r => r.json())
            .then(d => {
                if (d.success) refreshTournaments(d, false);
            })
            .catch(console.error);
    });
    const tournaments = swrData?.tournaments || [];
    const stats = swrData?.stats || {};

    const clearFilters = () => {
        setSelectedState(null);
        setSelectedType('');
        setSelectedBuyin(BUYIN_RANGES[0]);
        setSearchQuery('');
        setDebouncedSearch('');
    };

    // Group tournaments by time slot
    const morningTournaments = tournaments.filter(t => {
        const time = parseTimeToMinutes(t.start_time);
        return time < 720; // Before 12pm
    });
    const afternoonTournaments = tournaments.filter(t => {
        const time = parseTimeToMinutes(t.start_time);
        return time >= 720 && time < 1020; // 12pm - 5pm
    });
    const eveningTournaments = tournaments.filter(t => {
        const time = parseTimeToMinutes(t.start_time);
        return time >= 1020; // 5pm+
    });

    function parseTimeToMinutes(timeStr) {
        if (!timeStr) return 0;
        const t = timeStr.trim();
        // Handle HH:MM:SS (strip seconds first)
        const hhmmss = t.match(/^(\d{1,2}):(\d{2}):\d{2}\s*([AP]M)?$/i);
        if (hhmmss) {
            let h = parseInt(hhmmss[1]);
            const m = parseInt(hhmmss[2]);
            const p = (hhmmss[3] || '').toUpperCase();
            if (p === 'PM' && h !== 12) h += 12;
            if (p === 'AM' && h === 12) h = 0;
            return h * 60 + m;
        }
        // Handle HH:MM with or without AM/PM (bare 24-hr or explicit AM/PM)
        const hhmm = t.match(/^(\d{1,2}):(\d{2})\s*([AP]M)?$/i);
        if (hhmm) {
            let h = parseInt(hhmm[1]);
            const m = parseInt(hhmm[2]);
            const p = (hhmm[3] || '').toUpperCase();
            if (p === 'PM' && h !== 12) h += 12;
            if (p === 'AM' && h === 12) h = 0;
            // No period and h < 13 → treat as 24-hr or absolute (leave as-is)
            return h * 60 + m;
        }
        // Handle no-colon: "7PM", "10AM", "7 PM", "1 AM"
        const hOnly = t.match(/^(\d{1,2})\s*([AP]M)$/i);
        if (hOnly) {
            let h = parseInt(hOnly[1]);
            const p = hOnly[2].toUpperCase();
            if (p === 'PM' && h !== 12) h += 12;
            if (p === 'AM' && h === 12) h = 0;
            return h * 60;
        }
        return 0;
    }

    return (
        <>
            <SEOHead
                title="Daily Poker Tournaments — Compete Every Day"
                description="Join Daily Poker Tournaments On Smarter.Poker. Compete Against Players Worldwide With Daily Challenges And Prize Pools."
                canonical="/hub/daily-tournaments"
            >

                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />

            </SEOHead>

            <div className="dt-page">
                {/* Space Background */}
                <div className="space-bg"></div>
                <div className="space-overlay"></div>

                <UniversalHeader pageDepth={2} onMenuClick={() => setMenuOpen(true)} onBackClick={() => router.push('/hub/poker-near-me-lobby')} />
                <HamburgerMenu
                    isOpen={menuOpen}
                    onClose={() => setMenuOpen(false)}
                    direction="right"
                    theme="dark"
                    menuItems={menuConfig.menuItems}
                    bottomLinks={menuConfig.bottomLinks}
                />

                {/* Page Header */}
                <div className="dt-header">
                    <h1><span className="white">DAILY</span> <span className="gold">TOURNAMENTS</span></h1>
                    <span className="subtitle">{stats.total || 0} TOURNAMENTS AT {stats.venueCount || new Set((swrData?.tournaments || []).map(t => t.venue_name)).size || '...'} VENUES</span>
                </div>

                {/* Day Selector */}
                <div className="day-selector">
                    <div className="day-tabs">
                        {DAYS.map(day => (
                            <button
                                key={day}
                                className={`day-tab ${selectedDay === day ? 'active' : ''}`}
                                onClick={() => setSelectedDay(day)}
                            >
                                <span className="day-short">{day.substring(0, 3)}</span>
                                <span className="day-full">{day}</span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Top Level Filters Command Bar */}
                <div className="pnm-top-filters" style={{ padding: '0 20px', marginBottom: '20px' }}>
                    <div className="pnm-top-filters-inner">
                        <div className="pnm-search-box" style={{ flex: '1 1 200px', position: 'relative' }}>
                            <svg style={{ position: 'absolute', left: '10px', top: '10px', color: 'rgba(255,255,255,0.4)' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
                            </svg>
                            <input
                                type="text"
                                className="pnm-filter-select"
                                style={{ width: '100%', paddingLeft: '34px', boxSizing: 'border-box' }}
                                placeholder="Search Venue..."
                                value={searchQuery}
                                onChange={(e) => handleSearchChange(e.target.value)}
                            />
                        </div>
                        
                        <select className="pnm-filter-select" value={selectedState ? selectedState.abbr : ''} onChange={(e) => {
                            const st = POPULAR_STATES.find(s => s.abbr === e.target.value);
                            setSelectedState(st || null);
                        }}>
                            <option value="">All States</option>
                            {POPULAR_STATES.map(state => (
                                <option key={state.abbr} value={state.abbr}>{state.name}</option>
                            ))}
                        </select>
                        
                        <select className="pnm-filter-select" value={selectedType} onChange={(e) => setSelectedType(e.target.value)}>
                            {VENUE_TYPES.map(type => (
                                <option key={type.value} value={type.value}>{type.label}</option>
                            ))}
                        </select>

                        <select className="pnm-filter-select" value={selectedBuyin.label} onChange={(e) => {
                            const range = BUYIN_RANGES.find(r => r.label === e.target.value);
                            setSelectedBuyin(range || BUYIN_RANGES[0]);
                        }}>
                            {BUYIN_RANGES.map((range, i) => (
                                <option key={i} value={range.label}>{range.label}</option>
                            ))}
                        </select>

                        {searchQuery || selectedState || selectedType || selectedBuyin.min ? (
                            <button className="pnm-filter-select" style={{ flex: '0 0 auto', padding: '0 16px', background: 'rgba(255,0,0,0.1)', borderColor: 'rgba(255,0,0,0.3)', color: '#ff4444', cursor: 'pointer' }} onClick={clearFilters}>
                                Clear
                            </button>
                        ) : null}
                    </div>
                </div>

                {/* Main Layout */}
                <div className="dt-layout">
                    

                    {/* Center - Tournament Cards */}
                    <main className="tournament-feed">
                        {error && !loading ? (
                            <div className="empty-state error-state" style={{ color: '#ef4444', borderColor: 'rgba(239, 68, 68, 0.3)' }}>
                                <p>Failed to load schedule</p>
                                <p style={{ fontSize: '13px', opacity: 0.7, marginTop: '8px' }}>{error.message || 'Unknown network collision'}</p>
                                <button onClick={() => refreshTournaments()} style={{ borderColor: 'rgba(239, 68, 68, 0.5)', color: '#ef4444' }}>Retry Connection</button>
                            </div>
                        ) : loading ? (
                            <div className="loading-state">
                                <div className="spinner"></div>
                                <span>Finding Tournaments...</span>
                            </div>
                        ) : tournaments.length === 0 ? (
                            <div className="empty-state">
                                <p>No tournaments found for {selectedDay}</p>
                                <button onClick={clearFilters}>Clear Filters</button>
                            </div>
                        ) : (
                            <div className="tournament-sections">
                                {morningTournaments.length > 0 && (
                                    <div className="time-section">
                                        <h2 className="time-header">
                                            <span className="time-icon">AM</span>
                                            Morning Tournaments
                                            <span className="time-count">{morningTournaments.length}</span>
                                        </h2>
                                        <div className="tournament-list">
                                            {morningTournaments.map((t, i) => (
                                                <TournamentCard key={`${t.id || t.venue_id || t.tournament_name || 'm'}-${t.start_time}-${i}`} tournament={t} />
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {afternoonTournaments.length > 0 && (
                                    <div className="time-section">
                                        <h2 className="time-header">
                                            <span className="time-icon afternoon">PM</span>
                                            Afternoon Tournaments
                                            <span className="time-count">{afternoonTournaments.length}</span>
                                        </h2>
                                        <div className="tournament-list">
                                            {afternoonTournaments.map((t, i) => (
                                                <TournamentCard key={`${t.id || t.venue_id || t.tournament_name || 'a'}-${t.start_time}-${i}`} tournament={t} />
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {eveningTournaments.length > 0 && (
                                    <div className="time-section">
                                        <h2 className="time-header">
                                            <span className="time-icon evening">EVE</span>
                                            Evening Tournaments
                                            <span className="time-count">{eveningTournaments.length}</span>
                                        </h2>
                                        <div className="tournament-list">
                                            {eveningTournaments.map((t, i) => (
                                                <TournamentCard key={`${t.id || t.venue_id || t.tournament_name || 'e'}-${t.start_time}-${i}`} tournament={t} />
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </main>

                    
                </div>

                <style jsx>{`
                    /* Metal UI Variables */
                    :root {
                        --metal-dark: #0a0a15;
                        --metal-base: #0d1117;
                        --metal-mid: #1a2332;
                        --metal-highlight: #3d4f5f;
                        --neon-cyan: #00D4FF;
                        --neon-cyan-glow: rgba(0, 212, 255, 0.6);
                        --metal-gradient: linear-gradient(180deg, #3d4f5f 0%, #1a2332 50%, #0d1117 100%);
                        --glow-cyan: 0 0 10px var(--neon-cyan), 0 0 20px var(--neon-cyan-glow);
                    }

                    
                    .pnm-top-filters-inner {
                        display: flex;
                        flex-direction: row;
                        flex-wrap: nowrap;
                        align-items: stretch;
                        gap: 8px;
                        max-width: 1400px;
                        margin: 0 auto;
                        overflow-x: auto;
                        padding-bottom: 5px;
                    }
                    .pnm-top-filters-inner::-webkit-scrollbar { display: none; }
                    .pnm-filter-select {
                        flex: 1 1 140px;
                        min-width: 120px;
                        max-width: 200px;
                        height: 36px;
                        padding: 0 10px;
                        background: rgba(12, 22, 40, 0.85);
                        border: 1.5px solid rgba(0,212,255,0.25);
                        border-radius: 8px;
                        color: #fff;
                        font-size: 13px;
                        font-weight: 500;
                        outline: none;
                        appearance: none;
                        transition: all 0.2s;
                        box-sizing: border-box;
                    }
                    .pnm-filter-select:hover, .pnm-filter-select:focus {
                        border-color: rgba(0,212,255,0.55);
                        box-shadow: 0 0 10px rgba(0,212,255,0.1);
                    }
                    select.pnm-filter-select {
                        background-image: url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%2300D4FF%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E");
                        background-repeat: no-repeat;
                        background-position: right 10px top 50%;
                        background-size: 8px auto;
                    }

                    .dt-page {
                        min-height: 100vh; padding-bottom: 70px;
                        position: relative;
                        color: #fff;
                        font-family: 'Rajdhani', 'Inter', -apple-system, sans-serif;
                        overflow-x: hidden;
                    }

                    /* Space Background */
                    .space-bg {
                        position: fixed;
                        inset: 0;
                        background:
                            radial-gradient(ellipse at 20% 20%, rgba(59, 130, 246, 0.15) 0%, transparent 50%),
                            radial-gradient(ellipse at 80% 80%, rgba(139, 92, 246, 0.1) 0%, transparent 50%),
                            radial-gradient(ellipse at 50% 50%, rgba(6, 182, 212, 0.08) 0%, transparent 60%),
                            linear-gradient(180deg, #030712 0%, #0a1628 30%, #0f172a 50%, #0a1628 70%, #030712 100%);
                        z-index: -2;
                    }
                    .space-overlay {
                        position: fixed;
                        inset: 0;
                        background: linear-gradient(180deg, rgba(3,7,18,0.3) 0%, transparent 20%, transparent 80%, rgba(3,7,18,0.5) 100%);
                        z-index: -1;
                    }

                    /* Header */
                    .dt-header {
                        padding: 24px 20px;
                        display: flex;
                        align-items: baseline;
                        gap: 16px;
                        flex-wrap: wrap;
                    }
                    .dt-header h1 {
                        font-family: 'Orbitron', 'Rajdhani', sans-serif;
                        font-size: 28px;
                        font-weight: 700;
                        margin: 0;
                        letter-spacing: 2px;
                        text-transform: uppercase;
                        text-shadow: 0 0 20px rgba(0,212,255,0.3);
                    }
                    .dt-header .white { color: #fff; }
                    .dt-header .gold { 
                        color: #00D4FF; 
                        text-shadow: 0 0 15px rgba(0,212,255,0.6);
                    }
                    .dt-header .subtitle {
                        font-size: 14px;
                        color: rgba(255,255,255,0.5);
                        font-weight: 400;
                        letter-spacing: 1px;
                    }

                    /* Day Selector */
                    .day-selector {
                        padding: 0 20px 16px;
                        overflow-x: auto;
                    }
                    .day-tabs {
                        display: flex;
                        gap: 4px;
                        min-width: min-content;
                    }
                    .day-tab {
                        padding: 10px 16px;
                        background: linear-gradient(180deg, rgba(61, 79, 95, 0.2) 0%, rgba(26, 35, 50, 0.4) 100%);
                        border: 1px solid var(--metal-highlight);
                        border-radius: 8px;
                        color: rgba(255,255,255,0.7);
                        font-size: 14px;
                        font-weight: 600;
                        font-family: 'Rajdhani', sans-serif;
                        cursor: pointer;
                        transition: all 0.2s;
                        white-space: nowrap;
                        text-transform: uppercase;
                        letter-spacing: 0.5px;
                    }
                    .day-tab:hover {
                        background: linear-gradient(180deg, rgba(61, 79, 95, 0.4) 0%, rgba(26, 35, 50, 0.6) 100%);
                        border-color: var(--neon-cyan);
                        box-shadow: 0 0 10px rgba(0, 212, 255, 0.2);
                    }
                    .day-tab.active {
                        background: linear-gradient(135deg, #00D4FF, #0099CC);
                        border-color: #00D4FF;
                        color: #000;
                        box-shadow: 0 0 15px rgba(0, 212, 255, 0.5), 0 0 30px rgba(0, 212, 255, 0.2);
                    }
                    .day-full { display: none; }
                    @media (min-width: 768px) {
                        .day-short { display: none; }
                        .day-full { display: inline; }
                    }

                    /* Layout */
                    .dt-layout {
                        display: flex;
                        flex-direction: column;
                        min-height: calc(100vh - 350px);
                        padding: 0 20px;
                    }
                    .tournament-feed { flex: 1; }

                    /* Loading / Empty State */
                    .loading-state, .empty-state {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        padding: 80px 20px;
                        color: rgba(255,255,255,0.5);
                    }
                    .spinner {
                        width: 40px;
                        height: 40px;
                        border: 3px solid rgba(255,255,255,0.1);
                        border-top-color: #00D4FF;
                        border-radius: 50%;
                        animation: spin 1s linear infinite;
                        margin-bottom: 16px;
                    }
                    @keyframes spin { to { transform: rotate(360deg); } }
                    .empty-state button {
                        margin-top: 16px;
                        padding: 12px 24px;
                        background: rgba(0,212,255,0.2);
                        border: 1px solid rgba(0,212,255,0.4);
                        border-radius: 8px;
                        color: #00D4FF;
                        cursor: pointer;
                        transition: all 0.2s;
                    }

                    /* Time Sections */
                    .tournament-sections { display: flex; flex-direction: column; gap: 32px; }
                    .time-section { }
                    .time-header {
                        display: flex;
                        align-items: center;
                        gap: 12px;
                        font-size: 16px;
                        font-weight: 600;
                        margin: 0 0 16px;
                        padding-bottom: 12px;
                        border-bottom: 1px solid rgba(255,255,255,0.1);
                    }
                    .time-icon {
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
                        width: 36px;
                        height: 24px;
                        background: rgba(59,130,246,0.2);
                        border: 1px solid rgba(59,130,246,0.4);
                        border-radius: 4px;
                        font-size: 11px;
                        font-weight: 700;
                        color: #3b82f6;
                    }
                    .time-icon.afternoon {
                        background: rgba(245,158,11,0.2);
                        border-color: rgba(245,158,11,0.4);
                        color: #f59e0b;
                    }
                    .time-icon.evening {
                        background: rgba(139,92,246,0.2);
                        border-color: rgba(139,92,246,0.4);
                        color: #8b5cf6;
                    }
                    .time-count {
                        margin-left: auto;
                        font-size: 13px;
                        font-weight: 500;
                        color: rgba(255,255,255,0.5);
                    }

                    .tournament-list {
                        display: flex;
                        flex-direction: column;
                        gap: 12px;
                    }


                    /* Responsive */
                    @media (min-width: 768px) {
                        .tournament-list {
                            display: grid;
                            grid-template-columns: repeat(2, 1fr);
                            gap: 14px;
                        }
                    }

                    @media (min-width: 1024px) {
                        .tournament-list { grid-template-columns: repeat(3, 1fr); }
                        .dt-layout { padding: 0 40px; }
                    }

                    @media (min-width: 1280px) {
                        .tournament-list { grid-template-columns: repeat(4, 1fr); }
                    }
                `}</style>
            </div>
        </>
    );
}

// Tournament Card Component
function TournamentCard({ tournament }) {
    const t = tournament;
    const isRealVenue = t.venue_id && !String(t.venue_id).startsWith('charity_') && !String(t.venue_id).startsWith('tour_event_');

    return (
        <div className="tournament-card">
            <div className="card-header">
                <span className="card-time">{formatTime(t.start_time)}</span>
                <span className="card-buyin">{typeof t.buy_in === 'number' && t.buy_in > 0 ? `$${t.buy_in}` : (t.buy_in === 0 ? 'Free' : 'TBD')}</span>
            </div>
            {t.tournament_name && t.tournament_name !== t.venue_name && !t.tournament_name.match(/Buy In$/i) && !t.tournament_name.match(/^(pdf_action|viewport|fc-head|rh-flat|cookie|null|undefined)$/i) && t.tournament_name.length < 120 && (
                <p className="card-tournament-name">{t.tournament_name}</p>
            )}
            {isRealVenue ? (
                <Link href={`/hub/venues/${t.venue_id}`} legacyBehavior>
                    <a className="card-venue card-venue-link">{t.venue_name}</a>
                </Link>
            ) : (
                <h4 className="card-venue">{t.venue_name}</h4>
            )}
            {(t.city || t.state) && <p className="card-location">{[t.city, t.state].filter(Boolean).join(', ')}</p>}
            <div className="card-tags">
                <span className={`tag game-type ${(t.game_type || '').toLowerCase()}`}>{formatGameType(t.game_type)}</span>
                {t.format && <span className="tag format">{t.format}</span>}
                {t.guaranteed > 0 && <span className="tag guaranteed">{formatMoney(t.guaranteed)} GTD</span>}
                {t.venueType && t.venueType !== 'Unknown' && <span className="tag venue-type">{formatVenueType(t.venueType)}</span>}
            </div>
            <div className="card-actions">
                {isRealVenue && (
                    <Link href={`/hub/venues/${t.venue_id}`} legacyBehavior>
                        <a className="card-link venue-link">View Venue Page</a>
                    </Link>
                )}
                {t.pokerAtlasUrl && (
                    <a href={safeHref(t.pokerAtlasUrl)} target="_blank" rel="noopener noreferrer" className="card-link">
                        View Details
                    </a>
                )}
            </div>

            <style jsx>{`
                .tournament-card {
                    padding: 16px 18px;
                    background: rgba(15, 23, 42, 0.5);
                    border: 1px solid rgba(255, 255, 255, 0.12);
                    border-radius: 12px;
                    transition: all 0.2s ease;
                }
                .tournament-card:hover {
                    border-color: rgba(255, 255, 255, 0.25);
                    background: rgba(15, 23, 42, 0.7);
                }
                .card-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 10px;
                }
                .card-time {
                    font-size: 13px;
                    font-weight: 600;
                    color: #22c55e;
                    padding: 4px 10px;
                    background: rgba(34, 197, 94, 0.15);
                    border-radius: 4px;
                }
                .card-buyin {
                    font-size: 18px;
                    font-weight: 700;
                    color: #00D4FF;
                }
                .card-venue {
                    font-size: 16px;
                    font-weight: 600;
                    margin: 0 0 4px;
                    color: #fff;
                }
                .card-tournament-name {
                    font-size: 13px;
                    font-weight: 500;
                    color: rgba(255, 255, 255, 0.7);
                    margin: 0 0 6px;
                    line-height: 1.3;
                }
                .card-location {
                    font-size: 13px;
                    color: rgba(255, 255, 255, 0.5);
                    margin: 0 0 12px;
                }
                .card-tags {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 6px;
                    margin-bottom: 12px;
                }
                .tag {
                    font-size: 11px;
                    padding: 4px 8px;
                    background: rgba(255, 255, 255, 0.08);
                    border-radius: 4px;
                    color: rgba(255, 255, 255, 0.7);
                }
                .tag.game-type.nlh {
                    background: rgba(59, 130, 246, 0.2);
                    color: #60a5fa;
                }
                .tag.game-type.plo {
                    background: rgba(239, 68, 68, 0.2);
                    color: #f87171;
                }
                .tag.format {
                    background: rgba(139, 92, 246, 0.2);
                    color: #a78bfa;
                }
                .tag.guaranteed {
                    background: rgba(34, 197, 94, 0.2);
                    color: #4ade80;
                }
                .card-venue-link {
                    display: block;
                    font-size: 16px;
                    font-weight: 600;
                    margin: 0 0 4px;
                    color: #fff;
                    text-decoration: none;
                    transition: color 0.15s;
                }
                .card-venue-link:hover {
                    color: #00D4FF;
                    text-decoration: underline;
                }
                .card-actions {
                    display: flex;
                    gap: 8px;
                }
                .card-link {
                    flex: 1;
                    display: block;
                    text-align: center;
                    padding: 8px;
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 6px;
                    color: rgba(255, 255, 255, 0.7);
                    text-decoration: none;
                    font-size: 12px;
                    transition: all 0.2s;
                }
                .card-link:hover {
                    background: rgba(255, 255, 255, 0.1);
                    color: #fff;
                }
                .card-link.venue-link {
                    border-color: rgba(0, 212, 255, 0.3);
                    color: #00D4FF;
                }
                .card-link.venue-link:hover {
                    background: rgba(0, 212, 255, 0.15);
                    border-color: rgba(0, 212, 255, 0.5);
                }
            `}</style>
        </div>
    );
}
