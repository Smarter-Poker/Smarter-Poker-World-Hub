import SEOHead from '../../../src/components/seo/SEOHead';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Bookmark, Play, RefreshCw, Trash2 } from 'lucide-react';
import { savedReelsService } from '../../../src/services/preferences-service';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { getAuthUser } from '../../../src/lib/authUtils';
import { getYouTubeThumbnail } from '../../../src/lib/socialHelpers';

export default function SavedReels() {
    const [user, setUser] = useState(null);
    const [savedReels, setSavedReels] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const loadSavedReels = async () => {
        setLoading(true); setError('');
        try {
            const authUser = getAuthUser();
            setUser(authUser);
            if (!authUser) return;
            setSavedReels(await savedReelsService.getSavedReels(authUser.id));
        } catch (loadError) {
            console.warn('Error loading saved reels:', loadError);
            setError('We could not load your saved reel collection.');
        } finally { setLoading(false); }
    };
    useEffect(() => { loadSavedReels(); }, []);
    const unsaveReel = async (reelId) => {
        if (!user) return;
        const previous = savedReels;
        setSavedReels(items => items.filter(item => item.reel_id !== reelId));
        try { await savedReelsService.unsaveReel(user.id, reelId); }
        catch (saveError) { setSavedReels(previous); setError('That reel could not be removed. Please retry.'); }
    };
    return <PageTransition>
        <SEOHead title="Saved Reels" description="View your saved poker reels and short clips." canonical="/hub/reels/saved" noindex />
        <main className="saved-wire"><UniversalHeader pageDepth={2} /><div className="saved-shell">
            <header className="saved-hero"><span><i /> Personal Archive</span><h1>Saved Reels</h1><p>Your Watch-Later Signal Bank, Synchronized To Your Account.</p></header>
            <div className="saved-meter"><b>ARCHIVE ONLINE</b><span>{savedReels.length} SAVED</span></div>
            {loading ? <SavedState icon={<RefreshCw className="spin" />} text="Synchronizing your archive…" />
                : error ? <SavedState icon={<Bookmark />} text={error} action={<button onClick={loadSavedReels}>Try Again</button>} />
                : !user ? <SavedState icon={<Bookmark />} text="Sign in to open your saved reel archive." action={<Link href="/login">Sign In</Link>} />
                : savedReels.length === 0 ? <SavedState icon={<Bookmark />} text="No saved signals yet. Save a reel and it will appear here." action={<Link href="/hub/reels">Explore Reels</Link>} />
                : <div className="saved-grid">{savedReels.map((item, index) => <SavedTile key={item.id} item={item} index={index} onRemove={unsaveReel} />)}</div>}
        </div></main><SavedStyles /></PageTransition>;
}

