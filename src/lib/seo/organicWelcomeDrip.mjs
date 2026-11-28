/**
 * Intent-Personalized Day-0 / Day-1 / Day-3 / Day-7 / Day-21 / Day-25 Organic Activation & Series Reminder Email Composer
 *
 * Pure, zero-PII, Resend-ready HTML + plain-text email builder that tailors
 * Day-0 activation, Day-1 behavioral re-engagement, Day-3 unverified VIP
 * urgency nudges, Day-7 & Day-21 habit digests, Day-25 VIP trial graduation,
 * and saved tournament series event reminders to the player's organic entry
 * intent (`gto-ranges`, `odds-calculator`, `gto-leak-finder`,
 * `series-reminder`, `live-venues`, or `general-hub`).
 *
 * Standards enforced:
 *   - Zero em dashes (\u2014) or en dashes (\u2013)
 *   - Title Case headings
 *   - Compliant offer wording: "Free 30-Day VIP + 500 Diamonds On Phone Verify"
 *   - Zero banned gold hexes (#FFD700, #D4AF37, #f5c542, #f59e0b, #fbbf24, #eab308, #d97706)
 *   - Zero PII emitted into URLs, headers, or untrusted fields
 */

const DEFAULT_SITE_URL = 'https://smarter.poker';
const DEFAULT_POSTAL_ADDRESS = 'PO Box 1905, 9624 Cicero Ave, Oak Lawn, IL 60453';

export const ORGANIC_ACTIVATION_TRACKS = Object.freeze([
  'gto-ranges',
  'odds-calculator',
  'gto-leak-finder',
  'series-reminder',
  'live-venues',
  'general-hub',
]);

const TRACK_SET = new Set(ORGANIC_ACTIVATION_TRACKS);

