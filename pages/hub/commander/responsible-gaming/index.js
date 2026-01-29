/**
 * Responsible Gaming Page
 * Self-exclusion and spending limits
 * UI: Dark industrial sci-fi gaming theme, no emojis, Inter font
 * Per DATABASE_SCHEMA.sql: commander_self_exclusions, commander_spending_limits
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  Shield,
  Clock,
  DollarSign,
  AlertTriangle,
  Check,
  ChevronLeft,
  Loader2,
  Bell,
  Lock,
  Calendar
} from 'lucide-react';

function LimitCard({ icon: Icon, label, value, onChange, max, unit = '$' }) {
  return (
    <div className="cmd-panel p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="cmd-icon-box cmd-icon-box-square w-10 h-10">
          <Icon className="w-5 h-5 text-[#22D3EE]" />
        </div>
        <div>
          <p className="font-medium text-white">{label}</p>
          <p className="text-sm text-[#64748B]">
            {value ? `${unit}${value.toLocaleString()}` : 'No limit set'}
          </p>
        </div>
      </div>
      <input
        type="range"
        min="0"
        max={max}
        step={max / 20}
        value={value || 0}
        onChange={(e) => onChange(parseInt(e.target.value) || null)}
        className="w-full h-2 bg-[#1A2E4A] rounded-lg appearance-none cursor-pointer accent-[#1877F2]"
      />
      <div className="flex justify-between text-xs text-[#64748B] mt-1">
        <span>No limit</span>
        <span>{unit}{max.toLocaleString()}</span>
      </div>
    </div>
  );
}

function ExclusionOption({ duration, label, description, selected, onSelect }) {
  return (
    <button
      onClick={() => onSelect(duration)}
      className={`w-full text-left transition-all ${
        selected
          ? 'cmd-panel border-[#EF4444] shadow-[0_0_15px_rgba(239,68,68,0.3)]'
          : 'cmd-panel hover:border-[#EF4444]'
      }`}
    >
      <div className="flex items-center justify-between p-4">
        <div>
          <p className="font-medium text-white">{label}</p>
          <p className="text-sm text-[#64748B]">{description}</p>
        </div>
        {selected && <Check className="w-5 h-5 text-[#EF4444]" />}
      </div>
    </button>
  );
}

export default function ResponsibleGamingPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [limits, setLimits] = useState({
    daily_limit: null,
    weekly_limit: null,
    monthly_limit: null,
    session_duration_limit: null,
    loss_limit: null,
    alerts_enabled: true
  });
  const [exclusion, setExclusion] = useState(null);
  const [activeExclusion, setActiveExclusion] = useState(null);
  const [showExclusionConfirm, setShowExclusionConfirm] = useState(false);
  const [saveMessage, setSaveMessage] = useState(null);
  const [riskStatus, setRiskStatus] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('smarter-poker-auth');
    if (!token) {
      router.push('/auth/login?redirect=/hub/commander/responsible-gaming');
      return;
    }
    fetchSettings();
  }, [router]);

  async function fetchSettings() {
    setLoading(true);
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const [limitsRes, exclusionRes] = await Promise.all([
        fetch('/api/commander/responsible-gaming/limits', {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch('/api/commander/responsible-gaming/exclusion', {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      const limitsData = await limitsRes.json();
      const exclusionData = await exclusionRes.json();

      if (limitsData.success && limitsData.data?.limits) {
        setLimits(limitsData.data.limits);
      }
      if (exclusionData.success && exclusionData.data?.exclusion) {
        setActiveExclusion(exclusionData.data.exclusion);
      }

      // Check responsible gaming status for this player
      if (limitsData.data?.player_id) {
        fetch(`/api/commander/responsible-gaming/check/${limitsData.data.player_id}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
          .then(r => r.json())
          .then(checkData => {
            if (checkData.success) {
              setRiskStatus(checkData.data?.risk_level || null);
            }
          })
          .catch(() => {});
      }
    } catch (err) {
      console.error('Fetch failed:', err);
      // Keep defaults
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveLimits() {
    setSaving(true);
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const res = await fetch('/api/commander/responsible-gaming/limits', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(limits)
      });

      const data = await res.json();
      if (data.success) {
        setSaveMessage({ type: 'success', text: 'Limits saved successfully' });
      } else {
        setSaveMessage({ type: 'error', text: 'Failed to save limits' });
      }
    } catch (err) {
      console.error('Save failed:', err);
      setSaveMessage({ type: 'error', text: 'Failed to save limits' });
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMessage(null), 4000);
    }
  }

  async function handleSelfExclude() {
    if (!exclusion) return;

    setSaving(true);
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const res = await fetch('/api/commander/responsible-gaming/exclusion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          exclusion_type: exclusion === 'permanent' ? 'permanent' : 'temporary',
          duration_days: exclusion === 'permanent' ? null : exclusion,
          scope: 'network'
        })
      });

      const data = await res.json();
      if (data.success) {
        setShowExclusionConfirm(false);
        setActiveExclusion({
          type: exclusion === 'permanent' ? 'permanent' : 'temporary',
          duration_days: exclusion,
          expires_at: exclusion !== 'permanent'
            ? new Date(Date.now() + exclusion * 24 * 60 * 60 * 1000).toISOString()
            : null
        });
      }
    } catch (err) {
      console.error('Exclusion failed:', err);
    } finally {
      setSaving(false);
    }
  }

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
        <title>Responsible Gaming | Smarter Poker</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="cmd-page">
        {/* Save Message */}
        {saveMessage && (
          <div
            className={`fixed top-0 left-0 right-0 z-50 py-3 px-4 text-center text-white font-medium border-b ${
              saveMessage.type === 'success'
                ? 'bg-[#0A1929] border-[#10B981] shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                : 'bg-[#0A1929] border-[#EF4444] shadow-[0_0_15px_rgba(239,68,68,0.3)]'
            }`}
          >
            {saveMessage.text}
          </div>
        )}

        {/* Header */}
        <header className="cmd-header-full sticky top-0 z-40">
          <div className="max-w-lg mx-auto px-4 py-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.back()}
                className="p-2 hover:bg-[#1A2E4A] rounded-lg transition-colors"
              >
                <ChevronLeft className="w-5 h-5 text-[#64748B]" />
              </button>
              <div>
                <h1 className="text-xl font-bold text-white flex items-center gap-2">
                  <Shield className="w-6 h-6 text-[#22D3EE]" />
                  Responsible Gaming
                </h1>
                <p className="text-sm text-[#64748B]">Manage your limits and controls</p>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
          {/* Active Exclusion Warning */}
          {activeExclusion && (
            <div className="cmd-panel border-[#EF4444] shadow-[0_0_15px_rgba(239,68,68,0.3)] p-4">
              <div className="flex items-start gap-3">
                <Lock className="w-6 h-6 text-[#EF4444] flex-shrink-0" />
                <div>
                  <p className="font-semibold text-[#EF4444]">Self-Exclusion Active</p>
                  <p className="text-sm text-[#64748B] mt-1">
                    {activeExclusion.type === 'permanent'
                      ? 'You have permanently self-excluded from all poker activities.'
                      : `Your exclusion expires on ${new Date(activeExclusion.expires_at).toLocaleDateString()}`
                    }
                  </p>
                  <p className="text-xs text-[#64748B] mt-2">
                    This cannot be reversed early. Contact support for assistance.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Risk Status Alert */}
          {riskStatus && riskStatus !== 'low' && (
            <div className={`cmd-panel p-4 ${
              riskStatus === 'high' ? 'border-[#EF4444]' : 'border-[#F59E0B]'
            }`}>
              <div className="flex items-start gap-3">
                <AlertTriangle className={`w-5 h-5 flex-shrink-0 ${
                  riskStatus === 'high' ? 'text-[#EF4444]' : 'text-[#F59E0B]'
                }`} />
                <div>
                  <p className={`font-medium ${
                    riskStatus === 'high' ? 'text-[#EF4444]' : 'text-[#F59E0B]'
                  }`}>
                    {riskStatus === 'high' ? 'High Risk Detected' : 'Moderate Risk Detected'}
                  </p>
                  <p className="text-sm text-[#64748B] mt-1">
                    {riskStatus === 'high'
                      ? 'Your recent activity suggests you may be at risk. Consider setting lower limits or taking a break.'
                      : 'Your spending patterns have increased recently. Review your limits below.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Spending Limits */}
          <section>
            <h2 className="font-semibold text-white mb-3">Spending Limits</h2>
            <div className="space-y-3">
              <LimitCard
                icon={Calendar}
                label="Daily Buy-in Limit"
                value={limits.daily_limit}
                onChange={(v) => setLimits(prev => ({ ...prev, daily_limit: v }))}
                max={5000}
              />
              <LimitCard
                icon={Calendar}
                label="Weekly Buy-in Limit"
                value={limits.weekly_limit}
                onChange={(v) => setLimits(prev => ({ ...prev, weekly_limit: v }))}
                max={20000}
              />
              <LimitCard
                icon={Calendar}
                label="Monthly Buy-in Limit"
                value={limits.monthly_limit}
                onChange={(v) => setLimits(prev => ({ ...prev, monthly_limit: v }))}
                max={50000}
              />
            </div>
          </section>

          {/* Session Limits */}
          <section>
            <h2 className="font-semibold text-white mb-3">Session Limits</h2>
            <div className="space-y-3">
              <LimitCard
                icon={Clock}
                label="Session Duration Limit"
                value={limits.session_duration_limit}
                onChange={(v) => setLimits(prev => ({ ...prev, session_duration_limit: v }))}
                max={720}
                unit=""
              />
              {limits.session_duration_limit && (
                <p className="text-sm text-[#64748B] px-1">
                  You will receive an alert after {limits.session_duration_limit} minutes of play
                </p>
              )}
              <LimitCard
                icon={DollarSign}
                label="Loss Limit"
                value={limits.loss_limit}
                onChange={(v) => setLimits(prev => ({ ...prev, loss_limit: v }))}
                max={10000}
              />
            </div>
          </section>

          {/* Alerts Toggle */}
          <div className="cmd-panel p-4">
            <label className="flex items-center justify-between cursor-pointer">
              <div className="flex items-center gap-3">
                <Bell className="w-5 h-5 text-[#64748B]" />
                <div>
                  <p className="font-medium text-white">Enable Alerts</p>
                  <p className="text-sm text-[#64748B]">Get notified when approaching limits</p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={limits.alerts_enabled}
                onChange={(e) => setLimits(prev => ({ ...prev, alerts_enabled: e.target.checked }))}
                className="w-5 h-5 rounded border-[#1A2E4A] accent-[#22D3EE]"
              />
            </label>
          </div>

          {/* Save Limits Button */}
          <button
            onClick={handleSaveLimits}
            disabled={saving}
            className="cmd-btn cmd-btn-primary w-full flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Save Limits'}
          </button>

          {/* Self-Exclusion Section */}
          {!activeExclusion && (
            <section>
              <h2 className="font-semibold text-white mb-3 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-[#EF4444]" />
                Self-Exclusion
              </h2>
              <p className="text-sm text-[#64748B] mb-4">
                If you need a break from poker, you can temporarily or permanently exclude yourself from all Club Commander venues.
              </p>
              <div className="space-y-2">
                <ExclusionOption
                  duration={1}
                  label="24-Hour Cool-Off"
                  description="Take a day to reset"
                  selected={exclusion === 1}
                  onSelect={setExclusion}
                />
                <ExclusionOption
                  duration={7}
                  label="7-Day Break"
                  description="Week-long exclusion"
                  selected={exclusion === 7}
                  onSelect={setExclusion}
                />
                <ExclusionOption
                  duration={30}
                  label="30-Day Exclusion"
                  description="Month-long break from poker"
                  selected={exclusion === 30}
                  onSelect={setExclusion}
                />
                <ExclusionOption
                  duration={90}
                  label="90-Day Exclusion"
                  description="Extended break period"
                  selected={exclusion === 90}
                  onSelect={setExclusion}
                />
                <ExclusionOption
                  duration="permanent"
                  label="Permanent Self-Exclusion"
                  description="Cannot be reversed"
                  selected={exclusion === 'permanent'}
                  onSelect={setExclusion}
                />
              </div>

              {exclusion && (
                <button
                  onClick={() => setShowExclusionConfirm(true)}
                  className="cmd-btn cmd-btn-danger w-full mt-4"
                >
                  Confirm Self-Exclusion
                </button>
              )}
            </section>
          )}

          {/* Resources */}
          <section className="cmd-panel p-4">
            <h3 className="font-semibold text-white mb-2">Need Help?</h3>
            <p className="text-sm text-[#64748B] mb-3">
              If you or someone you know has a gambling problem, help is available.
            </p>
            <div className="space-y-2 text-sm">
              <p className="text-[#22D3EE] font-medium">National Problem Gambling Helpline</p>
              <p className="text-white">1-800-522-4700 (24/7)</p>
              <p className="text-[#64748B]">ncpgambling.org</p>
            </div>
          </section>
        </main>

        {/* Exclusion Confirmation Modal */}
        {showExclusionConfirm && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="w-full max-w-md cmd-panel cmd-corner-lights p-6 relative">
              <span className="cmd-light cmd-light-tl" />
              <span className="cmd-light cmd-light-tr" />
              <span className="cmd-light cmd-light-bl" />
              <span className="cmd-light cmd-light-br" />
              <div className="cmd-rivets">
                <div className="cmd-rivet cmd-rivet-tl" />
                <div className="cmd-rivet cmd-rivet-tr" />
                <div className="cmd-rivet cmd-rivet-bl" />
                <div className="cmd-rivet cmd-rivet-br" />
              </div>

              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-[#EF4444]/10 rounded-full flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-[#EF4444]" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Confirm Self-Exclusion</h2>
                  <p className="text-sm text-[#64748B]">This action cannot be undone early</p>
                </div>
              </div>

              <div className="bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-lg p-4 mb-6">
                <p className="text-[#EF4444] text-sm">
                  {exclusion === 'permanent'
                    ? 'You are about to permanently exclude yourself from all poker activities. This cannot be reversed.'
                    : `You are about to exclude yourself for ${exclusion} day${exclusion > 1 ? 's' : ''}. This cannot be reversed early.`
                  }
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowExclusionConfirm(false)}
                  className="flex-1 h-12 border border-[#1A2E4A] text-[#64748B] font-semibold rounded-lg hover:bg-[#1A2E4A] transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSelfExclude}
                  disabled={saving}
                  className="cmd-btn cmd-btn-danger flex-1 flex items-center justify-center gap-2"
                >
                  {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'I Understand, Proceed'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
