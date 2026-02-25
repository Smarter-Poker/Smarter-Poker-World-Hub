/**
 * Membership Plans — Image-Based Layout with JS Click Detection
 * /commander/membership-plans
 *
 * Uses the exact mockup image as the page.
 * Clicks anywhere on the image are detected via JS — the Y position
 * relative to the image determines which plan card was tapped.
 * No CSS-positioned hotspot buttons needed.
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { Loader2, Check } from 'lucide-react';
import CommanderLayout from '../../src/components/commander/shared/CommanderLayout';

const PLAN_ORDER = ['daily', 'weekly', 'monthly', 'yearly'];
const PLAN_LABELS = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', yearly: 'Yearly' };

// Card zones in the source image (1024×835px) — measured as percentage of image height
// Each entry: [topPercent, bottomPercent]
const CARD_ZONES = {
  daily: [27, 38],
  weekly: [39, 51],
  monthly: [52, 64],
  yearly: [65, 77],
};

function getPlanPrice(plan) {
  if (plan.tier === 'daily') return plan.price_daily;
  if (plan.tier === 'weekly') return plan.price_weekly;
  if (plan.tier === 'monthly') return plan.price_monthly;
  if (plan.tier === 'yearly') return plan.price_yearly;
  return null;
}

function getPriceField(tier) {
  return tier === 'daily' ? 'price_daily'
    : tier === 'weekly' ? 'price_weekly'
      : tier === 'monthly' ? 'price_monthly'
        : 'price_yearly';
}

export default function MembershipPlansPage() {
  const router = useRouter();
  const [venueId, setVenueId] = useState(null);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editPrice, setEditPrice] = useState('');
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const s = localStorage.getItem('commander_staff');
    if (!s) return router.push('/commander/login').catch(() => { });
    try {
      const sd = JSON.parse(s);
      if (!sd.venue_id) return router.push('/commander/login').catch(() => { });
      setVenueId(sd.venue_id);
    } catch { router.push('/commander/login').catch(() => { }); }
  }, [router]);

  useEffect(() => { if (venueId) fetchPlans(); }, [venueId]);

  async function fetchPlans() {
    setLoading(true);
    try {
      const res = await fetch(`/api/commander/membership-plans?venue_id=${venueId}&include_inactive=true`, {
        headers: { 'x-staff-session': localStorage.getItem('commander_staff') || '' }
      });
      const data = await res.json();
      if (data.success) {
        const p = data.data.plans || [];
        p.sort((a, b) => PLAN_ORDER.indexOf(a.tier) - PLAN_ORDER.indexOf(b.tier));
        setPlans(p);
      }
    } catch { setError('Failed To Load Plans'); }
    setLoading(false);
  }

  // Map plans by tier
  const planByTier = {};
  plans.forEach(p => { planByTier[p.tier] = p; });

  // JS click detection: calculate Y% relative to image, map to card zone
  const handleImageClick = useCallback((e) => {
    const img = e.currentTarget;
    const rect = img.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const yPercent = (clickY / rect.height) * 100;

    // Find which card zone was clicked
    for (const [tier, [top, bottom]] of Object.entries(CARD_ZONES)) {
      if (yPercent >= top && yPercent <= bottom) {
        const plan = planByTier[tier];
        if (plan) {
          setEditingId(plan.id);
          const price = getPlanPrice(plan);
          setEditPrice(price != null ? String(Number(price)) : '');
          setError(null);
        }
        return;
      }
    }
    // Click was outside any card zone — do nothing
  }, [planByTier]);

  async function savePrice(plan) {
    setSaving(plan.id);
    setError(null);
    try {
      const price = parseFloat(editPrice);
      if (isNaN(price) || price < 0) { setError('Enter A Valid Price'); setSaving(null); return; }
      const field = getPriceField(plan.tier);
      const res = await fetch(`/api/commander/membership-plans?venue_id=${venueId}&id=${plan.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-staff-session': localStorage.getItem('commander_staff') || '' },
        body: JSON.stringify({ [field]: price })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setSuccess('Price Updated!');
      setTimeout(() => setSuccess(null), 3000);
      setEditingId(null);
      fetchPlans();
    } catch (err) { setError(err.message || 'Failed To Save'); }
    setSaving(null);
  }

  return (
    <CommanderLayout title="Membership Plans" backHref="/commander/dashboard">
      <style jsx>{`
        .mp-page {
          min-height: 100vh;
          background: #0f0f0f;
          font-family: 'Inter', sans-serif;
          padding: 0;
          margin: 0;
        }
        .mp-container {
          position: relative;
          width: 100%;
        }
        .mp-bg-img {
          width: 100%;
          display: block;
          cursor: pointer;
        }
        /* Edit modal */
        .mp-edit-overlay {
          position: fixed;
          inset: 0;
          z-index: 300;
          background: rgba(0,0,0,0.75);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .mp-edit-modal {
          background: linear-gradient(135deg, #1e1e26 0%, #16161a 100%);
          border: 2px solid #3a3a44;
          border-radius: 20px;
          padding: 28px 24px;
          width: 100%;
          max-width: 380px;
          box-shadow: 0 12px 48px rgba(0,0,0,0.7);
          text-align: center;
        }
        .mp-edit-title {
          font-size: 20px;
          font-weight: 800;
          color: #fff;
          margin-bottom: 6px;
        }
        .mp-edit-subtitle {
          font-size: 13px;
          color: #888;
          margin-bottom: 24px;
        }
        .mp-edit-input-wrap {
          position: relative;
          width: 180px;
          margin: 0 auto 20px;
        }
        .mp-edit-input-wrap .pfx {
          position: absolute;
          left: 18px;
          top: 50%;
          transform: translateY(-50%);
          font-size: 24px;
          font-weight: 800;
          color: #666;
          pointer-events: none;
        }
        .mp-edit-input {
          width: 100%;
          background: #111;
          border: 2px solid #444;
          border-radius: 14px;
          padding: 14px 20px 14px 40px;
          color: #fff;
          font-size: 28px;
          font-weight: 900;
          outline: none;
          text-align: center;
          transition: border-color 0.2s;
        }
        .mp-edit-input:focus { border-color: #1877F2; }
        .mp-edit-btns {
          display: flex;
          gap: 10px;
          justify-content: center;
        }
        .mp-btn-save {
          background: linear-gradient(135deg, #31A24C, #1e7a34);
          border: none;
          border-radius: 12px;
          padding: 12px 28px;
          color: #fff;
          font-size: 15px;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          box-shadow: 0 2px 8px rgba(49,162,76,0.3);
          transition: opacity 0.2s;
        }
        .mp-btn-save:hover { opacity: 0.9; }
        .mp-btn-cancel {
          background: rgba(255,255,255,0.07);
          border: 1px solid #444;
          border-radius: 12px;
          padding: 12px 24px;
          color: #999;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .mp-btn-cancel:hover { border-color: #666; color: #fff; }
        .mp-toast {
          position: fixed;
          top: 70px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 400;
          padding: 12px 24px;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 700;
        }
        .mp-toast.ok { background: rgba(49,162,76,0.95); color: #fff; box-shadow: 0 4px 16px rgba(49,162,76,0.4); }
        .mp-toast.err { background: rgba(239,68,68,0.95); color: #fff; box-shadow: 0 4px 16px rgba(239,68,68,0.4); }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      <div className="mp-page">
        {/* Toasts */}
        {success && <div className="mp-toast ok">✓ {success}</div>}
        {error && !editingId && <div className="mp-toast err">⚠ {error}</div>}

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
            <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: '#1877F2' }} />
          </div>
        ) : (
          <div className="mp-container">
            {/* Full-width background image — click detection via JS */}
            <img
              src="https://kuklfnapbkmacvwxktbh.supabase.co/storage/v1/object/public/media/commander/membership-plans-bg.jpg"
              alt="Membership Plans"
              className="mp-bg-img"
              draggable={false}
              onClick={handleImageClick}
            />
          </div>
        )}

        {/* Edit price modal */}
        {editingId && (() => {
          const plan = plans.find(p => p.id === editingId);
          if (!plan) return null;
          const meta = PLAN_LABELS[plan.tier] || plan.tier;
          return (
            <div className="mp-edit-overlay" onClick={e => { if (e.target === e.currentTarget) setEditingId(null); }}>
              <div className="mp-edit-modal">
                <div className="mp-edit-title">Edit {meta} Price</div>
                <div className="mp-edit-subtitle">Set The {meta} Membership Rate</div>
                {error && <div style={{ color: '#EF4444', fontSize: 13, fontWeight: 600, marginBottom: 16 }}>⚠ {error}</div>}
                <div className="mp-edit-input-wrap">
                  <span className="pfx">$</span>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    className="mp-edit-input"
                    value={editPrice}
                    onChange={e => setEditPrice(e.target.value)}
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Enter') savePrice(plan);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                  />
                </div>
                <div className="mp-edit-btns">
                  <button className="mp-btn-cancel" onClick={() => setEditingId(null)}>Cancel</button>
                  <button className="mp-btn-save" disabled={saving === plan.id} onClick={() => savePrice(plan)}>
                    {saving === plan.id
                      ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                      : <Check size={16} />}
                    Save Price
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </CommanderLayout>
  );
}
