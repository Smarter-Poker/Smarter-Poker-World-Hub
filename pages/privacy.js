/**
 * /privacy - the privacy policy as its own server-rendered page.
 *
 * Until 2026-09-08 this URL was a permanent redirect to /terms, where the
 * policy sits behind a client-side tab. The App Store and Google Play read
 * the privacy policy URL with a crawler, which sees the redirect and the
 * terms tab, not the policy. This page renders the same PrivacySection the
 * terms page renders, with no client state, so the first byte is the policy.
 */
import Link from 'next/link';
import SEOHead from '../src/components/seo/SEOHead';
import { hubCollectionSchema } from '../src/lib/seo/hubPageSchema';
import { PrivacySection, styles } from './terms';

// AEO phase 3 (2026-09-18): /terms carried a graph and this page carried
// none, though it is the URL the app stores read and the one every hub
// summary links to in its compliance line.
const PRIVACY_SCHEMA = hubCollectionSchema({
  path: '/privacy',
  name: 'Privacy Policy | Smarter.Poker',
  description:
    'What Smarter Software Inc. Collects, How It Is Used, What Is Never Sold, And What A Player Can Ask To See Or Have Deleted.',
  trail: [['Privacy Policy', '/privacy']],
});

export default function PrivacyPolicy() {
    return (
        <>
            <SEOHead
                title="Privacy Policy"
                description="The Smarter.Poker Privacy Policy: What Is Collected, How It Is Used, What Is Never Sold, And What You Can Ask To See, Correct Or Have Deleted. Covers The Website And The Poker Arena App."
                canonical="/privacy"
                jsonLd={PRIVACY_SCHEMA}
            />

            <div style={styles.container}>
                <div style={styles.backgroundGrid} />
                <div style={styles.glowEffect} />

                <header style={styles.header}>
                    <Link href="/" style={styles.logo}>
                        <div style={styles.logoOrb} />
                        <span style={styles.logoText}>Smarter.Poker</span>
                    </Link>
                    <Link href="/terms" style={styles.link}>
                        Terms Of Service
                    </Link>
                </header>

                <main style={styles.main}>
                    <div style={styles.card}>
                        <div style={styles.content}>
                            <PrivacySection />
                        </div>

                        <div style={styles.footer}>
                            <p style={styles.lastUpdated}>Last Updated: September 8, 2026</p>
                            <p style={styles.contact}>
                                Questions? Contact Us at{' '}
                                <a href="mailto:support@smarter.poker" style={styles.link}>
                                    Support@Smarter.Poker
                                </a>
                            </p>
                        </div>
                    </div>
                </main>
            </div>

            <style dangerouslySetInnerHTML={{ __html: `
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }
        html, body {
          background: #0a1628;
          color: #e0e0e0;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          min-height: 100vh;
        }
        a {
          text-decoration: none;
        }
      ` }} />
        </>
    );
}
