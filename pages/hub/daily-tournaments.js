/**
 * DAILY TOURNAMENTS - Find poker tournaments happening today
 * Live data from venue_daily_tournaments — 324+ venues, 4,500+ records
 */

import SEOHead from '../../src/components/seo/SEOHead';
import Link from 'next/link';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
// 2026-05-07 — UI-UX-Pro-Max: Lucide icons replace inline SVG + HTML entities
import {
    Search as SearchLuc, Calendar as CalendarLuc,
    X as XLuc, ChevronLeft as ChevLeft, ChevronRight as ChevRight,
} from 'lucide-react';
import { useRouter } from 'next/router';
import useSWR from 'swr';
import useVenueRealtime from '../../src/hooks/useVenueRealtime';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import HamburgerMenu from '../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../src/config/hamburgerMenus';
import { getInitialsColor } from '../../src/components/poker-near-me/pnm-utils';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const POPULAR_STATES = [
    { name: 'Texas', abbr: 'TX' },
    { name: 'California', abbr: 'CA' },
    { name: 'Florida', abbr: 'FL' },
    { name: 'Nevada', abbr: 'NV' },
];

const VENUE_TYPES = [
    { label: 'All venues', value: '' },
    { label: 'Casinos', value: 'Casino' },
    { label: 'Card rooms', value: 'Card Room' },
    { label: 'Charity', value: 'Charity' },
];

