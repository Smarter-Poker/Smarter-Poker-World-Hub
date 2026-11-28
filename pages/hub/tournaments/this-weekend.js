/**
 * TOURNAMENTS THIS WEEKEND - Intent-Based Programmatic Landing Page
 * Aggregates all poker tournaments running Friday, Saturday, and Sunday.
 * Optimized for high-volume search queries: "poker tournaments this weekend",
 * "weekend poker tournaments near me", "poker tournaments today and this weekend".
 */

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  Bell as BellLuc,
  Calendar as CalendarLuc,
  ChevronRight as ChevRight,
  Clock as ClockLuc,
  MapPin as MapPinLuc,
  Trophy as TrophyLuc,
  DollarSign as DollarLuc,
} from 'lucide-react';
import useSWR from 'swr';
import SEOHead, { normalizeJsonLdGraph } from '../../../src/components/seo/SEOHead';
import UniversalHeader from '../../../src/components/ui/UniversalHeader';
import PokerNearMeFamilyNav from '../../../src/components/poker-near-me/PokerNearMeFamilyNav';
import HamburgerMenu from '../../../src/components/ui/HamburgerMenu';
import { getMenuConfig } from '../../../src/config/hamburgerMenus';
import PokerIdentityMark from '../../../src/components/poker-near-me/PokerIdentityMark';
import { homeGameUrl } from '../../../src/lib/home-games/urls';
import { buildDailyTournamentSchema, serializePokerJsonLd } from '../../../src/lib/poker-near-me/structuredData';
import { getWeekendDates } from '../../../src/lib/poker-near-me/weekendSchedule.mjs';
import { datasetSchema, faqSchema, breadcrumbSchema } from '../../../src/lib/seo/hubPageSchema';
import FaqSection from '../../../src/components/seo/FaqSection';
import SmarterAccountUnlockGate from '../../../src/components/seo/SmarterAccountUnlockGate';
import { openQuickSignup } from '../../../src/components/seo/SmarterQuickSignupSheet';
import { trackSeoFunnelEvent } from '../../../src/lib/seo/seoFunnelTelemetry';
import { VENUE_COUNT_LABEL } from '../../../src/lib/venueCount.mjs';

const WEEKEND_TOURNAMENTS_FAQS = [
  {
    question: 'How Do I Find Poker Tournaments Running This Weekend Near Me?',
    answer: `Smarter.Poker Aggregates All Recurring And Special Friday, Saturday, And Sunday Live Poker Tournaments Across ${VENUE_COUNT_LABEL} Casino Poker Rooms And Licensed Cardrooms. Filter By Day (Friday, Saturday, Sunday), State, Or Buy-In Range To Compare Start Times And Guaranteed Prize Pools.`,
  },
  {
    question: 'Which Weekend Day Has The Largest Guaranteed Poker Tournaments?',
    answer: 'Saturday Afternoon And Sunday Morning Sessions Feature The Largest Guaranteed Prize Pools (GTD) And Deepest Starting Stacks At Most North American Cardrooms, While Friday Nights Feature Turbo And Bounty Warm-Up Events.',
  },
  {
    question: 'Does Smarter.Poker Host Free Online Weekend Poker Tournaments?',
    answer: 'Yes. Smarter.Poker Runs Five Free Online Poker Tournaments Every Day Of The Weekend With Zero Entry Fees At Smarter.Poker/Freerolls. Funded Diamond Games Are Not Open For Play Yet.',
  },
];

const POPULAR_STATES = [
  { name: 'Texas', abbr: 'TX' },
  { name: 'California', abbr: 'CA' },
  { name: 'Florida', abbr: 'FL' },
  { name: 'Nevada', abbr: 'NV' },
];

const BUYIN_RANGES = [
  { label: 'All Buy-Ins', min: null, max: null },
  { label: 'Under $100', min: null, max: 100 },
  { label: '$100 - $300', min: 100, max: 300 },
  { label: '$300 - $500', min: 300, max: 500 },
  { label: '$500+', min: 500, max: null },
];

function formatTime(timeStr) {
  if (!timeStr) return '';
  const clean = timeStr.trim().replace(/^(\d{1,2}:\d{2}):\d{2}\s*(AM|PM)?/i, (_, hm, ap) => ap ? `${hm}${ap}` : hm);
  if (!clean.match(/[AP]M/i)) {
    const parts = clean.split(':');
    if (parts.length >= 2) {
      let h = parseInt(parts[0], 10);
      const m = parts[1].replace(/\D/g, '').slice(0, 2).padStart(2, '0');
      if (!isNaN(h)) {
        const ampm = h >= 12 ? 'PM' : 'AM';
        if (h === 0) h = 12;
        else if (h > 12) h -= 12;
        return `${h}:${m} ${ampm}`;
      }
    }
    const noColon = clean.match(/^(\d{1,2})([AP]M)$/i);
    if (noColon) {
      return `${parseInt(noColon[1], 10)}:00 ${noColon[2].toUpperCase()}`;
    }
    return clean;
  }
  const noColonAMPM = clean.match(/^(\d{1,2})\s*([AP]M)$/i);
  if (noColonAMPM) {
    return `${parseInt(noColonAMPM[1], 10)}:00 ${noColonAMPM[2].toUpperCase()}`;
  }
  return clean
    .replace(/(\d)(([AP]M))$/i, (_, d, ampm) => `${d} ${ampm.toUpperCase()}`)
    .replace(/\s{2,}/g, ' ')
    .replace(/([ap]m)/i, s => s.toUpperCase())
    .replace(/^0(\d)/, '$1');
}

function formatMoney(amount) {
  if (!amount && amount !== 0) return '';
  return `$${amount.toLocaleString()}`;
}

