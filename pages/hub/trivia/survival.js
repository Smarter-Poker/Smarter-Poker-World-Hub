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
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import TriviaConsole from '../../../src/components/trivia/console/TriviaConsole';

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
                title="Survival Trivia - One Life Challenge"
                description="One Wrong Answer And You Are Out. Test Your Poker Knowledge In Survival Mode."
                canonical={LIVE_SURVIVAL_ROUTE}
                noindex={true}
            />
            <div
                className="trivia-challenge-page trivia-challenge-page--survival-redirect"
                data-trivia-family="challenge"
                data-trivia-surface="survival-redirect"
                data-game-state="redirecting"
            >
                <UniversalHeader pageDepth={2} />
                <main className="trivia-challenge-shell" aria-labelledby="survival-redirect-title">
                    <TriviaConsole
                        className="trivia-challenge-console"
                        eyebrow="Progressive Challenge"
                        title="Survival Mode"
                        titleAs="h1"
                        titleId="survival-redirect-title"
                        subtitle="Opening The Live Challenge"
                        pill="Redirecting"
                        aria-labelledby="survival-redirect-title"
                    >
                        <div className="trivia-challenge-state trivia-challenge-state--loading" role="status">
                            <p>Taking You To Survival Mode</p>
                        </div>
                        <a
                            className="trivia-challenge-action trivia-challenge-action--link"
                            href={LIVE_SURVIVAL_ROUTE}
                            style={{ minWidth: 44, minHeight: 44, display: 'inline-flex', alignItems: 'center' }}
                        >
                            Continue To Survival Mode
                        </a>
                    </TriviaConsole>
                </main>
            </div>
        </>
    );
}
