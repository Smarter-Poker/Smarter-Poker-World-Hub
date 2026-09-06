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
                    {/* Supabase project API — every page's first DB/auth call goes here */}
                    <link rel="preconnect" href="https://kuklfnapbkmacvwxktbh.supabase.co" crossOrigin="anonymous" />
                    <link rel="dns-prefetch" href="https://kuklfnapbkmacvwxktbh.supabase.co" />
                    {/* Google Fonts — loaded by many hub pages; preconnect cuts TLS latency */}
                    <link rel="preconnect" href="https://fonts.googleapis.com" crossOrigin="anonymous" />
                    <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                    {/* The dns-prefetch to cdn.onesignal.com is gone. Its comment
                        claimed the SDK was "loaded on every page"; it had not been
                        loaded by any hub page since OneSignal was retired on
                        2026-08-19, so this was warming DNS for a host nothing
                        contacted. Club Arena's index.html was still injecting the
                        real SDK until 2026-08-29 — that is removed too. */}
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

                    {/* Open Graph and Twitter defaults live in _app.js. Unlike
                        _document, next/head can deduplicate and replace those
                        defaults when a route supplies its own SEOHead values. */}

                    {/* PWA settings — manifest/icons are in _app.js for route-based switching */}

                    {/* Theme color for mobile browsers */}
                    <meta name="theme-color" content="#0a0a15" />

                    {/* OpenCV removed from _document.js — load lazily in the specific component that needs it (Toke Tracker). See: pages/hub/bankroll-manager.js or wherever the receipt scanner lives. */}

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
                                        console.warn('Stale chunk failed. Clearing caches and reloading...');
                                        if (sessionStorage.getItem('reloaded_stale_chunk')) {
                                            console.warn('Already attempted reload. Halting to prevent infinite loop.');
                                            return;
                                        }
                                        sessionStorage.setItem('reloaded_stale_chunk', '1');

                                        // PUSH FIX (2026-08-19): this used to unregister EVERY service
                                        // worker, which destroys the PushSubscription the PWA worker owns.
                                        // Stale chunks are fixed by clearing CACHES, not by unregistering
                                        // the worker, so we now delete caches and leave /sw.js alone.
                                        // Foreign workers (legacy OneSignal, old scopes) are still removed.
                                        var done = function() { window.location.reload(true); };
                                        var work = [];
                                        try {
                                            if (window.caches && caches.keys) {
                                                work.push(caches.keys().then(function(keys) {
                                                    return Promise.all(keys.map(function(k) { return caches.delete(k); }));
                                                }));
                                            }
                                        } catch (err) { /* caches unavailable */ }
                                        if ('serviceWorker' in navigator) {
                                            work.push(navigator.serviceWorker.getRegistrations().then(function(regs) {
                                                var promises = [];
                                                for (var i = 0; i < regs.length; i++) {
                                                    var r = regs[i];
                                                    var w = r.active || r.waiting || r.installing;
                                                    var u = (w && w.scriptURL) || '';
                                                    // Unknown state: leave it alone rather than fail open.
                                                    if (!u || /\\/sw\\.js(\\?|$)/.test(u)) continue;
                                                    promises.push(r.unregister());
                                                }
                                                return Promise.all(promises);
                                            }));
                                        }
                                        Promise.all(work).then(done, done);
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
                            /* Priority declarations are invalid inside CSS
                               keyframes and WebKit discards them entirely. */
                            to { visibility: visible; opacity: 1; }
                        }
                        #__next > div:not([class])[style*="visibility:hidden"],
                        #__next > div:not([class])[style*="visibility: hidden"],
                        #__next > div > div:not([class])[style*="visibility:hidden"],
                        #__next > div > div:not([class])[style*="visibility: hidden"] {
                            animation: forceVisible 0s forwards;
                            animation-delay: 2s;
                        }
                        /* Also override the data-next-hide-fouc body display:none */
                        @keyframes forceDisplay {
                            to { display: block; }
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
