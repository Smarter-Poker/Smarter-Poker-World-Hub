/**
 * SURVIVAL MODE PAGE — Route: /hub/trivia/survival
 *
 * DEPRECATED IMPLEMENTATION — now a thin redirect.
 *
 * This page used to be a second, divergent survival implementation:
 *   - it wrote runs to `trivia_survival_runs` while its daily-diamond cap
 *     was computed from `trivia_scores` (mode='survival') — a table only
 *     survival-game.js ever writes, so the cap check was against the wrong
 *     table and never actually capped anything;
 *   - it awarded a different reward economy than the live route;
 *   - its reward idempotency key collided for two same-day runs with the
 *     same correct_count (second run silently uncredited);
 *   - its "Top Survivors" board was not de-duplicated per user;
 *   - nothing linked here — TriviaLobby routes 'survival' to
 *     /hub/trivia/survival-game.
 *
 * Rather than maintain two economies for one mode, the route is preserved
 * (external links / bookmarks keep working) and forwards to the live game.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../../src/components/seo/SEOHead';
import TriviaSkeleton from '../../../src/components/trivia/TriviaSkeleton';

const LIVE_SURVIVAL_ROUTE = '/hub/trivia/survival-game';

export default function SurvivalModeRedirectPage() {
    const router = useRouter();

    useEffect(() => {
        if (!router.isReady) return;
        router.replace(LIVE_SURVIVAL_ROUTE);
    }, [router.isReady]);

    return (
        <>
            <SEOHead
                title="Survival Trivia — One Life Challenge"
                description="One Wrong Answer And You Are Out. Test Your Poker Knowledge In Survival Mode."
                canonical={LIVE_SURVIVAL_ROUTE}
                noindex={true}
            />
            <div style={{
                minHeight: '100vh',
                background: '#000000',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '20px',
                gap: '16px'
            }}>
                <TriviaSkeleton />
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px', textAlign: 'center' }}>
                    Taking You To Survival Mode...
                </p>
                <a
                    href={LIVE_SURVIVAL_ROUTE}
                    style={{
                        color: '#00D4FF',
                        fontSize: '14px',
                        textDecoration: 'underline'
                    }}
                >
                    Continue To Survival Mode
                </a>
            </div>
        </>
    );
}
