/**
 * LOG ENTRY MODAL
 * Category-first session logging with minimal required fields
 */

import { GRADIENTS, METAL } from './metalStyles';
import { memo, useState, useEffect, useRef, useId } from 'react';
import { useModalHistory } from '../../hooks/useModalHistory';
import { useScrimDismiss } from '../../hooks/useScrimDismiss';
import { motion } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { createLedgerEntry, updateLedgerEntry, getActiveTrip, getActiveSeries } from '../../lib/bankroll/bankrollSelectors';
import { getOrCreateLocation, detectNearbyLocation } from '../../lib/bankroll/locationMemory';
import VenueSelector from './VenueSelector';
import { sessionEndStamp, toCents } from '../../lib/bankroll/ledgerMath.mjs';
import { localDay } from '../../lib/bankroll/localDates.mjs';
import toast from '../../stores/toastStore';
import { ClubArenaSessionsPanel } from './ClubArenaSessions';
import { requireOnlineNow } from '../../hooks/useOnlineStatus';
import { uploadBankrollImage } from '../../lib/bankroll/receiptStorage';
import {
  amountUnit, applyEntryCurrency, entryInOwnCurrency, initialCurrencyState, isForeignCurrency,
  noteMoney, rateProblem, usdSavedPreview,
} from '../../lib/bankroll/entryCurrency.mjs';
import EntryCurrencyFields from './EntryCurrencyFields';
import LedgerEntryHistory from './LedgerEntryHistory';

// Clean SmarterPoker-style categories (no emojis)
const CATEGORIES = [
  { id: 'poker_cash', label: 'Cash Games', icon: '' },
  { id: 'poker_mtt', label: 'Tournaments', icon: '' },
  { id: 'casino_table', label: 'Table Games', icon: '' },
  { id: 'slots', label: 'Slots', icon: '' },
  { id: 'sports', label: 'Sports Betting', icon: '' },
  { id: 'expense', label: 'Expense', icon: '' },
];

const EXPENSE_TYPES = [
  'flight',
  'hotel',
  'airbnb',
  'gas',
  'rental_car',
  'rideshare',
  'meals',
  'tips',
  'tournament_fee',
  'series_fee',
  'other',
];

const CASINO_GAMES = ['blackjack', 'roulette', 'craps', 'baccarat', 'other'];
const SPORTS = ['baseball', 'basketball', 'football', 'hockey', 'boxing_mma'];
const BET_TYPES = ['moneyline', 'spread', 'over_under', 'parlay', 'prop', 'live'];
const EMOTIONAL_TAGS = ['neutral', 'confident', 'tilted', 'exhausted', 'rushed', 'revenge'];

// Use one settlement for the live totals, rule checks and saved tournament row.
function tournamentAmounts(form, previouslyRecordedBounties) {
  const buyIn = Number(form.buy_in_amount) || 0;
  const rebuys = parseInt(form.reentry_count, 10) || 0;
  const addOn = Number(form.add_on_amount) || 0;
  const bounties = Number(form.bounties_collected) || 0;
  const cashOut = Number(form.gross_out) || 0;
  const expense = Math.max(0, Number(form.inline_expense_amount) || 0);
  const swap = Number(form.swap_amount) || 0;
  const staking = Number(form.staker_amount) || 0;
  const sold = Number(form.action_amount) || 0;
  // An edited cash-out already includes the bounty paid on the original row.
  const afterExpense = expense > 0 ? Math.max(0, cashOut - expense) : cashOut;
  const proceeds = afterExpense + bounties - (Number(previouslyRecordedBounties) || 0);
  const payout = swap > 0 || staking > 0 || sold > 0
    ? Math.max(0, proceeds - swap - staking - sold)
    : proceeds;
  return { buyIn, rebuys, addOn, bounties, swap, staking, sold, stake: buyIn * (1 + rebuys) + addOn, payout };
}

// Amounts in the summary are in the currency the entry was typed in
// (US dollars keep the exact form older rows carry).
function tournamentSummary(stake, rebuys, addOn, bounties, currency = 'USD') {
  const parts = [];
  if (rebuys > 0) parts.push(`Rebuys: ${rebuys} (Total Buy-In: ${noteMoney(currency, stake, { grouped: true })})`);
  if (addOn > 0) parts.push(`Add-On: ${noteMoney(currency, addOn)}`);
  if (bounties > 0) parts.push(`Bounties: ${noteMoney(currency, bounties)}`);
  return parts.join(' | ');
}

function withTournamentSummary(notes, original, summary) {
  const lines = notes ? notes.split('\n') : [];
  if (original) {
    const previous = tournamentSummary(original.gross_in, original.reentry_count, original.add_on_amount, original.bounties_collected, original.entry_currency);
    if (previous && (original.notes || '').split('\n').includes(previous)) {
      const index = lines.lastIndexOf(previous);
      if (index >= 0) {
        lines.splice(index, 1, ...(summary ? [summary] : []));
        return lines.join('\n') || null;
      }
    }
  }
  if (summary) lines.push(summary);
  return lines.join('\n') || null;
}

