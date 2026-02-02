/**
 * Player In-Seat Service Requests Page
 * Request food, chips, table change, floor assistance
 * Dark industrial sci-fi gaming theme
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
    color: '#22D3EE'
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
      className="w-full cmd-panel p-4 text-left hover:border-[#22D3EE] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <div className="flex items-center gap-4">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center border-2 bg-[#0A1525]"
          style={{ borderColor: `${service.color}40` }}
        >
          <Icon className="w-6 h-6" style={{ color: service.color }} />
        </div>
        <div className="flex-1">
          <p className="font-medium text-white">{service.label}</p>
          <p className="text-sm text-[#64748B]">{service.description}</p>
        </div>
        <ChevronRight className="w-5 h-5 text-[#64748B]" />
      </div>
    </button>
  );
}

function ActiveRequestCard({ request, onCancel }) {
  const statusBadge = {
    pending: 'cmd-badge cmd-badge-warning',
    in_progress: 'cmd-badge cmd-badge-primary',
    completed: 'cmd-badge cmd-badge-live',
    cancelled: 'cmd-badge cmd-badge-chrome'
  };

  const serviceType = SERVICE_TYPES.find(s => s.type === request.request_type);
  const Icon = serviceType?.icon || Coffee;

  return (
    <div className="cmd-panel p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center border-2 bg-[#0A1525]"
            style={{ borderColor: `${serviceType?.color || '#6B7280'}40` }}
          >
            <Icon className="w-5 h-5" style={{ color: serviceType?.color || '#6B7280' }} />
          </div>
          <div>
            <p className="font-medium text-white">{serviceType?.label || 'Request'}</p>
            <p className="text-sm text-[#64748B]">Table {request.table_number}, Seat {request.seat_number}</p>
          </div>
        </div>
        <span className={`${statusBadge[request.status] || 'cmd-badge cmd-badge-chrome'}`}>
          {request.status?.replace('_', ' ')}
        </span>
      </div>

      {request.details && (
        <p className="text-sm text-[#64748B] mb-3">{request.details}</p>
      )}

      <div className="flex items-center justify-between">
        <span className="text-sm text-[#64748B] flex items-center gap-1">
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
    <div className="fixed inset-0 bg-black/70 flex items-end z-50">
      <div className="w-full max-w-lg mx-auto cmd-panel rounded-t-2xl rounded-b-none p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">{serviceType?.label}</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[#0A1525] rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-[#64748B]" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Current Location */}
          <div className="cmd-inset rounded-xl p-4">
            <p className="text-sm text-[#64748B]">Your Location</p>
            <p className="font-medium text-white">
              Table {session.table_number}, Seat {session.seat_number}
            </p>
          </div>

          {/* Type-specific inputs */}
          {type === 'chips' && (
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Amount
              </label>
              <div className="grid grid-cols-4 gap-2 mb-3">
                {['100', '300', '500', '1000'].map(amt => (
                  <button
                    key={amt}
                    onClick={() => setChipAmount(amt)}
                    className={`py-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                      chipAmount === amt
                        ? 'border-[#22D3EE] bg-[#22D3EE]/5 text-[#22D3EE]'
                        : 'border-[#4A5E78] text-[#64748B] hover:border-[#22D3EE]'
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
                className="cmd-input h-12"
              />
            </div>
          )}

          {type === 'food' && (
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                What would you like?
              </label>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="e.g., Coffee, black. Burger with fries."
                rows={3}
                className="w-full px-4 py-3 bg-[#0A1525] border-2 border-[#4A5E78] rounded-xl text-white placeholder-[#64748B] focus:outline-none focus:border-[#22D3EE] resize-none transition-colors"
              />
            </div>
          )}

          {type === 'table_change' && (
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Preference (optional)
              </label>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="e.g., Prefer table near window, quieter table"
                rows={2}
                className="w-full px-4 py-3 bg-[#0A1525] border-2 border-[#4A5E78] rounded-xl text-white placeholder-[#64748B] focus:outline-none focus:border-[#22D3EE] resize-none transition-colors"
              />
            </div>
          )}

          {type === 'floor' && (
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                What do you need help with?
              </label>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                placeholder="Briefly describe the issue"
                rows={3}
                className="w-full px-4 py-3 bg-[#0A1525] border-2 border-[#4A5E78] rounded-xl text-white placeholder-[#64748B] focus:outline-none focus:border-[#22D3EE] resize-none transition-colors"
              />
            </div>
          )}

          {type === 'cashout' && (
            <div className="cmd-inset rounded-xl p-4">
              <p className="text-[#10B981] font-medium">Ready to cash out?</p>
              <p className="text-sm text-[#64748B] mt-1">
                A chip runner will come to collect your chips and bring your cash.
              </p>
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading || (type === 'chips' && !chipAmount)}
            className="cmd-btn cmd-btn-primary w-full h-14 text-lg disabled:opacity-50"
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
      router.push('/auth/login?redirect=/hub/commander/services');
      return;
    }
    fetchData();
  }, [router]);

  async function fetchData() {
    setLoading(true);
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const [sessionRes, requestsRes] = await Promise.all([
        fetch('/api/commander/sessions/current', {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch('/api/commander/services/my', {
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
      const res = await fetch('/api/commander/services/request', {
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
      await fetch(`/api/commander/services/${requestId}`, {
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
      <div className="cmd-page flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#22D3EE]" />
      </div>
    );
  }

  if (!session) {
    return (
      <>
        <Head>
          <title>Services | Smarter Poker</title>
        </Head>
        <div className="cmd-page flex items-center justify-center px-4">
          <div className="text-center">
            <div className="cmd-icon-box mx-auto mb-4">
              <AlertCircle className="w-7 h-7 text-[#F59E0B]" />
            </div>
            <h1 className="text-xl font-bold text-white mb-2">Not Currently Seated</h1>
            <p className="text-[#64748B] mb-6">
              You need to be seated at a table to request services.
            </p>
            <button
              onClick={() => router.push('/hub/commander/venues')}
              className="cmd-btn cmd-btn-primary"
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

      <div className="cmd-page">
        {/* Header */}
        <header className="cmd-header-full text-white">
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
              <h2 className="font-semibold text-white mb-3">Active Requests</h2>
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
            <h2 className="font-semibold text-white mb-3">Request Service</h2>
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
          <div className="cmd-inset rounded-xl p-4">
            <p className="text-sm text-[#64748B]">
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
