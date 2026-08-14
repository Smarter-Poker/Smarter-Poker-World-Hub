/**
 * VenueCard - Premium poker venue card for Poker Near Me page
 * v4.0 — Full UI Overhaul:
 * - Official venue logos with intelligent fallback chain
 * - Real-time Open/Closed status with time parsing
 * - Crowd meter visualization (Quiet → Packed)
 * - Waitlist time estimates
 * - Enhanced visual hierarchy
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { getAccessToken, getAuthUser } from '../../lib/authUtils';
import { getVenueLogoUrl, getVenueLogoFallback, getOpenStatus, getCrowdLevel, estimateWaitTime, getInitialsColor, isStaleData, getZonedNow, resolveVenueTimeZone } from './pnm-utils';
import { openNativeMaps } from '../../utils/openNativeMaps';
import { homeGameUrl } from '../../lib/home-games/urls';

const formatMoney = (amount) => {
    if (!amount) return '$0';
    const num = typeof amount === 'string' ? Number(amount.replace(/[^0-9.]/g, '')) : amount;
    if (isNaN(num)) return amount; // Fallback to raw string if completely unparseable
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num);
};

// Formats "13:00:00" or "1:00 PM" → "1:00 PM"
const formatTime = (t) => {
    if (!t) return null;
    const str = String(t);
    // Already 12h format
    if (/am|pm/i.test(str)) return str.trim();
    // 24h HH:MM[:SS]
    const m = str.match(/^(\d{1,2}):(\d{2})/);
    if (!m) return str;
    let h = parseInt(m[1], 10);
    const min = m[2];
    const period = h >= 12 ? 'PM' : 'AM';
    if (h === 0) h = 12;
    else if (h > 12) h -= 12;
    return `${h}:${min} ${period}`;
};

function safeHref(url) {
    if (!url) return '';
    const cleanUrl = String(url).replace(/[\x00-\x20]/g, '');
    const lower = cleanUrl.toLowerCase();
    if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('vbscript:')) return '#';
    return cleanUrl;
}

const VENUE_TYPE_LABELS = {
    casino: 'Casino',
    card_room: 'Poker Club',
    poker_club: 'Poker Club',
    home_game: 'Home Game',
    charity: 'Charity',
    series: 'Poker Series',
    tour: 'Poker Tour',
    tour_stop: 'Poker Tour',
    poker_tour: 'Poker Tour',
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
    casino: { bg: 'rgba(255,255,255,0.10)', color: '#ffffff', border: 'rgba(255,255,255,0.28)', accent: '#ffffff' },
    card_room: { bg: 'rgba(34,197,94,0.10)', color: '#4ade80', border: 'rgba(34,197,94,0.28)', accent: '#4ade80' },
    poker_club: { bg: 'rgba(34,197,94,0.10)', color: '#4ade80', border: 'rgba(34,197,94,0.28)', accent: '#4ade80' },
    home_game: { bg: 'rgba(148,163,184,0.10)', color: '#94a3b8', border: 'rgba(148,163,184,0.28)', accent: '#94a3b8' },
    charity: { bg: 'rgba(59,130,246,0.10)', color: '#60a5fa', border: 'rgba(59,130,246,0.28)', accent: '#60a5fa' },
    tour: { bg: 'rgba(239,68,68,0.10)', color: '#f87171', border: 'rgba(239,68,68,0.28)', accent: '#ef4444' },
    tour_stop: { bg: 'rgba(239,68,68,0.10)', color: '#f87171', border: 'rgba(239,68,68,0.28)', accent: '#ef4444' },
    poker_tour: { bg: 'rgba(239,68,68,0.10)', color: '#f87171', border: 'rgba(239,68,68,0.28)', accent: '#ef4444' },
    series: { bg: 'rgba(6,182,212,0.10)', color: '#06b6d4', border: 'rgba(6,182,212,0.28)', accent: '#06b6d4' },
};

// Game type color mapping for enhanced chips
const GAME_TYPE_COLORS = {
    'NLH': { bg: 'rgba(255,255,255,0.12)', color: '#ffffff', border: 'rgba(255,255,255,0.22)' },
    'PLO': { bg: 'rgba(59,130,246,0.12)', color: '#60a5fa', border: 'rgba(59,130,246,0.22)' },
    'Limit': { bg: 'rgba(59,130,246,0.12)', color: '#60a5fa', border: 'rgba(59,130,246,0.22)' },
    'Mixed': { bg: 'rgba(6,182,212,0.12)', color: '#22d3ee', border: 'rgba(6,182,212,0.22)' },
    'Stud': { bg: 'rgba(239,68,68,0.12)', color: '#f87171', border: 'rgba(239,68,68,0.22)' },
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
    // A score of 0 means "no rating yet" — treat as New, not Low
    if (!score || score <= 0) return { label: 'New', color: '#64748b', pct: 0 };
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
    // audit 2026-08-14: home games go through the ONE shared URL builder.
    // This function used to skip the club_code tier that its own container
    // (PodHomeGames) used, so the card body and the card's buttons navigated
    // to DIFFERENT pages for the same slug-less group.
    if (venue.venue_type === 'home_game') {
        return homeGameUrl(venue);
    }
    if (venue.is_social_page && venue.social_page_id) {
        return '/club/' + venue.social_page_id;
    }
    return '/hub/venues/' + venue.id;
}

// Pre-computed charity event display block
function buildCharityEventBlock(venue) {
    if (venue.venue_type !== 'charity') return null;

    if (venue.is_today) {
        const te = venue.today_event || {};
        const timeStr = formatTime(te.start_time);
        const addr = [te.location || venue.city, te.state || venue.state].filter(Boolean).join(', ');
        return (
            <div className="vc3-charity-event vc3-charity-today">
                <div className="vc3-charity-event-label">
                    Event Today
                </div>
                <div className="vc3-charity-date-big">Today</div>
                {addr ? <div className="vc3-charity-addr">{addr}</div> : null}
                {timeStr || (te.buy_in != null && !isNaN(Number(te.buy_in)) && Number(te.buy_in) > 0) ? (
                    <div className="vc3-charity-meta">
                        {timeStr}
                        {te.buy_in != null && !isNaN(Number(te.buy_in)) && Number(te.buy_in) > 0 ? <><span className="vc3-charity-sep">·</span>${te.buy_in} Buy-In</> : null}
                    </div>
                ) : null}
            </div>
        );
    }

    if (venue.next_event) {
        const ne = venue.next_event;
        const daysAway = ne.days_away;
        let nextDate = null;
        if (daysAway != null) {
            const d = new Date();
            d.setDate(d.getDate() + daysAway);
            nextDate = d;
        }
        const dayLabel = ne.day ? (ne.day.charAt(0).toUpperCase() + ne.day.slice(1)) : '';
        const dateLabel = nextDate
            ? nextDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
            : null;
        const isTomorrow = daysAway === 1;
        const timeStr = formatTime(ne.start_time);
        const addr = [ne.location || venue.city, ne.state || venue.state].filter(Boolean).join(', ');
        return (
            <div className="vc3-charity-event">
                <div className="vc3-charity-event-label">
                    {isTomorrow ? 'Tomorrow' : 'Next Event'}
                </div>
                <div className="vc3-charity-date-big">
                    {isTomorrow ? 'Tomorrow' : (dateLabel || dayLabel)}
                </div>
                {addr ? <div className="vc3-charity-addr">{addr}</div> : null}
                {/* Prominent date badge under location */}
                {dateLabel && !isTomorrow ? (
                    <div className="vc3-charity-date-badge">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0 }}>
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                        </svg>
                        {dateLabel}
                    </div>
                ) : null}
                {timeStr || (ne.buy_in != null && !isNaN(Number(ne.buy_in)) && Number(ne.buy_in) > 0) ? (
                    <div className="vc3-charity-meta">
                        {timeStr}
                        {ne.buy_in != null && !isNaN(Number(ne.buy_in)) && Number(ne.buy_in) > 0 ? <><span className="vc3-charity-sep">·</span>${ne.buy_in} Buy-In</> : null}
                    </div>
                ) : null}
            </div>
        );
    }

    return null;
}


