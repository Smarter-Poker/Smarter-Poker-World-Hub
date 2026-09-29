import Link from 'next/link';
import { useRouter } from 'next/router';

const FAMILY_LINKS = [
  { label: 'Lobby', href: '/hub/poker-near-me/lobby', matches: ['/hub/poker-near-me/lobby'] },
  { label: 'Venues', href: '/hub/poker-near-me/venues', matches: ['/hub/poker-near-me/venues', '/hub/venues'] },
  { label: 'Live', href: '/hub/poker-near-me/live-games', matches: ['/hub/poker-near-me/live-games'], live: true },
  { label: 'Map', href: '/hub/poker-near-me/map', matches: ['/hub/poker-near-me/map'] },
  { label: 'Locations', href: '/hub/poker-near-me/in', matches: ['/hub/poker-near-me/in'] },
  { label: 'Events', href: '/hub/events-calendar', matches: ['/hub/events-calendar', '/hub/daily-tournaments', '/hub/poker-near-me/events', '/hub/poker-near-me/daily-tournaments', '/hub/poker-near-me/events-calendar', '/hub/poker-near-me/daily', '/hub/poker-near-me/calendar'] },
  { label: 'Series', href: '/hub/poker-near-me/series', matches: ['/hub/poker-near-me/series', '/hub/poker-series', '/hub/series'] },
  { label: 'Tours', href: '/hub/poker-tours', matches: ['/hub/poker-tours', '/hub/tours', '/hub/poker-near-me/tours'] },
  { label: 'Home games', href: '/hub/home-games', matches: ['/hub/home-games'] },
  { label: 'Saved', href: '/hub/poker-near-me/saved', matches: ['/hub/poker-near-me/saved'] },
];

function consoleNavClassName(className) {
  const consumerClasses = String(className || '')
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => (
      token === 'pnm-family-nav--standalone'
        ? 'pnm-console-family-nav--standalone'
        : token
    ));
  return ['pnm-console-family-nav', ...consumerClasses].join(' ');
}

/**
 * Low-profile shared navigation for every Poker Near Me discovery surface.
 * It deliberately owns no data or page state; it only provides stable routes
 * so the independent pages keep their existing handlers and fetch lifecycles.
 */
export default function PokerNearMeFamilyNav({ className = '' }) {
  const router = useRouter();
  const path = (router.asPath || router.pathname || '').split('?')[0];

  // Painted blank plates carry the permanent material and lighting. Route
  // labels and active/live state remain real DOM content so navigation stays
  // accessible, indexable, and driven by the existing route contract.
  return (
    <nav
      className={consoleNavClassName(className)}
      aria-label="Poker Near Me"
      data-pnm-console-surface="family-navigation-v1"
    >
      <span className="pnm-console-family-nav__label" aria-hidden="true">Discovery Deck</span>
      <div className="pnm-console-family-nav__rail">
        {FAMILY_LINKS.map((item) => {
          const active = item.matches.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`pnm-console-family-nav__link${active ? ' is-active' : ''}${item.live ? ' is-live' : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              {item.live && <span className="pnm-console-family-nav__live-signal" aria-hidden="true" />}
              <span className="pnm-console-family-nav__text">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
