/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  HUB PROMO RAIL — the World Hub's first house-ad surface
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Dan 2026-08-27: with no paid advertisers, the ad space promotes our own
 * features. The plumbing underneath is advertiser-shaped on purpose so nothing
 * has to be rebuilt when a real one arrives.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * The `hub_promotions` slot has been declared in the `ad_placement` CHECK
 * constraint since Phase 1, and all six campaigns already carry a
 * hub_promotions placement with a Hub-relative `target_url`. What was missing
 * was any surface on the World Hub that rendered them, so the slot had never
 * recorded a single event. Every one of the 131 rows in `ad_event` up to now
 * came from Club Arena's lobby strip. This is the other half.
 *
 * ── LABELLED, NEVER ANONYMOUS ──────────────────────────────────────────────
 * This rail sits above promotions written by venues, tours and series — other
 * people's offers. A player must always be able to tell who is speaking, so
 * ours are tagged SMARTER.POKER and are visually quieter than the cards below
 * them. Club Arena's strip follows the same rule and for the same reason: a
 * club talking to its own players outranks us talking to theirs.
 *
 * ── RENDERS NOTHING WHEN THERE IS NOTHING ──────────────────────────────────
 * No skeleton, no empty frame, no "no promotions" box. An empty promotional
 * region takes vertical space on a 375px screen and trains players to ignore
 * that part of the page, which costs more than the impression was worth.
 *
 * ── THE CLICK MUST SURVIVE THE TAP ─────────────────────────────────────────
 * The click is logged BEFORE navigation and navigation is client-side
 * (next/link), so the in-flight insert is never killed by a document unload.
 * If anyone ever changes these to plain <a href> full-page loads, the click
 * events stop arriving and the click-through rate silently becomes zero.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { resolveAds, logImpression, logClick } from '../../services/adService';

const SLOT = 'hub_promotions';

export default function HubPromoRail({ limit = 3 }) {
    const [ads, setAds] = useState([]);

    const handleDismiss = (e, adId) => {
        e.preventDefault();
        e.stopPropagation();
        import('../../services/adService').then(({ logDismiss }) => {
            logDismiss(adId, SLOT);
        });
        setAds((prev) => prev.filter((a) => a.adId !== adId));
    };

    useEffect(() => {
        let cancelled = false;
        (async () => {
            // Targeting, flight dates and the 24h frequency cap are all decided
            // by fn_resolve_ads. Nothing is filtered here.
            const rows = await resolveAds(SLOT, null, limit);
            if (!cancelled) setAds(rows);
        })();
        return () => {
            cancelled = true;
        };
    }, [limit]);

    // One impression per ad per page-load, de-duplicated inside the service.
    useEffect(() => {
        ads.forEach((ad) => logImpression(ad.adId, SLOT));
    }, [ads]);

    if (ads.length === 0) return null;

    return (
        <section className="promo-rail" aria-label="From Smarter Poker">
            {ads.map((ad) => {
                const href = ad.targetUrl || '/hub';
                return (
                    <div key={ad.adId} className="promo-card-wrapper">
                    <Link href={href} legacyBehavior>
                        <a className="promo-card" onClick={() => logClick(ad.adId, SLOT)}>
                            <span className="promo-glyph" aria-hidden="true">
                                {ad.glyph || '◆'}
                            </span>
                            <span className="promo-body">
                                <span className="promo-tag">SMARTER.POKER</span>
                                <span className="promo-headline">{ad.headline}</span>
                                {ad.body ? <span className="promo-sub">{ad.body}</span> : null}
                            </span>
                            {ad.ctaLabel ? <span className="promo-cta">{ad.ctaLabel}</span> : null}
                        </a>
                    </Link>
                    <button
                        type="button"
                        className="promo-dismiss"
                        aria-label="Dismiss promotion"
                        onClick={(e) => handleDismiss(e, ad.adId)}
                    >
                        ✕
                    </button>
                </div>
                );
            })}

            <style jsx>{`
                /* Mobile-first: one column at 375px, widening only when there
                   is room. A three-across grid on a phone gives each promo
                   about 110px, which fits a headline and nothing else. */
                .promo-rail {
                    display: grid;
                    grid-template-columns: 1fr;
                    gap: 10px;
                    margin: 0 0 16px;
                }
                @media (min-width: 768px) {
                    .promo-rail {
                        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
                    }
                }
                .promo-card-wrapper {
                    position: relative;
                    display: flex;
                }
                .promo-card {
                    flex: 1;
                    display: flex;
                    align-items: flex-start;
                    gap: 12px;
                    padding: 12px 14px;
                    background: #ffffff;
                    border: 1px solid #dadde1;
                    border-left: 3px solid #1877f2;
                    border-radius: 8px;
                    text-decoration: none;
                    color: #050505;
                    transition: background 0.15s ease, border-color 0.15s ease;
                }
                .promo-card:hover {
                    background: #f7f8fa;
                    border-color: #c9ccd1;
                    border-left-color: #1877f2;
                }
                .promo-card:focus-visible {
                    outline: 2px solid #1877f2;
                    outline-offset: 2px;
                }
                .promo-glyph {
                    flex: 0 0 auto;
                    font-size: 18px;
                    line-height: 22px;
                    color: #1877f2;
                }
                .promo-body {
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                    min-width: 0;
                    flex: 1 1 auto;
                }
                .promo-tag {
                    font-size: 10px;
                    font-weight: 700;
                    letter-spacing: 0.06em;
                    color: #65676b;
                }
                .promo-headline {
                    font-size: 14px;
                    font-weight: 600;
                    line-height: 18px;
                    color: #050505;
                }
                .promo-sub {
                    font-size: 12px;
                    line-height: 16px;
                    color: #65676b;
                    /* Bodies are a full sentence or two. Two lines is the most
                       this row can carry without pushing the venue promotions
                       below the fold on a phone. */
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                }
                .promo-dismiss {
                    position: absolute;
                    top: -8px;
                    right: -8px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 24px;
                    height: 24px;
                    padding: 0;
                    border: 1px solid #dadde1;
                    background: #ffffff;
                    color: #8892a4;
                    font-size: 14px;
                    border-radius: 50%;
                    cursor: pointer;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    transition: color 0.15s ease, background 0.15s ease;
                    z-index: 2;
                }
                .promo-dismiss:hover, .promo-dismiss:focus-visible {
                    color: #050505;
                    background: #f7f8fa;
                    outline: none;
                }
                .promo-cta {
                    flex: 0 0 auto;
                    align-self: center;
                    font-size: 12px;
                    font-weight: 600;
                    color: #1877f2;
                    white-space: nowrap;
                }
            `}</style>
        </section>
    );
}