const VC3_STYLE_ID = 'vc3-venue-card-styles';
// Module-scope so all cards share ONE copy; injected into <head> once on first mount.
const VC3_CARD_STYLES = `
                .vc3-header-left { display: flex; align-items: flex-start; gap: 10px; flex: 1; min-width: 0; }
                .vc3-identity { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
                .vc3-identity .vc3-name { font-size: 16px; font-weight: 700; color: #fff; margin: 0; padding: 0; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-transform: capitalize; }
                .vc3-type-label { font-size: 12px; font-weight: 500; letter-spacing: 0.2px; }
                .vc3-city-type-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin: 1px 0; }
                .vc3-city-state { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: rgba(255,255,255,0.7); text-decoration: none; text-transform: capitalize; }
                .vc3-city-state:hover { color: #ffffff; }
                .vc3-next-event-header { display: flex; align-items: center; gap: 6px; margin-top: 3px; flex-wrap: wrap; }
                .vc3-next-event-label { font-size: 12px; font-weight: 800; color: #60a5fa; text-transform: uppercase; letter-spacing: 0.5px; }
                .vc3-next-event-detail { font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.7); }
                .vc3-next-event-today .vc3-next-event-label { color: #4ade80; }
                .vc3-logo { width: 54px; height: 54px; border-radius: 10px; overflow: hidden; flex-shrink: 0; display: flex; align-items: center; justify-content: center; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.9); }
                .vc3-logo-img { width: 100%; height: 100%; object-fit: cover; }
                .vc3-logo-initials { font-size: 16px; font-weight: 700; letter-spacing: 0.5px; }
                .vc3-right-stack { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; flex-shrink: 0; min-width: 60px; }
                .vc3-fav { position: relative; background: none; border: none; padding: 4px; cursor: pointer; transition: transform 0.2s; }
                .vc3-fav:hover { transform: scale(1.15); }
                .vc3-fav.active svg { filter: drop-shadow(0 0 6px rgba(239,68,68,0.5)); }
                .vc3-distance { display: inline-flex; align-items: center; gap: 3px; font-size: 11px; color: rgba(255,255,255,0.5); font-weight: 500; white-space: nowrap; }
                .vc3-hours-compact { font-size: 11px; color: rgba(255,255,255,0.4); font-weight: 500; white-space: nowrap; display: block; text-align: right; width: 100%; }
                .vc3-open-pill { display: inline-flex; align-items: center; gap: 5px; padding: 2px 8px; border-radius: 6px; background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.3); color: #4ade80; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; white-space: nowrap; }
                .vc3-open-dot { width: 6px; height: 6px; border-radius: 50%; background: #4ade80; flex-shrink: 0; animation: livePulse 1.5s ease-in-out infinite; }
                .vc3-open-pill.closed { background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.3); color: #ef4444; }
                .vc3-open-dot.closed { background: #ef4444; animation: none; }
                .vc3-hours-next { color: rgba(255,255,255,0.3); font-size: 11px; }
                .vc3-crowd-meter { margin: 8px 0; padding: 8px 10px; background: rgba(0,0,0,0.15); border-radius: 8px; border: 1px solid rgba(255,255,255,0.04); }
                .vc3-crowd-header { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
                .vc3-crowd-label { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; }
                .vc3-wait-estimate { margin-left: auto; font-size: 13px; color: #ffffff; display: flex; align-items: center; gap: 4px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
                .vc3-crowd-track { height: 4px; background: rgba(255,255,255,0.06); border-radius: 2px; overflow: hidden; }
                .vc3-crowd-fill { height: 100%; border-radius: 2px; transition: width 0.8s ease-out 0.3s; }
                .vc3-rating-row { display: flex; align-items: center; gap: 6px; margin: 4px 0 2px; padding: 0 2px; cursor: pointer; transition: opacity 0.2s; }
                .vc3-rating-row:hover { opacity: 0.85; }
                .vc3-rating-stars { display: flex; gap: 1px; }
                .vc3-rating-score { font-size: 13px; font-weight: 700; color: #ffffff; }
                .vc3-rating-count { font-size: 11px; color: rgba(255,255,255,0.4); }

                @keyframes livePulse { 0% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(1.1); } 100% { opacity: 1; transform: scale(1); } }
                
                .vc3-host { display: flex; align-items: center; gap: 8px; margin: 6px 0; padding: 8px 10px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; }
                .vc3-host-avatar { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; flex-shrink: 0; border: 1.5px solid rgba(255,255,255,0.4); }
                .vc3-host-avatar-fallback { display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.12); }
                .vc3-host-info { display: flex; flex-direction: column; gap: 1px; flex: 1; min-width: 0; }
                .vc3-host-name { font-size: 12px; color: #ffffff; font-weight: 600; }
                .vc3-host-profile-link { font-size: 11px; color: rgba(255,255,255,0.7); text-decoration: none; }
                .vc3-host-profile-link:hover { color: #ffffff; text-decoration: underline; }
                .vc3-host-link { font-size: 10px; color: #ffffff; text-decoration: none; margin-left: auto; padding: 3px 8px; border: 1px solid rgba(255,255,255,0.3); border-radius: 6px; font-weight: 600; white-space: nowrap; letter-spacing: 0.3px; text-transform: uppercase; }
                .vc3-host-link:hover { background: rgba(255,255,255,0.15); }
                .vc3-schedule { display: flex; align-items: center; gap: 6px; font-size: 12px; color: rgba(255,255,255,0.85); font-weight: 600; margin: 4px 0 6px; }
                .vc3-follow-row { display: flex; align-items: center; gap: 8px; margin: 4px 0 8px; }
                .vc3-saves-count { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: rgba(255,255,255,0.5); font-weight: 500; }
                .vc3-description { font-size: 13px; color: rgba(255,255,255,0.5); margin: 0 0 8px; font-style: italic; }
                .vc3-pill-message { background: rgba(255,255,255,0.12); color: #ffffff; border-color: rgba(255,255,255,0.25); }
                .vc3-pill-message:hover { background: rgba(255,255,255,0.22); box-shadow: 0 0 12px rgba(255,255,255,0.15); }
                .vc3-badges { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
                .vc3-badge { padding: 3px 9px; border-radius: 5px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; }
                .vc3-badge-featured { background: rgba(255,255,255,0.2); color: #ffffff; border: 1px solid rgba(255,255,255,0.35); }
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
                .vc3-data-zone { margin-top: 2px; flex: 1; display: flex; flex-direction: column; min-height: 0; }
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
                .vc3-stakes { display: flex; align-items: center; gap: 5px; font-size: 13px; color: rgba(255,255,255,0.9); margin: 0 0 8px; font-weight: 600; }
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
                .vc3-pill-schedule { background: rgba(59,130,246,0.12); color: #60a5fa; border-color: rgba(59,130,246,0.25); }
                .vc3-pill-schedule:hover { background: rgba(59,130,246,0.22); box-shadow: 0 0 12px rgba(59,130,246,0.15); }
                .vc3-pill-details { background: rgba(255,255,255,0.12); color: #ffffff; border-color: rgba(255,255,255,0.25); }
                .vc3-pill-details:hover { background: rgba(255,255,255,0.22); box-shadow: 0 0 12px rgba(255,255,255,0.15); }

                /* ── Tournament Calendar Button ─────────────────────────── */
                .vc3-calendar-btn {
                    display: inline-flex; align-items: center; gap: 5px;
                    background: linear-gradient(90deg, rgba(74,222,128,0.12), rgba(74,222,128,0.06));
                    border: 1px solid rgba(74,222,128,0.3);
                    border-radius: 6px; padding: 5px 10px;
                    font-size: 11px; color: #4ade80; font-weight: 700;
                    cursor: pointer; text-transform: uppercase; letter-spacing: 0.4px;
                    margin-top: 2px; transition: all 0.2s; width: fit-content;
                    box-shadow: 0 2px 6px rgba(74,222,128,0.08);
                }
                .vc3-calendar-btn:hover {
                    background: linear-gradient(90deg, rgba(74,222,128,0.22), rgba(74,222,128,0.12));
                    box-shadow: 0 0 14px rgba(74,222,128,0.2);
                    border-color: rgba(74,222,128,0.5);
                }
                .vc3-calendar-btn.active {
                    background: rgba(74,222,128,0.18);
                    border-color: rgba(74,222,128,0.5);
                    box-shadow: 0 0 16px rgba(74,222,128,0.25);
                }                /* ── Two Column Redesign ─────────────────────────── */
                .vc3-columns-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 12px;
                    margin-top: 2px;
                    background: rgba(0,0,0,0.15);
                    border: 1px solid rgba(255,255,255,0.04);
                    border-radius: 8px;
                    padding: 10px;
                    position: relative;
                    flex: 1;
                    min-height: 140px;
                }
                .vc3-columns-grid::after {
                    content: '';
                    position: absolute;
                    top: 10%;
                    bottom: 10%;
                    left: 50%;
                    width: 1px;
                    background: rgba(255,255,255,0.08);
                }
                .vc3-col {
                    display: flex;
                    flex-direction: column;
                    min-width: 0;
                    height: 100%;
                }
                .vc3-col-left { padding-right: 4px; }
                /* More badge — click-to-expand tournament count pill */
                .vc3-more-badge {
                    display: inline-flex; align-items: center; justify-content: center;
                    margin-top: 5px; padding: 3px 10px; border-radius: 5px;
                    background: rgba(96,165,250,0.12); border: 1px solid rgba(96,165,250,0.28);
                    color: #60a5fa; font-size: 10px; font-weight: 700;
                    text-transform: uppercase; letter-spacing: 0.4px;
                    cursor: pointer; transition: all 0.2s; width: fit-content;
                }
                .vc3-more-badge:hover { background: rgba(96,165,250,0.22); box-shadow: 0 0 10px rgba(96,165,250,0.2); }
                /* Blind levels display in tournament row */
                .vc3-tourney-blinds {
                    font-size: 9px; color: rgba(255,255,255,0.35); margin-top: 1px;
                    font-style: italic;
                }
                .vc3-col-right { padding-left: 4px; }
                .vc3-col-title {
                    font-size: 13px;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    color: rgba(255,255,255,0.6);
                    margin-bottom: 6px;
                    padding-bottom: 4px;
                    border-bottom: 1px dashed rgba(255,255,255,0.1);
                }
                .vc3-list-scrollable {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                    overflow-y: auto;
                    padding-right: 4px;
                    flex: 1;
                }
                /* Cash games: show 4 rows (~28px each) before scrolling */
                .vc3-list-scrollable-games { max-height: 112px; }
                /* Tournaments: show 3 rows (~40px each — 2-line items) before scrolling */
                .vc3-list-scrollable-tourneys { max-height: 180px; }
                .vc3-list-scrollable::-webkit-scrollbar { width: 3px; }
                .vc3-list-scrollable::-webkit-scrollbar-track { background: transparent; }
                .vc3-list-scrollable::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 3px; }
                
                .vc3-list-item {
                    font-size: 13px;
                    color: #ffffff;
                    display: flex;
                    align-items: center;
                    background: rgba(255,255,255,0.03);
                    padding: 4px 6px;
                    border-radius: 4px;
                    border: 1px solid rgba(255,255,255,0.02);
                }
                .vc3-game-item { justify-content: space-between; }
                .vc3-game-name { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 4px; text-transform: capitalize; }
                .vc3-game-tables { font-weight: 700; color: #4ade80; font-size: 11px; flex-shrink: 0; letter-spacing: 0.2px; text-transform: uppercase; }
                
                .vc3-stakes-list { display: flex; flex-direction: column; gap: 4px; align-items: center; }
                .vc3-stake-item { color: rgba(255,255,255,0.85); font-weight: 600; padding: 4px 8px; border-radius: 4px; background: rgba(255,255,255,0.04); justify-content: center; text-align: center; width: 100%; }
                
                .vc3-tourney-item, .vc3-tourney-item-special {
                    flex-direction: column;
                    align-items: flex-start;
                    gap: 2px;
                }
                .vc3-tourney-item-special { background: rgba(59,130,246,0.1); border: 1px solid rgba(59,130,246,0.2); }
                .vc3-tourney-name {
                    font-weight: 700;
                    font-size: 12px;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    width: 100%;
                    color: #ffffff;
                    margin-bottom: 2px;
                    text-transform: capitalize;
                }
                .vc3-tourney-details {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 6px;
                    align-items: center;
                    width: 100%;
                }
                .vc3-tourney-time {
                    font-size: 13px;
                    font-weight: 700;
                    color: #ffffff;
                }
                .vc3-tourney-buyin {
                    font-size: 13px;
                    font-weight: 700;
                    color: #4ade80;
                }
                .vc3-tourney-gtd {
                    font-size: 11px;
                    font-weight: 700;
                    color: #fbbf24;
                }
                .vc3-tourney-stack {
                    font-size: 11px;
                    font-weight: 600;
                    color: rgba(255,255,255,0.5);
                    margin-top: 1px;
                }
                .vc3-tourney-meta {
                    font-size: 11px;
                    color: rgba(255,255,255,0.5);
                    display: flex;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    width: 100%;
                    font-weight: 500;
                }
                
                .vc3-empty-state {
                    font-size: 11px;
                    color: rgba(255,255,255,0.3);
                    font-style: italic;
                    padding: 10px 0;
                    text-align: center;
                    flex: 1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .vc3-col-footer {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-top: auto;
                    padding-top: 8px;
                    border-top: 1px dashed rgba(255,255,255,0.1);
                }
                .vc3-hours-small {
                    font-size: 10px;
                    color: rgba(255,255,255,0.4);
                    font-weight: 500;
                    white-space: nowrap;
                }
                
                @media (max-width: 480px) {
                    .vc3-columns-grid {
                        grid-template-columns: 1fr;
                        gap: 16px;
                    }
                    .vc3-columns-grid::after {
                        top: 50%; left: 10%; right: 10%;
                        width: auto; height: 1px;
                    }
                    .vc3-col-left { padding-right: 0; padding-bottom: 8px; }
                    .vc3-col-right { padding-left: 0; padding-top: 8px; }
                }


                /* ── Charity Event Big Date Block ──────────────────────── */
                .vc3-charity-event {
                    margin: 2px 0 8px;
                    padding: 10px 12px 10px;
                    background: linear-gradient(135deg, rgba(59,130,246,0.10), rgba(139,92,246,0.06));
                    border: 1px solid rgba(59,130,246,0.28);
                    border-radius: 10px;
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }
                .vc3-charity-today {
                    background: linear-gradient(135deg, rgba(34,197,94,0.12), rgba(16,185,129,0.07));
                    border-color: rgba(34,197,94,0.35);
                    box-shadow: 0 0 16px rgba(34,197,94,0.12);
                }
                .vc3-charity-event-label {
                    display: flex;
                    align-items: center;
                    gap: 5px;
                    font-size: 10px;
                    font-weight: 800;
                    text-transform: uppercase;
                    letter-spacing: 0.8px;
                    color: rgba(255,255,255,0.45);
                }
                .vc3-charity-today .vc3-charity-event-label { color: #4ade80; }
                .vc3-charity-dot {
                    width: 7px; height: 7px; border-radius: 50%;
                    background: #4ade80;
                    box-shadow: 0 0 8px #4ade80;
                    animation: livePulse 1.5s ease-in-out infinite;
                    flex-shrink: 0;
                }
                .vc3-charity-date-big {
                    font-size: 22px;
                    font-weight: 800;
                    color: #ffffff;
                    letter-spacing: -0.3px;
                    line-height: 1.1;
                    display: flex;
                    align-items: baseline;
                    gap: 8px;
                    flex-wrap: wrap;
                }
                .vc3-charity-today .vc3-charity-date-big { color: #4ade80; }
                .vc3-charity-date-cal {
                    font-size: 13px;
                    font-weight: 600;
                    color: rgba(255,255,255,0.55);
                    background: rgba(255,255,255,0.08);
                    border: 1px solid rgba(255,255,255,0.12);
                    border-radius: 5px;
                    padding: 2px 7px;
                    white-space: nowrap;
                }
                .vc3-charity-addr {
                    font-size: 12px;
                    color: rgba(255,255,255,0.6);
                    font-weight: 500;
                    margin-top: 1px;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                }
                .vc3-charity-addr::before {
                    content: '';
                    display: inline-block;
                    width: 3px; height: 3px;
                    border-radius: 50%;
                    background: rgba(255,255,255,0.3);
                    flex-shrink: 0;
                }
                .vc3-charity-meta {
                    display: flex;
                    align-items: center;
                    gap: 5px;
                    font-size: 13px;
                    font-weight: 700;
                    color: rgba(255,255,255,0.85);
                    margin-top: 2px;
                }
                .vc3-charity-sep { color: rgba(255,255,255,0.3); margin: 0 1px; }
                .vc3-charity-date-badge {
                    display: inline-flex; align-items: center; gap: 5px;
                    margin-top: 4px;
                    background: rgba(59,130,246,0.15);
                    border: 1px solid rgba(59,130,246,0.35);
                    border-radius: 6px;
                    padding: 3px 8px;
                    font-size: 11px; font-weight: 700;
                    color: #60a5fa;
                    letter-spacing: 0.2px;
                    align-self: flex-start;
                }
                .vc3-tourney-item-upcoming { background: rgba(59,130,246,0.06); border-color: rgba(59,130,246,0.15); }
                .vc3-tourney-location {
                    display: flex; align-items: center; gap: 4px;
                    font-size: 10px; color: rgba(255,255,255,0.45);
                    margin-top: 2px; font-weight: 500;
                    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%;
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
                .vc3-checkin-backdrop { position: fixed; inset: 0; background: rgba(5,8,16,0.75); backdrop-filter: blur(6px); z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 20px; animation: vc3-fade-in 0.15s ease; }
                @keyframes vc3-fade-in { from { opacity: 0; } to { opacity: 1; } }
                .vc3-checkin-modal { background: linear-gradient(180deg,#1a2744 0%,#0d1626 100%); border: 1px solid rgba(34,211,238,0.2); border-radius: 14px; padding: 20px; width: 100%; max-width: 420px; color: #fff; box-shadow: 0 20px 60px rgba(0,0,0,0.6); }
                .vc3-checkin-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; font-size: 15px; font-weight: 700; color: #22d3ee; }
                .vc3-checkin-close { background: transparent; border: none; color: #64748b; font-size: 24px; cursor: pointer; line-height: 1; padding: 0; }
                .vc3-checkin-close:hover { color: #fff; }
                .vc3-checkin-textarea { width: 100%; box-sizing: border-box; background: rgba(0,0,0,0.3); border: 1px solid rgba(34,211,238,0.2); border-radius: 8px; color: #fff; font-size: 14px; font-family: inherit; padding: 10px 12px; resize: vertical; min-height: 80px; line-height: 1.5; }
                .vc3-checkin-textarea:focus { outline: none; border-color: rgba(34,211,238,0.5); }
                .vc3-checkin-actions { display: flex; align-items: center; gap: 8px; margin-top: 12px; }
                .vc3-checkin-count { font-size: 11px; color: rgba(255,255,255,0.35); margin-right: auto; }
                .vc3-checkin-cancel { background: transparent; border: 1px solid rgba(255,255,255,0.15); color: rgba(255,255,255,0.6); border-radius: 8px; padding: 8px 14px; font-size: 13px; font-weight: 600; cursor: pointer; }
                .vc3-checkin-submit { background: linear-gradient(135deg,#0ea5e9,#0284c7); border: none; color: #fff; border-radius: 8px; padding: 8px 16px; font-size: 13px; font-weight: 700; cursor: pointer; }
                .vc3-checkin-submit:disabled { opacity: 0.5; cursor: not-allowed; }
                .vc3-checkin-done { text-align: center; padding: 20px; font-size: 18px; font-weight: 700; color: #22d3ee; }
                .vc3-checkin-error { margin: 8px 0 0; padding: 8px 10px; border-radius: 8px; background: rgba(248,81,73,0.1); border: 1px solid rgba(248,81,73,0.3); color: #f85149; font-size: 12px; font-weight: 600; }
`;

