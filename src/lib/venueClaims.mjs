/**
 * The room counts a SYNCHRONOUS renderer states.
 *
 * The AI corpus (src/lib/seo/markdownIngestion.mjs, the .md routes, the
 * llms-*.txt routes behind /api/ai/corpus) is hundreds of plain synchronous
 * render functions and catalog objects, and several modules it reads (content
 * guides, page summaries) are also rendered by React pages and bundled for the
 * browser, where no database read is possible. So those renderers neither take
 * the stats as an argument nor import the server module: they call
 * currentVenueStats() at render time.
 *
 * Outside a scope that is always the snapshot, so a React page renders the
 * same text on the server and in the browser (no hydration mismatch), exactly
 * as before. A route that serves the corpus opens a scope with the read it
 * just made:
 *
 *   const md = await renderWithLiveVenueStats(() => renderPokerNearMeMarkdown());
 *
 * (src/lib/server/venueStats.mjs), which awaits getVenueStats() (live, or the
 * snapshot when the database cannot answer) and runs the render inside
 * withVenueStats(stats, render). The scope is synchronous: it is open only
 * while `render` runs, so concurrent requests cannot see each other's read,
 * and an async render is refused because the scope would close under it.
 *
 * Nothing here computes a count; it only chooses which whole read answers.
 * __tests__/the-ai-corpus-room-count-is-live.law.test.mjs pins this.
 */
import { SNAPSHOT_VENUE_STATS, listedVenueLabel } from './venueCount.mjs';

let scoped = null;

function isStats(s) {
  return Boolean(
    s
      && typeof s === 'object'
      && Number.isInteger(s.listed)
      && s.listed > 0
      && typeof s.label === 'string'
      && s.byState
      && s.gameLabels,
  );
}

/**
 * Run `render` with `stats` as the current read and return its result.
 * Anything that is not a whole stats object leaves the snapshot in place.
 */
export function withVenueStats(stats, render) {
  const prev = scoped;
  scoped = isStats(stats) ? stats : null;
  try {
    const out = render();
    if (out && typeof out.then === 'function') {
      throw new Error('withVenueStats: render must be synchronous (the scope closes when it returns)');
    }
    return out;
  } finally {
    scoped = prev;
  }
}

/** The stats a render should state right now. Never null. */
export function currentVenueStats() {
  return scoped || SNAPSHOT_VENUE_STATS;
}

/** "470+" style label for the listed-room total. */
export function currentRoomLabel() {
  return currentVenueStats().label;
}

/** US states with at least one listed room. */
export function currentStateCount() {
  return currentVenueStats().stateCount;
}

/** "12 Listed Rooms" for one state, from the current read. */
export function currentStateRoomLabel(stateCode) {
  return listedVenueLabel(stateCode, currentVenueStats().byState);
}

/** Rooms-by-game directory slug -> listed-room floor label, from the current read. */
export function currentFloorByGameSlug() {
  const g = currentVenueStats().gameLabels;
  return {
    'no-limit-holdem': g.nlh,
    'pot-limit-omaha': g.plo,
    'mixed-games-and-horse': g.mixed,
  };
}
