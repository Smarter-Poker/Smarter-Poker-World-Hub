/**
 * Staff Dealer Management Page
 * Manage dealers, rotations, and schedules
 * UI: Facebook color scheme, no emojis, Inter font
 * Per DATABASE_SCHEMA.sql: captain_dealers, captain_dealer_rotations
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  Users,
  Plus,
  Clock,
  ChevronLeft,
  Search,
  Loader2,
  Edit2,
  Trash2,
  RotateCw,
  Calendar,
  Star,
  Check,
  X
} from 'lucide-react';

const GAME_CERTIFICATIONS = [
  { value: 'nlhe', label: 'No Limit Hold\'em' },
  { value: 'plo', label: 'Pot Limit Omaha' },
  { value: 'mixed', label: 'Mixed Games' },
  { value: 'stud', label: 'Stud' },
  { value: 'limit', label: 'Limit Hold\'em' }
];

function DealerCard({ dealer, onEdit, onRotate }) {
  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-[#1877F2]/10 rounded-full flex items-center justify-center">
            <Users className="w-6 h-6 text-[#1877F2]" />
          </div>
          <div>
            <h3 className="font-semibold text-[#1F2937]">{dealer.name}</h3>
            <p className="text-sm text-[#6B7280]">ID: {dealer.employee_id || 'N/A'}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map(level => (
            <Star
              key={level}
              className={`w-4 h-4 ${
                level <= (dealer.skill_level || 3)
                  ? 'text-[#F59E0B] fill-[#F59E0B]'
                  : 'text-[#E5E7EB]'
              }`}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-1 mb-3">
        {(dealer.certified_games || []).map(game => (
          <span
            key={game}
            className="px-2 py-1 bg-[#10B981]/10 text-[#10B981] text-xs font-medium rounded"
          >
            {game.toUpperCase()}
          </span>
        ))}
      </div>

      {dealer.current_table && (
        <div className="bg-[#1877F2]/5 rounded-lg p-2 mb-3">
          <p className="text-sm text-[#1877F2] font-medium">
            Currently at Table {dealer.current_table}
          </p>
          <p className="text-xs text-[#6B7280]">
            Since {new Date(dealer.rotation_started).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => onRotate(dealer)}
          className="flex-1 py-2 bg-[#1877F2] text-white text-sm font-medium rounded-lg hover:bg-[#1665D8] transition-colors flex items-center justify-center gap-1"
        >
          <RotateCw className="w-4 h-4" />
          Rotate
        </button>
        <button
          onClick={() => onEdit(dealer)}
          className="px-4 py-2 border border-[#E5E7EB] text-[#6B7280] rounded-lg hover:bg-[#F3F4F6] transition-colors"
        >
          <Edit2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function AddDealerModal({ onSubmit, onClose, dealer = null }) {
  const [formData, setFormData] = useState({
    name: dealer?.name || '',
    employee_id: dealer?.employee_id || '',
    skill_level: dealer?.skill_level || 3,
    certified_games: dealer?.certified_games || ['nlhe']
  });
  const [loading, setLoading] = useState(false);

  function toggleCertification(game) {
    setFormData(prev => ({
      ...prev,
      certified_games: prev.certified_games.includes(game)
        ? prev.certified_games.filter(g => g !== game)
        : [...prev.certified_games, game]
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!formData.name) return;

    setLoading(true);
    await onSubmit(formData);
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-[#1F2937]">
            {dealer ? 'Edit Dealer' : 'Add Dealer'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[#F3F4F6] rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-[#6B7280]" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#1F2937] mb-2">
              Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Dealer name"
              required
              className="w-full h-12 px-4 border border-[#E5E7EB] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1877F2]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1F2937] mb-2">
              Employee ID
            </label>
            <input
              type="text"
              value={formData.employee_id}
              onChange={(e) => setFormData(prev => ({ ...prev, employee_id: e.target.value }))}
              placeholder="Optional"
              className="w-full h-12 px-4 border border-[#E5E7EB] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1877F2]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1F2937] mb-2">
              Skill Level
            </label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map(level => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, skill_level: level }))}
                  className={`flex-1 py-3 rounded-lg border text-sm font-medium transition-colors ${
                    formData.skill_level === level
                      ? 'border-[#F59E0B] bg-[#F59E0B]/10 text-[#F59E0B]'
                      : 'border-[#E5E7EB] text-[#6B7280]'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1F2937] mb-2">
              Certified Games
            </label>
            <div className="flex flex-wrap gap-2">
              {GAME_CERTIFICATIONS.map(cert => (
                <button
                  key={cert.value}
                  type="button"
                  onClick={() => toggleCertification(cert.value)}
                  className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                    formData.certified_games.includes(cert.value)
                      ? 'border-[#10B981] bg-[#10B981]/10 text-[#10B981]'
                      : 'border-[#E5E7EB] text-[#6B7280]'
                  }`}
                >
                  {cert.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-12 border border-[#E5E7EB] text-[#6B7280] font-semibold rounded-xl hover:bg-[#F3F4F6] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !formData.name}
              className="flex-1 h-12 bg-[#1877F2] text-white font-semibold rounded-xl hover:bg-[#1665D8] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : dealer ? 'Update' : 'Add Dealer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function RotateModal({ dealer, tables, onSubmit, onClose }) {
  const [selectedTable, setSelectedTable] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!selectedTable) return;
    setLoading(true);
    await onSubmit(dealer.id, selectedTable);
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-[#1F2937]">Rotate Dealer</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[#F3F4F6] rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-[#6B7280]" />
          </button>
        </div>

        <div className="mb-4">
          <p className="text-[#6B7280]">Moving: <strong>{dealer.name}</strong></p>
          {dealer.current_table && (
            <p className="text-sm text-[#9CA3AF]">From Table {dealer.current_table}</p>
          )}
        </div>

        <div className="space-y-2 mb-6">
          <label className="block text-sm font-medium text-[#1F2937]">
            Select New Table
          </label>
          {tables.map(table => (
            <button
              key={table.id}
              onClick={() => setSelectedTable(table.id)}
              className={`w-full p-3 rounded-lg border text-left transition-colors ${
                selectedTable === table.id
                  ? 'border-[#1877F2] bg-[#1877F2]/5'
                  : 'border-[#E5E7EB] hover:border-[#1877F2]'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-[#1F2937]">Table {table.table_number}</p>
                  <p className="text-sm text-[#6B7280]">{table.current_game || 'No game'}</p>
                </div>
                {selectedTable === table.id && (
                  <Check className="w-5 h-5 text-[#1877F2]" />
                )}
              </div>
            </button>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 h-12 border border-[#E5E7EB] text-[#6B7280] font-semibold rounded-xl hover:bg-[#F3F4F6] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !selectedTable}
            className="flex-1 h-12 bg-[#1877F2] text-white font-semibold rounded-xl hover:bg-[#1665D8] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Confirm Rotation'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DealersPage() {
  const router = useRouter();

  const [staff, setStaff] = useState(null);
  const [venueId, setVenueId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dealers, setDealers] = useState([]);
  const [tables, setTables] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingDealer, setEditingDealer] = useState(null);
  const [rotatingDealer, setRotatingDealer] = useState(null);

  useEffect(() => {
    const storedStaff = localStorage.getItem('captain_staff');
    if (!storedStaff) {
      router.push('/captain/login');
      return;
    }

    try {
      const staffData = JSON.parse(storedStaff);
      if (!staffData.venue_id) {
        router.push('/captain/login');
        return;
      }
      setStaff(staffData);
      setVenueId(staffData.venue_id);
    } catch {
      router.push('/captain/login');
    }
  }, [router]);

  useEffect(() => {
    if (venueId) {
      fetchDealers();
      fetchTables();
    }
  }, [venueId]);

  async function fetchDealers() {
    setLoading(true);
    try {
      const res = await fetch(`/api/captain/dealers?venue_id=${venueId}`);
      const data = await res.json();
      if (data.success) {
        setDealers(data.data?.dealers || []);
      }
    } catch (err) {
      console.error('Fetch failed:', err);
      // Mock data
      setDealers([
        {
          id: 1,
          name: 'Mike Thompson',
          employee_id: 'D001',
          skill_level: 5,
          certified_games: ['nlhe', 'plo', 'mixed'],
          current_table: 3,
          rotation_started: new Date(Date.now() - 25 * 60000).toISOString()
        },
        {
          id: 2,
          name: 'Sarah Johnson',
          employee_id: 'D002',
          skill_level: 4,
          certified_games: ['nlhe', 'plo'],
          current_table: 1,
          rotation_started: new Date(Date.now() - 15 * 60000).toISOString()
        },
        {
          id: 3,
          name: 'Tom Williams',
          employee_id: 'D003',
          skill_level: 3,
          certified_games: ['nlhe'],
          current_table: null,
          rotation_started: null
        }
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function fetchTables() {
    try {
      const res = await fetch(`/api/captain/tables?venue_id=${venueId}`);
      const data = await res.json();
      if (data.success) {
        setTables(data.data?.tables || []);
      }
    } catch (err) {
      // Mock data
      setTables([
        { id: 1, table_number: 1, current_game: '1/3 NLH' },
        { id: 2, table_number: 2, current_game: '1/3 NLH' },
        { id: 3, table_number: 3, current_game: '2/5 NLH' },
        { id: 4, table_number: 4, current_game: null },
        { id: 5, table_number: 5, current_game: '1/2 PLO' }
      ]);
    }
  }

  async function handleAddDealer(data) {
    try {
      const res = await fetch('/api/captain/dealers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venue_id: venueId, ...data })
      });
      const result = await res.json();
      if (result.success) {
        setShowAddModal(false);
        fetchDealers();
      }
    } catch (err) {
      // Mock success
      setDealers(prev => [...prev, { id: Date.now(), ...data }]);
      setShowAddModal(false);
    }
  }

  async function handleEditDealer(data) {
    try {
      await fetch(`/api/captain/dealers/${editingDealer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      setEditingDealer(null);
      fetchDealers();
    } catch (err) {
      // Mock success
      setDealers(prev => prev.map(d => d.id === editingDealer.id ? { ...d, ...data } : d));
      setEditingDealer(null);
    }
  }

  async function handleRotate(dealerId, tableId) {
    try {
      await fetch('/api/captain/dealers/rotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealer_id: dealerId, table_id: tableId, venue_id: venueId })
      });
      setRotatingDealer(null);
      fetchDealers();
    } catch (err) {
      // Mock success
      const table = tables.find(t => t.id === tableId);
      setDealers(prev => prev.map(d =>
        d.id === dealerId
          ? { ...d, current_table: table?.table_number, rotation_started: new Date().toISOString() }
          : d
      ));
      setRotatingDealer(null);
    }
  }

  const filteredDealers = dealers.filter(d =>
    d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.employee_id?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activeDealers = filteredDealers.filter(d => d.current_table);
  const availableDealers = filteredDealers.filter(d => !d.current_table);

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
        <title>Dealers | Smarter Captain</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="min-h-screen bg-[#F9FAFB]">
        {/* Header */}
        <header className="bg-white border-b border-[#E5E7EB] sticky top-0 z-40">
          <div className="max-w-4xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => router.push('/captain/dashboard')}
                  className="p-2 hover:bg-[#F3F4F6] rounded-lg transition-colors"
                >
                  <ChevronLeft className="w-5 h-5 text-[#6B7280]" />
                </button>
                <div>
                  <h1 className="text-xl font-bold text-[#1F2937] flex items-center gap-2">
                    <Users className="w-6 h-6 text-[#1877F2]" />
                    Dealer Management
                  </h1>
                  <p className="text-sm text-[#6B7280]">
                    {activeDealers.length} active, {availableDealers.length} available
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-[#1877F2] text-white rounded-lg hover:bg-[#1665D8] transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Dealer
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#9CA3AF]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search dealers..."
              className="w-full h-12 pl-12 pr-4 border border-[#E5E7EB] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1877F2]"
            />
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-[#1877F2]" />
            </div>
          ) : (
            <>
              {/* Active Dealers */}
              {activeDealers.length > 0 && (
                <section>
                  <h2 className="font-semibold text-[#1F2937] mb-3 flex items-center gap-2">
                    <Clock className="w-5 h-5 text-[#10B981]" />
                    On Tables ({activeDealers.length})
                  </h2>
                  <div className="grid md:grid-cols-2 gap-4">
                    {activeDealers.map(dealer => (
                      <DealerCard
                        key={dealer.id}
                        dealer={dealer}
                        onEdit={setEditingDealer}
                        onRotate={setRotatingDealer}
                      />
                    ))}
                  </div>
                </section>
              )}

              {/* Available Dealers */}
              {availableDealers.length > 0 && (
                <section>
                  <h2 className="font-semibold text-[#1F2937] mb-3">
                    Available ({availableDealers.length})
                  </h2>
                  <div className="grid md:grid-cols-2 gap-4">
                    {availableDealers.map(dealer => (
                      <DealerCard
                        key={dealer.id}
                        dealer={dealer}
                        onEdit={setEditingDealer}
                        onRotate={setRotatingDealer}
                      />
                    ))}
                  </div>
                </section>
              )}

              {filteredDealers.length === 0 && (
                <div className="bg-white rounded-xl border border-[#E5E7EB] p-8 text-center">
                  <Users className="w-12 h-12 text-[#9CA3AF] mx-auto mb-3" />
                  <p className="text-[#6B7280]">No dealers found</p>
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="mt-4 px-6 py-2 bg-[#1877F2] text-white rounded-lg font-medium hover:bg-[#1665D8] transition-colors"
                  >
                    Add First Dealer
                  </button>
                </div>
              )}
            </>
          )}
        </main>

        {/* Modals */}
        {showAddModal && (
          <AddDealerModal
            onSubmit={handleAddDealer}
            onClose={() => setShowAddModal(false)}
          />
        )}

        {editingDealer && (
          <AddDealerModal
            dealer={editingDealer}
            onSubmit={handleEditDealer}
            onClose={() => setEditingDealer(null)}
          />
        )}

        {rotatingDealer && (
          <RotateModal
            dealer={rotatingDealer}
            tables={tables.filter(t => t.current_game)}
            onSubmit={handleRotate}
            onClose={() => setRotatingDealer(null)}
          />
        )}
      </div>
    </>
  );
}
