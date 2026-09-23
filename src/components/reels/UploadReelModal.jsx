/**
 * Upload Reel Modal Component
 * ═══════════════════════════════════════════════════════════════════════════
 * Modal for uploading video reels to Supabase storage
 * Uses direct-to-Supabase signed URL uploads with no file-size limit
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { sniffMimeType } from '../../lib/socialHelpers';
import bgUpload from '../../lib/backgroundVideoUpload';
import { validateVideoFile, generateThumbnail, compressVideo } from '../../lib/videoCompressor';
import { uploadThumbnail } from '../../lib/thumbnailUploader';
import { createReelAccountScope } from '../../lib/reelAccountScope.mjs';
import VideoLibraryConsole, {
    ConsoleCopy,
    ConsoleDataRow,
} from '../video-library/console/VideoLibraryConsole';
import {
    assertUserReelPublicationSlot,
    createUserReelPublicationIntent,
    persistUserReelPublicationIntent,
    readUserReelPublicationIntent,
    retryUserReelPublication,
    updateUserReelPublicationIntent,
} from '../../lib/userReelPublicationRecovery.mjs';
import toast from '../../stores/toastStore';
import styles from './UploadReelModal.module.css';

function toConsoleCopy(value) {
    return String(value || '')
        .replace(/[\u2013\u2014]/g, '-')
        .replace(/\b[a-z]/g, character => character.toUpperCase());
}

export default function UploadReelModal({ user, onClose, onSuccess }) {
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    // Phase label shown inside the progress bar ("Preparing upload…", "Uploading… 67%", etc.)
    const [uploadLabel, setUploadLabel] = useState('');
    const [caption, setCaption] = useState('');
    const [videoFile, setVideoFile] = useState(null);
    const [error, setError] = useState('');
    const [thumbnail, setThumbnail] = useState(null);
    const [compressPct, setCompressPct] = useState(null);
    const [preparingMedia, setPreparingMedia] = useState(false);
    const [pokerContentConfirmed, setPokerContentConfirmed] = useState(false);
    const [confirmCancel, setConfirmCancel] = useState(false);

    // The upload owner is immutable for the life of an operation. The visible
    // owner may change while a signed upload is still completing in background.
    const mountedRef = useRef(true);
    const initialOwnerRef = useRef(user?.id || null);
    const accountScopeRef = useRef(null);
    const selectionGenerationRef = useRef(0);
    const overlayRef = useRef(null);
    const fileInputRef = useRef(null);
    const closeButtonRef = useRef(null);
    const cancelActionRef = useRef(null);
    const returnFocusRef = useRef(null);
    const compressionRef = useRef(null); // { controller, promise, result }
    const _uploadingRef = useRef(false); // double-click guard (synchronous, unlike React state)
    if (!accountScopeRef.current) {
        accountScopeRef.current = createReelAccountScope(user?.id || null);
    }
    accountScopeRef.current.bind(user?.id || null);

    const isCurrentOwner = useCallback(
        (ownerToken) => Boolean(ownerToken?.isCurrent()),
        [],
    );
    const canRenderForOwner = useCallback(
        (ownerToken) => mountedRef.current && isCurrentOwner(ownerToken),
        [isCurrentOwner],
    );

    useEffect(() => {
        mountedRef.current = true;
        returnFocusRef.current = document.activeElement;
        closeButtonRef.current?.focus();
        const previousOverflow = document.documentElement.style.overflow;
        document.documentElement.style.overflow = 'hidden';
        return () => {
            mountedRef.current = false;
            document.documentElement.style.overflow = previousOverflow;
            // Compression has no durable handoff, so it is safe to stop here.
            if (compressionRef.current?.controller) {
                try { compressionRef.current.controller.abort(); } catch (_) { /* already settled */ }
                compressionRef.current = null;
            }
            if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus();
        };
    }, []);

    useEffect(() => {
        const initialOwnerId = initialOwnerRef.current;
        if (!initialOwnerId && user?.id) {
            initialOwnerRef.current = user.id;
            return;
        }
        if (initialOwnerId && user?.id !== initialOwnerId) {
            // Do not cancel a durable background upload. Closing only removes
            // account A's visual state from account B's session.
            onClose?.();
        }
    }, [onClose, user?.id]);

    const _pickerOpenRef = useRef(false);

    // iOS file picker preparation detection.
    // Uses visibilitychange for faster cancel detection than the backstop.
    useEffect(() => {
        if (!preparingMedia) return;
        const handleVisibility = () => {
            if (document.visibilityState === 'visible' && _pickerOpenRef.current) {
                setTimeout(() => {
                    if (_pickerOpenRef.current) {
                        setPreparingMedia(false);
                        _pickerOpenRef.current = false;
                    }
                }, 2000);
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);
        const timer = setTimeout(() => { setPreparingMedia(false); _pickerOpenRef.current = false; }, 120_000);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibility);
            clearTimeout(timer);
        };
    }, [preparingMedia]);

    const handleFileSelect = (e) => {
        const ownerId = accountScopeRef.current.currentOwnerId();
        if (!ownerId) return;
        const ownerToken = accountScopeRef.current.capture(ownerId);
        const selectionGeneration = selectionGenerationRef.current + 1;
        selectionGenerationRef.current = selectionGeneration;

        setPreparingMedia(false);
        _pickerOpenRef.current = false;

        const file = e.target.files?.[0];
        if (!file) return;

        // iOS Photo Library may return an empty or codec-suffixed file.type.
        const mime = sniffMimeType(file);
        if (!mime.startsWith('video/')) {
            setError('Please Select A Valid Video File');
            return;
        }

        const validation = validateVideoFile(file);
        if (!validation.valid) {
            setError(toConsoleCopy(validation.error));
            return;
        }
        if (validation.warning) {
            toast.info(toConsoleCopy(validation.warning), 5000);
        }
        if (validation.formatWarning) {
            toast.info(toConsoleCopy(validation.formatWarning), 4000);
        }

        setVideoFile(file);
        setError('');
        setThumbnail(null);
        setCompressPct(null);
        setConfirmCancel(false);

        const sizeMB = Math.round(file.size / (1024 * 1024));
        toast.info(`Video Selected (${sizeMB}MB). Preparing Upload.`, 3000);

        generateThumbnail(file).then(thumb => {
            if (
                !thumb
                || !canRenderForOwner(ownerToken)
                || selectionGenerationRef.current !== selectionGeneration
            ) return;
            setThumbnail(thumb);
        });

        if (compressionRef.current?.controller) {
            compressionRef.current.controller.abort();
        }
        const controller = new AbortController();
        const compPromise = compressVideo(file, {
            signal: controller.signal,
            onProgress: ({ pct }) => {
                if (
                    !canRenderForOwner(ownerToken)
                    || selectionGenerationRef.current !== selectionGeneration
                ) return;
                setCompressPct(pct);
            },
        }).then(result => {
            if (compressionRef.current?.controller === controller) {
                compressionRef.current.result = result;
            }
            if (
                result.compressed
                && canRenderForOwner(ownerToken)
                && selectionGenerationRef.current === selectionGeneration
            ) {
                const savedMB = Math.round((result.originalSize - result.compressedSize) / (1024 * 1024));
                toast.success(`Video Compressed. Saved ${savedMB}MB (${result.savings}% Smaller).`, 3000);
            }
            if (
                canRenderForOwner(ownerToken)
                && selectionGenerationRef.current === selectionGeneration
            ) setCompressPct(null);
            return result;
        });
        compressionRef.current = { controller, promise: compPromise, result: null };

        bgUpload.prefetch({ file, userId: ownerId, folder: 'reels' });
    };

    const handleUpload = async () => {
        const ownerId = user?.id || null;
        const ownerToken = accountScopeRef.current.capture(ownerId);
        if (!videoFile || !ownerId || !isCurrentOwner(ownerToken)) return;
        if (!pokerContentConfirmed) {
            setError('Confirm That This Is Poker-Related Content And That You Have The Right To Share It.');
            return;
        }
        if (_uploadingRef.current) return; // Synchronous double-click guard

        // Do not put bytes in Storage unless we can durably remember how to
        // finish the database publication after a reload or connection drop.
        try {
            assertUserReelPublicationSlot(window.localStorage, ownerId);
        } catch (storageError) {
            setError(toConsoleCopy(
                storageError.message || 'Durable Reel Recovery Is Unavailable In This Browser.'
            ));
            return;
        }
        _uploadingRef.current = true;

        setUploading(true);
        setError('');
        setConfirmCancel(false);

        setUploadProgress(2);
        setUploadLabel('Preparing');

        try {
            let fileToUpload = videoFile;
            if (compressionRef.current?.promise) {
                try {
                    const result = compressionRef.current.result || await Promise.race([
                        compressionRef.current.promise,
                        new Promise(r => setTimeout(() => r({ file: videoFile, compressed: false }), 500)),
                    ]);
                    if (result.compressed) fileToUpload = result.file;
                } catch (_) { /* use original */ }
            }

            let bgUnsub = null;
            let wasBackground = false;
            let publicationIntent = null;

            const publicUrl = await new Promise((resolve, reject) => {
                // start() must precede subscribe() because it clears listeners
                // when superseding a pending upload.
                bgUpload.start({
                    file: fileToUpload,
                    userId: ownerId,
                    folder: 'reels',
                    content: caption?.trim(),
                    thumbnail,
                    publicationKind: 'poker_reel',
                }).catch(reject);

                bgUnsub = bgUpload.subscribe({
                    onProgress: ({ pct, label }) => {
                        if (!canRenderForOwner(ownerToken)) return;
                        setUploadProgress(pct);
                        setUploadLabel(toConsoleCopy(label));
                    },
                    onStorageCommitted: ({ publicUrl, wasBackground: bg }) => {
                        // The uploader invokes this synchronously before it is
                        // allowed to clear its session-level upload evidence.
                        publicationIntent = createUserReelPublicationIntent({
                            userId: ownerId,
                            videoUrl: publicUrl,
                            caption: caption.trim() || null,
                        });
                        persistUserReelPublicationIntent(
                            window.localStorage,
                            publicationIntent,
                            { eventTarget: window }
                        );
                        wasBackground = bg;
                    },
                    onComplete: ({ publicUrl, wasBackground: bg }) => {
                        wasBackground = bg;
                        resolve(publicUrl);
                    },
                    onError: ({ error }) => reject(error),
                    onBackground: () => {
                        if (isCurrentOwner(ownerToken)) onClose?.();
                    },
                });
            }).finally(() => {
                if (bgUnsub) bgUnsub();
            });
            compressionRef.current = null;

            // A signed upload may safely finish after sign-out or an account
            // switch, but publication must wait for its owning account.
            if (!isCurrentOwner(ownerToken)) return;

            if (!wasBackground) {
                setUploadProgress(94);
                setUploadLabel('Saving Reel');
            }

            // Thumbnail publication is best effort; the Reel remains recoverable.
            let thumbnailUrl = null;
            if (thumbnail && thumbnail.startsWith('data:')) {
                thumbnailUrl = await uploadThumbnail(thumbnail, ownerId, 'thumbnails').catch(() => null);
            }
            if (!isCurrentOwner(ownerToken)) return;
            if (thumbnailUrl && publicationIntent) {
                const updated = updateUserReelPublicationIntent(
                    window.localStorage,
                    ownerId,
                    publicationIntent.id,
                    { thumbnailUrl },
                    { eventTarget: window }
                );
                if (updated.status === 'pending') publicationIntent = updated.intent;
            }

            // The post and linked Reel are one database transaction.
            const publicationResult = await retryUserReelPublication({
                supabase,
                storage: window.localStorage,
                userId: ownerId,
                intentId: publicationIntent.id,
                attemptKind: 'initial',
                eventTarget: window,
            });
            if (!isCurrentOwner(ownerToken)) return;
            if (publicationResult.status !== 'published') {
                throw new Error(
                    publicationResult.error
                    || 'Your Video Is Uploaded Safely And Is Waiting To Finish Publishing.'
                );
            }
            if (!wasBackground) {
                setUploadProgress(97);
                setUploadLabel('Syncing Feed');
            }

            if (!wasBackground) {
                setUploadProgress(100);
                setUploadLabel('Done');
            }

            if (wasBackground) {
                toast.action(
                    'Your Reel Is Live. Open Poker Reels To Watch It.',
                    () => { window.top.location.href = '/hub/social-media'; },
                    'success'
                );
            } else {
                if (canRenderForOwner(ownerToken)) onSuccess?.();
            }
        } catch (err) {
            console.warn('Upload error:', err);
            const isCancelled = err?.message === 'Upload cancelled' || err?.message === 'Upload aborted' || err?.message === 'Upload superseded';
            let savedPublication = false;
            try {
                savedPublication = typeof window !== 'undefined'
                    && readUserReelPublicationIntent(window.localStorage, ownerId).status === 'pending';
            } catch (recoveryReadError) {
                savedPublication = false;
                console.warn(
                    '[UploadReel] Publication recovery evidence could not be read:',
                    recoveryReadError?.message || recoveryReadError
                );
            }
            if (!isCancelled && savedPublication && isCurrentOwner(ownerToken)) {
                toast.action(
                    'Your Video Is Safe. Tap To Finish Publishing It To Poker Reels.',
                    () => { window.top.location.href = '/hub/reels'; },
                    'warning'
                );
            }
            if (canRenderForOwner(ownerToken) && !isCancelled) {
                setUploading(false);
                setError(toConsoleCopy(err.message || 'Failed To Upload Reel'));
            }
        } finally {
            _uploadingRef.current = false;
            if (canRenderForOwner(ownerToken)) setUploading(false);
        }
    };




    const closeModal = useCallback(() => {
        if (_uploadingRef.current) {
            setConfirmCancel(true);
            return;
        }
        onClose?.();
    }, [onClose]);

    const cancelAndClose = useCallback(() => {
        bgUpload.abort();
        setConfirmCancel(false);
        onClose?.();
    }, [onClose]);

    useEffect(() => {
        if (!confirmCancel) return;
        closeButtonRef.current?.focus();
    }, [confirmCancel]);

    useEffect(() => {
        if (uploading && !confirmCancel) cancelActionRef.current?.focus();
    }, [confirmCancel, uploading]);

    useEffect(() => {
        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                if (confirmCancel) setConfirmCancel(false);
                else closeModal();
                return;
            }
            if (event.key !== 'Tab') return;
            const focusable = [...(overlayRef.current?.querySelectorAll(
                'button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="file"])'
            ) || [])];
            if (focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (!overlayRef.current?.contains(document.activeElement)) {
                event.preventDefault();
                first.focus();
            } else if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [closeModal, confirmCancel]);

    const openPicker = useCallback(() => {
        if (_uploadingRef.current) return;
        setPreparingMedia(true);
        _pickerOpenRef.current = true;
        fileInputRef.current?.click();
    }, []);

    const fileSizeMB = videoFile
        ? Math.max(1, Math.ceil(videoFile.size / (1024 * 1024)))
        : 0;
    const progressValue = Math.max(0, Math.min(100, Math.round(uploadProgress)));
    const statusLabel = uploading
        ? (uploadLabel || 'Uploading')
        : preparingMedia
            ? 'Preparing Media'
            : videoFile
                ? 'Ready To Publish'
                : 'Awaiting Video';
    const primaryPlate = uploading
        ? {
            label: `${progressValue} Percent`,
            ink: progressValue === 100 ? 'green' : 'blue',
            disabled: true,
        }
        : videoFile
            ? {
                label: 'Upload Reel',
                ink: 'green',
                onClick: handleUpload,
                disabled: !pokerContentConfirmed,
            }
            : {
                label: preparingMedia ? 'Preparing Media' : 'Choose Video',
                ink: 'blue',
                onClick: openPicker,
                disabled: preparingMedia,
            };
    const showConfirmationPlates = uploading && confirmCancel;
    const secondaryPlate = showConfirmationPlates
        ? {
            label: 'Keep Uploading',
            ink: 'green',
            onClick: () => setConfirmCancel(false),
            buttonRef: closeButtonRef,
        }
        : {
            label: 'Close',
            ink: 'silver',
            onClick: closeModal,
            buttonRef: closeButtonRef,
        };
    const resolvedPrimaryPlate = showConfirmationPlates
        ? {
            label: 'Cancel And Close',
            ink: 'red',
            onClick: cancelAndClose,
        }
        : primaryPlate;

    return (
        <div ref={overlayRef} className={styles.overlay} data-video-library-console-overlay>
            <VideoLibraryConsole
                as="section"
                role="dialog"
                aria-modal="true"
                aria-labelledby="upload-reel-console-title"
                aria-busy={uploading || preparingMedia}
                className={styles.console}
                eyebrow="Poker Reels"
                title="Upload Reel"
                titleId="upload-reel-console-title"
                subtitle="Direct Secure Publication"
                pill={uploading ? `${progressValue}%` : videoFile ? 'Ready' : 'Select'}
                pillInk={uploading ? 'blue' : videoFile ? 'green' : 'silver'}
                foot={uploading && !confirmCancel ? 'cap' : 'plates'}
                plates={{
                    secondary: secondaryPlate,
                    primary: resolvedPrimaryPlate,
                }}
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/*"
                    onChange={handleFileSelect}
                    className={styles.fileInput}
                    id="video-upload"
                    aria-describedby="upload-reel-media-help"
                />

                {thumbnail ? (
                    <figure className={styles.preview}>
                        <img src={thumbnail} alt="Selected Reel preview" />
                        <figcaption>{videoFile?.name || 'Selected Video'}</figcaption>
                    </figure>
                ) : (
                    <ConsoleCopy align="center" id="upload-reel-media-help">
                        Select A Poker Video. The Original Picture Becomes The Visual Focus Inside This Console.
                    </ConsoleCopy>
                )}

                {videoFile ? (
                    <div className={styles.readout}>
                        <ConsoleDataRow label="Media" value={videoFile.name} valueInk="white" />
                        <ConsoleDataRow label="File Size" value={`${fileSizeMB} MB`} valueInk="blue" />
                        <ConsoleDataRow label="Status" value={statusLabel} valueInk={error ? 'red' : 'green'} />
                    </div>
                ) : null}

                {preparingMedia ? (
                    <p className={styles.preparing} role="status">
                        Preparing Your Video. This May Take A Moment.
                    </p>
                ) : null}

                {compressPct != null ? (
                    <div className={styles.progressReadout} role="status">
                        <span>Optimizing Video</span>
                        <strong>{Math.round(compressPct)}%</strong>
                        <span
                            className={styles.progressSignal}
                            style={{ '--upload-progress': `${Math.round(compressPct)}%` }}
                            aria-hidden="true"
                        />
                    </div>
                ) : null}

                <label className={styles.captionField}>
                    <span>Caption</span>
                    <textarea
                        placeholder="Add A Caption"
                        value={caption}
                        onChange={(event) => setCaption(event.target.value)}
                        maxLength={500}
                        disabled={uploading}
                    />
                    <small>{caption.length} Of 500</small>
                </label>

                <label className={styles.rightsControl} data-confirmed={pokerContentConfirmed ? 'true' : 'false'}>
                    <input
                        type="checkbox"
                        checked={pokerContentConfirmed}
                        disabled={uploading}
                        onChange={(event) => setPokerContentConfirmed(event.target.checked)}
                    />
                    <span className={styles.rightsState}>
                        {pokerContentConfirmed ? 'Rights Confirmed' : 'Confirmation Required'}
                    </span>
                    <span className={styles.rightsCopy}>
                        This Video Is Poker-Related, And I Have The Right To Share It In Reels.
                    </span>
                </label>

                {uploading ? (
                    <div className={styles.progressReadout} role="status" aria-live="polite">
                        <span>{statusLabel}</span>
                        <strong>{progressValue}%</strong>
                        <span
                            className={styles.progressSignal}
                            style={{ '--upload-progress': `${progressValue}%` }}
                            aria-hidden="true"
                        />
                    </div>
                ) : null}

                {uploading && !confirmCancel ? (
                    <button
                        ref={cancelActionRef}
                        type="button"
                        className={styles.glassAction}
                        onClick={() => setConfirmCancel(true)}
                    >
                        Cancel Upload
                    </button>
                ) : null}

                {confirmCancel ? (
                    <p className={styles.cancelWarning} role="alert">
                        Cancel This Upload And Close The Publication Console?
                    </p>
                ) : null}

                {error ? <p className={styles.error} role="alert">{error}</p> : null}
            </VideoLibraryConsole>
        </div>
    );
}