const SITE_ORIGIN = 'https://smarter.poker';
const WEEKEND_CANONICAL_PATH = '/hub/tournaments/this-weekend';
const MAX_WEEKEND_EVENT_SCHEMA_NODES = 25;
const PLACEHOLDER_DATE_RE = /^(1970-01-01|0000-00-00|1900-01-01|2000-01-01|tbd|n\/?a|placeholder|unknown|null|undefined)$/i;
const PLACEHOLDER_VENUE_RE = /^(live poker room|tbd|n\/?a|unknown|placeholder|test venue|null|undefined)$/i;

function isValidNonPlaceholderDate(rawDate) {
  const clean = String(rawDate || '').trim().slice(0, 10);
  if (!clean || PLACEHOLDER_DATE_RE.test(clean)) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return false;
  const [y, m, d] = clean.split('-').map((n) => parseInt(n, 10));
  if (y < 2024 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const check = new Date(Date.UTC(y, m - 1, d));
  return (
    check.getUTCFullYear() === y &&
    check.getUTCMonth() + 1 === m &&
    check.getUTCDate() === d
  );
}

function buildIsoEventStartDate(tournament) {
  const rawDate = tournament?.event_date || tournament?.weekendDate || tournament?.start_date || '';
  if (!isValidNonPlaceholderDate(rawDate)) return null;
  const dateStr = String(rawDate).trim().slice(0, 10);
  const timeRaw = String(tournament?.start_time || '').trim();
  const hmMatch = /^(\d{1,2}):([0-5]\d)(?::[0-5]\d)?\s*([AP]M)?$/i.exec(timeRaw);
  if (hmMatch) {
    let hour = parseInt(hmMatch[1], 10);
    const minute = hmMatch[2];
    const period = (hmMatch[3] || '').toUpperCase();
    if (period === 'PM' && hour !== 12) hour += 12;
    if (period === 'AM' && hour === 12) hour = 0;
    if (hour >= 0 && hour <= 23) {
      return `${dateStr}T${String(hour).padStart(2, '0')}:${minute}:00`;
    }
  }
  const bareMatch = /^(\d{1,2})\s*([AP]M)$/i.exec(timeRaw);
  if (bareMatch) {
    let hour = parseInt(bareMatch[1], 10);
    const period = bareMatch[2].toUpperCase();
    if (period === 'PM' && hour !== 12) hour += 12;
    if (period === 'AM' && hour === 12) hour = 0;
    if (hour >= 0 && hour <= 23) {
      return `${dateStr}T${String(hour).padStart(2, '0')}:00:00`;
    }
  }
  return `${dateStr}T12:00:00`;
}

function resolveAbsoluteEventUrl(tournament, canonical = `${SITE_ORIGIN}${WEEKEND_CANONICAL_PATH}`) {
  const isHomeGame = Boolean(tournament?.is_home_game);
  if (isHomeGame) {
    const rel = homeGameUrl(tournament);
    if (rel && rel.startsWith('/')) return `${SITE_ORIGIN}${rel}`;
  }
  const numericVenueId = Number(tournament?.venue_id);
  if (Number.isFinite(numericVenueId) && numericVenueId > 0) {
    return `${SITE_ORIGIN}/hub/venues/${encodeURIComponent(String(numericVenueId))}`;
  }
  return canonical;
}

/**
 * Pure Schema.org Event node builder for upcoming tournaments.
 * Caps output at 25 events and skips rows with missing or placeholder dates/venues.
 */
export function buildWeekendEventSchemaNodes(
  tournaments = [],
  { maxItems = MAX_WEEKEND_EVENT_SCHEMA_NODES, canonical = `${SITE_ORIGIN}${WEEKEND_CANONICAL_PATH}` } = {}
) {
  if (!Array.isArray(tournaments) || tournaments.length === 0) return [];
  const cap = Math.min(MAX_WEEKEND_EVENT_SCHEMA_NODES, Math.max(1, Number(maxItems) || MAX_WEEKEND_EVENT_SCHEMA_NODES));
  const nodes = [];

  for (const t of tournaments) {
    if (nodes.length >= cap) break;
    if (!t || typeof t !== 'object') continue;
    const startDate = buildIsoEventStartDate(t);
    if (!startDate) continue;
    const venueName = String(t.venue_name || '').trim();
    if (!venueName || PLACEHOLDER_VENUE_RE.test(venueName)) continue;

    const eventName = String(t.tournament_name || '').trim() || `${venueName} Poker Tournament`;
    const eventUrl = resolveAbsoluteEventUrl(t, canonical);
    const city = String(t.city || '').trim();
    const state = String(t.state || '').trim();
    const numericBuyIn = Number(t.buy_in);
    const offerPrice = Number.isFinite(numericBuyIn) && numericBuyIn >= 0 ? numericBuyIn : 0;

    nodes.push({
      '@type': 'Event',
      '@id': `${canonical}#event-${nodes.length + 1}`,
      name: eventName,
      startDate,
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      eventStatus: 'https://schema.org/EventScheduled',
      url: eventUrl,
      location: {
        '@type': 'Place',
        name: venueName,
        ...(city || state
          ? {
              address: {
                '@type': 'PostalAddress',
                ...(city ? { addressLocality: city } : {}),
                ...(state ? { addressRegion: state } : {}),
                addressCountry: 'US',
              },
            }
          : {}),
      },
      offers: {
        '@type': 'Offer',
        price: offerPrice,
        priceCurrency: 'USD',
        availability: 'https://schema.org/InStock',
        url: eventUrl,
      },
    });
  }

  return nodes;
}

/**
 * Pure quick-filter for Tonight / This Weekend / All Upcoming modes.
 */
export function filterTonightWeekendTournaments(
  tournaments = [],
  { mode = 'weekend', todayIso = '', todayDayName = '', weekendDates = [] } = {}
) {
  if (!Array.isArray(tournaments) || tournaments.length === 0) return [];
  const normMode = String(mode || 'weekend').toLowerCase();
  const normTodayIso = String(todayIso || '').trim().slice(0, 10);
  const normTodayDay = String(todayDayName || '').trim().toLowerCase();
  const weekendDateSet = new Set(
    Array.isArray(weekendDates) ? weekendDates.map((d) => String(d || '').trim().slice(0, 10)).filter(Boolean) : []
  );
  const weekendDaySet = new Set(['friday', 'saturday', 'sunday']);

  if (normMode === 'all') {
    return tournaments;
  }

  if (normMode === 'tonight') {
    return tournaments.filter((t) => {
      if (!t || typeof t !== 'object') return false;
      const rowDate = String(t.event_date || t.weekendDate || '').trim().slice(0, 10);
      const rowDay = String(t.weekendDay || t.day_of_week || '').trim().toLowerCase();
      if (normTodayIso && rowDate) {
        return rowDate === normTodayIso;
      }
      if (normTodayDay && rowDay) {
        return rowDay === normTodayDay;
      }
      return false;
    });
  }

  // Default: 'weekend'
  return tournaments.filter((t) => {
    if (!t || typeof t !== 'object') return false;
    const rowDate = String(t.event_date || t.weekendDate || '').trim().slice(0, 10);
    const rowDay = String(t.weekendDay || t.day_of_week || '').trim().toLowerCase();
    if (weekendDateSet.size > 0 && rowDate && weekendDateSet.has(rowDate)) return true;
    if (rowDay && weekendDaySet.has(rowDay)) return true;
    return false;
  });
}

/**
 * Pure Phase-D-compatible reminder spot builder for sp_saved_spots_v1.
 */
export function buildWeekendReminderSpot(tournament, { savedAt = '' } = {}) {
  const t = tournament && typeof tournament === 'object' ? tournament : {};
  const label = String(t.tournament_name || 'Weekend Poker Tournament').trim().slice(0, 140) || 'Weekend Poker Tournament';
  const venue = String(t.venue_name || '').trim().slice(0, 140);
  const seriesName = String(
    t.series_name || (venue ? `${venue} Weekend Schedule` : 'Weekend Poker Tournaments')
  )
    .trim()
    .slice(0, 140);
  const isoStart = buildIsoEventStartDate(t) || '';
  const slugify = (val, fallback) =>
    String(val || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 28) || fallback;
  const venueSlug = slugify(t.venue_id || venue, 'venue');
  const eventSlug = slugify(t.id || label, 'event');
  const dateSlug = slugify(isoStart.slice(0, 10) || t.weekendDay, 'date');
  const buyInLabel =
    typeof t.buy_in === 'number' && t.buy_in > 0
      ? formatMoney(t.buy_in)
      : t.buy_in === 0
        ? 'Free'
        : 'TBD';
  const timeLabel = formatTime(t.start_time) || t.weekendDay || 'Upcoming';

  return {
    id: `weekend-reminder-${venueSlug}-${eventSlug}-${dateSlug}`.slice(0, 80),
    kind: 'series-reminder',
    label,
    eventDate: isoStart.slice(0, 40),
    startDate: isoStart.slice(0, 40),
    seriesName,
    venue,
    path: WEEKEND_CANONICAL_PATH,
    toolSlug: 'weekend-event-reminder',
    toolName: 'Weekend Tournament Reminder',
    summaryText: `${label} (${buyInLabel} - ${timeLabel})${venue ? ` At ${venue}` : ''}`.slice(0, 320),
    url: WEEKEND_CANONICAL_PATH,
    savedAt: String(savedAt || '').slice(0, 40),
  };
}

function getEasternTodayIso(referenceTime = new Date()) {
  const dateObj = referenceTime instanceof Date ? referenceTime : new Date(referenceTime);
  const localStr = dateObj.toLocaleString('en-US', { timeZone: 'America/New_York' });
  const d = new Date(localStr);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function getServerSideProps() {
  const now = new Date();
  return {
    props: {
      initialWeekendInfo: getWeekendDates(now),
      initialTodayIso: getEasternTodayIso(now),
    },
  };
}

export default function TournamentsThisWeekendPage({
  initialTournaments = [],
  initialWeekendInfo = null,
  initialTodayIso = '',
}) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuConfig = useMemo(() => getMenuConfig('hub'), []);

  // Filter state
  const [quickFilter, setQuickFilter] = useState('weekend'); // 'tonight' | 'weekend' | 'all'
  const [selectedDayTab, setSelectedDayTab] = useState('ALL'); // 'ALL' | 'Friday' | 'Saturday' | 'Sunday'
  const [selectedState, setSelectedState] = useState('');
  const [selectedBuyin, setSelectedBuyin] = useState(BUYIN_RANGES[0]);
  const [searchQuery, setSearchQuery] = useState('');
  const [remindedIds, setRemindedIds] = useState({});

  const weekendInfo = useMemo(() => initialWeekendInfo || getWeekendDates(), [initialWeekendInfo]);
  const todayDayName = weekendInfo?.referenceDay || 'Friday';
  const todayIso = useMemo(() => {
    if (initialTodayIso) return initialTodayIso;
    if (todayDayName === 'Friday') return weekendInfo.friday;
    if (todayDayName === 'Saturday') return weekendInfo.saturday;
    if (todayDayName === 'Sunday') return weekendInfo.sunday;
    return weekendInfo.friday;
  }, [initialTodayIso, todayDayName, weekendInfo]);

  useEffect(() => {
    const qFilter = String(router?.query?.filter || '').toLowerCase();
    if (qFilter === 'tonight' || qFilter === 'weekend' || qFilter === 'all') {
      setQuickFilter(qFilter);
    }
  }, [router?.query?.filter]);

  // Multi-day SWR fetch for Friday, Saturday, Sunday (+ today when weekday)
  const fetcher = (url) => fetch(url).then((r) => r.json());
  const needsSeparateTodayFetch = !['Friday', 'Saturday', 'Sunday'].includes(todayDayName);
  const { data: todayData, isLoading: todayLoading } = useSWR(
    needsSeparateTodayFetch ? `/api/poker/daily-tournaments?day=${encodeURIComponent(todayDayName)}` : null,
    fetcher
  );
  const { data: friData, isLoading: friLoading } = useSWR('/api/poker/daily-tournaments?day=Friday', fetcher);
  const { data: satData, isLoading: satLoading } = useSWR('/api/poker/daily-tournaments?day=Saturday', fetcher);
  const { data: sunData, isLoading: sunLoading } = useSWR('/api/poker/daily-tournaments?day=Sunday', fetcher);

  const isLoading =
    (friLoading || satLoading || sunLoading || (needsSeparateTodayFetch && todayLoading)) &&
    initialTournaments.length === 0;

  // Aggregate tournaments across today + the full weekend
  const allWeekendTournaments = useMemo(() => {
    const list = [];
    if (needsSeparateTodayFetch && todayData?.tournaments) {
      todayData.tournaments.forEach((t) =>
        list.push({
          ...t,
          weekendDay: todayDayName,
          weekendDate: todayIso,
          event_date: t.event_date || todayIso,
        })
      );
    }
    if (friData?.tournaments) {
      friData.tournaments.forEach((t) =>
        list.push({
          ...t,
          weekendDay: 'Friday',
          weekendDate: weekendInfo.friday,
          event_date: t.event_date || weekendInfo.friday,
        })
      );
    }
    if (satData?.tournaments) {
      satData.tournaments.forEach((t) =>
        list.push({
          ...t,
          weekendDay: 'Saturday',
          weekendDate: weekendInfo.saturday,
          event_date: t.event_date || weekendInfo.saturday,
        })
      );
    }
    if (sunData?.tournaments) {
      sunData.tournaments.forEach((t) =>
        list.push({
          ...t,
          weekendDay: 'Sunday',
          weekendDate: weekendInfo.sunday,
          event_date: t.event_date || weekendInfo.sunday,
        })
      );
    }
    if (list.length === 0 && initialTournaments && initialTournaments.length > 0) {
      return initialTournaments;
    }
    return list;
  }, [needsSeparateTodayFetch, todayData, todayDayName, todayIso, friData, satData, sunData, weekendInfo, initialTournaments]);

  const tonightCount = useMemo(
    () =>
      filterTonightWeekendTournaments(allWeekendTournaments, {
        mode: 'tonight',
        todayIso,
        todayDayName,
        weekendDates: weekendInfo.dates,
      }).length,
    [allWeekendTournaments, todayIso, todayDayName, weekendInfo]
  );

  const weekendOnlyCount = useMemo(
    () =>
      filterTonightWeekendTournaments(allWeekendTournaments, {
        mode: 'weekend',
        todayIso,
        todayDayName,
        weekendDates: weekendInfo.dates,
      }).length,
    [allWeekendTournaments, todayIso, todayDayName, weekendInfo]
  );

  // Filtered view
  const filteredTournaments = useMemo(() => {
    const quickMatched = filterTonightWeekendTournaments(allWeekendTournaments, {
      mode: quickFilter,
      todayIso,
      todayDayName,
      weekendDates: weekendInfo.dates,
    });
    return quickMatched.filter((t) => {
      if (quickFilter !== 'tonight' && selectedDayTab !== 'ALL' && t.weekendDay !== selectedDayTab) return false;
      if (selectedState && t.state !== selectedState) return false;
      if (selectedBuyin.min !== null && (t.buy_in || 0) < selectedBuyin.min) return false;
      if (selectedBuyin.max !== null && (t.buy_in || 0) > selectedBuyin.max) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const vName = (t.venue_name || '').toLowerCase();
        const tName = (t.tournament_name || '').toLowerCase();
        const city = (t.city || '').toLowerCase();
        if (!vName.includes(q) && !tName.includes(q) && !city.includes(q)) return false;
      }
      return true;
    });
  }, [allWeekendTournaments, quickFilter, todayIso, todayDayName, weekendInfo, selectedDayTab, selectedState, selectedBuyin, searchQuery]);

  const handleRemindMe = (tournament) => {
    if (typeof window === 'undefined') return;
    const savedAt = new Date(Date.now()).toISOString();
    const spot = buildWeekendReminderSpot(tournament, { savedAt });
    try {
      const rawSaved = window.localStorage?.getItem('sp_saved_spots_v1');
      const parsed = rawSaved ? JSON.parse(rawSaved) : [];
      const existing = Array.isArray(parsed) ? parsed : [];
      const nextSaved = [spot, ...existing.filter((item) => item && item.id !== spot.id)].slice(0, 25);
      window.localStorage?.setItem('sp_saved_spots_v1', JSON.stringify(nextSaved));
    } catch (_) {
      /* ignore storage restrictions */
    }
    setRemindedIds((prev) => ({ ...prev, [spot.id]: true }));
    try {
      window.dispatchEvent(
        new CustomEvent('sp:seo-tool-engaged', {
          detail: { tool: 'weekend-tournaments', action: 'remind-me', eventName: spot.label },
        })
      );
      window.dispatchEvent(
        new CustomEvent('sp:peak-utility-pwa', {
          detail: { unlockKey: 'series-alerts-event-reminder' },
        })
      );
    } catch (_) {
      /* non-blocking */
    }
    trackSeoFunnelEvent('seo_local_action_bar_click', {
      action: 'weekend-remind-me',
      venue: spot.venue,
    });
    openQuickSignup({
      unlockKey: 'series-alerts-event-reminder',
      source: 'weekend-tournaments-remind-me',
      eyebrow: 'Free Tournament Reminder',
      title: `Remind Me: ${spot.label}`,
      subtitle: `Get Free Start-Time & Late-Reg Reminders For ${spot.label}${spot.venue ? ` At ${spot.venue}` : ''}.`,
      redirectPath: WEEKEND_CANONICAL_PATH,
    });
  };

  // Aggregate stats
  const stats = useMemo(() => {
    const venues = new Set(allWeekendTournaments.map(t => t.venue_name)).size;
    const totalPrizePools = allWeekendTournaments.reduce((sum, t) => sum + (t.guaranteed || 0), 0);
    return {
      total: allWeekendTournaments.length,
      venues,
      totalPrizePools,
      fridayCount: (friData?.tournaments || []).length,
      saturdayCount: (satData?.tournaments || []).length,
      sundayCount: (sunData?.tournaments || []).length,
    };
  }, [allWeekendTournaments, friData, satData, sunData]);

  // Structured Data (Schema.org CollectionPage + ItemList of SportsEvents + Event nodes)
  const structuredData = useMemo(() => {
    return buildDailyTournamentSchema(
      filteredTournaments.slice(0, 50),
      `${weekendInfo.friday}T00:00:00Z`,
      {
        canonical: 'https://smarter.poker/hub/tournaments/this-weekend',
        pageName: 'Poker Tournaments This Weekend',
        pageDescription: `Browse upcoming weekend poker tournaments from ${weekendInfo.weekendRangeLabel}. Find buy-ins, schedules, and guaranteed prize pools across listed poker rooms.`,
      }
    );
  }, [filteredTournaments, weekendInfo]);

  const upcomingEventSchemaNodes = useMemo(
    () =>
      buildWeekendEventSchemaNodes(filteredTournaments, {
        maxItems: MAX_WEEKEND_EVENT_SCHEMA_NODES,
        canonical: 'https://smarter.poker/hub/tournaments/this-weekend',
      }),
    [filteredTournaments]
  );

  return (
    <>
      <SEOHead
        title={`Weekend Poker Tournaments (${weekendInfo.weekendRangeLabel.replace(/,\s*\d{4}$/, '')})`}
        description={`Find live poker tournaments running this weekend (${weekendInfo.weekendRangeLabel}). Compare buy-ins, guarantees, schedules, and card rooms nationwide.`}
        canonical="/hub/tournaments/this-weekend"
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializePokerJsonLd(structuredData) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: serializePokerJsonLd({
              '@context': 'https://schema.org',
              '@graph': normalizeJsonLdGraph([
                {
                  '@type': 'WebPage',
                  '@id': 'https://smarter.poker/hub/tournaments/this-weekend#webpage',
                  url: 'https://smarter.poker/hub/tournaments/this-weekend',
                  name: 'Weekend Poker Tournaments',
                  inLanguage: 'en-US',
                  isPartOf: { '@id': 'https://smarter.poker/#website' },
                  speakable: {
                    '@type': 'SpeakableSpecification',
                    cssSelector: ['h1', '.faq-section'],
                  },
                },
                datasetSchema({
                  path: '/hub/tournaments/this-weekend',
                  name: 'Smarter.Poker Weekend Poker Tournaments Directory (Friday, Saturday & Sunday)',
                  description:
                    `Live Friday, Saturday, And Sunday Poker Tournament Schedules, Buy-Ins, Starting Stacks, And Guaranteed Prize Pools Across ${VENUE_COUNT_LABEL} US Poker Rooms.`,
                  keywords: [
                    'poker tournaments this weekend',
                    'weekend poker tournaments near me',
                    'saturday poker tournaments',
                    'sunday poker tournaments',
                    'guaranteed poker tournaments this weekend',
                  ],
                  variableMeasured: [
                    'Buy-In Amount ($)',
                    'Guaranteed Prize Pool ($)',
                    'Weekend Day (Friday, Saturday, Sunday)',
                    'Start Time & Registration Window',
                    'Game Type (NLH, PLO, Mixed)',
                  ],
                }),
                faqSchema(WEEKEND_TOURNAMENTS_FAQS, '/hub/tournaments/this-weekend'),
                breadcrumbSchema([
                  ['Home', '/'],
                  ['Poker Near Me', '/hub/poker-near-me/lobby'],
                  ['Weekend Tournaments', '/hub/tournaments/this-weekend'],
                ]),
                ...upcomingEventSchemaNodes,
              ].filter(Boolean)),
            }),
          }}
        />
      </SEOHead>

      <div className="weekend-page">
        <UniversalHeader
          pageDepth={1}
          onMenuClick={() => setMenuOpen(true)}
          onBackClick={() => router.back()}
        />
        <PokerNearMeFamilyNav />
        <HamburgerMenu
          isOpen={menuOpen}
          onClose={() => setMenuOpen(false)}
          direction="right"
          theme="dark"
          menuItems={menuConfig.menuItems}
          bottomLinks={menuConfig.bottomLinks}
        />

        <main className="weekend-main" aria-labelledby="weekend-heading">
          {/* Hero Banner with Intent Optimizations */}
          <header className="weekend-hero">
            <div className="badge-pill">
              <CalendarLuc size={14} aria-hidden />
              <span>{weekendInfo.weekendRangeLabel}</span>
              {weekendInfo.isCurrentlyWeekend && <span className="live-indicator">LIVE NOW</span>}
            </div>

            <h1 id="weekend-heading" className="weekend-title">
              POKER TOURNAMENTS <span className="highlight-cyan">THIS WEEKEND</span>
            </h1>

            <p className="weekend-lead">
              Your Definitive Guide To Friday, Saturday, And Sunday Tournaments.
              Compare Guaranteed Prize Pools, Structures, And Start Times At Listed Card Rooms.
            </p>

            {/* Quick-Facts Key Metrics */}
            <dl className="weekend-stats-dl">
              <div className="stat-card">
                <dt className="stat-label">Total Tournaments</dt>
                <dd className="stat-value">{stats.total || '1,800+'}</dd>
              </div>
              <div className="stat-card">
                <dt className="stat-label">Listed Venues</dt>
                <dd className="stat-value">{stats.venues || VENUE_COUNT_LABEL}</dd>
              </div>
              <div className="stat-card">
                <dt className="stat-label">Total Guarantees</dt>
                <dd className="stat-value highlight-gold">
                  {stats.totalPrizePools > 0 ? formatMoney(stats.totalPrizePools) : '$1.5M+ GTD'}
                </dd>
              </div>
            </dl>
          </header>

          {/* Interactive Filters Bar */}
          <div className="weekend-controls">
            {/* Tonight / This Weekend / All Upcoming Quick-Filter Pill Bar */}
            <div
              className="tonight-quick-bar"
              data-testid="tonight-weekend-filter"
              role="group"
              aria-label="Quick Schedule Filter"
            >
              <button
                type="button"
                data-filter="tonight"
                aria-pressed={quickFilter === 'tonight'}
                className={`tonight-pill ${quickFilter === 'tonight' ? 'active' : ''}`}
                onClick={() => {
                  setQuickFilter('tonight');
                  setSelectedDayTab('ALL');
                }}
              >
                {`Tonight (${tonightCount})`}
              </button>
              <button
                type="button"
                data-filter="weekend"
                aria-pressed={quickFilter === 'weekend'}
                className={`tonight-pill ${quickFilter === 'weekend' ? 'active' : ''}`}
                onClick={() => {
                  setQuickFilter('weekend');
                }}
              >
                {`This Weekend (${weekendOnlyCount})`}
              </button>
              <button
                type="button"
                data-filter="all"
                aria-pressed={quickFilter === 'all'}
                className={`tonight-pill ${quickFilter === 'all' ? 'active' : ''}`}
                onClick={() => {
                  setQuickFilter('all');
                  setSelectedDayTab('ALL');
                }}
              >
                {`All Upcoming (${allWeekendTournaments.length})`}
              </button>
            </div>

            {/* Day Selector Tabs */}
            <div className="day-tabs-group" role="tablist" aria-label="Select Weekend Day">
              <button
                role="tab"
                aria-selected={selectedDayTab === 'ALL'}
                className={`day-tab ${selectedDayTab === 'ALL' ? 'active' : ''}`}
                onClick={() => setSelectedDayTab('ALL')}
              >
                All Weekend ({stats.total})
              </button>
              <button
                role="tab"
                aria-selected={selectedDayTab === 'Friday'}
                className={`day-tab ${selectedDayTab === 'Friday' ? 'active' : ''}`}
                onClick={() => setSelectedDayTab('Friday')}
              >
                Friday ({stats.fridayCount})
              </button>
              <button
                role="tab"
                aria-selected={selectedDayTab === 'Saturday'}
                className={`day-tab ${selectedDayTab === 'Saturday' ? 'active' : ''}`}
                onClick={() => setSelectedDayTab('Saturday')}
              >
                Saturday ({stats.saturdayCount})
              </button>
              <button
                role="tab"
                aria-selected={selectedDayTab === 'Sunday'}
                className={`day-tab ${selectedDayTab === 'Sunday' ? 'active' : ''}`}
                onClick={() => setSelectedDayTab('Sunday')}
              >
                Sunday ({stats.sundayCount})
              </button>
            </div>

            {/* Filter Dropdowns */}
            <div className="dropdowns-group">
              <select
                className="filter-select"
                aria-label="Filter By State"
                value={selectedState}
                onChange={(e) => setSelectedState(e.target.value)}
              >
                <option value="">All States</option>
                {POPULAR_STATES.map((s) => (
                  <option key={s.abbr} value={s.abbr}>
                    {s.name}
                  </option>
                ))}
              </select>

              <select
                className="filter-select"
                aria-label="Filter By Buy-In"
                value={selectedBuyin.label}
                onChange={(e) => {
                  const found = BUYIN_RANGES.find((b) => b.label === e.target.value);
                  setSelectedBuyin(found || BUYIN_RANGES[0]);
                }}
              >
                {BUYIN_RANGES.map((b) => (
                  <option key={b.label} value={b.label}>
                    {b.label}
                  </option>
                ))}
              </select>

              <input
                type="text"
                className="search-input"
                placeholder="Search Venue Or City..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Tournament Grid Content */}
          <div className="tournament-content">
            {isLoading ? (
              <div className="loading-state">
                <div className="spinner" />
                <p>Loading Weekend Tournament Schedules...</p>
              </div>
            ) : filteredTournaments.length === 0 ? (
              <div className="empty-state">
                <p>No Tournaments Match Your Current Filters.</p>
                <button
                  className="reset-btn"
                  onClick={() => {
                    setQuickFilter('weekend');
                    setSelectedDayTab('ALL');
                    setSelectedState('');
                    setSelectedBuyin(BUYIN_RANGES[0]);
                    setSearchQuery('');
                  }}
                >
                  Reset Filters
                </button>
              </div>
            ) : (
              <div className="tournament-grid">
                {filteredTournaments.slice(0, 100).map((t, i) => {
                  const spotId = buildWeekendReminderSpot(t).id;
                  return (
                    <WeekendTournamentCard
                      key={`${t.id || t.venue_id}-${i}`}
                      tournament={t}
                      isReminded={Boolean(remindedIds[spotId])}
                      onRemindMe={handleRemindMe}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* Informational SEO Content Section (Rich AEO Text) */}
          <section className="weekend-seo-content" aria-labelledby="weekend-guide-heading">
            <h2 id="weekend-guide-heading">Finding Poker Tournaments This Weekend</h2>
            <p>
              Weekend Poker Tournaments Represent The Largest Prize Pools, Biggest Fields, And Most Diverse Tournament
              Schedules Across Casinos And Dedicated Poker Clubs. From Friday Night Warm-Ups To Saturday Marquee Deepstacks
              And Sunday Majors, Smarter.Poker Provides Real-Time Schedule Tracking From Hundreds Of Listed Venues.
            </p>
            <div className="seo-tips-grid">
              <div className="seo-tip">
                <h3>Early Registration</h3>
                <p>
                  Saturday Tournaments Often Reach Capacity Quickly. Check Late Registration Levels And Starting Stack
                  Depths Directly On The Venue Profile Before Traveling.
                </p>
              </div>
              <div className="seo-tip">
                <h3>Guaranteed Prize Pools</h3>
                <p>
                  Look For The GTD Badge On Tournament Cards For Tournaments Backed By Guaranteed Payouts Regardless Of
                  Total Entrant Turnout.
                </p>
              </div>
            </div>
          </section>
          <div style={{ margin: '28px 0' }}>
            <SmarterAccountUnlockGate
              variant="live-venue-intel"
              context="weekend-tournaments"
              title="Sync Weekend Tournament Alerts, Buy-Ins & Late Reg Reminders Free"
              redirectPath="/hub/tournaments/this-weekend"
            />
          </div>
          <FaqSection faqs={WEEKEND_TOURNAMENTS_FAQS} />
        </main>

        <style suppressHydrationWarning dangerouslySetInnerHTML={{ __html: `
          .weekend-page {
            min-height: 100vh;
            background: #0a0d14;
            color: #f1f5f9;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          }
          .weekend-main {
            max-width: 1300px;
            margin: 0 auto;
            padding: 24px 20px 80px;
          }
          .weekend-hero {
            text-align: center;
            margin-bottom: 32px;
          }
          .badge-pill {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 6px 14px;
            border-radius: 0;
            background: linear-gradient(180deg, #0d1f33 0%, #071321 100%);
            border: 1px solid #2b4663;
            color: #86daff;
            font-size: 13px;
            font-weight: 600;
            margin-bottom: 16px;
          }
          .live-indicator {
            background: #22c55e;
            color: #000;
            padding: 2px 6px;
            border-radius: 0;
            font-size: 10px;
            font-weight: 800;
          }
          .weekend-title {
            font-size: 2.4rem;
            font-weight: 800;
            letter-spacing: -0.02em;
            margin: 0 0 12px;
          }
          .highlight-cyan {
            color: #38bdf8;
          }
          .highlight-gold {
            color: #34d399;
          }
          .weekend-lead {
            font-size: 1.05rem;
            color: #94a3b8;
            max-width: 720px;
            margin: 0 auto 28px;
            line-height: 1.5;
          }
          .weekend-stats-dl {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 16px;
            max-width: 650px;
            margin: 0 auto;
          }
          .stat-card {
            background: linear-gradient(180deg, #0d1f33 0%, #071321 100%);
            border: 1px solid #2b4663;
            border-radius: 0;
            padding: 14px 12px;
            text-align: center;
          }
          .stat-label {
            font-size: 12px;
            color: #94a3b8;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 4px;
          }
          .stat-value {
            font-size: 1.5rem;
            font-weight: 700;
            color: #ffffff;
            margin: 0;
          }
          .weekend-controls {
            background: linear-gradient(180deg, #0d1f33 0%, #071321 100%);
            border: 1px solid #2b4663;
            border-radius: 0;
            padding: 16px 20px;
            margin-bottom: 30px;
            display: flex;
            flex-direction: column;
            gap: 16px;
          }
          .tonight-quick-bar {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            padding-bottom: 12px;
            border-bottom: 1px solid #1e3a5f;
          }
          .tonight-pill {
            min-height: 44px;
            padding: 8px 16px;
            border-radius: 0;
            border: 1px solid #1e3a5f;
            background: #0b1120;
            color: #cbd5e1;
            font-size: 13px;
            font-weight: 700;
            cursor: pointer;
            transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
          }
          .tonight-pill:hover {
            border-color: #38bdf8;
            color: #ffffff;
          }
          .tonight-pill.active {
            background: #2563eb;
            border-color: #38bdf8;
            color: #ffffff;
            box-shadow: 0 0 12px rgba(56, 189, 248, 0.28);
          }
          .day-tabs-group {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
          }
          .day-tab {
            background: #071321;
            border: 1px solid #2b4663;
            color: #cbd5e1;
            padding: 8px 16px;
            border-radius: 0;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.15s ease;
          }
          .day-tab:hover {
            background: #0d1f33;
            color: #ffffff;
          }
          .day-tab.active {
            background: #38bdf8;
            color: #000000;
            border-color: #38bdf8;
            box-shadow: 0 0 14px rgba(56, 189, 248, 0.35);
          }
          .dropdowns-group {
            display: flex;
            gap: 12px;
            flex-wrap: wrap;
          }
          .filter-select, .search-input {
            background: #071321;
            border: 1px solid #2b4663;
            color: #f1f5f9;
            padding: 8px 14px;
            border-radius: 0;
            font-size: 13px;
          }
          .search-input {
            flex: 1;
            min-width: 200px;
          }
          .tournament-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
            gap: 16px;
          }
          .loading-state, .empty-state {
            text-align: center;
            padding: 60px 20px;
            color: #94a3b8;
          }
          .spinner {
            width: 32px;
            height: 32px;
            border: 3px solid rgba(56, 189, 248, 0.2);
            border-top-color: #38bdf8;
            border-radius: 50%;
            animation: spin 1s infinite linear;
            margin: 0 auto 16px;
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
          .reset-btn {
            background: #38bdf8;
            color: #000;
            border: none;
            padding: 8px 18px;
            border-radius: 0;
            font-weight: 600;
            cursor: pointer;
            margin-top: 12px;
          }
          .weekend-seo-content {
            margin-top: 60px;
            padding-top: 40px;
            border-top: 1px solid #2b4663;
          }
          .weekend-seo-content h2 {
            font-size: 1.4rem;
            margin-bottom: 12px;
          }
          .weekend-seo-content p {
            color: #94a3b8;
            line-height: 1.6;
            margin-bottom: 24px;
          }
          .seo-tips-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
            gap: 20px;
          }
          .seo-tip {
            background: linear-gradient(180deg, #0d1f33 0%, #071321 100%);
            border: 1px solid #2b4663;
            border-radius: 0;
            padding: 16px;
          }
          .seo-tip h3 {
            font-size: 15px;
            color: #00d4ff;
            margin: 0 0 8px;
          }
          .seo-tip p {
            margin: 0;
            font-size: 13px;
          }
          @media (max-width: 640px) {
            .weekend-stats-dl {
              grid-template-columns: 1fr;
            }
            .weekend-title {
              font-size: 1.8rem;
            }
          }
        ` }} />
      </div>
    </>
  );
}

function WeekendTournamentCard({ tournament, isReminded = false, onRemindMe }) {
  const t = tournament;
  const isHomeGame = Boolean(t.is_home_game);
  const isRealVenue = Number.isFinite(Number(t.venue_id)) && Number(t.venue_id) > 0;
  const detailUrl = isHomeGame ? homeGameUrl(t) : (isRealVenue ? `/hub/venues/${t.venue_id}` : null);

  return (
    <div className="card-item">
      <div className="card-header">
        <span className="card-day-badge">{t.weekendDay}</span>
        <span className="card-time">{formatTime(t.start_time)}</span>
        <span className="card-buyin">{typeof t.buy_in === 'number' && t.buy_in > 0 ? `$${t.buy_in}` : (t.buy_in === 0 ? 'Free' : 'TBD')}</span>
      </div>

      <div className="card-body">
        <h3 className="card-name">{t.tournament_name || 'Weekend Tournament'}</h3>
        <p className="card-venue">{t.venue_name}</p>
        {(t.city || t.state) && (
          <p className="card-location">
            <MapPinLuc size={12} aria-hidden />
            <span>{[t.city, t.state].filter(Boolean).join(', ')}</span>
          </p>
        )}

        <div className="card-pills">
          <span className="pill game-type">{t.game_type || 'NLH'}</span>
          {t.guaranteed > 0 && <span className="pill gtd">{formatMoney(t.guaranteed)} GTD</span>}
          <span className="pill weekend-badge">Live This Weekend</span>
          {t.open_status?.open === true && <span className="pill open-now-badge">Open Now</span>}
        </div>
      </div>

      <div className="card-footer">
        <button
          type="button"
          className={`remind-me-btn ${isReminded ? 'saved' : ''}`}
          data-testid="weekend-remind-me-btn"
          onClick={() => onRemindMe && onRemindMe(t)}
        >
          <BellLuc size={14} aria-hidden />
          <span>{isReminded ? 'Reminder Saved' : 'Remind Me'}</span>
        </button>
        {detailUrl && (
          <Link href={detailUrl} legacyBehavior>
            <a className="card-link">
              <span>View Venue Schedule</span>
              <ChevRight size={14} aria-hidden />
            </a>
          </Link>
        )}
      </div>

      <style suppressHydrationWarning dangerouslySetInnerHTML={{ __html: `
        .card-item {
          background: linear-gradient(180deg, #0d1f33 0%, #071321 100%);
          border: 1px solid #2b4663;
          border-radius: 0;
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          transition: transform 0.15s, border-color 0.15s;
        }
        .card-item:hover {
          border-color: #38bdf8;
          transform: translateY(-2px);
        }
        .card-header {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .card-day-badge {
          background: rgba(56, 189, 248, 0.15);
          color: #86daff;
          font-size: 11px;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 0;
          text-transform: uppercase;
        }
        .card-time {
          font-size: 12px;
          color: #94a3b8;
          font-weight: 500;
        }
        .card-buyin {
          margin-left: auto;
          font-size: 15px;
          font-weight: 700;
          color: #22c55e;
        }
        .card-name {
          font-size: 14px;
          font-weight: 600;
          margin: 0 0 4px;
          color: #ffffff;
        }
        .card-venue {
          font-size: 13px;
          color: #cbd5e1;
          margin: 0 0 4px;
        }
        .card-location {
          font-size: 12px;
          color: #94a3b8;
          display: flex;
          align-items: center;
          gap: 4px;
          margin: 0 0 8px;
        }
        .card-pills {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
        }
        .pill {
          font-size: 11px;
          padding: 2px 6px;
          border-radius: 0;
          font-weight: 600;
        }
        .pill.game-type {
          background: rgba(59, 130, 246, 0.2);
          color: #86daff;
        }
        .pill.gtd {
          background: rgba(52, 211, 153, 0.18);
          color: #34d399;
        }
        .pill.weekend-badge {
          background: rgba(56, 189, 248, 0.18);
          color: #38bdf8;
        }
        .pill.open-now-badge {
          background: rgba(34, 197, 94, 0.2);
          color: #4ade80;
          font-weight: 700;
        }
        .card-footer {
          margin-top: auto;
          padding-top: 10px;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .remind-me-btn {
          width: 100%;
          min-height: 44px;
          padding: 8px 12px;
          border-radius: 0;
          border: 1px solid #38bdf8;
          background: #0b1120;
          color: #86daff;
          font-size: 13px;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          cursor: pointer;
          transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
        }
        .remind-me-btn:hover {
          background: #2563eb;
          color: #ffffff;
        }
        .remind-me-btn.saved {
          background: #059669;
          border-color: #10b981;
          color: #ffffff;
        }
        .card-link {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 12px;
          color: #00d4ff;
          text-decoration: none;
          font-weight: 500;
        }
        .card-link:hover {
          text-decoration: underline;
        }
      ` }} />
    </div>
  );
}
