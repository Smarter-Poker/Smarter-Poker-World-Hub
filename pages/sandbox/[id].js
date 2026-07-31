/**
 * Route: /sandbox/[id]
 * W6-2: Dynamic route to consume a shared sandbox scenario.
 *
 * Resolves state_json from Supabase and hands it to the Sandbox page.
 * Three transports, tried in order, so a scenario is never silently degraded:
 *   1. sessionStorage  — biggest payloads, same-origin, instant
 *   2. ?s=<lz-string>  — FULL fidelity (villains + action history + stacks)
 *                        in the URL; survives Safari private mode
 *   3. legacy ?h/?p/?b — last-resort partial restore (hand + board only)
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '../../src/lib/supabaseServerClient';
import Head from 'next/head';
import LZString from 'lz-string';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import { T, F, S, R, FONT, btn } from '../../src/components/sandbox/paTokens';

// Share ids are short alphanumeric slugs (create-share generates 6 chars)
const SHARE_ID_RE = /^[A-Za-z0-9]{4,16}$/;

const SANDBOX_PATH = '/hub/personal-assistant/sandbox';
// Above this, a compressed payload starts bumping into real-world URL limits
const MAX_URL_PAYLOAD = 3000;
// Above this, sessionStorage.setItem is very likely to throw QuotaExceededError
const MAX_STORAGE_PAYLOAD = 100000;

let _supabase = null;
function getSupabase() {
    if (!_supabase) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        _supabase = createClient(url, key);
    }
    return _supabase;
}

/**
 * Build the URL the sandbox page hydrates from.
 *
 * `s` carries the WHOLE snapshot (villains, action history, stacks, pot)
 * compressed with lz-string — the plain query params below can only express
 * hand/position/stack/board and silently dropped everything else.
 */
export function buildQueryFallback(state) {
    const params = new URLSearchParams();

    // Full-fidelity payload first
    try {
        const packed = LZString.compressToEncodedURIComponent(JSON.stringify(state || {}));
        if (packed && packed.length <= MAX_URL_PAYLOAD) params.set('s', packed);
    } catch (e) {
        console.warn('[shared-sandbox] compress failed:', e?.message || e);
    }

    // Legacy params kept as a readable secondary path (and a safety net if the
    // decompress ever fails on the receiving end).
    const hand = `${state?.heroHand?.card1 || ''}${state?.heroHand?.card2 || ''}`;
    if (hand) params.set('h', hand);
    if (state?.heroPosition) params.set('p', state.heroPosition);
    if (state?.heroStack != null) params.set('s_bb', String(state.heroStack));
    if (state?.gameType) params.set('g', state.gameType);
    if (state?.potSize != null) params.set('pot', String(state.potSize));
    const board = Array.isArray(state?.board)
        ? state.board
        : [...(state?.board?.flop || []), state?.board?.turn, state?.board?.river].filter(Boolean);
    if (board.length) params.set('b', board.join(','));

    // Tell the sandbox whether anything was lost so it can toast honestly
    const hasRich = params.has('s');
    if (!hasRich && ((state?.villains?.length > 1) || state?.actionHistory?.length)) {
        params.set('partial', '1');
    }
    return `${SANDBOX_PATH}?${params.toString()}`;
}

