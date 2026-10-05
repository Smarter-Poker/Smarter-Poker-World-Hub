const MAX_RETRY_AFTER_MS = 600_000;

function normalizeRetryAfterMs(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 1_000;
    return Math.max(250, Math.min(MAX_RETRY_AFTER_MS, Math.ceil(numeric)));
}

/**
 * Coordinate one paid GTO render across every application instance.
 *
 * The caller supplies the durable claim/release operations so this policy can
 * be verified without a database or paid image request. The database owns
 * cross-instance exclusion; this function owns ordering and error custody.
 */
export async function renderGtoPanelSingleflight({
    cacheDigest,
    ownerToken,
    leaseSeconds,
    readCachedImage,
    claimRender,
    generateImage,
    uploadImage,
    releaseRender,
    onReleaseError = () => {},
}) {
    const cached = await readCachedImage();
    if (cached) {
        return { state: 'ready', imageUrl: cached, fromCache: true };
    }

    const claim = await claimRender({ cacheDigest, ownerToken, leaseSeconds });
    if (claim?.acquired !== true) {
        // The owner may have uploaded between our first cache read and the
        // rejected claim. Close that race without ever purchasing a render.
        const racedCache = await readCachedImage();
        if (racedCache) {
            return { state: 'ready', imageUrl: racedCache, fromCache: true };
        }
        return {
            state: 'pending',
            retryAfterMs: normalizeRetryAfterMs(claim?.retryAfterMs),
        };
    }

    let primaryError = null;
    try {
        // A prior owner may have completed after the first miss but before our
        // lease was acquired. This read must precede the paid provider call.
        const cacheAfterClaim = await readCachedImage();
        if (cacheAfterClaim) {
            return { state: 'ready', imageUrl: cacheAfterClaim, fromCache: true };
        }

        const image = await generateImage();
        const imageUrl = await uploadImage(image);
        if (!imageUrl) throw new Error('GTO panel upload returned no URL');
        return { state: 'ready', imageUrl, fromCache: false };
    } catch (error) {
        primaryError = error;
        throw error;
    } finally {
        try {
            await releaseRender({ cacheDigest, ownerToken });
        } catch (releaseError) {
            // Lease expiry is the durable recovery path. A release fault must
            // never mask the provider/upload outcome already owned above.
            onReleaseError(releaseError, { primaryError });
        }
    }
}

