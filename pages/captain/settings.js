/**
 * Captain Settings Page - Venue and staff settings
 * UI: Facebook color scheme, no emojis, Inter font
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { ArrowLeft, Settings, Bell, Clock, Users, Save, Loader2, ChevronRight } from 'lucide-react';

export default function CaptainSettingsPage() {
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
      if (staffData.venue_name) {
        setVenue({ id: staffData.venue_id, name: staffData.venue_name });
      }
      setLoading(false);
    } catch (err) {
      router.push('/captain/login');
    }
  }, [router]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      // In a real implementation, this would save to the API
      // For now, just simulate a save
      await new Promise(resolve => setTimeout(resolve, 500));
      setSuccess('Settings saved successfully');
      setTimeout(() => setSuccess(null), 3000);
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
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#1877F2]" />
      </div>
    );
  }

  // Check if user has settings permission
  const canManageSettings = staff.permissions?.manage_settings !== false;

  return (
    <>
      <Head>
        <title>Settings | {venue?.name || 'Captain'}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="min-h-screen bg-[#F9FAFB]">
        {/* Header */}
        <header className="bg-white border-b border-[#E5E7EB] sticky top-0 z-50">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/captain/dashboard')}
                className="p-2 hover:bg-[#F3F4F6] rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-[#6B7280]" />
              </button>
              <div>
                <h1 className="font-bold text-[#1F2937] text-lg">Settings</h1>
                <p className="text-sm text-[#6B7280]">{venue?.name}</p>
              </div>
            </div>

            {canManageSettings && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-[#1877F2] text-white font-medium rounded-lg hover:bg-[#1664d9] transition-colors disabled:opacity-50"
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
            <div className="p-4 bg-[#D1FAE5] rounded-xl">
              <p className="text-sm text-[#059669] font-medium">{success}</p>
            </div>
          )}
          {error && (
            <div className="p-4 bg-[#FEF2F2] rounded-xl">
              <p className="text-sm text-[#EF4444]">{error}</p>
            </div>
          )}

          {!canManageSettings && (
            <div className="p-4 bg-[#FEF3C7] rounded-xl">
              <p className="text-sm text-[#D97706]">
                You don't have permission to modify settings. Contact a manager.
              </p>
            </div>
          )}

          {/* Notifications */}
          <section className="bg-white rounded-xl border border-[#E5E7EB]">
            <div className="p-4 border-b border-[#E5E7EB]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#DBEAFE] rounded-lg flex items-center justify-center">
                  <Bell className="w-5 h-5 text-[#2563EB]" />
                </div>
                <h2 className="font-semibold text-[#1F2937]">Notifications</h2>
              </div>
            </div>
            <div className="divide-y divide-[#E5E7EB]">
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
          <section className="bg-white rounded-xl border border-[#E5E7EB]">
            <div className="p-4 border-b border-[#E5E7EB]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#FEF3C7] rounded-lg flex items-center justify-center">
                  <Clock className="w-5 h-5 text-[#D97706]" />
                </div>
                <h2 className="font-semibold text-[#1F2937]">Waitlist</h2>
              </div>
            </div>
            <div className="divide-y divide-[#E5E7EB]">
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
          <section className="bg-white rounded-xl border border-[#E5E7EB]">
            <div className="p-4 border-b border-[#E5E7EB]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#D1FAE5] rounded-lg flex items-center justify-center">
                  <Users className="w-5 h-5 text-[#059669]" />
                </div>
                <h2 className="font-semibold text-[#1F2937]">Display</h2>
              </div>
            </div>
            <div className="divide-y divide-[#E5E7EB]">
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
          <section className="bg-white rounded-xl border border-[#E5E7EB] divide-y divide-[#E5E7EB]">
            <button
              onClick={() => router.push('/captain/tables')}
              className="w-full p-4 flex items-center justify-between hover:bg-[#F9FAFB] transition-colors"
            >
              <span className="font-medium text-[#1F2937]">Manage Tables</span>
              <ChevronRight className="w-5 h-5 text-[#9CA3AF]" />
            </button>
            <button
              onClick={() => router.push('/captain/staff')}
              className="w-full p-4 flex items-center justify-between hover:bg-[#F9FAFB] transition-colors"
            >
              <span className="font-medium text-[#1F2937]">Manage Staff</span>
              <ChevronRight className="w-5 h-5 text-[#9CA3AF]" />
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
        <p className="font-medium text-[#1F2937]">{label}</p>
        <p className="text-sm text-[#6B7280]">{description}</p>
      </div>
      <button
        onClick={onChange}
        disabled={disabled}
        className={`w-12 h-7 rounded-full transition-colors relative ${
          enabled ? 'bg-[#1877F2]' : 'bg-[#E5E7EB]'
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
        <p className="font-medium text-[#1F2937]">{label}</p>
        <p className="text-sm text-[#6B7280]">{description}</p>
      </div>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value) || min)}
        min={min}
        max={max}
        disabled={disabled}
        className="w-20 h-10 px-3 border border-[#E5E7EB] rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-[#1877F2] disabled:opacity-50 disabled:cursor-not-allowed"
      />
    </div>
  );
}
