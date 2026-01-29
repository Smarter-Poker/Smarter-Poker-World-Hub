/**
 * Staff Streaming Management Page
 * Configure and control table streams
 * Dark industrial sci-fi gaming theme
 * Per API_REFERENCE.md: /streaming endpoints
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  Video,
  Play,
  Square,
  Settings,
  ChevronLeft,
  Loader2,
  Users,
  Clock,
  Wifi,
  WifiOff,
  Youtube,
  Twitch,
  Facebook,
  Eye,
  Check,
  X
} from 'lucide-react';

const PLATFORMS = [
  { id: 'youtube', label: 'YouTube', icon: Youtube, color: '#FF0000' },
  { id: 'twitch', label: 'Twitch', icon: Twitch, color: '#9146FF' },
  { id: 'facebook', label: 'Facebook', icon: Facebook, color: '#1877F2' }
];

function StreamCard({ stream, onStart, onStop, onConfigure }) {
  const isLive = stream.status === 'live';

  return (
    <div className="cap-panel overflow-hidden">
      {/* Preview Area */}
      <div className={`h-40 flex items-center justify-center ${isLive ? 'bg-[#1F2937]' : 'bg-[#0D192E]'}`}>
        {isLive ? (
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 text-[#EF4444] mb-2">
              <span className="w-3 h-3 bg-[#EF4444] rounded-full animate-pulse" />
              LIVE
            </div>
            <p className="text-white text-sm">{stream.viewer_count || 0} viewers</p>
          </div>
        ) : (
          <Video className="w-12 h-12 text-[#4A5E78]" />
        )}
      </div>

      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold text-white">Table {stream.table_number}</h3>
            <p className="text-sm text-[#64748B]">{stream.game_info || 'No game'}</p>
          </div>
          {isLive && (
            <span className="px-2 py-1 bg-[#EF4444]/10 text-[#EF4444] text-xs font-medium rounded flex items-center gap-1">
              <Wifi className="w-3 h-3" />
              Live
            </span>
          )}
        </div>

        {/* Active Platforms */}
        {stream.platforms?.length > 0 && (
          <div className="flex items-center gap-2 mb-3">
            {stream.platforms.map(platformId => {
              const platform = PLATFORMS.find(p => p.id === platformId);
              if (!platform) return null;
              const Icon = platform.icon;
              return (
                <span
                  key={platformId}
                  className="p-1.5 rounded"
                  style={{ backgroundColor: `${platform.color}15` }}
                >
                  <Icon className="w-4 h-4" style={{ color: platform.color }} />
                </span>
              );
            })}
            {stream.delay_minutes > 0 && (
              <span className="text-xs text-[#64748B] flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {stream.delay_minutes}m delay
              </span>
            )}
          </div>
        )}

        {/* Duration */}
        {isLive && stream.started_at && (
          <p className="text-sm text-[#64748B] mb-3">
            Streaming for {Math.round((Date.now() - new Date(stream.started_at).getTime()) / 60000)} minutes
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          {isLive ? (
            <button
              onClick={() => onStop(stream.table_id)}
              className="flex-1 py-2 bg-[#EF4444] text-white text-sm font-medium rounded-lg hover:bg-[#DC2626] transition-colors flex items-center justify-center gap-1"
            >
              <Square className="w-4 h-4" />
              Stop Stream
            </button>
          ) : (
            <button
              onClick={() => onStart(stream.table_id)}
              className="flex-1 py-2 bg-[#10B981] text-white text-sm font-medium rounded-lg hover:bg-[#059669] transition-colors flex items-center justify-center gap-1"
            >
              <Play className="w-4 h-4" />
              Start Stream
            </button>
          )}
          <button
            onClick={() => onConfigure(stream)}
            className="cap-btn cap-btn-secondary px-4 py-2"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfigureModal({ stream, onSave, onClose }) {
  const [config, setConfig] = useState({
    platforms: stream.platforms || [],
    delay_minutes: stream.delay_minutes || 15,
    overlay_config: stream.overlay_config || {
      showPotSize: true,
      showPlayerNames: true,
      showChipCounts: true
    }
  });
  const [loading, setLoading] = useState(false);

  function togglePlatform(platformId) {
    setConfig(prev => ({
      ...prev,
      platforms: prev.platforms.includes(platformId)
        ? prev.platforms.filter(p => p !== platformId)
        : [...prev.platforms, platformId]
    }));
  }

  async function handleSave() {
    setLoading(true);
    await onSave(stream.table_id, config);
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-md cap-panel cap-corner-lights p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Stream Settings</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[#132240] rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-[#64748B]" />
          </button>
        </div>

        <div className="space-y-6">
          {/* Platforms */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Stream To
            </label>
            <div className="flex gap-2">
              {PLATFORMS.map(platform => {
                const Icon = platform.icon;
                const isSelected = config.platforms.includes(platform.id);
                return (
                  <button
                    key={platform.id}
                    onClick={() => togglePlatform(platform.id)}
                    className={`flex-1 py-3 rounded-lg border flex flex-col items-center gap-1 transition-colors ${
                      isSelected
                        ? 'border-2'
                        : 'border-[#4A5E78]'
                    }`}
                    style={{
                      borderColor: isSelected ? platform.color : undefined,
                      backgroundColor: isSelected ? `${platform.color}10` : undefined
                    }}
                  >
                    <Icon className="w-5 h-5" style={{ color: isSelected ? platform.color : '#64748B' }} />
                    <span className="text-xs" style={{ color: isSelected ? platform.color : '#64748B' }}>
                      {platform.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Delay */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Stream Delay (minutes)
            </label>
            <div className="flex gap-2">
              {[5, 10, 15, 30].map(mins => (
                <button
                  key={mins}
                  onClick={() => setConfig(prev => ({ ...prev, delay_minutes: mins }))}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    config.delay_minutes === mins
                      ? 'border-[#22D3EE] bg-[#22D3EE]/5 text-[#22D3EE]'
                      : 'border-[#4A5E78] text-[#64748B]'
                  }`}
                >
                  {mins}m
                </button>
              ))}
            </div>
          </div>

          {/* Overlay Options */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Overlay Options
            </label>
            <div className="space-y-2">
              {[
                { key: 'showPotSize', label: 'Show Pot Size' },
                { key: 'showPlayerNames', label: 'Show Player Names' },
                { key: 'showChipCounts', label: 'Show Chip Counts' }
              ].map(option => (
                <label key={option.key} className="flex items-center justify-between p-3 bg-[#0B1426] rounded-lg">
                  <span className="text-white">{option.label}</span>
                  <input
                    type="checkbox"
                    checked={config.overlay_config[option.key]}
                    onChange={(e) => setConfig(prev => ({
                      ...prev,
                      overlay_config: {
                        ...prev.overlay_config,
                        [option.key]: e.target.checked
                      }
                    }))}
                    className="w-5 h-5 rounded border-[#4A5E78] text-[#22D3EE] focus:ring-[#22D3EE]"
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="cap-btn cap-btn-secondary flex-1 h-12"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={loading}
              className="cap-btn cap-btn-primary flex-1 h-12 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function StreamingPage() {
  const router = useRouter();

  const [staff, setStaff] = useState(null);
  const [venueId, setVenueId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [streams, setStreams] = useState([]);
  const [configuring, setConfiguring] = useState(null);

  useEffect(() => {
    const storedStaff = localStorage.getItem('captain_staff');
    if (!storedStaff) {
      router.push('/captain/login');
      return;
    }

    try {
      const staffData = JSON.parse(storedStaff);
      if (!staffData.venue_id) {
        router.push('/captain/login');
        return;
      }
      setStaff(staffData);
      setVenueId(staffData.venue_id);
    } catch {
      router.push('/captain/login');
    }
  }, [router]);

  useEffect(() => {
    if (venueId) {
      fetchStreams();
    }
  }, [venueId]);

  async function fetchStreams() {
    setLoading(true);
    try {
      const res = await fetch(`/api/captain/streaming?venue_id=${venueId}`);
      const data = await res.json();
      if (data.success) {
        setStreams(data.data?.streams || []);
      }
    } catch (err) {
      console.error('Fetch streams failed:', err);
      setStreams([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleStartStream(tableId) {
    try {
      await fetch(`/api/captain/streaming/${tableId}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venue_id: venueId })
      });
      fetchStreams();
    } catch (err) {
      console.error('Start stream failed:', err);
    }
  }

  async function handleStopStream(tableId) {
    try {
      await fetch(`/api/captain/streaming/${tableId}/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venue_id: venueId })
      });
      fetchStreams();
    } catch (err) {
      console.error('Stop stream failed:', err);
    }
  }

  async function handleSaveConfig(tableId, config) {
    try {
      await fetch(`/api/captain/streaming/${tableId}/config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venue_id: venueId, ...config })
      });
      setConfiguring(null);
      fetchStreams();
    } catch (err) {
      console.error('Save config failed:', err);
    }
  }

  const liveStreams = streams.filter(s => s.status === 'live');
  const offlineStreams = streams.filter(s => s.status !== 'live');

  if (!staff) {
    return (
      <div className="cap-page flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#22D3EE]" />
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Streaming | Smarter Captain</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="cap-page">
        {/* Header */}
        <header className="cap-header-bar sticky top-0 z-40">
          <div className="max-w-4xl mx-auto px-4 py-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/captain/dashboard')}
                className="p-2 hover:bg-[#132240] rounded-lg transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-[#64748B]" />
              </button>
              <div>
                <h1 className="text-xl font-bold text-white flex items-center gap-2">
                  <Video className="w-6 h-6 text-[#22D3EE]" />
                  Streaming
                </h1>
                <p className="text-sm text-[#64748B]">
                  {liveStreams.length} table{liveStreams.length !== 1 ? 's' : ''} live
                </p>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-[#22D3EE]" />
            </div>
          ) : (
            <>
              {/* Live Streams */}
              {liveStreams.length > 0 && (
                <section>
                  <h2 className="font-semibold text-white mb-3 flex items-center gap-2">
                    <span className="w-2 h-2 bg-[#EF4444] rounded-full animate-pulse" />
                    Live Now
                  </h2>
                  <div className="grid md:grid-cols-2 gap-4">
                    {liveStreams.map(stream => (
                      <StreamCard
                        key={stream.table_id}
                        stream={stream}
                        onStart={handleStartStream}
                        onStop={handleStopStream}
                        onConfigure={setConfiguring}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Available Tables */}
              {offlineStreams.length > 0 && (
                <section>
                  <h2 className="font-semibold text-white mb-3">Available Tables</h2>
                  <div className="grid md:grid-cols-2 gap-4">
                    {offlineStreams.map(stream => (
                      <StreamCard
                        key={stream.table_id}
                        stream={stream}
                        onStart={handleStartStream}
                        onStop={handleStopStream}
                        onConfigure={setConfiguring}
                      />
                    ))}
                  </div>
                </section>
              )}

              {streams.length === 0 && (
                <div className="cap-panel p-8 text-center">
                  <Video className="w-12 h-12 text-[#4A5E78] mx-auto mb-3" />
                  <p className="text-[#64748B]">No tables configured for streaming</p>
                </div>
              )}
            </>
          )}
        </main>

        {/* Configure Modal */}
        {configuring && (
          <ConfigureModal
            stream={configuring}
            onSave={handleSaveConfig}
            onClose={() => setConfiguring(null)}
          />
        )}
      </div>
    </>
  );
}
