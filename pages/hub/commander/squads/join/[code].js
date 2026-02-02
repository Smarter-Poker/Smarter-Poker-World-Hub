/**
 * Squad Join Page - Join a squad via invite code
 * UI: Dark industrial sci-fi gaming theme, no emojis, Inter font
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { Users, Loader2, CheckCircle, XCircle, ArrowLeft } from 'lucide-react';

export default function SquadJoinPage() {
  const router = useRouter();
  const { code } = router.query;
  const [status, setStatus] = useState('loading');
  const [squad, setSquad] = useState(null);
  const [error, setError] = useState(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!code) return;
    const token = localStorage.getItem('smarter-poker-auth');
    if (!token) {
      router.push(`/auth/login?redirect=/hub/commander/squads/join/${code}`);
      return;
    }
    fetchSquad();
  }, [code, router]);

  async function fetchSquad() {
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const res = await fetch(`/api/commander/home-games/join/${code}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success && data.group) {
        setSquad(data.group);
        setStatus('found');
      } else {
        setError(data.error || 'Squad not found');
        setStatus('error');
      }
    } catch (err) {
      setError('Failed to look up invite code');
      setStatus('error');
    }
  }

  async function handleJoin() {
    setJoining(true);
    try {
      const token = localStorage.getItem('smarter-poker-auth');
      const res = await fetch(`/api/commander/home-games/join/${code}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (data.success) {
        setStatus('joined');
        setTimeout(() => {
          router.push(`/hub/commander/squads/${squad?.id || ''}`);
        }, 1500);
      } else {
        setError(data.error || 'Failed to join');
        setStatus('error');
      }
    } catch (err) {
      setError('Failed to join squad');
      setStatus('error');
    } finally {
      setJoining(false);
    }
  }

  return (
    <>
      <Head>
        <title>Join Squad | Smarter Poker</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </Head>
      <div className="cmd-page" style={{ fontFamily: 'Inter, sans-serif' }}>
        <header className="cmd-header-bar">
          <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-4">
            <button onClick={() => router.push('/hub/commander/squads')} className="p-2 rounded-lg hover:bg-[#132240]">
              <ArrowLeft size={20} className="text-[#64748B]" />
            </button>
            <h1 className="text-lg font-bold text-white">Join Squad</h1>
          </div>
        </header>

        <main className="max-w-lg mx-auto px-4 py-12">
          <div className="cmd-panel cmd-corner-lights p-8 text-center">
            {status === 'loading' && (
              <>
                <Loader2 size={48} className="mx-auto text-[#22D3EE] animate-spin mb-4" />
                <p className="text-[#64748B]">Looking up invite code...</p>
              </>
            )}

            {status === 'found' && squad && (
              <>
                <div className="w-16 h-16 rounded-full bg-[#22D3EE]/20 flex items-center justify-center mx-auto mb-4">
                  <Users size={32} className="text-[#22D3EE]" />
                </div>
                <h2 className="text-xl font-bold text-white">{squad.name}</h2>
                {squad.description && (
                  <p className="text-sm text-[#64748B] mt-2">{squad.description}</p>
                )}
                <div className="text-sm text-[#64748B] mt-3">
                  {squad.member_count || 0} members
                </div>
                <button
                  onClick={handleJoin}
                  disabled={joining}
                  className="cmd-btn cmd-btn-primary w-full h-12 justify-center font-medium mt-6 disabled:opacity-50"
                >
                  {joining ? 'Joining...' : 'Join Squad'}
                </button>
              </>
            )}

            {status === 'joined' && (
              <>
                <CheckCircle size={48} className="mx-auto text-[#10B981] mb-4" />
                <h2 className="text-xl font-bold text-white">Joined</h2>
                <p className="text-sm text-[#64748B] mt-2">Redirecting to your squad...</p>
              </>
            )}

            {status === 'error' && (
              <>
                <XCircle size={48} className="mx-auto text-[#EF4444] mb-4" />
                <h2 className="text-xl font-bold text-white">Could not join</h2>
                <p className="text-sm text-[#EF4444] mt-2">{error}</p>
                <button
                  onClick={() => router.push('/hub/commander/squads')}
                  className="cmd-btn cmd-btn-secondary mt-6"
                >
                  Back to Squads
                </button>
              </>
            )}
          </div>
        </main>
      </div>
    </>
  );
}
