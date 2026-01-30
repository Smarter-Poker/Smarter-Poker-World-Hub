/**
 * VIP - Premium membership page (coming soon)
 */
import Head from 'next/head';
import Link from 'next/link';
import UniversalHeader from '../../src/components/ui/UniversalHeader';

const C = { bg: '#F0F2F5', card: '#FFFFFF', text: '#050505', textSec: '#65676B', border: '#DADDE1', blue: '#1877F2' };

export default function VipPage() {
    return (
        <>
            <Head>
                <title>VIP Membership | Smarter.Poker</title>
                <meta name="description" content="Smarter.Poker VIP membership - premium features coming soon." />
            </Head>
            <UniversalHeader />
            <div style={{
                minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", paddingTop: 60,
            }}>
                <div style={{
                    background: C.card, borderRadius: 16, padding: '48px 32px', maxWidth: 480, width: '90%',
                    textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.08)', border: `1px solid ${C.border}`,
                }}>
                    <div style={{
                        width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg, #d4a853, #b8860b)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px',
                    }}>
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                    </div>
                    <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, margin: '0 0 8px' }}>VIP Membership</h1>
                    <p style={{ fontSize: 15, color: C.textSec, lineHeight: 1.5, margin: '0 0 24px' }}>
                        Premium features and exclusive benefits are coming soon. Stay tuned for early access.
                    </p>
                    <Link href="/hub/settings" style={{
                        display: 'inline-block', padding: '12px 32px', background: C.blue, color: '#FFFFFF',
                        borderRadius: 8, fontWeight: 600, fontSize: 15, textDecoration: 'none',
                    }}>
                        Back to Settings
                    </Link>
                </div>
            </div>
        </>
    );
}
