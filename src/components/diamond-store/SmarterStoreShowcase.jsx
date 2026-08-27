import { useEffect, useRef } from 'react';

import { captureStoreEvent } from '../../lib/store/storeAnalytics';
import styles from './SmarterStoreShowcase.module.css';

const TAB_LABELS = [
  ['diamonds', 'Diamonds'],
  ['vip', 'VIP Membership'],
  ['merch', 'Merch'],
  ['rewards', 'Smarter Rewards'],
  ['club-shop', 'Club Arena'],
];

const TAB_ROUTES = {
  diamonds: '/hub/diamond-store',
  vip: '/hub/vip-membership',
  merch: '/hub/merch-store',
  rewards: '/hub/smarter-rewards',
  'club-shop': '/hub/club-shop',
};

const SECTION_COPY = {
  diamonds: {
    eyebrow: 'Diamond Exchange',
    title: 'Play At Your Own Altitude.',
    body: 'Fund Games, Enter Tournaments, And Unlock Premium Tools With One Balance Across Smarter.Poker.',
  },
  vip: {
    eyebrow: 'VIP Membership',
    title: 'Your Edge, Compounded.',
    body: 'One Membership Sharpens Every Session—From Training And Table Access To Priority Support.',
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
    eyebrow: 'Club Arena',
    title: 'Your Game. Your Rules.',
    body: 'Manage Tables, Players, Rewards, And Club Operations From One Command Center.',
  },
};

export default function SmarterStoreShowcase({
  activeTab,
  packages = [],
  isProcessing = false,
  busyPackageId = null,
  onBuy,
}) {
  const copy = SECTION_COPY[activeTab] || SECTION_COPY.diamonds;
  const isDiamonds = activeTab === 'diamonds';
  const activeTabRef = useRef(null);
  const diamondImpressionRef = useRef(false);

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
          <a
            key={id}
            ref={id === activeTab ? activeTabRef : null}
            href={TAB_ROUTES[id]}
            target={id === activeTab ? undefined : '_blank'}
            rel={id === activeTab ? undefined : 'noopener noreferrer'}
            className={`${styles.tab} ${id === activeTab ? styles.activeTab : ''}`}
            aria-current={id === activeTab ? 'page' : undefined}
            aria-label={id === activeTab ? `${label}, Current Page` : `${label}, Opens In New Tab`}
            onClick={() => captureStoreEvent('section_opened', { from: activeTab, to: id })}
          >
            {label}
          </a>
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
            <h2>Choose Your Stack</h2>
            <span className={styles.exchangeRate}>1 Diamond = $0.01</span>
            <span className={styles.mobileHint}>Swipe To Compare Packages</span>
          </div>
          <div className={styles.starterRail} aria-label="Starter Diamond Packs">
            <span className={styles.starterLabel}>Starter Access</span>
            {packages.slice(0, 2).map((pkg) => (
              <article key={pkg.id} className={styles.starterPack}>
                <div>
                  <span>{pkg.name}</span>
                  <strong>{Number(pkg.diamonds || 0).toLocaleString('en-US')} Diamonds</strong>
                </div>
                <button
                  type="button"
                  onClick={() => onBuy(pkg)}
                  disabled={isProcessing}
                  aria-busy={busyPackageId === pkg.id}
                  aria-label={`Buy ${pkg.name}, ${Number(pkg.diamonds || 0).toLocaleString('en-US')} Diamonds For $${Number(pkg.price || 0).toFixed(2)}`}
                >
                  {busyPackageId === pkg.id ? 'Opening...' : `$${Number(pkg.price || 0).toFixed(2)}`}
                </button>
              </article>
            ))}
          </div>
          <div className={styles.packageGrid}>
            {packages.slice(-6).map((pkg, index) => (
              <article
                key={pkg.id}
                className={`${styles.packageCard} ${styles[`package${index}`]}`}
              >
                <div className={styles.packageTopline}>
                  <span>{pkg.name}</span>
                  <span>Digital Currency</span>
                </div>
                <div className={styles.packageValue}>
                  <h3>{Number((pkg.diamonds || 0) + (pkg.bonus || 0)).toLocaleString('en-US')}</h3>
                  <span className={styles.packageUnit}>Diamonds</span>
                  {pkg.bonus > 0 && (
                    <p>Includes {Number(pkg.bonus).toLocaleString('en-US')} Bonus Diamonds</p>
                  )}
                </div>
                <footer>
                  <strong>${Number(pkg.price || 0).toFixed(2)}</strong>
                  <button
                    type="button"
                    onClick={() => onBuy(pkg)}
                    disabled={isProcessing}
                    aria-busy={busyPackageId === pkg.id}
                    aria-label={
                      busyPackageId === pkg.id
                        ? `Opening Checkout For ${pkg.name}`
                        : `Buy ${pkg.name}, ${Number((pkg.diamonds || 0) + (pkg.bonus || 0)).toLocaleString('en-US')} Diamonds For $${Number(pkg.price || 0).toFixed(2)}`
                    }
                  >
                    {busyPackageId === pkg.id ? 'Opening Checkout...' : 'Buy Now'}
                  </button>
                </footer>
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
