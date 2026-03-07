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
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatMoney(amount) {
    if (!amount) return '';
    if (amount >= 1000000) return '$' + (amount / 1000000).toFixed(0) + 'M';
    if (amount >= 1000) return '$' + (amount / 1000).toFixed(0) + 'K';
    return '$' + amount.toLocaleString();
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
    return (
        <div className="entity-card tour-card" onClick={() => onNavigate('/hub/tours/' + tour.tour_code)} style={{ cursor: 'pointer' }}>
            <button className={'fav-btn' + (isFavorited ? ' active' : '')} onClick={(e) => onFavorite(e)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill={isFavorited ? '#ef4444' : 'none'} stroke={isFavorited ? '#ef4444' : 'rgba(255,255,255,0.4)'} strokeWidth="2">
                    <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                </svg>
            </button>
            <div className="card-header">
                <TourBadge tourCode={tour.tour_code} />
                <span className="badge tour-type">{TOUR_TYPE_LABELS[tour.tour_type] || tour.tour_type}</span>
            </div>
            <h4 className="tour-name">{tour.tour_name}</h4>
            <p className="card-location">{tour.headquarters}</p>
            {tour.typical_buyins && (
                <p className="card-detail">
                    Buy-ins: {formatMoney(tour.typical_buyins.min)} - {formatMoney(tour.typical_buyins.max)}
                </p>
            )}
            {tour.regions && tour.regions.length > 0 && (
                <div className="card-tags">
                    {tour.regions.map(r => <span key={r} className="tag region">{r}</span>)}
                </div>
            )}
            {tour.upcoming_series && tour.upcoming_series.length > 0 && (
                <div className="upcoming-series">
                    <span className="upcoming-label">Next: {tour.upcoming_series[0].short_name || tour.upcoming_series[0].name}</span>
                    <span className="upcoming-date">{formatDate(tour.upcoming_series[0].start_date)}</span>
                </div>
            )}
            <div className="card-footer">
                <span className="established">Est. {tour.established}</span>
                <div className="card-actions">
                    <span className="action-btn primary">Details</span>
                    {tour.official_website && (
                        <a href={tour.official_website} target="_blank" rel="noopener noreferrer" className="action-btn" onClick={e => e.stopPropagation()}>Website</a>
                    )}
                </div>
            </div>
        </div>
    );
}

export { TourBadge, TOUR_COLORS, TOUR_TYPE_LABELS, formatDate, formatMoney };
