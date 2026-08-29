import Link from 'next/link';
import { Heart, PackageCheck, ShoppingCart, Store } from 'lucide-react';

import useCartStore from '../../stores/cartStore';
import styles from './MarketplaceCommerceNav.module.css';

const DESTINATIONS = [
  { id: 'store', label: 'Marketplace', href: '/hub/diamond-store', Icon: Store },
  { id: 'cart', label: 'Cart', href: '/hub/diamond-store/cart', Icon: ShoppingCart },
  { id: 'orders', label: 'Orders', href: '/hub/diamond-store/orders', Icon: PackageCheck },
  { id: 'wishlist', label: 'Wishlist', href: '/hub/diamond-store/wishlist', Icon: Heart },
];

export default function MarketplaceCommerceNav({ active = 'store' }) {
  const itemCount = useCartStore((state) =>
    state.items.reduce((total, item) => total + (Number(item.quantity) || 1), 0)
  );

  return (
    <nav className={styles.rail} aria-label="Marketplace Commerce">
      <span className={styles.eyebrow}>Commerce Console</span>
      <div className={styles.links}>
        {DESTINATIONS.map(({ id, label, href, Icon }) => {
          const current = active === id;
          return (
            <Link
              key={id}
              href={href}
              className={styles.link}
              aria-current={current ? 'page' : undefined}
            >
              <Icon size={17} aria-hidden="true" />
              <span>{label}</span>
              {id === 'cart' && itemCount > 0 && (
                <strong className={styles.count} aria-label={`${itemCount} Items In Cart`}>
                  {itemCount > 99 ? '99+' : itemCount}
                </strong>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
