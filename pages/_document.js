/**
 * GLOBAL DOCUMENT — Applies to ALL pages automatically
 * Sets viewport meta tag for proper mobile scaling across all devices
 */

import Document, { Html, Head, Main, NextScript } from 'next/document';

export default class MyDocument extends Document {
    render() {
        return (
            <Html lang="en">
                <Head>
                    {/* ═══ RESOURCE HINTS — reduce connection latency ═══ */}
                    {/* Supabase: DB + storage requests start pre-connecting immediately */}
                    <link rel="preconnect" href="https://auth.smarter.poker" crossOrigin="anonymous" />
                    <link rel="dns-prefetch" href="https://auth.smarter.poker" />
                    {/* iOS PWA support */}
                    <link rel="apple-touch-icon" href="/icons/icon-192.png" />
                    <link rel="apple-touch-icon" sizes="512x512" href="/icons/icon-512.png" />
                    <meta name="apple-mobile-web-app-capable" content="yes" />
                    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
                    <meta name="apple-mobile-web-app-title" content="Smarter.Poker" />
                    <meta name="mobile-web-app-capable" content="yes" />
                    {/* Supabase storage CDN (avatars, uploads, media) */}
                    <link rel="preconnect" href="https://storage.googleapis.com" crossOrigin="anonymous" />

                    {/* GLOBAL VIEWPORT MOVED TO _app.js per Next.js requirements */}

                    {/* ═══ GLOBAL SEO DEFAULTS ═══

                        The global <meta name="robots"> that used to live here is
                        GONE, deliberately (audit 2026-08-14). _document renders
                        outside next/head's dedupe, so every page carried TWO
                        robots tags: this one plus SEOHead's. A runtime probe
                        found duplicated `index, follow` on public pages — and,
                        far worse, on PRIVATE home-game pages this tag sat in
                        direct conflict with SEOHead's `noindex`, re-inviting
                        crawlers to the exact pages the noindex work (audit C-3)
                        exists to hide.

                        Removing it is semantically free: no robots meta at all
                        means index,follow — the default. SEOHead remains the
                        single owner of robots directives. Do not re-add one
                        here. */}
                    <meta name="author" content="Smarter.Poker" />
                    <meta name="publisher" content="Smarter Software Inc." />

                    {/* Fallback Open Graph — overridden by per-page SEOHead */}
                    <meta property="og:site_name" content="Smarter.Poker" />
                    <meta property="og:type" content="website" />
                    <meta property="og:locale" content="en_US" />
                    <meta property="og:url" content="https://smarter.poker" />
                    <meta property="og:title" content="Smarter.Poker | The Future Of The Game" />
                    <meta property="og:description" content="Train Smarter. Connect Globally. Manage Everything. The Premier Poker Platform With GTO Training, AI Coaching, Social Networking, Bankroll Tracking, And Club Commander Poker Room Management." />
                    <meta property="og:image" content="https://smarter.poker/images/og-default.png" />
                    <meta property="og:image:width" content="1200" />
                    <meta property="og:image:height" content="2151" />

                    {/* Fallback Twitter Card */}
                    <meta name="twitter:card" content="summary_large_image" />
                    <meta name="twitter:site" content="@SmarterPoker" />
                    <meta name="twitter:title" content="Smarter.Poker | The Future Of The Game" />
                    <meta name="twitter:description" content="Train Smarter. Connect Globally. Manage Everything. The Premier Poker Platform With GTO Training, AI Coaching, Social Networking, Bankroll Tracking, And Club Commander Poker Room Management." />
                    <meta name="twitter:image" content="https://smarter.poker/images/og-default.png" />

                    {/* PWA settings — manifest/icons are in _app.js for route-based switching */}
                    <meta name="mobile-web-app-capable" content="Yes" />
                    <meta name="apple-mobile-web-app-capable" content="Yes" />
                    <meta name="apple-mobile-web-app-status-bar-style" content="Black-translucent" />

                    {/* Theme color for mobile browsers */}
                    <meta name="theme-color" content="#0a0a15" />

                    {/* OpenCV.js — WASM for document detection (receipt scanner) */}
                    <script async src="https://docs.opencv.org/4.9.0/opencv.js"></script>

                    {/* ═══ PWA STALE CACHE BUSTER ═════════════════════════════════
                         If Vercel deployed a new build, old PWA service workers
                         will try to request obsolete Next.js chunk files, getting 404s
                         and causing a blank white screen. This interceptor catches
                         script load failures, nukes the Service Worker, and hard-reloads.
                    ═══════════════════════════════════════════════════════════════ */}
                    <script dangerouslySetInnerHTML={{
                        __html: `
                            window.addEventListener('error', function(e) {
                                if (e.target && e.target.tagName === 'SCRIPT') {
                                    var src = e.target.src || '';
                                    if (src.includes('_next/static/chunks')) {
                                        console.warn('⚠️ Stale chunk failed. Nuking PWA cache & reloading...');
                                        if (sessionStorage.getItem('reloaded_stale_chunk')) {
                                            console.warn('Already attempted reload. Halting to prevent infinite loop.');
                                            return;
                                        }
                                        sessionStorage.setItem('reloaded_stale_chunk', '1');
                                        
                                        if ('serviceWorker' in navigator) {
                                            navigator.serviceWorker.getRegistrations().then(function(regs) {
                                                var promises = [];
                                                for (var i = 0; i < regs.length; i++) {
                                                    promises.push(regs[i].unregister());
                                                }
                                                Promise.all(promises).then(function() {
                                                    window.location.reload(true);
                                                });
                                            });
                                        } else {
                                            window.location.reload(true);
                                        }
                                    }
                                }
                            }, true);
                        `
                    }} />
                </Head>
                <body>
                    {/* ═══ NUCLEAR CSS FAILSAFE ═══════════════════════════════════
                         next/font/google wraps content in visibility:hidden during SSR.
                         Client JS is supposed to swap it to visible during hydration.
                         If JS fails (stale PWA cache, chunk error, JS crash), the page
                         stays PERMANENTLY INVISIBLE — producing blank white screens.
                         
                         This pure-CSS animation forces visibility after 2 seconds,
                         guaranteeing content shows even if JavaScript completely fails.
                         The 2s delay avoids FOUC during normal fast hydration.
                    ═══════════════════════════════════════════════════════════════ */}
                    <style dangerouslySetInnerHTML={{
                        __html: `
                        @keyframes forceVisible {
                            to { visibility: visible !important; opacity: 1 !important; }
                        }
                        #__next > div[style*="visibility:hidden"],
                        #__next > div[style*="visibility: hidden"] {
                            animation: forceVisible 0s forwards;
                            animation-delay: 2s;
                        }
                        /* Also override the data-next-hide-fouc body display:none */
                        @keyframes forceDisplay {
                            to { display: block !important; }
                        }
                        body[style*="display:none"],
                        body[style*="display: none"] {
                            animation: forceDisplay 0s forwards;
                            animation-delay: 2s;
                        }
                    `}} />
                    <Main />
                    <NextScript />
                </body>
            </Html>
        );
    }
}
