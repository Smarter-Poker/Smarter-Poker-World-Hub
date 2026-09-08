/**
 * Retired Shared Sandbox Scenario
 *
 * Historical share rows contain browser-authored scenario snapshots. They do
 * not carry the signed question, answer, decision-tree, or solver provenance
 * required for an authoritative replay. Keep old links useful without loading
 * or forwarding their unsealed payload into any analysis surface.
 */
import Head from 'next/head';
import { AlertTriangle, ArrowRight, ShieldCheck } from 'lucide-react';
import PersonalAssistantCopyPolicy from '../../src/components/personal-assistant/PersonalAssistantCopyPolicy';
import { T, F, S, FONT, btn } from '../../src/components/sandbox/paTokens';

const SHARE_ID_RE = /^[A-Za-z0-9]{4,16}$/;

export default function RetiredSharedScenario({ validShareId }) {
  return (
    <main
      className="shared-sandbox-page"
      data-training-authority="verified-evidence-required"
      style={{
        minHeight: '100dvh',
        background: T.bg,
        color: T.text,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: `${S.xl}px max(16px, env(safe-area-inset-left, 0px))`,
        paddingTop: 'calc(24px + env(safe-area-inset-top, 0px))',
        paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
        fontFamily: FONT,
        textAlign: 'center',
      }}
    >
      <PersonalAssistantCopyPolicy />
      <Head>
        <title>Shared Scenario Retired | Smarter.Poker</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta
          name="description"
          content="This legacy scenario requires verified Training or an audited hand-history review."
        />
      </Head>

      <section
        aria-labelledby="retired-share-title"
        style={{
          width: 'min(100%, 520px)',
          padding: 'clamp(22px, 6vw, 38px)',
          border: '1px solid rgba(103, 232, 249, 0.34)',
          background:
            'linear-gradient(155deg, rgba(12, 28, 43, 0.98), rgba(3, 10, 18, 0.99))',
          boxShadow:
            '0 24px 70px rgba(0, 0, 0, 0.48), inset 0 1px rgba(255, 255, 255, 0.10)',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 58,
            height: 58,
            margin: `0 auto ${S.lg}px`,
            display: 'grid',
            placeItems: 'center',
            border: '1px solid rgba(103, 232, 249, 0.42)',
            background: 'rgba(8, 47, 73, 0.72)',
            color: T.accent,
            boxShadow: '0 0 28px rgba(34, 211, 238, 0.18)',
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
            style={{ ...btn('primary'), width: '100%', minHeight: 48, textDecoration: 'none' }}
          >
            Open Audited Hand Review
            <ArrowRight size={18} strokeWidth={2} aria-hidden="true" />
          </a>
          <a
            href="/hub/training?source=retired-shared-sandbox"
            style={{ ...btn('secondary'), width: '100%', minHeight: 48, textDecoration: 'none' }}
          >
            Open Verified Training
          </a>
        </div>

        <p style={{ margin: `${S.lg}px 0 0`, color: T.textMuted, fontSize: F.caption, lineHeight: 1.5 }}>
          No Answer, Frequency, EV, Accuracy, Reward, Streak, Or Progress Is Created Here.
        </p>
      </section>
    </main>
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
