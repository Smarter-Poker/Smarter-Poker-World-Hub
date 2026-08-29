import Link from 'next/link';
import { Award, BarChart3 } from 'lucide-react';

import MarketplaceDetailExperience from '../../../src/components/store/MarketplaceDetailExperience';
import detailStyles from '../../../src/components/store/MarketplaceDetailExperience.module.css';
import RewardTelemetryConsole from '../../../src/components/store/RewardTelemetryConsole';
import {
  STANDARD_REWARDS,
  EASTER_EGGS,
  DAILY_CAP,
  MONTHLY_CAP,
  EASTER_EGG_MONTHLY_CAP,
} from '../../../src/data/diamondStoreData';

const ALL_REWARDS = [
  ...STANDARD_REWARDS.map((reward) => ({
    id: reward.id,
    name: reward.name,
    description: reward.description || reward.note,
    detail: reward.note,
    value: reward.amount,
    diamonds: reward.diamonds || reward.maxDiamonds || 0,
    category: reward.category,
    kind: 'Standard Reward',
    countsTowardDailyCap: reward.countsTowardDailyCap,
    lifetime: reward.lifetime,
  })),
  ...Object.entries(EASTER_EGGS).flatMap(([category, rewards]) =>
    rewards.map((reward) => ({
      id: reward.id,
      name: reward.name,
      description: reward.trigger,
      detail: reward.trigger,
      value: reward.reward,
      diamonds: reward.diamonds,
      category,
      kind: `${reward.rarity} Hidden Achievement`,
      rarity: reward.rarity,
      countsTowardDailyCap: false,
      lifetime: true,
    }))
  ),
];

export default function RewardDetail({ reward }) {
  const canonical = `/hub/smarter-rewards/${reward.id}`;
  const image = '/images/store-v3/rewards-hero.webp';
  const schema = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: `${reward.name} — Smarter Rewards`,
      description: reward.description,
      url: `https://smarter.poker${canonical}`,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Marketplace', item: 'https://smarter.poker/hub/diamond-store' },
        { '@type': 'ListItem', position: 2, name: 'Smarter Rewards', item: 'https://smarter.poker/hub/smarter-rewards' },
        { '@type': 'ListItem', position: 3, name: reward.name, item: `https://smarter.poker${canonical}` },
      ],
    },
  ];

  return (
    <MarketplaceDetailExperience
      canonical={canonical}
      title={reward.name}
      description={reward.description}
      eyebrow={`${reward.kind} / ${reward.category}`}
      image={image}
      imageAlt="Smarter.Poker trophy vault surrounded by blue diamonds"
      breadcrumbs={[
        { label: 'Marketplace', href: '/hub/diamond-store' },
        { label: 'Smarter Rewards', href: '/hub/smarter-rewards' },
        { label: reward.name, href: canonical },
      ]}
      diamondPrice={reward.diamonds}
      status={reward.lifetime ? 'Lifetime Signal' : 'Repeatable'}
      actions={
        <>
          <Link href="/hub/smarter-rewards"><Award size={16} aria-hidden="true" /> View Every Reward</Link>
          <Link href="/hub/diamond-store"><BarChart3 size={16} aria-hidden="true" /> Open Diamond Wallet</Link>
        </>
      }
      structuredData={schema}
    >
      <RewardTelemetryConsole reward={reward} canonical={canonical} />
      <div className={detailStyles.detailGrid}>
        <section className={detailStyles.detailCard}>
          <h2>How This Signal Unlocks</h2>
          <p>{reward.detail}</p>
          <p>
            Reward telemetry is verified by Smarter.Poker. Eligible actions are credited to the same diamond wallet used throughout the marketplace.
          </p>
        </section>
        <section className={detailStyles.detailCard}>
          <h2>Economy Rules</h2>
          <ul>
            <li>Standard daily cap: {Number(DAILY_CAP.free).toLocaleString()} Diamonds</li>
            <li>VIP daily cap: {Number(DAILY_CAP.vip).toLocaleString()} Diamonds</li>
            <li>Standard monthly cap: {Number(MONTHLY_CAP.free).toLocaleString()} Diamonds</li>
            <li>VIP monthly cap: {Number(MONTHLY_CAP.vip).toLocaleString()} Diamonds</li>
            <li>Hidden-achievement monthly budget: {Number(EASTER_EGG_MONTHLY_CAP).toLocaleString()} Diamonds</li>
            <li>{reward.countsTowardDailyCap ? 'This reward counts toward the daily cap.' : 'This reward is tracked outside the standard daily-cap calculation.'}</li>
          </ul>
        </section>
      </div>
    </MarketplaceDetailExperience>
  );
}

export function getStaticPaths() {
  return {
    paths: ALL_REWARDS.map((reward) => ({ params: { rewardId: reward.id } })),
    fallback: false,
  };
}

export function getStaticProps({ params }) {
  const reward = ALL_REWARDS.find((item) => item.id === params.rewardId);
  return reward ? { props: { reward } } : { notFound: true };
}
