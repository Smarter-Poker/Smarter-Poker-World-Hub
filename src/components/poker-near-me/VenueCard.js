/**
 * VenueCard - Premium poker venue card for Poker Near Me page
 * Redesigned with visual hierarchy, SVG icon buttons, glassmorphic styling
 */

const VENUE_TYPE_LABELS = {
    casino: 'Casino',
    card_room: 'Card Room',
    poker_club: 'Poker Club',
    home_game: 'Home Game',
    charity: 'Charity Room'
};

const VENUE_TYPE_ICONS = {
    casino: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
        </svg>
    ),
    card_room: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="7" width="20" height="15" rx="2" ry="2" /><path d="M16 21V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v16" />
        </svg>
    ),
    poker_club: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87" /><path d="M16 3.13a4 4 0 010 7.75" />
        </svg>
    ),
    home_game: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
        </svg>
    ),
    charity: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
        </svg>
    ),
};

const VENUE_TYPE_COLORS = {
    casino: { bg: 'rgba(212,168,83,0.12)', color: '#d4a853', border: 'rgba(212,168,83,0.3)' },
    card_room: { bg: 'rgba(59,130,246,0.12)', color: '#60a5fa', border: 'rgba(59,130,246,0.3)' },
    poker_club: { bg: 'rgba(139,92,246,0.12)', color: '#a78bfa', border: 'rgba(139,92,246,0.3)' },
    home_game: { bg: 'rgba(34,197,94,0.12)', color: '#4ade80', border: 'rgba(34,197,94,0.3)' },
    charity: { bg: 'rgba(236,72,153,0.12)', color: '#f472b6', border: 'rgba(236,72,153,0.3)' },
};

function getTrustLevel(score) {
    if (score >= 4.5) return { label: 'Excellent', color: '#22c55e', pct: 90 };
    if (score >= 4.0) return { label: 'Good', color: '#3b82f6', pct: 75 };
    if (score >= 3.0) return { label: 'Moderate', color: '#f59e0b', pct: 55 };
    return { label: 'Low', color: '#ef4444', pct: 30 };
}

// Get the correct detail URL for a venue or social page
function getVenueUrl(venue) {
    if (venue.is_social_page && venue.social_page_id) {
        return '/club/' + venue.social_page_id;
    }
    return '/hub/venues/' + venue.id;
}

