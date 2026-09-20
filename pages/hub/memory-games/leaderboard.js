import Link from 'next/link';
import { ArrowRight, Archive, ShieldOff, Swords } from 'lucide-react';
import SEOHead from '../../../src/components/seo/SEOHead';
import PreflopSubpageShell from '../../../src/components/memory-games/PreflopSubpageShell';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import { hubCollectionSchema } from '../../../src/lib/seo/hubPageSchema';

// AEO phase 3 (2026-09-17): this page had copy and no structured data.
const PREFLOP_BOARD_SCHEMA = hubCollectionSchema({
  path: '/hub/preflop-charts/leaderboard',
  name: 'Preflop Charts Standings | Smarter.Poker',
  description:
    'Rankings For The Smarter.Poker Preflop Range Lab. Server Authoritative Standings Are Paused While Verified Matchmaking Is Prepared.',
  trail: [['Hub', '/hub'], ['Preflop Charts', '/hub/preflop-charts'], ['Standings', '/hub/preflop-charts/leaderboard']],
});

/**
 * The former board ranked rows written by browser-owned Memory Games clients.
 * Those rows cannot prove an authenticated match, server-owned grading, or a
 * sealed score. Keeping the page visible is useful for navigation, but the
 * archive must never be represented as a verified or live leaderboard.
 */
export default function MemoryGamesLeaderboard() {
  useTrainingBus('preflop-charts-leaderboard');

  return (
    <>
      <SEOHead
        title="Preflop Charts Ranked Standings"
        description="Rankings For The Smarter.Poker Preflop Range Lab. Server-Authoritative Standings Are Paused While Verified Matchmaking Is Prepared, So Nothing Here Is Ranked Or Rewarded Yet. Free To Practise."
        canonical="/hub/preflop-charts/leaderboard"
        jsonLd={PREFLOP_BOARD_SCHEMA}
      />
      <PreflopSubpageShell
        eyebrow="RANKED CIRCUIT // AUTHORITY GATE"
        title="Ranked Standings Paused"
        description="Local Range Lab practice remains available, but local results do not create an account rank, prize result, or verified personal best."
        metric="PAUSED"
      >
        <section className="preflop-subpage-panel" aria-labelledby="rank-authority-title">
          <div className="preflop-panel-heading">
            <div>
              <span>SERVER-VERIFIED MATCHES REQUIRED</span>
              <h2 id="rank-authority-title">No Unverified Scores Displayed</h2>
            </div>
            <ShieldOff size={22} aria-hidden />
          </div>
          <div className="preflop-subpage-empty">
            <Archive size={30} aria-hidden />
            <h3>Legacy Rankings Are Archived</h3>
            <p>
              The Previous Board Was Created From Browser-Submitted Practice Data. It Is Intentionally Hidden Because Those Rows Cannot Support A Fair Global Rank.
            </p>
          </div>
        </section>

        <section className="preflop-subpage-panel" aria-labelledby="rank-next-title">
          <div className="preflop-panel-heading">
            <div>
              <span>VERIFIED COMPETITION</span>
              <h2 id="rank-next-title">Play In Club Arena</h2>
            </div>
            <Swords size={22} aria-hidden />
          </div>
          <div className="preflop-subpage-empty">
            <p>
              Club Arena Uses Server-Owned Game State For Competitive Play. Range Lab Remains A Free Local Study Tool Until A Sealed Ranked Mode Is Released.
            </p>
            <Link href="/hub/club-arena">
              Open Club Arena <ArrowRight size={16} aria-hidden />
            </Link>
          </div>
        </section>
      </PreflopSubpageShell>
    </>
  );
}
