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

                {/* PWA Manifest — Required for iOS Safari Push Notifications */}
                <link rel="manifest" href="/manifest.json" />
                <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon-180.png" />
                <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png" />
                <link rel="icon" type="image/png" sizes="512x512" href="/icons/icon-512.png" />

                {/* PWA / Mobile App settings */}
                <meta name="mobile-web-app-capable" content="yes" />
                <meta name="apple-mobile-web-app-capable" content="yes" />
                <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
                <meta name="apple-mobile-web-app-title" content="Smarter.Poker" />

                {/* Theme color for mobile browsers */}
                <meta name="theme-color" content="#0a0a15" />
            </Head>
            <body>
                <Main />
                <NextScript />
            </body>
        </Html>
    );
}
