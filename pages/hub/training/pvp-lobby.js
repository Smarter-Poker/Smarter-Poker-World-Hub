import Head from 'next/head';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';

const PRACTICE_ROUTE = '/hub/training/arena/mtt-015?level=1&source=pvp-lobby';

const capabilityRows = [
  ['Real-Player Matchmaking', 'Not Live'],
  ['Realtime Match State', 'Not Live'],
  ['Ranked Ratings', 'Not Live'],
  ['Heads-Up Curriculum', 'Available'],
];

/**
 * Until a server-authoritative realtime match service exists, this page must
 * not manufacture a queue, scores, opponents, ratings, prizes, or match
 * history. The available heads-up practice route remains fully functional.
 */
export default function PvPLobbyPage() {
  return (
    <>
      <Head>
        <title>PvP Lobby | Smarter.Poker Training</title>
        <meta name="description" content="Competitive training status and verified heads-up practice." />
      </Head>
      <UniversalHeader pageDepth={2} />
      <main className="sp-training-command sp-training-command--pvp" style={{ minHeight: 'calc(100vh - 70px)', padding: 'clamp(26px, 7vw, 82px) 18px', background: 'radial-gradient(circle at 50% 8%, #18394d 0, #060a11 44%, #020407 100%)', color: '#f7fbff' }}>
        <section className="sp-command-main" style={{ position: 'relative', maxWidth: 920, margin: '0 auto', border: '1px solid rgba(157,232,255,.46)', background: 'linear-gradient(145deg, rgba(18,42,59,.98), rgba(4,9,15,.99))', boxShadow: 'inset 0 1px rgba(255,255,255,.25), inset 0 -24px 55px rgba(0,0,0,.42), 0 32px 76px rgba(0,0,0,.55)', padding: 'clamp(24px, 5vw, 48px)' }}>
          <div aria-hidden="true" style={{ position: 'absolute', inset: 7, border: '1px solid rgba(93,201,240,.16)', pointerEvents: 'none' }} />
          <div style={{ position: 'relative' }}>
            <div className="sp-command-header" style={{ display: 'inline-flex', alignItems: 'center', gap: 9, color: '#ffcc71', fontSize: 10, fontWeight: 900, letterSpacing: '.18em', textTransform: 'uppercase' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ffb84d', boxShadow: '0 0 12px rgba(255,184,77,.8)' }} />
              Competitive Service Status
            </div>
            <h1 style={{ margin: '14px 0 10px', fontSize: 'clamp(34px, 7vw, 66px)', lineHeight: .96, textTransform: 'capitalize' }}>PvP Lobby</h1>
            <p style={{ margin: 0, maxWidth: 700, color: '#b8cad7', lineHeight: 1.7 }}>Real-player matchmaking is not connected to a production realtime match service. The lobby will not present simulated searches, invented opponents, random scores, ratings, or diamond rewards as real PvP activity.</p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10, marginTop: 28 }}>
              {capabilityRows.map(([label, value]) => (
                <div key={label} style={{ padding: '17px', border: '1px solid rgba(132,213,242,.18)', background: 'linear-gradient(180deg, rgba(39,75,96,.34), rgba(3,9,14,.68))', boxShadow: 'inset 0 1px rgba(255,255,255,.12)' }}>
                  <div style={{ color: '#6f8b9e', fontSize: 9, fontWeight: 900, letterSpacing: '.12em', textTransform: 'uppercase' }}>{label}</div>
                  <div style={{ marginTop: 6, color: value === 'Available' ? '#77f2b4' : '#d8e7ef', fontSize: 14, fontWeight: 800 }}>{value}</div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 28, padding: '22px', border: '1px solid rgba(102,211,246,.24)', background: 'rgba(0,0,0,.22)' }}>
              <div style={{ color: '#82e7ff', fontSize: 12, fontWeight: 900, textTransform: 'capitalize' }}>Available Now: Heads-Up Duel</div>
              <p style={{ margin: '8px 0 0', color: '#a9becd', fontSize: 13, lineHeight: 1.65 }}>Practice heads-up tournament decisions on the Club Arena training table. Every decision uses the authored scenario corpus, explicit grading, and manual Next progression.</p>
              <a href={PRACTICE_ROUTE} style={{ display: 'inline-flex', minHeight: 50, alignItems: 'center', justifyContent: 'center', padding: '0 22px', marginTop: 18, border: '1px solid #a5efff', background: 'linear-gradient(180deg, #2a6077, #07131d)', boxShadow: 'inset 0 1px rgba(255,255,255,.25), 0 9px 22px rgba(0,0,0,.4)', color: '#fff', fontSize: 13, fontWeight: 900, textDecoration: 'none', textTransform: 'capitalize' }}>
                Enter Heads-Up Training →
              </a>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
