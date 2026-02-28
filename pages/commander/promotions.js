/**
 * Staff Promotions Management Page
 * Create and manage venue promotions (bad beat, high hand, etc.)
 * Dark industrial sci-fi gaming theme
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../src/components/seo/SEOHead';
import {
  Gift,
  Plus,
  Clock,
  DollarSign,
  Users,
  Edit,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Trophy,
  Zap,
  Target,
  Loader2,
  X,
  Check,
  Award,
  Spade,
  CheckCircle,
  User
} from 'lucide-react';
import PromotionCard from '../../src/components/commander/promotions/PromotionCard';
import PromotionEditor from '../../src/components/commander/promotions/PromotionEditor';
import PromotionBuilder from '../../src/components/commander/promotions/PromotionBuilder';
import HighHandDisplay from '../../src/components/commander/promotions/HighHandDisplay';
import CommanderLayout from '../../src/components/commander/shared/CommanderLayout';
import { useCommanderSync, broadcastChange } from '../../src/lib/commander/useCommanderSync';

const PROMO_TYPES = [
  { value: 'high_hand', label: 'High Hand', icon: Trophy, color: '#F59E0B' },
  { value: 'bad_beat', label: 'Bad Beat Jackpot', icon: Zap, color: '#EF4444' },
  { value: 'splash_pot', label: 'Splash Pot', icon: DollarSign, color: '#31A24C' },
  { value: 'hourly_drawing', label: 'Hourly Drawing', icon: Clock, color: '#1877F2' },
  { value: 'bonus', label: 'Player Bonus', icon: Gift, color: '#1877F2' },
  { value: 'tournament', label: 'Tournament Promo', icon: Target, color: '#EC4899' }
];

const HAND_RANKS = [
  { value: 10, label: 'Royal Flush' },
  { value: 9, label: 'Straight Flush' },
  { value: 8, label: 'Four Of A Kind' },
  { value: 7, label: 'Full House' },
  { value: 6, label: 'Flush' },
  { value: 5, label: 'Straight' },
  { value: 4, label: 'Three Of A Kind' },
  { value: 3, label: 'Two Pair' },
  { value: 2, label: 'One Pair' },
  { value: 1, label: 'High Card' }
];

/* EditPromoModal and CreatePromoModal replaced by shared PromotionEditor component */

