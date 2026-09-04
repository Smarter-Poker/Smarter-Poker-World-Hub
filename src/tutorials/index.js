/**
 * Page tutorial registry.
 *
 * Dan, 2026-09-03: all ten mobile-programme pages get a tutorial. It is
 * hidden by default inside the hamburger menu ("Page Tutorial"), and a small
 * prompt at the bottom of the page offers it once, disappearing after three
 * seconds. Everything reads from this one table:
 *
 * - `src/components/tutorial/TutorialProvider.jsx` (mounted once in
 *   pages/_app.js) looks up the current route here, renders the prompt and
 *   the walkthrough, and exposes `openPageTutorial()`.
 * - `src/components/ui/HamburgerMenu.jsx` adds the "Page Tutorial" row to
 *   its bottom links whenever `getTutorialForPath()` returns one.
 *
 * A tutorial is `{ id, title, storageKey, steps }` where each step is
 * `{ id, title, body, target }` and `target` names a `data-tutorial="..."`
 * element on the page (or null for a step with no spotlight). Copy is Title
 * Case (the popup rule). No em dashes.
 *
 * Pages are added as their phase of docs/mobile-standard/ROLLOUT-PLAN.md
 * lands, because the spotlight targets only exist once the page is rebuilt
 * on the always-displayed layout. `__tests__/page-tutorials.test.mjs` pins
 * the route list against the plan so a phase cannot ship without its tour.
 */
import { BANKROLL_TUTORIAL } from './bankroll-manager';

// Longest prefix wins. Keep re-exported aliases (preflop-charts -> memory-games)
// as their own rows so the URL the player sees maps to a tour.
const REGISTRY = [
  { prefix: '/hub/bankroll-manager', tutorial: BANKROLL_TUTORIAL },
];

export const TUTORIAL_PROMPT_MS = 3000;

export function normalisePath(asPath) {
  if (!asPath || typeof asPath !== 'string') return '/';
  const noHash = asPath.split('#')[0];
  const noQuery = noHash.split('?')[0];
  return noQuery.length > 1 && noQuery.endsWith('/') ? noQuery.slice(0, -1) : noQuery;
}

export function getTutorialForPath(asPath) {
  const path = normalisePath(asPath);
  let best = null;
  for (const row of REGISTRY) {
    if (path === row.prefix || path.startsWith(`${row.prefix}/`)) {
      if (!best || row.prefix.length > best.prefix.length) best = row;
    }
  }
  return best ? best.tutorial : null;
}

export function listTutorialRoutes() {
  return REGISTRY.map((r) => r.prefix);
}

// Storage helpers: try/catch because private mode throws, SSR-safe.
function read(key) {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch (_) {
    return null;
  }
}

function write(key, value) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch (_) {
    // Quota or private mode: the prompt simply shows again next visit.
  }
}

export function hasSeenTutorial(tutorial) {
  return !tutorial || read(tutorial.storageKey) === '1';
}

export function markTutorialSeen(tutorial) {
  if (tutorial) write(tutorial.storageKey, '1');
}

export function promptKey(tutorial) {
  return `${tutorial.storageKey}:prompt`;
}

export function hasSeenPrompt(tutorial) {
  return !tutorial || read(promptKey(tutorial)) === '1';
}

export function markPromptSeen(tutorial) {
  if (tutorial) write(promptKey(tutorial), '1');
}

export const OPEN_TUTORIAL_EVENT = 'sp:open-page-tutorial';
export const TUTORIAL_WILL_OPEN_EVENT = 'sp:page-tutorial-will-open';

/** Ask the provider to open the current page's tutorial (from anywhere). */
export function requestPageTutorial() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OPEN_TUTORIAL_EVENT));
}
