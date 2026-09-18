/**
 * Verified-Evidence Boundary For The Former Virtual Sandbox
 *
 * This route previously graded locally authored/heuristic answers and could
 * display approximate database matches as solver authority. Keep the route and
 * the approved global navigation intact, but never offer analysis or grading
 * unless the exact decision is backed by the signed Training pipeline.
 */

import { useCallback, useState } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../../src/components/seo/SEOHead';
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
];

export default function VerifiedEvidenceSandboxBoundary() {
  const router = useRouter();
  const [showMenu, setShowMenu] = useState(false);
  const menuConfig = getMenuConfig('hub-home', null, {}, {});
  const haptic = useHaptics();
  const closeMenu = useCallback(() => setShowMenu(false), []);
  useModalHistory(showMenu, closeMenu);

  const go = (href) => {
    haptic('light');
    router.push(href);
  };

  return (
    <div className="sandbox-boundary-page">
      <PersonalAssistantCopyPolicy />
      <SEOHead
        title="Scenario Analysis: Verified Evidence"
        description="Approximate scenario grading is retired. Continue in an evidence-backed Smarter.Poker Training experience."
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
              <button
                key={destination.href}
                type="button"
                className={destination.primary ? 'destination primary' : 'destination'}
                onClick={() => go(destination.href)}
              >
                <span>{destination.title}</span>
                <small>{destination.description}</small>
              </button>
            ))}
          </div>

          <button
            type="button"
            className="back-link"
            onClick={() => go('/hub/personal-assistant')}
          >
            Back To Personal Assistant
          </button>
        </section>
      </main>

      <style jsx>{`
        /* MOBILE PHASE 4. 100dvh, never 100vh: on iOS Safari 100vh is the
           TALLEST the viewport ever gets, so the last rows sit under the URL
           bar. And overflow-x: clip, never hidden: a bare hidden makes this a
           scroll container and re-parents every fixed descendant to it. */
        .sandbox-boundary-page {
          min-height: 100dvh;
          width: 100%;
          max-width: 100vw;
          overflow-x: clip;
          color: #eaf8ff;
          background:
            radial-gradient(circle at 50% -5%, rgba(44, 189, 255, 0.2), transparent 38%),
            linear-gradient(180deg, #07131e 0%, #02070c 58%, #010306 100%);
        }

        .sandbox-workspace {
          width: min(100% - 28px, 980px);
          margin: 0 auto;
          padding: clamp(34px, 7vw, 76px) 0 24px;
        }

        .boundary-console {
          position: relative;
          overflow: hidden;
          padding: clamp(24px, 6vw, 54px);
          border: 1px solid rgba(127, 222, 255, 0.42);
          background:
            linear-gradient(145deg, rgba(30, 61, 79, 0.97), rgba(5, 14, 22, 0.99) 54%, rgba(7, 30, 45, 0.98));
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.24),
            inset 0 -30px 60px rgba(0, 0, 0, 0.46),
            0 30px 80px rgba(0, 0, 0, 0.55),
            0 0 42px rgba(33, 182, 255, 0.1);
        }

        .boundary-console::before {
          content: '';
          position: absolute;
          inset: 10px;
          pointer-events: none;
          border: 1px solid rgba(255, 255, 255, 0.06);
        }

        .console-status {
          position: relative;
          z-index: 1;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-height: 32px;
          padding: 0 12px;
          border: 1px solid rgba(255, 200, 80, 0.45);
          color: #ffe08a;
          background: rgba(75, 48, 5, 0.3);
          font-size: 12px;
          font-weight: 900;
          letter-spacing: 0.07em;
        }

        .status-light {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #ffc247;
          box-shadow: 0 0 13px rgba(255, 194, 71, 0.9);
        }

        .eyebrow {
          position: relative;
          z-index: 1;
          margin: 30px 0 8px;
          color: #7edfff;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.13em;
        }

        h1 {
          position: relative;
          z-index: 1;
          margin: 0;
          max-width: 760px;
          color: #f2fbff;
          font-family: var(--font-orbitron), 'Orbitron', sans-serif;
          font-size: clamp(34px, 7vw, 68px);
          line-height: 0.98;
          letter-spacing: -0.035em;
          text-shadow: 0 2px #00121c, 0 0 28px rgba(84, 217, 255, 0.28);
        }

        .lead {
          position: relative;
          z-index: 1;
          max-width: 760px;
          margin: 22px 0 0;
          color: #c4d7df;
          font-size: clamp(14px, 2vw, 17px);
          line-height: 1.75;
        }

        .evidence-panel {
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 1px;
          margin-top: 28px;
          border: 1px solid rgba(111, 220, 255, 0.28);
          background: rgba(111, 220, 255, 0.2);
        }

        .evidence-panel > div {
          min-width: 0;
          padding: 16px;
          background: rgba(2, 11, 17, 0.92);
        }

        .panel-label {
          display: block;
          margin-bottom: 6px;
          color: #75939f;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.08em;
          line-height: 1.35;
        }

        .evidence-panel strong {
          color: #ddf7ff;
          font-size: 13px;
          line-height: 1.35;
        }

        .assurance-copy {
          position: relative;
          z-index: 1;
          margin: 20px 0 0;
          padding: 14px 16px;
          border-left: 3px solid #5bdcff;
          color: #c8e6ef;
          background: rgba(0, 174, 255, 0.08);
          font-size: 13px;
          line-height: 1.65;
        }

        .sandbox-command-bar {
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
          margin-top: 24px;
        }

        .destination {
          min-height: 92px;
          padding: 17px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          color: #f2fbff;
          background: linear-gradient(180deg, rgba(45, 57, 66, 0.96), rgba(7, 13, 18, 0.99));
          box-shadow: inset 0 1px rgba(255, 255, 255, 0.2), 0 12px 26px rgba(0, 0, 0, 0.35);
          text-align: left;
          cursor: pointer;
        }

        .destination.primary {
          border-color: rgba(122, 225, 255, 0.76);
          background: linear-gradient(180deg, #2b708e 0%, #0a2c40 50%, #05151f 100%);
        }

        .destination span,
        .destination small {
          display: block;
        }

        .destination span {
          font-size: 14px;
          font-weight: 900;
        }

        .destination small {
          margin-top: 6px;
          color: #b5cbd4;
          font-size: 12px;
          line-height: 1.5;
        }

        .back-link {
          position: relative;
          z-index: 1;
          margin-top: 20px;
          min-height: 44px;
          border: 0;
          color: #91bed0;
          background: transparent;
          font-weight: 800;
          cursor: pointer;
          text-decoration: underline;
          text-underline-offset: 4px;
        }

        @media (max-width: 768px) {
          .sandbox-workspace {
            width: min(100% - 20px, 980px);
            padding-top: 22px;
          }

          .boundary-console {
            padding: 24px 18px 28px;
          }

          .evidence-panel,
          .sandbox-command-bar {
            grid-template-columns: 1fr;
          }

          .destination {
            min-height: 86px;
          }
        }
      `}</style>
    </div>
  );
}
