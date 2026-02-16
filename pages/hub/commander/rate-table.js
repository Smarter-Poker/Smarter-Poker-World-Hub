/**
 * Rate Table — Player Hub
 * /hub/commander/rate-table
 * Players rate table atmosphere after a session
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../../src/components/seo/SEOHead';
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

  const getToken = () => typeof window !== 'undefined'
    ? localStorage.getItem('sb-access-token') : null;

  const handleSubmit = async () => {
    if (!venue_id || !table_number) return;
    setSubmitting(true);
    try {
      const token = getToken();
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
      const json = await res.json();
      if (json.success) setDone(true);
    } catch (err) { console.error(err); }
    finally { setSubmitting(false); }
  };

  const RatingSlider = ({ label, value, onChange, config }) => {
    const Icon = config.icon;
    return (
      <div style={{ background: 'white', borderRadius: 12, padding: 16, border: '1px solid #E4E6EB' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Icon size={18} color={config.color} />
          <span style={{ fontWeight: 700, fontSize: 15, color: '#1C2526' }}>{label}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: '#65676B' }}>{config.low}</span>
          <span style={{ fontSize: 11, color: '#65676B' }}>{config.high}</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n} onClick={() => onChange(n)}
              style={{
                flex: 1, height: 44, border: '2px solid', borderRadius: 10, fontSize: 18, fontWeight: 800,
                cursor: 'pointer', transition: 'all 0.15s',
                background: value === n ? config.color : 'white',
                borderColor: value === n ? config.color : '#E4E6EB',
                color: value === n ? 'white' : '#65676B'
              }}>
              {n}
            </button>
          ))}
        </div>
      </div>
    );
  };

  if (done) {
    return (
      <>
        <SEOHead
                title="Rate Table"
                description="Smarter.Poker — The Future of the Game."
                noindex={true}
            />
        <div style={{ minHeight: '100vh', background: '#F0F2F5', fontFamily: 'Inter, system-ui, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ textAlign: 'center', padding: 32 }}>
            <CheckCircle2 size={56} color="#31A24C" style={{ marginBottom: 16 }} />
            <div style={{ fontSize: 22, fontWeight: 800, color: '#1C2526', marginBottom: 6 }}>Thanks for Rating!</div>
            <div style={{ fontSize: 14, color: '#65676B', marginBottom: 24 }}>Your feedback helps other players find the right game.</div>
            <button onClick={() => router.back()}
              style={{ background: '#1877F2', color: 'white', border: 'none', borderRadius: 10, padding: '12px 32px', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
              Done
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head><title>Rate Table | Smarter.Poker</title></Head>
      <div style={{ minHeight: '100vh', background: '#F0F2F5', fontFamily: 'Inter, system-ui, sans-serif' }}>
        <div style={{ background: '#1877F2', color: 'white', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: 4 }}>
            <ArrowLeft size={22} />
          </button>
          <Star size={22} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 17 }}>Rate Table {table_number}</div>
            {game_type && <div style={{ fontSize: 12, opacity: 0.85 }}>{game_type} {stakes}</div>}
          </div>
        </div>

        <div style={{ padding: 16, maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 14, color: '#65676B', textAlign: 'center' }}>How was the game?</div>

          <RatingSlider label="Action Level" value={action} onChange={setAction} config={LABELS.action_level} />
          <RatingSlider label="Friendliness" value={friendly} onChange={setFriendly} config={LABELS.friendliness} />
          <RatingSlider label="Pace" value={pace} onChange={setPace} config={LABELS.pace} />

          <div style={{ background: 'white', borderRadius: 12, padding: 16, border: '1px solid #E4E6EB' }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: '#1C2526', marginBottom: 6 }}>Comment (optional)</div>
            <textarea value={comment} onChange={e => setComment(e.target.value)} rows={2}
              placeholder="How was the table?"
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #CED0D4', borderRadius: 8, fontSize: 14, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }} />
          </div>

          <button onClick={handleSubmit} disabled={submitting}
            style={{ background: '#1877F2', color: 'white', border: 'none', borderRadius: 10, padding: '14px 0', fontSize: 16, fontWeight: 700, cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {submitting ? <Loader2 size={18} className="spin" /> : <Send size={18} />}
            Submit Rating
          </button>
        </div>
      </div>
      <style jsx global>{`.spin { animation: spin 1s linear infinite; } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
