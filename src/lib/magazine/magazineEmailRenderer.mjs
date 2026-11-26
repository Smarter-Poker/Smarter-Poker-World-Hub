/**
 * Smarter.Poker Monthly Magazine Cover-Reveal Email Renderer
 *
 * Renders the Vanguard table-based HTML + plain-text Cover-Reveal announcement
 * email when a monthly 44-page issue publishes.
 *
 * Strictly enforces:
 *   - Vanguard palette ONLY (`#05070a`, `#0b1520`, `#4fc1b3`, `#60a5fa`, `#ffffff`, `#9fb3c8`)
 *   - Zero yellow and zero purple hex codes
 *   - Zero em/en dashes (`stripMagazineDashes`) and zero `$` on Chips
 *   - `appendNewsletterUtm` (`utm_source: 'monthly_magazine'`) on all Smarter.Poker links
 *   - CAN-SPAM postal address (`PO Box 1905, 9624 Cicero Ave, Oak Lawn, IL 60453`),
 *     Email Preferences link, and one-click Unsubscribe footer
 */
import { buildMastheadCrestUrl, buildSignedEmailImageUrl } from '../newsletter/emailImageProxy.mjs';
import { appendNewsletterUtm } from '../newsletter/utmAttribution.mjs';
import {
    MAGAZINE_MASTHEAD,
    MAGAZINE_POSTAL_ADDRESS,
    MAGAZINE_SITE_URL,
    MAGAZINE_STORAGE_BUCKET,
    formatPeriodLabel,
    normalizeIssueManifest,
    stripMagazineDashes,
} from './magazineSchema.mjs';

