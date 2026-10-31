/**
 * World Hub SEOHead: the shared component, plus the product share card.
 *
 * DISCOVERABILITY PHASE 6 (2026-09-17). Every page shared the one site card
 * (og-card.jpg), so a Club Commander link on Facebook, X, iMessage or Slack
 * showed the generic Smarter.Poker poster and nothing said "Club Commander".
 * A page under /hub/commander now defaults to the Club Commander card unless
 * it names its own image. The default is decided here, in the one wrapper
 * every page imports, so the 37 Club Commander pages cannot drift. Poker
 * Arena's card is set in its own app (Smarter-Poker-Club-Arena src/lib/seo.ts)
 * and served from /images/og-poker-arena.jpg here.
 */
import { useRouter } from 'next/router';
import SharedSEOHead from '@smarter-poker/commander-shared/components/seo/SEOHead';
import { productOgImage } from '../../lib/seo/productOgImage';

export * from '@smarter-poker/commander-shared/components/seo/SEOHead';

export { PRODUCT_OG_IMAGES, productOgImage } from '../../lib/seo/productOgImage';

function usePathname() {
  try {
    // Pages router: the route pattern (dynamic segments unexpanded), which is
    // what the prefix match needs. Null outside a router context (tests).
    return useRouter()?.pathname;
  } catch {
    return undefined;
  }
}

import Head from 'next/head';
import { shareImageMetadata } from '../../lib/seo/shareImageMetadata.mjs';

export default function SEOHead(props) {
  const pathname = usePathname();
  const ogImage = props.ogImage || productOgImage(pathname);
  const imageMetadata = shareImageMetadata(ogImage);
  const { geoRegion, geoPlacename, geoPosition, markdownUrl, calendarUrl } = props;

  // Auto-resolve markdownUrl for known routes that serve clean .md representations
  let resolvedMarkdownUrl = markdownUrl;
  if (!resolvedMarkdownUrl && typeof pathname === 'string') {
    const cleanCanon = typeof props.canonical === 'string'
      ? (props.canonical.startsWith('http') ? props.canonical : `https://smarter.poker${props.canonical}`)
      : null;
    if (pathname.startsWith('/features/')) {
      resolvedMarkdownUrl = cleanCanon ? `${cleanCanon}.md` : `https://smarter.poker${pathname}.md`;
    } else if (pathname === '/features') {
      resolvedMarkdownUrl = 'https://smarter.poker/features.md';
    } else if (pathname.startsWith('/compare/')) {
      resolvedMarkdownUrl = cleanCanon ? `${cleanCanon}.md` : `https://smarter.poker${pathname}.md`;
    } else if (pathname === '/compare') {
      resolvedMarkdownUrl = 'https://smarter.poker/compare.md';
    } else if (pathname.startsWith('/glossary/')) {
      resolvedMarkdownUrl = cleanCanon ? `${cleanCanon}.md` : `https://smarter.poker${pathname}.md`;
    } else if (pathname === '/glossary') {
      resolvedMarkdownUrl = 'https://smarter.poker/glossary.md';
    } else if (pathname.startsWith('/learn/')) {
      resolvedMarkdownUrl = cleanCanon ? `${cleanCanon}.md` : `https://smarter.poker${pathname}.md`;
    } else if (pathname === '/learn') {
      resolvedMarkdownUrl = 'https://smarter.poker/learn.md';
    } else if (pathname === '/tools/embeds') {
      resolvedMarkdownUrl = 'https://smarter.poker/tools/embeds.md';
    } else if (pathname === '/tools/poker-odds-calculator' || pathname === '/hub/poker-tools') {
      resolvedMarkdownUrl = 'https://smarter.poker/tools/poker-odds-calculator.md';
    } else if (pathname === '/tools/icm-calculator' || pathname === '/hub/training/icm-calculator') {
      resolvedMarkdownUrl = 'https://smarter.poker/tools/icm-calculator.md';
    } else if (pathname === '/tools/preflop-ranges' || pathname === '/tools/preflop-ranges/index') {
      resolvedMarkdownUrl = 'https://smarter.poker/tools/preflop-ranges.md';
    } else if (pathname === '/about') {
      resolvedMarkdownUrl = 'https://smarter.poker/about.md';
    } else if (pathname === '/freerolls' || pathname === '/hub/freerolls') {
      resolvedMarkdownUrl = 'https://smarter.poker/freerolls.md';
    } else if (pathname === '/hub/messenger') {
      resolvedMarkdownUrl = 'https://smarter.poker/hub/messenger.md';
    } else if (pathname === '/hub/home-games') {
      resolvedMarkdownUrl = 'https://smarter.poker/hub/home-games.md';
    } else if (pathname === '/hub/poker-near-me' || pathname === '/hub/poker-near-me/lobby') {
      resolvedMarkdownUrl = 'https://smarter.poker/hub/poker-near-me.md';
    } else if (pathname === '/hub/club-arena') {
      resolvedMarkdownUrl = 'https://smarter.poker/hub/club-arena.md';
    } else if (pathname === '/hub/reels' || pathname === '/hub/social-media') {
      resolvedMarkdownUrl = 'https://smarter.poker/hub/reels.md';
    } else if (pathname === '/hub/preflop-charts') {
      resolvedMarkdownUrl = 'https://smarter.poker/hub/preflop-charts.md';
    } else if (pathname === '/hub/video-library') {
      resolvedMarkdownUrl = 'https://smarter.poker/hub/video-library.md';
    }
  }

  // Auto-resolve calendarUrl for known routes that serve clean .ics calendar feeds
  let resolvedCalendarUrl = calendarUrl;
  if (!resolvedCalendarUrl && typeof pathname === 'string') {
    if (pathname === '/freerolls' || pathname === '/hub/freerolls') {
      resolvedCalendarUrl = 'https://smarter.poker/freerolls.ics';
    }
  }

  return (
    <SharedSEOHead {...props} ogImage={ogImage}>
      {imageMetadata.type && <meta key="og-image-type" property="og:image:type" content={imageMetadata.type} />}
      {imageMetadata.width && <meta key="og-image-width" property="og:image:width" content={String(imageMetadata.width)} />}
      {imageMetadata.height && <meta key="og-image-height" property="og:image:height" content={String(imageMetadata.height)} />}
      {geoRegion && <meta key="geo-region" name="geo.region" content={geoRegion} />}
      {geoPlacename && <meta key="geo-placename" name="geo.placename" content={geoPlacename} />}
      {geoPosition && (
        <>
          <meta key="geo-position" name="geo.position" content={geoPosition} />
          <meta key="icbm" name="ICBM" content={geoPosition.replace(';', ', ')} />
        </>
      )}
      {resolvedMarkdownUrl && (
        <link
          key="alternate-markdown"
          rel="alternate"
          type="text/markdown"
          title="Markdown"
          href={resolvedMarkdownUrl}
        />
      )}
      {resolvedCalendarUrl && (
        <link
          key="alternate-calendar"
          rel="alternate"
          type="text/calendar"
          title="iCalendar Schedule"
          href={resolvedCalendarUrl}
        />
      )}
      {props.children}
    </SharedSEOHead>
  );
}

