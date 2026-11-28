/**
 * Digital Player Card
 * /hub/commander/player-card
 * QR code for instant check-in, quick actions, membership display
 */
import { useState, useEffect, useRef } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/router';
import SEOHead from '../../../src/components/seo/SEOHead';
import { ArrowLeft, QrCode, CreditCard, Users, Clock, Gift, Star, Loader2, RefreshCw, Trophy, Crown } from 'lucide-react';
import { useRequireAuth, getAccessToken } from '../../../src/lib/authUtils';
import useTrainingBus from '../../../src/hooks/useTrainingBus';
import CommanderPageShell from '../../../src/components/commander/CommanderPageShell';

const TIER_COLORS = {
  bronze: { bg: 'linear-gradient(135deg, #2A4560, #0EA5C6)', text: '#F2F7FF' },
  silver: { bg: 'linear-gradient(135deg, #6B7280, #D1D5DB)', text: '#F9FAFB' },
  gold: { bg: 'linear-gradient(135deg, #0E7490, #86DAFF)', text: '#F2F7FF' },
  platinum: { bg: 'linear-gradient(135deg, #1E3A5F, #60A5FA)', text: '#EBF5FF' },
  diamond: { bg: 'linear-gradient(135deg, #0C55C0, #BFE9FF)', text: '#F2F7FF' },
};

