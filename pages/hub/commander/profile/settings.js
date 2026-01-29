/**
 * Player Profile Settings Page
 * Notification preferences, privacy, display settings
 * UI: Dark industrial sci-fi gaming theme, no emojis, Inter font
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { ArrowLeft, Bell, Eye, Shield, Save, Loader2 } from 'lucide-react';

function ToggleSetting({ label, description, value, onChange }) {
  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <p className="font-medium text-white text-sm">{label}</p>
        {description && <p className="text-xs text-[#64748B] mt-0.5">{description}</p>}
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`w-11 h-6 rounded-full transition-colors relative ${
          value ? 'bg-[#22D3EE]' : 'bg-[#4A5E78]'
        }`}
      >
        <div
          className={`w-5 h-5 rounded-full bg-white absolute top-0.5 transition-transform ${
            value ? 'translate-x-[22px]' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}

export default function ProfileSettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [settings, setSettings] = useState({
    notifications_waitlist: true,
    notifications_promotions: true,
    notifications_tournaments: true,
    notifications_push: true,
    notifications_sms: false,
    privacy_show_stats: true,
    privacy_show_activity: true,
    privacy_show_venues: false,
    display_compact_mode: false
  });

  useEffect(() => {
    const token = localStorage.getItem('smarter-poker-auth');
    if (!token) {
      router.push('/auth/login?redirect=/hub/commander/profile/settings');
      return;
    }
    fetchSettings();
  }, [router]);

  async function fetchSettings() {
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const res = await fetch('/api/commander/profile', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && data.data?.profile?.settings) {
        setSettings(prev => ({ ...prev, ...data.data.profile.settings }));
      }
    } catch (err) {
      console.error('Fetch settings failed:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const res = await fetch('/api/commander/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ settings })
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(true);
        setTimeout(() => setSuccess(false), 2000);
      }
    } catch (err) {
      console.error('Save settings failed:', err);
    } finally {
      setSaving(false);
    }
  }

  const updateSetting = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

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
        <title>Settings | Smarter Poker</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>
      <div className="cmd-page" style={{ fontFamily: 'Inter, sans-serif' }}>
        <header className="cmd-header-bar">
          <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-4">
            <button onClick={() => router.push('/hub/commander/profile')} className="p-2 rounded-lg hover:bg-[#132240]">
              <ArrowLeft size={20} className="text-[#64748B]" />
            </button>
            <h1 className="text-lg font-bold text-white">Settings</h1>
          </div>
        </header>

        <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
          {/* Notifications */}
          <section className="cmd-panel p-4">
            <div className="flex items-center gap-2 mb-3">
              <Bell size={18} className="text-[#22D3EE]" />
              <h2 className="font-bold text-white text-sm uppercase tracking-wide">Notifications</h2>
            </div>
            <div className="divide-y divide-[#4A5E78]/50">
              <ToggleSetting
                label="Waitlist Updates"
                description="Get notified when your position changes"
                value={settings.notifications_waitlist}
                onChange={(v) => updateSetting('notifications_waitlist', v)}
              />
              <ToggleSetting
                label="Promotions"
                description="High hand alerts, bonus notifications"
                value={settings.notifications_promotions}
                onChange={(v) => updateSetting('notifications_promotions', v)}
              />
              <ToggleSetting
                label="Tournaments"
                description="Registration reminders, results"
                value={settings.notifications_tournaments}
                onChange={(v) => updateSetting('notifications_tournaments', v)}
              />
              <ToggleSetting
                label="Push Notifications"
                description="Receive push notifications on this device"
                value={settings.notifications_push}
                onChange={(v) => updateSetting('notifications_push', v)}
              />
              <ToggleSetting
                label="SMS Notifications"
                description="Receive text messages for important updates"
                value={settings.notifications_sms}
                onChange={(v) => updateSetting('notifications_sms', v)}
              />
            </div>
          </section>

          {/* Privacy */}
          <section className="cmd-panel p-4">
            <div className="flex items-center gap-2 mb-3">
              <Shield size={18} className="text-[#10B981]" />
              <h2 className="font-bold text-white text-sm uppercase tracking-wide">Privacy</h2>
            </div>
            <div className="divide-y divide-[#4A5E78]/50">
              <ToggleSetting
                label="Show Stats on Profile"
                description="Let others see your session stats"
                value={settings.privacy_show_stats}
                onChange={(v) => updateSetting('privacy_show_stats', v)}
              />
              <ToggleSetting
                label="Show Recent Activity"
                description="Show your recent check-ins to friends"
                value={settings.privacy_show_activity}
                onChange={(v) => updateSetting('privacy_show_activity', v)}
              />
              <ToggleSetting
                label="Show Favorite Venues"
                description="Let others see where you play"
                value={settings.privacy_show_venues}
                onChange={(v) => updateSetting('privacy_show_venues', v)}
              />
            </div>
          </section>

          {/* Display */}
          <section className="cmd-panel p-4">
            <div className="flex items-center gap-2 mb-3">
              <Eye size={18} className="text-[#8B5CF6]" />
              <h2 className="font-bold text-white text-sm uppercase tracking-wide">Display</h2>
            </div>
            <div className="divide-y divide-[#4A5E78]/50">
              <ToggleSetting
                label="Compact Mode"
                description="Use smaller cards and tighter spacing"
                value={settings.display_compact_mode}
                onChange={(v) => updateSetting('display_compact_mode', v)}
              />
            </div>
          </section>

          {success && (
            <div className="p-3 rounded-lg bg-[#10B981]/10 border border-[#10B981]/30 text-[#10B981] text-sm text-center">
              Settings saved
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="cmd-btn cmd-btn-primary w-full h-12 justify-center font-medium disabled:opacity-50 flex items-center gap-2"
          >
            <Save size={18} />
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </main>
      </div>
    </>
  );
}
