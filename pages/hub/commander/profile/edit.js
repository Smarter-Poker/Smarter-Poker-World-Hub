/**
 * Player Profile Edit Page
 * Edit display name, avatar, contact info
 * UI: Dark industrial sci-fi gaming theme, no emojis, Inter font
 */
import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/router';
import SEOHead from '../../../../src/components/seo/SEOHead';
import SkeletonLoader from '../../../../src/components/ui/SkeletonLoader';
import { ArrowLeft, Save, User, Camera } from 'lucide-react';
import { supabase } from '../../../../src/lib/supabase';
import { getAccessToken } from '../../../../src/lib/authUtils';

export default function ProfileEditPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [formData, setFormData] = useState({
    display_name: '', email: '', phone: '', bio: '', avatar_url: ''
  });

  useEffect(() => {
    (async () => {
    const token = getAccessToken();
    if (!token) router.push('/auth/login?redirect=/hub/commander/profile/edit');
    })();
  }, [router]);

  const { isLoading: loading } = useSWR('/api/commander/profile', async (url) => {
    const token = getAccessToken();
    if (!token) return null;
    return fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        if (data.success && data.data?.profile) {
          const p = data.data.profile;
          setFormData({ display_name: p.display_name || '', email: p.email || '', phone: p.phone || '', bio: p.bio || '', avatar_url: p.avatar_url || '' });
        }
        return data;
      });
  });

  async function handleSave(signal) {
    if (!formData.display_name.trim()) {
      setError('Display name is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const token = getAccessToken();
      const res = await fetch('/api/commander/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(true);
        setTimeout(() => router.push('/hub/commander/profile'), 1000);
      } else {
        setError(data.error || 'Failed to save');
      }
    } catch (err) {
      setError('Failed to save profile');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div style={{ padding: 40 }}><SkeletonLoader variant="rows" rows={5} /></div>;

  return (
    <>
      <SEOHead
                title="Edit Profile"
                description="Smarter.Poker — The Future Of The Game."
                noindex={true}
            />
      <div className="cmd-page" style={{ fontFamily: 'Inter, sans-serif' }}>
        <header className="cmd-header-bar">
          <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-4">
            <button onClick={() => router.back()} className="p-2 rounded-lg hover:bg-[#132240]">
              <ArrowLeft size={20} className="text-[#64748B]" />
            </button>
            <h1 className="text-lg font-bold text-white">Edit Profile</h1>
          </div>
        </header>

        <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
          {/* Avatar */}
          <div className="flex justify-center">
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-[#132240] border-2 border-[#4A5E78] flex items-center justify-center overflow-hidden">
                {formData.avatar_url ? (
                  <img src={formData.avatar_url} alt="" className="w-24 h-24 rounded-full object-cover"  loading="lazy" />
                ) : (
                  <User size={40} className="text-[#64748B]" />
                )}
              </div>
              <div className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-[#22D3EE] flex items-center justify-center">
                <Camera size={16} className="text-white" />
              </div>
            </div>
          </div>

          {/* Form */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-[#94A3B8] mb-1.5">
                Display Name <span className="text-[#EF4444]">*</span>
              </label>
              <input
                type="text"
                value={formData.display_name}
                onChange={(e) => setFormData(prev => ({ ...prev, display_name: e.target.value }))}
                className="w-full cmd-input"
                placeholder="Your Display Name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#94A3B8] mb-1.5">Email</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                className="w-full cmd-input"
                placeholder="email@example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#94A3B8] mb-1.5">Phone</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                className="w-full cmd-input"
                placeholder="(555) 123-4567"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#94A3B8] mb-1.5">Bio</label>
              <textarea
                value={formData.bio}
                onChange={(e) => setFormData(prev => ({ ...prev, bio: e.target.value }))}
                className="w-full cmd-input min-h-[80px] resize-none"
                placeholder="Tell Us About Yourself..."
                maxLength={250}
              />
              <p className="text-xs text-[#4A5E78] mt-1 text-right">{formData.bio.length}/250</p>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-[#EF4444]/10 border border-[#EF4444]/30 text-[#EF4444] text-sm">
              {error}
            </div>
          )}
          {success && (
            <div className="p-3 rounded-lg bg-[#10B981]/10 border border-[#10B981]/30 text-[#10B981] text-sm">
              Profile saved. Redirecting...
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={saving || !formData.display_name.trim()}
            className="cmd-btn cmd-btn-primary w-full h-12 justify-center font-medium disabled:opacity-50 flex items-center gap-2"
          >
            <Save size={18} />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </main>
      </div>
    </>
  );
}
