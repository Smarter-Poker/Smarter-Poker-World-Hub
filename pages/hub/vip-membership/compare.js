import MarketplaceDetailExperience from '../../../src/components/store/MarketplaceDetailExperience';
import styles from './compare.module.css';
import {
  VipCta,
  VipFacts,
  VipGhost,
  VipIntroPrice,
  VipLead,
  VipMasthead,
  VipPlanPanel,
  VipPricePlate,
} from '../../../src/components/vip/VipKit';
import { formatStoreUsd } from '../../../src/lib/store/wholeDollarPrice.mjs';
import { getVipBenefitsForPlan, VIP_MEMBERSHIP } from '../../../src/data/diamondStoreData';
import { breadcrumbSchema } from '../../../src/lib/seo/hubPageSchema';
import SmarterAccountUnlockGate from '../../../src/components/seo/SmarterAccountUnlockGate';
import { marketplaceCopy } from '../../../src/lib/store/marketplaceCopy';

/* Monthly, Yearly, Lifetime (Dan 2026-09-05). Was daily/monthly/annual - with
   `.daily` deleted this array would have held an `undefined` and thrown on
   `plan.id` at render, so it is not a cosmetic rename. */
const PLANS = [VIP_MEMBERSHIP.monthly, VIP_MEMBERSHIP.yearly, VIP_MEMBERSHIP.lifetime];

export default function VipComparePage() {
  const canonical = '/hub/vip-membership/compare';
  const breadcrumbs = [
    { label: 'Marketplace', href: '/hub/diamond-store' },
    { label: 'VIP Membership', href: '/hub/vip-membership' },
    { label: 'Compare Plans', href: canonical },
  ];
  const breadcrumb = breadcrumbSchema(breadcrumbs.map(({ label, href }) => [label, href]));
  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        name: 'Compare Smarter.Poker VIP Membership Plans',
        description:
          'Compare monthly, yearly, and lifetime VIP access with card and diamond payment options.',
        url: `https://smarter.poker${canonical}`,
        breadcrumb: { '@id': breadcrumb['@id'] },
      },
      breadcrumb,
    ],
  };

  return (
    <MarketplaceDetailExperience
      canonical={canonical}
      title="Compare VIP Access"
      description="One entitlement system, three terms, and a verified way to settle each. Compare the exact term and choose without leaving Smarter.Poker."
      eyebrow="High Limit Access / Plan Intelligence"
      image="/images/store-v3/vip-hero.webp"
      imageAlt="Futuristic Smarter.Poker VIP access platform illuminated in blue"
      breadcrumbs={breadcrumbs}
      status="All Diamond Plans Live"
      presentation="membership"
      masthead={
        <div>
          <VipMasthead
            parent="Smarter.Poker VIP"
            title="Compare VIP Plans"
            helpHref="/hub/vip-membership#vip-faq"
            helpLabel="VIP Plans Help And Frequently Asked Questions"
          />
          <VipLead
            actions={
              <>
                <VipGhost href="/hub/vip-membership">Choose A Plan</VipGhost>
                <VipGhost href="/hub/vip-membership/manage">Manage Membership</VipGhost>
              </>
            }
          >
            Three Terms, One Membership Across Smarter.Poker And Club Arena. Pay By Card Or With
            Diamonds.
          </VipLead>
        </div>
      }
      structuredData={schema}
    >
      <div className={styles.planGrid}>
        {PLANS.map((plan) => {
          /* Every plan is priced in USD now, so the isDiamondCost branch this
             used to carry (for the retired Daily Pass) is gone. 100 diamonds
             per dollar throughout. */
          const diamondCost = Math.round(Number(plan.price) * 100);
          const lifetime = plan.interval === 'lifetime';
          const cardReady = plan.cardCheckoutReady === true;
          const benefits = getVipBenefitsForPlan(plan.interval);
          const perks = [
            lifetime
              ? 'Permanent Full VIP Access'
              : `${plan.interval === 'year' ? '365 Days' : '30 Days'} Of Full VIP Access`,
            ...(!lifetime ? ['Extends Existing Access Instead Of Replacing It'] : []),
            ...(lifetime
              ? [
                  'Never Renews And Never Expires',
                  'One-Time Card Or 50,000 Diamond Checkout',
                  'Unlimited Throwables, Rabbit Hunts, And Standard Time Banks',
                  'Every Cataloged Digital Table Skin, Background, Card Back, And Dealer Button Included',
                  'Every VIP Avatar, Frame, Aura, And Safe Digital Feature Pack Included',
                ]
              : []),
            `Includes All ${benefits.length} Included Benefits For This Plan`,
            ...(plan.savings > 0 ? [`Saves $${Number(plan.savings).toFixed(2)} Against Monthly Billing`] : []),
          ];
          /* The monthly card price is the account-aware readout: a new
             subscriber reads the $1 first month as the headline, a member the
             server says is not eligible (or while the offer is off) reads
             $20/Month. Checkout decides again on the server. */
          const price =
            plan.interval === 'month' && cardReady ? (
              <VipIntroPrice />
            ) : (
              <VipPricePlate
                amount={cardReady ? `$${formatStoreUsd(plan.price)}` : `${diamondCost.toLocaleString()}`}
                unit={cardReady ? (lifetime ? 'One Payment' : plan.interval === 'year' ? '/Year' : '/Month') : 'Diamonds'}
                note={lifetime ? 'Never Expires. No Renewal.' : 'Cancel Anytime.'}
              />
            );
          return (
            <VipPlanPanel
              key={plan.id}
              name={marketplaceCopy(plan.name)}
              featured={plan.interval === 'month'}
              price={price}
              diamondLine={
                cardReady
                  ? `Or ${diamondCost.toLocaleString()} Diamonds ${lifetime ? 'Once' : plan.interval === 'year' ? 'For 365 Days' : 'For 30 Days'}`
                  : 'Settles With The Atomic Diamond Settlement Path.'
              }
              perks={perks}
              action={
                <VipCta href={`/hub/vip-membership?plan=${plan.id}`}>
                  Select {marketplaceCopy(plan.name)}
                </VipCta>
              }
            />
          );
        })}
      </div>
      <VipFacts
        className={styles.facts}
        label="How VIP Is Paid And Kept"
        items={[
          {
            title: 'Card',
            text: 'Stripe Checkout Verifies Monthly, Yearly, And One-Time Lifetime Payments. Refund And Dispute Changes Reconcile Through Server-Owned Purchase Records.',
          },
          {
            title: 'Diamonds',
            text: 'Every Term, Lifetime Included, Settles Against Your Verified Diamond Wallet.',
          },
          {
            title: 'Entitlements',
            text: 'Access Expiry, Tier, And Benefits Are Updated From Server-Owned Records.',
          },
        ]}
      />
      <div className={styles.unlock}>
        <SmarterAccountUnlockGate
          variant="study-deck"
          context="vip-membership-compare"
          redirectPath="/hub/vip-membership/compare"
        />
      </div>
    </MarketplaceDetailExperience>
  );
}
