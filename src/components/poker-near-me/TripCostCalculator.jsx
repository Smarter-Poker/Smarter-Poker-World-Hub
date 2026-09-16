/**
 * TripCostCalculator.jsx — Feature #12: Poker Trip Cost Calculator
 * Estimate total cost: gas, buy-ins, hotel, meals.
 */
import React, { useState, useMemo } from 'react';
import { haversineMiles } from './pnm-utils';
import { PokerNearMeConsoleIcon, PokerNearMePanelShell } from './PokerNearMeConsole';

// Tier-based nightly hotel costs
const CITY_TIER = {
    'las vegas': 180, 'los angeles': 200, 'new york': 280, 'miami': 220, 'san francisco': 250,
    'atlantic city': 150, 'chicago': 180, 'boston': 220, 'seattle': 190, 'denver': 160,
    'new orleans': 140, 'nashville': 160, 'tampa': 130, 'phoenix': 120, 'dallas': 130,
    'houston': 130, 'san antonio': 110, 'austin': 140, 'reno': 100, 'biloxi': 90,
};

const DEFAULT_HOTEL_NIGHT = 130;
const MEALS_PER_DAY = 50;
const PREMIUM_MEAL_MULT = 2.2;
const AVG_MPG = 28;

// calcDistance is now imported as haversineMiles from ./pnm-utils

const BREAK_ICON_NAMES = Object.freeze({
    gas: 'directions',
    buyin: 'saved',
    hotel: 'home',
    meals: 'globe',
});

function BreakIcon({ kind }) {
    return <PokerNearMeConsoleIcon name={BREAK_ICON_NAMES[kind] || 'saved'} />;
}

