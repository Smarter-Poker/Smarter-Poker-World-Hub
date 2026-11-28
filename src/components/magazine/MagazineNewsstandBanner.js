import Link from 'next/link';

// #SMARTERDESIGN (Dan, 2026-11-27): one steel rim (`sd-panel`), the eyebrow as
// ice-blue lettering instead of a teal pill, a white condensed title, silver
// body copy, and the two links as chrome `sd-button`s with the primary lit
// cobalt. The links stay real <Link>s with a 44px touch target.
const CTA_BASE = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '44px',
  padding: '6px 16px',
  fontSize: '15px',
  textDecoration: 'none',
};

export default function MagazineNewsstandBanner({ variant = 'news' }) {
  const isCardrooms = variant === 'cardrooms';
  return (
    <section
      aria-label="Smarter.Poker Monthly Magazine Showcase"
      className="smarterdesign sd-panel"
      data-magazine-banner={variant}
      style={{
        width: '100%',
        maxWidth: '100%',
        overflow: 'hidden',
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
            color: '#86daff',
            fontFamily: 'var(--sd-type)',
            fontSize: '14px',
            fontWeight: 700,
            letterSpacing: '0.03em',
            marginBottom: '4px',
          }}
        >
          {isCardrooms ? 'Cardroom Print & Digital Newsstand' : 'Smarter.Poker Monthly Magazine'}
        </div>
        <div style={{ fontFamily: 'var(--sd-type)', fontSize: '20px', fontWeight: 700, lineHeight: 1.18, color: '#f2f7ff', marginBottom: '4px' }}>
          {isCardrooms
            ? 'Stock Smarter.Poker Magazine In Your Poker Room Or Read The 44-Page Issue Online'
            : 'Explore The 44-Page Monthly Poker Strategy & Live Tour Edition'}
        </div>
        <p style={{ margin: 0, fontSize: '13.5px', lineHeight: 1.5, color: '#bdd0e2' }}>
          Flip Through GTO Solver Columns, Global POY Top 25 Standings, And 60-Day Series Radar Or Request Monthly Cardroom Print Copies.
        </p>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
        <Link href="/hub/magazine" className="sd-button sd-primary" style={CTA_BASE}>
          Read Latest 44-Page Issue
        </Link>
        <Link href="/hub/magazine/poker-rooms" className="sd-button" style={CTA_BASE}>
          Free Cardroom Print Bundles
        </Link>
      </div>
    </section>
  );
}
