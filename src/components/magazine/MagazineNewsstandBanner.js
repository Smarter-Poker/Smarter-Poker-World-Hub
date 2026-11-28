import Link from 'next/link';
import useSWR from 'swr';

// #SMARTERDESIGN (Dan, 2026-11-27): one steel rim (`sd-panel`), the eyebrow as
// ice-blue lettering, a white condensed title, silver body copy, and the two
// links as chrome `sd-button`s with the primary lit cobalt.
//
// THE COVER (Dan, 2026-11-27): "THE 'EXPLORE SMARTER.POKER MAGAZINE' SHOULD HAVE
// AN IMAGE OF THE MAGAZINE COVER INSIDE OF IT". The latest published issue's
// cover is drawn as a small magazine: the issue's cover photograph, the
// Smarter.Poker masthead wordmark, the issue line and the cover headline, read
// from the public magazine API. The whole cover is a link to the issue
// (whole-artwork clickability). With no issue yet it shows the masthead on the
// steel cover alone, never a broken image.
const CTA_BASE = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '44px',
  padding: '6px 16px',
  fontSize: '15px',
  textDecoration: 'none',
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function issueLine(issue) {
  if (!issue) return 'Monthly Edition';
  const m = /^(\d{4})-(\d{2})$/.exec(String(issue.issue_period || ''));
  const month = m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : '';
  const number = issue.issue_number ? `Issue #${issue.issue_number}` : '';
  return [number, month].filter(Boolean).join(' · ') || 'Monthly Edition';
}

const fetchIssues = (url) => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);

function MagazineCover({ issue }) {
  const photo = typeof issue?.cover_image_url === 'string' && issue.cover_image_url.startsWith('https://') ? issue.cover_image_url : '';
  const headline = typeof issue?.cover_headline === 'string' ? issue.cover_headline : '';
  return (
    <Link href="/hub/magazine" className="spm-mini-cover" aria-label={`Open Smarter.Poker Magazine ${issueLine(issue)}`}>
      {photo ? <img className="spm-mini-cover__photo" src={photo} alt="" loading="lazy" decoding="async" /> : null}
      <span className="spm-mini-cover__shade" aria-hidden="true" />
      <img className="spm-mini-cover__mast" src="/images/magazine/smarter-poker-wordmark.webp" alt="" width="1179" height="177" />
      <span className="spm-mini-cover__issue">{issueLine(issue)}</span>
      {headline ? <span className="spm-mini-cover__headline">{headline}</span> : null}
      <style jsx global>{`
        .spm-mini-cover {
          position: relative;
          display: block;
          flex: none;
          width: clamp(96px, 26vw, 132px);
          aspect-ratio: 3 / 4;
          overflow: hidden;
          border: 3px solid transparent;
          border-image: url('/images/smarterdesign/chrome-row.webp') 13 / 4px stretch;
          background: linear-gradient(160deg, #1d3550, #071322 70%);
          box-shadow: 0 6px 16px rgba(0, 0, 0, 0.55);
          text-decoration: none;
          cursor: pointer;
          touch-action: manipulation;
        }
        .spm-mini-cover:active {
          filter: brightness(0.9);
        }
        .spm-mini-cover:focus-visible {
          outline: 2px solid #9ee3ff;
          outline-offset: 2px;
        }
        .spm-mini-cover__photo {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: 50% 55%;
        }
        .spm-mini-cover__shade {
          position: absolute;
          inset: 0;
          background:
            linear-gradient(180deg, rgba(3, 9, 16, 0.86) 0%, rgba(3, 9, 16, 0.2) 30%, rgba(3, 9, 16, 0) 48%, rgba(3, 9, 16, 0.55) 68%, rgba(3, 9, 16, 0.94) 100%);
        }
        .spm-mini-cover__mast {
          position: absolute;
          top: 7%;
          left: 7%;
          width: 86%;
          height: auto;
        }
        .spm-mini-cover__issue {
          position: absolute;
          top: 21%;
          left: 7%;
          right: 7%;
          color: #f2f7ff;
          font: 700 clamp(7px, 2vw, 9px) / 1.1 var(--sd-type, 'Arial Narrow'), sans-serif;
          letter-spacing: 0.03em;
          text-align: center;
          text-shadow: 0 1px 2px #000;
        }
        .spm-mini-cover__headline {
          position: absolute;
          left: 7%;
          right: 7%;
          bottom: 6%;
          display: -webkit-box;
          overflow: hidden;
          color: #ffffff;
          font: 700 clamp(9px, 2.6vw, 12px) / 1.12 var(--sd-type, 'Arial Narrow'), sans-serif;
          text-shadow: 0 1px 3px #000;
          -webkit-line-clamp: 4;
          -webkit-box-orient: vertical;
        }
      `}</style>
    </Link>
  );
}

export default function MagazineNewsstandBanner({ variant = 'news' }) {
  const isCardrooms = variant === 'cardrooms';
  const { data } = useSWR('/api/news/magazine?list=1', fetchIssues, { revalidateOnFocus: false, revalidateOnReconnect: false });
  const issue = data?.success && Array.isArray(data.issues) ? data.issues[0] || null : null;
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
        alignItems: 'center',
        gap: '14px',
      }}
    >
      <MagazineCover issue={issue} />
      <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div>
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
          <div style={{ fontFamily: 'var(--sd-type)', fontSize: '19px', fontWeight: 700, lineHeight: 1.18, color: '#f2f7ff', marginBottom: '4px' }}>
            {isCardrooms
              ? 'Stock Smarter.Poker Magazine In Your Poker Room Or Read The 44-Page Issue Online'
              : 'Explore The 44-Page Monthly Poker Strategy & Live Tour Edition'}
          </div>
          <p style={{ margin: 0, fontSize: '13px', lineHeight: 1.45, color: '#bdd0e2' }}>
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
      </div>
    </section>
  );
}
