import { formatStoreUsd } from '../../lib/store/wholeDollarPrice.mjs';
import { useEffect, useRef } from 'react';
import Link from 'next/link';

import { captureStoreEvent } from '../../lib/store/storeAnalytics';
import { marketplaceCopy } from '../../lib/store/marketplaceCopy';
import StoreImageHeader from './StoreImageHeader';
import styles from './SmarterStoreShowcase.module.css';

const TAB_LABELS = [
  ['diamonds', 'Diamonds'],
  ['vip', 'VIP Membership'],
  ['merch', 'Merch'],
  ['rewards', 'Smarter Rewards'],
  ['club-shop', 'Club Shop'],
];

const TAB_ROUTES = {
  diamonds: '/hub/diamond-store',
  vip: '/hub/vip-membership',
  merch: '/hub/merch-store',
  rewards: '/hub/smarter-rewards',
  'club-shop': '/hub/club-shop',
};

/**
 * The club a visitor arrived in is part of the address, not of this rail. A
 * player handed over from Club Arena with ?clubId=X used to lose it the moment
 * they tapped Diamonds, and tapping Club Shop again silently resolved SOME
 * OTHER club. The identity therefore rides every link in the rail while one is
 * active, so a round trip through the store returns to the same shop.
 */
export function storeTabHref(tabId, clubId) {
  const route = TAB_ROUTES[tabId];
  if (!route || !clubId) return route;
  return `${route}?clubId=${encodeURIComponent(clubId)}`;
}

const PACKAGE_ART_CLASS_BY_ID = Object.freeze({
  medium: 'package0',
  standard: 'package1',
  large: 'package2',
  value: 'package3',
  premium: 'package4',
  whale: 'package5',
});

/* Each store section's #SMARTERDESIGN image header. The former slogan copy
   now lives in that section's help dialog. */
export const SECTION_HEADERS = {
  diamonds: {
    art: 'store-diamonds',
    title: 'Diamond Store',
    help: {
      steps: [
        'Fund Games, Enter Tournaments, And Unlock Premium Tools With One Diamond Balance Across Smarter.Poker.',
        'Choose A Package, Then Complete Secure Card Checkout. 100 Diamonds Equal $1, And Purchases Of $100 Or More Include 5% More Diamonds.',
      ],
      faqs: [
        { question: 'When Do My Diamonds Arrive?', answer: 'Diamonds Are Added To Your Balance As Soon As Checkout Confirms The Payment.' },
        { question: 'Can Diamonds Be Cashed Out?', answer: 'No. Diamonds Are Virtual Currency With No Real-World Cash Value, And All Purchases Are Final.' },
      ],
    },
  },
  vip: {
    art: 'vip',
    title: 'VIP Membership',
    help: { steps: ['One Membership Sharpens Every Session: From Training And Table Access To Priority Support.'] },
  },
  merch: {
    art: 'store-merch',
    title: 'Merch Store',
    help: {
      steps: [
        'Tournament-Grade Essentials Designed To Travel, Layer, And Perform At The Table.',
        'Open A Product To Choose A Size, Add It To Your Cart Or Save It To Your Wishlist.',
      ],
    },
  },
  rewards: {
    art: 'store-rewards',
    title: 'Smarter Rewards',
    help: {
      steps: [
        'Earn Diamonds Through Play, Study Streaks, Referrals, And Community Contributions.',
        'Open Diamond Rewards To See Each Reward And Its Progress. Daily Earnings Are Capped, And The Cap Resets Each Day.',
      ],
    },
  },
  'club-shop': {
    art: 'store-club-shop',
    title: 'Club Shop',
    help: {
      steps: [
        'Spend Diamonds On Time Banks And The Verified Platform All Throwables Pack.',
        'Club Owners Can Open Manage Shop To Add Items, Review Purchases And Read Sales Analytics.',
      ],
    },
  },
};

