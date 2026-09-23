import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '../../lib/supabase';
import bgUpload from '../../lib/backgroundVideoUpload';
import { createReelAccountScope } from '../../lib/reelAccountScope.mjs';
import VideoLibraryConsole, { ConsoleCopy } from '../video-library/console/VideoLibraryConsole';
import {
  MAX_AUTOMATIC_REEL_PUBLICATION_ATTEMPTS,
  USER_REEL_PUBLICATION_EVENT,
  createUserReelPublicationIntent,
  persistUserReelPublicationIntent,
  quarantineInvalidUserReelPublication,
  readUserReelPublicationIntent,
  retryUserReelPublication,
  userReelPublicationStorageKey,
} from '../../lib/userReelPublicationRecovery.mjs';
import toast from '../../stores/toastStore';
import styles from './ReelPublicationRecoveryBanner.module.css';

/**
 * Persistent recovery surface for a video that reached Storage but whose
 * atomic post + Reel database response has not yet been confirmed.
 */
export default function ReelPublicationRecoveryBanner({ user, onRecovered }) {
  const ownerId = user?.id || null;
  const accountScopeRef = useRef(null);
  if (!accountScopeRef.current) accountScopeRef.current = createReelAccountScope(ownerId);
  accountScopeRef.current.bind(ownerId);
  const currentOwnerToken = accountScopeRef.current.capture(ownerId);
  const currentScopeKey = ownerId && currentOwnerToken.isCurrent()
    ? `${ownerId}:${currentOwnerToken.revision}`
    : null;
  const [snapshot, setSnapshot] = useState({ ownerId: null, status: 'empty', intent: null });
  const [workingScopeKey, setWorkingScopeKey] = useState(null);
  const [online, setOnline] = useState(
    () => typeof navigator === 'undefined' || navigator.onLine !== false,
  );
  const working = Boolean(currentScopeKey && workingScopeKey === currentScopeKey);

  const refresh = useCallback(() => {
    const scopedOwnerId = user?.id || null;
    const ownerToken = accountScopeRef.current.capture(scopedOwnerId);
    if (typeof window === 'undefined' || !scopedOwnerId) {
      if (ownerToken.isCurrent()) {
        setSnapshot({ ownerId: scopedOwnerId, status: 'empty', intent: null });
      }
      return;
    }
    let durable = readUserReelPublicationIntent(window.localStorage, scopedOwnerId);
    const committedUpload = bgUpload.checkDanglingIntent({ userId: scopedOwnerId });

    // If Storage committed but the first localStorage hand-off was interrupted,
    // promote the session evidence without uploading the object again. Never
    // publish evidence owned by a user from an older signed-in session.
    if (
      durable.status === 'empty'
      && committedUpload?.storageCommitted
      && committedUpload.publicationKind === 'poker_reel'
      && committedUpload.userId === scopedOwnerId
      && committedUpload.recoveryValidation === 'valid'
      && committedUpload.publicUrl
    ) {
      try {
        const recoveredIntent = createUserReelPublicationIntent({
          userId: scopedOwnerId,
          videoUrl: committedUpload.publicUrl,
          caption: committedUpload.content || null,
        });
        persistUserReelPublicationIntent(window.localStorage, recoveredIntent);
        bgUpload.clearDanglingIntent({ userId: scopedOwnerId, allowStorageCommitted: true });
        durable = readUserReelPublicationIntent(window.localStorage, scopedOwnerId);
      } catch (error) {
        durable = {
          status: 'committed-fallback',
          intent: null,
          error: error?.message || 'Committed upload recovery could not be promoted yet',
        };
      }
    } else if (
      durable.status === 'pending'
      && committedUpload?.storageCommitted
      && committedUpload.publicationKind === 'poker_reel'
      && committedUpload.userId === scopedOwnerId
      && committedUpload.recoveryValidation === 'valid'
      && committedUpload.publicUrl === durable.intent.videoUrl
    ) {
      // The durable copy is verified; the shorter-lived session copy is now
      // redundant and may be released.
      bgUpload.clearDanglingIntent({ userId: scopedOwnerId, allowStorageCommitted: true });
    }
    if (ownerToken.isCurrent()) {
      setSnapshot({ ownerId: scopedOwnerId, ...durable });
    }
  }, [user?.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const reconcileCandidate = useCallback(async (isCancelled = () => false) => {
    const scopedOwnerId = user?.id || null;
    const ownerToken = accountScopeRef.current.capture(scopedOwnerId);
    if (typeof window === 'undefined' || !scopedOwnerId) return;
    const candidate = bgUpload.checkDanglingIntent({ userId: scopedOwnerId });
    if (
      !candidate?.storageCandidate
      || candidate.storageCommitted
      || candidate.publicationKind !== 'poker_reel'
    ) return;
    if (isCancelled() || !ownerToken.isCurrent()) return;
    setSnapshot({ ownerId: scopedOwnerId, status: 'candidate-checking', intent: null });
    const result = await bgUpload.reconcileDanglingIntent({ userId: scopedOwnerId });
    if (isCancelled() || !ownerToken.isCurrent()) return;
    if (result.status === 'committed') {
      refresh();
      return;
    }
    setSnapshot({
      ownerId: scopedOwnerId,
      status: `candidate-${result.status}`,
      intent: null,
      error: result.error || null,
    });
  }, [refresh, user?.id]);

  useEffect(() => {
    let cancelled = false;
    const scopedOwnerId = user?.id || null;
    const ownerToken = accountScopeRef.current.capture(scopedOwnerId);
    void reconcileCandidate(() => cancelled).catch((error) => {
      if (cancelled || !ownerToken.isCurrent()) return;
      setSnapshot({
        ownerId: scopedOwnerId,
        status: 'candidate-indeterminate',
        intent: null,
        error: error?.message || 'Storage recovery probe failed',
      });
    });
    return () => { cancelled = true; };
  }, [reconcileCandidate]);

  useEffect(() => {
    if (typeof window === 'undefined' || !user?.id) return undefined;
    const key = userReelPublicationStorageKey(user.id);
    const onIntentChange = () => refresh();
    const onStorage = (event) => {
      if (!event.key || event.key === key) refresh();
    };
    const onOnline = () => {
      setOnline(true);
      refresh();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener(USER_REEL_PUBLICATION_EVENT, onIntentChange);
    window.addEventListener('storage', onStorage);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener(USER_REEL_PUBLICATION_EVENT, onIntentChange);
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [refresh, user?.id]);

  const attempt = useCallback(async (attemptKind) => {
    const scopedOwnerId = user?.id || null;
    const ownerToken = accountScopeRef.current.capture(scopedOwnerId);
    const operationScopeKey = `${scopedOwnerId}:${ownerToken.revision}`;
    if (
      typeof window === 'undefined'
      || !scopedOwnerId
      || !ownerToken.isCurrent()
      || workingScopeKey === operationScopeKey
      || snapshot.ownerId !== scopedOwnerId
    ) return;
    const intentId = snapshot.intent?.id;
    setWorkingScopeKey(operationScopeKey);
    try {
      const result = await retryUserReelPublication({
        supabase,
        storage: window.localStorage,
        userId: scopedOwnerId,
        intentId,
        attemptKind,
        eventTarget: window,
      });
      if (!ownerToken.isCurrent()) return;
      if (result.status === 'published') {
        toast.success('Your Poker Reel Is Live.', 4000);
        onRecovered?.(result.publication);
      } else if (attemptKind === 'manual' && result.status === 'failed') {
        toast.error('Your Video Is Safe, But Publishing Still Needs Another Try.', 6000);
      }
    } catch (error) {
      console.warn('[ReelRecovery] Retry could not start:', error?.message || error);
      if (attemptKind === 'manual' && ownerToken.isCurrent()) {
        toast.error('Your Video Is Still Safe. Reel Recovery Could Not Start Yet.', 6000);
      }
    } finally {
      setWorkingScopeKey((activeScopeKey) => (
        activeScopeKey === operationScopeKey ? null : activeScopeKey
      ));
      if (ownerToken.isCurrent()) refresh();
    }
  }, [onRecovered, refresh, snapshot.intent?.id, snapshot.ownerId, user?.id, workingScopeKey]);

  const quarantineAndContinue = useCallback(() => {
    const scopedOwnerId = user?.id || null;
    const ownerToken = accountScopeRef.current.capture(scopedOwnerId);
    const operationScopeKey = `${scopedOwnerId}:${ownerToken.revision}`;
    if (
      typeof window === 'undefined'
      || !scopedOwnerId
      || !ownerToken.isCurrent()
      || workingScopeKey === operationScopeKey
    ) return;
    setWorkingScopeKey(operationScopeKey);
    try {
      quarantineInvalidUserReelPublication(window.localStorage, scopedOwnerId, {
        eventTarget: window,
      });
      if (ownerToken.isCurrent()) {
        toast.info('Recovery Evidence Was Saved For Support. You Can Upload Again.', 5000);
      }
    } catch (error) {
      if (ownerToken.isCurrent()) {
        toast.error('Could Not Preserve The Recovery Evidence.', 6000);
      }
    } finally {
      setWorkingScopeKey((activeScopeKey) => (
        activeScopeKey === operationScopeKey ? null : activeScopeKey
      ));
      if (ownerToken.isCurrent()) refresh();
    }
  }, [refresh, user?.id, workingScopeKey]);

  const clearMissingCandidate = useCallback(() => {
    const scopedOwnerId = user?.id || null;
    const ownerToken = accountScopeRef.current.capture(scopedOwnerId);
    const operationScopeKey = `${scopedOwnerId}:${ownerToken.revision}`;
    if (!scopedOwnerId || !ownerToken.isCurrent() || workingScopeKey === operationScopeKey) return;
    const cleared = bgUpload.clearDanglingIntent({
      userId: scopedOwnerId,
      allowStorageCandidate: true,
    });
    if (cleared && ownerToken.isCurrent()) {
      toast.info('The Incomplete Upload Was Cleared. You Can Upload Again.', 4000);
      refresh();
    }
  }, [refresh, user?.id, workingScopeKey]);

  const quarantineCandidateAndContinue = useCallback(() => {
    const scopedOwnerId = user?.id || null;
    const ownerToken = accountScopeRef.current.capture(scopedOwnerId);
    const operationScopeKey = `${scopedOwnerId}:${ownerToken.revision}`;
    if (!scopedOwnerId || !ownerToken.isCurrent() || workingScopeKey === operationScopeKey) return;
    setWorkingScopeKey(operationScopeKey);
    try {
      const quarantined = bgUpload.quarantineDanglingIntent({
        userId: scopedOwnerId,
        reason: snapshot.error || 'Invalid upload recovery record',
      });
      if (!quarantined) throw new Error('Recovery evidence could not be preserved');
      if (ownerToken.isCurrent()) {
        toast.info('Recovery Evidence Was Saved For Support. You Can Upload Again.', 5000);
      }
    } catch (error) {
      if (ownerToken.isCurrent()) {
        toast.error('Could Not Preserve The Recovery Evidence.', 6000);
      }
    } finally {
      setWorkingScopeKey((activeScopeKey) => (
        activeScopeKey === operationScopeKey ? null : activeScopeKey
      ));
      if (ownerToken.isCurrent()) refresh();
    }
  }, [refresh, snapshot.error, user?.id, workingScopeKey]);

  // A newly saved intent gets a short grace period so the uploader's immediate
  // attempt can acquire the persisted lease first. Subsequent attempts follow
  // the persisted backoff and stop at the durable automatic-attempt ceiling.
  useEffect(() => {
    const intent = snapshot.intent;
    if (
      snapshot.ownerId !== ownerId
      || !ownerId
      || snapshot.status !== 'pending'
      || !intent
      || working
    ) return undefined;

    const now = Date.now();
    const leaseDelay = intent.leaseExpiresAt > now ? intent.leaseExpiresAt - now : 0;
    if (leaseDelay > 0) {
      const leaseTimer = window.setTimeout(refresh, leaseDelay + 25);
      return () => window.clearTimeout(leaseTimer);
    }
    if (!online || intent.automaticAttemptCount >= MAX_AUTOMATIC_REEL_PUBLICATION_ATTEMPTS) {
      return undefined;
    }
    const backoffDelay = intent.nextAttemptAt > now ? intent.nextAttemptAt - now : 0;
    const timer = window.setTimeout(
      () => void attempt('automatic'),
      Math.max(1_000, leaseDelay, backoffDelay),
    );
    return () => window.clearTimeout(timer);
  }, [attempt, online, ownerId, refresh, snapshot, working]);

  if (!ownerId || snapshot.ownerId !== ownerId || snapshot.status === 'empty') return null;

  const intent = snapshot.intent;
  const invalid =
    snapshot.status === 'invalid'
    || snapshot.status === 'unavailable'
    || snapshot.status === 'committed-fallback'
    || snapshot.status === 'candidate-invalid'
    || snapshot.status === 'candidate-indeterminate';
  const exhausted = Boolean(
    intent
    && intent.automaticAttemptCount >= MAX_AUTOMATIC_REEL_PUBLICATION_ATTEMPTS,
  );
  const publishing = Boolean(
    working
    || (intent?.status === 'publishing' && intent.leaseExpiresAt > Date.now()),
  );
  const title = invalid
    ? 'Your Saved Reel Needs Attention'
    : snapshot.status === 'candidate-checking'
      ? 'Checking Your Uploaded Video'
      : snapshot.status === 'candidate-missing'
        ? 'The Interrupted Upload Did Not Finish'
        : publishing
          ? 'Finishing Your Poker Reel'
          : 'Your Uploaded Video Is Safe';
  const detail = snapshot.status === 'candidate-invalid'
    ? 'This Old Recovery Record Failed Its Owner, Path, Or Timestamp Checks. Save It For Support To Unblock New Uploads.'
    : invalid
      ? 'Recovery Data Could Not Be Read. The Uploaded Video Was Not Deleted; Contact Support Before Clearing Browser Data.'
    : snapshot.status === 'candidate-checking'
      ? 'Confirming Whether Storage Received The Final Upload Before Resuming Publication.'
      : snapshot.status === 'candidate-missing'
        ? 'Storage Confirmed That The Exact Upload Object Is Missing. Clear It Before Trying Again.'
        : !online
          ? 'Reconnect To Finish Publishing It To Poker Reels.'
          : exhausted
            ? 'Automatic Retries Paused. Use Retry Now When Your Connection Is Stable.'
            : intent?.lastError
              ? 'The Database Confirmation Was Interrupted. We Will Retry With The Same Uploaded Video.'
              : 'We Are Finishing Its Post And Poker Reel Now.';

  let recoveryAction = null;
  if (snapshot.status === 'invalid') {
    recoveryAction = {
      label: 'Save For Support & Continue',
      ink: 'gold',
      onClick: quarantineAndContinue,
      disabled: working,
    };
  } else if (snapshot.status === 'unavailable' || snapshot.status === 'committed-fallback') {
    recoveryAction = {
      label: 'Retry Recovery',
      ink: 'blue',
      onClick: refresh,
      disabled: working,
    };
  } else if (snapshot.status === 'candidate-invalid') {
    recoveryAction = {
      label: 'Save For Support & Continue',
      ink: 'gold',
      onClick: quarantineCandidateAndContinue,
      disabled: working,
    };
  } else if (snapshot.status === 'candidate-indeterminate') {
    recoveryAction = {
      label: 'Retry Recovery',
      ink: 'blue',
      onClick: () => void reconcileCandidate(),
      disabled: working,
    };
  } else if (snapshot.status === 'candidate-missing') {
    recoveryAction = {
      label: 'Clear Incomplete Upload',
      ink: 'red',
      onClick: clearMissingCandidate,
      disabled: working,
    };
  } else if (snapshot.status === 'pending') {
    recoveryAction = {
      label: publishing ? 'Publishing' : 'Retry Now',
      ink: publishing ? 'blue' : 'green',
      onClick: () => void attempt('manual'),
      disabled: publishing || !online,
    };
  }

  const pill = !online
    ? 'Offline'
    : publishing
      ? 'Working'
      : invalid
        ? 'Review'
        : 'Safe';

  return (
    <VideoLibraryConsole
      as="aside"
      role="region"
      aria-labelledby="reel-recovery-console-title"
      className={styles.console}
      data-reel-publication-recovery={snapshot.status}
      eyebrow="Publication Recovery"
      title={title}
      titleId="reel-recovery-console-title"
      subtitle="Account Bound Recovery"
      pill={pill}
      pillInk={!online || invalid ? 'gold' : publishing ? 'blue' : 'green'}
      foot="cap"
    >
      <div aria-live="polite" aria-atomic="true">
        <ConsoleCopy align="center">{detail}</ConsoleCopy>
      </div>
      {recoveryAction ? (
        <button
          type="button"
          className={styles.glassAction}
          data-ink={recoveryAction.ink}
          onClick={recoveryAction.onClick}
          disabled={recoveryAction.disabled}
        >
          {recoveryAction.label}
        </button>
      ) : null}
    </VideoLibraryConsole>
  );
}
