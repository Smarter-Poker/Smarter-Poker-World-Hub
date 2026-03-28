/**
 * VenueCard - Premium poker venue card for Poker Near Me page
 * v3.0 — Round 2 UI Overhaul: smarter.poker dark schema
 *
 * Improvements:
 * - Open/Closed real-time status indicator
 * - Enhanced card hierarchy with visual grouping
 * - Staggered mount animation
 * - Color-coded game type chips
 * - Live table count / wait list quick-info row
 * - Improved mobile touch targets
 * - Premium dark glassmorphic aesthetic
 */

import { useState, useEffect, useRef } from 'react';

const VENUE_TYPE_LABELS = {
    casino: 'Casino',
    card_room: 'Card Room',
    poker_club: 'Poker Club',
    home_game: 'Home Game',
    charity: 'Charity Room',
    series: 'Poker Series',
    tour: 'Poker Tour',
};

const VENUE_TYPE_ICONS = {
    casino: (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
        </svg>
    ),
    card_room: (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <rect x="2" y="7" width="20" height="15" rx="2" ry="2" /><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" />
        </svg>
    ),
    poker_club: (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
        </svg>
    ),
    home_game: (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
        </svg>
    ),
    charity: (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
        </svg>
    ),
    tour: (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M6 9H4.5a2.5 2.5 0 010-5C7 4 6 9 6 9zm12 0h1.5a2.5 2.5 0 000-5C17 4 18 9 18 9z" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0012 0V2z" />
        </svg>
    ),
    series: (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
        </svg>
    ),
};

const VENUE_TYPE_COLORS = {
    casino: { bg: 'rgba(212,168,83,0.10)', color: '#d4a853', border: 'rgba(212,168,83,0.28)', accent: '#d4a853' },
    card_room: { bg: 'rgba(59,130,246,0.10)', color: '#60a5fa', border: 'rgba(59,130,246,0.28)', accent: '#60a5fa' },
    poker_club: { bg: 'rgba(139,92,246,0.10)', color: '#a78bfa', border: 'rgba(139,92,246,0.28)', accent: '#a78bfa' },
    home_game: { bg: 'rgba(34,197,94,0.10)', color: '#4ade80', border: 'rgba(34,197,94,0.28)', accent: '#4ade80' },
    charity: { bg: 'rgba(236,72,153,0.10)', color: '#f472b6', border: 'rgba(236,72,153,0.28)', accent: '#f472b6' },
    tour: { bg: 'rgba(245,158,11,0.10)', color: '#f59e0b', border: 'rgba(245,158,11,0.28)', accent: '#f59e0b' },
    series: { bg: 'rgba(6,182,212,0.10)', color: '#06b6d4', border: 'rgba(6,182,212,0.28)', accent: '#06b6d4' },
};

// Game type color mapping for enhanced chips
const GAME_TYPE_COLORS = {
    'NLH': { bg: 'rgba(212,168,83,0.12)', color: '#d4a853', border: 'rgba(212,168,83,0.22)' },
    'PLO': { bg: 'rgba(139,92,246,0.12)', color: '#a78bfa', border: 'rgba(139,92,246,0.22)' },
    'Limit': { bg: 'rgba(59,130,246,0.12)', color: '#60a5fa', border: 'rgba(59,130,246,0.22)' },
    'Mixed': { bg: 'rgba(6,182,212,0.12)', color: '#22d3ee', border: 'rgba(6,182,212,0.22)' },
    'Stud': { bg: 'rgba(236,72,153,0.12)', color: '#f472b6', border: 'rgba(236,72,153,0.22)' },
    'Big O': { bg: 'rgba(245,158,11,0.12)', color: '#fbbf24', border: 'rgba(245,158,11,0.22)' },
};

