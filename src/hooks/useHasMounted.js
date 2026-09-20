import { useEffect, useState } from 'react';

/**
 * TRUE ONLY IN A BROWSER, AND ONLY AFTER HYDRATION (AEO phase 3, 2026-09-19).
 *
 * Measured on production across all 1,191 sitemap routes, 259 pages served
 * a spinner and its words to a crawler that does not run JavaScript:
 *
 *     225  "Loading Series Details..."
 *      28  "Loading Tour Details..."
 *       1  "Loading World Hub..."   and five more, one page each
 *
 * On the series and tour pages that sentence now sits directly underneath a
 * schedule the server rendered, so the page says two opposite things in the
 * same document: here is the schedule, and the schedule is still loading.
 * The second one is the one written in the present tense.
 *
 * A spinner is a promise to someone who is waiting. Nothing is waiting on
 * the server: the fetch it describes has not started and will not start
 * until a browser runs the page. Gating on this hook keeps the spinner for
 * the reader who is actually waiting and keeps it out of the document.
 *
 * The state flips in an effect rather than during render, so hydration
 * matches the server exactly and React never has to reconcile a difference.
 */
export default function useHasMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  return mounted;
}
