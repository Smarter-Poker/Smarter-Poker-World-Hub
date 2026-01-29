/**
 * Staff Incident Management Page
 * Log and track disputes, rule violations, and safety issues
 * Dark industrial sci-fi gaming theme
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  AlertTriangle,
  Plus,
  Clock,
  User,
  Check,
  X,
  ChevronLeft,
  Filter,
  Search,
  Loader2,
  MapPin,
  FileText
} from 'lucide-react';

const INCIDENT_TYPES = [
  { value: 'dispute', label: 'Player Dispute' },
  { value: 'rules_violation', label: 'Rules Violation' },
  { value: 'behavior', label: 'Behavior Issue' },
  { value: 'safety', label: 'Safety Concern' },
  { value: 'equipment', label: 'Equipment Issue' },
  { value: 'other', label: 'Other' }
];

const SEVERITY_LEVELS = [
  { value: 'low', label: 'Low', color: '#10B981' },
  { value: 'medium', label: 'Medium', color: '#F59E0B' },
  { value: 'high', label: 'High', color: '#EF4444' },
  { value: 'critical', label: 'Critical', color: '#7C3AED' }
];

function IncidentCard({ incident, onClick }) {
  const severityColors = {
    low: 'bg-[#10B981]/10 text-[#10B981] border-[#10B981]',
    medium: 'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]',
    high: 'bg-[#EF4444]/10 text-[#EF4444] border-[#EF4444]',
    critical: 'bg-[#7C3AED]/10 text-[#7C3AED] border-[#7C3AED]'
  };

  const typeLabels = {
    dispute: 'Dispute',
    rules_violation: 'Rules',
    behavior: 'Behavior',
    safety: 'Safety',
    equipment: 'Equipment',
    other: 'Other'
  };

  return (
    <button
      onClick={onClick}
      className="w-full cap-panel p-4 text-left hover:border-[#22D3EE] transition-colors"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-1 rounded text-xs font-medium border ${severityColors[incident.severity]}`}>
            {incident.severity?.toUpperCase()}
          </span>
          <span className="px-2 py-1 bg-[#0D192E] text-[#64748B] rounded text-xs font-medium">
            {typeLabels[incident.incident_type] || incident.incident_type}
          </span>
        </div>
        {incident.resolved ? (
          <span className="px-2 py-1 bg-[#10B981]/10 text-[#10B981] rounded text-xs font-medium flex items-center gap-1">
            <Check className="w-3 h-3" />
            Resolved
          </span>
        ) : (
          <span className="px-2 py-1 bg-[#EF4444]/10 text-[#EF4444] rounded text-xs font-medium">
            Open
          </span>
        )}
      </div>

      <p className="font-medium text-white line-clamp-2 mb-2">{incident.description}</p>

      <div className="flex items-center gap-4 text-sm text-[#64748B]">
        {incident.table_number && (
          <span className="flex items-center gap-1">
            <MapPin className="w-4 h-4" />
            Table {incident.table_number}
          </span>
        )}
        <span className="flex items-center gap-1">
          <Clock className="w-4 h-4" />
          {new Date(incident.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
        </span>
        <span className="flex items-center gap-1">
          <User className="w-4 h-4" />
          {incident.reported_by_name || 'Staff'}
        </span>
      </div>
    </button>
  );
}

function CreateIncidentModal({ onSubmit, onClose }) {
  const [formData, setFormData] = useState({
    incident_type: 'dispute',
    severity: 'medium',
    table_number: '',
    players_involved: '',
    description: ''
  });
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!formData.description) return;

    setLoading(true);
    await onSubmit({
      ...formData,
      players_involved: formData.players_involved
        ? formData.players_involved.split(',').map(p => p.trim())
        : []
    });
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-lg cap-panel cap-corner-lights p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Report Incident</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[#132240] rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-[#64748B]" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Incident Type */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Type of Incident
            </label>
            <select
              value={formData.incident_type}
              onChange={(e) => setFormData(prev => ({ ...prev, incident_type: e.target.value }))}
              className="w-full h-12 px-4 cap-input"
            >
              {INCIDENT_TYPES.map(type => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </div>

          {/* Severity */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Severity
            </label>
            <div className="grid grid-cols-4 gap-2">
              {SEVERITY_LEVELS.map(level => (
                <button
                  key={level.value}
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, severity: level.value }))}
                  className={`py-2 rounded-lg border text-sm font-medium transition-colors ${
                    formData.severity === level.value
                      ? `border-2`
                      : 'border-[#4A5E78] text-[#64748B]'
                  }`}
                  style={{
                    borderColor: formData.severity === level.value ? level.color : undefined,
                    backgroundColor: formData.severity === level.value ? `${level.color}15` : undefined,
                    color: formData.severity === level.value ? level.color : undefined
                  }}
                >
                  {level.label}
                </button>
              ))}
            </div>
          </div>

          {/* Table Number */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Table Number (optional)
            </label>
            <input
              type="text"
              value={formData.table_number}
              onChange={(e) => setFormData(prev => ({ ...prev, table_number: e.target.value }))}
              placeholder="e.g., 5"
              className="w-full h-12 px-4 cap-input"
            />
          </div>

          {/* Players Involved */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Players Involved (optional)
            </label>
            <input
              type="text"
              value={formData.players_involved}
              onChange={(e) => setFormData(prev => ({ ...prev, players_involved: e.target.value }))}
              placeholder="e.g., John D., Mike S."
              className="w-full h-12 px-4 cap-input"
            />
            <p className="text-xs text-[#4A5E78] mt-1">Separate names with commas</p>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Description *
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Describe what happened..."
              rows={4}
              required
              className="w-full px-4 py-3 cap-input resize-none"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-12 cap-btn cap-btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !formData.description}
              className="flex-1 h-12 bg-[#EF4444] text-white font-semibold rounded-xl hover:bg-[#DC2626] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <AlertTriangle className="w-5 h-5" />
                  Report
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function IncidentDetailModal({ incident, onResolve, onClose }) {
  const [resolution, setResolution] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleResolve() {
    if (!resolution) return;
    setLoading(true);
    await onResolve(incident.id, resolution);
    setLoading(false);
  }

  const severityColors = {
    low: '#10B981',
    medium: '#F59E0B',
    high: '#EF4444',
    critical: '#7C3AED'
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-lg cap-panel cap-corner-lights p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">Incident Details</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[#132240] rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-[#64748B]" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Header Info */}
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="px-3 py-1 rounded text-sm font-medium"
              style={{
                backgroundColor: `${severityColors[incident.severity]}15`,
                color: severityColors[incident.severity]
              }}
            >
              {incident.severity?.toUpperCase()}
            </span>
            <span className="px-3 py-1 bg-[#0D192E] text-[#64748B] rounded text-sm font-medium">
              {INCIDENT_TYPES.find(t => t.value === incident.incident_type)?.label}
            </span>
            {incident.resolved && (
              <span className="px-3 py-1 bg-[#10B981]/10 text-[#10B981] rounded text-sm font-medium flex items-center gap-1">
                <Check className="w-4 h-4" />
                Resolved
              </span>
            )}
          </div>

          {/* Details */}
          <div className="bg-[#0B1426] rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-4 text-sm text-[#64748B]">
              <span className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                {new Date(incident.created_at).toLocaleString()}
              </span>
              {incident.table_number && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  Table {incident.table_number}
                </span>
              )}
            </div>
            <div>
              <p className="text-sm text-[#64748B]">Reported by</p>
              <p className="font-medium text-white">{incident.reported_by_name || 'Staff Member'}</p>
            </div>
            {incident.players_involved?.length > 0 && (
              <div>
                <p className="text-sm text-[#64748B]">Players Involved</p>
                <p className="font-medium text-white">{incident.players_involved.join(', ')}</p>
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <p className="text-sm text-[#64748B] mb-1">Description</p>
            <p className="text-white">{incident.description}</p>
          </div>

          {/* Resolution */}
          {incident.resolved ? (
            <div className="bg-[#10B981]/5 border border-[#10B981]/20 rounded-xl p-4">
              <p className="text-sm text-[#64748B] mb-1">Resolution</p>
              <p className="text-white">{incident.resolution}</p>
              <p className="text-sm text-[#4A5E78] mt-2">
                Resolved {new Date(incident.resolved_at).toLocaleString()}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-white">
                Resolution
              </label>
              <textarea
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                placeholder="Describe how this incident was resolved..."
                rows={3}
                className="w-full px-4 py-3 cap-input resize-none"
              />
              <button
                onClick={handleResolve}
                disabled={loading || !resolution}
                className="w-full h-12 bg-[#10B981] text-white font-semibold rounded-xl hover:bg-[#059669] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Check className="w-5 h-5" />
                    Mark as Resolved
                  </>
                )}
              </button>
            </div>
          )}

          <button
            onClick={onClose}
            className="w-full h-12 cap-btn cap-btn-secondary"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function IncidentsPage() {
  const router = useRouter();

  const [staff, setStaff] = useState(null);
  const [venueId, setVenueId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [incidents, setIncidents] = useState([]);
  const [filter, setFilter] = useState('all'); // all, open, resolved
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState(null);

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
      fetchIncidents();
    }
  }, [venueId]);

  async function fetchIncidents() {
    setLoading(true);
    try {
      const res = await fetch(`/api/captain/incidents?venue_id=${venueId}`);
      const data = await res.json();
      if (data.success) {
        setIncidents(data.data?.incidents || []);
      }
    } catch (err) {
      console.error('Fetch incidents failed:', err);
      setIncidents([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateIncident(data) {
    try {
      const res = await fetch('/api/captain/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venue_id: venueId,
          reported_by: staff.id,
          ...data
        })
      });

      const result = await res.json();
      if (result.success) {
        setShowCreateModal(false);
        fetchIncidents();
      }
    } catch (err) {
      console.error('Create incident failed:', err);
    }
  }

  async function handleResolveIncident(incidentId, resolution) {
    try {
      await fetch(`/api/captain/incidents/${incidentId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution })
      });
      setSelectedIncident(null);
      fetchIncidents();
    } catch (err) {
      console.error('Resolve incident failed:', err);
    }
  }

  const filteredIncidents = incidents
    .filter(i => {
      if (filter === 'open') return !i.resolved;
      if (filter === 'resolved') return i.resolved;
      return true;
    })
    .filter(i =>
      i.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      i.incident_type.toLowerCase().includes(searchQuery.toLowerCase())
    );

  const openCount = incidents.filter(i => !i.resolved).length;

  if (!staff) {
    return (
      <div className="cap-page flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#22D3EE]" />
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Incidents | Smarter Captain</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="cap-page">
        {/* Header */}
        <header className="cap-header-bar sticky top-0 z-40">
          <div className="max-w-4xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => router.push('/captain/dashboard')}
                  className="p-2 hover:bg-[#132240] rounded-lg transition-colors"
                >
                  <ChevronLeft className="w-5 h-5 text-[#64748B]" />
                </button>
                <div>
                  <h1 className="text-xl font-bold text-white flex items-center gap-2">
                    <AlertTriangle className="w-6 h-6 text-[#EF4444]" />
                    Incidents
                  </h1>
                  {openCount > 0 && (
                    <p className="text-sm text-[#EF4444]">{openCount} open incident{openCount !== 1 ? 's' : ''}</p>
                  )}
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-[#EF4444] text-white rounded-lg hover:bg-[#DC2626] transition-colors"
              >
                <Plus className="w-4 h-4" />
                Report
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-4 py-6 space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#4A5E78]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search incidents..."
                className="w-full h-12 pl-12 pr-4 cap-input"
              />
            </div>
            <div className="flex gap-2">
              {[
                { value: 'all', label: 'All' },
                { value: 'open', label: 'Open' },
                { value: 'resolved', label: 'Resolved' }
              ].map(f => (
                <button
                  key={f.value}
                  onClick={() => setFilter(f.value)}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                    filter === f.value
                      ? 'bg-[#22D3EE] text-white'
                      : 'bg-[#0F1C32] border border-[#4A5E78] text-[#64748B] hover:border-[#22D3EE]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Incidents List */}
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-[#22D3EE]" />
            </div>
          ) : filteredIncidents.length > 0 ? (
            <div className="space-y-3">
              {filteredIncidents.map(incident => (
                <IncidentCard
                  key={incident.id}
                  incident={incident}
                  onClick={() => setSelectedIncident(incident)}
                />
              ))}
            </div>
          ) : (
            <div className="cap-panel p-8 text-center">
              <FileText className="w-12 h-12 text-[#4A5E78] mx-auto mb-3" />
              <p className="text-[#64748B]">
                {searchQuery ? 'No incidents match your search' : 'No incidents reported'}
              </p>
            </div>
          )}
        </main>

        {/* Modals */}
        {showCreateModal && (
          <CreateIncidentModal
            onSubmit={handleCreateIncident}
            onClose={() => setShowCreateModal(false)}
          />
        )}

        {selectedIncident && (
          <IncidentDetailModal
            incident={selectedIncident}
            onResolve={handleResolveIncident}
            onClose={() => setSelectedIncident(null)}
          />
        )}
      </div>
    </>
  );
}
