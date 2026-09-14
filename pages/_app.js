/* ═══════════════════════════════════════════════════════════════════════════
   NEXT.JS APP WRAPPER — Vanguard Silver + Anti-Gravity Auto-Boot
   Global styles, providers, and Diamond Celebration System
   
   FIX: Global navigation guard to prevent loading freeze on back button
   ═══════════════════════════════════════════════════════════════════════════ */

import '../src/lib/server-stability'; // Server-side crash prevention (dev mode only)
import '../src/lib/hmr-reconnect-guard'; // Client-side HMR death loop prevention (dev mode only)
import '../src/lib/iosHaptics'; // navigator.vibrate on iOS, where WebKit has never shipped it
import '../src/index.css';
import '../src/styles/premium.css';
import '../src/styles/global-tokens.css';
import '../src/styles/worlds/club-arena.css';
// The shared poker-table skin. Global CSS can only be imported here in Next,
// so this is what lets any of the six table implementations opt in by adding
// `ca-table` classes rather than inventing a seventh look.
import '../src/styles/club-arena-table.css';
import '../src/styles/worlds/social-hub.css';
import '../src/styles/worlds/training.css';
import '../src/styles/worlds/marketplace.css';
import '../src/styles/worlds/news.css';
import '../src/styles/worlds/video-library.css';
import '../src/styles/worlds/poker-near-me.css';
import '../src/styles/worlds/poker-near-me-lobby.css';
import '../src/styles/worlds/memory-games.css';
import '../src/styles/worlds/personal-assistant.css';
import '../src/styles/worlds/bankroll.css';
import '../src/styles/worlds/toke-tracker.css';
import '../src/styles/tutorial.css';
import '../src/styles/worlds/trivia.css';
import '../src/styles/commander-futuristic.css';
import '../styles/landing.css';
import '../styles/avatar-shimmer.css';
import '../styles/poker-near-me.css';
import '../src/styles/worlds/poker-near-me-machined.css';
import '../src/styles/worlds/poker-near-me-command-surfaces.css';
import {
  Orbitron,
  Inter,
  Plus_Jakarta_Sans,
  Space_Grotesk,
  Rajdhani,
  Roboto_Condensed,
  IBM_Plex_Mono,
} from 'next/font/google';

const orbitron = Orbitron({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-orbitron',
  display: 'swap',
  preload: true,
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
  preload: true,
});

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  variable: '--font-jakarta',
  display: 'swap',
  preload: false,
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-space-grotesk',
  display: 'swap',
  preload: false,
});

const rajdhani = Rajdhani({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-rajdhani',
  display: 'swap',
  preload: false,
});

const robotoCondensed = Roboto_Condensed({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-roboto-condensed',
  display: 'swap',
  preload: false,
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-ibm-plex-mono',
  display: 'swap',
  preload: false,
});

import dynamic from 'next/dynamic';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { SWRConfig } from 'swr';
import { swrLocalStorageProvider, SWR_DEFAULTS } from '../src/lib/swrCacheProvider';
import { swrCacheMiddleware } from '../src/lib/swrCacheMiddleware';
import { useEffect, createContext, useState, useContext } from 'react';
import { releaseMediaStreamOnLeave } from '../src/lib/mediaStreamSingleton';
import { AntiGravityProvider } from '../src/providers/AntiGravityProvider';
import { ThemeProvider } from '../src/providers/ThemeProvider';
import { UnreadProvider } from '../src/hooks/useUnreadCount';
import { SoundEngine } from '../src/audio/SoundEngine';
import { AvatarProvider, useAvatar } from '../src/contexts/AvatarContext';
import useEasterEggSweep from '../src/hooks/useEasterEggSweep';
import { ExternalLinkProvider } from '../src/components/ui/ExternalLinkModal';
import { PushProvider } from '../src/contexts/PushContext';
import { TrainingSettingsProvider } from '../src/contexts/TrainingSettingsContext';
import { ActiveIdentityProvider } from '../src/contexts/ActiveIdentityContext';
import ToastContainer from '../src/components/ui/ToastContainer';
import GlobalPageOverlay from '../src/components/ui/GlobalPageOverlay';
import { isOperatorConsoleRoute } from '../src/components/admin/operatorConsoleRoutes';
// Static on purpose: __tests__/sw-update.test.mjs requires the update prompt
// in the shell, and it is the control that tells a reader a new build is
// waiting - the earlier it can speak, the better.
import ServiceWorkerUpdater from '../src/components/ui/ServiceWorkerUpdater';
import PageErrorBoundary from '../src/components/ui/PageErrorBoundary';
import UniversalHeader from '../src/components/ui/UniversalHeader';
import WorldCopyPolicy from '../src/components/ui/WorldCopyPolicy';
import BottomNavBar, { BottomNavSpacer } from '../src/components/ui/BottomNavBar';
import OfflineBar from '../src/components/ui/OfflineBar';
import TutorialProvider from '../src/components/tutorial/TutorialProvider';
import bottomNavRoutes from '../src/config/bottom-nav-routes.json';
import {
  getFallbackFooter,
  isClubArenaOwnedRoute,
  resolveWorldFooter,
} from '../src/config/worldFooterNavigation';
import { HubErrorBoundary } from '../src/components/ui/HubErrorBoundary';
import { WorldThemeProvider } from '../src/components/WorldThemeProvider';
import { ProactiveHelp } from '../src/world/components/Geeves/ProactiveHelp';
import { useJarvis } from '../src/world/components/Jarvis/useJarvis';
import { ToastProvider } from '../src/components/club-arena/ToastProvider';
import { WORLD_COPY_SCOPE_CLASS } from '../src/lib/world-copy-policy.mjs';
import { installLastRouteRecorder } from '../src/lib/resumeRoute';
import {
  advanceScrollLockGeneration,
  sweepStaleScrollLocks,
  clearBodyScrollLockIfUnheld,
} from '../src/lib/scrollLock';

/*
 * ITEM 2 (2026-09-08): these two were STATIC imports, so every page on the site
 * paid for them in the _app chunk - 1,511 KB decoded, on a feed whose own chunk
 * is 252 KB.
 *
 * JarvisPanel is the expensive one, and not because of the panel. It imports
 * JarvisAdvancedToolbar -> CustomRangeBuilder -> RangeGradingEngine ->
 * solverRanges (71 KB), and -> TrainingProgressTracker -> useAssistant (51 KB),
 * plus postflopSolverData (65 KB) and PostflopStrategyEngine (46 KB) behind
 * them. The entire GTO solver shipped on every page of the estate, including
 * pages with no poker maths anywhere near them. It renders `null` until it is
 * opened (JarvisPanel.tsx:239).
 *
 * GlobalPiPManager drags LiveStreamService (71 KB) the same way and returns
 * `null` unless a stream is actually active (GlobalPiPManager.jsx:75).
 *
 * ssr:false because both are client-only surfaces anyway, and loading:null so
 * nothing flashes while the chunk arrives. Behaviour is unchanged - they still
 * render unconditionally, just from their own chunk instead of the shell's.
 */
