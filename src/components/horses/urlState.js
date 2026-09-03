/**
 * URL state for the /horses console - the pure half.
 *
 * The tab and the Club Arena section are mirrored into ?tab= and ?section= so
 * the Ledger can be bookmarked and Back undoes a "Needs Attention" jump. The
 * reading and the writing are both decisions about two plain objects (the
 * router query and the component's state), so they live here as pure functions
 * and are unit tested without React, Next or a DOM.
 *
 * THE ORDERING BUG THIS EXISTS TO PREVENT. The page has no getServerSideProps,
 * so it is statically optimised and `router.isReady` is false on the first
 * client render. When it flips true, React flushes the read effect and the
 * write effect in the SAME commit, in declaration order. The read effect's
 * setActiveTab does not update `activeTab` for the write effect running
 * immediately after it - so the write effect saw the INITIAL tab, decided the
 * URL disagreed, and replaced ?tab=mint with ?tab=stable. A deep link was
 * destroyed by the very effect meant to preserve it.
 *
 * The fix is a hydration latch rather than more comparisons: the read effect
 * seeds state from the query and marks the console hydrated in a ref (a ref,
 * not state, because it must be visible to the write effect inside the same
 * commit). The write effect returns early until that latch is set. From then
 * on the two effects can only disagree because the operator moved, which is
 * exactly when the URL should be written.
 */
import {
  DEFAULT_CA_SECTION,
  resolveSectionFromQuery,
  resolveTabFromQuery,
// Explicit extension: this module is unit tested by a plain `node --test`
// with no bundler and no node_modules, and Node's ESM resolver does not guess
// extensions. Webpack resolves it either way.
} from './tabRegistry.js';

/**
 * The tab a URL asks for, validated against the registry.
 *
 * A stale bookmark, a hand-edited query string or a renamed tab must land on
 * the default rather than on a blank panel. Arrays (?tab=a&tab=b) take the
 * first value, which is what Next's router hands over.
 */
export function resolveInitialTab(query = {}) {
  return resolveTabFromQuery(query ? query.tab : undefined);
}

/** Same rule for ?section=. */
export function resolveInitialSection(query = {}) {
  return resolveSectionFromQuery(query ? query.section : undefined);
}

/**
 * Does the URL already say what state says?
 *
 * Compared through the resolvers, never as raw strings: `/horses` with no
 * query and `/horses?tab=stable` are the same view, and a write for that
 * difference alone would fight the read effect on every render.
 */
export function urlMatchesState(state = {}, query = {}) {
  return resolveInitialTab(query) === state.activeTab
    && resolveInitialSection(query) === state.caSection;
}

/**
 * The query object to write for a given state, preserving anything else that
 * was in the URL.
 *
 * ?section= only means something on the Club Arena tab, and only when it is
 * not the default - a stale section parameter hanging off every other tab is
 * noise in a shared link.
 */
export function nextUrlQuery(state = {}, query = {}) {
  const next = { ...(query || {}), tab: state.activeTab };
  if (state.activeTab === 'clubarena' && state.caSection && state.caSection !== DEFAULT_CA_SECTION) {
    next.section = state.caSection;
  } else {
    delete next.section;
  }
  return next;
}
