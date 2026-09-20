import React from 'react';
import Link from 'next/link';
import { parseCalendarDate, parseStopDates, pokerCalendarStart } from '../../utils/tourGeoUtils';
import useTrackedTours from '../../hooks/useTrackedTours';
import CasinoActionDialog from '../poker-near-me/CasinoActionDialog';
import { tourCanonical } from '../../lib/seo/tourPageSeo';

export const TOUR_COLORS = {
    'WSOP': { bg: 'linear-gradient(135deg, #c9a227, #8b6914)', text: '#000', border: '#c9a227', fill: '#c9a227' },
    'WPT': { bg: 'linear-gradient(135deg, #dc2626, #991b1b)', text: '#fff', border: '#dc2626', fill: '#dc2626' },
    'WSOPC': { bg: 'linear-gradient(135deg, #c9a227, #8b6914)', text: '#000', border: '#c9a227', fill: '#c9a227' },
    'MSPT': { bg: 'linear-gradient(135deg, #1e40af, #1e3a8a)', text: '#fff', border: '#3b82f6', fill: '#3b82f6' },
    'RGPS': { bg: 'linear-gradient(135deg, #059669, #047857)', text: '#fff', border: '#10b981', fill: '#10b981' },
    'PGT': { bg: 'linear-gradient(135deg, #7c3aed, #5b21b6)', text: '#fff', border: '#8b5cf6', fill: '#8b5cf6' },
    'TRITON': { bg: 'linear-gradient(135deg, #0891b2, #0e7490)', text: '#fff', border: '#06b6d4', fill: '#06b6d4' },
    'NAPT': { bg: 'linear-gradient(135deg, #dc2626, #991b1b)', text: '#fff', border: '#f87171', fill: '#f87171' },
    'CPPT': { bg: 'linear-gradient(135deg, #0f766e, #134e4a)', text: '#fff', border: '#2dd4bf', fill: '#2dd4bf' },
    'FPN': { bg: 'linear-gradient(135deg, #4338ca, #312e81)', text: '#fff', border: '#818cf8', fill: '#818cf8' },
    'LIPS': { bg: 'linear-gradient(135deg, #be185d, #831843)', text: '#fff', border: '#ec4899', fill: '#ec4899' },
    'ROUGHRIDER': { bg: 'linear-gradient(135deg, #854d0e, #713f12)', text: '#fff', border: '#d97706', fill: '#d97706' },
    'PAT': { bg: 'linear-gradient(135deg, #15803d, #166534)', text: '#fff', border: '#22c55e', fill: '#22c55e' },
    'GCPT': { bg: 'linear-gradient(135deg, #0e7490, #155e75)', text: '#fff', border: '#06b6d4', fill: '#06b6d4' },
    'default': { bg: 'linear-gradient(135deg, #374151, #1f2937)', text: '#fff', border: '#4b5563', fill: '#6b7280' }
};

export const TOUR_TYPE_INFO = {
    major: { label: 'Major Tour', color: '#c9a227' },
    circuit: { label: 'Circuit', color: '#3b82f6' },
    high_roller: { label: 'High Roller', color: '#8b5cf6' },
    regional: { label: 'Regional', color: '#10b981' },
    grassroots: { label: 'Grassroots', color: '#f59e0b' },
    charity: { label: 'Charity', color: '#ec4899' },
};

function formatMoney(amount) {
    if (amount === null || amount === undefined || amount === '') return '';
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(num)) return '';
    if (num >= 1000000) return '$' + (num / 1000000).toFixed(0) + 'M';
    if (num >= 1000) return '$' + (num / 1000).toFixed(0) + 'K';
    return '$' + num.toLocaleString();
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = parseCalendarDate(dateStr);
    if (!date) return '';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function safeHref(url) {
    if (!url) return undefined;
    const s = String(url).replace(/[\x00-\x20\x7F]/g, '');
    if (/^(javascript|data|vbscript|file):/i.test(s)) return '#xss';
    return s;
}

