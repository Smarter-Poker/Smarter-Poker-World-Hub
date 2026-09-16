import React from 'react';
import { formatDate } from './TourCard';
import { PokerNearMeConsoleIcon, PokerNearMePanelShell } from './PokerNearMeConsole';

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

    // BUG FIX: `(s.total_guaranteed || s.main_event_guaranteed) != null` evaluated to 0
    // when total_guaranteed was null and main_event_guaranteed was 0, and 0 != null is
    // true — so a series with no guarantee advertised "Free GTD". Coalesce, then gate on > 0.
    const gtd = s.total_guaranteed ?? s.main_event_guaranteed;

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
        <PokerNearMePanelShell
            className="metal-series-card pnm-console-card pnm-console-card--series pnm-console-card--series-featured"
            bodyClassName="pnm-console-card__body"
            onClick={() => onNavigate && onNavigate(detailUrl)}
        >
            <div className="series-header">
                {/* Square logo — left side */}
                {resolvedLogoUrl && (
                    <div className="pnm-console-card__logo-frame pnm-console-card__logo-frame--large">
                        <img
                            src={resolvedLogoUrl}
                            alt={s.name || s.series_name || 'Series'}
                            className="pnm-console-card__logo pnm-console-card__logo--large"
                            loading="lazy"
                            onError={e => { e.target.parentElement.style.display = 'none'; }}
                        />
                    </div>
                )}
                {/* Tour badge + title stacked to the right of logo */}
                <div className="pnm-console-card__identity">
                    <div className="series-tour">{shortCode}</div>
                    <a href={detailUrl} onClick={e => e.preventDefault()} className="pnm-console-card__title-link">
                        <h4 className="series-title">{s.name || s.series_name || 'Upcoming Series'}</h4>
                    </a>
                </div>
                <button 
                    type="button"
                    className={'fav-btn' + (isFavorited ? ' active' : '')} 
                    onClick={(e) => { e.stopPropagation(); onFavorite && onFavorite(e); }}
                    aria-label={isFavorited ? `Remove ${s.name || s.series_name || 'series'} from saved series` : `Save ${s.name || s.series_name || 'series'}`}
                    aria-pressed={!!isFavorited}
                >
                    <PokerNearMeConsoleIcon name="saved" />
                </button>
            </div>
            
            <div className="series-body">
                <div className="series-location">
                    <PokerNearMeConsoleIcon name="location" className="pnm-console-card__meta-icon" />
                    {displayLocation}
                </div>
                
                {(s.start_date || s.end_date) && (
                    <div className="series-dates">
                        <PokerNearMeConsoleIcon name="calendar" className="pnm-console-card__meta-icon" />
                        {formatDate(s.start_date)} - {formatDate(s.end_date)}
                    </div>
                )}
                
                <div className="series-tags">
                    {(s.events_count || s.total_events) > 0 && <span className="series-tag">{s.events_count || s.total_events} Events</span>}
                    {s.main_event_buyin != null && <span className="series-tag">{formatMoney(s.main_event_buyin)} Main</span>}
                    {gtd > 0 && <span className="series-tag pnm-console-card__tag--premium">{formatMoney(gtd)} GTD</span>}
                    {isNew && <span className="series-tag pnm-console-card__tag--blue">NEW ADDITION</span>}
                </div>
            </div>
            
            <div className="series-footer">
                <div className="card-actions">
                    <button className="hex-btn-small" onClick={(e) => { e.stopPropagation(); onNavigate && onNavigate(detailUrl); }}>
                        <PokerNearMeConsoleIcon name="calendar" className="pnm-console-card__action-icon" />
                        View Events
                    </button>
                    {externalUrl && (
                        <a 
                            href={externalUrl} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="hex-btn-small" 
                            onClick={e => e.stopPropagation()}
                        >
                            <PokerNearMeConsoleIcon name="globe" className="pnm-console-card__action-icon" />
                            Source
                        </a>
                    )}
                </div>
            </div>
        </PokerNearMePanelShell>
    );
}
