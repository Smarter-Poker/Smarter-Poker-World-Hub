/**
 * Diamond Arena - Hand History
 * View past hands and sessions
 */

import SEOHead from '../../../src/components/seo/SEOHead';
import { useRouter } from 'next/router';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import useTrainingBus from '../../../src/hooks/useTrainingBus';

export default function DiamondArenaHistory() {
    const bus = useTrainingBus('diamond-arena-history');
    const router = useRouter();

    /*
     * THIS SHOWED THE VIEWER A WIN RECORD THEY HAD NEVER PLAYED.
     *
     * Two hard-coded rows, dated to today and yesterday with `new Date()`, so
     * they moved with the calendar and always looked fresh: a Cash NLH session
     * up 2,450 over 127 hands, and a tournament up 5,000 over 89. Not a sample
     * and not a placeholder - it renders as YOUR history, in a currency you own,
     * on a page called Game History.
     *
     * A fabricated leaderboard invents strangers. This invented the reader's own
     * results, which is worse: there is nothing about it a player could check.
     *
     * Nobody has played a hand in the Diamond Arena. Its club row was created on
     * 2026-09-08 and holds no tables, no tournaments and no diamonds, so the
     * true history of every account is empty.
     *
     * TO FINISH THIS: read the viewer's real sessions once tables open - arena
     * hands live in the ordinary engine tables, scoped to the platform club
     * (`clubs.is_platform`) - server-side, for the authenticated user only. Do
     * not re-add constants.
     */
    const history = [];

    return (
        <>
            <SEOHead
                title="Diamond Arena - Game History"
                description="Smarter.Poker - The Future Of The Game."
                noindex={true}
            />

            <PageTransition>
                <div style={{ minHeight: '100vh', paddingBottom: 70, width: '100%', maxWidth: '100vw', overflowX: 'hidden', boxSizing: 'border-box', background: '#0a0e1a' }}>
                    <UniversalHeader pageDepth={2} />

                    <div style={{ padding: '120px 20px 40px', maxWidth: '1200px', margin: '0 auto' }}>

                        <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: '#fff', marginBottom: '30px' }}>
                            📜 Hand History
                        </h1>

                        <div style={{ display: 'grid', gap: '16px' }}>
                            {history.length === 0 && (
                                <div style={{ textAlign: 'center', padding: '60px 20px', color: '#6b7280' }}>
                                    <p style={{ fontSize: '18px' }}>No Sessions Yet</p>
                                    <p style={{ fontSize: '14px', marginTop: '8px' }}>The Diamond Arena Has Not Opened</p>
                                </div>
                            )}
                            {history.map(session => (
                                <div
                                    key={session.id}
                                    style={{
                                        background: 'rgba(255,255,255,0.03)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: '12px',
                                        padding: '20px',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}
                                >
                                    <div>
                                        <div style={{ color: '#fff', fontWeight: 'bold', marginBottom: '8px' }}>
                                            {session.gameType}
                                        </div>
                                        <div style={{ color: '#9ca3af', fontSize: '14px' }}>
                                            {new Date(session.date).toLocaleString()} • {session.hands} Hands
                                        </div>
                                    </div>

                                    <div style={{
                                        color: session.result.startsWith('+') ? '#10b981' : '#ef4444',
                                        fontSize: '24px',
                                        fontWeight: 'bold'
                                    }}>
                                        {session.result}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
    </PageTransition>
        </>
    );
}