/*
 * Two post-interaction prompts. Each returns null until its own condition
 * fires - an install banner, a notification ask - so neither is on the
 * first-paint path, and neither needs to be in the chunk every page of the
 * estate downloads.
 *
 * ServiceWorkerUpdater was deferred too and then put back: sw-update.test.mjs
 * requires it in the shell, and that law is right. It is the control that tells
 * a reader a new build is waiting, so it should be able to speak as early as
 * possible. ~18KB is not worth widening someone else's law for.
 *
 * WorldCopyPolicy and GlobalPageOverlay are deliberately NOT deferred:
 * WorldCopyPolicy normalizes visible copy in a useEffect on load, and
 * GlobalPageOverlay renders immediately. Deferring either would show a frame
 * of un-normalized text or an unstyled overlay.
 */
const GlobalNotificationPrompt = dynamic(
  () => import('../src/components/ui/GlobalNotificationPrompt'),
  { ssr: false, loading: () => null }
);
const PWAInstallPrompt = dynamic(() => import('../src/components/ui/PWAInstallPrompt'), {
  ssr: false,
  loading: () => null,
});
const JarvisPanel = dynamic(
  () => import('../src/world/components/Jarvis/JarvisPanel').then((m) => m.JarvisPanel),
  { ssr: false, loading: () => null }
);
const GlobalPiPManager = dynamic(() => import('../src/components/social/GlobalPiPManager'), {
  ssr: false,
  loading: () => null,
});

const WorldCommandDock = dynamic(() => import('../src/components/ui/WorldCommandDock'), {
  ssr: false,
  loading: () => null,
});

// Operator chrome is substantial and belongs only to /horses and admin routes.
// Keep its custom vector and machined-frame stylesheet out of the public shell.
const OperatorConsoleShell = dynamic(() => import('../src/components/admin/OperatorConsoleShell'));

const TRAINING_ROUTES_WITH_HEADER = new Set([
  '/hub/training',
  '/hub/training/achievements',
  '/hub/training/blind-defense',
  '/hub/training/category/[categoryId]',
  '/hub/training/challenges',
  '/hub/training/clinic/[clinicId]',
  '/hub/training/final-table-sim',
  '/hub/training/hand-lab',
  '/hub/training/jarvis',
  '/hub/training/leaderboard',
  '/hub/training/live-hud-sync',
  '/hub/training/play/[gameId]',
  '/hub/training/progress',
  '/hub/training/pvp-lobby',
  '/hub/training/streaks',
  '/hub/training/study-group',
  '/hub/training/table-wizard',
  '/hub/training/tournament-prep',
  '/hub/training/tournament/[id]',
  '/hub/training/tournaments',
]);
const TRAINING_STANDALONE_ART_IDS = new Set([
  'tournament-prep',
  'final-table-sim',
  'quiz-gauntlet',
  'hand-lab',
  'bluff-catcher',
  'mixed-strategy-lab',
  'study-group',
]);

// Hub routes that do not mount UniversalHeader (or another shared shell) in
// their page module receive the exact same approved header here. This manifest
// is deliberately regression-tested because unrelated route-shell work must
// never remove global navigation from legacy and dynamic Hub pages again.
const HUB_ROUTES_WITHOUT_SHARED_HEADER = new Set([
  '/hub/admin/autofix',
  '/hub/admin/diamond-liability',
  '/hub/commander',
  '/hub/godmode',
  '/hub/gto-trainer',
  '/hub/hand-history',
  '/hub/home-games/in',
  '/hub/home-games/in/[state]',
  '/hub/home-games/in/[state]/[city]',
  '/hub/home-games/near-me',
  '/hub/install',
  '/hub/live/guest',
  '/hub/lives',
  '/hub/marketplace',
  '/hub/my-tournaments',
  '/hub/poker-brain',
  '/hub/poker-near-me',
  '/hub/poker/table/[tableId]',
  '/hub/post/[id]',
  '/hub/profile',
  '/hub/reset-auth',
  '/hub/session-history',
  '/hub/settings/notifications',
  '/hub/social-media/[slug]',
  '/hub/social-media/compose',
  '/hub/tournaments',
  '/hub/trivia/survival',
]);
// GlobalReportBugButton removed — bug reporting is inside every HamburgerMenu via ReportBugWidget
// ═══════════════════════════════════════════════════════════════════════════
// CACHE BUSTER — Clears stale caches on new deploys
// Uses build timestamp to detect version changes
// ═══════════════════════════════════════════════════════════════════════════
const BUILD_VERSION =
  process.env.NEXT_PUBLIC_BUILD_ID ||
  (typeof window !== 'undefined' && window.__NEXT_DATA__?.buildId) ||
  'stable'; // CRITICAL: Never use Date.now() — it changes every load and triggers cache clears every time

