/**
 * Membership Plans — Futuristic Metal UI
 * /commander/membership-plans
 *
 * 4 interval plans: Daily $5, Weekly $10, Monthly $25, Yearly $199
 * Click any card to expand inline price editor.
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { Loader2, Save, X, Check } from 'lucide-react';
import CommanderLayout from '../../src/components/commander/shared/CommanderLayout';

const PLAN_META = {
  daily: { color: '#22D3EE', starBg: 'linear-gradient(135deg, #1a8fa8, #22D3EE)', label: 'Daily', period: '/Day', badgeGrad: 'linear-gradient(135deg, #1a8fa8, #22D3EE)' },
  weekly: { color: '#31A24C', starBg: 'linear-gradient(135deg, #1e7a34, #31A24C)', label: 'Weekly', period: '/Wk', badgeGrad: 'linear-gradient(135deg, #1e7a34, #31A24C)' },
  monthly: { color: '#F59E0B', starBg: 'linear-gradient(135deg, #c27d08, #F59E0B)', label: 'Monthly', period: '/Mo', badgeGrad: 'linear-gradient(135deg, #c27d08, #F59E0B)' },
  yearly: { color: '#8B5CF6', starBg: 'linear-gradient(135deg, #6d3fd4, #8B5CF6)', label: 'Yearly', period: '/Yr', badgeGrad: 'linear-gradient(135deg, #6d3fd4, #8B5CF6)' },
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
        const order = ['daily', 'weekly', 'monthly', 'yearly'];
        p.sort((a, b) => order.indexOf(a.tier) - order.indexOf(b.tier));
        setPlans(p);
      }
    } catch { setError('Failed To Load Plans'); }
    setLoading(false);
  }

  function handleCardClick(plan) {
    if (editingId === plan.id) return; // already editing
    setEditingId(plan.id);
    const price = getPlanPrice(plan);
    setEditPrice(price != null ? String(Number(price)) : '');
    setError(null);
  }

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
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Inter:wght@400;500;600;700;800&display=swap');

        .mp-page {
          min-height: 100vh;
          background: linear-gradient(180deg, #1c1c24 0%, #141418 40%, #0f0f12 100%);
          font-family: 'Inter', sans-serif;
          padding: 0 0 80px;
        }

        /* ── Outer metal frame ── */
        .mp-frame {
          max-width: 620px;
          margin: 0 auto;
          padding: 28px 16px;
        }

        .mp-panel {
          background: linear-gradient(180deg, #2a2a32 0%, #1e1e26 50%, #1a1a22 100%);
          border: 2px solid #3a3a44;
          border-radius: 20px;
          padding: 32px 24px;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.06),
            0 8px 32px rgba(0,0,0,0.6),
            0 0 0 1px rgba(0,0,0,0.3);
          position: relative;
          overflow: hidden;
        }

        /* Corner accent lines */
        .mp-panel::before {
          content: '';
          position: absolute;
          top: 12px; left: 20px; right: 60%;
          height: 2px;
          background: linear-gradient(90deg, #555 0%, transparent 100%);
          border-radius: 1px;
        }
        .mp-panel::after {
          content: '';
          position: absolute;
          top: 12px; right: 20px;
          width: 40px; height: 2px;
          background: linear-gradient(90deg, transparent, #555);
          border-radius: 1px;
        }

        /* ── Title ── */
        .mp-title {
          font-family: 'Orbitron', sans-serif;
          font-size: 28px;
          font-weight: 900;
          color: #fff;
          letter-spacing: 1px;
          margin-bottom: 4px;
          text-shadow: 0 2px 8px rgba(0,0,0,0.5);
        }
        .mp-subtitle {
          font-size: 13px;
          color: #888;
          margin-bottom: 28px;
          letter-spacing: 0.3px;
        }

        /* ── Plan card ── */
        .mp-card {
          background: linear-gradient(135deg, #28282f 0%, #1f1f25 50%, #1a1a20 100%);
          border: 2px solid #333;
          border-radius: 14px;
          margin-bottom: 12px;
          cursor: pointer;
          transition: all 0.2s ease;
          overflow: hidden;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.04),
            0 2px 8px rgba(0,0,0,0.3);
        }
        .mp-card:hover {
          border-color: #444;
          transform: translateY(-1px);
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.06),
            0 4px 16px rgba(0,0,0,0.4);
        }
        .mp-card.editing {
          border-color: #555;
          box-shadow:
            inset 0 1px 0 rgba(255,255,255,0.06),
            0 6px 24px rgba(0,0,0,0.5);
        }

        .mp-card-row {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 16px 18px;
        }

        /* Star icon */
        .mp-star {
          width: 44px; height: 44px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          box-shadow: 0 2px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.2);
        }
        .mp-star svg {
          filter: drop-shadow(0 1px 2px rgba(0,0,0,0.5));
        }

        .mp-card-info { flex: 1; min-width: 0; }
        .mp-card-name {
          font-size: 17px;
          font-weight: 700;
          color: #fff;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .mp-badge {
          font-size: 11px;
          font-weight: 700;
          padding: 2px 10px;
          border-radius: 20px;
          color: #fff;
          text-transform: lowercase;
          letter-spacing: 0.5px;
          box-shadow: 0 1px 4px rgba(0,0,0,0.3);
        }
        .mp-card-price-row {
          font-size: 14px;
          color: #999;
          margin-top: 2px;
        }
        .mp-card-price-row strong {
          color: #ccc;
          font-weight: 700;
        }

        /* ── Edit panel (expanded) ── */
        .mp-edit-panel {
          border-top: 1px solid #333;
          padding: 18px 18px 16px;
          background: rgba(0,0,0,0.15);
        }
        .mp-edit-label {
          font-size: 12px;
          font-weight: 700;
          color: #888;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin-bottom: 10px;
        }
        .mp-edit-row {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .mp-edit-input-wrap {
          position: relative;
          flex: 1;
          max-width: 180px;
        }
        .mp-edit-input-wrap .pfx {
          position: absolute;
          left: 14px;
          top: 50%;
          transform: translateY(-50%);
          font-size: 18px;
          font-weight: 800;
          color: #666;
          pointer-events: none;
        }
        .mp-edit-input {
          width: 100%;
          background: #111;
          border: 2px solid #444;
          border-radius: 10px;
          padding: 10px 14px 10px 28px;
          color: #fff;
          font-size: 20px;
          font-weight: 800;
          outline: none;
          transition: border-color 0.2s;
        }
        .mp-edit-input:focus { border-color: #1877F2; }
        .mp-btn-save {
          background: linear-gradient(135deg, #31A24C, #1e7a34);
          border: none;
          border-radius: 10px;
          padding: 10px 18px;
          color: #fff;
          font-size: 14px;
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
          background: none;
          border: 1px solid #444;
          border-radius: 10px;
          padding: 10px 14px;
          color: #999;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        .mp-btn-cancel:hover { border-color: #666; color: #fff; }

        /* ── Info box ── */
        .mp-info-box {
          background: linear-gradient(135deg, #1a1a22 0%, #141418 100%);
          border: 2px solid #2a2a32;
          border-radius: 14px;
          padding: 18px 20px;
          margin-top: 20px;
          box-shadow: inset 0 1px 0 rgba(255,255,255,0.03);
        }
        .mp-info-box p {
          font-size: 13px;
          color: #777;
          line-height: 1.7;
          margin: 0;
        }
        .mp-info-box strong { color: #F59E0B; }
        .mp-info-label { color: #bbb !important; font-weight: 700 !important; }

        /* ── Toast ── */
        .mp-toast {
          padding: 12px 16px;
          border-radius: 12px;
          font-size: 14px;
          font-weight: 600;
          margin-bottom: 16px;
        }
        .mp-toast.ok { background: rgba(49,162,76,0.12); color: #31A24C; border: 1px solid rgba(49,162,76,0.25); }
        .mp-toast.err { background: rgba(239,68,68,0.12); color: #EF4444; border: 1px solid rgba(239,68,68,0.25); }

        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      <div className="mp-page">
        <div className="mp-frame">
          <div className="mp-panel">
            {/* Title */}
            <div className="mp-title">Membership Plans</div>
            <div className="mp-subtitle">Set Pricing & Perks Per Tier</div>

            {/* Toasts */}
            {success && <div className="mp-toast ok">✓ {success}</div>}
            {error && <div className="mp-toast err">⚠ {error}</div>}

            {/* Loading */}
            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
                <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: '#1877F2' }} />
              </div>
            ) : plans.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <div style={{ fontSize: 16, color: '#888' }}>No Plans Found — Refresh To Auto-Create</div>
              </div>
            ) : (
              plans.map(plan => {
                const meta = PLAN_META[plan.tier] || PLAN_META.daily;
                const price = getPlanPrice(plan);
                const isEditing = editingId === plan.id;

                return (
                  <div key={plan.id}
                    className={`mp-card ${isEditing ? 'editing' : ''}`}
                    style={isEditing ? { borderColor: meta.color + '55' } : undefined}
                    onClick={() => handleCardClick(plan)}
                  >
                    {/* Card row */}
                    <div className="mp-card-row">
                      {/* Star icon */}
                      <div className="mp-star" style={{ background: meta.starBg }}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff" stroke="none">
                          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                        </svg>
                      </div>

                      {/* Info */}
                      <div className="mp-card-info">
                        <div className="mp-card-name">
                          {meta.label} Membership
                          <span className="mp-badge" style={{ background: meta.badgeGrad }}>{plan.tier}</span>
                        </div>
                        <div className="mp-card-price-row">
                          <strong>${price != null ? Number(price).toFixed(0) : '—'}</strong>{meta.period}
                        </div>
                      </div>
                    </div>

                    {/* Edit panel (expanded) */}
                    {isEditing && (
                      <div className="mp-edit-panel" onClick={e => e.stopPropagation()}>
                        <div className="mp-edit-label">Edit {meta.label} Price</div>
                        <div className="mp-edit-row">
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
                          <button className="mp-btn-save" disabled={saving === plan.id}
                            onClick={() => savePrice(plan)}>
                            {saving === plan.id
                              ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                              : <Check size={16} />}
                            Save
                          </button>
                          <button className="mp-btn-cancel" onClick={() => setEditingId(null)}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {/* Info box */}
            {!loading && plans.length > 0 && (
              <div className="mp-info-box">
                <p>
                  <span className="mp-info-label">How It Works: </span>
                  Set Pricing At Any Interval You Want — Daily Passes For Tourists, Weekly For Short-Term Players, Monthly For Regulars, Yearly For VIPs. Leave An Interval Blank If You Don't Offer It. Use The <strong>Edit Prices</strong> Button For Quick Price Updates Without Opening The Full Editor.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </CommanderLayout>
  );
}
