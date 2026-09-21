import React from 'react';
import { marketplaceCopy } from '../../lib/store/marketplaceCopy';
import styles from './StoreCards.module.css';

/* PackageCard and MerchCard used to live here. Neither was imported
   anywhere: VIPCard below is the only export this module has a consumer
   for (pages/hub/diamond-store.js). Both were clickable <div onClick>
   with no role, tabIndex or key handler, so they were unreachable by
   keyboard and could not have been wired up as they stood. Removed rather
   than left as a trap for whoever reached for them next. */

export function VIPCard({ plan, isSelected, onSelect }) {
  /* 2026-09-05: every VIP term is priced in USD now, so the `isDiamondCost`
     branch this carried for the retired Daily Pass is gone. Lifetime has no
     billing period, and rendering "/lifetime" after a price reads as a rate;
     it says "One Payment" instead. Without this a term with no `interval`
     rendered "/undefined". */
  const lifetime = plan.interval === 'lifetime';
  const term = lifetime ? 'One Payment' : `/${marketplaceCopy(plan.interval)}`;
  const spokenTerm = lifetime
    ? 'One Payment, Never Expires'
    : `Per ${marketplaceCopy(plan.interval)}`;
  return (
    <button
      type="button"
      className={`${styles.vipCard} ${isSelected ? styles.vipCardSelected : ''}`}
      onClick={() => onSelect(plan.id)}
      aria-pressed={isSelected}
      aria-label={`Select ${marketplaceCopy(plan.name)}, $${(Number(plan.price) || 0).toFixed(2)} ${spokenTerm}`}
    >
      <img
        className={styles.vipCardArtwork}
        src="/images/vip-card.webp"
        alt=""
        width={1024}
        height={1024}
        draggable={false}
        loading="lazy"
      />
      <span className={styles.vipCardReadout}>
        <span className={styles.vipPlanName}>{marketplaceCopy(plan.name)}</span>
        <span className={styles.vipPriceRow}>
          <strong>${(Number(plan.price) || 0).toFixed(2)}</strong>
          <span>{term}</span>
        </span>
        <span className={styles.vipDiamondPrice}>
          {Math.round((Number(plan.price) || 0) * 100).toLocaleString()} Diamonds
        </span>
      </span>
    </button>
  );
}
