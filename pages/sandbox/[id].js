/**
 * Route: /sandbox/[id]
 * W6-2: Dynamic route to consume a shared sandbox scenario.
 * Resolves the state_json from Supabase and redirects to /hub/personal-assistant/sandbox with injected state.
 */
import { createClient } from '@supabase/supabase-js';
import Head from 'next/head';

function getSupabase() {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export default function SharedSandboxRedirect({ error, stateJson }) {
    if (typeof window !== 'undefined' && stateJson) {
        // Store the shared state in sessionStorage and redirect immediately
        try {
            sessionStorage.setItem('shared-sandbox-state', JSON.stringify(stateJson));
            window.location.replace('/hub/personal-assistant/sandbox?loadShared=true');
        } catch (e) {
            console.error('Failed to parse state:', e);
        }
    }

    return (
        <div style={{ minHeight: '100vh', background: '#0B0D11', color: '#E4E6EB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' }}>
            <Head>
                <title>Shared Poker Scenario | Smarter.Poker</title>
                <meta property="og:title" content="Smarter.Poker Sandbox Scenario" />
                <meta property="og:description" content="View this custom poker hand analysis scenario." />
                <meta property="og:image" content="https://smarter.poker/images/social/sandbox-share.jpg" />
            </Head>
            {error ? (
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
                    <h1 style={{ fontSize: 20, marginBottom: 8 }}>Scenario Not Found</h1>
                    <p style={{ color: '#B0B3B8' }}>This link may be invalid or expired.</p>
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

    try {
        const supabase = getSupabase();

        // Fetch state and increment views
        const { data, error } = await supabase
            .from('sandbox_shared_scenarios')
            .select('state_json')
            .eq('id', id)
            .single();

        if (error || !data) {
            return { props: { error: 'Not found' } };
        }

        // Background metric
        supabase.rpc('increment_share_view', { share_id: id }).catch(() => { });

        return {
            props: {
                stateJson: data.state_json
            }
        };
    } catch (err) {
        return { props: { error: 'Server error' } };
    }
}
