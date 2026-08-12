// pages/hub/home-games/in/[state]/index.js
//
// State-level SEO landing for /hub/home-games/in/[state].
// Accepts either a 2-letter code ('nv') or the full name ('nevada') and
// 308-redirects the latter to the canonical 2-letter URL.
//
// Content:
//   - Title + meta description scoped to the state
//   - ItemList JSON-LD of every public home game in the state
//   - Card grid of games, ordered by member_count DESC then name ASC
//   - Side list of cities with their own drill-down links
//   - Breadcrumbs + neighbor-state suggestions for internal linking

import Head from 'next/head';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import {
  stateSlugToCode,
  stateCodeToName,
  stateCodeToSlug,
  cityTitleToSlug,
  US_STATES_BY_CODE,
} from '../../../../../src/lib/home-games/locationUtils';
import SEOHead from '../../../../../src/components/seo/SEOHead';

// Phase 18 auto-hide window, mirrored from /api/public/home-games/discover.
const HOME_GROUP_INACTIVITY_DAYS = 45;

// A home group is publicly listable only while it is active, not private, and
// showing signs of life: engagement in the last 45 days, inside its new-group
// grace window, or covered by a host visibility override. Without this the SEO
// surfaces kept advertising dead/deactivated/private groups (and emitting them
// in ItemList JSON-LD) long after discover.js stopped returning them.
function isGroupPubliclyVisible(g) {
  if (!g || !g.id) return false;
  if (g.is_active === false) return false;
  if (g.is_private === true) return false;

  const now = Date.now();
  const cutoff = now - HOME_GROUP_INACTIVITY_DAYS * 24 * 60 * 60 * 1000;
  const ts = (v) => {
    if (!v) return null;
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
  };

  const lastActivity = ts(g.last_activity_at);
  if (lastActivity != null && lastActivity >= cutoff) return true;
  const created = ts(g.created_at);
  if (created != null && created >= cutoff) return true;
  const override = ts(g.visibility_override_until);
  if (override != null && override > now) return true;
  return false;
}

// Land-border adjacency (plus the closest mainland states for AK/HI, which
// have none). Used for the "Nearby states" internal-linking block — the old
// code sliced the first eight entries of US_STATES_BY_CODE, so every state
// page in the country linked to the same alphabetical head (Alabama, Alaska,
// Arizona, ...) regardless of where the reader actually was.
const NEIGHBOR_STATES = {
  AL: ['FL', 'GA', 'TN', 'MS'],
  AK: ['WA', 'OR', 'CA', 'HI'],
  AZ: ['CA', 'NV', 'UT', 'CO', 'NM'],
  AR: ['MO', 'TN', 'MS', 'LA', 'TX', 'OK'],
  CA: ['OR', 'NV', 'AZ'],
  CO: ['WY', 'NE', 'KS', 'OK', 'NM', 'UT'],
  CT: ['NY', 'MA', 'RI'],
  DE: ['MD', 'PA', 'NJ'],
  DC: ['MD', 'VA'],
  FL: ['GA', 'AL'],
  GA: ['FL', 'AL', 'TN', 'NC', 'SC'],
  HI: ['CA', 'WA', 'NV', 'AZ'],
  ID: ['WA', 'OR', 'NV', 'UT', 'WY', 'MT'],
  IL: ['WI', 'IA', 'MO', 'KY', 'IN'],
  IN: ['IL', 'KY', 'OH', 'MI'],
  IA: ['MN', 'WI', 'IL', 'MO', 'NE', 'SD'],
  KS: ['NE', 'MO', 'OK', 'CO'],
  KY: ['IN', 'OH', 'WV', 'VA', 'TN', 'MO', 'IL'],
  LA: ['TX', 'AR', 'MS'],
  ME: ['NH', 'MA', 'VT'],
  MD: ['DE', 'PA', 'WV', 'VA', 'DC'],
  MA: ['RI', 'CT', 'NY', 'NH', 'VT'],
  MI: ['WI', 'IN', 'OH'],
  MN: ['WI', 'IA', 'SD', 'ND'],
  MS: ['LA', 'AR', 'TN', 'AL'],
  MO: ['IA', 'IL', 'KY', 'TN', 'AR', 'OK', 'KS', 'NE'],
  MT: ['ID', 'WY', 'SD', 'ND'],
  NE: ['SD', 'IA', 'MO', 'KS', 'CO', 'WY'],
  NV: ['CA', 'OR', 'ID', 'UT', 'AZ'],
  NH: ['ME', 'MA', 'VT'],
  NJ: ['NY', 'PA', 'DE'],
  NM: ['AZ', 'UT', 'CO', 'OK', 'TX'],
  NY: ['NJ', 'PA', 'CT', 'MA', 'VT'],
  NC: ['VA', 'TN', 'GA', 'SC'],
  ND: ['MN', 'SD', 'MT'],
  OH: ['MI', 'IN', 'KY', 'WV', 'PA'],
  OK: ['KS', 'MO', 'AR', 'TX', 'NM', 'CO'],
  OR: ['WA', 'ID', 'NV', 'CA'],
  PA: ['NY', 'NJ', 'DE', 'MD', 'WV', 'OH'],
  RI: ['CT', 'MA'],
  SC: ['GA', 'NC'],
  SD: ['ND', 'MN', 'IA', 'NE', 'WY', 'MT'],
  TN: ['KY', 'VA', 'NC', 'GA', 'AL', 'MS', 'AR', 'MO'],
  TX: ['NM', 'OK', 'AR', 'LA'],
  UT: ['ID', 'WY', 'CO', 'NM', 'AZ', 'NV'],
  VT: ['NY', 'NH', 'MA'],
  VA: ['NC', 'TN', 'KY', 'WV', 'MD', 'DC'],
  WA: ['ID', 'OR'],
  WV: ['OH', 'PA', 'MD', 'VA', 'KY'],
  WI: ['MN', 'IA', 'IL', 'MI'],
  WY: ['MT', 'SD', 'NE', 'CO', 'UT', 'ID'],
};