const TRACK_CONFIG = Object.freeze({
  'gto-ranges': {
    label: 'GTO Preflop Ranges',
    defaultNextPath: '/hub/training/preflop-charts',
    day0Subject: 'Your Saved GTO Preflop Ranges Are Ready + Claim Free 30-Day VIP',
    day0Preview: 'Jump back into your saved GTO ranges and claim Free 30-Day VIP + 500 Diamonds On Phone Verify.',
    day0Heading: 'Your Saved GTO Ranges Are Unlocked',
    day0Intro:
      'Your Smarter.Poker account is live and your GTO preflop range study session is saved. Pick up right where you left off with full 100bb cash, MTT, and 3-bet range charts.',
    day0SpotlightTitle: 'Saved Spot Ready: GTO Preflop Range Charts',
    day0SpotlightBody:
      'Drill open-raise, 3-bet, and 4-bet frequencies across every seat, then verify your phone in one tap to unlock Free 30-Day VIP + 500 Diamonds On Phone Verify.',
    day0SecondaryLabel: 'Open Saved GTO Ranges',
    day1Intro:
      'You started sharpening your preflop ranges yesterday. Put that range discipline to the test in a 60-second solver decision.',
    day1SpotLine:
      '100bb Cash: CO opens 2.5bb, Hero 3-bets BTN with A5s, CO calls. Flop comes K-7-2 rainbow. What is the highest-EV solver play?',
    day3BenefitTitle: 'Unlock Full GTO Preflop Ranges + 500 Diamonds',
    day3BenefitBody:
      'Verify your phone in 15 seconds to claim Free 30-Day VIP + 500 Diamonds On Phone Verify and unlock full 100bb cash, MTT, and 3-bet solver range charts with unlimited saved spots.',
    day7Title: 'Next GTO Challenge: 3-Bet Pot Preflop & Flop Frequencies',
    day7Body:
      'Build on your preflop range work with a quick solver rep focused on 100bb 3-bet pot continuation strategy across cash and MTT seats.',
    day7CtaLabel: 'Open GTO Preflop Range Drills',
    day21Title: 'Keep Your Range Edge Sharp & Find Local Games',
    day21Body:
      'Review your go-to preflop range charts and browse upcoming live poker rooms and tournament schedules near you before your next session.',
    day21CtaLabel: 'Review GTO Ranges & Local Games',
  },
  'odds-calculator': {
    label: 'Poker Odds & Equity Calculator',
    defaultNextPath: '/tools/poker-odds-calculator',
    day0Subject: 'Your Saved Odds Calculations Are Ready + Claim Free 30-Day VIP',
    day0Preview: 'Re-open your saved equity spot and claim Free 30-Day VIP + 500 Diamonds On Phone Verify.',
    day0Heading: 'Your Poker Odds & Equity Workspace Is Ready',
    day0Intro:
      'Welcome to Smarter.Poker. Your odds and equity calculation session is saved inside your account alongside our full suite of free poker math calculators.',
    day0SpotlightTitle: 'Saved Tool Ready: Poker Odds & Equity Calculator',
    day0SpotlightBody:
      'Save hand-vs-range matchups, track EV across streets, and unlock Free 30-Day VIP + 500 Diamonds On Phone Verify in one tap.',
    day0SecondaryLabel: 'Return To Odds Calculator',
    day1Intro:
      'Yesterday you ran equity numbers in the Smarter.Poker calculator. Now see if your intuition matches the solver in a real 3-bet pot.',
    day1SpotLine:
      '100bb Cash: Hero holds A5s on the BTN after a CO open and 3-bet. On K-7-2 rainbow, do you range c-bet small, size up, or check back?',
    day3BenefitTitle: 'Unlock Unlimited Equity Studies + 500 Diamonds',
    day3BenefitBody:
      'Verify your phone in 15 seconds to claim Free 30-Day VIP + 500 Diamonds On Phone Verify and unlock saved hand-vs-range matchups, multi-street EV tracking, and full solver tools.',
    day7Title: 'Next GTO Challenge: Multi-Street Equity & Pot Odds Drill',
    day7Body:
      'Pair your hand-vs-range equity calculations with a 60-second GTO Hand Lab decision to test how raw equity translates into solver EV.',
    day7CtaLabel: 'Open Equity & Odds Workspace',
    day21Title: 'Bring Your Equity Edge To Upcoming Local Tables',
    day21Body:
      'Revisit your odds calculator workspace before your next live session and check upcoming local poker rooms and daily tournament schedules.',
    day21CtaLabel: 'Open Odds Tools & Local Games',
  },
  'gto-leak-finder': {
    label: 'GTO Leak Finder',
    defaultNextPath: '/hub/personal-assistant',
    day0Subject: 'Your GTO Leak Audit Is Ready + Claim Free 30-Day VIP',
    day0Preview: 'Inspect your saved leak report and claim Free 30-Day VIP + 500 Diamonds On Phone Verify.',
    day0Heading: 'Your GTO Leak Finder Report Is Saved',
    day0Intro:
      'Your Smarter.Poker account is ready and your GTO Leak Finder diagnostic is saved. Review your biggest EV leaks and train targeted drills directly in the Hub.',
    day0SpotlightTitle: 'Saved Audit Ready: GTO Leak Finder & Personal Assistant',
    day0SpotlightBody:
      'Pinpoint 3-bet pot, c-bet, and river bluffing leaks fast, and verify your phone in one tap for Free 30-Day VIP + 500 Diamonds On Phone Verify.',
    day0SecondaryLabel: 'View Your Leak Audit',
    day1Intro:
      'Yesterday you ran a GTO Leak Finder check. One of the highest-EV leaks at 100bb is BTN 3-bet pot flop strategy - test your read in 60 seconds.',
    day1SpotLine:
      '100bb Cash: BTN 3-bet pot vs CO call on K-7-2 rainbow with A5s. Lock in your action and compare EV against the solver immediately.',
    day3BenefitTitle: 'Unlock Full GTO Leak Finder Drills + 500 Diamonds',
    day3BenefitBody:
      'Verify your phone in 15 seconds to claim Free 30-Day VIP + 500 Diamonds On Phone Verify and unlock full Personal Assistant leak audits, targeted drill playlists, and solver reviews.',
    day7Title: 'Next GTO Challenge: Targeted Turn & River Leak Repair',
    day7Body:
      'Jump back into Personal Assistant and GTO Hand Lab for a focused solver drill targeting the highest-EV postflop leaks.',
    day7CtaLabel: 'Continue GTO Leak Drills',
    day21Title: 'Re-Run Your Leak Check & Explore Local Poker Rooms',
    day21Body:
      'Run a fresh check-in inside Personal Assistant to sharpen weak spots and browse upcoming local games and series schedules.',
    day21CtaLabel: 'Open Personal Assistant Check-In',
  },
  'series-reminder': {
    label: 'Live Tournament Series Alerts',
    defaultNextPath: '/hub/poker-series',
    day0Subject: 'Your Tournament Series Reminder Is Set + Claim Free 30-Day VIP',
    day0Preview: 'Your live series schedule alert is saved - claim Free 30-Day VIP + 500 Diamonds On Phone Verify.',
    day0Heading: 'Your Tournament Series Reminder Is Active',
    day0Intro:
      'Your Smarter.Poker account is live and your tournament series reminder is saved. Track verified event counts, buy-ins, start times, and guarantees across every major stop.',
    day0SpotlightTitle: 'Saved Reminder: Live Series Schedules & Guarantees',
    day0SpotlightBody:
      'Keep your followed schedules synced on mobile and desktop, plus claim Free 30-Day VIP + 500 Diamonds On Phone Verify in one tap.',
    day0SecondaryLabel: 'View Your Saved Series',
    day1Intro:
      'Before your next tournament flight starts, warm up your decision-making with a 1-minute solver challenge built for live grinders.',
    day1SpotLine:
      'BTN 3-Bet Spot: Facing a CO open and call on K-7-2 rainbow with A5s, pick the solver-approved line in under 60 seconds.',
    day3BenefitTitle: 'Unlock Live Series Alerts & MTT Solver Tools + 500 Diamonds',
    day3BenefitBody:
      'Verify your phone in 15 seconds to claim Free 30-Day VIP + 500 Diamonds On Phone Verify and unlock synced series alerts, ICM warmup drills, and full MTT solver access.',
    day7Title: 'Next GTO Challenge: Short-Stack ICM & Live MTT Warmup',
    day7Body:
      'Check your upcoming tournament series calendar and knock out a quick MTT solver challenge in GTO Hand Lab before your next flight.',
    day7CtaLabel: 'Open Series Calendar & Warmup',
    day21Title: 'Review Upcoming Tournament Series & Local Schedules',
    day21Body:
      'See newly posted tournament schedules, guarantees, and nearby live poker rooms so you can plan your next festival run.',
    day21CtaLabel: 'Browse Upcoming Poker Series',
  },
  'live-venues': {
    label: 'Live Poker Rooms Near You',
    defaultNextPath: '/hub/poker-near-me/lobby',
    day0Subject: 'Your Saved Poker Rooms Are Ready + Claim Free 30-Day VIP',
    day0Preview: 'Access your saved live poker rooms and claim Free 30-Day VIP + 500 Diamonds On Phone Verify.',
    day0Heading: 'Your Saved Live Poker Rooms Are Synced',
    day0Intro:
      'Welcome to Smarter.Poker. Your Poker Near Me room alerts and saved venues are synced to your account with live schedules, daily tournaments, and room details.',
    day0SpotlightTitle: 'Saved Rooms Ready: Poker Near Me Directory',
    day0SpotlightBody:
      'Check live daily schedules, room structures, and nearby tournament series, and unlock Free 30-Day VIP + 500 Diamonds On Phone Verify in one tap.',
    day0SecondaryLabel: 'Open Saved Poker Rooms',
    day1Intro:
      'Heading to a live poker room soon? Sharpen your 3-bet pot instincts before you sit down with a quick 1-minute solver spot.',
    day1SpotLine:
      'Live Cash Warmup: You 3-bet A5s on the BTN against a CO open and see K-7-2 rainbow. Can you match the solver frequency?',
    day3BenefitTitle: 'Unlock Live Room Alerts & Cash Solver Warmups + 500 Diamonds',
    day3BenefitBody:
      'Verify your phone in 15 seconds to claim Free 30-Day VIP + 500 Diamonds On Phone Verify and unlock live room alerts, bankroll tracking, and full cash-game GTO warmup packs.',
    day7Title: 'Next GTO Challenge: Deep-Stack Live Cash Table Warmup',
    day7Body:
      'Review live room listings in Poker Near Me and run a quick 60-second cash-game solver challenge before you head to the felt.',
    day7CtaLabel: 'Open Poker Near Me & Warmup',
    day21Title: 'Check Upcoming Local Poker Games & Live Schedules',
    day21Body:
      'Explore updated daily tournaments, nearby poker rooms, and upcoming regional series schedules inside Poker Near Me.',
    day21CtaLabel: 'Explore Upcoming Local Games',
  },
  'general-hub': {
    label: 'Smarter.Poker Hub',
    defaultNextPath: '/hub',
    day0Subject: 'Welcome To Smarter.Poker: Claim Free 30-Day VIP + 500 Diamonds',
    day0Preview: 'Your account is ready - claim Free 30-Day VIP + 500 Diamonds On Phone Verify in one tap.',
    day0Heading: 'Welcome To Smarter.Poker Hub',
    day0Intro:
      'Your free Smarter.Poker account is active. You now have one-login access to GTO Hand Lab, Preflop Charts, 42+ Free Poker Calculators, Poker Near Me, and Live Series Schedules.',
    day0SpotlightTitle: 'Next Step: Unlock Your Welcome Package',
    day0SpotlightBody:
      'Verify your phone number in one tap to claim Free 30-Day VIP + 500 Diamonds On Phone Verify and unlock full solver training tools.',
    day0SecondaryLabel: 'Explore Smarter.Poker Hub',
    day1Intro:
      'Ready for your first quick training rep? Spend 60 seconds in GTO Hand Lab and see how closely your instincts track the solver.',
    day1SpotLine:
      'BTN 3-Bet Spot: CO opens 2.5bb, Hero 3-bets A5s on the BTN, CO calls, flop is K-7-2 rainbow. Pick your play and inspect instant EV.',
    day3BenefitTitle: 'Unlock Full Smarter.Poker Hub VIP + 500 Diamonds',
    day3BenefitBody:
      'Verify your phone in 15 seconds to claim Free 30-Day VIP + 500 Diamonds On Phone Verify and unlock GTO Hand Lab, Preflop Charts, 42+ Free Calculators, and Live Series Alerts.',
    day7Title: 'Next GTO Challenge: 60-Second Solver Decision Rep',
    day7Body:
      'Jump into GTO Hand Lab for a quick solver rep, inspect preflop charts, or open any of our 42+ free poker calculators in one tap.',
    day7CtaLabel: 'Start Next GTO Challenge',
    day21Title: 'Check In On Your Poker Study & Browse Local Games',
    day21Body:
      'Keep your study workspace handy and check upcoming local poker rooms, daily schedules, and tournament series across Smarter.Poker Hub.',
    day21CtaLabel: 'Open Smarter.Poker Hub',
  },
});

