import SEOHead from '../../../src/components/seo/SEOHead';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { Film, Play, RefreshCw, Upload } from 'lucide-react';
import { supabase } from '../../../src/lib/supabase';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PageTransition from '../../../src/components/transitions/PageTransition';
import { getAuthUser } from '../../../src/lib/authUtils';
import { getYouTubeThumbnail } from '../../../src/lib/socialHelpers';

export default function MyReels() {
    const [reels, setReels] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [signedIn, setSignedIn] = useState(true);

    const loadReels = async () => {
        setLoading(true);
        setError('');
        try {
            const authUser = getAuthUser();
            setSignedIn(Boolean(authUser));
            if (!authUser) return;
            const { data, error: queryError } = await supabase
                .from('social_reels')
                .select('id, author_id, caption, video_url, thumbnail_url, view_count, like_count, comment_count, created_at, source_type')
                .eq('author_id', authUser.id)
                .order('created_at', { ascending: false })
                .limit(50);
            if (queryError) throw queryError;
            setReels((data || []).filter(reel => reel.video_url));
        } catch (loadError) {
            console.warn('Error loading reels:', loadError);
            setError('We could not load your reels. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadReels(); }, []);

    return (
        <PageTransition>
            <SEOHead title="My Reels" description="Manage your posted poker reels and short clips." canonical="/hub/reels/my-reels" noindex />
            <main className="wire-page">
                <UniversalHeader pageDepth={2} />
                <div className="wire-shell">
                    <header className="wire-hero">
                        <span className="eyebrow"><span className="live-dot" /> Creator Channel</span>
                        <div className="hero-row">
                            <div><h1>My Reels</h1><p>Your Published Poker Clips, Ready For Review And Playback.</p></div>
                            <Link className="primary" href="/hub/reels?upload=1"><Upload size={17} /> Upload Reel</Link>
                        </div>
                    </header>
                    <section className="signal-bar" aria-label="Collection status"><span>MY CHANNEL</span><strong>{reels.length} SIGNALS</strong></section>
                    {loading ? <State icon={<RefreshCw className="spin" />} text="Tuning your channel…" />
                        : error ? <State icon={<Film />} text={error} action={<button onClick={loadReels}>Try Again</button>} />
                        : !signedIn ? <State icon={<Film />} text="Sign in to see the reels you have published." action={<Link href="/login">Sign In</Link>} />
                        : reels.length === 0 ? <State icon={<Film />} text="Your channel is quiet. Publish your first reel to start the feed." action={<Link href="/hub/reels?upload=1">Upload Reel</Link>} />
                        : <div className="wire-grid">{reels.map((reel, index) => <ReelTile key={reel.id} reel={reel} index={index} />)}</div>}
                </div>
            </main>
            <WireStyles />
        </PageTransition>
    );
}

function ReelTile({ reel, index }) {
    const poster = reel.thumbnail_url || getYouTubeThumbnail(reel.video_url);
    return <Link className="wire-card" href={`/hub/reels?id=${encodeURIComponent(reel.id)}`} aria-label={`Play ${reel.caption || 'reel'}`}>
        <div className="poster" style={poster ? { backgroundImage: `url(${poster})` } : undefined}><span className="channel-no">CH {String(index + 1).padStart(2, '0')}</span><span className="play"><Play size={24} fill="currentColor" /></span></div>
        <div className="card-copy"><h2>{reel.caption?.split('\n')[0] || 'Untitled reel'}</h2><p>{reel.view_count || 0} Views · {reel.like_count || 0} Likes</p></div>
    </Link>;
}

function State({ icon, text, action }) { return <div className="wire-state" role="status">{icon}<p>{text}</p>{action}</div>; }

function WireStyles() { return <style jsx global>{`
    .wire-page{min-height:100dvh;background:#000407;color:#e4edf1;padding-bottom:84px}.wire-shell{width:min(1180px,100%);margin:auto;padding:84px 16px 40px}.wire-hero{border:1px solid #345468;background:linear-gradient(135deg,#061018,#02070b);padding:22px 18px;box-shadow:inset 4px 0 #31c2ff}.eyebrow{font:700 11px/1 monospace;letter-spacing:.18em;text-transform:uppercase;color:#8fb3c5}.live-dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#ff4d5b;box-shadow:0 0 10px #ff4d5b;margin-right:8px}.hero-row{display:flex;gap:20px;align-items:end;justify-content:space-between}.wire-hero h1{font:700 clamp(34px,8vw,66px)/.95 'Arial Narrow',Arial,sans-serif;letter-spacing:-.03em;text-transform:uppercase;margin:14px 0 8px}.wire-hero p{color:#9aadb8;margin:0;max-width:580px}.primary,.wire-state a,.wire-state button{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 16px;border:1px solid #31c2ff;background:#071822;color:#e4edf1;text-decoration:none;font:700 12px monospace;letter-spacing:.08em;text-transform:uppercase;cursor:pointer}.signal-bar{display:flex;justify-content:space-between;border:1px solid #345468;border-top:0;padding:11px 14px;color:#7f9bab;font:700 10px monospace;letter-spacing:.15em}.signal-bar strong{color:#31c2ff}.wire-grid{display:grid;grid-template-columns:1fr;gap:12px;margin-top:16px}.wire-card{color:inherit;text-decoration:none;border:1px solid #284758;background:#061018;display:grid;grid-template-columns:112px 1fr;min-height:150px;transition:.2s}.wire-card:hover,.wire-card:focus-visible{border-color:#31c2ff;transform:translateY(-2px);outline:none}.poster{position:relative;background:#0a1820 center/cover no-repeat;min-height:150px}.poster:after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,transparent,#061018)}.channel-no{position:absolute;z-index:1;top:9px;left:9px;background:#000b;padding:4px 6px;color:#9ddfff;font:700 9px monospace}.play{position:absolute;z-index:2;left:50%;top:50%;translate:-50% -50%;width:46px;height:46px;border-radius:50%;display:grid;place-items:center;background:#31c2ff;color:#001018;box-shadow:0 0 24px #31c2ff66}.card-copy{padding:16px 14px;align-self:end}.card-copy h2{font:700 18px/1.15 'Arial Narrow',Arial,sans-serif;text-transform:uppercase;margin:0 0 10px}.card-copy p{font:11px monospace;color:#81939e;margin:0}.wire-state{min-height:280px;border:1px solid #284758;background:#03090d;margin-top:16px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;text-align:center;padding:30px;color:#9aadb8}.wire-state svg{color:#31c2ff;width:34px;height:34px}.wire-state p{max-width:420px}.spin{animation:wire-spin 1s linear infinite}@keyframes wire-spin{to{transform:rotate(360deg)}}
    @media(min-width:720px){.wire-shell{padding-inline:24px}.wire-hero{padding:34px}.wire-grid{grid-template-columns:repeat(2,1fr)}.wire-card{grid-template-columns:160px 1fr;min-height:210px}.poster{min-height:210px}}
    @media(min-width:1080px){.wire-grid{grid-template-columns:repeat(3,1fr)}.wire-card{display:block}.poster{aspect-ratio:9/12}.poster:after{background:linear-gradient(transparent 65%,#061018)}.card-copy{min-height:94px}}
    @media(max-width:560px){.hero-row{display:block}.primary{margin-top:18px;width:100%}}
`}</style>; }
