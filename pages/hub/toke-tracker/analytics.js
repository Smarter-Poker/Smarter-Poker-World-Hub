/**
 * TOKE TRACKER — Analytics Page
 * Dealer earnings analytics dashboard
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import PageTransition from '../../../src/components/transitions/PageTransition';
import TokeDashboard from '../../../src/components/bankroll/TokeDashboard';

export default function TokeAnalyticsPage() {
    const router = useRouter();
    const { user } = useAvatar();
    const userId = user?.id;
    const [mounted, setMounted] = useState(false);

    useEffect(() => { setMounted(true); }, []);

    if (!mounted) return null;

    return (
        <PageTransition>
            <SEOHead
                title="Toke Analytics — Earnings Dashboard"
                description="Analyze your dealing earnings with detailed breakdowns, hourly rates, and trend analysis."
                canonical="/hub/toke-tracker/analytics"
            />
            <div style={s.page}>
                <div style={s.bgGrid} />
                <UniversalHeader pageDepth={3} />

                <div style={s.content}>
                    <button onClick={() => router.push('/hub/toke-tracker')} style={s.backBtn}>
                        ← Toke Tracker
                    </button>

                    <h1 style={s.title}>Analytics</h1>
                    <p style={s.subtitle}>Earnings Breakdown And Trends</p>

                    <TokeDashboard userId={userId} refreshTrigger={0} />
                </div>
            </div>
        </PageTransition>
    );
}

const s = {
    page: {
        minHeight: '100vh',
        background: '#18191a',
        position: 'relative',
    },
    bgGrid: {
        position: 'fixed',
        inset: 0,
        backgroundImage: `
            linear-gradient(rgba(0,212,255,0.015) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,212,255,0.015) 1px, transparent 1px)
        `,
        backgroundSize: '24px 24px',
        pointerEvents: 'none',
        zIndex: 0,
    },
    content: {
        position: 'relative',
        zIndex: 1,
        maxWidth: 640,
        margin: '0 auto',
        padding: '12px 16px 40px',
    },
    backBtn: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 16px',
        background: 'rgba(255,255,255,0.06)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 8,
        color: '#b0b3b8',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
        marginBottom: 16,
        transition: 'background 0.2s',
    },
    title: {
        fontFamily: "var(--font-orbitron), 'Inter', sans-serif" ,
        fontSize: 24,
        fontWeight: 700,
        letterSpacing: '0.08em',
        color: '#e4e6eb',
        margin: '0 0 4px',
    },
    subtitle: {
        fontFamily: "'Rajdhani', 'Inter', sans-serif",
        fontSize: 14,
        color: '#b0b3b8',
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        margin: '0 0 20px',
    },
};
