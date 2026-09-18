// pages/hub/home-games/in/index.js
//
// SEO index page listing every US state that currently has at least one
// active public home game. Renders as a simple A-to-Z directory with
// game counts and a CTA to host your own.
//
// Entry points:
//   - Organic search ("poker home games usa", "home poker games by state")
//   - Sitemap (see pages/sitemap.xml.js)
//   - Breadcrumb link from /hub/home-games/in/[state] pages

import Head from 'next/head';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import { stateCodeToName, stateCodeToSlug, US_STATES_BY_CODE,
  isGroupPubliclyVisible,
} from '../../../../src/lib/home-games/locationUtils';
import SEOHead from '../../../../src/components/seo/SEOHead';
import PokerNearMeFamilyNav from '../../../../src/components/poker-near-me/PokerNearMeFamilyNav';
import {
  fetchAllHomeGameDirectoryRows,
  fetchHomeGameGroupsInChunks,
  homeGameDirectoryUnavailable,
} from '../../../../src/lib/home-games/geoDirectoryServer.mjs';

// Phase 18 auto-hide window, mirrored from /api/public/home-games/discover
// and from in/[state]/index.js.
const HOME_GROUP_INACTIVITY_DAYS = 45;

// A home group is publicly listable only while it is active, not private, and
// showing signs of life. Kept byte-identical to the copy in
// in/[state]/index.js and in/[state]/[city].js — the state and city pages
// already filter on this, so counting raw social_pages rows here advertised
// totals that no drill-down page could ever show.
// isGroupPubliclyVisible now lives in locationUtils (audit M-4) — it was
// copy-pasted byte-identically into three geo pages and MISSING from the
// sitemap, which is how the sitemap ended up advertising 404s.

