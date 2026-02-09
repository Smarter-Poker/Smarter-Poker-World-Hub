/**
 * LOG ENTRY MODAL
 * Category-first session logging with minimal required fields
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { createLedgerEntry, updateLedgerEntry, getActiveTrip } from '../../lib/bankroll/bankrollSelectors';
import { getOrCreateLocation, detectNearbyLocation } from '../../lib/bankroll/locationMemory';
import { checkRuleViolations } from '../../lib/bankroll/leakDetection';
import toast from '../../stores/toastStore';

// Clean Facebook-style categories (no emojis)
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
const SPORTS = ['nfl', 'nba', 'mlb', 'nhl', 'soccer', 'mma', 'golf', 'tennis', 'other'];
const BET_TYPES = ['moneyline', 'spread', 'over_under', 'parlay', 'prop', 'live'];
const EMOTIONAL_TAGS = ['neutral', 'confident', 'tilted', 'exhausted', 'rushed', 'revenge'];

export default function LogEntryModal({ userId, locations, trips, editEntry, defaultCategory, onClose, onSubmit }) {
  const isEditMode = !!editEntry;
  const [step, setStep] = useState(isEditMode || defaultCategory ? 'details' : 'category');
  const [category, setCategory] = useState(isEditMode ? editEntry.category : (defaultCategory || null));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ruleWarnings, setRuleWarnings] = useState([]);
  const [savedStakes, setSavedStakes] = useState([]);
  const [customStakes, setCustomStakes] = useState(false);
  const [savedSwapNames, setSavedSwapNames] = useState([]);
  const [savedStakerNames, setSavedStakerNames] = useState([]);
  const [customSwapName, setCustomSwapName] = useState(false);
  const [customStakerName, setCustomStakerName] = useState(false);

  // Helper: convert 24h "HH:MM" to { hour, min, period }
  const to12h = (time24) => {
    if (!time24) return { hour: '', min: '', period: 'PM' };
    const [hStr, mStr] = time24.split(':');
    let h = parseInt(hStr, 10);
    const period = h >= 12 ? 'PM' : 'AM';
    if (h === 0) h = 12;
    else if (h > 12) h -= 12;
    return { hour: h.toString(), min: mStr || '', period };
  };

  // Helper: convert separate hour + min + period to 24h "HH:MM"
  const to24h = (hour, min, period) => {
    if (!hour || min === '') return '';
    let h = parseInt(hour, 10);
    if (isNaN(h)) return '';
    if (period === 'AM' && h === 12) h = 0;
    else if (period === 'PM' && h !== 12) h += 12;
    return `${h.toString().padStart(2, '0')}:${(min || '00').padStart(2, '0')}`;
  };

  // Form state
  const buildInitialFormData = () => {
    if (isEditMode) {
      const e = editEntry;
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
        entry_date: e.entry_date || new Date().toISOString().split('T')[0],
        start_hour: start12.hour,
        start_min: start12.min,
        start_period: start12.period,
        end_hour: end12.hour,
        end_min: end12.min,
        end_period: end12.period,
        notes: e.notes || '',
        emotional_tag: e.emotional_tag || '',
        stakes: e.stakes || '',
        game_type: e.game_type || 'nlhe',
        tournament_name: e.tournament_name || '',
        buy_in_amount: e.buy_in_amount?.toString() || '',
        finish_position: e.finish_position?.toString() || '',
        field_size: e.field_size?.toString() || '',
        reentry_count: e.reentry_count?.toString() || '0',
        casino_game: e.casino_game || 'blackjack',
        sport: e.sport || '',
        bet_type: e.bet_type || '',
        odds: e.odds || '',
        bet_result: e.bet_result || '',
        expense_type: e.expense_type || '',
      };
    }
    return {
      gross_in: '',
      gross_out: '0',
      location_id: '',
      location_name: '',
      trip_id: '',
      entry_date: new Date().toISOString().split('T')[0],
      start_hour: '',
      start_min: '',
      start_period: 'PM',
      end_hour: '',
      end_min: '',
      end_period: 'PM',
      notes: '',
      emotional_tag: '',
      stakes: '',
      game_type: 'nlhe',
      tournament_name: '',
      buy_in_amount: '',
      finish_position: '',
      field_size: '',
      reentry_count: '0',
      casino_game: 'blackjack',
      sport: '',
      bet_type: '',
      odds: '',
      bet_result: '',
      expense_type: '',
      swap_player: '',
      swap_amount: '',
      staker_name: '',
      staker_amount: '',
    };
  };

  const [formData, setFormData] = useState(buildInitialFormData);
  const [activeTrip, setActiveTrip] = useState(null);

  // Auto-detect location on mount
  useEffect(() => {
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

  // Load saved swap/staker names from localStorage
  useEffect(() => {
    try {
      const swapRaw = localStorage.getItem('bankroll_swap_names');
      if (swapRaw) setSavedSwapNames(JSON.parse(swapRaw));
      const stakerRaw = localStorage.getItem('bankroll_staker_names');
      if (stakerRaw) setSavedStakerNames(JSON.parse(stakerRaw));
    } catch (_) { /* ignore */ }
  }, []);

  // Auto-attach active trip for new entries
  useEffect(() => {
    if (!userId || isEditMode) return;
    getActiveTrip(userId).then(trip => {
      if (trip) {
        setActiveTrip(trip);
        setFormData(prev => ({ ...prev, trip_id: trip.id }));
      }
    }).catch(() => { });
  }, [userId, isEditMode]);

  const handleCategorySelect = (cat) => {
    setCategory(cat);
    setStep('details');
  };

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const calculateNetResult = () => {
    const grossIn = parseFloat(formData.gross_in) || 0;
    const grossOut = parseFloat(formData.gross_out) || 0;
    return grossOut - grossIn;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    setIsSubmitting(true);

    try {
      // Check for rule violations
      const netResult = calculateNetResult();
      const violations = await checkRuleViolations(userId, netResult);
      if (violations.violated) {
        setRuleWarnings(violations.rules);
        // Continue anyway - just surface the warning
      }

      // Get or create location if name provided but no ID
      let locationId = formData.location_id;
      if (locationId === '__new__') locationId = ''; // Sentinel for "new location" dropdown choice
      if (!locationId && formData.location_name) {
        locationId = await getOrCreateLocation(userId, formData.location_name);
      }

      // Build entry based on category
      const entry = {
        category,
        location_id: locationId || null,
        trip_id: formData.trip_id || null,
        entry_date: formData.entry_date,
        start_time: formData.start_hour
          ? `${formData.entry_date}T${to24h(formData.start_hour, formData.start_min, formData.start_period)}:00`
          : null,
        end_time: formData.end_hour
          ? `${formData.entry_date}T${to24h(formData.end_hour, formData.end_min, formData.end_period)}:00`
          : null,
        gross_in: parseFloat(formData.gross_in) || 0,
        gross_out: parseFloat(formData.gross_out) || 0,
        notes: formData.notes || null,
        media_urls: mediaFiles.length > 0 ? mediaFiles : null,
        emotional_tag: formData.emotional_tag || null,
      };

      // Add category-specific fields
      if (category === 'poker_cash') {
        entry.stakes = formData.stakes || null;
        entry.game_type = formData.game_type || null;
      } else if (category === 'poker_mtt') {
        entry.tournament_name = formData.tournament_name || null;
        entry.buy_in_amount = parseFloat(formData.buy_in_amount) || null;
        entry.finish_position = parseInt(formData.finish_position) || null;
        entry.field_size = parseInt(formData.field_size) || null;
        entry.reentry_count = parseInt(formData.reentry_count) || 0;
        // Subtract swap and staking amounts from gross_out
        const swapAmt = parseFloat(formData.swap_amount) || 0;
        const stakerAmt = parseFloat(formData.staker_amount) || 0;
        if (swapAmt > 0 || stakerAmt > 0) {
          entry.gross_out = Math.max(0, (entry.gross_out || 0) - swapAmt - stakerAmt);
          // Append swap/staking details to notes
          const parts = [];
          if (swapAmt > 0) parts.push(`Swap: ${formData.swap_player || 'Unknown'} — $${swapAmt}`);
          if (stakerAmt > 0) parts.push(`Staked by: ${formData.staker_name || 'Unknown'} — $${stakerAmt}`);
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
          } catch (_) { }
        }
        if (formData.staker_name) {
          try {
            const prev = JSON.parse(localStorage.getItem('bankroll_staker_names') || '[]');
            const updated = [...new Set([...prev, formData.staker_name])].sort();
            localStorage.setItem('bankroll_staker_names', JSON.stringify(updated));
            setSavedStakerNames(updated);
          } catch (_) { }
        }
      } else if (category === 'casino_table') {
        entry.casino_game = formData.casino_game || null;
      } else if (category === 'slots') {
        entry.slot_machine = formData.notes || null;
      } else if (category === 'sports') {
        entry.sport = formData.sport || null;
        entry.bet_type = formData.bet_type || null;
        entry.odds = formData.odds || null;
        entry.bet_result =
          netResult > 0 ? 'win' : netResult < 0 ? 'loss' : 'push';
      } else if (category === 'expense') {
        entry.expense_type = formData.expense_type || null;
        // Expenses are always negative (money out)
        entry.gross_in = Math.abs(parseFloat(formData.gross_in) || 0);
        entry.gross_out = 0;
      }

      if (isEditMode) {
        await updateLedgerEntry(userId, editEntry.id, entry);
      } else {
        await createLedgerEntry(userId, entry);
      }
      onSubmit(entry);
    } catch (error) {
      console.error('Error logging entry:', error);
      toast.error('Failed to log entry. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderCategorySelector = () => (
    <div style={styles.categoryGrid}>
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
  );

  // Image Upload State
  const [mediaFiles, setMediaFiles] = useState(isEditMode && editEntry.media_urls ? [...editEntry.media_urls] : []);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

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

        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
        const filePath = `bankroll/${userId}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('images')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('images')
          .getPublicUrl(filePath);

        newUploads.push(publicUrl);
      }

      setMediaFiles(prev => [...prev, ...newUploads]);
      // Photo upload success toast removed per user request
    } catch (error) {
      console.error('Upload failed:', error);
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

    return (
      <form onSubmit={handleSubmit} style={styles.form}>
        {/* Amount Fields */}
        <div style={styles.amountSection}>
          {isExpense ? (
            <div style={styles.formGroup}>
              <label style={styles.label}>Amount ($)</label>
              <input
                type="number"
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
                <label style={styles.label}>Buy-in ($)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.gross_in}
                  onChange={(e) => handleInputChange('gross_in', e.target.value)}
                  placeholder="0.00"
                  style={styles.input}
                  required
                  autoFocus
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Cash-out ($)</label>
                <input
                  type="number"
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
          {!isExpense && (formData.gross_in || formData.gross_out) && (
            <div
              style={{
                ...styles.netResult,
                color: netResult >= 0 ? '#22c55e' : '#ef4444',
              }}
            >
              Net: {netResult >= 0 ? '+' : '-'}${Math.abs(netResult).toLocaleString()}
            </div>
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
                  <option value="">Select stakes...</option>
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
              <label style={styles.label}>Tournament Name</label>
              <input
                type="text"
                value={formData.tournament_name}
                onChange={(e) => handleInputChange('tournament_name', e.target.value)}
                placeholder="e.g., $200 Daily Deepstack"
                style={styles.input}
              />
            </div>
            <div style={styles.amountRow}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Finish Position</label>
                <input
                  type="number"
                  value={formData.finish_position}
                  onChange={(e) => handleInputChange('finish_position', e.target.value)}
                  placeholder="e.g., 15"
                  style={styles.input}
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>Field Size</label>
                <input
                  type="number"
                  value={formData.field_size}
                  onChange={(e) => handleInputChange('field_size', e.target.value)}
                  placeholder="e.g., 150"
                  style={styles.input}
                />
              </div>
            </div>
            {/* Swap Section */}
            <div style={{ ...styles.formGroup, marginTop: 8, padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
              <label style={{ ...styles.label, fontSize: 13, color: '#9ca3af', marginBottom: 8 }}>💱 Swap Deductions</label>
              <div style={styles.amountRow}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Player Name</label>
                  {savedSwapNames.length > 0 && !customSwapName ? (
                    <select
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
                      <option value="">Select player...</option>
                      {savedSwapNames.map(n => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                      <option value="__custom__">+ New Name</option>
                    </select>
                  ) : (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        type="text"
                        value={formData.swap_player}
                        onChange={(e) => handleInputChange('swap_player', e.target.value)}
                        placeholder="e.g., Mike"
                        style={{ ...styles.input, flex: 1 }}
                      />
                      {savedSwapNames.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setCustomSwapName(false)}
                          style={{ ...styles.input, flex: 'none', width: 40, cursor: 'pointer', textAlign: 'center', padding: 0 }}
                        >↩</button>
                      )}
                    </div>
                  )}
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Swap Amount ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.swap_amount}
                    onChange={(e) => handleInputChange('swap_amount', e.target.value)}
                    onFocus={(e) => { if (e.target.value === '0') { e.target.value = ''; handleInputChange('swap_amount', ''); } }}
                    onBlur={(e) => { if (!e.target.value) handleInputChange('swap_amount', ''); }}
                    placeholder="0.00"
                    style={styles.input}
                  />
                </div>
              </div>
            </div>

            {/* Staking Section */}
            <div style={{ ...styles.formGroup, marginTop: 8, padding: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
              <label style={{ ...styles.label, fontSize: 13, color: '#9ca3af', marginBottom: 8 }}>🤝 Staking Deductions</label>
              <div style={styles.amountRow}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Staker Name</label>
                  {savedStakerNames.length > 0 && !customStakerName ? (
                    <select
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
                      <option value="">Select staker...</option>
                      {savedStakerNames.map(n => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                      <option value="__custom__">+ New Name</option>
                    </select>
                  ) : (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input
                        type="text"
                        value={formData.staker_name}
                        onChange={(e) => handleInputChange('staker_name', e.target.value)}
                        placeholder="e.g., John"
                        style={{ ...styles.input, flex: 1 }}
                      />
                      {savedStakerNames.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setCustomStakerName(false)}
                          style={{ ...styles.input, flex: 'none', width: 40, cursor: 'pointer', textAlign: 'center', padding: 0 }}
                        >↩</button>
                      )}
                    </div>
                  )}
                </div>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Amount Paid ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.staker_amount}
                    onChange={(e) => handleInputChange('staker_amount', e.target.value)}
                    onFocus={(e) => { if (e.target.value === '0') { e.target.value = ''; handleInputChange('staker_amount', ''); } }}
                    onBlur={(e) => { if (!e.target.value) handleInputChange('staker_amount', ''); }}
                    placeholder="0.00"
                    style={styles.input}
                  />
                </div>
              </div>
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

        {category === 'sports' && (
          <div style={styles.amountRow}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Sport</label>
              <select
                value={formData.sport}
                onChange={(e) => handleInputChange('sport', e.target.value)}
                style={styles.select}
              >
                <option value="">Select...</option>
                {SPORTS.map((s) => (
                  <option key={s} value={s}>
                    {s.toUpperCase()}
                  </option>
                ))}
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
          <label style={styles.label}>Location / Venue</label>
          {locations.length > 0 && formData.location_id !== '__new__' ? (
            <select
              value={formData.location_id}
              onChange={(e) => {
                if (e.target.value === '__new__') {
                  handleInputChange('location_id', '__new__');
                  handleInputChange('location_name', '');
                } else {
                  handleInputChange('location_id', e.target.value);
                  const loc = locations.find(l => l.id === e.target.value);
                  if (loc) handleInputChange('location_name', loc.name);
                }
              }}
              style={styles.select}
            >
              <option value="">Select location...</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
              <option value="__new__">+ New Location</option>
            </select>
          ) : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="text"
                value={formData.location_name}
                onChange={(e) => handleInputChange('location_name', e.target.value)}
                placeholder="e.g., Rivers Casino"
                style={{ ...styles.input, flex: 1 }}
                autoFocus={formData.location_id === '__new__'}
              />
              {locations.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    handleInputChange('location_id', '');
                    handleInputChange('location_name', '');
                  }}
                  style={{
                    background: 'rgba(255,255,255,0.1)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: 6,
                    color: 'rgba(255,255,255,0.7)',
                    padding: '8px 12px',
                    cursor: 'pointer',
                    fontSize: 12,
                    whiteSpace: 'nowrap',
                  }}
                >
                  ← Back
                </button>
              )}
            </div>
          )}
        </div>

        {/* ALL FIELDS ALWAYS VISIBLE (No Toggle) */}

        <div style={{ ...styles.amountRow, marginTop: 16 }}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Date</label>
            <input
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
              border: '1px solid rgba(16, 185, 129, 0.25)',
              borderRadius: 8, padding: '10px 14px', marginBottom: 12
            }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px rgba(16,185,129,0.5)', flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: '#10b981', fontWeight: 500 }}>
                📍 Adding to: <strong>{activeTrip.name}</strong>
              </span>
            </div>
          )}
          {trips.length > 0 && (
            <div style={styles.formGroup}>
              <label style={styles.label}>Trip</label>
              <select
                value={formData.trip_id}
                onChange={(e) => handleInputChange('trip_id', e.target.value)}
                style={styles.select}
              >
                <option value="">None</option>
                {trips.map((trip) => (
                  <option key={trip.id} value={trip.id}>
                    {trip.name}{trip.status === 'active' ? ' (Active)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {!isExpense && (
          <div style={styles.amountRow}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Start Time</label>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <input
                  type="number"
                  value={formData.start_hour}
                  onChange={(e) => {
                    let v = e.target.value.replace(/\D/g, '');
                    if (parseInt(v) > 12) v = '12';
                    handleInputChange('start_hour', v);
                  }}
                  placeholder="H"
                  style={{ ...styles.input, width: 44, textAlign: 'center', padding: '10px 4px' }}
                  min={1} max={12} maxLength={2}
                />
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 16, fontWeight: 700 }}>:</span>
                <input
                  type="number"
                  value={formData.start_min}
                  onChange={(e) => {
                    let v = e.target.value.replace(/\D/g, '');
                    if (v.length > 2) v = v.substring(0, 2);
                    if (parseInt(v) > 59) v = '59';
                    handleInputChange('start_min', v);
                  }}
                  placeholder="MM"
                  style={{ ...styles.input, width: 48, textAlign: 'center', padding: '10px 4px' }}
                  min={0} max={59} maxLength={2}
                />
                <select
                  value={formData.start_period}
                  onChange={(e) => handleInputChange('start_period', e.target.value)}
                  style={{ ...styles.input, width: 62, flex: 'none', textAlign: 'center', padding: '10px 2px' }}
                >
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              </div>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>End Time</label>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <input
                  type="number"
                  value={formData.end_hour}
                  onChange={(e) => {
                    let v = e.target.value.replace(/\D/g, '');
                    if (parseInt(v) > 12) v = '12';
                    handleInputChange('end_hour', v);
                  }}
                  placeholder="H"
                  style={{ ...styles.input, width: 44, textAlign: 'center', padding: '10px 4px' }}
                  min={1} max={12} maxLength={2}
                />
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 16, fontWeight: 700 }}>:</span>
                <input
                  type="number"
                  value={formData.end_min}
                  onChange={(e) => {
                    let v = e.target.value.replace(/\D/g, '');
                    if (v.length > 2) v = v.substring(0, 2);
                    if (parseInt(v) > 59) v = '59';
                    handleInputChange('end_min', v);
                  }}
                  placeholder="MM"
                  style={{ ...styles.input, width: 48, textAlign: 'center', padding: '10px 4px' }}
                  min={0} max={59} maxLength={2}
                />
                <select
                  value={formData.end_period}
                  onChange={(e) => handleInputChange('end_period', e.target.value)}
                  style={{ ...styles.input, width: 62, flex: 'none', textAlign: 'center', padding: '10px 2px' }}
                >
                  <option value="AM">AM</option>
                  <option value="PM">PM</option>
                </select>
              </div>
            </div>
          </div>
        )}

        <div style={styles.formGroup}>
          <label style={styles.label}>Emotional State</label>
          <select
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

        <div style={styles.formGroup}>
          <label style={styles.label}>Session Notes</label>
          <textarea
            value={formData.notes}
            onChange={(e) => handleInputChange('notes', e.target.value)}
            placeholder="Key hands, table dynamics, reads on players, mental state, lessons learned..."
            style={{ ...styles.textarea, minHeight: 100 }}
          />
        </div>

        {/* IMAGE UPLOAD */}
        <div style={styles.formGroup}>
          <label style={styles.label}>Session Photos</label>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
            {mediaFiles.map((url, index) => (
              <div key={index} style={{ position: 'relative', width: 80, height: 80, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.2)' }}>
                <img src={url} alt="Session" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <button
                  type="button"
                  onClick={() => removeImage(index)}
                  style={{
                    position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,0.6)', color: 'white',
                    border: 'none', borderRadius: '50%', width: 20, height: 20, display: 'flex',
                    alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 12
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
                background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.7)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', fontSize: 12
              }}
            >
              <span style={{ fontSize: 20, marginBottom: 4 }}>📷</span>
              {uploading ? '...' : 'Add'}
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleImageUpload}
            style={{ display: 'none' }}
          />
        </div>


        {/* Rule Warnings */}
        {ruleWarnings.length > 0 && (
          <div style={styles.warningBox}>
            <strong>Warning:</strong>
            <ul style={styles.warningList}>
              {ruleWarnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Actions */}
        <div style={styles.actions}>
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
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={styles.overlay}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        style={styles.modal}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={styles.header}>
          <h2 style={styles.title}>
            {isEditMode
              ? `Edit ${CATEGORIES.find((c) => c.id === category)?.label || 'Entry'}`
              : step === 'category'
                ? 'Log Session'
                : `Log ${CATEGORIES.find((c) => c.id === category)?.label || 'Entry'}`}
          </h2>
          <button onClick={onClose} style={styles.closeButton}>
            ×
          </button>
        </div>

        <div style={styles.content}>
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
    zIndex: 1000,
    padding: 20,
  },
  modal: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '90vh',
    background: '#1a2a44',
    borderRadius: 16,
    border: '1px solid rgba(255, 255, 255, 0.1)',
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
    width: 32,
    height: 32,
    borderRadius: '50%',
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
    padding: 24,
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
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
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
    fontSize: 12,
    fontWeight: 500,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  input: {
    padding: '12px 14px',
    background: 'rgba(0, 0, 0, 0.3)',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: 8,
    color: '#fff',
    fontSize: 14,
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  select: {
    padding: '12px 14px',
    background: 'rgba(0, 0, 0, 0.3)',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: 8,
    color: '#fff',
    fontSize: 14,
    outline: 'none',
    cursor: 'pointer',
    width: '100%',
    boxSizing: 'border-box',
  },
  textarea: {
    padding: '12px 14px',
    background: 'rgba(0, 0, 0, 0.3)',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: 8,
    color: '#fff',
    fontSize: 14,
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
    fontSize: 12,
    cursor: 'pointer',
    padding: '8px 0',
    textAlign: 'left',
  },
  warningBox: {
    padding: 16,
    background: 'rgba(234, 179, 8, 0.1)',
    border: '1px solid rgba(234, 179, 8, 0.3)',
    borderRadius: 8,
    color: '#eab308',
    fontSize: 13,
  },
  warningList: {
    margin: '8px 0 0',
    paddingLeft: 20,
  },
  actions: {
    display: 'flex',
    gap: 12,
    marginTop: 8,
  },
  backButton: {
    flex: 1,
    padding: 14,
    background: 'rgba(255, 255, 255, 0.1)',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    borderRadius: 8,
    color: '#fff',
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
  },
  submitButton: {
    flex: 2,
    padding: 14,
    background: 'linear-gradient(135deg, #2374e1, #1a5fc9)',
    border: 'none',
    borderRadius: 8,
    color: '#fff',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
};
