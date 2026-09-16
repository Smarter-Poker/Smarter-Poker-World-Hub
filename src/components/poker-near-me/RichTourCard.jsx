/**
 * RichTourCard — Matches the EXACT card format shown on /hub/tours/[code].js
 * Fetches live data via SWR so it shows real-time LIVE NOW / NEXT STOP / upcoming stops.
 * Used in VenuesTabPanel and wherever tour stops appear in the PNM page.
 */
import React from 'react';
import useSWR from 'swr';
import { PokerNearMeConsoleIcon, PokerNearMePanelShell } from './PokerNearMeConsole';

const TOUR_TONES = {
    'WSOP': 'gold', 'WPT': 'red', 'WSOPC': 'gold', 'MSPT': 'blue',
    'RGPS': 'green', 'PGT': 'violet', 'TRITON': 'blue', 'NAPT': 'red',
    'CPPT': 'green', 'FPN': 'violet', 'LIPS': 'red', 'ROUGHRIDER': 'gold',
    'default': 'silver',
};

// Labels stay in the DOM; painted control artwork supplies any pictograms.
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
    const tourTone = TOUR_TONES[code] || TOUR_TONES.default;
    const [logoFailed, setLogoFailed] = React.useState(false);
    return (
        <PokerNearMePanelShell className="pnm-console-card pnm-console-card--tour rich-tour-card is-loading" bodyClassName="pnm-console-card__body">
            <div className="card-header">
                {venue.logo_url && !logoFailed ? (
                    <img src={venue.logo_url} alt={code}
                        onError={() => setLogoFailed(true)}
                        className="pnm-console-card__logo" />
                ) : (
                    <div className="pnm-console-card__brand" data-tone={tourTone}>
                        <span>{code || 'TOUR'}</span>
                    </div>
                )}
                <div className="pnm-console-card__loading-copy">Loading Live Data...</div>
            </div>
            <h4 className="pnm-console-card__title">{venue.tour_name || venue.name}</h4>
        </PokerNearMePanelShell>
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
    const tourTone = TOUR_TONES[tourCode] || TOUR_TONES.default;
    const tourTypeLabel = TOUR_TYPE_LABELS[displayTour.tour_type] || displayTour.tour_type || '';
    const logoUrl = displayTour.logo_url || venue.logo_url;
    const [logoFailed, setLogoFailed] = React.useState(false);

    React.useEffect(() => {
        setLogoFailed(false);
    }, [logoUrl]);

    // Buy-in range
    const buyins = displayTour.typical_buyins;
    const buyinText = buyins && (buyins.min || buyins.max)
        ? [buyins.min && formatMoney(buyins.min), buyins.max && formatMoney(buyins.max)].filter(Boolean).join(' - ')
        : null;

    if (isLoadingLiveData) {
        return <TourCardSkeleton venue={venue} />;
    }

    return (
        <PokerNearMePanelShell
            className="pnm-console-card pnm-console-card--tour rich-tour-card"
            bodyClassName="pnm-console-card__body"
            onClick={() => onNavigate && onNavigate(detailUrl)}
        >
            <button
                type="button"
                className={'fav-btn' + (isFavorited ? ' active' : '')}
                onClick={(e) => { e.stopPropagation(); onFavorite && onFavorite(e); }}
                aria-label={isFavorited ? `Remove ${displayTour.tour_name || venue.tour_name || venue.name || 'tour'} from saved tours` : `Save ${displayTour.tour_name || venue.tour_name || venue.name || 'tour'}`}
                aria-pressed={!!isFavorited}
            >
                <PokerNearMeConsoleIcon name="saved" />
            </button>

            <div className="pnm-console-card__header">
                {logoUrl && !logoFailed ? (
                    <img src={logoUrl} alt={tourCode} onError={() => setLogoFailed(true)} className="pnm-console-card__logo" />
                ) : (
                    <div className="pnm-console-card__brand" data-tone={tourTone}>
                        <span>{tourCode || 'TOUR'}</span>
                    </div>
                )}
                <div className="pnm-console-card__tag-row">
                    <span className="pnm-console-card__tag" data-tone={tourTone}>{tourCode || 'TOUR'}</span>
                    {tourTypeLabel && <span className="pnm-console-card__tag">{tourTypeLabel}</span>}
                </div>
            </div>

            <h4 className="pnm-console-card__title">
                {displayTour.tour_name || venue.tour_name || venue.name || 'Poker Tour'}
            </h4>

            {currentStop && (
                <div className={`rich-tour-card__signal ${currentStopType === 'current' ? 'is-live' : 'is-next'}`}>
                    <div className="rich-tour-card__signal-label">
                        <span className="pnm-console-card__signal" aria-hidden="true" />
                        <span>{currentStopType === 'current' ? 'LIVE NOW' : 'NEXT STOP'}</span>
                    </div>
                    {currentStop.stop_name && <div className="rich-tour-card__stop-name">{currentStop.stop_name}</div>}
                    {currentStop.stop_venue && <div className="rich-tour-card__stop-venue">{currentStop.stop_venue}</div>}
                    {(currentStop.stop_city || currentStop.stop_state) && (
                        <div className="rich-tour-card__stop-location">
                            {[currentStop.stop_city, currentStop.stop_state].filter(Boolean).join(', ')}
                        </div>
                    )}
                    {currentStop.stop_start_date && (
                        <div className="rich-tour-card__stop-date">
                            {formatDateRange(currentStop.stop_start_date, currentStop.stop_end_date)}
                        </div>
                    )}
                </div>
            )}

            {!currentStop && (venue.stop_venue || venue.city) && (
                <div className="pnm-console-card__meta-line">
                    <PokerNearMeConsoleIcon name="location" className="pnm-console-card__meta-icon" />
                    <span>{[venue.stop_venue, venue.city, venue.state].filter(Boolean).join(', ')}</span>
                </div>
            )}

            {buyinText && <div className="pnm-console-card__buyin">Buy-Ins: {buyinText}</div>}

            {displayTour.regions && displayTour.regions.length > 0 && (
                <div className="pnm-console-card__tag-row">
                    {displayTour.regions.slice(0, 3).map(r => <span key={r} className="pnm-console-card__tag">{r}</span>)}
                </div>
            )}

            {isRegistryFallback && <div className="pnm-console-card__muted">Schedule Not Yet Published</div>}

            {upcomingStops.length > 0 && (
                <div className="rich-tour-card__upcoming">
                    <div className="rich-tour-card__upcoming-title">
                        <PokerNearMeConsoleIcon name="calendar" className="pnm-console-card__meta-icon" />
                        Upcoming Stops ({upcomingStops.length})
                    </div>
                    {upcomingStops.map((s, i) => (
                        <div key={i} className="rich-tour-card__upcoming-row">
                            <span className="rich-tour-card__upcoming-name">{s.stop_name || s.name}</span>
                            <span className="rich-tour-card__upcoming-date">
                                {formatDateRange(s.stop_start_date, s.stop_end_date) || s.dates || 'TBD'}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            <div className="card-footer">
                {displayTour.established && <span className="established">Est. {displayTour.established}</span>}
                <div className="card-actions">
                    <span className="action-btn primary">
                        <PokerNearMeConsoleIcon name="directions" className="pnm-console-card__action-icon" />
                        Details
                    </span>
                    {displayTour.official_website && (
                        <a
                            href={displayTour.official_website.startsWith('http') ? displayTour.official_website : 'https://' + displayTour.official_website}
                            target="_blank" rel="noopener noreferrer"
                            className="action-btn"
                            onClick={e => e.stopPropagation()}
                        >
                            <PokerNearMeConsoleIcon name="globe" className="pnm-console-card__action-icon" />
                            Website
                        </a>
                    )}
                </div>
            </div>
        </PokerNearMePanelShell>
    );
}
