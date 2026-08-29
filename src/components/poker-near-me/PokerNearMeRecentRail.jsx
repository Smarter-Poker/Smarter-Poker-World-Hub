import Link from 'next/link';
import { useEffect, useState } from 'react';
import { readRecentPokerPlaces } from '../../lib/poker-near-me/activity';

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
    <section className="pnm-recent-rail" aria-labelledby="pnm-recent-title">
      <div>
        <p>Private on this device</p>
        <h2 id="pnm-recent-title">Recently viewed</h2>
      </div>
      <div className="pnm-recent-rail__track" role="list">
        {places.map((place) => (
          <Link key={place.href} href={place.href} className="pnm-recent-rail__item" role="listitem">
            <span>{place.kind === 'home_game' ? 'Home game' : place.kind === 'location' ? 'Location' : 'Venue'}</span>
            <strong>{place.title}</strong>
            {place.subtitle && <small>{place.subtitle}</small>}
          </Link>
        ))}
      </div>
    </section>
  );
}
