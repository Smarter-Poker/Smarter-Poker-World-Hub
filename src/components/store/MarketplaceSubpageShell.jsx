import Link from 'next/link';
import { Heart, PackageCheck, ShoppingCart, Store } from 'lucide-react';

import styles from './MarketplaceSubpageShell.module.css';

const DESTINATIONS = [
  { id: 'store', label: 'Store', href: '/hub/diamond-store', Icon: Store },
  { id: 'cart', label: 'Cart', href: '/hub/diamond-store/cart', Icon: ShoppingCart },
  { id: 'orders', label: 'Orders', href: '/hub/diamond-store/orders', Icon: PackageCheck },
  { id: 'wishlist', label: 'Wishlist', href: '/hub/diamond-store/wishlist', Icon: Heart },
];

export default function MarketplaceSubpageShell({
  active,
  eyebrow,
  title,
  description,
  actions = null,
  children,
}) {
  return (
    <main className={styles.stage}>
      <nav className={styles.routeRail} aria-label="Marketplace Account Pages">
        {DESTINATIONS.map(({ id, label, href, Icon }) => (
          <Link
            key={id}
            href={href}
            className={styles.routeLink}
            aria-current={active === id ? 'page' : undefined}
          >
            <Icon size={15} aria-hidden="true" />
            <span>{label}</span>
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
      </header>

      <section className={styles.contentDeck}>{children}</section>
    </main>
  );
}
