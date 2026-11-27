import { formatStoreUsd } from '../../lib/store/wholeDollarPrice.mjs';
import React from 'react';
import { marketplaceCopy } from '../../lib/store/marketplaceCopy';
import styles from './VipMembershipCard.module.css';

/* PackageCard and MerchCard used to live here. Neither was imported
   anywhere: VIPCard below is the only export this module has a consumer
   for (pages/hub/diamond-store.js). Both were clickable <div onClick>
   with no role, tabIndex or key handler, so they were unreachable by
   keyboard and could not have been wired up as they stood. Removed rather
   than left as a trap for whoever reached for them next. */

export function VIPCard({ plan, isSelected, onSelect, introOffer = false }) {
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
  /* $1 first month (Dan, 2026-11-26): monthly Card subscription only. The
     caller decides whether it applies to this viewer; the card only words it. */
  const intro = introOffer === true && plan.interval === 'month';
  const regularPrice = `$${formatStoreUsd(Number(plan.price) || 0)}`;
  return (
    <button
      type="button"
      className={`${styles.vipCard} ${isSelected ? styles.vipCardSelected : ''}`}
      onClick={() => onSelect(plan.id)}
      aria-pressed={isSelected}
      aria-label={intro
        ? `Select ${marketplaceCopy(plan.name)}, $1 First Month, Then ${regularPrice} Per Month`
        : `Select ${marketplaceCopy(plan.name)}, ${regularPrice} ${spokenTerm}`}
    >
      <span className={styles.vipCardCrown} aria-hidden="true">
        <img src="/images/smarterdesign/headers/vip-crest.webp" alt="" width="168" height="132" decoding="async" />
      </span>
      <span className={styles.vipCardReadout}>
        <span className={styles.vipPlanName}>{marketplaceCopy(plan.name)}</span>
        {intro && <span className={styles.vipOfferTag}>New Member Offer</span>}
        <span className={styles.vipPriceRow}>
          <strong>{intro ? '$1' : regularPrice}</strong>
          <span>{intro ? 'First Month' : term}</span>
        </span>
        <span className={styles.vipPlanDetail}>{lifetime ? 'Never Expires. No Renewal.' : plan.interval === 'year' ? 'A Full Year Of VIP. Cancel Anytime.' : intro ? `Then ${regularPrice}/Month. Cancel Anytime.` : 'Flexible Monthly Access. Cancel Anytime.'}</span>
        {/* The Diamond route is its own price for its own term, never a
            conversion of the Card price above it. */}
        <span className={styles.vipDiamondPrice}>
          Or {Math.round((Number(plan.price) || 0) * 100).toLocaleString()} Diamonds {lifetime ? 'Once' : plan.interval === 'year' ? 'For 365 Days' : 'For 30 Days'}
        </span>
      </span>
      <span className={styles.vipSelection} aria-hidden="true">{isSelected ? 'Selected' : 'Select'}</span>
    </button>
  );
}