function getGameChipStyle(gameName) {
    if (!gameName) return {};
    const upper = gameName.toUpperCase();
    if (upper.includes('PLO') || upper.includes('OMAHA')) {
        const key = upper.includes('BIG') ? 'Big O' : 'PLO';
        return GAME_TYPE_COLORS[key] || {};
    }
    if (upper.includes('NLH') || upper.includes('NO LIMIT') || upper.includes('HOLDEM') || upper.includes("HOLD'EM")) return GAME_TYPE_COLORS['NLH'];
    if (upper.includes('LIMIT') && !upper.includes('NO LIMIT')) return GAME_TYPE_COLORS['Limit'];
    if (upper.includes('MIXED') || upper.includes('HORSE') || upper.includes('8-GAME')) return GAME_TYPE_COLORS['Mixed'];
    if (upper.includes('STUD')) return GAME_TYPE_COLORS['Stud'];
    return {};
}

function getTrustLevel(score) {
    if (score >= 4.5) return { label: 'Excellent', color: '#22c55e', pct: 90 };
    if (score >= 4.0) return { label: 'Good', color: '#3b82f6', pct: 75 };
    if (score >= 3.0) return { label: 'Moderate', color: '#f59e0b', pct: 55 };
    return { label: 'Low', color: '#ef4444', pct: 30 };
}

// Determine open/closed status from hours string
function getOpenStatus(venue) {
    if (venue.is_24_hours || venue.hours === '24/7') return { open: true, label: 'Open 24/7', always: true };
    if (!venue.hours && !venue.hours_of_operation) return null; // Unknown
    // For now, if they have hours listed, show it generically
    return null;
}

// Get the correct detail URL for a venue or social page
function getVenueUrl(venue) {
    if (venue.is_social_page && venue.social_page_id) {
        return '/club/' + venue.social_page_id;
    }
    return '/hub/venues/' + venue.id;
}

