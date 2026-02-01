/* ═══════════════════════════════════════════════════════════════════════════
   CLUB ARENA — Marketplace
   ═══════════════════════════════════════════════════════════════════════════ */

import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { supabase } from '../../../src/lib/supabase';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';

const CATEGORIES = [
    { id: 'all', label: 'ALL' },
    { id: 'dealers', label: 'DEALERS' },
    { id: 'equipment', label: 'EQUIPMENT' },
    { id: 'venues', label: 'VENUES' },
];

export default function Marketplace() {
    const router = useRouter();
    const [category, setCategory] = useState('all');
    const [listings, setListings] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        loadListings();
    }, [category]);

    async function loadListings() {
        setIsLoading(true);
        try {
            let query = supabase
                .from('commander_dealer_marketplace')
                .select('*')
                .eq('status', 'active')
                .order('created_at', { ascending: false })
                .limit(20);

            const { data } = await query;
            setListings(data || []);
        } catch (e) {
            console.error('[Marketplace] Error:', e);
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <>
            <Head>
                <title>Marketplace | Club Arena</title>
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
                <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
            </Head>

            <div style={{ minHeight: '100vh', background: 'radial-gradient(ellipse at center, #0a1a2e 0%, #020812 70%, #010408 100%)' }}>
                <UniversalHeader pageDepth={2} />

                <div style={{ padding: '16px 20px 40px', maxWidth: '600px', margin: '0 auto' }}>
                    <button onClick={() => router.push('/hub/club-arena')} style={backBtn}>
                        &#8592; Back to Club Arena
                    </button>

                    <h1 style={pageTitle}>Marketplace</h1>

                    {/* Category tabs */}
                    <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', background: 'rgba(0,0,0,0.3)', borderRadius: '12px', padding: '4px' }}>
                        {CATEGORIES.map(c => (
                            <button key={c.id} onClick={() => setCategory(c.id)} style={{
                                flex: 1, padding: '10px', borderRadius: '10px', border: 'none',
                                background: category === c.id ? 'linear-gradient(135deg, #00D4FF, #0066FF)' : 'transparent',
                                color: category === c.id ? '#000' : 'rgba(255,255,255,0.5)',
                                fontFamily: 'Orbitron, sans-serif', fontSize: '9px', fontWeight: 700,
                                cursor: 'pointer', letterSpacing: '1px',
                            }}>
                                {c.label}
                            </button>
                        ))}
                    </div>

                    {isLoading ? (
                        <div style={{ textAlign: 'center', padding: '60px 0', color: '#00d4ff', fontFamily: 'Orbitron, sans-serif', fontSize: '14px' }}>
                            Loading marketplace...
                        </div>
                    ) : listings.length > 0 ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                            {listings.map((item, i) => (
                                <div key={item.id || i} style={{
                                    padding: '16px', borderRadius: '14px',
                                    background: 'rgba(0,212,255,0.05)',
                                    border: '1px solid rgba(0,212,255,0.15)',
                                }}>
                                    <div style={{ fontSize: '28px', marginBottom: '10px', textAlign: 'center' }}>
                                        {item.category === 'dealer' ? '\u{1F0CF}' : item.category === 'equipment' ? '\u{1F3B0}' : '\u{1F3E2}'}
                                    </div>
                                    <div style={{ color: '#fff', fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>
                                        {item.title || 'Listing'}
                                    </div>
                                    <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px' }}>
                                        {item.description ? item.description.substring(0, 60) + '...' : 'No description'}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div style={emptyState}>
                            <div style={{ fontSize: '48px', marginBottom: '16px' }}>{'\u{1F6D2}'}</div>
                            <p>No marketplace listings yet.</p>
                            <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.3)', marginTop: '8px' }}>
                                Listings for dealers, equipment, and venues will appear here.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
}

const backBtn = {
    background: 'rgba(0, 212, 255, 0.1)', border: '1px solid rgba(0, 212, 255, 0.3)',
    color: '#00d4ff', padding: '8px 16px', borderRadius: '8px',
    cursor: 'pointer', marginBottom: '20px', fontFamily: 'Inter, sans-serif', fontSize: '13px',
};

const pageTitle = {
    fontFamily: 'Orbitron, sans-serif', fontSize: '24px', fontWeight: 700,
    color: '#fff', marginBottom: '24px',
};

const emptyState = {
    textAlign: 'center', padding: '40px 20px',
    background: 'rgba(0, 212, 255, 0.04)',
    border: '1px solid rgba(0, 212, 255, 0.1)',
    borderRadius: '14px', color: 'rgba(255,255,255,0.5)', fontSize: '14px',
};
