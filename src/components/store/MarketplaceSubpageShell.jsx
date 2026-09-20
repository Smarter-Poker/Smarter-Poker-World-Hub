import Link from 'next/link';
import { useEffect, useRef } from 'react';

import useCartStore from '../../stores/cartStore';
import { marketplaceCopy } from '../../lib/store/marketplaceCopy';
import styles from './MarketplaceSubpageShell.module.css';

const DESTINATIONS = [
  { id: 'store', label: 'Marketplace', href: '/hub/diamond-store' },
  { id: 'cart', label: 'Cart', href: '/hub/diamond-store/cart' },
  { id: 'orders', label: 'Orders', href: '/hub/diamond-store/orders' },
  { id: 'wishlist', label: 'Wishlist', href: '/hub/diamond-store/wishlist' },
];

export default function MarketplaceSubpageShell({
  active,
  eyebrow,
  title,
  description,
  actions = null,
  children,
}) {
  const canonicalRoute =
    DESTINATIONS.find((destination) => destination.id === active)?.href || DESTINATIONS[0].href;
  const copyEyebrow = marketplaceCopy(eyebrow);
  const copyTitle = marketplaceCopy(title);
  const copyDescription = marketplaceCopy(description);
  const routeRailRef = useRef(null);
  const activeRouteRef = useRef(null);
  const itemCount = useCartStore((state) =>
    state.items.reduce((total, item) => total + (Number(item.quantity) || 1), 0)
  );

  useEffect(() => {
    const rail = routeRailRef.current;
    const current = activeRouteRef.current;
    if (!rail || !current || rail.scrollWidth <= rail.clientWidth) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    rail.scrollTo({
      left: current.offsetLeft - (rail.clientWidth - current.offsetWidth) / 2,
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
  }, [active]);

  return (
    <main
      className={styles.stage}
      data-active={active}
      data-marketplace-route={canonicalRoute}
      data-title-case-strategy="normalized"
    >
      <nav ref={routeRailRef} className={styles.routeRail} aria-label="Marketplace Account Pages">
        {DESTINATIONS.map(({ id, label, href }) => (
          <Link
            key={id}
            ref={active === id ? activeRouteRef : null}
            href={href}
            className={styles.routeLink}
            aria-current={active === id ? 'page' : undefined}
          >
            <span>{label}</span>
            {id === 'cart' && itemCount > 0 && (
              <strong className={styles.routeCount} aria-label={`${itemCount} Items In Cart`}>
                {itemCount > 99 ? '99+' : itemCount}
              </strong>
            )}
          </Link>
        ))}
      </nav>

      <header className={styles.commandHeader}>
        <div className={styles.headerCopy}>
          <span className={styles.eyebrow}>{copyEyebrow}</span>
          <h1>{copyTitle}</h1>
          <p>{copyDescription}</p>
        </div>
        {actions && <div className={styles.headerActions}>{actions}</div>}
      </header>

      <section className={styles.contentDeck}>{children}</section>
    </main>
  );
}