export default function VenueCard({ venue, isFavorited, isNewcomer, hasPromo, onFavorite, onNavigate, checkinCount, index = 0 }) {
    if (!venue) return null;
    const trust = getTrustLevel(venue.trust_score || 0);
    const detailUrl = getVenueUrl(venue);
    const typeColor = VENUE_TYPE_COLORS[venue.venue_type] || VENUE_TYPE_COLORS.casino;
    const typeIcon = VENUE_TYPE_ICONS[venue.venue_type] || VENUE_TYPE_ICONS.casino;
    const openStatus = getOpenStatus(venue);
    const hasLiveData = venue.live_data && venue.live_data.tables_running > 0;

    // Animated trust bar + staggered card entrance
    const [mounted, setMounted] = useState(false);
    const cardRef = useRef(null);
    useEffect(() => {
        const delay = Math.min(index * 40, 400); // stagger up to 400ms
        const timer = setTimeout(() => setMounted(true), delay);
        return () => clearTimeout(timer);
    }, []);

    return (
        <div
            ref={cardRef}
            className="vc3-card"
            onClick={() => onNavigate && onNavigate(detailUrl)}
            style={{
                opacity: mounted ? 1 : 0,
                transform: mounted ? 'translateY(0)' : 'translateY(12px)',
                transition: `opacity 0.35s ease ${Math.min(index * 0.04, 0.4)}s, transform 0.35s ease ${Math.min(index * 0.04, 0.4)}s`,
                cursor: 'pointer',
            }}
        >
            {/* Top accent gradient line */}
            <div className="vc3-accent" style={{
                background: `linear-gradient(90deg, ${typeColor.accent}, ${typeColor.accent}55, transparent)`,
            }} />

            {/* === HEADER ZONE === */}
            <div className="vc3-header">
                {/* Left: Type badge */}
                <div className="vc3-type-badge" style={{
                    background: typeColor.bg,
                    borderColor: typeColor.border,
                    color: typeColor.color,
                }}>
                    {typeIcon}
                    <span>{VENUE_TYPE_LABELS[venue.venue_type] || venue.venue_type}</span>
                </div>

                {/* Right: Status indicators */}
                <div className="vc3-status-group">
                    {/* Open/Closed indicator */}
                    {openStatus && openStatus.open && (
                        <span className="vc3-open-pill">
                            <span className="vc3-open-dot" />
                            {openStatus.label}
                        </span>
                    )}
                    {/* Distance pill */}
                    {venue.distance_mi && (
                        <span className="vc3-distance">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <polygon points="3 11 22 2 13 21 11 13 3 11" />
                            </svg>
                            {typeof venue.distance_mi === 'number' ? venue.distance_mi.toFixed(1) : venue.distance_mi} mi
                        </span>
                    )}
                </div>
            </div>

            {/* Favorite Button */}
            <button
                className={'vc3-fav' + (isFavorited ? ' active' : '')}
                onClick={(e) => { e.stopPropagation(); onFavorite && onFavorite(e); }}
                title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill={isFavorited ? '#ef4444' : 'none'} stroke={isFavorited ? '#ef4444' : 'rgba(255,255,255,0.45)'} strokeWidth="2">
                    <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                </svg>
            </button>

            {/* === IDENTITY ZONE === */}
            <h4 className="vc3-name">{venue.name || 'Unknown Venue'}</h4>

            <p className="vc3-address">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, opacity: 0.5 }}>
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
                </svg>
                <span>{venue.address ? (venue.address + ' - ') : ''}{venue.city || ''}{venue.city && venue.state ? ', ' : ''}{venue.state || ''}</span>
            </p>

            {/* Home Game Host Info */}
            {venue.venue_type === 'home_game' && venue.host_display_name && (
                <div className="vc3-host">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#58a6ff" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    <span className="vc3-host-name">Hosted by {venue.host_display_name}</span>
                    {venue.host_username && (
                        <a href={'/hub/user/' + venue.host_username} onClick={e => e.stopPropagation()} className="vc3-host-link">Contact Host</a>
                    )}
                </div>
            )}
            {/* Home Game Description */}
            {venue.venue_type === 'home_game' && venue.description && (
                <p className="vc3-description">{venue.description}</p>
            )}

            {/* === BADGE ROW === */}
            <div className="vc3-badges">
                {venue.is_featured && <span className="vc3-badge vc3-badge-featured">Featured</span>}
                {isNewcomer && <span className="vc3-badge vc3-badge-newcomer">Newcomer Friendly</span>}
                {hasPromo && <span className="vc3-badge vc3-badge-promo">Active Promo</span>}
                {hasLiveData && (
                    <span className="vc3-badge vc3-badge-live">
                        <span className="vc3-live-dot" />
                        LIVE: {venue.live_data.tables_running} Table{venue.live_data.tables_running !== 1 ? 's' : ''}
                    </span>
                )}
                {venue.has_tournaments && <span className="vc3-badge vc3-badge-tourney">Tournaments</span>}
                {checkinCount > 0 && (
                    <span className="vc3-badge vc3-badge-checkin" onClick={e => { e.stopPropagation(); onNavigate && onNavigate(detailUrl + '#checkins'); }}>
                        {checkinCount} here today
                    </span>
                )}
            </div>

            {/* === DATA ZONE === */}
            <div className="vc3-data-zone">
                {/* Live Info Row — tables and waitlist */}
                {hasLiveData && (
                    <div className="vc3-live-info">
                        <div className="vc3-live-stat">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2">
                                <rect x="2" y="7" width="20" height="15" rx="2" ry="2" /><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" />
                            </svg>
                            <span className="vc3-live-stat-val">{venue.live_data.tables_running}</span>
                            <span className="vc3-live-stat-label">Tables</span>
                        </div>
                        {venue.live_data.players_waiting > 0 && (
                            <div className="vc3-live-stat">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
                                    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                                </svg>
                                <span className="vc3-live-stat-val">{venue.live_data.players_waiting}</span>
                                <span className="vc3-live-stat-label">Waiting</span>
                            </div>
                        )}
                    </div>
                )}

                {/* Hours */}
                {venue.hours && (
                    <p className="vc3-hours">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, opacity: 0.5 }}>
                            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                        </svg>
                        {venue.hours === '24/7' ? 'Open 24/7' : venue.hours}
                    </p>
                )}

                {/* Game Tags — color-coded */}
                {Array.isArray(venue.games_offered) && venue.games_offered.length > 0 && (
                    <div className="vc3-games">
                        {venue.games_offered.slice(0, 5).map((g, idx) => {
                            const chipStyle = getGameChipStyle(g);
                            return (
                                <span key={g || idx} className="vc3-game-chip" style={{
                                    background: chipStyle.bg || 'rgba(255,255,255,0.06)',
                                    color: chipStyle.color || 'rgba(255,255,255,0.65)',
                                    borderColor: chipStyle.border || 'rgba(255,255,255,0.1)',
                                }}>
                                    {g}
                                </span>
                            );
                        })}
                    </div>
                )}

                {/* Stakes */}
                {Array.isArray(venue.stakes_cash) && venue.stakes_cash.length > 0 && (
                    <div className="vc3-stakes">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#d4a853" strokeWidth="2" style={{ flexShrink: 0 }}>
                            <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
                        </svg>
                        <span>{venue.stakes_cash.slice(0, 3).join(' / ')}</span>
                    </div>
                )}
            </div>

            {/* === TRUST SCORE === */}
            <div className="vc3-trust">
                <div className="vc3-trust-header">
                    <span className="vc3-trust-label" style={{ color: trust.color }}>Trust: {trust.label}</span>
                    <span className="vc3-trust-val" style={{ color: trust.color }}>{venue.trust_score || '-'}/5</span>
                </div>
                <div className="vc3-trust-track">
                    <div className="vc3-trust-fill" style={{
                        width: mounted ? trust.pct + '%' : '0%',
                        background: `linear-gradient(90deg, ${trust.color}, ${trust.color}77)`,
                        boxShadow: `0 0 8px ${trust.color}33`,
                    }} />
                </div>
            </div>

            {/* === ACTION BAR === */}
            <div className="vc3-actions">
                {/* Secondary actions (Web/Call/Map) */}
                <div className="vc3-actions-secondary">
                    {venue.website && (
                        <a href={venue.website.startsWith('http') ? venue.website : 'https://' + venue.website}
                            target="_blank" rel="noopener noreferrer" className="vc3-icon-btn" onClick={e => e.stopPropagation()} title="Website">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
                            </svg>
                        </a>
                    )}
                    {venue.phone && (
                        <a href={'tel:' + venue.phone} className="vc3-icon-btn" onClick={e => e.stopPropagation()} title="Call">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
                            </svg>
                        </a>
                    )}
                    <a href={'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent((venue.address || '') + ' ' + (venue.name || '') + ' ' + (venue.city || '') + ' ' + (venue.state || ''))}
                        target="_blank" rel="noopener noreferrer" className="vc3-icon-btn" onClick={e => e.stopPropagation()} title="Directions">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polygon points="3 11 22 2 13 21 11 13 3 11" />
                        </svg>
                    </a>
                </div>

                {/* Primary actions */}
                <div className="vc3-actions-primary">
                    <button className="vc3-pill vc3-pill-checkin" onClick={e => { e.stopPropagation(); onNavigate && onNavigate(detailUrl + '?action=checkin'); }} title="Check In">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                        </svg>
                        <span>Check In</span>
                    </button>
                    <button className="vc3-pill vc3-pill-review" onClick={e => { e.stopPropagation(); onNavigate && onNavigate(detailUrl + '?action=review'); }} title="Review">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                        <span>Review</span>
                    </button>
                    <button className="vc3-pill vc3-pill-details" onClick={e => { e.stopPropagation(); onNavigate && onNavigate(detailUrl); }} title="Details">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polyline points="9 18 15 12 9 6" />
                        </svg>
                        <span>Details</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
