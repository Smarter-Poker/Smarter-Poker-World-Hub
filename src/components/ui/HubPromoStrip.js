/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  HUB PROMO STRIP — one quiet line of house inventory on the World Hub
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Dan 2026-08-27: "since we have zero paid ads we should be promoting our own
 * features and contents in the ad space."
 *
 * Phase 1 wired the Club Arena lobby. The World Hub — the page every player
 * lands on — had no ad surface of any kind, while the `hub_promotions` slot
 * had been declared and left pointing at nothing.
 *
 * ── WHY IT SITS WHERE IT SITS ──────────────────────────────────────────────
 * The Hub home is a fixed, full-viewport 3D carousel whose cards occupy the
 * bottom third. The band between the header and those cards is empty
 * background. This strip renders in normal flow immediately after the sticky
 * header, so it lands in that band and pushes NOTHING: the carousel is
 * `position: fixed`, so it neither moves nor reflows. It is above the canvas
 * and below the header and every menu.
 *
 * ── IT RENDERS NOTHING WHEN THERE IS NOTHING TO SAY ────────────────────────
 * Same law as the lobby strip. An empty promotional bar is worse than no bar:
 * it costs vertical space on a 375px screen and trains players to ignore the
 * region.
 *
 * ── DISMISS IS FOR THIS PAGE LOAD ONLY, AND IT IS COUNTED ──────────────────
 * A dismissal hides the strip until the next load. It is deliberately NOT
 * persisted. On 2026-08-21 a deterministic per-id hash used as a permanent
 * flag, combined with an "already covered" rule, produced an absorbing state
 * that killed every Spin and Heads-Up on the platform for twenty hours, and
 * every refusal on that path returned silently. A suppression that never
 * rotates and cannot be counted is that same mechanism. This one expires with
 * the page and writes a `dismiss` row, so it is visible in the same place
 * every other ad event is.
 *
 * ── NO EMOJI ───────────────────────────────────────────────────────────────
 * Glyphs only, from the catalog (◆ ◉ ★ ◈ ▣ ▲). Bare emoji break the SWC
 * compiler and fail the Vercel build.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import {
    resolveHubAds,
    logHubImpression,
    logHubClick,
    logHubAdEvent,
    isSafeHubDestination,
} from '../../lib/hubAds';

const ROTATE_MS = 7000;
const MAX_ADS = 3;

