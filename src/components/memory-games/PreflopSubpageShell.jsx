import Link from 'next/link';
import { useRouter } from 'next/router';
import { ArrowLeft, BarChart3, BookOpen, Grid3X3, Medal, Trophy } from 'lucide-react';
import UniversalHeader from '../ui/UniversalHeader';
import PageTransition from '../transitions/PageTransition';

const NAV_ITEMS = [
  { href: '/hub/preflop-charts', label: 'Range Lab', icon: Grid3X3 },
  { href: '/hub/preflop-charts/stats', label: 'My Stats', icon: BarChart3 },
  { href: '/hub/preflop-charts/leaderboard', label: 'Ranks', icon: Trophy },
  { href: '/hub/preflop-charts/achievements', label: 'Awards', icon: Medal },
  { href: '/hub/preflop-charts/tutorial', label: 'Guide', icon: BookOpen },
];

export default function PreflopSubpageShell({ eyebrow, title, description, metric, children }) {
  const router = useRouter();

  return (
    <PageTransition>
      <div className="preflop-subpage">
        <UniversalHeader pageDepth={2} />
        <main className="preflop-subpage-main">
          <div className="preflop-subpage-utility">
            <Link href="/hub/preflop-charts" className="preflop-subpage-back">
              <ArrowLeft size={15} aria-hidden />
              Back To Command Deck
            </Link>
            <span>GTO RANGE SYSTEM // ONLINE</span>
          </div>

          <nav className="preflop-subpage-nav" aria-label="Preflop Charts sections">
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
              const active = router.pathname === href
                || (href !== '/hub/preflop-charts' && router.asPath.split('?')[0] === href);
              return (
                <Link key={href} href={href} aria-current={active ? 'page' : undefined}>
                  <Icon size={15} aria-hidden />
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>

          <header className="preflop-subpage-hero">
            <div>
              <span className="preflop-subpage-eyebrow">{eyebrow}</span>
              <h1>{title}</h1>
              <p>{description}</p>
            </div>
            <div className="preflop-subpage-signal" aria-hidden="true">
              {Array.from({ length: 25 }, (_, index) => <i key={index} style={{ '--signal-index': index }} />)}
              {metric && <strong>{metric}</strong>}
            </div>
          </header>

          {children}
        </main>
      </div>
    </PageTransition>
  );
}
