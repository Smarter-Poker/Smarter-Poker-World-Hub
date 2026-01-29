/**
 * Staff Promotions Management Page
 * Create and manage venue promotions (bad beat, high hand, etc.)
 * Dark industrial sci-fi gaming theme
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  ArrowLeft,
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

const PROMO_TYPES = [
  { value: 'high_hand', label: 'High Hand', icon: Trophy, color: '#F59E0B' },
  { value: 'bad_beat', label: 'Bad Beat Jackpot', icon: Zap, color: '#EF4444' },
  { value: 'splash_pot', label: 'Splash Pot', icon: DollarSign, color: '#10B981' },
  { value: 'hourly_drawing', label: 'Hourly Drawing', icon: Clock, color: '#8B5CF6' },
  { value: 'bonus', label: 'Player Bonus', icon: Gift, color: '#22D3EE' },
  { value: 'tournament', label: 'Tournament Promo', icon: Target, color: '#EC4899' }
];

const HAND_RANKS = [
  { value: 10, label: 'Royal Flush' },
  { value: 9, label: 'Straight Flush' },
  { value: 8, label: 'Four of a Kind' },
  { value: 7, label: 'Full House' },
  { value: 6, label: 'Flush' },
  { value: 5, label: 'Straight' },
  { value: 4, label: 'Three of a Kind' },
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
      const res = await fetch('/api/commander/high-hands', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
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
        <div className="flex items-center justify-between p-4 border-b border-[#4A5E78]">
          <h3 className="text-lg font-semibold text-white">Record High Hand</h3>
          <button onClick={onClose} className="p-2 hover:bg-[#132240] rounded-lg">
            <X className="w-5 h-5 text-[#64748B]" />
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
              placeholder="e.g., Aces full of Kings, Quad Jacks"
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
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#64748B]" />
                <input
                  type="number"
                  value={formData.prize_amount}
                  onChange={(e) => setFormData(prev => ({ ...prev, prize_amount: parseInt(e.target.value) || 0 }))}
                  className="cmd-input w-full pl-10"
                />
              </div>
            </div>
          </div>

          <label className="flex items-center gap-3 p-3 bg-[#0D192E] rounded-lg cursor-pointer">
            <input
              type="checkbox"
              checked={formData.auto_verify}
              onChange={(e) => setFormData(prev => ({ ...prev, auto_verify: e.target.checked }))}
              className="w-5 h-5 text-[#22D3EE] border-[#4A5E78] rounded focus:ring-[#22D3EE]"
            />
            <div>
              <p className="font-medium text-white">Auto-verify this hand</p>
              <p className="text-sm text-[#64748B]">Mark as verified by {staff?.display_name || 'you'}</p>
            </div>
          </label>
        </div>

        <div className="p-4 border-t border-[#4A5E78]">
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
            <p className="text-sm text-[#64748B]">{highHand.hand_description}</p>
          </div>
        </div>
        {highHand.verified_at ? (
          <span className="flex items-center gap-1 px-2 py-1 bg-[#10B981]/10 text-[#10B981] text-xs font-medium rounded-full">
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

      <div className="flex items-center gap-4 text-sm text-[#64748B]">
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
            <p className="text-sm text-[#64748B]">{typeConfig.label}</p>
          </div>
        </div>

        <button
          onClick={() => onToggle?.(promo)}
          className={`p-1 rounded transition-colors ${promo.is_active ? 'text-[#10B981]' : 'text-[#4A5E78]'}`}
        >
          {promo.is_active ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8" />}
        </button>
      </div>

      <div className="flex items-center gap-4 text-sm text-[#64748B] mb-3">
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
        <p className="text-sm text-[#64748B] mb-3 line-clamp-2">{promo.description}</p>
      )}

      <div className="flex gap-2 pt-3 border-t border-[#4A5E78]">
        <button
          onClick={() => onEdit?.(promo)}
          className="flex-1 h-9 flex items-center justify-center gap-1 text-sm font-medium text-[#22D3EE] hover:bg-[#22D3EE]/5 rounded-lg transition-colors"
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

  useEffect(() => {
    const storedStaff = localStorage.getItem('commander_staff');
    if (!storedStaff) {
      router.push('/commander/login');
      return;
    }
    try {
      const staffData = JSON.parse(storedStaff);
      setStaff(staffData);
      setVenueId(staffData.venue_id);
    } catch (err) {
      router.push('/commander/login');
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
    } catch (error) {
      console.error('Fetch high hands failed:', error);
    }
  }, [venueId]);

  useEffect(() => {
    if (venueId) {
      fetchPromotions();
      fetchHighHands();
    }
  }, [venueId, fetchPromotions, fetchHighHands]);

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
      await fetch(`/api/commander/high-hands/${highHand.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
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
      await fetch(`/api/commander/promotions/${promo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !promo.is_active })
      });
      fetchPromotions();
    } catch (error) {
      console.error('Toggle failed:', error);
    }
  }

  async function handleDelete(promo) {
    if (!confirm(`Delete "${promo.name}"?`)) return;
    try {
      await fetch(`/api/commander/promotions/${promo.id}`, { method: 'DELETE' });
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
        <Loader2 className="w-8 h-8 animate-spin text-[#22D3EE]" />
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Promotions | Commander</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="cmd-page">
        <header className="cmd-header-bar sticky top-0 z-40">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/commander/dashboard')}
                className="p-2 hover:bg-[#132240] rounded-lg"
              >
                <ArrowLeft className="w-5 h-5 text-[#64748B]" />
              </button>
              <div>
                <h1 className="font-bold text-white">Promotions</h1>
                <p className="text-sm text-[#64748B]">
                  {activeTab === 'promotions' ? `${promotions.length} promotions` : `${highHands.length} high hands today`}
                </p>
              </div>
            </div>
            {activeTab === 'promotions' ? (
              <button
                onClick={() => setShowCreateModal(true)}
                className="cmd-btn cmd-btn-primary flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                New Promo
              </button>
            ) : (
              <button
                onClick={() => setShowHighHandModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-[#F59E0B] text-white font-medium rounded-lg hover:bg-[#D97706]"
              >
                <Trophy className="w-4 h-4" />
                Record High Hand
              </button>
            )}
          </div>

          <div className="max-w-4xl mx-auto px-4 flex gap-1 border-t border-[#4A5E78]">
            <button
              onClick={() => setActiveTab('promotions')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'promotions'
                  ? 'border-[#22D3EE] text-[#22D3EE]'
                  : 'border-transparent text-[#64748B] hover:text-white'
              }`}
            >
              <Gift className="w-4 h-4 inline-block mr-2" />
              Promotions
            </button>
            <button
              onClick={() => setActiveTab('high-hands')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'high-hands'
                  ? 'border-[#F59E0B] text-[#F59E0B]'
                  : 'border-transparent text-[#64748B] hover:text-white'
              }`}
            >
              <Trophy className="w-4 h-4 inline-block mr-2" />
              High Hands
            </button>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-4 py-6 space-y-4">
          {activeTab === 'promotions' ? (
            <>
              <div className="flex gap-2">
                {['all', 'active', 'inactive'].map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                      filter === f
                        ? 'bg-[#22D3EE] text-white'
                        : 'cmd-btn cmd-btn-secondary'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>

              {loading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-[#22D3EE]" />
                </div>
              ) : filteredPromos.length === 0 ? (
                <div className="cmd-panel p-8 text-center">
                  <Gift className="w-12 h-12 text-[#4A5E78] mx-auto mb-3" />
                  <p className="text-[#64748B]">No promotions found</p>
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="cmd-btn cmd-btn-primary mt-4"
                  >
                    Create Promotion
                  </button>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
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
          ) : (
            <>
              <CurrentHighHandBanner highHand={currentHighHand} />

              {loading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-[#F59E0B]" />
                </div>
              ) : highHands.length === 0 ? (
                <div className="cmd-panel p-8 text-center">
                  <Trophy className="w-12 h-12 text-[#4A5E78] mx-auto mb-3" />
                  <p className="text-[#64748B]">No high hands recorded today</p>
                  <button
                    onClick={() => setShowHighHandModal(true)}
                    className="mt-4 px-4 py-2 bg-[#F59E0B] text-white font-medium rounded-lg"
                  >
                    Record High Hand
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <h3 className="font-semibold text-white">Recent High Hands</h3>
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
          )}
        </main>
      </div>

      {showCreateModal && (
        <PromotionEditor
          venueId={venueId}
          onSave={async (data) => {
            try {
              const res = await fetch('/api/commander/promotions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
              });
              const result = await res.json();
              if (result.success) {
                fetchPromotions();
                setShowCreateModal(false);
              }
            } catch (error) {
              console.error('Create promo failed:', error);
            }
          }}
          onClose={() => setShowCreateModal(false)}
        />
      )}

      {showEditModal && editingPromo && (
        <PromotionEditor
          promotion={editingPromo}
          venueId={venueId}
          onSave={async (data) => {
            try {
              const res = await fetch(`/api/commander/promotions/${editingPromo.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
              });
              const result = await res.json();
              if (result.success) {
                fetchPromotions();
                setShowEditModal(false);
                setEditingPromo(null);
              }
            } catch (error) {
              console.error('Update promo failed:', error);
            }
          }}
          onDelete={async (id) => {
            if (!confirm('Delete this promotion?')) return;
            try {
              await fetch(`/api/commander/promotions/${id}`, { method: 'DELETE' });
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
            <div className="flex items-center justify-between p-4 border-b border-[#4A5E78]">
              <div>
                <h3 className="text-lg font-semibold text-white">Awards</h3>
                <p className="text-sm text-[#64748B]">{selectedPromoForAwards.name}</p>
              </div>
              <button
                onClick={() => { setShowAwardsModal(false); setSelectedPromoForAwards(null); setPromoAwards([]); }}
                className="p-2 hover:bg-[#132240] rounded-lg"
              >
                <X className="w-5 h-5 text-[#64748B]" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {awardsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-[#22D3EE]" />
                </div>
              ) : promoAwards.length === 0 ? (
                <div className="text-center py-8">
                  <Award className="w-12 h-12 text-[#4A5E78] mx-auto mb-3" />
                  <p className="text-[#64748B]">No awards recorded yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {promoAwards.map((award) => (
                    <div key={award.id} className="p-3 bg-[#0D192E] rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-[#22D3EE]/10 flex items-center justify-center">
                            {award.profiles?.avatar_url ? (
                              <img src={award.profiles.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                            ) : (
                              <User className="w-4 h-4 text-[#22D3EE]" />
                            )}
                          </div>
                          <span className="font-medium text-white text-sm">
                            {award.profiles?.display_name || award.player_name || 'Unknown'}
                          </span>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                          award.status === 'approved'
                            ? 'bg-[#10B981]/10 text-[#10B981]'
                            : award.status === 'pending'
                            ? 'bg-[#F59E0B]/10 text-[#F59E0B]'
                            : 'bg-[#4A5E78]/10 text-[#64748B]'
                        }`}>
                          {award.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-[#64748B]">
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
    </>
  );
}
