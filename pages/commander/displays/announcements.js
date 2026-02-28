/**
 * Announcements TV Display
 * /commander/displays/announcements
 * Full-screen display for TV via wireless HDMI transmitter
 * Shows: current announcements, scrolling messages, room status
 * Supabase Realtime — instant sync, auto-rotates pages, auto-dismisses expired
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

import CommanderLayout from '../../../src/components/commander/shared/CommanderLayout';
import { useCommanderSync } from '../../../src/lib/commander/useCommanderSync';
import DealerTicker from '../../../src/components/commander/shared/DealerTicker';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default function AnnouncementsDisplay() {
  const [announcements, setAnnouncements] = useState([]);
  const [roomOpen, setRoomOpen] = useState(true);
  const [now, setNow] = useState(new Date());
  const [currentPage, setCurrentPage] = useState(0);
  const wakeLockRef = useRef(null);
  const realtimeChannelRef = useRef(null);

  // Get venue_id from localStorage
  const [venueId] = useState(() => {
    try { return JSON.parse(localStorage.getItem('commander_staff') || '{}').venue_id; } catch { return null; }
  });

  const getToken = () => {
    try {
      const staff = JSON.parse(localStorage.getItem('commander_staff') || '{}');
      return staff.token || staff.access_token || localStorage.getItem('sb-access-token');
    } catch { return null; }
  };

  const getStaffSession = () => localStorage.getItem('commander_staff') || '';

  const fetchData = useCallback(async () => {
    if (!venueId) return;

    try {
      const res = await fetch(`/api/commander/announcements?venue_id=${venueId}`, {
        headers: {
          Authorization: `Bearer ${getToken()}`,
          'x-staff-session': getStaffSession(),
        },
      });
      const json = await res.json();
      if (json.success) {
        setAnnouncements(json.data || []);
      }
    } catch (err) { console.error(err); }

    try {
      const settingsRes = await fetch(`/api/commander/settings?venue_id=${venueId}`, {
        headers: {
          Authorization: `Bearer ${getToken()}`,
          'x-staff-session': getStaffSession(),
        },
      });
      const settingsJson = await settingsRes.json();
      if (settingsJson.success) setRoomOpen(settingsJson.data?.room_open ?? true);
    } catch (err) { }

    setNow(new Date());
  }, [venueId]);

  useEffect(() => {
    fetchData();
    const poll = setInterval(fetchData, 60000); // fallback only — realtime handles instant updates
    const clock = setInterval(() => setNow(new Date()), 1000);
    return () => { clearInterval(poll); clearInterval(clock); };
  }, [fetchData]);

  // ─── Supabase Realtime — instant announcement updates ───
  useEffect(() => {
    if (!venueId || !supabaseUrl || !supabaseAnonKey) return;

    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const channel = supabase.channel(`announcements-display-${venueId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'commander_club_announcements',
        filter: `venue_id=eq.${venueId}`,
      }, () => {
        // Any INSERT, UPDATE, or DELETE → re-fetch
        fetchData();
      })
      .subscribe();

    realtimeChannelRef.current = channel;
    return () => {
      supabase.removeChannel(channel);
    };
  }, [venueId, fetchData]);

  // Commander Data Bus — instant sync when settings change
  useCommanderSync(venueId, fetchData, { entities: ['settings'] });

  // Auto-rotate pages (4 announcements per page, rotate every 10s)
  const perPage = 4;
  const totalPages = Math.max(1, Math.ceil(announcements.length / perPage));
  useEffect(() => {
    if (totalPages <= 1) return;
    const rotateTimer = setInterval(() => {
      setCurrentPage(p => (p + 1) % totalPages);
    }, 10000);
    return () => clearInterval(rotateTimer);
  }, [totalPages]);

  // Wake lock
  useEffect(() => {
    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) wakeLockRef.current = await navigator.wakeLock.request('screen');
      } catch (err) { }
    };
    requestWakeLock();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') requestWakeLock();
    });
    return () => { wakeLockRef.current?.release(); };
  }, []);

  const goFullscreen = () => document.documentElement.requestFullscreen?.();

  const priorityConfig = {
    urgent: { bg: '#EF4444', bgAlpha: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.5)', text: '#EF4444', label: 'URGENT', pulse: true },
    high: { bg: '#F59E0B', bgAlpha: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.4)', text: '#F59E0B', label: 'IMPORTANT', pulse: false },
    normal: { bg: '#1877F2', bgAlpha: 'rgba(24,119,242,0.08)', border: 'rgba(24,119,242,0.25)', text: '#1877F2', label: '', pulse: false },
    low: { bg: '#6A6B6D', bgAlpha: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.08)', text: '#6A6B6D', label: '', pulse: false },
  };

  const typeIcons = {
    general: '📢', announcement: '📢', game_reminder: '🎮', event: '🎉',
    update: '🔄', urgent: '🚨', promotion: '🎁', maintenance: '🔧',
  };

  const pageAnnouncements = announcements.slice(currentPage * perPage, (currentPage + 1) * perPage);

  return (
    <CommanderLayout title="Announcements Display" backHref="/commander/dashboard?card=displays">
      <style jsx global>{`
        @keyframes pulse-urgent { 0%, 100% { opacity: 1; box-shadow: 0 0 20px rgba(239,68,68,0.3); } 50% { opacity: 0.85; box-shadow: 0 0 40px rgba(239,68,68,0.5); } }
        .urgent-pulse { animation: pulse-urgent 2s ease-in-out infinite; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .announcement-card { animation: fadeIn 0.4s ease-out forwards; }
      `}</style>

      <div onClick={goFullscreen}
        style={{
          minHeight: '100vh', background: '#0a0a0a', color: '#fff',
          fontFamily: "'Inter', sans-serif", userSelect: 'none',
          overflow: 'hidden', display: 'flex', flexDirection: 'column',
        }}>

        {/* Header Bar */}
        <div style={{
          padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: roomOpen
            ? 'linear-gradient(135deg, #31A24C, #228B22)'
            : 'linear-gradient(135deg, #EF4444, #B91C1C)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase', margin: 0 }}>
              Announcements
            </h1>
            <span style={{
              padding: '4px 14px', borderRadius: 20, background: 'rgba(255,255,255,0.2)',
              fontSize: 13, fontWeight: 700, letterSpacing: 1,
            }}>
              {roomOpen ? 'ROOM OPEN' : 'ROOM CLOSED'}
            </span>
            {announcements.length > 0 && (
              <span style={{
                padding: '4px 12px', borderRadius: 20, background: 'rgba(0,0,0,0.25)',
                fontSize: 12, fontWeight: 600, opacity: 0.8,
              }}>
                {announcements.length} Active
              </span>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 36, fontWeight: 700, fontFamily: 'monospace', margin: 0, fontVariantNumeric: 'tabular-nums' }}>
              {now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
            </p>
            <p style={{ fontSize: 14, opacity: 0.85, margin: 0 }}>
              {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>
        </div>

        {/* Messages Area */}
        <div style={{ flex: 1, padding: 32, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {announcements.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: 48, fontWeight: 800, color: 'rgba(255,255,255,0.08)', margin: '0 0 8px' }}>
                  No Announcements
                </p>
                <p style={{ fontSize: 20, color: 'rgba(255,255,255,0.06)', margin: 0 }}>
                  Check Back For Updates
                </p>
              </div>
            </div>
          ) : (
            <>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
                {pageAnnouncements.map((a, i) => {
                  const priority = a.priority || 'normal';
                  const cfg = priorityConfig[priority] || priorityConfig.normal;
                  const icon = typeIcons[a.type || a.message_type] || '📢';

                  return (
                    <div key={a.id || i}
                      className={`announcement-card ${cfg.pulse ? 'urgent-pulse' : ''}`}
                      style={{
                        background: cfg.bgAlpha,
                        border: `2px solid ${cfg.border}`,
                        borderRadius: 16, padding: '24px 28px',
                        animationDelay: `${i * 0.1}s`,
                        flex: 1, display: 'flex', alignItems: 'center', gap: 20,
                      }}>
                      <span style={{ fontSize: 36, lineHeight: 1, flexShrink: 0 }}>{icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                          {cfg.label && (
                            <span style={{
                              color: cfg.text, fontSize: 11, fontWeight: 800,
                              letterSpacing: 1.5, textTransform: 'uppercase',
                              padding: '3px 10px', borderRadius: 8,
                              background: 'rgba(0,0,0,0.3)',
                            }}>
                              {cfg.label}
                            </span>
                          )}
                          {a.title && (
                            <span style={{
                              fontSize: 14, fontWeight: 700, color: cfg.text,
                              textTransform: 'uppercase', letterSpacing: 0.5,
                            }}>
                              {a.title}
                            </span>
                          )}
                        </div>
                        <p style={{
                          fontSize: 22, fontWeight: 500, margin: 0, lineHeight: 1.4,
                          color: cfg.pulse ? cfg.text : '#fff',
                        }}>
                          {a.message || a.content}
                        </p>
                      </div>
                      <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.25)', flexShrink: 0, whiteSpace: 'nowrap' }}>
                        {a.created_at ? new Date(a.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Page indicators */}
              {totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, paddingTop: 8 }}>
                  {Array.from({ length: totalPages }).map((_, i) => (
                    <div key={i} style={{
                      width: currentPage === i ? 24 : 8, height: 8,
                      borderRadius: 4, transition: 'all 0.3s',
                      background: currentPage === i ? '#1877F2' : 'rgba(255,255,255,0.15)',
                    }} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Dealer Push/Break + Promo Ticker */}
        <DealerTicker
          accentColor="#31A24C"
          bgColor="#000"
          fontSize={18}
          borderColor="rgba(255,255,255,0.1)"
          speed={22}
          showBorder={true}
        />

        {/* Bottom bar */}
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.08)', padding: '10px 32px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.18)', margin: 0 }}>See The Front Desk For Assistance</p>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.12)', letterSpacing: 1.5, margin: 0 }}>Powered By Smarter.Poker</p>
        </div>
      </div>
    </CommanderLayout>
  );
}