export default function TripCostCalculator({ venues = [], userLocation }) {
    const [selectedVenue, setSelectedVenue] = useState(null);
    const [venueSearch, setVenueSearch] = useState('');
    const [days, setDays] = useState(2);
    const [sessionsPerDay, setSessionsPerDay] = useState(2);
    const [stakes, setStakes] = useState('1/2');
    const [gasPrice, setGasPrice] = useState(3.50);
    const [isPremium, setIsPremium] = useState(false);
    const [showResults, setShowResults] = useState(false);

    // Filtered venues for autocomplete
    const filteredVenues = useMemo(() => {
        if (!venueSearch.trim()) return [];
        const q = venueSearch.toLowerCase();
        return venues.filter(v => v.name?.toLowerCase().includes(q) || v.city?.toLowerCase().includes(q)).slice(0, 8);
    }, [venueSearch, venues]);

    // Calculate costs
    const costs = useMemo(() => {
        if (!selectedVenue) return null;

        // Distance & gas.
        // BUG FIX: when GPS was off or the venue row had no coordinates this fell
        // back to 0, which silently priced gas at $0 and understated the total.
        // Track why it is unavailable so the breakdown can say so.
        const vLat = parseFloat(selectedVenue.latitude ?? selectedVenue.lat);
        const vLng = parseFloat(selectedVenue.longitude ?? selectedVenue.lng);
        const hasVenueCoords = Number.isFinite(vLat) && Number.isFinite(vLng) && !(vLat === 0 && vLng === 0);
        const distanceKnown = !!userLocation && hasVenueCoords;
        const distanceUnavailableReason = distanceKnown
            ? null
            : !userLocation
                ? 'Enable GPS to include gas in this estimate'
                : 'We do not have coordinates for this venue, so gas is not included';

        const distance = distanceKnown
            ? haversineMiles(userLocation.lat, userLocation.lng, vLat, vLng)
            : 0;
        const roundTripMiles = distance * 2;
        const gallons = roundTripMiles / AVG_MPG;
        const gasCost = gallons * gasPrice;
        const driveTime = distance > 0 ? Math.round(distance / 55 * 60) : 0; // minutes

        // Buy-in estimate from stakes
        const stakeParts = stakes.split('/').map(Number);
        const bigBlind = stakeParts[1] || stakeParts[0] || 2;
        const typicalBuyIn = bigBlind * 100; // 100BB buy-in
        const buyInSpend = typicalBuyIn * sessionsPerDay * days;

        // Hotel
        const cityKey = (selectedVenue.city || '').toLowerCase();
        const nightlyRate = CITY_TIER[cityKey] || DEFAULT_HOTEL_NIGHT;
        const hotelRate = isPremium ? nightlyRate * 1.8 : nightlyRate;
        // BUG FIX: Math.max(days - 1, 1) billed one hotel night for a 1-day trip,
        // so a day trip to the local room showed $130-$180 the user will not spend.
        const nights = Math.max(days - 1, 0);
        const hotelTotal = hotelRate * nights;

        // Meals
        const mealsDaily = isPremium ? MEALS_PER_DAY * PREMIUM_MEAL_MULT : MEALS_PER_DAY;
        const mealTotal = mealsDaily * days;

        // Total
        const total = gasCost + buyInSpend + hotelTotal + mealTotal;

        return {
            distance: Math.round(distance),
            roundTripMiles: Math.round(roundTripMiles),
            driveTime,
            gasCost,
            distanceKnown,
            distanceUnavailableReason,
            typicalBuyIn,
            buyInSpend,
            nights,
            hotelRate: Math.round(hotelRate),
            hotelTotal: Math.round(hotelTotal),
            mealsDaily: Math.round(mealsDaily),
            mealTotal: Math.round(mealTotal),
            total: Math.round(total),
        };
    }, [selectedVenue, userLocation, days, sessionsPerDay, stakes, gasPrice, isPremium]);

    return (
        <PokerNearMePanelShell
            as="section"
            className="trip-calc pnm-console-tool"
            bodyClassName="pnm-console-tool__body"
            aria-labelledby="pnm-trip-cost-title"
        >
            <div className="tc-header">
                <PokerNearMeConsoleIcon name="directions" className="pnm-console-tool__header-icon" />
                <h2 id="pnm-trip-cost-title">Trip Cost Calculator</h2>
            </div>

            <div className="tc-form">
                {/* Venue selection */}
                <div className="tc-group">
                    <label>Destination Venue</label>
                    <div className="tc-venue-search">
                        <input
                            type="text"
                            aria-label="Destination venue"
                            placeholder="Search venues..."
                            value={venueSearch}
                            onChange={e => { setVenueSearch(e.target.value); setSelectedVenue(null); setShowResults(false); }}
                            className="tc-input"
                        />
                        {filteredVenues.length > 0 && !selectedVenue && (
                            <div className="tc-venue-dropdown">
                                {filteredVenues.map((v, i) => (
                                    <button type="button" key={v.id || i} className="tc-venue-option" onClick={() => { setSelectedVenue(v); setVenueSearch(v.name); }}>
                                        <span className="tc-vo-name">{v.name}</span>
                                        <span className="tc-vo-loc">{v.city}, {v.state}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    {selectedVenue && (
                        <div className="tc-selected-venue">
                            <span className="tc-sv-check">✓</span>
                            {selectedVenue.name} - {selectedVenue.city}, {selectedVenue.state}
                        </div>
                    )}
                </div>

                {/* Days */}
                <div className="tc-row">
                    <div className="tc-group half">
                        <label>Days</label>
                        <div className="tc-stepper">
                            <button type="button" aria-label="Decrease days" onClick={() => setDays(d => Math.max(1, d - 1))}>−</button>
                            <span>{days}</span>
                            <button type="button" aria-label="Increase days" onClick={() => setDays(d => Math.min(14, d + 1))}>+</button>
                        </div>
                    </div>
                    <div className="tc-group half">
                        <label>Sessions / Day</label>
                        <div className="tc-stepper">
                            <button type="button" aria-label="Decrease sessions per day" onClick={() => setSessionsPerDay(s => Math.max(1, s - 1))}>−</button>
                            <span>{sessionsPerDay}</span>
                            <button type="button" aria-label="Increase sessions per day" onClick={() => setSessionsPerDay(s => Math.min(5, s + 1))}>+</button>
                        </div>
                    </div>
                </div>

                {/* Stakes & gas */}
                <div className="tc-row">
                    <div className="tc-group half">
                        <label>Stakes</label>
                        <div className="tc-chips">
                            {['1/2', '1/3', '2/5', '5/10', '10/25'].map(s => (
                                <button type="button" key={s} className={'tc-chip' + (stakes === s ? ' active' : '')} aria-pressed={stakes === s} onClick={() => setStakes(s)}>{s}</button>
                            ))}
                        </div>
                    </div>
                    <div className="tc-group half">
                        <label>Gas Price ($/Gal)</label>
                        <input
                            type="number"
                            aria-label="Gas price per gallon"
                            step="0.1"
                            value={gasPrice}
                            onChange={e => setGasPrice(parseFloat(e.target.value) || 3.50)}
                            className="tc-input small"
                        />
                    </div>
                </div>

                {/* Budget mode toggle */}
                <div className="tc-mode-toggle" role="radiogroup" aria-label="Trip budget mode">
                    <button type="button" role="radio" aria-checked={!isPremium} className={'tc-mode' + (!isPremium ? ' active' : '')} onClick={() => setIsPremium(false)}>
                        <PokerNearMeConsoleIcon name="saved" />
                        Budget
                    </button>
                    <button type="button" role="radio" aria-checked={isPremium} className={'tc-mode' + (isPremium ? ' active' : '')} onClick={() => setIsPremium(true)}>
                        <PokerNearMeConsoleIcon name="globe" />
                        Premium
                    </button>
                </div>

                {/* Calculate button */}
                <button type="button" className="tc-calc-btn" onClick={() => setShowResults(true)} disabled={!selectedVenue}>
                    <PokerNearMeConsoleIcon name="directions" />
                    Calculate Trip Cost
                </button>
            </div>

            {/* Results */}
            {showResults && costs && (
                <div className="tc-results">
                    <div className="tc-total-card">
                        <div className="tc-total-label">Estimated Total</div>
                        <div className="tc-total-amount">${costs.total.toLocaleString()}</div>
                        <div className="tc-total-subtitle">
                            {days} day{days > 1 ? 's' : ''} · {isPremium ? 'Premium' : 'Budget'} · {stakes}
                        </div>
                    </div>

                    <div className="tc-breakdown">
                        <div className="tc-break-item">
                            <div className="tc-break-icon gas"><BreakIcon kind="gas" /></div>
                            <div className="tc-break-info">
                                <span className="tc-break-label">Gas</span>
                                <span className="tc-break-detail">
                                    {costs.distanceKnown
                                        ? `${costs.roundTripMiles} mi round trip · ${Math.floor(costs.driveTime / 60)}h ${costs.driveTime % 60}m (straight-line)`
                                        : costs.distanceUnavailableReason}
                                </span>
                            </div>
                            <span className="tc-break-amount">
                                {costs.distanceKnown ? `$${Math.round(costs.gasCost).toLocaleString()}` : 'Unavailable'}
                            </span>
                        </div>

                        <div className="tc-break-item">
                            <div className="tc-break-icon buyin"><BreakIcon kind="buyin" /></div>
                            <div className="tc-break-info">
                                <span className="tc-break-label">Buy-Ins</span>
                                <span className="tc-break-detail">${costs.typicalBuyIn} × {sessionsPerDay}/Day × {days} Days</span>
                            </div>
                            <span className="tc-break-amount">${costs.buyInSpend.toLocaleString()}</span>
                        </div>

                        <div className="tc-break-item">
                            <div className="tc-break-icon hotel"><BreakIcon kind="hotel" /></div>
                            <div className="tc-break-info">
                                <span className="tc-break-label">Hotel</span>
                                <span className="tc-break-detail">
                                    {costs.nights > 0
                                        ? `$${costs.hotelRate}/night × ${costs.nights} night${costs.nights > 1 ? 's' : ''}`
                                        : 'Day trip - no overnight stay'}
                                </span>
                            </div>
                            <span className="tc-break-amount">${costs.hotelTotal.toLocaleString()}</span>
                        </div>

                        <div className="tc-break-item">
                            <div className="tc-break-icon meals"><BreakIcon kind="meals" /></div>
                            <div className="tc-break-info">
                                <span className="tc-break-label">Meals</span>
                                <span className="tc-break-detail">${costs.mealsDaily}/Day × {days} Days</span>
                            </div>
                            <span className="tc-break-amount">${costs.mealTotal.toLocaleString()}</span>
                        </div>
                    </div>

                    {!costs.distanceKnown && (
                        <div className="tc-no-gps">
                            <PokerNearMeConsoleIcon name="location" />
                            {costs.distanceUnavailableReason}. The Total Below Excludes Travel.
                        </div>
                    )}
                </div>
            )}

        </PokerNearMePanelShell>
    );
}
