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
  X,
  History,
  ArrowRight,
  Timer,
  AlertCircle
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
  const [rotations, setRotations] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingDealer, setEditingDealer] = useState(null);
  const [rotatingDealer, setRotatingDealer] = useState(null);
  const [activeTab, setActiveTab] = useState('dealers');

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
      fetchRotations();
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
      console.error('Fetch dealers failed:', err);
      setDealers([]);
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
      console.error('Fetch tables failed:', err);
      setTables([]);
    }
  }

  async function fetchRotations() {
    try {
      const staffSession = localStorage.getItem('captain_staff');
      const res = await fetch(`/api/captain/dealers/rotations?venue_id=${venueId}&limit=50`, {
        headers: { 'x-staff-session': staffSession }
      });
      const data = await res.json();
      if (data.success) {
        setRotations(data.data?.rotations || []);
      }
    } catch (err) {
      console.error('Fetch rotations failed:', err);
      setRotations([]);
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
      console.error('Add dealer failed:', err);
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
      console.error('Edit dealer failed:', err);
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
      console.error('Rotate dealer failed:', err);
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
              {activeTab === 'dealers' && (
                <button
                  onClick={() => setShowAddModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-[#1877F2] text-white rounded-lg hover:bg-[#1665D8] transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Dealer
                </button>
              )}
            </div>
          </div>

          {/* Tabs */}
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
              onClick={() => setActiveTab('rotations')}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'rotations'
                  ? 'border-[#10B981] text-[#10B981]'
                  : 'border-transparent text-[#6B7280] hover:text-[#1F2937]'
              }`}
            >
              <History className="w-4 h-4 inline-block mr-2" />
              Rotation History
            </button>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
          {activeTab === 'dealers' ? (
            <>
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
            </>
          ) : (
            <>
              {/* Rotation History */}
              <div className="bg-white rounded-xl border border-[#E5E7EB]">
                <div className="p-4 border-b border-[#E5E7EB] flex items-center justify-between">
                  <h2 className="font-semibold text-[#1F2937]">Recent Rotations</h2>
                  <span className="text-sm text-[#6B7280]">{rotations.length} total</span>
                </div>

                {rotations.length === 0 ? (
                  <div className="p-8 text-center">
                    <RotateCw className="w-12 h-12 text-[#9CA3AF] mx-auto mb-3" />
                    <p className="text-[#6B7280]">No rotation history yet</p>
                    <p className="text-sm text-[#9CA3AF] mt-1">
                      Rotations will appear here when dealers are moved between tables
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-[#E5E7EB]">
                    {rotations.map((rotation) => {
                      const dealer = dealers.find(d => d.id === rotation.dealer_id);
                      const fromTable = tables.find(t => t.id === rotation.from_table_id);
                      const toTable = tables.find(t => t.id === rotation.to_table_id);

                      return (
                        <div key={rotation.id} className="p-4 flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-[#10B981]/10 flex items-center justify-center">
                            <RotateCw className="w-5 h-5 text-[#10B981]" />
                          </div>

                          <div className="flex-1">
                            <p className="font-medium text-[#1F2937]">
                              {dealer?.name || rotation.dealer_name || 'Unknown Dealer'}
                            </p>
                            <div className="flex items-center gap-2 text-sm text-[#6B7280]">
                              <span>
                                {fromTable ? `Table ${fromTable.table_number}` : rotation.from_table_id ? 'Previous Table' : 'Off'}
                              </span>
                              <ArrowRight className="w-4 h-4" />
                              <span>
                                {toTable ? `Table ${toTable.table_number}` : rotation.to_table_id ? 'New Table' : 'Off'}
                              </span>
                            </div>
                          </div>

                          <div className="text-right">
                            <p className="text-sm text-[#1F2937]">
                              {new Date(rotation.rotated_at || rotation.created_at).toLocaleTimeString('en-US', {
                                hour: 'numeric',
                                minute: '2-digit'
                              })}
                            </p>
                            <p className="text-xs text-[#6B7280]">
                              {new Date(rotation.rotated_at || rotation.created_at).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Rotation Tips */}
              <div className="bg-[#EFF6FF] rounded-xl p-4 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-[#1877F2] flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-[#1E40AF]">Rotation Best Practices</p>
                  <ul className="text-sm text-[#1E3A8A] mt-1 space-y-1">
                    <li>Rotate dealers every 30 minutes to keep games fresh</li>
                    <li>Match dealer certifications to game types</li>
                    <li>Track down-time to ensure fair distribution</li>
                  </ul>
                </div>
              </div>
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
