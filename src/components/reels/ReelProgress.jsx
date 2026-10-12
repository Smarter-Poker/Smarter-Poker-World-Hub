import { useRef, useState } from 'react';
import { reelSeekSeconds } from '../../lib/reelGestureNavigation.mjs';

export default function ReelProgress({ value, isYouTube, videoRef, commandRef }) {
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);
  const draftRef = useRef(0);
  const [draft, setDraft] = useState(0);
  const position = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0;
  const seek = (percent) => {
    if (isYouTube) { commandRef?.current?.('seekToPercent', [percent]); return; }
    const video = videoRef?.current;
    const seconds = reelSeekSeconds(percent, video?.duration);
    if (seconds !== null) video.currentTime = seconds;
  };
  return <input type="range" min="0" max="100" step="0.1" value={dragging ? draft : position}
    aria-label="Video Progress" aria-valuetext={`${Math.round(dragging ? draft : position)} Percent`}
    data-reels-progress
    onPointerDown={(event) => { event.stopPropagation(); draftRef.current = position; setDraft(position); draggingRef.current = true; setDragging(true); event.currentTarget.setPointerCapture?.(event.pointerId); }}
    onChange={(event) => { const next = Number(event.target.value); draftRef.current = next; setDraft(next); if (!draggingRef.current) seek(next); }}
    onPointerUp={(event) => { event.stopPropagation(); if (draggingRef.current) seek(draftRef.current); draggingRef.current = false; setDragging(false); }}
    onPointerCancel={() => { draggingRef.current = false; setDragging(false); }}
    onKeyDown={(event) => event.stopPropagation()} />;
}
