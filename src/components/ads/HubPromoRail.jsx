/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  HUB PROMO RAIL — the World Hub's house-ad surface: pictures, and a popup
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Dan 2026-08-27: with no paid advertisers, the ad space promotes our own
 * features. The plumbing underneath is advertiser-shaped on purpose so nothing
 * has to be rebuilt when a real one arrives.
 *
 * Dan 2026-09-13, verbatim: "MAKE SURE YOU MAKE THE STANDARD FOR ADS
 * EVERYWHERE INSIDE OF SMARTER.POKER TO BE RESPONSIVE FLUID IMAGES ONLY! AND
 * ANY TIME THEY ARE CLICKED THEY SHOULD BE OPEN AND DIRECTED TO WHATEVER THE
 * AD IS DISPLAYING AS A FULL SCREEN POP UP AS WELL."
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * The `hub_promotions` slot has been declared in the `ad_placement` CHECK
 * constraint since Phase 1, and all six campaigns carry a hub_promotions
 * placement with a Hub-relative `target_url`. This is the surface that
 * renders them.
 *
 * ── A PICTURE, AND NOTHING ELSE (2026-09-13) ───────────────────────────────
 * Every advert on this rail is ONE responsive fluid image: a box that is
 * 100% wide and owns its shape (16:9, the shape the venue, tour and series
 * cards below already use), with the creative `object-fit: contain` inside
 * it - it shrinks with the page and is never cut off or distorted. No
 * headline text, no body, no glyph on the surface. The resolver refuses to
 * serve a placement with no picture, and an image that fails to load drops
 * its advert rather than falling back to text. The card used to be text with
 * a 34px thumbnail; that is the thing this replaces.
 *
 * ── A TAP OPENS IT FULL SCREEN (2026-09-13) ────────────────────────────────
 * A tap does not navigate. It opens the advert full screen: the poster
 * (3:4 `poster_url`, falling back to the surface creative) fluid and whole,
 * the headline as a caption, one button that goes where the advert points,
 * and Close. The tap logs nothing; the BUTTON is the click. Closing without
 * going is a dismiss. Rotation holds while the popup is up.
 *
 * "Whatever the ad is displaying" is the advert itself, not the destination
 * page in a frame: five of six destinations are Club Arena routes that must
 * never be framed, and a sponsor's site refuses framing as a matter of
 * course - and its address never reaches this client anyway (see below).
 *
 * ── LABELLED, NEVER ANONYMOUS ──────────────────────────────────────────────
 * This rail sits above promotions written by venues, tours and series - other
 * people's offers. A player must always be able to tell who is speaking, so
 * the popup carries "From Smarter Poker" / "Sponsored By X" and the surface
 * carries an accessible name naming the campaign.
 *
 * ── RENDERS NOTHING WHEN THERE IS NOTHING ──────────────────────────────────
 * No skeleton, no empty frame, no "no promotions" box. An empty promotional
 * region takes vertical space on a 375px screen and trains players to ignore
 * that part of the page, which costs more than the impression was worth.
 *
 * ── THE CLICK MUST SURVIVE THE TAP ─────────────────────────────────────────
 * For an internal destination the click is logged BEFORE navigation and
 * navigation is client-side (router.push), so the in-flight insert is never
 * killed by a document unload. A Club Arena destination is a static SPA the
 * Next router cannot reach, so it gets a real `window.location.assign` -
 * still after the log. A sponsor destination is `/c/<code>`: opened in a new
 * tab with noopener and NOT logged here, because the redirect counts it.
 */

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import {
    resolveHubAds,
    logHubImpression,
    logHubClick,
    logHubAdEvent,
    isSafeHubDestination,
    leavesTheNextRouter,
    isSafeAdImage,
    isExternalAdClick,
} from '../../lib/hubAds';

const SLOT = 'hub_promotions';
/* The declared shape of a hub_promotions creative: 16:9, delivered 1200x675.
   The box owns the shape so a creative of any size cannot reflow the rail. */
const RATIO = '16 / 9';
const ROTATE_MS = 7000;