function escapeHtml(value) {
    return stripMagazineDashes(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function resolveEmailSafeCoverUrl(rawCoverUrl, siteOrigin) {
    const clean = String(rawCoverUrl || '').trim();
    if (!clean) {
        return `${siteOrigin}/api/news/email-image?fallback=1&m=hero`;
    }
    if (clean.startsWith('/api/news/email-image')) {
        return `${siteOrigin}${clean}`;
    }
    if (clean.startsWith('/')) {
        return `${siteOrigin}/api/news/email-image?fallback=1&m=hero`;
    }
    try {
        const parsed = new URL(clean);
        const host = parsed.hostname.toLowerCase();
        const isSmarter = host === 'smarter.poker' || host.endsWith('.smarter.poker');
        if (isSmarter && parsed.pathname === '/api/news/email-image') {
            return parsed.toString();
        }
        if (
            (host.endsWith('.supabase.co') || isSmarter) &&
            parsed.pathname.includes(`/storage/v1/object/public/${MAGAZINE_STORAGE_BUCKET}/`)
        ) {
            return parsed.toString();
        }
        return buildSignedEmailImageUrl(parsed.toString(), { siteUrl: siteOrigin, mode: 'hero' });
    } catch {
        return `${siteOrigin}/api/news/email-image?fallback=1&m=hero`;
    }
}

export function withMagazineUtm(rawUrl, issueNumber, contentTag = '') {
    if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
    const num = Math.max(1, Math.floor(Number(issueNumber) || 1));
    return appendNewsletterUtm(rawUrl.trim(), {
        source: 'monthly_magazine',
        medium: 'email',
        campaign: `mag_issue_${num}`,
        content: contentTag ? String(contentTag) : '',
    });
}

/**
 * Renders `{ subject, html, text, issueUrl }` for the Monthly Magazine Cover-Reveal email.
 */
export function renderMonthlyMagazineCoverEmail({
    issue = {},
    manifest = null,
    unsubscribeUrl = '',
    preferencesUrl = '',
    siteUrl = MAGAZINE_SITE_URL,
    postalAddress = MAGAZINE_POSTAL_ADDRESS,
    subjectOverride = '',
} = {}) {
    const origin = String(siteUrl || MAGAZINE_SITE_URL).replace(/\/+$/, '');
    const norm = normalizeIssueManifest(manifest || issue?.manifest_json || {}, issue || {});
    const issueNum = norm.issueNumber;
    const volNum = norm.volumeNumber;
    const periodLabel = norm.periodLabel || formatPeriodLabel(norm.issuePeriod);
    const slug = norm.slug || norm.issuePeriod;

    const rawIssueUrl = `${origin}/hub/magazine/${encodeURIComponent(slug)}`;
    const issueUrl = withMagazineUtm(rawIssueUrl, issueNum, 'cover_cta');
    const mastheadLinkUrl = withMagazineUtm(`${origin}/hub/magazine`, issueNum, 'masthead');
    const readerViewUrl = withMagazineUtm(`${rawIssueUrl}?view=reader`, issueNum, 'mobile_reader');
    const cardroomBundleUrl = withMagazineUtm(`${origin}/hub/magazine/poker-rooms`, issueNum, 'cardroom_bundle');
    const crestUrl = buildMastheadCrestUrl({ siteUrl: origin });
    const coverImgUrl = resolveEmailSafeCoverUrl(norm.coverImageUrl || issue?.cover_image_url, origin);

    const safePostal = stripMagazineDashes(postalAddress || MAGAZINE_POSTAL_ADDRESS);
    const safeUnsub = String(unsubscribeUrl || `${origin}/api/news/subscribe?unsubscribe=preview`);
    const safePrefs = String(preferencesUrl || `${origin}/hub/email-preferences?token=preview`);

    const defaultSubject = stripMagazineDashes(
        `${MAGAZINE_MASTHEAD} Issue #${issueNum} (${periodLabel}) Is Live: ${norm.coverHeadline}`
    ).slice(0, 190);
    const subject = stripMagazineDashes(subjectOverride || defaultSubject).slice(0, 195);

    const preheaderText = stripMagazineDashes(
        `Flip open all ${norm.pageCount} pages of Vol. ${volNum}, Issue #${issueNum} (${periodLabel}): ${norm.coverSubheadline}`
    );

    const rawToc = Array.isArray(norm.toc) && norm.toc.length > 0
        ? norm.toc.slice(0, 6)
        : [
              { pageNumber: 12, title: norm.coverHeadline, subtitle: '4-Page Cover Story Investigation' },
              { pageNumber: 20, title: 'Global Player Of The Year Top 25', subtitle: 'Official Standings & Movers' },
              { pageNumber: 24, title: 'Kings Club 25450 Monthly Champions', subtitle: 'Completed Majors In Chips' },
              { pageNumber: 26, title: 'The Strategy Lab: NLH, ICM & PLO', subtitle: 'Solver Verdicts & Community Votes' },
              { pageNumber: 34, title: 'The Smarter.Poker Test', subtitle: '4-Question Poker IQ Challenge' },
              { pageNumber: 38, title: '60-Day Live Series & Room Radar', subtitle: 'Coast-To-Coast Stops Across America' },
          ];

    const tocRowsHtml = rawToc
        .map((item, idx) => {
            const pNum = Math.max(1, Number(item.pageNumber || 1));
            const targetLink = withMagazineUtm(`${rawIssueUrl}?page=${pNum}`, issueNum, `toc_${idx + 1}`);
            const itemTitle = escapeHtml(item.title || 'Featured Spread');
            const itemSub = escapeHtml(item.subtitle || '');
            return `<tr>
  <td style="padding:10px 0;border-bottom:1px solid #0b1520;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td width="54" valign="top" style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:12px;font-weight:700;color:#4fc1b3;padding-top:2px;">
          P. ${pNum}
        </td>
        <td valign="top" style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;">
          <a href="${escapeHtml(targetLink)}" style="color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;line-height:1.35;display:block;">${itemTitle}</a>
          ${itemSub ? `<div style="color:#9fb3c8;font-size:13px;line-height:1.45;margin-top:2px;">${itemSub}</div>` : ''}
        </td>
      </tr>
    </table>
  </td>
</tr>`;
        })
        .join('\n');

    const ctaLabelText = `Flip Open Issue #${issueNum} Online ->`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#05070a;color:#ffffff;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#05070a;">
    ${escapeHtml(preheaderText)}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#05070a;">
    <tr>
      <td align="center" style="padding:28px 12px 44px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#0b1520;border:1px solid #4fc1b3;border-radius:14px;overflow:hidden;">
          <!-- Masthead -->
          <tr>
            <td style="padding:22px 26px;background-color:#05070a;border-bottom:2px solid #4fc1b3;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="52" valign="middle">
                    <a href="${escapeHtml(mastheadLinkUrl)}" style="text-decoration:none;">
                      <img src="${escapeHtml(crestUrl)}" width="42" height="42" alt="Smarter.Poker Crest" style="display:block;border:0;border-radius:10px;" />
                    </a>
                  </td>
                  <td valign="middle">
                    <div style="font-size:11px;letter-spacing:1.6px;text-transform:uppercase;color:#4fc1b3;font-weight:700;">
                      Vol. ${volNum} &bull; Issue #${issueNum} &bull; ${escapeHtml(periodLabel)}
                    </div>
                    <a href="${escapeHtml(mastheadLinkUrl)}" style="font-size:20px;font-weight:800;color:#ffffff;text-decoration:none;letter-spacing:0.4px;">
                      ${escapeHtml(MAGAZINE_MASTHEAD)}
                    </a>
                  </td>
                  <td align="right" valign="middle" style="font-size:12px;font-weight:700;color:#60a5fa;">
                    ${norm.pageCount}-Page Edition
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Cover Image Reveal -->
          <tr>
            <td style="padding:0;background-color:#05070a;">
              <a href="${escapeHtml(issueUrl)}" style="text-decoration:none;display:block;">
                <img src="${escapeHtml(coverImgUrl)}" width="600" alt="${escapeHtml(norm.coverHeadline)}" style="display:block;width:100%;max-width:600px;height:auto;border:0;" />
              </a>
            </td>
          </tr>

          <!-- Cover Story & Primary CTA -->
          <tr>
            <td style="padding:26px 26px 20px;">
              <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.4px;color:#4fc1b3;margin-bottom:8px;">
                Cover Reveal &bull; ${escapeHtml(periodLabel)} Edition
              </div>
              <h1 style="margin:0 0 12px;font-size:24px;line-height:1.28;font-weight:800;color:#ffffff;">
                ${escapeHtml(norm.coverHeadline)}
              </h1>
              <p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#9fb3c8;">
                ${escapeHtml(norm.coverSubheadline)}
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="border-radius:8px;background-color:#4fc1b3;">
                    <a href="${escapeHtml(issueUrl)}" style="display:inline-block;padding:14px 24px;font-size:15px;font-weight:800;color:#05070a;text-decoration:none;border-radius:8px;">
                      ${escapeHtml(ctaLabelText)}
                    </a>
                  </td>
                </tr>
              </table>
              <div style="margin-top:12px;font-size:13px;color:#9fb3c8;">
                Reading on your phone? <a href="${escapeHtml(readerViewUrl)}" style="color:#60a5fa;text-decoration:underline;font-weight:600;">Open Clean Mobile Reader View</a>
              </div>
            </td>
          </tr>

          <!-- Inside This 44-Page Issue (Clickable TOC) -->
          <tr>
            <td style="padding:8px 26px 24px;">
              <div style="padding:18px 20px;background-color:#05070a;border:1px solid #60a5fa;border-radius:10px;">
                <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:1.3px;color:#60a5fa;margin-bottom:10px;">
                  Inside Issue #${issueNum} &bull; Click Any Section To Jump In
                </div>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  ${tocRowsHtml}
                </table>
              </div>
            </td>
          </tr>

          <!-- Cardroom Print Distribution Callout -->
          <tr>
            <td style="padding:0 26px 26px;">
              <div style="padding:16px 18px;background-color:#05070a;border-left:3px solid #4fc1b3;border-radius:6px;">
                <div style="font-size:14px;font-weight:700;color:#ffffff;margin-bottom:4px;">
                  Manage A Poker Room? Stock Monthly Print Copies Free
                </div>
                <div style="font-size:13px;line-height:1.5;color:#9fb3c8;">
                  Request bulk glossy 8.375x10.875 cardroom bundles (5 to 1,000 copies) plus QR table tents at
                  <a href="${escapeHtml(cardroomBundleUrl)}" style="color:#4fc1b3;font-weight:700;text-decoration:underline;">Smarter.Poker Cardroom Distribution</a>.
                </div>
              </div>
            </td>
          </tr>

          <!-- CAN-SPAM Footer -->
          <tr>
            <td style="padding:20px 26px;background-color:#05070a;border-top:1px solid #0b1520;text-align:center;font-size:12px;line-height:1.6;color:#9fb3c8;">
              <div><strong>${escapeHtml(MAGAZINE_MASTHEAD)}</strong> &bull; ${escapeHtml(safePostal)}</div>
              <div style="margin-top:8px;">
                <a href="${escapeHtml(safePrefs)}" style="color:#60a5fa;text-decoration:underline;">Email Preferences</a>
                &nbsp;&bull;&nbsp;
                <a href="${escapeHtml(safeUnsub)}" style="color:#9fb3c8;text-decoration:underline;">Unsubscribe</a>
                &nbsp;&bull;&nbsp;
                <a href="${escapeHtml(mastheadLinkUrl)}" style="color:#4fc1b3;text-decoration:underline;">Magazine Archive</a>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    const tocPlainLines = rawToc
        .map((item) => `  - p. ${Math.max(1, Number(item.pageNumber || 1))}: ${stripMagazineDashes(item.title)}`)
        .join('\n');

    const text = [
        `${MAGAZINE_MASTHEAD} - Vol. ${volNum}, Issue #${issueNum} (${periodLabel})`,
        '',
        norm.coverHeadline,
        norm.coverSubheadline,
        '',
        `${ctaLabelText} ${issueUrl}`,
        `Mobile Reader View: ${readerViewUrl}`,
        '',
        `Inside This ${norm.pageCount}-Page Issue:`,
        tocPlainLines,
        '',
        `Cardroom Print Bundles: ${cardroomBundleUrl}`,
        '',
        `${MAGAZINE_MASTHEAD} | ${safePostal}`,
        `Email Preferences: ${safePrefs}`,
        `Unsubscribe: ${safeUnsub}`,
    ].join('\n');

    return {
        subject,
        html,
        text,
        issueUrl,
    };
}
