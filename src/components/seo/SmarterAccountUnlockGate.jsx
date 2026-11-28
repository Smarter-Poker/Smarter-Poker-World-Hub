import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { buildSignupUrl, openQuickSignup } from './SmarterQuickSignupSheet';
import styles from './SmarterSeoKit.module.css';

function hasStoredAuthSession() {
  if (typeof window === 'undefined') return false;
  try {
    const storage = window.localStorage;
    if (!storage) return false;
    const explicit = storage.getItem('smarter-poker-auth');
    if (explicit) {
      try {
        const parsed = JSON.parse(explicit);
        if (parsed && (parsed.access_token || parsed.user)) return true;
      } catch (_) {
        if (explicit.length > 10) return true;
      }
    }
    for (let i = 0; i < storage.length; i += 1) {
      const key = storage.key(i);
      if (key && /^sb-.*-auth-token$/.test(key)) {
        const raw = storage.getItem(key);
        if (raw && raw !== '{}' && raw !== 'null') return true;
      }
    }
  } catch (_) {
    return false;
  }
  return false;
}

// The teaser under each headline names the features a free account opens.
// It never shows example rows of solver frequencies, timestamps, EVs, table
// counts or any other figure: those read as real analysis of the page the
// player is on, and they were invented. A number here must come from real
// data in this repo (107 is the canonical TRAINING_LIBRARY game count).
const PRESETS = {
  'solver-matrix': {
    eyebrow: 'Free Account Unlock',
    title: 'See Full Preflop Solver Charts & Drill Every Spot',
    subtitle:
      'Create A Free Smarter.Poker Account To Unlock Complete Preflop Charts, 3-Bet And 4-Bet Responses, And Interactive GTO Drills.',
    ctaLabel: 'Unlock Full Solver Charts Free',
    unlockedHref: '/hub/training',
    unlockedLabel: 'Open Live GTO Training',
    locked: ['Full Preflop Charts', 'Vs 3-Bet Responses', 'Saved Hands', 'Accuracy Tracking', 'GTO Drills'],
    benefits: [
      'Unlock Full Preflop Solver Charts For Every Position',
      'Save Any Starting Hand To Your Daily GTO Drill Queue',
      'Track Your Accuracy Across 107 Free Training Games',
    ],
  },
  'calculator-pro': {
    eyebrow: 'Free Account Unlock',
    title: 'Save Scenarios, Compare Ranges & Export Calculations Free',
    subtitle:
      'Keep Every Calculation In Your Free Smarter.Poker Workspace And Launch GTO Training From Your Exact Spot.',
    ctaLabel: 'Create Free Account To Save & Unlock',
    unlockedHref: '/hub/training/range-builder',
    unlockedLabel: 'Open Cloud Range Builder',
    locked: ['Saved Scenarios', 'Custom Presets', 'Range Exports', 'Cloud Sync', 'Bankroll Link'],
    benefits: [
      'Save Calculator Scenarios & Custom Presets',
      'Export Ranges & Equity Tables To Your Study Library',
      'Sync Results With Bankroll Manager & GTO Training',
    ],
  },
  'live-venue-intel': {
    eyebrow: 'Free Live Room Intel',
    title: 'Track Peak Hours, Favorite Rooms & Series Alerts With A Free Account',
    subtitle:
      'Unlock Peak-Hour Trends, Favorite Room Tracking, And Tournament Series Alerts For Listed Poker Rooms.',
    ctaLabel: 'Unlock Live Room Intel Free',
    unlockedHref: '/hub/poker-near-me/lobby',
    unlockedLabel: 'Open Live Poker Near Me',
    locked: ['Peak-Hour Trends', 'Favorite Rooms', 'Series Alerts', 'Schedule Sync', 'Session Logging'],
    benefits: [
      'Unlock Peak-Hour Trends & Busiest-Day Patterns',
      'Save Favorite Poker Rooms & Sync Tournament Schedules',
      'Log Live Cash & MTT Sessions Into Free Bankroll Manager',
    ],
  },
  'video-drill': {
    eyebrow: 'Free Study Account',
    title: 'Unlock Interactive Hand Quizzes, Bookmarks & Pro Feeds Free',
    subtitle:
      'Bookmark Key Hands, Follow Favorite Pros, And Drill The Spots You Watch In GTO Training.',
    ctaLabel: 'Create Free Account To Bookmark & Drill',
    unlockedHref: '/hub/video-library',
    unlockedLabel: 'Open Video Study Library',
    locked: ['Hand Quizzes', 'Video Bookmarks', 'Study Playlists', 'Pro Feeds', 'GTO Drills'],
    benefits: [
      'Bookmark Videos & Build Custom Study Playlists',
      'Follow Poker Creators & Tournament Channels',
      'Jump Straight From Any Video Into 107 Free GTO Drills',
    ],
  },
  'study-deck': {
    eyebrow: 'Free Study Account',
    title: 'Save This Guide, Unlock Printable Cheat Sheets & Track Leaks Free',
    subtitle:
      'Create Your Free Smarter.Poker Account To Bookmark Strategy Guides, Unlock Interactive Spot Quizzes, And Track Your Progress From Beginner To Pro.',
    ctaLabel: 'Unlock Study Deck & Quizzes Free',
    unlockedHref: '/hub/training/skill-tree',
    unlockedLabel: 'Open Interactive Skill Tree',
    locked: ['Saved Guides', 'Spot Quizzes', 'Cheat Sheets', 'Leak Tracker', 'Skill Tree'],
    benefits: [
      'Save Strategy Guides & Formulas To Your Study Dashboard',
      'Unlock 107 Interactive GTO Training Games & Skill Tree',
      'Zero Credit Card Needed - Instant Free Access',
    ],
  },
  'dataset-export': {
    eyebrow: 'Free Research & Comparison Access',
    title: 'Filter, Save & Export This Data With A Free Account',
    subtitle:
      'Filter Listed Poker Rooms, Tournament Series, And Research Datasets Inside Smarter.Poker - Free With Your Account.',
    ctaLabel: 'Unlock Full Interactive Data Free',
    unlockedHref: '/hub',
    unlockedLabel: 'Open Smarter.Poker Hub',
    locked: ['Room Filters', 'Saved Comparisons', 'Calendar Export', 'Custom Notes', 'Cloud Bookmarks'],
    benefits: [
      'Filter Listed Poker Rooms By Stakes, Games & Distance',
      'Save Comparisons, Research Benchmarks & Custom Notes',
      'Access Free Bankroll Tracker, Training Games & Poker Clubs',
    ],
  },
  'training-gto': {
    eyebrow: 'Free GTO Training Access',
    title: 'Unlock Your Full Leak Matrix & 107 Interactive GTO Games Free',
    subtitle:
      'Create A Free Smarter.Poker Account To Unlock Every Solver Breakdown, Save Your Leak Diagnostic Score, And Drill Your Weakest Spots Daily.',
    ctaLabel: 'Unlock Full Leak Report & 30-Day Free VIP',
    unlockedHref: '/hub/training',
    unlockedLabel: 'Launch 107 GTO Games',
    locked: ['5-Category Leak Matrix', '107 GTO Drills', 'Saved Spots Sync', 'EV Loss Breakdown', 'Custom Drill Plan'],
    benefits: [
      'Unlock Your Complete 5-Category GTO Leak Matrix & EV Breakdown',
      'Train Directly On Your Weakest Spots Across 107 Free GTO Games',
      'Zero Credit Card Needed - Instant Free Account Sync',
    ],
  },
  'editorial-wire': {
    eyebrow: 'Free Member Access',
    title: 'Unlock Interactive Weekly Hand Polls, Archives & Pro Alerts Free',
    subtitle:
      'Join Smarter.Poker Free To Vote On Weekly GTO Hand Spots, Browse Every Magazine & Wire Edition, And Sync Tournament Alerts To Your Calendar.',
    ctaLabel: 'Create Free Member Account',
    unlockedHref: '/hub/wire',
    unlockedLabel: 'Open Member Wire Feed',
    locked: ['Weekly Hand Polls', 'Wire Archive', 'Magazine Issues', 'Series Alerts', 'Calendar Sync'],
    benefits: [
      'Vote On Interactive Solver Spots & See Community Splits',
      'Unlock Full Smarter.Poker Magazine & Weekly Wire Archives',
      'Get Free Access To GTO Tools, Bankroll Manager & Poker Near Me',
    ],
  },
};

