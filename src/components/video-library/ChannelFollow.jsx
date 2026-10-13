import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useAvatar } from '../../contexts/AvatarContext';
import { getAccessToken, getAuthUserId } from '../../lib/authUtils';
import { createVideoLibraryOwnerScope } from '../../lib/videoLibraryOwnerScope.mjs';

export default function ChannelFollow({ channelId, channelPath }) {
    const { user } = useAvatar();
    const ownerId = user?.id || null;
    const scope = useRef(null);
    if (!scope.current) scope.current = createVideoLibraryOwnerScope(ownerId);
    scope.current.activate(ownerId);
    const identity = useRef({ ownerId, channelId, generation: 0 });
    if (identity.current.ownerId !== ownerId || identity.current.channelId !== channelId) identity.current = { ownerId, channelId, generation: identity.current.generation + 1 };
    const channelRef = useRef(channelId);
    channelRef.current = channelId;
    const pending = useRef(null);
    const [revision, setRevision] = useState(0);
    const [state, setState] = useState(null);
    const current = state?.ownerId === ownerId && state?.channelId === channelId && state.generation === identity.current.generation ? state : null;

    useEffect(() => {
        const controller = new AbortController();
        const owner = scope.current.capture(ownerId);
        const generation = identity.current.generation;
        const request = { owner, channelId, controller, active: true };
        pending.current = request;
        const valid = () => request.active && scope.current.isCurrent(owner) && identity.current.generation === generation && channelRef.current === channelId;
        if (!ownerId) { pending.current = null; setState(null); return () => controller.abort(); }
        setState({ ownerId, channelId, generation, status: 'loading' });
        const deadline = setTimeout(() => controller.abort(), 15000);
        void (async () => {
            try {
                const token = getAccessToken();
                if (!token || getAuthUserId() !== ownerId) throw new Error('Sign In Again To Load Channel Following.');
                const response = await fetch(`/api/video-library/channel-follow?${new URLSearchParams({ channelId, expectedOwnerId: ownerId })}`, {
                    headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, cache: 'no-store',
                });
                const payload = await response.json();
                if (!response.ok || !payload.success) throw new Error(payload.error || 'Channel Following Could Not Load.');
                if (payload.ownerId !== ownerId || payload.channelId !== channelId || typeof payload.following !== 'boolean' || typeof payload.notificationsEnabled !== 'boolean') throw new Error('Channel Following Could Not Be Verified.');
                if (valid()) setState({ ownerId, channelId, generation, status: 'ready', following: payload.following, notificationsEnabled: payload.notificationsEnabled });
            } catch (error) {
                if (valid()) setState({ ownerId, channelId, generation, status: 'error', error: controller.signal.aborted ? 'Channel Following Took Too Long To Load. Reload Its Status.' : error.message || 'Channel Following Could Not Load.' });
            } finally { clearTimeout(deadline); if (pending.current === request) pending.current = null; }
        })();
        return () => { request.active = false; clearTimeout(deadline); controller.abort(); };
    }, [ownerId, channelId, revision]);

    const update = async (following, notificationsEnabled) => {
        if (!ownerId || current?.status !== 'ready' || pending.current) return;
        const owner = scope.current.capture(ownerId);
        const generation = identity.current.generation;
        const controller = new AbortController();
        const request = { owner, channelId, controller, active: true };
        pending.current = request;
        const valid = () => request.active && scope.current.isCurrent(owner) && identity.current.generation === generation && channelRef.current === channelId;
        const deadline = setTimeout(() => controller.abort(), 15000);
        setState(previous => ({ ...previous, status: 'saving', error: null, notice: null }));
        try {
            const token = getAccessToken();
            if (!token || getAuthUserId() !== ownerId) throw new Error('Sign In Again To Update Channel Following.');
            const response = await fetch('/api/video-library/channel-follow', {
                method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, signal: controller.signal,
                body: JSON.stringify({ channelId, following, notificationsEnabled, expectedOwnerId: ownerId }),
            });
            const payload = await response.json();
            if (!response.ok || !payload.success) throw new Error(payload.error || 'Channel Following Was Not Updated.');
            if (payload.ownerId !== ownerId || payload.channelId !== channelId || payload.following !== following || payload.notificationsEnabled !== notificationsEnabled) throw new Error('Channel Following Could Not Be Verified.');
            if (valid()) setState({ ownerId, channelId, generation, status: 'ready', following: payload.following, notificationsEnabled: payload.notificationsEnabled, notice: following ? 'Channel Following Saved.' : 'Channel Unfollowed.' });
        } catch (error) {
            // A timeout has an unknown write outcome. Re-read the same owner's
            // state before permitting another desired-state write.
            if (valid()) setState({ ownerId, channelId, generation, status: 'error', error: controller.signal.aborted ? 'Channel Following Could Not Be Verified. Reload Its Status Before Trying Again.' : error.message || 'Channel Following Could Not Be Verified. Reload Its Status Before Trying Again.' });
        } finally { clearTimeout(deadline); if (pending.current === request) pending.current = null; }
    };

    useEffect(() => () => { if (pending.current) { pending.current.active = false; pending.current.controller.abort(); } }, [ownerId, channelId]);

    if (!ownerId) return <div className="vl-channel-follow"><Link className="vl-pill-button is-primary" href={`/auth/login?redirect=${encodeURIComponent(channelPath)}`}>Sign In To Follow</Link><p>Follow Channels And Choose New Video Notifications.</p></div>;
    return <div className="vl-channel-follow" aria-busy={!current || ['loading', 'saving'].includes(current.status)}>
        {current?.status === 'error' ? <><p role="alert">{current.error}</p><button type="button" className="vl-pill-button" onClick={() => setRevision(value => value + 1)}>Reload Follow Status</button></> : <>
            <button type="button" className="vl-pill-button is-primary" disabled={!current || current.status !== 'ready'} aria-pressed={Boolean(current?.following)} onClick={() => void update(!current.following, current.following ? false : current.notificationsEnabled)}>{current?.status === 'loading' || !current ? 'Loading Follow Status' : current.status === 'saving' ? 'Saving' : current.following ? 'Unfollow Channel' : 'Follow Channel'}</button>
            <label className="vl-channel-notifications"><input type="checkbox" checked={Boolean(current?.following && current?.notificationsEnabled)} disabled={!current?.following || current.status !== 'ready'} onChange={event => void update(true, event.target.checked)} />Notify Me About New Videos</label>
            <p>Notifications Appear In Your Smarter.Poker Inbox.</p>
            {current?.notice && <p role="status">{current.notice}</p>}
        </>}
    </div>;
}