// PostgREST `in.(...)` filters ride in the query string — chunk the id list.
const GROUP_ID_CHUNK = 400;

// Resolve which of `codes` actually have at least one publicly-visible home
// game, so the sidebar never links to a "Be the first to host" dead end.
async function countVisibleGamesByState(supabase, codes) {
  const counts = new Map();
  if (!codes || codes.length === 0) return counts;

  const { data: nPages, error: nErr } = await supabase
    .from('social_pages')
    .select('location_state, linked_entity_id')
    .eq('page_type', 'home_game')
    .eq('is_public', true)
    .in('location_state', codes);
  if (nErr || !nPages || nPages.length === 0) return counts;

  const groupIds = Array.from(
    new Set(nPages.map(p => p.linked_entity_id).filter(Boolean).map(String))
  );
  const groupMap = {};
  for (let i = 0; i < groupIds.length; i += GROUP_ID_CHUNK) {
    const { data: groups } = await supabase
      .from('commander_home_groups')
      .select('id, is_active, is_private, last_activity_at, created_at, visibility_override_until')
      .in('id', groupIds.slice(i, i + GROUP_ID_CHUNK));
    for (const g of groups || []) groupMap[String(g.id)] = g;
  }

  for (const p of nPages) {
    if (!isGroupPubliclyVisible(groupMap[String(p.linked_entity_id)])) continue;
    const c = String(p.location_state || '').toUpperCase();
    counts.set(c, (counts.get(c) || 0) + 1);
  }
  return counts;
}

