import Link from 'next/link';
import { ArrowRight, Archive, ShieldOff, Swords } from 'lucide-react';
import SEOHead from '../../../src/components/seo/SEOHead';
import PreflopSubpageShell from '../../../src/components/memory-games/PreflopSubpageShell';
import useTrainingBus from '../../../src/hooks/useTrainingBus';

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
        description="Server-authoritative Preflop Charts rankings are paused while verified matchmaking is prepared."
        canonical="/hub/preflop-charts/leaderboard"
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
              The previous board was created from browser-submitted practice data. It is intentionally hidden because those rows cannot support a fair global rank.
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
              Club Arena uses server-owned game state for competitive play. Range Lab remains a free local study tool until a sealed ranked mode is released.
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
