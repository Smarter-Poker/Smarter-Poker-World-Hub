/**
 * Player In-Seat Service Requests Page
 * Request food, chips, table change, floor assistance
 * UI: Facebook color scheme, no emojis, Inter font
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import {
  Coffee,
  Coins,
  ArrowRightLeft,
  DollarSign,
  Hand,
  Clock,
  Check,
  X,
  Loader2,
  ChevronRight,
  AlertCircle,
  MapPin
} from 'lucide-react';

const SERVICE_TYPES = [
  {
    type: 'food',
    label: 'Food & Drinks',
    description: 'Order from the menu',
    icon: Coffee,
    color: '#F59E0B'
  },
  {
    type: 'chips',
    label: 'Chips',
    description: 'Request a chip runner',
    icon: Coins,
    color: '#1877F2'
  },
  {
    type: 'table_change',
    label: 'Table Change',
    description: 'Request to move tables',
    icon: ArrowRightLeft,
    color: '#8B5CF6'
  },
  {
    type: 'cashout',
    label: 'Cash Out',
    description: 'Ready to leave the game',
    icon: DollarSign,
    color: '#10B981'
  },
  {
    type: 'floor',
    label: 'Floor Manager',
    description: 'Need assistance or ruling',
    icon: Hand,
    color: '#EF4444'
  }
];

function ServiceTypeCard({ service, onSelect, disabled }) {
  const Icon = service.icon;

  return (
    <button
      onClick={() => onSelect(service.type)}
      disabled={disabled}
      className="w-full bg-white rounded-xl border border-[#E5E7EB] p-4 text-left hover:border-[#1877F2] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <div className="flex items-center gap-4">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: `${service.color}15` }}
        >
          <Icon className="w-6 h-6" style={{ color: service.color }} />
        </div>
        <div className="flex-1">
          <p className="font-medium text-[#1F2937]">{service.label}</p>
          <p className="text-sm text-[#6B7280]">{service.description}</p>
        </div>
        <ChevronRight className="w-5 h-5 text-[#9CA3AF]" />
      </div>
    </button>
  );
}

function ActiveRequestCard({ request, onCancel }) {
  const statusColors = {
    pending: 'bg-[#F59E0B]/10 text-[#F59E0B]',
    in_progress: 'bg-[#1877F2]/10 text-[#1877F2]',
    completed: 'bg-[#10B981]/10 text-[#10B981]',
    cancelled: 'bg-[#6B7280]/10 text-[#6B7280]'
  };

  const serviceType = SERVICE_TYPES.find(s => s.type === request.request_type);
  const Icon = serviceType?.icon || Coffee;

  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: `${serviceType?.color || '#6B7280'}15` }}
          >
            <Icon className="w-5 h-5" style={{ color: serviceType?.color || '#6B7280' }} />
          </div>
          <div>
            <p className="font-medium text-[#1F2937]">{serviceType?.label || 'Request'}</p>
            <p className="text-sm text-[#6B7280]">Table {request.table_number}, Seat {request.seat_number}</p>
          </div>
        </div>
        <span className={`px-2 py-1 rounded text-xs font-medium capitalize ${statusColors[request.status]}`}>
          {request.status?.replace('_', ' ')}
        </span>
      </div>

      {request.details && (
        <p className="text-sm text-[#6B7280] mb-3">{request.details}</p>
      )}

      <div className="flex items-center justify-between">
        <span className="text-sm text-[#9CA3AF] flex items-center gap-1">
          <Clock className="w-4 h-4" />
          {new Date(request.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
        </span>
        {request.status === 'pending' && (
          <button
            onClick={() => onCancel(request.id)}
            className="text-sm text-[#EF4444] font-medium hover:underline"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}

function RequestModal({ type, session, onSubmit, onClose }) {
  const [details, setDetails] = useState('');
  const [chipAmount, setChipAmount] = useState('');
  const [loading, setLoading] = useState(false);

  const serviceType = SERVICE_TYPES.find(s => s.type === type);

  async function handleSubmit() {
    setLoading(true);
    await onSubmit({
      request_type: type,
      details: type === 'chips' ? `$${chipAmount}` : details,
      table_id: session.table_id,
      table_number: session.table_number,
      seat_number: session.seat_number
    });
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end z-50">
      <div className="w-full max-w-lg mx-auto bg-white rounded-t-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-[#1F2937]">{serviceType?.label}</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[#F3F4F6] rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-[#6B7280]" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Current Location */}
          <div className="bg-[#F3F4F6] rounded-xl p-4">
            <p className="text-sm text-[#6B7280]">Your Location</p>
            <p className="font-medium text-[#1F2937]">
              Table {session.table_number}, Seat {session.seat_number}
            </p>
          </div>

          {/* Type-specific inputs */}
          {type === 'chips' && (
            <div>
              <label className="block text-sm font-medium text-[#1F2937] mb-2">
                Amount
              </label>
              <div className="grid grid-cols-4 gap-2 mb-3">
                {['100', '300', '500', '1000'].map(amt => (
                  <button
                    key={amt}
                    onClick={() => setChipAmount(amt)}
                    className={`py-3 rounded-lg border text-sm font-medium transition-colors ${
                      chipAmount === amt
                        ? 'border-[#1877F2] bg-[#1877F2]/5 text-[#1877F2]'
                        : 'border-[#E5E7EB] text-[#6B7280] hover:border-[#1877F2]'
                    }`}
                  >
                    ${amt}
                  </button>
                ))}
              </div>
              <input
                type="number"
                value={chipAmount}
                onChange={(e) => setChipAmount(e.target.value)}
                placeholder="Custom amount"
                className="w-full h-12 px-4 border border-[#E5E7EB] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1877F2]"
              />
            </div>
          )}

          {type === 'food' && (
            <div>
              <label className="block text-sm font-medium text-[#1F2937] mb-2">
                What would you like?
              </label>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="e.g., Coffee, black. Burger with fries."
                rows={3}
                className="w-full px-4 py-3 border border-[#E5E7EB] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1877F2] resize-none"
              />
            </div>
          )}

          {type === 'table_change' && (
            <div>
              <label className="block text-sm font-medium text-[#1F2937] mb-2">
                Preference (optional)
              </label>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="e.g., Prefer table near window, quieter table"
                rows={2}
                className="w-full px-4 py-3 border border-[#E5E7EB] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1877F2] resize-none"
              />
            </div>
          )}

          {type === 'floor' && (
            <div>
              <label className="block text-sm font-medium text-[#1F2937] mb-2">
                What do you need help with?
              </label>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Briefly describe the issue"
                rows={3}
                className="w-full px-4 py-3 border border-[#E5E7EB] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1877F2] resize-none"
              />
            </div>
          )}

          {type === 'cashout' && (
            <div className="bg-[#10B981]/10 rounded-xl p-4">
              <p className="text-[#10B981] font-medium">Ready to cash out?</p>
              <p className="text-sm text-[#6B7280] mt-1">
                A chip runner will come to collect your chips and bring your cash.
              </p>
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading || (type === 'chips' && !chipAmount)}
            className="w-full h-14 bg-[#1877F2] text-white text-lg font-semibold rounded-xl hover:bg-[#1665D8] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              'Send Request'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ServicesPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [requests, setRequests] = useState([]);
  const [selectedType, setSelectedType] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('smarter-poker-auth');
    if (!token) {
      router.push('/login?redirect=/hub/captain/services');
      return;
    }
    fetchData();
  }, [router]);

  async function fetchData() {
    setLoading(true);
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const [sessionRes, requestsRes] = await Promise.all([
        fetch('/api/captain/sessions/current', {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch('/api/captain/services/my', {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      const sessionData = await sessionRes.json();
      const requestsData = await requestsRes.json();

      if (sessionData.success) {
        setSession(sessionData.data?.session);
      }
      if (requestsData.success) {
        setRequests(requestsData.data?.requests || []);
      }
    } catch (err) {
      console.error('Fetch failed:', err);
      setSession(null);
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitRequest(request) {
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const res = await fetch('/api/captain/services/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          venue_id: session.venue_id,
          ...request
        })
      });

      const data = await res.json();
      if (data.success) {
        setSelectedType(null);
        fetchData();
      }
    } catch (err) {
      console.error('Submit failed:', err);
    }
  }

  async function handleCancelRequest(requestId) {
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      await fetch(`/api/captain/services/${requestId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchData();
    } catch (err) {
      console.error('Cancel failed:', err);
      setRequests(prev => prev.filter(r => r.id !== requestId));
    }
  }

  const activeRequests = requests.filter(r => ['pending', 'in_progress'].includes(r.status));
  const hasActiveRequest = (type) => activeRequests.some(r => r.request_type === type);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#1877F2]" />
      </div>
    );
  }

  if (!session) {
    return (
      <>
        <Head>
          <title>Services | Smarter Poker</title>
        </Head>
        <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center px-4">
          <div className="text-center">
            <AlertCircle className="w-16 h-16 text-[#F59E0B] mx-auto mb-4" />
            <h1 className="text-xl font-bold text-[#1F2937] mb-2">Not Currently Seated</h1>
            <p className="text-[#6B7280] mb-6">
              You need to be seated at a table to request services.
            </p>
            <button
              onClick={() => router.push('/hub/captain/venues')}
              className="px-6 py-3 bg-[#1877F2] text-white rounded-xl font-medium hover:bg-[#1665D8] transition-colors"
            >
              Find a Game
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Services | Smarter Poker</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="min-h-screen bg-[#F9FAFB]">
        {/* Header */}
        <header className="bg-[#1877F2] text-white">
          <div className="max-w-lg mx-auto px-4 py-6">
            <h1 className="text-xl font-bold">In-Seat Services</h1>
            <p className="text-white/80 text-sm flex items-center gap-1 mt-1">
              <MapPin className="w-4 h-4" />
              {session.venue_name} - Table {session.table_number}, Seat {session.seat_number}
            </p>
          </div>
        </header>

        <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
          {/* Active Requests */}
          {activeRequests.length > 0 && (
            <section>
              <h2 className="font-semibold text-[#1F2937] mb-3">Active Requests</h2>
              <div className="space-y-3">
                {activeRequests.map(request => (
                  <ActiveRequestCard
                    key={request.id}
                    request={request}
                    onCancel={handleCancelRequest}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Service Types */}
          <section>
            <h2 className="font-semibold text-[#1F2937] mb-3">Request Service</h2>
            <div className="space-y-3">
              {SERVICE_TYPES.map(service => (
                <ServiceTypeCard
                  key={service.type}
                  service={service}
                  onSelect={setSelectedType}
                  disabled={hasActiveRequest(service.type)}
                />
              ))}
            </div>
          </section>

          {/* Info */}
          <div className="bg-[#1877F2]/5 rounded-xl p-4">
            <p className="text-sm text-[#6B7280]">
              Your requests will be sent to the poker room staff. Average response time is 3-5 minutes.
            </p>
          </div>
        </main>

        {/* Request Modal */}
        {selectedType && (
          <RequestModal
            type={selectedType}
            session={session}
            onSubmit={handleSubmitRequest}
            onClose={() => setSelectedType(null)}
          />
        )}
      </div>
    </>
  );
}
