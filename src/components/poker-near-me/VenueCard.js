/**
 * VenueCard - Premium poker venue card for Poker Near Me page
 * v4.0 — Full UI Overhaul:
 * - Official venue logos with intelligent fallback chain
 * - Real-time Open/Closed status with time parsing
 * - Crowd meter visualization (Quiet → Packed)
 * - Waitlist time estimates
 * - Enhanced visual hierarchy
 */

import { useState, useEffect, useRef } from 'react';
import { getAccessToken } from '../../lib/authUtils';
import { getVenueLogoUrl, getVenueLogoFallback, getOpenStatus, getCrowdLevel, estimateWaitTime, getInitialsColor, isStaleData } from './pnm-utils';
import { openNativeMaps } from '../../utils/openNativeMaps';

const formatMoney = (amount) => {
    if (!amount) return '$0';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount);
};

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
    // Use actual ratio for bar fill (score/5 * 100)
    const pct = Math.round((score / 5) * 100);
    if (score >= 4.5) return { label: 'Excellent', color: '#22c55e', pct };
    if (score >= 4.0) return { label: 'Good', color: '#3b82f6', pct };
    if (score >= 3.0) return { label: 'Moderate', color: '#f59e0b', pct };
    return { label: 'Low', color: '#ef4444', pct };
}

