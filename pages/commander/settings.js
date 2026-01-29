/**
 * Commander Settings Page - Venue and staff settings
 * Dark industrial sci-fi gaming theme
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { ArrowLeft, Settings, Bell, Clock, Users, Save, Loader2, ChevronRight } from 'lucide-react';

export default function CommanderSettingsPage() {
  const router = useRouter();

  const [staff, setStaff] = useState(null);
  const [venueId, setVenueId] = useState(null);
  const [venue, setVenue] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState(null);

  // Settings state
  const [settings, setSettings] = useState({
    auto_refresh_interval: 30,
    default_wait_time_per_player: 15,
    sms_notifications_enabled: true,
    push_notifications_enabled: true,
    max_waitlist_size: 50,
    call_timeout_minutes: 5,
    show_player_names_on_display: false
  });

  // Check staff session
  useEffect(() => {
    const storedStaff = localStorage.getItem('commander_staff');
    if (!storedStaff) {
      router.push('/commander/login');
      return;
    }

    try {
      const staffData = JSON.parse(storedStaff);
      if (!staffData.venue_id) {
        router.push('/commander/login');
        return;
      }
      setStaff(staffData);
      setVenueId(staffData.venue_id);
      if (staffData.venue_name) {
        setVenue({ id: staffData.venue_id, name: staffData.venue_name });
      }
      setLoading(false);
    } catch (err) {
      router.push('/commander/login');
    }
  }, [router]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/commander/settings?venue_id=${venueId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          waitlist_settings: {
            auto_refresh_interval: settings.auto_refresh_interval,
            default_wait_time_per_player: settings.default_wait_time_per_player,
            max_waitlist_size: settings.max_waitlist_size,
            call_timeout_minutes: settings.call_timeout_minutes,
            show_player_names_on_display: settings.show_player_names_on_display
          },
          auto_text_enabled: settings.sms_notifications_enabled
        })
      });

      const data = await res.json();
      if (data.success) {
        setSuccess('Settings saved successfully');
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(data.error?.message || 'Failed to save settings');
      }
    } catch (err) {
      setError('Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  function handleToggle(key) {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  }

  function handleChange(key, value) {
    setSettings(prev => ({ ...prev, [key]: value }));
  }

  if (!staff || loading) {
    return (
      <div className="cmd-page flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#22D3EE]" />
      </div>
    );
  }

  // Check if user has settings permission
  const canManageSettings = staff.permissions?.manage_settings !== false;

  return (
    <>
      <Head>
        <title>Settings | {venue?.name || 'Commander'}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="cmd-page">
        {/* Header */}
        <header className="cmd-header-bar sticky top-0 z-50">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/commander/dashboard')}
                className="p-2 hover:bg-[#132240] rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-[#64748B]" />
              </button>
              <div>
                <h1 className="font-bold text-white text-lg">Settings</h1>
                <p className="text-sm text-[#64748B]">{venue?.name}</p>
              </div>
            </div>

            {canManageSettings && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 cmd-btn cmd-btn-primary disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Save
              </button>
            )}
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
          {/* Alerts */}
          {success && (
            <div className="p-4 bg-[#10B981]/10 rounded-xl">
              <p className="text-sm text-[#10B981] font-medium">{success}</p>
            </div>
          )}
          {error && (
            <div className="p-4 bg-[#EF4444]/10 rounded-xl">
              <p className="text-sm text-[#EF4444]">{error}</p>
            </div>
          )}

          {!canManageSettings && (
            <div className="p-4 bg-[#F59E0B]/10 rounded-xl">
              <p className="text-sm text-[#F59E0B]">
                You don't have permission to modify settings. Contact a manager.
              </p>
            </div>
          )}

          {/* Notifications */}
          <section className="cmd-panel">
            <div className="p-4 border-b border-[#4A5E78]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#22D3EE]/10 rounded-lg flex items-center justify-center">
                  <Bell className="w-5 h-5 text-[#22D3EE]" />
                </div>
                <h2 className="font-semibold text-white">Notifications</h2>
              </div>
            </div>
            <div className="divide-y divide-[#4A5E78]">
              <SettingToggle
                label="SMS Notifications"
                description="Send text messages when calling players"
                enabled={settings.sms_notifications_enabled}
                onChange={() => handleToggle('sms_notifications_enabled')}
                disabled={!canManageSettings}
              />
              <SettingToggle
                label="Push Notifications"
                description="Send app notifications to players"
                enabled={settings.push_notifications_enabled}
                onChange={() => handleToggle('push_notifications_enabled')}
                disabled={!canManageSettings}
              />
            </div>
          </section>

          {/* Waitlist */}
          <section className="cmd-panel">
            <div className="p-4 border-b border-[#4A5E78]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#F59E0B]/10 rounded-lg flex items-center justify-center">
                  <Clock className="w-5 h-5 text-[#F59E0B]" />
                </div>
                <h2 className="font-semibold text-white">Waitlist</h2>
              </div>
            </div>
            <div className="divide-y divide-[#4A5E78]">
              <SettingNumber
                label="Call Timeout (minutes)"
                description="Time player has to respond after being called"
                value={settings.call_timeout_minutes}
                onChange={(v) => handleChange('call_timeout_minutes', v)}
                min={1}
                max={15}
                disabled={!canManageSettings}
              />
              <SettingNumber
                label="Max Waitlist Size"
                description="Maximum players per waitlist"
                value={settings.max_waitlist_size}
                onChange={(v) => handleChange('max_waitlist_size', v)}
                min={10}
                max={100}
                disabled={!canManageSettings}
              />
              <SettingNumber
                label="Est. Wait Per Player (min)"
                description="Used to calculate wait times"
                value={settings.default_wait_time_per_player}
                onChange={(v) => handleChange('default_wait_time_per_player', v)}
                min={5}
                max={60}
                disabled={!canManageSettings}
              />
            </div>
          </section>

          {/* Display */}
          <section className="cmd-panel">
            <div className="p-4 border-b border-[#4A5E78]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#10B981]/10 rounded-lg flex items-center justify-center">
                  <Users className="w-5 h-5 text-[#10B981]" />
                </div>
                <h2 className="font-semibold text-white">Display</h2>
              </div>
            </div>
            <div className="divide-y divide-[#4A5E78]">
              <SettingToggle
                label="Show Player Names"
                description="Display full names on public screens"
                enabled={settings.show_player_names_on_display}
                onChange={() => handleToggle('show_player_names_on_display')}
                disabled={!canManageSettings}
              />
              <SettingNumber
                label="Auto-Refresh Interval (sec)"
                description="How often to refresh data"
                value={settings.auto_refresh_interval}
                onChange={(v) => handleChange('auto_refresh_interval', v)}
                min={10}
                max={120}
                disabled={!canManageSettings}
              />
            </div>
          </section>

          {/* Navigation Links */}
          <section className="cmd-panel divide-y divide-[#4A5E78]">
            <button
              onClick={() => router.push('/commander/tables')}
              className="w-full p-4 flex items-center justify-between hover:bg-[#0B1426] transition-colors"
            >
              <span className="font-medium text-white">Manage Tables</span>
              <ChevronRight className="w-5 h-5 text-[#4A5E78]" />
            </button>
            <button
              onClick={() => router.push('/commander/staff')}
              className="w-full p-4 flex items-center justify-between hover:bg-[#0B1426] transition-colors"
            >
              <span className="font-medium text-white">Manage Staff</span>
              <ChevronRight className="w-5 h-5 text-[#4A5E78]" />
            </button>
          </section>
        </main>
      </div>
    </>
  );
}

function SettingToggle({ label, description, enabled, onChange, disabled }) {
  return (
    <div className="p-4 flex items-center justify-between">
      <div>
        <p className="font-medium text-white">{label}</p>
        <p className="text-sm text-[#64748B]">{description}</p>
      </div>
      <button
        onClick={onChange}
        disabled={disabled}
        className={`w-12 h-7 rounded-full transition-colors relative ${
          enabled ? 'bg-[#22D3EE]' : 'bg-[#4A5E78]'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <span
          className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${
            enabled ? 'right-1' : 'left-1'
          }`}
        />
      </button>
    </div>
  );
}

function SettingNumber({ label, description, value, onChange, min, max, disabled }) {
  return (
    <div className="p-4 flex items-center justify-between">
      <div>
        <p className="font-medium text-white">{label}</p>
        <p className="text-sm text-[#64748B]">{description}</p>
      </div>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value) || min)}
        min={min}
        max={max}
        disabled={disabled}
        className="w-20 h-10 px-3 cmd-input text-center disabled:opacity-50 disabled:cursor-not-allowed"
      />
    </div>
  );
}
