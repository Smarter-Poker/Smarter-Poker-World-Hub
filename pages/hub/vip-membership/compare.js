import Link from 'next/link';
import { CreditCard, Gem } from 'lucide-react';

import MarketplaceDetailExperience from '../../../src/components/store/MarketplaceDetailExperience';
import detailStyles from '../../../src/components/store/MarketplaceDetailExperience.module.css';
import { VIP_BENEFITS, VIP_MEMBERSHIP } from '../../../src/data/diamondStoreData';

const PLANS = [VIP_MEMBERSHIP.daily, VIP_MEMBERSHIP.monthly, VIP_MEMBERSHIP.annual];

export default function VipComparePage() {
  const canonical = '/hub/vip-membership/compare';
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Compare Smarter.Poker VIP Membership Plans',
    description: 'Compare daily, monthly, and annual VIP access with card and diamond payment options.',
    url: `https://smarter.poker${canonical}`,
  };

  return (
    <MarketplaceDetailExperience
      canonical={canonical}
      title="Compare VIP Access"
      description="One entitlement system, three access windows, and two verified ways to settle. Compare the exact term and choose card or diamonds without leaving Smarter.Poker."
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
          const diamondCost = plan.isDiamondCost ? plan.price : Math.round(Number(plan.price) * 100);
          const cardEquivalent = plan.isDiamondCost ? (Number(plan.price) / 100).toFixed(2) : Number(plan.price).toFixed(2);
          return (
            <section className={detailStyles.detailCard} key={plan.id}>
              <h2>{plan.name}</h2>
              <p><strong>${cardEquivalent}</strong> by card or <strong>{diamondCost.toLocaleString()} Diamonds</strong>.</p>
              <ul>
                <li>{plan.interval === 'day' ? '24 hours' : plan.interval === 'year' ? '365 days' : '30 days'} of full VIP access</li>
                <li>Extends existing access instead of replacing it</li>
                <li>Includes all {VIP_BENEFITS.length} currently enforced VIP benefits</li>
                {plan.savings > 0 && <li>Saves ${Number(plan.savings).toFixed(2)} against monthly billing</li>}
              </ul>
              <Link href={`/hub/vip-membership?plan=${plan.id}`}>Select {plan.name}</Link>
            </section>
          );
        })}
      </div>
      <div className={detailStyles.assuranceGrid}>
        <div><strong>Card</strong><span>Stripe Checkout verifies monthly, annual, and card-funded daily access.</span></div>
        <div><strong>Diamonds</strong><span>Every plan can settle against your verified diamond wallet.</span></div>
        <div><strong>Entitlements</strong><span>Access expiry, tier, and benefits are updated from server-owned records.</span></div>
      </div>
    </MarketplaceDetailExperience>
  );
}
