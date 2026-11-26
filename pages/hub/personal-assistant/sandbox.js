/**
 * Verified-Evidence Boundary For The Former Virtual Sandbox
 *
 * This route previously graded locally authored/heuristic answers and could
 * display approximate database matches as solver authority. Keep the route and
 * the approved global navigation intact, but never offer analysis or grading
 * unless the exact decision is backed by the signed Training pipeline.
 */

import { useCallback, useState } from 'react';
import Link from 'next/link';
import SEOHead from '../../../src/components/seo/SEOHead';
import HubPageSummary from '../../../src/components/seo/HubPageSummary';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import HamburgerMenu from '../../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../../src/config/hamburgerMenus';
import { useHaptics } from '../../../src/hooks/useHaptics';
import { useModalHistory } from '../../../src/hooks/useModalHistory';
import PersonalAssistantCopyPolicy from '../../../src/components/personal-assistant/PersonalAssistantCopyPolicy';

const DESTINATIONS = [
  {
    title: 'Open Verified Training Hub',
    description: 'Choose A Game And Start A Signed Attempt With Server-Delivered Questions And Grading.',
    href: '/hub/training?source=assistant-sandbox-retired',
    primary: true,
  },
  {
    title: 'Open Audited Spot Study',
    description: 'Review An Answer-Revealed Audited Artifact In An Explicitly Ungraded Study Utility.',
    href: '/hub/training/spot-trainer?source=assistant-sandbox-retired',
    primary: false,
  },
  {
    title: 'Open Hand History Review',
    description: 'Upload Real Hand Context For A Review That Preserves Its Evidence Boundary.',
    href: '/hub/training/hand-history-upload?source=assistant-sandbox-retired',
    primary: false,
  },
  {
    title: 'Open Leak Finder',
    description: 'Audit Your Persisted Club Arena Hands Against Verified Solver Evidence And Track Active Leaks.',
    href: '/hub/personal-assistant/leaks?source=assistant-sandbox-retired',
    primary: false,
  },
  {
    title: 'Log A Live Poker Spot',
    description: 'Type A Live Hand In About 15 Seconds Or Paste Hands From Another Site. Only Verified Solver Matches Are Graded.',
    href: '/hub/personal-assistant/leaks?quickspot=1&source=assistant-sandbox-retired',
    primary: false,
  },
  {
    title: 'Open Club Arena Hand History',
    description: 'Replay Your Persisted Club Arena Cash And Tournament Hands Directly Under Your Own Session.',
    href: '/hub/club-arena/hand-history?source=assistant-sandbox-retired',
    primary: false,
  },
];

