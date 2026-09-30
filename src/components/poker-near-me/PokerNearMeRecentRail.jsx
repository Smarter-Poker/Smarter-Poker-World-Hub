import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PokerNearMePanelShell } from './PokerNearMeConsole';
import { readRecentPokerPlaces } from '../../lib/poker-near-me/activity';

/**
 * RECENTLY VIEWED IS A PAINTED PANEL (2026-09-30).
 *
 * This strip used to be a bare <section> with a 1px hairline and a flat
 * blue-grey fill, holding 1px-bordered mini cards, and it sat between the
 * painted hero deck and the painted browse chips on every deep location
 * route. Measured at 1440 on /hub/poker-near-me/in/il it was a 1408x129
 * slab with no chassis at all.
 *
 * It wears the same painted three-slice chassis as the rest of the surface
 * now, outer strip and mini cards alike. No new artwork: this is the
 * painted-panels-v1 head, mid and foot the browse chips and the venue cards
 * already carry. The copy is untouched.
 */
export default function PokerNearMeRecentRail({ currentHref }) {
  const [places, setPlaces] = useState([]);

  useEffect(() => {
    const sync = () => setPlaces(readRecentPokerPlaces().filter((item) => item.href !== currentHref).slice(0, 5));
    sync();
    window.addEventListener('storage', sync);
    window.addEventListener('pnm:recent-places-updated', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('pnm:recent-places-updated', sync);
    };
  }, [currentHref]);

  if (places.length === 0) return null;

  return (
    <PokerNearMePanelShell
      as="section"
      className="pnm-recent-rail"
      bodyClassName="pnm-recent-rail__body"
      aria-labelledby="pnm-recent-title"
    >
      <div className="pnm-recent-rail__intro">
        <p>Private On This Device</p>
        <h2 id="pnm-recent-title">Recently Viewed</h2>
      </div>
      <div className="pnm-recent-rail__track" role="list">
        {places.map((place) => (
          <PokerNearMePanelShell
            as={Link}
            key={place.href}
            href={place.href}
            className="pnm-recent-rail__item"
            role="listitem"
          >
            <span>{place.kind === 'home_game' ? 'Home game' : place.kind === 'location' ? 'Location' : 'Venue'}</span>
            <strong>{place.title}</strong>
            {place.subtitle && <small>{place.subtitle}</small>}
          </PokerNearMePanelShell>
        ))}
      </div>
    </PokerNearMePanelShell>
  );
}