export default function TourCard({ 
    tour, 
    tourCurrentStops, 
    favorites, 
    toggleFavorite, 
    handleTourClick,
    searchQuery,
    dateRangeCutoff,
    getMatchingStops
}) {
    const {
        isTracking,
        toggleTrackTour,
        actionNotice,
        clearActionNotice,
    } = useTrackedTours();
    const isTracked = isTracking(tour.tour_code);
    const colors = TOUR_COLORS[tour.tour_code] || TOUR_COLORS.default;
    const typeInfo = TOUR_TYPE_INFO[tour.tour_type] || { label: tour.tour_type || 'Tour', color: '#6b7280' };
    const isFav = !!favorites[tour.tour_code];
    const buyinMin = tour.typical_buyins?.min;
    const buyinMax = tour.typical_buyins?.max;
    const hasBuyins = buyinMin != null || buyinMax != null;
    
    // Prefer API-provided upcoming_series, fall back to registry stops
    let series = tour.upcoming_series || [];
    if (series.length === 0) {
        const allStops = [...(tour.stops_2026 || []), ...(tour.series_2026 || [])];
        const today = pokerCalendarStart();
        series = allStops.map(s => {
            const parsed = parseStopDates(s.dates);
            if (!parsed || parsed.end < today) return null;
            return {
                short_name: s.name || s.venue || 'Tour Stop',
                start_date: parsed.start.toISOString().split('T')[0],
                end_date: parsed.end.toISOString().split('T')[0],
                dates: s.dates,
            };
        }).filter(Boolean).sort((a, b) => a.start_date.localeCompare(b.start_date));
    }
    const regions = tour.regions || [];

    const isHoverable = true; // Kept for extension
    // DOM Virtualization Style (Phase 2 constraint natively achieved via CSS)
    const virtualStyle = { contentVisibility: 'auto', containIntrinsicSize: '300px' };

    const handleNoticeAction = () => {
        const noticeKind = actionNotice?.kind;
        clearActionNotice();
        if (noticeKind === 'auth') {
            window.location.assign(
                `/auth/login?redirect=${encodeURIComponent('/hub/poker-tours')}`
            );
            return;
        }
        void toggleTrackTour(tour.tour_code);
    };

    // tour.detail_path is resolved in pages/api/poker/tours.js, where a tour
    // held under two database codes is reduced to the one the sitemap offers.
    // tourCanonical is the fallback for a payload that predates that field,
    // and it is the same function the sitemap and the tour page itself use,
    // so this href cannot drift from the URL the page is indexed at.
    const detailHref = tour.detail_path || (tour.tour_code ? tourCanonical(tour.tour_code) : null);

    return (
        <>
        <div
            className="tour-card-premium"
            onClick={() => handleTourClick(tour)}
            style={virtualStyle}
        >
            <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: '8px' }}>
                {/* Track Tour Button (Phase 4) */}
                <button
                    className={'tour-fav-btn' + (isTracked ? ' active' : '')}
                    onClick={e => { e.stopPropagation(); toggleTrackTour(tour.tour_code); }}
                    aria-label="Track tour notifications"
                    style={{ position: 'relative', top: 0, right: 0 }}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill={isTracked ? '#4ade80' : 'none'} stroke={isTracked ? '#4ade80' : 'rgba(255,255,255,0.4)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                        <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                    </svg>
                </button>
                {/* Favorite Button */}
                <button
                    className={'tour-fav-btn' + (isFav ? ' active' : '')}
                    onClick={e => toggleFavorite(tour.tour_code, e)}
                    aria-label="Favorite tour"
                    style={{ position: 'relative', top: 0, right: 0 }}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill={isFav ? '#ef4444' : 'none'} stroke={isFav ? '#ef4444' : 'rgba(255,255,255,0.4)'} strokeWidth="2">
                        <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                    </svg>
                </button>
            </div>

            {/* Card Header — Logo + Badge + Type */}
            <div className="tour-card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {tour.logo_url && (
                        <div className="tour-logo-container">
                            <img
                                src={tour.logo_url}
                                alt={tour.tour_name + ' logo'}
                                className="tour-logo-img"
                                onError={e => { e.target.style.display = 'none'; }}
                            />
                        </div>
                    )}
                    <div
                        className="tour-code-badge"
                        style={{ background: colors.bg, border: '1px solid ' + colors.border }}
                    >
                        <span style={{ color: colors.text, fontSize: 14, fontWeight: 800, letterSpacing: '0.5px' }}>
                            {tour.tour_code || 'TOUR'}
                        </span>
                    </div>
                </div>
                <span
                    className="tour-type-pill"
                    style={{ color: typeInfo.color, borderColor: typeInfo.color + '40', background: typeInfo.color + '15' }}
                >
                    {typeInfo.label}
                </span>
            </div>

            {/* Tour Name */}
            <h4 className="tour-card-name">{tour.tour_name || 'Unknown Tour'}</h4>

            {/* Current Location — shows active stop, not headquarters */}
            {(() => {
                const stopInfo = tourCurrentStops[tour.tour_code];
                const activeStop = stopInfo?.activeStop;
                if (activeStop) {
                    const stopLocation = activeStop.location || activeStop.venue || '';
                    const stopVenue = activeStop.venue || '';
                    return (
                        <div className="tour-card-location-live">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={stopInfo.isLive ? '#22c55e' : '#60a5fa'} strokeWidth="2" style={{ flexShrink: 0 }}>
                                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
                                </svg>
                                <span style={{ color: stopInfo.isLive ? '#22c55e' : '#60a5fa', fontWeight: 700, fontSize: 12, letterSpacing: '0.3px' }}>
                                    {stopInfo.isLive ? 'LIVE NOW' : 'NEXT STOP'}
                                </span>
                            </div>
                            {stopVenue && <span className="tour-stop-venue">{stopVenue}</span>}
                            <span className="tour-stop-location">{stopLocation}</span>
                        </div>
                    );
                }
                // Fallback to headquarters when no active stop
                return tour.headquarters ? (
                    <p className="tour-card-location">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
                        </svg>
                        {tour.headquarters}
                    </p>
                ) : null;
            })()}

            {/* Buy-in Range */}
            {hasBuyins && (
                <div className="tour-card-buyins">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                        <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
                    </svg>
                    <span>
                        Buy-Ins: {formatMoney(buyinMin)}{buyinMin != null && buyinMax != null ? ' - ' : ''}{formatMoney(buyinMax)}
                    </span>
                </div>
            )}

            {/* Regions */}
            {regions.length > 0 && (
                <div className="tour-card-tags">
                    {regions.slice(0, 5).map(r => (
                        <span key={r} className="tour-region-tag">{r}</span>
                    ))}
                </div>
            )}

            {/* Upcoming Series — with search-highlighted stops */}
            {(() => {
                const matchedStops = getMatchingStops(tour);
                const displayStops = matchedStops || (series.length > 0 ? series : null);
                if (!displayStops || displayStops.length === 0) return null;

                const isDateSet = dateRangeCutoff != null;
                const isHighlighted = !!matchedStops && (!!searchQuery || isDateSet);
                const headerLabel = isHighlighted
                    ? `Matching Stops (${displayStops.length})`
                    : `Upcoming Stops (${displayStops.length})`;

                return (
                    <div className={`tour-card-series${isHighlighted ? ' highlighted' : ''}`}>
                        <div className="tour-series-header">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={isHighlighted ? '#ffffff' : 'currentColor'} strokeWidth="2">
                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                            </svg>
                            {headerLabel}
                        </div>
                        {displayStops.slice(0, 5).map((s, i) => (
                            <div key={i} className={`tour-series-item${s.isSearchMatch ? ' search-match' : ''}`}>
                                <span className="tour-series-name">{s.short_name || s.name || s.venue || 'TBD'}</span>
                                <span className="tour-series-dates">
                                    {s.dates ? s.dates : (
                                        formatDate(s.start_date) + (s.end_date ? ' - ' + formatDate(s.end_date) : '')
                                    )}
                                </span>
                            </div>
                        ))}
                        {displayStops.length > 5 && (
                            <div className="tour-series-more">
                                +{displayStops.length - 5} More stop{displayStops.length - 5 > 1 ? 's' : ''}
                            </div>
                        )}
                    </div>
                );
            })()}

            {/* Card Footer */}
            <div className="tour-card-footer">
                {tour.established && (
                    <span className="tour-card-established">Est. {tour.established}</span>
                )}
                <div className="tour-card-actions">
                    {/* A REAL LINK, NOT A CLICK (AEO phase 3, 2026-09-19).
                        This card used to navigate only through the wrapper's
                        onClick, so the server HTML carried no href and every
                        one of the 28 tour pages was unreachable by following
                        links. tour.detail_path is resolved in
                        pages/api/poker/tours.js, the same place the sitemap
                        agrees with. */}
                    {detailHref ? (
                        <Link
                            href={detailHref}
                            className="tour-action-btn primary"
                            onClick={e => e.stopPropagation()}
                        >
                            Details
                        </Link>
                    ) : (
                        <span className="tour-action-btn primary">Details</span>
                    )}
                    {(tour.official_website) && (
                        <a
                            href={safeHref(tour.official_website.startsWith('http') ? tour.official_website : 'https://' + tour.official_website)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="tour-action-btn"
                            onClick={e => e.stopPropagation()}
                        >
                            Website
                        </a>
                    )}
                </div>
            </div>
        </div>
        <CasinoActionDialog
            open={Boolean(actionNotice)}
            eyebrow={actionNotice?.kind === 'auth' ? 'Account Required' : 'Tour Alert Status'}
            title={actionNotice?.title || 'Tour Alert Status'}
            message={actionNotice?.message || ''}
            cancelLabel="Close"
            confirmLabel={actionNotice?.kind === 'auth' ? 'Sign In' : 'Try Again'}
            onClose={clearActionNotice}
            onConfirm={handleNoticeAction}
        />
        </>
    );
}
