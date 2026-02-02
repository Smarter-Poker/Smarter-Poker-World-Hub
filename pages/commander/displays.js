/**
 * Staff Display Device Management Page
 * Manage table display devices: registration, configuration, content push
 * API: /api/commander/displays, /api/commander/displays/[deviceId]/config, /api/commander/displays/[deviceId]/content
 * UI: Dark industrial sci-fi gaming theme, no emojis, Inter font
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  ArrowLeft,
  Monitor,
  Plus,
  Settings,
  Wifi,
  WifiOff,
  RefreshCw,
  Trash2,
  Loader2,
  Check,
  X,
  Send,
  Tv,
  Clock,
  AlertCircle,
  Edit
} from 'lucide-react';

function DeviceCard({ device, onConfigure, onPushContent, onRemove }) {
  const isOnline = device.status === 'online';
  const lastSeen = device.last_heartbeat
    ? new Date(device.last_heartbeat)
    : null;

  return (
    <div className="cmd-panel p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
            isOnline ? 'bg-[#10B981]/10 border border-[#10B981]/30' : 'bg-[#EF4444]/10 border border-[#EF4444]/30'
          }`}>
            <Monitor className={`w-5 h-5 ${isOnline ? 'text-[#10B981]' : 'text-[#EF4444]'}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="font-semibold text-white">{device.name || `Display ${device.id?.slice(0, 8)}`}</p>
              {isOnline ? (
                <span className="flex items-center gap-1 text-xs text-[#10B981]">
                  <Wifi className="w-3 h-3" /> Online
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-[#EF4444]">
                  <WifiOff className="w-3 h-3" /> Offline
                </span>
              )}
            </div>
            <p className="text-sm text-[#64748B]">
              {device.location || 'No location set'}
              {lastSeen && ` -- Last seen ${lastSeen.toLocaleTimeString()}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onPushContent(device)}
            className="p-2 hover:bg-[#132240] rounded-lg transition-colors"
            title="Push Content"
          >
            <Send className="w-4 h-4 text-[#22D3EE]" />
          </button>
          <button
            onClick={() => onConfigure(device)}
            className="p-2 hover:bg-[#132240] rounded-lg transition-colors"
            title="Configure"
          >
            <Settings className="w-4 h-4 text-[#64748B]" />
          </button>
          <button
            onClick={() => onRemove(device)}
            className="p-2 hover:bg-[#EF4444]/10 rounded-lg transition-colors"
            title="Remove"
          >
            <Trash2 className="w-4 h-4 text-[#EF4444]" />
          </button>
        </div>
      </div>

      {/* Current content info */}
      {device.current_content && (
        <div className="mt-3 p-2 bg-[#0D192E] rounded-lg">
          <p className="text-xs text-[#64748B]">
            Showing: <span className="text-white">{device.current_content.type || 'Default'}</span>
          </p>
        </div>
      )}
    </div>
  );
}

