/* ═══════════════════════════════════════════════════════════════════════════
   ClubAnnouncementBanner — Collapsible Announcement Bar for Club Arena Pages
   ═══════════════════════════════════════════════════════════════════════════
   Shows the most recent pinned/active announcement from club admins/owners.
   Owners get an inline "New Announcement" button.
   Automatically fetches on mount and listens for EventBus refresh signals.

   Usage:
     <ClubAnnouncementBanner clubId={club.id} userRole={membership?.role} />
*/
import { useState, useEffect, useCallback, useRef } from 'react';
import { eventBus } from '../../engine/EventBus';

const FB = {
    bg: '#18191A', card: '#242526', primary: '#2374E1', text: '#E4E6EB',
    dim: '#B0B3B8', border: '#3E4042', green: '#31A24C', red: '#FA383E',
    gold: '#F7C52A',
};

const getToken = () => {
    try {
        const cached = localStorage.getItem('smarter-poker-auth');
        if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed?.access_token) return parsed.access_token;
        }
    } catch (_) { }
    return null;
};

export default function ClubAnnouncementBanner({ clubId, userRole }) {
    const [announcements, setAnnouncements] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState(false);
    const [showCreate, setShowCreate] = useState(false);
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [saving, setSaving] = useState(false);
    const [dismissed, setDismissed] = useState(() => {
        try { return JSON.parse(localStorage.getItem(`club-dismissed-ann-${clubId}`) || '[]'); } catch { return []; }
    });
    const mountRef = useRef(true);

    const isAdmin = userRole === 'owner' || userRole === 'admin';

    // ── Fetch announcements ─────────────────────────────────────────────
    const loadAnnouncements = useCallback(async () => {
        if (!clubId) return;
        try {
            const token = getToken();
            if (!token) return;
            const res = await fetch(`/api/club-arena/announcements?clubId=${clubId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) return;
            const data = await res.json();
            if (mountRef.current && data.success) {
                setAnnouncements(data.announcements || []);
            }
        } catch (e) {
            console.error('[AnnouncementBanner] Load error:', e);
        } finally {
            if (mountRef.current) setLoading(false);
        }
    }, [clubId]);

    useEffect(() => {
        mountRef.current = true;
        loadAnnouncements();
        return () => { mountRef.current = false; };
    }, [loadAnnouncements]);

    // Listen for EventBus refresh
    useEffect(() => {
        const handler = () => loadAnnouncements();
        eventBus.on('CLUB_ANNOUNCEMENT_REFRESH', handler);
        return () => eventBus.off('CLUB_ANNOUNCEMENT_REFRESH', handler);
    }, [loadAnnouncements]);

    // ── Create announcement ─────────────────────────────────────────────
    const handleCreate = async () => {
        if (!title.trim() || saving) return;
        setSaving(true);
        try {
            const token = getToken();
            const res = await fetch('/api/club-arena/announcements', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ action: 'create', clubId, title: title.trim(), content: content.trim(), pinned: true }),
            });
            const data = await res.json();
            if (data.success) {
                setTitle('');
                setContent('');
                setShowCreate(false);
                loadAnnouncements();
                eventBus.emit('CLUB_ANNOUNCEMENT_REFRESH');
            }
        } catch (e) {
            console.error('[AnnouncementBanner] Create error:', e);
        } finally {
            setSaving(false);
        }
    };

    // ── Delete announcement ─────────────────────────────────────────────
    const handleDelete = async (announcementId) => {
        try {
            const token = getToken();
            await fetch('/api/club-arena/announcements', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ action: 'delete', clubId, announcementId }),
            });
            loadAnnouncements();
            eventBus.emit('CLUB_ANNOUNCEMENT_REFRESH');
        } catch (e) {
            console.error('[AnnouncementBanner] Delete error:', e);
        }
    };

    // ── Dismiss (player-side, localStorage) ─────────────────────────────
    const dismissAnnouncement = (id) => {
        const updated = [...dismissed, id];
        setDismissed(updated);
        try { localStorage.setItem(`club-dismissed-ann-${clubId}`, JSON.stringify(updated)); } catch { }
    };

    // Filter for visible announcements
    const visible = announcements.filter(a => !dismissed.includes(a.id));
    const pinnedAnn = visible.find(a => a.pinned);
    const display = pinnedAnn || visible[0];

    if (loading) return null;

    // ── Nothing to show (but admin can still create) ────────────────────
    if (!display && !isAdmin) return null;

    return (
        <div style={{ margin: '0 0 8px' }}>
            {/* Active announcement banner */}
            {display && (
                <div style={{
                    background: `linear-gradient(135deg, rgba(35,116,225,0.12), rgba(35,116,225,0.06))`,
                    border: `1px solid rgba(35,116,225,0.25)`,
                    borderRadius: 10,
                    padding: '10px 14px',
                    margin: '0 0 8px',
                }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <span style={{ fontSize: 18 }}>{display.pinned ? '📌' : '📢'}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700, fontSize: 13, color: FB.text, marginBottom: 2 }}>
                                {display.title}
                            </div>
                            {display.content && (expanded || display.content.length <= 100) ? (
                                <div style={{ fontSize: 12, color: FB.dim, lineHeight: 1.4 }}>{display.content}</div>
                            ) : display.content ? (
                                <div style={{ fontSize: 12, color: FB.dim, lineHeight: 1.4 }}>
                                    {display.content.slice(0, 100)}...
                                    <button onClick={() => setExpanded(true)} style={{ background: 'none', border: 'none', color: FB.primary, cursor: 'pointer', fontSize: 12, padding: '0 4px', fontWeight: 600 }}>more</button>
                                </div>
                            ) : null}
                            <div style={{ fontSize: 11, color: '#555', marginTop: 4 }}>
                                {new Date(display.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
                            {visible.length > 1 && (
                                <span style={{ fontSize: 11, color: FB.dim, marginRight: 4 }}>+{visible.length - 1}</span>
                            )}
                            {isAdmin && (
                                <button onClick={() => handleDelete(display.id)} style={{ background: 'none', border: 'none', color: FB.red, cursor: 'pointer', fontSize: 14, padding: '2px 4px' }} title="Delete">✕</button>
                            )}
                            {!isAdmin && (
                                <button onClick={() => dismissAnnouncement(display.id)} style={{ background: 'none', border: 'none', color: FB.dim, cursor: 'pointer', fontSize: 14, padding: '2px 4px' }} title="Dismiss">✕</button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Admin: create announcement */}
            {isAdmin && !showCreate && (
                <button onClick={() => setShowCreate(true)} style={{
                    width: '100%', background: FB.card, border: `1px dashed ${FB.border}`,
                    borderRadius: 8, padding: '8px 14px', color: FB.dim, cursor: 'pointer',
                    fontSize: 12, fontWeight: 600, textAlign: 'left',
                }}>
                    📢 Post Announcement...
                </button>
            )}

            {isAdmin && showCreate && (
                <div style={{ background: FB.card, border: `1px solid ${FB.border}`, borderRadius: 10, padding: '12px 14px' }}>
                    <input
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        placeholder="Announcement title..."
                        maxLength={120}
                        style={{ width: '100%', background: FB.bg, border: `1px solid ${FB.border}`, borderRadius: 6, padding: '8px 10px', color: FB.text, fontSize: 13, fontWeight: 600, marginBottom: 8, outline: 'none', boxSizing: 'border-box' }}
                    />
                    <textarea
                        value={content}
                        onChange={e => setContent(e.target.value)}
                        placeholder="Details (optional)..."
                        maxLength={500}
                        rows={2}
                        style={{ width: '100%', background: FB.bg, border: `1px solid ${FB.border}`, borderRadius: 6, padding: '8px 10px', color: FB.text, fontSize: 12, resize: 'vertical', marginBottom: 8, outline: 'none', boxSizing: 'border-box' }}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={handleCreate} disabled={!title.trim() || saving} style={{
                            background: FB.primary, color: '#fff', border: 'none', borderRadius: 6,
                            padding: '6px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                            opacity: (!title.trim() || saving) ? 0.5 : 1,
                        }}>
                            {saving ? 'Posting...' : '📢 Post'}
                        </button>
                        <button onClick={() => { setShowCreate(false); setTitle(''); setContent(''); }} style={{
                            background: FB.bg, color: FB.dim, border: `1px solid ${FB.border}`, borderRadius: 6,
                            padding: '6px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        }}>Cancel</button>
                    </div>
                </div>
            )}
        </div>
    );
}
