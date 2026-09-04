/**
 * PreflopSubpageNav: the Range Lab / My Stats / Ranks / Awards / Guide row.
 *
 * Mobile phase 2: a wrapping row (`.preflop-subpage-nav`, flex-wrap) so every
 * link is visible at 375px; the old rail scrolled sideways with a hidden
 * scrollbar. On the subpages it sticks under the real header height
 * (`top: var(--sp-header-height)`); on the game page it is a plain row under
 * the hero and carries the tutorial's `subnav` target. Kept in its own file
 * so the game page can import it without the subpage shell (and the shell's
 * PageTransition / framer-motion) landing in the menu chunk.
 */
import Link from 'next/link';
import { BarChart3, BookOpen, Grid3X3, Medal, Trophy } from 'lucide-react';

export const PREFLOP_NAV_ITEMS = [
  { href: '/hub/preflop-charts', label: 'Range Lab', icon: Grid3X3 },
  { href: '/hub/preflop-charts/stats', label: 'My Stats', icon: BarChart3 },
  { href: '/hub/preflop-charts/leaderboard', label: 'Ranks', icon: Trophy },
  { href: '/hub/preflop-charts/achievements', label: 'Awards', icon: Medal },
  { href: '/hub/preflop-charts/tutorial', label: 'Guide', icon: BookOpen },
];

export default function PreflopSubpageNav({ current, sticky = true, tutorialTarget, ariaLabel = 'Preflop Charts sections' }) {
  return (
    <nav
      className={`preflop-subpage-nav${sticky ? ' is-sticky' : ''}`}
      aria-label={ariaLabel}
      data-tutorial={tutorialTarget || undefined}
    >
      {PREFLOP_NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = current === href;
        return (
          <Link key={href} href={href} aria-current={active ? 'page' : undefined}>
            <Icon size={15} aria-hidden />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