function LogEntryModal({ userId, locations, trips, editEntry, defaultCategory, defaultMediaUrls, defaultPrefillData, livePrefill, onStartLiveSession, onClose, onSubmit, displayEUR = false }) {
  const formId = useId();
  const fieldId = (name) => `${formId}-${name}`;
  const isEditMode = !!editEntry;
  // The entry as the player typed it: a session typed in euros is edited in
  // euros (original_gross_*), never in the US dollars it is stored as.
  const editView = isEditMode ? entryInOwnCurrency(editEntry) : null;
  const [currencyState, setCurrencyState] = useState(() => initialCurrencyState(editEntry));
  const unit = amountUnit(currencyState.currency);
  const typedForeign = isForeignCurrency(currencyState.currency);
  // Phone back gesture closes the sheet instead of leaving the page (mobile
  // phase 0a). The modal is mounted only while open, so isOpen is constant;
  // the hook pops our history entry on unmount so an X-close never leaves a
  // dead "back" behind.
  useModalHistory(true, onClose);
  // Tap outside closes; a drag-select that ends on the scrim does not.
  const scrim = useScrimDismiss(onClose);
  // A default category the ledger does not know (the scanner once passed
  // 'session') would render the generic form and then be refused by the
  // category CHECK on save. Unknown means: let the user choose.
  // An ended live session (src/lib/bankroll/liveSession.mjs) opens this same
  // form with its times, buy-ins and venue filled in, so it is saved through
  // exactly the path, checks and rules of any other log.
  const live = !editEntry && livePrefill && livePrefill.fields ? livePrefill : null;
  const knownDefault = live
    ? (CATEGORIES.some((c) => c.id === live.category) ? live.category : null)
    : (CATEGORIES.some((c) => c.id === defaultCategory) ? defaultCategory : null);
  const [step, setStep] = useState(isEditMode || knownDefault ? 'details' : 'category');
  const [category, setCategory] = useState(isEditMode ? editEntry.category : knownDefault);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [savedStakes, setSavedStakes] = useState([]);
  const [customStakes, setCustomStakes] = useState(false);
  const [savedSwapNames, setSavedSwapNames] = useState([]);
  const [savedStakerNames, setSavedStakerNames] = useState([]);
  const [customSwapName, setCustomSwapName] = useState(false);
  const [customStakerName, setCustomStakerName] = useState(false);
  const [savedSlotGames, setSavedSlotGames] = useState([]);
  const [customSlotGame, setCustomSlotGame] = useState(false);
  const [customSportName, setCustomSportName] = useState(false);
  // Collapsible tournament deduction sections
  const [showSwaps, setShowSwaps] = useState(false);
  const [showStaking, setShowStaking] = useState(false);
  const [showSoldAction, setShowSoldAction] = useState(false);

  // Helper: convert 24h "HH:MM" to { time: "H:MM", period }
  const to12h = (time24) => {
    if (!time24) return { time: '', period: 'PM' };
    const [hStr, mStr] = time24.split(':');
    let h = parseInt(hStr, 10);
    const period = h >= 12 ? 'PM' : 'AM';
    if (h === 0) h = 12;
    else if (h > 12) h -= 12;
    return { time: `${h}:${(mStr || '00').padStart(2, '0')}`, period };
  };

  // Helper: convert "H:MM" + period to 24h "HH:MM"
  // Accepts "9", "9:30" and "930"/"0930". Anything else (13:00, 9:75) is
  // not a 12-hour clock time and returns '' so the form can say so, instead
  // of building a timestamp the database refuses.
  const to24h = (timeStr, period) => {
    if (!timeStr) return '';
    const text = String(timeStr).trim();
    const match = /^(\d{1,2})(?::(\d{2}))?$/.exec(text) || /^(\d{1,2})(\d{2})$/.exec(text);
    if (!match) return '';
    let h = parseInt(match[1], 10);
    const m = match[2] || '00';
    if (!(h >= 1 && h <= 12) || Number(m) > 59) return '';
    if (period === 'AM' && h === 12) h = 0;
    else if (period === 'PM' && h !== 12) h += 12;
    return `${h.toString().padStart(2, '0')}:${m}`;
  };

  // Form state
  const buildInitialFormData = () => {
    if (isEditMode) {
      const e = editView;
      const extractTime = (dt) => dt ? dt.split('T')[1]?.substring(0, 5) || '' : '';
      const startRaw = extractTime(e.start_time);
      const endRaw = extractTime(e.end_time);
      const start12 = to12h(startRaw);
      const end12 = to12h(endRaw);
      return {
        gross_in: e.gross_in?.toString() || '',
        gross_out: e.gross_out?.toString() || '0',
        location_id: e.location_id || '',
        location_name: e.location_name || '',
        trip_id: e.trip_id || '',
        entry_date: e.entry_date || new Date().toLocaleDateString('en-CA'),
        start_time_text: start12.time,
        start_period: start12.period,
        end_time_text: end12.time,
        end_period: end12.period,
        notes: e.notes || '',
        emotional_tag: e.emotional_tag || '',
        stakes: e.stakes || '',
        game_type: e.game_type || 'nlhe',
        inline_expense_amount: '',
        inline_expense_type: '',
        tournament_name: e.tournament_name || '',
        tournament_type: e.tournament_type || '',
        // Older tournament rows may carry only total stake, rebuys and the add-on.
        buy_in_amount: e.buy_in_amount != null
          ? String(e.buy_in_amount)
          : e.category === 'poker_mtt' && e.gross_in != null
            ? String((e.gross_in - (e.add_on_amount || 0)) / (1 + (Number(e.reentry_count) || 0)))
            : '',
        finish_position: e.finish_position?.toString() || '',
        field_size: e.field_size?.toString() || '',
        reentry_count: e.reentry_count?.toString() || '0',
        add_on_amount: e.add_on_amount?.toString() || '',
        bounties_collected: e.bounties_collected?.toString() || '',
        casino_game: e.casino_game || 'blackjack',
        slot_machine: e.slot_machine || '',
        sport: e.sport || '',
        sport_event: '',
        bet_type: e.bet_type || '',
        odds: e.odds || '',
        bet_result: e.bet_result || '',
        expense_type: e.expense_type || '',
      };
    }

    // Pre-fill fields from OCR extracted data if available
    let initGrossIn = '';
    let initLocationName = '';
    let initNotes = '';
    let initExpenseType = '';

    if (defaultPrefillData) {
      initGrossIn = defaultPrefillData.amount?.toString() || '';
      initLocationName = defaultPrefillData.vendor || '';

      const desc = defaultPrefillData.description || '';
      const date = defaultPrefillData.date || '';
      if (initLocationName || desc || date) {
        initNotes = `[Scan Data]\nVendor: ${initLocationName}\nDescription: ${desc}\nDate: ${date}`.trim();
      }

      const catMap = {
        hotel: 'hotel',
        flights: 'flight',
        rental_car: 'rental_car',
        gas: 'gas',
        meals: 'meals',
        transport: 'rideshare',
        tips: 'tips',
        tournament: 'tournament_fee',
        buy_in: 'other',
        other: 'other'
      };
      if (defaultPrefillData.category) {
        initExpenseType = catMap[defaultPrefillData.category] || '';
      }
    }

    // A scan that was read as a buy-in or a cash out carries session fields
    // rather than expense ones. `entryKind` is set by the receipt router; the
    // fields below are already named the way this form stores them, so they
    // are applied last and win over the generic amount/vendor mapping above.
    const p = defaultPrefillData || {};
    const scannedSession = {
      ...(p.gross_in != null ? { gross_in: String(p.gross_in) } : {}),
      ...(p.gross_out != null ? { gross_out: String(p.gross_out) } : {}),
      ...(p.buy_in_amount != null ? { buy_in_amount: String(p.buy_in_amount) } : {}),
      ...(p.tournament_name ? { tournament_name: p.tournament_name } : {}),
      ...(p.location_name ? { location_name: p.location_name } : {}),
      ...(p.stakes ? { stakes: p.stakes } : {}),
      ...(p.game_type ? { game_type: p.game_type } : {}),
      ...(p.finish_position != null ? { finish_position: String(p.finish_position) } : {}),
      ...(p.expense_type ? { expense_type: p.expense_type } : {}),
    };

    return {
      gross_in: initGrossIn,
      gross_out: '0',
      location_id: '',
      location_name: initLocationName,
      venue_type: 'casino',
      poker_venue_id: null,
      venue_lat: null,
      venue_lng: null,
      trip_id: '',
      entry_date: defaultPrefillData?.date ? defaultPrefillData.date : new Date().toLocaleDateString('en-CA'),
      start_time_text: '',
      start_period: 'PM',
      end_time_text: '',
      end_period: 'PM',
      notes: initNotes,
      emotional_tag: '',
      stakes: '',
      game_type: 'nlhe',
      tournament_name: '',
      tournament_type: '',
      buy_in_amount: '',
      finish_position: '',
      field_size: '',
      reentry_count: '0',
      casino_game: 'blackjack',
      slot_machine: '',
      sport: '',
      sport_event: '',
      bet_type: '',
      odds: '',
      bet_result: '',
      expense_type: initExpenseType,
      inline_expense_amount: '',
      inline_expense_type: '',
      ...scannedSession,
      swap_player: '',
      swap_amount: '',
      staker_name: '',
      staker_amount: '',
      action_buyer: '',
      action_percentage: '',
      action_markup: '',
      action_amount: '',
      add_on_amount: '',
      bounties_collected: '',
      ...(live ? live.fields : {}),
    };
  };

  const [formData, setFormData] = useState(buildInitialFormData);
  const [activeTrip, setActiveTrip] = useState(null);

  // Auto-detect location on mount (a live session already chose its venue)
  useEffect(() => {
    if (live && live.fields.location_name) return;
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const detected = await detectNearbyLocation(
            userId,
            position.coords.latitude,
            position.coords.longitude
          );
          if (detected) {
            setFormData((prev) => ({
              ...prev,
              location_id: detected.id,
              location_name: detected.name,
            }));
          }
        },
        () => {
          // Geolocation denied or unavailable - continue without it
        }
      );
    }
  }, [userId]);

  // Fetch previously saved stakes for dropdown
  useEffect(() => {
    if (!userId) return;
    supabase
      .from('bankroll_ledger')
      .select('stakes')
      .eq('user_id', userId)
      .eq('category', 'poker_cash')
      .not('stakes', 'is', null)
      .then(({ data }) => {
        if (data) {
          const unique = [...new Set(data.map(d => d.stakes).filter(Boolean))];
          setSavedStakes(unique.sort());
        }
      });
  }, [userId]);

  // Load saved swap/staker/slot names from localStorage
  useEffect(() => {
    try {
      const swapRaw = localStorage.getItem('bankroll_swap_names');
      if (swapRaw) setSavedSwapNames(JSON.parse(swapRaw));
      const stakerRaw = localStorage.getItem('bankroll_staker_names');
      if (stakerRaw) setSavedStakerNames(JSON.parse(stakerRaw));
      const slotRaw = localStorage.getItem('bankroll_slot_games');
      if (slotRaw) setSavedSlotGames(JSON.parse(slotRaw));
    } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
  }, []);

  // Detect active trip - auto-assign trip_id and location
  useEffect(() => {
    if (!userId || isEditMode) return;
    getActiveTrip(userId).then(trip => {
      if (trip) {
        setActiveTrip(trip);
        // Auto-fill trip and location from active trip
        setFormData(prev => ({
          ...prev,
          trip_id: trip.id,
          ...(trip.location_id && !prev.location_id ? {
            location_id: trip.location_id,
            location_name: trip.location_name || '',
          } : {}),
        }));
      }
    }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
  }, [userId, isEditMode]);

  // Fallback: check for active series if no active trip
  useEffect(() => {
    if (!userId || isEditMode || activeTrip) return;
    getActiveSeries(userId).then(series => {
      if (series) {
        setFormData(prev => ({
          ...prev,
          trip_id: prev.trip_id || series.id,
          ...(series.location_id && !prev.location_id ? {
            location_id: series.location_id,
            location_name: series.location_name || '',
          } : {}),
        }));
      }
    }).catch(e => console.warn('[App] Handled promise rejection:', e?.message || e));
  }, [userId, isEditMode, activeTrip]);

  const handleCategorySelect = (cat) => {
    setCategory(cat);
    setStep('details');
  };

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const calculateNetResult = () => {
    const grossOut = parseFloat(formData.gross_out) || 0;
    if (category === 'poker_mtt') {
      const { stake, payout } = tournamentAmounts(formData, editView?.bounties_collected);
      return payout - stake;
    }
    const grossIn = parseFloat(formData.gross_in) || 0;
    return grossOut - grossIn;
  };

  // Nothing used to be checked before saving: a blank cash game saved as a
  // $0 session, a negative cash-out saved as a loss, and a typo'd year put a
  // session in the future where no date range shows it.
  const validateEntry = () => {
    if (!category) return 'Choose A Category';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(formData.entry_date || '')) return 'Enter A Valid Date';
    if (formData.entry_date > localDay()) return 'The Date Cannot Be In The Future';
    const money = ['gross_in', 'gross_out', 'buy_in_amount', 'add_on_amount', 'bounties_collected',
      'inline_expense_amount', 'swap_amount', 'staker_amount', 'action_amount'];
    for (const field of money) {
      const raw = formData[field];
      if (raw === '' || raw === null || raw === undefined) continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) return 'Amounts Must Be $0 Or More';
    }
    if (formData.start_time_text && !to24h(formData.start_time_text, formData.start_period)) return 'Enter A Valid Start Time';
    if (formData.end_time_text && !to24h(formData.end_time_text, formData.end_period)) return 'Enter A Valid End Time';
    const badRate = rateProblem(currencyState.rate, currencyState.currency);
    if (badRate) return badRate;
    if (category === 'expense') {
      if (!(toCents(formData.gross_in) > 0)) return 'Enter The Expense Amount';
    } else if (category !== 'poker_mtt') {
      // A tournament can be a freeroll; any other session moved some money.
      if (!(toCents(formData.gross_in) > 0) && !(toCents(formData.gross_out) > 0)) return 'Enter A Buy-In Or A Cash-Out';
    }
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;
    if (!requireOnlineNow(toast)) return;

    const problem = validateEntry();
    if (problem) {
      toast.error(problem);
      return;
    }

    setIsSubmitting(true);

    try {
      // Bankroll Rules are judged by the page once the row is saved, against
      // the saved row and its own day (src/lib/bankroll/ruleViolations.mjs).
      // The check that used to run here set warnings inside a sheet that
      // closes on save, so nobody ever saw them.
      const netResult = calculateNetResult();

      // Get or create location if name provided but no ID
      let locationId = formData.location_id;
      if (locationId === '__new__') locationId = ''; // Sentinel for "new location" dropdown choice
      if (!locationId && formData.location_name) {
        locationId = await getOrCreateLocation(
          userId,
          formData.location_name,
          formData.venue_type || 'casino',
          formData.venue_lat ?? undefined,
          formData.venue_lng ?? undefined,
          formData.poker_venue_id ?? undefined
        );
      }

      // Build entry based on category
      const entry = {
        category,
        location_id: locationId || null,
        trip_id: formData.trip_id || null,
        entry_date: formData.entry_date,
        start_time: formData.start_time_text
          ? `${formData.entry_date}T${to24h(formData.start_time_text, formData.start_period)}:00`
          : null,
        // An end time earlier than the start is the next morning (a 9 PM to
        // 3 AM session); stored on the same day it read as -18 hours.
        end_time: formData.end_time_text
          ? sessionEndStamp(
            formData.entry_date,
            formData.start_time_text ? to24h(formData.start_time_text, formData.start_period) : '',
            to24h(formData.end_time_text, formData.end_period)
          )
          : null,
        gross_in: parseFloat(formData.gross_in) || 0,
        gross_out: parseFloat(formData.gross_out) || 0,
        notes: formData.notes || null,
        media_urls: mediaFiles.length > 0 ? mediaFiles : null,
        emotional_tag: formData.emotional_tag || null,
      };

      // Inline expense: deduct from gross_out and record in notes (for all non-expense categories)
      const inlineExp = parseFloat(formData.inline_expense_amount) || 0;
      if (category !== 'expense' && inlineExp > 0) {
        entry.gross_out = Math.max(0, (entry.gross_out || 0) - inlineExp);
        const expLabel = formData.inline_expense_type
          ? formData.inline_expense_type.charAt(0).toUpperCase() + formData.inline_expense_type.slice(1).replace('_', ' ')
          : 'Expense';
        const expNote = `${expLabel}: -${noteMoney(currencyState.currency, inlineExp.toFixed(2))}`;
        entry.notes = entry.notes ? `${entry.notes}\n${expNote}` : expNote;
      }

      // Add category-specific fields
      if (category === 'poker_cash') {
        entry.stakes = formData.stakes || null;
        entry.game_type = formData.game_type || null;
      } else if (category === 'poker_mtt') {
        entry.tournament_name = formData.tournament_name || null;
        entry.tournament_type = formData.tournament_type || null;
        entry.buy_in_amount = formData.buy_in_amount === '' ? null : Number(formData.buy_in_amount);
        entry.finish_position = parseInt(formData.finish_position) || null;
        entry.field_size = parseInt(formData.field_size) || null;
        entry.reentry_count = parseInt(formData.reentry_count) || 0;
        entry.add_on_amount = parseFloat(formData.add_on_amount) || null;
        entry.bounties_collected = parseFloat(formData.bounties_collected) || null;
        const {
          stake: totalBuyIn, payout, rebuys: rebuyCount, addOn: addOnAmt,
          bounties, swap: swapAmt, staking: stakerAmt, sold: actionAmt,
        } = tournamentAmounts(formData, editView?.bounties_collected);
        entry.gross_in = totalBuyIn;
        entry.gross_out = payout;
        entry.notes = withTournamentSummary(
          entry.notes, editView, tournamentSummary(totalBuyIn, rebuyCount, addOnAmt, bounties, currencyState.currency)
        );
        if (swapAmt > 0 || stakerAmt > 0 || actionAmt > 0) {
          // Append swap/staking/action details to notes
          const parts = [];
          if (swapAmt > 0) parts.push(`Swap: ${formData.swap_player || 'Unknown'} - ${noteMoney(currencyState.currency, swapAmt)}`);
          if (stakerAmt > 0) parts.push(`Staked by: ${formData.staker_name || 'Unknown'} - ${noteMoney(currencyState.currency, stakerAmt)}`);
          if (actionAmt > 0) {
            const pct = formData.action_percentage ? `${formData.action_percentage}%` : '';
            const mkup = formData.action_markup ? ` @ ${formData.action_markup}% markup` : '';
            parts.push(`Sold Action: ${formData.action_buyer || 'Unknown'} - ${pct}${mkup} - ${noteMoney(currencyState.currency, actionAmt)}`);
          }
          const extra = parts.join(' | ');
          entry.notes = entry.notes ? `${entry.notes}\n${extra}` : extra;
        }
        // Save swap/staker names to localStorage for future use
        if (formData.swap_player) {
          try {
            const prev = JSON.parse(localStorage.getItem('bankroll_swap_names') || '[]');
            const updated = [...new Set([...prev, formData.swap_player])].sort();
            localStorage.setItem('bankroll_swap_names', JSON.stringify(updated));
            setSavedSwapNames(updated);
          } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
        }
        if (formData.staker_name) {
          try {
            const prev = JSON.parse(localStorage.getItem('bankroll_staker_names') || '[]');
            const updated = [...new Set([...prev, formData.staker_name])].sort();
            localStorage.setItem('bankroll_staker_names', JSON.stringify(updated));
            setSavedStakerNames(updated);
          } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
        }
      } else if (category === 'casino_table') {
        entry.casino_game = formData.casino_game || null;
      } else if (category === 'slots') {
        entry.slot_machine = formData.slot_machine || null;
        // Save slot game name to localStorage for future use
        if (formData.slot_machine) {
          try {
            const prev = JSON.parse(localStorage.getItem('bankroll_slot_games') || '[]');
            const updated = [...new Set([...prev, formData.slot_machine])].sort();
            localStorage.setItem('bankroll_slot_games', JSON.stringify(updated));
            setSavedSlotGames(updated);
          } catch (_) { console.warn('[App] Handled exception:', _?.message || _); }
        }
      } else if (category === 'sports') {
        // If custom sport, use the custom name; otherwise use the preset
        entry.sport = formData.sport === '__custom__' ? (formData.custom_sport_name || null) : (formData.sport || null);
        entry.bet_type = formData.bet_type || null;
        entry.odds = formData.odds || null;
        entry.bet_result =
          netResult > 0 ? 'win' : netResult < 0 ? 'loss' : 'push';
        // Append event/game name to notes for searchability
        if (formData.sport_event) {
          const eventNote = `Game: ${formData.sport_event}`;
          entry.notes = entry.notes ? `${entry.notes}\n${eventNote}` : eventNote;
        }
      } else if (category === 'expense') {
        entry.expense_type = formData.expense_type || null;
        // Expenses are always negative (money out)
        entry.gross_in = Math.abs(parseFloat(formData.gross_in) || 0);
        entry.gross_out = 0;
      }

      // Every amount above is in the currency the player typed. The ledger
      // stores US dollars: a foreign entry keeps what was typed in
      // original_gross_* with its rate, and gross_in / gross_out (and the
      // tournament money fields) become US dollars, exact to the cent. A US
      // dollar entry clears the foreign columns (entryCurrency.mjs).
      Object.assign(entry, applyEntryCurrency(entry, { currency: currencyState.currency, rate: currencyState.rate }));

      // The saved row comes back so the caller knows the ledger id. A scanned
      // receipt that opened this modal is marked assigned to that id, which
      // is what takes it out of Receipts Waiting.
      let saved = null;
      if (isEditMode) {
        saved = await updateLedgerEntry(userId, editEntry.id, entry);
      } else {
        saved = await createLedgerEntry(userId, entry);
      }

      // Dispatch global event for real-time dashboard sync
      window.dispatchEvent(new CustomEvent('bankroll-updated'));

      onSubmit(entry, saved && saved.id ? saved : (isEditMode ? { ...entry, id: editEntry.id } : null));
    } catch (error) {
      console.warn('Error logging entry:', error);
      toast.error('Failed to log entry. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderCategorySelector = () => (
    <>
    <div style={{ ...styles.categoryGrid, paddingBottom: 24 }}>
      {CATEGORIES.map((cat) => (
        <button
          key={cat.id}
          onClick={() => handleCategorySelect(cat.id)}
          style={styles.categoryCard}
        >
          <span style={styles.categoryIcon}>{cat.icon}</span>
          <span style={styles.categoryLabel}>{cat.label}</span>
        </button>
      ))}
    </div>
    {!isEditMode && <ClubArenaSessionsPanel userId={userId} />}
    </>
  );

  // Image Upload State
  const [mediaFiles, setMediaFiles] = useState(
    isEditMode && editEntry.media_urls ? [...editEntry.media_urls]
      : defaultMediaUrls && defaultMediaUrls.length > 0 ? [...defaultMediaUrls]
        : []
  );
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    if (!requireOnlineNow(toast)) return;

    setUploading(true);
    const newUploads = [];

    try {
      for (const file of files) {
        // Validate
        if (!file.type.startsWith('image/')) {
          toast.error(`Skipped ${file.name} (not an image)`);
          continue;
        }
        if (file.size > 5 * 1024 * 1024) {
          toast.error(`Skipped ${file.name} (too large, max 5MB)`);
          continue;
        }

        // Same bucket fix as the receipt scanner. `images` has no INSERT
        // policy for browser clients, so every one of these uploads was being
        // refused with "new row violates row-level security policy" too.
        const publicUrl = await uploadBankrollImage(supabase, userId, file, file.type || 'image/jpeg');
        newUploads.push(publicUrl);
      }

      setMediaFiles(prev => [...prev, ...newUploads]);
      // Photo upload success toast removed per user request
    } catch (error) {
      console.warn('Upload failed:', error);
      toast.error('Failed to upload image');
    } finally {
      setUploading(false);
      // Reset input
      if (e.target) e.target.value = '';
    }
  };

  const removeImage = (index) => {
    setMediaFiles(prev => prev.filter((_, i) => i !== index));
  };


  const renderDetailsForm = () => {
    const netResult = calculateNetResult();
    const isExpense = category === 'expense';
    const buyInField = category === 'poker_mtt' ? 'buy_in_amount' : 'gross_in';
    const typedLegs = category === 'poker_mtt'
      ? (() => { const t = tournamentAmounts(formData, editView?.bounties_collected); return { grossIn: t.stake, grossOut: t.payout }; })()
      : { grossIn: parseFloat(formData.gross_in) || 0, grossOut: isExpense ? 0 : parseFloat(formData.gross_out) || 0 };
    const savedPreview = usdSavedPreview({ currency: currencyState.currency, rate: currencyState.rate, ...typedLegs, isExpense });

    return (
      <form onSubmit={handleSubmit} style={styles.form}>
        {/* Amount Fields */}
        <div style={styles.amountSection}>
          <EntryCurrencyFields
            value={currencyState}
            onChange={setCurrencyState}
            entryDay={formData.entry_date}
            editEntry={editEntry}
            idPrefix={fieldId('money')}
          />
          {isExpense ? (
            <div style={styles.formGroup}>
              <label htmlFor={fieldId('amount')} style={styles.label}>Amount ({unit})</label>
              <input
                id={fieldId('amount')}
                type="number"
                inputMode="decimal"
                step="0.01"
                value={formData.gross_in}
                onChange={(e) => handleInputChange('gross_in', e.target.value)}
                placeholder="0.00"
                style={styles.input}
                required
                autoFocus
              />
            </div>
          ) : (
            <div style={styles.amountRow}>
              <div style={styles.formGroup}>
                <label htmlFor={fieldId('buy-in')} style={styles.label}>Buy-In ({unit})</label>
                <input
                  id={fieldId('buy-in')}
                  type="number"
                inputMode="decimal"
                  step="0.01"
                  value={formData[buyInField]}
                  onChange={(e) => handleInputChange(buyInField, e.target.value)}
                  placeholder="0.00"
                  style={styles.input}
                  required
                  autoFocus
                />
              </div>
              <div style={styles.formGroup}>
                <label htmlFor={fieldId('cash-out')} style={styles.label}>Cash-Out ({unit})</label>
                <input
                  id={fieldId('cash-out')}
                  type="number"
                inputMode="decimal"
                  step="0.01"
                  value={formData.gross_out}
                  onChange={(e) => handleInputChange('gross_out', e.target.value)}
                  onFocus={(e) => { if (e.target.value === '0' || e.target.value === '0.00') e.target.value = ''; handleInputChange('gross_out', ''); }}
                  onBlur={(e) => { if (!e.target.value) handleInputChange('gross_out', '0'); }}
                  placeholder="0.00"
                  style={styles.input}
                />
              </div>
            </div>
          )}

          {/* Net Result Display */}
          {!isExpense && (formData[buyInField] || formData.gross_out) && (
            <div
              style={{
                ...styles.netResult,
                color: netResult >= 0 ? '#22c55e' : '#ef4444',
              }}
            >
              {/* Entry form: the preview is the result as typed. A US dollar entry
                  is stored as shown; a foreign one also shows the US dollar
                  amount it is saved as (EntryCurrencyFields), never Display EUR. */}
              {typedForeign
                ? `Net (${currencyState.currency}): ${netResult >= 0 ? '+' : '-'}${Math.abs(netResult).toLocaleString()}`
                : <>Net (USD): {netResult >= 0 ? '+' : '-'}${Math.abs(netResult).toLocaleString()}</>}
            </div>
          )}
          {savedPreview && (
            <p data-testid="entry-usd-preview" style={{ margin: '8px 0 0', fontSize: 13, fontWeight: 600, color: '#94e7ff', textAlign: 'center' }}>{savedPreview}</p>
          )}
        </div>

        {/* Category-specific fields */}
        {category === 'poker_cash' && (
          <div style={styles.amountRow}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Stakes</label>
              {savedStakes.length > 0 && !customStakes ? (
                <select
                  value={formData.stakes}
                  onChange={(e) => {
                    if (e.target.value === '__custom__') {
                      setCustomStakes(true);
                      handleInputChange('stakes', '');
                    } else {
                      handleInputChange('stakes', e.target.value);
                    }
                  }}
                  style={styles.select}
                >
                  <option value="">Select Stakes...</option>
                  {savedStakes.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                  <option value="__custom__">+ Custom Stakes</option>
                </select>
              ) : (
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    type="text"
                    value={formData.stakes}
                    onChange={(e) => handleInputChange('stakes', e.target.value)}
                    placeholder="e.g., 2/5 NL"
                    style={{ ...styles.input, flex: 1 }}
                  />
                  {savedStakes.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setCustomStakes(false)}
                      style={{ ...styles.input, flex: 'none', width: 40, cursor: 'pointer', textAlign: 'center', padding: 0 }}
                    >↩</button>
                  )}
                </div>
              )}
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Game Type</label>
              <select
                value={formData.game_type}
                onChange={(e) => handleInputChange('game_type', e.target.value)}
                style={styles.select}
              >
                <option value="nlhe">No Limit Hold'em</option>
                <option value="plo">Pot Limit Omaha</option>
                <option value="mixed">Mixed Games</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
        )}

        {category === 'poker_mtt' && (
          <>
            <div style={styles.formGroup}>
              <label htmlFor={fieldId('tournament-name')} style={styles.label}>Tournament Name</label>
              <input
                id={fieldId('tournament-name')}
                type="text"
                value={formData.tournament_name}
                onChange={(e) => handleInputChange('tournament_name', e.target.value)}
                style={styles.input}
              />
            </div>

            {/* Tournament Type Dropdown */}
            <div style={styles.formGroup}>
              <label htmlFor={fieldId('tournament-type')} style={styles.label}>Tournament Type</label>
              <select
                id={fieldId('tournament-type')}
                value={formData.tournament_type}
                onChange={(e) => handleInputChange('tournament_type', e.target.value)}
                style={styles.select}
              >
                <option value="">Select Type...</option>
                <option value="mtt">MTT</option>
                <option value="satellite">Satellite</option>
                <option value="bounty">Bounty</option>
                <option value="mystery_bounty">Mystery Bounty</option>
                <option value="pko">PKO</option>
                <option value="sit_n_go">Sit N Go</option>
              </select>
            </div>

            {/* Bounties Collected - only for bounty types */}
            {['bounty', 'mystery_bounty', 'pko'].includes(formData.tournament_type) && (
              <div style={styles.formGroup}>
                <label htmlFor={fieldId('bounties')} style={{ ...styles.label, color: '#22c55e' }}>Bounties Collected ({unit})</label>
                <input
                  id={fieldId('bounties')}
                  type="number"
                inputMode="decimal"
                  step="0.01"
                  value={formData.bounties_collected}
                  onChange={(e) => handleInputChange('bounties_collected', e.target.value)}
                  placeholder="Total bounty $ received"
                  style={{ ...styles.input, borderColor: 'rgba(34,197,94,0.3)' }}
                />
              </div>
            )}

            <div style={styles.amountRow}>
              <div style={styles.formGroup}>
                <label htmlFor={fieldId('finish')} style={styles.label}>Finish Position</label>
                <input
                  id={fieldId('finish')}
                  type="number"
                inputMode="decimal"
                  value={formData.finish_position}
                  onChange={(e) => handleInputChange('finish_position', e.target.value)}
                  style={styles.input}
                />
              </div>
              <div style={styles.formGroup}>
                <label htmlFor={fieldId('field-size')} style={styles.label}>Field Size</label>
                <input
                  id={fieldId('field-size')}
                  type="number"
                inputMode="decimal"
                  value={formData.field_size}
                  onChange={(e) => handleInputChange('field_size', e.target.value)}
                  style={styles.input}
                />
              </div>
            </div>

            {/* Rebuys & Add-On Row */}
            <div style={styles.amountRow}>
              <div style={styles.formGroup}>
                <label htmlFor={fieldId('rebuys')} style={styles.label}>Rebuys</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                  <button
                    aria-label="Decrease Rebuys"
                    type="button"
                    onClick={() => {
                      const cur = parseInt(formData.reentry_count) || 0;
                      if (cur > 0) handleInputChange('reentry_count', (cur - 1).toString());
                    }}
                    style={{ ...styles.input, flex: 'none', width: 40, textAlign: 'center', cursor: 'pointer', padding: '12px 0', borderTopRightRadius: 0, borderBottomRightRadius: 0, borderRight: 'none', fontSize: 18, fontWeight: 700 }}
                  >-</button>
                  <input
                    id={fieldId('rebuys')}
                    type="number"
                inputMode="decimal"
                    min="0"
                    value={formData.reentry_count}
                    onChange={(e) => handleInputChange('reentry_count', e.target.value)}
                    style={{ ...styles.input, flex: 1, textAlign: 'center', borderRadius: 0, borderLeft: 'none', borderRight: 'none' }}
                  />
                  <button
                    aria-label="Increase Rebuys"
                    type="button"
                    onClick={() => {
                      const cur = parseInt(formData.reentry_count) || 0;
                      handleInputChange('reentry_count', (cur + 1).toString());
                    }}
                    style={{ ...styles.input, flex: 'none', width: 40, textAlign: 'center', cursor: 'pointer', padding: '12px 0', borderTopLeftRadius: 0, borderBottomLeftRadius: 0, borderLeft: 'none', fontSize: 18, fontWeight: 700 }}
                  >+</button>
                </div>
              </div>
              <div style={styles.formGroup}>
                <label htmlFor={fieldId('add-on')} style={styles.label}>Add-On ({unit})</label>
                <input
                  id={fieldId('add-on')}
                  type="number"
                inputMode="decimal"
                  step="0.01"
                  value={formData.add_on_amount}
                  onChange={(e) => handleInputChange('add_on_amount', e.target.value)}
                  onFocus={(e) => { if (e.target.value === '0') { e.target.value = ''; handleInputChange('add_on_amount', ''); } }}
                  onBlur={(e) => { if (!e.target.value) handleInputChange('add_on_amount', ''); }}
                  style={styles.input}
                />
              </div>
            </div>

            {/* Total Buy-In Display */}
            {(() => {
              const { buyIn, rebuys, addOn, stake: totalBuyIn } = tournamentAmounts(formData, editView?.bounties_collected);
              if (buyIn > 0 && (rebuys > 0 || addOn > 0)) {
                return (
                  <div style={{ padding: '8px 12px', background: 'rgba(55, 127, 194,0.1)', border: '1px solid rgba(55, 127, 194,0.3)', borderRadius: 8, fontSize: 13, color: '#377fc2', textAlign: 'center', marginBottom: 8 }}>
                    Total Buy-In: <strong>{noteMoney(currencyState.currency, totalBuyIn, { grouped: true })}</strong>
                    {rebuys > 0 && <span> ({1 + rebuys} Bullets × {noteMoney(currencyState.currency, buyIn, { grouped: true })}{addOn > 0 ? ` + ${noteMoney(currencyState.currency, addOn, { grouped: true })} add-on` : ''})</span>}
                    {rebuys === 0 && addOn > 0 && <span> ({noteMoney(currencyState.currency, buyIn, { grouped: true })} + {noteMoney(currencyState.currency, addOn, { grouped: true })} Add-On)</span>}
                  </div>
                );
              }
              return null;
            })()}

            {/* Swap Deductions - Collapsible */}
            <div style={{ ...styles.formGroup, marginTop: 8, padding: '0', background: 'rgba(255,255,255,0.1)', borderRadius: 8, border: '2px solid rgba(255,255,255,0.15)' }}>
              <button
                type="button"
                aria-expanded={showSwaps}
                onClick={() => setShowSwaps(!showSwaps)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '10px 12px', background: 'none', border: 'none', cursor: 'pointer', color: '#b6c9dd', fontSize: 14, fontWeight: 500 }}
              >
                <span>Swap Deductions</span>
                <span aria-hidden="true" style={{ fontSize: 14, transition: 'transform 0.2s', transform: showSwaps ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
              </button>
              {showSwaps && (
                <div style={{ padding: '0 12px 12px' }}>
                  <div style={styles.amountRow}>
                    <div style={styles.formGroup}>
                      <label htmlFor={fieldId('swap-player')} style={styles.label}>Player Name</label>
                      {savedSwapNames.length > 0 && !customSwapName ? (
                        <select
                          id={fieldId('swap-player')}
                          value={formData.swap_player}
                          onChange={(e) => {
                            if (e.target.value === '__custom__') {
                              setCustomSwapName(true);
                              handleInputChange('swap_player', '');
                            } else {
                              handleInputChange('swap_player', e.target.value);
                            }
                          }}
                          style={styles.select}
                        >
                          <option value="">Select Player...</option>
                          {savedSwapNames.map(n => (
                            <option key={n} value={n}>{n}</option>
                          ))}
                          <option value="__custom__">+ New Name</option>
                        </select>
                      ) : (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <input
                            id={fieldId('swap-player')}
                            type="text"
                            value={formData.swap_player}
                            onChange={(e) => handleInputChange('swap_player', e.target.value)}
                            style={{ ...styles.input, flex: 1 }}
                          />
                          {savedSwapNames.length > 0 && (
                            <button
                              type="button"
                              aria-label="Choose A Saved Player"
                              onClick={() => setCustomSwapName(false)}
                              style={{ ...styles.input, flex: 'none', width: 40, cursor: 'pointer', textAlign: 'center', padding: 0 }}
                            >↩</button>
                          )}
                        </div>
                      )}
                    </div>
                    <div style={styles.formGroup}>
                      <label htmlFor={fieldId('swap-amount')} style={styles.label}>Swap Amount ({unit})</label>
                      <input
                        id={fieldId('swap-amount')}
                        type="number"
                inputMode="decimal"
                        step="0.01"
                        value={formData.swap_amount}
                        onChange={(e) => handleInputChange('swap_amount', e.target.value)}
                        onFocus={(e) => { if (e.target.value === '0') { e.target.value = ''; handleInputChange('swap_amount', ''); } }}
                        onBlur={(e) => { if (!e.target.value) handleInputChange('swap_amount', ''); }}
                        style={styles.input}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Staking Deductions - Collapsible */}
            <div style={{ ...styles.formGroup, marginTop: 8, padding: '0', background: 'rgba(255,255,255,0.1)', borderRadius: 8, border: '2px solid rgba(255,255,255,0.15)' }}>
              <button
                type="button"
                aria-expanded={showStaking}
                onClick={() => setShowStaking(!showStaking)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '10px 12px', background: 'none', border: 'none', cursor: 'pointer', color: '#b6c9dd', fontSize: 14, fontWeight: 500 }}
              >
                <span>Staking Deductions</span>
                <span aria-hidden="true" style={{ fontSize: 14, transition: 'transform 0.2s', transform: showStaking ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
              </button>
              {showStaking && (
                <div style={{ padding: '0 12px 12px' }}>
                  <div style={styles.amountRow}>
                    <div style={styles.formGroup}>
                      <label htmlFor={fieldId('staker')} style={styles.label}>Staker Name</label>
                      {savedStakerNames.length > 0 && !customStakerName ? (
                        <select
                          id={fieldId('staker')}
                          value={formData.staker_name}
                          onChange={(e) => {
                            if (e.target.value === '__custom__') {
                              setCustomStakerName(true);
                              handleInputChange('staker_name', '');
                            } else {
                              handleInputChange('staker_name', e.target.value);
                            }
                          }}
                          style={styles.select}
                        >
                          <option value="">Select Staker...</option>
                          {savedStakerNames.map(n => (
                            <option key={n} value={n}>{n}</option>
                          ))}
                          <option value="__custom__">+ New Name</option>
                        </select>
                      ) : (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <input
                            id={fieldId('staker')}
                            type="text"
                            value={formData.staker_name}
                            onChange={(e) => handleInputChange('staker_name', e.target.value)}
                            style={{ ...styles.input, flex: 1 }}
                          />
                          {savedStakerNames.length > 0 && (
                            <button
                              type="button"
                              aria-label="Choose A Saved Staker"
                              onClick={() => setCustomStakerName(false)}
                              style={{ ...styles.input, flex: 'none', width: 40, cursor: 'pointer', textAlign: 'center', padding: 0 }}
                            >↩</button>
                          )}
                        </div>
                      )}
                    </div>
                    <div style={styles.formGroup}>
                      <label htmlFor={fieldId('staker-amount')} style={styles.label}>Amount Paid ({unit})</label>
                      <input
                        id={fieldId('staker-amount')}
                        type="number"
                inputMode="decimal"
                        step="0.01"
                        value={formData.staker_amount}
                        onChange={(e) => handleInputChange('staker_amount', e.target.value)}
                        onFocus={(e) => { if (e.target.value === '0') { e.target.value = ''; handleInputChange('staker_amount', ''); } }}
                        onBlur={(e) => { if (!e.target.value) handleInputChange('staker_amount', ''); }}
                        style={styles.input}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Sold Action - Collapsible */}
            <div style={{ ...styles.formGroup, marginTop: 8, padding: '0', background: 'rgba(255,255,255,0.1)', borderRadius: 8, border: '2px solid rgba(255,255,255,0.15)' }}>
              <button
                type="button"
                aria-expanded={showSoldAction}
                onClick={() => setShowSoldAction(!showSoldAction)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '10px 12px', background: 'none', border: 'none', cursor: 'pointer', color: '#b6c9dd', fontSize: 14, fontWeight: 500 }}
              >
                <span>Sold Action</span>
                <span aria-hidden="true" style={{ fontSize: 14, transition: 'transform 0.2s', transform: showSoldAction ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
              </button>
              {showSoldAction && (
                <div style={{ padding: '0 12px 12px' }}>
                  <div style={styles.amountRow}>
                    <div style={styles.formGroup}>
                      <label htmlFor={fieldId('buyer')} style={styles.label}>Buyer Name</label>
                      <input
                        id={fieldId('buyer')}
                        type="text"
                        value={formData.action_buyer}
                        onChange={(e) => handleInputChange('action_buyer', e.target.value)}
                        style={styles.input}
                      />
                    </div>
                    <div style={styles.formGroup}>
                      <label htmlFor={fieldId('sold')} style={styles.label}>% Sold</label>
                      <input
                        id={fieldId('sold')}
                        type="number"
                inputMode="decimal"
                        step="1"
                        value={formData.action_percentage}
                        onChange={(e) => handleInputChange('action_percentage', e.target.value)}
                        style={styles.input}
                      />
                    </div>
                  </div>
                  <div style={{ ...styles.amountRow, marginTop: 8 }}>
                    <div style={styles.formGroup}>
                      <label htmlFor={fieldId('markup')} style={styles.label}>Markup %</label>
                      <input
                        id={fieldId('markup')}
                        type="number"
                inputMode="decimal"
                        step="1"
                        value={formData.action_markup}
                        onChange={(e) => handleInputChange('action_markup', e.target.value)}
                        style={styles.input}
                      />
                    </div>
                    <div style={styles.formGroup}>
                      <label htmlFor={fieldId('action-amount')} style={styles.label}>Amount Received ({unit})</label>
                      <input
                        id={fieldId('action-amount')}
                        type="number"
                inputMode="decimal"
                        step="0.01"
                        value={formData.action_amount}
                        onChange={(e) => handleInputChange('action_amount', e.target.value)}
                        onFocus={(e) => { if (e.target.value === '0') { e.target.value = ''; handleInputChange('action_amount', ''); } }}
                        onBlur={(e) => { if (!e.target.value) handleInputChange('action_amount', ''); }}
                        style={styles.input}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {category === 'casino_table' && (
          <div style={styles.formGroup}>
            <label style={styles.label}>Game</label>
            <select
              value={formData.casino_game}
              onChange={(e) => handleInputChange('casino_game', e.target.value)}
              style={styles.select}
            >
              {CASINO_GAMES.map((g) => (
                <option key={g} value={g}>
                  {g.charAt(0).toUpperCase() + g.slice(1)}
                </option>
              ))}
            </select>
          </div>
        )}

        {category === 'slots' && (
          <div style={styles.formGroup}>
            <label style={styles.label}>Game / Machine Name</label>
            {savedSlotGames.length > 0 && !customSlotGame ? (
              <select
                value={formData.slot_machine}
                onChange={(e) => {
                  if (e.target.value === '__custom__') {
                    setCustomSlotGame(true);
                    handleInputChange('slot_machine', '');
                  } else {
                    handleInputChange('slot_machine', e.target.value);
                  }
                }}
                style={styles.select}
              >
                <option value="">Select Game...</option>
                {savedSlotGames.map(g => (
                  <option key={g} value={g}>{g}</option>
                ))}
                <option value="__custom__">+ New Game</option>
              </select>
            ) : (
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="text"
                  value={formData.slot_machine}
                  onChange={(e) => handleInputChange('slot_machine', e.target.value)}
                  placeholder="e.g., Piggy Banking, Huff N Puff, Bubble Craps"
                  style={{ ...styles.input, flex: 1 }}
                />
                {savedSlotGames.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setCustomSlotGame(false)}
                    style={{ ...styles.input, flex: 'none', width: 40, cursor: 'pointer', textAlign: 'center', padding: 0 }}
                  >↩</button>
                )}
              </div>
            )}
          </div>
        )}

        {category === 'sports' && (
          <>
            <div style={styles.amountRow}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Sport</label>
                <select
                  value={formData.sport}
                  onChange={(e) => {
                    handleInputChange('sport', e.target.value);
                    if (e.target.value !== '__custom__') {
                      setCustomSportName(false);
                    } else {
                      setCustomSportName(true);
                    }
                  }}
                  style={styles.select}
                >
                  <option value="">Select...</option>
                  {SPORTS.map((s) => (
                    <option key={s} value={s}>
                      {s === 'boxing_mma' ? 'Boxing / MMA' : s.charAt(0).toUpperCase() + s.slice(1)}
                    </option>
                  ))}
                  <option value="__custom__">+ Custom Sport</option>
                </select>
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Bet Type</label>
                <select
                  value={formData.bet_type}
                  onChange={(e) => handleInputChange('bet_type', e.target.value)}
                  style={styles.select}
                >
                  <option value="">Select...</option>
                  {BET_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.charAt(0).toUpperCase() + t.slice(1).replace('_', '/')}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {customSportName && (
              <div style={styles.formGroup}>
                <label style={styles.label}>Custom Sport Name</label>
                <input
                  type="text"
                  value={formData.custom_sport_name || ''}
                  onChange={(e) => handleInputChange('custom_sport_name', e.target.value)}
                  placeholder="e.g., Soccer, Tennis, Golf"
                  style={styles.input}
                />
              </div>
            )}
            <div style={styles.formGroup}>
              <label style={styles.label}>Event / Game</label>
              <input
                type="text"
                value={formData.sport_event}
                onChange={(e) => handleInputChange('sport_event', e.target.value)}
                placeholder="e.g., Chiefs vs Eagles, Lakers vs Celtics"
                style={styles.input}
              />
            </div>
          </>
        )}

        {category === 'expense' && (
          <div style={styles.formGroup}>
            <label style={styles.label}>Expense Type</label>
            <select
              value={formData.expense_type}
              onChange={(e) => handleInputChange('expense_type', e.target.value)}
              style={styles.select}
              required
            >
              <option value="">Select...</option>
              {EXPENSE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.charAt(0).toUpperCase() + t.slice(1).replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Location / Venue */}
        <div style={styles.formGroup}>
          <label htmlFor={fieldId('venue')} style={styles.label}>Location / Venue</label>
          <VenueSelector
            inputId={fieldId('venue')}
            value={formData.location_name}
            venueType={formData.venue_type}
            userId={userId}
            onChange={(name, venueType, pokerVenueId, lat, lng) => {
              handleInputChange('location_name', name);
              handleInputChange('venue_type', venueType);
              handleInputChange('poker_venue_id', pokerVenueId);
              handleInputChange('venue_lat', lat);
              handleInputChange('venue_lng', lng);
              // Clear location_id so getOrCreateLocation will run on submit
              handleInputChange('location_id', '');
            }}
          />
        </div>

        {/* ALL FIELDS ALWAYS VISIBLE (No Toggle) */}

        <div style={{ marginTop: 16 }}>
          <div style={styles.formGroup}>
            <label htmlFor={fieldId('date')} style={styles.label}>Date</label>
            <input
              id={fieldId('date')}
              type="date"
              value={formData.entry_date}
              onChange={(e) => handleInputChange('entry_date', e.target.value)}
              style={styles.input}
            />
          </div>
          {/* Active Trip Banner */}
          {activeTrip && !isEditMode && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'rgba(16, 185, 129, 0.1)',
              border: '2px solid rgba(16, 185, 129, 0.25)',
              borderRadius: 8, padding: '10px 14px', marginBottom: 12, marginTop: 12
            }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px rgba(16,185,129,0.5)', flexShrink: 0 }} />
              <span style={{ fontSize: 14, color: '#10b981', fontWeight: 500 }}>
                Adding To: <strong>{activeTrip.name}</strong>
              </span>
            </div>
          )}
          {activeTrip && !isEditMode ? (
            /* Active trip auto-assigned - dropdown not needed, banner above suffices */
            null
          ) : trips.length > 0 && (
            <div style={styles.formGroup}>
              <label htmlFor={fieldId('trip')} style={styles.label}>Trip</label>
              <select
                id={fieldId('trip')}
                value={formData.trip_id}
                onChange={(e) => {
                  if (e.target.value === '__new__') {
                    window.open('/hub/bankroll-manager?view=trips', '_blank');
                  } else {
                    handleInputChange('trip_id', e.target.value);
                  }
                }}
                style={styles.select}
              >
                <option value="">None</option>
                {trips.map((trip) => (
                  <option key={trip.id} value={trip.id}>
                    {trip.name}{trip.status === 'active' ? ' (Active)' : ''}
                  </option>
                ))}
                <option value="__new__">+ New Trip</option>
              </select>
            </div>
          )}
        </div>

        {!isExpense && (
          <div style={styles.amountRow}>
            <div style={styles.formGroup}>
              <label htmlFor={fieldId('start-time')} style={styles.label}>Start Time</label>
              <div style={{ display: 'flex', gap: 0, alignItems: 'center' }}>
                <input
                  id={fieldId('start-time')}
                  type="text"
                  inputMode="numeric"
                  value={formData.start_time_text}
                  onChange={(e) => {
                    let v = e.target.value.replace(/[^0-9:]/g, '');
                    if (v.length > 5) v = v.substring(0, 5);
                    handleInputChange('start_time_text', v);
                  }}
                  placeholder="0:00"
                  style={{ ...styles.input, flex: 1, borderTopRightRadius: 0, borderBottomRightRadius: 0, borderRight: 'none' }}
                />
                <select
                  aria-label="Start Time Period"
                  value={formData.start_period}
                  onChange={(e) => handleInputChange('start_period', e.target.value)}
                  style={{ ...styles.input, width: 70, flex: 'none', borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
                >
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              </div>
            </div>
            <div style={styles.formGroup}>
              <label htmlFor={fieldId('end-time')} style={styles.label}>End Time</label>
              <div style={{ display: 'flex', gap: 0, alignItems: 'center' }}>
                <input
                  id={fieldId('end-time')}
                  type="text"
                  inputMode="numeric"
                  value={formData.end_time_text}
                  onChange={(e) => {
                    let v = e.target.value.replace(/[^0-9:]/g, '');
                    if (v.length > 5) v = v.substring(0, 5);
                    handleInputChange('end_time_text', v);
                  }}
                  placeholder="0:00"
                  style={{ ...styles.input, flex: 1, borderTopRightRadius: 0, borderBottomRightRadius: 0, borderRight: 'none' }}
                />
                <select
                  aria-label="End Time Period"
                  value={formData.end_period}
                  onChange={(e) => handleInputChange('end_period', e.target.value)}
                  style={{ ...styles.input, width: 70, flex: 'none', borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
                >
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              </div>
            </div>
          </div>
        )}

        <div style={styles.formGroup}>
          <label htmlFor={fieldId('emotion')} style={styles.label}>Emotional State</label>
          <select
            id={fieldId('emotion')}
            value={formData.emotional_tag}
            onChange={(e) => handleInputChange('emotional_tag', e.target.value)}
            style={styles.select}
          >
            <option value="">None</option>
            {EMOTIONAL_TAGS.map((tag) => (
              <option key={tag} value={tag}>
                {tag.charAt(0).toUpperCase() + tag.slice(1)}
              </option>
            ))}
          </select>
        </div>

        {/* Inline Expense - available on all non-expense categories */}
        {!isExpense && (
          <div role="group" aria-labelledby={fieldId('expense-group')} style={{ ...styles.formGroup, padding: 12, background: 'rgba(255,255,255,0.1)', borderRadius: 8, border: '2px solid rgba(255,255,255,0.15)' }}>
            <div id={fieldId('expense-group')} style={{ ...styles.label, fontSize: 14, color: '#b6c9dd', marginBottom: 8 }}>Session Expense (Optional)</div>
            <div style={styles.amountRow}>
              <div style={styles.formGroup}>
                <label htmlFor={fieldId('expense-type')} style={styles.label}>Type</label>
                <select
                  id={fieldId('expense-type')}
                  value={formData.inline_expense_type}
                  onChange={(e) => handleInputChange('inline_expense_type', e.target.value)}
                  style={styles.select}
                >
                  <option value="">None</option>
                  {EXPENSE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.charAt(0).toUpperCase() + t.slice(1).replace('_', ' ')}
                    </option>
                  ))}
                </select>
              </div>
              <div style={styles.formGroup}>
                <label htmlFor={fieldId('expense-amount')} style={styles.label}>Amount ({unit})</label>
                <input
                  id={fieldId('expense-amount')}
                  type="number"
                inputMode="decimal"
                  step="0.01"
                  value={formData.inline_expense_amount}
                  onChange={(e) => handleInputChange('inline_expense_amount', e.target.value)}
                  placeholder="0.00"
                  style={styles.input}
                />
              </div>
            </div>
          </div>
        )}

        <div style={styles.formGroup}>
          <label htmlFor={fieldId('notes')} style={styles.label}>Session Notes</label>
          <textarea
            id={fieldId('notes')}
            value={formData.notes}
            onChange={(e) => handleInputChange('notes', e.target.value)}
            placeholder="Key Hands, Table Dynamics, Reads On Players, Mental State, Lessons Learned..."
            style={{ ...styles.textarea, minHeight: 100 }}
          />
        </div>

        {/* IMAGE UPLOAD */}
        <div style={{ ...styles.formGroup, textAlign: 'center' }}>
          <label htmlFor={fieldId('photos')} style={styles.label}>Session Photos</label>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 10, justifyContent: 'center' }}>
            {mediaFiles.map((url, index) => (
              <div key={index} style={{ position: 'relative', width: 80, height: 80, borderRadius: 8, overflow: 'hidden', border: '2px solid rgba(255,255,255,0.2)' }}>
                <img src={url} alt="Session" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <button
                  type="button"
                  onClick={() => removeImage(index)}
                  style={{
                    position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,0.6)', color: 'white',
                    border: 'none', borderRadius: '50%', width: 20, height: 20, display: 'flex',
                    alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 14
                  }}
                >
                  ×
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              style={{
                width: 80, height: 80, borderRadius: 8, border: '1px dashed rgba(255,255,255,0.3)',
                background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.7)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', fontSize: 14
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.5)' }}>SCAN</span>
              {uploading ? '...' : 'Add'}
            </button>
          </div>

          <input
            id={fieldId('photos')}
            ref={fileInputRef}
            disabled={uploading}
            type="file"
            accept="image/*"
            multiple
            onChange={handleImageUpload}
            style={{ display: 'none' }}
          />
        </div>


        {isEditMode && editEntry.id && (
          <LedgerEntryHistory userId={userId} entryId={editEntry.id} displayEUR={displayEUR} />
        )}

        {/* Actions: sticky above the keyboard-safe bottom of the sheet */}
        <div className="bankroll-modal-footer" style={styles.actions}>
          <button
            type="button"
            onClick={() => setStep('category')}
            style={styles.backButton}
          >
            Back
          </button>
          <button
            type="submit"
            disabled={isSubmitting || uploading}
            style={{
              ...styles.submitButton,
              opacity: (isSubmitting || uploading) ? 0.6 : 1,
            }}
          >
            {isSubmitting ? (isEditMode ? 'Saving...' : 'Logging...') : uploading ? 'Uploading...' : (isEditMode ? 'Save Changes' : 'Log Entry')}
          </button>
        </div>
      </form>
    );
  };

  return (
    <motion.div
      className="bankroll-modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={styles.overlay}
      {...scrim}
    >
      <motion.div
        className="bankroll-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={fieldId('title')}
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        style={styles.modal}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bankroll-sheet-handle" aria-hidden="true" />
        <div className="bankroll-modal-header" style={styles.header}>
          <h2 id={fieldId('title')} style={styles.title}>
            {isEditMode
              ? `Edit ${CATEGORIES.find((c) => c.id === category)?.label || 'Entry'}`
              : step === 'category'
                ? 'Log Session'
                : `Log ${CATEGORIES.find((c) => c.id === category)?.label || 'Entry'}`}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="bankroll-modal-close sp-icon-btn" style={styles.closeButton}>
            ×
          </button>
        </div>

        <div className="bankroll-modal-body" style={styles.content}>
          {onStartLiveSession && !isEditMode && !live && !defaultPrefillData && category !== 'expense' && (
            <button type="button" className="sd-button" data-testid="bankroll-start-live-session"
              onClick={() => onStartLiveSession(category)}
              style={{ width: '100%', minHeight: 44, marginBottom: 14 }}>
              Start Live Session Instead
            </button>
          )}
          {step === 'category' ? renderCategorySelector() : renderDetailsForm()}
        </div>
      </motion.div>
    </motion.div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    // Above the fixed global header (z-index 10050), level with the other
    // dialogs that must clear it (HamburgerMenu, the Poker Near Me panel).
    // At 1000 the sheet slid under the header: once the Log Session step
    // grew taller (the Club Arena sessions panel, #3294) its title and Close
    // sat beneath the header on a 720px-tall desktop and could not be clicked.
    zIndex: 10100,
    padding: 20,
  },
  modal: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '90dvh',
    paddingBottom: 'env(safe-area-inset-bottom, 0px)',

    borderRadius: 16,

    outline: '3px solid rgba(255, 255, 255, 0.3)',
    outlineOffset: '2px',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 24px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    flexShrink: 0,
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    color: '#fff',
    margin: 0,
  },
  closeButton: {
    width: 44,
    height: 44,
    minWidth: 44,
    minHeight: 44,
    borderRadius: '50%',
    touchAction: 'manipulation',
    WebkitTapHighlightColor: 'transparent',
    background: 'rgba(255, 255, 255, 0.1)',
    border: 'none',
    color: '#fff',
    fontSize: 20,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: '24px 24px 0',
    overflowY: 'auto',
    flex: 1,
  },
  categoryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 12,
  },
  categoryCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    background: GRADIENTS.darkPanel,
    border: `1px solid ${METAL.highlight}`,
    borderRadius: 12,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  categoryIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  categoryLabel: {
    fontSize: 14,
    fontWeight: 500,
    color: '#fff',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  amountSection: {
    marginBottom: 8,
  },
  amountRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 12,
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: 500,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  input: {
    padding: '12px 14px',
    background: 'rgba(0, 0, 0, 0.3)',
    border: '2px solid rgba(255, 255, 255, 0.15)',
    borderRadius: 8,
    color: '#fff',
    fontSize: 16,
    minHeight: 44,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  select: {
    padding: '12px 14px',
    background: 'rgba(0, 0, 0, 0.3)',
    border: '2px solid rgba(255, 255, 255, 0.15)',
    borderRadius: 8,
    color: '#fff',
    fontSize: 16,
    minHeight: 44,
    outline: 'none',
    cursor: 'pointer',
    width: '100%',
    boxSizing: 'border-box',
  },
  textarea: {
    padding: '12px 14px',
    background: 'rgba(0, 0, 0, 0.3)',
    border: '2px solid rgba(255, 255, 255, 0.15)',
    borderRadius: 8,
    color: '#fff',
    fontSize: 16,
    outline: 'none',
    minHeight: 80,
    resize: 'vertical',
    width: '100%',
    boxSizing: 'border-box',
  },
  netResult: {
    marginTop: 12,
    padding: '12px 16px',
    background: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 8,
    fontSize: 18,
    fontWeight: 700,
    textAlign: 'center',
  },
  advancedToggle: {
    background: 'none',
    border: 'none',
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 14,
    cursor: 'pointer',
    padding: '8px 0',
    textAlign: 'left',
  },
  warningBox: {
    padding: 14,
    background: '#101f31',
    border: '2px solid #22394e',
    borderRadius: 10,
    fontSize: 14,
  },
  warningItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 10px',
    background: '#22394e',
    borderRadius: 8,
    flexWrap: 'wrap',
  },
  warningDismissBtn: {
    padding: '4px 10px',
    borderRadius: 6,
    border: '2px solid #41617b',
    background: 'transparent',
    color: '#b6c9dd',
    fontSize: 14,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  warningList: {
    margin: '8px 0 0',
    paddingLeft: 20,
  },
  actions: {
    display: 'flex',
    gap: 12,
    marginTop: 8,
    background: '#1a2a44',
    margin: '8px -24px 0',
    padding: '12px 24px 16px',
    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
  },
  backButton: {
    flex: 1,
    padding: 14,
    background: GRADIENTS.metalButton,
    border: `1px solid ${METAL.highlight}`,
    borderRadius: 8,
    color: '#edf6ff',
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
  },
  submitButton: {
    flex: 2,
    padding: 14,
    background: GRADIENTS.cyanAction,
    border: `1px solid ${METAL.highlight}`,
    borderRadius: 8,
    color: '#edf6ff',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
};

export default memo(LogEntryModal);
