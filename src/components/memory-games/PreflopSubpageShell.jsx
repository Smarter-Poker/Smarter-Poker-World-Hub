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
import { useRouter } from 'next/router';
import UniversalHeader from '../ui/UniversalHeader';
import HubPageShell from '../ui/HubPageShell';
import PageTransition from '../transitions/PageTransition';
import PreflopSubpageNav, { PREFLOP_NAV_ITEMS } from './PreflopSubpageNav';

export { PREFLOP_NAV_ITEMS, PreflopSubpageNav };

const SUBPAGE_ART = {
  stats: 'reports',
  leaderboard: 'players',
  achievements: 'goals',
  tutorial: 'rules',
};

export default function PreflopSubpageShell({ eyebrow, title, description, metric, metricLabel, children }) {
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
        <div className="preflop-subpage smarterdesign">
          {/* HubPageShell already renders the page's <main>; this is a plain
              column so the document keeps exactly one landmark.
              #SMARTERDESIGN (Dan, 2026-11-27): Back To Preflop Charts sits
              directly above the image header (BankrollImageHeader's `back`
              prop, never inside it), the section nav sits under the header,
              and the page's readout lives inside the header beside its title
              instead of floating loose underneath it. */}
          <div className="preflop-subpage-main">
            <BankrollImageHeader
              art={SUBPAGE_ART[current.split('/').pop()] || 'series'}
              title={title}
              back={{ href: '/hub/preflop-charts', label: 'Back To Preflop Charts' }}
              helpContent={<p>{description}</p>}
            >
              {metric && (
                <span className="preflop-subpage-metric" data-subpage-metric="">
                  {metric}
                  {metricLabel && <small>{metricLabel}</small>}
                </span>
              )}
            </BankrollImageHeader>

            <PreflopSubpageNav current={current} />

            {children}
          </div>
        </div>
      </HubPageShell>
    </PageTransition>
  );
}
