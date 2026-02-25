/**
 * Membership Plans Admin
 * /commander/membership-plans
 * - Set daily/weekly/monthly/yearly pricing per tier
 * - Configure perks, comp multipliers, seat fee discounts
 * - Create/edit/deactivate membership tiers
 * - Inline quick-price editor + full plan edit modal
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import {
  Plus, Save, Loader2, DollarSign, Crown, Star,
  Shield, Users, Trash2, ChevronDown, ChevronUp, Gift, Clock,
  Percent, Car, Utensils, Ticket, Armchair, X, Check, Edit3, Pencil
} from 'lucide-react';
import CommanderLayout from '../../src/components/commander/shared/CommanderLayout';

const TIER_COLORS = {
  standard: '#B0B3B8', gold: '#F59E0B', platinum: '#94A3B8', vip: '#8B5CF6'
};
const TIER_ICONS = {
  standard: Users, gold: Star, platinum: Shield, vip: Crown
};

const DEFAULT_PRICES = {
  standard: { price_daily: '', price_weekly: '', price_monthly: '', price_yearly: '' },
  gold: { price_daily: '5', price_weekly: '10', price_monthly: '25', price_yearly: '199' },
  platinum: { price_daily: '5', price_weekly: '10', price_monthly: '25', price_yearly: '199' },
  vip: { price_daily: '5', price_weekly: '10', price_monthly: '25', price_yearly: '199' },
};

const EMPTY_PLAN = {
  tier: '', name: '', description: '', color: '#1877F2', sort_order: 0,
  price_daily: '5', price_weekly: '10', price_monthly: '25', price_yearly: '199',
  seat_fee_override: '', seat_fee_discount_pct: 0,
  comp_multiplier: 1.0, priority_waitlist: false,
  free_food_drinks: false, free_parking: false,
  guest_passes_per_month: 0, reserved_seating: false,
  tournament_discount_pct: 0, custom_perks: [], max_members: ''
};

function fmt(val) {
  if (!val && val !== 0) return '—';
  return `$${Number(val).toFixed(0)}`;
}

export default function MembershipPlansPage() {
  const router = useRouter();
  const [staff, setStaff] = useState(null);
  const [venueId, setVenueId] = useState(null);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null); // plan.id or 'new'
  const [form, setForm] = useState(EMPTY_PLAN);
  const [expandedId, setExpandedId] = useState(null);
  const [quickEdit, setQuickEdit] = useState(null); // plan.id for inline price edit
  const [quickPrices, setQuickPrices] = useState({});
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

  useEffect(() => {
    if (!venueId) return;
    fetchPlans();
  }, [venueId]);

  async function fetchPlans() {
    setLoading(true);
    try {
      const staffSession = localStorage.getItem('commander_staff') || '';
      const res = await fetch(`/api/commander/membership-plans?venue_id=${venueId}&include_inactive=true`, {
        headers: { 'x-staff-session': staffSession }
      });
      const data = await res.json();
      if (data.success) setPlans(data.data.plans || []);
    } catch (err) { setError('Failed to load plans'); }
    setLoading(false);
  }

  function startEdit(plan) {
    setEditing(plan?.id || 'new');
    const defaults = DEFAULT_PRICES[plan?.tier] || {};
    setForm(plan ? {
      ...EMPTY_PLAN, ...plan,
      price_daily: plan.price_daily ?? defaults.price_daily ?? '5',
      price_weekly: plan.price_weekly ?? defaults.price_weekly ?? '10',
      price_monthly: plan.price_monthly ?? defaults.price_monthly ?? '25',
      price_yearly: plan.price_yearly ?? defaults.price_yearly ?? '199',
      seat_fee_override: plan.seat_fee_override || '',
      max_members: plan.max_members || ''
    } : { ...EMPTY_PLAN, sort_order: plans.length });
    setError(null);
  }

  function cancelEdit() { setEditing(null); setForm(EMPTY_PLAN); }

  function startQuickEdit(plan) {
    setQuickEdit(plan.id);
    setQuickPrices({
      price_daily: plan.price_daily ?? '',
      price_weekly: plan.price_weekly ?? '',
      price_monthly: plan.price_monthly ?? '',
      price_yearly: plan.price_yearly ?? '',
    });
  }

  async function saveQuickEdit(plan) {
    setSaving(true);
    setError(null);
    try {
      const body = {
        price_daily: quickPrices.price_daily !== '' ? parseFloat(quickPrices.price_daily) : null,
        price_weekly: quickPrices.price_weekly !== '' ? parseFloat(quickPrices.price_weekly) : null,
        price_monthly: quickPrices.price_monthly !== '' ? parseFloat(quickPrices.price_monthly) : null,
        price_yearly: quickPrices.price_yearly !== '' ? parseFloat(quickPrices.price_yearly) : null,
      };
      const res = await fetch(`/api/commander/membership-plans?venue_id=${venueId}&id=${plan.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-staff-session': localStorage.getItem('commander_staff') || '' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setSuccess('Prices updated!');
      setTimeout(() => setSuccess(null), 3000);
      setQuickEdit(null);
      fetchPlans();
    } catch (err) {
      setError(err.message || 'Failed to save prices');
    }
    setSaving(false);
  }

  async function handleSave() {
    if (!form.tier || !form.name) return setError('Tier code and name are required');
    setSaving(true);
    setError(null);
    try {
      const body = {
        ...form,
        price_daily: form.price_daily !== '' ? parseFloat(form.price_daily) : null,
        price_weekly: form.price_weekly !== '' ? parseFloat(form.price_weekly) : null,
        price_monthly: form.price_monthly !== '' ? parseFloat(form.price_monthly) : null,
        price_yearly: form.price_yearly !== '' ? parseFloat(form.price_yearly) : null,
        seat_fee_override: form.seat_fee_override ? parseFloat(form.seat_fee_override) : null,
        seat_fee_discount_pct: parseFloat(form.seat_fee_discount_pct) || 0,
        comp_multiplier: parseFloat(form.comp_multiplier) || 1.0,
        guest_passes_per_month: parseInt(form.guest_passes_per_month) || 0,
        tournament_discount_pct: parseFloat(form.tournament_discount_pct) || 0,
        max_members: form.max_members ? parseInt(form.max_members) : null
      };
      const isNew = editing === 'new';
      const url = isNew
        ? `/api/commander/membership-plans?venue_id=${venueId}`
        : `/api/commander/membership-plans?venue_id=${venueId}&id=${editing}`;
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-staff-session': localStorage.getItem('commander_staff') || '' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setSuccess(isNew ? 'Plan created!' : 'Plan updated!');
      setTimeout(() => setSuccess(null), 3000);
      setEditing(null);
      setForm(EMPTY_PLAN);
      fetchPlans();
    } catch (err) {
      setError(err.message || 'Failed to save');
    }
    setSaving(false);
  }

  async function handleDelete(plan) {
    if (!confirm(`Deactivate "${plan.name}"? Members won't lose their tier.`)) return;
    try {
      const staffSession = localStorage.getItem('commander_staff') || '';
      const res = await fetch(`/api/commander/membership-plans?venue_id=${venueId}&id=${plan.id}`, {
        method: 'DELETE', headers: { 'x-staff-session': staffSession }
      });
      const data = await res.json();
      if (data.success) fetchPlans();
    } catch { setError('Failed to deactivate'); }
  }

  async function handleReactivate(plan) {
    try {
      const res = await fetch(`/api/commander/membership-plans?venue_id=${venueId}&id=${plan.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-staff-session': localStorage.getItem('commander_staff') || '' },
        body: JSON.stringify({ is_active: true })
      });
      const data = await res.json();
      if (data.success) fetchPlans();
    } catch { setError('Failed to reactivate'); }
  }

  const f = (key, val) => setForm(p => ({ ...p, [key]: val }));
  const fToggle = (key) => setForm(p => ({ ...p, [key]: !p[key] }));

  return (
    <CommanderLayout title="Membership Plans" backHref="/commander/dashboard">
      <style jsx>{`
        .mp-page { min-height: 100vh; background: #111; color: #E4E6EB; font-family: 'Inter', sans-serif; }
        .mp-inner { max-width: 680px; margin: 0 auto; padding: 20px 16px 80px; }
        .mp-page-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
        .mp-page-title { font-size: 22px; font-weight: 800; color: #fff; }
        .mp-page-sub { font-size: 13px; color: #888; margin-top: 2px; }
        .mp-new-btn { display: flex; align-items: center; gap: 8px; background: linear-gradient(135deg, #1877F2, #0e5dcc); color: #fff; border: none; border-radius: 12px; padding: 10px 18px; font-size: 14px; font-weight: 700; cursor: pointer; transition: opacity 0.2s; }
        .mp-new-btn:hover { opacity: 0.9; }
        .mp-plan-card { background: #1a1a1a; border: 2px solid #2a2a2a; border-radius: 16px; overflow: hidden; margin-bottom: 16px; transition: border-color 0.2s; }
        .mp-plan-card.inactive { opacity: 0.55; }
        .mp-plan-row { display: flex; align-items: center; gap: 14px; padding: 16px; cursor: pointer; user-select: none; }
        .mp-plan-row:hover { background: rgba(255,255,255,0.03); }
        .mp-plan-icon { width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .mp-plan-info { flex: 1; min-width: 0; }
        .mp-plan-name-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .mp-plan-name { font-size: 17px; font-weight: 700; color: #fff; }
        .mp-badge { font-size: 11px; padding: 2px 8px; border-radius: 20px; font-weight: 600; }
        .mp-plan-prices { font-size: 13px; color: #888; margin-top: 3px; }
        .mp-chevron { color: #555; flex-shrink: 0; }
        .mp-expand { border-top: 1px solid #2a2a2a; padding: 16px; }
        .mp-price-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 16px; }
        .mp-price-cell { background: #111; border-radius: 10px; padding: 10px 8px; text-align: center; }
        .mp-price-label { font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
        .mp-price-val { font-size: 18px; font-weight: 800; color: #fff; }
        .mp-price-input { width: 100%; background: #111; border: 2px solid #333; border-radius: 8px; padding: 6px 8px; color: #fff; font-size: 15px; font-weight: 700; text-align: center; outline: none; }
        .mp-price-input:focus { border-color: #1877F2; }
        .mp-perks { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
        .mp-perk-tag { font-size: 12px; padding: 4px 12px; border-radius: 20px; font-weight: 600; }
        .mp-action-row { display: flex; gap: 8px; flex-wrap: wrap; }
        .mp-btn { border-radius: 10px; padding: 9px 16px; font-size: 13px; font-weight: 700; border: none; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: opacity 0.2s; }
        .mp-btn:hover { opacity: 0.85; }
        .mp-btn-blue { background: #1877F2; color: #fff; }
        .mp-btn-amber { background: rgba(245,158,11,0.15); color: #F59E0B; }
        .mp-btn-red { background: rgba(239,68,68,0.12); color: #EF4444; }
        .mp-btn-green { background: rgba(49,162,76,0.15); color: #31A24C; }
        .mp-btn-ghost { background: rgba(255,255,255,0.07); color: #B0B3B8; }
        .mp-empty { background: #1a1a1a; border: 2px dashed #2a2a2a; border-radius: 16px; padding: 48px 24px; text-align: center; }
        .mp-info { background: rgba(24,119,242,0.06); border: 1px solid rgba(24,119,242,0.15); border-radius: 12px; padding: 14px 16px; }
        .mp-info p { font-size: 12px; color: #888; line-height: 1.6; margin: 0; }
        .mp-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 200; display: flex; align-items: flex-start; justify-content: center; padding: 20px 16px; overflow-y: auto; }
        .mp-modal { background: #1a1a1a; border: 2px solid #2a2a2a; border-radius: 20px; width: 100%; max-width: 500px; margin-bottom: 60px; }
        .mp-modal-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 20px; border-bottom: 1px solid #2a2a2a; }
        .mp-modal-title { font-size: 18px; font-weight: 800; color: #fff; }
        .mp-modal-body { padding: 20px; overflow-y: auto; max-height: 65vh; }
        .mp-modal-footer { display: flex; gap: 10px; padding: 16px 20px; border-top: 1px solid #2a2a2a; }
        .mp-section-label { font-size: 11px; font-weight: 700; color: #666; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; margin-top: 20px; }
        .mp-field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .mp-field label { font-size: 12px; color: #888; display: block; margin-bottom: 5px; }
        .mp-input { width: 100%; background: #111; border: 2px solid #2a2a2a; border-radius: 10px; padding: 9px 12px; color: #fff; font-size: 14px; outline: none; transition: border-color 0.2s; }
        .mp-input:focus { border-color: #1877F2; }
        .mp-input-prefix { position: relative; }
        .mp-input-prefix .mp-input { padding-left: 24px; }
        .mp-input-prefix .pfx { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: #555; font-size: 13px; }
        .mp-toggle-btn { width: 100%; display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; background: #111; border: 2px solid #2a2a2a; border-radius: 10px; cursor: pointer; transition: border-color 0.2s; }
        .mp-toggle-btn:hover { border-color: #444; }
        .mp-toggle { width: 38px; height: 22px; border-radius: 11px; position: relative; transition: background 0.2s; flex-shrink: 0; }
        .mp-toggle span { position: absolute; top: 2px; width: 18px; height: 18px; background: #fff; border-radius: 9px; shadow: 0 1px 3px rgba(0,0,0,0.3); transition: left 0.2s; }
        .mp-toast { padding: 12px 16px; border-radius: 12px; font-size: 14px; font-weight: 600; margin-bottom: 16px; }
        .mp-toast.ok { background: rgba(49,162,76,0.12); color: #31A24C; border: 1px solid rgba(49,162,76,0.25); }
        .mp-toast.err { background: rgba(239,68,68,0.12); color: #EF4444; border: 1px solid rgba(239,68,68,0.25); }
      `}</style>

      <div className="mp-page">
        <div className="mp-inner">
          {/* Page Header */}
          <div className="mp-page-header">
            <div>
              <div className="mp-page-title">Membership Plans</div>
              <div className="mp-page-sub">Set Pricing & Perks Per Tier</div>
            </div>
            <button className="mp-new-btn" onClick={() => startEdit(null)}>
              <Plus size={16} /> New Plan
            </button>
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
            <div className="mp-empty">
              <Crown size={48} style={{ color: '#F59E0B', margin: '0 auto 16px', display: 'block' }} />
              <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 8 }}>No Membership Plans Yet</div>
              <div style={{ fontSize: 14, color: '#888', marginBottom: 24 }}>Create Your First Membership Tier With Pricing And Perks</div>
              <button className="mp-new-btn" style={{ margin: '0 auto', justifyContent: 'center' }} onClick={() => startEdit(null)}>
                <Plus size={16} /> Create First Plan
              </button>
            </div>
          ) : (
            plans.map(plan => {
              const TierIcon = TIER_ICONS[plan.tier] || Star;
              const color = plan.color || TIER_COLORS[plan.tier] || '#B0B3B8';
              const isExpanded = expandedId === plan.id;
              const isQ = quickEdit === plan.id;
              const prices = [
                plan.price_daily != null && `$${Number(plan.price_daily).toFixed(0)}/day`,
                plan.price_weekly != null && `$${Number(plan.price_weekly).toFixed(0)}/wk`,
                plan.price_monthly != null && `$${Number(plan.price_monthly).toFixed(0)}/mo`,
                plan.price_yearly != null && `$${Number(plan.price_yearly).toFixed(0)}/yr`,
              ].filter(Boolean);

              return (
                <div key={plan.id} className={`mp-plan-card ${!plan.is_active ? 'inactive' : ''}`}
                  style={{ borderColor: isExpanded ? color + '55' : '#2a2a2a' }}>
                  {/* Collapsed row */}
                  <div className="mp-plan-row" onClick={() => setExpandedId(isExpanded ? null : plan.id)}>
                    <div className="mp-plan-icon" style={{ background: color + '22' }}>
                      <TierIcon size={22} style={{ color }} />
                    </div>
                    <div className="mp-plan-info">
                      <div className="mp-plan-name-row">
                        <span className="mp-plan-name">{plan.name}</span>
                        <span className="mp-badge" style={{ background: color + '22', color }}>{plan.tier}</span>
                        {!plan.is_active && (
                          <span className="mp-badge" style={{ background: '#EF444422', color: '#EF4444' }}>Inactive</span>
                        )}
                      </div>
                      <div className="mp-plan-prices">
                        {prices.length > 0 ? prices.join(' · ') : 'Free Tier'}
                      </div>
                    </div>
                    <div className="mp-chevron">
                      {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                    </div>
                  </div>

                  {/* Expanded */}
                  {isExpanded && (
                    <div className="mp-expand">
                      {plan.description && (
                        <div style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>{plan.description}</div>
                      )}

                      {/* Price Grid — with inline editing */}
                      <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: 1 }}>Pricing Rates</div>
                        {!isQ ? (
                          <button className="mp-btn mp-btn-amber" style={{ padding: '4px 12px', fontSize: 12 }}
                            onClick={() => startQuickEdit(plan)}>
                            <Pencil size={13} /> Edit Prices
                          </button>
                        ) : (
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="mp-btn mp-btn-ghost" style={{ padding: '4px 12px', fontSize: 12 }}
                              onClick={() => setQuickEdit(null)}>Cancel</button>
                            <button className="mp-btn mp-btn-green" style={{ padding: '4px 12px', fontSize: 12 }}
                              disabled={saving} onClick={() => saveQuickEdit(plan)}>
                              {saving ? <Loader2 size={12} /> : <Check size={13} />} Save
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="mp-price-grid">
                        {[
                          { key: 'price_daily', label: 'Daily' },
                          { key: 'price_weekly', label: 'Weekly' },
                          { key: 'price_monthly', label: 'Monthly' },
                          { key: 'price_yearly', label: 'Yearly' },
                        ].map(({ key, label }) => (
                          <div key={key} className="mp-price-cell">
                            <div className="mp-price-label">{label}</div>
                            {isQ ? (
                              <div style={{ position: 'relative' }}>
                                <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: '#555', fontSize: 13, pointerEvents: 'none' }}>$</span>
                                <input
                                  type="number" step="1" min="0"
                                  value={quickPrices[key]}
                                  onChange={e => setQuickPrices(p => ({ ...p, [key]: e.target.value }))}
                                  placeholder="—"
                                  className="mp-price-input"
                                  style={{ paddingLeft: 20 }}
                                />
                              </div>
                            ) : (
                              <div className="mp-price-val" style={{ color: plan[key] != null ? '#fff' : '#444' }}>
                                {plan[key] != null ? `$${Number(plan[key]).toFixed(0)}` : '—'}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Perks */}
                      <div className="mp-perks">
                        {plan.comp_multiplier > 1 && (
                          <span className="mp-perk-tag" style={{ background: '#F59E0B22', color: '#F59E0B' }}>{plan.comp_multiplier}x Comps</span>
                        )}
                        {plan.seat_fee_discount_pct > 0 && (
                          <span className="mp-perk-tag" style={{ background: '#1877F222', color: '#1877F2' }}>{plan.seat_fee_discount_pct}% Seat Discount</span>
                        )}
                        {plan.priority_waitlist && <span className="mp-perk-tag" style={{ background: '#31A24C22', color: '#31A24C' }}>Priority Waitlist</span>}
                        {plan.reserved_seating && <span className="mp-perk-tag" style={{ background: '#8B5CF622', color: '#8B5CF6' }}>Reserved Seating</span>}
                        {plan.free_food_drinks && <span className="mp-perk-tag" style={{ background: '#EF444422', color: '#EF4444' }}>Free F&B</span>}
                        {plan.free_parking && <span className="mp-perk-tag" style={{ background: '#06B6D422', color: '#06B6D4' }}>Free Parking</span>}
                        {plan.tournament_discount_pct > 0 && (
                          <span className="mp-perk-tag" style={{ background: '#F59E0B22', color: '#F59E0B' }}>{plan.tournament_discount_pct}% Tourney</span>
                        )}
                        {plan.guest_passes_per_month > 0 && (
                          <span className="mp-perk-tag" style={{ background: '#B0B3B822', color: '#B0B3B8' }}>{plan.guest_passes_per_month} Guest Pass/mo</span>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="mp-action-row">
                        <button className="mp-btn mp-btn-blue" onClick={() => { startEdit(plan); setExpandedId(null); }}>
                          <Edit3 size={14} /> Edit Plan
                        </button>
                        {plan.is_active ? (
                          <button className="mp-btn mp-btn-red" onClick={() => handleDelete(plan)}>
                            <Trash2 size={14} /> Deactivate
                          </button>
                        ) : (
                          <button className="mp-btn mp-btn-green" onClick={() => handleReactivate(plan)}>
                            <Check size={14} /> Reactivate
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* Info */}
          {!loading && (
            <div className="mp-info" style={{ marginTop: 24 }}>
              <p>
                <strong style={{ color: '#B0B3B8' }}>How It Works:</strong> Set Pricing At Any Interval You Want — Daily Passes For Tourists, Weekly For Short-Term Players, Monthly For Regulars, Yearly For VIPs. Leave An Interval Blank If You Don't Offer It. Use The <strong style={{ color: '#F59E0B' }}>Edit Prices</strong> Button For Quick Price Updates Without Opening The Full Editor.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Full Edit Modal */}
      {editing && (
        <div className="mp-modal-overlay" onClick={e => e.target === e.currentTarget && cancelEdit()}>
          <div className="mp-modal">
            {/* Modal header */}
            <div className="mp-modal-header">
              <span className="mp-modal-title">{editing === 'new' ? '+ New Membership Plan' : 'Edit Plan Details'}</span>
              <button onClick={cancelEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', padding: 4 }}>
                <X size={20} />
              </button>
            </div>

            <div className="mp-modal-body">
              {/* Identity */}
              <div className="mp-section-label" style={{ marginTop: 0 }}>Plan Identity</div>
              <div className="mp-field-grid">
                <div className="mp-field">
                  <label>Tier Code</label>
                  <input className="mp-input" value={form.tier}
                    onChange={e => f('tier', e.target.value.toLowerCase().replace(/\s/g, '_'))}
                    placeholder="e.g. Gold" />
                </div>
                <div className="mp-field">
                  <label>Display Name</label>
                  <input className="mp-input" value={form.name}
                    onChange={e => f('name', e.target.value)}
                    placeholder="e.g. Gold Membership" />
                </div>
              </div>
              <div className="mp-field" style={{ marginTop: 12 }}>
                <label>Description</label>
                <input className="mp-input" value={form.description || ''}
                  onChange={e => f('description', e.target.value)}
                  placeholder="What's Included With This Tier..." />
              </div>
              <div className="mp-field-grid" style={{ marginTop: 12 }}>
                <div className="mp-field">
                  <label>Badge Color</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input type="color" value={form.color} onChange={e => f('color', e.target.value)}
                      style={{ width: 36, height: 36, borderRadius: 8, border: '2px solid #2a2a2a', cursor: 'pointer', background: 'none' }} />
                    <span style={{ fontSize: 13, color: '#888' }}>{form.color}</span>
                  </div>
                </div>
                <div className="mp-field">
                  <label>Max Members (Blank = Unlimited)</label>
                  <input type="number" className="mp-input" value={form.max_members}
                    onChange={e => f('max_members', e.target.value)} placeholder="∞" />
                </div>
              </div>

              {/* Pricing */}
              <div className="mp-section-label">
                <DollarSign size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                Pricing
              </div>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 10 }}>
                Leave Blank For Intervals You Don't Offer. Defaults: Daily $5 · Weekly $10 · Monthly $25 · Yearly $199.
              </div>
              <div className="mp-field-grid">
                {[
                  { key: 'price_daily', label: 'Daily Rate', ph: '5' },
                  { key: 'price_weekly', label: 'Weekly Rate', ph: '10' },
                  { key: 'price_monthly', label: 'Monthly Rate', ph: '25' },
                  { key: 'price_yearly', label: 'Yearly Rate', ph: '199' },
                ].map(p => (
                  <div key={p.key} className="mp-field">
                    <label>{p.label}</label>
                    <div className="mp-input-prefix">
                      <span className="pfx">$</span>
                      <input type="number" step="1" min="0" className="mp-input"
                        value={form[p.key]} onChange={e => f(p.key, e.target.value)}
                        placeholder={p.ph} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Seat Fee */}
              <div className="mp-section-label">
                <Clock size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                Seat Fee Adjustments
              </div>
              <div className="mp-field-grid">
                <div className="mp-field">
                  <label>Override $/Hr (Blank = Default Rate)</label>
                  <div className="mp-input-prefix">
                    <span className="pfx">$</span>
                    <input type="number" step="0.5" className="mp-input"
                      value={form.seat_fee_override} onChange={e => f('seat_fee_override', e.target.value)}
                      placeholder="Default Game Rate" />
                  </div>
                </div>
                <div className="mp-field">
                  <label>Seat Fee Discount %</label>
                  <input type="number" step="5" min="0" max="100" className="mp-input"
                    value={form.seat_fee_discount_pct} onChange={e => f('seat_fee_discount_pct', e.target.value)} />
                </div>
              </div>

              {/* Perks */}
              <div className="mp-section-label">
                <Gift size={13} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                Perks & Benefits
              </div>
              <div className="mp-field-grid">
                <div className="mp-field">
                  <label>Comp Multiplier</label>
                  <input type="number" step="0.25" min="0.5" max="5" className="mp-input"
                    value={form.comp_multiplier} onChange={e => f('comp_multiplier', e.target.value)} />
                  <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>1.0 = Normal, 1.5 = 50% Bonus</div>
                </div>
                <div className="mp-field">
                  <label>Tournament Discount %</label>
                  <input type="number" step="5" min="0" max="100" className="mp-input"
                    value={form.tournament_discount_pct} onChange={e => f('tournament_discount_pct', e.target.value)} />
                </div>
                <div className="mp-field">
                  <label>Guest Passes / Month</label>
                  <input type="number" min="0" className="mp-input"
                    value={form.guest_passes_per_month} onChange={e => f('guest_passes_per_month', e.target.value)} />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                {[
                  { key: 'priority_waitlist', label: 'Priority Waitlist Access', Icon: Users },
                  { key: 'reserved_seating', label: 'Reserved Seating', Icon: Armchair },
                  { key: 'free_food_drinks', label: 'Free Food & Drinks', Icon: Utensils },
                  { key: 'free_parking', label: 'Free Parking', Icon: Car },
                ].map(({ key, label, Icon }) => (
                  <button key={key} className="mp-toggle-btn" onClick={() => fToggle(key)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Icon size={16} style={{ color: '#888' }} />
                      <span style={{ fontSize: 14, color: '#ddd' }}>{label}</span>
                    </div>
                    <div className="mp-toggle" style={{ background: form[key] ? '#31A24C' : '#2a2a2a' }}>
                      <span style={{ left: form[key] ? 18 : 2, position: 'absolute', top: 2, width: 18, height: 18, background: '#fff', borderRadius: 9, transition: 'left 0.2s' }} />
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="mp-modal-footer">
              <button onClick={cancelEdit} className="mp-btn mp-btn-ghost" style={{ flex: 1, justifyContent: 'center', padding: '12px' }}>
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving} className="mp-btn mp-btn-blue" style={{ flex: 2, justifyContent: 'center', padding: '12px' }}>
                {saving ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={16} />}
                {saving ? 'Saving...' : editing === 'new' ? 'Create Plan' : 'Save Changes'}

              </button>
            </div>
          </div>
        </div>
      )}
    </CommanderLayout>
  );
}
