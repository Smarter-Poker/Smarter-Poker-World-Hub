/**
 * Rate Table - Player Hub
 * /hub/commander/rate-table
 * Players rate table atmosphere after a session
 */
import { useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import SEOHead from '../../../src/components/seo/SEOHead';
import CommanderPageShell from '../../../src/components/commander/CommanderPageShell';
// 2026-07-25 audit fix: use the standard auth helper ('smarter-poker-auth' key)
// instead of the nonexistent 'sb-access-token' localStorage key.
import { getAccessToken, getFreshAccessToken } from '../../../src/lib/authUtils';
import {
  ArrowLeft, Flame, Smile, Zap, Star, Send, CheckCircle2, Loader2
} from 'lucide-react';

const LABELS = {
  action_level: { low: 'Tight/Nit', high: 'Wild/Action', icon: Flame, color: '#EF4444' },
  friendliness: { low: 'Serious', high: 'Social/Fun', icon: Smile, color: '#31A24C' },
  pace: { low: 'Slow', high: 'Fast', icon: Zap, color: '#3B82F6' },
};

export default function RateTable() {
  const router = useRouter();
  const { venue_id, table_number, game_type, stakes } = router.query;
  const [action, setAction] = useState(3);
  const [friendly, setFriendly] = useState(3);
  const [pace, setPace] = useState(3);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  // 2026-07-25 audit fix: submit errors were swallowed - surface them.
  const [error, setError] = useState(null);

  const getToken = () => typeof window !== 'undefined' ? getAccessToken() : null;

  const handleSubmit = async () => {

  if (!router.isReady) return null;

    if (!venue_id || !table_number) return;
    setSubmitting(true);
    setError(null);
    try {
      const token = await getFreshAccessToken();
      if (!token) {
        router.push(`/auth/login?redirect=${encodeURIComponent(router.asPath)}`);
        return;
      }
      const res = await fetch('/api/commander/table-ratings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          venue_id,
          table_number: parseInt(table_number),
          action_level: action,
          friendliness: friendly,
          pace,
          game_type: game_type || null,
          stakes: stakes || null,
          comment: comment.trim() || null
        })
      });
      // 2026-07-25 audit fix: surface submit failures instead of swallowing them.
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.success) {
        setDone(true);
      } else {
        const msg = json.error?.message || (typeof json.error === 'string' ? json.error : '') || `Failed to submit rating (${res.status})`;
        setError(msg);
      }
    } catch (err) {
      console.warn(err);
      setError('Connection error. Please try again.');
    }
    finally { setSubmitting(false); }
  };

  const RatingSlider = ({ label, value, onChange, config }) => {
    const Icon = config.icon;
    return (
      <div className="cmd-panel p-4">
        <div className="flex items-center gap-2 mb-2.5">
          <Icon size={18} color={config.color} aria-hidden="true" />
          <span className="font-bold text-[15px] text-[#F2F7FF]">{label}</span>
        </div>
        <div className="flex justify-between mb-1.5">
          <span className="text-[13px] text-[#BDD0E2]">{config.low}</span>
          <span className="text-[13px] text-[#BDD0E2]">{config.high}</span>
        </div>
        <div className="flex gap-1.5" role="group" aria-label={label}>
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n} type="button" onClick={() => onChange(n)} aria-pressed={value === n}
              className={`cmd-btn flex-1 h-11 justify-center text-lg font-extrabold ${value === n ? 'cmd-btn-primary' : 'cmd-btn-secondary'}`}>
              {n}
            </button>
          ))}
        </div>
      </div>
    );
  };

  if (done) {
    return (
      <CommanderPageShell>
        <SEOHead
          title="Rate Table"
          description="Smarter.Poker - The Future Of The Game."
          noindex={true}
        />
        <div className="cmd-page min-h-screen flex items-center justify-center px-4">
          <div className="cmd-panel text-center p-8 max-w-md w-full">
            <CheckCircle2 size={56} color="#31A24C" className="mx-auto mb-4" aria-hidden="true" />
            <h1 className="text-2xl font-extrabold text-[#F2F7FF] mb-1.5">Thanks For Rating</h1>
            <p className="text-sm text-[#BDD0E2] mb-6">Your Feedback Helps Other Players Find The Right Game.</p>
            <button type="button" onClick={() => router.back()} className="cmd-btn cmd-btn-primary h-12 px-8 justify-center font-bold">
              Done
            </button>
          </div>
        </div>
      </CommanderPageShell>
    );
  }

  return (
    <CommanderPageShell>
      <Head><title>Rate Table | Smarter.Poker</title></Head>
      <div className="cmd-page min-h-screen">
        <div className="cmd-back-row">
          <button className="cmd-back-link" type="button" onClick={() => router.back()} aria-label="Back">
            <ArrowLeft size={22} aria-hidden="true" />
            <span>Back</span>
          </button>
        </div>
        <header className="cmd-header-full">
          <div className="flex items-center gap-3 px-4 py-4 sm:px-6 sm:py-5">
            <div className="cmd-icon-box w-11 h-11 flex items-center justify-center shrink-0">
              <Star size={22} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h1>Rate Table {table_number}</h1>
              {game_type && <p className="text-sm">{game_type} {stakes}</p>}
            </div>
          </div>
        </header>

        <div className="px-4 pb-6 max-w-[480px] mx-auto flex flex-col gap-3">
          <p className="text-sm text-[#BDD0E2] text-center">How Was The Game?</p>

          <RatingSlider label="Action Level" value={action} onChange={setAction} config={LABELS.action_level} />
          <RatingSlider label="Friendliness" value={friendly} onChange={setFriendly} config={LABELS.friendliness} />
          <RatingSlider label="Pace" value={pace} onChange={setPace} config={LABELS.pace} />

          <div className="cmd-panel p-4">
            <label htmlFor="rate-table-comment" className="block font-semibold text-sm text-[#F2F7FF] mb-1.5">Comment (Optional)</label>
            <textarea id="rate-table-comment" value={comment} onChange={e => setComment(e.target.value)} rows={2}
              placeholder="How Was The Table?"
              className="cmd-input w-full px-3 py-2.5 text-sm resize-y" />
          </div>

          {/* 2026-07-25 audit fix: submit error surfaced in the UI. */}
          {error && (
            <div role="alert" className="rounded-lg border border-[#EF4444] bg-[#EF44441A] px-3 py-2.5 text-[13px] text-[#FCA5A5] text-center">
              {error}
            </div>
          )}

          <button type="button" onClick={handleSubmit} disabled={submitting}
            className="cmd-btn cmd-btn-primary w-full h-12 justify-center gap-2 text-base font-bold disabled:opacity-70 flex items-center">
            {submitting ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : <Send size={18} aria-hidden="true" />}
            Submit Rating
          </button>
        </div>
      </div>
    </CommanderPageShell>
  );
}
