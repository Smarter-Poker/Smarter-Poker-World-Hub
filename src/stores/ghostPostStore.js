/**
 * 👻 GHOST POST STORE
 * src/stores/ghostPostStore.js
 *
 * Global singleton that manages optimistic "ghost" posts — placeholder cards
 * injected at the top of the social feed while a video upload is in progress.
 *
 * Flow:
 *   1. User hits "Post" with a video → EnhancedPostCreator calls ghostPost.create()
 *   2. Feed view subscribes via ghostPost.subscribe() → prepends the ghost card
 *   3. bgUpload progress → ghostPost.updateProgress() → card shows upload %
 *   4. DB insert succeeds → ghostPost.promote(realPostId) → ghost becomes real post
 *   5. On error → ghostPost.remove() → ghost card fades out with error toast
 *
 * Usage:
 *   import ghostPost from '@/stores/ghostPostStore';
 *   ghostPost.create({ content, user, videoPreviewUrl });
 *   ghostPost.updateProgress(42, 'Uploading… 42%');
 *   ghostPost.promote(newPost);
 *   ghostPost.remove();
 */

let _ghost = null;       // { id, content, user, videoPreviewUrl, progress, label, status }
let _listeners = new Set();

function _notify() {
    _listeners.forEach((fn) => fn(_ghost));
}

const ghostPost = {
    /** Current ghost post (or null) */
    get current() { return _ghost; },

    /**
     * Subscribe to ghost post changes.
     * @param {Function} callback - Called with the ghost post object (or null)
     * @returns {Function} unsubscribe
     */
    subscribe(callback) {
        _listeners.add(callback);
        // Immediately emit current state
        callback(_ghost);
        return () => _listeners.delete(callback);
    },

    /**
     * Create a new ghost post — appears at top of feed immediately.
     * @param {Object} opts
     * @param {string} opts.content        - Post caption text
     * @param {Object} opts.user           - { id, name, avatar }
     * @param {string} [opts.videoPreviewUrl] - Object URL for blurred video thumbnail
     * @param {string} [opts.contentType]  - 'video' or 'image'
     */
    create({ content, user, videoPreviewUrl, contentType = 'video' }) {
        _ghost = {
            id: `ghost_${Date.now()}`,
            isGhost: true,
            content: content || '',
            contentType,
            user: user || {},
            videoPreviewUrl: videoPreviewUrl || null,
            progress: 0,
            label: 'Preparing…',
            status: 'uploading', // 'uploading' | 'processing' | 'done' | 'error'
            createdAt: new Date().toISOString(),
        };
        _notify();
    },

    /**
     * Update the ghost post's upload progress.
     * @param {number} progress - 0-100
     * @param {string} label    - Human-readable status label
     */
    updateProgress(progress, label) {
        if (!_ghost) return;
        _ghost = { ..._ghost, progress, label };
        _notify();
    },

    /**
     * Promote the ghost to a real post — the feed replaces the ghost card
     * with the actual post data from the database.
     * @param {Object} realPost - The full post object from the DB
     */
    promote(realPost) {
        if (!_ghost) return;
        // Clean up video preview blob URL to prevent memory leak
        if (_ghost.videoPreviewUrl) {
            try { URL.revokeObjectURL(_ghost.videoPreviewUrl); } catch (_) {}
        }
        _ghost = null;
        _notify();
        // The caller should also prepend the real post to the feed state
    },

    /**
     * Remove the ghost post (on error or abort).
     */
    remove() {
        if (!_ghost) return;
        if (_ghost.videoPreviewUrl) {
            try { URL.revokeObjectURL(_ghost.videoPreviewUrl); } catch (_) {}
        }
        _ghost = null;
        _notify();
    },

    /**
     * Mark the ghost as errored — shows a red state on the card.
     * @param {string} errorMessage
     */
    setError(errorMessage) {
        if (!_ghost) return;
        _ghost = { ..._ghost, status: 'error', label: errorMessage || 'Upload failed' };
        _notify();
    },
};

export default ghostPost;
