// Dealer Vault and Annual Tax Summary arithmetic, kept pure so it can be tested.
import { irsMileageRate, isDealingDown } from './tokeReport.mjs';
import { gigDowns } from './tokeVenueStats.mjs';
import { localDay, parseLedgerDay } from './localDates.mjs';

const num = (value) => {
  const n = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(n) ? n : 0;
};
const cents = (value) => Math.round(num(value) * 100) / 100;

/**
 * The Form 1099-NEC reporting threshold for payments made in a calendar year.
 *
 * $600 through 2025. The One Big Beautiful Bill Act (Pub. L. 119-21, section
 * 70433) raised it to $2,000 for payments made after December 31, 2025, indexed
 * for inflation from 2027. The vault and the tax summary both said $600 for
 * 2026, which told a dealer with $900 from one room to expect a form that room
 * is no longer required to send. Later years keep the $2,000 floor until the
 * IRS publishes an indexed figure.
 */
export function form1099NecThreshold(year) {
  return Number(year) >= 2026 ? 2000 : 600;
}

/** The calendar year a gig belongs to (its start date), or null. */
export function gigYear(gig) {
  const match = /^(\d{4})-\d{2}-\d{2}/.exec(String(gig?.start_date || ''));
  return match ? Number(match[1]) : null;
}

/** Tokes of one gig: dealing downs only, as every other Toke Tracker figure. */
export function gigTokes(gig) {
  if (gig?.totalTokes !== undefined && gig?.totalTokes !== null) return cents(gig.totalTokes);
  return cents(gigDowns(gig).filter(isDealingDown).reduce((sum, d) => sum + num(d.toke_amount), 0));
}

export function gigExpenseRows(gig) {
  if (Array.isArray(gig?.expenses)) return gig.expenses;
  return (gig?.days || []).flatMap((day) => day.expenses || []);
}

export function gigExpenses(gig) {
  if (gig?.totalExpenses !== undefined && gig?.totalExpenses !== null) return cents(gig.totalExpenses);
  return cents(gigExpenseRows(gig).reduce((sum, e) => sum + num(e.amount), 0));
}

const venueName = (gig) => String(gig?.venue_name ?? '').replace(/\s+/g, ' ').trim() || 'Unknown Venue';

/** Venues that reached the 1099-NEC threshold in `year`. */
export function venue1099Alerts(gigs = [], year = new Date().getFullYear()) {
  const threshold = form1099NecThreshold(year);
  const map = new Map();
  for (const gig of gigs) {
    if (gigYear(gig) !== year) continue;
    const venue = venueName(gig);
    const key = venue.toLowerCase();
    const row = map.get(key) || { venue, total: 0 };
    row.total = cents(row.total + gigTokes(gig));
    map.set(key, row);
  }
  return [...map.values()]
    .filter((row) => row.total >= threshold)
    .sort((a, b) => b.total - a.total)
    .map((row) => ({ ...row, threshold }));
}

/**
 * Years the summary can show: every year with a completed event, plus the
 * current year so the selector is never empty for a new dealer.
 */
export function taxYearOptions(gigs = [], currentYear = new Date().getFullYear()) {
  const years = new Set([currentYear]);
  for (const gig of gigs) {
    const y = gigYear(gig);
    if (y) years.add(y);
  }
  return [...years].sort((a, b) => b - a);
}

/** The year shown before the dealer picks one: the latest with events. */
export function defaultTaxYear(gigs = [], currentYear = new Date().getFullYear()) {
  let latest = null;
  for (const gig of gigs) {
    const y = gigYear(gig);
    if (y && (latest === null || y > latest)) latest = y;
  }
  return latest ?? currentYear;
}

/**
 * One tax year's summary.
 *
 * Mileage is valued at the IRS rate in force on each event's own date
 * (irsMileageRate), not one rate for the year: the table this replaced had
 * 2026 at 67 cents, which is the 2024 rate, and 2026 changed mid-year.
 */
