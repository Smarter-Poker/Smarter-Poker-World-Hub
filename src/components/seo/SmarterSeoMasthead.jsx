import Link from 'next/link';
import { buildSignupUrl, openQuickSignup } from './SmarterQuickSignupSheet';
import styles from './SmarterSeoKit.module.css';

const ART_MAP = {
  tools: {
    scene: '/images/smarterdesign/headers/poker-odds-scene.webp',
    seal: '/images/smarterdesign/headers/poker-odds-seal.webp',
    alt: 'Smarter.Poker Interactive GTO Calculators And Poker Odds Console',
  },
  hands: {
    scene: '/images/smarterdesign/headers/poker_cash-scene.webp',
    seal: '/images/smarterdesign/headers/poker_cash-seal.webp',
    alt: 'Smarter.Poker Starting Hand GTO Strategy Console',
  },
  learn: {
    scene: '/images/smarterdesign/headers/jarvis-scene.webp',
    seal: '/images/smarterdesign/headers/jarvis-seal.webp',
    alt: 'Smarter.Poker GTO Poker Strategy & Study Library',
  },
  venues: {
    scene: '/images/smarterdesign/headers/casino_table-scene.webp',
    seal: '/images/smarterdesign/headers/casino_table-seal.webp',
    alt: 'Smarter.Poker Live Poker Rooms & Casino Discovery',
  },
  series: {
    scene: '/images/smarterdesign/headers/series-scene.webp',
    seal: '/images/smarterdesign/headers/series-seal.webp',
    alt: 'Smarter.Poker Live Tournament Series & Schedules',
  },
  'poker-rooms': {
    scene: '/images/smarterdesign/headers/casino_table-scene.webp',
    seal: '/images/smarterdesign/headers/casino_table-seal.webp',
    alt: 'Smarter.Poker Live Poker Room Guides & Directories',
  },
  rules: {
    scene: '/images/smarterdesign/headers/rules-scene.webp',
    seal: '/images/smarterdesign/headers/rules-seal.webp',
    alt: 'Smarter.Poker Official Poker Rules & Floor Rulings',
  },
  games: {
    scene: '/images/smarterdesign/headers/poker_mtt-scene.webp',
    seal: '/images/smarterdesign/headers/poker_mtt-seal.webp',
    alt: 'Smarter.Poker Poker Game Variants & Strategy',
  },
  glossary: {
    scene: '/images/smarterdesign/headers/reports-scene.webp',
    seal: '/images/smarterdesign/headers/reports-seal.webp',
    alt: 'Smarter.Poker Poker Glossary & Terminology Reference',
  },
  compare: {
    scene: '/images/smarterdesign/headers/reports-scene.webp',
    seal: '/images/smarterdesign/headers/reports-seal.webp',
    alt: 'Smarter.Poker Data-Backed Poker Comparisons',
  },
  research: {
    scene: '/images/smarterdesign/headers/reports-scene.webp',
    seal: '/images/smarterdesign/headers/reports-seal.webp',
    alt: 'Smarter.Poker Original Poker Research & Datasets',
  },
  video: {
    scene: '/images/smarterdesign/headers/players-scene.webp',
    seal: '/images/smarterdesign/headers/players-seal.webp',
    alt: 'Smarter.Poker Curated Poker Video Library',
  },
  bankroll: {
    scene: '/images/smarterdesign/headers/bankroll-scene.webp',
    seal: '/images/smarterdesign/headers/bankroll-seal.webp',
    alt: 'Smarter.Poker Free Poker Bankroll Manager',
  },
  magazine: {
    scene: '/images/smarterdesign/headers/series-scene.webp',
    seal: '/images/smarterdesign/headers/series-seal.webp',
    alt: 'Smarter.Poker Magazine & Editorial Editions',
  },
  wire: {
    scene: '/images/smarterdesign/headers/goals-scene.webp',
    seal: '/images/smarterdesign/headers/goals-seal.webp',
    alt: 'Smarter.Poker Weekly Wire & Strategy Dispatch',
  },
  authors: {
    scene: '/images/smarterdesign/headers/players-scene.webp',
    seal: '/images/smarterdesign/headers/players-seal.webp',
    alt: 'Smarter.Poker Editorial Team & Poker Strategists',
  },
  features: {
    scene: '/images/smarterdesign/headers/jarvis-scene.webp',
    seal: '/images/smarterdesign/headers/jarvis-seal.webp',
    alt: 'Smarter.Poker Platform Features & Hardware Modules',
  },
};

export default function SmarterSeoMasthead({
  vertical = 'learn',
  eyebrow = 'Smarter.Poker Platform',
  title,
  lead,
  stats = [],
  redirectPath = '/hub',
  unlockKey = '',
  primaryCtaLabel = 'Create Free Account',
  secondaryHref = '',
  secondaryLabel = '',
  asHeading = 'h1',
  className = '',
}) {
  const art = ART_MAP[vertical] || ART_MAP.learn;
  const HeadingTag = asHeading === 'h2' ? 'h2' : 'h1';
  const signupHref = buildSignupUrl({
    redirectPath,
    unlockKey: unlockKey || `masthead-${vertical}`,
    source: `masthead-${vertical}`,
  });

  const handlePrimaryClick = (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    openQuickSignup({
      unlockKey: unlockKey || `masthead-${vertical}`,
      eyebrow,
      title: `Create Your Free Smarter.Poker Account`,
      subtitle: lead || 'Unlock Full Interactive GTO Tools, Live Poker Room Intel, And Free Bankroll Tracking.',
      redirectPath,
      source: `masthead-${vertical}`,
    });
  };

  return (
    <header className={`${styles.kit} ${styles.frame} ${className}`} data-smarter-masthead={vertical}>
      <div className={styles.masthead}>
        <img
          src={art.scene}
          alt=""
          aria-hidden="true"
          className={styles.mastheadScene}
          loading="eager"
          decoding="async"
        />
        <div className={styles.mastheadSeal} aria-hidden="true">
          <img src={art.seal} alt="" loading="eager" decoding="async" />
        </div>
        <div style={{ position: 'relative', minWidth: 0 }}>
          <span className={styles.eyebrowTag}>{eyebrow}</span>
          {title && <HeadingTag className={styles.mastheadTitle}>{title}</HeadingTag>}
          {lead && <p className={styles.mastheadLead}>{lead}</p>}
        </div>
      </div>

      {Array.isArray(stats) && stats.length > 0 && (
        <div className={styles.statStrip}>
          {stats.map((s) => (
            <div key={s.label} className={styles.statTile}>
              <span className={styles.statLabel}>{s.label}</span>
              <span className={styles.statValue}>{s.value}</span>
            </div>
          ))}
        </div>
      )}

      <div className={styles.mastheadFooter}>
        <span style={{ color: '#bdd0e2', fontSize: 13, fontWeight: 500 }}>
          Free Smarter.Poker Account: Save Ranges, Track Live Venues &amp; Drill 107 GTO Games
        </span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <a href={signupHref} onClick={handlePrimaryClick} className={styles.btnSharpPrimary}>
            {primaryCtaLabel}
          </a>
          {secondaryHref && secondaryLabel && (
            <Link href={secondaryHref} className={styles.btnSharpSecondary}>
              {secondaryLabel}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
