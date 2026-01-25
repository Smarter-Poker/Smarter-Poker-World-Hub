/**
 * Staff Promotions Management Page
 * Create and manage venue promotions (bad beat, high hand, etc.)
 * UI: Facebook color scheme, no emojis, Inter font
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
  Check
} from 'lucide-react';

const PROMO_TYPES = [
  { value: 'high_hand', label: 'High Hand', icon: Trophy, color: '#F59E0B' },
  { value: 'bad_beat', label: 'Bad Beat Jackpot', icon: Zap, color: '#EF4444' },
  { value: 'splash_pot', label: 'Splash Pot', icon: DollarSign, color: '#10B981' },
  { value: 'hourly_drawing', label: 'Hourly Drawing', icon: Clock, color: '#8B5CF6' },
  { value: 'bonus', label: 'Player Bonus', icon: Gift, color: '#1877F2' },
  { value: 'tournament', label: 'Tournament Promo', icon: Target, color: '#EC4899' }
];

function CreatePromoModal({ isOpen, onClose, onSubmit, venueId }) {
  const [formData, setFormData] = useState({
    name: '',
    promo_type: 'high_hand',
    description: '',
    prize_amount: 500,
    frequency: 'hourly',
    start_time: '10:00',
    end_time: '02:00',
    days_active: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
    requirements: ''
  });
  const [submitting, setSubmitting] = useState(false);

  const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

  function toggleDay(day) {
    setFormData(prev => ({
      ...prev,
      days_active: prev.days_active.includes(day)
        ? prev.days_active.filter(d => d !== day)
        : [...prev.days_active, day]
    }));
  }

  async function handleSubmit() {
    if (!formData.name.trim()) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/captain/promotions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          venue_id: venueId
        })
      });

      const data = await res.json();
      if (data.success) {
        onSubmit?.(data.data?.promotion);
        onClose();
        setFormData({
          name: '',
          promo_type: 'high_hand',
          description: '',
          prize_amount: 500,
          frequency: 'hourly',
          start_time: '10:00',
          end_time: '02:00',
          days_active: DAYS,
          requirements: ''
        });
      }
    } catch (error) {
      console.error('Create promo failed:', error);
    } finally {
      setSubmitting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-[#E5E7EB]">
          <h3 className="text-lg font-semibold text-[#1F2937]">Create Promotion</h3>
          <button onClick={onClose} className="p-2 hover:bg-[#F3F4F6] rounded-lg">
            <X className="w-5 h-5 text-[#6B7280]" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#1F2937] mb-2">Promotion Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g., High Hand Bonus"
              className="w-full h-11 px-4 border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1877F2]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1F2937] mb-2">Type</label>
            <div className="grid grid-cols-3 gap-2">
              {PROMO_TYPES.map(({ value, label, icon: Icon, color }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, promo_type: value }))}
                  className={`p-3 rounded-lg border text-center transition-colors ${
                    formData.promo_type === value
                      ? 'border-[#1877F2] bg-[#1877F2]/5'
                      : 'border-[#E5E7EB] hover:bg-[#F3F4F6]'
                  }`}
                >
                  <Icon className="w-5 h-5 mx-auto mb-1" style={{ color }} />
                  <span className="text-xs font-medium text-[#1F2937]">{label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1F2937] mb-2">Prize Amount</label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#6B7280]" />
              <input
                type="number"
                value={formData.prize_amount}
                onChange={(e) => setFormData(prev => ({ ...prev, prize_amount: parseInt(e.target.value) || 0 }))}
                className="w-full h-11 pl-10 pr-4 border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1877F2]"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1F2937] mb-2">Frequency</label>
            <div className="flex gap-2">
              {['hourly', 'daily', 'weekly', 'once'].map((freq) => (
                <button
                  key={freq}
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, frequency: freq }))}
                  className={`flex-1 h-10 rounded-lg border font-medium text-sm capitalize transition-colors ${
                    formData.frequency === freq
                      ? 'border-[#1877F2] bg-[#1877F2] text-white'
                      : 'border-[#E5E7EB] text-[#1F2937] hover:bg-[#F3F4F6]'
                  }`}
                >
                  {freq}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-[#1F2937] mb-2">Start Time</label>
              <input
                type="time"
                value={formData.start_time}
                onChange={(e) => setFormData(prev => ({ ...prev, start_time: e.target.value }))}
                className="w-full h-11 px-4 border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1877F2]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1F2937] mb-2">End Time</label>
              <input
                type="time"
                value={formData.end_time}
                onChange={(e) => setFormData(prev => ({ ...prev, end_time: e.target.value }))}
                className="w-full h-11 px-4 border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1877F2]"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1F2937] mb-2">Active Days</label>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${
                    formData.days_active.includes(day)
                      ? 'bg-[#1877F2] text-white'
                      : 'bg-[#F3F4F6] text-[#6B7280] hover:bg-[#E5E7EB]'
                  }`}
                >
                  {day.slice(0, 3)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1F2937] mb-2">Description</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Promotion details and rules..."
              rows={2}
              className="w-full px-4 py-3 border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1877F2] resize-none"
            />
          </div>
        </div>

        <div className="p-4 border-t border-[#E5E7EB]">
          <button
            onClick={handleSubmit}
            disabled={!formData.name.trim() || submitting}
            className="w-full h-12 bg-[#1877F2] text-white font-semibold rounded-lg hover:bg-[#1664d9] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Gift className="w-5 h-5" />}
            Create Promotion
          </button>
        </div>
      </div>
    </div>
  );
}

function PromoCard({ promo, onToggle, onEdit, onDelete }) {
  const typeConfig = PROMO_TYPES.find(t => t.value === promo.promo_type) || PROMO_TYPES[0];
  const Icon = typeConfig.icon;

  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${typeConfig.color}20` }}
          >
            <Icon className="w-5 h-5" style={{ color: typeConfig.color }} />
          </div>
          <div>
            <h3 className="font-semibold text-[#1F2937]">{promo.name}</h3>
            <p className="text-sm text-[#6B7280]">{typeConfig.label}</p>
          </div>
        </div>

        <button
          onClick={() => onToggle?.(promo)}
          className={`p-1 rounded transition-colors ${promo.is_active ? 'text-[#10B981]' : 'text-[#9CA3AF]'}`}
        >
          {promo.is_active ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8" />}
        </button>
      </div>

      <div className="flex items-center gap-4 text-sm text-[#6B7280] mb-3">
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
        <p className="text-sm text-[#6B7280] mb-3 line-clamp-2">{promo.description}</p>
      )}

      <div className="flex gap-2 pt-3 border-t border-[#E5E7EB]">
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
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    const storedStaff = localStorage.getItem('captain_staff');
    if (!storedStaff) {
      router.push('/captain/login');
      return;
    }
    try {
      const staffData = JSON.parse(storedStaff);
      setStaff(staffData);
      setVenueId(staffData.venue_id);
    } catch (err) {
      router.push('/captain/login');
    }
  }, [router]);

  const fetchPromotions = useCallback(async () => {
    if (!venueId) return;
    try {
      const res = await fetch(`/api/captain/promotions?venue_id=${venueId}`);
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

  useEffect(() => {
    if (venueId) fetchPromotions();
  }, [venueId, fetchPromotions]);

  async function handleToggle(promo) {
    try {
      await fetch(`/api/captain/promotions/${promo.id}`, {
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
      await fetch(`/api/captain/promotions/${promo.id}`, { method: 'DELETE' });
      fetchPromotions();
    } catch (error) {
      console.error('Delete failed:', error);
    }
  }

  const filteredPromos = promotions.filter(p => {
    if (filter === 'active') return p.is_active;
    if (filter === 'inactive') return !p.is_active;
    return true;
  });

  if (!staff) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#1877F2]" />
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Promotions | Captain</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="min-h-screen bg-[#F9FAFB]">
        <header className="bg-white border-b border-[#E5E7EB] sticky top-0 z-40">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/captain/dashboard')}
                className="p-2 hover:bg-[#F3F4F6] rounded-lg"
              >
                <ArrowLeft className="w-5 h-5 text-[#6B7280]" />
              </button>
              <div>
                <h1 className="font-bold text-[#1F2937]">Promotions</h1>
                <p className="text-sm text-[#6B7280]">{promotions.length} promotions</p>
              </div>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-[#1877F2] text-white font-medium rounded-lg hover:bg-[#1664d9]"
            >
              <Plus className="w-4 h-4" />
              New Promo
            </button>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-4 py-6 space-y-4">
          <div className="flex gap-2">
            {['all', 'active', 'inactive'].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                  filter === f
                    ? 'bg-[#1877F2] text-white'
                    : 'bg-white border border-[#E5E7EB] text-[#1F2937] hover:bg-[#F3F4F6]'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-[#1877F2]" />
            </div>
          ) : filteredPromos.length === 0 ? (
            <div className="bg-white rounded-xl border border-[#E5E7EB] p-8 text-center">
              <Gift className="w-12 h-12 text-[#9CA3AF] mx-auto mb-3" />
              <p className="text-[#6B7280]">No promotions found</p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="mt-4 px-4 py-2 bg-[#1877F2] text-white font-medium rounded-lg"
              >
                Create Promotion
              </button>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {filteredPromos.map((promo) => (
                <PromoCard
                  key={promo.id}
                  promo={promo}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      <CreatePromoModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={() => fetchPromotions()}
        venueId={venueId}
      />
    </>
  );
}
