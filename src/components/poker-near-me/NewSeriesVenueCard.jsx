import React from 'react';
import { TourBadge, formatDate } from './TourCard';

// Local formatMoney so freerolls (amount=0) show 'Free'.
// (The note that used to sit here claiming TourCard's formatMoney(0) returns '$0' is
// stale — TourCard.js also returns 'Free' for 0 now.)
function formatMoney(amount) {
    if (amount === null || amount === undefined || amount === '') return '';
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(num)) return '';
    if (num === 0) return 'Free'; // freerolls
    if (num >= 1000000) return '$' + (num / 1000000).toFixed(0) + 'M';
    if (num >= 1000) return '$' + (num / 1000).toFixed(0) + 'K';
    return '$' + num.toLocaleString();
}

// BUG FIX: Sanitize URLs to block javascript: protocol XSS vectors
function safeHref(url) {
    if (!url || typeof url !== 'string') return null;
    // Remove all ASCII control characters and whitespace
    const cleanUrl = url.replace(/[\x00-\x20]/g, '');
    const lower = cleanUrl.toLowerCase();
    if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('vbscript:')) return null;
    // BUG FIX: this returned cleanUrl unchanged, so a scraped source_url of
    // "www.wsop.com/..." (very common in scraped rows) became a RELATIVE href and the
    // "Source" button navigated to /hub/poker-near-me/www.wsop.com/... — a 404 inside
    // the app instead of the external site. Both sibling copies (SeriesCard.js line 16,
    // TourCard.js line 138) already add the scheme; match them.
    return lower.startsWith('http://') || lower.startsWith('https://') ? cleanUrl : 'https://' + cleanUrl;
}

// Tour logo fallback map — matches /public/images/tours/ assets
// Applied when series.logo_url is null (most scraped series rows)
const TOUR_LOGO_MAP = {
    'WSOP':       '/images/tours/wsop.png',
    'WSOPC':      '/images/tours/wsopc.png',
    'WPT':        '/images/tours/wpt.png',
    'MSPT':       '/images/tours/mspt.png',
    'RGPS':       '/images/tours/rgps.png',
    'PGT':        '/images/tours/pgt.png',
    'CPPT':       '/images/tours/cppt.png',
    'NAPT':       '/images/tours/napt.png',
    'FPN':        '/images/tours/fpn.png',
    'LIPS':       '/images/tours/lips.png',
    'BPO':        '/images/tours/bpo.png',
    'GCPT':       '/images/tours/gcpt.jpg',
    'ROUGHRIDER': '/images/tours/roughrider.png',
    'PAT':        '/images/tours/pat.jpg',
};

/**
 * NewSeriesVenueCard - Premium Metal Series Card
 * Uses the Skeuomorphic Sci-Fi UI System
 */
