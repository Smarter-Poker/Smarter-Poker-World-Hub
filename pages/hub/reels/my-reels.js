import SEOHead from '../../../src/components/seo/SEOHead';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useCallback, useState, useEffect, useRef } from 'react';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { getAccessToken, getAuthUser } from '../../../src/lib/authUtils';
import { supabase } from '../../../src/lib/supabase';
import { getYouTubeThumbnail } from '../../../src/lib/socialHelpers';
import { createLatestRequestGuard } from '../../../src/lib/latestRequestGuard.mjs';
import { createReelAccountScope } from '../../../src/lib/reelAccountScope.mjs';
import VideoLibraryConsole, {
    ConsoleCopy,
    ConsoleDataRow,
} from '../../../src/components/video-library/console/VideoLibraryConsole';
import ReelCollectionCommandRail from '../../../src/components/reels/ReelCollectionCommandRail';

export default function MyReels() {
    const router = useRouter();
    const initialUser = null;
    const [authUser, setAuthUser] = useState(initialUser);
    const [authReady, setAuthReady] = useState(false);
    const [reels, setReels] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState('');
    const [paginationError, setPaginationError] = useState('');
    const [hasMore, setHasMore] = useState(false);
    const requestGuardRef = useRef(null);
    const nextCursorRef = useRef(null);
    const collectionOwnerIdRef = useRef(null);
    const authUserRef = useRef(initialUser);
    const accountScopeRef = useRef(null);
    if (!requestGuardRef.current) requestGuardRef.current = createLatestRequestGuard();
    if (!accountScopeRef.current) accountScopeRef.current = createReelAccountScope(initialUser?.id);

    const bindAuthUser = useCallback((nextUser) => {
        const next = nextUser?.id ? nextUser : null;
        const binding = accountScopeRef.current.bind(next?.id);
        authUserRef.current = next;
        if (binding.changed) {
            requestGuardRef.current.abort();
            collectionOwnerIdRef.current = null;
            nextCursorRef.current = null;
            setReels([]);
            setHasMore(false);
            setLoadingMore(false);
            setPaginationError('');
            setError('');
        }
        setAuthUser(next);
    }, []);

    const loadReels = useCallback(async ({ append = false } = {}) => {
        const user = authUserRef.current;
        const ownerRequest = accountScopeRef.current.capture(user?.id);
        const accountChanged = Boolean(collectionOwnerIdRef.current)
            && collectionOwnerIdRef.current !== (user?.id || null);
        const appendRequest = append
            && Boolean(user?.id)
            && collectionOwnerIdRef.current === user.id;
        const cursor = appendRequest ? nextCursorRef.current : null;
        if (appendRequest && !cursor) return;
        const request = requestGuardRef.current.begin({ append: appendRequest });
        if (!request) return;
        if (appendRequest) setLoadingMore(true);
        else {
            setLoading(true);
            setLoadingMore(false);
            if (accountChanged) {
                setReels([]);
                setHasMore(false);
                nextCursorRef.current = null;
            }
            collectionOwnerIdRef.current = null;
        }
        if (!appendRequest) setError('');
        setPaginationError('');
        try {
            if (!request.isCurrent() || !ownerRequest.isCurrent()) return;
            if (!user) {
                setReels([]);
                setHasMore(false);
                nextCursorRef.current = null;
                collectionOwnerIdRef.current = null;
                return;
            }
            const token = getAccessToken();
            if (!token) throw new Error('Authentication required');
            const params = new URLSearchParams({ limit: '50' });
            if (cursor) params.set('cursor', cursor);
            const response = await fetch(`/api/reels/mine?${params.toString()}`, {
                cache: 'no-store',
                credentials: 'same-origin',
                headers: {
                    Accept: 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                signal: request.signal,
            });
            const payload = await response.json().catch(() => null);
            if (!request.isCurrent() || !ownerRequest.isCurrent()) return;
            if (!response.ok || !payload?.success || !Array.isArray(payload.data)) {
                throw new Error(payload?.error || `My Reels request failed (${response.status})`);
            }
            if (payload.data.some(row => row?.author_id !== ownerRequest.ownerId)) {
                throw new Error('My Reels response owner mismatch');
            }
            const responseHasMore = payload.has_more === true;
            const nextCursor = responseHasMore && typeof payload.next_cursor === 'string'
                ? payload.next_cursor
                : null;
            if (responseHasMore && (!nextCursor || nextCursor === cursor)) {
                throw new Error('My Reels pagination did not advance');
            }
            setReels(current => appendRequest
                ? mergeReelRows(current, payload.data)
                : mergeReelRows([], payload.data));
            setHasMore(responseHasMore);
            nextCursorRef.current = nextCursor;
            collectionOwnerIdRef.current = ownerRequest.ownerId;
        } catch (loadError) {
            if (!request.isCurrent() || !ownerRequest.isCurrent() || loadError?.name === 'AbortError') return;
            console.warn('Error loading reels:', loadError);
            if (appendRequest) setPaginationError('More Reels Could Not Be Loaded. Please Retry.');
            else setError('We Could Not Load Your Reels. Please Try Again.');
        } finally {
            if (request.isCurrent() && ownerRequest.isCurrent()) {
                if (appendRequest) setLoadingMore(false);
                else setLoading(false);
            }
            request.finish();
        }
    }, []);

    useEffect(() => {
        bindAuthUser(getAuthUser());
        setAuthReady(true);
        const handleStorage = (event) => {
            if (event.key !== 'smarter-poker-auth'
                && !(event.key?.startsWith('sb-') && event.key?.endsWith('-auth-token'))) return;
            bindAuthUser(event.key === 'smarter-poker-auth' && !event.newValue ? null : getAuthUser());
        };
        window.addEventListener('storage', handleStorage);
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            bindAuthUser(event === 'SIGNED_OUT' ? null : session?.user || getAuthUser());
        });
        return () => {
            window.removeEventListener('storage', handleStorage);
            subscription?.unsubscribe();
        };
    }, [bindAuthUser]);

    useEffect(() => {
        if (!authReady) return undefined;
        loadReels();
        return () => requestGuardRef.current?.abort();
    }, [authReady, authUser?.id, loadReels]);

    return (
        <PageTransition>
            <SEOHead title="My Reels" description="Manage your posted poker reels and short clips." canonical="/hub/reels/my-reels" noindex />
            <main className="vlc-collection-page">
                <UniversalHeader pageDepth={2} />
                <div className="vlc-collection-shell">
                    <VideoLibraryConsole
                        titleAs="h1"
                        eyebrow="Creator Channel"
                        title="My Reels"
                        titleId="my-reels-title"
                        subtitle="Your Eligible Poker Clips, Including Private Uploads"
                        pill={`${compactCount(reels.length)} Loaded`}
                        pillInk="blue"
                        foot="plates"
                        plates={{
                            secondary: { label: 'Browse Reels', onClick: () => router.push('/hub/reels'), ink: 'silver' },
                            primary: { label: 'Upload Reel', onClick: () => router.push('/hub/reels?upload=1'), ink: 'white' },
                        }}
                        aria-labelledby="my-reels-title"
                    >
                        <ReelCollectionCommandRail />
                        <ConsoleDataRow label="Channel Status" value={authUser ? 'Account Synchronized' : 'Sign In Required'} valueInk={authUser ? 'green' : 'gold'} />
                        <ConsoleDataRow label="Reels In View" value={compactCount(reels.length)} valueInk="blue" />
                        {error && reels.length > 0 ? <p className="vlc-collection-alert" role="alert">{error}</p> : null}
                        {loading ? <CollectionState text="Synchronizing Your Creator Channel" />
                            : error && reels.length === 0 ? <CollectionState text={error} action={<button type="button" onClick={() => loadReels()}>Try Again</button>} />
                            : !authUser ? <CollectionState text="Sign In To See The Reels You Have Published" action={<Link href="/login">Sign In</Link>} />
                            : reels.length === 0 && hasMore ? <CollectionState text="More Channel Records Remain To Be Checked" action={<button type="button" onClick={() => loadReels({ append: true })}>Continue Scan</button>} />
                            : reels.length === 0 ? <CollectionState text="Your Channel Is Quiet. Publish Your First Reel To Start The Feed" action={<Link href="/hub/reels?upload=1">Upload Reel</Link>} />
                            : <>
                                <div className="vlc-reel-grid">{reels.map((reel, index) => <ReelTile key={reel.id} reel={reel} index={index} />)}</div>
                                <CollectionPager
                                    hasMore={hasMore}
                                    loading={loadingMore}
                                    error={paginationError}
                                    onLoadMore={() => loadReels({ append: true })}
                                />
                            </>}
                    </VideoLibraryConsole>
                </div>
            </main>
            <CollectionStyles />
        </PageTransition>
    );
}

