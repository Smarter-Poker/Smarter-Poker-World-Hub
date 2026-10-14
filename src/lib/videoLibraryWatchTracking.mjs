import { decisionPlayerState } from './videoLibraryQuiz.mjs';

// One bounded viewing session. Credit comes from the existing authenticated
// server-timed RPC, never from a seek position or a client-side reward total.
export function createWatchTrackingSession({ now = Date.now, persist, lifecyclePersist, isCurrent = () => true, onStatus = () => {}, durationSeconds = 0 }) {
    let state = -1;
    let visible = true;
    let startedAt = null;
    let pendingMilliseconds = 0;
    let position = 0;
    let closed = false;
    let writing = false;
    const live = () => !closed && isCurrent();
    const stop = () => {
        if (startedAt !== null) pendingMilliseconds += Math.max(0, now() - startedAt);
        startedAt = null;
    };
    const start = () => { if (live() && visible && state === 1 && startedAt === null) startedAt = now(); };
    const emit = value => { if (live()) onStatus(value); };
    async function save(lifecycle = false) {
        if (!live() || writing) return false;
        stop();
        const additionalSeconds = Math.min(120, Math.floor(pendingMilliseconds / 1000));
        start();
        if (additionalSeconds < 1) return false;
        // Remove the submitted segment before awaiting. An unknown transport
        // outcome must not be blindly retried and credited twice.
        pendingMilliseconds -= additionalSeconds * 1000;
        writing = true;
        emit({ status: 'saving' });
        try {
            const result = await (lifecycle ? lifecyclePersist : persist)(additionalSeconds, position);
            if (!live()) return false;
            if (lifecycle) {
                if (result !== true) throw new Error('Watch Progress Could Not Be Saved');
                emit({ status: 'submitted' });
            } else {
                const total = result?.watch_duration_seconds;
                const savedPosition = result?.progress_seconds;
                if (!Number.isFinite(total) || total < 0 || !Number.isFinite(savedPosition) || savedPosition < 0) {
                    throw new Error('Watch Progress Could Not Be Confirmed');
                }
                emit({ status: 'saved', savedSeconds: total, savedPositionSeconds: savedPosition });
            }
            return true;
        } catch (error) {
            emit({ status: 'error', error: 'Watch Progress Could Not Be Saved' });
            return false;
        } finally {
            writing = false;
        }
    }
    return {
        receive(data) {
            if (!live()) return;
            const current = data?.event === 'infoDelivery' ? data.info?.currentTime : undefined;
            if (typeof current === 'number' && Number.isFinite(current) && current >= 0) {
                position = durationSeconds > 0 ? Math.min(current, durationSeconds) : current;
            }
            const nextState = data?.event === 'onError' ? -1 : decisionPlayerState(data);
            if (nextState === null) return;
            if (nextState === 1) { state = 1; start(); }
            else { state = nextState; stop(); void save(); }
        },
        heartbeat() { return save(); },
        visibility(nextVisible) {
            if (!live() || visible === nextVisible) return;
            visible = nextVisible;
            if (visible) start();
            else { stop(); void save(true); }
        },
        close() { stop(); const result = save(true); closed = true; return result; },
    };
}

export function watchResumeSeconds(progress, durationSeconds = 0) {
    const value = Number(progress?.watchedSeconds);
    if (!Number.isFinite(value) || value <= 0) return 0;
    if (durationSeconds > 0 && value >= durationSeconds * 0.95) return 0;
    return Math.floor(durationSeconds > 0 ? Math.min(value, durationSeconds) : value);
}
