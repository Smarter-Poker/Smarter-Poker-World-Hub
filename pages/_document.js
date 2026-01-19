/**
 * GLOBAL DOCUMENT — Applies to ALL pages automatically
 * Sets viewport meta tag for proper mobile scaling across all devices
 */

import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
    return (
        <Html lang="en">
            <Head>
                {/* PWA / Mobile App settings */}
                <meta name="mobile-web-app-capable" content="yes" />
                <meta name="apple-mobile-web-app-capable" content="yes" />
                <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />

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
