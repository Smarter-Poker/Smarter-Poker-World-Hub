import Link from 'next/link';
import { buildReelPath } from '../../lib/reelsFeedClient';

function youtubeId(reel) {
  const stored = String(reel?.youtube_video_id || '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(stored)) return stored;
  const match = String(reel?.video_url || '').match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?v=|shorts\/|embed\/))([A-Za-z0-9_-]{11})/);
  return match?.[1] || null;
}

export default function ReelCard({ reel, onOpen, className = '' }) {
  const id = youtubeId(reel);
  const creator = reel?.channel_name || reel?.profiles?.full_name || reel?.profiles?.username || 'Creator Unavailable';
  const thumbnail = reel?.thumbnail_url || (id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null);
  const native = reel?.playback_type === 'native' || reel?.source_type === 'native';
  const content = (
    <>
      <span className="sp-reel-card__media vlc-reel-card__media">
        {thumbnail ? <img src={thumbnail} alt="" loading="lazy" decoding="async" /> : native ? (
          <video src={reel?.video_url} muted playsInline preload="none" aria-label={reel?.caption || 'Reel preview'} />
        ) : <span>Verified Reel</span>}
        <span className="sp-reel-card__play" aria-hidden="true">▶</span>
      </span>
      <span className="sp-reel-card__creator vlc-reel-card__author">{creator}</span>
      <span className="sp-reel-card__trust" aria-label="Media disclosures">
        {reel?.disclosure_kind && reel.disclosure_kind !== 'organic' ? String(reel.disclosure_kind).replace('_', ' ') : null}
        {reel?.made_for_kids === true ? ' / Made For Kids' : null}
        {['slots', 'casino'].includes(String(reel?.topic || '').toLowerCase()) ? ' / Responsible Play' : null}
      </span>
      <span className="sp-reel-card__caption vlc-reel-card__caption">{reel?.caption || 'Watch Reel'}</span>
    </>
  );
  if (onOpen) {
    return <button type="button" className={`sp-reel-card vlc-reel-card ${className}`.trim()} onClick={() => onOpen(reel)} aria-label={`Open reel by ${creator}`}>{content}</button>;
  }
  return <Link className={`sp-reel-card ${className}`.trim()} href={buildReelPath(reel)} aria-label={`Open reel by ${creator}`}>{content}</Link>;
}
