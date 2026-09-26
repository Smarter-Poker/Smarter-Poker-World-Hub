import { describe, expect, it, vi } from 'vitest';

import { createVideoLibraryOwnerScope } from '../src/lib/videoLibraryOwnerScope.mjs';

const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
};

describe('Video Library owner scope', () => {
    it.each([
        'preferences',
        'favorites',
        'watch-later',
        'history',
        'recent-sessions',
        'playlists',
    ])('drops deferred %s state from account A after account B becomes active', async channel => {
        const scope = createVideoLibraryOwnerScope('account-a');
        const token = scope.capture('account-a');
        const request = deferred();
        const accountBState = vi.fn();

        const settle = request.promise.then(value => scope.commit(token, () => accountBState(channel, value)));
        scope.activate('account-b');
        request.resolve(`${channel}-for-account-a`);

        await expect(settle).resolves.toBe(false);
        expect(accountBState).not.toHaveBeenCalled();
    });

    it('ignores a deferred account A success after switching to account B', async () => {
        const scope = createVideoLibraryOwnerScope('account-a');
        const token = scope.capture('account-a');
        const request = deferred();
        const success = vi.fn();

        const settle = request.promise.then(value => scope.commit(token, () => success(value)));
        expect(scope.activate('account-b')).toBe(true);
        request.resolve('account-a-data');

        await expect(settle).resolves.toBe(false);
        expect(success).not.toHaveBeenCalled();
    });

    it('ignores a deferred account A rejection and its optimistic rollback after switching to B', async () => {
        const scope = createVideoLibraryOwnerScope('account-a');
        const token = scope.capture('account-a');
        const request = deferred();
        const rollback = vi.fn();
        const failureNotice = vi.fn();

        const settle = request.promise.catch(error => scope.commit(token, () => {
            rollback(error);
            failureNotice(error);
        }));
        scope.activate('account-b');
        request.reject(new Error('account-a request failed'));

        await expect(settle).resolves.toBe(false);
        expect(rollback).not.toHaveBeenCalled();
        expect(failureNotice).not.toHaveBeenCalled();
    });

    it('rejects a nested account A completion after A signs out and returns', async () => {
        const scope = createVideoLibraryOwnerScope('account-a');
        const token = scope.capture('account-a');
        const nestedRequest = deferred();
        const recentSessions = vi.fn();

        const settle = nestedRequest.promise.then(rows => scope.commit(token, () => recentSessions(rows)));
        scope.activate(null);
        scope.activate('account-a');
        nestedRequest.resolve([{ video_id: 'old-account-a-session' }]);

        await expect(settle).resolves.toBe(false);
        expect(recentSessions).not.toHaveBeenCalled();
    });

    it('rejects a stale owner before a post-switch request can even start', () => {
        const scope = createVideoLibraryOwnerScope('account-a');
        scope.activate('account-b');

        expect(scope.isCurrent(scope.capture('account-a'))).toBe(false);
        expect(scope.isCurrent(scope.capture('account-b'))).toBe(true);
    });
});
