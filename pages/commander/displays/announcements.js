/**
 * Announcements TV Display
 * /commander/displays/announcements
 * Full-screen display for TV via wireless HDMI transmitter
 * Shows: current announcements, scrolling messages, room status
 * Auto-refreshes every 5 seconds, auto-dismisses expired messages
 */
import { useState, useEffect, useRef } from 'react';

import CommanderLayout from '../../../src/components/commander/shared/CommanderLayout';

export default function AnnouncementsDisplay() {
  const [announcements, setAnnouncements] = useState([]);
  const [roomOpen, setRoomOpen] = useState(true);
  const [now, setNow] = useState(new Date());
  const wakeLockRef = useRef(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch('/api/commander/announcements');
        const json = await res.json();
        if (json.success) {
          // Filter to non-expired announcements
          const active = (json.data || []).filter(a => {
            if (!a.expires_at) return true;
            return new Date(a.expires_at) > new Date();
          });
          setAnnouncements(active);
        }
      } catch (err) { console.error(err); }

      try {
        const settingsRes = await fetch('/api/commander/settings');
        const settingsJson = await settingsRes.json();
        if (settingsJson.success) setRoomOpen(settingsJson.data?.room_open ?? true);
      } catch (err) { }

      setNow(new Date());
    };
    fetchData();
    const poll = setInterval(fetchData, 5000);
    const clock = setInterval(() => setNow(new Date()), 1000);
    return () => { clearInterval(poll); clearInterval(clock); };
  }, []);

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

  const priorityColors = {
    urgent: { bg: 'bg-red-500/20', border: 'border-red-500/50', text: 'text-red-400', label: 'URGENT' },
    high: { bg: 'bg-yellow-500/20', border: 'border-yellow-500/50', text: 'text-yellow-400', label: 'IMPORTANT' },
    normal: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400', label: '' },
    low: { bg: 'bg-white/5', border: 'border-white/10', text: 'text-white/60', label: '' }
  };

  return (
    <CommanderLayout title="Announcements Display" backHref="/commander/dashboard?card=displays">
      <style jsx global>{`
        @keyframes pulse-urgent { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
        .urgent-pulse { animation: pulse-urgent 2s ease-in-out infinite; }
        @keyframes scroll-up { from { transform: translateY(100%); } to { transform: translateY(-100%); } }
      `}</style>

      <div onClick={goFullscreen}
        className="min-h-screen bg-black text-white font-['Inter'] select-none overflow-hidden flex flex-col">

        {/* Header */}
        <div className={`px-8 py-4 flex items-center justify-between ${roomOpen ? 'bg-[#31A24C]' : 'bg-[#EF4444]'}`}>
          <div className="flex items-center gap-4">
            <h1 className="text-3xl font-bold tracking-wide">ANNOUNCEMENTS</h1>
            <span className="px-3 py-1 rounded-full bg-white/20 text-sm font-bold">
              {roomOpen ? 'ROOM OPEN' : 'ROOM CLOSED'}
            </span>
          </div>
          <div className="text-right">
            <p className="text-4xl font-mono font-bold tabular-nums">
              {now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
            </p>
            <p className="text-sm opacity-80">
              {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 p-8 overflow-hidden">
          {announcements.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-5xl font-bold text-white/15 mb-2">No Announcements</p>
                <p className="text-xl text-white/10">Check Back For Updates</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4 max-h-full overflow-hidden">
              {announcements.slice(0, 8).map((a, i) => {
                const priority = a.priority || 'normal';
                const style = priorityColors[priority] || priorityColors.normal;
                const isUrgent = priority === 'urgent';

                return (
                  <div key={a.id || i}
                    className={`${style.bg} ${style.border} border-2 rounded-2xl p-6 ${isUrgent ? 'urgent-pulse' : ''}`}>
                    <div className="flex items-start gap-4">
                      {style.label && (
                        <span className={`${style.text} text-xs font-bold tracking-wider uppercase px-3 py-1 rounded-full bg-black/20 flex-shrink-0`}>
                          {style.label}
                        </span>
                      )}
                      <div className="flex-1">
                        <p className={`text-2xl font-medium ${isUrgent ? style.text : 'text-white'}`}>
                          {a.message || a.title || a.content}
                        </p>
                        {a.details && (
                          <p className="text-lg text-white/50 mt-2">{a.details}</p>
                        )}
                      </div>
                      <span className="text-sm text-white/30 flex-shrink-0">
                        {a.created_at ? new Date(a.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Bottom bar */}
        <div className="border-t border-white/10 px-8 py-3 flex items-center justify-between">
          <p className="text-sm text-white/20">See The Front Desk For Assistance</p>
          <p className="text-white/15 text-xs tracking-wider">Powered By Smarter.Poker</p>
        </div>
      </div>
    </CommanderLayout>
  );
}
