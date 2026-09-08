/**
 * BANKROLL IMAGE STORAGE
 *
 * One place that knows which bucket bankroll images go to, and what a legal
 * object path looks like. It exists because the answer changed and was wrong
 * in two components at once.
 *
 * WHY NOT `images`
 * ----------------
 * Every bankroll upload used to target the `images` bucket. Storage RLS has a
 * single INSERT policy for browser clients:
 *
 *   "Authenticated upload to allowlisted buckets"
 *   CHECK bucket_id = ANY (ARRAY['avatars','live-recordings','messenger_media',
 *                                'social-media','stories','uploads','user-media'])
 *
 * `images` is not on that list and has no INSERT policy of its own, so every
 * upload was refused with 403 "new row violates row-level security policy".
 * The bucket holds 117 objects from before the allowlist was tightened, which
 * is why this looked like it had always worked. It had stopped.
 *
 * `user-media` is on the allowlist, is public (so getPublicUrl keeps working
 * for the media_urls contract the entry form already renders), and its policy
 * is `foldername(name)[1] = auth.uid()`, which scopes every object to the user
 * who owns it. Hence the leading `<uid>/` segment below: it is not decoration,
 * it is what the policy checks.
 */

export const BANKROLL_BUCKET = 'user-media';

/**
 * Object path for a bankroll image.
 *
 * The first segment MUST be the user's id or storage RLS refuses the insert.
 */
export function bankrollObjectPath(userId, extension = 'jpg') {
    if (!userId) throw new Error('bankroll-upload-needs-user');
    const safeExt = String(extension || 'jpg').replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'jpg';
    const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    return `${userId}/bankroll/${unique}.${safeExt}`;
}

/**
 * Upload one image and return its public URL.
 *
 * @param {object} supabase   the browser client, already signed in
 * @param {string} userId
 * @param {Blob|File} blob
 * @param {string} contentType
 * @returns {Promise<string>} public URL
 * @throws  the Supabase error, so callers can report why rather than "failed"
 */
export async function uploadBankrollImage(supabase, userId, blob, contentType = 'image/jpeg') {
    const ext = extensionFor(contentType);
    const path = bankrollObjectPath(userId, ext);

    const { error } = await supabase.storage
        .from(BANKROLL_BUCKET)
        .upload(path, blob, { contentType, upsert: false });

    if (error) throw error;

    const { data } = supabase.storage.from(BANKROLL_BUCKET).getPublicUrl(path);
    if (!data || !data.publicUrl) throw new Error('no-public-url');
    return data.publicUrl;
}

/** Storage object extension for a MIME type. Anything unrecognised is stored as jpg. */
const EXTENSIONS = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/heif': 'heif',
    'application/pdf': 'pdf',
};

function extensionFor(contentType) {
    return EXTENSIONS[String(contentType || '').toLowerCase()] || 'jpg';
}

/**
 * Upload a user-chosen file (a photo or a PDF of a tax form or dealer document)
 * to the same bucket and path shape as a scanned receipt.
 *
 * DealerVault and TaxReportPanel used to write to the `images` bucket, which
 * has no INSERT policy, so every W-2G and dealer-document upload was refused
 * with 403. They go through here now; the bucket lives in ONE place.
 *
 * @param {object} supabase the browser client, already signed in
 * @param {string} userId
 * @param {File}   file
 * @returns {Promise<string>} public URL
 */
export async function uploadBankrollFile(supabase, userId, file) {
    const type = String((file && file.type) || 'image/jpeg').toLowerCase();
    if (!EXTENSIONS[type]) {
        // The bucket refuses anything outside its allowed_mime_types, with a
        // storage error nobody can act on. Say it in words before it goes up.
        throw new Error('This File Type Is Not Supported. Use A Photo Or A PDF.');
    }
    return uploadBankrollImage(supabase, userId, file, type);
}

/** Types the bankroll bucket accepts, for a file input's `accept`. Mirrors EXTENSIONS and the bucket. */
export const BANKROLL_ACCEPTED_TYPES = Object.keys(EXTENSIONS);

/**
 * Remove the storage object behind a public URL, whichever bucket it is in.
 *
 * Old dealer documents and W-2Gs live in `images`; new ones live in
 * BANKROLL_BUCKET. Deleting a record must free either, so the bucket is read
 * from the URL rather than assumed. A URL that is not ours is left alone.
 *
 * Never throws. A storage object that cannot be removed (already gone, a
 * network drop, a policy that does not cover it) must not stop the RECORD
 * from being deleted; that was the behaviour before this module existed.
 *
 * @returns {Promise<boolean>} true when an object was removed
 */
export async function removeBankrollObject(supabase, publicUrl) {
    let pathname = '';
    try {
        pathname = new URL(String(publicUrl)).pathname;
    } catch (_e) {
        return false;
    }
    const match = pathname.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
    if (!match) return false;
    const [, bucket, objectPath] = match;
    try {
        const { error } = await supabase.storage.from(bucket).remove([decodeURIComponent(objectPath)]);
        if (error) {
            console.warn('[receiptStorage] object not removed:', error.message || error);
            return false;
        }
        return true;
    } catch (err) {
        console.warn('[receiptStorage] object not removed:', err?.message || err);
        return false;
    }
}

/**
 * Is this failure worth trying again?
 *
 * A refused policy or a rejected file will fail identically every time, and
 * retrying it just makes the user watch three spinners before the same red
 * box. A network blip will not.
 */
export function isRetryableUploadError(error) {
    if (!error) return false;
    const status = Number(error.statusCode || error.status || 0);
    const message = String(error.message || '').toLowerCase();

    if (message.includes('row-level security') || message.includes('unauthorized')) return false;
    if (message.includes('payload too large') || message.includes('exceeded the maximum')) return false;
    if (message.includes('duplicate') || message.includes('already exists')) return false;
    if (status === 401 || status === 403 || status === 413) return false;

    return true;
}
