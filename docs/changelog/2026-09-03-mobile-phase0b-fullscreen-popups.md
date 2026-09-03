# 2026-09-03: Mobile Phase 0b, Full-Screen Popups Leave Room To X Off

Dan, verbatim: "change any and all full screen pop ups, they don't leave any
padding at the top to X off."

## The defect

The app runs with `viewport-fit=cover` and a translucent status bar. A
`position: fixed; inset: 0` layer therefore starts at y=0 UNDER the clock /
notch, which is about 47px tall on a modern iPhone. Every full-screen popup
that placed its close control at `top: 8..24px` painted that control under the
status bar, where it cannot be tapped. Several of those controls were also
28-40px squares, below the 44px iOS minimum tap target.

## The rule (now law)

For every full-screen overlay (fixed + inset:0 / 100vh / 100dvh / top..bottom):

1. Top chrome (header row or the close control) sits at
   `top: calc(env(safe-area-inset-top, 0px) + 12px)`, or the container carries
   `padding-top: max(env(safe-area-inset-top, 0px), 12px)`.
2. The close / X control is at least 44x44, carries `aria-label="Close"` (or a
   more specific label an existing test pins), class `sp-icon-btn`,
   `touch-action: manipulation` and `-webkit-tap-highlight-color: transparent`.
3. Bottom chrome gets `padding-bottom: env(safe-area-inset-bottom, 0px)`.
4. Full-height containers use `100dvh`, not `100vh`.
5. No existing z-index lowered.

Enforced by `__tests__/overlays-leave-room-to-close.law.test.mjs`.

## Shared utilities

`src/styles/global-tokens.css` (globally imported by `pages/_app.js`, read
only, not edited) lines 145-185: `.sp-fullscreen-overlay`, `.sp-overlay-close`,
`.sp-overlay-close--left`, with a WHY comment.

## Files changed (file:line, what)

| File | Lines | Change |
| --- | --- | --- |
| `src/styles/global-tokens.css` | 145-185 | New utility classes with WHY comment |
| `src/components/ui/FullScreenPageOverlay.js` | 196-206 | `.fsp-close-btn` 36 to 44, touch-action, tap highlight |
| `src/components/social/PostImageLightbox.jsx` | 47-76 | Container `.sp-fullscreen-overlay`; X at safe-area top, 44px, `aria-label="Close"`; counter pushed below inset |
| `src/components/social/ChatWindow.jsx` | 2984-3025 | Inline lightbox: safe-area X, 44px, aria-label (kept inline: it has wrap-around swipe nav that `PostImageLightbox` lacks) |
| `src/components/social/ClubPageDashboard.jsx` | 2984-3025 | Same as ChatWindow |
| `src/components/social/ClubPagesView.jsx` | 2984-3025 | Same as ChatWindow |
| `src/components/social/PublicGameBoard.jsx` | 2984-3025 | Same as ChatWindow |
| `src/components/social/Reels.jsx` | 1914-1953, 1994, 2048 | Loading / error / empty states carry `.sp-fullscreen-overlay`; loading state gained a reachable X (it had no exit) |
| `src/components/social/Reels.jsx` | 2153-2182 | Viewer back control at safe-area top, 44px, aria-label |
| `src/components/social/Reels.jsx` | 2213 | Reel slides `100vh` to `100dvh` (matches the inset:0 scroll port) |
| `src/components/social/Reels.jsx` | 3113-3133 | Comment drawer X 44px |
| `src/components/social/Reels.jsx` | 4147-4162 | Share description modal X 32 to 44 |
| `src/components/social/ReelsFeedCarousel.jsx` | 1977-1997 | Close at safe-area top, 44px, aria-label |
| `src/components/social/Stories.jsx` | 564-576, 582, 588, 608 | Viewer X at safe-area top; frame `100dvh`; progress bars and header pushed below inset |
| `src/components/social/Stories.jsx` | 973-1000 | Create Story header padded below inset; X 40 to 44 |
| `src/components/social/SmarterPokerPhotos.jsx` | 144, 235-246, 466 | `.close-btn` safe-area top, 40 to 44; counter clears home indicator |
| `src/components/social/ArticleReaderModal.jsx` | 83-107 | Header padded below inset; Back button 44px min |
| `src/components/social/SharedVideoComponents.jsx` | 690-710 | Close at safe-area top, 44px, aria-label |
| `src/components/social/compose/sheets/SheetShell.jsx` | 14-32 | BUG: `padding` shorthand was declared after `paddingTop` and reset the inset to 0; reordered. Back button 44px |
| `src/components/social/GoLiveModal.jsx` | 2330-2350 | Studio X 44px, aria-label (container already padded by safe-area) |
| `src/components/ui/ExternalLinkModal.jsx` | 226, 352-372, 426-434 | Modal `100dvh`; header below inset; X 32 to 44 |
| `src/components/ui/BottomSheet.jsx` | 137-152, 190-201, 243-246 | `placement="right"` sheet padded top/bottom by insets; close 36 to 44 (both placements) |
| `src/components/ui/LocationEnableModal.jsx` | 178, 221-222 | Mobile scrim padded by inset; X 44px |
| `src/components/ui/InviteFriendsModal.jsx` | 237, 278-290 | maxHeight respects insets; X 36 to 44 (centered card) |
| `src/components/poker-near-me/GlobalSearchOverlay.jsx` | 315-318, 994-998 | Both headers padded below inset; back/close 40 to 44 |
| `src/components/poker-near-me/VenueReviews.jsx` | 335, 525, 530 | `.vr-panel` padded by insets; `.vr-close` 44px |
| `src/components/poker-near-me/VenueCard.js` | 668, 672, 1691 | Check-in scrim padded by insets; `.vc3-checkin-close` 44px |
| `src/components/poker-near-me/InteractiveTutorial.jsx` | 411-418 | X (already 48px) gains touch-action, tap highlight, `aria-label="Close"` |
| `src/components/store/DiamondWalletModal.jsx` | 1253-1258, 1268-1282 | `top: 60` (header height) to `calc(env(safe-area-inset-top) + 60px)` because UniversalHeader grows by the inset; X 36 to 44 |
| `src/components/store/ShoppingCart.jsx` | 139-143, 152-155, 168-180 | Drawer `100dvh` + bottom inset; header below inset; X 44px |
| `src/components/bankroll/TokeTracker.jsx` | 1258-1266, 2239-2255, 2284-2291 | Receipt lightbox gained a reachable X (had none); lightbox and modal scrims padded by insets |
| `src/components/bankroll/TaxSummaryModal.jsx` | 176-181, 297-300, 320-325 | X 44px; maxHeight respects insets (label kept as `Close Tax Summary`, pinned by `world-command-destinations.test.mjs`) |
| `src/components/tours/StopScheduleModal.js` | 291, 410-416, 439-445, 568-572 | Header below inset; X 36 to 44; footer clears home indicator |
| `src/components/training/LevelCompleteModal.jsx` | 105-118 | Overlay padded by insets (exit is an in-page button) |
| `src/components/trivia/TriviaLobby.jsx` | 1031-1041, 1141-1151 | Gate overlay padded by insets; `.dm-close` hitbox 44px minimum |
| `src/world/components/CardCustomizerPanel.tsx` | 121-126, 145, 249-266 | Panel `100dvh` + bottom inset; header below inset; X 32 to 44 |
| `pages/hub/video-library.js` | 2388-2403, 3184 | Player X at safe-area top, 40 to 44; TTS sheet X 32 to 44, sheet clears home indicator |
| `pages/hub/news.js` | 4024-4034, 4285-4297 | Reel viewer X at safe-area top, 44px; `.close-modal` 28 to 44 |
| `pages/hub/messenger.js` | 3761-3769, 4067-4098 | Forward sheet X is a 44px button (was floated text); call header below inset, End Call 44px tall |
| `pages/hub/poker-tools.js` | 246-266 | Settings drawer padded by insets; X gains touch-action |
| `pages/hub/lives.js` | 548-596, 1131 | Header at `top: env(safe-area-inset-top)`; back 32 to 44; filter bar shifted down; drafts sheet X 44px |
| `pages/hub/home-games.js` | 959, 1354-1363, 1376-1392 | Fullscreen map `100dvh`; Collapse Map control at safe-area top, 44px tall, role=button |
| `pages/hub/home-games/[slug].js` | 1701-1704 | Seat scrim padded by insets; `.hgs-seat-close` 44px; wide modal maxHeight respects insets |
| `pages/hub/reels.js` | 5598-5620 | Share description modal X 32 to 44 |
| `pages/hub/events-calendar.js` | 414, 1568-1583 | Location scrim padded by insets; `.loc-close` 44px |
| `pages/hub/daily-tournaments.js` | 967-979 | Calendar scrim padded by insets |
| `__tests__/overlays-leave-room-to-close.law.test.mjs` | new | The law |