function stripEmDashes(value) {
  return String(value == null ? '' : value)
    .replace(/\s*[\u2013\u2014]\s*/g, ' - ')
    .replace(/\s*(?:&mdash;|&ndash;|&#8212;|&#8211;|&#x2014;|&#x2013;)\s*/gi, ' - ');
}

function escapeHtml(value) {
  return stripEmDashes(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeFirstName(rawName) {
  if (typeof rawName !== 'string') return 'Player';
  const cleaned = stripEmDashes(rawName).trim();
  if (!cleaned || cleaned.includes('@')) return 'Player';
  const safe = cleaned.replace(/[^A-Za-z0-9' -]/g, '').replace(/\s+/g, ' ').trim().slice(0, 32);
  return safe || 'Player';
}

function sanitizeLandingPath(rawPath) {
  if (typeof rawPath !== 'string') return '';
  const stripped = rawPath.trim().split(/[?#]/)[0];
  if (!stripped || !stripped.startsWith('/')) return '';
  if (stripped.includes('@') || stripped.includes('..') || stripped.includes('//')) return '';
  if (!/^\/[A-Za-z0-9/_.-]{0,120}$/.test(stripped)) return '';
  return stripped;
}

function normalizeSiteUrl(siteUrl) {
  const candidate = typeof siteUrl === 'string' && siteUrl.trim() ? siteUrl.trim() : DEFAULT_SITE_URL;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return DEFAULT_SITE_URL;
    return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, '');
  } catch {
    return DEFAULT_SITE_URL;
  }
}

function normalizeOrigin(siteUrl) {
  const candidate = typeof siteUrl === 'string' && siteUrl.trim() ? siteUrl.trim() : DEFAULT_SITE_URL;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return DEFAULT_SITE_URL;
    return parsed.origin;
  } catch {
    return DEFAULT_SITE_URL;
  }
}

function cleanInlineText(value, maxLen = 140) {
  return stripEmDashes(value)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function formatEventDateLabel(rawDate) {
  if (typeof rawDate !== 'string' || !rawDate.trim()) return 'Upcoming';
  const parsedMs = Date.parse(rawDate.trim());
  if (!Number.isFinite(parsedMs)) {
    return cleanInlineText(rawDate, 64) || 'Upcoming';
  }
  try {
    const formatted = new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'UTC',
      timeZoneName: 'short',
    }).format(new Date(parsedMs));
    return cleanInlineText(formatted, 64);
  } catch {
    return new Date(parsedMs).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  }
}

/**
 * Map any organic signup (`unlockKey` and/or `landingPath`) into one of the
 * 6 canonical activation tracks.
 */
export function resolveOrganicActivationTrack({ unlockKey = '', landingPath = '' } = {}) {
  const key = typeof unlockKey === 'string' ? unlockKey.trim().toLowerCase() : '';
  const path = typeof landingPath === 'string' ? landingPath.trim().toLowerCase().split(/[?#]/)[0] : '';
  const combined = `${key} ${path}`;

  if (/\b(?:gto-?leak|leak-?finder|leak|personal-assistant|hand-lab|audit-leaks)\b/.test(combined)) {
    return 'gto-leak-finder';
  }
  if (
    /\b(?:gto-?range|range|ranges|preflop|chart|charts|solver-range|hand-guide)\b/.test(combined) ||
    path.startsWith('/learn/hands') ||
    path.startsWith('/compare/gto')
  ) {
    return 'gto-ranges';
  }
  if (
    /\b(?:odds|calc|calculator|equity|icm-calc|pot-odds|variance|bankroll-calc|outs)\b/.test(combined) ||
    path.startsWith('/tools/')
  ) {
    return 'odds-calculator';
  }
  if (
    /\b(?:series|reminder|schedule|events-calendar|tournament|freeroll|freerolls|wsop|wpt|mspt)\b/.test(combined) ||
    path.startsWith('/hub/series') ||
    path.startsWith('/hub/poker-series')
  ) {
    return 'series-reminder';
  }
  if (
    /\b(?:venue|venues|poker-near-me|poker-rooms|near-me|cardroom|live-room|live-venue)\b/.test(combined) ||
    path.startsWith('/hub/venues') ||
    path.startsWith('/hub/poker-near-me') ||
    path.startsWith('/poker-rooms')
  ) {
    return 'live-venues';
  }
  return 'general-hub';
}

function renderEmailShell({
  cleanSite,
  subject,
  previewText,
  eyebrow,
  heading,
  greetingName,
  intro,
  cardEyebrow,
  cardTitle,
  cardBody,
  primaryCtaLabel,
  primaryCtaUrl,
  secondaryCtaLabel,
  secondaryCtaUrl,
  rewardBannerEyebrow = 'Phone Verification Bonus',
  rewardBannerText,
}) {
  const crestUrl = `${cleanSite}/api/news/email-image?brand=crest`;
  const prefsUrl = `${cleanSite}/hub/email-preferences`;
  const wireUrl = `${cleanSite}/hub/wire`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#05070a;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<div style="display:none;font-size:1px;color:#05070a;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(previewText)}&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#05070a;">
<tr><td align="center" style="padding:28px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#0b1118;border:1px solid #1b2c3d;border-radius:12px;">
<tr><td style="padding:28px 24px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px;"><tr>
<td valign="middle" style="padding-right:10px;"><img src="${escapeHtml(crestUrl)}" alt="Smarter.Poker" width="32" height="32" style="display:block;width:32px;height:32px;border-radius:6px;border:0;" /></td>
<td valign="middle"><div style="color:#00D4FF;font-size:12px;font-weight:800;letter-spacing:2.4px;text-transform:uppercase;">${escapeHtml(eyebrow)}</div></td>
</tr></table>
<h1 style="margin:10px 0 10px 0;color:#ffffff;font-size:23px;line-height:1.25;font-weight:800;">${escapeHtml(heading)}</h1>
<p style="margin:0 0 18px 0;color:#b7cadc;font-size:15px;line-height:1.6;">Hi ${escapeHtml(greetingName)}, ${escapeHtml(intro)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#101a24;border:1px solid #255c56;border-radius:10px;margin-bottom:18px;">
<tr><td style="padding:20px;">
<div style="color:#4fc1b3;font-size:11px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase;">${escapeHtml(cardEyebrow)}</div>
<h2 style="margin:6px 0 8px 0;color:#ffffff;font-size:18px;font-weight:800;line-height:1.3;">${escapeHtml(cardTitle)}</h2>
<p style="margin:0 0 16px 0;color:#d1e3e0;font-size:14px;line-height:1.55;">${escapeHtml(cardBody)}</p>
<a href="${escapeHtml(primaryCtaUrl)}" style="display:inline-block;background:#4fc1b3;color:#041e1b;text-decoration:none;font-weight:800;font-size:14px;padding:12px 20px;border-radius:6px;margin-right:10px;">${escapeHtml(primaryCtaLabel)}</a>
${secondaryCtaUrl ? `<a href="${escapeHtml(secondaryCtaUrl)}" style="display:inline-block;background:#1b2c3d;color:#ffffff;text-decoration:none;font-weight:700;font-size:13.5px;padding:12px 18px;border-radius:6px;margin-top:8px;">${escapeHtml(secondaryCtaLabel)}</a>` : ''}
</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f1824;border:1px solid #1e3246;border-radius:10px;margin-bottom:18px;">
<tr><td style="padding:14px 18px;">
<div style="color:#60a5fa;font-size:11px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;">${escapeHtml(rewardBannerEyebrow)}</div>
<div style="color:#ffffff;font-size:13.5px;font-weight:700;margin-top:4px;line-height:1.5;">${escapeHtml(rewardBannerText)}</div>
</td></tr>
</table>
<div style="border-top:1px solid #1b2c3d;margin-top:20px;padding-top:14px;color:#8fa6bc;font-size:12px;line-height:1.6;">
<div>Smarter.Poker &middot; ${escapeHtml(DEFAULT_POSTAL_ADDRESS)}</div>
<div style="margin-top:6px;">
<a href="${escapeHtml(prefsUrl)}" style="color:#9fb3c8;text-decoration:underline;">Email Preferences</a> &middot;
<a href="${escapeHtml(wireUrl)}" style="color:#9fb3c8;text-decoration:underline;">Weekly Wire Archive</a>
</div>
</div>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const textLines = [
    eyebrow.toUpperCase(),
    '',
    heading,
    '',
    `Hi ${greetingName}, ${intro}`,
    '',
    `${cardTitle}`,
    cardBody,
    `${primaryCtaLabel}: ${primaryCtaUrl}`,
    ...(secondaryCtaUrl ? [`${secondaryCtaLabel}: ${secondaryCtaUrl}`] : []),
    '',
    `${rewardBannerEyebrow}: ${rewardBannerText}`,
    '',
    `Email Preferences: ${prefsUrl}`,
    `Weekly Wire Archive: ${wireUrl}`,
    `Smarter.Poker | ${DEFAULT_POSTAL_ADDRESS}`,
  ];

  return {
    html: stripEmDashes(html),
    text: stripEmDashes(textLines.join('\n')),
  };
}

/**
 * Day-0 immediate activation email tailored to the player's organic signup
 * intent, highlighting their saved spot/reminder and 1-tap path to claim
 * Free 30-Day VIP + 500 Diamonds On Phone Verify at `/hub/verify-phone`.
 */
export function buildOrganicWelcomeEmail({
  track,
  firstName = '',
  landingPath = '',
  siteUrl = DEFAULT_SITE_URL,
} = {}) {
  const cleanSite = normalizeSiteUrl(siteUrl);
  const resolvedTrack = TRACK_SET.has(track)
    ? track
    : resolveOrganicActivationTrack({ landingPath });
  const cfg = TRACK_CONFIG[resolvedTrack];
  const greetingName = sanitizeFirstName(firstName);
  const safeLanding = sanitizeLandingPath(landingPath);
  const nextPath = safeLanding || cfg.defaultNextPath;

  const ctaUrl = `${cleanSite}/hub/verify-phone?next=${encodeURIComponent(nextPath)}&utm_source=organic_drip&utm_medium=email&utm_campaign=day0_${encodeURIComponent(resolvedTrack)}`;
  const returnUrl = `${cleanSite}${nextPath}?utm_source=organic_drip&utm_medium=email&utm_campaign=day0_${encodeURIComponent(resolvedTrack)}_return`;

  const subject = stripEmDashes(cfg.day0Subject);
  const previewText = stripEmDashes(cfg.day0Preview);
  const rewardBannerText = 'Claim Free 30-Day VIP + 500 Diamonds On Phone Verify with one tap.';

  const { html, text } = renderEmailShell({
    cleanSite,
    subject,
    previewText,
    eyebrow: `Smarter.Poker | ${cfg.label}`,
    heading: cfg.day0Heading,
    greetingName,
    intro: cfg.day0Intro,
    cardEyebrow: '1-Tap Account Activation',
    cardTitle: cfg.day0SpotlightTitle,
    cardBody: cfg.day0SpotlightBody,
    primaryCtaLabel: 'Verify Phone: Free 30-Day VIP + 500 Diamonds',
    primaryCtaUrl: ctaUrl,
    secondaryCtaLabel: cfg.day0SecondaryLabel,
    secondaryCtaUrl: returnUrl,
    rewardBannerText,
  });

  return {
    subject,
    previewText,
    html,
    text,
    ctaUrl,
    track: resolvedTrack,
  };
}

/**
 * Day-1 behavioral re-engagement email ("1-Minute Challenge: Beat The Solver
 * On This BTN 3-Bet Spot") tailored by organic activation track.
 */
export function buildDay1ActivationNudgeEmail({
  track,
  firstName = '',
  siteUrl = DEFAULT_SITE_URL,
} = {}) {
  const cleanSite = normalizeSiteUrl(siteUrl);
  const resolvedTrack = TRACK_SET.has(track) ? track : 'general-hub';
  const cfg = TRACK_CONFIG[resolvedTrack];
  const greetingName = sanitizeFirstName(firstName);

  const subject = '1-Minute Challenge: Beat The Solver On This BTN 3-Bet Spot';
  const previewText = stripEmDashes(
    `Take the 60-second BTN 3-Bet solver challenge (${cfg.label}) and claim Free 30-Day VIP + 500 Diamonds On Phone Verify.`,
  );

  const ctaUrl = `${cleanSite}/hub/training/hand-lab?challenge=btn-3bet&track=${encodeURIComponent(resolvedTrack)}&utm_source=organic_drip&utm_medium=email&utm_campaign=day1_${encodeURIComponent(resolvedTrack)}`;
  const verifyUrl = `${cleanSite}/hub/verify-phone?next=${encodeURIComponent('/hub/training/hand-lab?challenge=btn-3bet')}&utm_source=organic_drip&utm_medium=email&utm_campaign=day1_${encodeURIComponent(resolvedTrack)}_vip`;
  const rewardBannerText = 'Still unclaimed: Free 30-Day VIP + 500 Diamonds On Phone Verify.';

  const { html, text } = renderEmailShell({
    cleanSite,
    subject,
    previewText,
    eyebrow: 'Smarter.Poker Daily GTO Challenge',
    heading: '1-Minute Challenge: Beat The Solver On This BTN 3-Bet Spot',
    greetingName,
    intro: cfg.day1Intro,
    cardEyebrow: `Day-1 Solver Rep | ${cfg.label}`,
    cardTitle: 'BTN 3-Bet Pot Decision On K-7-2 Rainbow',
    cardBody: cfg.day1SpotLine,
    primaryCtaLabel: 'Play The 1-Minute Solver Challenge',
    primaryCtaUrl: ctaUrl,
    secondaryCtaLabel: 'Claim Free 30-Day VIP + 500 Diamonds',
    secondaryCtaUrl: verifyUrl,
    rewardBannerText,
  });

  return {
    subject,
    previewText,
    html,
    text,
    ctaUrl,
    track: resolvedTrack,
  };
}

/**
 * Day-3 VIP urgency nudge for unverified organic users reminding them their
 * Free 30-Day VIP + 500 Diamonds On Phone Verify welcome package is waiting
 * and takes 15 seconds to claim, with track-contextualized benefits.
 */
export function buildDay3VipUrgencyEmail({
  track,
  firstName = '',
  siteUrl = DEFAULT_SITE_URL,
} = {}) {
  const origin = normalizeOrigin(siteUrl);
  const resolvedTrack = TRACK_SET.has(track) ? track : 'general-hub';
  const cfg = TRACK_CONFIG[resolvedTrack];
  const greetingName = sanitizeFirstName(firstName);

  const subject = 'Your Free 30-Day VIP + 500 Diamonds Welcome Package Is Waiting';
  const previewText = stripEmDashes(
    `Takes 15 seconds: verify your phone to claim Free 30-Day VIP + 500 Diamonds On Phone Verify (${cfg.label}).`,
  );

  const ctaUrl = `${origin}/hub/verify-phone?welcome=1&src=organic-day3-vip`;
  const secondaryUrl = `${origin}${cfg.defaultNextPath}?src=organic-day3-vip`;
  const rewardBannerText =
    'Takes 15 seconds: claim Free 30-Day VIP + 500 Diamonds On Phone Verify before your welcome package expires.';

  const { html, text } = renderEmailShell({
    cleanSite: origin,
    subject,
    previewText,
    eyebrow: `Smarter.Poker | ${cfg.label}`,
    heading: 'Claim Your Free 30-Day VIP + 500 Diamonds In 15 Seconds',
    greetingName,
    intro:
      'your Free 30-Day VIP + 500 Diamonds welcome package is still waiting in your Smarter.Poker account. Phone verification takes 15 seconds and immediately unlocks your full toolkit.',
    cardEyebrow: `Day-3 VIP Reminder | ${cfg.label}`,
    cardTitle: cfg.day3BenefitTitle,
    cardBody: cfg.day3BenefitBody,
    primaryCtaLabel: 'Claim Free 30-Day VIP + 500 Diamonds (15 Seconds)',
    primaryCtaUrl: ctaUrl,
    secondaryCtaLabel: cfg.day0SecondaryLabel,
    secondaryCtaUrl: secondaryUrl,
    rewardBannerEyebrow: 'Welcome Package Waiting',
    rewardBannerText,
  });

  return {
    track: resolvedTrack,
    subject,
    previewText,
    html,
    text,
    ctaUrl,
  };
}

/**
 * Upcoming tournament reminder email for a saved `sp_saved_spots_v1` entry
 * (`kind === 'series-reminder'`). Safely escapes all untrusted HTML inputs,
 * enforces zero em/en dashes, links back to the saved event path, and includes
 * a secondary Bankroll Manager session-tracking CTA.
 */
export function buildSeriesEventReminderEmail({
  spot = {},
  firstName = '',
  siteUrl = DEFAULT_SITE_URL,
} = {}) {
  const origin = normalizeOrigin(siteUrl);
  const greetingName = sanitizeFirstName(firstName);

  const rawSpot = spot && typeof spot === 'object' ? spot : {};
  const eventLabel =
    cleanInlineText(rawSpot.label || rawSpot.summaryText || rawSpot.eventName || '', 120) ||
    'Saved Tournament Event';
  const seriesName = cleanInlineText(rawSpot.seriesName || '', 100);
  const venue = cleanInlineText(rawSpot.venue || '', 100);
  const eventDateLabel = formatEventDateLabel(rawSpot.eventDate || rawSpot.startDate || '');

  let locationLine = 'Live Tournament Series';
  if (seriesName && venue && seriesName.toLowerCase() !== venue.toLowerCase()) {
    locationLine = `${seriesName} at ${venue}`;
  } else if (venue) {
    locationLine = venue;
  } else if (seriesName) {
    locationLine = seriesName;
  }

  const safePath =
    sanitizeLandingPath(rawSpot.path) ||
    sanitizeLandingPath(rawSpot.url) ||
    '/hub/poker-series';
  const ctaUrl = `${origin}${safePath}`;
  const bankrollUrl = `${origin}/hub/bankroll-manager?src=series-reminder`;

  const subject = stripEmDashes(`Tournament Reminder: ${eventLabel} Starts Soon`).slice(0, 140);
  const previewText = stripEmDashes(
    `${eventLabel} (${eventDateLabel}) - ${locationLine}. View event details and track your buy-in free.`,
  );

  const cardBody = `${eventLabel} is scheduled for ${eventDateLabel} (${locationLine}). Review event structures, late registration, and seating details before cards go in the air, then log your buy-in and results free in Bankroll Manager.`;

  const { html, text } = renderEmailShell({
    cleanSite: origin,
    subject,
    previewText,
    eyebrow: 'Smarter.Poker Tournament Event Reminder',
    heading: 'Your Saved Tournament Event Starts Soon',
    greetingName,
    intro: `here is your reminder for ${eventLabel} (${eventDateLabel}) at ${locationLine}.`,
    cardEyebrow: `Upcoming Event | ${eventDateLabel}`,
    cardTitle: eventLabel,
    cardBody,
    primaryCtaLabel: 'Open Saved Event Schedule',
    primaryCtaUrl: ctaUrl,
    secondaryCtaLabel: 'Log Your Buy-In & Track Your Session Free',
    secondaryCtaUrl: bankrollUrl,
    rewardBannerEyebrow: 'Free Bankroll Session Tracking',
    rewardBannerText:
      'Track your buy-ins, re-entries, cashes, and live tournament ROI free inside Smarter.Poker Bankroll Manager.',
  });

  return {
    subject,
    previewText,
    html,
    text,
    ctaUrl,
    bankrollUrl,
  };
}

function sanitizeSavedSpotCount(rawCount) {
  const n = Number(rawCount);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

/**
 * Day-7 and Day-21 Habit Digest emails tailored by organic activation track.
 * Reports honest saved spot counts only when `savedSpotCount > 0` (never
 * fabricates drills, hands, or streaks), escapes all untrusted inputs,
 * enforces zero em/en dashes, Title Case headings, zero banned gold, and zero PII.
 */
export function buildHabitDigestEmail({
  phase = 'day7',
  track,
  firstName = '',
  savedSpotCount = 0,
  siteUrl = DEFAULT_SITE_URL,
} = {}) {
  const origin = normalizeOrigin(siteUrl);
  const resolvedPhase = phase === 'day21' ? 'day21' : 'day7';
  const resolvedTrack = TRACK_SET.has(track) ? track : 'general-hub';
  const cfg = TRACK_CONFIG[resolvedTrack];
  const greetingName = sanitizeFirstName(firstName);
  const safeSavedCount = sanitizeSavedSpotCount(savedSpotCount);
  const savedSpotNoun = safeSavedCount === 1 ? 'saved spot' : 'saved spots';
  const savedSummaryLine =
    safeSavedCount > 0
      ? `You currently have ${safeSavedCount} ${savedSpotNoun} synced in your Smarter.Poker workspace.`
      : 'Your Smarter.Poker study tools and bookmarks stay synced across desktop and mobile whenever you save a spot.';

  const isDay21 = resolvedPhase === 'day21';
  const subject = isDay21
    ? 'Your 21-Day Poker Study Check-In & Upcoming Local Games'
    : 'Your 7-Day Smarter.Poker Study Progress & Next GTO Challenge';

  const previewText = stripEmDashes(
    isDay21
      ? `21-day check-in for ${cfg.label}. ${savedSummaryLine}`
      : `7-day study check-in for ${cfg.label}. ${savedSummaryLine}`,
  );

  const primaryPath =
    resolvedTrack === 'general-hub' && !isDay21
      ? '/hub/training/hand-lab'
      : cfg.defaultNextPath;
  const ctaUrl = `${origin}${primaryPath}?src=habit-${resolvedPhase}&track=${encodeURIComponent(resolvedTrack)}`;
  const secondaryCtaUrl = isDay21
    ? `${origin}/hub/poker-near-me/lobby?src=habit-day21`
    : `${origin}/hub/training/hand-lab?src=habit-day7`;
  const secondaryCtaLabel = isDay21
    ? 'Browse Upcoming Local Games'
    : 'Open GTO Hand Lab';

  const heading = isDay21
    ? 'Your 21-Day Study Check-In & Upcoming Local Games'
    : 'Your 7-Day Study Progress & Next GTO Challenge';
  const intro = isDay21
    ? `it has been three weeks since you joined Smarter.Poker. ${savedSummaryLine}`
    : `you are one week into Smarter.Poker. ${savedSummaryLine}`;

  const cardEyebrow = isDay21
    ? `21-Day Habit Digest | ${cfg.label}`
    : `7-Day Habit Digest | ${cfg.label}`;
  const cardTitle = isDay21 ? cfg.day21Title : cfg.day7Title;
  const cardBody = isDay21 ? cfg.day21Body : cfg.day7Body;
  const primaryCtaLabel = isDay21 ? cfg.day21CtaLabel : cfg.day7CtaLabel;
  const rewardBannerEyebrow = isDay21
    ? 'Upcoming Local Games & Series'
    : 'Weekly Study Momentum';
  const rewardBannerText = isDay21
    ? 'Find daily poker room schedules, regional tournament series, and free bankroll tracking inside Smarter.Poker.'
    : 'Keep your edge sharp with GTO Hand Lab, Preflop Charts, 42+ Free Calculators, and live poker schedules.';

  const { html, text } = renderEmailShell({
    cleanSite: origin,
    subject,
    previewText,
    eyebrow: `Smarter.Poker | ${cfg.label}`,
    heading,
    greetingName,
    intro,
    cardEyebrow,
    cardTitle,
    cardBody,
    primaryCtaLabel,
    primaryCtaUrl: ctaUrl,
    secondaryCtaLabel,
    secondaryCtaUrl,
    rewardBannerEyebrow,
    rewardBannerText,
  });

  return {
    phase: resolvedPhase,
    track: resolvedTrack,
    subject,
    previewText,
    html,
    text,
    ctaUrl,
  };
}

/**
 * Day-25 VIP Trial Graduation email for phone-verified organic users whose
 * Free 30-Day VIP welcome window is wrapping up. Links cleanly to
 * `${origin}/hub/vip?src=vip-trial-day25` with honest saved spot count only
 * when `savedSpotCount > 0`, zero fabricated stats, zero em/en dashes,
 * Title Case headings, zero banned gold, and zero PII.
 */
export function buildVipTrialGraduationEmail({
  firstName = '',
  savedSpotCount = 0,
  siteUrl = DEFAULT_SITE_URL,
} = {}) {
  const origin = normalizeOrigin(siteUrl);
  const greetingName = sanitizeFirstName(firstName);
  const safeSavedCount = sanitizeSavedSpotCount(savedSpotCount);
  const savedSpotNoun = safeSavedCount === 1 ? 'saved spot' : 'saved spots';

  const subject = 'Your 30-Day Free VIP Access Wraps Up Soon - Keep Unlimited GTO & Live Tools';
  const previewText = stripEmDashes(
    safeSavedCount > 0
      ? `Your 30-day free VIP access wraps up soon. Keep your ${safeSavedCount} ${savedSpotNoun} and unlimited GTO and live tools.`
      : 'Your 30-day free VIP access wraps up soon - keep unlimited GTO training, solver tools, and live poker features.',
  );

  const ctaUrl = `${origin}/hub/vip?src=vip-trial-day25`;
  const secondaryCtaUrl = `${origin}/hub?src=vip-trial-day25`;

  const intro =
    safeSavedCount > 0
      ? `your 30-day free VIP welcome window wraps up in a few days. You currently have ${safeSavedCount} ${savedSpotNoun} synced to your account ready for continued study.`
      : 'your 30-day free VIP welcome window wraps up in a few days. Lock in uninterrupted access to every GTO solver drill, calculator, and live poker tool inside Smarter.Poker.';

  const cardBody =
    'Continue with unlimited GTO Hand Lab challenges, full Preflop Range Charts, Personal Assistant leak reviews, Bankroll Manager tracking, and synced live tournament series alerts without losing momentum.';

  const { html, text } = renderEmailShell({
    cleanSite: origin,
    subject,
    previewText,
    eyebrow: 'Smarter.Poker VIP Membership',
    heading: 'Your 30-Day Free VIP Access Wraps Up Soon',
    greetingName,
    intro,
    cardEyebrow: 'Day-25 VIP Access Check-In',
    cardTitle: 'Keep Unlimited GTO Training & Live Poker Tools',
    cardBody,
    primaryCtaLabel: 'Keep Unlimited VIP Access',
    primaryCtaUrl: ctaUrl,
    secondaryCtaLabel: 'Open Smarter.Poker Hub',
    secondaryCtaUrl,
    rewardBannerEyebrow: 'Included With Smarter.Poker VIP',
    rewardBannerText:
      'Unlimited GTO Hand Lab reps, full 100bb cash and MTT solver ranges, Personal Assistant leak audits, and live poker room alerts.',
  });

  return {
    subject,
    previewText,
    html,
    text,
    ctaUrl,
  };
}
