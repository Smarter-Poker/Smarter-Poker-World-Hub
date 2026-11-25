import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { authedFetch, getAccessToken } from '../../lib/authUtils';
import { listenBroadcast, BROADCAST_TAB_ID } from '../../lib/broadcastSync';
import CashoutRequestActions from './CashoutRequestActions';
import {
    mergeNotices,
    pendingPins,
    compareNotices,
    ROLE_META,
    REACTION_META,
    DEFAULT_ALERT_SETTINGS,
    ALLOWED_ATTACHMENT_MIME,
    DELIVERY_STATE_META,
    NOTICE_TEMPLATES,
    buildAgentSlaCsv,
    formatRoleLabel,
    formatSlaMinutes,
    parseNoticeFormatting,
    normalizeRoleCounts,
    normalizeAlertSettings,
    normalizeReactions,
    formatMemberSummary,
} from '../../lib/clubNoticeBoard.mjs';

function compressImageIfSupported(file) {
    if (!file || !file.type || !file.type.startsWith('image/') || file.type === 'image/gif') {
        return Promise.resolve(file);
    }
    if (typeof document === 'undefined' || typeof Image === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
        return Promise.resolve(file);
    }
    return new Promise((resolve) => {
        const objectUrl = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            try {
                const maxW = 1600;
                const scale = img.width > maxW ? maxW / img.width : 1;
                const width = Math.max(1, Math.round(img.width * scale));
                const height = Math.max(1, Math.round(img.height * scale));
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) { URL.revokeObjectURL(objectUrl); resolve(file); return; }
                ctx.drawImage(img, 0, 0, width, height);
                const targetMime = 'image/webp';
                canvas.toBlob((blob) => {
                    URL.revokeObjectURL(objectUrl);
                    if (!blob || blob.size >= file.size) { resolve(file); return; }
                    const baseName = (file.name || `notice_${Date.now()}`).replace(/\.[^.]+$/, '');
                    const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
                    try {
                        resolve(new File([blob], `${baseName}.${ext}`, { type: blob.type || targetMime }));
                    } catch {
                        resolve(file);
                    }
                }, targetMime, 0.82);
            } catch {
                URL.revokeObjectURL(objectUrl);
                resolve(file);
            }
        };
        img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            resolve(file);
        };
        img.src = objectUrl;
    });
}

function renderFormattedText(content, accentBlue) {
    const lines = parseNoticeFormatting(content);
    const renderSegments = (segments, lineIdx) => segments.map((seg, segIdx) => {
        const key = `${lineIdx}-${segIdx}`;
        if (seg.type === 'bold') return <strong key={key}>{seg.text}</strong>;
        if (seg.type === 'link') {
            return (
                <a
                    key={key}
                    href={seg.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: accentBlue, textDecoration: 'underline', wordBreak: 'break-all' }}
                >
                    {seg.text}
                </a>
            );
        }
        return <React.Fragment key={key}>{seg.text}</React.Fragment>;
    });
    return (
        <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.5, fontSize: 14, margin: '4px 0 8px' }}>
            {lines.map((line, idx) => (
                line.type === 'bullet' ? (
                    <div key={idx} style={{ display: 'flex', gap: 6, paddingLeft: 4 }}>
                        <span aria-hidden="true" style={{ color: accentBlue, fontWeight: 700 }}>•</span>
                        <span style={{ flex: 1, minWidth: 0 }}>{renderSegments(line.segments, idx)}</span>
                    </div>
                ) : (
                    <div key={idx} style={{ minHeight: line.segments.length === 0 ? 10 : undefined }}>
                        {renderSegments(line.segments, idx)}
                    </div>
                )
            ))}
        </div>
    );
}

function dayKey(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDayLabel(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const now = new Date();
    const today = dayKey(now.toISOString());
    const yesterday = dayKey(new Date(now.getTime() - 86400000).toISOString());
    const key = dayKey(iso);
    if (key === today) return 'Today';
    if (key === yesterday) return 'Yesterday';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatShortTime(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function initialsOf(name) {
    const clean = String(name || 'Club').trim();
    if (!clean) return 'C';
    const parts = clean.split(/\s+/).filter(Boolean);
    return parts.length >= 2 ? (parts[0][0] + parts[1][0]).toUpperCase() : clean.slice(0, 2).toUpperCase();
}

function formatChipsSimple(amount) {
    const n = Number(amount);
    return Number.isFinite(n) ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(amount || '0.00');
}

function useNativeDialog(dialogRef, open, onCloseState) {
    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;
        if (open) {
            if (typeof dialog.showModal === 'function' && !dialog.open) {
                try { dialog.showModal(); } catch { /* noop in non-DOM test renderers */ }
            }
        } else if (typeof dialog.close === 'function' && dialog.open) {
            try { dialog.close(); } catch { /* noop */ }
        }
    }, [dialogRef, open]);

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog || typeof dialog.addEventListener !== 'function') return;
        const onClose = () => {
            if (typeof dialog.returnValue === 'string') dialog.returnValue = '';
            onCloseState(false);
        };
        dialog.addEventListener('close', onClose);
        let cleanupOutside = null;
        if (typeof HTMLDialogElement !== 'undefined' && !('closedBy' in HTMLDialogElement.prototype)) {
            const outside = (e) => {
                const r = dialog.getBoundingClientRect();
                return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
            };
            let pressedOutside = false;
            const onDown = (e) => { pressedOutside = outside(e); };
            const onUp = (e) => { if (pressedOutside && outside(e) && dialog.open) dialog.close(); };
            dialog.addEventListener('pointerdown', onDown);
            dialog.addEventListener('pointerup', onUp);
            cleanupOutside = () => {
                dialog.removeEventListener('pointerdown', onDown);
                dialog.removeEventListener('pointerup', onUp);
            };
        }
        return () => {
            dialog.removeEventListener('close', onClose);
            cleanupOutside?.();
        };
    }, [dialogRef, onCloseState]);
}

