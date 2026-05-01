/**
 * Compose Store — Zustand
 *
 * Multi-step state container for the FB-style upload flow:
 *   /hub/social-media/compose pages render different screens based on `step`,
 *   but all share the same draft state. Survives in-app route hops.
 *
 * The state is intentionally NOT persisted — each compose session starts fresh.
 * If the user navigates away mid-compose, blob URLs leak; we revoke them in
 * reset() to avoid memory issues.
 */
import { create } from 'zustand';

const DEFAULTS = {
    step: 'picker',                  // 'picker' | 'edit' | 'cover' | 'uploading'
    media: [],                       // [{ id, type:'photo'|'video', file, url:blobUrl, thumbnail, durationSec, width, height }]
    draft: '',                       // post text / description
    visibility: 'public',            // legacy public/friends — kept for fn_create_social_post compatibility
    audienceMode: 'public',          // public | friends | friends_except | specific | only_me | custom
    audienceList: [],                // user IDs (for friends_except / specific)
    location: null,                  // { name, lat, lng, place_id }
    aiLabel: false,                  // self-disclosed AI content
    coAuthors: [],                   // [{ id, name, avatar }] — pending invites; backend wires the accept flow
    shareToGroups: [],               // [{ id, name }] — home groups to mirror to
    topics: [],                      // ['hand-history', 'tournament-results', ...]
    shareToStory: false,             // also publish as 24h story
    coverFrameIndex: null,           // 0..7 — user's pick from the cover scrubber
    customCoverFile: null,           // File — overrides cover_frame_index when set
    customCoverPreviewUrl: null,     // blob: URL for preview of customCoverFile
    inFlight: false,                 // upload + post-create in progress
    error: null,                     // user-facing error string for the current screen
    uploadPct: 0,                    // 0-100 — bgUpload onProgress live %
    uploadLabel: '',                 // human-readable label e.g. "Uploading… 42% at 1.2 MB/s — ~14s"
    uploadStage: null,               // 'preflight' | 'uploading' | 'creating' | 'finishing' | null
};

export const useComposeStore = create((set, get) => ({
    ...DEFAULTS,

    // ── Step navigation ─────────────────────────────────────────────────────
    setStep: (step) => set({ step, error: null }),
    goToEdit: () => {
        const { media } = get();
        if (!media.length) return; // can't edit nothing
        set({ step: 'edit', error: null });
    },
    goToCover: () => set({ step: 'cover', error: null }),
    backToPicker: () => set({ step: 'picker', error: null }),

    // ── Media management ────────────────────────────────────────────────────
    addMedia: (items) => set((state) => {
        // De-dupe by file.name + size + lastModified (cheap heuristic, enough for picker)
        const fp = (m) => m.file ? `${m.file.name}|${m.file.size}|${m.file.lastModified}` : m.id;
        const existing = new Set(state.media.map(fp));
        const additions = items.filter(m => !existing.has(fp(m)));
        return { media: [...state.media, ...additions], error: null };
    }),
    removeMedia: (id) => set((state) => {
        const target = state.media.find(m => m.id === id);
        if (target?.url?.startsWith('blob:')) {
            try { URL.revokeObjectURL(target.url); } catch (_) {}
        }
        return { media: state.media.filter(m => m.id !== id) };
    }),
    reorderMedia: (fromIndex, toIndex) => set((state) => {
        const next = state.media.slice();
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, moved);
        return { media: next };
    }),
    setMediaThumbnail: (id, thumbnail) => set((state) => ({
        media: state.media.map(m => m.id === id ? { ...m, thumbnail } : m),
    })),

    // ── Draft + metadata ────────────────────────────────────────────────────
    setDraft: (draft) => set({ draft }),
    setVisibility: (visibility) => {
        // Keep audienceMode mirrored for the most common cases so existing
        // RPC paths keep working without further plumbing.
        const next = { visibility };
        if (visibility === 'public' || visibility === 'friends' || visibility === 'only_me') {
            next.audienceMode = visibility;
        }
        set(next);
    },
    setAudience: (audienceMode, audienceList = []) => set({
        audienceMode,
        audienceList,
        // Mirror back to legacy visibility for the public/friends/only_me cases
        visibility: (audienceMode === 'public' || audienceMode === 'friends' || audienceMode === 'only_me')
            ? audienceMode
            : 'friends', // friends_except / specific / custom default to friends-tier visibility
    }),
    setLocation: (location) => set({ location }),
    setAiLabel: (aiLabel) => set({ aiLabel: !!aiLabel }),
    setCoAuthors: (coAuthors) => set({ coAuthors }),
    setShareToGroups: (shareToGroups) => set({ shareToGroups }),
    setTopics: (topics) => set({ topics }),
    setShareToStory: (shareToStory) => set({ shareToStory: !!shareToStory }),

    // ── Cover frame ─────────────────────────────────────────────────────────
    setCoverFrameIndex: (idx) => set({ coverFrameIndex: idx, customCoverFile: null, customCoverPreviewUrl: null }),
    setCustomCover: (file) => {
        const prevPreview = get().customCoverPreviewUrl;
        if (prevPreview?.startsWith('blob:')) {
            try { URL.revokeObjectURL(prevPreview); } catch (_) {}
        }
        if (!file) {
            set({ customCoverFile: null, customCoverPreviewUrl: null });
            return;
        }
        const previewUrl = (typeof URL !== 'undefined' && URL.createObjectURL)
            ? URL.createObjectURL(file)
            : null;
        set({ customCoverFile: file, customCoverPreviewUrl: previewUrl, coverFrameIndex: null });
    },

    // ── Lifecycle ───────────────────────────────────────────────────────────
    setInFlight: (inFlight) => set({ inFlight }),
    setError: (error) => set({ error }),

    // ── Upload progress ────────────────────────────────────────────────────
    setUploadProgress: (pct, label) => set({
        uploadPct: typeof pct === 'number' ? Math.max(0, Math.min(100, pct)) : 0,
        uploadLabel: label || '',
    }),
    setUploadStage: (stage) => set({ uploadStage: stage || null }),

    reset: () => {
        // Clean up blob URLs to avoid memory leaks
        const { media, customCoverPreviewUrl } = get();
        media.forEach(m => {
            if (m.url?.startsWith('blob:')) {
                try { URL.revokeObjectURL(m.url); } catch (_) {}
            }
        });
        if (customCoverPreviewUrl?.startsWith('blob:')) {
            try { URL.revokeObjectURL(customCoverPreviewUrl); } catch (_) {}
        }
        set({ ...DEFAULTS });
    },

    // ── Selectors / derived ─────────────────────────────────────────────────
    hasVideo: () => get().media.some(m => m.type === 'video'),
    primaryVideoFile: () => get().media.find(m => m.type === 'video')?.file || null,
}));

// Helpful for non-React consumers (e.g. background-upload subscribe handlers
// triggered before the component re-renders)
export const composeStore = useComposeStore;