export default function HubPromoStrip() {
    const router = useRouter();
    const [ads, setAds] = useState([]);
    const [index, setIndex] = useState(0);
    const [dismissed, setDismissed] = useState(false);
    const timerRef = useRef(null);

    // ── Load ──────────────────────────────────────────────────────────────
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const resolved = await resolveHubAds(MAX_ADS);
            if (cancelled) return;
            setAds(resolved);
            setIndex(0);
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    // ── Rotate ────────────────────────────────────────────────────────────
    useEffect(() => {
        if (timerRef.current) clearInterval(timerRef.current);
        if (ads.length < 2 || dismissed) return;

        // Respect reduced-motion: an auto-advancing strip is motion. Viewers
        // who ask for less of it get the highest-weighted ad, held still.
        const reduced =
            typeof window !== 'undefined' &&
            typeof window.matchMedia === 'function' &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduced) return;

        timerRef.current = setInterval(() => {
            setIndex((i) => (i + 1) % ads.length);
        }, ROTATE_MS);

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            timerRef.current = null;
        };
    }, [ads.length, dismissed]);

    const visible = ads.length > 0 ? ads[Math.min(index, ads.length - 1)] : null;
    const visibleId = dismissed ? undefined : visible?.adId;

    // ── Impression ────────────────────────────────────────────────────────
    // Fires for the ad currently on screen, de-duplicated per page load inside
    // hubAds. See law 2 there.
    useEffect(() => {
        if (!visibleId) return;
        logHubImpression(visibleId);
    }, [visibleId]);

    const handleActivate = useCallback(() => {
        if (!visible) return;
        // The click is recorded BEFORE navigating. The alternative is losing
        // the event to the unmount, which is how a click path ends up looking
        // like nobody ever clicked.
        logHubClick(visible.adId);
        if (isSafeHubDestination(visible.targetUrl)) {
            router.push(visible.targetUrl);
        }
    }, [visible, router]);

    const handleDismiss = useCallback(
        (e) => {
            e.stopPropagation();
            if (visible) void logHubAdEvent(visible.adId, 'dismiss');
            setDismissed(true);
        },
        [visible]
    );

    if (dismissed || !visible) return null;

    const text = visible.body ? `${visible.headline} - ${visible.body}` : visible.headline;

    return (
        <div className="hub-promo" role="complementary" aria-label="Smarter Poker Promotions">
            <button
                type="button"
                className="hub-promo__strip"
                onClick={handleActivate}
                aria-label={`Smarter Poker: ${text}`}
            >
                {visible.glyph ? (
                    <span className="hub-promo__glyph" aria-hidden="true">
                        {visible.glyph}
                    </span>
                ) : null}
                <span className="hub-promo__tag">SMARTER POKER</span>
                <span className="hub-promo__text">{text}</span>
                {visible.ctaLabel ? (
                    <span className="hub-promo__cta">{visible.ctaLabel}</span>
                ) : null}
            </button>
            <button
                type="button"
                className="hub-promo__close"
                onClick={handleDismiss}
                aria-label="Hide This Promotion"
            >
                &#215;
            </button>

            <style jsx>{`
                .hub-promo {
                    position: relative;
                    z-index: 60;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 6px 10px 0;
                    max-width: 900px;
                    margin: 0 auto;
                    box-sizing: border-box;
                }
                /* Quiet by construction. House inventory is us talking to our
                   own players; it should read as a footnote, not a banner. */
                .hub-promo__strip {
                    flex: 1;
                    min-width: 0;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 7px 10px;
                    border: 1px solid rgba(160, 174, 192, 0.22);
                    border-left: 3px solid rgba(160, 174, 192, 0.45);
                    border-radius: 6px;
                    background: rgba(12, 16, 26, 0.72);
                    color: rgba(226, 232, 240, 0.9);
                    font-family: 'Rajdhani', 'Inter', system-ui, sans-serif;
                    font-size: 13px;
                    text-align: left;
                    cursor: pointer;
                }
                .hub-promo__strip:hover {
                    border-color: rgba(160, 174, 192, 0.4);
                    background: rgba(16, 22, 34, 0.85);
                }
                .hub-promo__glyph {
                    color: rgba(148, 163, 184, 0.95);
                    font-size: 13px;
                    flex-shrink: 0;
                }
                .hub-promo__tag {
                    flex-shrink: 0;
                    font-size: 9px;
                    letter-spacing: 0.08em;
                    color: rgba(148, 163, 184, 0.75);
                    border: 1px solid rgba(148, 163, 184, 0.25);
                    border-radius: 3px;
                    padding: 1px 5px;
                }
                .hub-promo__text {
                    flex: 1;
                    min-width: 0;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .hub-promo__cta {
                    flex-shrink: 0;
                    font-size: 11px;
                    color: rgba(0, 212, 255, 0.85);
                    white-space: nowrap;
                }
                .hub-promo__close {
                    flex-shrink: 0;
                    width: 26px;
                    height: 26px;
                    line-height: 1;
                    border: none;
                    border-radius: 4px;
                    background: transparent;
                    color: rgba(148, 163, 184, 0.7);
                    font-size: 16px;
                    cursor: pointer;
                }
                .hub-promo__close:hover {
                    color: rgba(226, 232, 240, 0.95);
                }
                /* Mobile first: 375px is the design width. The CTA is the
                   first thing to go, because the whole strip is the tap
                   target anyway. */
                @media (max-width: 480px) {
                    .hub-promo {
                        padding: 5px 8px 0;
                    }
                    .hub-promo__cta {
                        display: none;
                    }
                    .hub-promo__strip {
                        font-size: 12px;
                    }
                }
            `}</style>
        </div>
    );
}