export default function SmarterAccountUnlockGate({
  variant = 'study-deck',
  context = 'seo-unlock-gate',
  eyebrow,
  title,
  subtitle,
  ctaLabel,
  benefits,
  redirectPath,
  className = '',
}) {
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    setSignedIn(hasStoredAuthSession());
  }, []);

  const preset = PRESETS[variant] || PRESETS['study-deck'];
  const currentPath =
    redirectPath ||
    (router?.asPath ? String(router.asPath).split('#')[0] : '/hub');
  const resolvedEyebrow = eyebrow || preset.eyebrow;
  const resolvedTitle = title || preset.title;
  const resolvedSubtitle = subtitle || preset.subtitle;
  const resolvedCta = ctaLabel || preset.ctaLabel;
  const resolvedBenefits = Array.isArray(benefits) && benefits.length > 0 ? benefits : preset.benefits;

  const signupHref = buildSignupUrl({
    redirectPath: currentPath,
    unlockKey: context,
    source: `unlock-${variant}`,
  });
  const loginHref = `/auth/login?redirect=${encodeURIComponent(currentPath)}`;

  const handleOpenQuickSheet = (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    openQuickSignup({
      unlockKey: context,
      eyebrow: resolvedEyebrow,
      title: resolvedTitle,
      subtitle: resolvedSubtitle,
      benefits: resolvedBenefits,
      redirectPath: currentPath,
      source: `unlock-${variant}`,
    });
  };

  if (signedIn) {
    return (
      <aside
        className={`${styles.kit} ${styles.frame} ${styles.unlockBay} ${className}`}
        data-smarter-unlock-gate={context}
        data-smarter-conversion-cta={context}
      >
        <div className={styles.unlockHeader}>
          <div>
            <span className={styles.eyebrowTag}>Member Access Active</span>
            <h2 className={styles.unlockTitle}>{resolvedTitle}</h2>
            <p className={styles.unlockSubtitle}>
              Your Smarter.Poker Account Is Signed In. Launch The Live Interactive Tool Directly Below.
            </p>
          </div>
          <Link href={preset.unlockedHref} className={styles.ctaPrimary}>
            <span>{preset.unlockedLabel}</span>
          </Link>
        </div>
      </aside>
    );
  }

  return (
    <aside
      className={`${styles.kit} ${styles.frameActive} ${styles.unlockBay} ${className}`}
      aria-label={resolvedTitle}
      data-smarter-unlock-gate={context}
      data-smarter-conversion-cta={context}
    >
      <div className={styles.unlockHeader}>
        <div>
          <span className={styles.eyebrowTag}>{resolvedEyebrow}</span>
          <h2 className={styles.unlockTitle}>{resolvedTitle}</h2>
          <p className={styles.unlockSubtitle}>{resolvedSubtitle}</p>
        </div>
      </div>

      <div className={styles.unlockLockedWrap}>
        <span className={styles.unlockLockBadge}>Unlocks With A Free Account</span>
        <ul className={styles.unlockLockedList} aria-label="Features A Free Account Unlocks">
          {preset.locked.map((feature) => (
            <li key={feature} className={styles.unlockLockedItem}>{feature}</li>
          ))}
        </ul>
      </div>

      <ul className={styles.unlockBenefits}>
        {resolvedBenefits.map((item) => (
          <li key={item} className={styles.unlockBenefitItem}>
            <span className={styles.unlockCheck} aria-hidden="true">▸</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>

      <div
        data-testid="unlock-gate-welcome-ribbon"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          margin: '0 0 14px',
          padding: '8px 12px',
          borderRadius: 0,
          border: '1px solid #3a7fbd',
          background: 'linear-gradient(90deg, rgba(16, 56, 102, 0.92) 0%, rgba(7, 25, 48, 0.92) 100%)',
          boxShadow: 'inset 0 1px 0 rgba(134, 218, 255, 0.34)',
          color: '#f2f7ff',
          fontSize: 12.5,
          fontWeight: 700,
          letterSpacing: '0.02em',
          lineHeight: 1.35,
        }}
      >
        <span style={{ color: '#86daff', flex: 'none' }} aria-hidden="true">▸</span>
        <span>Bonus: Free 30-Day VIP + 500 Diamonds On Phone Verify</span>
      </div>

      <div className={styles.unlockActions}>
        <a
          href={signupHref}
          onClick={handleOpenQuickSheet}
          className={styles.ctaPrimary}
          data-testid={`unlock-gate-cta-${context}`}
        >
          <span>{resolvedCta}</span>
        </a>
        <Link href={loginHref} className={styles.ctaSecondary}>
          <span>Sign In To Existing Account</span>
        </Link>
      </div>

      <p className={styles.unlockFootnote}>
        100% Free Forever. No Credit Card Required. Instant 1-Tap Google Or Email Access.
      </p>
    </aside>
  );
}