export async function getServerSideProps({ params, res }) {
  const raw = params?.state;
  const code = stateSlugToCode(raw);

  // Unknown state slug -> real 404
  if (!code) return { notFound: true };

  // If the user typed 'nevada' instead of 'nv', redirect permanently
  // to the canonical short form.
  if (raw.toLowerCase() !== code.toLowerCase()) {
    return {
      redirect: {
        destination: `/hub/home-games/in/${code.toLowerCase()}`,
        permanent: true,
      },
    };
  }

  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=300');

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabase = createClient(url, key);

  // Fetch public home_game social_pages + join to commander_home_groups
  // via linked_entity_id for stakes/frequency/member_count/coords.
  const { data: pages, error } = await supabase
    .from('social_pages')
    .select(`
      id,
      name,
      slug,
      description,
      location_city,
      location_state,
      avatar_url,
      cover_url,
      follower_count,
      linked_entity_id,
      created_at
    `)
    .eq('page_type', 'home_game')
    .eq('is_public', true)
    // social_pages.slug is nullable. A null slug produced cards and JSON-LD
    // ListItems pointing at /hub/home-games/null, which the public API 404s.
    .not('slug', 'is', null)
    .eq('location_state', code);

  if (error) {
    console.warn(`[home-games/in/${code}] fetch failed:`, error.message);
    // stateSlug must be present even on the failure path — the canonical URL
    // and every city link are built from it.
    return { props: { stateCode: code, stateName: stateCodeToName(code), stateSlug: stateCodeToSlug(code), games: [], cities: [], neighborStates: [] } };
  }

  // Fetch matching groups for the enrichment (stakes, frequency, etc.)
  const groupIds = (pages || []).map(p => p.linked_entity_id).filter(Boolean);
  let groupMap = {};
  if (groupIds.length > 0) {
    const { data: groups } = await supabase
      .from('commander_home_groups')
      // PRIVACY (audit 2026-08-12, finding C-2): latitude/longitude are
      // deliberately NOT selected. They are a host's home address, they were
      // never rendered by this page, and Next.js serialises every prop into
      // __NEXT_DATA__ in the HTML — so selecting them published raw home
      // coordinates on a page built specifically to be crawled and cached.
      // Do not re-add them.
      .select('id, default_stakes, typical_buyin_min, typical_buyin_max, frequency, typical_day, member_count, is_active, is_private, last_activity_at, created_at, visibility_override_until')
      .in('id', groupIds);
    groupMap = Object.fromEntries((groups || []).map(g => [String(g.id), g]));
  }

  const games = (pages || [])
    .map(p => {
      const g = groupMap[String(p.linked_entity_id)] || null;
      // Drop pages whose group is missing, inactive, private, or auto-hidden.
      if (!isGroupPubliclyVisible(g)) return null;
      // Belt-and-braces on the null-slug guard above: an empty-string slug
      // would still build a dead /hub/home-games/ link and a 404 ListItem.
      if (!p.slug) return null;
      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        city: p.location_city || '',
        description: p.description || '',
        avatar_url: p.avatar_url || null,
        cover_url: p.cover_url || null,
        follower_count: Number(p.follower_count || 0),
        member_count: Number(g.member_count || 0),
        default_stakes: g.default_stakes || null,
        buyin_min: g.typical_buyin_min || null,
        buyin_max: g.typical_buyin_max || null,
        frequency: g.frequency || null,
        typical_day: g.typical_day || null,
        // No latitude/longitude — see the privacy note on the select above.
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b.member_count - a.member_count) || String(a.name || '').localeCompare(String(b.name || '')));

  // City aggregation for the side nav
  const cityAgg = new Map();
  for (const gm of games) {
    if (!gm.city) continue;
    const rec = cityAgg.get(gm.city) || { name: gm.city, count: 0 };
    rec.count += 1;
    cityAgg.set(gm.city, rec);
  }
  const cities = Array.from(cityAgg.values())
    .map(c => ({ name: c.name, slug: cityTitleToSlug(c.name), count: c.count }))
    .sort((a, b) => (b.count - a.count) || a.name.localeCompare(b.name));

  // Neighbouring states that actually have something to show. Bounded to the
  // adjacency list (at most 8 codes), so this is a cheap pair of queries.
  const neighborCodes = (NEIGHBOR_STATES[code] || []).filter(c => US_STATES_BY_CODE[c] && c !== code);
  const neighborCounts = await countVisibleGamesByState(supabase, neighborCodes);
  const neighborStates = neighborCodes
    .filter(c => (neighborCounts.get(c) || 0) > 0)
    .map(c => ({
      code: c,
      name: stateCodeToName(c),
      slug: stateCodeToSlug(c),
      count: neighborCounts.get(c) || 0,
    }));

  return {
    props: {
      stateCode: code,
      stateName: stateCodeToName(code),
      stateSlug: stateCodeToSlug(code),
      games,
      cities,
      neighborStates,
    },
  };
}

function formatStakes(g) {
  if (g.default_stakes) return g.default_stakes;
  if (g.buyin_min && g.buyin_max) return `$${g.buyin_min}–$${g.buyin_max} buy-in`;
  if (g.buyin_min) return `$${g.buyin_min}+ buy-in`;
  return null;
}

function formatFrequency(g) {
  if (!g.frequency) return null;
  const freq = g.frequency.toLowerCase();
  const day = g.typical_day ? g.typical_day[0].toUpperCase() + g.typical_day.slice(1).toLowerCase() + 's' : null;
  if (freq === 'weekly' && day) return `${day}`;
  if (freq === 'monthly' && day) return `Monthly on ${day}`;
  return freq[0].toUpperCase() + freq.slice(1);
}

