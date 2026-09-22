/* ═══════════════════════════════════════════════════════════════════════════
   PUBLIC FEED LISTING - what /hub/reels and /hub/lives actually hold, in HTML
   ═══════════════════════════════════════════════════════════════════════════

   AEO (2026-09-22). Measured on production as OAI-SearchBot with scripts
   stripped, /hub/reels served 105 words and /hub/lives 113, all of them from
   HubPageSummary. The feeds themselves load in the browser, so an engine that
   does not run JavaScript was told there is a feed and shown none of it.

   The rows come from getServerSideProps, read with the anonymous client
   (src/lib/seo/publicFeedData.js). When that read fails or times out the
   prop is null and this renders nothing, so the page is exactly what it was.

   Sits in the normal document flow beside HubPageSummary, below the
   full-screen app shell, in the same type and colours. It is real content,
   meant to be read, not hidden text. User titles and captions are data and
   are rendered as written.
   ═══════════════════════════════════════════════════════════════════════════ */

import Head from 'next/head';
import Link from 'next/link';
import {
  formatListingDate,
  formatListingDateTime,
  reelsItemListSchema,
  livesItemListSchema,
} from '../../lib/seo/publicFeedListing.mjs';

function JsonLd({ schema }) {
  if (!schema) return null;
  return (
    <Head>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, '\\u003c') }}
      />
    </Head>
  );
}

export function ReelsListing({ items }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <section style={styles.section} aria-labelledby="reels-listing">
      <JsonLd schema={reelsItemListSchema(items)} />
      <h2 id="reels-listing" style={styles.heading}>
        Latest Reels
      </h2>
      <ol style={styles.list}>
        {items.map((reel) => (
          <li key={reel.id} style={styles.item}>
            <Link href={reel.href} style={styles.link}>
              {reel.caption}
            </Link>
            <time dateTime={reel.createdAt} style={styles.meta}>
              {formatListingDate(reel.createdAt)}
            </time>
          </li>
        ))}
      </ol>
    </section>
  );
}

function StreamList({ id, heading, streams, timeKey }) {
  if (!streams.length) return null;
  return (
    <>
      <h3 id={id} style={styles.subheading}>
        {heading}
      </h3>
      <ol style={styles.list} aria-labelledby={id}>
        {streams.map((s) => (
          <li key={s.id || s[timeKey]} style={styles.item}>
            {s.href ? (
              <Link href={s.href} style={styles.link}>
                {s.title}
              </Link>
            ) : (
              <span style={styles.link}>{s.title}</span>
            )}
            <time dateTime={s[timeKey]} style={styles.meta}>
              {formatListingDateTime(s[timeKey])}
              {s.category ? ` · ${s.category}` : ''}
            </time>
          </li>
        ))}
      </ol>
    </>
  );
}

export function LivesListing({ listing }) {
  if (!listing) return null;
  const live = listing.live || [];
  const upcoming = listing.upcoming || [];
  const recorded = listing.recorded || [];
  if (!live.length && !upcoming.length && !recorded.length) return null;
  return (
    <section style={styles.section} aria-labelledby="lives-listing">
      <JsonLd schema={livesItemListSchema(listing)} />
      <h2 id="lives-listing" style={styles.heading}>
        Streams On Smarter Poker
      </h2>
      <StreamList id="lives-listing-live" heading="Live Now" streams={live} timeKey="startedAt" />
      <StreamList
        id="lives-listing-upcoming"
        heading="Upcoming Streams"
        streams={upcoming}
        timeKey="scheduledAt"
      />
      <StreamList
        id="lives-listing-recorded"
        heading="Recent Streams"
        streams={recorded}
        timeKey="startedAt"
      />
    </section>
  );
}

const styles = {
  section: {
    maxWidth: 1100,
    margin: '0 auto',
    padding: '8px 20px 40px',
    color: '#e6ecf5',
    fontFamily: 'var(--font-inter), -apple-system, BlinkMacSystemFont, sans-serif',
  },
  heading: {
    fontFamily: 'var(--font-orbitron), sans-serif',
    fontSize: 'clamp(16px, 2vw, 20px)',
    fontWeight: 700,
    lineHeight: 1.3,
    color: '#ffffff',
    margin: '0 0 14px',
    letterSpacing: '0.5px',
  },
  subheading: {
    fontSize: 15,
    fontWeight: 700,
    color: '#ffffff',
    margin: '18px 0 10px',
  },
  list: {
    listStyle: 'none',
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: 10,
    margin: 0,
    padding: 0,
  },
  item: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: '12px 14px',
    borderRadius: 10,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
  },
  link: {
    color: '#ffffff',
    fontSize: 14,
    lineHeight: 1.45,
    textDecoration: 'none',
    overflowWrap: 'anywhere',
  },
  meta: {
    fontSize: 12,
    color: '#8a97ab',
  },
};
