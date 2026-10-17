import React from 'react';
import { marketplaceCopy } from '../../lib/store/marketplaceCopy';
import styles from './VipMembershipCard.module.css';

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
      <span className={styles.vipCardCrown} aria-hidden="true">
        <svg viewBox="0 0 64 52" fill="none"><path d="M8 14L20 25L32 5L44 25L56 14L50 42H14L8 14Z" stroke="currentColor" strokeWidth="2"/><path d="M16 46H48M18 36H46" stroke="currentColor" strokeWidth="2"/><path d="M28 28L32 23L36 28L32 33L28 28Z" fill="#45adff"/></svg>
      </span>
      <span className={styles.vipCardReadout}>
        <span className={styles.vipPlanName}>{marketplaceCopy(plan.name)}</span>
        <span className={styles.vipPriceRow}>
          <strong>${(Number(plan.price) || 0).toFixed(2)}</strong>
          <span>{term}</span>
        </span>
        <span className={styles.vipDiamondPrice}>
          {Math.round((Number(plan.price) || 0) * 100).toLocaleString()} Diamonds
        </span>
        <span className={styles.vipPlanDetail}>{lifetime ? 'Never Expires' : plan.interval === 'year' ? 'A Full Year Of VIP' : 'Flexible Monthly Access'}</span>
      </span>
      <span className={styles.vipSelection} aria-hidden="true">{isSelected ? 'Selected' : 'Select Plan'}</span>
    </button>
  );
}
