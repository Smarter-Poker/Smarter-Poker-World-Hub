/**
 * RichTourCard — Matches the EXACT card format shown on /hub/tours/[code].js
 * Fetches live data via SWR so it shows real-time LIVE NOW / NEXT STOP / upcoming stops.
 * Used in VenuesTabPanel and wherever tour stops appear in the PNM page.
 */
import React from 'react';
import useSWR from 'swr';

const TOUR_COLORS = {
    'WSOP':      { bg: 'linear-gradient(135deg, #c9a227, #8b6914)', text: '#000' },
    'WPT':       { bg: 'linear-gradient(135deg, #dc2626, #991b1b)', text: '#fff' },
    'WSOPC':     { bg: 'linear-gradient(135deg, #c9a227, #8b6914)', text: '#000' },
    'MSPT':      { bg: 'linear-gradient(135deg, #1e40af, #1e3a8a)', text: '#fff' },
    'RGPS':      { bg: 'linear-gradient(135deg, #059669, #047857)', text: '#fff' },
    'PGT':       { bg: 'linear-gradient(135deg, #7c3aed, #5b21b6)', text: '#fff' },
    'TRITON':    { bg: 'linear-gradient(135deg, #0891b2, #0e7490)', text: '#fff' },
    'NAPT':      { bg: 'linear-gradient(135deg, #dc2626, #991b1b)', text: '#fff' },
    'CPPT':      { bg: 'linear-gradient(135deg, #0f766e, #134e4a)', text: '#fff' },
    'FPN':       { bg: 'linear-gradient(135deg, #4338ca, #312e81)', text: '#fff' },
    'LIPS':      { bg: 'linear-gradient(135deg, #be185d, #831843)', text: '#fff' },
    'ROUGHRIDER':{ bg: 'linear-gradient(135deg, #854d0e, #713f12)', text: '#fff' },
    'default':   { bg: 'linear-gradient(135deg, #374151, #1f2937)', text: '#fff' },
};

// CLAUDE.md rule: no bare emoji in source/JSX (bare emoji have broken the SWC
// compile and Vercel builds). Inline SVGs replace the former pin/money glyphs.
function PinIcon({ size = 12 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{ flexShrink: 0 }}>
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
        </svg>
    );
}

function MoneyIcon({ size = 12 }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{ flexShrink: 0 }}>
            <line x1="12" y1="1" x2="12" y2="23" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
    );
}

const TOUR_TYPE_LABELS = {
    major: 'Major', circuit: 'Circuit', regional: 'Regional',
    high_roller: 'High Roller', grassroots: 'Grassroots', charity: 'Charity',
};

function formatMoney(amount) {
    if (!amount && amount !== 0) return '';
    if (amount >= 1000000) return '$' + (amount / 1000000).toFixed(1) + 'M';
    if (amount >= 1000) return '$' + (amount / 1000).toFixed(0) + 'K';
    return '$' + amount.toLocaleString();
}

function formatDateRange(startDate, endDate) {
    if (!startDate) return 'TBD';
    const start = new Date(startDate + 'T00:00:00');
    const end = endDate ? new Date(endDate + 'T00:00:00') : null;
    const startFmt = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (!end) return startFmt;
    const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
    if (sameMonth) return startFmt + ' - ' + end.getDate();
    const endFmt = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return startFmt + ' - ' + endFmt;
}

// Skeleton shown while live data loads
function TourCardSkeleton({ venue }) {
    const code = venue.tour_code || '';
    const tourColor = TOUR_COLORS[code] || TOUR_COLORS.default;
    return (
        <div className="entity-card tour-card rich-tour-card" style={{ minHeight: 120 }}>
            <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {venue.logo_url ? (
                    <img src={venue.logo_url} alt={code}
                        style={{ width: 44, height: 44, borderRadius: 6, objectFit: 'contain', background: 'rgba(255,255,255,0.9)', padding: 2 }} />
                ) : (
                    <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        padding: '8px 16px', borderRadius: 6, background: tourColor.bg, minWidth: 70 }}>
                        <span style={{ color: tourColor.text, fontSize: 14, fontWeight: 800 }}>{code || 'TOUR'}</span>
                    </div>
                )}
                <div style={{ opacity: 0.4, fontSize: 13 }}>Loading live data...</div>
            </div>
            <h4 style={{ margin: '8px 0 4px', fontSize: 16, fontWeight: 700 }}>{venue.tour_name || venue.name}</h4>
        </div>
    );
}

