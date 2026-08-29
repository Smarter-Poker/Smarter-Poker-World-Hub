import Link from 'next/link';
import { Heart, PackageCheck, ShoppingCart, Store } from 'lucide-react';
import { useEffect, useRef } from 'react';

import useCartStore from '../../stores/cartStore';
import styles from './MarketplaceSubpageShell.module.css';

const DESTINATIONS = [
  { id: 'store', label: 'Marketplace', href: '/hub/diamond-store', Icon: Store },
  { id: 'cart', label: 'Cart', href: '/hub/diamond-store/cart', Icon: ShoppingCart },
  { id: 'orders', label: 'Orders', href: '/hub/diamond-store/orders', Icon: PackageCheck },
  { id: 'wishlist', label: 'Wishlist', href: '/hub/diamond-store/wishlist', Icon: Heart },
];

const BAY_META = {
  store: {
    code: 'VAULT 00',
    label: 'Marketplace Floor',
    description: 'Diamond inventory and live offers',
  },
  cart: {
    code: 'BAY 01',
    label: 'Secure Cart Intake',
    description: 'Card and diamond checkout staging',
  },
  orders: {
    code: 'BAY 02',
    label: 'Fulfillment Conveyor',
    description: 'Live order and shipment telemetry',
  },
  wishlist: {
    code: 'BAY 03',
    label: 'Private Collection',
    description: 'Saved gear and current availability',
  },
};

export default function MarketplaceSubpageShell({
  active,
  eyebrow,
  title,
  description,
  actions = null,
  children,
}) {
  const bay = BAY_META[active] || BAY_META.store;
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
    <main className={styles.stage} data-active={active}>
      <nav ref={routeRailRef} className={styles.routeRail} aria-label="Marketplace Account Pages">
        {DESTINATIONS.map(({ id, label, href, Icon }) => (
          <Link
            key={id}
            ref={active === id ? activeRouteRef : null}
            href={href}
            className={styles.routeLink}
            aria-current={active === id ? 'page' : undefined}
          >
            <Icon size={15} aria-hidden="true" />
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
          <span className={styles.eyebrow}>{eyebrow}</span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        {actions && <div className={styles.headerActions}>{actions}</div>}
        <div
          className={styles.operationsVisual}
          role="img"
          aria-label={`${bay.label}. ${bay.description}.`}
        >
          <div className={styles.visualReadout} aria-hidden="true">
            <span className={styles.bayCode}>{bay.code}</span>
            <strong>{bay.label}</strong>
            <small>{bay.description}</small>
          </div>
          <span className={styles.scanLine} aria-hidden="true" />
        </div>
      </header>

      <section className={styles.contentDeck}>{children}</section>
    </main>
  );
}
