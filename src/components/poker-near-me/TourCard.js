import React from 'react';

/**
 * TourCard - Poker tour card for Poker Near Me page
 */

const TOUR_COLORS = {
    'WSOP': { bg: 'linear-gradient(135deg, #c9a227, #8b6914)', text: '#000', border: '#c9a227' },
    'WPT': { bg: 'linear-gradient(135deg, #dc2626, #991b1b)', text: '#fff', border: '#dc2626' },
    'WSOPC': { bg: 'linear-gradient(135deg, #c9a227, #8b6914)', text: '#000', border: '#c9a227' },
    'MSPT': { bg: 'linear-gradient(135deg, #1e40af, #1e3a8a)', text: '#fff', border: '#3b82f6' },
    'RGPS': { bg: 'linear-gradient(135deg, #059669, #047857)', text: '#fff', border: '#10b981' },
    'PGT': { bg: 'linear-gradient(135deg, #7c3aed, #5b21b6)', text: '#fff', border: '#8b5cf6' },
    'default': { bg: 'linear-gradient(135deg, #374151, #1f2937)', text: '#fff', border: '#4b5563' }
};

const TOUR_TYPE_LABELS = {
    major: 'Major Tour',
    circuit: 'Circuit',
    high_roller: 'High Roller',
    regional: 'Regional',
    grassroots: 'Grassroots',
    charity: 'Charity',
    cruise: 'Cruise'
};

function formatDate(dateStr) {
    if (!dateStr) return '';
    // BUG FIX: date-only strings ('2026-08-01') parse as UTC midnight, which
    // toLocaleDateString then renders as the PREVIOUS day for every US timezone.
    // Append a time component so they parse in local time instead.
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(dateStr).trim())
        ? new Date(String(dateStr).trim() + 'T00:00:00')
        : new Date(dateStr);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatMoney(amount) {
    if (amount === null || amount === undefined || amount === '') return '';
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(num)) return '';
    if (num === 0) return 'Free'; // BUG FIX: freerolls show 'Free' not '$0'
    if (num >= 1000000) return '$' + (num / 1000000).toFixed(0) + 'M';
    if (num >= 1000) return '$' + (num / 1000).toFixed(0) + 'K';
    return '$' + num.toLocaleString();
}

function TourBadge({ tourCode, size = 'normal' }) {
    const style = TOUR_COLORS[tourCode] || TOUR_COLORS.default;
    const padding = size === 'small' ? '4px 10px' : '8px 16px';
    const fontSize = size === 'small' ? '11px' : '14px';

    return (
        <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding,
            borderRadius: '6px',
            background: style.bg,
            border: '1px solid ' + style.border,
            minWidth: size === 'small' ? '50px' : '70px'
        }}>
            <span style={{ color: style.text, fontSize, fontWeight: 800, letterSpacing: '0.5px' }}>
                {tourCode || 'TOUR'}
            </span>
        </div>
    );
}

export default function TourCard({ tour, isFavorited, onFavorite, onNavigate }) {
    // Support both poker_tours objects (with tour_code) and poker_venues entries (venue_type='tour')
    const isVenueEntry = !tour.tour_code && tour.venue_type === 'tour';
    const displayName = tour.tour_name || tour.name || 'Unknown Tour';
    const displayLocation = tour.headquarters || ((tour.city || '') + (tour.city && tour.state ? ', ' : '') + (tour.state || ''));
    const detailUrl = tour.tour_code ? '/hub/tours/' + tour.tour_code : '/hub/venues/' + tour.id;

    // For venue-table entries, derive a short code from the name
    const shortCode = tour.tour_code || (tour.name || '').replace(/[^A-Z]/g, '').slice(0, 4) || 'TOUR';

    return (
        <div className="entity-card tour-card" onClick={() => onNavigate && onNavigate(detailUrl)} style={{ cursor: 'pointer' }}>
            <button className={'fav-btn' + (isFavorited ? ' active' : '')} onClick={(e) => { e.stopPropagation(); onFavorite && onFavorite(e); }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill={isFavorited ? '#ef4444' : 'none'} stroke={isFavorited ? '#ef4444' : 'rgba(255,255,255,0.4)'} strokeWidth="2">
                    <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                </svg>
            </button>
            <div className="card-header">
                {tour.logo_url ? (
                    <img src={tour.logo_url} alt={shortCode} style={{ width: 44, height: 44, borderRadius: 6, objectFit: 'contain', background: 'rgba(255,255,255,0.9)', padding: 2, border: '1px solid rgba(255,255,255,0.1)' }} />
                ) : (
                    <TourBadge tourCode={shortCode} />
                )}
                <span className="badge tour-type">{TOUR_TYPE_LABELS[tour.tour_type] || (isVenueEntry ? 'Tour' : tour.venue_type || tour.tour_type)}</span>
            </div>
            <h4 className="tour-name">{displayName}</h4>
            {displayLocation && <p className="card-location">{displayLocation}</p>}
            {/* Buy-in range — from poker_tours data */}
            {tour.typical_buyins && (tour.typical_buyins.min || tour.typical_buyins.max) && (
                <p className="card-detail">
                    Buy-ins: {formatMoney(tour.typical_buyins.min)}{tour.typical_buyins.min && tour.typical_buyins.max ? ' - ' : ''}{formatMoney(tour.typical_buyins.max)}
                </p>
            )}
            {/* Stakes — from poker_venues data */}
            {!tour.typical_buyins && Array.isArray(tour.stakes_cash) && tour.stakes_cash.length > 0 && (
                <p className="card-detail" style={{ color: 'rgba(255,255,255,0.85)' }}>
                    Stakes: {tour.stakes_cash.slice(0, 3).join(', ')}
                </p>
            )}
            {/* Regions — from poker_tours data */}
            {tour.regions && tour.regions.length > 0 && (
                <div className="card-tags">
                    {tour.regions.map(r => <span key={r} className="tag region">{r}</span>)}
                </div>
            )}
            {/* Games offered — from poker_venues data */}
            {!tour.regions && Array.isArray(tour.games_offered) && tour.games_offered.length > 0 && (
                <div className="card-tags">
                    {tour.games_offered.slice(0, 4).map((g, i) => <span key={g || i} className="tag game">{g}</span>)}
                </div>
            )}
            {Array.isArray(tour.upcoming_series) && tour.upcoming_series.length > 0 && (
                <div className="upcoming-series">
                    <span className="upcoming-label">Next: {tour.upcoming_series[0]?.short_name || tour.upcoming_series[0]?.name}</span>
                    <span className="upcoming-date">{formatDate(tour.upcoming_series[0]?.start_date)}</span>
                </div>
            )}
            <div className="card-footer">
                {tour.established && <span className="established">Est. {tour.established}</span>}
                <div className="card-actions">
                    <span className="action-btn primary">Details</span>
                    {(tour.official_website || tour.website) && (() => {
                        // BUG FIX: Sanitize URL — block javascript: protocol XSS
                        const raw = tour.official_website || tour.website;
                        const trimmed = (raw || '').trim().toLowerCase();
                        if (trimmed.startsWith('javascript:') || trimmed.startsWith('data:') || trimmed.startsWith('vbscript:')) return null;
                        const href = raw.startsWith('http') ? raw : 'https://' + raw;
                        return <a href={href} target="_blank" rel="noopener noreferrer" className="action-btn" onClick={e => e.stopPropagation()}>Website</a>;
                    })()}
                </div>
            </div>
        </div>
    );
}

export { TourBadge, TOUR_COLORS, TOUR_TYPE_LABELS, formatDate, formatMoney };