export default function VenueCard({ venue, isFavorited, isNewcomer, hasPromo, onFavorite, onNavigate, checkinCount, reviewStats, index = 0 }) {
    // === ALL HOOKS MUST BE UNCONDITIONAL — before any early return ===
    // Animated trust bar + staggered card entrance
    const [mounted, setMounted] = useState(false);
    const [logoError, setLogoError] = useState(false);
    const [logoFallbackTried, setLogoFallbackTried] = useState(false);
    const [checkinModal, setCheckinModal] = useState(false);
    const [checkinMsg, setCheckinMsg] = useState('');
    const [checkinBusy, setCheckinBusy] = useState(false);
    const [checkinDone, setCheckinDone] = useState(false);
    const [checkinError, setCheckinError] = useState('');
    const cardRef = useRef(null);

    // STUB REMOVED: this effect used to GET /api/social/pages/follow with a bearer token
    // on mount for every home-game card, and an eventBus subscription kept `isFollowing`
    // in sync — but `isFollowing` was never read in the render and `handleFollowClick`
    // was never referenced from any JSX (the Follow button lives on the Details page,
    // see the comment further down). A list of N home games therefore fired N requests
    // whose result could never be displayed. State, handler, fetch and the orphan
    // .vc3-follow-btn CSS are all gone.

    useEffect(() => {
        const delay = Math.min(index * 40, 400);
        const timer = setTimeout(() => setMounted(true), delay);
        return () => clearTimeout(timer);
    }, [index]);

    // PERFORMANCE FIX: the card's 440-line <style> block used to live inside the
    // returned JSX, so a grid of 50-200 cards inserted 50-200 identical <style>
    // elements — several hundred KB of duplicated CSS to parse and re-match on every
    // card mount/unmount. Inject it into <head> exactly once instead.
    useEffect(() => {
        if (typeof document === 'undefined') return;
        if (document.getElementById(VC3_STYLE_ID)) return;
        const el = document.createElement('style');
        el.id = VC3_STYLE_ID;
        el.textContent = VC3_CARD_STYLES;
        document.head.appendChild(el);
    }, []);

    // A11Y: the check-in modal had no dialog role, no Escape handler and no focus
    // management, so keyboard and screen-reader users tabbed straight past it.
    const checkinModalRef = useRef(null);
    const checkinOpenerRef = useRef(null);
    useEffect(() => {
        if (!checkinModal) return undefined;
        if (typeof document === 'undefined') return undefined;
        checkinOpenerRef.current = document.activeElement;
        if (checkinModalRef.current) {
            try { checkinModalRef.current.focus(); } catch { /* focus not supported */ }
        }
        const onKeyDown = (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                setCheckinModal(false);
                return;
            }
            // A11Y FIX: trap Tab inside the panel. The modal is portalled to document.body
            // and appended after the page content, so without this Tab walked straight out
            // of Cancel/Post into the venue grid behind the backdrop.
            if (e.key !== 'Tab') return;
            const root = checkinModalRef.current;
            if (!root) return;
            const focusables = root.querySelectorAll(
                'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
            );
            if (focusables.length === 0) return;
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', onKeyDown, true);
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', onKeyDown, true);
            document.body.style.overflow = prevOverflow;
            const opener = checkinOpenerRef.current;
            if (opener && typeof opener.focus === 'function') {
                try { opener.focus(); } catch { /* element gone */ }
            }
        };
    }, [checkinModal]);

    // Memoize wait estimate BEFORE the guard (React hooks must be unconditional)
    const hasLiveData = venue && venue.live_data && venue.live_data.tables_running > 0;
    // BUG FIX: the meter renders when `hasLiveData || checkinCount > 0`, but the level was
    // only computed when hasLiveData was true — so a venue with no live table data and N
    // users checked in showed a hardcoded "Empty" / 0% bar, discarding the only signal
    // available. getCrowdLevel already null-guards venue.live_data.
    const crowd = (hasLiveData || checkinCount > 0)
        ? getCrowdLevel(venue, checkinCount)
        : { label: 'Empty', score: 0, color: '#64748b' };
    const staleInfo = hasLiveData && venue.live_data.last_updated ? isStaleData(venue.live_data.last_updated) : { stale: false, age: '' };
    // BUG FIX: the wait estimate used to be fabricated — `minW + (hash(venue.id) % range)`
    // with the bracket chosen only by the crowd label. It ignored live_data.players_waiting
    // entirely, so users saw an authoritative-looking "Est. Wait: 27 Min" that had no
    // relationship to the actual waitlist. Derive it from the real waitlist via
    // estimateWaitTime() (already imported) and render nothing when there is no waitlist.
    const playersWaiting = Number(venue?.live_data?.players_waiting) || 0;
    const tablesRunning = Number(venue?.live_data?.tables_running) || 0;
    const waitEstimate = useMemo(() => {
        if (!hasLiveData || staleInfo.stale) return null;
        if (playersWaiting <= 0) return null;
        const est = estimateWaitTime(playersWaiting, tablesRunning || 1);
        if (!est || !est.minutes) return null;
        return est;
    }, [hasLiveData, staleInfo.stale, playersWaiting, tablesRunning]);

    // Guard — AFTER all hooks
    if (!venue) return null;

    const trust = getTrustLevel(venue.trust_score || 0);
    const detailUrl = getVenueUrl(venue);
    const typeColor = VENUE_TYPE_COLORS[venue.venue_type] || VENUE_TYPE_COLORS.casino;
    const typeIcon = VENUE_TYPE_ICONS[venue.venue_type] || VENUE_TYPE_ICONS.casino;
    const openStatus = getOpenStatus(venue);
    const logoUrl = getVenueLogoUrl(venue);

    const handleCheckinOpen = (e) => {
        e.stopPropagation();
        setCheckinError('');
        const defaultMsg = `Checked in at ${venue.name}${venue.city ? ` in ${venue.city}` : ''}`;
        setCheckinMsg(defaultMsg);
        setCheckinDone(false);
        setCheckinModal(true);
    };

    const handleCheckinSubmit = async () => {
        if (checkinBusy || !checkinMsg.trim()) return;
        setCheckinBusy(true);
        setCheckinError('');
        try {
            const token = getAccessToken();
            if (!token) { if (onNavigate) onNavigate('/auth/login'); return; }

            // GAP FIX: this used to POST ONLY to /api/social/create-post, which writes a
            // social post and nothing else. It never touched `venue_checkins` — the table
            // that backs the "{n} Here Today" badge, the crowd meter, /checkins/streak,
            // /checkins/whos-here and SocialLayer's friends feed. Users tapped Check In,
            // saw "Checked in!", and nothing anywhere changed.
            //
            // POST /api/poker/checkins inserts the check-in AND auto-creates the social
            // post itself, so calling it is sufficient — no double post.
            // It requires venue_id to be a positive integer (poker_venues.id is a bigint),
            // so non-venue cards (home games / charity / social pages carry string ids)
            // keep the social-post-only path rather than sending a request that 400s.
            // /api/poker/checkins requires user_name (it is rendered in the check-in feed).
            const authUser = getAuthUser();
            const userDisplayName =
                authUser?.user_metadata?.display_name
                || authUser?.user_metadata?.full_name
                || authUser?.user_metadata?.username
                || (authUser?.email ? String(authUser.email).split('@')[0] : null)
                || 'Player';

            const venueIdInt = parseInt(venue.id, 10);
            const isRealVenueId = !isNaN(venueIdInt) && venueIdInt > 0 && String(venueIdInt) === String(venue.id).trim();

            const res = isRealVenueId
                ? await fetch('/api/poker/checkins', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({
                        venue_id: venueIdInt,
                        user_name: userDisplayName,
                        message: checkinMsg.trim(),
                    }),
                })
                : await fetch('/api/social/create-post', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                    body: JSON.stringify({
                        content: checkinMsg.trim(),
                        content_type: 'text',
                        visibility: 'public',
                        metadata: {
                            post_type: 'checkin',
                            venue_id: venue.id,
                            venue_name: venue.name,
                            venue_type: venue.venue_type,
                        },
                    }),
                });

            // Surface the route's own 429 ("already checked in within the last 4 hours")
            // instead of a bare status code.
            if (res.status === 429) {
                let msg = 'You already checked in here within the last 4 hours.';
                try {
                    const body = await res.json();
                    if (body?.error) msg = String(body.error);
                } catch (parseErr) { /* non-JSON error body */ }
                setCheckinError(msg);
                return;
            }
            // BUG FIX: the response was never inspected, so a 401/404/500 still showed
            // "Checked in!" and closed the modal — the check-in was silently dropped.
            if (!res.ok) {
                let msg = `Check-in failed (${res.status})`;
                try {
                    const body = await res.json();
                    if (body?.error) msg = String(body.error);
                } catch (parseErr) { /* non-JSON error body */ }
                setCheckinError(msg);
                return;
            }
            setCheckinDone(true);
            setTimeout(() => setCheckinModal(false), 1500);
        } catch (err) {
            console.warn('Checkin error:', err);
            setCheckinError('Could not reach the server. Please try again.');
        }
        finally { setCheckinBusy(false); }
    };

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
                        {/* City/State row — for charity venues, show EVENT location, not home location */}
                        {(() => {
                            const isCharity = venue.venue_type === 'charity';
                            // Resolve event location for charities
                            let displayCity = venue.city || '';
                            let displayState = venue.state || '';
                            let mapsAddress = [venue.address, venue.city, venue.state].filter(Boolean).join(', ');

                            if (isCharity && venue.is_today && venue.today_event) {
                                const te = venue.today_event;
                                // today_event.location could be "City, State" or just "City"
                                const locParts = (te.location || '').split(',').map(s => s.trim());
                                displayCity = locParts[0] || venue.city || '';
                                displayState = te.state || locParts[1] || venue.state || '';
                                mapsAddress = [te.location, te.state].filter(Boolean).join(', ');
                            } else if (isCharity && !venue.is_today && venue.next_event) {
                                const ne = venue.next_event;
                                const locParts = (ne.location || '').split(',').map(s => s.trim());
                                displayCity = locParts[0] || venue.city || '';
                                displayState = ne.state || locParts[1] || venue.state || '';
                                mapsAddress = [ne.location, ne.state].filter(Boolean).join(', ');
                            }

                            return (
                                <div className="vc3-city-type-row">
                                    <a
                                        href="#"
                                        onClick={e => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            openNativeMaps({ address: mapsAddress, mode: 'search' });
                                        }}
                                        className="vc3-city-state"
                                        title="Open In Maps"
                                    >
                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, opacity: 0.7 }}>
                                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
                                        </svg>
                                        <span>{displayCity}{displayCity && displayState ? ', ' : ''}{displayState}</span>
                                    </a>
                                    <span className="vc3-type-label" style={{ color: typeColor.color }}>
                                        {VENUE_TYPE_LABELS[venue.venue_type] || venue.venue_type}
                                    </span>
                                </div>
                            );
                        })()}
                        {/* Bold NEXT EVENT line for charity venues below city/state */}
                        {venue.venue_type === 'charity' && !venue.is_today && venue.next_event && (() => {
                            const ne = venue.next_event;
                            const daysAway = ne.days_away;
                            let dateStr = ne.day ? (ne.day.charAt(0).toUpperCase() + ne.day.slice(1)) : 'Upcoming';
                            if (daysAway === 1) {
                                dateStr = 'Tomorrow';
                            } else if (daysAway != null) {
                                const d = new Date();
                                d.setDate(d.getDate() + daysAway);
                                dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                            }
                            return (
                                <div className="vc3-next-event-header">
                                    <span className="vc3-next-event-label">NEXT EVENT: {dateStr}</span>
                                </div>
                            );
                        })()}
                        {/* Bold TODAY label for charity venues running today */}
                        {venue.venue_type === 'charity' && venue.is_today && (
                            <div className="vc3-next-event-header vc3-next-event-today">
                                <span className="vc3-next-event-label">EVENT TODAY</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right: Heart, Distance below, then Hours */}
                <div className="vc3-right-stack">
                    {/* Heart button */}
                    <button
                        className={'vc3-fav' + (isFavorited ? ' active' : '')}
                        onClick={(e) => { e.stopPropagation(); onFavorite && onFavorite(e); }}
                        title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
                    >
                        <svg width="21" height="21" viewBox="0 0 24 24" fill={isFavorited ? '#ef4444' : 'none'} stroke={isFavorited ? '#ef4444' : 'rgba(255,255,255,0.45)'} strokeWidth="2">
                            <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                        </svg>
                    </button>
                    {/* Distance pill below heart */}
                    {venue.distance_mi != null && (
                        <span className="vc3-distance">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <polygon points="3 11 22 2 13 21 11 13 3 11" />
                            </svg>
                            {typeof venue.distance_mi === 'number' ? venue.distance_mi.toFixed(1) : venue.distance_mi} mi
                        </span>
                    )}
                    {/* GAP FIX: getOpenStatus(venue) was computed on every render but its
                        result only ever reached the left column's empty state, so the
                        timezone-aware Open/Closed badge the .vc3-open-pill / .vc3-open-dot /
                        .vc3-hours-next rules were written for never rendered — the card
                        advertised "Real-time Open/Closed status" and showed a raw hours
                        string instead. Rendered here, and suppressed entirely when the
                        status is null or `unknown` (the deliberate NULL-timezone case). */}
                    {openStatus && !openStatus.unknown && openStatus.label && (
                        <span className={'vc3-open-pill' + (openStatus.open ? '' : ' closed')}>
                            <span className={'vc3-open-dot' + (openStatus.open ? '' : ' closed')} />
                            {openStatus.label}
                        </span>
                    )}
                    {openStatus && !openStatus.unknown && openStatus.nextChange && (
                        <span className="vc3-hours-next">{openStatus.nextChange}</span>
                    )}
                    {/* Hours below */}
                    {(() => {
                        const is247 = (venue.hours === '24/7' || venue.hours_weekday === '24/7');
                        const isCharityOrHome = ['charity', 'home_game'].includes(venue.venue_type);
                        const effective247 = is247 && !isCharityOrHome;

                        if (effective247 || !(venue.hours || venue.hours_weekday || venue.hours_weekend)) return null;

                        // BUG FIX: this always printed hours_weekday || hours, so the posted
                        // weekend string was never shown — not even on Saturday or Sunday.
                        // Pick from the same zoned day getOpenStatus resolves; fall back to
                        // the previous order when the venue timezone is unknown.
                        const zonedNow = getZonedNow(resolveVenueTimeZone(venue));
                        const isWeekend = zonedNow ? (zonedNow.dayOfWeek === 0 || zonedNow.dayOfWeek === 6) : false;
                        const hoursText = isWeekend
                            ? (venue.hours_weekend || venue.hours_weekday || venue.hours)
                            : (venue.hours_weekday || venue.hours || venue.hours_weekend);
                        if (!hoursText) return null;

                        return (
                            <span className="vc3-hours-compact">
                                {hoursText}
                            </span>
                        );
                    })()}
                </div>
            </div>

            {/* Address removed from here, now in header */}

            {/* Home Game Host Info — Avatar + Name + Profile Link */}
            {venue.venue_type === 'home_game' && venue.host_display_name && (
                <div className="vc3-host">
                    {venue.host_avatar_url ? (
                        <img src={venue.host_avatar_url} alt="" className="vc3-host-avatar" loading="lazy" />
                    ) : (
                        <div className="vc3-host-avatar vc3-host-avatar-fallback">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                        </div>
                    )}
                    <div className="vc3-host-info">
                        <span className="vc3-host-name">Hosted By {venue.host_display_name}</span>
                        {venue.host_username && (
                            <a href={'/hub/user/' + encodeURIComponent(venue.host_username)} onClick={e => e.stopPropagation()} className="vc3-host-profile-link">@{venue.host_username}</a>
                        )}
                    </div>
                    {venue.host_social_page_slug && (
                        <a href={venue.social_page_id ? '/club/' + venue.social_page_id : getVenueUrl(venue)} onClick={e => e.stopPropagation()} className="vc3-host-link">View Page</a>
                    )}
                </div>
            )}
            {/* Home Game Schedule */}
            {venue.venue_type === 'home_game' && venue.schedule && (
                <div className="vc3-schedule">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                    <span>{venue.schedule}</span>
                </div>
            )}
            {/* Home Game — Saves count only (Follow button is on the Details page) */}
            {venue.venue_type === 'home_game' && venue.saves_count > 0 && (
                <div className="vc3-follow-row">
                    <span className="vc3-saves-count">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="#ef4444" stroke="none"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" /></svg>
                        {venue.saves_count} Saved
                    </span>
                </div>
            )}

            {/* === REVIEW RATING === */}
            {reviewStats && reviewStats.total_reviews > 0 && (
                <div className="vc3-rating-row" onClick={e => { e.stopPropagation(); onNavigate && onNavigate(detailUrl + '?action=review'); }}>
                    <div className="vc3-rating-stars">
                        {[1, 2, 3, 4, 5].map(star => (
                            <svg key={star} width="14" height="14" viewBox="0 0 24 24"
                                fill={star <= Math.round(Number(reviewStats.avg_rating) || 0) ? '#ffffff' : 'rgba(255,255,255,0.1)'}
                                stroke={star <= Math.round(Number(reviewStats.avg_rating) || 0) ? '#ffffff' : 'rgba(255,255,255,0.15)'}
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
                {isNewcomer && <span className="vc3-badge vc3-badge-new" style={{color:'#fff', background:'#6366f1', borderColor:'#4f46e5'}}>New Addition</span>}
                {hasLiveData && (
                    <span className="vc3-badge vc3-badge-live">
                        <span className="vc3-live-dot" />
                        LIVE NOW: {venue.live_data.tables_running} Table{Number(venue.live_data.tables_running) !== 1 ? 's' : ''}
                    </span>
                )}
                {venue.has_tournaments && <></>}
                {venue.max_gtd > 0 && (
                    <span className="vc3-badge vc3-badge-gtd" style={{ background: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.3)', color: '#ffffff' }}>
                        {formatMoney(venue.max_gtd)}+ GTD
                    </span>
                )}

                {/* SCHEMA FIX: `total_tables` is not a poker_venues column (it is `poker_tables`),
                    so this badge could never render. */}
                {(venue.poker_tables ?? venue.total_tables) > 20 && <span className="vc3-badge" style={{ background: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.3)', color: '#ffffff' }}>Large Room</span>}
                {checkinCount > 0 && (
                    <span className="vc3-badge vc3-badge-checkin" onClick={e => { e.stopPropagation(); onNavigate && onNavigate(detailUrl + '#checkins'); }}>
                        {checkinCount} Here Today
                    </span>
                )}
            </div>

            {/* Best Time To Go data lives on the venue detail page only */}

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
                {/* --- TWO COLUMN LAYOUT --- */}
                <div className="vc3-columns-grid">
                    {/* LEFT COLUMN: Cash Games */}
                    <div className="vc3-col vc3-col-left">
                        {hasLiveData ? (
                            <>
                                <div className="vc3-col-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span>Cash Games</span>
                                    {venue.live_data.tables_running > 0 && (
                                        <span style={{ color: '#4ade80', fontSize: '10px', backgroundColor: 'rgba(74,222,128,0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                                            {venue.live_data.tables_running} TABLES
                                        </span>
                                    )}
                                </div>
                                {Array.isArray(venue.live_data.games) && venue.live_data.games.length > 0 ? (
                                    <div className="vc3-list-scrollable vc3-list-scrollable-games" style={{ maxHeight: '160px' }}>
                                        {venue.live_data.games.map((g, idx) => {
                                            const gameName = g?.game || 'Unknown Game';
                                            const buyin = g?.buyin ? ` · ${g.buyin}` : '';
                                            const displayName = `${gameName}${buyin}`;
                                            return (
                                                <div key={`live-game-${gameName.replace(/\\s+/g,'-')}-${buyin.replace(/\\s+/g,'-')}-${idx}`} className="vc3-list-item vc3-game-item">
                                                    <span className="vc3-game-name" title={displayName}>{displayName.length > 28 ? displayName.substring(0, 25) + '...' : displayName}</span>
                                                    <span className="vc3-game-tables">
                                                        {g?.tables_running > 0 ? `${g.tables_running} ${Number(g.tables_running) === 1 ? 'Table' : 'Tables'}` : 'WAIT'}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="vc3-live-info-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>
                                        <div className="vc3-live-info" style={{ marginBottom: 0, padding: '4px 8px' }}>
                                            <div className="vc3-live-stat">
                                                <span className="vc3-live-stat-val">{venue.live_data.tables_running}</span>
                                                <span className="vc3-live-stat-label">Tables</span>
                                            </div>
                                            {venue.live_data.players_waiting > 0 && (
                                                <div className="vc3-live-stat">
                                                    <span className="vc3-live-stat-val">{venue.live_data.players_waiting}</span>
                                                    <span className="vc3-live-stat-label">Wait</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                                
                                {venue.live_data.last_updated && (
                                    <div style={{ fontSize: 9, color: staleInfo.stale ? 'rgba(245,158,11,0.8)' : 'rgba(255,255,255,0.3)', display: 'flex', alignItems: 'center', gap: 3, marginTop: 4 }}>
                                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                                        </svg>
                                        {staleInfo.stale ? `Stale Data` : `Updated ${staleInfo.age}`}
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                {Array.isArray(venue.stakes_cash) && venue.stakes_cash.length > 0 && !['tour_stop', 'poker_tour', 'tour', 'series'].includes(venue.venue_type) ? (
                                    <>
                                        <div className="vc3-col-title" style={{ textAlign: 'center' }}>Stakes Played</div>
                                        <div className="vc3-stakes-list">
                                            {venue.stakes_cash.slice(0, 5).map((stake, idx) => (
                                                <div key={`stake-${String(stake).replace(/\\s+/g,'-')}-${idx}`} className="vc3-list-item vc3-stake-item">
                                                    {stake}
                                                </div>
                                            ))}
                                            {venue.stakes_cash.length > 5 && <div className="vc3-list-item vc3-stake-item">Etc...</div>}
                                        </div>
                                    </>
                                ) : (
                                    <div className="vc3-empty-state">
                                        {(() => {
                                            const os = openStatus;
                                            // Unknown venue timezone (or unparseable hours) means we
                                            // cannot tell whether the room is open. Show no open/closed
                                            // claim at all rather than defaulting to one — a wrong badge
                                            // is worse than no badge.
                                            if (!os || os.unknown) return 'No Live Data';
                                            if (os.open && !os.always) return `Open Now`;
                                            if (!os.open && os.nextChange) return os.nextChange;
                                            if (os.always) return 'Open 24/7';
                                            return 'No Live Data';
                                        })()}
                                    </div>
                                )}
                            </>
                        )}

                        <div className="vc3-col-footer">
                            {/* Game Tags with stakes range — only shown when no live data */}
                            {!hasLiveData && Array.isArray(venue.games_offered) && venue.games_offered.length > 0 && (
                                <div className="vc3-games" style={{ marginBottom: 0 }}>
                                    {venue.games_offered.slice(0, 4).map((g, idx) => {
                                        const chipStyle = getGameChipStyle(g);
                                        // Find matching stakes for this game type
                                        const gLower = (g || '').toLowerCase();
                                        const matchedStakes = Array.isArray(venue.stakes_cash) ? venue.stakes_cash.filter(s => {
                                            const sLower = (s || '').toLowerCase();
                                            if (gLower.includes('nlh') || gLower.includes('hold')) return sLower.includes('nlh') || sLower.includes('hold') || sLower.includes('nl ');
                                            if (gLower.includes('plo') || gLower.includes('omaha')) return sLower.includes('plo') || sLower.includes('omaha');
                                            return false;
                                        }) : [];
                                        const stakeSuffix = matchedStakes.length > 0 ? ` (${matchedStakes.length})` : '';
                                        return (
                                            <span key={g || idx} className="vc3-game-chip" style={{
                                                background: chipStyle.bg || 'rgba(255,255,255,0.06)',
                                                color: chipStyle.color || 'rgba(255,255,255,0.65)',
                                                borderColor: chipStyle.border || 'rgba(255,255,255,0.1)',
                                                padding: '2px 6px',
                                                fontSize: '10px'
                                            }}>
                                                {g}{stakeSuffix}
                                            </span>
                                        );
                                    })}
                                </div>
                            )}


                        </div>
                    </div>

                    {/* RIGHT COLUMN: Tournaments — dynamic title */}
                    {(() => {
                        // Determine column title dynamically
                        const charityToday = venue.venue_type === 'charity' && venue.is_today && venue.today_event;
                        const charityUpcoming = venue.venue_type === 'charity' && !venue.is_today && venue.next_event;
                        // WIRING FIX: the list branch of /api/poker/venues returns a FLAT array of
                        // tournament rows, but the single-venue branch (?id=<id>, used by the Saved
                        // tab to hydrate a venue that is not in the loaded list) returns one wrapper
                        // object `[{ source_url, schedules: [...] }]`. Rendering that wrapper as a row
                        // produced a single blank "Tournament / Time TBD" entry and hid the whole
                        // schedule. Unwrap it here so both API shapes render identically.
                        const rawDaily = Array.isArray(venue.daily_tournaments) ? venue.daily_tournaments : [];
                        const dailyTournaments = (rawDaily.length && rawDaily[0] && Array.isArray(rawDaily[0].schedules))
                            ? rawDaily.flatMap(w => (Array.isArray(w?.schedules) ? w.schedules : []))
                            : rawDaily;
                        const hasRegularToday = !!venue.has_tournaments && dailyTournaments.length > 0;
                        // For home games: check if any of the daily_tournaments are today vs upcoming
                        const homeGameTodayGames = venue.venue_type === 'home_game' && hasRegularToday
                            ? dailyTournaments.filter(t => t._is_today)
                            : [];
                        const homeGameUpcomingGames = venue.venue_type === 'home_game' && hasRegularToday
                            ? dailyTournaments.filter(t => !t._is_today)
                            : [];
                        // BUG FIX: the "+N More Today" badge counted the UNFILTERED array while the
                        // list rendered only non-suppressed rows, so it advertised tournaments that
                        // had just been filtered out (and could appear with nothing left to show).
                        const visibleTourneys = dailyTournaments.filter(t => !t?.is_suppressed);
                        
                        let colTitle = 'Today\'s Tournaments';
                        if (venue.venue_type === 'home_game') {
                            if (homeGameTodayGames.length > 0) colTitle = 'Today\'s Tournament';
                            else if (homeGameUpcomingGames.length > 0 || hasRegularToday) colTitle = 'Upcoming Tournaments';
                            else colTitle = 'Upcoming Tournaments';
                        } else if (charityToday || hasRegularToday) {
                            colTitle = 'Today\'s Tournaments';
                        } else if (charityUpcoming || (venue.has_tournaments && !hasRegularToday)) {
                            colTitle = 'Upcoming Tournaments';
                        }

                        return (
                            <div className="vc3-col vc3-col-right">
                                <div className="vc3-col-title">{colTitle}</div>

                                {charityToday ? (
                                    <div className="vc3-list-scrollable vc3-list-scrollable-tourneys">
                                        {/* Show today tournaments: cap at 2, show +N More badge if there are more */}
                                        {(() => {
                                            const allToday = (Array.isArray(venue.today_tournaments) && venue.today_tournaments.length > 1
                                                ? venue.today_tournaments
                                                : [venue.today_event]).filter(evt => evt && !evt.is_suppressed);
                                            const shown = allToday.slice(0, 2);
                                            const extraCount = allToday.length - shown.length;
                                            return (
                                                <>
                                                    {shown.map((evt, tIdx) => (
                                                        <div key={`today-tourney-${evt.id || evt.tournament_name || 'base'}-${tIdx}`} className="vc3-list-item vc3-tourney-item">
                                                            <div className="vc3-tourney-name">{evt.tournament_name || (evt.buy_in != null && Number(evt.buy_in) > 0 ? `$${evt.buy_in} Poker Tournament` : 'Charity Poker Event')}</div>
                                                            <div className="vc3-tourney-details">
                                                                <span className="vc3-tourney-time">{formatTime(evt.start_time) || 'Time TBD'}</span>
                                                                <span className="vc3-tourney-buyin">{evt.buy_in != null && !isNaN(Number(evt.buy_in)) && Number(evt.buy_in) > 0 ? `$${evt.buy_in} Buy-In` : 'Buy-In TBD'}</span>
                                                            </div>
                                                            {evt.starting_stack != null && String(evt.starting_stack) !== '0' && String(evt.starting_stack) !== 'N/A' && (
                                                                <div className="vc3-tourney-stack">{evt.starting_stack} Starting Stack</div>
                                                            )}
                                                            {tIdx === 0 && (
                                                                <div className="vc3-tourney-date" style={{ display: 'flex', alignItems: 'center', gap: '5px', margin: '3px 0 2px 0' }}>
                                                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.5" style={{ flexShrink: 0 }}>
                                                                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                                                                    </svg>
                                                                    <span style={{ color: '#4ade80', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Today</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                    {extraCount > 0 && (
                                                        <div className="vc3-more-badge" onClick={e => { e.stopPropagation(); onNavigate && onNavigate(detailUrl + '?tab=tournaments'); }}>
                                                            +{extraCount} More Today
                                                        </div>
                                                    )}
                                                </>
                                            );
                                        })()}
                                    </div>
                                ) : charityUpcoming ? (
                                    /* Charity with upcoming (not today) event — cap at 2, show +N More badge */
                                    <div className="vc3-list-scrollable vc3-list-scrollable-tourneys">
                                        {(() => {
                                            const allNext = Array.isArray(venue.next_tournaments) && venue.next_tournaments.length > 1
                                                ? venue.next_tournaments
                                                : [venue.next_event];
                                            const shown = allNext.slice(0, 2);
                                            const extraCount = allNext.length - shown.length;
                                            return (
                                                <>
                                                    {shown.map((evt, tIdx) => (
                                                        <div key={`upcoming-tourney-${evt.id || evt.tournament_name || 'base'}-${tIdx}`} className="vc3-list-item vc3-tourney-item vc3-tourney-item-upcoming">
                                                            <div className="vc3-tourney-name">{evt.tournament_name || (evt.buy_in != null && Number(evt.buy_in) > 0 ? `$${evt.buy_in} Poker Tournament` : 'Charity Poker Event')}</div>
                                                            <div className="vc3-tourney-details">
                                                                <span className="vc3-tourney-time">{formatTime(evt.start_time) || 'Time TBD'}</span>
                                                                <span className="vc3-tourney-buyin">{evt.buy_in != null && !isNaN(Number(evt.buy_in)) && Number(evt.buy_in) > 0 ? `$${evt.buy_in} Buy-In` : 'Buy-In TBD'}</span>
                                                            </div>
                                                            {evt.starting_stack != null && String(evt.starting_stack) !== '0' && String(evt.starting_stack) !== 'N/A' && (
                                                                <div className="vc3-tourney-stack">{evt.starting_stack} Starting Stack</div>
                                                            )}
                                                            {/* Date badge only on first item */}
                                                            {tIdx === 0 && (() => {
                                                                const ne = venue.next_event;
                                                                const daysAway = ne.days_away;
                                                                let dateStr = ne.day ? (ne.day.charAt(0).toUpperCase() + ne.day.slice(1)) : 'Upcoming';
                                                                if (daysAway != null) {
                                                                    const d = new Date();
                                                                    d.setDate(d.getDate() + daysAway);
                                                                    dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                                                                }
                                                                return (
                                                                    <div className="vc3-tourney-date" style={{ display: 'flex', alignItems: 'center', gap: '5px', margin: '3px 0 2px 0' }}>
                                                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2.5" style={{ flexShrink: 0 }}>
                                                                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                                                                        </svg>
                                                                        <span style={{ color: '#60a5fa', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>NEXT EVENT: {dateStr}</span>
                                                                    </div>
                                                                );
                                                            })()}
                                                        </div>
                                                    ))}
                                                    {extraCount > 0 && (
                                                        <div className="vc3-more-badge" onClick={e => { e.stopPropagation(); onNavigate && onNavigate(detailUrl + '?tab=tournaments'); }}>
                                                            +{extraCount} More
                                                        </div>
                                                    )}
                                                </>
                                            );
                                        })()}
                                    </div>
                                ) : hasRegularToday ? (
                                    <div className="vc3-list-scrollable vc3-list-scrollable-tourneys">
                                        {visibleTourneys.slice(0, 3).map((t, idx) => {
                                            const tName = t?.tournament_name || t?.name || 'Tournament';
                                            // Build date label for home game entries with _days_away
                                            let daysBadgeLabel = null;
                                            if (venue.venue_type === 'home_game' && t._days_away != null) {
                                                if (t._is_today) daysBadgeLabel = 'Today';
                                                else if (t._days_away === 1) daysBadgeLabel = 'Tomorrow';
                                                else {
                                                    const d = new Date();
                                                    d.setDate(d.getDate() + t._days_away);
                                                    daysBadgeLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                                                }
                                            }
                                            const daysBadgeColor = t._is_today ? '#4ade80' : '#60a5fa';
                                            return (
                                                <div key={`daily-tourney-${t?.id || tName.replace(/\s+/g,'-')}-${idx}`} className="vc3-list-item vc3-tourney-item">
                                                    <div className="vc3-tourney-name" title={tName}>{tName}</div>
                                                    <div className="vc3-tourney-details">
                                                         <span className="vc3-tourney-time-buyin">
                                                             {formatTime(t?.start_time) || 'Time TBD'}
                                                             {t?.buy_in != null && Number(t.buy_in) > 0 ? ` · $${t.buy_in} Buy-In` : ''}
                                                         </span>
                                                         {t?.guaranteed != null && Number(t.guaranteed) > 0 ? <span className="vc3-tourney-gtd">{formatMoney(t.guaranteed)} GTD</span> : null}
                                                     </div>
                                                    {t?.starting_stack != null && String(t.starting_stack) !== '0' && String(t.starting_stack) !== 'N/A' && (
                                                        <div className="vc3-tourney-stack">{t.starting_stack} Starting Stack</div>
                                                    )}
                                                    {t?.blind_levels != null && String(t.blind_levels).trim() && String(t.blind_levels) !== 'N/A' && (
                                                        <div className="vc3-tourney-blinds">{t.blind_levels} Levels</div>
                                                    )}
                                                    {daysBadgeLabel && (
                                                        <div className="vc3-tourney-date" style={{ display: 'flex', alignItems: 'center', gap: '5px', margin: '3px 0 2px 0' }}>
                                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={daysBadgeColor} strokeWidth="2.5" style={{ flexShrink: 0 }}>
                                                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                                                            </svg>
                                                            <span style={{ color: daysBadgeColor, fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{daysBadgeLabel}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                        {visibleTourneys.length > 3 && (
                                            <div className="vc3-more-badge" onClick={e => { e.stopPropagation(); onNavigate && onNavigate(detailUrl + '?tab=tournaments'); }}>
                                                +{visibleTourneys.length - 3} More Today
                                            </div>
                                        )}
                                    </div>
                                ) : venue.next_tournament_preview ? (
                                    /* No tournaments today — show preview of next scheduled day */
                                    <div className="vc3-list-scrollable vc3-list-scrollable-tourneys">
                                        {(() => {
                                            const ntp = venue.next_tournament_preview;
                                            const daysAway = ntp.days_away;
                                            let dayLabel = ntp.day || 'Upcoming';
                                            if (daysAway === 1) dayLabel = 'Tomorrow';
                                            else if (daysAway != null && daysAway > 1) {
                                                const d = new Date();
                                                d.setDate(d.getDate() + daysAway);
                                                dayLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                                            }
                                            const buyInStr = ntp.buy_in != null && Number(ntp.buy_in) > 0
                                                ? `$${ntp.buy_in} Buy-In`
                                                : 'Buy-In TBD';
                                            const tName = ntp.tournament_name || (ntp.buy_in > 0 ? `$${ntp.buy_in} NLH` : 'Tournament');
                                            return (
                                                <div className="vc3-list-item vc3-tourney-item vc3-tourney-item-upcoming">
                                                    <div className="vc3-tourney-name" title={tName}>{tName}</div>
                                                    <div className="vc3-tourney-details">
                                                        <span className="vc3-tourney-time">{formatTime(ntp.start_time) || 'Time TBD'}</span>
                                                        <span className="vc3-tourney-buyin">{buyInStr}</span>
                                                        {ntp.guaranteed > 0 ? <span className="vc3-tourney-gtd">{formatMoney(ntp.guaranteed)} GTD</span> : null}
                                                    </div>
                                                    <div className="vc3-tourney-date" style={{ display: 'flex', alignItems: 'center', gap: '5px', margin: '3px 0 2px 0' }}>
                                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2.5" style={{ flexShrink: 0 }}>
                                                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                                                        </svg>
                                                        <span style={{ color: '#60a5fa', fontWeight: 800, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Next: {dayLabel}</span>
                                                    </div>
                                                    {ntp.total_that_day > 1 && (
                                                        <div className="vc3-more-badge" style={{ marginTop: '4px' }} onClick={e => { e.stopPropagation(); onNavigate && onNavigate(detailUrl + '?tab=tournaments'); }}>
                                                            +{ntp.total_that_day - 1} More That Day
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                ) : (
                                    <div className="vc3-empty-state">
                                        {venue.venue_type === 'home_game'
                                            ? 'No Games Scheduled'
                                            : (colTitle === 'Upcoming Tournaments' ? 'See Schedule For Details' : 'No Tournaments Today')}
                                    </div>
                                )}
                            </div>
                        );
                    })()}
                </div>
            </div>

            {/* === LOCKED FOOTER === */}
            <div style={{ marginTop: 'auto' }}>
                {/* === ACTION BAR === */}
                <div className="vc3-actions">
                {/* Secondary actions (Web/Call/Map) */}
                <div className="vc3-actions-secondary">
                    {venue.website && (
                        <a href={venue.website.toLowerCase().startsWith('http') ? safeHref(venue.website) : safeHref('https://' + venue.website)}
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
                    <button className="vc3-pill vc3-pill-checkin" onClick={handleCheckinOpen} title="Check In">
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
                        venue.has_tournaments ? (
                            <button className="vc3-pill vc3-pill-schedule" onClick={e => { e.stopPropagation(); onNavigate && onNavigate(detailUrl + '?tab=tournaments'); }} title="Tournament Schedule">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0 }}>
                                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                                </svg>
                                <span>Schedule</span>
                            </button>
                        ) : null
                    )}
                    <button className="vc3-pill vc3-pill-details" onClick={e => { e.stopPropagation(); onNavigate && onNavigate(detailUrl); }} title="Details">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polyline points="9 18 15 12 9 6" />
                        </svg>
                        <span>Details</span>
                    </button>
                </div>
            </div>

            {/* === TRUST SCORE / PLAYER RATING — not shown for tour cards === */}
            {!['tour_stop', 'poker_tour', 'tour', 'series'].includes(venue.venue_type) && (
            <div className="vc3-trust">
                {reviewStats && reviewStats.total_reviews > 0 ? (
                    <>
                        <div className="vc3-trust-header">
                            <span className="vc3-trust-label" style={{ color: reviewStats.avg_rating >= 4 ? '#22c55e' : reviewStats.avg_rating >= 3 ? '#ffffff' : '#f59e0b' }}>Player Rating</span>
                            <span className="vc3-trust-val" style={{ color: reviewStats.avg_rating >= 4 ? '#22c55e' : reviewStats.avg_rating >= 3 ? '#ffffff' : '#f59e0b' }}>
                                {(Number(reviewStats.avg_rating) || 0).toFixed(1)}/5 ({reviewStats.total_reviews})
                            </span>
                        </div>
                        <div className="vc3-trust-track">
                            <div className="vc3-trust-fill" style={{
                                width: mounted ? Math.round((Number(reviewStats.avg_rating) / 5) * 100) + '%' : '0%',
                                background: `linear-gradient(90deg, ${reviewStats.avg_rating >= 4 ? '#22c55e' : reviewStats.avg_rating >= 3 ? '#ffffff' : '#f59e0b'}, ${reviewStats.avg_rating >= 4 ? '#22c55e77' : reviewStats.avg_rating >= 3 ? '#ffffff77' : '#f59e0b77'})`,
                                boxShadow: `0 0 8px ${reviewStats.avg_rating >= 4 ? '#22c55e33' : reviewStats.avg_rating >= 3 ? '#ffffff33' : '#f59e0b33'}`,
                            }} />
                        </div>
                    </>
                ) : (
                    <>
                        <div className="vc3-trust-header">
                            <span className="vc3-trust-label" style={{ color: trust.color }}>Trust: {trust.label}</span>
                            <span className="vc3-trust-val" style={{ color: trust.color }}>{(venue.trust_score && venue.trust_score > 0) ? venue.trust_score + '/5' : '—'}</span>
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
            )}
            </div>

            {/* === CHECK-IN MODAL ===
                BUG FIX: this used to render inside the card, whose root always carries an
                inline `transform`. Any transform other than `none` makes the element a
                containing block for position:fixed descendants, so `.vc3-checkin-backdrop`
                (position: fixed; inset: 0) covered only the CARD — on a grid of venue cards
                the modal appeared as a tiny clipped overlay with the 420px-wide panel
                overflowing it. Portalled to document.body so it escapes the transform. */}
            {checkinModal && typeof document !== 'undefined' && createPortal((
                <div className="vc3-checkin-backdrop" onClick={e => { e.stopPropagation(); setCheckinModal(false); }}>
                    <div
                        className="vc3-checkin-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-label={`Check in at ${venue.name || 'this venue'}`}
                        tabIndex={-1}
                        ref={checkinModalRef}
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="vc3-checkin-header">
                            <span>Check In at {venue.name}</span>
                            <button className="vc3-checkin-close" aria-label="Close" onClick={() => setCheckinModal(false)}>×</button>
                        </div>
                        {checkinDone ? (
                            <div className="vc3-checkin-done">✓ Checked in!</div>
                        ) : (
                            <>
                                <textarea
                                    className="vc3-checkin-textarea"
                                    value={checkinMsg}
                                    onChange={e => setCheckinMsg(e.target.value)}
                                    rows={3}
                                    maxLength={280}
                                    placeholder="What's happening at the table?"
                                />
                                {checkinError && (
                                    <div className="vc3-checkin-error">{checkinError}</div>
                                )}
                                <div className="vc3-checkin-actions">
                                    <span className="vc3-checkin-count">{checkinMsg.length}/280</span>
                                    <button className="vc3-checkin-cancel" onClick={() => setCheckinModal(false)}>Cancel</button>
                                    <button className="vc3-checkin-submit" onClick={handleCheckinSubmit} disabled={checkinBusy || !checkinMsg.trim()}>
                                        {checkinBusy ? 'Posting...' : 'Post Check-In'}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            ), document.body)}

            {/* Old Calendar display successfully abstracted */}
            {/* Card CSS is injected into <head> exactly once (see VC3_CARD_STYLES
                below) instead of being duplicated per card instance. */}
        </div>
    );
}