function GameCard({ game, stateSlug }) {
  const stakes = formatStakes(game);
  const freq = formatFrequency(game);

  return (
    <article className="rounded-xl bg-[#132240] border border-[#1E293B] hover:border-[#334155] transition-colors overflow-hidden">
      <Link href={`/hub/home-games/${game.slug}`} className="block">
        {/* Cover */}
        <div className="relative aspect-[16/9] bg-gradient-to-br from-[#1E293B] to-[#0D192E] overflow-hidden">
          {game.cover_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={game.cover_url} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-5xl opacity-20">♠</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0A0F1C]/90 via-transparent to-transparent" />
        </div>

        {/* Title */}
        <div className="px-4 pt-4">
          <h3 className="font-semibold text-white leading-tight line-clamp-2">{game.name}</h3>
        </div>
      </Link>

      {/* Body — kept OUTSIDE the card link. The city link is a real anchor and
          nesting it inside the card anchor is invalid HTML: the parser closes
          the outer <a> early, so the SSR markup and the hydrated DOM diverge
          and React throws a hydration error on every state page. */}
      <div className="px-4 pb-4 pt-2 space-y-2">
        <div className="flex items-center gap-2 text-xs text-[#94A3B8]">
          {game.city && (
            <Link
              href={`/hub/home-games/in/${stateSlug}/${cityTitleToSlug(game.city)}`}
              className="hover:text-[#C4B5FD] underline decoration-dotted"
            >
              {game.city}
            </Link>
          )}
        </div>
        <Link href={`/hub/home-games/${game.slug}`} className="block space-y-2">
          <div className="flex flex-wrap gap-1.5 pt-1">
            {stakes && (
              <span className="px-2 py-0.5 rounded bg-[#1E293B] text-xs text-[#C4B5FD]">{stakes}</span>
            )}
            {freq && (
              <span className="px-2 py-0.5 rounded bg-[#1E293B] text-xs text-[#94A3B8]">{freq}</span>
            )}
          </div>
          <div className="text-xs text-[#64748B] pt-1">
            {game.member_count > 0 && <>{game.member_count} member{game.member_count === 1 ? '' : 's'}</>}
            {game.member_count > 0 && game.follower_count > 0 && <> • </>}
            {game.follower_count > 0 && <>{game.follower_count} follower{game.follower_count === 1 ? '' : 's'}</>}
          </div>
        </Link>
      </div>
    </article>
  );
}

// stateCode is still supplied by getServerSideProps (canonical URL / analytics)
// but is no longer read here — the sidebar now uses the pre-resolved
// neighborStates list instead of filtering the full state map client-side.
export default function HomeGamesByState({ stateName, stateSlug, games, cities, neighborStates = [] }) {
  const pageTitle = `Poker Home Games in ${stateName} - Cash Games & Tournaments`;
  const pageDescription = games.length > 0
    ? `Browse ${games.length} active poker home game${games.length === 1 ? '' : 's'} in ${stateName}. Find weekly cash games, tournaments, and friendly home games across ${cities.length} ${cities.length === 1 ? 'city' : 'cities'}.`
    : `Be the first to host a poker home game in ${stateName}. List your game free while in beta and get discovered by local players.`;

  const canonical = `https://smarter.poker/hub/home-games/in/${stateSlug}`;

  return (
    <>
      <SEOHead title={pageTitle} description={pageDescription} canonical={canonical} />
      <Head>
        <script
          type="application/ld+json"
          // F119: g.name is user-authored. See [slug].js for threat model.
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'ItemList',
              name: pageTitle,
              description: pageDescription,
              url: canonical,
              numberOfItems: games.length,
              itemListElement: games.slice(0, 50).map((g, i) => ({
                '@type': 'ListItem',
                position: i + 1,
                url: `https://smarter.poker/hub/home-games/${g.slug}`,
                name: g.name,
              })),
            }).replace(/</g, '\\u003c'),
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
                // /hub/home-games has no index route — near-me is the real
                // Home Games landing surface.
                { '@type': 'ListItem', position: 2, name: 'Home Games', item: 'https://smarter.poker/hub/home-games/near-me' },
                { '@type': 'ListItem', position: 3, name: 'By State', item: 'https://smarter.poker/hub/home-games/in' },
                { '@type': 'ListItem', position: 4, name: stateName, item: canonical },
              ],
            }),
          }}
        />
      </Head>

      <main className="min-h-screen bg-gradient-to-b from-[#0A0F1C] to-[#0D192E] text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-10 pb-24">
          {/* Breadcrumbs */}
          <nav aria-label="Breadcrumb" className="text-xs text-[#64748B] mb-6 flex items-center gap-2 flex-wrap">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <span>/</span>
            <Link href="/hub/home-games/near-me" className="hover:text-white transition-colors">Home Games</Link>
            <span>/</span>
            <Link href="/hub/home-games/in" className="hover:text-white transition-colors">By State</Link>
            <span>/</span>
            <span className="text-white">{stateName}</span>
          </nav>

          {/* Hero */}
          <header className="mb-8">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Poker Home Games in <span className="text-[#C4B5FD]">{stateName}</span>
            </h1>
            <p className="text-base text-[#94A3B8] mt-3 max-w-2xl">
              {games.length > 0 ? (
                <>
                  <span className="text-white font-semibold">{games.length}</span> active{' '}
                  {games.length === 1 ? 'game' : 'games'} across{' '}
                  <span className="text-white font-semibold">{cities.length}</span>{' '}
                  {cities.length === 1 ? 'city' : 'cities'}. Click any card for game details, schedule, and
                  how to request a seat.
                </>
              ) : (
                <>
                  No public home games have been listed in {stateName} yet. If you host a home game,{' '}
                  list yours now — it's free while in beta.
                </>
              )}
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href={`https://commander.smarter.poker/commander/register?tier=home_game&return=%2Fhub%2Fcommander%2Fhome-games%2Fcreate`}
                className="inline-flex items-center px-5 py-2.5 rounded-lg bg-[#8B5CF6] hover:bg-[#7C3AED] text-white font-medium text-sm transition-colors"
              >
                Host in {stateName} →
              </Link>
            </div>
          </header>

          <div className="grid lg:grid-cols-[1fr_280px] gap-8">
            {/* Games grid */}
            <section aria-label="Home games">
              {games.length > 0 ? (
                <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {games.map(g => (
                    <li key={g.id}>
                      <GameCard game={g} stateSlug={stateSlug} />
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-8 rounded-xl border border-dashed border-[#334155] bg-[#132240]/40 text-center">
                  <p className="text-[#94A3B8]">
                    Be the first to host a poker home game in {stateName}.
                  </p>
                </div>
              )}
            </section>

            {/* Side nav */}
            <aside aria-label="Cities in state" className="space-y-6">
              {cities.length > 0 && (
                <div className="rounded-xl bg-[#132240]/60 border border-[#1E293B] p-4">
                  <h2 className="text-xs uppercase tracking-wider text-[#94A3B8] mb-3">
                    Cities in {stateName}
                  </h2>
                  <ul className="space-y-1.5 text-sm">
                    {cities.map(c => (
                      <li key={c.slug}>
                        <Link
                          href={`/hub/home-games/in/${stateSlug}/${c.slug}`}
                          className="flex items-baseline justify-between py-1 hover:text-[#C4B5FD] transition-colors"
                        >
                          <span>{c.name}</span>
                          <span className="text-xs text-[#64748B]">{c.count}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Neighbouring states that genuinely have listings — resolved in
                  getServerSideProps from the adjacency map, so the internal
                  links point at pages with content instead of the same
                  alphabetical head on every state page. */}
              <div className="rounded-xl bg-[#132240]/60 border border-[#1E293B] p-4">
                <h2 className="text-xs uppercase tracking-wider text-[#94A3B8] mb-3">
                  {neighborStates.length > 0 ? 'Nearby states' : 'Other states'}
                </h2>
                <ul className="space-y-1.5 text-sm">
                  {neighborStates.map(n => (
                    <li key={n.code}>
                      <Link
                        href={`/hub/home-games/in/${n.slug}`}
                        className="flex items-baseline justify-between py-1 hover:text-[#C4B5FD] transition-colors"
                      >
                        <span>{n.name}</span>
                        <span className="text-xs text-[#64748B]">{n.count}</span>
                      </Link>
                    </li>
                  ))}
                  <li>
                    <Link
                      href="/hub/home-games/in"
                      className="block py-1 text-[#C4B5FD] hover:text-white transition-colors"
                    >
                      View all states →
                    </Link>
                  </li>
                </ul>
              </div>
            </aside>
          </div>
        </div>
      </main>
    </>
  );
}
