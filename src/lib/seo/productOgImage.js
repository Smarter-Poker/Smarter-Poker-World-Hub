/**
 * The share card for a product's pages (discoverability phase 6, 2026-09-17).
 * Pure, so the discoverability law test can import it without a router;
 * src/components/seo/SEOHead.js applies it to the current route.
 */
export const PRODUCT_OG_IMAGES = Object.freeze([
  { prefix: '/hub/commander', image: 'https://smarter.poker/images/og-club-commander.jpg' },
  {
    prefix: '/hub/personal-assistant',
    image: 'https://smarter.poker/api/og/tool-card?tool=jarvis&badge=JARVIS+AI+COACH&title=Jarvis+Personal+Poker+Assistant&subtitle=Automated+Leak+Detection+And+GTO+Study+Queue&statLabel=COACHING+ENGINE&statValue=100%25+FREE',
  },
  {
    prefix: '/hub/training',
    image: 'https://smarter.poker/api/og/tool-card?tool=training&badge=GTO+TRAINING+SUITE&title=Smarter.Poker+GTO+Training+And+Simulators&subtitle=107+Scenario+Games+And+36+Interactive+Solvers&statLabel=SOLVER+DRILLS&statValue=100%25+FREE',
  },
  {
    prefix: '/hub/trivia',
    image: 'https://smarter.poker/api/og/tool-card?tool=trivia&badge=POKER+TRIVIA+CHALLENGE&title=Smarter.Poker+Trivia+And+Brain+Training&subtitle=Survival%2C+Endless%2C+Time+Attack+And+Daily+Leaderboards&statLabel=QUESTION+BANK&statValue=10%2C000%2B+SPOTS',
  },
  {
    prefix: '/hub/bankroll-manager',
    image: 'https://smarter.poker/api/og/tool-card?tool=bankroll&badge=BANKROLL+AND+TAX+LEDGER&title=Poker+Bankroll+And+Form+W-2G+Tax+Manager&subtitle=Session+Win-Rate+Analytics%2C+Receipt+OCR+And+Schedule+C+CSV&statLabel=CLOUD+LEDGER&statValue=100%25+FREE',
  },
  {
    prefix: '/hub/poker-near-me',
    image: 'https://smarter.poker/api/og/tool-card?tool=pnm&badge=LIVE+POKER+DIRECTORY&title=Live+Poker+Near+Me+And+Cardroom+Directory&subtitle=324%2B+Verified+Poker+Rooms%2C+Daily+Tournaments+And+Waitlists&statLabel=VERIFIED+ROOMS&statValue=324%2B+VENUES',
  },
  {
    prefix: '/hub/home-games',
    image: 'https://smarter.poker/api/og/tool-card?tool=home-games&badge=HOME+POKER+DIRECTORY&title=Verified+Home+Poker+Games+Near+You&subtitle=Find+And+Host+Private+Home+Games+By+State+And+City&statLabel=HOST+TOOLS&statValue=100%25+FREE',
  },
  {
    prefix: '/hub/install',
    image: 'https://smarter.poker/api/og/tool-card?tool=install&badge=PWA+APP+INSTALL&title=Install+Smarter.Poker+On+iOS+And+Android&subtitle=Full-Screen+Web+App+With+Live+Push+Alerts+And+Offline+GTO+Packs&statLabel=APP+DOWNLOAD&statValue=100%25+FREE',
  },
]);

/** The product card for a Next.js route pathname, or undefined for the site card. */
export function productOgImage(pathname) {
  if (typeof pathname !== 'string') return undefined;
  const hit = PRODUCT_OG_IMAGES.find(
    ({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
  return hit ? hit.image : undefined;
}