// Keyed by authenticated actor + club at the caller. No state crosses identities.
export default function NoticeBoard({ club, userId, theme: C, initialNoticeId = null, initialOpenThread = false, onBack, onMarkRead, onMessageMember }) {
    const draftStorageKey = `sp_nb_draft:${userId}:${club.id}`;
    const [rows, setRows] = useState([]);
    const [pins, setPins] = useState([]);
    const [scheduledNotices, setScheduledNotices] = useState([]);
    const [scheduledExpanded, setScheduledExpanded] = useState(false);
    const [canManage, setCanManage] = useState(false);
    const [viewerRole, setViewerRole] = useState(null);
    const [members, setMembers] = useState([]);
    const [memberCount, setMemberCount] = useState(0);
    const [roleCounts, setRoleCounts] = useState(() => normalizeRoleCounts(null, 0));
    const [overduePayouts, setOverduePayouts] = useState([]);
    const [alertSettings, setAlertSettings] = useState(() => ({ ...DEFAULT_ALERT_SETTINGS }));
    const [previousLastReadAt, setPreviousLastReadAt] = useState(null);
    const [initialUnreadCount, setInitialUnreadCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [olderLoading, setOlderLoading] = useState(false);
    const [error, setError] = useState('');
    const [live, setLive] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [draft, setDraft] = useState('');
    const [kind, setKind] = useState('notice');
    const [pinOnPost, setPinOnPost] = useState(false);
    const [requireConfirmation, setRequireConfirmation] = useState(false);
    const [scheduleEnabled, setScheduleEnabled] = useState(false);
    const [scheduledFor, setScheduledFor] = useState('');
    const [pollOpen, setPollOpen] = useState(false);
    const [pollQuestion, setPollQuestion] = useState('');
    const [pollOptions, setPollOptions] = useState(['', '']);
    const [pollAllowMultiple, setPollAllowMultiple] = useState(false);
    const [attachments, setAttachments] = useState([]);
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    const [mentionUserIds, setMentionUserIds] = useState([]);
    const [mentionAll, setMentionAll] = useState(false);
    const [mentionPickerOpen, setMentionPickerOpen] = useState(false);
    const [mentionFilter, setMentionFilter] = useState('');
    const [editing, setEditing] = useState(null);
    const [busy, setBusy] = useState(false);
    const [reactingId, setReactingId] = useState(null);
    const [votingKey, setVotingKey] = useState(null);
    const [remindingId, setRemindingId] = useState(null);
    const [remindFeedback, setRemindFeedback] = useState({});
    const [expandedUnconfirmedId, setExpandedUnconfirmedId] = useState(null);
    const [openThreads, setOpenThreads] = useState({});
    const [replyDrafts, setReplyDrafts] = useState({});
    const [replyBusyId, setReplyBusyId] = useState(null);
    const [escalatingId, setEscalatingId] = useState(null);
    const [newItemsCount, setNewItemsCount] = useState(0);
    const [dateMenuOpen, setDateMenuOpen] = useState(false);
    const [noteTarget, setNoteTarget] = useState(null);
    const [noteDraft, setNoteDraft] = useState('');
    const [activePinIndex, setActivePinIndex] = useState(0);
    const [pinsExpanded, setPinsExpanded] = useState(false);
    const [overdueExpanded, setOverdueExpanded] = useState(false);
    const [highlightedId, setHighlightedId] = useState(null);
    const [pendingJumpId, setPendingJumpId] = useState(null);
    const [searchOpen, setSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [serverSearchRows, setServerSearchRows] = useState(null);
    const [serverSearchBusy, setServerSearchBusy] = useState(false);
    const [filterKind, setFilterKind] = useState('all');
    const [memberFilter, setMemberFilter] = useState(null);
    const [rosterOpen, setRosterOpen] = useState(false);
    const [rosterSearch, setRosterSearch] = useState('');
    const [rosterRoleFilter, setRosterRoleFilter] = useState('all');
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [settingsDraft, setSettingsDraft] = useState(() => ({ ...DEFAULT_ALERT_SETTINGS }));
    const [settingsBusy, setSettingsBusy] = useState(false);
    const [opsOpen, setOpsOpen] = useState(false);
    const [opsTab, setOpsTab] = useState('sla');
    const [slaSortBy, setSlaSortBy] = useState('overdue');
    const [auditRows, setAuditRows] = useState([]);
    const [auditLoading, setAuditLoading] = useState(false);
    const [templatesOpen, setTemplatesOpen] = useState(false);
    const [lightboxImage, setLightboxImage] = useState(null);

    const rosterTitleId = useId();
    const settingsTitleId = useId();
    const opsTitleId = useId();
    const lightboxTitleId = useId();
    const rosterDialogRef = useRef(null);
    const settingsDialogRef = useRef(null);
    const opsDialogRef = useRef(null);
    const lightboxDialogRef = useRef(null);
    const consumedDeepLink = useRef(null);
    const photoInputRef = useRef(null);
    const noteIntent = useRef(null);
    const escalateIntents = useRef(new Map());
    const scroller = useRef(null);
    const state = useRef({
        rows: [],
        pinRows: [],
        members: [],
        cursor: null,
        alive: true,
        loading: false,
        events: [],
        generation: 0,
        epoch: 0,
        capturedInitialRead: false,
        metaTimer: null,
        deltaTimer: null,
        pendingDeltaIds: new Set(),
    });
    const anchor = useRef(null);
    const createIntent = useRef(null);
    const highlightTimer = useRef(null);

    const surfaceBg = C.card || C.bg || '#18191b';
    const subtleBg = 'rgba(255, 255, 255, 0.04)';
    const accentBlue = C.blue || '#0084ff';
    const button = {
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        background: C.bg,
        color: C.text,
        padding: '6px 10px',
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: 12,
        fontWeight: 500,
    };

    useNativeDialog(rosterDialogRef, rosterOpen, setRosterOpen);
    useNativeDialog(settingsDialogRef, settingsOpen, setSettingsOpen);
    useNativeDialog(opsDialogRef, opsOpen, setOpsOpen);
    useNativeDialog(lightboxDialogRef, Boolean(lightboxImage), (open) => { if (!open) setLightboxImage(null); });

    useEffect(() => {
        if (typeof window === 'undefined' || !window.localStorage) return;
        try {
            const saved = window.localStorage.getItem(draftStorageKey);
            if (saved && saved.trim()) setDraft(saved);
        } catch { /* storage unavailable */ }
    }, [draftStorageKey]);

    useEffect(() => {
        if (editing || typeof window === 'undefined' || !window.localStorage) return;
        try {
            if (draft.trim()) window.localStorage.setItem(draftStorageKey, draft);
            else window.localStorage.removeItem(draftStorageKey);
        } catch { /* storage unavailable */ }
    }, [draft, editing, draftStorageKey]);

    function captureAnchor(bottom = false) {
        const box = scroller.current;
        if (!box) return;
        if (bottom) { anchor.current = { bottom: true }; return; }
        const top = box.getBoundingClientRect().top;
        const item = [...box.querySelectorAll('[data-notice-id]')].find(node => node.getBoundingClientRect().bottom > top);
        anchor.current = item ? { id: item.dataset.noticeId, top: item.getBoundingClientRect().top } : null;
    }

    useLayoutEffect(() => {
        const box = scroller.current;
        const saved = anchor.current;
        if (!box || !saved) return;
        if (saved.bottom) box.scrollTop = box.scrollHeight;
        else {
            const item = box.querySelector(`[data-notice-id="${saved.id}"]`);
            if (item) box.scrollTop += item.getBoundingClientRect().top - saved.top;
        }
        anchor.current = null;
    }, [rows, pins, loading]);

    function clearAccess() {
        const s = state.current;
        s.denied = true; s.epoch++; s.generation++; s.loading = false; s.refreshAfterLoad = false;
        s.events = []; s.rows = []; s.pinRows = []; s.members = []; s.cursor = null; s.capturedInitialRead = false;
        if (s.metaTimer) { clearTimeout(s.metaTimer); s.metaTimer = null; }
        if (s.deltaTimer) { clearTimeout(s.deltaTimer); s.deltaTimer = null; }
        s.pendingDeltaIds?.clear();
        setRows([]); setPins([]); setScheduledNotices([]); setScheduledExpanded(false);
        setCanManage(false); setViewerRole(null);
        setMembers([]); setMemberCount(0); setRoleCounts(normalizeRoleCounts(null, 0));
        setOverduePayouts([]); setAlertSettings({ ...DEFAULT_ALERT_SETTINGS });
        setPreviousLastReadAt(null); setInitialUnreadCount(0); setHasMore(false); setNewItemsCount(0);
        setDateMenuOpen(false); setServerSearchRows(null); setOpenThreads({}); setReplyDrafts({});
        setEditing(null); setDraft(''); setAttachments([]); setMentionUserIds([]); setMentionAll(false);
        setRequireConfirmation(false); setScheduleEnabled(false); setScheduledFor('');
        setPollOpen(false); setPollQuestion(''); setPollOptions(['', '']); setPollAllowMultiple(false);
        setMentionPickerOpen(false); setNoteTarget(null); setNoteDraft('');
        setMemberFilter(null); setRosterOpen(false); setSettingsOpen(false); setOpsOpen(false); setAuditRows([]); setTemplatesOpen(false); setLightboxImage(null);
        try { if (typeof window !== 'undefined' && window.localStorage) window.localStorage.removeItem(draftStorageKey); } catch { /* noop */ }
        setPinsExpanded(false); setOverdueExpanded(false);
        setLoading(false); setOlderLoading(false); setLive(false);
        createIntent.current = null; noteIntent.current = null;
    }

    async function request(method, payload = {}, action) {
        const epoch = state.current.epoch;
        const token = getAccessToken();
        const response = await authedFetch('/api/messenger/notice-board', {
            method,
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify({ clubId: club.id, payload, ...(action ? { action } : {}) }),
        });
        const result = await response.json();
        if (!state.current.alive || state.current.epoch !== epoch) return null;
        if (response.status === 401 || response.status === 403) {
            clearAccess();
        }
        if (!response.ok || !result.success) throw Object.assign(new Error(result.error || 'Notice Board Unavailable'), { status: response.status });
        if (method === 'POST') state.current.denied = false;
        return result;
    }

    function markBoardRead(latestNoticeId = null) {
        if (!state.current.alive || state.current.denied) return;
        const payload = latestNoticeId ? { lastNoticeId: latestNoticeId } : {};
        void request('PATCH', payload, 'mark_read')
            .then(res => {
                if (res && state.current.alive) {
                    state.current.selfMarkReadAt = Date.now();
                    onMarkRead?.(club.id);
                }
            })
            .catch(() => { /* best-effort read receipt */ });
    }

    function applyMeta(page) {
        const nextMembers = Array.isArray(page.members) ? page.members : [];
        const nextCount = Number.isFinite(Number(page.memberCount)) ? Number(page.memberCount) : nextMembers.length;
        state.current.members = nextMembers;
        setMembers(nextMembers);
        setMemberCount(nextCount);
        setRoleCounts(normalizeRoleCounts(page.roleCounts, nextCount));
        setOverduePayouts(Array.isArray(page.overduePayouts) ? page.overduePayouts : []);
        if (page.alertSettings) {
            const normalized = normalizeAlertSettings(page.alertSettings);
            setAlertSettings(normalized);
        }
    }

    function scheduleMetaRefresh() {
        const s = state.current;
        if (!s.alive || s.denied) return;
        if (s.metaTimer) clearTimeout(s.metaTimer);
        s.metaTimer = setTimeout(() => {
            s.metaTimer = null;
            if (!s.alive || s.denied || s.loading) return;
            void request('POST', { refreshMeta: true })
                .then(res => { if (res && s.alive) applyMeta(res); })
                .catch(() => { /* non-blocking background meta sync */ });
        }, 450);
    }

    function scheduleDeltaSync(noticeId, fallbackHydrate = false) {
        const s = state.current;
        if (!s.alive || s.denied) return;
        if (!noticeId) {
            if (fallbackHydrate) {
                if (s.loading) s.refreshAfterLoad = true;
                else void hydrate();
            }
            return;
        }
        s.pendingDeltaIds.add(noticeId);
        if (s.deltaTimer) clearTimeout(s.deltaTimer);
        s.deltaTimer = setTimeout(() => {
            s.deltaTimer = null;
            if (!s.alive || s.denied) return;
            const ids = [...s.pendingDeltaIds];
            s.pendingDeltaIds.clear();
            if (ids.length === 0) return;
            if (ids.length > 6) {
                if (s.loading) s.refreshAfterLoad = true;
                else void hydrate();
                return;
            }
            void Promise.allSettled(ids.map(id => request('POST', { id }, 'entry')))
                .then(results => {
                    if (!s.alive || s.denied) return;
                    const entries = results
                        .filter(r => r.status === 'fulfilled' && r.value?.entry)
                        .map(r => r.value.entry);
                    if (entries.length > 0) accept(entries);
                });
        }, 350);
    }

    function enrichWithRoster(entries) {
        const byId = new Map((state.current.members || []).map(m => [m.user_id, m]));
        return entries.map(row => {
            if (!row || !row.author_id || (row.author_name && row.author_role)) return row;
            const staff = byId.get(row.author_id);
            if (!staff) return row;
            return {
                ...row,
                author_name: row.author_name ?? staff.display_name ?? staff.username,
                author_avatar: row.author_avatar ?? staff.avatar_url,
                author_role: row.author_role ?? staff.role,
            };
        });
    }

    function accept(entries) {
        const enriched = enrichWithRoster(entries);
        const box = scroller.current;
        const bottom = !box || box.scrollHeight - box.scrollTop - box.clientHeight < 80;
        captureAnchor(bottom);
        const oldest = state.current.rows.find(row => !row.is_deleted);
        const updates = enriched.filter(row => state.current.rows.some(old => old.id === row.id) || !oldest || compareNotices(row, oldest) >= 0);
        const knownIds = new Set(state.current.rows.map(row => row.id));
        const newEntries = updates.filter(row => !row.is_deleted && !knownIds.has(row.id));
        const hasNewEntries = newEntries.length > 0;
        state.current.rows = mergeNotices(state.current.rows, updates);
        setRows(state.current.rows);
        state.current.pinRows = mergeNotices(state.current.pinRows, enriched);
        setPins(pendingPins(state.current.pinRows));
        if (hasNewEntries) {
            const newest = state.current.rows.filter(r => !r.is_deleted).at(-1);
            const hasNewFromOther = newEntries.some(row => row.author_id && row.author_id !== userId);
            if (!bottom) setNewItemsCount(prev => prev + newEntries.length);
            else if (hasNewFromOther && (typeof document === 'undefined' || document.visibilityState === 'visible')) {
                markBoardRead(newest?.id || null);
            }
        }
    }

    async function hydrate() {
        const s = state.current;
        if (s.loading) return;
        s.loading = true;
        s.events = [];
        const generation = ++s.generation;
        const oldest = s.rows.find(row => !row.is_deleted);
        try {
            let page = await request('POST');
            if (!page || !s.alive || generation !== s.generation) return;
            let all = page.entries;
            let cursor = page.cursor;
            let more = page.hasMore;
            // Reconnect re-reads the whole displayed interval, so missed edits,
            // deletes and new messages cannot leave holes in a scrolled feed.
            while (oldest && more && all[0] && compareNotices(all[0], oldest) > 0) {
                const next = await request('POST', cursor);
                if (!next || !s.alive || generation !== s.generation) return;
                all = mergeNotices(next.entries, all); cursor = next.cursor; more = next.hasMore;
            }
            captureAnchor(!oldest);
            s.rows = mergeNotices(all, s.events);
            s.cursor = cursor;
            s.pinRows = mergeNotices(page.pinned, s.events);
            setRows(s.rows);
            setPins(pendingPins(s.pinRows));
            setScheduledNotices(Array.isArray(page.scheduledNotices) ? page.scheduledNotices : []);
            setCanManage(page.canManage);
            setViewerRole(page.viewerRole || null);
            applyMeta(page);
            if (!s.capturedInitialRead) {
                s.capturedInitialRead = true;
                setPreviousLastReadAt(page.previousLastReadAt || null);
                setInitialUnreadCount(Number(page.unreadCount || 0));
            }
            setHasMore(more);
            setError('');
            const latestActive = s.rows.filter(r => !r.is_deleted).at(-1);
            if (Number(page.unreadCount || 0) > 0) {
                markBoardRead(latestActive?.id || null);
            }
        } catch (failure) { if (s.alive) setError(failure.message); }
        finally {
            if (s.alive && generation === s.generation) {
                s.loading = false;
                setLoading(false);
                if (s.refreshAfterLoad) { s.refreshAfterLoad = false; void hydrate(); }
            }
        }
    }

    useEffect(() => {
        const s = state.current; s.alive = true; s.loading = false; s.epoch++; s.capturedInitialRead = false;
        const instanceSuffix = Math.random().toString(36).slice(2, 8);
        const channel = supabase.channel(`club-notice-board:${club.id}:${userId}:${instanceSuffix}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'club_notice_board', filter: `club_id=eq.${club.id}` }, event => {
                const row = event.new;
                if (!s.alive || s.denied || row?.club_id !== club.id) return;
                // Defense-in-depth: future scheduled notices never enter the live staff feed early.
                if (row.scheduled_for && Date.parse(row.scheduled_for) > Date.now()) {
                    return;
                }
                // Joined cash-out details must come from the authorized reader, never
                // from an unjoined realtime table row.
                if (row.cashout_id) { if (s.loading) s.refreshAfterLoad = true; else void hydrate(); }
                else if (s.loading) s.events.push(row); else accept([row]);
            }).on('postgres_changes', { event: '*', schema: 'public', table: 'club_notice_access_events', filter: `user_id=eq.${userId}` }, event => {
                const access = event.new;
                if (!s.alive || access?.club_id !== club.id || access?.user_id !== userId) return;
                // Revocation is self-readable even after club access ends.
                // Invalidate pending reads before clearing the mounted history.
                clearAccess();
                if (access.can_access === true) { setLoading(true); void hydrate(); }
                else setError('Your Club Role No Longer Has Access To This Notice Board.');
            }).on('postgres_changes', { event: '*', schema: 'public', table: 'club_members', filter: `club_id=eq.${club.id}` }, () => {
                scheduleMetaRefresh();
            }).on('postgres_changes', { event: '*', schema: 'public', table: 'cashout_requests', filter: `club_id=eq.${club.id}` }, () => {
                scheduleMetaRefresh();
            }).on('postgres_changes', { event: '*', schema: 'public', table: 'club_notice_board_reactions', filter: `club_id=eq.${club.id}` }, event => {
                scheduleDeltaSync(event.new?.notice_id || event.old?.notice_id, true);
            }).on('postgres_changes', { event: '*', schema: 'public', table: 'club_notice_board_reads', filter: `club_id=eq.${club.id}` }, event => {
                scheduleDeltaSync(event.new?.last_read_notice_id || event.old?.last_read_notice_id, true);
            }).on('postgres_changes', { event: '*', schema: 'public', table: 'club_notice_board_replies', filter: `club_id=eq.${club.id}` }, event => {
                const nid = event.new?.notice_id || event.old?.notice_id;
                scheduleDeltaSync(nid, true);
                if (nid) {
                    setOpenThreads(prev => (prev[nid]?.open ? { ...prev, [nid]: { ...prev[nid], stale: true } } : prev));
                }
            }).on('postgres_changes', { event: '*', schema: 'public', table: 'club_notice_board_poll_votes', filter: `club_id=eq.${club.id}` }, event => {
                scheduleDeltaSync(event.new?.notice_id || event.old?.notice_id, true);
            }).subscribe(status => {
                if (!s.alive) return;
                setLive(status === 'SUBSCRIBED');
                if (['CLOSED', 'CHANNEL_ERROR', 'TIMED_OUT'].includes(status)) {
                    clearAccess(); setError('Connection Lost. Refresh To Check Notice Board Access.');
                }
                if (status === 'SUBSCRIBED') {
                    if (s.loading) s.refreshAfterLoad = true; else void hydrate();
                }
            });
        // Initial read does not depend on a working socket. A subscribed event
        // refreshes after connection to close the read/subscription race.
        void hydrate();
        const refresh = () => { if (document.visibilityState === 'visible') void hydrate(); };
        const offline = () => { clearAccess(); setError('You Are Offline. Reconnect To Check Notice Board Access.'); };
        const stopUnreadSync = listenBroadcast('smarter_poker_unread_sync', msg => {
            const isRefresh = msg === 'refresh_unread' || msg?.action === 'refresh_unread';
            if (!isRefresh || !s.alive || s.denied) return;
            if (msg?.tabId && msg.tabId === BROADCAST_TAB_ID) return;
            if (s.selfMarkReadAt && Date.now() - s.selfMarkReadAt < 500) return;
            setPreviousLastReadAt(null);
            setInitialUnreadCount(0);
            if (s.loading) s.refreshAfterLoad = true;
            else void hydrate();
        });
        window.addEventListener('offline', offline);
        window.addEventListener('online', refresh);
        window.addEventListener('focus', refresh);
        document.addEventListener('visibilitychange', refresh);
        return () => {
            s.alive = false; s.generation++; s.epoch++;
            if (s.metaTimer) { clearTimeout(s.metaTimer); s.metaTimer = null; }
            if (s.deltaTimer) { clearTimeout(s.deltaTimer); s.deltaTimer = null; }
            s.pendingDeltaIds?.clear();
            if (highlightTimer.current) clearTimeout(highlightTimer.current);
            stopUnreadSync?.();
            window.removeEventListener('offline', offline);
            window.removeEventListener('online', refresh); window.removeEventListener('focus', refresh);
            document.removeEventListener('visibilitychange', refresh); void supabase.removeChannel(channel);
        };
    }, [club.id, userId]);

    async function older() {
        const s = state.current;
        if (!hasMore || s.loading || olderLoading || !s.cursor) return;
        s.loading = true; s.events = []; setOlderLoading(true);
        try {
            const page = await request('POST', s.cursor);
            if (!page || !s.alive) return;
            captureAnchor();
            s.rows = mergeNotices(mergeNotices(s.rows, page.entries), s.events);
            s.cursor = page.cursor;
            if (!page.paginated && Array.isArray(page.pinned)) {
                s.pinRows = mergeNotices(page.pinned, s.events);
                setPins(pendingPins(s.pinRows));
            }
            setRows(s.rows);
            setCanManage(page.canManage); setHasMore(page.hasMore); setError('');
        } catch (failure) { if (s.alive) setError(failure.message); }
        finally {
            if (s.alive) {
                s.loading = false;
                setOlderLoading(false);
                if (s.refreshAfterLoad) { s.refreshAfterLoad = false; void hydrate(); }
            }
        }
    }

    useEffect(() => {
        if (!editing) return;
        const entry = [...state.current.rows, ...state.current.pinRows].find(row => row.id === editing.id && row.is_deleted);
        if (!entry) return;
        setEditing(null); setDraft(''); setAttachments([]);
        setError('This Notice Was Removed. Your Edit Was Not Saved.');
    }, [rows, pins, editing]);

    useEffect(() => {
        if (pins.length === 0) setActivePinIndex(0);
        else if (activePinIndex >= pins.length) setActivePinIndex(pins.length - 1);
    }, [pins.length, activePinIndex]);

    async function mutate(method, payload, action) {
        if (busy) return false;
        setBusy(true); setError('');
        try {
            const result = await request(method, payload, action);
            if (!result) return false;
            // A delayed read must replay acknowledged writes even without a socket.
            if (state.current.loading) state.current.events.push(result.entry);
            accept([result.entry]); return true;
        } catch (failure) {
            if (state.current.alive) {
                if (action === 'add_note' && failure.status === 409) {
                    noteIntent.current = null;
                    await hydrate();
                    const current = [...state.current.rows, ...state.current.pinRows].find(row => row.id === payload.id && !row.is_deleted);
                    if (current) setNoteTarget(current);
                }
                setError(failure.message);
            }
            return false;
        }
        finally { if (state.current.alive) setBusy(false); }
    }

    async function toggleReaction(noticeId, reaction) {
        if (reactingId) return;
        setReactingId(`${noticeId}:${reaction}`);
        try {
            const result = await request('PATCH', { id: noticeId, reaction }, 'toggle_reaction');
            if (result?.entry && state.current.alive) {
                accept([result.entry]);
            }
        } catch (failure) {
            if (state.current.alive) setError(failure.message);
        } finally {
            if (state.current.alive) setReactingId(null);
        }
    }

    async function loadReplies(noticeId) {
        setOpenThreads(prev => ({
            ...prev,
            [noticeId]: { open: true, loading: true, replies: prev[noticeId]?.replies || [], stale: false },
        }));
        try {
            const res = await request('POST', { id: noticeId }, 'list_replies');
            if (res && state.current.alive) {
                setOpenThreads(prev => ({
                    ...prev,
                    [noticeId]: { open: true, loading: false, replies: Array.isArray(res.replies) ? res.replies : [], stale: false },
                }));
            }
        } catch (failure) {
            if (state.current.alive) {
                setOpenThreads(prev => ({
                    ...prev,
                    [noticeId]: { open: true, loading: false, replies: prev[noticeId]?.replies || [], stale: false },
                }));
                setError(failure.message);
            }
        }
    }

    function toggleThread(noticeId) {
        const cur = openThreads[noticeId];
        if (cur?.open && !cur.stale) {
            setOpenThreads(prev => ({ ...prev, [noticeId]: { ...prev[noticeId], open: false } }));
            return;
        }
        void loadReplies(noticeId);
    }

    useEffect(() => {
        const staleId = Object.keys(openThreads).find(id => openThreads[id]?.open && openThreads[id]?.stale && !openThreads[id]?.loading);
        if (staleId) void loadReplies(staleId);
    }, [openThreads]);

    async function submitReply(noticeId, event) {
        event.preventDefault();
        const text = String(replyDrafts[noticeId] || '').trim();
        if (!text || replyBusyId) return;
        setReplyBusyId(noticeId);
        setError('');
        try {
            const res = await request('PATCH', { id: noticeId, reply_id: crypto.randomUUID(), content: text }, 'create_reply');
            if (res?.entry && state.current.alive) {
                accept([res.entry]);
                setReplyDrafts(prev => ({ ...prev, [noticeId]: '' }));
                await loadReplies(noticeId);
            }
        } catch (failure) {
            if (state.current.alive) setError(failure.message);
        } finally {
            if (state.current.alive) setReplyBusyId(null);
        }
    }

    async function deleteReply(noticeId, replyId) {
        if (replyBusyId) return;
        setReplyBusyId(replyId);
        setError('');
        try {
            const res = await request('PATCH', { reply_id: replyId }, 'delete_reply');
            if (res?.entry && state.current.alive) {
                accept([res.entry]);
                await loadReplies(noticeId);
            }
        } catch (failure) {
            if (state.current.alive) setError(failure.message);
        } finally {
            if (state.current.alive) setReplyBusyId(null);
        }
    }

    async function votePoll(noticeId, optionId) {
        if (votingKey) return;
        setVotingKey(`${noticeId}:${optionId}`);
        setError('');
        try {
            const res = await request('PATCH', { id: noticeId, option_id: optionId }, 'vote_poll');
            if (res?.entry && state.current.alive) accept([res.entry]);
        } catch (failure) {
            if (state.current.alive) setError(failure.message);
        } finally {
            if (state.current.alive) setVotingKey(null);
        }
    }

    async function closePoll(noticeId) {
        if (busy) return;
        setBusy(true);
        setError('');
        try {
            const res = await request('PATCH', { id: noticeId }, 'close_poll');
            if (res?.entry && state.current.alive) accept([res.entry]);
        } catch (failure) {
            if (state.current.alive) setError(failure.message);
        } finally {
            if (state.current.alive) setBusy(false);
        }
    }

    async function remindUnconfirmed(noticeId) {
        if (remindingId) return;
        setRemindingId(noticeId);
        setError('');
        try {
            const res = await request('PATCH', { id: noticeId }, 'remind_unconfirmed');
            if (res && state.current.alive) {
                if (res.entry) accept([res.entry]);
                const n = Number(res.reminded || 0);
                setRemindFeedback(prev => ({
                    ...prev,
                    [noticeId]: n > 0 ? `Reminded ${n} Staff ${n === 1 ? 'Member' : 'Members'}` : 'All Staff Already Confirmed',
                }));
            }
        } catch (failure) {
            if (state.current.alive) setError(failure.message);
        } finally {
            if (state.current.alive) setRemindingId(null);
        }
    }

    async function reorderPins(index, direction) {
        const nextIdx = index + direction;
        if (nextIdx < 0 || nextIdx >= orderedPins.length || busy) return;
        const list = [...orderedPins];
        const [moved] = list.splice(index, 1);
        list.splice(nextIdx, 0, moved);
        const noticeIds = list.map(p => p.id);
        setBusy(true);
        setError('');
        try {
            const res = await request('PATCH', { notice_ids: noticeIds }, 'reorder_pins');
            if (res?.reordered && state.current.alive) {
                const reordered = list.map((p, idx) => ({ ...p, pin_order: idx + 1 }));
                state.current.pinRows = mergeNotices(state.current.pinRows, reordered);
                setPins(pendingPins(state.current.pinRows));
            }
        } catch (failure) {
            if (state.current.alive) setError(failure.message);
        } finally {
            if (state.current.alive) setBusy(false);
        }
    }

    async function publishScheduledNow(noticeId) {
        if (busy) return;
        setBusy(true);
        setError('');
        try {
            const res = await request('PATCH', { id: noticeId }, 'publish_now');
            if (res?.entry && state.current.alive) {
                setScheduledNotices(prev => prev.filter(item => item.id !== noticeId));
                accept([res.entry]);
            }
        } catch (failure) {
            if (state.current.alive) setError(failure.message);
        } finally {
            if (state.current.alive) setBusy(false);
        }
    }

    async function cancelScheduledNotice(row) {
        if (busy) return;
        if (!window.confirm('Cancel This Scheduled Notice?')) return;
        setBusy(true);
        setError('');
        try {
            await request('DELETE', { id: row.id, version: row.version });
            if (state.current.alive) {
                setScheduledNotices(prev => prev.filter(item => item.id !== row.id));
            }
        } catch (failure) {
            if (state.current.alive) setError(failure.message);
        } finally {
            if (state.current.alive) setBusy(false);
        }
    }

    async function runServerSearch() {
        const q = searchQuery.trim();
        if (!q || serverSearchBusy) return;
        setServerSearchBusy(true);
        setError('');
        try {
            const res = await request('POST', { query: q, limit: 50 }, 'search');
            if (res && state.current.alive) {
                setServerSearchRows(Array.isArray(res.entries) ? res.entries : []);
            }
        } catch (failure) {
            if (state.current.alive) setError(failure.message);
        } finally {
            if (state.current.alive) setServerSearchBusy(false);
        }
    }

    async function loadPayoutAudit() {
        if (auditLoading) return;
        setAuditLoading(true);
        try {
            const res = await request('POST', {}, 'payout_audit');
            if (res && state.current.alive) {
                setAuditRows(Array.isArray(res.audit) ? res.audit : []);
            }
        } catch (failure) {
            if (state.current.alive) setError(failure.message);
        } finally {
            if (state.current.alive) setAuditLoading(false);
        }
    }

    function openPayoutOps(tab = 'sla') {
        setOpsTab(tab);
        setOpsOpen(true);
        if (tab === 'audit') void loadPayoutAudit();
    }

    function exportAgentSlaCsv() {
        if (typeof document === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return;
        const csv = buildAgentSlaCsv(members, club.name || 'Club');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const slug = String(club.name || 'club').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'club';
        a.href = url;
        a.download = `${slug}-agent-sla-30d.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function applyTemplate(tpl) {
        if (!tpl) return;
        setDraft(tpl.content);
        if (tpl.pin) setPinOnPost(true);
        if (tpl.requireConfirmation) setRequireConfirmation(true);
        setTemplatesOpen(false);
    }

    useEffect(() => {
        if (!initialNoticeId || loading || consumedDeepLink.current === `${club.id}:${initialNoticeId}`) return;
        consumedDeepLink.current = `${club.id}:${initialNoticeId}`;
        const existing = [...state.current.rows, ...state.current.pinRows].find(r => r.id === initialNoticeId && !r.is_deleted);
        if (existing) {
            jumpToNotice(initialNoticeId);
            if (initialOpenThread) void loadReplies(initialNoticeId);
            return;
        }
        void request('POST', { id: initialNoticeId }, 'entry')
            .then(res => {
                if (!res?.entry || !state.current.alive) return;
                accept([res.entry]);
                setPendingJumpId(initialNoticeId);
                if (initialOpenThread) void loadReplies(initialNoticeId);
            })
            .catch(() => { /* notice may have been deleted or inaccessible */ });
    }, [initialNoticeId, initialOpenThread, loading, club.id]);

    const ESCALATE_ERROR_COPY = {
        cashier_request_already_escalated: 'This Payout Request Was Already Escalated To The Club Bank.',
        cashier_request_already_terminal: 'This Payout Request Was Already Decided.',
        cashier_account_changed: 'Your Session Changed. Refresh And Try Again.',
        'Assigned Active Cashier Required': 'Only The Assigned Agent Or Club Management After The Overdue Window Can Escalate This Payout.',
    };

    async function escalateOverduePayout(item) {
        if (!item?.cashout_id || escalatingId || item.is_escalated) return;
        let opId = escalateIntents.current.get(item.cashout_id);
        if (!opId) {
            opId = crypto.randomUUID();
            escalateIntents.current.set(item.cashout_id, opId);
        }
        setEscalatingId(item.cashout_id);
        setError('');
        try {
            const { data, error: rpcError } = await supabase.rpc('fn_cashout_escalate_v2', {
                p_cashout_id: item.cashout_id,
                p_club_id: club.id,
                p_expected_actor_id: userId,
                p_op_id: opId,
            });
            if (rpcError) {
                const raw = String(rpcError.message || '');
                const matched = Object.keys(ESCALATE_ERROR_COPY).find(k => raw.includes(k));
                if (matched === 'cashier_request_already_escalated' || matched === 'cashier_request_already_terminal') {
                    escalateIntents.current.delete(item.cashout_id);
                    await hydrate();
                }
                throw new Error(matched ? ESCALATE_ERROR_COPY[matched] : 'Could Not Escalate Payout Request. Refresh And Try Again.');
            }
            if (!data || data.success !== true || data.contract_version !== 1 || data.is_escalated !== true || data.cashout_id !== item.cashout_id) {
                throw new Error('Escalation Receipt Was Unconfirmed. Refresh Or Retry The Same Action.');
            }
            escalateIntents.current.delete(item.cashout_id);
            await hydrate();
        } catch (failure) {
            if (state.current.alive) setError(failure.message || 'Could Not Escalate Payout Request.');
        } finally {
            if (state.current.alive) setEscalatingId(null);
        }
    }

    async function uploadAttachmentFile(rawFile) {
        if (!rawFile || attachments.length >= 4) return;
        const fallbackMime = rawFile.name?.toLowerCase().endsWith('.csv')
            ? 'text/csv'
            : rawFile.name?.toLowerCase().endsWith('.pdf')
                ? 'application/pdf'
                : rawFile.type || '';
        const mimeType = (rawFile.type || fallbackMime).toLowerCase();
        if (!ALLOWED_ATTACHMENT_MIME.test(mimeType)) {
            setError('Only Images, PDF, And CSV Files Are Supported For Notice Attachments.');
            return;
        }
        if (rawFile.size > 10 * 1024 * 1024) {
            setError('Attachment Too Large (Maximum 10MB).');
            return;
        }
        setUploadingPhoto(true);
        setError('');
        try {
            const file = mimeType.startsWith('image/') ? await compressImageIfSupported(rawFile) : rawFile;
            const finalMime = (file.type || mimeType).toLowerCase();
            const token = getAccessToken();
            const res = await authedFetch('/api/social/upload-url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: JSON.stringify({
                    fileName: file.name || `notice_${Date.now()}.${finalMime === 'application/pdf' ? 'pdf' : finalMime === 'text/csv' ? 'csv' : 'webp'}`,
                    fileSize: file.size,
                    mimeType: finalMime,
                    folder: 'messages',
                    prefix: userId,
                }),
            });
            const data = await res.json();
            if (!res.ok || !data?.success || !data.signedUrl || !data.publicUrl) {
                throw new Error(data?.error || 'Attachment Upload Could Not Start.');
            }
            const putRes = await fetch(data.signedUrl, {
                method: 'PUT',
                headers: { 'Content-Type': finalMime },
                body: file,
            });
            if (!putRes.ok) throw new Error('Attachment Upload Did Not Complete.');
            if (state.current.alive) {
                setAttachments(prev => [...prev.slice(0, 3), {
                    url: data.publicUrl,
                    name: (file.name || (finalMime === 'application/pdf' ? 'Document.pdf' : finalMime.startsWith('text/') ? 'Sheet.csv' : 'Image')).slice(0, 120),
                    mime: finalMime.slice(0, 64),
                }]);
            }
        } catch (failure) {
            if (state.current.alive) setError(failure.message || 'Attachment Upload Failed.');
        } finally {
            if (state.current.alive) setUploadingPhoto(false);
        }
    }

    async function handlePhotoSelect(event) {
        const file = event.target?.files?.[0];
        if (event.target) event.target.value = '';
        if (file) await uploadAttachmentFile(file);
    }

    function handleComposerPaste(event) {
        const items = event.clipboardData?.items;
        if (!items || uploadingPhoto || attachments.length >= 4) return;
        for (const item of items) {
            if (item.kind === 'file' && item.type && item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (file) {
                    event.preventDefault();
                    void uploadAttachmentFile(file);
                    return;
                }
            }
        }
    }

    async function saveAlertSettings(event) {
        event.preventDefault();
        if (settingsBusy) return;
        setSettingsBusy(true);
        setError('');
        try {
            const hasQuietRole = Boolean(settingsDraft.quiet_hours_backup_role);
            const payload = {
                overdue_threshold_hours: Number(settingsDraft.overdue_threshold_hours) || 4,
                followup_threshold_hours: settingsDraft.followup_threshold_hours ? Number(settingsDraft.followup_threshold_hours) : null,
                notify_admins: Boolean(settingsDraft.notify_admins),
                auto_escalate_hours: settingsDraft.auto_escalate_hours ? Number(settingsDraft.auto_escalate_hours) : null,
                quiet_hours_start: hasQuietRole ? Number(settingsDraft.quiet_hours_start ?? 23) : null,
                quiet_hours_end: hasQuietRole ? Number(settingsDraft.quiet_hours_end ?? 7) : null,
                quiet_hours_tz: settingsDraft.quiet_hours_tz || 'America/Chicago',
                quiet_hours_backup_role: hasQuietRole ? settingsDraft.quiet_hours_backup_role : null,
            };
            const res = await request('PATCH', payload, 'update_alert_settings');
            if (res?.alertSettings && state.current.alive) {
                setAlertSettings(normalizeAlertSettings(res.alertSettings));
                setSettingsOpen(false);
                scheduleMetaRefresh();
            }
        } catch (failure) {
            if (state.current.alive) setError(failure.message);
        } finally {
            if (state.current.alive) setSettingsBusy(false);
        }
    }

    function handleDraftChange(nextValue) {
        setDraft(nextValue);
        const match = nextValue.match(/(?:^|\s)@([^\s@]{0,24})$/);
        if (match && !editing) {
            setMentionPickerOpen(true);
            setMentionFilter(match[1].toLowerCase());
        } else if (mentionPickerOpen && !nextValue.includes('@')) {
            setMentionPickerOpen(false);
            setMentionFilter('');
        }
    }

    function selectMention(member) {
        if (member === 'ALL') {
            setMentionAll(true);
            setDraft(prev => {
                if (/(?:^|\s)@AllStaff(?:\s|$)/i.test(prev)) {
                    return prev.replace(/(?:^|\s)@[^\s@]{0,24}$/, m => (m.startsWith(' ') ? ' ' : ''));
                }
                if (/(?:^|\s)@[^\s@]{0,24}$/.test(prev)) {
                    return prev.replace(/(?:^|\s)@[^\s@]{0,24}$/, m => `${m.startsWith(' ') ? ' ' : ''}@AllStaff `);
                }
                return `${prev}${prev && !prev.endsWith(' ') ? ' ' : ''}@AllStaff `;
            });
            setMentionPickerOpen(false);
            setMentionFilter('');
            return;
        }
        const tag = `@${member.username || (member.display_name || 'Staff').replace(/\s+/g, '')}`;
        setMentionUserIds(prev => (prev.includes(member.user_id) ? prev : [...prev, member.user_id]));
        setDraft(prev => (/(?:^|\s)@[^\s@]{0,24}$/.test(prev)
            ? prev.replace(/(?:^|\s)@[^\s@]{0,24}$/, m => `${m.startsWith(' ') ? ' ' : ''}${tag} `)
            : `${prev}${prev && !prev.endsWith(' ') ? ' ' : ''}${tag} `));
        setMentionPickerOpen(false);
        setMentionFilter('');
    }

    async function submit(event) {
        event.preventDefault();
        const content = draft.trim();
        if (!content || uploadingPhoto) return;
        if (editing) {
            const updatePayload = {
                id: editing.id,
                version: editing.version,
                content,
                ...(attachments.length > 0 || (Array.isArray(editing.attachments) && editing.attachments.length > 0) ? { attachments } : {}),
            };
            if (await mutate('PATCH', updatePayload)) { setEditing(null); setDraft(''); setAttachments([]); }
        } else {
            const shouldPin = kind === 'pending_payout' ? true : Boolean(pinOnPost);
            let pollPayload = null;
            if (pollOpen) {
                const q = pollQuestion.trim();
                const cleanOpts = pollOptions.map(o => o.trim()).filter(Boolean);
                if (!q || cleanOpts.length < 2) {
                    setError('Poll Requires A Question And At Least 2 Options.');
                    return;
                }
                pollPayload = { question: q, options: cleanOpts, allow_multiple: Boolean(pollAllowMultiple) };
            }
            let scheduledIso = null;
            if (scheduleEnabled) {
                const parsed = scheduledFor ? new Date(scheduledFor) : null;
                if (!parsed || Number.isNaN(parsed.getTime()) || parsed.getTime() <= Date.now()) {
                    setError('Scheduled Time Must Be In The Future.');
                    return;
                }
                scheduledIso = parsed.toISOString();
            }
            const sig = JSON.stringify({
                content, status: kind, is_pinned: shouldPin, attachments, mentionUserIds, mentionAll,
                requireConfirmation, scheduledIso, pollPayload,
            });
            if (!createIntent.current || createIntent.current._sig !== sig) {
                createIntent.current = {
                    _sig: sig,
                    payload: {
                        id: crypto.randomUUID(),
                        content,
                        status: kind,
                        is_pinned: shouldPin,
                        ...(attachments.length > 0 ? { attachments } : {}),
                        ...(mentionUserIds.length > 0 && !mentionAll ? { mention_user_ids: mentionUserIds } : {}),
                        ...(mentionAll ? { mention_all: true } : {}),
                        ...(requireConfirmation ? { require_confirmation: true } : {}),
                        ...(scheduledIso ? { scheduled_for: scheduledIso } : {}),
                        ...(pollPayload ? { poll: pollPayload } : {}),
                    },
                };
            }
            if (scheduledIso) {
                if (busy) return;
                setBusy(true); setError('');
                try {
                    const res = await request('PUT', createIntent.current.payload);
                    if (res?.entry && state.current.alive) {
                        setScheduledNotices(prev => [...prev, res.entry].sort((a, b) => Date.parse(a.scheduled_for) - Date.parse(b.scheduled_for)));
                        setScheduledExpanded(true);
                        createIntent.current = null;
                        setDraft(''); setPinOnPost(false); setAttachments([]); setMentionUserIds([]); setMentionAll(false);
                        setRequireConfirmation(false); setScheduleEnabled(false); setScheduledFor('');
                        setPollOpen(false); setPollQuestion(''); setPollOptions(['', '']); setPollAllowMultiple(false);
                        setMentionPickerOpen(false);
                    }
                } catch (failure) {
                    if (state.current.alive) setError(failure.message);
                } finally {
                    if (state.current.alive) setBusy(false);
                }
            } else if (await mutate('PUT', createIntent.current.payload)) {
                createIntent.current = null;
                setDraft('');
                setPinOnPost(false);
                setAttachments([]);
                setMentionUserIds([]);
                setMentionAll(false);
                setRequireConfirmation(false);
                setScheduleEnabled(false);
                setScheduledFor('');
                setPollOpen(false);
                setPollQuestion('');
                setPollOptions(['', '']);
                setPollAllowMultiple(false);
                setMentionPickerOpen(false);
            }
        }
    }

    async function submitNote(event) {
        event.preventDefault();
        if (!noteTarget || !noteDraft.trim() || !canManage) return;
        const note = noteDraft.trim();
        if (!noteIntent.current || noteIntent.current.id !== noteTarget.id || noteIntent.current.note !== note) {
            noteIntent.current = { id: noteTarget.id, version: noteTarget.version, note, op_id: crypto.randomUUID() };
        }
        if (await mutate('PATCH', noteIntent.current, 'add_note')) { noteIntent.current = null; setNoteTarget(null); setNoteDraft(''); }
    }

    function highlightNotice(id) {
        setHighlightedId(id);
        if (highlightTimer.current) clearTimeout(highlightTimer.current);
        highlightTimer.current = setTimeout(() => setHighlightedId(null), 1800);
    }

    function jumpToNotice(id) {
        if (!id) return;
        const box = scroller.current;
        const node = box && typeof box.querySelector === 'function' ? box.querySelector(`[data-notice-id="${id}"]`) : null;
        if (node && typeof node.scrollIntoView === 'function') {
            node.scrollIntoView({ behavior: 'smooth', block: 'center' });
            highlightNotice(id);
            return;
        }
        setFilterKind('all');
        setSearchQuery('');
        setMemberFilter(null);
        setPendingJumpId(id);
    }

    useEffect(() => {
        if (!pendingJumpId) return;
        const box = scroller.current;
        const node = box && typeof box.querySelector === 'function' ? box.querySelector(`[data-notice-id="${pendingJumpId}"]`) : null;
        if (node && typeof node.scrollIntoView === 'function') {
            node.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        highlightNotice(pendingJumpId);
        setPendingJumpId(null);
    }, [pendingJumpId, rows, filterKind, searchQuery, memberFilter]);

    const visibleRows = useMemo(() => {
        if (Array.isArray(serverSearchRows)) {
            return serverSearchRows.filter(row => !row.is_deleted);
        }
        const active = rows.filter(row => !row.is_deleted);
        const q = searchQuery.trim().toLowerCase();
        return active.filter(row => {
            if (filterKind === 'notices' && (row.status !== 'notice' || row.cashout_id)) return false;
            if (filterKind === 'payouts' && row.status !== 'pending_payout' && row.status !== 'paid' && !row.cashout_id) return false;
            if (filterKind === 'pinned' && !row.is_pinned) return false;
            if (memberFilter) {
                const matchesAuthor = row.author_id === memberFilter.user_id;
                const matchesMention = Array.isArray(row.mentions) && row.mentions.includes(memberFilter.user_id);
                const matchesCashoutAgent = row.cashout?.agent_id === memberFilter.user_id || row.cashout?.player_id === memberFilter.user_id;
                if (!matchesAuthor && !matchesMention && !matchesCashoutAgent) return false;
            }
            if (!q) return true;
            const hay = [
                row.content,
                row.author_name,
                row.poll?.question,
                row.cashout?.player_name,
                row.cashout?.player_note,
                ...(Array.isArray(row.manager_notes) ? row.manager_notes.map(n => `${n.actor_name || ''} ${n.note || ''}`) : []),
            ].filter(Boolean).join(' ').toLowerCase();
            return hay.includes(q);
        });
    }, [rows, serverSearchRows, filterKind, searchQuery, memberFilter]);

    const loadedDays = useMemo(() => {
        const seen = new Set();
        const list = [];
        for (const r of visibleRows) {
            const k = dayKey(r.created_at);
            if (k && !seen.has(k)) {
                seen.add(k);
                list.push({ key: k, label: formatDayLabel(r.created_at), firstNoticeId: r.id });
            }
        }
        return list;
    }, [visibleRows]);

    const firstUnreadId = useMemo(() => {
        if (previousLastReadAt) {
            const cutoff = Date.parse(previousLastReadAt);
            if (!Number.isFinite(cutoff)) return null;
            const hit = visibleRows.find(r => r.author_id !== userId && Date.parse(r.created_at) > cutoff);
            return hit?.id || null;
        }
        if (initialUnreadCount > 0) {
            const hit = visibleRows.find(r => r.author_id !== userId);
            return hit?.id || null;
        }
        return null;
    }, [visibleRows, previousLastReadAt, initialUnreadCount, userId]);

    const feedCounts = useMemo(() => {
        const active = rows.filter(row => !row.is_deleted);
        return {
            all: active.length,
            notices: active.filter(r => r.status === 'notice' && !r.cashout_id).length,
            payouts: active.filter(r => r.status === 'pending_payout' || r.status === 'paid' || r.cashout_id).length,
            pinned: pins.length,
        };
    }, [rows, pins]);

    const filteredMembers = useMemo(() => {
        const q = rosterSearch.trim().toLowerCase();
        return members.filter(m => {
            if (rosterRoleFilter === 'management' && !['owner', 'co_owner', 'admin'].includes(m.role)) return false;
            if (rosterRoleFilter === 'agents' && !['super_agent', 'agent', 'sub_agent'].includes(m.role)) return false;
            if (!q) return true;
            return `${m.display_name || ''} ${m.username || ''} ${formatRoleLabel(m.role)}`.toLowerCase().includes(q);
        });
    }, [members, rosterSearch, rosterRoleFilter]);

    const mentionCandidates = useMemo(() => {
        const q = mentionFilter.trim().toLowerCase();
        return members
            .filter(m => m.user_id !== userId)
            .filter(m => !q || `${m.display_name || ''} ${m.username || ''}`.toLowerCase().includes(q))
            .slice(0, 6);
    }, [members, userId, mentionFilter]);

    const memberSummary = formatMemberSummary(roleCounts, memberCount);
    const sortedSlaAgents = useMemo(() => {
        const list = members.filter(m => m && m.sla && typeof m.sla === 'object');
        return [...list].sort((a, b) => {
            if (slaSortBy === 'median') {
                const am = a.sla.median_minutes ?? Number.MAX_SAFE_INTEGER;
                const bm = b.sla.median_minutes ?? Number.MAX_SAFE_INTEGER;
                return am - bm || (b.sla.completed_30d || 0) - (a.sla.completed_30d || 0);
            }
            if (slaSortBy === 'completed') return (b.sla.completed_30d || 0) - (a.sla.completed_30d || 0);
            if (slaSortBy === 'escalated') return (b.sla.escalated_30d || 0) - (a.sla.escalated_30d || 0);
            return (b.sla.overdue_30d || 0) - (a.sla.overdue_30d || 0) || (b.sla.pending_now || 0) - (a.sla.pending_now || 0);
        });
    }, [members, slaSortBy]);
    const orderedPins = useMemo(() => [...pins], [pins]);
    const currentPin = orderedPins[activePinIndex] || orderedPins[0] || null;
    const canConfigureAlerts = viewerRole === 'owner' || viewerRole === 'co_owner';
    const thresholdHours = alertSettings.overdue_threshold_hours || 4;

    const rolePill = (role) => {
        const meta = ROLE_META[role] || { label: formatRoleLabel(role), color: C.textSec, bg: subtleBg };
        return (
            <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '1px 7px',
                borderRadius: 999,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.03em',
                textTransform: 'uppercase',
                color: meta.color,
                background: meta.bg,
                border: `1px solid ${meta.color}40`,
                whiteSpace: 'nowrap',
            }}>
                {meta.label}
            </span>
        );
    };

    const card = (row, pinned = false) => {
        const authorName = row.author_name || 'Club Management';
        const authorRole = row.author_role || 'admin';
        const roleMeta = ROLE_META[authorRole] || { color: accentBlue, bg: 'rgba(0,132,255,0.16)' };
        const isHighlighted = !pinned && highlightedId === row.id;
        const isPayout = Boolean(row.cashout_id) || row.status === 'pending_payout' || row.status === 'paid';
        const statusText = row.cashout_id
            ? 'Payout Request'
            : row.status === 'pending_payout'
                ? 'Pending Payout'
                : row.status === 'paid'
                    ? 'Marked Paid'
                    : 'Club Notice';
        const statusColor = row.status === 'pending_payout'
            ? accentBlue
            : row.status === 'paid'
                ? '#22c55e'
                : C.textSec;
        const rx = normalizeReactions(row.reactions);
        const myRx = new Set(Array.isArray(row.my_reactions) ? row.my_reactions : []);
        const ackUsers = Array.isArray(row.ack_users) ? row.ack_users : [];
        const rowAttachments = Array.isArray(row.attachments) ? row.attachments : [];
        const seenCount = Number(row.seen_count || 0);
        const totalStaff = roleCounts.total || memberCount;

        return (
            <article
                key={pinned ? `pin:${row.id}` : row.id}
                data-notice-id={pinned ? undefined : row.id}
                style={{
                    display: 'flex',
                    gap: 10,
                    marginBottom: pinned ? 8 : 12,
                    alignItems: 'flex-start',
                }}
            >
                {!pinned && (
                    <div
                        aria-hidden="true"
                        style={{
                            width: 34,
                            height: 34,
                            borderRadius: '50%',
                            flexShrink: 0,
                            overflow: 'hidden',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 12,
                            fontWeight: 700,
                            color: roleMeta.color,
                            background: roleMeta.bg,
                            border: `1.5px solid ${roleMeta.color}66`,
                        }}
                    >
                        {row.author_avatar
                            ? <img src={row.author_avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : initialsOf(authorName)}
                    </div>
                )}
                <div
                    style={{
                        flex: 1,
                        minWidth: 0,
                        padding: pinned ? '10px 12px' : '11px 14px',
                        borderRadius: pinned ? 10 : '4px 14px 14px 14px',
                        border: `1px solid ${isHighlighted ? accentBlue : pinned || row.is_pinned ? `${accentBlue}88` : C.border}`,
                        background: isHighlighted ? 'rgba(0, 132, 255, 0.14)' : surfaceBg,
                        boxShadow: isHighlighted ? `0 0 0 2px ${accentBlue}55` : 'none',
                        transition: 'border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease',
                    }}
                >
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                        <strong style={{ fontSize: 13, color: roleMeta.color }}>{authorName}</strong>
                        {rolePill(authorRole)}
                        <span style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: '1px 6px',
                            borderRadius: 6,
                            color: statusColor,
                            background: isPayout ? 'rgba(0, 132, 255, 0.12)' : subtleBg,
                        }}>
                            {statusText}
                        </span>
                        {row.is_pinned && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: accentBlue }}>📌 Pinned</span>
                        )}
                        <time
                            dateTime={row.created_at}
                            title={new Date(row.created_at).toLocaleString()}
                            style={{ marginLeft: 'auto', color: C.textSec, fontSize: 11 }}
                        >
                            {formatShortTime(row.created_at)}{row.version > 1 && !row.cashout_id ? ' · Edited' : ''}
                        </time>
                    </div>
                    {renderFormattedText(row.content, accentBlue)}
                    {rowAttachments.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '6px 0 8px' }}>
                            {rowAttachments.some(a => !a.mime || a.mime.startsWith('image/')) && (
                                <div style={{ display: 'grid', gridTemplateColumns: rowAttachments.filter(a => !a.mime || a.mime.startsWith('image/')).length === 1 ? 'minmax(0, 260px)' : 'repeat(2, minmax(0, 150px))', gap: 6 }}>
                                    {rowAttachments.filter(a => !a.mime || a.mime.startsWith('image/')).map((att, idx) => (
                                        <button
                                            key={`${att.url}-${idx}`}
                                            type="button"
                                            onClick={() => setLightboxImage(att)}
                                            aria-label={`View Attachment ${att.name || 'Image'}`}
                                            style={{
                                                padding: 0,
                                                border: `1px solid ${C.border}`,
                                                borderRadius: 8,
                                                overflow: 'hidden',
                                                background: C.bg,
                                                cursor: 'pointer',
                                                display: 'block',
                                            }}
                                        >
                                            <img
                                                src={att.url}
                                                alt={att.name || 'Notice Attachment'}
                                                style={{ width: '100%', maxHeight: 180, objectFit: 'cover', display: 'block' }}
                                            />
                                        </button>
                                    ))}
                                </div>
                            )}
                            {rowAttachments.filter(a => a.mime && !a.mime.startsWith('image/')).map((att, idx) => (
                                <a
                                    key={`doc-${att.url}-${idx}`}
                                    href={att.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        padding: '7px 10px',
                                        borderRadius: 8,
                                        border: `1px solid ${C.border}`,
                                        background: subtleBg,
                                        color: C.text,
                                        fontSize: 12,
                                        fontWeight: 600,
                                        textDecoration: 'none',
                                        maxWidth: '100%',
                                    }}
                                >
                                    <span aria-hidden="true">{att.mime === 'application/pdf' ? '📄' : '📊'}</span>
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.name || 'Download File'}</span>
                                    <span style={{ marginLeft: 'auto', fontSize: 11, color: accentBlue, flexShrink: 0 }}>Open</span>
                                </a>
                            ))}
                        </div>
                    )}
                    {/* Interactive Staff Poll */}
                    {!pinned && row.poll && Array.isArray(row.poll.options) && (
                        (() => {
                            const pollResults = row.poll_results && typeof row.poll_results === 'object' ? row.poll_results : {};
                            const myVotes = new Set(Array.isArray(row.my_poll_votes) ? row.my_poll_votes : []);
                            const totalVotes = row.poll.options.reduce((sum, opt) => sum + Number(pollResults[opt.id] || 0), 0);
                            const isClosed = Boolean(row.poll.closed);
                            return (
                                <div
                                    data-testid="notice-poll"
                                    style={{
                                        margin: '8px 0',
                                        padding: '10px 12px',
                                        borderRadius: 10,
                                        border: `1px solid ${C.border}`,
                                        background: subtleBg,
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                                        <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                                            {`📊 ${row.poll.question}`}
                                        </div>
                                        <span style={{ fontSize: 10, fontWeight: 700, color: isClosed ? C.textSec : accentBlue, whiteSpace: 'nowrap' }}>
                                            {isClosed ? 'Poll Closed' : row.poll.allow_multiple ? 'Multi-Choice' : 'Single Choice'}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        {row.poll.options.map(opt => {
                                            const cnt = Number(pollResults[opt.id] || 0);
                                            const pct = totalVotes > 0 ? Math.round((cnt / totalVotes) * 100) : 0;
                                            const picked = myVotes.has(opt.id);
                                            const isVoting = votingKey === `${row.id}:${opt.id}`;
                                            return (
                                                <button
                                                    key={opt.id}
                                                    type="button"
                                                    disabled={isClosed || Boolean(votingKey)}
                                                    aria-pressed={picked}
                                                    onClick={() => void votePoll(row.id, opt.id)}
                                                    style={{
                                                        position: 'relative',
                                                        overflow: 'hidden',
                                                        width: '100%',
                                                        textAlign: 'left',
                                                        padding: '7px 10px',
                                                        borderRadius: 8,
                                                        border: `1px solid ${picked ? accentBlue : C.border}`,
                                                        background: C.bg,
                                                        color: C.text,
                                                        cursor: isClosed ? 'default' : isVoting ? 'wait' : 'pointer',
                                                        fontFamily: 'inherit',
                                                        fontSize: 12,
                                                    }}
                                                >
                                                    <span
                                                        aria-hidden="true"
                                                        style={{
                                                            position: 'absolute',
                                                            left: 0,
                                                            top: 0,
                                                            bottom: 0,
                                                            width: `${pct}%`,
                                                            background: picked ? 'rgba(0, 132, 255, 0.22)' : 'rgba(255, 255, 255, 0.07)',
                                                            transition: 'width 0.2s ease',
                                                        }}
                                                    />
                                                    <span style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                                                        <span style={{ fontWeight: picked ? 700 : 500 }}>
                                                            {`${picked ? '✓ ' : ''}${opt.label}`}
                                                        </span>
                                                        <span style={{ fontSize: 11, color: picked ? accentBlue : C.textSec, fontWeight: 700, whiteSpace: 'nowrap' }}>
                                                            {`${cnt} (${pct}%)`}
                                                        </span>
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8, fontSize: 11, color: C.textSec }}>
                                        <span>{`${totalVotes} ${totalVotes === 1 ? 'Vote' : 'Votes'}`}</span>
                                        {canManage && !isClosed && (
                                            <button
                                                type="button"
                                                disabled={busy}
                                                onClick={() => void closePoll(row.id)}
                                                style={{ ...button, padding: '2px 8px', fontSize: 11 }}
                                            >
                                                Close Poll
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })()
                    )}
                    {/* Mandatory Staff Confirmation Campaign Banner */}
                    {!pinned && row.require_confirmation && (
                        (() => {
                            const unconfirmedCount = Number(row.unconfirmed_count || 0);
                            const unconfirmedUsers = Array.isArray(row.unconfirmed_users) ? row.unconfirmed_users : [];
                            const targetTotal = Math.max(0, (totalStaff > 0 ? totalStaff - 1 : 0));
                            const confirmedCount = Math.max(rx.ack, Math.max(0, targetTotal - unconfirmedCount));
                            const isExpanded = expandedUnconfirmedId === row.id;
                            return (
                                <div
                                    data-testid="notice-confirmation-campaign"
                                    style={{
                                        margin: '8px 0 4px',
                                        padding: '7px 10px',
                                        borderRadius: 8,
                                        border: `1px solid ${unconfirmedCount === 0 ? 'rgba(34, 197, 94, 0.4)' : 'rgba(245, 158, 11, 0.4)'}`,
                                        background: unconfirmedCount === 0 ? 'rgba(34, 197, 94, 0.08)' : 'rgba(245, 158, 11, 0.08)',
                                        fontSize: 11,
                                    }}
                                >
                                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                                        <span style={{ fontWeight: 700, color: unconfirmedCount === 0 ? '#22c55e' : '#f59e0b' }}>
                                            {unconfirmedCount === 0
                                                ? `✓ Confirmation Complete (${confirmedCount} Confirmed)`
                                                : `Confirmation Required · ${confirmedCount} Confirmed · ${unconfirmedCount} Pending`}
                                        </span>
                                        {canManage && unconfirmedCount > 0 && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                                {unconfirmedUsers.length > 0 && (
                                                    <button
                                                        type="button"
                                                        style={{ ...button, padding: '2px 7px', fontSize: 10 }}
                                                        onClick={() => setExpandedUnconfirmedId(isExpanded ? null : row.id)}
                                                    >
                                                        {isExpanded ? 'Hide Pending' : `Pending (${unconfirmedCount})`}
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    disabled={remindingId === row.id}
                                                    style={{ ...button, padding: '2px 8px', fontSize: 10, borderColor: '#f59e0b', color: '#f59e0b', fontWeight: 700 }}
                                                    onClick={() => void remindUnconfirmed(row.id)}
                                                >
                                                    {remindingId === row.id ? 'Reminding...' : 'Remind Unconfirmed Staff'}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    {remindFeedback[row.id] && (
                                        <div style={{ marginTop: 4, color: '#22c55e', fontWeight: 600 }}>
                                            {remindFeedback[row.id]}
                                        </div>
                                    )}
                                    {canManage && isExpanded && unconfirmedUsers.length > 0 && (
                                        <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                            {unconfirmedUsers.map(u => (
                                                <span key={u.user_id} style={{ padding: '2px 7px', borderRadius: 999, background: C.bg, border: `1px solid ${C.border}`, color: C.textSec, fontSize: 10 }}>
                                                    {`${u.display_name} · ${formatRoleLabel(u.role)}`}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })()
                    )}
                    {row.cashout_id && (
                        <CashoutRequestActions
                            cashoutId={row.cashout_id}
                            currentUserId={userId}
                            theme={C}
                            initialCard={row.cashout || null}
                            onChanged={() => void hydrate()}
                        />
                    )}
                    {Array.isArray(row.manager_notes) && row.manager_notes.length > 0 && (
                        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {row.manager_notes.map(note => (
                                <div key={note.id} style={{ borderLeft: `2px solid ${accentBlue}`, paddingLeft: 10, fontSize: 12, background: subtleBg, borderRadius: '0 6px 6px 0', padding: '6px 10px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                        <strong>{note.actor_name || 'Club Management'}</strong>
                                        <time style={{ color: C.textSec, fontSize: 11 }} dateTime={note.created_at}>{new Date(note.created_at).toLocaleString()}</time>
                                    </div>
                                    <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: '3px 0 0' }}>{note.note}</p>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Staff Reactions, One-Tap Acknowledge & Seen By Receipt Footer */}
                    {!pinned && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 5, marginTop: 8, paddingTop: 6, borderTop: `1px solid ${C.border}66` }}>
                            {REACTION_META.map(meta => {
                                const count = rx[meta.key];
                                const active = myRx.has(meta.key);
                                const isAck = meta.key === 'ack';
                                const isReacting = reactingId === `${row.id}:${meta.key}`;
                                return (
                                    <button
                                        key={meta.key}
                                        type="button"
                                        disabled={Boolean(reactingId)}
                                        aria-pressed={active}
                                        aria-label={`${meta.label} Notice${count > 0 ? ` (${count})` : ''}`}
                                        title={isAck && ackUsers.length > 0 ? `Confirmed By: ${ackUsers.join(', ')}` : meta.label}
                                        onClick={() => void toggleReaction(row.id, meta.key)}
                                        style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 4,
                                            padding: '2px 7px',
                                            borderRadius: 999,
                                            fontSize: 11,
                                            fontWeight: active ? 700 : 500,
                                            fontFamily: 'inherit',
                                            cursor: isReacting ? 'wait' : 'pointer',
                                            border: `1px solid ${active ? accentBlue : C.border}`,
                                            background: active ? 'rgba(0, 132, 255, 0.16)' : 'transparent',
                                            color: active ? accentBlue : C.textSec,
                                        }}
                                    >
                                        <span>{meta.emoji}</span>
                                        {isAck && <span>{active ? 'Confirmed' : 'Confirm'}</span>}
                                        {count > 0 && <span>{count}</span>}
                                    </button>
                                );
                            })}
                            <button
                                type="button"
                                aria-expanded={Boolean(openThreads[row.id]?.open)}
                                onClick={() => toggleThread(row.id)}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 4,
                                    padding: '2px 8px',
                                    borderRadius: 999,
                                    fontSize: 11,
                                    fontWeight: openThreads[row.id]?.open || Number(row.reply_count || 0) > 0 ? 700 : 500,
                                    fontFamily: 'inherit',
                                    cursor: 'pointer',
                                    border: `1px solid ${openThreads[row.id]?.open ? accentBlue : C.border}`,
                                    background: openThreads[row.id]?.open ? 'rgba(0, 132, 255, 0.16)' : 'transparent',
                                    color: openThreads[row.id]?.open ? accentBlue : C.textSec,
                                }}
                            >
                                <span>💬</span>
                                <span>{Number(row.reply_count || 0) > 0 ? `Replies (${row.reply_count})` : 'Reply'}</span>
                            </button>
                            {seenCount > 0 && (
                                <span
                                    data-testid="notice-seen-count"
                                    title={ackUsers.length > 0 ? `Confirmed By: ${ackUsers.join(', ')}` : 'Active Staff Who Read This Notice'}
                                    style={{ marginLeft: 'auto', fontSize: 11, color: C.textSec, whiteSpace: 'nowrap' }}
                                >
                                    {`👁 ${seenCount}${totalStaff > 0 ? `/${totalStaff}` : ''} Seen`}
                                </span>
                            )}
                        </div>
                    )}

                    {/* Inline Reply Thread Preview & Expandable Drawer (All Active Staff Can Reply) */}
                    {!pinned && !openThreads[row.id]?.open && Array.isArray(row.recent_replies) && row.recent_replies.length > 0 && (
                        <button
                            type="button"
                            onClick={() => toggleThread(row.id)}
                            style={{
                                marginTop: 6,
                                width: '100%',
                                textAlign: 'left',
                                padding: '6px 9px',
                                borderRadius: 8,
                                border: `1px solid ${C.border}66`,
                                background: subtleBg,
                                color: C.textSec,
                                fontSize: 11,
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                            }}
                        >
                            {row.recent_replies.map(rp => (
                                <div key={rp.id} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>
                                    <strong style={{ color: C.text }}>{rp.author_name || 'Staff'}:</strong> {rp.content}
                                </div>
                            ))}
                        </button>
                    )}
                    {!pinned && openThreads[row.id]?.open && (
                        <div
                            data-testid="notice-reply-thread"
                            style={{
                                marginTop: 8,
                                padding: '8px 10px',
                                borderRadius: 10,
                                border: `1px solid ${C.border}`,
                                background: C.bg,
                            }}
                        >
                            {openThreads[row.id]?.loading ? (
                                <div style={{ fontSize: 11, color: C.textSec, padding: '4px 0' }}>Loading Replies...</div>
                            ) : (openThreads[row.id]?.replies || []).length === 0 ? (
                                <div style={{ fontSize: 11, color: C.textSec, padding: '4px 0' }}>No Replies Yet. Start A Staff Thread Below.</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                                    {(openThreads[row.id]?.replies || []).map(rp => (
                                        <div key={rp.id} style={{ padding: '6px 8px', borderRadius: 8, background: surfaceBg, border: `1px solid ${C.border}88`, fontSize: 12 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                                                <strong style={{ fontSize: 11, color: C.text }}>{rp.author_name || 'Club Staff'}</strong>
                                                {rp.author_role && rolePill(rp.author_role)}
                                                <time style={{ marginLeft: 'auto', fontSize: 10, color: C.textSec }} dateTime={rp.created_at}>{formatShortTime(rp.created_at)}</time>
                                                {rp.can_delete && (
                                                    <button
                                                        type="button"
                                                        disabled={Boolean(replyBusyId)}
                                                        aria-label="Delete Reply"
                                                        onClick={() => void deleteReply(row.id, rp.id)}
                                                        style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: 11, cursor: 'pointer', padding: '0 2px' }}
                                                    >
                                                        ×
                                                    </button>
                                                )}
                                            </div>
                                            <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', lineHeight: 1.4 }}>{rp.content}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <form onSubmit={e => void submitReply(row.id, e)} style={{ display: 'flex', gap: 6 }}>
                                <input
                                    type="text"
                                    aria-label="Write A Staff Reply"
                                    placeholder="Reply In Thread..."
                                    maxLength={1000}
                                    value={replyDrafts[row.id] || ''}
                                    onChange={e => setReplyDrafts(prev => ({ ...prev, [row.id]: e.target.value }))}
                                    disabled={replyBusyId === row.id}
                                    style={{ ...button, flex: 1, minWidth: 0, textAlign: 'left', padding: '6px 9px' }}
                                />
                                <button
                                    type="submit"
                                    disabled={replyBusyId === row.id || !String(replyDrafts[row.id] || '').trim()}
                                    style={{ ...button, background: accentBlue, color: '#fff', borderColor: accentBlue, fontWeight: 700, padding: '6px 12px' }}
                                >
                                    {replyBusyId === row.id ? 'Sending...' : 'Reply'}
                                </button>
                            </form>
                        </div>
                    )}

                    {canManage && row.cashout_id && (
                        <div aria-label="Payout Board Actions" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                            {row.cashout?.status === 'pending' && (
                                <button type="button" disabled={busy} style={button} onClick={() => void mutate('PATCH', { id: row.id, version: row.version, is_pinned: !row.is_pinned })}>
                                    {row.is_pinned ? 'Unpin' : 'Pin'}
                                </button>
                            )}
                            <button type="button" disabled={busy} style={button} onClick={() => { setNoteTarget(row); setNoteDraft(''); noteIntent.current = null; }}>
                                Add Note
                            </button>
                        </div>
                    )}
                    {canManage && !row.cashout_id && (
                        <div aria-label="Notice Actions" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                            <button type="button" disabled={busy} style={button} onClick={() => {
                                setEditing(row);
                                setDraft(row.content);
                                setAttachments(Array.isArray(row.attachments) ? row.attachments : []);
                            }}>
                                Edit
                            </button>
                            {row.status !== 'paid' && (
                                <button type="button" disabled={busy} style={button} onClick={() => void mutate('PATCH', { id: row.id, version: row.version, is_pinned: !row.is_pinned })}>
                                    {row.is_pinned ? 'Unpin' : 'Pin'}
                                </button>
                            )}
                            {row.status === 'pending_payout' && (
                                <button type="button" disabled={busy} style={button} onClick={() => {
                                    if (window.confirm('Confirm This Payout Has Already Been Paid? This Updates The Board Record Only.')) {
                                        void mutate('PATCH', { id: row.id, version: row.version, status: 'paid' });
                                    }
                                }}>
                                    Mark As Paid
                                </button>
                            )}
                            {row.status === 'paid' && (
                                <button type="button" disabled={busy} style={button} onClick={() => {
                                    if (window.confirm('Reopen This Payout Request? This Updates The Board Record Only.')) {
                                        void mutate('PATCH', { id: row.id, version: row.version, status: 'pending_payout', is_pinned: true });
                                    }
                                }}>
                                    Reopen Payout
                                </button>
                            )}
                            <button type="button" disabled={busy} style={{ ...button, color: '#ef4444' }} onClick={() => {
                                if (window.confirm('Remove This Notice From The Board?')) {
                                    void mutate('DELETE', { id: row.id, version: row.version });
                                }
                            }}>
                                Delete
                            </button>
                        </div>
                    )}
                </div>
            </article>
        );
    };

    return (
        <section aria-label="Club Notice Board" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, width: '100%', maxWidth: '100%', overflowX: 'hidden', boxSizing: 'border-box', color: C.text, position: 'relative' }}>
            <style>{`
                .nb-scroller {
                    --scrollbar-thumb: rgba(176, 179, 184, 0.55);
                    --scrollbar-track: transparent;
                    scrollbar-width: thin;
                    scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
                }
                @supports not (scrollbar-color: auto) {
                    .nb-scroller { scrollbar-width: auto; }
                    .nb-scroller::-webkit-scrollbar { width: 8px; height: 8px; }
                    .nb-scroller::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb); border-radius: 4px; }
                    .nb-scroller::-webkit-scrollbar-track { background: var(--scrollbar-track); }
                }
                dialog.nb-modal-dialog[open] {
                    display: flex;
                    flex-direction: column;
                }
                dialog.nb-modal-dialog:modal {
                    overscroll-behavior: contain;
                }
                dialog.nb-modal-dialog::backdrop {
                    overflow: hidden;
                    overscroll-behavior: contain;
                    background: rgba(0, 0, 0, 0.68);
                }
            `}</style>

            {/* Telegram-Style Channel Header */}
            <header style={{
                padding: '9px 12px',
                borderBottom: `1px solid ${C.border}`,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: surfaceBg,
                flexShrink: 0,
                minWidth: 0,
                boxSizing: 'border-box',
            }}>
                <button type="button" style={{ ...button, padding: '5px 9px', flexShrink: 0 }} onClick={onBack} aria-label="Back To Club Inbox">Back</button>
                <button
                    type="button"
                    onClick={() => setRosterOpen(true)}
                    aria-label="Open Staff And Agents Roster"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        minWidth: 0,
                        flex: 1,
                        background: 'transparent',
                        border: 'none',
                        padding: 0,
                        color: 'inherit',
                        cursor: 'pointer',
                        textAlign: 'left',
                    }}
                >
                    <div
                        aria-hidden="true"
                        style={{
                            width: 34,
                            height: 34,
                            borderRadius: '50%',
                            flexShrink: 0,
                            overflow: 'hidden',
                            background: 'linear-gradient(135deg, #0084ff, #2563eb)',
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 800,
                            fontSize: 13,
                        }}
                    >
                        {club.avatar_url
                            ? <img src={club.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : initialsOf(club.name)}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                            <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0, flexShrink: 0, whiteSpace: 'nowrap' }}>
                                Notice Board
                            </h2>
                            <span style={{ fontSize: 11, color: C.textSec, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                                · {club.name}
                            </span>
                        </div>
                        <div data-testid="notice-member-summary" style={{ color: accentBlue, fontSize: 11, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {loading && memberCount === 0 ? 'Loading Staff Channel...' : memberSummary}
                        </div>
                    </div>
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                    <button
                        type="button"
                        aria-label="View Staff And Agents"
                        style={{ ...button, padding: '4px 8px', fontSize: 11, borderColor: accentBlue, color: accentBlue, fontWeight: 700, whiteSpace: 'nowrap' }}
                        onClick={() => setRosterOpen(true)}
                    >
                        {`Staff (${roleCounts.total || memberCount})`}
                    </button>
                    <span
                        role="status"
                        title={live ? 'Live' : 'Connecting'}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            color: live ? '#22c55e' : C.textSec,
                            fontSize: 10,
                            fontWeight: 600,
                            padding: '3px 6px',
                            borderRadius: 999,
                            background: live ? 'rgba(34, 197, 94, 0.12)' : subtleBg,
                            whiteSpace: 'nowrap',
                        }}
                    >
                        <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: live ? '#22c55e' : '#f59e0b' }} />
                        {live ? 'Live' : '...'}
                    </span>
                </div>
            </header>

            {/* Telegram-Style Sticky Pinned Message Bar */}
            <section
                aria-label="Recent Payout Requests"
                style={{
                    flexShrink: 0,
                    borderBottom: `1px solid ${C.border}`,
                    background: C.bg,
                }}
            >
                {currentPin ? (
                    <>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '8px 14px',
                            background: 'rgba(0, 132, 255, 0.08)',
                        }}>
                            <div aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
                                {orderedPins.slice(0, 5).map((p, idx) => (
                                    <span key={p.id} style={{
                                        width: 3,
                                        height: orderedPins.length === 1 ? 26 : Math.max(5, Math.floor(26 / Math.min(orderedPins.length, 5))),
                                        borderRadius: 2,
                                        background: idx === (activePinIndex % Math.min(orderedPins.length, 5)) ? accentBlue : `${accentBlue}44`,
                                    }} />
                                ))}
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    jumpToNotice(currentPin.id);
                                    if (orderedPins.length > 1) setActivePinIndex(prev => (prev + 1) % orderedPins.length);
                                }}
                                style={{
                                    flex: 1,
                                    minWidth: 0,
                                    background: 'transparent',
                                    border: 'none',
                                    padding: 0,
                                    color: 'inherit',
                                    cursor: 'pointer',
                                    textAlign: 'left',
                                }}
                            >
                                <div style={{ fontSize: 11, fontWeight: 700, color: accentBlue, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span>
                                        {`📌 Pinned ${currentPin.status === 'pending_payout' || currentPin.cashout_id ? 'Payout Request' : 'Message'}${orderedPins.length > 1 ? ` #${activePinIndex + 1} Of ${orderedPins.length}` : ''}`}
                                    </span>
                                    {currentPin.author_name && <span style={{ color: C.textSec, fontWeight: 500 }}>· {currentPin.author_name}</span>}
                                </div>
                                <div style={{ fontSize: 12, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                                    {currentPin.cashout?.player_name
                                        ? `${currentPin.cashout.player_name} · ${formatChipsSimple(currentPin.cashout.amount)} Chips - ${currentPin.content}`
                                        : currentPin.content}
                                </div>
                            </button>
                            <button
                                type="button"
                                style={{ ...button, fontSize: 11, padding: '4px 8px', flexShrink: 0 }}
                                aria-expanded={pinsExpanded}
                                onClick={() => setPinsExpanded(prev => !prev)}
                            >
                                {pinsExpanded ? 'Hide Pinned' : `All Pinned (${orderedPins.length})`}
                            </button>
                        </div>
                        {pinsExpanded && (
                            <div className="nb-scroller" style={{ maxHeight: 260, overflowY: 'auto', padding: '10px 14px', borderTop: `1px solid ${C.border}`, background: C.bg }}>
                                <h3 style={{ fontSize: 12, margin: '0 0 8px', color: accentBlue }}>
                                    Pinned Messages & Pending Payouts ({orderedPins.length})
                                </h3>
                                {orderedPins.map((row, pIdx) => (
                                    <div key={`pinwrap-${row.id}`} style={{ position: 'relative' }}>
                                        {canManage && orderedPins.length > 1 && (
                                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, marginBottom: 4 }}>
                                                <button
                                                    type="button"
                                                    disabled={busy || pIdx === 0}
                                                    aria-label="Move Pin Up"
                                                    onClick={() => void reorderPins(pIdx, -1)}
                                                    style={{ ...button, padding: '2px 7px', fontSize: 10 }}
                                                >
                                                    ↑ Move Up
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={busy || pIdx === orderedPins.length - 1}
                                                    aria-label="Move Pin Down"
                                                    onClick={() => void reorderPins(pIdx, 1)}
                                                    style={{ ...button, padding: '2px 7px', fontSize: 10 }}
                                                >
                                                    ↓ Move Down
                                                </button>
                                            </div>
                                        )}
                                        {card(row, true)}
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                ) : (
                    <div style={{ padding: '7px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontSize: 12, color: C.textSec }}>
                            {loading ? 'Loading Pinned Messages...' : '📌 No Pinned Messages'}
                        </span>
                        {canManage && !loading && (
                            <span style={{ fontSize: 11, color: C.textSec }}>Pin Any Club Notice Or Payout To Keep It At The Top</span>
                        )}
                    </div>
                )}
            </section>

            {/* Overdue Unfulfilled Downline Payout Alert Banner (Management Only, With Direct Actions) */}
            {canManage && overduePayouts.length > 0 && (
                <section
                    aria-label={`Unfulfilled Payouts Over ${thresholdHours} Hours`}
                    style={{
                        flexShrink: 0,
                        padding: '8px 14px',
                        borderBottom: `1px solid ${C.border}`,
                        background: 'rgba(245, 158, 11, 0.12)',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b' }}>
                            {`⏰ ${overduePayouts.length} Downline Payout ${overduePayouts.length === 1 ? 'Request' : 'Requests'} Unfulfilled Over ${thresholdHours} ${thresholdHours === 1 ? 'Hour' : 'Hours'}`}
                        </div>
                        <button
                            type="button"
                            style={{ ...button, fontSize: 11, padding: '4px 8px', borderColor: 'rgba(245, 158, 11, 0.45)', color: '#f59e0b' }}
                            onClick={() => setOverdueExpanded(prev => !prev)}
                        >
                            {overdueExpanded ? 'Hide' : 'Details'}
                        </button>
                    </div>
                    {overdueExpanded && (
                        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {overduePayouts.map(item => {
                                const agentMember = members.find(m => m.user_id === item.agent_id) || {
                                    user_id: item.agent_id,
                                    display_name: item.agent_name,
                                    username: item.agent_name,
                                };
                                return (
                                    <div key={item.cashout_id} style={{
                                        display: 'flex',
                                        flexWrap: 'wrap',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: 8,
                                        padding: '7px 10px',
                                        borderRadius: 8,
                                        background: surfaceBg,
                                        border: `1px solid ${C.border}`,
                                        fontSize: 12,
                                    }}>
                                        <div style={{ minWidth: 0, flex: '1 1 180px' }}>
                                            <div>
                                                <strong>{item.player_name}</strong> · {formatChipsSimple(item.amount)} Chips
                                                <span style={{ color: C.textSec }}> (Upline: {item.agent_name})</span>
                                            </div>
                                            <div style={{ color: '#f59e0b', fontWeight: 700, fontSize: 11, marginTop: 2 }}>
                                                {`Pending ${item.hours_pending}h+${item.is_escalated ? ' · Escalated To Club Bank' : ''}`}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                            {onMessageMember && item.agent_id && item.agent_id !== userId && (
                                                <button
                                                    type="button"
                                                    style={{ ...button, padding: '4px 8px', fontSize: 11 }}
                                                    onClick={() => onMessageMember(
                                                        agentMember,
                                                        `Checking In On ${item.player_name}'s Pending Payout Of ${formatChipsSimple(item.amount)} Chips (${item.hours_pending}h+ Unfulfilled).`
                                                    )}
                                                >
                                                    Message Agent
                                                </button>
                                            )}
                                            {item.is_escalated ? (() => {
                                                const linked = [...rows, ...pins].find(r => !r.is_deleted && r.cashout_id === item.cashout_id);
                                                return linked ? (
                                                    <button
                                                        type="button"
                                                        style={{ ...button, padding: '4px 8px', fontSize: 11, borderColor: accentBlue, color: accentBlue, fontWeight: 700 }}
                                                        onClick={() => jumpToNotice(linked.id)}
                                                    >
                                                        View Card
                                                    </button>
                                                ) : null;
                                            })() : (
                                                <button
                                                    type="button"
                                                    disabled={Boolean(escalatingId)}
                                                    style={{ ...button, padding: '4px 8px', fontSize: 11, borderColor: '#f59e0b', color: '#f59e0b', fontWeight: 700 }}
                                                    onClick={() => void escalateOverduePayout(item)}
                                                >
                                                    {escalatingId === item.cashout_id ? 'Escalating...' : 'Escalate To Bank'}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </section>
            )}

            {/* Management-Only Scheduled Notices Queue Banner */}
            {canManage && scheduledNotices.length > 0 && (
                <section
                    aria-label="Scheduled Notices"
                    style={{
                        flexShrink: 0,
                        padding: '8px 14px',
                        borderBottom: `1px solid ${C.border}`,
                        background: 'rgba(168, 85, 247, 0.10)',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#c084fc' }}>
                            {`🕒 ${scheduledNotices.length} Scheduled ${scheduledNotices.length === 1 ? 'Notice' : 'Notices'} Queued`}
                        </div>
                        <button
                            type="button"
                            style={{ ...button, fontSize: 11, padding: '3px 8px', borderColor: 'rgba(168, 85, 247, 0.45)', color: '#c084fc' }}
                            onClick={() => setScheduledExpanded(prev => !prev)}
                        >
                            {scheduledExpanded ? 'Hide Queue' : 'View Queue'}
                        </button>
                    </div>
                    {scheduledExpanded && (
                        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {scheduledNotices.map(item => (
                                <div key={item.id} style={{
                                    display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                                    padding: '7px 10px', borderRadius: 8, background: surfaceBg, border: `1px solid ${C.border}`, fontSize: 12,
                                }}>
                                    <div style={{ minWidth: 0, flex: '1 1 180px' }}>
                                        <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.content}</div>
                                        <div style={{ fontSize: 11, color: '#c084fc', marginTop: 2 }}>
                                            {`Publishes ${new Date(item.scheduled_for).toLocaleString()}`}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <button type="button" disabled={busy} style={{ ...button, padding: '4px 8px', fontSize: 11, borderColor: accentBlue, color: accentBlue, fontWeight: 700 }} onClick={() => void publishScheduledNow(item.id)}>
                                            Publish Now
                                        </button>
                                        <button type="button" disabled={busy} style={{ ...button, padding: '4px 8px', fontSize: 11, color: '#ef4444' }} onClick={() => void cancelScheduledNotice(item)}>
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            )}

            {/* Quick Filter, Member Filter, Alert Settings & Search Bar */}
            <div style={{
                flexShrink: 0,
                padding: '6px 12px',
                borderBottom: `1px solid ${C.border}`,
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 6,
                background: C.bg,
                minWidth: 0,
                boxSizing: 'border-box',
            }}>
                {[
                    { id: 'all', label: `All (${feedCounts.all})` },
                    { id: 'notices', label: `Notices (${feedCounts.notices})` },
                    { id: 'payouts', label: `Payouts (${feedCounts.payouts})` },
                    { id: 'pinned', label: `Pinned (${feedCounts.pinned})` },
                ].map(tab => (
                    <button
                        key={tab.id}
                        type="button"
                        aria-pressed={filterKind === tab.id}
                        onClick={() => setFilterKind(tab.id)}
                        style={{
                            border: `1px solid ${filterKind === tab.id ? accentBlue : C.border}`,
                            borderRadius: 999,
                            background: filterKind === tab.id ? 'rgba(0, 132, 255, 0.16)' : 'transparent',
                            color: filterKind === tab.id ? accentBlue : C.textSec,
                            padding: '3px 9px',
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                        }}
                    >
                        {tab.label}
                    </button>
                ))}
                {memberFilter && (
                    <button
                        type="button"
                        onClick={() => setMemberFilter(null)}
                        style={{
                            border: `1px solid ${accentBlue}`,
                            borderRadius: 999,
                            background: 'rgba(0, 132, 255, 0.18)',
                            color: accentBlue,
                            padding: '3px 9px',
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                        }}
                    >
                        {`Staff: ${memberFilter.display_name || memberFilter.username} ×`}
                    </button>
                )}
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 5 }}>
                    {canManage && (
                        <button
                            type="button"
                            aria-label="Open Payout Ops And Agent SLA"
                            onClick={() => openPayoutOps('sla')}
                            style={{
                                border: `1px solid ${C.border}`,
                                borderRadius: 999,
                                background: 'transparent',
                                color: C.textSec,
                                padding: '3px 9px',
                                fontSize: 11,
                                fontWeight: 600,
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                            }}
                        >
                            📊 Ops & SLA
                        </button>
                    )}
                    {canConfigureAlerts && (
                        <button
                            type="button"
                            aria-label="Configure Overdue Payout Alerts"
                            onClick={() => { setSettingsDraft({ ...alertSettings }); setSettingsOpen(true); }}
                            style={{
                                border: `1px solid ${C.border}`,
                                borderRadius: 999,
                                background: 'transparent',
                                color: C.textSec,
                                padding: '3px 9px',
                                fontSize: 11,
                                fontWeight: 600,
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                            }}
                        >
                            ⚙ Alerts
                        </button>
                    )}
                    <button
                        type="button"
                        aria-label="Search Notices"
                        aria-pressed={searchOpen}
                        onClick={() => { setSearchOpen(prev => !prev); if (searchOpen) setSearchQuery(''); }}
                        style={{
                            border: `1px solid ${searchOpen ? accentBlue : C.border}`,
                            borderRadius: 999,
                            background: searchOpen ? 'rgba(0, 132, 255, 0.16)' : 'transparent',
                            color: searchOpen ? accentBlue : C.textSec,
                            padding: '3px 9px',
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: 'pointer',
                            fontFamily: 'inherit',
                        }}
                    >
                        Search
                    </button>
                </div>
                {searchOpen && (
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                            <input
                                type="search"
                                aria-label="Filter Notice History"
                                placeholder="Search Notices, Polls, Authors, Players..."
                                value={searchQuery}
                                onChange={e => {
                                    setSearchQuery(e.target.value);
                                    if (!e.target.value.trim()) setServerSearchRows(null);
                                }}
                                onKeyDown={e => { if (e.key === 'Enter' && searchQuery.trim()) void runServerSearch(); }}
                                style={{
                                    flex: 1,
                                    minWidth: 0,
                                    boxSizing: 'border-box',
                                    border: `1px solid ${C.border}`,
                                    borderRadius: 8,
                                    background: surfaceBg,
                                    color: C.text,
                                    padding: '5px 10px',
                                    fontSize: 12,
                                    fontFamily: 'inherit',
                                }}
                            />
                            <button
                                type="button"
                                disabled={serverSearchBusy || !searchQuery.trim()}
                                onClick={() => void runServerSearch()}
                                style={{ ...button, padding: '5px 10px', fontSize: 11, borderColor: accentBlue, color: accentBlue, fontWeight: 700, whiteSpace: 'nowrap' }}
                            >
                                {serverSearchBusy ? 'Searching...' : 'Search Full History'}
                            </button>
                        </div>
                        {Array.isArray(serverSearchRows) && (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, color: accentBlue, padding: '2px 4px' }}>
                                <span>{`Full History Results: ${serverSearchRows.length} ${serverSearchRows.length === 1 ? 'Match' : 'Matches'}`}</span>
                                <button type="button" style={{ ...button, padding: '2px 7px', fontSize: 10 }} onClick={() => { setServerSearchRows(null); setSearchQuery(''); }}>
                                    Clear Search
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {error && (
                <div role="alert" style={{ padding: '8px 14px', fontSize: 12, background: 'rgba(239, 68, 68, 0.12)', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ flex: 1 }}>{error}</span>
                    <button type="button" style={button} disabled={loading || olderLoading} onClick={() => void hydrate()}>Refresh Board</button>
                </div>
            )}

            {/* Telegram-Style Message Feed */}
            <div
                ref={scroller}
                tabIndex={0}
                aria-label="Notice History"
                className="nb-scroller"
                style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowAnchor: 'none', padding: '14px 16px', background: C.bg }}
                onScroll={() => { if (scroller.current?.scrollTop <= 50 && !error) void older(); }}
            >
                {hasMore && (
                    <button type="button" style={{ ...button, width: '100%', marginBottom: 12 }} disabled={olderLoading} onClick={() => void older()}>
                        {olderLoading ? 'Loading Earlier Notices...' : 'Load Earlier Notices'}
                    </button>
                )}
                {loading ? (
                    <p role="status" style={{ color: C.textSec, textAlign: 'center', padding: 24 }}>Loading Notice Board...</p>
                ) : visibleRows.length === 0 ? (
                    <div style={{ color: C.textSec, textAlign: 'center', padding: '32px 16px' }}>
                        <div style={{ fontSize: 28, marginBottom: 8 }}>📢</div>
                        <p style={{ margin: 0, fontWeight: 600, color: C.text }}>
                            {rows.some(r => !r.is_deleted) ? 'No Matching Notices' : 'No Notices Yet'}
                        </p>
                        <p style={{ margin: '6px 0 0', fontSize: 12 }}>
                            {roleCounts.total > 0
                                ? `${memberSummary} Are Automatically Enrolled In This Club Notice Board.`
                                : 'Club Owners, Admins, And Active Agents Appear Here Automatically.'}
                        </p>
                    </div>
                ) : (
                    visibleRows.map((row, idx) => {
                        const prev = idx > 0 ? visibleRows[idx - 1] : null;
                        const showDay = !prev || dayKey(prev.created_at) !== dayKey(row.created_at);
                        const showUnreadDivider = firstUnreadId === row.id;
                        return (
                            <React.Fragment key={row.id}>
                                {showDay && (
                                    <div style={{ display: 'flex', justifyContent: 'center', margin: '10px 0 12px', position: 'relative' }}>
                                        <button
                                            type="button"
                                            aria-label="Jump To Date"
                                            onClick={() => setDateMenuOpen(prev => !prev)}
                                            style={{
                                                fontSize: 11,
                                                fontWeight: 600,
                                                color: C.textSec,
                                                background: surfaceBg,
                                                border: `1px solid ${C.border}`,
                                                borderRadius: 999,
                                                padding: '2px 10px',
                                                cursor: 'pointer',
                                                fontFamily: 'inherit',
                                            }}
                                        >
                                            {`${formatDayLabel(row.created_at)}${loadedDays.length > 1 ? ' ▾' : ''}`}
                                        </button>
                                    </div>
                                )}
                                {showUnreadDivider && (
                                    <div data-testid="notice-unread-divider" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '8px 0 12px' }}>
                                        <span style={{ flex: 1, height: 1, background: `${accentBlue}66` }} />
                                        <span style={{ fontSize: 11, fontWeight: 700, color: accentBlue, whiteSpace: 'nowrap' }}>
                                            Unread Messages
                                        </span>
                                        <span style={{ flex: 1, height: 1, background: `${accentBlue}66` }} />
                                    </div>
                                )}
                                {card(row)}
                            </React.Fragment>
                        );
                    })
                )}
            </div>

            {dateMenuOpen && loadedDays.length > 0 && (
                <div
                    role="menu"
                    aria-label="Jump To Day"
                    style={{
                        position: 'absolute',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        top: 136,
                        zIndex: 20,
                        background: surfaceBg,
                        border: `1px solid ${C.border}`,
                        borderRadius: 10,
                        padding: 8,
                        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)',
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 6,
                        maxWidth: 'calc(100% - 32px)',
                    }}
                >
                    {loadedDays.map(day => (
                        <button
                            key={day.key}
                            type="button"
                            onClick={() => { setDateMenuOpen(false); jumpToNotice(day.firstNoticeId); }}
                            style={{ ...button, padding: '4px 10px', fontSize: 11 }}
                        >
                            {day.label}
                        </button>
                    ))}
                    <button type="button" onClick={() => setDateMenuOpen(false)} style={{ ...button, padding: '4px 8px', fontSize: 11, color: C.textSec }}>
                        Close
                    </button>
                </div>
            )}

            {newItemsCount > 0 && (
                <button
                    type="button"
                    aria-label="Latest Notices"
                    data-testid="notice-jump-new"
                    style={{
                        ...button,
                        position: 'absolute',
                        right: 18,
                        bottom: canManage ? 124 : 58,
                        background: accentBlue,
                        color: '#fff',
                        borderColor: accentBlue,
                        borderRadius: 999,
                        padding: '7px 14px',
                        fontWeight: 700,
                        boxShadow: '0 4px 14px rgba(0, 0, 0, 0.35)',
                    }}
                    onClick={() => {
                        scroller.current.scrollTop = scroller.current.scrollHeight;
                        setNewItemsCount(0);
                        const latest = state.current.rows.filter(r => !r.is_deleted).at(-1);
                        markBoardRead(latest?.id || null);
                    }}
                >
                    {`↓ ${newItemsCount} New`}
                </button>
            )}

            {/* Manager Payout Note Composer */}
            {canManage && noteTarget && (
                <form onSubmit={submitNote} style={{ padding: '10px 14px', borderTop: `1px solid ${C.border}`, background: surfaceBg }}>
                    <div style={{ fontSize: 12, marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>Adding Payout Note</span>
                        <button type="button" style={button} disabled={busy} onClick={() => { setNoteTarget(null); setNoteDraft(''); }}>Cancel Note</button>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <textarea
                            aria-label="Payout Note"
                            placeholder="Add An Internal Payout Coordination Note..."
                            value={noteDraft}
                            onChange={e => setNoteDraft(e.target.value)}
                            maxLength={2000}
                            disabled={busy}
                            rows={2}
                            style={{ ...button, flex: 1, minWidth: 0, resize: 'vertical', textAlign: 'left', padding: '8px 10px' }}
                        />
                        <button type="submit" disabled={busy || !noteDraft.trim()} style={{ ...button, background: accentBlue, color: '#fff', borderColor: accentBlue, fontWeight: 700 }}>
                            {busy ? 'Saving...' : 'Save Note'}
                        </button>
                    </div>
                </form>
            )}

            {/* Read-Only Agent Broadcast Footer */}
            {!loading && !canManage && !error && (
                <div style={{
                    padding: '10px 14px',
                    borderTop: `1px solid ${C.border}`,
                    background: surfaceBg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                }}>
                    <p style={{ margin: 0, color: C.textSec, fontSize: 12 }}>
                        Read Only · Confirm Notices, Vote In Polls, Or Reply In Threads{viewerRole ? ` · Enrolled As ${formatRoleLabel(viewerRole)}` : ''}
                    </p>
                    <button type="button" style={{ ...button, fontSize: 11 }} onClick={() => setRosterOpen(true)}>
                        View Staff ({roleCounts.total || memberCount})
                    </button>
                </div>
            )}

            {/* Telegram-Style Management Broadcast Composer */}
            {canManage && !noteTarget && (
                <form onSubmit={submit} style={{ padding: '10px 14px', borderTop: `1px solid ${C.border}`, background: surfaceBg }}>
                    {editing ? (
                        <div style={{ fontSize: 12, marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span>Editing Notice</span>
                            <button type="button" style={button} onClick={() => { setEditing(null); setDraft(''); setAttachments([]); }}>Cancel Edit</button>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                            <select
                                aria-label="Notice Type"
                                value={kind}
                                disabled={busy}
                                onChange={e => {
                                    const nextKind = e.target.value;
                                    setKind(nextKind);
                                    if (nextKind === 'pending_payout') setPinOnPost(true);
                                }}
                                style={button}
                            >
                                <option value="notice">Club Notice</option>
                                <option value="pending_payout">Payout Request</option>
                            </select>
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: pinOnPost || kind === 'pending_payout' ? accentBlue : C.textSec, cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={kind === 'pending_payout' ? true : pinOnPost}
                                    disabled={busy || kind === 'pending_payout'}
                                    onChange={e => setPinOnPost(e.target.checked)}
                                />
                                📌 Pin
                            </label>
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: requireConfirmation ? '#f59e0b' : C.textSec, cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={requireConfirmation}
                                    disabled={busy}
                                    onChange={e => setRequireConfirmation(e.target.checked)}
                                />
                                ✅ Confirm Campaign
                            </label>
                            <button
                                type="button"
                                disabled={busy || uploadingPhoto || attachments.length >= 4}
                                onClick={() => photoInputRef.current?.click()}
                                style={{ ...button, padding: '4px 8px', fontSize: 11 }}
                            >
                                {uploadingPhoto ? 'Uploading...' : `📎 Attach${attachments.length > 0 ? ` (${attachments.length}/4)` : ''}`}
                            </button>
                            <input
                                ref={photoInputRef}
                                type="file"
                                accept="image/png,image/jpeg,image/gif,image/webp,application/pdf,text/csv,.pdf,.csv"
                                style={{ display: 'none' }}
                                onChange={e => void handlePhotoSelect(e)}
                            />
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => setPollOpen(prev => !prev)}
                                style={{ ...button, padding: '4px 8px', fontSize: 11, borderColor: pollOpen ? accentBlue : C.border, color: pollOpen ? accentBlue : C.text }}
                            >
                                📊 Poll
                            </button>
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => setScheduleEnabled(prev => !prev)}
                                style={{ ...button, padding: '4px 8px', fontSize: 11, borderColor: scheduleEnabled ? '#c084fc' : C.border, color: scheduleEnabled ? '#c084fc' : C.text }}
                            >
                                🕒 Schedule
                            </button>
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => setMentionPickerOpen(prev => !prev)}
                                style={{ ...button, padding: '4px 8px', fontSize: 11, borderColor: mentionPickerOpen || mentionAll || mentionUserIds.length > 0 ? accentBlue : C.border, color: mentionPickerOpen || mentionAll || mentionUserIds.length > 0 ? accentBlue : C.text }}
                            >
                                @ Mention
                            </button>
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => setTemplatesOpen(prev => !prev)}
                                style={{ ...button, padding: '4px 8px', fontSize: 11, borderColor: templatesOpen ? accentBlue : C.border, color: templatesOpen ? accentBlue : C.text }}
                            >
                                Templates
                            </button>
                            {draft.length > 3200 && (
                                <span style={{ marginLeft: 'auto', fontSize: 11, color: draft.length > 3800 ? '#f59e0b' : C.textSec }}>
                                    {draft.length}/4000
                                </span>
                            )}
                        </div>
                    )}

                    {/* Quick Broadcast Templates Picker */}
                    {!editing && templatesOpen && (
                        <div aria-label="Notice Templates" style={{ marginBottom: 8, padding: 6, borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {NOTICE_TEMPLATES.map(tpl => (
                                <button
                                    key={tpl.id}
                                    type="button"
                                    onClick={() => applyTemplate(tpl)}
                                    style={{ ...button, padding: '4px 9px', fontSize: 11, borderColor: accentBlue, color: accentBlue }}
                                >
                                    {tpl.label}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Optional Poll Builder */}
                    {!editing && pollOpen && (
                        <div style={{ marginBottom: 8, padding: 8, borderRadius: 8, border: `1px solid ${accentBlue}66`, background: C.bg, display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, color: accentBlue }}>
                                <span>📊 Staff Poll Builder</span>
                                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 500, color: C.textSec, cursor: 'pointer' }}>
                                    <input type="checkbox" checked={pollAllowMultiple} onChange={e => setPollAllowMultiple(e.target.checked)} />
                                    Allow Multiple
                                </label>
                            </div>
                            <input
                                type="text"
                                aria-label="Poll Question"
                                placeholder="Poll Question..."
                                maxLength={240}
                                value={pollQuestion}
                                onChange={e => setPollQuestion(e.target.value)}
                                style={{ ...button, textAlign: 'left', padding: '5px 8px' }}
                            />
                            {pollOptions.map((opt, idx) => (
                                <div key={idx} style={{ display: 'flex', gap: 6 }}>
                                    <input
                                        type="text"
                                        aria-label={`Poll Option ${idx + 1}`}
                                        placeholder={`Option ${idx + 1}`}
                                        maxLength={120}
                                        value={opt}
                                        onChange={e => setPollOptions(prev => prev.map((v, i) => (i === idx ? e.target.value : v)))}
                                        style={{ ...button, flex: 1, minWidth: 0, textAlign: 'left', padding: '4px 8px' }}
                                    />
                                    {pollOptions.length > 2 && (
                                        <button type="button" style={{ ...button, padding: '4px 8px', color: '#ef4444' }} onClick={() => setPollOptions(prev => prev.filter((_, i) => i !== idx))}>×</button>
                                    )}
                                </div>
                            ))}
                            {pollOptions.length < 6 && (
                                <button type="button" style={{ ...button, alignSelf: 'flex-start', padding: '3px 8px', fontSize: 11 }} onClick={() => setPollOptions(prev => [...prev, ''])}>
                                    + Add Option
                                </button>
                            )}
                        </div>
                    )}

                    {/* Optional Scheduled Publish Picker */}
                    {!editing && scheduleEnabled && (
                        <div style={{ marginBottom: 8, padding: '6px 8px', borderRadius: 8, border: '1px solid rgba(168, 85, 247, 0.45)', background: C.bg, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, fontSize: 11 }}>
                            <span style={{ color: '#c084fc', fontWeight: 700 }}>🕒 Publish At:</span>
                            <input
                                type="datetime-local"
                                aria-label="Schedule Publish Time"
                                value={scheduledFor}
                                onChange={e => setScheduledFor(e.target.value)}
                                style={{ ...button, padding: '4px 8px', fontSize: 11 }}
                            />
                            <button type="button" style={{ ...button, padding: '3px 7px', fontSize: 10 }} onClick={() => { setScheduleEnabled(false); setScheduledFor(''); }}>
                                Clear Schedule
                            </button>
                        </div>
                    )}

                    {/* Active Mention Chips */}
                    {!editing && (mentionAll || mentionUserIds.length > 0) && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
                            {mentionAll && (
                                <button type="button" onClick={() => setMentionAll(false)} style={{ ...button, padding: '2px 8px', fontSize: 11, borderRadius: 999, borderColor: accentBlue, color: accentBlue }}>
                                    @AllStaff ×
                                </button>
                            )}
                            {!mentionAll && mentionUserIds.map(uid => {
                                const m = members.find(x => x.user_id === uid);
                                return (
                                    <button key={uid} type="button" onClick={() => setMentionUserIds(prev => prev.filter(x => x !== uid))} style={{ ...button, padding: '2px 8px', fontSize: 11, borderRadius: 999, borderColor: accentBlue, color: accentBlue }}>
                                        {`@${m?.display_name || m?.username || 'Staff'} ×`}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Inline @Mention Picker */}
                    {!editing && mentionPickerOpen && (
                        <div role="listbox" aria-label="Mention Club Staff" style={{ marginBottom: 8, padding: 6, borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                            <button type="button" onClick={() => selectMention('ALL')} style={{ ...button, padding: '4px 8px', fontSize: 11, borderColor: accentBlue, color: accentBlue, fontWeight: 700 }}>
                                @AllStaff ({roleCounts.total || memberCount})
                            </button>
                            {mentionCandidates.map(m => (
                                <button key={m.user_id} type="button" onClick={() => selectMention(m)} style={{ ...button, padding: '4px 8px', fontSize: 11 }}>
                                    {`@${m.display_name || m.username} · ${formatRoleLabel(m.role)}`}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Pending Attachment Previews (Images, PDF, CSV) */}
                    {attachments.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                            {attachments.map((att, idx) => (
                                att.mime && !att.mime.startsWith('image/') ? (
                                    <div key={`${att.url}-${idx}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, fontSize: 11 }}>
                                        <span>{att.mime === 'application/pdf' ? '📄' : '📊'}</span>
                                        <span style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.name}</span>
                                        <button type="button" aria-label="Remove Attachment" onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 0, fontSize: 12 }}>×</button>
                                    </div>
                                ) : (
                                    <div key={`${att.url}-${idx}`} style={{ position: 'relative', width: 58, height: 58, borderRadius: 8, overflow: 'hidden', border: `1px solid ${C.border}` }}>
                                        <img src={att.url} alt={att.name || 'Attachment'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        <button
                                            type="button"
                                            aria-label="Remove Attachment"
                                            onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))}
                                            style={{ position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,0.75)', color: '#fff', fontSize: 11, cursor: 'pointer', padding: 0 }}
                                        >
                                            ×
                                        </button>
                                    </div>
                                )
                            ))}
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: 8 }}>
                        <textarea
                            aria-label="Notice Text"
                            placeholder="Write A Club Notice... Supports **Bold**, - Bullets, @Mentions, Or Paste Images"
                            value={draft}
                            onChange={e => handleDraftChange(e.target.value)}
                            onPaste={handleComposerPaste}
                            onKeyDown={e => {
                                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && draft.trim() && !busy && !uploadingPhoto) {
                                    void submit(e);
                                }
                            }}
                            maxLength={4000}
                            disabled={busy}
                            rows={2}
                            style={{ ...button, flex: 1, minWidth: 0, resize: 'vertical', maxHeight: 120, textAlign: 'left', padding: '8px 10px' }}
                        />
                        <button
                            type="submit"
                            disabled={busy || uploadingPhoto || !draft.trim()}
                            style={{ ...button, background: scheduleEnabled ? '#9333ea' : accentBlue, color: '#fff', borderColor: scheduleEnabled ? '#9333ea' : accentBlue, fontWeight: 700, padding: '8px 16px' }}
                        >
                            {busy ? 'Saving...' : editing ? 'Save' : scheduleEnabled ? 'Schedule' : 'Post'}
                        </button>
                    </div>
                </form>
            )}

            {/* Native <dialog> Telegram-Style Staff & Agents Roster Modal */}
            <dialog
                ref={rosterDialogRef}
                closedby="any"
                aria-labelledby={rosterTitleId}
                className="nb-modal-dialog"
                style={{
                    width: 'min(480px, calc(100vw - 24px))',
                    maxHeight: '82vh',
                    padding: 0,
                    border: `1px solid ${C.border}`,
                    borderRadius: 14,
                    background: surfaceBg,
                    color: C.text,
                    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.55)',
                    overflow: 'hidden',
                }}
            >
                <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                        <h1 id={rosterTitleId} style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
                            {club.name} · Notice Board Staff
                        </h1>
                        <div style={{ fontSize: 12, color: C.textSec, marginTop: 2 }}>
                            {memberSummary}
                        </div>
                    </div>
                    {rosterOpen && (
                        <form method="dialog" style={{ margin: 0 }}>
                            <button type="submit" value="close" autoFocus style={button} aria-label="Close Staff Roster">Close</button>
                        </form>
                    )}
                </div>

                {/* Role Breakdown Grid */}
                <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, background: C.bg }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(84px, 1fr))', gap: 8 }}>
                        {[
                            { label: 'Total Staff', value: roleCounts.total, color: C.text },
                            { label: 'Admins', value: roleCounts.management, color: '#f59e0b' },
                            { label: 'Super Agents', value: roleCounts.super_agent, color: '#06b6d4' },
                            { label: 'Agents', value: roleCounts.agent, color: '#3b82f6' },
                            { label: 'Sub-Agents', value: roleCounts.sub_agent, color: '#94a3b8' },
                        ].map(stat => (
                            <div key={stat.label} style={{ padding: '8px 10px', borderRadius: 10, border: `1px solid ${C.border}`, background: surfaceBg, textAlign: 'center' }}>
                                <div style={{ fontSize: 17, fontWeight: 800, color: stat.color }}>{stat.value}</div>
                                <div style={{ fontSize: 10, color: C.textSec, marginTop: 2 }}>{stat.label}</div>
                            </div>
                        ))}
                    </div>
                    <p style={{ margin: '10px 0 0', fontSize: 11, color: C.textSec }}>
                        ✓ Auto-Synced · All Active Club Owners, Admins, And Agents Are Enrolled Automatically.
                    </p>
                </div>

                {/* Roster Search & Role Filter */}
                <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                    <input
                        type="search"
                        aria-label="Search Staff Roster"
                        placeholder="Search Agents & Admins..."
                        value={rosterSearch}
                        onChange={e => setRosterSearch(e.target.value)}
                        style={{
                            flex: '1 1 160px',
                            minWidth: 140,
                            border: `1px solid ${C.border}`,
                            borderRadius: 8,
                            background: C.bg,
                            color: C.text,
                            padding: '6px 10px',
                            fontSize: 12,
                            fontFamily: 'inherit',
                        }}
                    />
                    {[
                        { id: 'all', label: `All (${roleCounts.total})` },
                        { id: 'management', label: `Admins (${roleCounts.management})` },
                        { id: 'agents', label: `Agents (${roleCounts.agents})` },
                    ].map(f => (
                        <button
                            key={f.id}
                            type="button"
                            onClick={() => setRosterRoleFilter(f.id)}
                            style={{
                                border: `1px solid ${rosterRoleFilter === f.id ? accentBlue : C.border}`,
                                borderRadius: 999,
                                background: rosterRoleFilter === f.id ? 'rgba(0, 132, 255, 0.16)' : 'transparent',
                                color: rosterRoleFilter === f.id ? accentBlue : C.textSec,
                                padding: '4px 10px',
                                fontSize: 11,
                                fontWeight: 600,
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                            }}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>

                {/* Scrollable Member List With Message & Filter Actions */}
                <div className="nb-scroller" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '10px 16px' }}>
                    {filteredMembers.length === 0 ? (
                        <p style={{ color: C.textSec, textAlign: 'center', fontSize: 12, padding: 20 }}>
                            {members.length === 0 ? 'No Active Staff Found For This Club.' : 'No Staff Match Your Filter.'}
                        </p>
                    ) : (
                        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {filteredMembers.map(member => {
                                const meta = ROLE_META[member.role] || { color: accentBlue, bg: subtleBg };
                                return (
                                    <li
                                        key={member.user_id}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 8,
                                            padding: '8px 10px',
                                            borderRadius: 10,
                                            border: `1px solid ${C.border}`,
                                            background: C.bg,
                                        }}
                                    >
                                        <div style={{ position: 'relative', flexShrink: 0 }}>
                                            <div style={{
                                                width: 34,
                                                height: 34,
                                                borderRadius: '50%',
                                                overflow: 'hidden',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: 12,
                                                fontWeight: 700,
                                                color: meta.color,
                                                background: meta.bg,
                                                border: `1.5px solid ${meta.color}66`,
                                            }}>
                                                {member.avatar_url
                                                    ? <img src={member.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                    : initialsOf(member.display_name || member.username)}
                                            </div>
                                            {member.is_online && (
                                                <span
                                                    aria-label="Online"
                                                    style={{
                                                        position: 'absolute',
                                                        right: 0,
                                                        bottom: 0,
                                                        width: 9,
                                                        height: 9,
                                                        borderRadius: '50%',
                                                        background: '#22c55e',
                                                        border: `2px solid ${C.bg}`,
                                                    }}
                                                />
                                            )}
                                        </div>
                                        <div style={{ minWidth: 0, flex: 1 }}>
                                            <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {member.display_name || member.username || 'Club Staff'}
                                                {member.user_id === userId && <span style={{ color: C.textSec, fontWeight: 400 }}> (You)</span>}
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                                                {rolePill(member.role)}
                                                {member.username && (
                                                    <span style={{ fontSize: 11, color: C.textSec, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        @{member.username}
                                                    </span>
                                                )}
                                            </div>
                                            {canManage && member.sla && (
                                                <div data-testid="agent-sla-scorecard" style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4, fontSize: 10 }}>
                                                    <span style={{ padding: '1px 6px', borderRadius: 999, background: subtleBg, border: `1px solid ${C.border}`, color: C.textSec }}>
                                                        {`30d Median: ${formatSlaMinutes(member.sla.median_minutes) || 'N/A'}`}
                                                    </span>
                                                    <span style={{ padding: '1px 6px', borderRadius: 999, background: subtleBg, border: `1px solid ${C.border}`, color: '#22c55e' }}>
                                                        {`${member.sla.completed_30d || 0} Done`}
                                                    </span>
                                                    {Number(member.sla.overdue_30d || 0) > 0 && (
                                                        <span style={{ padding: '1px 6px', borderRadius: 999, background: 'rgba(245, 158, 11, 0.14)', border: '1px solid rgba(245, 158, 11, 0.4)', color: '#f59e0b', fontWeight: 700 }}>
                                                            {`${member.sla.overdue_30d} Overdue`}
                                                        </span>
                                                    )}
                                                    {Number(member.sla.escalated_30d || 0) > 0 && (
                                                        <span style={{ padding: '1px 6px', borderRadius: 999, background: 'rgba(239, 68, 68, 0.14)', border: '1px solid rgba(239, 68, 68, 0.4)', color: '#ef4444', fontWeight: 700 }}>
                                                            {`${member.sla.escalated_30d} Escalated`}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                                            <button
                                                type="button"
                                                style={{ ...button, padding: '4px 7px', fontSize: 11 }}
                                                onClick={() => { setMemberFilter(member); setRosterOpen(false); }}
                                            >
                                                Filter
                                            </button>
                                            {onMessageMember && member.user_id !== userId && (
                                                <button
                                                    type="button"
                                                    style={{ ...button, padding: '4px 7px', fontSize: 11, borderColor: accentBlue, color: accentBlue, fontWeight: 600 }}
                                                    onClick={() => { setRosterOpen(false); onMessageMember(member); }}
                                                >
                                                    Message
                                                </button>
                                            )}
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </dialog>

            {/* Native <dialog> Overdue Payout Alert & Escalation Settings Modal (Owner / Co-Owner) */}
            <dialog
                ref={settingsDialogRef}
                closedby="any"
                aria-labelledby={settingsTitleId}
                className="nb-modal-dialog"
                style={{
                    width: 'min(440px, calc(100vw - 24px))',
                    maxHeight: '82vh',
                    padding: 0,
                    border: `1px solid ${C.border}`,
                    borderRadius: 14,
                    background: surfaceBg,
                    color: C.text,
                    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.55)',
                    overflow: 'hidden',
                }}
            >
                <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <h1 id={settingsTitleId} style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
                        Overdue Payout Alert Settings
                    </h1>
                    {settingsOpen && (
                        <button type="button" style={button} onClick={() => setSettingsOpen(false)} aria-label="Close Alert Settings">Close</button>
                    )}
                </div>
                {settingsOpen && (
                    <form onSubmit={saveAlertSettings} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                            <span style={{ fontWeight: 600 }}>Unfulfilled Alert Threshold (Hours)</span>
                            <select
                                aria-label="Unfulfilled Alert Threshold"
                                value={settingsDraft.overdue_threshold_hours}
                                onChange={e => {
                                    const nextTh = Number(e.target.value);
                                    setSettingsDraft(prev => ({
                                        ...prev,
                                        overdue_threshold_hours: nextTh,
                                        followup_threshold_hours: prev.followup_threshold_hours && prev.followup_threshold_hours <= nextTh ? null : prev.followup_threshold_hours,
                                        auto_escalate_hours: prev.auto_escalate_hours && prev.auto_escalate_hours < nextTh ? null : prev.auto_escalate_hours,
                                    }));
                                }}
                                style={button}
                            >
                                {[1, 2, 3, 4, 6, 8, 12, 24].map(h => (
                                    <option key={h} value={h}>{`${h} ${h === 1 ? 'Hour' : 'Hours'}`}</option>
                                ))}
                            </select>
                        </label>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                            <span style={{ fontWeight: 600 }}>Second-Stage Follow-Up Reminder</span>
                            <select
                                aria-label="Second-Stage Follow-Up Reminder"
                                value={settingsDraft.followup_threshold_hours ?? ''}
                                onChange={e => setSettingsDraft(prev => ({ ...prev, followup_threshold_hours: e.target.value ? Number(e.target.value) : null }))}
                                style={button}
                            >
                                <option value="">Disabled (Single Alert Only)</option>
                                {[6, 8, 12, 24, 48].filter(h => h > settingsDraft.overdue_threshold_hours).map(h => (
                                    <option key={h} value={h}>{`Remind Again At ${h} Hours`}</option>
                                ))}
                            </select>
                        </label>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                            <span style={{ fontWeight: 600 }}>Auto-Escalate To Club Bank</span>
                            <select
                                aria-label="Auto-Escalate To Club Bank"
                                value={settingsDraft.auto_escalate_hours ?? ''}
                                onChange={e => setSettingsDraft(prev => ({ ...prev, auto_escalate_hours: e.target.value ? Number(e.target.value) : null }))}
                                style={button}
                            >
                                <option value="">Manual Escalation Only</option>
                                {[4, 6, 8, 12, 24, 48].filter(h => h >= settingsDraft.overdue_threshold_hours).map(h => (
                                    <option key={h} value={h}>{`Auto-Escalate After ${h} Hours`}</option>
                                ))}
                            </select>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={Boolean(settingsDraft.notify_admins)}
                                onChange={e => setSettingsDraft(prev => ({ ...prev, notify_admins: e.target.checked }))}
                            />
                            <span>Also Notify Club Management And Admins On Overdue Payouts</span>
                        </label>
                        <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Optional Quiet Hours Backup Duty Routing</div>
                            <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                                <span style={{ fontWeight: 600 }}>Backup Role During Quiet Hours</span>
                                <select
                                    aria-label="Quiet Hours Backup Role"
                                    value={settingsDraft.quiet_hours_backup_role ?? ''}
                                    onChange={e => {
                                        const val = e.target.value || null;
                                        setSettingsDraft(prev => ({
                                            ...prev,
                                            quiet_hours_backup_role: val,
                                            quiet_hours_start: val ? (prev.quiet_hours_start ?? 23) : null,
                                            quiet_hours_end: val ? (prev.quiet_hours_end ?? 7) : null,
                                        }));
                                    }}
                                    style={button}
                                >
                                    <option value="">Disabled (Off)</option>
                                    <option value="co_owner">Alert CO Owners During Quiet Hours</option>
                                    <option value="admin">Alert CO Owners And Admins During Quiet Hours</option>
                                </select>
                            </label>
                            {settingsDraft.quiet_hours_backup_role && (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11 }}>
                                        <span>Start Hour</span>
                                        <select
                                            aria-label="Quiet Hours Start"
                                            value={settingsDraft.quiet_hours_start ?? 23}
                                            onChange={e => setSettingsDraft(prev => ({ ...prev, quiet_hours_start: Number(e.target.value) }))}
                                            style={button}
                                        >
                                            {Array.from({ length: 24 }, (_, h) => (
                                                <option key={h} value={h}>{`${String(h).padStart(2, '0')}:00`}</option>
                                            ))}
                                        </select>
                                    </label>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11 }}>
                                        <span>End Hour</span>
                                        <select
                                            aria-label="Quiet Hours End"
                                            value={settingsDraft.quiet_hours_end ?? 7}
                                            onChange={e => setSettingsDraft(prev => ({ ...prev, quiet_hours_end: Number(e.target.value) }))}
                                            style={button}
                                        >
                                            {Array.from({ length: 24 }, (_, h) => (
                                                <option key={h} value={h}>{`${String(h).padStart(2, '0')}:00`}</option>
                                            ))}
                                        </select>
                                    </label>
                                    <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 11 }}>
                                        <span>Time Zone</span>
                                        <select
                                            aria-label="Quiet Hours Time Zone"
                                            value={settingsDraft.quiet_hours_tz || 'America/Chicago'}
                                            onChange={e => setSettingsDraft(prev => ({ ...prev, quiet_hours_tz: e.target.value }))}
                                            style={button}
                                        >
                                            <option value="America/Chicago">Central</option>
                                            <option value="America/New_York">Eastern</option>
                                            <option value="America/Los_Angeles">Pacific</option>
                                            <option value="UTC">UTC</option>
                                        </select>
                                    </label>
                                </div>
                            )}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                            <button type="button" style={button} disabled={settingsBusy} onClick={() => setSettingsOpen(false)}>Cancel</button>
                            <button type="submit" disabled={settingsBusy} style={{ ...button, background: accentBlue, color: '#fff', borderColor: accentBlue, fontWeight: 700 }}>
                                {settingsBusy ? 'Saving...' : 'Save Settings'}
                            </button>
                        </div>
                    </form>
                )}
            </dialog>

            {/* Native <dialog> Management Payout Ops, Agent SLA Leaderboard & Push Receipt Audit */}
            <dialog
                ref={opsDialogRef}
                closedby="any"
                aria-labelledby={opsTitleId}
                className="nb-modal-dialog"
                style={{
                    width: 'min(560px, calc(100vw - 24px))',
                    maxHeight: '84vh',
                    padding: 0,
                    border: `1px solid ${C.border}`,
                    borderRadius: 14,
                    background: surfaceBg,
                    color: C.text,
                    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.55)',
                    overflow: 'hidden',
                }}
            >
                <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div>
                        <h1 id={opsTitleId} style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
                            {club.name} · Payout Ops & Agent SLA
                        </h1>
                        <div style={{ fontSize: 11, color: C.textSec, marginTop: 2 }}>
                            Rolling 30-Day Fulfillment Turnaround And Device Alert Receipts
                        </div>
                    </div>
                    {opsOpen && (
                        <button type="button" style={button} onClick={() => setOpsOpen(false)} aria-label="Close Payout Ops">Close</button>
                    )}
                </div>
                {opsOpen && (
                    <>
                        <div style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}`, background: C.bg, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                            <button
                                type="button"
                                aria-pressed={opsTab === 'sla'}
                                onClick={() => setOpsTab('sla')}
                                style={{ ...button, padding: '4px 10px', fontSize: 11, borderColor: opsTab === 'sla' ? accentBlue : C.border, color: opsTab === 'sla' ? accentBlue : C.textSec, fontWeight: 700 }}
                            >
                                {`Agent SLA Leaderboard (${sortedSlaAgents.length})`}
                            </button>
                            <button
                                type="button"
                                aria-pressed={opsTab === 'audit'}
                                onClick={() => { setOpsTab('audit'); void loadPayoutAudit(); }}
                                style={{ ...button, padding: '4px 10px', fontSize: 11, borderColor: opsTab === 'audit' ? accentBlue : C.border, color: opsTab === 'audit' ? accentBlue : C.textSec, fontWeight: 700 }}
                            >
                                Alert Delivery Log (30d)
                            </button>
                            {opsTab === 'sla' && sortedSlaAgents.length > 0 && (
                                <button
                                    type="button"
                                    onClick={exportAgentSlaCsv}
                                    style={{ ...button, marginLeft: 'auto', padding: '4px 10px', fontSize: 11, borderColor: '#22c55e', color: '#22c55e', fontWeight: 700 }}
                                >
                                    Export SLA CSV
                                </button>
                            )}
                            {opsTab === 'audit' && (
                                <button
                                    type="button"
                                    disabled={auditLoading}
                                    onClick={() => void loadPayoutAudit()}
                                    style={{ ...button, marginLeft: 'auto', padding: '4px 10px', fontSize: 11 }}
                                >
                                    {auditLoading ? 'Refreshing...' : 'Refresh Log'}
                                </button>
                            )}
                        </div>
                        {opsTab === 'sla' ? (
                            <div className="nb-scroller" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 16px' }}>
                                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 5, marginBottom: 10, fontSize: 11 }}>
                                    <span style={{ color: C.textSec }}>Sort By:</span>
                                    {[
                                        { id: 'overdue', label: 'Most Overdue' },
                                        { id: 'median', label: 'Fastest Median' },
                                        { id: 'completed', label: 'Most Completed' },
                                        { id: 'escalated', label: 'Most Escalated' },
                                    ].map(opt => (
                                        <button
                                            key={opt.id}
                                            type="button"
                                            onClick={() => setSlaSortBy(opt.id)}
                                            style={{ ...button, padding: '2px 8px', fontSize: 10, borderColor: slaSortBy === opt.id ? accentBlue : C.border, color: slaSortBy === opt.id ? accentBlue : C.textSec }}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                                {sortedSlaAgents.length === 0 ? (
                                    <p style={{ color: C.textSec, textAlign: 'center', fontSize: 12, padding: 20 }}>No Active Agents Found For This Club.</p>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        {sortedSlaAgents.map(agent => (
                                            <div key={agent.user_id} style={{ padding: '8px 10px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.bg, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                                <div style={{ minWidth: 0 }}>
                                                    <div style={{ fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        <span>{agent.display_name || agent.username}</span>
                                                        {rolePill(agent.role)}
                                                    </div>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4, fontSize: 11, color: C.textSec }}>
                                                        <span>{`Median: ${formatSlaMinutes(agent.sla.median_minutes) || 'N/A'}`}</span>
                                                        <span style={{ color: '#22c55e' }}>{`${agent.sla.completed_30d || 0} Done`}</span>
                                                        <span style={{ color: Number(agent.sla.overdue_30d || 0) > 0 ? '#f59e0b' : C.textSec, fontWeight: Number(agent.sla.overdue_30d || 0) > 0 ? 700 : 400 }}>
                                                            {`${agent.sla.overdue_30d || 0} Overdue`}
                                                        </span>
                                                        <span style={{ color: Number(agent.sla.escalated_30d || 0) > 0 ? '#ef4444' : C.textSec }}>
                                                            {`${agent.sla.escalated_30d || 0} Escalated`}
                                                        </span>
                                                        {Number(agent.sla.pending_now || 0) > 0 && (
                                                            <span style={{ color: accentBlue, fontWeight: 700 }}>{`${agent.sla.pending_now} Pending Now`}</span>
                                                        )}
                                                    </div>
                                                </div>
                                                {onMessageMember && agent.user_id !== userId && (
                                                    <button type="button" style={{ ...button, padding: '4px 8px', fontSize: 11, borderColor: accentBlue, color: accentBlue }} onClick={() => { setOpsOpen(false); onMessageMember(agent); }}>
                                                        Message
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="nb-scroller" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px 16px' }}>
                                {auditLoading ? (
                                    <p style={{ color: C.textSec, textAlign: 'center', fontSize: 12, padding: 20 }}>Loading Alert Delivery Log...</p>
                                ) : auditRows.length === 0 ? (
                                    <p style={{ color: C.textSec, textAlign: 'center', fontSize: 12, padding: 20 }}>No Overdue Or Pre-Breach Payout Alerts In The Last 30 Days.</p>
                                ) : (
                                    <div data-testid="payout-audit-log" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        {auditRows.map((item, idx) => {
                                            const dMeta = DELIVERY_STATE_META[item.delivery_state] || DELIVERY_STATE_META.in_app_only;
                                            const kindLabel = item.alert_kind === 'prebreach'
                                                ? `${item.threshold_hours}h Pre-Breach Warning`
                                                : item.alert_kind === 'followup'
                                                    ? `${item.threshold_hours}h Follow-Up Alert`
                                                    : `${item.threshold_hours}h Overdue Alert`;
                                            return (
                                                <div key={`${item.notification_id || item.cashout_id}-${idx}`} style={{ padding: '9px 11px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.bg, fontSize: 12 }}>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                                                        <strong>{`${item.player_name || 'Player'} · ${formatChipsSimple(item.amount)} Chips`}</strong>
                                                        <span style={{ fontSize: 10, color: C.textSec }}>{new Date(item.notified_at).toLocaleString()}</span>
                                                    </div>
                                                    <div style={{ fontSize: 11, color: C.textSec, marginTop: 3 }}>
                                                        {`${kindLabel} · Sent To ${item.recipient_name || 'Staff'} (${formatRoleLabel(item.recipient_role)}) · Upline: ${item.agent_name || 'Agent'}`}
                                                    </div>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                                                        <span style={{ padding: '2px 7px', borderRadius: 999, fontSize: 10, fontWeight: 700, color: dMeta.color, background: dMeta.bg }}>
                                                            {dMeta.label}
                                                        </span>
                                                        {item.resolution_label ? (
                                                            <span style={{ padding: '2px 7px', borderRadius: 999, fontSize: 10, fontWeight: 700, color: '#22c55e', background: 'rgba(34, 197, 94, 0.14)' }}>
                                                                {`✓ ${item.resolution_label}`}
                                                            </span>
                                                        ) : (
                                                            <span style={{ padding: '2px 7px', borderRadius: 999, fontSize: 10, fontWeight: 700, color: '#f59e0b', background: 'rgba(245, 158, 11, 0.14)' }}>
                                                                {item.cashout_status === 'pending' ? 'Pending Settlement' : formatRoleLabel(item.cashout_status)}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </dialog>

            {/* Native <dialog> Image Attachment Lightbox */}
            <dialog
                ref={lightboxDialogRef}
                closedby="any"
                aria-labelledby={lightboxTitleId}
                className="nb-modal-dialog"
                style={{
                    width: 'min(640px, calc(100vw - 24px))',
                    maxHeight: '88vh',
                    padding: 0,
                    border: `1px solid ${C.border}`,
                    borderRadius: 14,
                    background: surfaceBg,
                    color: C.text,
                    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.7)',
                    overflow: 'hidden',
                }}
            >
                <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <h1 id={lightboxTitleId} style={{ fontSize: 14, fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {lightboxImage?.name || 'Notice Attachment'}
                    </h1>
                    {lightboxImage && (
                        <button type="button" style={button} onClick={() => setLightboxImage(null)}>Close</button>
                    )}
                </div>
                {lightboxImage && (
                    <div style={{ padding: 12, display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#000', overflow: 'auto' }}>
                        <img src={lightboxImage.url} alt={lightboxImage.name || 'Notice Attachment'} style={{ maxWidth: '100%', maxHeight: '72vh', objectFit: 'contain' }} />
                    </div>
                )}
            </dialog>
        </section>
    );
}
