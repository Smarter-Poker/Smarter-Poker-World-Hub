/**
 * /learn ADDRESSES AND IDENTIFIERS (AEO section 3.7, 2026-09-22).
 *
 * The constants the /learn pages render with, kept apart from
 * src/content/learn/lessons.js on purpose: that module imports the 70 KB
 * preflop range corpus, so a page component must only ever read it inside
 * getStaticProps. Anything a component needs at render time lives here.
 *
 * Plain JavaScript, no JSX and no imports, so a law can run it under node.
 */

export const LEARN_PATH = '/learn';
export const LEARN_URL = 'https://smarter.poker/learn';
export const LEARN_COLLECTION_ID = 'https://smarter.poker/learn#collection';
export const ORGANIZATION_ID = 'https://smarter.poker/#organization';
export const WEBSITE_ID = 'https://smarter.poker/#website';
export const SITE_URL = 'https://smarter.poker';

/** When the corpus was first published and last revised, ISO dates. */
export const LEARN_PUBLISHED = '2026-09-22';
export const LEARN_MODIFIED = '2026-09-22';

export function lessonPath(slug) {
  return `${LEARN_PATH}/${slug}`;
}

/** The anchor a category heading on /learn carries. */
export function categoryAnchor(category) {
  return String(category).toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

/** The route of one training game in the library. */
export function trainingGamePath(gameId) {
  return `/hub/training/play/${gameId}`;
}

/** The glossary page of one term. */
export function glossaryTermPath(slug) {
  return `/glossary/${slug}`;
}