export function taxYearSummary(gigs = [], year) {
  const threshold = form1099NecThreshold(year);
  const yearGigs = gigs.filter((gig) => gigYear(gig) === year);
  const venues = new Map();
  const expenseMap = new Map();
  const rates = new Set();
  let totalMiles = 0;
  let mileageDeduction = 0;
  for (const gig of yearGigs) {
    const venue = venueName(gig);
    const key = venue.toLowerCase();
    const row = venues.get(key) || { venue, tokes: 0, expenses: 0, miles: 0, events: 0 };
    const miles = Math.max(0, num(gig.mileage));
    const rate = irsMileageRate(gig.start_date);
    row.tokes = cents(row.tokes + gigTokes(gig));
    row.expenses = cents(row.expenses + gigExpenses(gig));
    row.miles += miles;
    row.events += 1;
    venues.set(key, row);
    if (miles > 0) rates.add(rate);
    totalMiles += miles;
    mileageDeduction += miles * rate;
    for (const e of gigExpenseRows(gig)) {
      const cat = e.category || 'other';
      expenseMap.set(cat, cents((expenseMap.get(cat) || 0) + num(e.amount)));
    }
  }
  const venueRows = [...venues.values()]
    .map((row) => ({ ...row, meets1099: row.tokes >= threshold }))
    .sort((a, b) => b.tokes - a.tokes);
  const totalTokes = cents(venueRows.reduce((s, v) => s + v.tokes, 0));
  const totalExpenses = cents(venueRows.reduce((s, v) => s + v.expenses, 0));
  mileageDeduction = cents(mileageDeduction);
  const totalDeductions = cents(totalExpenses + mileageDeduction);
  return {
    year,
    threshold,
    events: yearGigs.length,
    venues: venueRows,
    expenses: [...expenseMap.entries()].map(([cat, amt]) => ({ cat, amt })).sort((a, b) => b.amt - a.amt),
    totalTokes,
    totalExpenses,
    totalMiles: Math.round(totalMiles * 10) / 10,
    mileageRates: [...rates].sort((a, b) => a - b),
    mileageDeduction,
    totalDeductions,
    netTaxable: cents(Math.max(0, totalTokes - totalDeductions)),
  };
}

/** "$0.725" or "$0.725-$0.76" for the mileage line. */
export function formatMileageRates(rates = []) {
  if (!rates.length) return '';
  const text = (r) => '$' + String(Number(r.toFixed(3)));
  return rates.length === 1 ? text(rates[0]) : text(rates[0]) + '-' + text(rates[rates.length - 1]);
}

// ── Vault files ──────────────────────────────────────────────────

export const VAULT_MAX_BYTES = 20 * 1024 * 1024;

const BY_EXTENSION = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  pdf: 'application/pdf',
};
const ACCEPTED = new Set(Object.values(BY_EXTENSION));

/**
 * The MIME type the vault will store a chosen file as, or null when it is not
 * a photo or PDF. Some pickers (Files on iOS, a few Android galleries) hand
 * over a file whose `type` is empty; it was refused as "Only JPG, PNG..." even
 * when it was a .jpg. The extension decides then.
 */
export function vaultFileType(file) {
  const type = String(file?.type || '').toLowerCase();
  if (type === 'image/jpg') return 'image/jpeg';
  if (ACCEPTED.has(type)) return type;
  if (type) return null;
  const ext = String(file?.name || '').toLowerCase().split('.').pop();
  return BY_EXTENSION[ext] || null;
}

/**
 * Whether the cropper and the on-device reader can open this type. A browser
 * that cannot decode HEIC (Chrome, Firefox) gave the cropper a picture it
 * could not draw, and the dealer was left on a blank crop screen with nothing
 * saved. HEIC goes straight to the details form instead.
 */
export function vaultCanPreview(type) {
  return type === 'image/jpeg' || type === 'image/png' || type === 'image/webp';
}

// ── Gaming license expiry ────────────────────────────────────────

/**
 * Whole calendar days from today to a license's expiry date, in the dealer's
 * own time zone. The badge used to divide milliseconds between "now" and noon
 * on the expiry day and floor it, so a license expiring tomorrow read
 * "Expires in 0d" every afternoon, and one expiring today read "Expired" from
 * 12:01 PM although it is valid through the end of the day.
 */
export function licenseExpiry(expiryDate, today = localDay()) {
  if (!expiryDate) return { state: 'none', days: null, label: 'No Expiry' };
  const exp = parseLedgerDay(String(expiryDate).slice(0, 10));
  const now = parseLedgerDay(today);
  if (!Number.isFinite(exp.getTime()) || !Number.isFinite(now.getTime())) {
    return { state: 'none', days: null, label: 'No Expiry' };
  }
  const days = Math.round((exp - now) / 86400000);
  if (days < 0) return { state: 'expired', days, label: 'Expired' };
  if (days <= 30) {
    const label = days === 0 ? 'Expires Today' : days === 1 ? 'Expires Tomorrow' : 'Expires In ' + days + ' Days';
    return { state: 'soon', days, label };
  }
  return { state: 'active', days, label: 'Active' };
}
