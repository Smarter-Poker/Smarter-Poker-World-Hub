/**
 * TOKE TRACKER — Dealer Vault Page
 * Tax documents, licenses, W-2s
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import { useAvatar } from '../../../src/contexts/AvatarContext';
import PageTransition from '../../../src/components/transitions/PageTransition';
import DealerVault from '../../../src/components/bankroll/DealerVault';
import { fetchGigs } from '../../../src/lib/bankroll/tokeSelectors';

export default function DealerVaultPage() {
    const router = useRouter();
    const { user } = useAvatar();
    const userId = user?.id;
    const [mounted, setMounted] = useState(false);
    const [completedGigs, setCompletedGigs] = useState([]);

    useEffect(() => { setMounted(true); }, []);

    // Load completed gigs for 1099 threshold alerts
    const loadGigs = useCallback(async () => {
        if (!userId) return;
        try {
            const gigs = await fetchGigs(userId);
            setCompletedGigs(gigs.filter(g => g.status === 'completed'));
        } catch (err) {
            console.error('Error loading gigs for vault:', err);
        }
    }, [userId]);

    useEffect(() => { loadGigs(); }, [loadGigs]);

    if (!mounted) return null;

    return (
        <PageTransition>
            <SEOHead
                title="Dealer Vault — Secure Document Storage"
                description="Store and manage your tax documents, gaming licenses, W-2s, and employment paperwork securely."
                canonical="/hub/toke-tracker/vault"
            />
            <div style={s.page}>
                <div style={s.bgGrid} />
                <UniversalHeader pageDepth={3} />

                <div style={s.content}>
                    <button onClick={() => router.push('/hub/toke-tracker')} style={s.backBtn}>
                        ← Toke Tracker
                    </button>

                    <h1 style={s.title}>Dealer Vault</h1>
                    <p style={s.subtitle}>Secure Document Storage</p>

                    <DealerVault userId={userId} completedGigs={completedGigs} />
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
