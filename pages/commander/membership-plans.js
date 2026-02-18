/**
 * Membership Plans Admin
 * /commander/membership-plans
 * - Set daily/weekly/monthly/yearly pricing per tier
 * - Configure perks, comp multipliers, seat fee discounts
 * - Create custom membership tiers
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../src/components/seo/SEOHead';
import {
  Plus, Save, Loader2, DollarSign, Crown, Star,
  Shield, Users, Trash2, ChevronDown, ChevronUp, Gift, Clock,
  Percent, Car, Utensils, Ticket, Armchair, X, Check
} from 'lucide-react';
import CommanderLayout from '../../src/components/commander/shared/CommanderLayout';

const TIER_COLORS = {
  standard: '#B0B3B8', gold: '#F59E0B', platinum: '#94A3B8', vip: '#8B5CF6'
};

const TIER_ICONS = {
  standard: Users, gold: Star, platinum: Shield, vip: Crown
};

const EMPTY_PLAN = {
  tier: '', name: '', description: '', color: '#1877F2', sort_order: 0,
  price_daily: '', price_weekly: '', price_monthly: '', price_yearly: '',
  seat_fee_override: '', seat_fee_discount_pct: 0,
  comp_multiplier: 1.0, priority_waitlist: false,
  free_food_drinks: false, free_parking: false,
  guest_passes_per_month: 0, reserved_seating: false,
  tournament_discount_pct: 0, custom_perks: [], max_members: ''
};

export default function MembershipPlansPage() {
  const router = useRouter();
  const [staff, setStaff] = useState(null);
  const [venueId, setVenueId] = useState(null);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null); // plan object or 'new'
  const [form, setForm] = useState(EMPTY_PLAN);
  const [expandedId, setExpandedId] = useState(null);
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
    setForm(plan ? {
      ...EMPTY_PLAN,
      ...plan,
      price_daily: plan.price_daily || '',
      price_weekly: plan.price_weekly || '',
      price_monthly: plan.price_monthly || '',
      price_yearly: plan.price_yearly || '',
      seat_fee_override: plan.seat_fee_override || '',
      max_members: plan.max_members || ''
    } : { ...EMPTY_PLAN, sort_order: plans.length });
    setError(null);
  }

  function cancelEdit() { setEditing(null); setForm(EMPTY_PLAN); }

  async function handleSave() {
    if (!form.tier || !form.name) return setError('Tier code and name are required');
    setSaving(true);
    setError(null);
    try {
      const body = {
        ...form,
        price_daily: form.price_daily ? parseFloat(form.price_daily) : null,
        price_weekly: form.price_weekly ? parseFloat(form.price_weekly) : null,
        price_monthly: form.price_monthly ? parseFloat(form.price_monthly) : null,
        price_yearly: form.price_yearly ? parseFloat(form.price_yearly) : null,
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
      const res = await fetch(`/api/commander/membership-plans?venue_id=${venueId}&id=${plan.id}`, { method: 'DELETE', headers: { 'x-staff-session': staffSession } });
      const data = await res.json();
      if (data.success) fetchPlans();
    } catch (err) { setError('Failed to deactivate'); }
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
    } catch (err) { setError('Failed to reactivate'); }
  }

  const f = (key, val) => setForm(p => ({ ...p, [key]: val }));
  const fToggle = (key) => setForm(p => ({ ...p, [key]: !p[key] }));

  if (!staff || loading) {
    return <div className="cmd-page flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-[#1877F2]" /></div>;
  }

  return (
    <>
      <SEOHead
        title="Commander — Membership Plans"
        description="Club Commander Poker Room Management Tool."
        noindex={true}
      />
      <div className="cmd-page">
        {/* Header */}
        <header className="cmd-header-bar sticky top-0 z-50">
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div>
                <h1 className="font-bold text-white text-lg">Membership Plans</h1>
                <p className="text-sm text-[#B0B3B8]">Set Pricing & Perks Per Tier</p>
              </div>
            </div>
            <button onClick={() => startEdit(null)} className="flex items-center gap-2 px-4 py-2 cmd-btn cmd-btn-primary">
              <Plus className="w-4 h-4" /> New Plan
            </button>
          </div>
        </header>

        <main className="max-w-3xl mx-auto px-4 py-6 space-y-4">
          {success && <div className="p-3 bg-[#31A24C]/10 rounded-xl text-sm text-[#31A24C] font-medium">{success}</div>}
          {error && <div className="p-3 bg-[#EF4444]/10 rounded-xl text-sm text-[#EF4444]">{error}</div>}

          {/* Edit/Create Modal */}
          {editing && (
            <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center pt-10 px-4 overflow-y-auto">
              <div className="bg-[#242526] rounded-2xl w-full max-w-lg border border-[#3A3B3C] shadow-2xl mb-10">
                <div className="p-4 border-b border-[#3A3B3C] flex items-center justify-between">
                  <h2 className="font-bold text-white text-lg">{editing === 'new' ? 'New Membership Plan' : 'Edit Plan'}</h2>
                  <button onClick={cancelEdit} className="p-2 hover:bg-[#3A3B3C] rounded-lg"><X className="w-5 h-5 text-[#B0B3B8]" /></button>
                </div>

                <div className="p-4 space-y-5 max-h-[70vh] overflow-y-auto">
                  {/* Identity */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-[#B0B3B8] uppercase tracking-wider">Plan Identity</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-[#B0B3B8] mb-1 block">Tier Code</label>
                        <input value={form.tier} onChange={e => f('tier', e.target.value.toLowerCase().replace(/\s/g, '_'))}
                          placeholder="e.g. Gold" className="w-full px-3 py-2 cmd-input text-sm" />
                      </div>
                      <div>
                        <label className="text-xs text-[#B0B3B8] mb-1 block">Display Name</label>
                        <input value={form.name} onChange={e => f('name', e.target.value)}
                          placeholder="e.g. Gold Membership" className="w-full px-3 py-2 cmd-input text-sm" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-[#B0B3B8] mb-1 block">Description</label>
                      <input value={form.description || ''} onChange={e => f('description', e.target.value)}
                        placeholder="What's Included..." className="w-full px-3 py-2 cmd-input text-sm" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-[#B0B3B8] mb-1 block">Badge Color</label>
                        <div className="flex items-center gap-2">
                          <input type="color" value={form.color} onChange={e => f('color', e.target.value)} className="w-8 h-8 rounded cursor-pointer" />
                          <span className="text-sm text-white">{form.color}</span>
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-[#B0B3B8] mb-1 block">Max Members (Blank=Unlimited)</label>
                        <input type="number" value={form.max_members} onChange={e => f('max_members', e.target.value)}
                          placeholder="∞" className="w-full px-3 py-2 cmd-input text-sm" />
                      </div>
                    </div>
                  </div>

                  {/* Pricing */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-[#F59E0B] uppercase tracking-wider flex items-center gap-2">
                      <DollarSign className="w-4 h-4" /> Pricing
                    </h3>
                    <p className="text-xs text-[#B0B3B8]">Leave Blank For Intervals You Don't Offer. Players Choose Their Billing Cycle At Signup.</p>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { key: 'price_daily', label: 'Daily Rate' },
                        { key: 'price_weekly', label: 'Weekly Rate' },
                        { key: 'price_monthly', label: 'Monthly Rate' },
                        { key: 'price_yearly', label: 'Yearly Rate' },
                      ].map(p => (
                        <div key={p.key}>
                          <label className="text-xs text-[#B0B3B8] mb-1 block">{p.label}</label>
                          <div className="relative">
                            <span className="absolute left-3 top-2 text-[#6A6B6D] text-sm">$</span>
                            <input type="number" step="0.01" value={form[p.key]} onChange={e => f(p.key, e.target.value)}
                              placeholder="—" className="w-full pl-7 pr-3 py-2 cmd-input text-sm" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Seat Fee */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-[#1877F2] uppercase tracking-wider flex items-center gap-2">
                      <Clock className="w-4 h-4" /> Seat Fee Adjustments
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-[#B0B3B8] mb-1 block">Override $/Hr (Blank=Default)</label>
                        <div className="relative">
                          <span className="absolute left-3 top-2 text-[#6A6B6D] text-sm">$</span>
                          <input type="number" step="0.50" value={form.seat_fee_override} onChange={e => f('seat_fee_override', e.target.value)}
                            placeholder="Use Game Rate" className="w-full pl-7 pr-3 py-2 cmd-input text-sm" />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-[#B0B3B8] mb-1 block">Seat Fee Discount %</label>
                        <div className="relative">
                          <input type="number" step="1" min="0" max="100" value={form.seat_fee_discount_pct} onChange={e => f('seat_fee_discount_pct', e.target.value)}
                            className="w-full px-3 py-2 cmd-input text-sm" />
                          <span className="absolute right-3 top-2 text-[#6A6B6D] text-sm">%</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Perks */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-semibold text-[#31A24C] uppercase tracking-wider flex items-center gap-2">
                      <Gift className="w-4 h-4" /> Perks & Benefits
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-[#B0B3B8] mb-1 block">Comp Multiplier</label>
                        <input type="number" step="0.25" min="0.5" max="5" value={form.comp_multiplier} onChange={e => f('comp_multiplier', e.target.value)}
                          className="w-full px-3 py-2 cmd-input text-sm" />
                        <p className="text-[10px] text-[#6A6B6D] mt-1">1.0 = Normal, 1.5 = 50% Bonus Comps</p>
                      </div>
                      <div>
                        <label className="text-xs text-[#B0B3B8] mb-1 block">Tournament Discount %</label>
                        <input type="number" step="5" min="0" max="100" value={form.tournament_discount_pct} onChange={e => f('tournament_discount_pct', e.target.value)}
                          className="w-full px-3 py-2 cmd-input text-sm" />
                      </div>
                      <div>
                        <label className="text-xs text-[#B0B3B8] mb-1 block">Guest Passes / Month</label>
                        <input type="number" min="0" value={form.guest_passes_per_month} onChange={e => f('guest_passes_per_month', e.target.value)}
                          className="w-full px-3 py-2 cmd-input text-sm" />
                      </div>
                    </div>

                    <div className="space-y-2 mt-2">
                      {[
                        { key: 'priority_waitlist', label: 'Priority Waitlist', icon: Users },
                        { key: 'reserved_seating', label: 'Reserved Seating', icon: Armchair },
                        { key: 'free_food_drinks', label: 'Free Food & Drinks', icon: Utensils },
                        { key: 'free_parking', label: 'Free Parking', icon: Car },
                      ].map(p => (
                        <button key={p.key} onClick={() => fToggle(p.key)}
                          className="w-full flex items-center justify-between p-3 rounded-xl bg-[#18191A] hover:bg-[#3A3B3C] transition-colors">
                          <div className="flex items-center gap-3">
                            <p.icon className="w-4 h-4 text-[#B0B3B8]" />
                            <span className="text-sm text-white">{p.label}</span>
                          </div>
                          <div className={`w-10 h-6 rounded-full transition-colors relative ${form[p.key] ? 'bg-[#31A24C]' : 'bg-[#3A3B3C]'}`}>
                            <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form[p.key] ? 'right-0.5' : 'left-0.5'}`} />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-[#3A3B3C] flex items-center gap-3">
                  <button onClick={cancelEdit} className="flex-1 py-3 rounded-xl bg-[#3A3B3C] text-white font-medium">Cancel</button>
                  <button onClick={handleSave} disabled={saving}
                    className="flex-1 py-3 rounded-xl bg-[#1877F2] text-white font-medium flex items-center justify-center gap-2 disabled:opacity-50">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {saving ? 'Saving...' : 'Save Plan'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Plans List */}
          {plans.length === 0 ? (
            <div className="cmd-panel p-8 text-center">
              <Crown className="w-12 h-12 text-[#F59E0B] mx-auto mb-3" />
              <p className="text-white font-semibold mb-1">No Membership Plans Yet</p>
              <p className="text-sm text-[#B0B3B8] mb-4">Set Up Your Membership Tiers With Pricing And Perks</p>
              <button onClick={() => startEdit(null)} className="px-6 py-2 cmd-btn cmd-btn-primary">Create First Plan</button>
            </div>
          ) : (
            plans.map(plan => {
              const TierIcon = TIER_ICONS[plan.tier] || Star;
              const color = plan.color || TIER_COLORS[plan.tier] || '#B0B3B8';
              const isExpanded = expandedId === plan.id;
              const prices = [
                plan.price_daily && `$${plan.price_daily}/day`,
                plan.price_weekly && `$${plan.price_weekly}/wk`,
                plan.price_monthly && `$${plan.price_monthly}/mo`,
                plan.price_yearly && `$${plan.price_yearly}/yr`,
              ].filter(Boolean);

              return (
                <CommanderLayout title="Membership Plans | Commander" backHref="/commander/members">
                  <div key={plan.id} className={`cmd-panel overflow-hidden ${!plan.is_active ? 'opacity-50' : ''}`}>
                    {/* Header row */}
                    <button onClick={() => setExpandedId(isExpanded ? null : plan.id)}
                      className="w-full p-4 flex items-center gap-4 hover:bg-[#18191A] transition-colors">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: color + '20' }}>
                        <TierIcon className="w-6 h-6" style={{ color }} />
                      </div>
                      <div className="flex-1 text-left">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-white">{plan.name}</h3>
                          {!plan.is_active && <span className="text-xs px-2 py-0.5 bg-[#EF4444]/20 text-[#EF4444] rounded-full">Inactive</span>}
                          <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: color + '20', color }}>{plan.tier}</span>
                        </div>
                        <p className="text-sm text-[#B0B3B8]">
                          {prices.length > 0 ? prices.join(' · ') : 'Free tier'}
                        </p>
                      </div>
                      {isExpanded ? <ChevronUp className="w-5 h-5 text-[#3A3B3C]" /> : <ChevronDown className="w-5 h-5 text-[#3A3B3C]" />}
                    </button>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="px-4 pb-4 space-y-3 border-t border-[#3A3B3C] pt-3">
                        {plan.description && <p className="text-sm text-[#B0B3B8]">{plan.description}</p>}

                        {/* Pricing grid */}
                        <div className="grid grid-cols-4 gap-2">
                          {[
                            { label: 'Daily', val: plan.price_daily },
                            { label: 'Weekly', val: plan.price_weekly },
                            { label: 'Monthly', val: plan.price_monthly },
                            { label: 'Yearly', val: plan.price_yearly },
                          ].map(p => (
                            <div key={p.label} className="bg-[#18191A] rounded-lg p-2 text-center">
                              <p className="text-[10px] text-[#6A6B6D] uppercase">{p.label}</p>
                              <p className="text-sm font-bold text-white">{p.val ? `$${p.val}` : '—'}</p>
                            </div>
                          ))}
                        </div>

                        {/* Perks summary */}
                        <div className="flex flex-wrap gap-2">
                          {plan.comp_multiplier > 1 && (
                            <span className="text-xs px-2 py-1 rounded-full bg-[#F59E0B]/10 text-[#F59E0B]">
                              {plan.comp_multiplier}x Comps
                            </span>
                          )}
                          {plan.seat_fee_discount_pct > 0 && (
                            <span className="text-xs px-2 py-1 rounded-full bg-[#1877F2]/10 text-[#1877F2]">
                              {plan.seat_fee_discount_pct}% Seat Fee Discount
                            </span>
                          )}
                          {plan.priority_waitlist && <span className="text-xs px-2 py-1 rounded-full bg-[#31A24C]/10 text-[#31A24C]">Priority Waitlist</span>}
                          {plan.reserved_seating && <span className="text-xs px-2 py-1 rounded-full bg-[#8B5CF6]/10 text-[#8B5CF6]">Reserved Seating</span>}
                          {plan.free_food_drinks && <span className="text-xs px-2 py-1 rounded-full bg-[#EF4444]/10 text-[#EF4444]">Free F&B</span>}
                          {plan.free_parking && <span className="text-xs px-2 py-1 rounded-full bg-[#06B6D4]/10 text-[#06B6D4]">Free Parking</span>}
                          {plan.tournament_discount_pct > 0 && (
                            <span className="text-xs px-2 py-1 rounded-full bg-[#F59E0B]/10 text-[#F59E0B]">
                              {plan.tournament_discount_pct}% Tourney Discount
                            </span>
                          )}
                          {plan.guest_passes_per_month > 0 && (
                            <span className="text-xs px-2 py-1 rounded-full bg-[#B0B3B8]/10 text-[#B0B3B8]">
                              {plan.guest_passes_per_month} Guest Pass{plan.guest_passes_per_month > 1 ? 'es' : ''}/mo
                            </span>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 pt-2">
                          <button onClick={() => startEdit(plan)}
                            className="flex-1 py-2 rounded-xl bg-[#1877F2] text-white text-sm font-medium">
                            Edit Plan
                          </button>
                          {plan.is_active ? (
                            <button onClick={() => handleDelete(plan)}
                              className="px-4 py-2 rounded-xl bg-[#EF4444]/10 text-[#EF4444] text-sm font-medium">
                              Deactivate
                            </button>
                          ) : (
                            <button onClick={() => handleReactivate(plan)}
                              className="px-4 py-2 rounded-xl bg-[#31A24C]/10 text-[#31A24C] text-sm font-medium">
                              Reactivate
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </CommanderLayout>
              );
            })
          )}

          {/* Info box */}
          <div className="cmd-panel p-4">
            <p className="text-xs text-[#6A6B6D] leading-relaxed">
              <strong className="text-[#B0B3B8]">How It Works:</strong> Set pricing at any interval you want — daily passes for tourists, monthly for regulars, yearly for VIPs.
              Leave an interval blank if you don't offer it. Seat fee adjustments let you give members discounted or fixed hourly rates.
              Comp multipliers automatically apply when staff awards comps through the Comp System.
            </p>
          </div>
        </main>
      </div>
      <style jsx>{`
`}</style>
    </>
  );
}