if (typeof window !== 'undefined') {
  const CACHE_VERSION_KEY = 'smarter_poker_cache_version';
  // localStorage THROWS SecurityError when storage is blocked (Safari "Block All
  // Cookies", locked-down enterprise webviews, Firefox with dom.storage disabled).
  // This runs at MODULE SCOPE, so an uncaught throw here means React never mounts
  // and the entire site is a white screen for those users.
  let storedVersion = null;
  try {
    storedVersion = localStorage.getItem(CACHE_VERSION_KEY);
  } catch (e) {
    storedVersion = null;
  }

  if (storedVersion && storedVersion !== BUILD_VERSION) {
    console.log('[Cache Buster] New version detected! Clearing caches...');
    console.log(
      `[Cache Buster] Old: ${storedVersion.slice(0, 8)}, New: ${BUILD_VERSION.slice(0, 8)}`
    );

    // Clear all caches
    if ('caches' in window) {
      caches.keys().then((names) => {
        names.forEach((name) => {
          console.log(`[Cache Buster] Deleting cache: ${name}`);
          caches.delete(name);
        });
      });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // WEB PUSH FIX (2026-08-19) — DO NOT unregister the PWA service worker here.
    //
    // This block used to call registration.unregister() on EVERY service worker
    // on every version bump. Unregistering a service worker DESTROYS its
    // PushSubscription. Since BUILD_VERSION changes on every deploy, every
    // deploy silently wiped every user's push subscription while the server
    // kept reporting success against endpoints that no longer existed. That is
    // the root cause of "notifications never actually push to the phone."
    //
    // Caches are still cleared above, which is what actually fixes stale
    // chunks. Only FOREIGN service workers (legacy OneSignal, old scopes) are
    // unregistered now; the current /sw.js is left alone, and
    // PushSubscriptionSync repairs the subscription on the next boot.
    // ═══════════════════════════════════════════════════════════════════════
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => {
          // `waiting` MUST be in this chain. A registration that has installed
          // but not yet activated has active === null and installing === null,
          // so the old two-term lookup produced '' and fell through to
          // unregister() — destroying the push subscription of the very worker
          // this guard exists to protect.
          const worker = registration.active || registration.waiting || registration.installing;
          const url = worker?.scriptURL || '';
          // Fail CLOSED: an unknown scriptURL is left alone, never unregistered.
          if (!url) return;
          if (/\/sw\.js(\?|$)/.test(url)) return; // keep it — it owns the push subscription
          console.log('[Cache Buster] Unregistering foreign service worker:', url);
          registration.unregister();
        });
      });
    }
  } else if (process.env.NODE_ENV === 'development') {
    // ALWAYS aggressively unregister service workers in DEV mode to prevent HMR infinite loops
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => {
          console.log('[DEV PWA BUSTER] Forcing ServiceWorker unregistration');
          registration.unregister();
        });
      });
    }
  }

  // Store current version (same storage-blocked hazard as the read above)
  try {
    localStorage.setItem(CACHE_VERSION_KEY, BUILD_VERSION);
  } catch (e) {
    /* storage blocked — cache-busting simply no-ops */
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SUPABASE ABORT ERROR DEFENSE — Suppress harmless navigator.locks AbortError
  // This MUST run BEFORE React mounts to prevent the dev overlay from catching it.
  // The AbortError from @supabase/auth-js/locks.js is a known non-critical issue
  // that occurs during page transitions when in-flight session refreshes are aborted.
  // ═══════════════════════════════════════════════════════════════════════════
  window.addEventListener(
    'unhandledrejection',
    function earlyAbortSuppressor(event) {
      const msg = String(event?.reason?.message || event?.reason || '').toLowerCase();
      if (
        msg.includes('aborterror') ||
        msg.includes('signal is aborted') ||
        msg.includes('aborted without reason')
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        // Silently swallow — this is Supabase auth-js lock cleanup, not a real error
      }
    },
    true
  ); // 'true' = capture phase, fires before React's handler

  // ═══════════════════════════════════════════════════════════════════════════
  // GLOBAL AUTH FETCH INTERCEPTOR — Auto-inject JWT for all /api/ calls
  // ═══════════════════════════════════════════════════════════════════════════
  // This wraps window.fetch to automatically add the Authorization: Bearer header
  // to ALL internal API route calls (/api/*). This prevents 401 errors caused by
  // pages that forget to include the JWT token in their fetch requests.
  // Existing Authorization headers are preserved (not overwritten).
  // ═══════════════════════════════════════════════════════════════════════════
  const _originalFetch = window.fetch;
  window.fetch = function patchedFetch(input, init) {
    // Determine the URL from the input
    let url = '';
    if (typeof input === 'string') {
      url = input;
    } else if (input instanceof Request) {
      url = input.url;
    } else if (input?.toString) {
      url = input.toString();
    }

    // Only intercept internal /api/ calls (not external Supabase REST calls)
    const isInternalApi =
      url.startsWith('/api/') || url.startsWith(window.location.origin + '/api/');

    if (isInternalApi) {
      // Check if Authorization header is already present
      const existingHeaders = init?.headers || {};
      let hasAuthHeader = false;

      if (existingHeaders instanceof Headers) {
        hasAuthHeader = existingHeaders.has('Authorization');
      } else if (Array.isArray(existingHeaders)) {
        hasAuthHeader = existingHeaders.some(([key]) => key.toLowerCase() === 'authorization');
      } else if (typeof existingHeaders === 'object') {
        hasAuthHeader = Object.keys(existingHeaders || {}).some(
          (k) => k.toLowerCase() === 'authorization'
        );
      }

      // If no Authorization header, inject one from localStorage
      if (!hasAuthHeader) {
        try {
          const authData = localStorage.getItem('smarter-poker-auth');
          if (authData) {
            const parsed = JSON.parse(authData);
            const token = parsed?.access_token;
            if (token) {
              init = init || {};
              if (existingHeaders instanceof Headers) {
                existingHeaders.set('Authorization', `Bearer ${token}`);
                init.headers = existingHeaders;
              } else if (typeof existingHeaders === 'object' && !Array.isArray(existingHeaders)) {
                init.headers = { ...existingHeaders, Authorization: `Bearer ${token}` };
              } else {
                init.headers = { Authorization: `Bearer ${token}` };
              }
            }
          }
        } catch (e) {
          console.warn('[App] Handled exception:', e?.message || e);
        }
      }
    }

    return _originalFetch.call(window, input, init);
  };
  console.log('[ANTIGRAVITY] Global auth fetch interceptor installed');
}

// Dynamic import to avoid SSR issues with celebration animations
const CelebrationManager = dynamic(
  () =>
    import('../src/components/diamonds/CelebrationManager').then((mod) => mod.CelebrationManager),
  { ssr: false }
);

// Dynamic import for DiamondToast (3-second auto-dismiss popup)
const DiamondToast = dynamic(() => import('../src/components/diamonds/DiamondToast'), {
  ssr: false,
});

// Dynamic import for Phone Verification VIP Modal
const PhoneVerifyVIPModal = dynamic(() => import('../src/components/modals/PhoneVerifyVIPModal'), {
  ssr: false,
});

// Dynamic import for Global Error Catcher (catches async/event handler errors)
const GlobalErrorCatcher = dynamic(() => import('../src/components/ui/GlobalErrorCatcher'), {
  ssr: false,
});

// Dynamic import for Chunk Load Recovery (auto-reloads on stale chunks after deploy)
const ChunkLoadRecovery = dynamic(() => import('../src/components/ui/ChunkLoadRecovery'), {
  ssr: false,
});

// Dynamic import for New User Welcome Modal (500 diamonds + 30-Day VIP announcement)
const NewUserWelcomeModal = dynamic(() => import('../src/components/gates/NewUserWelcomeModal'), {
  ssr: false,
});

// ═══════════════════════════════════════════════════════════════════════════
// NAVIGATION GUARD — Prevents loading freeze when pressing back button
// Uses SYNCHRONOUS DOM manipulation for instant hiding (no React state delay)
// ═══════════════════════════════════════════════════════════════════════════
const NavigationContext = createContext({ isNavigating: false });

