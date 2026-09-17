import Link from 'next/link';

import useCartStore from '../../stores/cartStore';
import styles from './MarketplaceCommerceNav.module.css';

export default function MarketplaceCommerceNav({ active = 'store' }) {
  const itemCount = useCartStore((state) =>
    state.items.reduce((total, item) => total + (Number(item.quantity) || 1), 0)
  );

  return (
    <nav className={styles.rail} aria-label="Marketplace Commerce">
      <div className={styles.links}>
        <Link
          href="/hub/diamond-store"
          className={styles.link}
          aria-current={active === 'store' ? 'page' : undefined}
        >
          <span>Marketplace</span>
        </Link>
        <Link
          href="/hub/diamond-store/cart"
          className={styles.link}
          aria-current={active === 'cart' ? 'page' : undefined}
        >
          <span>Cart</span>
          {itemCount > 0 && (
            <strong className={styles.count} aria-label={`${itemCount} Items In Cart`}>
              {itemCount > 99 ? '99+' : itemCount}
            </strong>
          )}
        </Link>
        <Link
          href="/hub/diamond-store/orders"
          className={styles.link}
          aria-current={active === 'orders' ? 'page' : undefined}
        >
          <span>Orders</span>
        </Link>
        <Link
          href="/hub/diamond-store/wishlist"
          className={styles.link}
          aria-current={active === 'wishlist' ? 'page' : undefined}
        >
          <span>Wishlist</span>
        </Link>
      </div>
    </nav>
  );
}