export default function PlayerCard() {
  const router = useRouter();
  const [qrData, setQrData] = useState(null);
  // 2026-07-25 audit fix: real scannable QR image (data URL) - the old SVG
  // dot pattern was decorative and could not be read by any scanner.
  const [qrImageUrl, setQrImageUrl] = useState(null);
  const [qrRefresh, setQrRefresh] = useState(0);
  const intervalRef = useRef(null);

  const { checking: authChecking } = useRequireAuth('/hub/commander/player-card');
  useTrainingBus('player-card');

  const getToken = () => getAccessToken();

  // QR rotation timer
  useEffect(() => {
    intervalRef.current = setInterval(() => setQrRefresh(r => r + 1), 30000);
    return () => clearInterval(intervalRef.current);
  }, []);

  // SWR-backed profile fetch
  const { data: player, isLoading: loading } = useSWR('/api/user/profile', (url) => {
    const token = getToken();
    if (!token) return null; // useRequireAuth handles redirect
    return fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(json => json.success || json.data ? (json.data || json) : null);
  });

  useEffect(() => {
    if (player) generateQR();
  }, [player, qrRefresh]);

  const generateQR = () => {
    // QR payload: timestamped token for scanning
    const ts = Date.now();
    const payload = JSON.stringify({
      pid: player?.id,
      ts,
      exp: ts + 30000, // 30 second expiry
      v: 1
    });
    // Base64 encode for QR
    const encoded = btoa(payload);
    setQrData(encoded);
    // 2026-07-25 audit fix: encode the SAME payload into a real QR image via
    // the qrcode package so kiosks can actually scan it.
    import('qrcode')
      .then(QRCode => (QRCode.default || QRCode).toDataURL(encoded, { width: 180, margin: 1 }))
      .then(url => setQrImageUrl(url))
      .catch(err => {
        console.warn('[player-card] QR render failed:', err?.message || err);
        setQrImageUrl(null);
      });
  };

  const quickActions = [
    { label: 'Join Waitlist', icon: Users, href: '/hub/commander/venues', color: '#1981EC' },
    { label: 'My Rewards', icon: Gift, href: '/hub/commander/rewards', color: '#22D3EE' },
    { label: 'Tournaments', icon: Trophy, href: '/hub/commander/tournaments', color: '#5AA9FF' },
    { label: 'Session History', icon: Clock, href: '/hub/commander/history', color: '#10B981' },
    { label: 'Rate Table', icon: Star, href: '/hub/commander/rate-table', color: '#EF4444' },
    { label: 'Request Service', icon: CreditCard, href: '/hub/commander/services', color: '#3B82F6' },
  ];

  const tier = player?.tier || player?.membership_tier || 'bronze';
  const tierStyle = TIER_COLORS[tier] || TIER_COLORS.bronze;

  if (loading) {
    return (
      <div className="cmd-page min-h-screen flex items-center justify-center" role="status" aria-label="Loading">
        <Loader2 size={32} color="#86DAFF" className="animate-spin" aria-hidden="true" />
      </div>
    );
  }

  return (
    <CommanderPageShell>
    <>
      <SEOHead
        title="Player Card"
        description="Smarter.Poker - The Future Of The Game."
        noindex={true}
      />
      <div className="cmd-page min-h-screen">
        <div className="cmd-back-row">
          <button className="cmd-back-link" type="button" onClick={() => router.push('/hub/commander')} aria-label="Back To Live Poker">
            <ArrowLeft size={22} aria-hidden="true" />
            <span>Back</span>
          </button>
        </div>
        <header className="cmd-header-full">
          <div className="flex items-center gap-3 px-4 py-4 sm:px-6 sm:py-5">
            <div className="cmd-icon-box w-11 h-11 flex items-center justify-center shrink-0">
              <QrCode size={22} aria-hidden="true" />
            </div>
            <h1>Digital Player Card</h1>
          </div>
        </header>

        <div style={{ padding: '0 16px 24px', maxWidth: 420, margin: '0 auto' }}>
          {/* Card */}
          <div style={{
            borderRadius: 20, overflow: 'hidden', marginBottom: 20,
            background: tierStyle.bg, color: tierStyle.text,
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)'
          }}>
            {/* Card Top */}
            <div style={{ padding: '24px 20px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 11, opacity: 0.8 }}>Smarter.Poker</div>
                  <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4 }}>
                    {player?.display_name || player?.full_name || 'Player'}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Crown size={16} />
                  <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'capitalize' }}>{tier}</span>
                </div>
              </div>

              {/* Member info */}
              <div style={{ display: 'flex', gap: 20, fontSize: 12, opacity: 0.85 }}>
                <div>
                  <div style={{ opacity: 0.8, fontSize: 11 }}>Member Since</div>
                  <div style={{ fontWeight: 600 }}>
                    {player?.created_at ? new Date(player.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '-'}
                  </div>
                </div>
                <div>
                  <div style={{ opacity: 0.8, fontSize: 11 }}>Member ID</div>
                  <div style={{ fontWeight: 600, fontFamily: 'monospace' }}>{(player?.id || '').slice(0, 8).toUpperCase()}</div>
                </div>
              </div>
            </div>

            {/* QR Code */}
            <div style={{ background: 'white', margin: '0 16px 16px', borderRadius: 14, padding: 16, textAlign: 'center' }}>
              <div style={{ display: 'inline-block', padding: 8, background: 'white', borderRadius: 8 }}>
                {qrData && qrImageUrl ? (
                  <div style={{ position: 'relative' }}>
                    {/* 2026-07-25 audit fix: real scannable QR (qrcode package)
                        encoding the same qrData payload - replaces the
                        decorative SVG dot pattern scanners couldn't read. */}
                    <img
                      src={qrImageUrl}
                      alt="Player check-in QR code"
                      width={180}
                      height={180}
                      style={{ display: 'block' }}
                    />
                    <div style={{ position: 'absolute', bottom: -4, right: -4 }}>
                      <button type="button" onClick={() => setQrRefresh(r => r + 1)} aria-label="Refresh Code"
                        style={{ background: '#0A1829', border: '1px solid #445E77', borderRadius: '50%', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                        <RefreshCw size={14} color="#86DAFF" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ width: 180, height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Loader2 size={24} color="#445E77" className="animate-spin" aria-hidden="true" />
                  </div>
                )}
              </div>
              <div style={{ marginTop: 8, fontSize: 12, color: '#2A4560' }}>
                Scan At Kiosk Or Show To Staff • Refreshes Every 30s
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <section className="mb-4" aria-labelledby="player-card-actions">
            <h2 id="player-card-actions" className="text-[13px] font-bold text-[#BDD0E2] mb-2">Quick Actions</h2>
            <div className="grid grid-cols-3 gap-2">
              {quickActions.map(a => (
                <button key={a.label} type="button" onClick={() => router.push(a.href)}
                  className="cmd-btn cmd-btn-secondary flex flex-col items-center justify-center py-3.5 px-2 text-center">
                  <a.icon size={22} color={a.color} className="mx-auto mb-1.5" aria-hidden="true" />
                  <span className="text-[13px] text-[#F2F7FF] font-semibold leading-tight">{a.label}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Stats */}
          {player && (
            <section className="cmd-panel p-4" aria-labelledby="player-card-stats">
              <h2 id="player-card-stats" className="text-[13px] font-bold text-[#BDD0E2] mb-2.5">My Stats</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                {[
                  { label: 'Total Sessions', val: player.total_sessions || player.session_count || '-' },
                  { label: 'Hours Played', val: player.total_hours || player.play_hours || '-' },
                  { label: 'Comp Balance', val: player.comp_balance ? `$${player.comp_balance}` : '-' },
                  { label: 'Achievements', val: player.achievements_count || player.badges?.length || '-' },
                ].map(s => (
                  <div key={s.label} className="cmd-inset p-2.5 rounded-lg text-center">
                    <div className="text-xl font-extrabold text-white">{s.val}</div>
                    <div className="text-xs text-[#BDD0E2] mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </>
    </CommanderPageShell>
  );
}
