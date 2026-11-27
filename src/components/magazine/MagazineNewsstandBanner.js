import Link from 'next/link';

const CTA_BASE = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '44px',
  padding: '10px 16px',
  borderRadius: '10px',
  fontSize: '13px',
  textDecoration: 'none',
};

export default function MagazineNewsstandBanner({ variant = 'news' }) {
  const isCardrooms = variant === 'cardrooms';
  return (
    <section
      aria-label="Smarter.Poker Monthly Magazine Showcase"
      style={{
        boxSizing: 'border-box',
        width: '100%',
        maxWidth: '100%',
        overflow: 'hidden',
        background: 'linear-gradient(135deg, #0b1520 0%, #102131 100%)',
        border: '1px solid #1b2c3d',
        borderRadius: '14px',
        padding: '16px 18px',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '14px',
      }}
    >
      <div style={{ flex: '1 1 260px', minWidth: 0 }}>
        <div
          style={{
            display: 'inline-block',
            background: '#05070a',
            border: '1px solid #4fc1b3',
            color: '#4fc1b3',
            fontSize: '10.5px',
            fontWeight: 900,
            letterSpacing: '1.4px',
            textTransform: 'uppercase',
            padding: '3px 10px',
            borderRadius: '999px',
            marginBottom: '6px',
          }}
        >
          {isCardrooms ? 'Cardroom Print & Digital Newsstand' : 'Smarter.Poker Monthly Magazine'}
        </div>
        <div style={{ fontSize: '16.5px', fontWeight: 900, lineHeight: 1.28, color: '#ffffff', marginBottom: '4px' }}>
          {isCardrooms
            ? 'Stock Smarter.Poker Magazine In Your Poker Room Or Read The 44-Page Issue Online'
            : 'Explore The 44-Page Monthly Poker Strategy & Live Tour Edition'}
        </div>
        <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.5, color: '#9fb3c8' }}>
          Flip Through GTO Solver Columns, Global POY Top 25 Standings, And 60-Day Series Radar Or Request Monthly Cardroom Print Copies.
        </p>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
        <Link href="/hub/magazine" style={{ ...CTA_BASE, background: '#4fc1b3', color: '#05070a', fontWeight: 900 }}>
          Read Latest 44-Page Issue
        </Link>
        <Link
          href="/hub/magazine/poker-rooms"
          style={{ ...CTA_BASE, background: '#05070a', border: '1px solid #60a5fa', color: '#60a5fa', fontWeight: 800 }}
        >
          Free Cardroom Print Bundles
        </Link>
      </div>
    </section>
  );
}
