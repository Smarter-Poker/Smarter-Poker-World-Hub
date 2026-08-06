/**
 * SeriesCard - Tournament series card for Poker Near Me page
 * Handles both poker_series objects and poker_venues entries with venue_type='series'
 */
import { TourBadge, formatDate, formatMoney } from './TourCard';

// BUG FIX: Sanitize scraped URLs — block javascript:/data:/vbscript: XSS vectors.
// Mirrors safeHref in NewSeriesVenueCard.jsx and the inline guard in TourCard.js.
function safeHref(url) {
    if (!url || typeof url !== 'string') return null;
    // Strip ASCII control characters and whitespace ("java\tscript:" evasion)
    const cleanUrl = url.replace(/[\x00-\x20]/g, '');
    if (!cleanUrl) return null;
    const lower = cleanUrl.toLowerCase();
    if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('vbscript:')) return null;
    return cleanUrl.startsWith('http') ? cleanUrl : 'https://' + cleanUrl;
}

export default function SeriesCard({ series: s, index, isFavorited, onFavorite, onNavigate }) {
    const isVenueEntry = s.venue_type === 'series';
    // BUG FIX: `series_code` is not a column on poker_series and is never produced by
    // /api/poker/series, so the old ternary always fell through to /hub/venues/<series id>
    // — a venue detail route keyed with a series primary key (404 / wrong venue).
    // Mirror NewSeriesVenueCard.jsx: series detail lives at /hub/series/<poker_series.id>.
    const detailUrl = s.id != null ? '/hub/series/' + s.id : '/hub/poker-series';
    const shortCode = s.tour_code || s.short_name || (s.name || '').replace(/[^A-Z]/g, '').slice(0, 4) || 'SER';
    const displayLocation = s.location || (((s.city || s.venue || '') + (s.state ? ', ' + s.state : '')) || 'Location TBD');

    return (
        <div className="entity-card series-card" onClick={() => onNavigate && onNavigate(detailUrl)} style={{ cursor: 'pointer' }}>
            <button className={'fav-btn' + (isFavorited ? ' active' : '')} onClick={(e) => { e.stopPropagation(); onFavorite && onFavorite(e); }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill={isFavorited ? '#ef4444' : 'none'} stroke={isFavorited ? '#ef4444' : 'rgba(255,255,255,0.4)'} strokeWidth="2">
                    <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                </svg>
            </button>
            <div className="card-header">
                <TourBadge tourCode={shortCode} size="small" />
                {s.series_type && <span className="badge series-type">{s.series_type}</span>}
                {isVenueEntry && <span className="badge series-type" style={{ background: 'rgba(6,182,212,0.15)', color: '#06b6d4', border: '1px solid rgba(6,182,212,0.3)', padding: '3px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600 }}>Series</span>}
            </div>
            <h4>{s.name}</h4>
            <p className="card-location">{displayLocation}</p>
            {/* Date range — from poker_series data */}
            {(s.start_date || s.end_date) && (
                <p className="card-dates">{formatDate(s.start_date)} - {formatDate(s.end_date)}</p>
            )}
            <div className="card-tags">
                {s.total_events && <span className="tag events">{s.total_events} Events</span>}
                {s.main_event_buyin && <span className="tag buyin">{formatMoney(s.main_event_buyin)} Main</span>}
                {/* Games offered — from poker_venues data */}
                {!s.total_events && Array.isArray(s.games_offered) && s.games_offered.slice(0, 4).map((g, i) => (
                    <span key={g || i} className="tag game">{g}</span>
                ))}
            </div>
            {/* Stakes — from poker_venues data */}
            {!s.main_event_guaranteed && Array.isArray(s.stakes_cash) && s.stakes_cash.length > 0 && (
                <p className="card-detail" style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 4 }}>
                    Stakes: {s.stakes_cash.slice(0, 3).join(', ')}
                </p>
            )}
            {s.main_event_guaranteed && (
                <p className="card-detail guaranteed">{formatMoney(s.main_event_guaranteed)}+ GTD</p>
            )}
            <div className="card-footer">
                <div className="card-actions">
                    <span className="action-btn primary">Details</span>
                    {(() => {
                        const href = safeHref(s.source_url || s.website);
                        if (!href) return null;
                        return <a href={href} target="_blank" rel="noopener noreferrer" className="action-btn" onClick={e => e.stopPropagation()}>{s.source_url ? 'Source' : 'Website'}</a>;
                    })()}
                </div>
            </div>
        </div>
    );
}