const BUYIN_RANGES = [
    { label: 'All buy-ins', min: null, max: null },
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

// [B2 FIX] haversine at module level — stable reference across renders.
// Previously declared inside the component, creating a new function ref on every render
// which busted the sortedTournaments useMemo dep comparison (always computed as "changed").
function haversine(lat1, lng1, lat2, lng2) {
    if (lat1 == null || lng1 == null || lat2 == null || lng2 == null || isNaN(lat1) || isNaN(lng1) || isNaN(lat2) || isNaN(lng2)) return Infinity;
    const R = 3958.8;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}


export default function DailyTournaments() {
    const router = useRouter();
    const [menuOpen, setMenuOpen] = useState(false);
    const [selectedDay, setSelectedDay] = useState(DAYS[new Date().getDay()]);
    const [selectedState, setSelectedState] = useState(null);
    const [selectedType, setSelectedType] = useState('');
    const [selectedBuyin, setSelectedBuyin] = useState(BUYIN_RANGES[0]);
    const [searchQuery, setSearchQuery] = useState('');
    // Calendar state
    const [calendarOpen, setCalendarOpen] = useState(false);
    const [calendarMonth, setCalendarMonth] = useState(() => {
        const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() };
    });
    const [selectedDate, setSelectedDate] = useState(null); // null = use day-of-week mode

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

    // [B14 FIX] useMemo prevents swrParams from rebuilding on every render
    // — only recalculates when actual filter dependencies change, preventing SWR key churn
    const swrParams = useMemo(() => {
        const p = new URLSearchParams({ day: selectedDay });
        if (selectedState) p.set('state', selectedState.abbr);
        if (selectedType) p.set('type', selectedType);
        if (selectedBuyin.min) p.set('minBuyin', selectedBuyin.min.toString());
        if (selectedBuyin.max) p.set('maxBuyin', selectedBuyin.max.toString());
        if (debouncedSearch) p.set('venue', debouncedSearch);
        if (selectedDate) {
            p.set('day', DAYS[new Date(selectedDate + 'T12:00:00').getDay()]);
            p.set('exact_date', selectedDate);
        }
        return p;
    }, [selectedDay, selectedState, selectedType, selectedBuyin, debouncedSearch, selectedDate]);

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
    // [DT4 FIX] Added retry fallback — if the RT fetch fails, fall back to SWR mutate() to at
    // least invalidate the cache so the next navigation gets fresh data.
    useVenueRealtime(() => {
        const rtUrl = `/api/poker/daily-tournaments?${swrParams.toString()}&_rt=${Date.now()}`;
        fetch(rtUrl)
            .then(r => r.json())
            .then(d => {
                if (d.success) refreshTournaments(d, { revalidate: false });
                else refreshTournaments(); // Soft invalidate if payload is bad
            })
            .catch(e => { console.warn('[App] Handled promise rejection:', e?.message || e); });
    });
    const tournaments = swrData?.tournaments || [];
    const stats = swrData?.stats || {};

    // ── GPS / Distance Filter ─────────────────────────────────────────────
    // [P1-B FIX] Moved above clearFilters — useState setters must be declared before
    // being referenced in non-hook code (clearFilters calls setDistanceFilter at runtime).
    const [userLocation, setUserLocation] = useState(null); // { lat, lng }
    const [gpsStatus, setGpsStatus] = useState('idle'); // idle | requesting | granted | denied
    const [distanceFilter, setDistanceFilter] = useState('all'); // 'all' | '25' | '50' | '100' | '250'

    const clearFilters = () => {
        setSelectedState(null);
        setSelectedType('');
        setSelectedBuyin(BUYIN_RANGES[0]);
        setSearchQuery('');
        setDebouncedSearch('');
        setSelectedDate(null);
        setDistanceFilter('all');
    };

    // Request GPS — triggered when user picks a distance
    const handleDistanceChange = (val) => {
        if (val === 'all') { setDistanceFilter('all'); return; }
        if (userLocation) { setDistanceFilter(val); return; }
        if (typeof navigator !== 'undefined' && navigator.geolocation) {
            setGpsStatus('requesting');
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                    setGpsStatus('granted');
                    setDistanceFilter(val);
                },
                () => {
                    setGpsStatus('denied');
                    setDistanceFilter('all');
                },
                { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
            );
        } else {
            setDistanceFilter('all');
        }
    };

    // Auto-request GPS on mount (silent — just pre-fetches for when user picks a distance)
    useEffect(() => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) return;
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                setGpsStatus('granted');
            },
            () => setGpsStatus('denied'),
            { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }
        );
    }, []);

    // [DT1+DT5 FIX] useMemo prevents re-sorting on unrelated state changes (calendarOpen, menuOpen, etc.)
    // [DT5] Pre-compute distance Map once — avoids O(2N) haversine calls (filter pass + sort pass)
    const sortedTournaments = useMemo(() => {
        let list = [...tournaments];
        const distanceMap = new Map();
        if (distanceFilter !== 'all' && userLocation) {
            // Compute all distances once
            list.forEach(t => {
                if (t.latitude && t.longitude) {
                    distanceMap.set(t, haversine(userLocation.lat, userLocation.lng, parseFloat(t.latitude), parseFloat(t.longitude)));
                }
            });
            const maxMiles = parseInt(distanceFilter, 10);
            list = list.filter(t => {
                if (!distanceMap.has(t)) return true; // no coords = keep (same as before)
                return distanceMap.get(t) <= maxMiles;
            });
            list.sort((a, b) => (distanceMap.get(a) ?? 99999) - (distanceMap.get(b) ?? 99999));
        } else {
            list.sort((a, b) => parseTimeToMinutes(a.start_time) - parseTimeToMinutes(b.start_time));
        }
        return list;
    }, [tournaments, distanceFilter, userLocation]);

    // [DT3 FIX] today memoized — was computed + mutated on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
    const calDays = useCallback(() => {
        const { year, month } = calendarMonth;
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        return { firstDay, daysInMonth, year, month };
    }, [calendarMonth]);

    function toDateStr(year, month, day) {
        return `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    }

    function handleCalendarDateClick(dateStr) {
        const d = new Date(dateStr + 'T12:00:00');
        const dayName = DAYS[d.getDay()];
        setSelectedDate(dateStr);
        setSelectedDay(dayName);
        setCalendarOpen(false);
    }

    // ── parseTimeToMinutes must come before any usage ──────────────────
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
                description="Join daily poker tournaments on Smarter.Poker. Compete against players worldwide with daily challenges and prize pools."
                canonical="/hub/daily-tournaments"
            >

                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />

            </SEOHead>

            <div className="dt-page">
                {/* Space Background */}
                <div className="space-bg"></div>
                <div className="space-overlay"></div>

                <UniversalHeader pageDepth={1} onMenuClick={() => setMenuOpen(true)} onBackClick={() => {
                    router.back();
                }} />
                <HamburgerMenu
                    isOpen={menuOpen}
                    onClose={() => setMenuOpen(false)}
                    direction="right"
                    theme="dark"
                    menuItems={menuConfig.menuItems}
                    bottomLinks={menuConfig.bottomLinks}
                />

                {/* Page Header — Title left, Search right */}
                <div className="dt-header">
                    <div className="dt-header-left">
                        <h1><span className="white">DAILY</span> <span className="gold">TOURNAMENTS</span></h1>
                        <span className="subtitle">{stats.total || 0} TOURNAMENTS AT {stats.venueCount || new Set((swrData?.tournaments || []).map(t => t.venue_name)).size || '...'} VENUES</span>
                    </div>
                    <div className="dt-header-right">
                        <form role="search" className="pnm-search-box" style={{ position: 'relative' }} onSubmit={(e) => { e.preventDefault(); setDebouncedSearch(searchQuery); }}>
                            <label htmlFor="venue-search" className="dt-sr-only">Search tournaments by venue</label>
                            <SearchLuc size={16} aria-hidden style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.4)', pointerEvents: 'none' }} />
                            <input
                                type="text"
                                id="venue-search"
                                className="dt-search-input"
                                placeholder="Search venues"
                                value={searchQuery}
                                onChange={(e) => handleSearchChange(e.target.value)}
                            />
                        </form>
                    </div>
                </div>

                {/* Day Selector + Calendar Button */}
                <div className="day-selector">
                    <div className="day-tabs-row">
                        <div className="day-tabs">
                            {DAYS.map(day => {
                                // Find the upcoming date for this day-of-week
                                const todayIdx = new Date().getDay();
                                const dayIdx = DAYS.indexOf(day);
                                let daysAhead = dayIdx - todayIdx;
                                if (daysAhead < 0) daysAhead += 7;
                                const tabDate = new Date();
                                tabDate.setDate(tabDate.getDate() + daysAhead);
                                const tabDateStr = toDateStr(tabDate.getFullYear(), tabDate.getMonth(), tabDate.getDate());
                                const isActive = selectedDate
                                    ? selectedDate === tabDateStr
                                    : selectedDay === day;
                                const isToday = daysAhead === 0;
                                return (
                                    <button
                                        key={day}
                                        className={`day-tab ${isActive ? 'active' : ''}`}
                                        onClick={() => {
                                            setSelectedDay(day);
                                            setSelectedDate(null);
                                        }}
                                        aria-pressed={isActive}
                                    >
                                        {isToday && <span className="day-today-dot" />}
                                        <span className="day-short">{day.substring(0, 3)}</span>
                                        <span className="day-full">{day}</span>
                                    </button>
                                );
                            })}
                        </div>
                        <button
                            className="calendar-btn"
                            onClick={() => setCalendarOpen(true)}
                            aria-label="Browse by calendar date"
                            aria-haspopup="dialog"
                            title="Browse by calendar date"
                        >
                            <CalendarLuc size={18} aria-hidden />
                            <span>Calendar</span>
                        </button>
                    </div>
                    {selectedDate && (
                        <div className="selected-date-banner">
                            Showing schedule for: <strong>{new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</strong>
                            <button onClick={() => setSelectedDate(null)} className="clear-date-btn" aria-label="Back to week view"><XLuc size={12} aria-hidden /> Back to week</button>
                        </div>
                    )}
                </div>

                {/* Calendar Modal */}
                {calendarOpen && (() => {
                    const { firstDay, daysInMonth, year, month } = calDays();
                    const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
                    const calCells = [];
                    for (let i = 0; i < firstDay; i++) calCells.push(null);
                    for (let d = 1; d <= daysInMonth; d++) calCells.push(d);
                    const maxDate = new Date(); maxDate.setDate(maxDate.getDate() + 365);
                    return (
                        <div className="cal-overlay" onClick={() => setCalendarOpen(false)}>
                            <div className="cal-modal" role="dialog" aria-modal="true" aria-labelledby="cal-modal-title" onClick={e => e.stopPropagation()}>
                                <div className="cal-nav">
                                    <button className="cal-nav-btn" aria-label="Previous month" onClick={() => setCalendarMonth(m => {
                                        if (m.month === 0) return { year: m.year - 1, month: 11 };
                                        return { year: m.year, month: m.month - 1 };
                                    })}><ChevLeft size={18} aria-hidden /></button>
                                    <span className="cal-month-label" id="cal-modal-title">{MONTH_NAMES[month]} {year}</span>
                                    <button className="cal-nav-btn" aria-label="Next month" onClick={() => setCalendarMonth(m => {
                                        if (m.month === 11) return { year: m.year + 1, month: 0 };
                                        return { year: m.year, month: m.month + 1 };
                                    })}><ChevRight size={18} aria-hidden /></button>
                                    <button className="cal-close-btn" aria-label="Close calendar" onClick={() => setCalendarOpen(false)}><XLuc size={16} aria-hidden /></button>
                                </div>
                                <div className="cal-weekdays">
                                    {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => <div key={d} className="cal-wd">{d}</div>)}
                                </div>
                                <div className="cal-grid">
                                    {calCells.map((d, i) => {
                                        if (!d) return <div key={`e-${i}`} className="cal-cell empty" />;
                                        const dateStr = toDateStr(year, month, d);
                                        const cellDate = new Date(dateStr + 'T12:00:00');
                                        const isPast = cellDate < today;
                                        const isFuture = cellDate > maxDate;
                                        const isSelected = selectedDate === dateStr;
                                        const isToday2 = dateStr === toDateStr(today.getFullYear(), today.getMonth(), today.getDate());
                                        return (
                                            <button
                                                key={dateStr}
                                                className={`cal-cell ${isPast || isFuture ? 'disabled' : ''} ${isSelected ? 'selected' : ''} ${isToday2 ? 'today' : ''}`}
                                                disabled={isPast || isFuture}
                                                aria-pressed={isSelected}
                                                aria-label={`${MONTH_NAMES[month]} ${d}, ${year}${isToday2 ? ' (today)' : ''}`}
                                                onClick={() => handleCalendarDateClick(dateStr)}
                                            >
                                                {d}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    );
                })()}

                {/* Top Level Filters Command Bar — centered dropdowns only, no search here */}
                <div className="pnm-top-filters">
                    <div className="filters-dropdown-group">
                        <label htmlFor="dt-state-filter" className="dt-sr-only">State</label>
                        <select id="dt-state-filter" className="pnm-filter-select" value={selectedState ? selectedState.abbr : ''} onChange={(e) => {
                            const st = POPULAR_STATES.find(s => s.abbr === e.target.value);
                            setSelectedState(st || null);
                        }}>
                            <option value="">All states</option>
                            {POPULAR_STATES.map(state => (
                                <option key={state.abbr} value={state.abbr}>{state.name}</option>
                            ))}
                        </select>

                        <label htmlFor="dt-type-filter" className="dt-sr-only">Venue type</label>
                        <select id="dt-type-filter" className="pnm-filter-select" value={selectedType} onChange={(e) => setSelectedType(e.target.value)}>
                            {VENUE_TYPES.map(type => (
                                <option key={type.value} value={type.value}>{type.label}</option>
                            ))}
                        </select>

                        <label htmlFor="dt-buyin-filter" className="dt-sr-only">Buy-in range</label>
                        <select id="dt-buyin-filter" className="pnm-filter-select" value={selectedBuyin.label} onChange={(e) => {
                            const range = BUYIN_RANGES.find(r => r.label === e.target.value);
                            setSelectedBuyin(range || BUYIN_RANGES[0]);
                        }}>
                            {BUYIN_RANGES.map((range, i) => (
                                <option key={i} value={range.label}>{range.label}</option>
                            ))}
                        </select>

                        <label htmlFor="dt-distance-filter" className="dt-sr-only">Distance</label>
                        <select
                            id="dt-distance-filter"
                            className="pnm-filter-select"
                            value={distanceFilter}
                            onChange={(e) => handleDistanceChange(e.target.value)}
                            title={gpsStatus === 'denied' ? 'Location access denied — enable in browser settings' : ''}
                        >
                            <option value="all">Any distance</option>
                            <option value="25">Within 25 mi</option>
                            <option value="50">Within 50 mi</option>
                            <option value="100">Within 100 mi</option>
                            <option value="250">Within 250 mi</option>
                        </select>

                        {(searchQuery || selectedState || selectedType || selectedBuyin.min !== null || selectedBuyin.max !== null || distanceFilter !== 'all') ? (
                            <button className="pnm-filter-select pnm-clear-btn" onClick={clearFilters}>
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
                                <button onClick={() => refreshTournaments()} style={{ borderColor: 'rgba(239, 68, 68, 0.5)', color: '#ef4444' }}>Retry connection</button>
                            </div>
                        ) : loading ? (
                            <div className="loading-state" role="status" aria-live="polite" aria-busy="true">
                                <div className="spinner"></div>
                                <span>Finding tournaments…</span>
                            </div>
                        ) : tournaments.length === 0 ? (
                            <div className="empty-state">
                                <p>No tournaments found for {selectedDay}</p>
                                <button onClick={clearFilters}>Clear filters</button>
                            </div>
                        ) : (
                            <div className="tournament-list">
                                {sortedTournaments.map((t, i) => (
                                    <TournamentCard
                                        key={`${t.id || t.venue_id || t.tournament_name || 't'}-${t.start_time}-${i}`}
                                        tournament={t}
                                    />
                                ))}
                            </div>
                        )}
                    </main>

                    
                </div>

                <style>{`
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

                    
                    /* GPS Badge */
                    .gps-badge {
                        display: inline-block;
                        margin-top: 6px;
                        padding: 4px 12px;
                        background: rgba(0,212,255,0.12);
                        border: 1px solid rgba(0,212,255,0.3);
                        border-radius: 20px;
                        font-size: 12px;
                        color: #00D4FF;
                        letter-spacing: 0.5px;
                    }
                    .gps-badge.gps-denied {
                        background: rgba(255,255,255,0.05);
                        border-color: rgba(255,255,255,0.1);
                        color: rgba(255,255,255,0.4);
                    }

                    /* Filter Bar */
                    .pnm-top-filters {
                        padding: 0 20px;
                        margin-bottom: 20px;
                        display: flex;
                        flex-direction: column;
                        gap: 10px;
                        max-width: 1400px;
                        margin-left: auto;
                        margin-right: auto;
                    }
                    /* ROW 1: search in upper right */
                    .filters-row-top {
                        display: flex;
                        justify-content: flex-end;
                        align-items: center;
                        gap: 8px;
                    }
                    .filters-row-top-spacer { flex: 1; }
                    .pnm-search-box {
                        width: 240px;
                        max-width: 100%;
                    }
                    @media (max-width: 600px) {
                        .pnm-search-box { width: 100%; }
                        .filters-row-top { flex-direction: column; align-items: stretch; }
                    }
                    /* ROW 2: dropdowns centered */
                    .filters-dropdown-group {
                        display: flex;
                        gap: 8px;
                        flex-wrap: wrap;
                        justify-content: center;
                        align-items: center;
                    }
                    .pnm-clear-btn {
                        flex: 0 0 auto;
                        padding: 0 16px;
                        background: rgba(255,0,0,0.1);
                        border-color: rgba(255,0,0,0.3);
                        color: #ff4444;
                        cursor: pointer;
                    }
                    
                    .pnm-filter-select {
                        flex: 1 1 140px;
                        min-width: 120px;
                        max-width: 200px;
                        height: 40px;
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

                    /* Header — title left, search right */
                    .dt-header {
                        padding: 20px 24px;
                        display: flex;
                        flex-direction: row;
                        align-items: center;
                        justify-content: space-between;
                        gap: 16px;
                        max-width: 1400px;
                        margin: 0 auto;
                        width: 100%;
                    }
                    .dt-header-left {
                        display: flex;
                        flex-direction: column;
                        gap: 4px;
                    }
                    .dt-header-right {
                        flex-shrink: 0;
                    }
                    .dt-search-input {
                        background: rgba(255,255,255,0.05);
                        border: 1px solid rgba(255,255,255,0.15);
                        border-radius: 8px;
                        color: #fff;
                        font-size: 13px;
                        padding: 9px 12px 9px 34px;
                        width: 220px;
                        outline: none;
                        transition: border-color 0.2s;
                    }
                    .dt-search-input::placeholder { color: rgba(255,255,255,0.35); }
                    .dt-search-input:focus {
                        border-color: rgba(0,212,255,0.5);
                        box-shadow: 0 0 0 2px rgba(0,212,255,0.1);
                    }
                    @media (max-width: 600px) {
                        .dt-header { flex-direction: column; align-items: flex-start; }
                        .dt-search-input { width: 100%; }
                        .dt-header-right { width: 100%; }
                        .pnm-search-box { width: 100%; }
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

                    .day-selector {
                        padding: 0 20px 16px;
                        overflow-x: auto;
                    }
                    .day-tabs-row {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        min-width: 0;
                    }
                    .day-tabs {
                        display: flex;
                        gap: 4px;
                        min-width: min-content;
                        overflow-x: auto;
                        flex: 1;
                    }
                    .day-tabs::-webkit-scrollbar { display: none; }
                    .day-tab {
                        position: relative;
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
                    .day-today-dot {
                        position: absolute;
                        top: 5px; right: 5px;
                        width: 5px; height: 5px;
                        border-radius: 50%;
                        background: #00D4FF;
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
                    .calendar-btn {
                        display: flex;
                        align-items: center;
                        gap: 6px;
                        padding: 8px 14px;
                        background: rgba(0,212,255,0.1);
                        border: 1.5px solid rgba(0,212,255,0.35);
                        border-radius: 8px;
                        color: #00D4FF;
                        font-size: 13px;
                        font-weight: 600;
                        font-family: 'Rajdhani', sans-serif;
                        cursor: pointer;
                        white-space: nowrap;
                        flex-shrink: 0;
                        transition: all 0.2s;
                    }
                    .calendar-btn:hover {
                        background: rgba(0,212,255,0.2);
                        border-color: rgba(0,212,255,0.6);
                        box-shadow: 0 0 12px rgba(0,212,255,0.2);
                    }
                    .selected-date-banner {
                        margin-top: 10px;
                        padding: 8px 14px;
                        background: rgba(0,212,255,0.08);
                        border: 1px solid rgba(0,212,255,0.25);
                        border-radius: 8px;
                        font-size: 13px;
                        color: rgba(255,255,255,0.8);
                        display: flex;
                        align-items: center;
                        gap: 10px;
                        flex-wrap: wrap;
                    }
                    .selected-date-banner strong { color: #00D4FF; }
                    .clear-date-btn {
                        background: none;
                        border: none;
                        color: rgba(255,255,255,0.5);
                        cursor: pointer;
                        font-size: 12px;
                        padding: 2px 6px;
                        margin-left: auto;
                        transition: color 0.15s;
                    }
                    .clear-date-btn:hover { color: #fff; }

                    /* Calendar Modal */
                    .cal-overlay {
                        position: fixed;
                        inset: 0;
                        background: rgba(0,0,0,0.7);
                        z-index: 1000;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        padding: 20px;
                    }
                    .cal-modal {
                        background: #0d1117;
                        border: 1.5px solid rgba(0,212,255,0.35);
                        border-radius: 16px;
                        padding: 20px;
                        width: 320px;
                        max-width: 100%;
                        box-shadow: 0 0 40px rgba(0,212,255,0.15), 0 20px 60px rgba(0,0,0,0.6);
                    }
                    .cal-nav {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        margin-bottom: 14px;
                    }
                    .cal-month-label {
                        flex: 1;
                        text-align: center;
                        font-size: 16px;
                        font-weight: 700;
                        color: #fff;
                        font-family: 'Rajdhani', sans-serif;
                        letter-spacing: 0.5px;
                    }
                    .cal-nav-btn {
                        width: 30px; height: 30px;
                        background: rgba(255,255,255,0.05);
                        border: 1px solid rgba(255,255,255,0.15);
                        border-radius: 6px;
                        color: #fff;
                        font-size: 18px;
                        cursor: pointer;
                        display: flex; align-items: center; justify-content: center;
                        transition: all 0.15s;
                    }
                    .cal-nav-btn:hover {
                        background: rgba(0,212,255,0.15);
                        border-color: rgba(0,212,255,0.4);
                    }
                    .cal-close-btn {
                        width: 28px; height: 28px;
                        background: rgba(255,255,255,0.05);
                        border: 1px solid rgba(255,255,255,0.15);
                        border-radius: 6px;
                        color: rgba(255,255,255,0.6);
                        font-size: 14px;
                        cursor: pointer;
                        display: flex; align-items: center; justify-content: center;
                        transition: all 0.15s;
                        margin-left: auto;
                    }
                    .cal-close-btn:hover { background: rgba(255,0,0,0.1); border-color: rgba(255,0,0,0.3); color: #ff4444; }
                    .cal-weekdays {
                        display: grid;
                        grid-template-columns: repeat(7, 1fr);
                        gap: 2px;
                        margin-bottom: 6px;
                    }
                    .cal-wd {
                        text-align: center;
                        font-size: 11px;
                        font-weight: 600;
                        color: rgba(255,255,255,0.4);
                        padding: 4px 0;
                        text-transform: uppercase;
                    }
                    .cal-grid {
                        display: grid;
                        grid-template-columns: repeat(7, 1fr);
                        gap: 3px;
                    }
                    .cal-cell {
                        aspect-ratio: 1;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        border-radius: 6px;
                        font-size: 13px;
                        font-weight: 500;
                        cursor: pointer;
                        background: rgba(255,255,255,0.04);
                        border: 1px solid transparent;
                        color: rgba(255,255,255,0.8);
                        transition: all 0.15s;
                    }
                    .cal-cell.empty { background: none; border: none; cursor: default; }
                    .cal-cell.disabled { color: rgba(255,255,255,0.2); cursor: not-allowed; background: none; }
                    .cal-cell:not(.disabled):not(.empty):hover {
                        background: rgba(0,212,255,0.15);
                        border-color: rgba(0,212,255,0.4);
                        color: #00D4FF;
                    }
                    .cal-cell.today {
                        border-color: rgba(0,212,255,0.5);
                        color: #00D4FF;
                        font-weight: 700;
                    }
                    .cal-cell.selected {
                        background: linear-gradient(135deg, #00D4FF, #0099CC);
                        border-color: #00D4FF;
                        color: #000;
                        font-weight: 700;
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

                    /* ═══ A11y: visually-hidden labels for screen readers ═══ */
                    .dt-sr-only {
                        position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
                        overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
                    }

                    /* ═══ Touch-target compliance (UI-UX-Pro-Max priority 2 — 44pt minimum) ═══ */
                    .cal-nav-btn {
                        min-width: 44px; min-height: 44px;
                        display: inline-flex; align-items: center; justify-content: center;
                        background: rgba(0,212,255,0.08); border: 1px solid rgba(0,212,255,0.25);
                        border-radius: 8px; color: #00D4FF; cursor: pointer;
                    }
                    .cal-nav-btn:hover { background: rgba(0,212,255,0.18); }
                    .cal-close-btn {
                        min-width: 44px; min-height: 44px;
                        display: inline-flex; align-items: center; justify-content: center;
                        background: transparent; border: none;
                        color: rgba(255,255,255,0.6); cursor: pointer; border-radius: 8px;
                    }
                    .cal-close-btn:hover { color: #fff; background: rgba(255,255,255,0.06); }
                    .clear-date-btn {
                        min-height: 36px; padding: 6px 10px;
                        display: inline-flex; align-items: center; gap: 4px;
                        background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.15);
                        border-radius: 6px; color: rgba(255,255,255,0.7);
                        font-size: 12px; cursor: pointer;
                    }
                    .clear-date-btn:hover { background: rgba(255,255,255,0.1); color: #fff; }

                    /* ═══ Motion guard (UI-UX-Pro-Max priority 7 — WCAG 2.3.3) ═══ */
                    @media (prefers-reduced-motion: reduce) {
                        .day-tab, .calendar-btn, .pnm-filter-select, .tournament-card,
                        .card-link, .clear-date-btn, .cal-cell, .dt-search-input { transition: none !important; }
                        /* Slow the spinner rather than halt — needed to convey loading state */
                        .spinner { animation-duration: 2s !important; }
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
    const initials = (t.venue_name || 'V').substring(0, 1).toUpperCase();
    const initialsColors = getInitialsColor(t.venue_id || t.venue_name || 'V');

    return (
        <div className="tournament-card">
            {/* ── TOP ROW: Logo + Time badge (left) + Buy-in (right) ── */}
            <div className="card-top">
                <div className="card-logo-wrap">
                    {t.logo_url ? (
                        <img src={t.logo_url} alt={initials} className="card-logo" />
                    ) : (
                        <div className="card-initials" style={{ backgroundColor: initialsColors.bg, color: initialsColors.text, borderColor: initialsColors.border }}>
                            {initials}
                        </div>
                    )}
                </div>
                <div className="card-top-meta">
                    <span className="card-time">{formatTime(t.start_time)}</span>
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
                </div>
                <span className="card-buyin">{typeof t.buy_in === 'number' && t.buy_in > 0 ? `$${t.buy_in}` : (t.buy_in === 0 ? 'Free' : 'TBD')}</span>
            </div>

            {/* ── FOOTER: Action buttons always at bottom ── */}
            <div className="card-actions">
                {isRealVenue && (
                    <Link href={`/hub/venues/${t.venue_id}`} legacyBehavior>
                        <a className="card-link venue-link">View venue page</a>
                    </Link>
                )}
                {t.pokerAtlasUrl && (
                    <a href={safeHref(t.pokerAtlasUrl)} target="_blank" rel="noopener noreferrer" className="card-link">
                        View details
                    </a>
                )}
            </div>

            <style>{`
                .tournament-card {
                    display: flex;
                    flex-direction: column;
                    padding: 14px 16px;
                    background: rgba(15, 23, 42, 0.5);
                    border: 1px solid rgba(255, 255, 255, 0.12);
                    border-radius: 12px;
                    transition: all 0.2s ease;
                    height: 100%;
                    box-sizing: border-box;
                }
                .tournament-card:hover {
                    border-color: rgba(255, 255, 255, 0.25);
                    background: rgba(15, 23, 42, 0.7);
                }
                /* Top row: logo | meta | buy-in */
                .card-top {
                    display: flex;
                    gap: 12px;
                    align-items: flex-start;
                    flex: 1;
                }
                .card-logo-wrap {
                    flex-shrink: 0;
                    width: 56px;
                }
                .card-logo {
                    width: 56px;
                    height: 56px;
                    border-radius: 6px;
                    object-fit: contain;
                    background: rgba(255, 255, 255, 0.9);
                    padding: 3px;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    display: block;
                }
                .card-initials {
                    width: 56px;
                    height: 56px;
                    border-radius: 6px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 24px;
                    font-weight: 700;
                    border: 1px solid;
                    flex-shrink: 0;
                }
                .card-top-meta {
                    flex: 1;
                    min-width: 0;
                }
                .card-time {
                    display: inline-block;
                    font-size: 12px;
                    font-weight: 600;
                    color: #22c55e;
                    padding: 3px 8px;
                    background: rgba(34, 197, 94, 0.15);
                    border-radius: 4px;
                    margin-bottom: 6px;
                }
                .card-buyin {
                    font-size: 17px;
                    font-weight: 700;
                    color: #00D4FF;
                    white-space: nowrap;
                    flex-shrink: 0;
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
                    margin-top: auto;
                    padding-top: 12px;
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
