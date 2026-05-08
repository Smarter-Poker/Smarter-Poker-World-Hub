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
import { stateCodeToName, stateCodeToSlug, US_STATES_BY_CODE } from '../../../../src/lib/home-games/locationUtils';
import SEOHead from '../../../../src/components/seo/SEOHead';

export async function getServerSideProps({ res }) {
  // 30s fresh, 5min SWR — this page changes only when a new state gets its
  // first home game or an existing one becomes inactive, so cache aggressively.
  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=300');

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabase = createClient(url, key);

  // Aggregate: count public home_game pages per state.
  // We intentionally query social_pages (not commander_home_groups) because
  // (a) it respects is_public which is what the user ultimately sees, and
  // (b) it's already indexed by page_type.
  const { data: pages, error } = await supabase
    .from('social_pages')
    .select('location_state, location_city')
    .eq('page_type', 'home_game')
    .eq('is_public', true)
    .not('location_state', 'is', null);

  if (error) {
    console.warn('[home-games/in] fetch failed:', error.message);
    return { props: { states: [], totalGames: 0 } };
  }

  const byState = new Map();
  for (const p of pages || []) {
    const code = String(p.location_state || '').toUpperCase();
    if (!US_STATES_BY_CODE[code]) continue;
    const rec = byState.get(code) || { code, count: 0, cities: new Set() };
    rec.count += 1;
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
      totalGames: (pages || []).length,
    },
  };
}

export default function HomeGamesByStateIndex({ states, totalGames }) {
  const pageTitle = 'Poker Home Games by State - Find a Home Game Near You';
  const pageDescription = totalGames > 0
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
            }),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'BreadcrumbList',
              itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://smarter.poker' },
                { '@type': 'ListItem', position: 2, name: 'Home Games', item: 'https://smarter.poker/hub/home-games' },
                { '@type': 'ListItem', position: 3, name: 'By State', item: 'https://smarter.poker/hub/home-games/in' },
              ],
            }),
          }}
        />
      </Head>

      <main className="min-h-screen bg-gradient-to-b from-[#0A0F1C] to-[#0D192E] text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-10 pb-24">
          {/* Breadcrumbs */}
          <nav aria-label="Breadcrumb" className="text-xs text-[#64748B] mb-6 flex items-center gap-2 flex-wrap">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <span>/</span>
            <Link href="/hub/home-games" className="hover:text-white transition-colors">Home Games</Link>
            <span>/</span>
            <span className="text-white">By State</span>
          </nav>

          {/* Hero */}
          <header className="mb-10">
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
              Poker Home Games <span className="text-[#C4B5FD]">by State</span>
            </h1>
            <p className="text-lg text-[#94A3B8] mt-4 max-w-2xl">
              {totalGames > 0 ? (
                <>
                  Browse <span className="text-white font-semibold">{totalGames}</span> active poker home games across{' '}
                  <span className="text-white font-semibold">{states.length}</span> US {states.length === 1 ? 'state' : 'states'}. Find a weekly game, cash or tournament, near you.
                </>
              ) : (
                <>No active home games listed yet. Be the first to host in your area.</>
              )}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/hub/home-games"
                className="inline-flex items-center px-5 py-2.5 rounded-lg bg-[#8B5CF6] hover:bg-[#7C3AED] text-white font-medium text-sm transition-colors"
              >
                Browse all home games
              </Link>
              <Link
                href="https://commander.smarter.poker/commander/register?tier=home_game&return=%2Fhub%2Fcommander%2Fhome-games%2Fcreate"
                className="inline-flex items-center px-5 py-2.5 rounded-lg border border-[#334155] hover:border-[#8B5CF6] text-white font-medium text-sm transition-colors"
              >
                Host your own →
              </Link>
            </div>
          </header>

          {/* States grid */}
          {states.length > 0 ? (
            <section aria-label="States with home games">
              <h2 className="text-sm uppercase tracking-wider text-[#94A3B8] mb-4">
                Active states ({states.length})
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
                        {s.cityCount > 1 ? <> • {s.cityCount} cities</> : null}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <section className="p-8 rounded-xl border border-dashed border-[#334155] bg-[#132240]/40 text-center">
              <p className="text-[#94A3B8]">
                No public home games have been listed yet.{' '}
                <Link href="https://commander.smarter.poker/commander/register?tier=home_game" className="text-[#C4B5FD] underline hover:text-white">
                  Be the first to host one
                </Link>
                .
              </p>
            </section>
          )}

          {/* Secondary info / SEO content */}
          <section className="mt-16 prose prose-invert prose-sm max-w-none">
            <h2 className="text-xl font-semibold text-white">About home games on Smarter.Poker</h2>
            <p className="text-[#94A3B8]">
              Smarter.Poker is the largest directory of poker home games in the United States. Every home game listed
              here is hosted by a real player who uses Club Commander to manage their game — invite codes, RSVPs,
              seat assignments, and waitlist. When you follow a home game, you get notified of every upcoming session
              in your area.
            </p>
            <p className="text-[#94A3B8]">
              If you run a home game and want to attract new players, listing is{' '}
              <Link href="/commander" className="text-[#C4B5FD] underline hover:text-white">free while in beta</Link>.
              Public pages are discoverable on Google, indexed on Smarter.Poker, and shareable via QR code.
            </p>
          </section>
        </div>
      </main>
    </>
  );
}
