/**
 * TutorialProvider: mounted ONCE in pages/_app.js. Owns the page tutorial
 * for whatever route is showing.
 *
 * - Looks the route up in src/tutorials/index.js.
 * - Shows the three-second TutorialPrompt once per page (after the page has
 *   had 1.2s to paint), unless the tour has already been seen or the prompt
 *   already shown.
 * - Opens the PageTutorial on Start, on the hamburger menu's "Page Tutorial"
 *   row (which calls `requestPageTutorial()`, a window event, so the menu
 *   needs no context plumbing), or on `openPageTutorial()` from context.
 * - Fires TUTORIAL_WILL_OPEN_EVENT first so a page can put itself in the
 *   state the tour expects (Bankroll returns to its dashboard).
 * - `?tutorial=1` on a registered route opens the tour once, right after the
 *   page has mounted, then strips the query with a shallow replace. This is
 *   how a static guide page (Preflop Charts, /hub/preflop-charts/tutorial)
 *   hands off to the interactive tour: the link carries the query, the page
 *   itself never auto-launches anything (mobile phase 2). The replace runs
 *   BEFORE the tour opens because pages/_app.js scrolls to the top on
 *   routeChangeComplete, which would move the spotlight target.
 * - Route changes close everything and reset the timers.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import PageTutorial from './PageTutorial';
import TutorialPrompt from './TutorialPrompt';
import {
  getTutorialForPath,
  hasSeenPrompt,
  hasSeenTutorial,
  markPromptSeen,
  OPEN_TUTORIAL_EVENT,
  TUTORIAL_WILL_OPEN_EVENT,
} from '../../tutorials';

const TutorialContext = createContext({ tutorial: null, openPageTutorial: () => {}, isOpen: false });

export function usePageTutorial() {
  return useContext(TutorialContext);
}

const PROMPT_DELAY_MS = 1200;

export default function TutorialProvider({ children }) {
  const router = useRouter();
  const asPath = router ? router.asPath : '/';
  const tutorial = useMemo(() => getTutorialForPath(asPath), [asPath]);
  const [open, setOpen] = useState(false);
  const [promptVisible, setPromptVisible] = useState(false);
  const promptTimerRef = useRef(null);

  const openPageTutorial = useCallback(() => {
    if (!tutorial || typeof window === 'undefined') return;
    setPromptVisible(false);
    markPromptSeen(tutorial);
    window.dispatchEvent(new CustomEvent(TUTORIAL_WILL_OPEN_EVENT, { detail: { id: tutorial.id } }));
    // Let the page settle into the tour's expected state before measuring.
    window.setTimeout(() => setOpen(true), 60);
  }, [tutorial]);

  const closeTutorial = useCallback(() => setOpen(false), []);

  // Route change: close, reset, and schedule the prompt for the new page.
  useEffect(() => {
    setOpen(false);
    setPromptVisible(false);
    if (promptTimerRef.current) {
      window.clearTimeout(promptTimerRef.current);
      promptTimerRef.current = null;
    }
    if (!tutorial || typeof window === 'undefined') return undefined;
    if (hasSeenTutorial(tutorial) || hasSeenPrompt(tutorial)) return undefined;
    promptTimerRef.current = window.setTimeout(() => {
      promptTimerRef.current = null;
      // The hamburger drawer or another overlay on top: do not compete.
      if (document.querySelector('[data-tutorial-open="true"]')) return;
      markPromptSeen(tutorial);
      setPromptVisible(true);
    }, PROMPT_DELAY_MS);
    return () => {
      if (promptTimerRef.current) window.clearTimeout(promptTimerRef.current);
      promptTimerRef.current = null;
    };
  }, [tutorial]);

  // The hamburger menu (and anything else) asks for the tour by event.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onOpen = () => openPageTutorial();
    window.addEventListener(OPEN_TUTORIAL_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_TUTORIAL_EVENT, onOpen);
  }, [openPageTutorial]);

  // `?tutorial=1`: a deep link from a guide page. Strip the query first (the
  // app shell scrolls to the top on routeChangeComplete), then open once the
  // page has had a moment to paint. Guarded so a re-render never re-opens it.
  const queryOpenedRef = useRef(false);
  const queryTutorial = router && router.query ? router.query.tutorial : undefined;
  useEffect(() => {
    if (!router || !router.isReady || typeof window === 'undefined') return undefined;
    const wants = Array.isArray(queryTutorial) ? queryTutorial[0] : queryTutorial;
    if (wants !== '1') {
      // The query is gone (stripped below, or a plain visit): arm for next time.
      queryOpenedRef.current = false;
      return undefined;
    }
    if (!tutorial || queryOpenedRef.current) return undefined;
    queryOpenedRef.current = true;
    const rest = { ...router.query };
    delete rest.tutorial;
    const timer = window.setTimeout(() => openPageTutorial(), 450);
    try {
      void router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true });
    } catch (_) {
      // A failed replace leaves the query in place; the tour still opens.
    }
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router && router.isReady, queryTutorial, tutorial, openPageTutorial]);

  const value = useMemo(() => ({ tutorial, openPageTutorial, isOpen: open }), [tutorial, openPageTutorial, open]);

  return (
    <TutorialContext.Provider value={value}>
      {children}
      {tutorial && promptVisible && !open ? (
        <TutorialPrompt
          tutorial={tutorial}
          onStart={openPageTutorial}
          onDismiss={() => setPromptVisible(false)}
        />
      ) : null}
      {tutorial ? <PageTutorial tutorial={tutorial} open={open} onClose={closeTutorial} /> : null}
    </TutorialContext.Provider>
  );
}