// Generate venue initials for logo placeholder
function getVenueInitials(name) {
    if (!name) return '?';
    return name.split(/[\s\-]+/).filter(w => w.length > 0).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

// Deterministic color from venue ID using curated palette
function getVenueColor(venue) {
    return getInitialsColor(venue?.id || 0);
}

// Get the correct detail URL for a venue or social page
function getVenueUrl(venue) {
    if (venue.is_social_page && venue.social_page_id) {
        return '/club/' + venue.social_page_id;
    }
    return '/hub/venues/' + venue.id;
}

export default function VenueCard({ venue, isFavorited, isNewcomer, hasPromo, onFavorite, onNavigate, checkinCount, reviewStats, predictionData, index = 0 }) {
    if (!venue) return null;
    const trust = getTrustLevel(venue.trust_score || 0);
    const detailUrl = getVenueUrl(venue);
    const typeColor = VENUE_TYPE_COLORS[venue.venue_type] || VENUE_TYPE_COLORS.casino;
    const typeIcon = VENUE_TYPE_ICONS[venue.venue_type] || VENUE_TYPE_ICONS.casino;
    const openStatus = getOpenStatus(venue);
    const hasLiveData = venue.live_data && venue.live_data.tables_running > 0;
    const logoUrl = getVenueLogoUrl(venue);
    const crowd = getCrowdLevel(venue, checkinCount);
    const waitEstimate = hasLiveData && venue.live_data.players_waiting > 0
        ? estimateWaitTime(venue.live_data.players_waiting, venue.live_data.tables_running)
        : null;

    // Animated trust bar + staggered card entrance
    const [mounted, setMounted] = useState(false);
    const [logoError, setLogoError] = useState(false);
    const [logoFallbackTried, setLogoFallbackTried] = useState(false);
    const [isFollowing, setIsFollowing] = useState(false);
    const [followLoading, setFollowLoading] = useState(false);
    
    const handleFollowClick = async (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (followLoading || isFollowing) return;
        setFollowLoading(true);
        try {
            const token = getAccessToken();
            if (!token) {
                if (onNavigate) onNavigate('/auth/login');
                return;
            }
            const res = await fetch('/api/social/pages/follow', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ slug: venue.host_social_page_slug, action: 'follow' })
            });
            if (res.ok) setIsFollowing(true);
        } catch (err) {
            console.error('Follow error:', err);
        } finally {
            setFollowLoading(false);
        }
    };

    const cardRef = useRef(null);
    useEffect(() => {
        const delay = Math.min(index * 40, 400);
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
                borderColor: typeColor.accent,
            }}
        >

            {/* === HEADER ZONE === */}
            <div className="vc3-header">
                {/* Left: Logo + Name */}
                <div className="vc3-header-left">
                    {/* Venue Logo — 1.5x size */}
                    <div className="vc3-logo" style={!logoUrl || logoError ? { background: getVenueColor(venue).bg, border: `1px solid ${getVenueColor(venue).border}` } : {}}>
                        {logoUrl && !logoError ? (
                            <img
                                src={logoUrl}
                                alt=""
                                className="vc3-logo-img"
                                onError={(e) => {
                                    if (!logoFallbackTried) {
                                        const fallback = getVenueLogoFallback(venue);
                                        if (fallback) {
                                            setLogoFallbackTried(true);
                                            e.target.src = fallback;
                                            return;
                                        }
                                    }
                                    setLogoError(true);
                                }}
                                loading="lazy"
                            />
                        ) : (
                            <span className="vc3-logo-initials" style={{ color: getVenueColor(venue).text }}>{getVenueInitials(venue.name)}</span>
                        )}
                    </div>
                    {/* Name + Type — stacked beside logo */}
                    <div className="vc3-identity">
                        <h4 className="vc3-name">{venue.name || 'Unknown Venue'}</h4>
                        <span className="vc3-type-label" style={{ color: typeColor.color }}>
                            {VENUE_TYPE_LABELS[venue.venue_type] || venue.venue_type}
                        </span>
                    </div>
                </div>

                {/* Right: Heart + Distance + Hours stacked */}
                <div className="vc3-right-stack">
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
                    {/* Distance */}
                    {venue.distance_mi && (
                        <span className="vc3-distance">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <polygon points="3 11 22 2 13 21 11 13 3 11" />
                            </svg>
                            {typeof venue.distance_mi === 'number' ? venue.distance_mi.toFixed(1) : venue.distance_mi} mi
                        </span>
                    )}
                    {/* Hours */}
                    {(venue.hours || venue.hours_weekday) && (
                        <span className="vc3-hours-compact">
                            {(venue.hours === '24/7' || venue.hours_weekday === '24/7') && !['charity', 'home_game'].includes(venue.venue_type) ? '24/7' : (venue.hours_weekday || venue.hours)}
                        </span>
                    )}
                </div>
            </div>

            {/* === ADDRESS === */}
            <a
                className="vc3-address"
                href="#"
                onClick={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    openNativeMaps({ address: [venue.address, venue.city, venue.state].filter(Boolean).join(', '), mode: 'search' });
                }}
                title="Open In Maps"
            >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, opacity: 0.5 }}>
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
                </svg>
                <span>{venue.address ? (venue.address + ' - ') : ''}{venue.city || ''}{venue.city && venue.state ? ', ' : ''}{venue.state || ''}</span>
            </a>

            {/* Home Game Host Info — Avatar + Name + Profile Link */}
            {venue.venue_type === 'home_game' && venue.host_display_name && (
                <div className="vc3-host">
                    {venue.host_avatar_url ? (
                        <img src={venue.host_avatar_url} alt="" className="vc3-host-avatar" loading="lazy" />
                    ) : (
                        <div className="vc3-host-avatar vc3-host-avatar-fallback">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d4a853" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                        </div>
                    )}
                    <div className="vc3-host-info">
                        <span className="vc3-host-name">Hosted By {venue.host_display_name}</span>
                        {venue.host_username && (
                            <a href={'/hub/user/' + venue.host_username} onClick={e => e.stopPropagation()} className="vc3-host-profile-link">@{venue.host_username}</a>
                        )}
                    </div>
                    {venue.host_social_page_slug && (
                        <a href={'/social/@' + venue.host_social_page_slug} onClick={e => e.stopPropagation()} className="vc3-host-link">View Page</a>
                    )}
                </div>
            )}
            {/* Home Game Schedule */}
            {venue.venue_type === 'home_game' && venue.schedule && (
                <div className="vc3-schedule">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                    <span>{venue.schedule}</span>
                </div>
            )}
            {/* Home Game — Follow & Saves Row */}
            {venue.venue_type === 'home_game' && (venue.host_social_page_slug || venue.saves_count > 0) && (
                <div className="vc3-follow-row">
                    {venue.host_social_page_slug && (
                        <button
                            onClick={handleFollowClick}
                            disabled={followLoading}
                            className={`vc3-follow-btn ${isFollowing ? 'following' : ''}`}
                            style={isFollowing ? { background: '#10B981', color: '#fff', borderColor: '#10B981' } : {}}
                        >
                            {isFollowing ? (
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                            ) : (
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
                            )}
                            {followLoading ? 'Following...' : (isFollowing ? 'Followed' : 'Follow')}
                        </button>
                    )}
                    {venue.saves_count > 0 && (
                        <span className="vc3-saves-count">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="#ef4444" stroke="none"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" /></svg>
                            {venue.saves_count} Saved
                        </span>
                    )}
                </div>
            )}
            {/* Home Game Description */}
            {venue.venue_type === 'home_game' && venue.description && (
                <p className="vc3-description">{venue.description}</p>
            )}

            {/* === REVIEW RATING === */}
            {reviewStats && reviewStats.total_reviews > 0 && (
                <div className="vc3-rating-row" onClick={e => { e.stopPropagation(); onNavigate && onNavigate(detailUrl + '?action=review'); }}>
                    <div className="vc3-rating-stars">
                        {[1, 2, 3, 4, 5].map(star => (
                            <svg key={star} width="14" height="14" viewBox="0 0 24 24"
                                fill={star <= Math.round(Number(reviewStats.avg_rating) || 0) ? '#d4a853' : 'rgba(255,255,255,0.1)'}
                                stroke={star <= Math.round(Number(reviewStats.avg_rating) || 0) ? '#d4a853' : 'rgba(255,255,255,0.15)'}
                                strokeWidth="1">
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                            </svg>
                        ))}
                    </div>
                    <span className="vc3-rating-score">{(Number(reviewStats.avg_rating) || 0).toFixed(1)}</span>
                    <span className="vc3-rating-count">({reviewStats.total_reviews} Review{reviewStats.total_reviews !== 1 ? 's' : ''})</span>
                </div>
            )}

            {/* === QUICK TAGS (auto-generated intelligence) === */}
            <div className="vc3-badges">
                {venue.is_featured && <span className="vc3-badge vc3-badge-featured">Featured</span>}
                {hasPromo && <span className="vc3-badge vc3-badge-promo">Active Promo</span>}
                {hasLiveData && (
                    <span className="vc3-badge vc3-badge-live">
                        <span className="vc3-live-dot" />
                        LIVE NOW: {venue.live_data.tables_running} Table{venue.live_data.tables_running !== 1 ? 's' : ''}
                    </span>
                )}
                {venue.has_tournaments && <span className="vc3-badge vc3-badge-tourney">Tournaments</span>}
                {venue.max_gtd > 0 && (
                    <span className="vc3-badge vc3-badge-gtd" style={{ background: 'rgba(212,168,83,0.12)', borderColor: 'rgba(212,168,83,0.3)', color: '#d4a853' }}>
                        {formatMoney(venue.max_gtd)}+ GTD
                    </span>
                )}
                {(venue.hours === '24/7' || venue.hours_weekday === '24/7') && !['charity', 'home_game'].includes(venue.venue_type) && <span className="vc3-badge" style={{ background: 'rgba(34,197,94,0.12)', borderColor: 'rgba(34,197,94,0.3)', color: '#22c55e' }}>24/7</span>}
                {venue.total_tables > 20 && <span className="vc3-badge" style={{ background: 'rgba(212,168,83,0.12)', borderColor: 'rgba(212,168,83,0.3)', color: '#d4a853' }}>Large Room</span>}
                {checkinCount > 0 && (
                    <span className="vc3-badge vc3-badge-checkin" onClick={e => { e.stopPropagation(); onNavigate && onNavigate(detailUrl + '#checkins'); }}>
                        {checkinCount} Here Today
                    </span>
                )}
            </div>

            {/* === BEST TIME TO GO BADGE === */}
            {predictionData && predictionData.has_data && predictionData.data_points >= 30 && (
                <div className="vc3-bttg-badge" onClick={e => { e.stopPropagation(); onNavigate && onNavigate(detailUrl); }}>
                    <div className="vc3-bttg-row">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#00D4FF" strokeWidth="2.2" style={{ flexShrink: 0 }}>
                            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                        </svg>
                        {predictionData.best_time && (
                            <span className="vc3-bttg-peak">Best: {predictionData.best_time}</span>
                        )}
                        {predictionData.quiet_hours && (
                            <span className="vc3-bttg-quiet">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2.5" style={{ flexShrink: 0 }}>
                                    <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                                </svg>
                                Quiet: {predictionData.quiet_hours}
                            </span>
                        )}
                    </div>
                    {predictionData.game_eta && predictionData.game_eta.length > 0 && (
                        <div className="vc3-bttg-eta-row">
                            {predictionData.game_eta.slice(0, 1).map((eta, idx) => (
                                <span key={idx} className="vc3-bttg-eta-chip">
                                    <span className="vc3-bttg-eta-game">{eta.game}</span>
                                    {eta.label}
                                </span>
                            ))}
                        </div>
                    )}
                    {predictionData.day_scores && predictionData.day_scores.some(s => s > 0) && (
                        <div className="vc3-bttg-mini-bars">
                            {predictionData.day_scores.map((score, idx) => (
                                <div key={idx} className="vc3-bttg-mini-col">
                                    <div className="vc3-bttg-mini-track">
                                        <div className="vc3-bttg-mini-fill" style={{
                                            height: `${Math.max(score, 4)}%`,
                                            background: score >= 70 ? '#4ade80' : score >= 40 ? '#00D4FF' : 'rgba(255,255,255,0.2)',
                                        }} />
                                    </div>
                                    <span className="vc3-bttg-mini-day">{['S','M','T','W','T','F','S'][idx]}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* === CROWD METER === */}
            {(hasLiveData || checkinCount > 0) && (
                <div className="vc3-crowd-meter">
                    <div className="vc3-crowd-header">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={crowd.color} strokeWidth="2">
                            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
                        </svg>
                        <span className="vc3-crowd-label" style={{ color: crowd.color }}>{crowd.label}</span>
                        {waitEstimate && (
                            <span className="vc3-wait-estimate">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#d4a853" strokeWidth="2.5">
                                    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                                </svg>
                                Est. Wait: {waitEstimate.label}
                            </span>
                        )}
                    </div>
                    <div className="vc3-crowd-track">
                        <div className="vc3-crowd-fill" style={{
                            width: mounted ? `${crowd.score}%` : '0%',
                            background: `linear-gradient(90deg, ${crowd.color}cc, ${crowd.color}55)`,
                            boxShadow: `0 0 8px ${crowd.color}33`,
                        }} />
                    </div>
                </div>
            )}

            {/* === DATA ZONE === */}
            <div className="vc3-data-zone">
                {/* Live Info Row — tables and waitlist */}
                {hasLiveData && (
                    <div className="vc3-live-info-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
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
                        {venue.live_data.last_updated && (() => {
                            const staleInfo = isStaleData(venue.live_data.last_updated);
                            return (
                                <div style={{ fontSize: 10, color: staleInfo.stale ? 'rgba(245,158,11,0.8)' : 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                                    </svg>
                                    {staleInfo.stale ? `Stale Data (${staleInfo.age})` : `Updated ${staleInfo.age}`}
                                </div>
                            );
                        })()}
                    </div>
                )}

                {/* Hours */}
                {(venue.hours || venue.hours_weekday) && (
                    <p className="vc3-hours">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, opacity: 0.5 }}>
                            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                        </svg>
                        {(venue.hours === '24/7' || venue.hours_weekday === '24/7') && !['charity', 'home_game'].includes(venue.venue_type) ? 'Open 24/7' : (venue.hours_weekday || venue.hours)}
                        {openStatus && openStatus.nextChange && !openStatus.always && (
                            <span className="vc3-hours-next"> ({openStatus.nextChange})</span>
                        )}
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
                {(() => {
                    const hasStakes = Array.isArray(venue.stakes_cash) && venue.stakes_cash.length > 0;
                    const stakesDisplay = hasStakes
                        ? venue.stakes_cash.slice(0, 4).join(' ') + (venue.stakes_cash.length > 4 ? ' ETC' : '')
                        : '$1/$2 $2/$5';
                    return (
                        <div className="vc3-stakes" style={{ flexWrap: 'wrap' }}>
                            <span>
                                STAKES PLAYED {stakesDisplay}
                            </span>
                        </div>
                    );
                })()}

                {/* Tournaments Badge */}
                {venue.has_tournaments && (
                    <div className="vc3-tourneys" style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        background: 'linear-gradient(90deg, rgba(212,168,83,0.15), rgba(212,168,83,0.05))',
                        border: '1px solid rgba(212,168,83,0.3)',
                        borderRadius: '6px',
                        padding: '4px 8px',
                        fontSize: '11px',
                        color: '#d4a853',
                        fontWeight: '600',
                        marginTop: '2px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.4px',
                        width: 'fit-content',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                    }}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ flexShrink: 0 }}>
                            <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                            <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                            <path d="M4 22h16" />
                            <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
                            <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
                            <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
                        </svg>
                        Daily Tournaments
                    </div>
                )}
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
                    <button className="vc3-icon-btn" onClick={e => {
                            e.stopPropagation();
                            e.preventDefault();
                            openNativeMaps({ address: [venue.address, venue.name, venue.city, venue.state].filter(Boolean).join(' '), lat: parseFloat(venue.latitude), lng: parseFloat(venue.longitude), mode: 'directions' });
                        }} title="Directions">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polygon points="3 11 22 2 13 21 11 13 3 11" />
                        </svg>
                    </button>
                </div>

                {/* Primary actions */}
                <div className="vc3-actions-primary">
                    <button className="vc3-pill vc3-pill-checkin" onClick={e => { e.stopPropagation(); onNavigate && onNavigate(detailUrl + '?action=checkin'); }} title="Check In">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                        </svg>
                        <span>Check In</span>
                    </button>
                    {/* Message Host button for home games replaces Review */}
                    {venue.venue_type === 'home_game' && venue.host_id ? (
                        <button className="vc3-pill vc3-pill-message" onClick={e => { e.stopPropagation(); onNavigate && onNavigate('/hub/messenger?to=' + venue.host_id + '&game=' + venue.id + '&gameName=' + encodeURIComponent(venue.name || '')); }} title="Message Host">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                            </svg>
                            <span>Message Host</span>
                        </button>
                    ) : (
                        <button className="vc3-pill vc3-pill-review" onClick={e => { e.stopPropagation(); onNavigate && onNavigate(detailUrl + '?action=review'); }} title="Review">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                            </svg>
                            <span>Review</span>
                        </button>
                    )}
                    <button className="vc3-pill vc3-pill-details" onClick={e => { e.stopPropagation(); onNavigate && onNavigate(detailUrl); }} title="Details">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polyline points="9 18 15 12 9 6" />
                        </svg>
                        <span>Details</span>
                    </button>
                </div>
            </div>

            {/* === TRUST SCORE / PLAYER RATING === */}
            <div className="vc3-trust" style={{ marginTop: '0px' }}>
                {reviewStats && reviewStats.total_reviews > 0 ? (
                    <>
                        <div className="vc3-trust-header">
                            <span className="vc3-trust-label" style={{ color: reviewStats.avg_rating >= 4 ? '#22c55e' : reviewStats.avg_rating >= 3 ? '#d4a853' : '#f59e0b' }}>Player Rating</span>
                            <span className="vc3-trust-val" style={{ color: reviewStats.avg_rating >= 4 ? '#22c55e' : reviewStats.avg_rating >= 3 ? '#d4a853' : '#f59e0b' }}>
                                {(Number(reviewStats.avg_rating) || 0).toFixed(1)}/5 ({reviewStats.total_reviews})
                            </span>
                        </div>
                        <div className="vc3-trust-track">
                            <div className="vc3-trust-fill" style={{
                                width: mounted ? Math.round((Number(reviewStats.avg_rating) / 5) * 100) + '%' : '0%',
                                background: `linear-gradient(90deg, ${reviewStats.avg_rating >= 4 ? '#22c55e' : reviewStats.avg_rating >= 3 ? '#d4a853' : '#f59e0b'}, ${reviewStats.avg_rating >= 4 ? '#22c55e77' : reviewStats.avg_rating >= 3 ? '#d4a85377' : '#f59e0b77'})`,
                                boxShadow: `0 0 8px ${reviewStats.avg_rating >= 4 ? '#22c55e33' : reviewStats.avg_rating >= 3 ? '#d4a85333' : '#f59e0b33'}`,
                            }} />
                        </div>
                    </>
                ) : (
                    <>
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
                    </>
                )}
            </div>

            <style jsx>{`
                .vc3-header-left { display: flex; align-items: flex-start; gap: 10px; flex: 1; min-width: 0; }
                .vc3-identity { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
                .vc3-identity .vc3-name { font-size: 16px; font-weight: 700; color: #fff; margin: 0; padding: 0; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
                .vc3-type-label { font-size: 12px; font-weight: 500; letter-spacing: 0.2px; }
                .vc3-logo { width: 54px; height: 54px; border-radius: 10px; overflow: hidden; flex-shrink: 0; display: flex; align-items: center; justify-content: center; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.9); }
                .vc3-logo-img { width: 100%; height: 100%; object-fit: contain; padding: 4px; }
                .vc3-logo-initials { font-size: 16px; font-weight: 700; letter-spacing: 0.5px; }
                .vc3-right-stack { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; flex-shrink: 0; min-width: 60px; }
                .vc3-fav { position: relative; background: none; border: none; padding: 4px; cursor: pointer; transition: transform 0.2s; align-self: flex-end; }
                .vc3-fav:hover { transform: scale(1.15); }
                .vc3-fav.active svg { filter: drop-shadow(0 0 6px rgba(239,68,68,0.5)); }
                .vc3-distance { display: inline-flex; align-items: center; justify-content: flex-end; gap: 3px; font-size: 11px; color: rgba(255,255,255,0.5); font-weight: 500; white-space: nowrap; width: 100%; }
                .vc3-hours-compact { font-size: 11px; color: rgba(255,255,255,0.4); font-weight: 500; white-space: nowrap; display: block; text-align: right; width: 100%; }
                .vc3-open-pill.closed { background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.3); color: #ef4444; }
                .vc3-open-dot.closed { background: #ef4444; animation: none; }
                .vc3-hours-next { color: rgba(255,255,255,0.3); font-size: 11px; }
                .vc3-crowd-meter { margin: 8px 0; padding: 8px 10px; background: rgba(0,0,0,0.15); border-radius: 8px; border: 1px solid rgba(255,255,255,0.04); }
                .vc3-crowd-header { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
                .vc3-crowd-label { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; }
                .vc3-wait-estimate { margin-left: auto; font-size: 11px; color: #d4a853; display: flex; align-items: center; gap: 4px; font-weight: 600; }
                .vc3-crowd-track { height: 4px; background: rgba(255,255,255,0.06); border-radius: 2px; overflow: hidden; }
                .vc3-crowd-fill { height: 100%; border-radius: 2px; transition: width 0.8s ease-out 0.3s; }
                .vc3-rating-row { display: flex; align-items: center; gap: 6px; margin: 4px 0 2px; padding: 0 2px; cursor: pointer; transition: opacity 0.2s; }
                .vc3-rating-row:hover { opacity: 0.85; }
                .vc3-rating-stars { display: flex; gap: 1px; }
                .vc3-rating-score { font-size: 13px; font-weight: 700; color: #d4a853; }
                .vc3-rating-count { font-size: 11px; color: rgba(255,255,255,0.4); }

                @keyframes livePulse { 0% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(1.1); } 100% { opacity: 1; transform: scale(1); } }
                
                .vc3-host { display: flex; align-items: center; gap: 8px; margin: 6px 0; padding: 8px 10px; background: rgba(212,168,83,0.06); border: 1px solid rgba(212,168,83,0.15); border-radius: 8px; }
                .vc3-host-avatar { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; flex-shrink: 0; border: 1.5px solid rgba(212,168,83,0.4); }
                .vc3-host-avatar-fallback { display: flex; align-items: center; justify-content: center; background: rgba(212,168,83,0.12); }
                .vc3-host-info { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
                .vc3-host-name { font-size: 12px; color: #d4a853; font-weight: 600; }
                .vc3-host-profile-link { font-size: 11px; color: rgba(212,168,83,0.7); text-decoration: none; }
                .vc3-host-profile-link:hover { color: #d4a853; text-decoration: underline; }
                .vc3-host-link { font-size: 10px; color: #d4a853; text-decoration: none; margin-left: auto; padding: 3px 8px; border: 1px solid rgba(212,168,83,0.3); border-radius: 6px; font-weight: 600; white-space: nowrap; letter-spacing: 0.3px; text-transform: uppercase; }
                .vc3-host-link:hover { background: rgba(212,168,83,0.15); }
                .vc3-schedule { display: flex; align-items: center; gap: 6px; font-size: 12px; color: rgba(139,92,246,0.85); font-weight: 600; margin: 4px 0 6px; }
                .vc3-follow-row { display: flex; align-items: center; gap: 8px; margin: 4px 0 8px; }
                .vc3-follow-btn { display: inline-flex; align-items: center; gap: 4px; padding: 4px 12px; border-radius: 6px; font-size: 11px; font-weight: 700; color: #C4B5FD; background: rgba(139,92,246,0.12); border: 1px solid rgba(139,92,246,0.3); text-decoration: none; text-transform: uppercase; letter-spacing: 0.3px; transition: all 0.2s; }
                .vc3-follow-btn:hover { background: rgba(139,92,246,0.25); box-shadow: 0 0 10px rgba(139,92,246,0.2); }
                .vc3-saves-count { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: rgba(255,255,255,0.5); font-weight: 500; }
                .vc3-description { font-size: 13px; color: rgba(255,255,255,0.5); margin: 0 0 8px; font-style: italic; }
                .vc3-pill-message { background: rgba(139,92,246,0.12); color: #a78bfa; border-color: rgba(139,92,246,0.25); }
                .vc3-pill-message:hover { background: rgba(139,92,246,0.22); box-shadow: 0 0 12px rgba(139,92,246,0.15); }
                .vc3-badges { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
                .vc3-badge { padding: 3px 9px; border-radius: 5px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; }
                .vc3-badge-featured { background: rgba(212,168,83,0.2); color: #d4a853; border: 1px solid rgba(212,168,83,0.35); }
                .vc3-badge-newcomer { background: rgba(34,197,94,0.15); color: #4ade80; border: 1px solid rgba(34,197,94,0.3); }
                .vc3-badge-promo { background: rgba(139,92,246,0.15); color: #a78bfa; border: 1px solid rgba(139,92,246,0.3); }
                .vc3-badge-tourney { background: rgba(239,68,68,0.12); color: #f87171; border: 1px solid rgba(239,68,68,0.25); }
                .vc3-badge-live {
                    background: rgba(34,197,94,0.15); color: #4ade80; border: 1px solid rgba(34,197,94,0.35);
                    box-shadow: 0 0 12px rgba(34,197,94,0.2);
                    display: inline-flex; align-items: center; gap: 5px; cursor: pointer; transition: all 0.2s;
                }
                .vc3-badge-live:hover { background: rgba(34,197,94,0.25); box-shadow: 0 0 16px rgba(34,197,94,0.4); }
                .vc3-live-dot {
                    width: 6px; height: 6px; border-radius: 50%; background: #4ade80;
                    box-shadow: 0 0 8px #4ade80; animation: livePulse 1.5s ease-in-out infinite;
                }
                .vc3-badge-checkin { background: rgba(230,81,0,0.15); color: #E65100; border: 1px solid rgba(230,81,0,0.3); cursor: pointer; }
                .vc3-badge-checkin:hover { background: rgba(230,81,0,0.25); }
                .vc3-data-zone { margin-top: 4px; }
                .vc3-live-info {
                    display: flex; gap: 16px; margin-bottom: 8px; padding: 8px 10px;
                    background: rgba(0,0,0,0.15); border-radius: 8px; border: 1px solid rgba(255,255,255,0.04);
                }
                .vc3-live-stat { display: flex; align-items: center; gap: 6px; }
                .vc3-live-stat-val { font-size: 16px; font-weight: 800; color: #fff; }
                .vc3-live-stat-label { font-size: 11px; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.3px; }
                .vc3-hours { display: flex; align-items: center; gap: 5px; font-size: 12.5px; color: rgba(255,255,255,0.55); margin: 0 0 6px; font-style: italic; }
                .vc3-games { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
                .vc3-game-chip { padding: 4px 10px; border-radius: 5px; font-size: 11.5px; font-weight: 600; border: 1px solid; }
                .vc3-stakes { display: flex; align-items: center; gap: 5px; font-size: 13px; color: rgba(212,168,83,0.9); margin: 0 0 8px; font-weight: 600; }
                .vc3-trust { padding: 10px 0 8px; border-top: 1px solid rgba(255,255,255,0.07); margin-top: 4px; }
                .vc3-trust-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
                .vc3-trust-label { font-size: 11.5px; font-weight: 700; }
                .vc3-trust-val { font-size: 11.5px; font-weight: 800; }
                .vc3-trust-track { height: 6px; background: rgba(255,255,255,0.08); border-radius: 3px; overflow: hidden; }
                .vc3-trust-fill { height: 100%; border-radius: 3px; transition: width 0.8s cubic-bezier(0.4, 0, 0.2, 1); }
                .vc3-actions { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.07); margin-top: 6px; }
                .vc3-actions-secondary { display: flex; gap: 6px; }
                .vc3-icon-btn { display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.6); cursor: pointer; transition: all 0.2s; }
                .vc3-icon-btn:hover { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.25); color: #fff; transform: translateY(-1px); box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
                .vc3-actions-primary { display: flex; gap: 6px; flex: 1; justify-content: flex-end; }
                .vc3-pill { display: inline-flex; align-items: center; gap: 4px; padding: 7px 12px; border-radius: 10px; font-size: 12px; font-weight: 700; cursor: pointer; border: 1px solid transparent; transition: all 0.2s; background: none; }
                .vc3-pill-checkin { background: rgba(34,197,94,0.12); color: #4ade80; border-color: rgba(34,197,94,0.25); }
                .vc3-pill-checkin:hover { background: rgba(34,197,94,0.22); box-shadow: 0 0 12px rgba(34,197,94,0.15); }
                .vc3-pill-review { background: rgba(59,130,246,0.12); color: #60a5fa; border-color: rgba(59,130,246,0.25); }
                .vc3-pill-review:hover { background: rgba(59,130,246,0.22); box-shadow: 0 0 12px rgba(59,130,246,0.15); }
                .vc3-pill-details { background: rgba(212,168,83,0.12); color: #d4a853; border-color: rgba(212,168,83,0.25); }
                .vc3-pill-details:hover { background: rgba(212,168,83,0.22); box-shadow: 0 0 12px rgba(212,168,83,0.15); }
                /* === Best Time to Go Badge === */
                .vc3-bttg-badge {
                    margin: 6px 0 8px; padding: 8px 10px; border-radius: 10px;
                    background: linear-gradient(135deg, rgba(0,212,255,0.06), rgba(0,212,255,0.02));
                    border: 1px solid rgba(0,212,255,0.15);
                    cursor: pointer; transition: all 0.2s;
                }
                .vc3-bttg-badge:hover { border-color: rgba(0,212,255,0.3); background: rgba(0,212,255,0.08); }
                .vc3-bttg-row {
                    display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
                }
                .vc3-bttg-peak {
                    font-size: 12px; font-weight: 700; color: #4ade80;
                    display: inline-flex; align-items: center; gap: 3px;
                }
                .vc3-bttg-quiet {
                    font-size: 11px; font-weight: 600; color: #60a5fa;
                    display: inline-flex; align-items: center; gap: 3px;
                    padding-left: 4px; border-left: 1px solid rgba(255,255,255,0.1);
                }
                .vc3-bttg-eta-row {
                    margin-top: 4px; display: flex; gap: 4px; flex-wrap: wrap;
                }
                .vc3-bttg-eta-chip {
                    font-size: 11px; color: rgba(255,255,255,0.6); display: inline-flex;
                    align-items: center; gap: 4px;
                }
                .vc3-bttg-eta-game {
                    padding: 1px 6px; border-radius: 4px; font-weight: 700; font-size: 10px;
                    background: rgba(139,92,246,0.15); color: #a78bfa;
                    border: 1px solid rgba(139,92,246,0.25);
                }
                .vc3-bttg-mini-bars {
                    display: flex; gap: 3px; align-items: flex-end; height: 24px;
                    margin-top: 6px; padding-top: 4px;
                    border-top: 1px solid rgba(255,255,255,0.05);
                }
                .vc3-bttg-mini-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 1px; }
                .vc3-bttg-mini-track {
                    width: 100%; height: 18px; border-radius: 2px;
                    background: rgba(255,255,255,0.04); display: flex;
                    align-items: flex-end; overflow: hidden;
                }
                .vc3-bttg-mini-fill {
                    width: 100%; border-radius: 2px 2px 0 0;
                    transition: height 0.5s ease-out; min-height: 1px;
                }
                .vc3-bttg-mini-day {
                    font-size: 8px; color: rgba(255,255,255,0.3); font-weight: 600; line-height: 1;
                }

                @media (max-width: 480px) {
                    .vc3-actions { flex-direction: column; gap: 8px; }
                    .vc3-actions-secondary { width: 100%; justify-content: flex-start; }
                    .vc3-actions-primary { width: 100%; justify-content: stretch; }
                    .vc3-pill { flex: 1; justify-content: center; }
                    .vc3-name { font-size: 15px; }
                    .vc3-header { flex-wrap: nowrap; gap: 6px; }
                    .vc3-right-stack { gap: 2px; }
                }
            `}</style>
        </div>
    );
}
