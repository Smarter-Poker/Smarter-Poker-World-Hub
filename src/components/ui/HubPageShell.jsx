/**
 * HubPageShell: the standard World Hub page shell, in one place.
 *
 * WHY: every hub page used to hand-copy the same 40 lines from the Social
 * Media gold standard (docs/mobile-standard/ALWAYS-DISPLAYED-MOBILE-STANDARD.md)
 * and every copy drifted: a 70px bottom pad that doubled the app shell's
 * BottomNavSpacer, a `100vh` where `100dvh` was owed, two `maxWidth` keys in
 * one style literal, media rules tucked inside <Head> where a migration
 * stripped them. This component IS the standard, so a page adopts it by
 * wrapping its sections and cannot reproduce those mistakes.
 *
 * What it renders (copy of the "page shell" block in the standard):
 *
 *   <div shell 100dvh / 100vw clamp / overflow-x hidden, NO bottom pad>
 *     {header}                              (hidden when inside an iframe)
 *     <main className="{prefix}-page-container">
 *       <div className="{prefix}-feed-layout">
 *         <div className="{prefix}-feed-column">{children}</div>
 *         <aside className="{prefix}-contacts-sidebar">{sidebar}</aside>
 *       </div>
 *     </main>
 *     <style> mandatory 900 / 768 block for this prefix </style>
 *   </div>
 *
 * Contracts it keeps for you:
 * - NO bottom clearance. pages/_app.js owns BottomNavSpacer; add the route
 *   to src/config/bottom-nav-routes.json instead.
 * - Layout is CSS only. No isMobile state, no matchMedia, so SSR and the
 *   first client render agree (hydration #418 crashed 14 pages).
 * - The mandatory breakpoint block is a plain <style> in the body, not
 *   styled-jsx and not inside <Head>.
 * - `overflow-x: hidden` is paired with `overflow-x: clip` on the column so
 *   fixed descendants stay welded to the viewport on WebKit.
 * - The `isInIframe` guard (PR #776) hides page-owned chrome when the page
 *   is opened inside FullScreenPageOverlay, which supplies its own header.
 */
import React, { useEffect, useState } from 'react';
import UniversalHeader from './UniversalHeader';

/**
 * The only three breakpoints the standard allows. Do not add a fourth.
 * rail: the desktop side rail disappears.
 * phone: edge to edge, gaps and padding to 0, grids to one column.
 * sheet: modals become bottom sheets (owned by the overlay primitives).
 */
export const HUB_BREAKPOINTS = { rail: 900, phone: 768, sheet: 600 };

const shellCss = (p, maxWidth) => `
.${p}-page-container { padding: 0; width: 100%; max-width: 100%; overflow-x: hidden; overflow-x: clip; box-sizing: border-box; }
.${p}-feed-layout { display: flex; gap: 16px; justify-content: center; width: 100%; box-sizing: border-box; }
.${p}-feed-column { flex: 1; min-width: 0; max-width: ${maxWidth}px; overflow-x: hidden; overflow-x: clip; }
.${p}-contacts-sidebar { width: 220px; flex-shrink: 0; }
@media (max-width: ${HUB_BREAKPOINTS.phone}px) {
  .${p}-feed-column { max-width: 100% !important; width: 100% !important; }
  .${p}-feed-layout { gap: 0 !important; width: 100% !important; padding: 0 !important; }
  .${p}-page-container { padding: 0 !important; width: 100% !important; max-width: 100vw !important; }
  div[style*="grid-template-columns: 1fr 320px"] { grid-template-columns: 1fr !important; }
}
@media (max-width: ${HUB_BREAKPOINTS.rail}px) { .${p}-contacts-sidebar { display: none; } }
`;

export default function HubPageShell({
  className = 'hub',
  background,
  maxWidth = 680,
  header,
  onMenuClick,
  sidebar = null,
  children,
}) {
  const prefix = String(className || 'hub').trim() || 'hub';

  // Server and first client render both say "not in an iframe"; the truth
  // arrives after hydration so markup never mismatches.
  const [isInIframe, setIsInIframe] = useState(false);
  useEffect(() => {
    try {
      setIsInIframe(window.self !== window.top);
    } catch (_) {
      setIsInIframe(true);
    }
  }, []);

  const resolvedHeader =
    header === undefined ? (
      <UniversalHeader pageDepth={1} onMenuClick={onMenuClick} />
    ) : (
      header
    );

  return (
    <div
      className={`${prefix}-shell`}
      data-hub-page-shell={prefix}
      style={{
        minHeight: '100dvh',
        width: '100%',
        maxWidth: '100vw',
        // `hidden` creates a non-scrolling overflow container and prevents the
        // approved sticky header from following deep-link auto-scrolls. `clip`
        // keeps the same horizontal containment without breaking sticky.
        overflowX: 'clip',
        overflowY: 'visible',
        boxSizing: 'border-box',
        background,
      }}
    >
      {!isInIframe && resolvedHeader}
      <main className={`${prefix}-page-container`}>
        <div className={`${prefix}-feed-layout`}>
          <div className={`${prefix}-feed-column`}>{children}</div>
          {sidebar ? <aside className={`${prefix}-contacts-sidebar`}>{sidebar}</aside> : null}
        </div>
      </main>
      <style dangerouslySetInnerHTML={{ __html: shellCss(prefix, maxWidth) }} />
    </div>
  );
}
