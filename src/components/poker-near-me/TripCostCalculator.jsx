/**
 * TripCostCalculator.jsx — Feature #12: Poker Trip Cost Calculator
 * Estimate total cost: gas, buy-ins, hotel, meals.
 */
import React, { useState, useMemo } from 'react';
import { haversineMiles } from './pnm-utils';

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

// CLAUDE.md rule: no bare emoji in source/JSX (they have broken the SWC compile
// and Vercel builds). These inline SVGs replace the former gas/dice/hotel/meal glyphs.
function BreakIcon({ kind }) {
    const common = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
    if (kind === 'gas') {
        return (
            <svg {...common} aria-hidden="true">
                <path d="M3 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16" />
                <line x1="2" y1="21" x2="14" y2="21" />
                <line x1="5" y1="9" x2="11" y2="9" />
                <path d="M16 8h2a2 2 0 0 1 2 2v6a1.5 1.5 0 0 0 3 0V10l-3-3" />
            </svg>
        );
    }
    if (kind === 'buyin') {
        return (
            <svg {...common} aria-hidden="true">
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <circle cx="8.5" cy="8.5" r="1.2" fill="currentColor" stroke="none" />
                <circle cx="15.5" cy="15.5" r="1.2" fill="currentColor" stroke="none" />
                <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
            </svg>
        );
    }
    if (kind === 'hotel') {
        return (
            <svg {...common} aria-hidden="true">
                <path d="M2 20V9a1 1 0 0 1 1-1h5v12" />
                <path d="M8 20V4a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v16" />
                <line x1="1" y1="20" x2="23" y2="20" />
                <line x1="12" y1="7" x2="17" y2="7" />
                <line x1="12" y1="11" x2="17" y2="11" />
                <line x1="12" y1="15" x2="17" y2="15" />
            </svg>
        );
    }
    // meals
    return (
        <svg {...common} aria-hidden="true">
            <path d="M4 3v7a2 2 0 0 0 2 2h0a2 2 0 0 0 2-2V3" />
            <line x1="6" y1="12" x2="6" y2="21" />
            <path d="M17 3c-1.7 0-3 2.2-3 5s1.3 4 3 4" />
            <line x1="17" y1="3" x2="17" y2="21" />
        </svg>
    );
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
        <div className="trip-calc">
            <div className="tc-header">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="4" y="2" width="16" height="20" rx="2" />
                    <line x1="8" y1="6" x2="16" y2="6" />
                    <line x1="8" y1="10" x2="16" y2="10" />
                    <line x1="8" y1="14" x2="12" y2="14" />
                    <circle cx="15" cy="18" r="2" fill="#ffffff" stroke="none" />
                </svg>
                <h2>Trip Cost Calculator</h2>
            </div>

            <div className="tc-form">
                {/* Venue selection */}
                <div className="tc-group">
                    <label>Destination Venue</label>
                    <div className="tc-venue-search">
                        <input
                            type="text"
                            placeholder="Search venues..."
                            value={venueSearch}
                            onChange={e => { setVenueSearch(e.target.value); setSelectedVenue(null); setShowResults(false); }}
                            className="tc-input"
                        />
                        {filteredVenues.length > 0 && !selectedVenue && (
                            <div className="tc-venue-dropdown">
                                {filteredVenues.map((v, i) => (
                                    <button key={v.id || i} className="tc-venue-option" onClick={() => { setSelectedVenue(v); setVenueSearch(v.name); }}>
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
                            {selectedVenue.name} — {selectedVenue.city}, {selectedVenue.state}
                        </div>
                    )}
                </div>

                {/* Days */}
                <div className="tc-row">
                    <div className="tc-group half">
                        <label>Days</label>
                        <div className="tc-stepper">
                            <button onClick={() => setDays(d => Math.max(1, d - 1))}>−</button>
                            <span>{days}</span>
                            <button onClick={() => setDays(d => Math.min(14, d + 1))}>+</button>
                        </div>
                    </div>
                    <div className="tc-group half">
                        <label>Sessions / Day</label>
                        <div className="tc-stepper">
                            <button onClick={() => setSessionsPerDay(s => Math.max(1, s - 1))}>−</button>
                            <span>{sessionsPerDay}</span>
                            <button onClick={() => setSessionsPerDay(s => Math.min(5, s + 1))}>+</button>
                        </div>
                    </div>
                </div>

                {/* Stakes & gas */}
                <div className="tc-row">
                    <div className="tc-group half">
                        <label>Stakes</label>
                        <div className="tc-chips">
                            {['1/2', '1/3', '2/5', '5/10', '10/25'].map(s => (
                                <button key={s} className={'tc-chip' + (stakes === s ? ' active' : '')} onClick={() => setStakes(s)}>{s}</button>
                            ))}
                        </div>
                    </div>
                    <div className="tc-group half">
                        <label>Gas Price ($/gal)</label>
                        <input
                            type="number"
                            step="0.1"
                            value={gasPrice}
                            onChange={e => setGasPrice(parseFloat(e.target.value) || 3.50)}
                            className="tc-input small"
                        />
                    </div>
                </div>

                {/* Budget mode toggle */}
                <div className="tc-mode-toggle">
                    <button className={'tc-mode' + (!isPremium ? ' active' : '')} onClick={() => setIsPremium(false)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /></svg>
                        Budget
                    </button>
                    <button className={'tc-mode' + (isPremium ? ' active' : '')} onClick={() => setIsPremium(true)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
                        Premium
                    </button>
                </div>

                {/* Calculate button */}
                <button className="tc-calc-btn" onClick={() => setShowResults(true)} disabled={!selectedVenue}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" /></svg>
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
                                <span className="tc-break-detail">${costs.typicalBuyIn} × {sessionsPerDay}/day × {days} days</span>
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
                                <span className="tc-break-detail">${costs.mealsDaily}/day × {days} days</span>
                            </div>
                            <span className="tc-break-amount">${costs.mealTotal.toLocaleString()}</span>
                        </div>
                    </div>

                    {!costs.distanceKnown && (
                        <div className="tc-no-gps">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
                            {costs.distanceUnavailableReason}. The total below excludes travel.
                        </div>
                    )}
                </div>
            )}

            <style>{`
        .trip-calc { padding: 0 0 20px; }
        .tc-header { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; }
        .tc-header h2 { font-size: 22px; font-weight: 700; color: #fff; margin: 0; }
        .tc-form { background: rgba(15,23,42,0.6); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; padding: 20px; }
        .tc-group { margin-bottom: 16px; }
        .tc-group label { display: block; font-size: 12px; font-weight: 500; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
        .tc-input { width: 100%; padding: 12px 16px; background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; color: #fff; font-size: 14px; font-family: inherit; }
        .tc-input:focus { outline: none; border-color: rgba(255,255,255,0.5); }
        .tc-input::placeholder { color: rgba(255,255,255,0.25); }
        .tc-input.small { width: auto; padding: 10px 12px; }
        .tc-venue-search { position: relative; }
        .tc-venue-dropdown { position: absolute; top: calc(100% + 4px); left: 0; right: 0; background: rgba(15,23,42,0.98); border: 1px solid rgba(255,255,255,0.15); border-radius: 10px; overflow: hidden; z-index: 100; max-height: 240px; overflow-y: auto; }
        .tc-venue-option { display: flex; flex-direction: column; width: 100%; padding: 10px 14px; background: none; border: none; border-bottom: 1px solid rgba(255,255,255,0.05); text-align: left; cursor: pointer; transition: background 0.15s; }
        .tc-venue-option:hover { background: rgba(255,255,255,0.06); }
        .tc-vo-name { font-size: 13px; font-weight: 600; color: #fff; }
        .tc-vo-loc { font-size: 11px; color: rgba(255,255,255,0.4); }
        .tc-selected-venue { display: flex; align-items: center; gap: 6px; padding: 8px 12px; background: rgba(34,197,94,0.08); border: 1px solid rgba(34,197,94,0.2); border-radius: 8px; font-size: 13px; color: #22c55e; margin-top: 8px; }
        .tc-sv-check { font-weight: 700; }
        .tc-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        @media (max-width: 480px) { .tc-row { grid-template-columns: 1fr; } }
        .tc-group.half { margin-bottom: 16px; }
        .tc-stepper { display: flex; align-items: center; gap: 0; }
        .tc-stepper button { width: 36px; height: 36px; border-radius: 8px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); color: #fff; font-size: 18px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .tc-stepper button:hover { background: rgba(255,255,255,0.1); }
        .tc-stepper span { min-width: 40px; text-align: center; font-size: 18px; font-weight: 600; color: #fff; }
        .tc-chips { display: flex; flex-wrap: wrap; gap: 6px; }
        .tc-chip { padding: 6px 12px; border-radius: 6px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.7); font-size: 12px; cursor: pointer; transition: all 0.2s; }
        .tc-chip.active { background: rgba(255,255,255,0.2); border-color: rgba(255,255,255,0.5); color: #ffffff; }
        .tc-mode-toggle { display: flex; gap: 8px; margin-bottom: 16px; }
        .tc-mode { flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 10px; border-radius: 10px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.5); font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.2s; }
        .tc-mode.active { background: rgba(255,255,255,0.15); border-color: rgba(255,255,255,0.4); color: #ffffff; }
        .tc-calc-btn { width: 100%; padding: 14px; background: linear-gradient(135deg, #ffffff, #cbd5e1); border: none; border-radius: 12px; color: #000; font-size: 15px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: filter 0.2s; }
        .tc-calc-btn:hover { filter: brightness(1.1); }
        .tc-calc-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .tc-results { margin-top: 20px; }
        .tc-total-card { text-align: center; padding: 30px 20px; background: linear-gradient(135deg, rgba(255,255,255,0.1), rgba(200,214,229,0.05)); border: 1px solid rgba(255,255,255,0.3); border-radius: 16px; margin-bottom: 16px; }
        .tc-total-label { font-size: 12px; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 1px; }
        .tc-total-amount { font-size: 48px; font-weight: 700; color: #ffffff; margin: 4px 0; line-height: 1; }
        .tc-total-subtitle { font-size: 13px; color: rgba(255,255,255,0.4); }
        .tc-breakdown { display: flex; flex-direction: column; gap: 8px; }
        .tc-break-item { display: flex; align-items: center; gap: 12px; padding: 14px 16px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; }
        .tc-break-icon { width: 40px; display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,0.75); }
        .tc-break-info { flex: 1; }
        .tc-break-label { font-size: 14px; font-weight: 600; color: #fff; display: block; }
        .tc-break-detail { font-size: 11px; color: rgba(255,255,255,0.35); }
        .tc-break-amount { font-size: 16px; font-weight: 700; color: #ffffff; }
        .tc-no-gps { display: flex; align-items: center; gap: 6px; padding: 10px 14px; background: rgba(245,158,11,0.08); border: 1px solid rgba(245,158,11,0.2); border-radius: 8px; font-size: 12px; color: #f59e0b; margin-top: 12px; }
      `}</style>
        </div>
    );
}
