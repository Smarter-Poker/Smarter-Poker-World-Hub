/**
 * /hub/commander/home-games/join — redeem a home-game invite code.
 *
 * WHY THIS FILE EXISTS (audit 2026-08-12, finding C-9)
 * Four separate places already linked here and the page did not exist:
 *
 *   pages/home-game/[code].js:330                 router.push('.../join?code=' + code)
 *   pages/api/public/home-game/[code].js:106,195  join_request: '.../join?code=' + code
 *   pages/api/public/home-games/[slug].js:145     join_request: '.../join?slug=' + slug
 *
 * Next.js resolved /hub/commander/home-games/join against the sibling
 * dynamic route [id].js with id="join", which then tried to load a group
 * whose id is the literal string "join" and rendered "Group Not Found".
 *
 * That is the primary conversion path for the whole feature: a player finds
 * a game, taps join, and lands on a dead end. Every share link, every public
 * API response advertising `join_request`, and the invite-code entry flow
 * funnel through this URL.
 *
 * It accepts either ?code= (invite code) or ?slug= (public page slug) and
 * posts to the same endpoint the working in-page join button uses, so there
 * is exactly one join implementation.
 */
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { Loader2 } from 'lucide-react';
import SEOHead from '../../../../src/components/seo/SEOHead';
import CommanderPageShell from '../../../../src/components/commander/CommanderPageShell';
import { useRequireAuth, getAccessToken } from '../../../../src/lib/authUtils';

export default function JoinHomeGame() {
  const router = useRouter();
  // Preserve the full query so the user returns here after signing in.
  const { checking: authChecking } = useRequireAuth(
    typeof window !== 'undefined'
      ? `/hub/commander/home-games/join${window.location.search || ''}`
      : '/hub/commander/home-games/join'
  );

  const [state, setState] = useState('idle'); // idle | joining | pending | joined | error
  const [message, setMessage] = useState('');
  const [slug, setSlug] = useState(null);

  const rawCode = typeof router.query.code === 'string' ? router.query.code.trim() : '';
  const rawSlug = typeof router.query.slug === 'string' ? router.query.slug.trim() : '';

  const doJoin = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return; // useRequireAuth handles the redirect

    // A slug is not an invite code. Resolve it to the group's code first via
    // the public endpoint, which already returns one for joinable groups.
    let codeToUse = rawCode;
    if (!codeToUse && rawSlug) {
      try {
        const r = await fetch(`/api/public/home-games/${encodeURIComponent(rawSlug)}`);
        const j = await r.json().catch(() => ({}));
        const g = j?.data?.group || j?.group || null;
        codeToUse = g?.invite_code || g?.club_code || '';
        if (g?.slug || rawSlug) setSlug(g?.slug || rawSlug);
      } catch (err) {
        console.warn('[join] slug resolution failed:', err);
      }
    }

    if (!codeToUse) {
      setState('error');
      setMessage('That invite link is missing a code. Ask the host to re-send it.');
      return;
    }

    setState('joining');
    try {
      const res = await fetch(`/api/commander/home-games/join/${encodeURIComponent(codeToUse)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message || data?.error || 'Failed to join group');

      const status = data.status || data?.membership?.status;
      if (status === 'pending') {
        setState('pending');
        setMessage('Request sent. The host will let you know when you are approved.');
      } else {
        setState('joined');
        setMessage('You are in.');
      }
      if (data?.group?.slug) setSlug(data.group.slug);
    } catch (err) {
      setState('error');
      setMessage(err.message || 'Could not join that game.');
    }
  }, [rawCode, rawSlug]);

  useEffect(() => {
    if (!router.isReady || authChecking) return;
    if (!rawCode && !rawSlug) {
      setState('error');
      setMessage('This link is missing an invite code.');
      return;
    }
    doJoin();
  }, [router.isReady, authChecking, rawCode, rawSlug, doJoin]);

  const goToGroup = () =>
    router.push(slug ? `/hub/home-games/${slug}` : '/hub/home-games');

  return (
    <CommanderPageShell>
      <SEOHead title="Join Home Game" description="Smarter.Poker" noindex={true} />
      <div className="cmd-page flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center py-16">
          {(authChecking || state === 'idle' || state === 'joining') && (
            <>
              <Loader2 className="w-8 h-8 animate-spin text-[#22D3EE] mx-auto mb-4" />
              <p className="text-sm text-[#9FB3C8]">Joining the game…</p>
            </>
          )}

          {state === 'pending' && (
            <>
              <h1 className="text-xl font-semibold text-white mb-2">Request sent</h1>
              <p className="text-sm text-[#9FB3C8] mb-6">{message}</p>
              <button onClick={goToGroup} className="cmd-btn cmd-btn-primary px-4 h-11">
                View the game
              </button>
            </>
          )}

          {state === 'joined' && (
            <>
              <h1 className="text-xl font-semibold text-white mb-2">You are in</h1>
              <p className="text-sm text-[#9FB3C8] mb-6">{message}</p>
              <button onClick={goToGroup} className="cmd-btn cmd-btn-primary px-4 h-11">
                Go to the game
              </button>
            </>
          )}

          {state === 'error' && (
            <>
              <h1 className="text-xl font-semibold text-white mb-2">Could not join</h1>
              <p className="text-sm text-[#9FB3C8] mb-6">{message}</p>
              <div className="flex items-center justify-center gap-3">
                <button onClick={() => doJoin()} className="cmd-btn cmd-btn-secondary px-4 h-11">
                  Try again
                </button>
                <button
                  onClick={() => router.push('/hub/home-games')}
                  className="cmd-btn cmd-btn-primary px-4 h-11"
                >
                  Browse home games
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </CommanderPageShell>
  );
}