function mergeReelRows(current, incoming) {
    const byId = new Map(current.map(row => [row.id, row]));
    for (const row of incoming) {
        if (row?.id) byId.set(row.id, row);
    }
    return [...byId.values()];
}

function ReelTile({ reel, index }) {
    const poster = reel.thumbnail_url || getYouTubeThumbnail(reel.video_url);
    const title = reel.caption?.split('\n')[0] || 'Untitled Reel';
    const contents = <>
        <div className="vlc-reel-poster">
            {poster ? <img src={poster} alt="" loading="lazy" /> : <span className="vlc-reel-no-poster">Preview Pending</span>}
            <span className="vlc-reel-index">Reel {index + 1}</span>
            <span className="vlc-reel-command">{reel.is_public ? 'Open Reel' : 'Private Reel'}</span>
        </div>
        <div className="vlc-reel-copy">
            <h2>{title}</h2>
            <p>{reel.is_public
                ? `${compactCount(reel.view_count || 0)} Views  /  ${compactCount(reel.like_count || 0)} Likes`
                : 'Only You Can See This Reel'}</p>
        </div>
    </>;
    if (!reel.is_public) {
        return <article className="vlc-reel-record" aria-label={`Private Reel: ${reel.caption || 'reel'}`}>{contents}</article>;
    }
    return <Link className="vlc-reel-record vlc-reel-record-link" href={`/hub/reels?id=${encodeURIComponent(reel.id)}`} aria-label={`Play ${reel.caption || 'reel'}`}>{contents}</Link>;
}