function RecordHighHandModal({ isOpen, onClose, onSubmit, venueId, staff }) {
  const [formData, setFormData] = useState({
    player_name: '',
    hand_description: '',
    hand_rank: 8,
    table_number: '',
    prize_amount: 500,
    auto_verify: true
  });
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    if (!formData.player_name.trim() || !formData.hand_description.trim()) return;

    setSubmitting(true);
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const staffSession = localStorage.getItem('commander_staff') || '';
      const res = await fetch('/api/commander/high-hands', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'x-staff-session': staffSession
        },
        body: JSON.stringify({
          venue_id: venueId,
          player_name: formData.player_name,
          hand_description: formData.hand_description,
          hand_rank: formData.hand_rank,
          table_number: formData.table_number || null,
          prize_amount: formData.prize_amount,
          auto_verify: formData.auto_verify
        })
      });

      const data = await res.json();
      if (data.high_hand) {
        onSubmit?.(data.high_hand);
        onClose();
        setFormData({
          player_name: '',
          hand_description: '',
          hand_rank: 8,
          table_number: '',
          prize_amount: 500,
          auto_verify: true
        });
      }
    } catch (error) {
      console.error('Record high hand failed:', error);
    } finally {
      setSubmitting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="cmd-panel cmd-corner-lights w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-[#3A3B3C]">
          <h3 className="text-lg font-semibold text-white">Record High Hand</h3>
          <button onClick={onClose} className="p-2 hover:bg-[#3A3B3C] rounded-lg">
            <X className="w-5 h-5 text-[#B0B3B8]" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-white mb-2">Player Name</label>
            <input
              type="text"
              value={formData.player_name}
              onChange={(e) => setFormData(prev => ({ ...prev, player_name: e.target.value }))}
              placeholder="e.g., John Smith"
              className="cmd-input w-full"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-2">Hand Type</label>
            <select
              value={formData.hand_rank}
              onChange={(e) => setFormData(prev => ({ ...prev, hand_rank: parseInt(e.target.value) }))}
              className="cmd-input w-full"
            >
              {HAND_RANKS.map((rank) => (
                <option key={rank.value} value={rank.value}>{rank.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-white mb-2">Hand Description</label>
            <input
              type="text"
              value={formData.hand_description}
              onChange={(e) => setFormData(prev => ({ ...prev, hand_description: e.target.value }))}
              placeholder="e.g., Aces Full Of Kings, Quad Jacks"
              className="cmd-input w-full"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-white mb-2">Table Number</label>
              <input
                type="text"
                value={formData.table_number}
                onChange={(e) => setFormData(prev => ({ ...prev, table_number: e.target.value }))}
                placeholder="e.g., 5"
                className="cmd-input w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-white mb-2">Prize Amount</label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#B0B3B8]" />
                <input
                  type="number"
                  value={formData.prize_amount}
                  onChange={(e) => setFormData(prev => ({ ...prev, prize_amount: parseInt(e.target.value) || 0 }))}
                  className="cmd-input w-full pl-10"
                />
              </div>
            </div>
          </div>

          <label className="flex items-center gap-3 p-3 bg-[#3A3B3C] rounded-lg cursor-pointer">
            <input
              type="checkbox"
              checked={formData.auto_verify}
              onChange={(e) => setFormData(prev => ({ ...prev, auto_verify: e.target.checked }))}
              className="w-5 h-5 text-[#1877F2] border-[#3A3B3C] rounded focus:ring-[#1877F2]"
            />
            <div>
              <p className="font-medium text-white">Auto-verify This Hand</p>
              <p className="text-sm text-[#B0B3B8]">Mark as verified by {staff?.display_name || 'you'}</p>
            </div>
          </label>
        </div>

        <div className="p-4 border-t border-[#3A3B3C]">
          <button
            onClick={handleSubmit}
            disabled={!formData.player_name.trim() || !formData.hand_description.trim() || submitting}
            className="w-full h-12 bg-[#F59E0B] text-white font-semibold rounded-lg hover:bg-[#D97706] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trophy className="w-5 h-5" />}
            Record High Hand
          </button>
        </div>
      </div>
    </div>
  );
}

function HighHandCard({ highHand, onVerify }) {
  const rankLabel = HAND_RANKS.find(r => r.value === highHand.hand_rank)?.label || 'Unknown';

  return (
    <div className="cmd-panel p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#F59E0B]/10 flex items-center justify-center">
            <Trophy className="w-5 h-5 text-[#F59E0B]" />
          </div>
          <div>
            <h3 className="font-semibold text-white">
              {highHand.profiles?.display_name || highHand.player_name || 'Unknown Player'}
            </h3>
            <p className="text-sm text-[#B0B3B8]">{highHand.hand_description}</p>
          </div>
        </div>
        {highHand.verified_at ? (
          <span className="flex items-center gap-1 px-2 py-1 bg-[#31A24C]/10 text-[#31A24C] text-xs font-medium rounded-full">
            <CheckCircle className="w-3 h-3" />
            Verified
          </span>
        ) : (
          <button
            onClick={() => onVerify?.(highHand)}
            className="cmd-btn cmd-btn-primary px-3 py-1 text-xs font-medium rounded-full"
          >
            Verify
          </button>
        )}
      </div>

      <div className="flex items-center gap-4 text-sm text-[#B0B3B8]">
        <span className="flex items-center gap-1">
          <Award className="w-4 h-4" />
          {rankLabel}
        </span>
        {highHand.table_number && (
          <span>Table {highHand.table_number}</span>
        )}
        {highHand.prize_amount && (
          <span className="flex items-center gap-1">
            <DollarSign className="w-4 h-4" />
            ${highHand.prize_amount}
          </span>
        )}
        <span>
          {new Date(highHand.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );
}

function CurrentHighHandBanner({ highHand }) {
  if (!highHand) return null;

  const rankLabel = HAND_RANKS.find(r => r.value === highHand.hand_rank)?.label || 'Unknown';

  return (
    <div className="bg-gradient-to-r from-[#F59E0B] to-[#D97706] rounded-xl p-4 text-white">
      <div className="flex items-center gap-2 mb-2">
        <Trophy className="w-5 h-5" />
        <span className="font-semibold">Current High Hand</span>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xl font-bold">
            {highHand.profiles?.display_name || highHand.player_name || 'Unknown'}
          </p>
          <p className="text-white/90">{highHand.hand_description} ({rankLabel})</p>
        </div>
        {highHand.prize_amount && (
          <div className="text-right">
            <p className="text-sm text-white/80">Prize</p>
            <p className="text-2xl font-bold">${highHand.prize_amount}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function PromoCard({ promo, onToggle, onEdit, onDelete }) {
  const typeConfig = PROMO_TYPES.find(t => t.value === promo.promo_type) || PROMO_TYPES[0];
  const Icon = typeConfig.icon;

  return (
    <div className="cmd-panel p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${typeConfig.color}20` }}
          >
            <Icon className="w-5 h-5" style={{ color: typeConfig.color }} />
          </div>
          <div>
            <h3 className="font-semibold text-white">{promo.name}</h3>
            <p className="text-sm text-[#B0B3B8]">{typeConfig.label}</p>
          </div>
        </div>

        <button
          onClick={() => onToggle?.(promo)}
          className={`p-1 rounded transition-colors ${promo.is_active ? 'text-[#31A24C]' : 'text-[#3A3B3C]'}`}
        >
          {promo.is_active ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8" />}
        </button>
      </div>

      <div className="flex items-center gap-4 text-sm text-[#B0B3B8] mb-3">
        <span className="flex items-center gap-1">
          <DollarSign className="w-4 h-4" />
          ${promo.prize_amount}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="w-4 h-4" />
          {promo.frequency}
        </span>
        <span>
          {promo.start_time?.slice(0, 5)} - {promo.end_time?.slice(0, 5)}
        </span>
      </div>

      {promo.description && (
        <p className="text-sm text-[#B0B3B8] mb-3 line-clamp-2">{promo.description}</p>
      )}

      <div className="flex gap-2 pt-3 border-t border-[#3A3B3C]">
        <button
          onClick={() => onEdit?.(promo)}
          className="flex-1 h-9 flex items-center justify-center gap-1 text-sm font-medium text-[#1877F2] hover:bg-[#1877F2]/5 rounded-lg transition-colors"
        >
          <Edit className="w-4 h-4" />
          Edit
        </button>
        <button
          onClick={() => onDelete?.(promo)}
          className="flex-1 h-9 flex items-center justify-center gap-1 text-sm font-medium text-[#EF4444] hover:bg-[#EF4444]/5 rounded-lg transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          Delete
        </button>
      </div>
    </div>
  );
}

export default function PromotionsPage() {
  const router = useRouter();

  const [staff, setStaff] = useState(null);
  const [venueId, setVenueId] = useState(null);
  const [promotions, setPromotions] = useState([]);
  const [highHands, setHighHands] = useState([]);
  const [currentHighHand, setCurrentHighHand] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingPromo, setEditingPromo] = useState(null);
  const [showHighHandModal, setShowHighHandModal] = useState(false);
  const [filter, setFilter] = useState('all');
  const [activeTab, setActiveTab] = useState('promotions');
  const [showAwardsModal, setShowAwardsModal] = useState(false);
  const [selectedPromoForAwards, setSelectedPromoForAwards] = useState(null);
  const [promoAwards, setPromoAwards] = useState([]);
  const [awardsLoading, setAwardsLoading] = useState(false);
  const [useWizard, setUseWizard] = useState(false);
  const [highHandPromo, setHighHandPromo] = useState(null);
  const [promoCodes, setPromoCodes] = useState([]);
  const [promoCodesLoading, setPromoCodesLoading] = useState(false);
  const [seedingPromos, setSeedingPromos] = useState(false);
  const [editingPromoCode, setEditingPromoCode] = useState(null);
  const [editCodeForm, setEditCodeForm] = useState({ code: '', description: '', max_uses: '' });

  useEffect(() => {
    const storedStaff = localStorage.getItem('commander_staff');
    if (!storedStaff) {
      router.push('/commander/login').catch(() => { });
      return;
    }
    try {
      const staffData = JSON.parse(storedStaff);
      setStaff(staffData);
      setVenueId(staffData.venue_id);
    } catch (err) {
      router.push('/commander/login').catch(() => { });
    }
  }, [router]);

  const fetchPromotions = useCallback(async () => {
    if (!venueId) return;
    try {
      const res = await fetch(`/api/commander/promotions?venue_id=${venueId}`);
      const data = await res.json();
      if (data.success) {
        setPromotions(data.data?.promotions || []);
      }
    } catch (error) {
      console.error('Fetch promotions failed:', error);
    } finally {
      setLoading(false);
    }
  }, [venueId]);

  const fetchHighHands = useCallback(async () => {
    if (!venueId) return;
    try {
      const res = await fetch(`/api/commander/high-hands?venue_id=${venueId}&limit=20`);
      const data = await res.json();
      if (data.high_hands) {
        setHighHands(data.high_hands);
        setCurrentHighHand(data.current_high);
      }
      // Find active high hand promotion
      const hhPromo = promotions.find(p => p.promo_type === 'high_hand' && p.is_active);
      if (hhPromo) setHighHandPromo(hhPromo);
    } catch (error) {
      console.error('Fetch high hands failed:', error);
    }
  }, [venueId, promotions]);

  const fetchPromoCodes = useCallback(async () => {
    setPromoCodesLoading(true);
    try {
      const token = localStorage.getItem('smarter-poker-auth') || localStorage.getItem('sb-access-token');
      const res = await fetch('/api/promo/admin-promo-codes', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setPromoCodes(data.codes || []);
    } catch (err) { console.error('Fetch promo codes error:', err); }
    finally { setPromoCodesLoading(false); }
  }, []);

  const seedPremadePromos = async () => {
    setSeedingPromos(true);
    try {
      const token = localStorage.getItem('smarter-poker-auth') || localStorage.getItem('sb-access-token');
      const res = await fetch('/api/promo/seed-premade', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        alert(`${data.message}`);
        fetchPromoCodes();
      } else {
        alert(data.error || 'Failed to seed promos');
      }
    } catch (err) { console.error('Seed promos error:', err); alert('Failed to seed promos'); }
    finally { setSeedingPromos(false); }
  };

  const togglePromoCode = async (code) => {
    try {
      const token = localStorage.getItem('smarter-poker-auth') || localStorage.getItem('sb-access-token');
      await fetch('/api/promo/admin-promo-codes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: code.id, is_active: !code.is_active })
      });
      fetchPromoCodes();
    } catch (err) { console.error('Toggle promo code error:', err); }
  };

  const deletePromoCode = async (code) => {
    if (!confirm(`Deactivate promo code "${code.code}"?`)) return;
    try {
      const token = localStorage.getItem('smarter-poker-auth') || localStorage.getItem('sb-access-token');
      await fetch(`/api/promo/admin-promo-codes?id=${code.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchPromoCodes();
    } catch (err) { console.error('Delete promo code error:', err); }
  };

  const openEditPromoCode = (code) => {
    setEditCodeForm({ code: code.code, description: code.description || '', max_uses: code.max_uses ?? '' });
    setEditingPromoCode(code);
  };

  const savePromoCode = async () => {
    if (!editingPromoCode) return;
    try {
      const token = localStorage.getItem('smarter-poker-auth') || localStorage.getItem('sb-access-token');
      const res = await fetch('/api/promo/admin-promo-codes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          id: editingPromoCode.id,
          code: editCodeForm.code,
          description: editCodeForm.description,
          max_uses: editCodeForm.max_uses === '' ? null : parseInt(editCodeForm.max_uses),
        })
      });
      const data = await res.json();
      if (data.success) {
        setEditingPromoCode(null);
        fetchPromoCodes();
      } else {
        alert(data.error || 'Failed to save');
      }
    } catch (err) { console.error('Save promo code error:', err); alert('Failed to save'); }
  };

  useEffect(() => {
    if (venueId) {
      fetchPromotions();
      fetchHighHands();
    }
  }, [venueId, fetchPromotions, fetchHighHands]);

  // Commander Data Bus — sync promotions across tabs
  useCommanderSync(venueId, () => { fetchPromotions(); fetchHighHands(); }, { entities: ['settings'] });

  useEffect(() => {
    if (activeTab === 'promo-codes' && promoCodes.length === 0) {
      fetchPromoCodes();
    }
  }, [activeTab, promoCodes.length, fetchPromoCodes]);

  async function handleViewAwards(promo) {
    setSelectedPromoForAwards(promo);
    setShowAwardsModal(true);
    setAwardsLoading(true);
    try {
      const res = await fetch(`/api/commander/promotions/${promo.id}/awards?limit=50`);
      const data = await res.json();
      setPromoAwards(data.awards || []);
    } catch (error) {
      console.error('Fetch awards failed:', error);
      setPromoAwards([]);
    } finally {
      setAwardsLoading(false);
    }
  }

  async function handleVerifyHighHand(highHand) {
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const staffSession = localStorage.getItem('commander_staff') || '';
      await fetch(`/api/commander/high-hands/${highHand.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'x-staff-session': staffSession
        },
        body: JSON.stringify({ action: 'verify' })
      });
      fetchHighHands();
    } catch (error) {
      console.error('Verify high hand failed:', error);
    }
  }

  async function handleToggle(promo) {
    try {
      const token = localStorage.getItem('smarter-poker-auth') || localStorage.getItem('sb-access-token') || localStorage.getItem('commander_token');
      const staffSession = localStorage.getItem('commander_staff') || '';
      await fetch(`/api/commander/promotions/${promo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'x-staff-session': staffSession },
        body: JSON.stringify({ is_active: !promo.is_active })
      });
      broadcastChange('settings');
      fetchPromotions();
    } catch (error) {
      console.error('Toggle failed:', error);
    }
  }

  async function handleDelete(promo) {
    if (!confirm(`Delete "${promo.name}"?`)) return;
    try {
      const token = localStorage.getItem('smarter-poker-auth') || localStorage.getItem('sb-access-token') || localStorage.getItem('commander_token');
      const staffSession = localStorage.getItem('commander_staff') || '';
      await fetch(`/api/commander/promotions/${promo.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}`, 'x-staff-session': staffSession } });
      broadcastChange('settings');
      fetchPromotions();
    } catch (error) {
      console.error('Delete failed:', error);
    }
  }

  function handleEdit(promo) {
    setEditingPromo(promo);
    setShowEditModal(true);
  }

  const filteredPromos = promotions.filter(p => {
    if (filter === 'active') return p.is_active;
    if (filter === 'inactive') return !p.is_active;
    return true;
  });

  if (!staff) {
    return (
      <div className="cmd-page flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#1877F2]" />
      </div>
    );
  }

  return (
    <CommanderLayout title="Promotions | Commander" backHref="/commander/dashboard?card=displays">
      <>
        <SEOHead
          title="Commander — Promotions"
          description="Club Commander Poker Room Management Tool."
          noindex={true}
        />

        <div style={{ minHeight: '100vh', background: '#18191A', fontFamily: 'Inter, sans-serif' }}>
          {/* ── Premium Header ── */}
          <header style={{
            position: 'sticky', top: 0, zIndex: 40,
            background: '#242526', borderBottom: '1px solid #3A3B3C',
          }}>
            <div style={{
              maxWidth: 960, margin: '0 auto', padding: '14px 20px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div>
                <h1 style={{ fontSize: 20, fontWeight: 800, color: '#E4E6EB', margin: 0 }}>
                  Promotions
                </h1>
                <p style={{ fontSize: 13, color: '#8A8D91', margin: '2px 0 0' }}>
                  {activeTab === 'promotions'
                    ? `${promotions.length} Promotion${promotions.length !== 1 ? 's' : ''}`
                    : activeTab === 'high-hands'
                      ? `${highHands.length} High Hand${highHands.length !== 1 ? 's' : ''} Today`
                      : `${promoCodes.length} Promo Code${promoCodes.length !== 1 ? 's' : ''}`}
                </p>
              </div>
              {activeTab === 'promotions' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    onClick={() => { setUseWizard(true); setShowCreateModal(true); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '8px 16px', borderRadius: 8,
                      background: 'rgba(24,119,242,0.1)', color: '#1877F2',
                      border: '1px solid rgba(24,119,242,0.3)',
                      fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      transition: 'background 0.15s',
                    }}
                  >
                    <Zap size={15} />
                    Wizard
                  </button>
                  <button
                    onClick={() => { setUseWizard(false); setShowCreateModal(true); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '8px 16px', borderRadius: 8,
                      background: '#1877F2', color: '#fff',
                      border: 'none',
                      fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      transition: 'background 0.15s',
                    }}
                  >
                    <Plus size={15} />
                    New Promo
                  </button>
                </div>
              ) : activeTab === 'high-hands' ? (
                <button
                  onClick={() => setShowHighHandModal(true)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 16px', borderRadius: 8,
                    background: '#F59E0B', color: '#fff',
                    border: 'none',
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  <Trophy size={15} />
                  Record High Hand
                </button>
              ) : (
                <button
                  onClick={seedPremadePromos}
                  disabled={seedingPromos}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 16px', borderRadius: 8,
                    background: '#31A24C', color: '#fff',
                    border: 'none',
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    opacity: seedingPromos ? 0.5 : 1,
                  }}
                >
                  {seedingPromos ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                  Load 25 Pre-Made
                </button>
              )}
            </div>

            {/* ── Tab Bar ── */}
            <div style={{
              maxWidth: 960, margin: '0 auto', padding: '0 20px',
              display: 'flex', gap: 0, borderTop: '1px solid #3A3B3C',
            }}>
              {[
                { key: 'promotions', label: 'Promotions', icon: Gift, color: '#1877F2' },
                { key: 'high-hands', label: 'High Hands', icon: Trophy, color: '#F59E0B' },
                { key: 'promo-codes', label: 'Promo Codes', icon: Target, color: '#31A24C' },
              ].map(tab => {
                const isActive = activeTab === tab.key;
                const TabIcon = tab.icon;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    style={{
                      padding: '12px 18px', border: 'none', cursor: 'pointer',
                      background: 'transparent',
                      display: 'flex', alignItems: 'center', gap: 6,
                      fontSize: 13, fontWeight: isActive ? 700 : 500,
                      color: isActive ? tab.color : '#8A8D91',
                      borderBottom: `2px solid ${isActive ? tab.color : 'transparent'}`,
                      transition: 'color 0.15s, border-color 0.15s',
                    }}
                  >
                    <TabIcon size={15} />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </header>

          {/* ── Main Content ── */}
          <main style={{ maxWidth: 960, margin: '0 auto', padding: '20px 20px 40px' }}>
            {activeTab === 'promotions' ? (
              <>
                {/* Filter Pills */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
                  {['All', 'Active', 'Inactive'].map((f) => {
                    const filterVal = f.toLowerCase();
                    const isActive = filter === filterVal;
                    return (
                      <button
                        key={f}
                        onClick={() => setFilter(filterVal)}
                        style={{
                          padding: '7px 18px', borderRadius: 8,
                          fontSize: 13, fontWeight: 600, cursor: 'pointer',
                          background: isActive ? '#1877F2' : '#3A3B3C',
                          color: isActive ? '#fff' : '#B0B3B8',
                          border: isActive ? '1px solid #1877F2' : '1px solid #4E4F50',
                          transition: 'all 0.15s',
                        }}
                      >
                        {f}
                      </button>
                    );
                  })}
                </div>

                {loading ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
                    <Loader2 size={32} color="#1877F2" className="animate-spin" />
                  </div>
                ) : filteredPromos.length === 0 ? (
                  <div style={{
                    background: '#242526', border: '1px solid #3A3B3C', borderRadius: 14,
                    padding: '48px 24px', textAlign: 'center',
                  }}>
                    <Gift size={48} color="#3A3B3C" style={{ margin: '0 auto 12px' }} />
                    <p style={{ color: '#B0B3B8', fontSize: 15, fontWeight: 500, marginBottom: 16 }}>
                      No Promotions Found
                    </p>
                    <button
                      onClick={() => setShowCreateModal(true)}
                      style={{
                        padding: '10px 24px', borderRadius: 8,
                        background: '#1877F2', color: '#fff',
                        border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      Create Promotion
                    </button>
                  </div>
                ) : (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
                    gap: 16,
                  }}>
                    {filteredPromos.map((promo) => (
                      <PromotionCard
                        key={promo.id}
                        promotion={promo}
                        onEdit={handleEdit}
                        onViewAwards={handleViewAwards}
                      />
                    ))}
                  </div>
                )}
              </>
            ) : activeTab === 'high-hands' ? (
              <>
                <HighHandDisplay
                  promotion={highHandPromo}
                  currentHighHand={currentHighHand}
                  recentHighHands={highHands.slice(0, 5)}
                  isStaff={true}
                  onSubmitHand={async (handData) => {
                    try {
                      const token = localStorage.getItem('smarter-poker-auth');
                      const staffSession = localStorage.getItem('commander_staff') || '';
                      await fetch('/api/commander/high-hands', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                          Authorization: `Bearer ${token}`,
                          'x-staff-session': staffSession
                        },
                        body: JSON.stringify({
                          venue_id: venueId,
                          ...handData
                        })
                      });
                      fetchHighHands();
                    } catch (error) {
                      console.error('Submit high hand failed:', error);
                    }
                  }}
                />

                <div style={{ marginTop: 16 }}>
                  <CurrentHighHandBanner highHand={currentHighHand} />
                </div>

                {loading ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
                    <Loader2 size={32} color="#F59E0B" className="animate-spin" />
                  </div>
                ) : highHands.length === 0 ? (
                  <div style={{
                    background: '#242526', border: '1px solid #3A3B3C', borderRadius: 14,
                    padding: '48px 24px', textAlign: 'center', marginTop: 16,
                  }}>
                    <Trophy size={48} color="#3A3B3C" style={{ margin: '0 auto 12px' }} />
                    <p style={{ color: '#B0B3B8', fontSize: 15, fontWeight: 500, marginBottom: 16 }}>
                      No High Hands Recorded Today
                    </p>
                    <button
                      onClick={() => setShowHighHandModal(true)}
                      style={{
                        padding: '10px 24px', borderRadius: 8,
                        background: '#F59E0B', color: '#fff',
                        border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      Record High Hand
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 700, color: '#E4E6EB', margin: 0 }}>
                      Recent High Hands
                    </h3>
                    {highHands.map((hh) => (
                      <HighHandCard
                        key={hh.id}
                        highHand={hh}
                        onVerify={handleVerifyHighHand}
                      />
                    ))}
                  </div>
                )}
              </>
            ) : (
              /* === PROMO CODES TAB === */
              <>
                {promoCodesLoading ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
                    <Loader2 size={32} color="#31A24C" className="animate-spin" />
                  </div>
                ) : promoCodes.length === 0 ? (
                  <div style={{
                    background: '#242526', border: '1px solid #3A3B3C', borderRadius: 14,
                    padding: '48px 24px', textAlign: 'center',
                  }}>
                    <Target size={48} color="#3A3B3C" style={{ margin: '0 auto 12px' }} />
                    <p style={{ color: '#B0B3B8', fontSize: 15, fontWeight: 500, marginBottom: 6 }}>
                      No Promo Codes Yet
                    </p>
                    <p style={{ color: '#8A8D91', fontSize: 13, marginBottom: 16 }}>
                      Click &quot;Load 25 Pre-Made&quot; Above To Add Ready-To-Use Promo Codes
                    </p>
                    <button
                      onClick={seedPremadePromos}
                      disabled={seedingPromos}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '10px 24px', borderRadius: 8,
                        background: '#31A24C', color: '#fff',
                        border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        opacity: seedingPromos ? 0.5 : 1,
                      }}
                    >
                      {seedingPromos ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
                      Load 25 Pre-Made Promo Codes
                    </button>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                      <p style={{ fontSize: 13, color: '#8A8D91', margin: 0 }}>
                        {promoCodes.length} Promo Codes · {promoCodes.filter(c => c.is_active).length} Active
                      </p>
                    </div>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
                      gap: 14,
                    }}>
                      {promoCodes.map(code => (
                        <div key={code.id} style={{
                          background: '#242526', border: '1px solid #3A3B3C', borderRadius: 12,
                          padding: 16, transition: 'border-color 0.15s',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{
                                background: 'rgba(49,162,76,0.15)', color: '#31A24C',
                                padding: '3px 10px', borderRadius: 6,
                                fontFamily: 'monospace', fontSize: 13, fontWeight: 700,
                                border: '1px solid rgba(49,162,76,0.3)',
                              }}>{code.code}</span>
                              <span style={{
                                fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
                                padding: '3px 8px', borderRadius: 20,
                                background: code.is_active ? 'rgba(49,162,76,0.12)' : '#3A3B3C',
                                color: code.is_active ? '#4ADE80' : '#8A8D91',
                                border: `1px solid ${code.is_active ? 'rgba(49,162,76,0.3)' : '#4E4F50'}`,
                                textTransform: 'uppercase',
                              }}>
                                {code.is_active ? 'Active' : 'Inactive'}
                              </span>
                            </div>
                            <button
                              onClick={() => togglePromoCode(code)}
                              style={{
                                background: 'none', border: 'none', padding: 2, cursor: 'pointer',
                                color: code.is_active ? '#31A24C' : '#3A3B3C',
                              }}
                            >
                              {code.is_active ? <ToggleRight size={26} /> : <ToggleLeft size={26} />}
                            </button>
                          </div>
                          <p style={{ fontSize: 13, color: '#E4E6EB', marginBottom: 6, lineHeight: 1.4 }}>{code.description}</p>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: '#8A8D91' }}>
                            <span>Type: {(code.reward_type || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</span>
                            <span>Value: {code.reward_value}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, color: '#8A8D91', marginTop: 4 }}>
                            <span>Uses: {code.promo_code_redemptions?.[0]?.count || code.times_used || 0}{code.max_uses ? ` / ${code.max_uses}` : ' / ∞'}</span>
                            {code.expires_at && <span>Exp: {new Date(code.expires_at).toLocaleDateString()}</span>}
                          </div>
                          <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingTop: 10, borderTop: '1px solid #3A3B3C' }}>
                            <button
                              onClick={() => openEditPromoCode(code)}
                              style={{
                                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                                padding: '8px 12px', borderRadius: 8,
                                background: 'transparent', color: '#1877F2',
                                border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                transition: 'background 0.15s',
                              }}
                              onMouseEnter={e => e.currentTarget.style.background = 'rgba(24,119,242,0.08)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >
                              <Edit size={13} />
                              Edit
                            </button>
                            <button
                              onClick={() => deletePromoCode(code)}
                              style={{
                                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                                padding: '8px 12px', borderRadius: 8,
                                background: 'transparent', color: '#EF4444',
                                border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                transition: 'background 0.15s',
                              }}
                              onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.08)'}
                              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >
                              <Trash2 size={13} />
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </main>
        </div>

        {/* === EDIT PROMO CODE MODAL === */}
        {editingPromoCode && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16,
          }}>
            <div style={{
              background: '#242526', border: '1px solid #3A3B3C', borderRadius: 14,
              width: '100%', maxWidth: 440, padding: 24,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <h3 style={{ fontSize: 17, fontWeight: 700, color: '#E4E6EB' }}>Edit Promo Code</h3>
                <button
                  onClick={() => setEditingPromoCode(null)}
                  style={{ background: 'none', border: 'none', color: '#8A8D91', cursor: 'pointer', padding: 4 }}
                >
                  <X size={20} />
                </button>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#B0B3B8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Code Name
                </label>
                <input
                  value={editCodeForm.code}
                  onChange={e => setEditCodeForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                  style={{
                    width: '100%', padding: '10px 14px', borderRadius: 8,
                    background: '#18191A', border: '1px solid #3A3B3C', color: '#E4E6EB',
                    fontSize: 15, fontFamily: 'monospace', fontWeight: 700,
                    outline: 'none',
                  }}
                  placeholder="e.g. WELCOME50"
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#B0B3B8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Description
                </label>
                <input
                  value={editCodeForm.description}
                  onChange={e => setEditCodeForm(f => ({ ...f, description: e.target.value }))}
                  style={{
                    width: '100%', padding: '10px 14px', borderRadius: 8,
                    background: '#18191A', border: '1px solid #3A3B3C', color: '#E4E6EB',
                    fontSize: 14, outline: 'none',
                  }}
                  placeholder="Promotion description"
                />
              </div>

              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#B0B3B8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Max Uses <span style={{ fontWeight: 400, textTransform: 'none' }}>(leave blank for unlimited)</span>
                </label>
                <input
                  type="number"
                  value={editCodeForm.max_uses}
                  onChange={e => setEditCodeForm(f => ({ ...f, max_uses: e.target.value }))}
                  style={{
                    width: '100%', padding: '10px 14px', borderRadius: 8,
                    background: '#18191A', border: '1px solid #3A3B3C', color: '#E4E6EB',
                    fontSize: 15, outline: 'none',
                  }}
                  placeholder="∞ Unlimited"
                  min="0"
                />
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => setEditingPromoCode(null)}
                  style={{
                    flex: 1, padding: '10px 16px', borderRadius: 8,
                    background: '#3A3B3C', color: '#E4E6EB', border: 'none',
                    fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={savePromoCode}
                  style={{
                    flex: 1, padding: '10px 16px', borderRadius: 8,
                    background: '#1877F2', color: '#fff', border: 'none',
                    fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  <Check size={15} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        )}

        {showCreateModal && (
          useWizard ? (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
              <div className="cmd-panel w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-white">Promotion Wizard</h3>
                  <button
                    onClick={() => { setUseWizard(false); setShowCreateModal(false); }}
                    className="p-2 hover:bg-[#3A3B3C] rounded-lg"
                  >
                    <X className="w-5 h-5 text-[#B0B3B8]" />
                  </button>
                </div>
                <PromotionBuilder
                  venueId={venueId}
                  onSubmit={async (data) => {
                    try {
                      const token = localStorage.getItem('smarter-poker-auth') || localStorage.getItem('sb-access-token') || localStorage.getItem('commander_token');
                      const staffSession = localStorage.getItem('commander_staff') || '';
                      const res = await fetch('/api/commander/promotions', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'x-staff-session': staffSession },
                        body: JSON.stringify(data)
                      });
                      const result = await res.json();
                      if (result.promotion || result.success) {
                        broadcastChange('settings');
                        fetchPromotions();
                        setShowCreateModal(false);
                        setUseWizard(false);
                      } else {
                        alert('Create failed: ' + (result.error || 'Unknown error'));
                      }
                    } catch (error) {
                      console.error('Create promo failed:', error);
                      alert('Create failed: ' + error.message);
                    }
                  }}
                  onCancel={() => { setUseWizard(false); setShowCreateModal(false); }}
                />
              </div>
            </div>
          ) : (
            <PromotionEditor
              venueId={venueId}
              onSave={async (data) => {
                try {
                  const token = localStorage.getItem('smarter-poker-auth') || localStorage.getItem('sb-access-token') || localStorage.getItem('commander_token');
                  const staffSession = localStorage.getItem('commander_staff') || '';
                  const res = await fetch('/api/commander/promotions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'x-staff-session': staffSession },
                    body: JSON.stringify(data)
                  });
                  const result = await res.json();
                  if (result.promotion || result.success) {
                    broadcastChange('settings');
                    fetchPromotions();
                    setShowCreateModal(false);
                  } else {
                    alert('Create failed: ' + (result.error || 'Unknown error'));
                  }
                } catch (error) {
                  console.error('Create promo failed:', error);
                  alert('Create failed: ' + error.message);
                }
              }}
              onClose={() => setShowCreateModal(false)}
            />
          )
        )}

        {showEditModal && editingPromo && (
          <PromotionEditor
            promotion={editingPromo}
            venueId={venueId}
            onSave={async (data) => {
              try {
                const token = localStorage.getItem('smarter-poker-auth') || localStorage.getItem('sb-access-token') || localStorage.getItem('commander_token');
                const staffSession = localStorage.getItem('commander_staff') || '';
                const res = await fetch(`/api/commander/promotions/${editingPromo.id}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'x-staff-session': staffSession },
                  body: JSON.stringify(data)
                });
                const result = await res.json();
                if (result.success || result.promotion) {
                  fetchPromotions();
                  setShowEditModal(false);
                  setEditingPromo(null);
                } else {
                  alert('Update failed: ' + (result.error || 'Unknown error'));
                }
              } catch (error) {
                console.error('Update promo failed:', error);
                alert('Update failed: ' + error.message);
              }
            }}
            onDelete={async (id) => {
              if (!confirm('Delete this promotion?')) return;
              try {
                const token = localStorage.getItem('smarter-poker-auth') || localStorage.getItem('sb-access-token') || localStorage.getItem('commander_token');
                const staffSession = localStorage.getItem('commander_staff') || '';
                await fetch(`/api/commander/promotions/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}`, 'x-staff-session': staffSession } });
                fetchPromotions();
                setShowEditModal(false);
                setEditingPromo(null);
              } catch (error) {
                console.error('Delete failed:', error);
              }
            }}
            onClose={() => {
              setShowEditModal(false);
              setEditingPromo(null);
            }}
          />
        )}

        <RecordHighHandModal
          isOpen={showHighHandModal}
          onClose={() => setShowHighHandModal(false)}
          onSubmit={() => fetchHighHands()}
          venueId={venueId}
          staff={staff}
        />

        {/* Awards Modal */}
        {showAwardsModal && selectedPromoForAwards && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
            <div className="cmd-panel cmd-corner-lights w-full max-w-lg max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between p-4 border-b border-[#3A3B3C]">
                <div>
                  <h3 className="text-lg font-semibold text-white">Awards</h3>
                  <p className="text-sm text-[#B0B3B8]">{selectedPromoForAwards.name}</p>
                </div>
                <button
                  onClick={() => { setShowAwardsModal(false); setSelectedPromoForAwards(null); setPromoAwards([]); }}
                  className="p-2 hover:bg-[#3A3B3C] rounded-lg"
                >
                  <X className="w-5 h-5 text-[#B0B3B8]" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                {awardsLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-[#1877F2]" />
                  </div>
                ) : promoAwards.length === 0 ? (
                  <div className="text-center py-8">
                    <Award className="w-12 h-12 text-[#3A3B3C] mx-auto mb-3" />
                    <p className="text-[#B0B3B8]">No Awards Recorded Yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {promoAwards.map((award) => (
                      <div key={award.id} className="p-3 bg-[#3A3B3C] rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-[#1877F2]/10 flex items-center justify-center">
                              {award.profiles?.avatar_url ? (
                                <img src={award.profiles.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                              ) : (
                                <User className="w-4 h-4 text-[#1877F2]" />
                              )}
                            </div>
                            <span className="font-medium text-white text-sm">
                              {award.profiles?.display_name || award.player_name || 'Unknown'}
                            </span>
                          </div>
                          <span className={`text-xs px-2 py-1 rounded-full font-medium ${award.status === 'approved'
                            ? 'bg-[#31A24C]/10 text-[#31A24C]'
                            : award.status === 'pending'
                              ? 'bg-[#F59E0B]/10 text-[#F59E0B]'
                              : 'bg-[#3A3B3C]/10 text-[#B0B3B8]'
                            }`}>
                            {award.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-sm text-[#B0B3B8]">
                          <span className="flex items-center gap-1">
                            <DollarSign className="w-3 h-3" />
                            ${award.prize_value?.toLocaleString() || 0}
                          </span>
                          {award.prize_description && (
                            <span>{award.prize_description}</span>
                          )}
                          <span className="ml-auto">
                            {new Date(award.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        <style jsx>{`
`}</style>
      </>
    </CommanderLayout>
  );
}
