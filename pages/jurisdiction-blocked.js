/**
 * /jurisdiction-blocked — shown to users whose IP resolves to a
 * disallowed jurisdiction per config/geo-blocks.json.
 *
 * The middleware redirects here with ?reason=country:XX or
 * ?reason=us-state:XX. We show a friendly explanation, a support
 * contact, and nothing else — no login, no sign-up, no game links.
 *
 * Phase 6.1.11 — Trust & Safety §1.3.3
 */
import Head from 'next/head';
import { useRouter } from 'next/router';

export default function JurisdictionBlocked() {
    const router = useRouter();
    const reason = typeof router.query.reason === 'string' ? router.query.reason : '';
    const [kind, code] = reason.split(':');

    const label =
        kind === 'country' && code
            ? `country code ${code}`
            : kind === 'us-state' && code
            ? `US state ${code}`
            : 'your current region';

    return (
        <>
            <Head>
                <title>Service Unavailable in Your Region — Smarter.Poker</title>
                <meta name="robots" content="noindex" />
            </Head>
            <main
                style={{
                    minHeight: '100vh',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '24px',
                    background: '#0b0f14',
                    color: '#e5e7eb',
                    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
                }}
            >
                <div style={{ maxWidth: 560, textAlign: 'center', lineHeight: 1.55 }}>
                    <div style={{ fontSize: 48, marginBottom: 12 }}>🌐</div>
                    <h1 style={{ fontSize: 28, margin: '0 0 12px' }}>
                        Smarter.Poker isn’t available in your region
                    </h1>
                    <p style={{ fontSize: 16, color: '#9ca3af', margin: '0 0 20px' }}>
                        Based on {label}, we’re unable to offer access from here.
                        This is a legal/regulatory restriction, not a technical one.
                    </p>
                    <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 32px' }}>
                        If you believe this block is incorrect (for example, you’re travelling
                        through a VPN, or your mobile carrier resolves to the wrong region),
                        please contact support from a connection in an allowed jurisdiction.
                    </p>
                    <a
                        href="mailto:support@smarter.poker?subject=Jurisdiction%20block%20appeal"
                        style={{
                            display: 'inline-block',
                            padding: '10px 20px',
                            borderRadius: 8,
                            background: '#2563eb',
                            color: '#fff',
                            textDecoration: 'none',
                            fontWeight: 600,
                        }}
                    >
                        Contact support
                    </a>
                    <div style={{ marginTop: 28, fontSize: 12, color: '#4b5563' }}>
                        Reference: {reason || 'unknown'}
                    </div>
                </div>
            </main>
        </>
    );
}
