/**
 * Staff Marketplace Management Page
 * Browse and book freelance dealers and equipment
 * UI: Facebook color scheme, no emojis, Inter font
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  ArrowLeft,
  Users,
  Package,
  Star,
  MapPin,
  Clock,
  DollarSign,
  Calendar,
  Phone,
  Mail,
  CheckCircle,
  Search,
  Filter,
  Loader2,
  X,
  ChevronRight
} from 'lucide-react';

const GAME_TYPES = ['nlhe', 'plo', 'plo8', 'mixed', 'stud', 'razz', 'omaha'];

function BookDealerModal({ isOpen, onClose, dealer, venueId }) {
  const [formData, setFormData] = useState({
    date: '',
    start_time: '18:00',
    hours: 8,
    notes: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit() {
    if (!formData.date) return;

    setSubmitting(true);
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const res = await fetch(`/api/captain/marketplace/dealers/${dealer.id}/book`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          venue_id: venueId,
          date: formData.date,
          start_time: formData.start_time,
          hours: formData.hours,
          notes: formData.notes
        })
      });

      const data = await res.json();
      if (data.success) {
        setSuccess(true);
        setTimeout(() => {
          onClose();
          setSuccess(false);
          setFormData({ date: '', start_time: '18:00', hours: 8, notes: '' });
        }, 2000);
      }
    } catch (error) {
      console.error('Book dealer failed:', error);
    } finally {
      setSubmitting(false);
    }
  }

  if (!isOpen || !dealer) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-[#E5E7EB]">
          <h3 className="text-lg font-semibold text-[#1F2937]">Book Dealer</h3>
          <button onClick={onClose} className="p-2 hover:bg-[#F3F4F6] rounded-lg">
            <X className="w-5 h-5 text-[#6B7280]" />
          </button>
        </div>

        {success ? (
          <div className="p-8 text-center">
            <CheckCircle className="w-12 h-12 text-[#10B981] mx-auto mb-3" />
            <p className="font-semibold text-[#1F2937]">Booking Request Sent</p>
            <p className="text-sm text-[#6B7280]">{dealer.name} will be notified</p>
          </div>
        ) : (
          <>
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-3 p-3 bg-[#F3F4F6] rounded-lg">
                <div className="w-12 h-12 bg-[#1877F2]/10 rounded-full flex items-center justify-center">
                  <Users className="w-6 h-6 text-[#1877F2]" />
                </div>
                <div>
                  <p className="font-semibold text-[#1F2937]">{dealer.name}</p>
                  <p className="text-sm text-[#6B7280]">${dealer.hourly_rate}/hr</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1F2937] mb-2">Date</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full h-11 px-4 border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1877F2]"
                />
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
                  <label className="block text-sm font-medium text-[#1F2937] mb-2">Hours</label>
                  <input
                    type="number"
                    value={formData.hours}
                    onChange={(e) => setFormData(prev => ({ ...prev, hours: parseInt(e.target.value) || 1 }))}
                    min="1"
                    max="12"
                    className="w-full h-11 px-4 border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1877F2]"
                  />
                </div>
              </div>

              <div className="p-3 bg-[#F9FAFB] rounded-lg">
                <div className="flex justify-between text-sm">
                  <span className="text-[#6B7280]">Estimated Cost</span>
                  <span className="font-semibold text-[#1F2937]">
                    ${(dealer.hourly_rate || 25) * formData.hours}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#1F2937] mb-2">Notes (Optional)</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Any special requirements..."
                  rows={2}
                  className="w-full px-4 py-3 border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1877F2] resize-none"
                />
              </div>
            </div>

            <div className="p-4 border-t border-[#E5E7EB]">
              <button
                onClick={handleSubmit}
                disabled={!formData.date || submitting}
                className="w-full h-12 bg-[#1877F2] text-white font-semibold rounded-lg hover:bg-[#1664d9] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Calendar className="w-5 h-5" />}
                Send Booking Request
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function DealerCard({ dealer, onBook }) {
  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-[#1877F2]/10 rounded-full flex items-center justify-center">
            {dealer.profiles?.avatar_url ? (
              <img src={dealer.profiles.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover" />
            ) : (
              <Users className="w-6 h-6 text-[#1877F2]" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-[#1F2937]">{dealer.name}</h3>
              {dealer.verified && (
                <CheckCircle className="w-4 h-4 text-[#10B981]" />
              )}
            </div>
            {dealer.rating && (
              <div className="flex items-center gap-1 text-sm text-[#F59E0B]">
                <Star className="w-4 h-4 fill-current" />
                <span>{dealer.rating.toFixed(1)}</span>
                {dealer.reviews_count && (
                  <span className="text-[#6B7280]">({dealer.reviews_count})</span>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="font-semibold text-[#1F2937]">${dealer.hourly_rate}/hr</p>
          {dealer.experience_years && (
            <p className="text-xs text-[#6B7280]">{dealer.experience_years}+ years</p>
          )}
        </div>
      </div>

      {dealer.bio && (
        <p className="text-sm text-[#6B7280] mb-3 line-clamp-2">{dealer.bio}</p>
      )}

      <div className="flex flex-wrap gap-2 mb-3">
        {(dealer.games_offered || []).slice(0, 4).map((game) => (
          <span
            key={game}
            className="px-2 py-1 bg-[#F3F4F6] rounded text-xs font-medium text-[#1F2937] uppercase"
          >
            {game}
          </span>
        ))}
      </div>

      <div className="flex items-center gap-4 text-sm text-[#6B7280] mb-4">
        {dealer.service_area && (
          <span className="flex items-center gap-1">
            <MapPin className="w-4 h-4" />
            {Array.isArray(dealer.service_area) ? dealer.service_area[0] : dealer.service_area}
          </span>
        )}
        {dealer.available_days && (
          <span className="flex items-center gap-1">
            <Calendar className="w-4 h-4" />
            {Array.isArray(dealer.available_days) ? dealer.available_days.length : 7} days
          </span>
        )}
      </div>

      <button
        onClick={() => onBook(dealer)}
        className="w-full h-10 bg-[#1877F2] text-white font-medium rounded-lg hover:bg-[#1664d9] transition-colors"
      >
        Book Dealer
      </button>
    </div>
  );
}

function EquipmentCard({ equipment, onRent }) {
  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] p-4">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-12 h-12 bg-[#10B981]/10 rounded-lg flex items-center justify-center">
          <Package className="w-6 h-6 text-[#10B981]" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-[#1F2937]">{equipment.name}</h3>
          <p className="text-sm text-[#6B7280]">{equipment.category}</p>
        </div>
        <div className="text-right">
          <p className="font-semibold text-[#1F2937]">${equipment.daily_rate}/day</p>
        </div>
      </div>

      {equipment.description && (
        <p className="text-sm text-[#6B7280] mb-3 line-clamp-2">{equipment.description}</p>
      )}

      <div className="flex items-center gap-4 text-sm text-[#6B7280] mb-4">
        <span className="flex items-center gap-1">
          <MapPin className="w-4 h-4" />
          {equipment.location || 'Local pickup'}
        </span>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
          equipment.available ? 'bg-[#10B981]/10 text-[#10B981]' : 'bg-[#EF4444]/10 text-[#EF4444]'
        }`}>
          {equipment.available ? 'Available' : 'Rented'}
        </span>
      </div>

      <button
        onClick={() => onRent(equipment)}
        disabled={!equipment.available}
        className="w-full h-10 bg-[#10B981] text-white font-medium rounded-lg hover:bg-[#059669] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {equipment.available ? 'Request Rental' : 'Not Available'}
      </button>
    </div>
  );
}

export default function MarketplacePage() {
  const router = useRouter();

  const [staff, setStaff] = useState(null);
  const [venueId, setVenueId] = useState(null);
  const [activeTab, setActiveTab] = useState('dealers');
  const [dealers, setDealers] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDealer, setSelectedDealer] = useState(null);
  const [showBookModal, setShowBookModal] = useState(false);

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

  const fetchDealers = useCallback(async () => {
    try {
      const res = await fetch('/api/captain/marketplace/dealers?limit=50');
      const data = await res.json();
      if (data.success) {
        setDealers(data.data?.dealers || []);
      }
    } catch (error) {
      console.error('Fetch dealers failed:', error);
    }
  }, []);

  const fetchEquipment = useCallback(async () => {
    try {
      const res = await fetch('/api/captain/marketplace/equipment?limit=50');
      const data = await res.json();
      if (data.success) {
        setEquipment(data.data?.equipment || []);
      }
    } catch (error) {
      console.error('Fetch equipment failed:', error);
    }
  }, []);

  useEffect(() => {
    if (venueId) {
      Promise.all([fetchDealers(), fetchEquipment()]).finally(() => setLoading(false));
    }
  }, [venueId, fetchDealers, fetchEquipment]);

  function handleBookDealer(dealer) {
    setSelectedDealer(dealer);
    setShowBookModal(true);
  }

  function handleRentEquipment(item) {
    // For now, just alert - could open a modal similar to book dealer
    alert(`Request to rent "${item.name}" - Feature coming soon!`);
  }

  const filteredDealers = dealers.filter(d =>
    d.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.games_offered?.some(g => g.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const filteredEquipment = equipment.filter(e =>
    e.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.category?.toLowerCase().includes(searchTerm.toLowerCase())
  );

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
        <title>Marketplace | Captain</title>
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
                <h1 className="font-bold text-[#1F2937]">Marketplace</h1>
                <p className="text-sm text-[#6B7280]">
                  {activeTab === 'dealers' ? `${dealers.length} dealers` : `${equipment.length} items`}
                </p>
              </div>
            </div>
          </div>

          <div className="max-w-4xl mx-auto px-4 flex gap-1 border-t border-[#E5E7EB]">
            <button
              onClick={() => setActiveTab('dealers')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'dealers'
                  ? 'border-[#1877F2] text-[#1877F2]'
                  : 'border-transparent text-[#6B7280] hover:text-[#1F2937]'
              }`}
            >
              <Users className="w-4 h-4 inline-block mr-2" />
              Dealers
            </button>
            <button
              onClick={() => setActiveTab('equipment')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'equipment'
                  ? 'border-[#10B981] text-[#10B981]'
                  : 'border-transparent text-[#6B7280] hover:text-[#1F2937]'
              }`}
            >
              <Package className="w-4 h-4 inline-block mr-2" />
              Equipment
            </button>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-4 py-6 space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#6B7280]" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={activeTab === 'dealers' ? 'Search dealers, games...' : 'Search equipment...'}
              className="w-full h-11 pl-10 pr-4 bg-white border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1877F2]"
            />
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-[#1877F2]" />
            </div>
          ) : activeTab === 'dealers' ? (
            filteredDealers.length === 0 ? (
              <div className="bg-white rounded-xl border border-[#E5E7EB] p-8 text-center">
                <Users className="w-12 h-12 text-[#9CA3AF] mx-auto mb-3" />
                <p className="text-[#6B7280]">No dealers found</p>
                <p className="text-sm text-[#9CA3AF] mt-1">Try adjusting your search</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {filteredDealers.map((dealer) => (
                  <DealerCard
                    key={dealer.id}
                    dealer={dealer}
                    onBook={handleBookDealer}
                  />
                ))}
              </div>
            )
          ) : (
            filteredEquipment.length === 0 ? (
              <div className="bg-white rounded-xl border border-[#E5E7EB] p-8 text-center">
                <Package className="w-12 h-12 text-[#9CA3AF] mx-auto mb-3" />
                <p className="text-[#6B7280]">No equipment found</p>
                <p className="text-sm text-[#9CA3AF] mt-1">Try adjusting your search</p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {filteredEquipment.map((item) => (
                  <EquipmentCard
                    key={item.id}
                    equipment={item}
                    onRent={handleRentEquipment}
                  />
                ))}
              </div>
            )
          )}
        </main>
      </div>

      <BookDealerModal
        isOpen={showBookModal}
        onClose={() => {
          setShowBookModal(false);
          setSelectedDealer(null);
        }}
        dealer={selectedDealer}
        venueId={venueId}
      />
    </>
  );
}
