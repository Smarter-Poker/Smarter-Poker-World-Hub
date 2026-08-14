/**
 * urls.js — THE canonical URL builder for Home Games.
 *
 * WHY THIS FILE EXISTS (audit 2026-08-14)
 * A home game is reachable through three URL families, and the fallback chain
 * between them was re-implemented inline at THIRTEEN call sites with SIX
 * different orderings. Concrete damage found in the sweep:
 *
 *   - five sites pushed a raw UUID into /hub/home-games/<slug> — a route
 *     resolved exclusively by social_pages.slug — guaranteeing a 404
 *     (my-clubs, HamburgerMenu x2, both user-profile pages, notifications);
 *   - VenueCard skipped the club_code tier entirely while the card's own
 *     container used it, so the card body and its buttons navigated to
 *     DIFFERENT pages for the same slug-less group;
 *   - two sites still read `invite_code` as a URL fallback after it was
 *     removed from public payloads (and it 404'd even before that, because
 *     /home-game/<code> resolves by club_code).
 *
 * THE CANONICAL CHAIN
 *   1. /hub/home-games/<slug>   — the SEO surface. slug comes from
 *      social_pages.slug and is the only key that route resolves.
 *   2. /home-game/<club_code>   — the share surface. club_code is a SHARE
 *      code (never invite_code, which is the membership credential).
 *   3. /hub/venues/<group-uuid> — the fallback surface. Phase 41 taught
 *      /api/poker/venues?id= to resolve group UUIDs natively, and
 *      /hub/venues/[id].js has home_game-specific rendering. A slug-less,
 *      code-less group is still reachable here — "stay put" is not a chain.
 *
 * Import this. Do not re-implement the chain inline; that is how six
 * orderings happened.
 */

/**
 * Public URL for a home-game GROUP-shaped object: a discover row, an adapter
 * output, or a commander_home_groups row. Reads (in order) slug, club_code,
 * then the group UUID.
 *
 * @param {object} g  needs some of: slug, host_social_page_slug, club_code,
 *                    id, group_id, home_group_id
 * @returns {string}  a URL that resolves, or the /hub/home-games index as a
 *                    last resort (never a known-404).
 */
export function homeGameUrl(g) {
  if (!g || typeof g !== 'object') return '/hub/home-games';
  const slug = g.slug || g.host_social_page_slug || g.home_group_slug || null;
  if (slug && typeof slug === 'string') {
    return `/hub/home-games/${encodeURIComponent(slug)}`;
  }
  const code = g.club_code || g.home_group_club_code || null;
  if (code && typeof code === 'string') {
    return `/home-game/${encodeURIComponent(code)}`;
  }
  const id = g.id || g.group_id || g.home_group_id || null;
  if (id) return `/hub/venues/${encodeURIComponent(id)}`;
  return '/hub/home-games';
}

/**
 * Public URL for a SOCIAL-PAGE-shaped object (has social_pages.id, maybe a
 * slug). A page id is NOT a group UUID — pushing it into /hub/venues/ or the
 * slug route 404s. /hub/social-pages/<id> SSR-resolves the page and redirects
 * to the slug route when one exists.
 */
export function homeGamePageUrl(p) {
  if (!p || typeof p !== 'object') return '/hub/home-games';
  if (p.slug && typeof p.slug === 'string') {
    return `/hub/home-games/${encodeURIComponent(p.slug)}`;
  }
  if (p.id) return `/hub/social-pages/${encodeURIComponent(p.id)}`;
  return '/hub/home-games';
}

export default { homeGameUrl, homeGamePageUrl };
