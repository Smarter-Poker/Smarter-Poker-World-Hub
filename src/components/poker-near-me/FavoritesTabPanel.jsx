/**
 * FavoritesTabPanel — Extracted from poker-near-me.js renderFavorites()
 * Saved/favorited venues listing.
 */
import React from 'react';
import dynamic from 'next/dynamic';

const VenueCard = dynamic(() => import('./VenueCard'), { ssr: false });

export default function FavoritesTabPanel({
    allVenuesForMap,
    venues,
    isFavorited,
    favorites,
    toggleFavorite,
    venueMaxGtd,
    promotionVenueIds = new Set(),
    pnmReviewStatsMap,
    setActiveTab,
    router,
    openVenueModal,
}) {
    const favVenues = (allVenuesForMap.length > 0 ? allVenuesForMap : venues).filter(v => isFavorited('venue', v.id));

    if (favVenues.length === 0) {
        return (
            <div className="empty-state" style={{ padding: '60px 20px', background: 'radial-gradient(circle at center, rgba(239,68,68,0.05) 0%, transparent 70%)' }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                        <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                    </svg>
                </div>
                <h3 style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 8 }}>Your Saved Venues</h3>
                <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', maxWidth: 320, lineHeight: 1.5, margin: '0 auto 24px' }}>Keep Track Of Your Favorite Card Rooms, Local Games, And Regular Stops. Tap The Heart Icon On Any Venue Card To Save It Here.</p>
                <button onClick={() => setActiveTab('venues')} className="primary-btn" style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '12px 24px', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', boxShadow: '0 4px 14px rgba(239,68,68,0.3)' }}>Explore Venues</button>
            </div>
        );
    }

    return (
        <>
            <div className="results-bar">
                <span className="results-count">{favVenues.length} saved venue{favVenues.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="card-grid">
                {favVenues.map((venue, i) => {
                    const maxGtd = venueMaxGtd[String(venue.id)] || 0;
                    return (
                        <VenueCard
                            key={venue.id || i}
                            venue={{ ...venue, max_gtd: maxGtd }}
                            index={i}
                            isFavorited={true}
                            hasPromo={promotionVenueIds.has(String(venue.id))}
                            onFavorite={(e) => toggleFavorite('venue', venue.id, e, venue)}
                            onNavigate={openVenueModal}
                            reviewStats={pnmReviewStatsMap[String(venue.id)]}
                        />
                    );
                })}
            </div>
        </>
    );
}