export default function SharedSandboxRedirect({ error, stateJson }) {
    const [failed, setFailed] = useState(!!error);
    const [slow, setSlow] = useState(false);
    const slowTimerRef = useRef(null);

    const fallbackHref = useMemo(
        () => (stateJson ? buildQueryFallback(stateJson) : SANDBOX_PATH),
        [stateJson],
    );

    useEffect(() => {
        if (error || !stateJson) { setFailed(true); return undefined; }

        // Nothing here is allowed to leave the user on a permanent spinner.
        slowTimerRef.current = setTimeout(() => { slowTimerRef.current = null; setSlow(true); }, 4000);

        try {
            const payload = JSON.stringify(stateJson);
            if (payload.length < MAX_STORAGE_PAYLOAD) {
                sessionStorage.setItem('shared-sandbox-state', payload);
                window.location.replace(`${SANDBOX_PATH}?loadShared=true`);
            } else {
                // Too big for sessionStorage — go straight to the URL transport
                window.location.replace(fallbackHref);
            }
        } catch (e) {
            console.warn('[shared-sandbox] sessionStorage unavailable, using URL fallback:', e?.message || e);
            try {
                window.location.replace(fallbackHref);
            } catch (redirectErr) {
                console.warn('[shared-sandbox] redirect failed:', redirectErr?.message || redirectErr);
                setFailed(true);
            }
        }

        return () => {
            if (slowTimerRef.current) { clearTimeout(slowTimerRef.current); slowTimerRef.current = null; }
        };
    }, [error, stateJson, fallbackHref]);

    const page = {
        minHeight: '100dvh', background: T.bg, color: T.text,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: `${S.xl}px max(16px, env(safe-area-inset-left, 0px))`,
        paddingTop: 'calc(24px + env(safe-area-inset-top, 0px))',
        paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
        fontFamily: FONT, textAlign: 'center',
    };

    return (
        <div style={page} className="shared-sandbox-page">
            <Head>
                <title>Shared Poker Scenario | Smarter.Poker</title>
                {/* Ephemeral share pages must never enter the index */}
                <meta name="robots" content="noindex, nofollow" />
                <meta property="og:title" content="Smarter.Poker Sandbox Scenario" />
                <meta property="og:description" content="View this custom poker hand analysis scenario." />
                <meta property="og:image" content="https://smarter.poker/images/social/sandbox-share.jpg" />
            </Head>

            {failed ? (
                <div style={{ maxWidth: 320 }} role="alert">
                    <div style={{
                        width: 56, height: 56, borderRadius: '50%', background: T.dangerSoft,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: `0 auto ${S.lg}px`, color: T.warn,
                    }}>
                        <AlertTriangle size={24} strokeWidth={2} aria-hidden="true" />
                    </div>
                    <h1 style={{ fontSize: F.h2, fontWeight: 800, margin: `0 0 ${S.sm}px` }}>Scenario not found</h1>
                    <p style={{ color: T.textMuted, fontSize: F.bodySm, lineHeight: 1.45, margin: `0 0 ${S.lg}px` }}>
                        This link may be invalid or expired.
                    </p>
                    <a href={SANDBOX_PATH} style={{ ...btn('primary'), textDecoration: 'none' }}>
                        Open the Sandbox
                    </a>
                </div>
            ) : (
                <div style={{ maxWidth: 320 }} aria-live="polite">
                    <div
                        className="shared-spinner"
                        style={{
                            width: 40, height: 40, border: `3px solid ${T.accentSoft}`,
                            borderTopColor: T.accent, borderRadius: '50%',
                            margin: `0 auto ${S.lg}px`,
                        }}
                        aria-hidden="true"
                    />
                    <p style={{ color: T.textMuted, fontSize: F.bodySm, margin: 0 }}>Loading scenario…</p>
                    {slow && (
                        <div style={{ marginTop: S.lg }}>
                            <p style={{ color: T.textMuted, fontSize: F.caption, lineHeight: 1.45, margin: `0 0 ${S.md}px` }}>
                                Still loading. Your browser may have blocked the automatic redirect.
                            </p>
                            <a href={fallbackHref} style={{ ...btn('primary'), textDecoration: 'none' }}>
                                <ExternalLink size={18} strokeWidth={2} aria-hidden="true" />
                                Open the Sandbox
                            </a>
                        </div>
                    )}
                </div>
            )}

            <style>{`
                .shared-spinner { animation: sharedSpin 1s linear infinite; }
                @keyframes sharedSpin { to { transform: rotate(360deg); } }
                @media (prefers-reduced-motion: reduce) {
                    .shared-spinner { animation: none; opacity: 0.6; }
                    *, *::before, *::after {
                        animation-duration: 0.01ms !important;
                        animation-iteration-count: 1 !important;
                        transition-duration: 0.01ms !important;
                    }
                }
            `}</style>
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
        // NOT CDN-cached: the view counter below runs in this same request, so a
        // shared `s-maxage` would record ~one view per 5 minutes globally
        // regardless of how many people opened the link. The id regex above is
        // what keeps enumeration off the service-role client.
        context.res.setHeader('Cache-Control', 'private, no-store, max-age=0');
        context.res.setHeader('X-Robots-Tag', 'noindex');

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
