import React from 'react';
import { PokerNearMeConsoleIcon, PokerNearMePanelShell } from './PokerNearMeConsole';

/**
 * TourCard - Poker tour card for Poker Near Me page
 */

const TOUR_COLORS = {
    'WSOP': { tone: 'gold' },
    'WPT': { tone: 'red' },
    'WSOPC': { tone: 'gold' },
    'MSPT': { tone: 'blue' },
    'RGPS': { tone: 'green' },
    'PGT': { tone: 'violet' },
    'default': { tone: 'silver' }
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

    return (
        <div className="pnm-console-card__brand" data-tone={style.tone} data-size={size}>
            <span>{tourCode || 'TOUR'}</span>
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
    const logoUrl = tour.logo_url || null;
    const [logoFailed, setLogoFailed] = React.useState(false);

    React.useEffect(() => {
        setLogoFailed(false);
    }, [logoUrl]);

    return (
        <PokerNearMePanelShell
            className="pnm-console-card pnm-console-card--tour"
            bodyClassName="pnm-console-card__body"
            onClick={() => onNavigate && onNavigate(detailUrl)}
        >
            <button
                type="button"
                className={'fav-btn' + (isFavorited ? ' active' : '')}
                onClick={(e) => { e.stopPropagation(); onFavorite && onFavorite(e); }}
                aria-label={isFavorited ? `Remove ${displayName} from saved tours` : `Save ${displayName}`}
                aria-pressed={!!isFavorited}
            >
                <PokerNearMeConsoleIcon name="saved" />
            </button>
            <div className="card-header">
                {logoUrl && !logoFailed ? (
                    <img
                        src={logoUrl}
                        alt={`${displayName} logo`}
                        onError={() => setLogoFailed(true)}
                        className="pnm-console-card__logo"
                    />
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
                    Buy-Ins: {formatMoney(tour.typical_buyins.min)}{tour.typical_buyins.min && tour.typical_buyins.max ? ' - ' : ''}{formatMoney(tour.typical_buyins.max)}
                </p>
            )}
            {/* Stakes — from poker_venues data */}
            {!tour.typical_buyins && Array.isArray(tour.stakes_cash) && tour.stakes_cash.length > 0 && (
                <p className="card-detail">
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
                    <button
                        type="button"
                        className="action-btn primary"
                        onClick={(event) => {
                            event.stopPropagation();
                            onNavigate?.(detailUrl);
                        }}
                    >
                        <PokerNearMeConsoleIcon name="directions" className="pnm-console-card__action-icon" />
                        Details
                    </button>
                    {(tour.official_website || tour.website) && (() => {
                        // BUG FIX: Sanitize URL — block javascript: protocol XSS
                        const raw = tour.official_website || tour.website;
                        const trimmed = (raw || '').trim().toLowerCase();
                        if (trimmed.startsWith('javascript:') || trimmed.startsWith('data:') || trimmed.startsWith('vbscript:')) return null;
                        const href = raw.startsWith('http') ? raw : 'https://' + raw;
                        return <a href={href} target="_blank" rel="noopener noreferrer" className="action-btn" onClick={e => e.stopPropagation()}><PokerNearMeConsoleIcon name="globe" className="pnm-console-card__action-icon" />Website</a>;
                    })()}
                </div>
            </div>
        </PokerNearMePanelShell>
    );
}

export { TourBadge, TOUR_COLORS, TOUR_TYPE_LABELS, formatDate, formatMoney };
