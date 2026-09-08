/**
 * MY CLUBS - RETIRED 2026-09-08.
 *
 * This route used to render 1,127 lines that reimplemented, worse, a list
 * Social Pages already serves. The body is now a signpost to the surfaces
 * that actually own this data.
 * Audit: .agent/audits/2026-09-08-my-clubs-page-audit.md
 *
 * WHAT WAS HERE, AND WHY IT WENT
 *
 * 1. FOLLOWED VENUES - never worked in production, not once. The filter was
 *    ALLOWED_TYPES = ['home_game', 'club', 'charity'], but this platform
 *    emits 'poker_club' and never 'club' (pages/api/poker/venues.js:1678),
 *    so all 208 poker clubs were dropped by a typo. All four venue-follow
 *    rows that exist platform-wide rendered zero cards. The refresh path
 *    made it worse: it called /api/poker/venues?ids= (plural), a parameter
 *    that route does not parse, so the unfiltered directory came back and
 *    482 venues were assigned as "your clubs". /hub/pages -> Following
 *    reads the same page_followers rows correctly and covers tours too.
 *
 * 2. CLUB ARENA CLUBS - the Arena lobby shows the same clubs plus member
 *    counts, level, active players, and Join and Create actions.
 *
 * 3. HOME GAME GROUPS - every group is mirrored as a social page
 *    (linked_entity_type = 'home_group'), and
 *    pages/api/social/pages/index.js:259 already unions pages you own with
 *    clubs you are a member of. Verified live: that single request returns
 *    the identical five entities this page rendered.
 *
 * WHY A PAGE AND NOT A DELETE OR A REDIRECT
 *
 * The my-clubs footer world owns exactly two routes on main,
 * '/hub/my-clubs' and '/hub/my-venues'. Redirecting this one away would
 * leave e2e/global-footer-visual.spec.ts and e2e/020-hamburger.spec.ts
 * asserting a world footer on a route that no longer resolves to that
 * world, and __tests__/world-command-destinations.test.mjs (84 commands)
 * plus __tests__/world-command-menu-law.test.mjs (203 routes) both require
 * every command to resolve to a real file. Deleting the route is therefore
 * a footer-world restructure, not a file deletion, and it also has to
 * change src/config/hamburgerMenus.js. Retiring the body now removes all
 * of the broken code with none of that risk. The restructure is tracked
 * separately.
 *
 * The same audit found and fixed a second defect: delete-club.js cascaded on
 * `club_id`, which social_pages does not have, so every deleted club left its
 * page advertising itself in the public directory forever. 26 of 37 rows were
 * that. Fixed and backfilled in #1595.
 *
 * Copy note: player-facing copy on this site is Title Cased at the SOURCE and
 * en and em dashes are banned. scripts/ci/check-title-case.mjs and
 * check-ui-text.mjs enforce both in Pre-Deploy Safety Checks, which is a
 * REQUIRED status check. src/lib/world-copy-policy.mjs also title-cases at
 * runtime, so a sentence-cased string looks correct in the browser and still
 * fails the build. Author it capitalized.
 */

import SEOHead from '../../src/components/seo/SEOHead';
import Link from 'next/link';
import UniversalHeader from '../../src/components/ui/UniversalHeader';

const C = {
    bg: '#18191a',
    surface: '#242526',
    elevated: '#3a3b3c',
    text: '#e4e6eb',
    textSec: '#b0b3b8',
    textMuted: '#65676b',
    blue: '#2374e1',
    border: '#3E4042',
};

const DESTINATIONS = [
    {
        href: '/hub/social-pages?tab=managed',
        title: 'Social Pages',
        blurb: 'Every club, union and home game you own or belong to, in one list.',
        primary: true,
    },
    {
        href: '/hub/club-arena',
        title: 'Club Arena Lobby',
        blurb: 'Your clubs with member counts, level and active players. Join or create one.',
        hardNav: true,
    },
    {
        href: '/hub/pages',
        title: 'Followed Pages',
        blurb: 'The venues, tours and series you follow.',
    },
    {
        href: '/hub/home-games',
        title: 'Home Games',
        blurb: 'Find a home game near you.',
    },
];

function DestinationCard({ item }) {
    const inner = (
        <div
            style={{
                background: C.surface,
                border: `2px solid ${item.primary ? 'rgba(35, 116, 225, 0.45)' : C.border}`,
                borderRadius: 12,
                padding: 18,
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
            }}
        >
            <div style={{ fontSize: 15, fontWeight: 700, color: item.primary ? C.blue : C.text }}>
                {item.title}
            </div>
            <div style={{ fontSize: 13, color: C.textSec, lineHeight: 1.5 }}>{item.blurb}</div>
        </div>
    );

    // Club Arena is a separately hosted SPA reached through a rewrite, so it
    // needs a full document load rather than a client-side transition.
    if (item.hardNav) {
        return (
            <a href={item.href} style={{ textDecoration: 'none' }}>
                {inner}
            </a>
        );
    }

    return (
        <Link href={item.href} style={{ textDecoration: 'none' }}>
            {inner}
        </Link>
    );
}

export default function MyClubsRetired() {
    return (
        <>
            <SEOHead
                title="My Clubs | Smarter.Poker"
                description="Your clubs, unions and home games now live on Social Pages and in the Club Arena lobby."
                path="/hub/my-clubs"
            />

            <div
                style={{
                    minHeight: '100vh',
                    paddingBottom: 70,
                    width: '100%',
                    maxWidth: '100vw',
                    overflowX: 'hidden',
                    boxSizing: 'border-box',
                    background: C.bg,
                    color: C.text,
                    fontFamily:
                        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, sans-serif',
                }}
            >
                <UniversalHeader pageDepth={1} />

                <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 16px 80px' }}>
                    <div
                        style={{
                            background: C.surface,
                            border: `2px solid ${C.border}`,
                            borderRadius: 12,
                            padding: 20,
                            marginBottom: 16,
                        }}
                    >
                        <h1 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: '0 0 8px' }}>
                            This Page Moved
                        </h1>
                        <div style={{ fontSize: 14, color: C.textSec, lineHeight: 1.6 }}>
                            Your Clubs, Unions And Home Games Are All On Social Pages Now, Under
                            The Managed Tab. Nothing Was Lost. Pick A Destination Below.
                        </div>
                    </div>

                    <nav
                        aria-label="Where your clubs live now"
                        style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
                    >
                        {DESTINATIONS.map((item) => (
                            <DestinationCard key={item.href} item={item} />
                        ))}
                    </nav>
                </div>
            </div>
        </>
    );
}
