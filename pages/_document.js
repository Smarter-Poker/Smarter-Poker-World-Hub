/**
 * GLOBAL DOCUMENT — Applies to ALL pages automatically
 * Sets viewport meta tag for proper mobile scaling across all devices
 */

import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
    return (
        <Html lang="en">
            <Head>
                {/* PWA Manifest — Required for iOS Safari Push Notifications */}
                <link rel="manifest" href="/manifest.json" />
                <link rel="apple-touch-icon" href="/brain-icon.png" />

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
