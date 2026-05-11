/**
 * ScheduleLiveModal — Schedule a future live stream
 * Lets broadcasters pick a date/time, title, thumbnail, and description.
 * Notifies followers automatically when scheduled.
 */
import { useState, useRef, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { getAccessToken } from '../../lib/authUtils';

const C = {
    bg: '#0A0A1A',
    card: '#12122A',
    blue: '#0066FF',
    text: '#FFFFFF',
    textSec: 'rgba(255,255,255,0.55)',
    border: 'rgba(255,255,255,0.12)',
    red: '#FA383E',
};

export function ScheduleLiveModal({ isOpen, onClose, user }) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [scheduledDate, setScheduledDate] = useState('');
    const [scheduledTime, setScheduledTime] = useState('');
    const [thumbnailUrl, setThumbnailUrl] = useState('');
    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState('');
    const thumbnailRef = useRef(null);
    // BUG FIX (ESM-1): track auto-close timer so it can be cancelled on unmount
    const closeTimerRef = useRef(null);

    // Cancel the auto-close timer if the component unmounts before it fires
    useEffect(() => {
        return () => {
            if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
        };
    }, []);

    if (!isOpen) return null;

    const handleThumbnailUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file || !user?.id) return;
        // BUG-FIX-DEEP-AUDIT-R5 SLM-1: client-side MIME + size validation.
        // Round 2 locked the live-recordings bucket to video MIME types
        // which silently broke this thumbnail upload until R5's migration
        // restored image/jpeg, image/png, image/webp. Defend the client
        // side too: a 50MB camera-roll image is a slow upload + a waste
        // of bandwidth + the bucket's separate file size cap may reject it.
        const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
        if (!ALLOWED.includes(file.type)) {
            setError('Please choose a JPEG, PNG, or WebP image');
            return;
        }
        const MAX_BYTES = 8 * 1024 * 1024;  // 8 MB
        if (file.size > MAX_BYTES) {
            setError('Image is too large (max 8 MB)');
            return;
        }
        setError('');
        const filename = `${user.id}/scheduled-${Date.now()}.jpg`;
        const { error: uploadErr } = await supabase.storage
            .from('live-recordings')
            .upload(filename, file, { contentType: file.type, upsert: true });
        if (uploadErr) {
            // BUG-FIX-DEEP-AUDIT-R5 SLM-1: surface the failure to the user.
            // The previous code silently no-op'd which is how the round-2
            // bucket regression went undetected for so long.
            console.warn('[ScheduleLiveModal] thumbnail upload failed:', uploadErr.message);
            setError(`Thumbnail upload failed: ${uploadErr.message}`);
            return;
        }
        const { data: urlData } = supabase.storage.from('live-recordings').getPublicUrl(filename);
        setThumbnailUrl(urlData.publicUrl);
    };

    const handleSchedule = async () => {
        if (!title || !scheduledDate || !scheduledTime) {
            setError('Please fill in title, date, and time');
            return;
        }
        const scheduled_at = new Date(`${scheduledDate}T${scheduledTime}`).toISOString();
        if (new Date(scheduled_at) < new Date(Date.now() + 5 * 60 * 1000)) {
            setError('Scheduled time must be at least 5 minutes from now');
            return;
        }
        setSaving(true);
        setError('');
        try {
            const token = getAccessToken();
            const resp = await fetch('/api/live/schedule', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                credentials: 'same-origin',
                body: JSON.stringify({ title, description, thumbnail_url: thumbnailUrl, scheduled_at }),
            });
            const data = await resp.json();
            if (!resp.ok) throw new Error(data.error || 'Failed to schedule');
            setSuccess(true);
            // BUG FIX (ESM-1): track timer so parent unmounting before 2s doesn't leak
            if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
            closeTimerRef.current = setTimeout(() => {
                closeTimerRef.current = null;
                onClose(data.data);
            }, 2000);
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    // Minimum date: now
    const minDate = new Date().toISOString().split('T')[0];

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
            zIndex: 10000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            overflowY: 'auto', padding: 'max(20px, env(safe-area-inset-top, 20px)) 16px max(20px, env(safe-area-inset-bottom, 20px))',
        }}>
            <div style={{
                background: C.card,
                border: `1px solid ${C.border}`,
                borderRadius: 24,
                padding: 28,
                width: '100%',
                maxWidth: 460,
                maxHeight: '90vh',
                overflowY: 'auto',
            }}>
                {success ? (
                    <div style={{ textAlign: 'center', padding: '32px 0' }}>
                        <div style={{ fontSize: 52, marginBottom: 16 }}>📅</div>
                        <div style={{ color: C.text, fontSize: 20, fontWeight: 700 }}>Live Scheduled!</div>
                        <div style={{ color: C.textSec, fontSize: 14, marginTop: 8 }}>
                            Your followers have been notified.
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                            <h2 style={{ color: C.text, fontSize: 20, fontWeight: 800, margin: 0 }}>Schedule a Live</h2>
                            <button onClick={() => onClose()} style={{ background: 'none', border: 'none', color: C.textSec, fontSize: 22, cursor: 'pointer' }}>✕</button>
                        </div>

                        {/* Thumbnail */}
                        <div style={{ marginBottom: 16 }}>
                            <input ref={thumbnailRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleThumbnailUpload} />
                            <div
                                onClick={() => thumbnailRef.current?.click()}
                                style={{
                                    width: '100%', aspectRatio: '16/9',
                                    borderRadius: 12,
                                    background: thumbnailUrl ? `url(${thumbnailUrl}) center/cover` : 'rgba(255,255,255,0.05)',
                                    border: `2px dashed ${C.border}`,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    cursor: 'pointer',
                                    color: C.textSec, fontSize: 14,
                                }}
                            >
                                {!thumbnailUrl && (
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: 32, marginBottom: 8 }}>🖼️</div>
                                        <div>Add Thumbnail</div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Title */}
                        <div style={{ marginBottom: 14 }}>
                            <label style={{ color: C.textSec, fontSize: 13, display: 'block', marginBottom: 6 }}>Stream Title *</label>
                            <input
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                placeholder="e.g. Cash Game Strategy at $2/$5"
                                maxLength={80}
                                style={{
                                    width: '100%', padding: '12px 14px', borderRadius: 10,
                                    background: 'rgba(255,255,255,0.06)', border: `1px solid ${C.border}`,
                                    color: C.text, fontSize: 15, outline: 'none', boxSizing: 'border-box',
                                }}
                            />
                        </div>

                        {/* Date and Time */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                            <div>
                                <label style={{ color: C.textSec, fontSize: 13, display: 'block', marginBottom: 6 }}>Date *</label>
                                <input
                                    type="date"
                                    value={scheduledDate}
                                    min={minDate}
                                    onChange={e => setScheduledDate(e.target.value)}
                                    style={{
                                        width: '100%', padding: '12px 14px', borderRadius: 10,
                                        background: 'rgba(255,255,255,0.06)', border: `1px solid ${C.border}`,
                                        color: C.text, fontSize: 14, outline: 'none', boxSizing: 'border-box',
                                        colorScheme: 'dark',
                                    }}
                                />
                            </div>
                            <div>
                                <label style={{ color: C.textSec, fontSize: 13, display: 'block', marginBottom: 6 }}>Time *</label>
                                <input
                                    type="time"
                                    value={scheduledTime}
                                    onChange={e => setScheduledTime(e.target.value)}
                                    style={{
                                        width: '100%', padding: '12px 14px', borderRadius: 10,
                                        background: 'rgba(255,255,255,0.06)', border: `1px solid ${C.border}`,
                                        color: C.text, fontSize: 14, outline: 'none', boxSizing: 'border-box',
                                        colorScheme: 'dark',
                                    }}
                                />
                            </div>
                        </div>

                        {/* Description */}
                        <div style={{ marginBottom: 20 }}>
                            <label style={{ color: C.textSec, fontSize: 13, display: 'block', marginBottom: 6 }}>Description</label>
                            <textarea
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                placeholder="What will you be playing or talking about?"
                                rows={3}
                                maxLength={200}
                                style={{
                                    width: '100%', padding: '12px 14px', borderRadius: 10,
                                    background: 'rgba(255,255,255,0.06)', border: `1px solid ${C.border}`,
                                    color: C.text, fontSize: 14, outline: 'none',
                                    resize: 'none', boxSizing: 'border-box',
                                }}
                            />
                        </div>

                        {error && (
                            <div style={{ color: C.red, fontSize: 13, marginBottom: 14 }}>{error}</div>
                        )}

                        <div style={{ display: 'flex', gap: 10 }}>
                            <button
                                onClick={() => onClose()}
                                style={{
                                    flex: 1, padding: '13px 0', borderRadius: 10,
                                    background: 'rgba(255,255,255,0.08)',
                                    border: `1px solid ${C.border}`, color: C.text,
                                    fontSize: 15, fontWeight: 600, cursor: 'pointer',
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSchedule}
                                disabled={saving}
                                style={{
                                    flex: 2, padding: '13px 0', borderRadius: 10,
                                    background: C.blue,
                                    border: 'none', color: 'white',
                                    fontSize: 15, fontWeight: 700, cursor: 'pointer',
                                    opacity: saving ? 0.7 : 1,
                                }}
                            >
                                {saving ? 'Scheduling...' : 'Schedule Live 📅'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

export default ScheduleLiveModal;
