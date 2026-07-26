/**
 * Route: /sandbox/[id]
 * W6-2: Dynamic route to consume a shared sandbox scenario.
 * Resolves the state_json from Supabase and redirects to /hub/personal-assistant/sandbox with injected state.
 */
import { useEffect, useState } from 'react';
import { createClient } from '../../src/lib/supabaseServerClient';
import Head from 'next/head';

// Share ids are short alphanumeric slugs (create-share generates 6 chars)
const SHARE_ID_RE = /^[A-Za-z0-9]{4,16}$/;

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

// Build the query-string fallback the sandbox page already hydrates from
// (?h=hand &p=position &s=stack &g=gameType &pot=pot &b=board) — used when
// sessionStorage is unavailable (Safari private mode, storage disabled).
function buildQueryFallback(state) {
    const params = new URLSearchParams();
    const hand = `${state?.heroHand?.card1 || ''}${state?.heroHand?.card2 || ''}`;
    if (hand) params.set('h', hand);
    if (state?.heroPosition) params.set('p', state.heroPosition);
    if (state?.heroStack != null) params.set('s', String(state.heroStack));
    if (state?.gameType) params.set('g', state.gameType);
    if (state?.potSize != null) params.set('pot', String(state.potSize));
    const board = Array.isArray(state?.board)
        ? state.board
        : [...(state?.board?.flop || []), state?.board?.turn, state?.board?.river].filter(Boolean);
    if (board.length) params.set('b', board.join(','));
    return `/hub/personal-assistant/sandbox?${params.toString()}`;
}

export default function SharedSandboxRedirect({ error, stateJson }) {
    // `null` = still deciding, true/false once the redirect has been attempted
    const [failed, setFailed] = useState(!!error);

    useEffect(() => {
        if (error) { setFailed(true); return; }
        if (!stateJson) { setFailed(true); return; }
        try {
            sessionStorage.setItem('shared-sandbox-state', JSON.stringify(stateJson));
            window.location.replace('/hub/personal-assistant/sandbox?loadShared=true');
        } catch (e) {
            // Storage blocked — fall back to the query-string share format
            console.warn('[shared-sandbox] sessionStorage unavailable, using query fallback:', e?.message || e);
            try {
                window.location.replace(buildQueryFallback(stateJson));
            } catch (redirectErr) {
                console.warn('[shared-sandbox] redirect failed:', redirectErr?.message || redirectErr);
                setFailed(true);
            }
        }
    }, [error, stateJson]);

    return (
        <div style={{ minHeight: '100vh', background: '#0B0D11', color: '#E4E6EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' }}>
            <Head>
                <title>Shared Poker Scenario | Smarter.Poker</title>
                <meta property="og:title" content="Smarter.Poker Sandbox Scenario" />
                <meta property="og:description" content="View this custom poker hand analysis scenario." />
                <meta property="og:image" content="https://smarter.poker/images/social/sandbox-share.jpg" />
            </Head>
            {failed ? (
                <div style={{ textAlign: 'center' }}>
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#F5A623" strokeWidth="2" style={{ marginBottom: 16 }}>
                        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    <h1 style={{ fontSize: 20, marginBottom: 8 }}>Scenario Not Found</h1>
                    <p style={{ color: '#B0B3B8' }}>This link may be invalid or expired.</p>
                    <a href="/hub/personal-assistant/sandbox" style={{ display: 'inline-block', marginTop: 16, color: '#4599FF', fontSize: 13 }}>Open the Sandbox</a>
                </div>
            ) : (
                <div style={{ textAlign: 'center' }}>
                    <div style={{ width: 40, height: 40, border: '3px solid rgba(69,153,255,0.2)', borderTopColor: '#4599FF', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
                    <p style={{ color: '#B0B3B8' }}>Loading scenario...</p>
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
            )}
        </div>
    );
}

export async function getServerSideProps(context) {
    const { id } = context.params;

    // Validate before touching the DB — blocks id enumeration with junk keys
    if (typeof id !== 'string' || !SHARE_ID_RE.test(id)) {
        return { props: { error: 'Not found' } };
    }

    try {
        // CDN-cache repeated hits so scrapers can't hammer the service-role client
        context.res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');

        const supabase = getSupabase();

        const { data, error } = await supabase
            .from('sandbox_shared_scenarios')
            .select('state_json')
            .eq('id', id)
            .maybeSingle();

        if (error || !data || !data.state_json) {
            if (error) console.warn('[shared-sandbox] lookup error:', error.message);
            return { props: { error: 'Not found' } };
        }

        // View metric — awaited (serverless can freeze the lambda once props
        // return) but never fatal: the RPC/column may not exist yet.
        try {
            const { error: rpcError } = await supabase.rpc('increment_share_view', { share_id: id });
            if (rpcError) console.warn('[share-view]', rpcError.message);
        } catch (e) {
            console.warn('[share-view]', e?.message || e);
        }

        return {
            props: {
                stateJson: data.state_json
            }
        };
    } catch (err) {
        console.warn('[shared-sandbox] server error:', err?.message || err);
        return { props: { error: 'Server error' } };
    }
}