export default function NewSeriesVenueCard({ series: s, index, isFavorited, onFavorite, onNavigate }) {
    if (!s) return null;
    
    const isVenueEntry = s.venue_type === 'series'; // Legacy compat
    
    // BUG FIX: detailUrl now uses numeric id only.
    // [NSC1 FIX] Number.isInteger("123") returns false for string IDs from Supabase bigint columns.
    // parseInt first, then validate — ensures string IDs like "123" work correctly.
    const parsedId = typeof s.id === 'string' ? parseInt(s.id, 10) : s.id;
    const numericId = Number.isInteger(parsedId) ? parsedId : null;
    const detailUrl = numericId ? '/hub/series/' + numericId : '/hub/poker-series';

    const shortCode = s.tour_code || s.tour || s.short_name || (s.name || '').replace(/[^A-Z]/g, '').slice(0, 4) || 'SER';
    const displayLocation = s.location || (((s.city || s.venue || '') + (s.state ? ', ' + s.state : '')) || 'Location TBD');
    const isNew = s.is_new || s.is_featured;

    // BUG FIX: sanitize source_url/website before using as href
    const externalUrl = safeHref(s.source_url || s.website);

    const rawTourString = String(s.tour_code || s.tour || s.short_name || s.name || s.series_name || '').toUpperCase();
    
    // Aggressive substring matching for tour logos
    let matchedTourCode = null;
    if (rawTourString.includes('WSOPC') || rawTourString.includes('WSOP CIRCUIT')) matchedTourCode = 'WSOPC';
    else if (rawTourString.includes('WSOP')) matchedTourCode = 'WSOP';
    else if (rawTourString.includes('WPT')) matchedTourCode = 'WPT';
    else if (rawTourString.includes('MSPT')) matchedTourCode = 'MSPT';
    else if (rawTourString.includes('RGPS') || rawTourString.includes('RUNGOOD')) matchedTourCode = 'RGPS';
    else if (rawTourString.includes('PGT')) matchedTourCode = 'PGT';
    else if (rawTourString.includes('NAPT')) matchedTourCode = 'NAPT';
    else {
        matchedTourCode = Object.keys(TOUR_LOGO_MAP || {}).find(k => rawTourString.includes(k));
    }

    // Logo cascade: series own logo → tour brand logo → nothing
    const resolvedLogoUrl = s.logo_url || (matchedTourCode ? TOUR_LOGO_MAP[matchedTourCode] : null) || null;

    return (
        <div className="metal-series-card" onClick={() => onNavigate && onNavigate(detailUrl)}>
            <div className="frame-bolt" style={{ top: '8px', left: '8px' }} />
            <div className="frame-bolt" style={{ top: '8px', right: '8px' }} />
            <div className="frame-bolt" style={{ bottom: '8px', left: '8px' }} />
            <div className="frame-bolt" style={{ bottom: '8px', right: '8px' }} />
            <div className="neon-strip left" />
            <div className="neon-strip right" />
            <div className="series-header" style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                {/* Square logo — left side */}
                {resolvedLogoUrl && (
                    <div style={{
                        width: 116, height: 116, flexShrink: 0, borderRadius: 12,
                        overflow: 'hidden', border: '1px solid rgba(255,255,255,0.12)',
                        background: 'rgba(0,0,0,0.4)', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                    }}>
                        <img
                            src={resolvedLogoUrl}
                            alt={s.name || s.series_name || 'Series'}
                            style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', padding: 8, boxSizing: 'border-box' }}
                            loading="lazy"
                            onError={e => { e.target.parentElement.style.display = 'none'; }}
                        />
                    </div>
                )}
                {/* Tour badge + title stacked to the right of logo */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="series-tour">{shortCode}</div>
                    <a href={detailUrl} onClick={e => e.preventDefault()} style={{ textDecoration: 'none', color: 'inherit' }}>
                        <h4 className="series-title">{s.name || s.series_name || 'Upcoming Series'}</h4>
                    </a>
                </div>
                <button 
                    className={'fav-btn' + (isFavorited ? ' active' : '')} 
                    onClick={(e) => { e.stopPropagation(); onFavorite && onFavorite(e); }}
                    style={{ position: 'relative', zIndex: 10, background: 'none', border: 'none', cursor: 'pointer', outline: 'none' }}
                >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill={isFavorited ? '#ef4444' : 'none'} stroke={isFavorited ? '#ef4444' : 'rgba(255,255,255,0.4)'} strokeWidth="2">
                        <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                    </svg>
                </button>
            </div>
            
            <div className="series-body">
                <div className="series-location">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                        <circle cx="12" cy="10" r="3" />
                    </svg>
                    {displayLocation}
                </div>
                
                {(s.start_date || s.end_date) && (
                    <div className="series-dates">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                            <line x1="16" y1="2" x2="16" y2="6" />
                            <line x1="8" y1="2" x2="8" y2="6" />
                            <line x1="3" y1="10" x2="21" y2="10" />
                        </svg>
                        {formatDate(s.start_date)} - {formatDate(s.end_date)}
                    </div>
                )}
                
                <div className="series-tags">
                    {(s.events_count || s.total_events) > 0 && <span className="series-tag">{s.events_count || s.total_events} Events</span>}
                    {s.main_event_buyin != null && <span className="series-tag">{formatMoney(s.main_event_buyin)} Main</span>}
                    {(s.total_guaranteed || s.main_event_guaranteed) != null && <span className="series-tag" style={{ color: '#ffffff', borderColor: 'rgba(255,255,255,0.3)' }}>{formatMoney(s.total_guaranteed || s.main_event_guaranteed)} GTD</span>}
                    {isNew && <span className="series-tag" style={{ color: '#00D4FF', borderColor: 'rgba(0,212,255,0.3)', background: 'rgba(0,212,255,0.1)' }}>NEW ADDITION</span>}
                </div>
            </div>
            
            <div className="series-footer">
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="hex-btn-small" onClick={(e) => { e.stopPropagation(); onNavigate && onNavigate(detailUrl); }}>
                        View Events
                    </button>
                    {externalUrl && (
                        <a 
                            href={externalUrl} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="hex-btn-small" 
                            style={{ color: 'rgba(255,255,255,0.6)', borderColor: 'rgba(255,255,255,0.2)', textDecoration: 'none' }}
                            onClick={e => e.stopPropagation()}
                        >
                            Source
                        </a>
                    )}
                </div>
            </div>
        </div>
    );
}
