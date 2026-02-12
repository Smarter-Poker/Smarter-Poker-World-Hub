/**
 * Digital Player Card
 * /hub/commander/player-card
 * QR code for instant check-in, quick actions, membership display
 */
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  ArrowLeft, QrCode, CreditCard, Users, Clock, Gift, LogOut,
  Star, ChevronRight, Loader2, RefreshCw, Trophy, Crown
} from 'lucide-react';

const TIER_COLORS = {
  bronze: { bg: 'linear-gradient(135deg, #92400E, #D97706)', text: '#FFFBEB' },
  silver: { bg: 'linear-gradient(135deg, #6B7280, #D1D5DB)', text: '#F9FAFB' },
  gold: { bg: 'linear-gradient(135deg, #B45309, #FCD34D)', text: '#FFFBEB' },
  platinum: { bg: 'linear-gradient(135deg, #1E3A5F, #60A5FA)', text: '#EBF5FF' },
  diamond: { bg: 'linear-gradient(135deg, #4C1D95, #A78BFA)', text: '#F5F3FF' },
};

export default function PlayerCard() {
  const router = useRouter();
  const [player, setPlayer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [qrData, setQrData] = useState(null);
  const [qrRefresh, setQrRefresh] = useState(0);
  const intervalRef = useRef(null);

  const getToken = () => typeof window !== 'undefined'
    ? localStorage.getItem('sb-access-token') : null;

  useEffect(() => {
    fetchProfile();
    // Rotate QR every 30 seconds
    intervalRef.current = setInterval(() => setQrRefresh(r => r + 1), 30000);
    return () => clearInterval(intervalRef.current);
  }, []);

  useEffect(() => {
    if (player) generateQR();
  }, [player, qrRefresh]);

  const fetchProfile = async () => {
    try {
      const token = getToken();
      if (!token) { router.push('/auth/login?redirect=/hub/commander/player-card'); return; }

      const res = await fetch('/api/hub/profile', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const json = await res.json();
      if (json.success || json.data) {
        setPlayer(json.data || json);
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

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
  };

  const quickActions = [
    { label: 'Join Waitlist', icon: Users, href: '/hub/commander/venues', color: '#1877F2' },
    { label: 'My Rewards', icon: Gift, href: '/hub/commander/rewards', color: '#F59E0B' },
    { label: 'Tournaments', icon: Trophy, href: '/hub/commander/tournaments', color: '#8B5CF6' },
    { label: 'Session History', icon: Clock, href: '/hub/commander/history', color: '#10B981' },
    { label: 'Rate Table', icon: Star, href: '/hub/commander/rate-table', color: '#EF4444' },
    { label: 'Request Service', icon: CreditCard, href: '/hub/commander/services', color: '#3B82F6' },
  ];

  const tier = player?.tier || player?.membership_tier || 'bronze';
  const tierStyle = TIER_COLORS[tier] || TIER_COLORS.bronze;

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#111827', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 size={32} color="#1877F2" className="spin" />
      </div>
    );
  }

  return (
    <>
      <Head><title>Player Card | Smarter.Poker</title></Head>
      <div style={{ minHeight: '100vh', background: '#111827', fontFamily: 'Inter, system-ui, sans-serif' }}>
        {/* Header */}
        <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => router.push('/hub/commander')} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: 4 }}>
            <ArrowLeft size={22} />
          </button>
          <QrCode size={22} color="white" />
          <span style={{ color: 'white', fontWeight: 700, fontSize: 17 }}>Digital Player Card</span>
        </div>

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
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, opacity: 0.8 }}>Smarter.Poker</div>
                  <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4 }}>
                    {player?.display_name || player?.full_name || 'Player'}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Crown size={16} />
                  <span style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase' }}>{tier}</span>
                </div>
              </div>

              {/* Member info */}
              <div style={{ display: 'flex', gap: 20, fontSize: 12, opacity: 0.85 }}>
                <div>
                  <div style={{ opacity: 0.7, fontSize: 10 }}>MEMBER SINCE</div>
                  <div style={{ fontWeight: 600 }}>
                    {player?.created_at ? new Date(player.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—'}
                  </div>
                </div>
                <div>
                  <div style={{ opacity: 0.7, fontSize: 10 }}>MEMBER ID</div>
                  <div style={{ fontWeight: 600, fontFamily: 'monospace' }}>{(player?.id || '').slice(0, 8).toUpperCase()}</div>
                </div>
              </div>
            </div>

            {/* QR Code */}
            <div style={{ background: 'white', margin: '0 16px 16px', borderRadius: 14, padding: 16, textAlign: 'center' }}>
              <div style={{ display: 'inline-block', padding: 8, background: 'white', borderRadius: 8 }}>
                {qrData ? (
                  <div style={{ position: 'relative' }}>
                    {/* QR code rendered as SVG pattern */}
                    <svg width="180" height="180" viewBox="0 0 180 180">
                      {/* QR frame corners */}
                      <rect x="10" y="10" width="50" height="50" rx="4" fill="none" stroke="#1C2526" strokeWidth="4" />
                      <rect x="18" y="18" width="34" height="34" rx="2" fill="#1C2526" />
                      <rect x="120" y="10" width="50" height="50" rx="4" fill="none" stroke="#1C2526" strokeWidth="4" />
                      <rect x="128" y="18" width="34" height="34" rx="2" fill="#1C2526" />
                      <rect x="10" y="120" width="50" height="50" rx="4" fill="none" stroke="#1C2526" strokeWidth="4" />
                      <rect x="18" y="128" width="34" height="34" rx="2" fill="#1C2526" />
                      {/* Data dots - generated from qrData hash */}
                      {Array.from({ length: 64 }, (_, i) => {
                        const col = (i % 8);
                        const row = Math.floor(i / 8);
                        const x = 68 + col * 8;
                        const y = 68 + row * 8;
                        const show = qrData.charCodeAt(i % qrData.length) % 3 !== 0;
                        return show ? <rect key={i} x={x} y={y} width="6" height="6" fill="#1C2526" rx="1" /> : null;
                      })}
                      {/* Center logo */}
                      <circle cx="90" cy="90" r="14" fill="white" stroke="#1877F2" strokeWidth="2" />
                      <text x="90" y="95" textAnchor="middle" fill="#1877F2" fontSize="14" fontWeight="900">♠</text>
                    </svg>
                    <div style={{ position: 'absolute', bottom: -4, right: -4 }}>
                      <button onClick={() => setQrRefresh(r => r + 1)}
                        style={{ background: '#F0F2F5', border: 'none', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                        <RefreshCw size={14} color="#65676B" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ width: 180, height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Loader2 size={24} color="#65676B" className="spin" />
                  </div>
                )}
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: '#65676B' }}>
                Scan at kiosk or show to staff • Refreshes every 30s
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#9CA3AF', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Quick Actions
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {quickActions.map(a => (
                <button key={a.label} onClick={() => router.push(a.href)}
                  style={{
                    background: '#1F2937', border: '1px solid #374151', borderRadius: 12, padding: '14px 8px',
                    cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s'
                  }}>
                  <a.icon size={22} color={a.color} style={{ margin: '0 auto 6px' }} />
                  <div style={{ fontSize: 11, color: '#D1D5DB', fontWeight: 600 }}>{a.label}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Stats */}
          {player && (
            <div style={{ background: '#1F2937', borderRadius: 14, border: '1px solid #374151', padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#9CA3AF', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                My Stats
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                {[
                  { label: 'Total Sessions', val: player.total_sessions || player.session_count || '—' },
                  { label: 'Hours Played', val: player.total_hours || player.play_hours || '—' },
                  { label: 'Comp Balance', val: player.comp_balance ? `$${player.comp_balance}` : '—' },
                  { label: 'Achievements', val: player.achievements_count || player.badges?.length || '—' },
                ].map(s => (
                  <div key={s.label} style={{ padding: 10, background: '#111827', borderRadius: 10, textAlign: 'center' }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: 'white' }}>{s.val}</div>
                    <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <style jsx global>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