export function useNavigation() {
  return useContext(NavigationContext);
}

function NavigationGuard({ children }) {
  const router = useRouter();
  const [isNavigating, setIsNavigating] = useState(false);

  // ═══════════════════════════════════════════════════════════════════════
  // MOUNT-TIME SCROLL UNLOCK — runs on every fresh page load / hydration.
  // The routeChangeComplete valve only fires during in-app navigation.
  // If a user loads a page fresh (bookmark, direct URL, browser refresh)
  // after a Reels session left .reels-lock or overflow:hidden stranded,
  // scroll stays broken forever. This effect fires once on mount and
  // guarantees a clean scroll state before the page becomes interactive.
  // ═══════════════════════════════════════════════════════════════════════
  useEffect(() => {
    // Child dialogs can acquire a current lock before this parent effect runs.
    // The shared guard clears only stranded body/root locks and never stomps a
    // live registry owner.
    clearBodyScrollLockIfUnheld();
    document.body.style.position = '';
    document.body.style.width = '';
    document.body.style.touchAction = '';
    document.body.classList.remove('reels-lock');
    document.documentElement.classList.remove('reels-lock');

    // SCROLL-TO-TOP ON HARD REFRESH / MOUNT (Platform-wide) - ONCE.
    //
    // Corrected 2026-09-04. This used to re-issue scrollTo(0, 0) every 100ms
    // for the first half second "to defeat browser scroll restoration cache",
    // and it defeated the READER instead: any thumb that started scrolling
    // within 500ms of a page landing was yanked back to the top, on every
    // page of the hub. It is also why the footer hide-on-scroll contract
    // (e2e/global-footer-visual) was red on main from the day it landed -
    // the bar hid, then the interval scrolled the page to 0, which correctly
    // showed it again, 100 to 200ms after the flick.
    //
    // `history.scrollRestoration = 'manual'` is what stops the browser
    // restoring a position; it needs no belt. One immediate scrollTo covers
    // the first paint, and after that the scroll position belongs to the
    // person holding the phone.
    if (typeof window !== 'undefined') {
      if ('scrollRestoration' in window.history) {
        window.history.scrollRestoration = 'manual';
      }
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // ═══════════════════════════════════════════════════════════════════════
    // AUTH MIGRATION v6: Migrate to explicit 'smarter-poker-auth' key
    // Ensures cross-window session persistence by using consistent storage key
    // ═══════════════════════════════════════════════════════════════════════
    const AUTH_MIGRATION_VERSION = 'v6_2026_01_21_explicit_storage_key';
    const migrationKey = 'smarter_poker_auth_migration';
    const NEW_AUTH_KEY = 'smarter-poker-auth';

    if (typeof window !== 'undefined') {
      const completedMigration = localStorage.getItem(migrationKey);

      if (completedMigration !== AUTH_MIGRATION_VERSION) {
        console.log('[Auth Migration v6] Running storage key migration...');

        // Look for existing Supabase auth sessions with old auto-generated keys
        let migratedSession = false;
        const oldKeysToRemove = [];

        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('sb-') && key.includes('-auth-token')) {
            try {
              const sessionData = localStorage.getItem(key);
              if (sessionData && !localStorage.getItem(NEW_AUTH_KEY)) {
                // Migrate to new explicit key
                localStorage.setItem(NEW_AUTH_KEY, sessionData);
                console.log(`[Auth Migration v6] Migrated session from ${key} to ${NEW_AUTH_KEY}`);
                migratedSession = true;
              }
              // CRITICAL: Remove old Supabase key to prevent token refresh failure loop
              // If old key exists, Supabase will try to refresh it → 400 error → SIGNED_OUT
              oldKeysToRemove.push(key);
            } catch (e) {
              console.warn('[Auth Migration v6] Failed to migrate:', e);
            }
          }
        }

        // Remove old Supabase auth keys AFTER migration completes
        oldKeysToRemove.forEach((key) => {
          console.log(`[Auth Migration v6] Removing old key: ${key.substring(0, 20)}...`);
          localStorage.removeItem(key);
        });

        // Also clear any corrupted keys with newlines
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.includes('\n') || key.includes('\r'))) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach((key) => {
          console.log(`[Auth Migration v6] Removing corrupted key`);
          localStorage.removeItem(key);
        });

        localStorage.setItem(migrationKey, AUTH_MIGRATION_VERSION);
        console.log(`[Auth Migration v6] Complete! Migrated: ${migratedSession}`);
      }

      // ═══════════════════════════════════════════════════════════════════
      // CROSS-DEVICE SETTINGS SEED — Load DB settings into localStorage
      // This runs once on mount. If user is logged in on a new device,
      // their preferences (theme, poker felt, Geeves language, etc.)
      // are restored from profiles.app_settings JSONB.
      // ═══════════════════════════════════════════════════════════════════
      import('../src/lib/appSettingsSync')
        .then(({ seedLocalStorageFromDB }) => {
          seedLocalStorageFromDB().catch((e) =>
            console.warn('[App] Handled promise rejection:', e?.message || e)
          );
        })
        .catch((e) => console.warn('[App] Handled promise rejection:', e?.message || e));
    }

    // Initialize SoundEngine for audio playback
    SoundEngine.init().catch((err) => console.warn('[App] SoundEngine init failed:', err));

    // Inject the hiding CSS on mount
    const style = document.createElement('style');
    style.id = 'nav-guard-style';
    style.textContent = `
      body.page-transitioning * {
        animation-play-state: paused !important;
        transition: none !important;
      }
      body.page-transitioning video,
      body.page-transitioning audio,
      body.page-transitioning iframe,
      body.page-transitioning canvas,
      body.page-transitioning .loading-overlay,
      body.page-transitioning [class*="loading"],
      body.page-transitioning [class*="spinner"],
      body.page-transitioning [class*="intro"],
      body.page-transitioning [class*="outro"],
      body.page-transitioning [class*="modal"],
      body.page-transitioning [class*="overlay"] {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
      }
    `;
    if (!document.getElementById('nav-guard-style')) {
      document.head.appendChild(style);
    }

    const handleStart = (nextUrl) => {
      // SYNCHRONOUS: Add class immediately (no React state delay)
      document.body.classList.add('page-transitioning');

      // Force stop all media SYNCHRONOUSLY
      document.querySelectorAll('video').forEach((video) => {
        try {
          video.pause();
          video.currentTime = 0;
          video.src = '';
          video.load();
        } catch (e) {
          console.warn('[App] Handled exception:', e?.message || e);
        }
      });
      document.querySelectorAll('audio').forEach((audio) => {
        try {
          audio.pause();
        } catch (e) {
          console.warn('[App] Handled exception:', e?.message || e);
        }
      });
      document.querySelectorAll('iframe').forEach((iframe) => {
        try {
          iframe.src = 'about:blank';
        } catch (e) {
          console.warn('[App] Handled exception:', e?.message || e);
        }
      });

      // roadmap #47: advance only when the pathname actually changes. Query,
      // hash, and shallow updates keep the current page mounted; treating them
      // as a new generation would make handleComplete sweep a dialog that is
      // still open and unlock the document behind it.
      let pathnameChanged = true;
      try {
        pathnameChanged = new URL(nextUrl, window.location.href).pathname !== window.location.pathname;
      } catch (_urlError) {
        // An unparseable target is safest to treat as a real navigation.
      }
      if (pathnameChanged) advanceScrollLockGeneration();

      // Also set React state (for components that check it)
      setIsNavigating(true);
    };

    const handleComplete = (_url, { shallow = false } = {}) => {
      // Remove the hiding class
      document.body.classList.remove('page-transitioning');
      setIsNavigating(false);
      // Scroll to the very top so the global header is always visible.
      //
      // Not on a SHALLOW change (mobile phase 6, 2026-09-13). A shallow
      // replace is a page updating its own ?query in place, the same page,
      // the same scroll position; Next's own router already declines to
      // reset scroll for one (router.js: shouldScroll = options.scroll ??
      // !isValidShallowRoute). This handler ignored that and yanked the
      // reader to the top 100ms after every filter chip, search box and
      // section anchor that records itself in the address bar. On /hub/news
      // it undid the section scroll the tap had just made: the anchor row
      // scrolled to Events, then the page went back to 0.
      if (!shallow) {
        window.scrollTo(0, 0);
        setTimeout(() => {
          requestAnimationFrame(() => {
            window.scrollTo({ top: 0, behavior: 'instant' });
          });
        }, 100);
      }
      // ═══════════════════════════════════════════════════════════════════
      // SCROLL SAFETY VALVE — Clear any stale overflow:hidden left by
      // modals, reels, or overlays that failed to restore body scroll
      // during their unmount cleanup. This prevents the "can't scroll"
      // regression on mobile and desktop when components set
      // document.body.style.overflow = 'hidden' but don't reset it.
      // Also clears .reels-lock class in case Reels left it on body.
      //
      // roadmap #47: this used to clear `overflow` unconditionally, which made
      // it the exact opposite of the counter-aware failsafe further down this
      // same file — one stomped a lock a live arena legitimately held while
      // the other refused to. Sweep the previous page's leaked locks first,
      // then clear only if nobody is left holding one. The other properties
      // below have no reference count and no live holder, so they stay
      // unconditional.
      // ═══════════════════════════════════════════════════════════════════
      sweepStaleScrollLocks();
      clearBodyScrollLockIfUnheld();
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.touchAction = '';
      document.body.classList.remove('reels-lock'); // FIX: clear Reels class lock
      // The shared registry now locks the document root as well as the body;
      // the guarded helper above preserves any incoming live lock.
      document.documentElement.classList.remove('reels-lock'); // FIX: clear html lock too
    };

    // Leaving the streaming surfaces releases the camera and mic. Nothing did
    // this before 2026-09-08: GoLiveModal's teardown pointed at a page-level
    // handler that did not exist, so the stream survived modal close, every
    // client-side navigation and logout, until a full page reload.
    const handleMediaRelease = (url) => {
      try {
        releaseMediaStreamOnLeave(router.pathname, url);
      } catch (_) {
        /* never let a cleanup helper block navigation */
      }
    };

    router.events.on('routeChangeStart', handleStart);
    router.events.on('routeChangeStart', handleMediaRelease);
    router.events.on('routeChangeComplete', handleComplete);
    router.events.on('routeChangeError', handleComplete);

    return () => {
      router.events.off('routeChangeStart', handleMediaRelease);
      router.events.off('routeChangeStart', handleStart);
      router.events.off('routeChangeComplete', handleComplete);
      router.events.off('routeChangeError', handleComplete);
      // Cleanup class if component unmounts during transition
      document.body.classList.remove('page-transitioning');
    };
  }, [router.events]);

  return (
    <NavigationContext.Provider value={{ isNavigating }}>{children}</NavigationContext.Provider>
  );
}