export default function VerifiedEvidenceSandboxBoundary() {
  const [showMenu, setShowMenu] = useState(false);
  const menuConfig = getMenuConfig('hub-home', null, {}, {});
  const haptic = useHaptics();
  const closeMenu = useCallback(() => setShowMenu(false), []);
  useModalHistory(showMenu, closeMenu);

  const handleLinkTap = (event, href) => {
    haptic('light');
    if (href.startsWith('/hub/club-arena/') && typeof window !== 'undefined') {
      event.preventDefault();
      window.location.assign(href);
    }
  };

  return (
    <div className="sandbox-boundary-page">
      <PersonalAssistantCopyPolicy />
      <SEOHead
        title="Scenario Analysis: Verified Evidence"
        description="Approximate Scenario Grading Is Retired On Smarter.Poker. Continue In Our Evidence-Backed GTO Training And Audited Solver Spot Study Experiences."
        canonical="/hub/personal-assistant/sandbox"
      />

      <UniversalHeader pageDepth={2} onMenuClick={() => setShowMenu(true)} />
      <HamburgerMenu
        isOpen={showMenu}
        onClose={closeMenu}
        direction="left"
        theme="pa"
        user={null}
        showProfile={false}
        menuItems={menuConfig.menuItems}
        bottomLinks={menuConfig.bottomLinks}
      />

      <main
        className="sandbox-workspace"
        data-training-authority="verified-evidence-required"
        aria-labelledby="sandbox-boundary-title"
      >
        <section className="boundary-console">
          <div className="console-status">
            <span className="status-light" aria-hidden="true" />
            Evidence Gate Active
          </div>

          <p className="eyebrow">Personal Assistant · Scenario Analysis</p>
          <h1 id="sandbox-boundary-title">Verified Evidence Required</h1>
          <p className="lead">
            The Previous Virtual Sandbox Could Substitute A Nearby Spot Or A Local Heuristic When
            An Exact Analysis Artifact Was Missing. Smarter.Poker Will Not Grade That Approximation,
            Display It As Exact Strategy, Or Record It As Training Progress.
          </p>

          <div className="evidence-panel" role="note" aria-label="Analysis Authority" data-tutorial="evidence-gate">
            <div>
              <span className="panel-label">Current Status</span>
              <strong>Approximate Analysis Retired</strong>
            </div>
            <div>
              <span className="panel-label">Required Source</span>
              <strong>Signed Training Attempt</strong>
            </div>
            <div>
              <span className="panel-label">Recorded Here</span>
              <strong>Nothing</strong>
            </div>
          </div>

          <p className="assurance-copy">
            No Answer, Frequency, EV, Accuracy, Streak, Reward, Study Record, Or Progress Is Created
            On This Page. Choose An Evidence-Backed Destination To Continue.
          </p>

          <div className="sandbox-command-bar" aria-label="Verified Training Destinations" data-tutorial="sandbox-destinations">
            {DESTINATIONS.map((destination) => (
              <Link
                key={destination.href}
                href={destination.href}
                className={destination.primary ? 'destination primary' : 'destination'}
                onClick={(event) => handleLinkTap(event, destination.href)}
              >
                <span>{destination.title}</span>
                <small>{destination.description}</small>
              </Link>
            ))}
          </div>

          <Link
            href="/hub/personal-assistant"
            className="back-link"
            onClick={(event) => handleLinkTap(event, '/hub/personal-assistant')}
          >
            Back To Personal Assistant
          </Link>
        </section>
        <details className="summary-disclosure">
          <summary>
            <span>About Scenario Analysis &amp; Verified Evidence</span>
            <small>Platform Reference</small>
          </summary>
          <div className="summary-disclosure-body">
            <HubPageSummary page="personal-assistant-sandbox" />
          </div>
        </details>
      </main>

      <style jsx>{`
        /* Approved MTT Lobby & Arena Workspace Design System:
           #040d18 / #05080c-#020407 obsidian-navy console canvas, 600px centered interior,
           1px solid rgba(140, 161, 180, 0.24) hairline borders, royal-blue primary CTA. */
        .sandbox-boundary-page {
          min-height: 100dvh;
          width: 100%;
          max-width: 100vw;
          overflow-x: clip;
          color: #f1f5fc;
          background: linear-gradient(180deg, #05080c 0%, #040d18 52%, #020407 100%);
          font-family: Arial, Inter, -apple-system, sans-serif;
        }

        .sandbox-workspace {
          width: min(100% - 12px, 600px);
          margin: 0 auto;
          padding: 10px 0 max(24px, env(safe-area-inset-bottom));
        }

        .boundary-console {
          position: relative;
          overflow: hidden;
          padding: 16px;
          border: 1px solid rgba(140, 161, 180, 0.24);
          border-top-color: #aec0d0;
          border-radius: 7px;
          background:
            radial-gradient(ellipse at 90% -40%, rgba(30, 56, 83, 0.48), transparent 63%),
            linear-gradient(145deg, #091727, #030b14 74%);
        }

        .console-status {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          min-height: 28px;
          padding: 0 10px;
          border: 1px solid rgba(255, 198, 109, 0.45);
          border-radius: 6px;
          color: #ffe08a;
          background: rgba(75, 48, 5, 0.35);
          font-size: 12px;
          font-weight: 700;
        }

        .status-light {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #ffc66d;
        }

        .eyebrow {
          margin: 10px 0 4px;
          color: #83deff;
          font: 700 12px / 1.2 'Rajdhani', 'Roboto Condensed', 'Arial Narrow', Arial, sans-serif;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }

        h1 {
          margin: 0;
          color: #f1f5fc;
          font: 800 clamp(22px, 5vw, 28px) / 1.08 'Rajdhani', 'Roboto Condensed', 'Arial Narrow', Arial, sans-serif;
          letter-spacing: -0.01em;
        }

        .lead {
          margin: 8px 0 0;
          color: #b6c8d6;
          font-size: 13px;
          line-height: 1.5;
        }

        .evidence-panel {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 6px;
          margin-top: 12px;
        }

        .evidence-panel > div {
          min-width: 0;
          padding: 10px;
          border: 1px solid rgba(140, 161, 180, 0.24);
          border-top-color: #aec0d0;
          border-radius: 7px;
          background: linear-gradient(155deg, #12273b, #07111c 70%);
        }

        .panel-label {
          display: block;
          margin-bottom: 3px;
          color: #9aabba;
          font: 700 12px / 1.2 'Rajdhani', 'Roboto Condensed', 'Arial Narrow', Arial, sans-serif;
          text-transform: uppercase;
        }

        .evidence-panel strong {
          color: #f1f5fc;
          font-size: 13px;
          line-height: 1.3;
        }

        .assurance-copy {
          margin: 12px 0 0;
          padding: 10px 12px;
          border-left: 3px solid #56d8ff;
          border-radius: 4px;
          color: #dce5ef;
          background: rgba(8, 124, 250, 0.12);
          font-size: 12px;
          line-height: 1.45;
        }

        .sandbox-command-bar {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
          margin-top: 12px;
        }

        .destination,
        .sandbox-command-bar :global(a.destination) {
          display: block;
          min-height: 68px;
          padding: 11px 12px;
          border: 1px solid rgba(140, 161, 180, 0.24);
          border-top-color: #aec0d0;
          border-radius: 6px;
          color: #f1f5fc;
          background: linear-gradient(180deg, #152639 0%, #06111e 65%);
          text-align: left;
          text-decoration: none;
          cursor: pointer;
        }

        .destination.primary,
        .sandbox-command-bar :global(a.destination.primary) {
          grid-column: 1 / -1;
          border-color: #56d8ff;
          border-top-color: #b3eaff;
          background: linear-gradient(180deg, #087cfa 0%, #0044ac 55%, #002b68 100%);
        }

        .destination:focus-visible,
        .sandbox-command-bar :global(a.destination:focus-visible),
        .back-link:focus-visible,
        .boundary-console :global(a.back-link:focus-visible) {
          outline: 2px solid #83deff;
          outline-offset: 2px;
        }

        .destination span,
        .destination small,
        .sandbox-command-bar :global(a.destination span),
        .sandbox-command-bar :global(a.destination small) {
          display: block;
        }

        .destination span,
        .sandbox-command-bar :global(a.destination span) {
          font: 700 14px / 1.15 'Rajdhani', 'Roboto Condensed', 'Arial Narrow', Arial, sans-serif;
        }

        .destination small,
        .sandbox-command-bar :global(a.destination small) {
          margin-top: 4px;
          color: #dce5ef;
          font-size: 12px;
          line-height: 1.35;
        }

        .back-link,
        .boundary-console :global(a.back-link) {
          display: inline-flex;
          align-items: center;
          margin-top: 12px;
          min-height: 44px;
          border: 0;
          color: #83deff;
          background: transparent;
          font: 700 13px 'Rajdhani', 'Roboto Condensed', 'Arial Narrow', Arial, sans-serif;
          cursor: pointer;
          text-decoration: underline;
          text-underline-offset: 4px;
        }

        .summary-disclosure {
          margin-top: 10px;
          border: 1px solid rgba(140, 161, 180, 0.24);
          border-top-color: #aec0d0;
          border-radius: 7px;
          background: linear-gradient(145deg, #091727, #030b14 74%);
          overflow: clip;
        }

        .summary-disclosure > summary {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          min-height: 44px;
          padding: 10px 14px;
          cursor: pointer;
          color: #f1f5fc;
          font: 700 13px / 1.2 'Rajdhani', 'Roboto Condensed', 'Arial Narrow', Arial, sans-serif;
          list-style: none;
          user-select: none;
        }

        .summary-disclosure > summary::-webkit-details-marker {
          color: transparent;
          width: 0;
        }

        .summary-disclosure > summary small {
          color: #9aabba;
          font: 600 12px / 1.2 Arial, sans-serif;
        }

        .summary-disclosure-body {
          border-top: 1px solid rgba(140, 161, 180, 0.24);
          padding: 8px 12px;
        }

        @media (max-width: 768px) {
          .sandbox-workspace {
            width: calc(100% - 12px);
            padding-top: 8px;
          }

          .boundary-console {
            padding: 12px;
          }

          .evidence-panel,
          .sandbox-command-bar {
            grid-template-columns: 1fr;
          }

          .destination,
          .sandbox-command-bar :global(a.destination) {
            min-height: 62px;
          }
        }
      `}</style>
    </div>
  );
}
