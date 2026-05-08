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
    .eq('location_state', code);

  if (error) {
    console.warn(`[home-games/in/${code}] fetch failed:`, error.message);
    return { props: { stateCode: code, stateName: stateCodeToName(code), games: [], cities: [] } };
  }

  // Fetch matching groups for the enrichment (stakes, frequency, etc.)
  const groupIds = (pages || []).map(p => p.linked_entity_id).filter(Boolean);
  let groupMap = {};
  if (groupIds.length > 0) {
    const { data: groups } = await supabase
      .from('commander_home_groups')
      .select('id, default_stakes, typical_buyin_min, typical_buyin_max, frequency, typical_day, member_count, latitude, longitude')
      .in('id', groupIds);
    groupMap = Object.fromEntries((groups || []).map(g => [String(g.id), g]));
  }

  const games = (pages || [])
    .map(p => {
      const g = groupMap[String(p.linked_entity_id)] || {};
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
        latitude: g.latitude ? Number(g.latitude) : null,
        longitude: g.longitude ? Number(g.longitude) : null,
      };
    })
    .sort((a, b) => (b.member_count - a.member_count) || a.name.localeCompare(b.name));

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

  return {
    props: {
      stateCode: code,
      stateName: stateCodeToName(code),
      stateSlug: stateCodeToSlug(code),
      games,
      cities,
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

        {/* Body */}
        <div className="p-4 space-y-2">
          <h3 className="font-semibold text-white leading-tight line-clamp-2">{game.name}</h3>
          <div className="flex items-center gap-2 text-xs text-[#94A3B8]">
            {game.city && (
              <Link
                href={`/hub/home-games/in/${stateSlug}/${cityTitleToSlug(game.city)}`}
                className="hover:text-[#C4B5FD] underline decoration-dotted"
                onClick={(e) => e.stopPropagation()}
              >
                {game.city}
              </Link>
            )}
          </div>
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
        </div>
      </Link>
    </article>
  );
}

export default function HomeGamesByState({ stateCode, stateName, stateSlug, games, cities }) {
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
                { '@type': 'ListItem', position: 2, name: 'Home Games', item: 'https://smarter.poker/hub/home-games' },
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
            <Link href="/hub/home-games" className="hover:text-white transition-colors">Home Games</Link>
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

              {/* Neighboring states teaser: pick a handful alphabetically close */}
              <div className="rounded-xl bg-[#132240]/60 border border-[#1E293B] p-4">
                <h2 className="text-xs uppercase tracking-wider text-[#94A3B8] mb-3">Other states</h2>
                <ul className="space-y-1.5 text-sm">
                  {Object.entries(US_STATES_BY_CODE || {})
                    .filter(([c]) => c !== stateCode)
                    .slice(0, 8)
                    .map(([code, name]) => (
                      <li key={code}>
                        <Link
                          href={`/hub/home-games/in/${code.toLowerCase()}`}
                          className="block py-1 hover:text-[#C4B5FD] transition-colors"
                        >
                          {name}
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