export default function VenueCard({ venue, isFavorited, isNewcomer, hasPromo, onFavorite, onNavigate, checkinCount }) {
    if (!venue) return null;
    const trust = getTrustLevel(venue.trust_score || 0);
    const detailUrl = getVenueUrl(venue);
    const typeColor = VENUE_TYPE_COLORS[venue.venue_type] || VENUE_TYPE_COLORS.casino;
    const typeIcon = VENUE_TYPE_ICONS[venue.venue_type] || VENUE_TYPE_ICONS.casino;

    return (
        <div className="entity-card venue-card" onClick={() => onNavigate && onNavigate(detailUrl)} style={{ cursor: 'pointer' }}>
            {/* Distance Pill (top-right) */}
            {venue.distance_mi && (
                <span className="venue-distance-pill">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polygon points="3 11 22 2 13 21 11 13 3 11" />
                    </svg>
                    {typeof venue.distance_mi === 'number' ? venue.distance_mi.toFixed(1) : venue.distance_mi} mi
                </span>
            )}

            {/* Favorite Button */}
            <button className={'fav-btn' + (isFavorited ? ' active' : '')} onClick={(e) => { e.stopPropagation(); onFavorite && onFavorite(e); }} title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill={isFavorited ? '#ef4444' : 'none'} stroke={isFavorited ? '#ef4444' : 'rgba(255,255,255,0.4)'} strokeWidth="2">
                    <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                </svg>
            </button>

            {/* Venue Type Badge */}
            <div className="venue-type-badge" style={{ background: typeColor.bg, border: '1px solid ' + typeColor.border, color: typeColor.color }}>
                {typeIcon}
                <span>{VENUE_TYPE_LABELS[venue.venue_type] || venue.venue_type}</span>
            </div>

            {/* Venue Name */}
            <h4 className="venue-name">{venue.name || 'Unknown Venue'}</h4>

            {/* Address */}
            <p className="venue-address">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, opacity: 0.5 }}>
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
                </svg>
                {venue.address ? (venue.address + ' - ') : ''}{venue.city || ''}{venue.city && venue.state ? ', ' : ''}{venue.state || ''}
            </p>

            {/* Home Game Host Info */}
            {venue.venue_type === 'home_game' && venue.host_display_name && (
                <div className="venue-host-row">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#58a6ff" strokeWidth="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    <span style={{ fontSize: 12, color: '#58a6ff', fontWeight: 600 }}>Hosted by {venue.host_display_name}</span>
                    {venue.host_username && (
                        <a href={'/hub/user/' + venue.host_username} onClick={e => e.stopPropagation()} style={{ fontSize: 11, color: '#3fb950', textDecoration: 'underline', marginLeft: 4 }}>Contact Host</a>
                    )}
                </div>
            )}
            {/* Home Game Description */}
            {venue.venue_type === 'home_game' && venue.description && (
                <p style={{ fontSize: 12, color: '#8b949e', marginTop: 2, marginBottom: 6, lineHeight: 1.4, fontStyle: 'italic' }}>{venue.description}</p>
            )}

            {/* Mini-badge Row */}
            <div className="badge-row">
                {venue.is_featured && <span className="mini-badge featured-badge">Featured</span>}
                {isNewcomer && <span className="mini-badge newcomer-badge">Newcomer Friendly</span>}
                {hasPromo && <span className="mini-badge promo-badge">Active Promo</span>}
                {venue.live_data && venue.live_data.tables_running > 0 && <span className="mini-badge live-badge" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>LIVE: {venue.live_data.tables_running} Tables</span>}
                {venue.has_tournaments && <span className="mini-badge tourney-badge">Tournaments</span>}
                {checkinCount > 0 && <span className="mini-badge" style={{ background: 'rgba(230,81,0,0.15)', color: '#E65100', border: '1px solid rgba(230,81,0,0.3)', cursor: 'pointer' }} onClick={e => { e.stopPropagation(); onNavigate && onNavigate(detailUrl + '#checkins'); }}>{checkinCount} here today</span>}
            </div>

            {/* Hours */}
            {venue.hours && (
                <p className="card-hours">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ verticalAlign: -1, marginRight: 4, opacity: 0.5 }}>
                        <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                    </svg>
                    {venue.hours === '24/7' ? 'Open 24/7' : venue.hours}
                </p>
            )}

            {/* Game Tags */}
            <div className="card-tags">
                {Array.isArray(venue.games_offered) && venue.games_offered.slice(0, 4).map((g, idx) => (
                    <span key={g || idx} className="tag game">{g}</span>
                ))}
            </div>

            {/* Stakes */}
            {Array.isArray(venue.stakes_cash) && venue.stakes_cash.length > 0 && (
                <p className="venue-stakes">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#d4a853" strokeWidth="2" style={{ verticalAlign: -1, marginRight: 4 }}>
                        <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
                    </svg>
                    {venue.stakes_cash.slice(0, 3).join(', ')}
                </p>
            )}

            {/* Trust Score Bar */}
            <div className="trust-score-row">
                <span className="trust-score-label" style={{ color: trust.color }}>Trust: {trust.label}</span>
                <div className="trust-score-bar">
                    <div className="trust-score-fill" style={{ width: trust.pct + '%', background: trust.color }} />
                </div>
                <span className="trust-score-val" style={{ color: trust.color }}>{venue.trust_score || '-'}/5</span>
            </div>

            {/* Action Buttons Row — with SVG icons */}
            <div className="venue-action-row">
                {venue.website && (
                    <a href={venue.website.startsWith('http') ? venue.website : 'https://' + venue.website} target="_blank" rel="noopener noreferrer" className="venue-action-btn" onClick={e => e.stopPropagation()} title="Website">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
                        </svg>
                        <span>Web</span>
                    </a>
                )}
                {venue.phone && (
                    <a href={'tel:' + venue.phone} className="venue-action-btn" onClick={e => e.stopPropagation()} title="Call">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
                        </svg>
                        <span>Call</span>
                    </a>
                )}
                <a href={'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent((venue.address || '') + ' ' + (venue.name || '') + ' ' + (venue.city || '') + ' ' + (venue.state || ''))}
                    target="_blank" rel="noopener noreferrer" className="venue-action-btn" onClick={e => e.stopPropagation()} title="Directions">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polygon points="3 11 22 2 13 21 11 13 3 11" />
                    </svg>
                    <span>Map</span>
                </a>
            </div>

            {/* Quick Actions */}
            <div className="venue-quick-actions">
                <button className="venue-quick-btn checkin" onClick={e => { e.stopPropagation(); onNavigate && onNavigate(detailUrl + '?action=checkin'); }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 11.08V12a10 10 0 11-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                    Check In
                </button>
                <button className="venue-quick-btn review" onClick={e => { e.stopPropagation(); onNavigate && onNavigate(detailUrl + '?action=review'); }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                    Review
                </button>
                <button className="venue-quick-btn details" onClick={e => { e.stopPropagation(); onNavigate && onNavigate(detailUrl); }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
                    </svg>
                    Details
                </button>
            </div>
        </div>
    );
}
