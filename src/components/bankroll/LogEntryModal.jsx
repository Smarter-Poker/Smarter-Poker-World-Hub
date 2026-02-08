/**
 * LOG ENTRY MODAL
 * Category-first session logging with minimal required fields
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../../lib/supabase';
import { createLedgerEntry, updateLedgerEntry } from '../../lib/bankroll/bankrollSelectors';
import { getOrCreateLocation, detectNearbyLocation } from '../../lib/bankroll/locationMemory';
import { checkRuleViolations } from '../../lib/bankroll/leakDetection';
import toast from '../../stores/toastStore';

// Clean Facebook-style categories (no emojis)
const CATEGORIES = [
  { id: 'poker_cash', label: 'Poker Cash', icon: '' },
  { id: 'poker_mtt', label: 'Tournament', icon: '' },
  { id: 'casino_table', label: 'Table Game', icon: '' },
  { id: 'slots', label: 'Slots', icon: '' },
  { id: 'sports', label: 'Sports Bet', icon: '' },
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

export default function LogEntryModal({ userId, locations, trips, editEntry, onClose, onSubmit }) {
  const isEditMode = !!editEntry;
  const [step, setStep] = useState(isEditMode ? 'details' : 'category');
  const [category, setCategory] = useState(isEditMode ? editEntry.category : null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ruleWarnings, setRuleWarnings] = useState([]);
  // showAdvanced removed - always show all fields

  // Form state
  const buildInitialFormData = () => {
    if (isEditMode) {
      const e = editEntry;
      const extractTime = (dt) => dt ? dt.split('T')[1]?.substring(0, 5) || '' : '';
      return {
        gross_in: e.gross_in?.toString() || '',
        gross_out: e.gross_out?.toString() || '',
        location_id: e.location_id || '',
        location_name: e.location_name || '',
        trip_id: e.trip_id || '',
        entry_date: e.entry_date || new Date().toISOString().split('T')[0],
        start_time: extractTime(e.start_time),
        end_time: extractTime(e.end_time),
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
      gross_out: '',
      location_id: '',
      location_name: '',
      trip_id: '',
      entry_date: new Date().toISOString().split('T')[0],
      start_time: '',
      end_time: '',
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
    };
  };

  const [formData, setFormData] = useState(buildInitialFormData);

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
      if (!locationId && formData.location_name) {
        locationId = await getOrCreateLocation(userId, formData.location_name);
      }

      // Build entry based on category
      const entry = {
        category,
        location_id: locationId || null,
        trip_id: formData.trip_id || null,
        entry_date: formData.entry_date,
        start_time: formData.start_time
          ? `${formData.entry_date}T${formData.start_time}:00`
          : null,
        end_time: formData.end_time
          ? `${formData.entry_date}T${formData.end_time}:00`
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
      toast.success(`Uploaded ${newUploads.length} images`);
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
                  placeholder="0.00"
                  style={styles.input}
                  required
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
              <input
                type="text"
                value={formData.stakes}
                onChange={(e) => handleInputChange('stakes', e.target.value)}
                placeholder="e.g., 2/5 NL"
                style={styles.input}
              />
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

        {/* Location */}
        <div style={styles.formGroup}>
          <label style={styles.label}>Location</label>
          {locations.length > 0 ? (
            <select
              value={formData.location_id}
              onChange={(e) => handleInputChange('location_id', e.target.value)}
              style={styles.select}
            >
              <option value="">Select or enter new...</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={formData.location_name}
              onChange={(e) => handleInputChange('location_name', e.target.value)}
              placeholder="e.g., Rivers Casino"
              style={styles.input}
            />
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
                    {trip.name}
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
              <input
                type="time"
                value={formData.start_time}
                onChange={(e) => handleInputChange('start_time', e.target.value)}
                style={styles.input}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>End Time</label>
              <input
                type="time"
                value={formData.end_time}
                onChange={(e) => handleInputChange('end_time', e.target.value)}
                style={styles.input}
              />
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
