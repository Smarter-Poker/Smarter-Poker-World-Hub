import Link from 'next/link';

export default function Custom500() {
    return (
        <main style={{
            minHeight: '100vh',
            display: 'grid',
            placeItems: 'center',
            padding: 24,
            background: 'radial-gradient(circle at 50% 25%, #102c42 0%, #07131e 38%, #03080d 100%)',
            color: '#f5fbff',
            fontFamily: 'Inter, sans-serif',
        }}>
            <section style={{
                width: 'min(560px, 100%)',
                padding: '48px 32px',
                textAlign: 'center',
                border: '1px solid rgba(97, 211, 255, 0.65)',
                background: 'linear-gradient(145deg, rgba(20, 43, 59, 0.96), rgba(3, 10, 16, 0.98))',
                boxShadow: '0 24px 70px rgba(0, 0, 0, 0.55), inset 0 1px rgba(255, 255, 255, 0.12)',
            }}>
                <p style={{ margin: 0, color: '#75ddff', letterSpacing: '0.24em', textTransform: 'uppercase' }}>
                    System Recovery
                </p>
                <h1 style={{ margin: '12px 0 8px', fontSize: 'clamp(64px, 16vw, 104px)', lineHeight: 1 }}>500</h1>
                <h2 style={{ margin: '0 0 12px', fontSize: 24 }}>The Table Is Temporarily Unavailable</h2>
                <p style={{ margin: 0, color: 'rgba(229, 243, 251, 0.75)', lineHeight: 1.6 }}>
                    The Hand Could Not Be Dealt. Return To The Hub And Try Again.
                </p>
                <Link href="/hub" style={{
                    display: 'inline-block',
                    marginTop: 28,
                    padding: '12px 28px',
                    border: '1px solid #7fe5ff',
                    background: 'linear-gradient(#d7f8ff, #56c8ec 48%, #16799d 52%, #0a3d55)',
                    color: '#031018',
                    textDecoration: 'none',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    boxShadow: '0 8px 24px rgba(0, 181, 238, 0.3)',
                }}>
                    Return To Hub
                </Link>
            </section>
        </main>
    );
}