/**
 * App Root - AntiGravityProvider wraps everything for automatic boot.
 * ThemeProvider handles dark/light mode with localStorage persistence.
 * UnreadProvider tracks unread message count globally.
 * NavigationGuard prevents loading freeze on back button navigation.
 * On startup, Anti-Gravity:
 *   1. Verifies required env vars
 *   2. Initializes runtime
 *   3. Connects to Supabase
 *   4. Prints heartbeat proof to console
 *
 * If any requirement fails → fail-closed → SystemOffline screen
 */
// ═══════════════════════════════════════════════════════════════════════════
// PHONE VERIFY VIP GATE — Shows phone verification popup for new signups
// Checks sessionStorage for `needs_phone_verify` flag set by auth callback
// ONLY shows if user hasn't already verified their phone
// ═══════════════════════════════════════════════════════════════════════════
function PhoneVerifyGate() {
  const [showPhoneVerify, setShowPhoneVerify] = useState(false);
  const [verifyUserId, setVerifyUserId] = useState(null);
  const router = useRouter();

  useEffect(() => {
    // Check on route change or mount — slight delay to let page settle
    const timer = setTimeout(async () => {
      const userId = sessionStorage.getItem('needs_phone_verify');
      if (!userId || userId.length < 10) return;

      // Only show on hub or commander pages, not auth pages
      const path = router.asPath;
      if (!path.startsWith('/hub') && !path.startsWith('/commander/dashboard')) return;

      // ── CRITICAL: Check if user already has phone verified ──────────
      // Don't show popup for returning users who already verified
      try {
        const { supabase } = await import('../src/lib/supabase');
        const { data: profile } = await supabase
          .from('profiles')
          .select('phone_verified, phone')
          .eq('id', userId)
          .maybeSingle();

        if (profile?.phone_verified && profile?.phone) {
          // Already verified — don't show popup, clean up flag
          sessionStorage.removeItem('needs_phone_verify');
          console.log('[PhoneVerifyGate] User already verified phone, skipping popup');
          return;
        }
      } catch (err) {
        console.warn('[PhoneVerifyGate] Profile check failed (showing popup):', err.message);
        // On error, still show popup — better to ask again than skip
      }

      setVerifyUserId(userId);
      setShowPhoneVerify(true);
    }, 2500); // 2.5s delay so the user sees the page first
    return () => clearTimeout(timer);
  }, [router.asPath]);

  if (!showPhoneVerify || !verifyUserId) return null;

  return (
    <PhoneVerifyVIPModal
      userId={verifyUserId}
      onClose={() => {
        setShowPhoneVerify(false);
        sessionStorage.removeItem('needs_phone_verify');
      }}
      onVerified={() => {
        setShowPhoneVerify(false);
        sessionStorage.removeItem('needs_phone_verify');
      }}
    />
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// WELCOME MODAL GATE — Renders NewUserWelcomeModal on first hub visit
// Reads showWelcomeModal / dismissWelcomeModal from AvatarContext
// ═══════════════════════════════════════════════════════════════════════════
function WelcomeModalGate() {
  const router = useRouter();
  const { showWelcomeModal, dismissWelcomeModal, user } = useAvatar();

  // Only show on hub pages
  const path = router.asPath;
  if (!path.startsWith('/hub')) return null;
  if (!showWelcomeModal) return null;

  return (
    <NewUserWelcomeModal
      isOpen={true}
      onClose={dismissWelcomeModal}
      userName={user?.user_metadata?.full_name || user?.user_metadata?.poker_alias || ''}
    />
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// EASTER EGG WATCHER — makes the 67-egg catalog reachable
// Renders nothing. Asks the server to re-check which eggs this user has earned
// (on sign-in, and whenever a surface fires `sp-egg-check`) and toasts the
// ones that land. Detection is entirely server-side: this never names an egg.
// @see src/lib/rewards/eggVerifiers.js
// ═══════════════════════════════════════════════════════════════════════════
function EasterEggWatcher() {
  const { user } = useAvatar();
  useEasterEggSweep(user?.id || null);
  return null;
}

export default function App({ Component, pageProps }) {
  const router = useRouter();
  const { isOpen: isJarvisOpen, onClose: onJarvisClose } = useJarvis();
  const isCommander = router.asPath.startsWith('/commander');

  // Determine if this route requires global capitalization per User specification
  const path = router.asPath.split('?')[0];
  const isTrainingRoute = path === '/hub/training' || path.startsWith('/hub/training/');
  const trainingPathLeaf = path.split('/').filter(Boolean).at(-1);
  const candidateTrainingArtId =
    typeof router.query.gameId === 'string'
      ? router.query.gameId
      : TRAINING_STANDALONE_ART_IDS.has(trainingPathLeaf)
        ? trainingPathLeaf
        : null;
  const trainingArtId =
    candidateTrainingArtId && /^[a-z0-9-]{3,40}$/.test(candidateTrainingArtId)
      ? candidateTrainingArtId
      : null;
  const trainingRouteArt = trainingArtId
    ? `/images/training/casino-realism/${trainingArtId}.webp`
    : null;

  // Several legacy training pages already own the unchanged global header.
  // All other training routes receive the same component here so the complete
  // training library has consistent navigation without duplicating headers.
  const trainingPageOwnsHeader = TRAINING_ROUTES_WITH_HEADER.has(router.pathname);
  const hubPageNeedsHeader = HUB_ROUTES_WITHOUT_SHARED_HEADER.has(router.pathname);
  // `/hub/club-arena` is served by the embedded Club Arena SPA, but Next can
  // classify it as the dynamic `/hub/[orbId]` page before the static rewrite
  // takes over. Resolve ownership from the real URL first so the generic orb
  // footer can never leak onto Club Arena's footerless lobby or double-mount
  // over its internal routes.
  const resolvedPath =
    (router.asPath || router.pathname).split(/[?#]/, 1)[0].replace(/\/+$/, '') || '/';
  // Every Poker Near Me route owns a complete SEOHead. Keeping the generic
  // social defaults mounted as a separate next/head instance causes both the
  // default and route-specific Open Graph/Twitter tags to survive SSR, leaving
  // crawlers to choose between contradictory previews. Scope the suppression
  // to this fully-covered route family; unrelated pages still inherit the
  // platform defaults.
  const pokerNearMeOwnsSocialMetadata =
    resolvedPath === '/hub/poker-near-me' || resolvedPath.startsWith('/hub/poker-near-me/');
  const isClubArenaRoute = isClubArenaOwnedRoute(resolvedPath);
  const isOperatorConsole = isOperatorConsoleRoute(resolvedPath);
  const bottomNavRouteConfig = isClubArenaRoute ? null : bottomNavRoutes[router.pathname] || null;
  const worldFooterConfig = isClubArenaRoute ? null : resolveWorldFooter(resolvedPath);
  const worldCopyWorldId = worldFooterConfig?.id || null;
  const bottomNavConfig =
    worldFooterConfig || (bottomNavRouteConfig ? getFallbackFooter() : null);
  const [isEmbedded, setIsEmbedded] = useState(false);

  // Two legacy settings surfaces intentionally suppress platform chrome when
  // embedded. Evaluate after hydration so server and first client render agree.
  // 2026-09-04: notice a revoked session. PostgREST checks signatures, not
  // session rows, so a session deleted behind the user keeps answering 200
  // here for seven days. See src/lib/sessionLiveness.js.
  useEffect(() => {
    import('../src/lib/sessionLiveness')
      .then((m) => m.installSessionLivenessWatch())
      .catch(() => {});
  }, []);

  useEffect(() => {
    try {
      setIsEmbedded(window.self !== window.top);
    } catch (_) {
      setIsEmbedded(true);
    }
  }, []);

  const showBottomNav = Boolean(
    bottomNavConfig && !(bottomNavRouteConfig?.hideInIframe && isEmbedded)
  );

  // Do NOT capitalize specific poker/trainer tool screens where exact statistical/range string casing (e.g., AQs, cbet, EV) is mathematically critical
  const isPokerTool =
    path.includes('/training') ||
    path.includes('/gto') ||
    path.includes('/solver') ||
    path.includes('/sandbox');

  // Apply to Settings, Hub, Commander, Club Arena, and Union screens
  const shouldCapitalize =
    (path.includes('/settings') ||
      path.startsWith('/hub') ||
      path.startsWith('/commander') ||
      path.includes('/club') ||
      path.includes('/union')) &&
    !isPokerTool;

  // Global Failsafe: Clear stranded scroll locks on route change.
  // roadmap #47: kept as a second, independent pass because the handler above
  // lives inside a large effect that other work could regress; this one does
  // nothing unless the page is genuinely stranded (locked with no holder), so
  // running it twice costs nothing and it cannot free a live lock.
  useEffect(() => {
    const handleRouteChange = () => {
      clearBodyScrollLockIfUnheld();
    };
    router.events.on('routeChangeComplete', handleRouteChange);
    return () => router.events.off('routeChangeComplete', handleRouteChange);
  }, [router]);

  // THE APP REOPENS WHERE YOU LEFT IT (Dan, 2026-09-13). Record the route
  // the player is on, so the standalone PWA can come back to it instead of to
  // start_url. The restore half is the inline script in pages/_document.js;
  // the contract and the exclusions are documented in src/lib/resumeRoute.js.
  useEffect(() => installLastRouteRecorder(router), [router]);

  return (
    <SWRConfig value={{ ...SWR_DEFAULTS, provider: swrLocalStorageProvider }}>
      <div
        className={`${orbitron.variable} ${inter.variable} ${plusJakartaSans.variable} ${spaceGrotesk.variable} ${rajdhani.variable} ${robotoCondensed.variable} ${ibmPlexMono.variable} ${shouldCapitalize ? 'capitalize-world' : ''} ${worldCopyWorldId ? WORLD_COPY_SCOPE_CLASS : ''}`}
        style={{ minHeight: '100vh' }}
      >
        <>
          {/* PWA Manifest — route-based: Commander gets its own manifest/icon/title */}
          <Head>
            {/* Nobody ever declared a viewport meta - production served
                Next's bare default 'width=device-width' with NO
                initial-scale. Without initial-scale=1, mobile Safari applies
                its own scaling heuristics, which amplified the
                native-input-chrome bug on /auth/login (oversized fields,
                focus zoom). Declared once here per Next.js convention
                (_app, not _document). */}
            <meta
              name="viewport"
              content="width=device-width, initial-scale=1, viewport-fit=cover"
            />
            {/* These defaults must live inside next/head. _document metadata
                cannot be deduplicated, so route-level SEOHead used to produce
                two contradictory social previews. */}
            {!pokerNearMeOwnsSocialMetadata && (
              <>
                <meta key="og-site-name" property="og:site_name" content="Smarter.Poker" />
                <meta key="og-type" property="og:type" content="website" />
                <meta key="og-locale" property="og:locale" content="en_US" />
                <meta key="og-url" property="og:url" content="https://smarter.poker" />
                <meta key="og-title" property="og:title" content="Smarter.Poker | The Future Of The Game" />
                <meta key="og-description" property="og:description" content="Train Smarter. Connect Globally. Manage Everything. The Premier Poker Platform With GTO Training, AI Coaching, Social Networking, Bankroll Tracking, And Club Commander Poker Room Management." />
                <meta key="og-image" property="og:image" content="https://smarter.poker/images/og-default.png" />
                <meta key="og-image-width" property="og:image:width" content="1200" />
                <meta key="og-image-height" property="og:image:height" content="2151" />
                <meta key="twitter-card" name="twitter:card" content="summary_large_image" />
                <meta key="twitter-site" name="twitter:site" content="@SmarterPoker" />
                <meta key="twitter-title" name="twitter:title" content="Smarter.Poker | The Future Of The Game" />
                <meta key="twitter-description" name="twitter:description" content="Train Smarter. Connect Globally. Manage Everything. The Premier Poker Platform With GTO Training, AI Coaching, Social Networking, Bankroll Tracking, And Club Commander Poker Room Management." />
                <meta key="twitter-image" name="twitter:image" content="https://smarter.poker/images/og-default.png" />
              </>
            )}

            {shouldCapitalize && (
              <style
                dangerouslySetInnerHTML={{
                  __html: `
              /* Target ONLY structural UI elements, buttons, headers, and discrete labels */
              .capitalize-world .settingLabel,
              .capitalize-world .settingDesc,
              .capitalize-world button,
              .capitalize-world a.nav-link,
              .capitalize-world .orb-badge,
              .capitalize-world label,
              .capitalize-world .ui-heading,
              .capitalize-world .menu-item,
              .capitalize-world .tab-label,
              .capitalize-world .btn,
              .capitalize-world .button-text {
                text-transform: capitalize !important;
                white-space: normal !important;
                word-wrap: break-word !important;
              }

              /* Protect user inputs and system globals from capitalization */
              .capitalize-world input, 
              .capitalize-world textarea, 
              .capitalize-world select, 
              .capitalize-world [contenteditable="true"], 
              .capitalize-world .no-capitalize,
              .capitalize-world .no-capitalize * {
                text-transform: none !important;
              }
            `,
                }}
              />
            )}

            {isCommander ? (
              <>
                <link rel="manifest" href="/commander-manifest.json" />
                <link
                  rel="apple-touch-icon"
                  sizes="180x180"
                  href="/icons/commander-apple-touch-icon.png"
                />
                <link
                  rel="icon"
                  type="image/png"
                  sizes="192x192"
                  href="/icons/commander-icon-192.png"
                />
                <link
                  rel="icon"
                  type="image/png"
                  sizes="512x512"
                  href="/icons/commander-icon-512.png"
                />
                <meta name="apple-mobile-web-app-title" content="Club Commander" />
                <meta name="application-name" content="Club Commander" />
              </>
            ) : (
              <>
                <link rel="manifest" href="/manifest.json" />
                <link
                  rel="apple-touch-icon"
                  sizes="180x180"
                  href="/icons/apple-touch-icon-180.png"
                />
                <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png" />
                <link rel="icon" type="image/png" sizes="512x512" href="/icons/icon-512.png" />
                <meta name="apple-mobile-web-app-title" content="Smarter.Poker" />
                <meta name="application-name" content="Smarter.Poker" />
              </>
            )}
          </Head>
          <AntiGravityProvider>
            <WorldCopyPolicy worldId={worldCopyWorldId} />
            <ThemeProvider>
              <UnreadProvider>
                <AvatarProvider>
                  <ExternalLinkProvider>
                    <PushProvider>
                      <TrainingSettingsProvider>
                        <NavigationGuard>
                          <ActiveIdentityProvider>
                            <WorldThemeProvider>
                              <PageErrorBoundary key={router.asPath}>
                                {isTrainingRoute ? (
                                  <div
                                    className="sp-training-route-shell"
                                    data-training-route={router.pathname}
                                    data-training-art={trainingRouteArt ? trainingArtId : undefined}
                                    style={
                                      trainingRouteArt
                                        ? {
                                            '--sp-training-route-art': `url("${trainingRouteArt}")`,
                                          }
                                        : undefined
                                    }
                                  >
                                    {!trainingPageOwnsHeader && <UniversalHeader pageDepth={2} />}
                                    <div className="sp-training-page-stage">
                                      <Component {...pageProps} />
                                    </div>
                                  </div>
                                ) : isOperatorConsole ? (
                                  <OperatorConsoleShell>
                                    {hubPageNeedsHeader && <UniversalHeader />}
                                    <Component {...pageProps} />
                                  </OperatorConsoleShell>
                                ) : (
                                  <>
                                    {hubPageNeedsHeader && <UniversalHeader />}
                                    <Component {...pageProps} />
                                  </>
                                )}
                              </PageErrorBoundary>
                              {!isClubArenaRoute && <WorldCommandDock />}
                              {showBottomNav && (
                                <BottomNavSpacer
                                  config={bottomNavConfig}
                                  noSafeArea={Boolean(bottomNavRouteConfig?.noSafeArea)}
                                />
                              )}
                              {showBottomNav && (
                                <BottomNavBar
                                  config={bottomNavConfig}
                                  theme={bottomNavRouteConfig?.theme || bottomNavConfig.theme}
                                  noSafeArea={Boolean(bottomNavRouteConfig?.noSafeArea)}
                                />
                              )}
                              {/* Mobile foundation (Phase 0a): one offline pill for
                                  every route. SSR-safe (renders null until the
                                  browser reports offline after hydration). */}
                              <HubErrorBoundary name="Offline Bar" fallback={<></>}>
                                <OfflineBar />
                              </HubErrorBoundary>
                              {/* Page tutorials (Dan 2026-09-03): one provider for
                                  every route; the prompt, the tour and the
                                  hamburger "Page Tutorial" row all read from
                                  src/tutorials/index.js. */}
                              <HubErrorBoundary name="Page Tutorial" fallback={<></>}>
                                <TutorialProvider />
                              </HubErrorBoundary>
                              <HubErrorBoundary name="Celebrations" fallback={<></>}>
                                <CelebrationManager />
                              </HubErrorBoundary>
                              <HubErrorBoundary name="Diamond Toast" fallback={<></>}>
                                <DiamondToast />
                              </HubErrorBoundary>
                              <HubErrorBoundary name="Toast Container" fallback={<></>}>
                                <ToastContainer />
                              </HubErrorBoundary>
                              {/* The full-screen notifications popup, and the other
                                  pages that open the same way. Dan, 2026-09-02: "IT
                                  SHOULD CREATE A 'FULL SCREEN POP UP' SO YOU STAY ON
                                  THE PAGE YOU WERE ON... INSIDE THE WORLD HUB, CLUB
                                  ARENA AND CLUB COMMANDER PAGES." Mounted here rather
                                  than in UniversalHeader because that header is
                                  rendered per-page and Commander never renders it, so
                                  a header-owned overlay was unopenable from most of
                                  the doors that lead to it. Renders null until
                                  something calls the store. */}
                              <HubErrorBoundary name="Global Page Overlay" fallback={<></>}>
                                <GlobalPageOverlay />
                              </HubErrorBoundary>
                              <ToastProvider>
                                <HubErrorBoundary name="Notification Prompt" fallback={<></>}>
                                  <GlobalNotificationPrompt />
                                </HubErrorBoundary>
                                <HubErrorBoundary name="PWA Install Prompt" fallback={<></>}>
                                  <ServiceWorkerUpdater />
                                  <PWAInstallPrompt />
                                </HubErrorBoundary>
                                <HubErrorBoundary name="Phone Verify Gate" fallback={<></>}>
                                  <PhoneVerifyGate />
                                </HubErrorBoundary>
                                <HubErrorBoundary name="Proactive Help" fallback={<></>}>
                                  <ProactiveHelp
                                    onAccept={() => {
                                      // Open Jarvis when user accepts help
                                      if (typeof window !== 'undefined') {
                                        window.dispatchEvent(new CustomEvent('open-jarvis'));
                                      }
                                    }}
                                    onDismiss={() => {
                                      console.log('[ProactiveHelp] User dismissed help prompt');
                                    }}
                                  />
                                </HubErrorBoundary>
                                <HubErrorBoundary name="Jarvis Panel" fallback={<></>}>
                                  <JarvisPanel isOpen={isJarvisOpen} onClose={onJarvisClose} />
                                </HubErrorBoundary>
                                <HubErrorBoundary name="Global PiP Manager" fallback={<></>}>
                                  <GlobalPiPManager />
                                </HubErrorBoundary>

                                <HubErrorBoundary name="Global Error Catcher" fallback={<></>}>
                                  <GlobalErrorCatcher />
                                </HubErrorBoundary>
                                <HubErrorBoundary name="Chunk Load Recovery" fallback={<></>}>
                                  <ChunkLoadRecovery />
                                </HubErrorBoundary>
                                <HubErrorBoundary name="Welcome Modal" fallback={<></>}>
                                  <WelcomeModalGate />
                                </HubErrorBoundary>
                                <HubErrorBoundary name="Easter Egg Watcher" fallback={<></>}>
                                  <EasterEggWatcher />
                                </HubErrorBoundary>
                              </ToastProvider>
                            </WorldThemeProvider>
                          </ActiveIdentityProvider>
                        </NavigationGuard>
                      </TrainingSettingsProvider>
                    </PushProvider>
                  </ExternalLinkProvider>
                </AvatarProvider>
              </UnreadProvider>
            </ThemeProvider>
          </AntiGravityProvider>
        </>
      </div>
    </SWRConfig>
  );
}

// Report Web Vitals to Sentry for performance monitoring
export function reportWebVitals({ id, name, label, value }) {
  try {
    if (typeof window !== 'undefined' && window.Sentry) {
      window.Sentry.metrics?.distribution(name, value, {
        tags: { id, label },
        unit: name === 'CLS' ? 'none' : 'millisecond',
      });
    }
    // Also log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`[WebVital] ${name}: ${Math.round(value)}${name === 'CLS' ? '' : 'ms'}`);
    }

    // Poker Near Me owns a route-scoped performance budget. Send only those
    // public discovery surfaces through the existing consent-aware analytics
    // wrapper; unrelated Hub routes remain untouched.
    if (typeof window !== 'undefined') {
      const pathname = window.location?.pathname || '';
      const isDiscoveryRoute =
        /^\/hub\/(?:poker-near-me|venues|home-games|poker-series|series|daily-tournaments|events-calendar|poker-tours|tours)(?:\/|$)/.test(
          pathname
        );
      if (isDiscoveryRoute) {
        import('../src/lib/poker-near-me/activity')
          .then(({ capturePokerNearMeVital }) =>
            capturePokerNearMeVital({ id, name, label, value }, pathname)
          )
          .catch(() => null);
      }
    }
  } catch (_) {
    console.warn('[App] Handled exception:', _?.message || _);
  }
}
