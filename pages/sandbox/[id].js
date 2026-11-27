/**
 * Retired Shared Sandbox Scenario
 *
 * Historical share rows contain browser-authored scenario snapshots. They do
 * not carry the signed question, answer, decision-tree, or solver provenance
 * required for an authoritative replay. Keep old links useful without loading
 * or forwarding their unsealed payload into any analysis surface.
 */
import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, ShieldCheck } from 'lucide-react';
import PersonalAssistantCopyPolicy from '../../src/components/personal-assistant/PersonalAssistantCopyPolicy';
import UniversalHeader from '../../src/components/ui/UniversalHeader';
import HamburgerMenu from '../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../src/config/hamburgerMenus';
import { getAuthUser } from '../../src/lib/authUtils';
import { useModalHistory } from '../../src/hooks/useModalHistory';
import { PAStyles } from '../../src/components/sandbox/paKit';
import { T, F, S, FONT, btn } from '../../src/components/sandbox/paTokens';

const SHARE_ID_RE = /^[A-Za-z0-9]{4,16}$/;

export default function RetiredSharedScenario({ validShareId }) {
  const [user, setUser] = useState(null);
  const [showMenu, setShowMenu] = useState(false);
  const closeMenu = useCallback(() => setShowMenu(false), []);
  useModalHistory(showMenu, closeMenu);

  useEffect(() => {
    setUser(getAuthUser());
  }, []);

  const menuConfig = getMenuConfig('personal-assistant', user, {}, {});

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: T.bg,
        color: T.text,
        display: 'flex',
        flexDirection: 'column',
        overflowX: 'clip',
        fontFamily: FONT,
      }}
    >
      <PersonalAssistantCopyPolicy />
      <PAStyles />
      <Head>
        <title>Shared Scenario Retired | Smarter.Poker</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta
          name="description"
          content="This legacy scenario requires verified Training or an audited hand-history review."
        />
      </Head>

      <UniversalHeader pageDepth={2} onMenuClick={() => setShowMenu(true)} />
      <HamburgerMenu
        isOpen={showMenu}
        onClose={closeMenu}
        direction="left"
        theme="pa"
        user={user}
        menuItems={menuConfig.menuItems}
        bottomLinks={menuConfig.bottomLinks}
      />

      <main
        className="shared-sandbox-page"
        data-training-authority="verified-evidence-required"
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: `${S.xl}px max(16px, env(safe-area-inset-left, 0px))`,
          paddingTop: 'calc(24px + env(safe-area-inset-top, 0px))',
          paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
          textAlign: 'center',
        }}
      >
        <section
          aria-labelledby="retired-share-title"
          style={{
            width: 'min(100%, 560px)',
            padding: 'clamp(16px, 4vw, 24px)',
            border: `1px solid ${T.border}`,
            borderTopColor: T.borderHi,
            borderRadius: 7,
            background:
              'radial-gradient(ellipse at 90% -40%, rgba(30, 56, 83, 0.48), transparent 63%), linear-gradient(145deg, #091727, #030b14 74%)',
          }}
        >
          <div
            aria-hidden="true"
            style={{
              width: 48,
              height: 48,
              margin: `0 auto ${S.md}px`,
              display: 'grid',
              placeItems: 'center',
              border: `1px solid ${T.border}`,
              borderTopColor: T.borderHi,
              borderRadius: 7,
              background: 'linear-gradient(155deg, #12273b, #07111c 70%)',
              color: T.accent,
            }}
          >
            {validShareId ? (
              <ShieldCheck size={28} strokeWidth={1.8} />
            ) : (
              <AlertTriangle size={28} strokeWidth={1.8} />
            )}
          </div>

          <p
            style={{
              margin: `0 0 ${S.sm}px`,
              color: T.accent,
              fontSize: F.caption,
              fontWeight: 800,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
            }}
          >
            Verified Evidence Required
          </p>
          <h1
            id="retired-share-title"
            style={{ margin: `0 0 ${S.md}px`, fontSize: F.h2, lineHeight: 1.12, fontWeight: 900 }}
          >
            {validShareId ? 'Legacy Shared Scenario Retired' : 'Shared Scenario Link Invalid'}
          </h1>
          <p style={{ margin: `0 0 ${S.lg}px`, color: T.textMuted, fontSize: F.bodySm, lineHeight: 1.6 }}>
            {validShareId
              ? 'This Link Contains An Unsealed Browser Snapshot, Not A Signed Hand History Or Provenance-Complete Solver Artifact. It Cannot Be Replayed, Graded, Or Restored As Exact Analysis.'
              : 'This Link Does Not Contain A Valid Legacy Share Identifier. No Scenario Was Loaded Or Graded.'}
          </p>

          <div style={{ display: 'grid', gap: S.sm }}>
            <a
              href="/hub/training/hand-history-upload?source=retired-shared-sandbox"
              className="pa-btn"
              style={{ ...btn('primary'), width: '100%', minHeight: 48, textDecoration: 'none' }}
            >
              Open Audited Hand Review
              <ArrowRight size={18} strokeWidth={2} aria-hidden="true" />
            </a>
            <a
              href="/hub/training?source=retired-shared-sandbox"
              className="pa-btn"
              style={{ ...btn('secondary'), width: '100%', minHeight: 48, textDecoration: 'none' }}
            >
              Open Verified Training
            </a>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: S.sm }}>
              <Link
                href="/hub/personal-assistant/leaks?source=retired-shared-sandbox"
                className="pa-btn"
                style={{ ...btn('secondary'), width: '100%', minHeight: 44, textDecoration: 'none' }}
              >
                Leak Finder
              </Link>
              <Link
                href="/hub/personal-assistant"
                className="pa-btn"
                style={{ ...btn('secondary'), width: '100%', minHeight: 44, textDecoration: 'none' }}
              >
                Personal Assistant
              </Link>
            </div>
          </div>

          <p style={{ margin: `${S.lg}px 0 0`, color: T.textMuted, fontSize: F.caption, lineHeight: 1.5 }}>
            No Answer, Frequency, EV, Accuracy, Reward, Streak, Or Progress Is Created Here.
          </p>
        </section>
      </main>
    </div>
  );
}

export async function getServerSideProps(context) {
  context.res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  context.res.setHeader('X-Robots-Tag', 'noindex, nofollow');

  const id = context.params?.id;
  return {
    props: {
      validShareId: typeof id === 'string' && SHARE_ID_RE.test(id),
    },
  };
}