export default function RichTourCard({ venue, isFavorited, onFavorite, onNavigate }) {
    const tourCode = venue.tour_code || '';
    const detailUrl = tourCode ? '/hub/tours/' + tourCode : '/hub/venues/' + venue.id;

    // Fetch live tour data — same endpoint as tours/[code].js
    const swrKey = tourCode ? `/api/poker/tours?tour_code=${encodeURIComponent(tourCode)}&include_series=true` : null;
    const { data: swrData } = useSWR(swrKey, url => fetch(url).then(r => r.json()).catch(() => null), {
        revalidateOnFocus: false,
        dedupingInterval: 300_000, // 5 min — tours data doesn't change often
    });

    // Fetch live schedule (current/next stop)
    const scheduleKey = tourCode ? `/api/poker/tour-schedule?tour_code=${encodeURIComponent(tourCode)}&all_stops=true` : null;
    const { data: scheduleData } = useSWR(scheduleKey, url => fetch(url).then(r => r.json()).catch(() => null), {
        revalidateOnFocus: false,
        dedupingInterval: 300_000,
    });

    // PERFORMANCE FIX (partial): both requests were previously fired with no loading
    // state, so while they were in flight a card with NO registry payload showed a bare
    // header with no LIVE NOW / stops section and then reflowed. TourCardSkeleton was
    // written for exactly this gap and was never rendered — render it now.
    // IMPORTANT: only when there is nothing to show yet. `venue.tour_card_data` is the
    // registry snapshot useTourMapStops attaches (name, type, buy-ins, regions,
    // website); `displayTour` below is explicitly designed to render it while the live
    // requests are in flight, so swapping a fully populated card for a skeleton would
    // REMOVE content that used to paint immediately.
    // NOT FIXED HERE: each card still issues its own pair of requests (N+1 across a
    // list of tours). Collapsing that needs a batch endpoint / `tour_codes=` list param
    // on /api/poker/tours + /api/poker/tour-schedule, which is outside this file.
    const hasRegistryFallback = !!(venue.tour_card_data && Object.keys(venue.tour_card_data).length > 0);
    const isLoadingLiveData = !!tourCode
        && !hasRegistryFallback
        && (swrData === undefined || scheduleData === undefined);

    const tour = swrData?.data?.[0] || null;
    const allStops = scheduleData?.stops || [];
    // When tour-schedule falls back to registry data it answers `events` with no
    // `stops` key, so allStops is silently [] and the card showed no stop information
    // at all with no explanation. Say so explicitly.
    const isRegistryFallback = scheduleData?.data_source === 'registry_fallback' && allStops.length === 0;
    const currentStop = allStops.find(s => s.stop_type === 'current') || allStops.find(s => s.stop_type === 'next') || null;
    const currentStopType = currentStop?.stop_type || null;

    // Upcoming stops — next 5, genuinely in the future.
    // BUG FIX: filtering only 'current' meant (a) the stop already rendered in the
    // NEXT STOP banner was repeated as row 1, and (b) when fewer than 5 future stops
    // existed the API's trailing 'past' stops filled the list with stale dates.
    // allStops order from /api/poker/tour-schedule is [current, next, ...future, ...past].
    const upcomingStops = allStops
        .filter(s => s.stop_type === 'future' || (s.stop_type === 'next' && s !== currentStop))
        .slice(0, 5);

    // Fallback to registry data from tour_card_data while live data loads
    const displayTour = tour || venue.tour_card_data || {};
    const tourColor = TOUR_COLORS[tourCode] || TOUR_COLORS.default;
    const tourTypeLabel = TOUR_TYPE_LABELS[displayTour.tour_type] || displayTour.tour_type || '';
    const logoUrl = displayTour.logo_url || venue.logo_url;

    // Buy-in range
    const buyins = displayTour.typical_buyins;
    const buyinText = buyins && (buyins.min || buyins.max)
        ? [buyins.min && formatMoney(buyins.min), buyins.max && formatMoney(buyins.max)].filter(Boolean).join(' – ')
        : null;

    if (isLoadingLiveData) {
        return <TourCardSkeleton venue={venue} />;
    }

    return (
        <div
            className="entity-card tour-card rich-tour-card"
            onClick={() => onNavigate && onNavigate(detailUrl)}
            style={{ cursor: 'pointer', position: 'relative' }}
        >
            {/* Fav button */}
            <button
                className={'fav-btn' + (isFavorited ? ' active' : '')}
                onClick={(e) => { e.stopPropagation(); onFavorite && onFavorite(e); }}
                aria-label="Favorite"
            >
                <svg width="16" height="16" viewBox="0 0 24 24"
                    fill={isFavorited ? '#ef4444' : 'none'}
                    stroke={isFavorited ? '#ef4444' : 'rgba(255,255,255,0.4)'}
                    strokeWidth="2">
                    <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                </svg>
            </button>

            {/* Header Row: logo + badges */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                {logoUrl ? (
                    <img src={logoUrl} alt={tourCode}
                        style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'contain',
                            background: 'rgba(255,255,255,0.95)', padding: 3, border: '1px solid rgba(255,255,255,0.15)',
                            flexShrink: 0 }} />
                ) : (
                    <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        padding: '8px 14px', borderRadius: 6, background: tourColor.bg, minWidth: 64, flexShrink: 0 }}>
                        <span style={{ color: tourColor.text, fontSize: 14, fontWeight: 800, letterSpacing: '0.5px' }}>
                            {tourCode || 'TOUR'}
                        </span>
                    </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        {/* Tour code badge */}
                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            padding: '3px 10px', borderRadius: 5, background: tourColor.bg, fontSize: 12, fontWeight: 800,
                            color: tourColor.text, letterSpacing: '0.5px' }}>
                            {tourCode || 'TOUR'}
                        </span>
                        {/* Tour type badge */}
                        {tourTypeLabel && (
                            <span style={{ padding: '3px 8px', borderRadius: 5, fontSize: 11, fontWeight: 600,
                                background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)',
                                border: '1px solid rgba(255,255,255,0.12)' }}>
                                {tourTypeLabel}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            {/* Tour Name */}
            <h4 style={{ margin: '0 0 8px', fontSize: 17, fontWeight: 800, color: '#fff', lineHeight: 1.2 }}>
                {displayTour.tour_name || venue.tour_name || venue.name || 'Poker Tour'}
            </h4>

            {/* LIVE NOW / NEXT STOP banner */}
            {currentStop && (
                <div style={{
                    padding: '8px 12px', borderRadius: 8, marginBottom: 10,
                    background: currentStopType === 'current'
                        ? 'rgba(16, 185, 129, 0.12)' : 'rgba(59, 130, 246, 0.12)',
                    border: currentStopType === 'current'
                        ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(59, 130, 246, 0.3)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span style={{
                            display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
                            background: currentStopType === 'current' ? '#10b981' : '#3b82f6',
                            boxShadow: currentStopType === 'current'
                                ? '0 0 6px #10b981' : '0 0 6px #3b82f6',
                        }} />
                        <span style={{
                            fontSize: 11, fontWeight: 800, letterSpacing: '0.5px',
                            color: currentStopType === 'current' ? '#10b981' : '#3b82f6',
                        }}>
                            {currentStopType === 'current' ? 'LIVE NOW' : 'NEXT STOP'}
                        </span>
                    </div>
                    {currentStop.stop_name && (
                        <div style={{ fontWeight: 700, fontSize: 13, color: '#fff', marginTop: 2 }}>
                            {currentStop.stop_name}
                        </div>
                    )}
                    {currentStop.stop_venue && (
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
                            {currentStop.stop_venue}
                        </div>
                    )}
                    {(currentStop.stop_city || currentStop.stop_state) && (
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                            {[currentStop.stop_city, currentStop.stop_state].filter(Boolean).join(', ')}
                        </div>
                    )}
                    {currentStop.stop_start_date && (
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                            {formatDateRange(currentStop.stop_start_date, currentStop.stop_end_date)}
                        </div>
                    )}
                </div>
            )}

            {/* Fallback: show host venue if no schedule loaded yet */}
            {!currentStop && (venue.stop_venue || venue.city) && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>
                    <PinIcon />
                    <span>{[venue.stop_venue, venue.city, venue.state].filter(Boolean).join(', ')}</span>
                </div>
            )}

            {/* Buy-in range */}
            {buyinText && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <span style={{ display: 'inline-flex', color: 'rgba(255,255,255,0.4)' }}><MoneyIcon /></span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#eab308' }}>
                        Buy-ins: {buyinText}
                    </span>
                </div>
            )}

            {/* Regions */}
            {displayTour.regions && displayTour.regions.length > 0 && (
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 8 }}>
                    {displayTour.regions.slice(0, 3).map(r => (
                        <span key={r} style={{
                            padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                            background: 'rgba(100,116,139,0.15)', color: '#94a3b8',
                            border: '1px solid rgba(100,116,139,0.2)'
                        }}>{r}</span>
                    ))}
                </div>
            )}

            {/* Schedule not published yet — the API answered from the registry fallback,
                which carries no stops. Without this the card just showed nothing. */}
            {isRegistryFallback && (
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>
                    Schedule not yet published
                </div>
            )}

            {/* Upcoming Stops list */}
            {upcomingStops.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)',
                        textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6,
                        display: 'flex', alignItems: 'center', gap: 4 }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
                            <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                        </svg>
                        Upcoming Stops ({upcomingStops.length})
                    </div>
                    {upcomingStops.map((s, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '4px 0', borderBottom: i < upcomingStops.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', flex: 1, minWidth: 0,
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {s.stop_name || s.name}
                            </span>
                            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', flexShrink: 0, marginLeft: 8 }}>
                                {formatDateRange(s.stop_start_date, s.stop_end_date) || s.dates || 'TBD'}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {/* Footer: Est. + actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8,
                paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                {displayTour.established && (
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
                        Est. {displayTour.established}
                    </span>
                )}
                <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                    <span style={{ padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                        background: '#1e40af', color: '#fff', cursor: 'pointer' }}>
                        Details
                    </span>
                    {displayTour.official_website && (
                        <a
                            href={displayTour.official_website.startsWith('http') ? displayTour.official_website : 'https://' + displayTour.official_website}
                            target="_blank" rel="noopener noreferrer"
                            style={{ padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                                background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.7)',
                                border: '1px solid rgba(255,255,255,0.12)', textDecoration: 'none', cursor: 'pointer' }}
                            onClick={e => e.stopPropagation()}
                        >
                            Website
                        </a>
                    )}
                </div>
            </div>
        </div>
    );
}
