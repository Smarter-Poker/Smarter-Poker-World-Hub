import Link from 'next/link';

import MarketplaceDetailExperience from '../../../src/components/store/MarketplaceDetailExperience';
import detailStyles from '../../../src/components/store/MarketplaceDetailExperience.module.css';
import styles from './compare.module.css';
import { getVipBenefitsForPlan, VIP_MEMBERSHIP } from '../../../src/data/diamondStoreData';

/* Monthly, Yearly, Lifetime (Dan 2026-09-05). Was daily/monthly/annual - with
   `.daily` deleted this array would have held an `undefined` and thrown on
   `plan.id` at render, so it is not a cosmetic rename. */
const PLANS = [VIP_MEMBERSHIP.monthly, VIP_MEMBERSHIP.yearly, VIP_MEMBERSHIP.lifetime];

export default function VipComparePage() {
  const canonical = '/hub/vip-membership/compare';
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Compare Smarter.Poker VIP Membership Plans',
    description: 'Compare monthly, yearly, and lifetime VIP access with card and diamond payment options.',
    url: `https://smarter.poker${canonical}`,
  };

  return (
    <MarketplaceDetailExperience
      canonical={canonical}
      title="Compare VIP Access"
      description="One entitlement system, three terms, and a verified way to settle each. Compare the exact term and choose without leaving Smarter.Poker."
      eyebrow="High Limit Access / Plan Intelligence"
      image="/images/store-v3/vip-hero.webp"
      imageAlt="Futuristic Smarter.Poker VIP access platform illuminated in blue"
      breadcrumbs={[
        { label: 'Marketplace', href: '/hub/diamond-store' },
        { label: 'VIP Membership', href: '/hub/vip-membership' },
        { label: 'Compare Plans', href: canonical },
      ]}
      status="All Diamond Plans Live"
      actions={
        <>
          <Link href="/hub/vip-membership">Choose A Plan</Link>
          <Link href="/hub/vip-membership/manage">Manage Membership</Link>
        </>
      }
      structuredData={schema}
    >
      <div className={detailStyles.detailGrid}>
        {PLANS.map((plan) => {
          /* Every plan is priced in USD now, so the isDiamondCost branch this
             used to carry (for the retired Daily Pass) is gone. 100 diamonds
             per dollar throughout. */
          const diamondCost = Math.round(Number(plan.price) * 100);
          const cardEquivalent = Number(plan.price).toFixed(2);
          const lifetime = plan.interval === 'lifetime';
          const cardReady = plan.cardCheckoutReady === true;
          const benefits = getVipBenefitsForPlan(plan.interval);
          return (
            <section className={detailStyles.detailCard} key={plan.id}>
              <h2>{plan.name}</h2>
              <p>
                {cardReady ? <><strong>${cardEquivalent}</strong> By Card Or </> : null}
                <strong>{diamondCost.toLocaleString()} Diamonds</strong>
                {cardReady ? '.' : ' With The Atomic Diamond Settlement Path.'}
              </p>
              <ul>
                <li>{lifetime ? 'Permanent Full VIP Access' : `${plan.interval === 'year' ? '365 Days' : '30 Days'} Of Full VIP Access`}</li>
                {!lifetime && <li>Extends Existing Access Instead Of Replacing It</li>}
                {lifetime && <li>Never Renews And Never Expires</li>}
                {lifetime && <li>Lifetime Card Checkout Remains Safely Paused</li>}
                {lifetime && <li>Unlimited Throwables, Rabbit Hunts, And Standard Time Banks</li>}
                {lifetime && <li>Every Cataloged Digital Table Skin, Background, Card Back, And Dealer Button Included</li>}
                {lifetime && <li>Every VIP Avatar, Frame, Aura, And Safe Digital Feature Pack Included</li>}
                <li>Includes All {benefits.length} Included Benefits For This Plan</li>
                {plan.savings > 0 && <li>Saves ${Number(plan.savings).toFixed(2)} Against Monthly Billing</li>}
              </ul>
              <Link className={styles.planAction} href={`/hub/vip-membership?plan=${plan.id}`}>Select {plan.name}</Link>
            </section>
          );
        })}
      </div>
      <div className={detailStyles.assuranceGrid}>
        <div><strong>Card</strong><span>Stripe Checkout Verifies Monthly And Yearly Terms. Lifetime Card Checkout Remains Paused Until Its Full Refund, Dispute, And Cross-Method Lifecycle Is Published.</span></div>
        <div><strong>Diamonds</strong><span>Every Term, Lifetime Included, Settles Against Your Verified Diamond Wallet.</span></div>
        <div><strong>Entitlements</strong><span>Access Expiry, Tier, And Benefits Are Updated From Server-Owned Records.</span></div>
      </div>
    </MarketplaceDetailExperience>
  );
}