export default function SmarterStoreShowcase({
  activeTab,
  clubId = null,
  packages = [],
  catalogState = 'database',
  isProcessing = false,
  busyPackageId = null,
  onBuy,
}) {
  const header = SECTION_HEADERS[activeTab] || SECTION_HEADERS.diamonds;
  const isDiamonds = activeTab === 'diamonds';
  const diamondImpressionRef = useRef(false);
  const starterPackages = packages.slice(0, Math.min(2, packages.length));
  const primaryPackages = packages.slice(starterPackages.length);

  const handlePackageRailKeyDown = (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    event.currentTarget.scrollBy({
      left:
        event.key === 'ArrowRight'
          ? event.currentTarget.clientWidth * 0.86
          : event.currentTarget.clientWidth * -0.86,
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
  };

  useEffect(() => {
    if (!isDiamonds || diamondImpressionRef.current || packages.length === 0) return;
    diamondImpressionRef.current = true;
    captureStoreEvent('catalog_viewed', { route: 'diamonds', items: packages.length });
  }, [isDiamonds, packages.length]);

  return (
    <section className={`${styles.showcase} ${styles[activeTab] || ''}`}>
      <StoreImageHeader art={header.art} title={header.title} help={header.help} />

      <nav className={`sd-tabs ${styles.tabs}`} aria-label="Store Sections">
        {TAB_LABELS.map(([id, label]) => (
          <Link
            key={id}
            href={storeTabHref(id, clubId)}
            className={`${styles.tab} ${id === activeTab ? styles.activeTab : ''}`}
            aria-current={id === activeTab ? 'page' : undefined}
            aria-label={id === activeTab ? `${label}, Current Page` : label}
            onClick={() => captureStoreEvent('section_opened', { from: activeTab, to: id })}
          >
            {label}
          </Link>
        ))}
      </nav>

      {isDiamonds && (
        <>
          <div className={styles.sectionBar}>
            <div className={styles.sectionHeading}>
              <span className={styles.sectionKicker}>Secure Card Checkout</span>
              <h2>Choose Your Stack</h2>
            </div>
            <div className={styles.sectionMeta}>
              <span className={styles.exchangeRate}>100 Diamonds = $1</span>
              <span className={styles.bonusNote}>5% More Diamonds On Purchases Of $100 Or More</span>
              <span role="status" aria-live="polite">
                {catalogState === 'database'
                  ? 'Current Pricing Verified'
                  : catalogState === 'loading'
                    ? 'Verifying Current Pricing'
                    : 'Current Pricing Unavailable'}
              </span>
            </div>
            <span id="diamond-package-scroll-hint" className={styles.mobileHint}>
              Swipe To Compare Packages Or Use Arrow Keys
            </span>
          </div>
          {/* A name on a role-less div is dropped by assistive technology. This
              rail is one labelled set of packs, so it is grouped as one. */}
          <div className={styles.starterRail} role="group" aria-label="Starter Diamond Packs">
            <span className={styles.starterLabel}>Starter Access</span>
            {starterPackages.map((pkg) => (
              <article
                key={pkg.id}
                className={styles.starterPack}
                data-diamond-package={pkg.id}
                data-package-layout="quick-buy"
              >
                <div
                  className={styles.starterArt}
                  role="img"
                  aria-label={`${marketplaceCopy(pkg.name)} Diamond Package Artwork`}
                  data-package-media
                />
                <div className={styles.starterDetails} data-package-details>
                  <span>{marketplaceCopy(pkg.name)}</span>
                  <strong data-package-quantity>
                    {Number(pkg.diamonds || 0).toLocaleString('en-US')} Diamonds
                  </strong>
                  <small data-package-bonus>
                    Bonus:{' '}
                    {pkg.bonus > 0
                      ? `+${Number(pkg.bonus).toLocaleString('en-US')} Diamonds`
                      : 'No Bonus'}
                  </small>
                </div>
                <div className={styles.starterPurchase} data-package-purchase>
                  <span data-package-price>${formatStoreUsd(pkg.price || 0)}</span>
                  <button
                    type="button"
                    className="sd-button sd-primary"
                    onClick={() => onBuy(pkg)}
                    disabled={isProcessing || catalogState !== 'database'}
                    aria-busy={busyPackageId === pkg.id}
                    aria-label={
                      busyPackageId === pkg.id
                        ? `Opening Checkout For ${marketplaceCopy(pkg.name)}`
                        : catalogState === 'database'
                          ? `Buy ${marketplaceCopy(pkg.name)}, ${Number((pkg.diamonds || 0) + (pkg.bonus || 0)).toLocaleString('en-US')} Diamonds For $${formatStoreUsd(pkg.price || 0)}`
                          : catalogState === 'loading'
                            ? `Verifying Current Pricing For ${marketplaceCopy(pkg.name)}`
                            : `Pricing Unavailable For ${marketplaceCopy(pkg.name)}`
                    }
                    data-package-primary-action
                  >
                    {busyPackageId === pkg.id
                      ? 'Opening...'
                      : catalogState === 'database'
                        ? 'Buy Package'
                        : catalogState === 'loading'
                          ? 'Verifying...'
                          : 'Pricing Unavailable'}
                  </button>
                </div>
              </article>
            ))}
          </div>
          <div
            className={styles.packageGrid}
            role="region"
            aria-label="Diamond Packages"
            aria-describedby="diamond-package-scroll-hint"
            tabIndex={0}
            onKeyDown={handlePackageRailKeyDown}
          >
            {primaryPackages.map((pkg) => (
              <article
                key={pkg.id}
                className={`${styles.packageCard} ${styles[PACKAGE_ART_CLASS_BY_ID[pkg.id] || 'packageFallback']}`}
                data-diamond-package={pkg.id}
                data-package-layout="commerce-card"
              >
                <div
                  className={styles.packageArt}
                  role="img"
                  aria-label={`${marketplaceCopy(pkg.name)} Diamond Package Artwork`}
                  data-package-media
                />
                <div className={styles.packageBody}>
                  <div className={styles.packageTopline}>
                    <span>{marketplaceCopy(pkg.name)}</span>
                    <span>Card Purchase</span>
                  </div>
                  <div className={styles.packageValue}>
                    <span className={styles.valueLabel}>Package Total</span>
                    <h3 data-package-quantity>
                      {Number((pkg.diamonds || 0) + (pkg.bonus || 0)).toLocaleString('en-US')}
                    </h3>
                    <span className={styles.packageUnit}>Diamonds</span>
                  </div>
                  <dl className={styles.packageBreakdown} data-package-bonus>
                    <div>
                      <dt>Base Amount</dt>
                      <dd>{Number(pkg.diamonds || 0).toLocaleString('en-US')}</dd>
                    </div>
                    <div>
                      <dt>Bonus</dt>
                      <dd>
                        {pkg.bonus > 0
                          ? `+${Number(pkg.bonus).toLocaleString('en-US')}`
                          : 'No Bonus'}
                      </dd>
                    </div>
                  </dl>
                  <footer>
                    <div className={styles.packagePrice} data-package-price>
                      <span>Price</span>
                      <strong>${formatStoreUsd(pkg.price || 0)}</strong>
                    </div>
                    <button
                      type="button"
                      className="sd-button sd-primary"
                      onClick={() => onBuy(pkg)}
                      disabled={isProcessing || catalogState !== 'database'}
                      aria-busy={busyPackageId === pkg.id}
                      aria-label={
                        busyPackageId === pkg.id
                          ? `Opening Checkout For ${marketplaceCopy(pkg.name)}`
                          : catalogState === 'database'
                            ? `Buy ${marketplaceCopy(pkg.name)}, ${Number((pkg.diamonds || 0) + (pkg.bonus || 0)).toLocaleString('en-US')} Diamonds For $${formatStoreUsd(pkg.price || 0)}`
                            : catalogState === 'loading'
                              ? `Verifying Current Pricing For ${marketplaceCopy(pkg.name)}`
                              : `Pricing Unavailable For ${marketplaceCopy(pkg.name)}`
                      }
                      data-package-primary-action
                    >
                      {busyPackageId === pkg.id
                        ? 'Opening Checkout...'
                        : catalogState === 'database'
                          ? 'Buy Package'
                          : catalogState === 'loading'
                            ? 'Verifying...'
                            : 'Pricing Unavailable'}
                    </button>
                  </footer>
                </div>
              </article>
            ))}
          </div>
          <p className={styles.legal}>
            Diamonds Are Virtual Currency And Have No Real-World Cash Value. All Purchases Are
            Final.
          </p>
        </>
      )}
    </section>
  );
}