## Audited, left alone (with reason)

- `pages/hub/social-media/index.js` ~2993 inline lightbox: OFF LIMITS for this
  pass (another agent owns the file). It still carries the pre-fix lightbox
  (X at `top: 16`, no 44px target). Needs the same patch as ChatWindow.
- `pages/hub/daily-tournaments.js` 746/756, `pages/hub/events-calendar.js`
  1150/1158, `pages/hub/home-games.js` 1855/1874, `pages/hub/poker-series.js`
  1948/1967, `pages/hub/poker-tours.js` 1838/1857,
  `src/components/settings/settingsStyles.js` 10,
  `src/components/diamond-store/diamondStoreStyles.js` 14: cosmetic
  backgrounds (`z-index: -1/-2`, `pointer-events: none`), no control.
- `pages/hub/memory-games.js` 2544: AI-generation progress layer, no control.
  2988: background grid.
- `pages/hub/reels.js` 2467/2741: the page itself (has UniversalHeader, which
  already handles the inset). 5525: TTS sheet scrim; its X was fixed.
- `src/components/training/LevelSelector.tsx` 576/754: loading overlay with no
  control; level badge.
- `src/components/trivia/TriviaLobby.jsx` 1044: deducting overlay, no control.
- `src/components/poker-near-me/InteractiveTutorial.jsx`: not full-screen (a
  positioned card / bottom sheet); X already 48px.

## Verification

- `node --test __tests__/overlays-leave-room-to-close.law.test.mjs`: 3/3 pass.
- `node --test __tests__/fixed-elements-stay-fixed.test.mjs`: 3/3 pass.
- `node --test __tests__/world-command-destinations.test.mjs`: pass.
- All 40 edited JS/JSX/TSX files parse with `@babel/parser` (jsx; jsx +
  typescript for .tsx).
- Full `__tests__/*.mjs` run: 1178 pass, 11 fail; every failure is
  pre-existing and in files this pass did not touch (Club Arena build
  tracking, `/api/` literals in diamond-store / memory-games, newsletter
  admin, venue detail page, `waitlist_seat_open`, training inventory choking
  on a `.json` import).