export default function DisplaysManagementPage() {
  const router = useRouter();
  const { venue_id: venueId } = router.query;

  const [displays, setDisplays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showRegister, setShowRegister] = useState(false);
  const [showConfig, setShowConfig] = useState(null);
  const [showContent, setShowContent] = useState(null);
  const [registering, setRegistering] = useState(false);
  const [newDevice, setNewDevice] = useState({ name: '', location: '' });
  const [configData, setConfigData] = useState({});
  const [contentType, setContentType] = useState('waitlist');
  const [pushing, setPushing] = useState(false);

  const fetchDisplays = useCallback(async () => {
    if (!venueId) return;
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const res = await fetch(`/api/commander/displays?venue_id=${venueId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setDisplays(data.data?.displays || []);
      }
    } catch (err) {
      console.error('Fetch displays failed:', err);
    } finally {
      setLoading(false);
    }
  }, [venueId]);

  useEffect(() => {
    const token = localStorage.getItem('smarter-poker-auth');
    if (!token) {
      router.push('/auth/login');
      return;
    }
    if (venueId) fetchDisplays();
  }, [venueId, fetchDisplays, router]);

  async function handleRegister() {
    if (!newDevice.name) return;
    setRegistering(true);
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const res = await fetch('/api/commander/displays', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ venue_id: venueId, ...newDevice })
      });
      const data = await res.json();
      if (data.success) {
        setShowRegister(false);
        setNewDevice({ name: '', location: '' });
        fetchDisplays();
      }
    } catch (err) {
      console.error('Register display failed:', err);
    } finally {
      setRegistering(false);
    }
  }

  async function handleSaveConfig(device) {
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      await fetch(`/api/commander/displays/${device.id}/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(configData)
      });
      setShowConfig(null);
      fetchDisplays();
    } catch (err) {
      console.error('Save config failed:', err);
    }
  }

  async function handlePushContent(device) {
    setPushing(true);
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      await fetch(`/api/commander/displays/${device.id}/content`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          type: contentType,
          venue_id: venueId
        })
      });
      setShowContent(null);
      fetchDisplays();
    } catch (err) {
      console.error('Push content failed:', err);
    } finally {
      setPushing(false);
    }
  }

  async function handleRemove(device) {
    if (!confirm(`Remove display "${device.name || device.id}"?`)) return;
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      await fetch(`/api/commander/displays/${device.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchDisplays();
    } catch (err) {
      console.error('Remove display failed:', err);
    }
  }

  const onlineCount = displays.filter(d => d.status === 'online').length;

  if (loading) {
    return (
      <div className="cmd-page flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#22D3EE]" />
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Display Management | Club Commander</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="cmd-page">
        {/* Header */}
        <header className="cmd-header-bar sticky top-0 z-40">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/commander/dashboard')}
                className="p-2 hover:bg-[#132240] rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-[#64748B]" />
              </button>
              <div>
                <h1 className="font-bold text-white flex items-center gap-2">
                  <Tv className="w-5 h-5 text-[#22D3EE]" />
                  Display Management
                </h1>
                <p className="text-sm text-[#64748B]">
                  {displays.length} device{displays.length !== 1 ? 's' : ''} -- {onlineCount} online
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchDisplays}
                className="p-2 hover:bg-[#132240] rounded-lg transition-colors"
              >
                <RefreshCw className="w-5 h-5 text-[#64748B]" />
              </button>
              <button
                onClick={() => setShowRegister(true)}
                className="cmd-btn cmd-btn-primary flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Display
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-4 py-6">
          {displays.length === 0 ? (
            <div className="cmd-panel p-12 text-center">
              <Monitor className="w-16 h-16 text-[#4A5E78] mx-auto mb-4" />
              <h2 className="text-xl font-bold text-white mb-2">No Displays Registered</h2>
              <p className="text-[#64748B] mb-6">
                Register table display devices to show waitlists, tournament clocks, and promotions.
              </p>
              <button
                onClick={() => setShowRegister(true)}
                className="cmd-btn cmd-btn-primary"
              >
                Register First Display
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {displays.map((device) => (
                <DeviceCard
                  key={device.id}
                  device={device}
                  onConfigure={(d) => {
                    setConfigData(d.config || {});
                    setShowConfig(d);
                  }}
                  onPushContent={(d) => setShowContent(d)}
                  onRemove={handleRemove}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Register Modal */}
      {showRegister && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="cmd-panel w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-[#4A5E78]">
              <h3 className="text-lg font-semibold text-white">Register Display</h3>
              <button onClick={() => setShowRegister(false)} className="p-2 hover:bg-[#132240] rounded-lg">
                <X className="w-5 h-5 text-[#64748B]" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-white mb-2">Device Name</label>
                <input
                  type="text"
                  value={newDevice.name}
                  onChange={(e) => setNewDevice(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Table 1 Display"
                  className="w-full h-10 px-3 cmd-input"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-white mb-2">Location</label>
                <input
                  type="text"
                  value={newDevice.location}
                  onChange={(e) => setNewDevice(prev => ({ ...prev, location: e.target.value }))}
                  placeholder="e.g., Main Floor, Table 1"
                  className="w-full h-10 px-3 cmd-input"
                />
              </div>
            </div>
            <div className="p-4 border-t border-[#4A5E78]">
              <button
                onClick={handleRegister}
                disabled={!newDevice.name || registering}
                className="cmd-btn cmd-btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {registering ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                  <><Plus className="w-4 h-4" /> Register Device</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Config Modal */}
      {showConfig && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="cmd-panel w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-[#4A5E78]">
              <h3 className="text-lg font-semibold text-white">Configure: {showConfig.name}</h3>
              <button onClick={() => setShowConfig(null)} className="p-2 hover:bg-[#132240] rounded-lg">
                <X className="w-5 h-5 text-[#64748B]" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-white mb-2">Brightness</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={configData.brightness || 80}
                  onChange={(e) => setConfigData(prev => ({ ...prev, brightness: parseInt(e.target.value) }))}
                  className="w-full accent-[#22D3EE]"
                />
                <p className="text-sm text-[#64748B] text-right">{configData.brightness || 80}%</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-white mb-2">Rotation Interval (seconds)</label>
                <select
                  value={configData.rotation_interval || 30}
                  onChange={(e) => setConfigData(prev => ({ ...prev, rotation_interval: parseInt(e.target.value) }))}
                  className="w-full h-10 px-3 cmd-input"
                >
                  {[10, 15, 30, 60, 120].map(s => (
                    <option key={s} value={s}>{s}s</option>
                  ))}
                </select>
              </div>
              <label className="flex items-center justify-between p-3 bg-[#0D192E] rounded-lg cursor-pointer">
                <span className="text-white font-medium">Auto-refresh</span>
                <input
                  type="checkbox"
                  checked={configData.auto_refresh ?? true}
                  onChange={(e) => setConfigData(prev => ({ ...prev, auto_refresh: e.target.checked }))}
                  className="w-5 h-5 accent-[#22D3EE]"
                />
              </label>
            </div>
            <div className="p-4 border-t border-[#4A5E78]">
              <button
                onClick={() => handleSaveConfig(showConfig)}
                className="cmd-btn cmd-btn-primary w-full"
              >
                Save Configuration
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Push Content Modal */}
      {showContent && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="cmd-panel w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-[#4A5E78]">
              <h3 className="text-lg font-semibold text-white">Push Content: {showContent.name}</h3>
              <button onClick={() => setShowContent(null)} className="p-2 hover:bg-[#132240] rounded-lg">
                <X className="w-5 h-5 text-[#64748B]" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {[
                { value: 'waitlist', label: 'Waitlist', desc: 'Show current waitlist for all games' },
                { value: 'tournament_clock', label: 'Tournament Clock', desc: 'Display blind levels and timer' },
                { value: 'promotions', label: 'Promotions', desc: 'Show active promotions and high hands' },
                { value: 'game_status', label: 'Game Status', desc: 'Table overview with seat availability' },
                { value: 'leaderboard', label: 'Leaderboard', desc: 'Player rankings and achievements' }
              ].map(option => (
                <button
                  key={option.value}
                  onClick={() => setContentType(option.value)}
                  className={`w-full text-left p-3 rounded-lg border transition-colors ${
                    contentType === option.value
                      ? 'border-[#22D3EE] bg-[#22D3EE]/10'
                      : 'border-[#4A5E78] hover:bg-[#132240]'
                  }`}
                >
                  <p className={`font-medium ${contentType === option.value ? 'text-[#22D3EE]' : 'text-white'}`}>
                    {option.label}
                  </p>
                  <p className="text-sm text-[#64748B]">{option.desc}</p>
                </button>
              ))}
            </div>
            <div className="p-4 border-t border-[#4A5E78]">
              <button
                onClick={() => handlePushContent(showContent)}
                disabled={pushing}
                className="cmd-btn cmd-btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {pushing ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                  <><Send className="w-4 h-4" /> Push Content</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
