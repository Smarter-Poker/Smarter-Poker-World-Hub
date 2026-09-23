import SEOHead from '../../../src/components/seo/SEOHead';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { savedReelsService } from '../../../src/services/preferences-service';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { getAuthUser } from '../../../src/lib/authUtils';
import { supabase } from '../../../src/lib/supabase';
import { getYouTubeThumbnail } from '../../../src/lib/socialHelpers';
import { createLatestRequestGuard } from '../../../src/lib/latestRequestGuard.mjs';
import { createReelAccountScope } from '../../../src/lib/reelAccountScope.mjs';
import VideoLibraryConsole, {
    ConsoleCopy,
    ConsoleDataRow,
} from '../../../src/components/video-library/console/VideoLibraryConsole';
import ReelCollectionCommandRail from '../../../src/components/reels/ReelCollectionCommandRail';

export default function SavedReels() {
    const router = useRouter();
    const [user, setUser] = useState(null);
    const [authReady, setAuthReady] = useState(false);
    const [savedReels, setSavedReels] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState('');
    const [paginationError, setPaginationError] = useState('');
    const [hasMore, setHasMore] = useState(false);
    const requestGuardRef = useRef(null);
    const nextCursorRef = useRef(null);
    const collectionOwnerIdRef = useRef(null);
    const authUserRef = useRef(null);
    const accountScopeRef = useRef(null);
    if (!requestGuardRef.current) requestGuardRef.current = createLatestRequestGuard();
    if (!accountScopeRef.current) accountScopeRef.current = createReelAccountScope();

    const bindAuthUser = useCallback((nextUser) => {
        const next = nextUser?.id ? nextUser : null;
        const binding = accountScopeRef.current.bind(next?.id);
        authUserRef.current = next;
        if (binding.changed) {
            requestGuardRef.current.abort();
            collectionOwnerIdRef.current = null;
            nextCursorRef.current = null;
            setSavedReels([]);
            setHasMore(false);
            setLoadingMore(false);
            setPaginationError('');
            setError('');
        }
        setUser(next);
    }, []);

    const loadSavedReels = useCallback(async ({ append = false } = {}) => {
        const authUser = authUserRef.current;
        const ownerRequest = accountScopeRef.current.capture(authUser?.id);
        const accountChanged = Boolean(collectionOwnerIdRef.current)
            && collectionOwnerIdRef.current !== (authUser?.id || null);
        const appendRequest = append
            && Boolean(authUser?.id)
            && collectionOwnerIdRef.current === authUser.id;
        const cursor = appendRequest ? nextCursorRef.current : null;
        if (appendRequest && !cursor) return;
        const request = requestGuardRef.current.begin({ append: appendRequest });
        if (!request) return;
        if (appendRequest) setLoadingMore(true);
        else {
            setLoading(true);
            setLoadingMore(false);
            if (accountChanged) {
                setSavedReels([]);
                setHasMore(false);
                nextCursorRef.current = null;
            }
            collectionOwnerIdRef.current = null;
        }
        if (!appendRequest) setError('');
        setPaginationError('');
        try {
            if (!request.isCurrent() || !ownerRequest.isCurrent()) return;
            if (!authUser) {
                setSavedReels([]);
                setHasMore(false);
                nextCursorRef.current = null;
                collectionOwnerIdRef.current = null;
                return;
            }
            const page = await savedReelsService.getSavedReelsPage(authUser.id, {
                cursor,
                limit: 50,
                signal: request.signal,
            });
            if (!request.isCurrent() || !ownerRequest.isCurrent()) return;
            if (page.data.some(item => item?.user_id !== ownerRequest.ownerId)) {
                throw new Error('Saved Reels response owner mismatch');
            }
            setSavedReels(current => appendRequest
                ? mergeSavedRows(current, page.data)
                : mergeSavedRows([], page.data));
            setHasMore(page.hasMore);
            nextCursorRef.current = page.nextCursor;
            collectionOwnerIdRef.current = ownerRequest.ownerId;
        } catch (loadError) {
            if (!request.isCurrent() || !ownerRequest.isCurrent() || loadError?.name === 'AbortError') return;
            console.warn('Error loading saved reels:', loadError);
            if (appendRequest) setPaginationError('More Saved Reels Could Not Be Loaded. Please Retry.');
            else setError('We Could Not Load Your Saved Reel Collection.');
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
        loadSavedReels();
        return () => requestGuardRef.current?.abort();
    }, [authReady, loadSavedReels, user?.id]);

    const unsaveReel = async (reelId) => {
        const ownerRequest = accountScopeRef.current.capture(user?.id);
        if (!ownerRequest.ownerId || !ownerRequest.isCurrent()) return;
        const removedIndex = savedReels.findIndex(item => item.reel_id === reelId);
        const removed = removedIndex >= 0 ? savedReels[removedIndex] : null;
        setSavedReels(items => items.filter(item => item.reel_id !== reelId));
        try {
            await savedReelsService.unsaveReel(
                ownerRequest.ownerId,
                removed?.saved_target_ids || removed?.saved_target_id || reelId,
            );
        } catch (saveError) {
            console.warn('[SavedReels] Remove failed:', saveError?.message || saveError);
            if (!ownerRequest.isCurrent() || !removed) return;
            setSavedReels(current => {
                if (current.some(item => item.id === removed.id)) return current;
                const restored = [...current];
                restored.splice(Math.min(removedIndex, restored.length), 0, removed);
                return restored;
            });
            setError('That Reel Could Not Be Removed. Please Retry.');
        }
    };

    return <PageTransition>
        <SEOHead title="Saved Reels" description="View your saved poker reels and short clips." canonical="/hub/reels/saved" noindex />
        <main className="vlc-collection-page">
            <UniversalHeader pageDepth={2} />
            <div className="vlc-collection-shell">
                <VideoLibraryConsole
                    titleAs="h1"
                    eyebrow="Personal Archive"
                    title="Saved Reels"
                    titleId="saved-reels-title"
                    subtitle="Your Watch Later Collection, Synchronized To This Account"
                    pill={`${compactCount(savedReels.length)} Saved`}
                    pillInk="gold"
                    foot="plates"
                    plates={{
                        secondary: { label: 'Browse Reels', onClick: () => router.push('/hub/reels'), ink: 'silver' },
                        primary: { label: 'My Reels', onClick: () => router.push('/hub/reels/my-reels'), ink: 'white' },
                    }}
                    aria-labelledby="saved-reels-title"
                >
                    <ReelCollectionCommandRail />
                    <ConsoleDataRow label="Archive Status" value={user ? 'Account Synchronized' : 'Sign In Required'} valueInk={user ? 'green' : 'gold'} />
                    <ConsoleDataRow label="Saved In View" value={compactCount(savedReels.length)} valueInk="blue" />
                    {error && savedReels.length > 0 ? <p className="vlc-collection-alert" role="alert">{error}</p> : null}
                    {loading ? <CollectionState text="Synchronizing Your Saved Reel Archive" />
                        : error && savedReels.length === 0 ? <CollectionState text={error} action={<button type="button" onClick={() => loadSavedReels()}>Try Again</button>} />
                        : !user ? <CollectionState text="Sign In To Open Your Saved Reel Archive" action={<Link href="/login">Sign In</Link>} />
                        : savedReels.length === 0 && hasMore ? <CollectionState text="More Archive Records Remain To Be Checked" action={<button type="button" onClick={() => loadSavedReels({ append: true })}>Continue Scan</button>} />
                        : savedReels.length === 0 ? <CollectionState text="No Saved Reels Yet. Save A Reel And It Will Appear Here" action={<Link href="/hub/reels">Explore Reels</Link>} />
                        : <>
                            <div className="vlc-reel-grid">{savedReels.map((item, index) => <SavedTile key={item.id} item={item} index={index} onRemove={unsaveReel} />)}</div>
                            <CollectionPager
                                hasMore={hasMore}
                                loading={loadingMore}
                                error={paginationError}
                                onLoadMore={() => loadSavedReels({ append: true })}
                            />
                        </>}
                </VideoLibraryConsole>
            </div>
        </main>
        <CollectionStyles />
    </PageTransition>;
}

function mergeSavedRows(current, incoming) {
    const byReelId = new Map(current.map(row => [row.reel_id, row]));
    for (const row of incoming) {
        if (!row?.reel_id) continue;
        const existing = byReelId.get(row.reel_id);
        byReelId.set(row.reel_id, existing ? {
            ...existing,
            saved_target_ids: [...new Set([
                ...(existing.saved_target_ids || [existing.saved_target_id].filter(Boolean)),
                ...(row.saved_target_ids || [row.saved_target_id].filter(Boolean)),
            ])],
        } : row);
    }
    return [...byReelId.values()];
}

function SavedTile({ item, index, onRemove }) {
    const reel = item.reel;
    const poster = reel.thumbnail_url || getYouTubeThumbnail(reel.video_url);
    return <article className="vlc-reel-record vlc-reel-record-saved">
        <Link href={`/hub/reels?id=${encodeURIComponent(reel.id)}`} className="vlc-saved-link" aria-label={`Play ${reel.caption || 'reel'}`}>
            <div className="vlc-reel-poster">
                {poster ? <img src={poster} alt="" loading="lazy" /> : <span className="vlc-reel-no-poster">Preview Pending</span>}
                <span className="vlc-reel-index">Saved {index + 1}</span>
                <span className="vlc-reel-command">Open Reel</span>
            </div>
            <div className="vlc-reel-copy">
                <h2>{reel.caption?.split('\n')[0] || 'Saved Reel'}</h2>
                <p>{compactCount(reel.like_count || 0)} Likes  /  Saved {new Date(item.saved_at).toLocaleDateString()}</p>
            </div>
        </Link>
        <button className="vlc-remove-command" type="button" onClick={() => onRemove(item.reel_id)} aria-label={`Remove ${reel.caption || 'reel'} from saved reels`}>Remove From Saved</button>
    </article>;
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
            {loading ? 'Loading More Saved Reels' : error ? 'Retry Load More' : 'Load More Saved Reels'}
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
    .vlc-collection-page{min-height:100dvh;background:#000;color:#e4e7ec;padding-bottom:84px;font-family:Inter,system-ui,sans-serif}.vlc-collection-shell{width:min(100%,1120px);margin:0 auto;padding:78px 8px 28px}.vlc-reel-grid{display:grid;grid-template-columns:1fr;gap:0}.vlc-reel-record{position:relative;display:grid;grid-template-columns:minmax(112px,34%) 1fr;min-height:166px;color:inherit;text-decoration:none;border-top:1px solid #000;box-shadow:inset 0 1px 0 rgb(255 255 255 / 8%);background:transparent}.vlc-reel-record-saved{display:block}.vlc-saved-link{display:grid;grid-template-columns:minmax(112px,34%) 1fr;min-height:166px;color:inherit;text-decoration:none}.vlc-saved-link:active .vlc-reel-command{color:#f4f7fb}.vlc-saved-link:focus-visible{outline:2px solid #8fd4ff;outline-offset:-3px}.vlc-reel-poster{position:relative;min-height:166px;overflow:hidden;background:#000}.vlc-reel-poster img{width:100%;height:100%;object-fit:cover;display:block}.vlc-reel-no-poster{position:absolute;inset:0;display:grid;place-items:center;color:#9aa5b3;font:700 11px/1.2 'Roboto Condensed',Inter,sans-serif;letter-spacing:.12em;text-transform:uppercase}.vlc-reel-index,.vlc-reel-command{position:absolute;left:8px;padding:4px 6px;background:rgb(0 0 0 / 76%);font:800 10px/1.1 'Roboto Condensed',Inter,sans-serif;letter-spacing:.08em;text-transform:uppercase;text-shadow:0 1px 2px #000}.vlc-reel-index{top:8px;color:#45adff}.vlc-reel-command{bottom:8px;color:#e4e7ec}.vlc-reel-copy{align-self:end;padding:14px 12px 50px;min-width:0}.vlc-reel-copy h2{margin:0 0 10px;color:#e4e7ec;font:800 18px/1.05 'Roboto Condensed',Inter,sans-serif;letter-spacing:.03em;text-transform:uppercase;overflow-wrap:anywhere;text-shadow:0 -1px 0 rgb(255 255 255 / 35%),0 2px 0 #050607}.vlc-reel-copy p{margin:0;color:#9aa5b3;font:700 10px/1.45 'Roboto Condensed',Inter,sans-serif;letter-spacing:.06em;text-transform:uppercase}.vlc-remove-command{position:absolute;right:10px;bottom:8px;appearance:none;border:0;background:transparent;color:#ff5b6e;font:800 10px/1.2 'Roboto Condensed',Inter,sans-serif;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;padding:10px;touch-action:manipulation}.vlc-remove-command:active{color:#f4f7fb}.vlc-remove-command:focus-visible{outline:2px solid #ff5b6e;outline-offset:1px}.vlc-collection-state{min-height:238px;display:grid;place-content:center;justify-items:center;gap:18px;padding:24px 8px;text-align:center;border-top:1px solid #000;box-shadow:inset 0 1px 0 rgb(255 255 255 / 8%)}.vlc-word-action a,.vlc-word-action button,.vlc-collection-pager button{appearance:none;border:0;background:transparent;color:#45adff;text-decoration:none;font:800 13px/1.2 'Roboto Condensed',Inter,sans-serif;letter-spacing:.12em;text-transform:uppercase;cursor:pointer;padding:12px;touch-action:manipulation}.vlc-word-action a:active,.vlc-word-action button:active,.vlc-collection-pager button:active{color:#f4f7fb}.vlc-word-action a:focus-visible,.vlc-word-action button:focus-visible,.vlc-collection-pager button:focus-visible{outline:2px solid #8fd4ff;outline-offset:2px}.vlc-collection-alert,.vlc-collection-pager p{margin:0;padding:13px 8px;color:#ff5b6e;text-align:center;font:700 12px/1.4 'Roboto Condensed',Inter,sans-serif;text-transform:uppercase;border-top:1px solid #000;box-shadow:inset 0 1px 0 rgb(255 255 255 / 8%)}.vlc-collection-pager{display:grid;justify-items:center;gap:6px;padding:18px 0;border-top:1px solid #000;box-shadow:inset 0 1px 0 rgb(255 255 255 / 8%)}.vlc-collection-pager button:disabled{cursor:wait;color:#9aa5b3}
    @media(min-width:720px){.vlc-collection-shell{padding:92px 22px 44px}.vlc-reel-grid{grid-template-columns:repeat(2,minmax(0,1fr));column-gap:20px}.vlc-saved-link{grid-template-columns:minmax(148px,42%) 1fr;min-height:212px}.vlc-reel-poster{min-height:212px}.vlc-reel-copy{padding:18px 18px 54px}.vlc-reel-copy h2{font-size:21px}}
    @media(min-width:1080px){.vlc-collection-shell{width:min(92vw,1120px);padding-top:104px}.vlc-reel-grid{grid-template-columns:repeat(3,minmax(0,1fr));column-gap:22px}.vlc-saved-link{display:block}.vlc-reel-poster{aspect-ratio:9/12;min-height:0}.vlc-reel-copy{min-height:112px;padding:18px 12px 52px}}
`}</style>; }
