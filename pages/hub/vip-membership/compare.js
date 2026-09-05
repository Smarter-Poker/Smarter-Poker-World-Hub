import Link from 'next/link';
import { CreditCard, Gem } from 'lucide-react';

import MarketplaceDetailExperience from '../../../src/components/store/MarketplaceDetailExperience';
import detailStyles from '../../../src/components/store/MarketplaceDetailExperience.module.css';
import { VIP_BENEFITS, VIP_MEMBERSHIP } from '../../../src/data/diamondStoreData';

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
      status="All Plans Live"
      actions={
        <>
          <Link href="/hub/vip-membership"><CreditCard size={16} aria-hidden="true" /> Choose A Plan</Link>
          <Link href="/hub/vip-membership/manage"><Gem size={16} aria-hidden="true" /> Manage Membership</Link>
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
          return (
            <section className={detailStyles.detailCard} key={plan.id}>
              <h2>{plan.name}</h2>
              {/* A card button for lifetime would 400: one-time Stripe checkout
                  is not built yet. Say what is true rather than offer it. */}
              <p>
                {plan.cardCheckoutReady === false
                  ? <><strong>{diamondCost.toLocaleString()} Diamonds</strong> (${cardEquivalent} By Card Is Coming Soon).</>
                  : <><strong>${cardEquivalent}</strong> By Card Or <strong>{diamondCost.toLocaleString()} Diamonds</strong>.</>}
              </p>
              <ul>
                <li>{lifetime ? 'Permanent' : plan.interval === 'year' ? '365 Days' : '30 Days'} Of Full VIP Access</li>
                {!lifetime && <li>Extends Existing Access Instead Of Replacing It</li>}
                {lifetime && <li>Never Renews And Never Expires</li>}
                <li>Includes All {VIP_BENEFITS.length} Currently Enforced VIP Benefits</li>
                {plan.savings > 0 && <li>Saves ${Number(plan.savings).toFixed(2)} Against Monthly Billing</li>}
              </ul>
              <Link href={`/hub/vip-membership?plan=${plan.id}`}>Select {plan.name}</Link>
            </section>
          );
        })}
      </div>
      <div className={detailStyles.assuranceGrid}>
        <div><strong>Card</strong><span>Stripe Checkout Verifies Monthly And Yearly Access.</span></div>
        <div><strong>Diamonds</strong><span>Every Term, Lifetime Included, Settles Against Your Verified Diamond Wallet.</span></div>
        <div><strong>Entitlements</strong><span>Access Expiry, Tier, And Benefits Are Updated From Server-Owned Records.</span></div>
      </div>
    </MarketplaceDetailExperience>
  );
}
