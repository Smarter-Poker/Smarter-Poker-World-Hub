/**
 * VenueCard - Poker venue card for Poker Near Me page
 */

const VENUE_TYPE_LABELS = {
    casino: 'Casino',
    card_room: 'Card Room',
    poker_club: 'Poker Club',
    home_game: 'Home Game',
    charity: 'Charity Room'
};

function getTrustLevel(score) {
    if (score >= 4.5) return { label: 'High', color: '#22c55e' };
    if (score >= 4.0) return { label: 'Good', color: '#3b82f6' };
    if (score >= 3.0) return { label: 'Moderate', color: '#f59e0b' };
    return { label: 'Low', color: '#ef4444' };
}

// Get the correct detail URL for a venue or social page
function getVenueUrl(venue) {
    if (venue.is_social_page && venue.social_page_id) {
        return '/club/' + venue.social_page_id;
    }
    return '/hub/venues/' + venue.id;
}

export default function VenueCard({ venue, isFavorited, isNewcomer, hasPromo, onFavorite, onNavigate }) {
    const trust = getTrustLevel(venue.trust_score);
    const detailUrl = getVenueUrl(venue);

    return (
        <div className="entity-card venue-card" onClick={() => onNavigate && onNavigate(detailUrl)} style={{ cursor: 'pointer' }}>
            <button className={'fav-btn' + (isFavorited ? ' active' : '')} onClick={(e) => { e.stopPropagation(); onFavorite && onFavorite(e); }} title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill={isFavorited ? '#ef4444' : 'none'} stroke={isFavorited ? '#ef4444' : 'rgba(255,255,255,0.4)'} strokeWidth="2">
                    <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                </svg>
            </button>
            <div className="card-header">
                <h4>{venue.name}</h4>
                <span className="badge venue-type">{VENUE_TYPE_LABELS[venue.venue_type] || venue.venue_type}</span>
            </div>
            <p className="card-location">
                {venue.address ? (venue.address + ' - ') : ''}{venue.city || ''}{venue.city && venue.state ? ', ' : ''}{venue.state || ''}
            </p>
            <div className="badge-row">
                {venue.is_featured && <span className="mini-badge featured-badge">Featured</span>}
                {isNewcomer && <span className="mini-badge newcomer-badge">Newcomer Friendly</span>}
                {hasPromo && <span className="mini-badge promo-badge">Active Promo</span>}
                {venue.has_tournaments && <span className="mini-badge tourney-badge">Tournaments</span>}
            </div>
            {venue.hours && (
                <p className="card-hours">{venue.hours === '24/7' ? 'Open 24/7' : venue.hours}</p>
            )}
            <div className="card-tags">
                {venue.distance_mi && <span className="tag distance">{venue.distance_mi} mi</span>}
                {venue.games_offered && venue.games_offered.slice(0, 4).map(g => (
                    <span key={g} className="tag game">{g}</span>
                ))}
            </div>
            {venue.stakes_cash && venue.stakes_cash.length > 0 && (
                <p className="card-detail">Stakes: {venue.stakes_cash.slice(0, 3).join(', ')}</p>
            )}
            <div className="card-footer">
                <span className="trust-badge" style={{ color: trust.color }}>Trust: {trust.label} ({venue.trust_score || '-'})</span>
                <div className="card-actions">
                    {venue.website && (
                        <a href={venue.website.startsWith('http') ? venue.website : 'https://' + venue.website} target="_blank" rel="noopener noreferrer" className="action-btn" onClick={e => e.stopPropagation()}>Web</a>
                    )}
                    {venue.phone && <a href={'tel:' + venue.phone} className="action-btn" onClick={e => e.stopPropagation()}>Call</a>}
                    <a href={'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent((venue.address || '') + ' ' + venue.name + ' ' + venue.city + ' ' + venue.state)}
                        target="_blank" rel="noopener noreferrer" className="action-btn" onClick={e => e.stopPropagation()}>Map</a>
                </div>
            </div>
            <div className="quick-actions">
                <button className="quick-btn checkin-btn" onClick={e => { e.stopPropagation(); onNavigate && onNavigate(detailUrl + '?action=checkin'); }}>Check In</button>
                <button className="quick-btn review-btn" onClick={e => { e.stopPropagation(); onNavigate && onNavigate(detailUrl + '?action=review'); }}>Review</button>
                <span className="action-btn primary" style={{ flex: 1, textAlign: 'center' }}>Details</span>
            </div>
        </div>
    );
}
