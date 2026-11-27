/**
 * Smarter.Poker Monthly Magazine 44-Page Commercial PDF Endpoint (/api/news/magazine-pdf)
 *
 * GET /api/news/magazine-pdf?issue=latest|<YYYY-MM>|<issue_number>|<slug>
 *   - `?download=1` -> `Content-Disposition: attachment; filename="Smarter-Poker-Magazine-<slug>.pdf"`
 *   - `?preview=1`  -> Allows proofing `review` / `accumulating` issues with `private, no-store`
 *   - `?refresh=1`  -> Admin/Cron-only regeneration + Supabase Storage `magazine-assets` cache update
 *
 * When `magazine_issues.pdf_url` is already populated and `?refresh=1` is not set,
 * redirects (`302`) to the cached `magazine-assets` PDF object (unless `?stream=1`).
 * Otherwise builds the 44-page `8.375in x 10.875in` PDF via `buildMagazineIssuePdfBuffer`,
 * uploads it to `magazine-assets/${issue_period}/smarter-poker-magazine-${slug}.pdf`,
 * persists `pdf_url` + `pdf_storage_path` on `magazine_issues`, and serves `200 application/pdf`.
 */
import { getServerUserWithFallback } from '../../../src/lib/serverAuth.js';
import { reportApiError } from '../../../src/lib/apiErrorHandler.js';
import {
    MAGAZINE_STORAGE_BUCKET,
    isValidIssuePeriod,
    normalizeIssueManifest,
} from '../../../src/lib/magazine/magazineSchema.mjs';
import {
    buildMagazineIssuePdfBuffer,
    isAllowedMagazineAssetImageUrl,
} from '../../../src/lib/magazine/magazinePdfBuilder.mjs';

export const config = { maxDuration: 120 };

const ADMIN_ROLES = ['admin', 'superadmin', 'god'];
const SLUG_SHAPE_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/i;

let _supabase = null;
async function getSupabase(req = null) {
    if (req?._supabase) return req._supabase;
    if (req?._supabaseClient) return req._supabaseClient;
    if (!_supabase) {
        const { createClient } = await import('../../../src/lib/supabaseServerClient.js');
        _supabase = createClient();
    }
    return _supabase;
}

const _fallbackRateMap = new Map();
async function checkPdfRateLimit(req, res, mode = 'read') {
    if (typeof req?._rateLimitFn === 'function') {
        return req._rateLimitFn(req, res, mode);
    }
    try {
        const { applyRateLimit, LIMITS } = await import('../../../src/lib/apiRateLimit.js');
        return applyRateLimit(req, res, mode === 'write' ? LIMITS.write : LIMITS.read);
    } catch (err) {
        if (err?.code !== 'ERR_MODULE_NOT_FOUND') throw err;
        const ip = String(req?.headers?.['x-real-ip'] || req?.socket?.remoteAddress || 'local');
        const key = `mag-pdf:${mode}:${ip}`;
        const now = Date.now();
        const max = mode === 'write' ? 20 : 90;
        const entry = _fallbackRateMap.get(key);
        if (!entry || now > entry.resetAt) {
            _fallbackRateMap.set(key, { count: 1, resetAt: now + 60_000 });
            return true;
        }
        entry.count += 1;
        if (entry.count > max) {
            res.status(429).json({ success: false, error: 'Too Many Requests' });
            return false;
        }
        return true;
    }
}

const safeQ = (v) => (Array.isArray(v) ? String(v[0]) : v == null ? '' : String(v));

function sanitizeFileSlug(raw) {
    const cleaned = String(raw || 'latest')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64);
    return cleaned || 'latest';
}

