/*
 * THE FULL-SCREEN PHOTO VIEWER (2026-11-09).
 *
 * Opened from a thread bubble. It shows the original file, not the fitted
 * copy the thread draws, because this is where a photo is looked at closely.
 *
 * The gallery is every photo currently rendered in the conversation, read
 * from the DOM when the viewer opens. That is deliberately not a prop: the
 * set a person expects to page through is "the photos I can see in this
 * chat", which is exactly what is mounted, and threading a gallery through
 * every bubble would couple the list to the page for no gain.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    MIN_SCALE, clampScale, clampOffset, nextIndex, offsetForScaleAbout,
    pinchScale, pointerDistance, pointerMidpoint, swipeIntent, toggleScale,
} from '../../lib/messenger/viewerGestures.mjs';

export const ATTACHMENT_ATTRIBUTE = 'data-message-attachment';

/** Every photo currently mounted in the thread, in the order they appear. */
export function galleryFromDocument(scope) {
    if (typeof document === 'undefined') return [];
    const root = scope || document;
    return [...root.querySelectorAll(`img[${ATTACHMENT_ATTRIBUTE}]`)]
        .map(node => node.getAttribute(ATTACHMENT_ATTRIBUTE))
        .filter(Boolean);
}

export default function MediaViewer({ url, label = 'Photo', onClose }) {
    const gallery = useMemo(() => {
        const found = galleryFromDocument();
        return found.includes(url) ? found : [url];
    }, [url]);
    const [index, setIndex] = useState(() => Math.max(0, gallery.indexOf(url)));
    const [scale, setScale] = useState(MIN_SCALE);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [natural, setNatural] = useState(null);
    const frame = useRef(null);
    const pointers = useRef(new Map());
    const pinch = useRef(null);
    const drag = useRef(null);
    const current = gallery[index] || url;

    const reset = useCallback(() => { setScale(MIN_SCALE); setOffset({ x: 0, y: 0 }); setNatural(null); }, []);
    const go = useCallback(step => {
        setIndex(previous => {
            const next = nextIndex(previous, step, gallery.length);
            if (next !== previous) reset();
            return next;
        });
    }, [gallery.length, reset]);

    // Escape closes; the arrows page. The page behind is held still so the
    // thread is exactly where it was when the viewer closes.
    useEffect(() => {
        if (typeof document === 'undefined') return undefined;
        const key = event => {
            if (event.key === 'Escape') onClose?.();
            else if (event.key === 'ArrowRight') go(1);
            else if (event.key === 'ArrowLeft') go(-1);
        };
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        document.addEventListener('keydown', key);
        return () => {
            document.removeEventListener('keydown', key);
            document.body.style.overflow = previousOverflow;
        };
    }, [go, onClose]);

    const frameBox = () => {
        const box = frame.current?.getBoundingClientRect();
        return box ? { width: box.width, height: box.height } : null;
    };
    const settle = (nextScale, nextOffset) => {
        const bounded = clampScale(nextScale);
        setScale(bounded);
        setOffset(clampOffset(nextOffset, bounded, frameBox(), natural));
    };

    const onPointerDown = event => {
        event.currentTarget.setPointerCapture?.(event.pointerId);
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()];
            pinch.current = { distance: pointerDistance(a, b), scale, anchor: pointerMidpoint(a, b), offset };
            drag.current = null;
        } else if (pointers.current.size === 1) {
            drag.current = { x: event.clientX, y: event.clientY, offset, scale };
        }
    };
    const onPointerMove = event => {
        if (!pointers.current.has(event.pointerId)) return;
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pinch.current && pointers.current.size === 2) {
            const [a, b] = [...pointers.current.values()];
            const target = pinchScale(pinch.current.distance, pointerDistance(a, b), pinch.current.scale);
            settle(target, offsetForScaleAbout(pinch.current.offset, pinch.current.anchor, pinch.current.scale, target));
        } else if (drag.current && pointers.current.size === 1 && drag.current.scale > MIN_SCALE) {
            settle(scale, {
                x: drag.current.offset.x + (event.clientX - drag.current.x),
                y: drag.current.offset.y + (event.clientY - drag.current.y),
            });
        }
    };
    const onPointerUp = event => {
        const start = drag.current;
        pointers.current.delete(event.pointerId);
        if (pointers.current.size < 2) pinch.current = null;
        if (pointers.current.size === 0 && start) {
            const step = swipeIntent(event.clientX - start.x, event.clientY - start.y, start.scale);
            if (step) go(step);
            drag.current = null;
        }
    };
    // A trackpad pinch arrives as a ctrl-wheel.
    const onWheel = event => {
        if (!event.ctrlKey) return;
        event.preventDefault();
        const target = clampScale(scale * (1 - event.deltaY / 240));
        settle(target, offsetForScaleAbout(offset, { x: 0, y: 0 }, scale, target));
    };

    if (typeof document === 'undefined') return null;
    const arrow = side => ({
        position: 'fixed', top: '50%', [side]: 8, transform: 'translateY(-50%)',
        width: 44, height: 44, borderRadius: '50%', border: 'none', cursor: 'pointer',
        background: 'rgba(255,255,255,0.14)', color: 'white', fontSize: 22, lineHeight: 1,
    });
    return createPortal(
        <div
            role="dialog"
            aria-modal="true"
            aria-label={gallery.length > 1 ? `${label} ${index + 1} of ${gallery.length}` : label}
            onClick={() => onClose?.()}
            style={{
                position: 'fixed', inset: 0, zIndex: 2147483000, background: 'rgba(0,0,0,0.92)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
                overscrollBehavior: 'contain', touchAction: 'none',
            }}
        >
            <div
                ref={frame}
                onClick={event => event.stopPropagation()}
                onDoubleClick={event => {
                    event.stopPropagation();
                    const target = toggleScale(scale);
                    settle(target, target === MIN_SCALE ? { x: 0, y: 0 } : offset);
                }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onWheel={onWheel}
                style={{
                    width: '100%', height: '100%', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', overflow: 'hidden', touchAction: 'none',
                }}
            >
                <img
                    key={current}
                    src={current}
                    alt={label}
                    draggable={false}
                    onLoad={event => setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
                    style={{
                        maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8,
                        transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                        transition: pinch.current || drag.current ? 'none' : 'transform 160ms ease-out',
                        cursor: scale > MIN_SCALE ? 'grab' : 'zoom-in', userSelect: 'none',
                    }}
                />
            </div>
            {gallery.length > 1 && (
                <>
                    <button type="button" aria-label="Previous Photo" disabled={index === 0}
                        onClick={event => { event.stopPropagation(); go(-1); }}
                        style={{ ...arrow('left'), opacity: index === 0 ? 0.3 : 1 }}>‹</button>
                    <button type="button" aria-label="Next Photo" disabled={index === gallery.length - 1}
                        onClick={event => { event.stopPropagation(); go(1); }}
                        style={{ ...arrow('right'), opacity: index === gallery.length - 1 ? 0.3 : 1 }}>›</button>
                    <div aria-hidden="true" style={{
                        position: 'fixed', bottom: 'calc(env(safe-area-inset-bottom, 0px) + 14px)', left: 0, right: 0,
                        textAlign: 'center', color: 'rgba(255,255,255,0.75)', fontSize: 13, pointerEvents: 'none',
                    }}>{index + 1} / {gallery.length}</div>
                </>
            )}
            <button
                type="button"
                aria-label="Close Photo"
                onClick={event => { event.stopPropagation(); onClose?.(); }}
                style={{
                    position: 'fixed', top: 'calc(env(safe-area-inset-top, 0px) + 12px)', right: 12,
                    width: 44, height: 44, borderRadius: '50%', border: 'none', cursor: 'pointer',
                    background: 'rgba(255,255,255,0.14)', color: 'white', fontSize: 22, lineHeight: 1,
                }}
            >×</button>
        </div>,
        document.body,
    );
}
MediaViewer.displayName = 'MediaViewer';
