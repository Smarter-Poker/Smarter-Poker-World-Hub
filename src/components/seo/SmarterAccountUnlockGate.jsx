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

const PRESETS = {
  'solver-matrix': {
    eyebrow: 'Free Account Unlock',
    title: 'See Full Multi-Position Solver Frequencies & Drill Tree',
    subtitle:
      'Create A Free Smarter.Poker Account To Unlock Complete 6-Max & 9-Max Solver Splits, 3-Bet/4-Bet Responses, And Unlimited Interactive GTO Drills.',
    ctaLabel: 'Unlock Full Solver Matrix Free',
    unlockedHref: '/hub/training',
    unlockedLabel: 'Open Live GTO Training',
    columns: ['Position', 'Open / 3-Bet', 'Vs 3-Bet Call', '4-Bet Value / Bluff', 'EV (BB/100)'],
    rows: [
      ['UTG (100BB)', '100% Open 2.5x', '64% Call / 36% 4-Bet', '82% Value / 18% Bluff', '+14.8 BB'],
      ['CO (100BB)', '100% Open 2.5x', '71% Call / 29% 4-Bet', '76% Value / 24% Bluff', '+22.4 BB'],
      ['BTN (100BB)', '100% Open 2.2x', '78% Call / 22% 4-Bet', '70% Value / 30% Bluff', '+31.9 BB'],
      ['BB Defense', '44% 3-Bet / 56% Call', 'Mixed Flop C-Bet Tree', 'Exploitative Pool Shift', '+18.2 BB'],
    ],
    benefits: [
      'Unlock Full 6-Position & 40BB/100BB/200BB Solver Matrices',
      'Save Any Starting Hand To Your Daily GTO Drill Queue',
      'Track Accuracy, Leak Score & EV Gains Across 107 Free Games',
    ],
  },
  'calculator-pro': {
    eyebrow: 'Free Account Unlock',
    title: 'Save Scenarios, Compare Ranges & Export Calculations Free',
    subtitle:
      'Keep Every Calculation In Your Free Smarter.Poker Cloud Workspace, Export CSV Reports, And Launch Live GTO Training From Your Exact Spot.',
    ctaLabel: 'Create Free Account To Save & Unlock',
    unlockedHref: '/hub/training/range-builder',
    unlockedLabel: 'Open Cloud Range Builder',
    columns: ['Saved Spot', 'Stack / Format', 'Solver Action', 'Equity / EV', 'Cloud Sync'],
    rows: [
      ['BTN Vs BB 3-Bet', '100BB 6-Max Cash', '4-Bet / Call Split', '58.4% / +3.9 BB', 'Synced'],
      ['ICM Bubble Shove', '12BB Final Table', 'Push Top 34.2%', '+1.64% $EV', 'Synced'],
      ['Turn Check-Raise', 'SPR 3.4 Live 2/5', 'Semi-Bluff 62%', '+4.12 BB', 'Synced'],
    ],
    benefits: [
      'Save Unlimited Calculator Scenarios & Custom Presets',
      'Export Ranges & Equity Tables To Your Study Library',
      'Sync Results Directly With Bankroll Manager & GTO Training',
    ],
  },
  'live-venue-intel': {
    eyebrow: 'Free Live Room Intel',
    title: 'See Live Waitlists, Peak Hours & Seat Alerts With A Free Account',
    subtitle:
      'Unlock Real-Time Table Counts, Hourly Peak-Traffic Heatmaps, Favorite Room Tracking, And Instant Tournament Series Alerts Across 715+ Poker Rooms.',
    ctaLabel: 'Unlock Live Room Intel Free',
    unlockedHref: '/hub/poker-near-me/lobby',
    unlockedLabel: 'Open Live Poker Near Me',
    columns: ['Live Game', 'Tables Running', 'Waitlist', 'Peak Window', 'Alert Status'],
    rows: [
      ['1/3 No-Limit Hold Em', '11 Active Tables', '4 Players Waiting', 'Fri-Sat 8:00 PM', 'Live Alert Ready'],
      ['2/5 No-Limit Hold Em', '6 Active Tables', '2 Players Waiting', 'Fri-Sat 9:00 PM', 'Live Alert Ready'],
      ['PLO / Mixed Games', '3 Active Tables', 'Open Seat Now', 'Thu-Sun 7:30 PM', 'Live Alert Ready'],
    ],
    benefits: [
      'Unlock Hourly Peak-Traffic Heatmaps & Busiest-Day Trends',
      'Save Favorite Poker Rooms & Sync Tournament Schedules',
      'Log Live Cash & MTT Sessions Into Free Bankroll Manager',
    ],
  },
  'video-drill': {
    eyebrow: 'Free Study Account',
    title: 'Unlock Interactive Hand Quizzes, Bookmarks & Pro Feeds Free',
    subtitle:
      'Turn Every Poker Video Into Measurable Win-Rate Gains. Bookmark Key Hands, Follow Favorite Pros, And Drill The Exact Spot In GTO Training.',
    ctaLabel: 'Create Free Account To Bookmark & Drill',
    unlockedHref: '/hub/video-library',
    unlockedLabel: 'Open Video Study Library',
    columns: ['Timestamp', 'Decision Spot', 'GTO Line', 'Pool Leak', 'Drill Link'],
    rows: [
      ['04:18', 'Flop Check-Raise IP', 'Call 68% / Raise 32%', 'Over-Folding 19%', 'Launch Drill'],
      ['11:42', 'Turn Overbet 125%', 'Polarized Value/Bluff', 'Under-Bluffing 14%', 'Launch Drill'],
      ['18:05', 'River Thin Value', 'Bet 50% Pot', 'Missed Value +3.2BB', 'Launch Drill'],
    ],
    benefits: [
      'Bookmark Video Timestamps & Build Custom Study Playlists',
      'Follow Verified Poker Creators & Tournament Channels',
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
    columns: ['Module', 'Spot Drills', 'Cheat Sheet', 'Leak Tracker', 'Access'],
    rows: [
      ['Preflop Foundations', '24 Interactive Spots', 'Full Matrix Ready', 'Auto-Graded', 'Free Account'],
      ['Postflop C-Betting', '32 Interactive Spots', 'Board Texture Grid', 'Auto-Graded', 'Free Account'],
      ['Tournament ICM & PKO', '28 Interactive Spots', 'Push/Fold Charts', 'Auto-Graded', 'Free Account'],
    ],
    benefits: [
      'Save Strategy Guides & Formulas To Your Study Dashboard',
      'Unlock 107 Interactive GTO Training Games & Skill Tree',
      'Zero Credit Card Needed - Instant Free Access',
    ],
  },
  'dataset-export': {
    eyebrow: 'Free Research & Comparison Access',
    title: 'See Full Interactive Filter Matrix & Export Data With A Free Account',
    subtitle:
      'Filter Every Verified Poker Room, Tournament Series, And Research Dataset Live Inside Smarter.Poker - Free With Your Account.',
    ctaLabel: 'Unlock Full Interactive Data Free',
    unlockedHref: '/hub',
    unlockedLabel: 'Open Smarter.Poker Hub',
    columns: ['Metric / Filter', 'Full Verified Scope', 'Live Updates', 'Export / Save', 'Cost'],
    rows: [
      ['Poker Rooms Directory', '715+ Verified Venues', 'Daily Live Sync', 'Favorites + Alerts', '100% Free'],
      ['Tournament Schedules', 'Live Series & Circuits', 'Daily Schedule Sync', 'Calendar Export', '100% Free'],
      ['GTO & Strategy Datasets', '169 Hands + 50+ Tools', 'Solver Verified', 'Cloud Bookmarks', '100% Free'],
    ],
    benefits: [
      'Filter 715+ Poker Rooms By Stakes, Rake, Distance & Waitlist',
      'Save Comparisons, Research Benchmarks & Custom Notes',
      'Access Free Bankroll Tracker, Training Games & Poker Clubs',
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
    columns: ['Member Feature', 'Weekly Drop', 'Interactive Access', 'Archive', 'Tier'],
    rows: [
      ['GTO Spot Of The Week', 'Every Issue', 'Vote + Solver Reveal', 'Full History', 'Free Account'],
      ['Live Series Alerts', 'Regional + Major', '1-Click Calendar Sync', 'All Tours', 'Free Account'],
      ['Poker Magazine Issues', 'Digital + Rooms', 'Bookmark & Share', 'All Editions', 'Free Account'],
    ],
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
  columns,
  rows,
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
  const resolvedCols = Array.isArray(columns) && columns.length > 0 ? columns : preset.columns;
  const resolvedRows = Array.isArray(rows) && rows.length > 0 ? rows : preset.rows;

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

      <div className={styles.unlockPreviewWrap} aria-hidden="true">
        <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
          <table className={styles.unlockPreviewTable}>
            <thead>
              <tr>
                {resolvedCols.map((col) => (
                  <th key={col}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody className={styles.unlockBlurred}>
              {resolvedRows.map((row, idx) => (
                <tr key={idx}>
                  {row.map((cell, cIdx) => (
                    <td key={cIdx}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={styles.unlockOverlayScrim}>
          <span className={styles.unlockLockBadge}>Free Account Required To View Full Data</span>
        </div>
      </div>

      <ul className={styles.unlockBenefits}>
        {resolvedBenefits.map((item) => (
          <li key={item} className={styles.unlockBenefitItem}>
            <span className={styles.unlockCheck} aria-hidden="true">▸</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>

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
