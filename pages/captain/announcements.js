/**
 * Captain Announcements Page - Send broadcasts to players
 * UI: Facebook color scheme, no emojis, Inter font
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { ArrowLeft, Send, Bell, Users, Clock, CheckCircle, Loader2 } from 'lucide-react';

const QUICK_MESSAGES = [
  { label: 'Game Starting', message: 'New game starting! Check in at the desk.' },
  { label: 'Seat Available', message: 'Seats are now available. Join the waitlist!' },
  { label: 'Tournament Starting', message: 'Tournament registration closing soon.' },
  { label: 'Food Service', message: 'Food service now available. See staff to order.' },
  { label: 'Last Call', message: 'Last call for waitlist signups.' },
  { label: 'High Hand', message: 'New high hand promotion starting now!' }
];

export default function CaptainAnnouncementsPage() {
  const router = useRouter();

  const [staff, setStaff] = useState(null);
  const [venueId, setVenueId] = useState(null);
  const [venue, setVenue] = useState(null);
  const [message, setMessage] = useState('');
  const [sendTo, setSendTo] = useState('all'); // 'all', 'waitlist', 'seated'
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState(null);
  const [recentAnnouncements, setRecentAnnouncements] = useState([]);

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

  async function handleSend() {
    if (!message.trim()) return;

    setSending(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/captain/notifications/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venue_id: venueId,
          message: message.trim(),
          target: sendTo,
          type: 'announcement'
        })
      });

      const data = await res.json();

      if (data.success) {
        setSuccess(`Sent to ${data.data.sent_count || 0} players`);
        setRecentAnnouncements(prev => [
          {
            id: Date.now(),
            message: message.trim(),
            target: sendTo,
            sent_at: new Date().toISOString(),
            sent_count: data.data.sent_count || 0
          },
          ...prev
        ].slice(0, 10));
        setMessage('');
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(data.error?.message || 'Failed to send announcement');
      }
    } catch (err) {
      setError('Connection error. Please try again.');
    } finally {
      setSending(false);
    }
  }

  function handleQuickMessage(msg) {
    setMessage(msg);
  }

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
        <title>Announcements | {venue?.name || 'Captain'}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="min-h-screen bg-[#F9FAFB]">
        {/* Header */}
        <header className="bg-white border-b border-[#E5E7EB] sticky top-0 z-50">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
            <button
              onClick={() => router.push('/captain/dashboard')}
              className="p-2 hover:bg-[#F3F4F6] rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-[#6B7280]" />
            </button>
            <div>
              <h1 className="font-bold text-[#1F2937] text-lg">Announcements</h1>
              <p className="text-sm text-[#6B7280]">{venue?.name}</p>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
          {/* Alerts */}
          {success && (
            <div className="p-4 bg-[#D1FAE5] rounded-xl flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-[#059669]" />
              <p className="text-sm text-[#059669] font-medium">{success}</p>
            </div>
          )}
          {error && (
            <div className="p-4 bg-[#FEF2F2] rounded-xl">
              <p className="text-sm text-[#EF4444]">{error}</p>
            </div>
          )}

          {/* Compose */}
          <section className="bg-white rounded-xl border border-[#E5E7EB] p-4 space-y-4">
            <h2 className="font-semibold text-[#1F2937]">Send Announcement</h2>

            {/* Target Selection */}
            <div>
              <label className="block text-sm font-medium text-[#6B7280] mb-2">
                Send to
              </label>
              <div className="flex gap-2">
                {[
                  { value: 'all', label: 'All Players', icon: Users },
                  { value: 'waitlist', label: 'Waitlist Only', icon: Clock },
                  { value: 'seated', label: 'Seated Only', icon: Users }
                ].map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSendTo(value)}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      sendTo === value
                        ? 'bg-[#1877F2] text-white'
                        : 'bg-[#F3F4F6] text-[#1F2937] hover:bg-[#E5E7EB]'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Messages */}
            <div>
              <label className="block text-sm font-medium text-[#6B7280] mb-2">
                Quick Messages
              </label>
              <div className="flex flex-wrap gap-2">
                {QUICK_MESSAGES.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => handleQuickMessage(item.message)}
                    className="px-3 py-1.5 bg-[#F3F4F6] text-[#1F2937] text-sm rounded-full hover:bg-[#E5E7EB] transition-colors"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Message Input */}
            <div>
              <label className="block text-sm font-medium text-[#6B7280] mb-2">
                Message
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type your announcement..."
                rows={3}
                className="w-full px-3 py-2 border border-[#E5E7EB] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1877F2] focus:border-transparent resize-none"
              />
              <p className="text-xs text-[#9CA3AF] mt-1">
                {message.length}/160 characters
              </p>
            </div>

            {/* Send Button */}
            <button
              onClick={handleSend}
              disabled={!message.trim() || sending}
              className="w-full h-12 bg-[#1877F2] text-white font-semibold rounded-lg hover:bg-[#1664d9] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {sending ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-5 h-5" />
                  Send Announcement
                </>
              )}
            </button>
          </section>

          {/* Recent Announcements */}
          {recentAnnouncements.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-[#6B7280] uppercase tracking-wide mb-3">
                Recent Announcements
              </h2>
              <div className="bg-white rounded-xl border border-[#E5E7EB] divide-y divide-[#E5E7EB]">
                {recentAnnouncements.map((ann) => (
                  <div key={ann.id} className="p-4">
                    <p className="text-[#1F2937]">{ann.message}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-[#6B7280]">
                      <span>Sent to {ann.sent_count} players</span>
                      <span>{new Date(ann.sent_at).toLocaleTimeString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </main>
      </div>
    </>
  );
}
