/**
 * Captain Table Management Page
 * UI: Facebook color scheme, no emojis, Inter font
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { ArrowLeft, Plus, Edit2, Trash2, Table2, Users, Loader2 } from 'lucide-react';

export default function CaptainTablesPage() {
  const router = useRouter();

  const [staff, setStaff] = useState(null);
  const [venueId, setVenueId] = useState(null);
  const [venue, setVenue] = useState(null);
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTable, setEditingTable] = useState(null);

  // Check staff session
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
      if (staffData.venue_name) {
        setVenue({ id: staffData.venue_id, name: staffData.venue_name });
      }
    } catch (err) {
      router.push('/captain/login');
    }
  }, [router]);

  // Fetch tables
  const fetchTables = useCallback(async () => {
    if (!venueId) return;
    try {
      const res = await fetch(`/api/captain/tables/venue/${venueId}`);
      const data = await res.json();
      if (data.success) {
        setTables(data.data.tables || []);
      }
    } catch (err) {
      console.error('Failed to fetch tables:', err);
    } finally {
      setLoading(false);
    }
  }, [venueId]);

  useEffect(() => {
    if (venueId) fetchTables();
  }, [venueId, fetchTables]);

  // Add table
  async function handleAddTable(tableData) {
    try {
      const res = await fetch('/api/captain/tables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...tableData, venue_id: venueId })
      });
      const data = await res.json();
      if (data.success) {
        fetchTables();
        setShowAddModal(false);
      }
    } catch (err) {
      console.error('Failed to add table:', err);
    }
  }

  // Update table
  async function handleUpdateTable(tableId, tableData) {
    try {
      const res = await fetch(`/api/captain/tables/${tableId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tableData)
      });
      const data = await res.json();
      if (data.success) {
        fetchTables();
        setEditingTable(null);
      }
    } catch (err) {
      console.error('Failed to update table:', err);
    }
  }

  // Delete table
  async function handleDeleteTable(tableId) {
    if (!window.confirm('Delete this table?')) return;
    try {
      const res = await fetch(`/api/captain/tables/${tableId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        fetchTables();
      }
    } catch (err) {
      console.error('Failed to delete table:', err);
    }
  }

  if (!staff || loading) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#1877F2]" />
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Tables | {venue?.name || 'Captain'}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="min-h-screen bg-[#F9FAFB]">
        {/* Header */}
        <header className="bg-white border-b border-[#E5E7EB] sticky top-0 z-50">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/captain/dashboard')}
                className="p-2 hover:bg-[#F3F4F6] rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-[#6B7280]" />
              </button>
              <div>
                <h1 className="font-bold text-[#1F2937] text-lg">Table Management</h1>
                <p className="text-sm text-[#6B7280]">{venue?.name}</p>
              </div>
            </div>

            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-[#1877F2] text-white font-medium rounded-lg hover:bg-[#1664d9] transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Table
            </button>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-4xl mx-auto px-4 py-6">
          {tables.length === 0 ? (
            <div className="bg-white rounded-xl border border-[#E5E7EB] p-8 text-center">
              <Table2 className="w-12 h-12 text-[#9CA3AF] mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-[#1F2937] mb-2">No Tables Yet</h2>
              <p className="text-[#6B7280] mb-4">Add tables to start managing your poker room</p>
              <button
                onClick={() => setShowAddModal(true)}
                className="px-4 py-2 bg-[#1877F2] text-white font-medium rounded-lg hover:bg-[#1664d9] transition-colors"
              >
                Add First Table
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {tables.map((table) => (
                <div
                  key={table.id}
                  className="bg-white rounded-xl border border-[#E5E7EB] p-4"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-[#1F2937]">
                        {table.table_name || `Table ${table.table_number}`}
                      </h3>
                      <p className="text-sm text-[#6B7280]">
                        {table.max_seats} seats
                      </p>
                    </div>
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      table.status === 'available'
                        ? 'bg-[#D1FAE5] text-[#059669]'
                        : table.status === 'in_use'
                        ? 'bg-[#DBEAFE] text-[#2563EB]'
                        : 'bg-[#FEF3C7] text-[#D97706]'
                    }`}>
                      {table.status}
                    </span>
                  </div>

                  {table.current_game_id && (
                    <div className="mb-3 p-2 bg-[#F3F4F6] rounded-lg">
                      <div className="flex items-center gap-2 text-sm text-[#6B7280]">
                        <Users className="w-4 h-4" />
                        <span>Game in progress</span>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={() => setEditingTable(table)}
                      className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-sm font-medium text-[#6B7280] hover:bg-[#F3F4F6] rounded-lg transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteTable(table.id)}
                      disabled={table.status === 'in_use'}
                      className="flex items-center justify-center gap-1 px-3 py-2 text-sm font-medium text-[#EF4444] hover:bg-[#FEF2F2] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      {/* Add/Edit Modal */}
      {(showAddModal || editingTable) && (
        <TableModal
          table={editingTable}
          onClose={() => {
            setShowAddModal(false);
            setEditingTable(null);
          }}
          onSubmit={(data) => {
            if (editingTable) {
              handleUpdateTable(editingTable.id, data);
            } else {
              handleAddTable(data);
            }
          }}
        />
      )}
    </>
  );
}

function TableModal({ table, onClose, onSubmit }) {
  const [tableNumber, setTableNumber] = useState(table?.table_number || '');
  const [tableName, setTableName] = useState(table?.table_name || '');
  const [maxSeats, setMaxSeats] = useState(table?.max_seats || 9);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    await onSubmit({
      table_number: parseInt(tableNumber),
      table_name: tableName || null,
      max_seats: maxSeats
    });
    setSubmitting(false);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-md">
        <div className="p-4 border-b border-[#E5E7EB]">
          <h2 className="text-lg font-semibold text-[#1F2937]">
            {table ? 'Edit Table' : 'Add Table'}
          </h2>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#1F2937] mb-1">
              Table Number
            </label>
            <input
              type="number"
              value={tableNumber}
              onChange={(e) => setTableNumber(e.target.value)}
              className="w-full h-12 px-3 border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1877F2]"
              required
              min="1"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1F2937] mb-1">
              Table Name (Optional)
            </label>
            <input
              type="text"
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
              placeholder="e.g., Feature Table"
              className="w-full h-12 px-3 border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1877F2]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#1F2937] mb-1">
              Max Seats
            </label>
            <div className="flex gap-2">
              {[6, 8, 9, 10].map((num) => (
                <button
                  key={num}
                  type="button"
                  onClick={() => setMaxSeats(num)}
                  className={`flex-1 h-10 rounded-lg text-sm font-medium transition-colors ${
                    maxSeats === num
                      ? 'bg-[#1877F2] text-white'
                      : 'bg-[#F3F4F6] text-[#1F2937] hover:bg-[#E5E7EB]'
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-12 border border-[#E5E7EB] text-[#6B7280] font-medium rounded-lg hover:bg-[#F3F4F6] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 h-12 bg-[#1877F2] text-white font-semibold rounded-lg hover:bg-[#1664d9] transition-colors disabled:opacity-50"
            >
              {submitting ? 'Saving...' : table ? 'Update' : 'Add Table'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
