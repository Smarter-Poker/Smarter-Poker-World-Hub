import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useAvatar } from '../../contexts/AvatarContext';
import { getAccessToken, getAuthUserId } from '../../lib/authUtils';
import { createVideoLibraryOwnerScope } from '../../lib/videoLibraryOwnerScope.mjs';
export default function StudyStatus({ refreshKey = 0 }) {
    const { user } = useAvatar();
    const ownerId = user?.id || null;
    const scope = useRef(null);
    if (!scope.current) scope.current = createVideoLibraryOwnerScope(ownerId);
    scope.current.activate(ownerId);
    const [state, setState] = useState(null);
    const [revision, setRevision] = useState(0);
    const current = state && scope.current.isCurrent(state.owner) ? state : null;
    useEffect(() => {
        const owner = scope.current.capture(ownerId);
        const controller = new AbortController();
        let active = true;
        if (!ownerId) { setState(null); return () => controller.abort(); }
        setState({ owner, status: 'loading' });
        const deadline = setTimeout(() => controller.abort(), 15000);
        void (async () => {
            try {
                const token = getAccessToken();
                if (!token || getAuthUserId() !== ownerId) throw new Error('Sign In Again To Load Study Status.');
                const response = await fetch(`/api/video-library/study-status?${new URLSearchParams({ ownerId })}`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, cache: 'no-store' });
                const payload = await response.json();
                if (!response.ok || !payload.success || payload.ownerId !== ownerId || payload.data?.basis !== 'rewarded_video_watch_days'
                    || !Number.isInteger(payload.data.currentStreak) || payload.data.currentStreak < 0 || payload.data.currentStreak > 366
                    || !Number.isFinite(payload.data.diamondsToday) || payload.data.diamondsToday < 0
                    || typeof payload.data.studiedToday !== 'boolean') throw new Error(payload.error || 'Study Status Could Not Be Verified.');
                if (active && scope.current.isCurrent(owner)) setState({ owner, status: 'ready', data: payload.data });
            } catch (error) {
                if (active && scope.current.isCurrent(owner)) setState({ owner, status: 'error', error: controller.signal.aborted ? 'Study Status Took Too Long To Load.' : error.message });
            } finally { clearTimeout(deadline); }
        })();
        return () => { active = false; clearTimeout(deadline); controller.abort(); };
    }, [ownerId, refreshKey, revision]);
    return <section className="vl-study-status" aria-label="Diamond Study Streak" data-video-library-study-status>
        <h2>Diamond Study Streak</h2>
        {!ownerId ? <p><Link href="/auth/login?redirect=%2Fhub%2Fvideo-library" prefetch={false}>Sign In To See Your Study Streak</Link></p> : current?.status === 'ready' ? <>
            <p className="vl-study-streak-value">{current.data.currentStreak}{current.data.streakAtLeast ? '+' : ''} {current.data.currentStreak === 1 ? 'Day' : 'Days'}</p>
            <p>{current.data.diamondsToday} Diamonds Earned From Videos Today</p>
            <p>Counts Days With Verified Video Watch Diamond Credits. Watch Rewards Use Existing Eligibility And Limits. No Extra Streak Bonus.</p>
            <p>{current.data.studiedToday ? 'Today Counts Toward Your Streak.' : 'Earn A Video Watch Reward Today To Continue Your Streak.'}</p>
        </> : current?.status === 'error' ? <><p role="alert">{current.error}</p><button type="button" className="vl-pill-button" onClick={() => setRevision(value => value + 1)}>Reload Study Status</button></> : <p role="status">Loading Study Status</p>}
    </section>;
}
