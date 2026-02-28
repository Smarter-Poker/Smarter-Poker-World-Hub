/**
 * Commander Settings Page - Venue and staff settings
 * Dark industrial sci-fi gaming theme
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../src/components/seo/SEOHead';
import { Bell, Clock, Users, Save, Loader2, ChevronRight, DollarSign, Package } from 'lucide-react';
import CommanderLayout from '../../src/components/commander/shared/CommanderLayout';

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
    show_player_names_on_display: false,
    venue_type: 'texas',
    time_billing_rate: 12,
    auto_comp_rate: 1,
    bulk_time_packages: []
  });

  // Check staff session
  useEffect(() => {
    const storedStaff = localStorage.getItem('commander_staff');
    if (!storedStaff) {
      router.push('/commander/login').catch(() => { });
      return;
    }

    try {
      const staffData = JSON.parse(storedStaff);
      if (!staffData.venue_id) {
        router.push('/commander/login').catch(() => { });
        return;
      }
      setStaff(staffData);
      setVenueId(staffData.venue_id);
      if (staffData.venue_name) {
        setVenue({ id: staffData.venue_id, name: staffData.venue_name });
      }
      setLoading(false);
    } catch (err) {
      router.push('/commander/login').catch(() => { });
    }
  }, [router]);

  // Load venue settings
  useEffect(() => {
    if (!venueId) return;
    const storedStaffData = localStorage.getItem('commander_staff');
    if (!storedStaffData) return;
    try {
      const parsed = JSON.parse(storedStaffData);
      const token = parsed.token || parsed.access_token;
      if (!token) return;
      fetch('/api/commander/settings', {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(r => r.json())
        .then(data => {
          if (data?.data) {
            setSettings(prev => ({
              ...prev,
              auto_refresh_interval: data.data.auto_refresh_interval ?? prev.auto_refresh_interval,
              show_player_names_on_display: data.data.show_player_names_on_display ?? prev.show_player_names_on_display,
              sms_notifications_enabled: data.data.sms_notifications_enabled ?? prev.sms_notifications_enabled,
              push_notifications_enabled: data.data.push_notifications_enabled ?? prev.push_notifications_enabled,
              max_waitlist_size: data.data.max_waitlist_size ?? prev.max_waitlist_size,
              call_timeout_minutes: data.data.call_timeout_minutes ?? prev.call_timeout_minutes,
              default_wait_time_per_player: data.data.default_wait_time_per_player ?? prev.default_wait_time_per_player,
              venue_type: data.data.venue_type ?? prev.venue_type,
              time_billing_rate: data.data.time_billing_rate ?? prev.time_billing_rate,
              auto_comp_rate: data.data.auto_comp_rate ?? prev.auto_comp_rate,
              bulk_time_packages: data.data.bulk_time_packages ?? prev.bulk_time_packages
            }));
          }
        })
        .catch(() => { });
    } catch (e) { }
  }, [venueId]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const token = (() => {
        try {
          const stored = JSON.parse(localStorage.getItem('commander_staff') || '{}');
          return stored.token || stored.access_token;
        } catch { return null; }
      })();

      if (!token) {
        setError('Authentication required. Please log in again.');
        setSaving(false);
        return;
      }

      // Save display/waitlist settings via PUT (upserts to commander_venue_settings)
      // Note: hard_stop settings managed from Room Presets page
      const res = await fetch('/api/commander/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          auto_refresh_interval: settings.auto_refresh_interval,
          show_player_names_on_display: settings.show_player_names_on_display,
          sms_notifications_enabled: settings.sms_notifications_enabled,
          push_notifications_enabled: settings.push_notifications_enabled,
          max_waitlist_size: settings.max_waitlist_size,
          call_timeout_minutes: settings.call_timeout_minutes,
          default_wait_time_per_player: settings.default_wait_time_per_player,
          venue_type: settings.venue_type,
          time_billing_rate: settings.time_billing_rate,
          auto_comp_rate: settings.auto_comp_rate,
          bulk_time_packages: settings.bulk_time_packages
        })
      });

      const data = await res.json();
      if (data.success) {
        setSuccess('Settings saved successfully');
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(typeof data.error === 'string' ? data.error : (data.error?.message || 'Failed to save settings'));
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
        <Loader2 className="w-8 h-8 animate-spin text-[#1877F2]" />
      </div>
    );
  }

  // Check if user has settings permission
  const canManageSettings = staff.permissions?.manage_settings !== false;

  return (
    <CommanderLayout title="Settings | {venue?.name || 'Commander'}" backHref="/commander/dashboard?card=reports">
      <>
        <SEOHead
          title="Commander — Settings"
          description="Club Commander Poker Room Management Tool."
          noindex={true}
        />

        <div className="cmd-page">
          {/* Header */}
          <header className="cmd-header-bar sticky top-0 z-50">
            <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div>
                  <h1 className="font-bold text-white text-lg">Settings</h1>
                  <p className="text-sm text-[#B0B3B8]">{venue?.name}</p>
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
              <div className="p-4 bg-[#31A24C]/10 rounded-xl">
                <p className="text-sm text-[#31A24C] font-medium">{success}</p>
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
              <div className="p-4 border-b border-[#3A3B3C]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#1877F2]/10 rounded-lg flex items-center justify-center">
                    <Bell className="w-5 h-5 text-[#1877F2]" />
                  </div>
                  <h2 className="font-semibold text-white">Notifications</h2>
                </div>
              </div>
              <div className="divide-y divide-[#3A3B3C]">
                <SettingToggle
                  label="SMS Notifications"
                  description="Send Text Messages When Calling Players"
                  enabled={settings.sms_notifications_enabled}
                  onChange={() => handleToggle('sms_notifications_enabled')}
                  disabled={!canManageSettings}
                />
                <SettingToggle
                  label="Push Notifications"
                  description="Send App Notifications To Players"
                  enabled={settings.push_notifications_enabled}
                  onChange={() => handleToggle('push_notifications_enabled')}
                  disabled={!canManageSettings}
                />
              </div>
            </section>

            {/* Waitlist */}
            <section className="cmd-panel">
              <div className="p-4 border-b border-[#3A3B3C]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#F59E0B]/10 rounded-lg flex items-center justify-center">
                    <Clock className="w-5 h-5 text-[#F59E0B]" />
                  </div>
                  <h2 className="font-semibold text-white">Waitlist</h2>
                </div>
              </div>
              <div className="divide-y divide-[#3A3B3C]">
                <SettingNumber
                  label="Call Timeout (minutes)"
                  description="Time Player Has To Respond After Being Called"
                  value={settings.call_timeout_minutes}
                  onChange={(v) => handleChange('call_timeout_minutes', v)}
                  min={1}
                  max={15}
                  disabled={!canManageSettings}
                />
                <SettingNumber
                  label="Max Waitlist Size"
                  description="Maximum Players Per Waitlist"
                  value={settings.max_waitlist_size}
                  onChange={(v) => handleChange('max_waitlist_size', v)}
                  min={10}
                  max={100}
                  disabled={!canManageSettings}
                />
                <SettingNumber
                  label="Est. Wait Per Player (min)"
                  description="Used To Calculate Wait Times"
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
              <div className="p-4 border-b border-[#3A3B3C]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#31A24C]/10 rounded-lg flex items-center justify-center">
                    <Users className="w-5 h-5 text-[#31A24C]" />
                  </div>
                  <h2 className="font-semibold text-white">Display</h2>
                </div>
              </div>
              <div className="divide-y divide-[#3A3B3C]">
                <SettingToggle
                  label="Show Player Names"
                  description="Display Full Names On Public Screens"
                  enabled={settings.show_player_names_on_display}
                  onChange={() => handleToggle('show_player_names_on_display')}
                  disabled={!canManageSettings}
                />
                <SettingNumber
                  label="Auto-Refresh Interval (sec)"
                  description="How Often To Refresh Data"
                  value={settings.auto_refresh_interval}
                  onChange={(v) => handleChange('auto_refresh_interval', v)}
                  min={10}
                  max={120}
                  disabled={!canManageSettings}
                />
              </div>
            </section>


            {/* Navigation Links */}
            <section className="cmd-panel divide-y divide-[#3A3B3C]">
              <button onClick={() => router.push('/commander/membership-plans')}
                className="w-full p-4 flex items-center justify-between hover:bg-[#18191A] transition-colors">
                <div>
                  <span className="font-medium text-white">Membership Plans</span>
                  <p className="text-xs text-[#B0B3B8]">Set Daily/Weekly/Monthly/Yearly Pricing Per Tier</p>
                </div>
                <ChevronRight className="w-5 h-5 text-[#3A3B3C]" />
              </button>
              <button onClick={() => router.push('/commander/game-types')}
                className="w-full p-4 flex items-center justify-between hover:bg-[#18191A] transition-colors">
                <div>
                  <span className="font-medium text-white">Game Types</span>
                  <p className="text-xs text-[#B0B3B8]">Configure Games, Stakes, Buy-Ins, Rake</p>
                </div>
                <ChevronRight className="w-5 h-5 text-[#3A3B3C]" />
              </button>
              <button onClick={() => router.push('/commander/room-presets')}
                className="w-full p-4 flex items-center justify-between hover:bg-[#18191A] transition-colors">
                <div>
                  <span className="font-medium text-white">Room Presets</span>
                  <p className="text-xs text-[#B0B3B8]">Saved Room Configurations For Quick Setup</p>
                </div>
                <ChevronRight className="w-5 h-5 text-[#3A3B3C]" />
              </button>
              <button onClick={() => router.push('/commander/tables')}
                className="w-full p-4 flex items-center justify-between hover:bg-[#18191A] transition-colors">
                <span className="font-medium text-white">Manage Tables</span>
                <ChevronRight className="w-5 h-5 text-[#3A3B3C]" />
              </button>
              <button onClick={() => router.push('/commander/staff')}
                className="w-full p-4 flex items-center justify-between hover:bg-[#18191A] transition-colors">
                <span className="font-medium text-white">Manage Staff</span>
                <ChevronRight className="w-5 h-5 text-[#3A3B3C]" />
              </button>
              <button onClick={() => router.push('/commander/dealers')}
                className="w-full p-4 flex items-center justify-between hover:bg-[#18191A] transition-colors">
                <span className="font-medium text-white">Manage Dealers</span>
                <ChevronRight className="w-5 h-5 text-[#3A3B3C]" />
              </button>
              <button onClick={() => router.push('/commander/members')}
                className="w-full p-4 flex items-center justify-between hover:bg-[#18191A] transition-colors">
                <span className="font-medium text-white">Members</span>
                <ChevronRight className="w-5 h-5 text-[#3A3B3C]" />
              </button>
              <button onClick={() => router.push('/commander/promotions')}
                className="w-full p-4 flex items-center justify-between hover:bg-[#18191A] transition-colors">
                <span className="font-medium text-white">Promotions</span>
                <ChevronRight className="w-5 h-5 text-[#3A3B3C]" />
              </button>
              <button onClick={() => router.push('/commander/displays')}
                className="w-full p-4 flex items-center justify-between hover:bg-[#18191A] transition-colors">
                <span className="font-medium text-white">TV Displays</span>
                <ChevronRight className="w-5 h-5 text-[#3A3B3C]" />
              </button>
              <button onClick={() => router.push('/commander/reports')}
                className="w-full p-4 flex items-center justify-between hover:bg-[#18191A] transition-colors">
                <span className="font-medium text-white">Reports</span>
                <ChevronRight className="w-5 h-5 text-[#3A3B3C]" />
              </button>
              <button onClick={() => router.push('/commander/time-billing')}
                className="w-full p-4 flex items-center justify-between hover:bg-[#18191A] transition-colors">
                <span className="font-medium text-white">Time Billing</span>
                <ChevronRight className="w-5 h-5 text-[#3A3B3C]" />
              </button>
              <button onClick={() => router.push('/commander/system-info')}
                className="w-full p-4 flex items-center justify-between hover:bg-[#18191A] transition-colors">
                <div>
                  <span className="font-medium text-white">System Information</span>
                  <p className="text-xs text-[#B0B3B8]">Version, Diagnostics, Health Checks</p>
                </div>
                <ChevronRight className="w-5 h-5 text-[#3A3B3C]" />
              </button>
            </section>
          </main>
        </div>
        <style jsx>{`
`}</style>
      </>
    </CommanderLayout>
  );
}

function SettingToggle({ label, description, enabled, onChange, disabled }) {
  return (
    <div className="p-4 flex items-center justify-between">
      <div>
        <p className="font-medium text-white">{label}</p>
        <p className="text-sm text-[#B0B3B8]">{description}</p>
      </div>
      <button
        onClick={onChange}
        disabled={disabled}
        className={`w-12 h-7 rounded-full transition-colors relative ${enabled ? 'bg-[#1877F2]' : 'bg-[#3A3B3C]'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <span
          className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${enabled ? 'right-1' : 'left-1'
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
        <p className="text-sm text-[#B0B3B8]">{description}</p>
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
