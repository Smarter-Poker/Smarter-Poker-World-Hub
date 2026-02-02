/**
 * Commander Announcements Page - Send broadcasts to players
 * Dark industrial sci-fi gaming theme
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

export default function CommanderAnnouncementsPage() {
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
      setStaff(staffData);
      setVenueId(staffData.venue_id);
      if (staffData.venue_name) {
        setVenue({ id: staffData.venue_id, name: staffData.venue_name });
      }
    } catch (err) {
      router.push('/commander/login');
    }
  }, [router]);

  async function handleSend() {
    if (!message.trim()) return;

    setSending(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/commander/notifications/send', {
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
      <div className="cmd-page flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#22D3EE]" />
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Announcements | {venue?.name || 'Commander'}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>

      <div className="cmd-page">
        {/* Header */}
        <header className="cmd-header-bar sticky top-0 z-50">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
            <button
              onClick={() => router.push('/commander/dashboard')}
              className="p-2 hover:bg-[#132240] rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-[#64748B]" />
            </button>
            <div>
              <h1 className="font-bold text-white text-lg">Announcements</h1>
              <p className="text-sm text-[#64748B]">{venue?.name}</p>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
          {/* Alerts */}
          {success && (
            <div className="p-4 bg-[#10B981]/10 rounded-xl flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-[#10B981]" />
              <p className="text-sm text-[#10B981] font-medium">{success}</p>
            </div>
          )}
          {error && (
            <div className="p-4 bg-[#EF4444]/10 rounded-xl">
              <p className="text-sm text-[#EF4444]">{error}</p>
            </div>
          )}

          {/* Compose */}
          <section className="cmd-panel p-4 space-y-4">
            <h2 className="font-semibold text-white">Send Announcement</h2>

            {/* Target Selection */}
            <div>
              <label className="block text-sm font-medium text-[#64748B] mb-2">
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
                        ? 'bg-[#22D3EE] text-white'
                        : 'bg-[#0D192E] text-white hover:bg-[#132240]'
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
              <label className="block text-sm font-medium text-[#64748B] mb-2">
                Quick Messages
              </label>
              <div className="flex flex-wrap gap-2">
                {QUICK_MESSAGES.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => handleQuickMessage(item.message)}
                    className="px-3 py-1.5 bg-[#0D192E] text-white text-sm rounded-full hover:bg-[#132240] transition-colors"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Message Input */}
            <div>
              <label className="block text-sm font-medium text-[#64748B] mb-2">
                Message
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type your announcement..."
                rows={3}
                className="w-full px-3 py-2 cmd-input resize-none"
              />
              <p className="text-xs text-[#4A5E78] mt-1">
                {message.length}/160 characters
              </p>
            </div>

            {/* Send Button */}
            <button
              onClick={handleSend}
              disabled={!message.trim() || sending}
              className="w-full h-12 cmd-btn cmd-btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
              <h2 className="text-sm font-semibold text-[#64748B] uppercase tracking-wide mb-3">
                Recent Announcements
              </h2>
              <div className="cmd-panel divide-y divide-[#4A5E78]">
                {recentAnnouncements.map((ann) => (
                  <div key={ann.id} className="p-4">
                    <p className="text-white">{ann.message}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-[#64748B]">
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