function CollectionState({ text, action }) {
    return <div className="vlc-collection-state" role="status">
        <ConsoleCopy align="center">{text}</ConsoleCopy>
        {action ? <div className="vlc-word-action">{action}</div> : null}
    </div>;
}

function CollectionPager({ hasMore, loading, error, onLoadMore }) {
    if (!hasMore && !error) return null;
    return <div className="vlc-collection-pager">
        {error ? <p role="alert">{error}</p> : null}
        {hasMore ? <button type="button" onClick={onLoadMore} disabled={loading}>
            {loading ? 'Loading More Reels' : error ? 'Retry Load More' : 'Load More Reels'}
        </button> : null}
    </div>;
}

function compactCount(value) {
    const count = Math.max(0, Number(value) || 0);
    if (count < 1000) return String(Math.floor(count));
    if (count < 1_000_000) return `${Math.floor(count / 1000)}K`;
    return `${Math.floor(count / 1_000_000)}M`;
}

function CollectionStyles() { return <style jsx global>{`
    .vlc-collection-page{min-height:100dvh;background:#000;color:#e4e7ec;padding-bottom:84px;font-family:Inter,system-ui,sans-serif}.vlc-collection-shell{width:min(100%,1120px);margin:0 auto;padding:78px 8px 28px}.vlc-reel-grid{display:grid;grid-template-columns:1fr;gap:0}.vlc-reel-record{display:grid;grid-template-columns:minmax(112px,34%) 1fr;min-height:166px;color:inherit;text-decoration:none;border-top:1px solid #000;box-shadow:inset 0 1px 0 rgb(255 255 255 / 8%);background:transparent}.vlc-reel-record-link:active .vlc-reel-command{color:#f4f7fb}.vlc-reel-record-link:focus-visible{outline:2px solid #8fd4ff;outline-offset:-3px}.vlc-reel-poster{position:relative;min-height:166px;overflow:hidden;background:#000}.vlc-reel-poster img{width:100%;height:100%;object-fit:cover;display:block}.vlc-reel-no-poster{position:absolute;inset:0;display:grid;place-items:center;color:#9aa5b3;font:700 11px/1.2 'Roboto Condensed',Inter,sans-serif;letter-spacing:.12em;text-transform:uppercase}.vlc-reel-index,.vlc-reel-command{position:absolute;left:8px;padding:4px 6px;background:rgb(0 0 0 / 76%);font:800 10px/1.1 'Roboto Condensed',Inter,sans-serif;letter-spacing:.08em;text-transform:uppercase;text-shadow:0 1px 2px #000}.vlc-reel-index{top:8px;color:#45adff}.vlc-reel-command{bottom:8px;color:#e4e7ec}.vlc-reel-copy{align-self:end;padding:14px 12px 18px;min-width:0}.vlc-reel-copy h2{margin:0 0 10px;color:#e4e7ec;font:800 18px/1.05 'Roboto Condensed',Inter,sans-serif;letter-spacing:.03em;text-transform:uppercase;overflow-wrap:anywhere;text-shadow:0 -1px 0 rgb(255 255 255 / 35%),0 2px 0 #050607}.vlc-reel-copy p{margin:0;color:#9aa5b3;font:700 10px/1.45 'Roboto Condensed',Inter,sans-serif;letter-spacing:.06em;text-transform:uppercase}.vlc-collection-state{min-height:238px;display:grid;place-content:center;justify-items:center;gap:18px;padding:24px 8px;text-align:center;border-top:1px solid #000;box-shadow:inset 0 1px 0 rgb(255 255 255 / 8%)}.vlc-word-action a,.vlc-word-action button,.vlc-collection-pager button{appearance:none;border:0;background:transparent;color:#45adff;text-decoration:none;font:800 13px/1.2 'Roboto Condensed',Inter,sans-serif;letter-spacing:.12em;text-transform:uppercase;cursor:pointer;padding:12px;touch-action:manipulation}.vlc-word-action a:active,.vlc-word-action button:active,.vlc-collection-pager button:active{color:#f4f7fb}.vlc-word-action a:focus-visible,.vlc-word-action button:focus-visible,.vlc-collection-pager button:focus-visible{outline:2px solid #8fd4ff;outline-offset:2px}.vlc-collection-alert,.vlc-collection-pager p{margin:0;padding:13px 8px;color:#ff5b6e;text-align:center;font:700 12px/1.4 'Roboto Condensed',Inter,sans-serif;text-transform:uppercase;border-top:1px solid #000;box-shadow:inset 0 1px 0 rgb(255 255 255 / 8%)}.vlc-collection-pager{display:grid;justify-items:center;gap:6px;padding:18px 0;border-top:1px solid #000;box-shadow:inset 0 1px 0 rgb(255 255 255 / 8%)}.vlc-collection-pager button:disabled{cursor:wait;color:#9aa5b3}
    @media(min-width:720px){.vlc-collection-shell{padding:92px 22px 44px}.vlc-reel-grid{grid-template-columns:repeat(2,minmax(0,1fr));column-gap:20px}.vlc-reel-record{grid-template-columns:minmax(148px,42%) 1fr;min-height:212px}.vlc-reel-poster{min-height:212px}.vlc-reel-copy{padding:18px}.vlc-reel-copy h2{font-size:21px}}
    @media(min-width:1080px){.vlc-collection-shell{width:min(92vw,1120px);padding-top:104px}.vlc-reel-grid{grid-template-columns:repeat(3,minmax(0,1fr));column-gap:22px}.vlc-reel-record{display:block}.vlc-reel-poster{aspect-ratio:9/12;min-height:0}.vlc-reel-copy{min-height:112px;padding:18px 12px 22px}}
`}</style>; }
