import Head from 'next/head';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';

const statusRows = [
  ['Beacon Service', 'Not Configured'],
  ['Bluetooth Bridge', 'Unavailable In Web App'],
  ['Account Pairing', 'Not Connected'],
  ['Imported Hands', 'Available'],
];

/**
 * There is no production beacon discovery or pairing API today. The previous
 * page generated a beacon name, signal, battery level, and firmware with
 * Math.random(), then emitted a completed training session. This surface now
 * reports the integration state honestly and points to the supported import.
 */
export default function LiveHudSyncPage() {
  return (
    <>
      <Head>
        <title>Live HUD Sync | Smarter.Poker Training</title>
        <meta name="description" content="Live table integration status and supported hand import." />
      </Head>
      <UniversalHeader pageDepth={2} />
      <main style={{ minHeight: 'calc(100vh - 70px)', padding: 'clamp(26px, 7vw, 82px) 18px', background: 'radial-gradient(circle at 50% 8%, #14394f 0, #060b12 43%, #020407 100%)', color: '#f7fbff' }}>
        <section style={{ position: 'relative', maxWidth: 860, margin: '0 auto', border: '1px solid rgba(157,232,255,.46)', background: 'linear-gradient(145deg, rgba(18,42,59,.98), rgba(4,9,15,.99))', boxShadow: 'inset 0 1px rgba(255,255,255,.25), inset 0 -24px 55px rgba(0,0,0,.42), 0 32px 76px rgba(0,0,0,.55)', padding: 'clamp(24px, 5vw, 48px)' }}>
          <div aria-hidden="true" style={{ position: 'absolute', inset: 7, border: '1px solid rgba(93,201,240,.16)', pointerEvents: 'none' }} />
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9, color: '#ffcc71', fontSize: 10, fontWeight: 900, letterSpacing: '.18em', textTransform: 'uppercase' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ffb84d', boxShadow: '0 0 12px rgba(255,184,77,.8)' }} />
              Integration Status
            </div>
            <h1 style={{ margin: '14px 0 10px', fontSize: 'clamp(32px, 7vw, 62px)', lineHeight: .98, textTransform: 'capitalize' }}>Live HUD Sync</h1>
            <p style={{ margin: 0, maxWidth: 670, color: '#b8cad7', lineHeight: 1.7 }}>Physical beacon discovery and Bluetooth pairing are not connected to a production service yet. This page will not simulate a device, connection, signal strength, battery, or firmware version.</p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10, marginTop: 28 }}>
              {statusRows.map(([label, value]) => (
                <div key={label} style={{ padding: '16px 17px', border: '1px solid rgba(132,213,242,.18)', background: 'linear-gradient(180deg, rgba(39,75,96,.34), rgba(3,9,14,.68))', boxShadow: 'inset 0 1px rgba(255,255,255,.12)' }}>
                  <div style={{ color: '#6f8b9e', fontSize: 9, fontWeight: 900, letterSpacing: '.12em', textTransform: 'uppercase' }}>{label}</div>
                  <div style={{ marginTop: 6, color: value === 'Available' ? '#77f2b4' : '#d8e7ef', fontSize: 14, fontWeight: 800 }}>{value}</div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 28, padding: '20px', border: '1px solid rgba(102,211,246,.24)', background: 'rgba(0,0,0,.22)' }}>
              <div style={{ color: '#82e7ff', fontSize: 12, fontWeight: 900, textTransform: 'capitalize' }}>Supported Workflow</div>
              <p style={{ margin: '8px 0 0', color: '#a9becd', fontSize: 13, lineHeight: 1.65 }}>Import a real hand-history file for analysis and review. Imported decisions are parsed and audited; they are not replaced with generated device telemetry.</p>
              <a href="/hub/training/hand-history-upload" style={{ display: 'inline-flex', minHeight: 48, alignItems: 'center', padding: '0 20px', marginTop: 18, border: '1px solid #a5efff', background: 'linear-gradient(180deg, #2a6077, #07131d)', color: '#fff', fontSize: 13, fontWeight: 900, textDecoration: 'none', textTransform: 'capitalize' }}>
                Open Hand History Import →
              </a>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