async function authorizeAdminOrCron(req, sbClient) {
    const cronSecret = String(process.env.CRON_SECRET || '').trim();
    if (cronSecret && req?.headers?.authorization === `Bearer ${cronSecret}`) {
        return { kind: 'cron', userId: null };
    }
    const adminKey = String(process.env.ADMIN_API_KEY || '').trim();
    if (adminKey && req?.headers?.['x-admin-key'] === adminKey) {
        return { kind: 'operator', userId: null };
    }
    try {
        const authRes = await getServerUserWithFallback(req, sbClient);
        const user = authRes?.user ?? authRes;
        if (!user?.id) return null;
        const { data: profRows, error } = await sbClient
            .from('profiles')
            .select('role, is_admin')
            .eq('id', user.id)
            .limit(1);
        const profile = Array.isArray(profRows) ? profRows[0] : null;
        if (error || !profile || (!profile.is_admin && !ADMIN_ROLES.includes(profile.role))) {
            return null;
        }
        return { kind: 'admin', userId: user.id };
    } catch {
        return null;
    }
}

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ success: false, error: 'Method Not Allowed' });
    }

    const wantsRefresh = ['1', 'true', 'yes'].includes(safeQ(req.query?.refresh).toLowerCase());
    const wantsDownload = ['1', 'true', 'yes'].includes(safeQ(req.query?.download).toLowerCase());
    const wantsPreview = ['1', 'true', 'yes'].includes(safeQ(req.query?.preview).toLowerCase());
    const wantsStream = ['1', 'true', 'yes'].includes(safeQ(req.query?.stream).toLowerCase());

    if (!(await checkPdfRateLimit(req, res, wantsRefresh ? 'write' : 'read'))) {
        return;
    }

    const sb = await getSupabase(req);
    const auth = wantsRefresh ? await authorizeAdminOrCron(req, sb) : null;
    if (wantsRefresh && !auth) {
        res.setHeader('Cache-Control', 'private, no-store');
        return res.status(401).json({
            success: false,
            error: 'Administrator Or Cron Authorization Required To Refresh Issue PDF',
        });
    }

    const rawIssue = safeQ(req.query?.issue || req.query?.issuePeriod || 'latest').trim();
    const selector = rawIssue.toLowerCase();
    const isLatest = selector === 'latest' || selector === 'current' || selector === '';
    const isNumeric = /^\d+$/.test(selector);
    const isPeriod = isValidIssuePeriod(selector);
    const isSlug = SLUG_SHAPE_RE.test(selector);

    if (!isLatest && !isNumeric && !isPeriod && !isSlug) {
        return res.status(400).json({ success: false, error: 'Invalid Magazine Issue Selector' });
    }

    const includeDrafts = Boolean(auth || wantsPreview);
    const allowedStatuses = includeDrafts ? ['published', 'review', 'accumulating'] : ['published'];

    try {
        let queryBuilder = sb
            .from('magazine_issues')
            .select('*')
            // in-list: bounded to 1..3 magazine issue status constants
            .in('status', allowedStatuses);

        if (isLatest) {
            queryBuilder = queryBuilder.order('issue_number', { ascending: false }).limit(4);
        } else if (isPeriod) {
            queryBuilder = queryBuilder
                .eq('issue_period', selector)
                .order('issue_number', { ascending: false })
                .limit(2);
        } else if (isNumeric) {
            const parsedNum = Number(selector);
            if (!Number.isSafeInteger(parsedNum) || parsedNum < 1 || parsedNum > 100000) {
                return res.status(404).json({ success: false, error: 'Magazine Issue Not Found' });
            }
            queryBuilder = queryBuilder.eq('issue_number', parsedNum).limit(1);
        } else {
            queryBuilder = queryBuilder.eq('slug', selector).limit(1);
        }

        let { data: rows, error: findErr } = await queryBuilder;
        if (findErr) throw findErr;

        if ((!Array.isArray(rows) || rows.length === 0) && isPeriod) {
            const fallbackQuery = await sb
                .from('magazine_issues')
                .select('*')
                // in-list: bounded to 1..3 magazine issue status constants
                .in('status', allowedStatuses)
                .eq('slug', selector)
                .limit(1);
            rows = fallbackQuery.data || [];
        }

        const chosen = Array.isArray(rows)
            ? rows.find((r) => r?.status === 'published') || rows[0] || null
            : null;

        if (!chosen) {
            return res.status(404).json({ success: false, error: 'Magazine Issue Not Found' });
        }

        const manifest = normalizeIssueManifest(chosen.manifest_json || {}, chosen);
        const safeSlug = sanitizeFileSlug(chosen.slug || manifest.slug || manifest.issuePeriod);
        const filename = `Smarter-Poker-Magazine-${safeSlug}.pdf`;
        const disposition = `${wantsDownload ? 'attachment' : 'inline'}; filename="${filename}"`;

        const isPublishedIssue = chosen.status === 'published';
        const existingPdfUrl = String(chosen.pdf_url || '').trim();
        const hasValidCachedPdf =
            isPublishedIssue &&
            Boolean(existingPdfUrl) &&
            isAllowedMagazineAssetImageUrl(existingPdfUrl) &&
            existingPdfUrl.toLowerCase().endsWith('.pdf');

        if (hasValidCachedPdf && !wantsRefresh && !wantsStream) {
            let redirectTarget = existingPdfUrl;
            if (wantsDownload) {
                try {
                    const parsedRedirect = new URL(existingPdfUrl);
                    parsedRedirect.searchParams.set('download', filename);
                    redirectTarget = parsedRedirect.toString();
                } catch {
                    redirectTarget = existingPdfUrl;
                }
            }
            res.setHeader(
                'Cache-Control',
                includeDrafts ? 'private, no-store' : 'public, s-maxage=300, stale-while-revalidate=900'
            );
            res.setHeader('Location', redirectTarget);
            if (typeof res.redirect === 'function') {
                return res.redirect(302, redirectTarget);
            }
            res.status(302);
            return typeof res.end === 'function' ? res.end() : res.json({ redirect: redirectTarget });
        }

        const pdfBuffer = await buildMagazineIssuePdfBuffer(manifest, {
            embedImages: true,
            fetchImpl: typeof req?._fetchImpl === 'function' ? req._fetchImpl : fetch,
        });

        const storagePath = `${manifest.issuePeriod}/smarter-poker-magazine-${safeSlug}.pdf`;
        let uploadedPublicUrl = null;

        if (isPublishedIssue) {
            try {
                if (sb?.storage?.from) {
                    const bucket = sb.storage.from(MAGAZINE_STORAGE_BUCKET);
                    const { error: uploadErr } = await bucket.upload(storagePath, pdfBuffer, {
                        contentType: 'application/pdf',
                        upsert: true,
                        cacheControl: '3600',
                    });
                    if (!uploadErr && typeof bucket.getPublicUrl === 'function') {
                        const pubRes = bucket.getPublicUrl(storagePath);
                        uploadedPublicUrl = pubRes?.data?.publicUrl || null;
                    }
                }
            } catch {
                /* non-blocking storage upload fallback */
            }

            if (uploadedPublicUrl && chosen.id) {
                const nowIso = new Date().toISOString();
                try {
                    const { error: updErr } = await sb
                        .from('magazine_issues')
                        .update({
                            pdf_url: uploadedPublicUrl,
                            pdf_storage_path: storagePath,
                            updated_at: nowIso,
                        })
                        .eq('id', chosen.id);
                    if (updErr) {
                        await sb
                            .from('magazine_issues')
                            .update({
                                pdf_url: uploadedPublicUrl,
                                updated_at: nowIso,
                            })
                            .eq('id', chosen.id);
                    }
                } catch {
                    /* non-blocking DB cache update */
                }
            }
        }

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', disposition);
        res.setHeader('Content-Length', String(pdfBuffer.byteLength));
        res.setHeader(
            'Cache-Control',
            !isPublishedIssue || includeDrafts || wantsRefresh
                ? 'private, no-store'
                : 'public, s-maxage=300, stale-while-revalidate=900'
        );

        res.status(200);
        if (typeof res.send === 'function') {
            return res.send(pdfBuffer);
        }
        if (typeof res.end === 'function') {
            return res.end(pdfBuffer);
        }
        return res.json({ success: true, bytes: pdfBuffer.byteLength });
    } catch (err) {
        reportApiError(err, req);
        return res.status(500).json({
            success: false,
            error: 'Unable To Generate Smarter.Poker Magazine PDF',
        });
    }
}
