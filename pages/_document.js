/**
 * GLOBAL DOCUMENT — Applies to ALL pages automatically
 * Sets viewport meta tag for proper mobile scaling across all devices
 */

import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
    return (
        <Html lang="en">
            <Head>
                {/* GLOBAL VIEWPORT — Facebook-style, applies to ALL pages */}
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />

                {/* ═══ GLOBAL SEO DEFAULTS ═══ */}
                <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
                <meta name="author" content="Smarter.Poker" />
                <meta name="publisher" content="Smarter Software Inc." />
                <meta name="application-name" content="Smarter.Poker" />

                {/* Fallback Open Graph — overridden by per-page SEOHead */}
                <meta property="og:site_name" content="Smarter.Poker" />
                <meta property="og:type" content="Website" />
                <meta property="og:locale" content="en_US" />
                <meta property="og:url" content="https://smarter.poker" />
                <meta property="og:title" content="Smarter.Poker | The Future Of The Game" />
                <meta property="og:description" content="Train Smarter. Connect Globally. Manage Everything. The Premier Poker Platform With GTO Training, AI Coaching, Social Networking, Bankroll Tracking, And Club Commander Poker Room Management." />
                <meta property="og:image" content="https://smarter.poker/images/og-default.png" />
                <meta property="og:image:width" content="1200" />
                <meta property="og:image:height" content="2151" />

                {/* Fallback Twitter Card */}
                <meta name="twitter:card" content="Summary_large_image" />
                <meta name="twitter:site" content="@SmarterPoker" />
                <meta name="twitter:title" content="Smarter.Poker | The Future Of The Game" />
                <meta name="twitter:description" content="Train Smarter. Connect Globally. Manage Everything. The Premier Poker Platform With GTO Training, AI Coaching, Social Networking, Bankroll Tracking, And Club Commander Poker Room Management." />
                <meta name="twitter:image" content="https://smarter.poker/images/og-default.png" />

                {/* PWA Manifest — Required for iOS Safari Push Notifications */}
                <link rel="manifest" href="/manifest.json" />
                <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon-180.png" />
                <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png" />
                <link rel="icon" type="image/png" sizes="512x512" href="/icons/icon-512.png" />

                {/* PWA / Mobile App settings */}
                <meta name="mobile-web-app-capable" content="Yes" />
                <meta name="apple-mobile-web-app-capable" content="Yes" />
                <meta name="apple-mobile-web-app-status-bar-style" content="Black-translucent" />
                <meta name="apple-mobile-web-app-title" content="Smarter.Poker" />

                {/* Theme color for mobile browsers */}
                <meta name="theme-color" content="#0a0a15" />

                {/* OpenCV.js — WASM for document detection (receipt scanner) */}
                <script async src="https://docs.opencv.org/4.9.0/opencv.js"></script>
            </Head>
            <body>
                <Main />
                <NextScript />
            </body>
        </Html>
    );
}
