/**
 * NOT CURRENTLY MOUNTED. A repo-wide grep finds no import of PokerTourCard — the
 * rendered tour card is RichTourCard. It is kept (rather than deleted) in case it is
 * revived, with the structural defects below fixed so a revival does not ship them.
 */
import React from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { tourCanonical } from '../../lib/seo/tourPageSeo';
import { PokerNearMeConsoleIcon, PokerNearMePanelShell } from './PokerNearMeConsole';
import { PnmPlateLabel } from './TourCard';
import { safeImageUrl } from '../../lib/security/imageHosts.js';

// BUG FIX: `colors` and `typeInfo` were hardcoded literals despite the comment
// "Default to circuit styling as fallback", so every tour rendered in identical
// colours and was labelled "Tour Stop" whatever its type. Derive from tour_type.
const TOUR_TYPE_STYLES = {
    major:       { label: 'Major Tour', tone: 'gold' },
    circuit:     { label: 'Circuit', tone: 'blue' },
    regional:    { label: 'Regional', tone: 'green' },
    high_roller: { label: 'High Roller', tone: 'gold' },
    grassroots:  { label: 'Grassroots', tone: 'silver' },
    charity:     { label: 'Charity', tone: 'blue' },
};
const DEFAULT_TOUR_STYLE = { label: 'Tour Stop', tone: 'blue' };

/** True only when today falls inside the stop's own date range. */
function isStopLiveNow(tourPin) {
    const startRaw = tourPin?.stop_start_date || tourPin?.start_date;
    if (!startRaw) return false;
    // Parse as a LOCAL date — new Date('YYYY-MM-DD') is UTC midnight and reads back
    // as the previous day in every US timezone.
    const toLocalDate = (raw) => {
        const m = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!m) return null;
        const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
        return isNaN(d.getTime()) ? null : d;
    };
    const start = toLocalDate(startRaw);
    if (!start) return false;
    const end = toLocalDate(tourPin?.stop_end_date || tourPin?.end_date) || start;
    end.setHours(23, 59, 59, 999);
    const now = new Date();
    return now >= start && now <= end;
}

export default function PokerTourCard({ tourPin = {} }) {
    const router = useRouter();
    const style = TOUR_TYPE_STYLES[tourPin.tour_type] || DEFAULT_TOUR_STYLE;
    // BUG FIX: the green "LIVE NOW" badge was unconditional, with no date check —
    // every tour claimed to be running right now. It is now date-gated, and it
    // says what it is: the stop's published dates include today (Current Stop),
    // which is a schedule fact, not observed live activity.
    const liveNow = isStopLiveNow(tourPin);
    // BUG FIX: `tourPin.city + ', ' + tourPin.state` printed the literal
    // "undefined, undefined" whenever those fields were absent.
    const locationText = tourPin.location || [tourPin.city, tourPin.state].filter(Boolean).join(', ');

    // The same URL the sitemap offers, built once in src/lib/seo/tourPageSeo.js.
    const detailHref = tourPin.tour_code ? tourCanonical(tourPin.tour_code) : null;

    return (
        <PokerNearMePanelShell
            className="pnm-console-card pnm-console-card--tour pnm-console-card--tour-pin"
            bodyClassName="pnm-console-card__body"
            onClick={() => {
                if (detailHref) router.push(detailHref);
            }}
        >
            {/* Card Header */}
            <div className="tour-card-header">
                <div className="pnm-console-card__brand-row">
                    {safeImageUrl(tourPin.logo_url) && (
                        <div className="tour-logo-container pnm-console-card__logo-frame">
                            <img src={safeImageUrl(tourPin.logo_url)} alt={`${tourPin.tour_name || tourPin.name || 'Tour'} logo`} className="tour-logo-img" />
                        </div>
                    )}
                    <div className="tour-code-badge pnm-console-card__brand" data-tone={style.tone}>
                        <span>
                            {tourPin.tour_code || 'TOUR'}
                        </span>
                    </div>
                </div>
                <span className="tour-type-pill" data-tone={style.tone}>
                    {style.label}
                </span>
            </div>

            {/* Tour Name */}
            <h4 className="tour-card-name">{tourPin.tour_name || tourPin.name}</h4>

            {/* Current Location (Live) */}
            <div className="tour-card-location-live">
                {liveNow && (
                    <div className="pnm-console-card__live-line">
                        <PokerNearMeConsoleIcon name="location" className="pnm-console-card__meta-icon" />
                        <span>
                            Current Stop
                        </span>
                    </div>
                )}
                {tourPin.stop_venue && <span className="tour-stop-venue">{tourPin.stop_venue}</span>}
                {locationText && (
                    <span className="tour-stop-location">{locationText}</span>
                )}
            </div>

            {/* Card Footer */}
            <div className="tour-card-footer">
                <div className="tour-card-actions">
                    {/* No tour code means no detail page: no control is printed rather
                        than a Details label that does nothing. */}
                    {detailHref ? (
                        <Link href={detailHref} className="tour-action-btn primary" onClick={e => e.stopPropagation()}>
                            <PnmPlateLabel label="Details" />
                        </Link>
                    ) : null}
                </div>
            </div>
        </PokerNearMePanelShell>
    );
}