export async function getServerSideProps({ res }) {
  // 30s fresh, 5min SWR — this page changes only when a new state gets its
  // first home game or an existing one becomes inactive, so cache aggressively.
  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=300');

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const unavailableProps = { states: [], totalGames: 0 };
  if (!url || !key) {
    console.warn('[home-games/in] Supabase configuration unavailable');
    return homeGameDirectoryUnavailable(res, unavailableProps);
  }

  let supabase;
  try {
    supabase = createClient(url, key);
  } catch (error) {
    console.warn('[home-games/in] Supabase client creation failed:', error?.message || error);
    return homeGameDirectoryUnavailable(res, unavailableProps);
  }

  // Aggregate: count public home_game pages per state.
  // We intentionally query social_pages (not commander_home_groups) because
  // (a) it respects is_public which is what the user ultimately sees, and
  // (b) it's already indexed by page_type.
  const pageResult = await fetchAllHomeGameDirectoryRows((from, to) => supabase
    .from('social_pages')
    .select('id, location_state, location_city, linked_entity_id')
    .eq('page_type', 'home_game')
    .eq('is_public', true)
    .not('location_state', 'is', null)
    .order('id', { ascending: true })
    .range(from, to));

  if (pageResult.error || !pageResult.complete) {
    console.warn('[home-games/in] fetch failed:', pageResult.error?.message || 'incomplete response');
    return homeGameDirectoryUnavailable(res, unavailableProps);
  }
  const pages = pageResult.rows;

  // Resolve the linked groups so the same visibility rule the state and city
  // pages apply is applied here too. Without this a state whose groups are all
  // auto-hidden still advertised a game count that its own page showed as zero.
  const groupIds = pages.map(p => p.linked_entity_id).filter(Boolean);
  const groupResult = await fetchHomeGameGroupsInChunks(groupIds, (ids) => supabase
      .from('commander_home_groups')
      .select('id, is_active, is_private, last_activity_at, created_at, visibility_override_until')
      .in('id', ids));
  if (groupResult.error || !groupResult.complete) {
    console.warn('[home-games/in] group fetch failed:', groupResult.error?.message || 'incomplete response');
    return homeGameDirectoryUnavailable(res, unavailableProps);
  }
  const groupMap = Object.fromEntries(groupResult.rows.map(g => [String(g.id), g]));

  const byState = new Map();
  let visibleTotal = 0;
  for (const p of pages || []) {
    const code = String(p.location_state || '').toUpperCase();
    if (!US_STATES_BY_CODE[code]) continue;
    if (!isGroupPubliclyVisible(groupMap[String(p.linked_entity_id)])) continue;
    const rec = byState.get(code) || { code, count: 0, cities: new Set() };
    rec.count += 1;
    visibleTotal += 1;
    if (p.location_city) rec.cities.add(p.location_city);
    byState.set(code, rec);
  }

  const states = Array.from(byState.values())
    .map(r => ({
      code: r.code,
      name: stateCodeToName(r.code),
      slug: stateCodeToSlug(r.code),
      count: r.count,
      cityCount: r.cities.size,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    props: {
      states,
      // Only the games a visitor can actually reach — this is the number the
      // hero copy calls "active poker home games".
      totalGames: visibleTotal,
      directoryUnavailable: false,
    },
  };
}

export default function HomeGamesByStateIndex({ states, totalGames, directoryUnavailable = false }) {
  // 53 characters here, 69 once SEOHead appends the site name, and a search
  // result cut it at "Find a Home" (AEO phase 3, 2026-09-17).
  const pageTitle = 'Poker Home Games By State And City';
  const pageDescription = directoryUnavailable
    ? 'The Poker Home Games directory is temporarily unavailable. Please try again shortly.'
    : totalGames > 0
    ? `Browse ${totalGames} active poker home games across ${states.length} US ${states.length === 1 ? 'state' : 'states'}. Find weekly cash games, tournaments, and friendly home games in your area.`
    : 'Find poker home games across the United States. Browse by state to discover cash games, tournaments, and friendly home games near you.';

  return (
    <>
      <SEOHead
        title={pageTitle}
        description={pageDescription}
        canonical="https://smarter.poker/hub/home-games/in"
      />
      <Head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            // Phase 41/audit-sweep-C1: escape '<' as '\u003c' for consistency with
            // the sister pages (in/[state]/index.js, in/[state]/[city].js, [slug].js).
            // The data here is currently static (state codes from a hardcoded map), but
            // the next contributor who adds user-authored data shouldn't have to remember
            // to add the escape.
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'CollectionPage',
              name: pageTitle,
              description: pageDescription,
              url: 'https://smarter.poker/hub/home-games/in',
              hasPart: states.map(s => ({
                '@type': 'WebPage',
                name: `Poker Home Games in ${s.name}`,
                url: `https://smarter.poker/hub/home-games/in/${s.slug}`,
              })),
            }).replace(/</g, '\\u003c'),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            // Phase 41/audit-sweep-C1: same defensive escape as the block above.
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'BreadcrumbList',
              itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://smarter.poker' },
                // audit F-44: the note here used to claim "/hub/home-games has
                // no index route". That is FALSE — pages/hub/home-games.js
                // exists and serves it. Acting on the false premise pointed
                // every home-games breadcrumb at /near-me, which is entirely
                // client-rendered, so all internal breadcrumb equity went to a
                // page whose crawlable HTML is a spinner while the real
                // landing page received none.
                { '@type': 'ListItem', position: 2, name: 'Home Games', item: 'https://smarter.poker/hub/home-games' },
                { '@type': 'ListItem', position: 3, name: 'By State', item: 'https://smarter.poker/hub/home-games/in' },
              ],
            }).replace(/</g, '\\u003c'),
          }}
        />
      </Head>

      <PokerNearMeFamilyNav className="pnm-family-nav--standalone" />
      <main
        className="pnm-home-geo-page min-h-screen bg-gradient-to-b from-[#0A0F1C] to-[#0D192E] text-white"
        data-pnm-realism="machined-v2"
        data-pnm-secondary-foundation="interaction-v1"
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-10 pb-24">
          {/* Breadcrumbs */}
          <nav aria-label="Breadcrumb" className="text-xs text-[#64748B] mb-6 flex items-center gap-2 flex-wrap">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <span>/</span>
            <Link href="/hub/home-games/near-me" className="hover:text-white transition-colors">Home Games</Link>
            <span>/</span>
            <span className="text-white">By State</span>
          </nav>

          {/* Hero */}
          <header className="mb-10">
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
              Poker Home Games <span className="text-[#C4B5FD]">By State</span>
            </h1>
            <p className="text-lg text-[#94A3B8] mt-4 max-w-2xl">
              {directoryUnavailable ? (
                <>The Home Game Directory Is Temporarily Unavailable. Please Try Again Shortly.</>
              ) : totalGames > 0 ? (
                <>
                  Browse <span className="text-white font-semibold">{totalGames}</span> Active Poker Home Games across{' '}
                  <span className="text-white font-semibold">{states.length}</span> US {states.length === 1 ? 'state' : 'states'}. Find A Weekly Game, Cash Or Tournament, Near You.
                </>
              ) : (
                <>No Active Home Games Listed Yet. Be The First To Host In Your Area.</>
              )}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/hub/home-games/near-me"
                className="inline-flex items-center px-5 py-2.5 rounded-lg bg-[#8B5CF6] hover:bg-[#7C3AED] text-white font-medium text-sm transition-colors"
              >
                Browse All Home Games
              </Link>
              <Link
                href="https://commander.smarter.poker/commander/register?tier=home_game&return=%2Fhub%2Fcommander%2Fhome-games%2Fcreate"
                className="inline-flex items-center px-5 py-2.5 rounded-lg border border-[#334155] hover:border-[#8B5CF6] text-white font-medium text-sm transition-colors"
              >
                Host Your Own →
              </Link>
            </div>
          </header>

          {/* States grid */}
          {states.length > 0 ? (
            <section aria-label="States with home games">
              <h2 className="text-sm uppercase tracking-wider text-[#94A3B8] mb-4">
                Active States ({states.length})
              </h2>
              <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {states.map(s => (
                  <li key={s.code}>
                    <Link
                      href={`/hub/home-games/in/${s.slug}`}
                      className="block p-4 rounded-xl bg-[#132240] hover:bg-[#1E293B] border border-[#1E293B] hover:border-[#334155] transition-all group"
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-semibold text-white group-hover:text-[#C4B5FD] transition-colors truncate">
                          {s.name}
                        </span>
                        <span className="text-xs uppercase tracking-wider text-[#64748B]">{s.code}</span>
                      </div>
                      <div className="text-xs text-[#94A3B8] mt-1">
                        {s.count} {s.count === 1 ? 'game' : 'games'}
                        {s.cityCount > 1 ? <> • {s.cityCount} Cities</> : null}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <section
              className="p-8 rounded-xl border border-dashed border-[#334155] bg-[#132240]/40 text-center"
              role={directoryUnavailable ? 'status' : undefined}
            >
              {directoryUnavailable ? (
                <>
                  <h2 className="text-white font-semibold">Directory Data Could Not Be Verified</h2>
                  <p className="text-[#94A3B8] mt-2">No Listings Have Been Removed. Please Retry In A Moment.</p>
                  <Link href="/hub/home-games/in" className="inline-flex mt-4 text-[#C4B5FD] underline hover:text-white">
                    Retry Directory
                  </Link>
                </>
              ) : (
                <p className="text-[#94A3B8]">
                  No Public Home Games Have Been Listed Yet.{' '}
                  <Link href="https://commander.smarter.poker/commander/register?tier=home_game" className="text-[#C4B5FD] underline hover:text-white">
                    Be The First To Host One
                  </Link>
                  .
                </p>
              )}
            </section>
          )}

          {/* Secondary info / SEO content */}
          <section className="mt-16 prose prose-invert prose-sm max-w-none">
            <h2 className="text-xl font-semibold text-white">About Home Games On Smarter.Poker</h2>
            <p className="text-[#94A3B8]">
              Smarter.Poker Is The Largest Directory Of Poker Home Games In The United States. Every Home Game Listed
              Here Is Hosted By A Real Player Who Uses Club Commander To Manage Their Game - Invite Codes, RSVPs,
              Seat Assignments, And Waitlist. When You Follow A Home Game, You Get Notified Of Every Upcoming Session
              In Your Area.
            </p>
            <p className="text-[#94A3B8]">
              If You Run A Home Game And Want To Attract New Players, Listing is{' '}
              <Link href="/commander" className="text-[#C4B5FD] underline hover:text-white">Free While In Beta</Link>.
              Public Pages Are Discoverable On Google, Indexed On Smarter.Poker, And Shareable Via QR Code.
            </p>
          </section>
        </div>
      </main>
    </>
  );
}
