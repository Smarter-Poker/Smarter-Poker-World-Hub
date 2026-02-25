/**
 * Membership Plans Admin
 * /commander/membership-plans
 * 
 * Simple interval-based membership plans:
 *   Daily $5 · Weekly $10 · Monthly $25 · Yearly $199
 * 
 * Staff can edit the price for each interval.
 * Plans auto-seed on first visit.
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import {
  Plus, Save, Loader2, DollarSign, Crown,
  X, Check, Edit3, Calendar, Clock, CalendarDays, CalendarRange, Pencil
} from 'lucide-react';
import CommanderLayout from '../../src/components/commander/shared/CommanderLayout';

const PLAN_META = {
  daily: { icon: Clock, color: '#22D3EE', label: 'Daily', defaultPrice: 5, period: 'Per Day' },
  weekly: { icon: CalendarDays, color: '#31A24C', label: 'Weekly', defaultPrice: 10, period: 'Per Week' },
  monthly: { icon: CalendarRange, color: '#F59E0B', label: 'Monthly', defaultPrice: 25, period: 'Per Month' },
  yearly: { icon: Calendar, color: '#8B5CF6', label: 'Yearly', defaultPrice: 199, period: 'Per Year' },
};

export default function MembershipPlansPage() {
  const router = useRouter();
  const [staff, setStaff] = useState(null);
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
      setStaff(sd);
      setVenueId(sd.venue_id);
    } catch { router.push('/commander/login').catch(() => { }); }
  }, [router]);

  useEffect(() => { if (venueId) fetchPlans(); }, [venueId]);

  async function fetchPlans() {
    setLoading(true);
    try {
      const staffSession = localStorage.getItem('commander_staff') || '';
      const res = await fetch(`/api/commander/membership-plans?venue_id=${venueId}&include_inactive=true`, {
        headers: { 'x-staff-session': staffSession }
      });
      const data = await res.json();
      if (data.success) {
        const p = data.data.plans || [];
        // Sort in order: daily, weekly, monthly, yearly
        const order = ['daily', 'weekly', 'monthly', 'yearly'];
        p.sort((a, b) => order.indexOf(a.tier) - order.indexOf(b.tier));
        setPlans(p);
      }
    } catch { setError('Failed To Load Plans'); }
    setLoading(false);
  }

  function startEdit(plan) {
    setEditingId(plan.id);
    setEditPrice(plan.price_monthly?.toString() || plan.price_daily?.toString() || '');
  }

  async function savePrice(plan) {
    setSaving(plan.id);
    setError(null);
    try {
      const price = parseFloat(editPrice);
      if (isNaN(price) || price < 0) { setError('Enter A Valid Price'); setSaving(null); return; }

      // Determine which field to update based on tier
      const field = plan.tier === 'daily' ? 'price_daily'
        : plan.tier === 'weekly' ? 'price_weekly'
          : plan.tier === 'monthly' ? 'price_monthly'
            : 'price_yearly';

      const body = { [field]: price };
      const res = await fetch(`/api/commander/membership-plans?venue_id=${venueId}&id=${plan.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-staff-session': localStorage.getItem('commander_staff') || '' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setSuccess('Price Updated!');
      setTimeout(() => setSuccess(null), 3000);
      setEditingId(null);
      setEditPrice('');
      fetchPlans();
    } catch (err) {
      setError(err.message || 'Failed To Save');
    }
    setSaving(null);
  }

  function getPlanPrice(plan) {
    if (plan.tier === 'daily') return plan.price_daily;
    if (plan.tier === 'weekly') return plan.price_weekly;
    if (plan.tier === 'monthly') return plan.price_monthly;
    if (plan.tier === 'yearly') return plan.price_yearly;
    return null;
  }

  return (
    <CommanderLayout title="Membership Plans" backHref="/commander/dashboard">
      <style jsx>{`
        .mp-page { min-height: 100vh; background: #111; color: #E4E6EB; font-family: 'Inter', sans-serif; }
        .mp-inner { max-width: 580px; margin: 0 auto; padding: 24px 16px 80px; }
        .mp-page-header { margin-bottom: 28px; }
        .mp-page-title { font-size: 24px; font-weight: 800; color: #fff; }
        .mp-page-sub { font-size: 13px; color: #888; margin-top: 4px; }
        .mp-card {
          background: linear-gradient(135deg, #1a1a2e 0%, #16161a 100%);
          border: 2px solid #2a2a3a;
          border-radius: 16px;
          padding: 24px;
          margin-bottom: 14px;
          display: flex;
          align-items: center;
          gap: 18px;
          transition: border-color 0.2s, transform 0.15s;
        }
        .mp-card:hover { border-color: #3a3a4a; }
        .mp-card-icon {
          width: 56px; height: 56px;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .mp-card-info { flex: 1; min-width: 0; }
        .mp-card-title { font-size: 18px; font-weight: 700; color: #fff; margin-bottom: 2px; }
        .mp-card-period { font-size: 13px; color: #888; }
        .mp-card-price {
          font-size: 32px;
          font-weight: 900;
          color: #fff;
          line-height: 1;
          display: flex;
          align-items: baseline;
          gap: 2px;
        }
        .mp-card-dollar { font-size: 20px; font-weight: 700; opacity: 0.6; }
        .mp-card-actions { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; }
        .mp-edit-btn {
          background: rgba(255,255,255,0.07);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px;
          padding: 6px 12px;
          color: #888;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 5px;
          transition: all 0.2s;
        }
        .mp-edit-btn:hover { background: rgba(255,255,255,0.12); color: #fff; }
        .mp-edit-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .mp-edit-input {
          width: 100px;
          background: #111;
          border: 2px solid #444;
          border-radius: 10px;
          padding: 8px 10px 8px 24px;
          color: #fff;
          font-size: 18px;
          font-weight: 800;
          outline: none;
          transition: border-color 0.2s;
        }
        .mp-edit-input:focus { border-color: #1877F2; }
        .mp-edit-prefix {
          position: relative;
        }
        .mp-edit-prefix .pfx {
          position: absolute;
          left: 10px;
          top: 50%;
          transform: translateY(-50%);
          color: #666;
          font-size: 16px;
          font-weight: 700;
          pointer-events: none;
        }
        .mp-save-btn {
          background: #31A24C;
          border: none;
          border-radius: 8px;
          padding: 8px 14px;
          color: #fff;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .mp-cancel-btn {
          background: none;
          border: 1px solid #444;
          border-radius: 8px;
          padding: 8px 10px;
          color: #888;
          font-size: 13px;
          cursor: pointer;
        }
        .mp-toast { padding: 12px 16px; border-radius: 12px; font-size: 14px; font-weight: 600; margin-bottom: 16px; }
        .mp-toast.ok { background: rgba(49,162,76,0.12); color: #31A24C; border: 1px solid rgba(49,162,76,0.25); }
        .mp-toast.err { background: rgba(239,68,68,0.12); color: #EF4444; border: 1px solid rgba(239,68,68,0.25); }
        .mp-info {
          background: rgba(24,119,242,0.06);
          border: 1px solid rgba(24,119,242,0.15);
          border-radius: 12px;
          padding: 14px 16px;
          margin-top: 24px;
        }
        .mp-info p { font-size: 12px; color: #888; line-height: 1.6; margin: 0; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      <div className="mp-page">
        <div className="mp-inner">
          {/* Page Header */}
          <div className="mp-page-header">
            <div className="mp-page-title">Membership Plans</div>
            <div className="mp-page-sub">Set Pricing For Each Membership Interval</div>
          </div>

          {/* Toasts */}
          {success && <div className="mp-toast ok">✓ {success}</div>}
          {error && <div className="mp-toast err">⚠ {error}</div>}

          {/* Loading */}
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
              <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', color: '#1877F2' }} />
            </div>
          ) : plans.length === 0 ? (
            <div style={{ background: '#1a1a1a', border: '2px dashed #2a2a2a', borderRadius: 16, padding: '48px 24px', textAlign: 'center' }}>
              <Crown size={48} style={{ color: '#F59E0B', margin: '0 auto 16px', display: 'block' }} />
              <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 8 }}>No Membership Plans Yet</div>
              <div style={{ fontSize: 14, color: '#888' }}>Plans Will Auto-Create When You Refresh This Page</div>
            </div>
          ) : (
            plans.map(plan => {
              const meta = PLAN_META[plan.tier] || PLAN_META.daily;
              const Icon = meta.icon;
              const price = getPlanPrice(plan);
              const isEditing = editingId === plan.id;

              return (
                <div key={plan.id} className="mp-card"
                  style={{ borderColor: isEditing ? meta.color + '66' : undefined }}>
                  {/* Icon */}
                  <div className="mp-card-icon" style={{ background: meta.color + '18' }}>
                    <Icon size={26} style={{ color: meta.color }} />
                  </div>

                  {/* Info */}
                  <div className="mp-card-info">
                    <div className="mp-card-title">{meta.label} Membership</div>
                    <div className="mp-card-period">{meta.period}</div>
                  </div>

                  {/* Price + Edit */}
                  <div className="mp-card-actions">
                    {isEditing ? (
                      <>
                        <div className="mp-edit-row">
                          <div className="mp-edit-prefix">
                            <span className="pfx">$</span>
                            <input
                              type="number"
                              step="1"
                              min="0"
                              className="mp-edit-input"
                              value={editPrice}
                              onChange={e => setEditPrice(e.target.value)}
                              autoFocus
                              onKeyDown={e => { if (e.key === 'Enter') savePrice(plan); if (e.key === 'Escape') setEditingId(null); }}
                            />
                          </div>
                        </div>
                        <div className="mp-edit-row">
                          <button className="mp-cancel-btn" onClick={() => setEditingId(null)}>Cancel</button>
                          <button className="mp-save-btn" disabled={saving === plan.id} onClick={() => savePrice(plan)}>
                            {saving === plan.id ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={14} />}
                            Save
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="mp-card-price" style={{ color: meta.color }}>
                          <span className="mp-card-dollar">$</span>
                          {price != null ? Number(price).toFixed(0) : '—'}
                        </div>
                        <button className="mp-edit-btn" onClick={() => startEdit(plan)}>
                          <Pencil size={12} /> Edit Price
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {/* Info */}
          {!loading && plans.length > 0 && (
            <div className="mp-info">
              <p>
                <strong style={{ color: '#B0B3B8' }}>How It Works:</strong> These Are Your Membership Intervals. Players Choose Which Plan Fits Their Schedule — Daily For Visitors, Weekly For Short Runs, Monthly For Regulars, Or Yearly For Committed Members. Click <strong style={{ color: '#F59E0B' }}>Edit Price</strong> To Adjust Any Rate.
              </p>
            </div>
          )}
        </div>
      </div>
    </CommanderLayout>
  );
}
