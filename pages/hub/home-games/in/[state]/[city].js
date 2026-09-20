// pages/hub/home-games/in/[state]/[city].js
//
// City-level SEO landing for /hub/home-games/in/[state]/[city]. Same
// shape as the state-level page but scoped to a single city. The slug
// match is case-insensitive and hyphen-insensitive ('las-vegas' matches
// 'Las Vegas' or 'LAS VEGAS').

import Head from 'next/head';
import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';
import {
  stateSlugToCode,
  stateCodeToName,
  stateCodeToSlug,
  citySlugToTitle,
  cityTitleToSlug,
  isGroupPubliclyVisible,
} from '../../../../../src/lib/home-games/locationUtils';
import SEOHead from '../../../../../src/components/seo/SEOHead';
import PokerNearMeFamilyNav from '../../../../../src/components/poker-near-me/PokerNearMeFamilyNav';
import { firstThatFits } from '../../../../../src/lib/seo/titleFit';
import {
  fetchAllHomeGameDirectoryRows,
  fetchHomeGameGroupsInChunks,
  homeGameDirectoryUnavailable,
} from '../../../../../src/lib/home-games/geoDirectoryServer.mjs';

// Phase 18 auto-hide window, mirrored from /api/public/home-games/discover
// and from the sibling state page (in/[state]/index.js).
const HOME_GROUP_INACTIVITY_DAYS = 45;

// A home group is publicly listable only while it is active, not private, and
// showing signs of life: engagement in the last 45 days, inside its new-group
// grace window, or covered by a host visibility override. Kept byte-identical
// to the copy in in/[state]/index.js — without it this page kept advertising
// deactivated / private / auto-hidden groups (and emitting them into the
// ItemList JSON-LD) long after every other surface stopped returning them.
// isGroupPubliclyVisible now lives in locationUtils (audit M-4) — it was
// copy-pasted byte-identically into three geo pages and MISSING from the
// sitemap, which is how the sitemap ended up advertising 404s.

