import { useEffect, useRef } from 'react';
import Link from 'next/link';

import { captureStoreEvent } from '../../lib/store/storeAnalytics';
import { marketplaceCopy } from '../../lib/store/marketplaceCopy';
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

const PACKAGE_ART_CLASS_BY_ID = Object.freeze({
  medium: 'package0',
  standard: 'package1',
  large: 'package2',
  value: 'package3',
  premium: 'package4',
  whale: 'package5',
});

const SECTION_COPY = {
  diamonds: {
    eyebrow: 'Diamond Exchange',
    title: 'Play At Your Own Altitude.',
    body: 'Fund Games, Enter Tournaments, And Unlock Premium Tools With One Balance Across Smarter.Poker.',
  },
  vip: {
    eyebrow: 'VIP Membership',
    title: 'Your Edge, Compounded.',
    body: 'One Membership Sharpens Every Session: From Training And Table Access To Priority Support.',
  },
  merch: {
    eyebrow: 'Smarter.Poker Merch',
    title: 'Built For The Long Session.',
    body: 'Tournament-Grade Essentials Designed To Travel, Layer, And Perform At The Table.',
  },
  rewards: {
    eyebrow: 'Smarter Rewards',
    title: 'Make Every Hand Count.',
    body: 'Earn Diamonds Through Play, Study Streaks, Referrals, And Community Contributions.',
  },
  'club-shop': {
    eyebrow: 'Club Shop',
    title: 'Your Game. Your Rules.',
    body: 'Spend Diamonds On Time Banks And The Verified Platform All Throwables Pack.',
  },
};

export default function SmarterStoreShowcase({
  activeTab,
  packages = [],
  catalogState = 'database',
  isProcessing = false,
  busyPackageId = null,
  onBuy,
}) {
  const copy = SECTION_COPY[activeTab] || SECTION_COPY.diamonds;
  const isDiamonds = activeTab === 'diamonds';
  const activeTabRef = useRef(null);
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
    if (!activeTabRef.current || !window.matchMedia('(max-width: 640px)').matches) return;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    activeTabRef.current.scrollIntoView({
      behavior: reduceMotion ? 'auto' : 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  }, [activeTab]);

  useEffect(() => {
    if (!isDiamonds || diamondImpressionRef.current || packages.length === 0) return;
    diamondImpressionRef.current = true;
    captureStoreEvent('catalog_viewed', { route: 'diamonds', items: packages.length });
  }, [isDiamonds, packages.length]);

  return (
    <section className={`${styles.showcase} ${styles[activeTab] || ''}`}>
      <nav className={styles.tabs} aria-label="Store Sections">
        {TAB_LABELS.map(([id, label]) => (
          <Link
            key={id}
            ref={id === activeTab ? activeTabRef : null}
            href={TAB_ROUTES[id]}
            className={`${styles.tab} ${id === activeTab ? styles.activeTab : ''}`}
            aria-current={id === activeTab ? 'page' : undefined}
            aria-label={id === activeTab ? `${label}, Current Page` : label}
            onClick={() => captureStoreEvent('section_opened', { from: activeTab, to: id })}
          >
            {label}
          </Link>
        ))}
      </nav>

      <div className={`${styles.hero} ${isDiamonds ? styles.diamondHero : styles.sectionHero}`}>
        <div className={styles.heroCopy}>
          <span>{copy.eyebrow}</span>
          <h1>{copy.title}</h1>
          <p>{copy.body}</p>
          {isDiamonds && <strong>5% More Diamonds On Purchases Of $100 Or More</strong>}
        </div>
      </div>

      {isDiamonds && (
        <>
          <div className={styles.sectionBar}>
            <div className={styles.sectionHeading}>
              <span className={styles.sectionKicker}>Secure Card Checkout</span>
              <h2>Choose Your Stack</h2>
            </div>
            <div className={styles.sectionMeta}>
              <span className={styles.exchangeRate}>1 Diamond = $0.01</span>
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
                  <span data-package-price>${Number(pkg.price || 0).toFixed(2)}</span>
                  <button
                    type="button"
                    onClick={() => onBuy(pkg)}
                    disabled={isProcessing || catalogState !== 'database'}
                    aria-busy={busyPackageId === pkg.id}
                    aria-label={
                      busyPackageId === pkg.id
                        ? `Opening Checkout For ${marketplaceCopy(pkg.name)}`
                        : catalogState === 'database'
                          ? `Buy ${marketplaceCopy(pkg.name)}, ${Number((pkg.diamonds || 0) + (pkg.bonus || 0)).toLocaleString('en-US')} Diamonds For $${Number(pkg.price || 0).toFixed(2)}`
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
                      <strong>${Number(pkg.price || 0).toFixed(2)}</strong>
                    </div>
                    <button
                      type="button"
                      onClick={() => onBuy(pkg)}
                      disabled={isProcessing || catalogState !== 'database'}
                      aria-busy={busyPackageId === pkg.id}
                      aria-label={
                        busyPackageId === pkg.id
                          ? `Opening Checkout For ${marketplaceCopy(pkg.name)}`
                          : catalogState === 'database'
                            ? `Buy ${marketplaceCopy(pkg.name)}, ${Number((pkg.diamonds || 0) + (pkg.bonus || 0)).toLocaleString('en-US')} Diamonds For $${Number(pkg.price || 0).toFixed(2)}`
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