export default function HubPromoRail({ limit = 3 }) {
    const router = useRouter();
    const [ads, setAds] = useState([]);
    const [index, setIndex] = useState(0);
    const [open, setOpen] = useState(false);
    const openRef = useRef(false);
    openRef.current = open;

    useEffect(() => {
        let cancelled = false;
        (async () => {
            // Targeting, flight dates and the 24h frequency cap are all decided
            // by fn_resolve_ads. Nothing is filtered here except the one rule
            // the renderer owns: only a same-origin picture is ever fetched.
            const rows = await resolveHubAds(limit);
            if (!cancelled) setAds(rows.filter((a) => isSafeAdImage(a.imageUrl)));
        })();
        return () => {
            cancelled = true;
        };
    }, [limit]);

    // One impression per ad per page-load, de-duplicated inside the client.
    useEffect(() => {
        ads.forEach((ad) => logHubImpression(ad.adId));
    }, [ads]);

    // Three rotating pictures; the rotation holds while the popup is open so
    // the poster on screen is the advert that was tapped.
    useEffect(() => {
        if (ads.length < 2) return undefined;
        const t = setInterval(() => {
            if (openRef.current) return;
            setIndex((i) => (i + 1) % ads.length);
        }, ROTATE_MS);
        return () => clearInterval(t);
    }, [ads.length]);

    // An image that 404s must not leave a broken-image icon: the advert is
    // dropped, not rendered as text. Keyed by ad so one bad file does not
    // hide the others.
    const dropBroken = (adId) => {
        setAds((prev) => prev.filter((a) => a.adId !== adId));
        setIndex(0);
    };

    const ad = ads.length ? ads[index % ads.length] : null;
    if (!ad) return null;

    const target = isSafeHubDestination(ad.targetUrl) ? ad.targetUrl : null;
    const external = isExternalAdClick(target);

    /* A tap opens the popup. Nothing is logged here: attention is the
       impression, and the click is the button. */
    const activate = (e) => {
        e.preventDefault();
        setOpen(true);
    };

    /* The button is the click. Internal: logged first, then the route
       changes. External: a new tab through /c/<code>, counted by the
       redirect, never here. */
    const proceed = () => {
        if (!target) return;
        setOpen(false);
        if (external) {
            window.open(target, '_blank', 'noopener,noreferrer');
            return;
        }
        logHubClick(ad.adId);
        if (leavesTheNextRouter(target)) {
            window.location.assign(target);
            return;
        }
        router.push(target);
    };

    /* Closing without going is a dismiss, and it expires with the page load. */
    const dismiss = () => {
        setOpen(false);
        logHubAdEvent(ad.adId, 'dismiss');
    };

    const href = target || '/hub';

    return (
        <section className="promo-rail" aria-label="From Smarter Poker">
            {/* A real href so the surface is a link to a screen reader, to
                middle-click and to "copy link address" - but a plain tap opens
                the popup, and the popup's button does the going. */}
            <a
                className="promo-picture"
                href={href}
                style={{ aspectRatio: RATIO }}
                aria-label={ad.headline || 'Promotion'}
                onClick={activate}
            >
                <img
                    key={ad.adId}
                    className="promo-image"
                    src={ad.imageUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    onError={() => dropBroken(ad.adId)}
                />
            </a>
            {ads.length > 1 ? (
                <span className="promo-dots" aria-hidden="true">
                    {ads.map((a, i) => (
                        <i key={a.adId} className={i === index % ads.length ? 'on' : ''} />
                    ))}
                </span>
            ) : null}

            {open ? (
                <HubAdInterstitial ad={ad} external={external} onProceed={proceed} onClose={dismiss} />
            ) : null}

            <style jsx>{`
                .promo-rail {
                    position: relative;
                    display: block;
                    width: 100%;
                    margin: 0 0 16px;
                }
                @media (min-width: 768px) {
                    .promo-rail {
                        max-width: 720px;
                        margin-left: auto;
                        margin-right: auto;
                    }
                }
                /* Responsive fluid: the box is 100% wide and owns the shape;
                   the picture is contained inside it, never cropped, never
                   stretched, and shrinks with the page. */
                .promo-picture {
                    display: block;
                    width: 100%;
                    overflow: hidden;
                    border-radius: 10px;
                    background: #06080b;
                    border: 1px solid #dadde1;
                    cursor: pointer;
                }
                .promo-picture:focus-visible {
                    outline: 2px solid #1877f2;
                    outline-offset: 2px;
                }
                .promo-image {
                    display: block;
                    width: 100%;
                    height: 100%;
                    object-fit: contain;
                    object-position: center;
                    user-select: none;
                    -webkit-user-drag: none;
                }
                .promo-dots {
                    position: absolute;
                    left: 0;
                    right: 0;
                    bottom: 6px;
                    display: flex;
                    justify-content: center;
                    gap: 5px;
                    pointer-events: none;
                }
                .promo-dots i {
                    width: 6px;
                    height: 6px;
                    border-radius: 50%;
                    background: rgba(255, 255, 255, 0.45);
                }
                .promo-dots i.on {
                    background: #ffffff;
                }
            `}</style>
        </section>
    );
}

/**
 * The full-screen popup. `position: fixed; inset: 0`, the poster contained
 * in a box that reads the picture's real shape, one button, Close. Escape
 * closes, focus lands on Close, body scroll is locked while it is up.
 */
function HubAdInterstitial({ ad, external, onProceed, onClose }) {
    const closeRef = useRef(null);
    const [ratio, setRatio] = useState('3 / 4');
    const [broken, setBroken] = useState(false);
    const picture = isSafeAdImage(ad.posterUrl)
        ? ad.posterUrl
        : isSafeAdImage(ad.imageUrl)
          ? ad.imageUrl
          : null;

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKey);
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        closeRef.current?.focus();
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = prev;
        };
    }, [onClose]);

    const kind =
        ad.advertiserKind === 'house' || !ad.advertiserName
            ? 'From Smarter Poker'
            : `Sponsored By ${ad.advertiserName}`;

    return (
        <div
            className="ad-interstitial"
            role="dialog"
            aria-modal="true"
            aria-label={ad.headline || 'Promotion'}
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div className="ad-interstitial__sheet">
                <button
                    ref={closeRef}
                    type="button"
                    className="ad-interstitial__close"
                    aria-label="Close"
                    onClick={onClose}
                >
                    {'✕'}
                </button>
                <span className="ad-interstitial__kind">{kind}</span>
                <div className="ad-interstitial__picture" style={{ aspectRatio: ratio }}>
                    {picture && !broken ? (
                        <img
                            src={picture}
                            alt=""
                            decoding="async"
                            onLoad={(e) => {
                                const img = e.currentTarget;
                                if (img.naturalWidth && img.naturalHeight) {
                                    setRatio(`${img.naturalWidth} / ${img.naturalHeight}`);
                                }
                            }}
                            onError={() => setBroken(true)}
                        />
                    ) : (
                        <span className="ad-interstitial__headline-only">{ad.headline}</span>
                    )}
                </div>
                {picture && !broken && ad.headline ? (
                    <p className="ad-interstitial__headline">{ad.headline}</p>
                ) : null}
                <button type="button" className="ad-interstitial__cta" onClick={onProceed}>
                    {ad.ctaLabel || 'Open'}
                    {external ? <span className="ad-interstitial__ext" aria-hidden="true">{'↗'}</span> : null}
                </button>
            </div>

            <style jsx>{`
                .ad-interstitial {
                    position: fixed;
                    inset: 0;
                    z-index: 9500;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: max(12px, env(safe-area-inset-top)) 12px max(12px, env(safe-area-inset-bottom));
                    background: rgba(3, 5, 8, 0.92);
                    backdrop-filter: blur(6px);
                    -webkit-backdrop-filter: blur(6px);
                    animation: ad-interstitial-in 220ms ease-out both;
                }
                @keyframes ad-interstitial-in {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                .ad-interstitial__sheet {
                    position: relative;
                    display: grid;
                    gap: 12px;
                    justify-items: center;
                    width: 100%;
                    max-width: min(100%, 560px);
                    max-height: 100%;
                    overflow-y: auto;
                    padding: 44px 8px 8px;
                }
                @media (prefers-reduced-motion: reduce) {
                    .ad-interstitial { animation: none; }
                }
                .ad-interstitial__close {
                    position: absolute;
                    top: 0;
                    right: 0;
                    width: 44px;
                    height: 44px;
                    border: 1px solid rgba(148, 163, 184, 0.35);
                    border-radius: 50%;
                    background: rgba(6, 8, 11, 0.8);
                    color: #e6edf3;
                    font-size: 18px;
                    line-height: 1;
                    cursor: pointer;
                }
                .ad-interstitial__close:focus-visible,
                .ad-interstitial__cta:focus-visible {
                    outline: 2px solid #65c4ff;
                    outline-offset: 2px;
                }
                .ad-interstitial__kind {
                    padding: 3px 10px;
                    border-radius: 999px;
                    font-size: 11px;
                    font-weight: 800;
                    letter-spacing: 0.08em;
                    text-transform: uppercase;
                    color: rgba(226, 232, 240, 0.92);
                    background: rgba(6, 8, 11, 0.72);
                    border: 1px solid rgba(148, 163, 184, 0.35);
                }
                /* Fluid and whole: the box is 100% wide, owns the poster's real
                   shape, and is capped to the viewport so the button is never
                   pushed off screen on a phone. */
                .ad-interstitial__picture {
                    width: 100%;
                    max-height: min(70vh, 70dvh);
                    overflow: hidden;
                    border-radius: 12px;
                    background: #06080b;
                    display: grid;
                    place-items: center;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
                }
                .ad-interstitial__picture img {
                    display: block;
                    width: 100%;
                    height: 100%;
                    object-fit: contain;
                    object-position: center;
                    user-select: none;
                    -webkit-user-drag: none;
                }
                .ad-interstitial__headline-only {
                    padding: 24px;
                    font-size: 20px;
                    font-weight: 800;
                    color: #e6edf3;
                    text-align: center;
                }
                .ad-interstitial__headline {
                    margin: 0;
                    max-width: 34ch;
                    font-size: 16px;
                    font-weight: 700;
                    color: rgba(226, 232, 240, 0.92);
                    text-align: center;
                }
                .ad-interstitial__cta {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    min-height: 48px;
                    padding: 0 28px;
                    border: 0;
                    border-radius: 12px;
                    background: linear-gradient(135deg, #1877f2 0%, #0f5fc7 100%);
                    color: #ffffff;
                    font: inherit;
                    font-size: 16px;
                    font-weight: 800;
                    letter-spacing: 0.02em;
                    cursor: pointer;
                    box-shadow: 0 0 18px rgba(24, 119, 242, 0.4);
                }
                .ad-interstitial__cta:active {
                    filter: brightness(0.92);
                }
                .ad-interstitial__ext {
                    font-size: 14px;
                }
            `}</style>
        </div>
    );
}
