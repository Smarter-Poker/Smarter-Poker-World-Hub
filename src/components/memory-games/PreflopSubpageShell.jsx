/**
 * PreflopSubpageShell: the shared frame for /hub/preflop-charts/{stats,
 * leaderboard, achievements, tutorial}.
 *
 * Mobile phase 2: built on HubPageShell (the standard 100dvh / 100vw shell
 * with the sticky header, the 900 / 768 block and NO page-owned bottom
 * clearance, which pages/_app.js supplies). The old shell guessed the header
 * at 86px of top padding and the footer at 76px of bottom padding; both were
 * wrong on a phone (the header is about 38px there) and the bottom one
 * doubled the app's own spacer. The section nav is a wrapping row (every
 * link visible, nothing scrolls) that sticks under the real header height
 * via `--sp-header-height`.
 */
import BankrollImageHeader from '../bankroll/BankrollImageHeader';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ArrowLeft } from 'lucide-react';
import UniversalHeader from '../ui/UniversalHeader';
import HubPageShell from '../ui/HubPageShell';
import PageTransition from '../transitions/PageTransition';
import PreflopSubpageNav, { PREFLOP_NAV_ITEMS } from './PreflopSubpageNav';

export { PREFLOP_NAV_ITEMS, PreflopSubpageNav };

export default function PreflopSubpageShell({ eyebrow, title, description, metric, children }) {
  const router = useRouter();
  const currentPath = (router.asPath || '').split('?')[0].split('#')[0]
    .replace('/hub/memory-games', '/hub/preflop-charts');
  const current = PREFLOP_NAV_ITEMS.some((item) => item.href === currentPath)
    ? currentPath
    : router.pathname.replace('/hub/memory-games', '/hub/preflop-charts');

  return (
    <PageTransition>
      <HubPageShell
        className="preflop-sub"
        maxWidth={1240}
        background="#02070c"
        header={<UniversalHeader pageDepth={2} />}
      >
        <div className="preflop-subpage">
          {/* HubPageShell already renders the page's <main>; this is a plain
              column so the document keeps exactly one landmark. */}
          <div className="preflop-subpage-main">
            <div className="sd-back-row preflop-subpage-utility">
              <Link href="/hub/preflop-charts" className="sd-button preflop-subpage-back">
                <ArrowLeft size={16} aria-hidden />
                Back To Preflop Charts
              </Link>
            </div>

            <BankrollImageHeader art={({ stats: 'preflop-stats', leaderboard: 'preflop-leaderboard', achievements: 'preflop-achievements', tutorial: 'preflop-tutorial' })[current.split('/').pop()] || 'preflop-charts'} title={title}
              helpContent={<p>{description}</p>}>
              {metric && metric !== '-' && <p className="sp-head-note preflop-subpage-metric">{metric}</p>}
            </BankrollImageHeader>
            <PreflopSubpageNav current={current} />

            {children}
          </div>
        </div>
      </HubPageShell>
    </PageTransition>
  );
}
