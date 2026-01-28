/**
 * Union Settings Page
 * Configure union settings, branding, and preferences
 * UI: Facebook color scheme, no emojis, Inter font
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  ArrowLeft,
  Settings,
  Building2,
  Globe,
  Mail,
  Phone,
  Image,
  Save,
  Loader2,
  Trash2,
  AlertTriangle,
  Check,
  Users,
  DollarSign,
  Bell
} from 'lucide-react';

export default function UnionSettingsPage() {
  const router = useRouter();
  const [union, setUnion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    logo_url: '',
    website: '',
    contact_email: '',
    contact_phone: '',
    default_commission_rate: 0,
    notification_settings: {
      email_new_agent: true,
      email_weekly_report: true,
      push_daily_summary: false
    }
  });

  useEffect(() => {
    loadUnion();
  }, []);

  async function loadUnion() {
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      if (!token) {
        router.push('/login?redirect=/captain/union/settings');
        return;
      }

      const res = await fetch('/api/captain/unions', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();

      if (data.success && data.data?.owned_unions?.length > 0) {
        const unionData = data.data.owned_unions[0];
        setUnion(unionData);
        setFormData({
          name: unionData.name || '',
          description: unionData.description || '',
          logo_url: unionData.logo_url || '',
          website: unionData.website || '',
          contact_email: unionData.contact_email || '',
          contact_phone: unionData.contact_phone || '',
          default_commission_rate: unionData.settings?.default_commission_rate || 0,
          notification_settings: unionData.settings?.notification_settings || {
            email_new_agent: true,
            email_weekly_report: true,
            push_daily_summary: false
          }
        });
      } else {
        router.push('/captain/union');
      }
    } catch (err) {
      console.error('Load union error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!formData.name.trim()) {
      setMessage({ type: 'error', text: 'Union name is required' });
      return;
    }

    setSaving(true);
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const res = await fetch(`/api/captain/unions/${union.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description,
          logo_url: formData.logo_url,
          website: formData.website,
          contact_email: formData.contact_email,
          contact_phone: formData.contact_phone,
          settings: {
            default_commission_rate: formData.default_commission_rate,
            notification_settings: formData.notification_settings
          }
        })
      });

      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Settings saved successfully' });
        setUnion(data.data?.union);
      } else {
        setMessage({ type: 'error', text: data.error?.message || 'Failed to save settings' });
      }
    } catch (err) {
      console.error('Save error:', err);
      setMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 4000);
    }
  }

  async function handleDelete() {
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const res = await fetch(`/api/captain/unions/${union.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json();
      if (data.success) {
        router.push('/captain/union');
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#1877F2]" />
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Union Settings | Captain</title>
      </Head>

      <div className="min-h-screen bg-[#F9FAFB]">
        {/* Message Banner */}
        {message && (
          <div
            className={`fixed top-0 left-0 right-0 z-50 py-3 px-4 text-center text-white font-medium ${
              message.type === 'success' ? 'bg-[#10B981]' : 'bg-[#EF4444]'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Header */}
        <header className="bg-white border-b border-[#E5E7EB] sticky top-0 z-40">
          <div className="max-w-3xl mx-auto px-4 py-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/captain/union')}
                className="p-2 hover:bg-[#F3F4F6] rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-[#6B7280]" />
              </button>
              <div>
                <h1 className="text-xl font-bold text-[#1F2937] flex items-center gap-2">
                  <Settings className="w-6 h-6 text-[#1877F2]" />
                  Union Settings
                </h1>
                <p className="text-sm text-[#6B7280]">{union?.name}</p>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
          {/* Basic Info */}
          <section className="bg-white rounded-xl border border-[#E5E7EB] p-6">
            <h2 className="text-lg font-semibold text-[#1F2937] mb-4 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-[#1877F2]" />
              Basic Information
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#1F2937] mb-2">
                  Union Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full h-11 px-4 border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1877F2]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1F2937] mb-2">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  rows={3}
                  className="w-full px-4 py-3 border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1877F2] resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1F2937] mb-2">
                  <Image className="w-4 h-4 inline mr-1" />
                  Logo URL
                </label>
                <input
                  type="url"
                  value={formData.logo_url}
                  onChange={(e) => setFormData(prev => ({ ...prev, logo_url: e.target.value }))}
                  placeholder="https://..."
                  className="w-full h-11 px-4 border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1877F2]"
                />
              </div>
            </div>
          </section>

          {/* Contact Info */}
          <section className="bg-white rounded-xl border border-[#E5E7EB] p-6">
            <h2 className="text-lg font-semibold text-[#1F2937] mb-4 flex items-center gap-2">
              <Mail className="w-5 h-5 text-[#1877F2]" />
              Contact Information
            </h2>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[#1F2937] mb-2">
                  <Globe className="w-4 h-4 inline mr-1" />
                  Website
                </label>
                <input
                  type="url"
                  value={formData.website}
                  onChange={(e) => setFormData(prev => ({ ...prev, website: e.target.value }))}
                  placeholder="https://..."
                  className="w-full h-11 px-4 border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1877F2]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1F2937] mb-2">
                  <Mail className="w-4 h-4 inline mr-1" />
                  Contact Email
                </label>
                <input
                  type="email"
                  value={formData.contact_email}
                  onChange={(e) => setFormData(prev => ({ ...prev, contact_email: e.target.value }))}
                  className="w-full h-11 px-4 border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1877F2]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1F2937] mb-2">
                  <Phone className="w-4 h-4 inline mr-1" />
                  Contact Phone
                </label>
                <input
                  type="tel"
                  value={formData.contact_phone}
                  onChange={(e) => setFormData(prev => ({ ...prev, contact_phone: e.target.value }))}
                  className="w-full h-11 px-4 border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1877F2]"
                />
              </div>
            </div>
          </section>

          {/* Commission Settings */}
          <section className="bg-white rounded-xl border border-[#E5E7EB] p-6">
            <h2 className="text-lg font-semibold text-[#1F2937] mb-4 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-[#10B981]" />
              Commission Settings
            </h2>

            <div>
              <label className="block text-sm font-medium text-[#1F2937] mb-2">
                Default Agent Commission Rate (%)
              </label>
              <input
                type="number"
                value={formData.default_commission_rate}
                onChange={(e) => setFormData(prev => ({ ...prev, default_commission_rate: parseFloat(e.target.value) || 0 }))}
                min="0"
                max="100"
                step="0.5"
                className="w-full h-11 px-4 border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1877F2]"
              />
              <p className="text-sm text-[#6B7280] mt-1">
                Default commission rate for new agents. Can be overridden per agent.
              </p>
            </div>
          </section>

          {/* Notification Settings */}
          <section className="bg-white rounded-xl border border-[#E5E7EB] p-6">
            <h2 className="text-lg font-semibold text-[#1F2937] mb-4 flex items-center gap-2">
              <Bell className="w-5 h-5 text-[#8B5CF6]" />
              Notification Settings
            </h2>

            <div className="space-y-3">
              <label className="flex items-center justify-between p-3 bg-[#F9FAFB] rounded-lg cursor-pointer">
                <div>
                  <p className="font-medium text-[#1F2937]">New Agent Notifications</p>
                  <p className="text-sm text-[#6B7280]">Email when a new agent joins</p>
                </div>
                <input
                  type="checkbox"
                  checked={formData.notification_settings.email_new_agent}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    notification_settings: {
                      ...prev.notification_settings,
                      email_new_agent: e.target.checked
                    }
                  }))}
                  className="w-5 h-5 rounded border-[#E5E7EB] text-[#1877F2] focus:ring-[#1877F2]"
                />
              </label>

              <label className="flex items-center justify-between p-3 bg-[#F9FAFB] rounded-lg cursor-pointer">
                <div>
                  <p className="font-medium text-[#1F2937]">Weekly Report</p>
                  <p className="text-sm text-[#6B7280]">Receive weekly performance summary</p>
                </div>
                <input
                  type="checkbox"
                  checked={formData.notification_settings.email_weekly_report}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    notification_settings: {
                      ...prev.notification_settings,
                      email_weekly_report: e.target.checked
                    }
                  }))}
                  className="w-5 h-5 rounded border-[#E5E7EB] text-[#1877F2] focus:ring-[#1877F2]"
                />
              </label>

              <label className="flex items-center justify-between p-3 bg-[#F9FAFB] rounded-lg cursor-pointer">
                <div>
                  <p className="font-medium text-[#1F2937]">Daily Push Summary</p>
                  <p className="text-sm text-[#6B7280]">Push notification with daily stats</p>
                </div>
                <input
                  type="checkbox"
                  checked={formData.notification_settings.push_daily_summary}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    notification_settings: {
                      ...prev.notification_settings,
                      push_daily_summary: e.target.checked
                    }
                  }))}
                  className="w-5 h-5 rounded border-[#E5E7EB] text-[#1877F2] focus:ring-[#1877F2]"
                />
              </label>
            </div>
          </section>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full h-14 bg-[#1877F2] text-white text-lg font-semibold rounded-xl hover:bg-[#1665D8] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            Save Settings
          </button>

          {/* Danger Zone */}
          <section className="bg-[#FEF2F2] rounded-xl border border-[#FCA5A5] p-6">
            <h2 className="text-lg font-semibold text-[#EF4444] mb-2 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Danger Zone
            </h2>
            <p className="text-sm text-[#6B7280] mb-4">
              Deleting your union will remove all agent relationships and historical data.
              This action cannot be undone.
            </p>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="px-4 py-2 border border-[#EF4444] text-[#EF4444] rounded-lg hover:bg-[#EF4444] hover:text-white transition-colors"
            >
              Delete Union
            </button>
          </section>
        </main>

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl w-full max-w-md p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-[#EF4444]/10 rounded-full flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-[#EF4444]" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[#1F2937]">Delete Union?</h3>
                  <p className="text-sm text-[#6B7280]">This cannot be undone</p>
                </div>
              </div>

              <p className="text-[#6B7280] mb-6">
                Are you sure you want to delete <strong>{union?.name}</strong>? All venues and agents will be disconnected.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 h-12 border border-[#E5E7EB] text-[#6B7280] font-semibold rounded-xl hover:bg-[#F3F4F6] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  className="flex-1 h-12 bg-[#EF4444] text-white font-semibold rounded-xl hover:bg-[#DC2626] transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
