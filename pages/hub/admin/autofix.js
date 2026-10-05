import Head from 'next/head';

export default function RetiredAutofixPage() {
  return (
    <>
      <Head>
        <title>Deployment Autofix Retired | Smarter.Poker</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      <main className="retiredShell">
        <section className="retiredPanel" aria-labelledby="retired-title">
          <div className="statusRail" aria-hidden="true" />
          <p className="eyebrow">Stable Admin · Release Control</p>
          <h1 id="retired-title">Deployment Autofix Retired</h1>
          <p className="lead">
            Automated Release Repair Is Permanently Disabled. This Surface Does Not Poll Providers,
            Call An AI Model, Change Source Code, Or Initiate A Deployment.
          </p>
          <div className="protocol" aria-label="Current release protocol">
            <span>Protected Pull Request</span>
            <span>Required Checks</span>
            <span>Approved Publication</span>
            <span>Live Verification</span>
          </div>
          <p className="note">
            Authenticated Deployment Failures Continue To Be Recorded In The First-Party Operational Inbox For Operator Review.
          </p>
        </section>
      </main>
      <style jsx>{`
        .retiredShell {
          min-height: calc(100vh - 64px);
          display: grid;
          place-items: center;
          padding: 28px 16px;
          color: #edf7ff;
          background:
            radial-gradient(circle at 50% 0%, rgba(0, 153, 255, 0.13), transparent 38%),
            linear-gradient(180deg, #06111a 0%, #02070c 72%);
          font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .retiredPanel {
          position: relative;
          width: min(760px, 100%);
          overflow: hidden;
          padding: 32px 24px 26px;
          border: 1px solid #426980;
          border-radius: 18px;
          background: linear-gradient(145deg, rgba(10, 26, 38, 0.98), rgba(3, 10, 16, 0.99));
          box-shadow: inset 0 1px 0 rgba(208, 237, 255, 0.15), 0 24px 80px rgba(0, 0, 0, 0.52);
        }
        .statusRail { position: absolute; inset: 0 auto 0 0; width: 4px; background: #1597df; }
        .eyebrow { margin: 0 0 12px; color: #7ecbff; font-size: 0.72rem; font-weight: 800; letter-spacing: 0.18em; text-transform: uppercase; }
        h1 { margin: 0; font-size: clamp(2rem, 7vw, 3.8rem); line-height: 0.98; letter-spacing: -0.045em; }
        .lead { margin: 22px 0; max-width: 64ch; color: #b8c9d4; font-size: 1rem; line-height: 1.7; }
        .protocol { display: grid; grid-template-columns: 1fr; gap: 8px; counter-reset: step; }
        .protocol span { counter-increment: step; padding: 12px 14px; border: 1px solid #29485a; border-radius: 10px; color: #d9edf8; background: #071722; font-size: 0.82rem; font-weight: 750; letter-spacing: 0.04em; }
        .protocol span::before { content: "0" counter(step); margin-right: 12px; color: #28aef7; font-variant-numeric: tabular-nums; }
        .note { margin: 22px 0 0; padding-top: 18px; border-top: 1px solid #254354; color: #8fa8b7; font-size: 0.85rem; line-height: 1.55; }
        @media (min-width: 640px) {
          .retiredShell { padding: 48px 28px; }
          .retiredPanel { padding: 48px 46px 40px; border-radius: 22px; }
          .protocol { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
      `}</style>
    </>
  );
}
