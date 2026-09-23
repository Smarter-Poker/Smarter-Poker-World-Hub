import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import { createReelAccountScope } from '../src/lib/reelAccountScope.mjs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const uploadModal = read('../src/components/reels/UploadReelModal.jsx');
const uploadStyles = read('../src/components/reels/UploadReelModal.module.css');
const recoveryBanner = read('../src/components/reels/ReelPublicationRecoveryBanner.jsx');
const recoveryStyles = read('../src/components/reels/ReelPublicationRecoveryBanner.module.css');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('Poker Reel console owner scope', () => {
  it('drops account A success and failure UI after A to B to A identity churn', async () => {
    const scope = createReelAccountScope('account-a');
    const successToken = scope.capture('account-a');
    const failureToken = scope.capture('account-a');
    const successRequest = deferred();
    const failureRequest = deferred();
    const renderSuccess = vi.fn();
    const renderFailure = vi.fn();

    const success = successRequest.promise.then(value => {
      if (successToken.isCurrent()) renderSuccess(value);
    });
    const failure = failureRequest.promise.catch(error => {
      if (failureToken.isCurrent()) renderFailure(error);
    });

    scope.bind('account-b');
    scope.bind('account-a');
    successRequest.resolve('stale account A upload');
    failureRequest.reject(new Error('stale account A failure'));
    await Promise.all([success, failure]);

    expect(renderSuccess).not.toHaveBeenCalled();
    expect(renderFailure).not.toHaveBeenCalled();
  });

  it('keeps upload and recovery continuations behind captured owner epochs', () => {
    expect(uploadModal).toMatch(/createReelAccountScope/);
    expect(uploadModal).toMatch(/const ownerToken = accountScopeRef\.current\.capture\(ownerId\)/);
    expect(uploadModal).toMatch(/if \(!isCurrentOwner\(ownerToken\)\) return/);
    expect(uploadModal).toMatch(/if \(canRenderForOwner\(ownerToken\)\) onSuccess/);
    expect(recoveryBanner).toMatch(/createReelAccountScope/);
    expect(recoveryBanner).toMatch(/const ownerToken = accountScopeRef\.current\.capture\(scopedOwnerId\)/);
    expect(recoveryBanner).toMatch(/if \(!ownerToken\.isCurrent\(\)\) return/);
    expect(recoveryBanner).toMatch(/snapshot\.ownerId !== ownerId/);
  });

  it('uses the approved painted console instead of flat generic modal chrome', () => {
    for (const source of [uploadModal, recoveryBanner]) {
      expect(source).toMatch(/VideoLibraryConsole/);
      expect(source).not.toMatch(/[✅📹↻]/u);
      expect(source).not.toMatch(/from ['"]lucide-react['"]/);
      expect(source).not.toMatch(/<svg\b/);
      expect(source).not.toMatch(/const styles = \{/);
    }
    for (const css of [uploadStyles, recoveryStyles]) {
      expect(css).not.toMatch(/(?:linear|radial|conic)-gradient/i);
      const radii = [...css.matchAll(/border-radius:\s*([^;]+)/gi)]
        .map(match => match[1].trim());
      expect(radii.every(radius => radius === '0')).toBe(true);
    }
    expect(uploadModal).toMatch(/foot=\{uploading && !confirmCancel \? 'cap' : 'plates'\}/);
    expect(uploadModal).not.toMatch(/window\.confirm/);
    expect(recoveryBanner).toMatch(/foot="cap"/);
    expect(recoveryBanner).toMatch(/className=\{styles\.glassAction\}/);
    expect(recoveryStyles).not.toMatch(/drop-shadow|box-shadow/i);
  });
});
