/**
 * Commander Staff Management Page
 * Dark industrial sci-fi gaming theme
 */
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { ArrowLeft, Plus, Edit2, Trash2, User, Loader2, X, Eye, EyeOff } from 'lucide-react';

const ROLES = [
  { value: 'owner', label: 'Owner', color: 'bg-[#7C3AED] text-white' },
  { value: 'manager', label: 'Manager', color: 'bg-[#2563EB] text-white' },
  { value: 'floor', label: 'Floor', color: 'bg-[#059669] text-white' },
  { value: 'brush', label: 'Brush', color: 'bg-[#D97706] text-white' },
  { value: 'dealer', label: 'Dealer', color: 'bg-[#6B7280] text-white' }
];

export default function CommanderStaffPage() {
  const router = useRouter();

  const [currentStaff, setCurrentStaff] = useState(null);
  const [venueId, setVenueId] = useState(null);
  const [venue, setVenue] = useState(null);
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState(null);
  const [revealedPinId, setRevealedPinId] = useState(null);

  // Check staff session
  useEffect(() => {
    const storedStaff = localStorage.getItem('commander_staff');
    if (!storedStaff) {
      router.push('/commander/login');
      return;
    }

    try {
      const staffData = JSON.parse(storedStaff);
      if (!staffData.venue_id) {
        router.push('/commander/login');
        return;
      }
      setCurrentStaff(staffData);
      setVenueId(staffData.venue_id);
      if (staffData.venue_name) {
        setVenue({ id: staffData.venue_id, name: staffData.venue_name });
      }
    } catch (err) {
      router.push('/commander/login');
    }
  }, [router]);

  // Fetch staff
  const fetchStaff = useCallback(async () => {
    if (!venueId) return;
    try {
      const res = await fetch(`/api/commander/staff/venue/${venueId}`);
      const data = await res.json();
      if (data.success) {
        setStaffList(data.data.staff || []);
      }
    } catch (err) {
      console.error('Failed to fetch staff:', err);
    } finally {
      setLoading(false);
    }
  }, [venueId]);

  useEffect(() => {
    if (venueId) fetchStaff();
  }, [venueId, fetchStaff]);

  // Add staff
  async function handleAddStaff(staffData) {
    try {
      const res = await fetch('/api/commander/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...staffData, venue_id: venueId })
      });
      const data = await res.json();
      if (data.success) {
        fetchStaff();
        setShowAddModal(false);
      }
    } catch (err) {
      console.error('Failed to add staff:', err);
    }
  }

  // Update staff
  async function handleUpdateStaff(staffId, staffData) {
    try {
      const res = await fetch(`/api/commander/staff/${staffId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(staffData)
      });
      const data = await res.json();
      if (data.success) {
        fetchStaff();
        setEditingStaff(null);
      }
    } catch (err) {
      console.error('Failed to update staff:', err);
    }
  }

  // Delete staff
  async function handleDeleteStaff(staffId) {
    if (!window.confirm('Remove this staff member?')) return;
    try {
      const res = await fetch(`/api/commander/staff/${staffId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        fetchStaff();
      }
    } catch (err) {
      console.error('Failed to delete staff:', err);
    }
  }

  // Check permissions
  const canManageStaff = currentStaff?.permissions?.manage_staff !== false;

  if (!currentStaff || loading) {
    return (
      <div className="cmd-page flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#1877F2]" />
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Staff | {venue?.name || 'Commander'}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="cmd-page">
        {/* Header */}
        <header className="cmd-header-bar sticky top-0 z-50">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/commander/dashboard')}
                className="cmd-back-btn"
              >
                <ArrowLeft size={16} /> Back
              </button>
              <div>
                <h1 className="font-bold text-white text-lg">Staff Management</h1>
                <p className="text-sm text-[#B0B3B8]">{venue?.name}</p>
              </div>
            </div>

            {canManageStaff && (
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-2 px-4 py-2 cmd-btn cmd-btn-primary"
              >
                <Plus className="w-4 h-4" />
                Add Staff
              </button>
            )}
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-4xl mx-auto px-4 py-6">
          {!canManageStaff && (
            <div className="mb-6 p-4 bg-[#F59E0B]/10 rounded-xl">
              <p className="text-sm text-[#F59E0B]">
                You don't have permission to manage staff.
              </p>
            </div>
          )}

          {staffList.length === 0 ? (
            <div className="cmd-panel p-8 text-center">
              <User className="w-12 h-12 text-[#3A3B3C] mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-white mb-2">No Staff Yet</h2>
              <p className="text-[#B0B3B8] mb-4">Add staff members to manage your venue</p>
              {canManageStaff && (
                <button
                  onClick={() => setShowAddModal(true)}
                  className="px-4 py-2 cmd-btn cmd-btn-primary"
                >
                  Add First Staff Member
                </button>
              )}
            </div>
          ) : (
            <div className="cmd-panel divide-y divide-[#3A3B3C]">
              {staffList.map((staff) => {
                const role = ROLES.find(r => r.value === staff.role) || ROLES[4];
                return (
                  <div
                    key={staff.id}
                    className="p-4 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-[#3A3B3C] rounded-full flex items-center justify-center">
                        <User className="w-6 h-6 text-[#B0B3B8]" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-white">
                          {staff.profiles?.display_name || staff.display_name || 'Staff Member'}
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${role.color}`}>
                            {role.label}
                          </span>
                          {staff.pin_code && (() => {
                            const isAdmin = currentStaff?.role === 'owner' || currentStaff?.role === 'manager';
                            const isSelf = staff.id === currentStaff?.id;
                            const canReveal = isAdmin || isSelf;
                            const isRevealed = revealedPinId === staff.id;
                            return (
                              <span className="inline-flex items-center gap-1 text-xs text-[#B0B3B8]">
                                PIN: {isRevealed ? staff.pin_code : '****'}
                                {canReveal && (
                                  <button
                                    type="button"
                                    onClick={() => setRevealedPinId(isRevealed ? null : staff.id)}
                                    className="p-0.5 hover:text-[#1877F2] transition-colors"
                                    title={isRevealed ? 'Hide PIN' : 'Show PIN'}
                                  >
                                    {isRevealed
                                      ? <EyeOff className="w-3.5 h-3.5" />
                                      : <Eye className="w-3.5 h-3.5" />
                                    }
                                  </button>
                                )}
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                    </div>

                    {canManageStaff && staff.id !== currentStaff.id && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => setEditingStaff(staff)}
                          className="p-2 text-[#B0B3B8] hover:bg-[#3A3B3C] rounded-lg transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteStaff(staff.id)}
                          className="p-2 text-[#EF4444] hover:bg-[#EF4444]/10 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {/* Add/Edit Modal */}
      {(showAddModal || editingStaff) && (
        <StaffModal
          staff={editingStaff}
          onClose={() => {
            setShowAddModal(false);
            setEditingStaff(null);
          }}
          onSubmit={(data) => {
            if (editingStaff) {
              handleUpdateStaff(editingStaff.id, data);
            } else {
              handleAddStaff(data);
            }
          }}
        />
      )}
      <style jsx>{`
        .cmd-back-btn {
          background: none;
          border: 1px solid #444;
          border-radius: 10px;
          padding: 8px 14px;
          color: #ccc;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          font-weight: 600;
          transition: all 0.2s;
        }
        .cmd-back-btn:hover {
          border-color: #666;
          color: #fff;
        }
      `}</style>
    </>
  );
}

function StaffModal({ staff, onClose, onSubmit }) {
  const [displayName, setDisplayName] = useState(staff?.display_name || staff?.profiles?.display_name || '');
  const [email, setEmail] = useState(staff?.email || '');
  const [phone, setPhone] = useState(staff?.phone || '');
  const [role, setRole] = useState(staff?.role || 'floor');
  const [pinCode, setPinCode] = useState(staff?.pin_code || '');
  const [isActive, setIsActive] = useState(staff?.is_active !== false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const isEditing = !!staff;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!isEditing && !displayName.trim()) {
      setError('Employee name is required');
      return;
    }
    setSubmitting(true);
    await onSubmit({
      display_name: displayName.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      role,
      pin_code: pinCode || null,
      is_active: isActive
    });
    setSubmitting(false);
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="cmd-panel cmd-corner-lights w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-[#3A3B3C]">
          <h2 className="text-lg font-semibold text-white">
            {isEditing ? 'Edit Staff' : 'Add Employee'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[#3A3B3C] rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-[#B0B3B8]" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="p-3 bg-[#EF4444]/10 border border-[#EF4444]/30 rounded-lg text-sm text-[#EF4444]">{error}</div>
          )}

          {/* Employee Name */}
          <div>
            <label className="block text-sm font-medium text-white mb-1">
              Employee Name *
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g., John Smith"
              className="w-full h-12 px-3 cmd-input"
              required
              autoFocus={!isEditing}
            />
          </div>

          {/* Email (optional) */}
          <div>
            <label className="block text-sm font-medium text-white mb-1">
              Email <span className="text-[#6A6B6D]">(optional)</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="john@example.com"
              className="w-full h-12 px-3 cmd-input"
            />
          </div>

          {/* Phone (optional) */}
          <div>
            <label className="block text-sm font-medium text-white mb-1">
              Phone <span className="text-[#6A6B6D]">(optional)</span>
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(555) 123-4567"
              className="w-full h-12 px-3 cmd-input"
            />
          </div>

          {/* Role */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Role
            </label>
            <div className="grid grid-cols-2 gap-2">
              {ROLES.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setRole(r.value)}
                  className={`p-3 rounded-lg text-sm font-medium transition-colors ${
                    role === r.value
                      ? 'bg-[#1877F2] text-white'
                      : 'bg-[#3A3B3C] text-white hover:bg-[#4A4B4C]'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {/* PIN Code */}
          <div>
            <label className="block text-sm font-medium text-white mb-1">
              PIN Code
            </label>
            <input
              type="text"
              value={pinCode}
              onChange={(e) => setPinCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="4-6 digits"
              className="w-full h-12 px-3 cmd-input"
            />
            <p className="text-xs text-[#B0B3B8] mt-1">Used for terminal login and comp authorization</p>
          </div>

          {/* Active Toggle */}
          <div className="flex items-center justify-between p-3 bg-[#3A3B3C] rounded-lg">
            <span className="font-medium text-white">Active</span>
            <button
              type="button"
              onClick={() => setIsActive(!isActive)}
              className={`w-12 h-7 rounded-full transition-colors relative ${
                isActive ? 'bg-[#1877F2]' : 'bg-[#3A3B3C]'
              }`}
            >
              <span
                className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  isActive ? 'right-1' : 'left-1'
                }`}
              />
            </button>
          </div>

          {/* Submit */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-12 cmd-btn cmd-btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 h-12 cmd-btn cmd-btn-primary disabled:opacity-50"
            >
              {submitting ? 'Saving...' : staff ? 'Update' : 'Add Staff'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
