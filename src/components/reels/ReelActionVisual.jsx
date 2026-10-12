const paths = {
  heart: 'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
  comment: 'M21 11.5a8.5 8.5 0 0 1-8.5 8.5 9 9 0 0 1-4-.9L3 21l1.9-5.5a9 9 0 0 1-.9-4A8.5 8.5 0 0 1 12.5 3H13a8.5 8.5 0 0 1 8 8v.5Z',
  share: 'm14 3 8 7-8 7v-4c-5 0-8 2-11 6 0-7 3-11 11-11V3Z',
  bookmark: 'M5 3h14v18l-7-5-7 5V3Z',
  close: 'm6 6 12 12M18 6 6 18',
  back: 'm15 5-7 7 7 7',
  up: 'm6 15 6-6 6 6',
  down: 'm6 9 6 6 6-6',
  play: 'm7 4 14 8-14 8V4Z',
  pause: 'M8 4v16M16 4v16',
  sound: 'm11 5-6 4H2v6h3l6 4V5Zm4 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',
  muted: 'm11 5-6 4H2v6h3l6 4V5Zm5 4 6 6m0-6-6 6',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  follow: 'M12 5v14M5 12h14',
};
export function ReelIcon({ name, filled = false, className }) {
  return <svg className={className} viewBox="0 0 24 24" width="28" height="28" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={name === 'more' ? 5 : 2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.more} />{name === 'comment' && filled ? <><circle cx="8" cy="11" r="1" fill="#161823" stroke="none" /><circle cx="12" cy="11" r="1" fill="#161823" stroke="none" /><circle cx="16" cy="11" r="1" fill="#161823" stroke="none" /></> : null}</svg>;
}
export function formatReelCount(value) {
  if (typeof value !== 'number') return value;
  if (!Number.isFinite(value) || value < 0) return '0';
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}
export default function ReelActionVisual({ icon, count, filled = false }) {
  return <><ReelIcon name={icon} filled={filled || ['heart', 'comment', 'share', 'bookmark'].includes(icon)} /><span className="sp-reel-action-count">{count === undefined || count === null ? null : formatReelCount(count)}</span></>;
}