export async function getServerSideProps({ params, res }) {
  const stateCode = stateSlugToCode(params?.state);
  const citySlug = String(params?.city || '').toLowerCase();
  if (!stateCode || !citySlug) return { notFound: true };

  // Redirect non-canonical state slugs first
  if (params.state.toLowerCase() !== stateCode.toLowerCase()) {
    return {
      redirect: {
        destination: `/hub/home-games/in/${stateCode.toLowerCase()}/${citySlug}`,
        permanent: true,
      },
    };
  }

  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=300');

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const unavailableProps = {
    stateCode,
    citySlug,
    cityTitle: citySlugToTitle(citySlug),
    stateName: stateCodeToName(stateCode),
    stateSlug: stateCodeToSlug(stateCode),
    games: [],
  };
  // Supabase validates its constructor arguments synchronously. Preserve the
  // same crawler-safe recovery response used for a query outage when runtime
  // credentials are missing, rather than leaking a generic framework 500.
  if (!url || !key) {
    console.warn(`[home-games/in/${stateCode}/${citySlug}] Supabase configuration unavailable`);
    return homeGameDirectoryUnavailable(res, unavailableProps);
  }
  let supabase;
  try {
    supabase = createClient(url, key);
  } catch (error) {
    console.warn(`[home-games/in/${stateCode}/${citySlug}] Supabase client creation failed:`, error?.message || error);
    return homeGameDirectoryUnavailable(res, unavailableProps);
  }

  // Pull every public home_game in the state and match the city slug in JS.
  // (We can't use .ilike() cleanly because the DB stores 'Las Vegas' while the
  // URL has 'las-vegas' and Postgres doesn't know about our slug format.)
  const pageResult = await fetchAllHomeGameDirectoryRows((from, to) => supabase
    .from('social_pages')
    .select(`
      id, name, slug, description,
      location_city, location_state,
      avatar_url, cover_url, follower_count, linked_entity_id, created_at
    `)
    .eq('page_type', 'home_game')
    .eq('is_public', true)
    // social_pages.slug is nullable. A null slug produced cards and JSON-LD
    // ListItems pointing at /hub/home-games/null, which the public API 404s —
    // publishing dead URLs inside ItemList structured data. The sibling state
    // page already had this guard; the city page did not. (audit H-4)
    .not('slug', 'is', null)
    .eq('location_state', stateCode)
    .order('id', { ascending: true })
    .range(from, to));

  if (pageResult.error || !pageResult.complete) {
    console.warn(`[home-games/in/${stateCode}/${citySlug}] fetch failed:`, pageResult.error?.message || 'incomplete response');
    // Do NOT return notFound here. A transient Supabase error during a
    // Googlebot crawl would hard-404 the page and get it dropped from the
    // index. 503 + Retry-After tells the crawler to come back instead.
    // (audit M-3 — matches the behaviour of /hub/home-games/[slug].)
    return homeGameDirectoryUnavailable(res, unavailableProps);
  }
  const pages = pageResult.rows;

  const matching = (pages || []).filter(p => cityTitleToSlug(p.location_city) === citySlug);
  if (matching.length === 0) return { notFound: true };

  // Enrich with group data. is_active / is_private / last_activity_at /
  // created_at / visibility_override_until drive isGroupPubliclyVisible().
  const groupIds = matching.map(p => p.linked_entity_id).filter(Boolean);
  let groupMap = {};
  if (groupIds.length > 0) {
    const groupResult = await fetchHomeGameGroupsInChunks(groupIds, (ids) => supabase
      .from('commander_home_groups')
      // PRIVACY (audit 2026-08-12, finding C-2): latitude/longitude are
      // deliberately NOT selected. They are a host's home address, they were
      // never rendered by this page, and Next.js serialises every prop into
      // __NEXT_DATA__ in the HTML, so selecting them published raw home
      // coordinates on a page built specifically to be crawled and cached.
      // Do not re-add them.
      .select('id, default_stakes, typical_buyin_min, typical_buyin_max, frequency, typical_day, member_count, is_active, is_private, last_activity_at, created_at, visibility_override_until')
      .in('id', ids));
    if (groupResult.error || !groupResult.complete) {
      console.warn(`[home-games/in/${stateCode}/${citySlug}] group fetch failed:`, groupResult.error?.message || 'incomplete response');
      return homeGameDirectoryUnavailable(res, unavailableProps);
    }
    groupMap = Object.fromEntries(groupResult.rows.map(g => [String(g.id), g]));
  }

  const games = matching
    .map(p => {
      const g = groupMap[String(p.linked_entity_id)] || null;
      // Drop pages whose group is missing, inactive, private, or auto-hidden.
      if (!isGroupPubliclyVisible(g)) return null;
      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
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
    // member_count is 0 for plenty of rows, so the tie-break branch is the
    // common path, not the rare one — guard the names the same way the state
    // page does or one null name 500s the whole city.
    .sort((a, b) => (b.member_count - a.member_count) || String(a.name || '').localeCompare(String(b.name || '')));

  // Every game in this city is hidden (inactive / private / auto-hidden) —
  // this is a real 404, not an empty listing page for Google to index.
  if (games.length === 0) return { notFound: true };

  // Canonical city title from the DB (first visible match's stored capitalization)
  const cityTitle =
    matching.find(p => String(p.id) === String(games[0].id))?.location_city
    || citySlugToTitle(citySlug);

  return {
    props: {
      stateCode,
      stateName: stateCodeToName(stateCode),
      stateSlug: stateCodeToSlug(stateCode),
      cityTitle,
      citySlug,
      games,
      directoryUnavailable: false,
    },
  };
}

function formatStakes(g) {
  if (g.default_stakes) return g.default_stakes;
  if (g.buyin_min && g.buyin_max) return `$${g.buyin_min}-$${g.buyin_max} buy-in`;
  if (g.buyin_min) return `$${g.buyin_min}+ buy-in`;
  return null;
}

function formatFrequency(g) {
  if (!g.frequency) return null;
  const freq = g.frequency.toLowerCase();
  const day = g.typical_day ? g.typical_day[0].toUpperCase() + g.typical_day.slice(1).toLowerCase() + 's' : null;
  if (freq === 'weekly' && day) return day;
  if (freq === 'monthly' && day) return `Monthly on ${day}`;
  return freq[0].toUpperCase() + freq.slice(1);
}

function GameCard({ game }) {
  const stakes = formatStakes(game);
  const freq = formatFrequency(game);
  return (
    <article className="rounded-xl bg-[#132240] border border-[#1E293B] hover:border-[#334155] transition-colors overflow-hidden">
      <Link href={`/hub/home-games/${game.slug}`} className="block">
        <div className="relative aspect-[16/9] bg-gradient-to-br from-[#1E293B] to-[#0D192E] overflow-hidden">
          {game.cover_url ? (
            <img src={game.cover_url} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-5xl opacity-20">♠</span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0A0F1C]/90 via-transparent to-transparent" />
        </div>
        <div className="p-4 space-y-2">
          <h3 className="font-semibold text-white leading-tight line-clamp-2">{game.name}</h3>
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

export default function HomeGamesByCity({
  stateCode,
  stateName,
  stateSlug,
  cityTitle,
  citySlug,
  games,
  directoryUnavailable = false,
}) {
  // AEO phase 3 (2026-09-18): this hung " - Cash Games & Tournaments" off
  // the end, which pushed Las Vegas to 80 rendered characters and Oak Lawn to
  // 79 once SEOHead adds " | Smarter.Poker". The "&" alone costs four more
  // than it shows. The subtitle is kept where it fits and dropped where it
  // does not, rather than every state losing its name to a cut.
  const pageTitle = firstThatFits([
    `Poker Home Games In ${cityTitle}, ${stateCode} - Cash Games And Tournaments`,
    `Poker Home Games In ${cityTitle}, ${stateCode}: Cash And Tournaments`,
    `Poker Home Games In ${cityTitle}, ${stateCode}`,
  ]);
  const pageDescription = directoryUnavailable
    ? `The Poker Home Games directory for ${cityTitle}, ${stateCode} is temporarily unavailable. Please try again shortly.`
    : `Browse ${games.length} active poker home game${games.length === 1 ? '' : 's'} in ${cityTitle}, ${stateName}. Find weekly cash games, tournaments, and friendly home games near you.`;

  const canonical = `https://smarter.poker/hub/home-games/in/${stateSlug}/${citySlug}`;

  return (
    <>
      <SEOHead title={pageTitle} description={pageDescription} canonical={canonical} />
      <Head>
        <script
          type="application/ld+json"
          // F119: g.name is user-authored. See [slug].js for the threat
          // model. Escape '<' -> '\u003c' so injected '</script>' can't
          // break out of this tag.
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
                // audit F-44: the note here used to claim "/hub/home-games has
                // no index route". That is FALSE — pages/hub/home-games.js
                // exists and serves it. Acting on the false premise pointed
                // every home-games breadcrumb at /near-me, which is entirely
                // client-rendered, so all internal breadcrumb equity went to a
                // page whose crawlable HTML is a spinner while the real
                // landing page received none.
                { '@type': 'ListItem', position: 2, name: 'Home Games', item: 'https://smarter.poker/hub/home-games' },
                { '@type': 'ListItem', position: 3, name: 'By State', item: 'https://smarter.poker/hub/home-games/in' },
                { '@type': 'ListItem', position: 4, name: stateName, item: `https://smarter.poker/hub/home-games/in/${stateSlug}` },
                { '@type': 'ListItem', position: 5, name: cityTitle, item: canonical },
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
          <nav aria-label="Breadcrumb" className="text-xs text-[#64748B] mb-6 flex items-center gap-2 flex-wrap">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <span>/</span>
            <Link href="/hub/home-games/near-me" className="hover:text-white transition-colors">Home Games</Link>
            <span>/</span>
            <Link href="/hub/home-games/in" className="hover:text-white transition-colors">By State</Link>
            <span>/</span>
            <Link href={`/hub/home-games/in/${stateSlug}`} className="hover:text-white transition-colors">{stateName}</Link>
            <span>/</span>
            <span className="text-white">{cityTitle}</span>
          </nav>

          <header className="mb-8">
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Poker Home Games In <span className="text-[#C4B5FD]">{cityTitle}, {stateCode}</span>
            </h1>
            <p className="text-base text-[#94A3B8] mt-3 max-w-2xl">
              {directoryUnavailable ? (
                <>The Home Game Directory Is Temporarily Unavailable. Please Try Again Shortly.</>
              ) : (
                <>
                  <span className="text-white font-semibold">{games.length}</span> active{' '}
                  {games.length === 1 ? 'game' : 'games'} In {cityTitle}. Click Any Card For Schedule, Stakes, And
                  How To Request A Seat.
                </>
              )}
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href={`https://commander.smarter.poker/commander/register?tier=home_game&return=%2Fhub%2Fcommander%2Fhome-games%2Fcreate`}
                className="inline-flex items-center px-5 py-2.5 rounded-lg bg-[#8B5CF6] hover:bg-[#7C3AED] text-white font-medium text-sm transition-colors"
              >
                Host In {cityTitle} →
              </Link>
              <Link
                href={`/hub/home-games/in/${stateSlug}`}
                className="inline-flex items-center px-5 py-2.5 rounded-lg border border-[#334155] hover:border-[#8B5CF6] text-white font-medium text-sm transition-colors"
              >
                All {stateName} Games
              </Link>
            </div>
          </header>

          <section aria-label="Home games" role={directoryUnavailable ? 'status' : undefined}>
            {directoryUnavailable ? (
              <div className="p-8 rounded-xl border border-dashed border-[#334155] bg-[#132240]/40 text-center">
                <h2 className="text-white font-semibold">Directory Data Could Not Be Verified</h2>
                <p className="text-[#94A3B8] mt-2">No Listings Have Been Removed. Please Retry In A Moment.</p>
                <Link href={canonical.replace('https://smarter.poker', '')} className="inline-flex mt-4 text-[#C4B5FD] underline hover:text-white">
                  Retry {cityTitle}
                </Link>
              </div>
            ) : (
              <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {games.map(g => (
                  <li key={g.id}>
                    <GameCard game={g} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    </>
  );
}