function SavedTile({ item, index, onRemove }) {
    const reel = item.reel;
    const poster = reel.thumbnail_url || getYouTubeThumbnail(reel.video_url);
    return <article className="saved-card"><Link href={`/hub/reels?id=${encodeURIComponent(reel.id)}`} className="saved-link">
        <div className="saved-poster" style={poster ? { backgroundImage: `url(${poster})` } : undefined}><span>SV {String(index + 1).padStart(2, '0')}</span><i><Play size={22} fill="currentColor" /></i></div>
        <div><h2>{reel.caption?.split('\n')[0] || 'Saved reel'}</h2><p>{reel.like_count || 0} Likes · Saved {new Date(item.saved_at).toLocaleDateString()}</p></div>
    </Link><button className="remove" onClick={() => onRemove(item.reel_id)} aria-label={`Remove ${reel.caption || 'reel'} from saved reels`}><Trash2 size={17} /> Remove</button></article>;
}
function SavedState({ icon, text, action }) { return <div className="saved-state" role="status">{icon}<p>{text}</p>{action}</div>; }
function SavedStyles(){return <style jsx global>{`
 .saved-wire{min-height:100dvh;background:#000407;color:#e4edf1;padding-bottom:84px}.saved-shell{width:min(1180px,100%);margin:auto;padding:84px 16px 40px}.saved-hero{padding:24px 18px;border:1px solid #345468;background:radial-gradient(circle at 85% 20%,#102c3c 0,transparent 38%),#061018;box-shadow:inset 4px 0 #31c2ff}.saved-hero>span{color:#8fb3c5;font:700 11px monospace;letter-spacing:.17em;text-transform:uppercase}.saved-hero>span i{display:inline-block;width:7px;height:7px;border-radius:50%;background:#31c2ff;box-shadow:0 0 12px #31c2ff;margin-right:8px}.saved-hero h1{font:700 clamp(34px,8vw,66px)/.95 'Arial Narrow',Arial,sans-serif;text-transform:uppercase;margin:16px 0 8px}.saved-hero p{margin:0;color:#9aadb8}.saved-meter{display:flex;justify-content:space-between;padding:11px 14px;border:1px solid #345468;border-top:0;font:700 10px monospace;letter-spacing:.14em;color:#7994a2}.saved-meter span{color:#31c2ff}.saved-grid{display:grid;gap:12px;margin-top:16px}.saved-card{position:relative;border:1px solid #284758;background:#061018;overflow:hidden}.saved-link{display:grid;grid-template-columns:112px 1fr;min-height:150px;color:inherit;text-decoration:none}.saved-link:focus-visible{outline:2px solid #31c2ff;outline-offset:-2px}.saved-poster{position:relative;min-height:150px;background:#07131a center/cover}.saved-poster:after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,transparent,#061018)}.saved-poster>span{position:absolute;z-index:2;top:9px;left:9px;padding:4px 6px;background:#000b;color:#9ddfff;font:700 9px monospace}.saved-poster>i{position:absolute;z-index:2;display:grid;place-items:center;width:44px;height:44px;border-radius:50%;left:50%;top:50%;translate:-50% -50%;background:#31c2ff;color:#001018}.saved-link>div:last-child{align-self:center;padding:16px 14px 48px}.saved-link h2{font:700 18px/1.15 'Arial Narrow',Arial,sans-serif;text-transform:uppercase;margin:0 0 10px}.saved-link p{font:11px monospace;color:#81939e;margin:0}.remove{position:absolute;right:12px;bottom:10px;display:flex;align-items:center;gap:7px;min-height:38px;border:0;background:transparent;color:#ff7b86;font:700 10px monospace;text-transform:uppercase;cursor:pointer}.remove:hover,.remove:focus-visible{color:#fff;outline:1px solid #ff4d5b}.saved-state{min-height:280px;margin-top:16px;border:1px solid #284758;background:#03090d;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;text-align:center;padding:30px;color:#9aadb8}.saved-state svg{width:34px;height:34px;color:#31c2ff}.saved-state p{max-width:420px}.saved-state a,.saved-state button{display:inline-grid;place-items:center;min-height:44px;padding:0 18px;border:1px solid #31c2ff;background:#071822;color:#e4edf1;text-decoration:none;font:700 11px monospace;text-transform:uppercase;cursor:pointer}.spin{animation:saved-spin 1s linear infinite}@keyframes saved-spin{to{transform:rotate(360deg)}}
 @media(min-width:720px){.saved-shell{padding-inline:24px}.saved-hero{padding:34px}.saved-grid{grid-template-columns:repeat(2,1fr)}.saved-link{grid-template-columns:155px 1fr;min-height:210px}.saved-poster{min-height:210px}}
 @media(min-width:1080px){.saved-grid{grid-template-columns:repeat(3,1fr)}.saved-link{display:block}.saved-poster{aspect-ratio:9/12}.saved-poster:after{background:linear-gradient(transparent 65%,#061018)}.saved-link>div:last-child{min-height:96px}}
`}</style>}
