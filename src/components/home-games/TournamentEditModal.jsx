/**
 * ════════════════════════════════════════════════════════════════════════
 *  TournamentEditModal — host CRUD for a single tournament
 * ════════════════════════════════════════════════════════════════════════
 *
 *  Two modes:
 *    mode="create" — collect fields, call rpc_hg_create_tournament
 *    mode="edit"   — preload from `tournament` prop, call rpc_hg_update_tournament
 *
 *  Props:
 *    open               — boolean
 *    mode               — 'create' | 'edit'
 *    groupId            — required for create mode
 *    tournament         — required for edit mode (has id + current values)
 *    onClose()          — close without saving
 *    onSaved(result)    — called after successful save with the RPC result
 *
 *  This component imports supabase lazily so the modal doesn't block first
 *  paint on pages that may never open it.
 */
import { useEffect, useState } from 'react';
import { X, Trophy } from 'lucide-react';

const STRUCTURES = [
  { value: 'standard', label: 'Standard' },
  { value: 'turbo',    label: 'Turbo' },
  { value: 'deep',     label: 'Deep' },
  { value: 'bounty',   label: 'Bounty' },
  { value: 'rebuy',    label: 'Rebuy' },
];

// audit F-20: these dates are compared against a <input type="date"> value,
// which is the user's LOCAL calendar date. toISOString() is UTC, so from
// ~17:00 local onward in US timezones the UTC date is already tomorrow — an
// evening host was told they "cannot schedule in the past" for today, and the
// default start date landed a day late. Format from local parts instead.
function localISODate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function todayPlus(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return localISODate(d);
}

function emptyForm() {
  return {
    name: '',
    buy_in: '',
    starting_stack: '',
    structure: 'standard',
    scheduled_date: todayPlus(7),
    scheduled_time: '19:00',
    entries_cap: '',
    description: '',
  };
}

function timeToHHMM(t) {
  if (!t) return '';
  const s = String(t);
  return s.length >= 5 ? s.slice(0, 5) : s;
}

export default function TournamentEditModal({
  open, mode, groupId, tournament, onClose, onSaved,
}) {
  const [form, setForm] = useState(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Sync prop → form whenever the modal opens or the target tournament changes
  useEffect(() => {
    if (!open) return;
    if (mode === 'edit' && tournament) {
      setForm({
        name:           tournament.name || tournament.title || '',
        buy_in:         String(tournament.buy_in ?? tournament.buyin_min ?? ''),
        starting_stack: tournament.starting_stack != null ? String(tournament.starting_stack) : '',
        structure:      tournament.structure || 'standard',
        scheduled_date: tournament.scheduled_date || todayPlus(7),
        scheduled_time: timeToHHMM(tournament.start_time) || '19:00',
        entries_cap:    tournament.entries_cap != null ? String(tournament.entries_cap)
                        : (tournament.max_players != null ? String(tournament.max_players) : ''),
        description:    tournament.description || '',
      });
    } else {
      setForm(emptyForm());
    }
    setError(null);
  }, [open, mode, tournament]);

  if (!open) return null;

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();
    setError(null);

    // Client-side validation
    if (!form.name.trim()) return setError('Name is required');
    if (form.name.length > 120) return setError('Name must be 120 characters or less');
    // audit F-21: Number('') === 0, so an EMPTY buy-in passed this check and
    // the tournament was published advertising "Free" entry. Reject the blank
    // before coercing.
    if (String(form.buy_in).trim() === '') return setError('Buy-in is required');
    const buyIn = Number(form.buy_in);
    if (!Number.isFinite(buyIn) || buyIn < 0) return setError('Buy-in must be a non-negative number');
    const startingStack = form.starting_stack === '' ? null : Number(form.starting_stack);
    if (startingStack != null && (!Number.isFinite(startingStack) || startingStack < 0)) {
      return setError('Starting stack must be a non-negative number');
    }
    if (!form.scheduled_date || !form.scheduled_time) return setError('Date and time are required');
    if (form.scheduled_date < localISODate()) {
      return setError('Cannot schedule a tournament in the past');
    }
    const entriesCap = form.entries_cap === '' ? null : Number(form.entries_cap);
    if (entriesCap != null && (!Number.isFinite(entriesCap) || entriesCap < 2)) {
      return setError('Entries cap, if set, must be at least 2');
    }

    setSubmitting(true);
    try {
      const { supabase: sb } = await import('../../lib/supabase');
      // Normalize time to HH:MM:SS for Postgres `time`
      const timeStr = form.scheduled_time.length === 5
        ? `${form.scheduled_time}:00` : form.scheduled_time;

      let result, err;
      if (mode === 'create') {
        if (!groupId) throw new Error('Group ID is required for create mode');
        ({ data: result, error: err } = await sb.rpc('rpc_hg_create_tournament', {
          p_group_id:       groupId,
          p_name:           form.name.trim().slice(0, 120),
          p_buy_in:         Math.max(0, Math.floor(buyIn)),
          p_starting_stack: startingStack == null ? null : Math.max(0, Math.floor(startingStack)),
          p_structure:      form.structure,
          p_scheduled_date: form.scheduled_date,
          p_scheduled_time: timeStr,
          p_entries_cap:    entriesCap == null ? null : Math.max(2, Math.floor(entriesCap)),
          p_description:    form.description || null,
        }));
      } else {
        // edit
        if (!tournament?.id) throw new Error('Tournament ID is required for edit mode');
        ({ data: result, error: err } = await sb.rpc('rpc_hg_update_tournament', {
          p_tournament_id:  tournament.id,
          p_name:           form.name.trim().slice(0, 120),
          p_buy_in:         Math.max(0, Math.floor(buyIn)),
          p_starting_stack: startingStack == null ? null : Math.max(0, Math.floor(startingStack)),
          p_structure:      form.structure,
          p_scheduled_date: form.scheduled_date,
          p_scheduled_time: timeStr,
          p_entries_cap:    entriesCap == null ? null : Math.max(2, Math.floor(entriesCap)),
          p_description:    form.description || null,
          p_clear_entries_cap: entriesCap == null,
        }));
      }

      if (err) throw err;
      onSaved && onSaved(result);
    } catch (ex) {
      setError(ex?.message || 'Failed to save tournament');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={(e) => { if (e.target === e.currentTarget && !submitting) onClose && onClose(); }}
    >
      <div
        className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl border max-h-[92vh] overflow-y-auto"
        style={{ background: '#0D192E', borderColor: '#4A5E78' }}
      >
        <div className="sticky top-0 flex items-center justify-between px-4 py-3 border-b"
             style={{ background: '#0D192E', borderColor: '#4A5E78' }}>
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5" style={{ color: '#22D3EE' }} />
            <h2 className="text-base font-bold text-white">
              {mode === 'create' ? 'Add Tournament' : 'Edit Tournament'}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => !submitting && onClose && onClose()}
            className="p-1 rounded-md hover:bg-[#132240] text-[#94A3B8]"
            disabled={submitting}
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(e); }}>
          <div className="p-4 space-y-3">
            <div>
              <label className="block text-sm font-medium text-white mb-1">Tournament Name *</label>
              <input
                type="text" maxLength={120}
                value={form.name}
                onChange={(e) => update('name', e.target.value)}
                placeholder="e.g., Sunday Major"
                className="cmd-input w-full h-11 px-3"
                disabled={submitting}
              />
              <p className="text-xs text-[#64748B] mt-1">{form.name.length} / 120</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-white mb-1">Buy-in (USD) *</label>
                <input
                  type="number" min="0" step="1"
                  value={form.buy_in}
                  onChange={(e) => update('buy_in', e.target.value)}
                  placeholder="100"
                  className="cmd-input w-full h-11 px-3"
                  disabled={submitting}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-white mb-1">Starting Stack</label>
                <input
                  type="number" min="0" step="100"
                  value={form.starting_stack}
                  onChange={(e) => update('starting_stack', e.target.value)}
                  placeholder="20000"
                  className="cmd-input w-full h-11 px-3"
                  disabled={submitting}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-1">Structure</label>
              <select
                value={form.structure}
                onChange={(e) => update('structure', e.target.value)}
                className="cmd-input w-full h-11 px-3"
                disabled={submitting}
              >
                {STRUCTURES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-white mb-1">Date *</label>
                <input
                  type="date"
                  value={form.scheduled_date}
                  onChange={(e) => update('scheduled_date', e.target.value)}
                  min={localISODate()}
                  className="cmd-input w-full h-11 px-3"
                  disabled={submitting}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-white mb-1">Start Time *</label>
                <input
                  type="time"
                  value={form.scheduled_time}
                  onChange={(e) => update('scheduled_time', e.target.value)}
                  className="cmd-input w-full h-11 px-3"
                  disabled={submitting}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-1">
                Entries Cap <span className="text-[#64748B] text-xs">(leave blank for unlimited)</span>
              </label>
              <input
                type="number" min="2" step="1"
                value={form.entries_cap}
                onChange={(e) => update('entries_cap', e.target.value)}
                placeholder="Unlimited"
                className="cmd-input w-full h-11 px-3"
                disabled={submitting}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-1">Description</label>
              <textarea
                rows={2}
                value={form.description}
                onChange={(e) => update('description', e.target.value)}
                placeholder="Optional notes for players"
                className="cmd-input w-full px-3 py-2 resize-none"
                disabled={submitting}
              />
            </div>

            {error && (
              <div className="text-sm rounded-md px-3 py-2"
                   style={{ background: '#EF444422', color: '#FCA5A5' }}>
                {error}
              </div>
            )}
          </div>

          <div className="sticky bottom-0 flex gap-2 px-4 py-3 border-t"
               style={{ background: '#0D192E', borderColor: '#4A5E78' }}>
            <button
              type="button"
              onClick={() => !submitting && onClose && onClose()}
              className="cmd-btn h-11 flex-1"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="cmd-btn cmd-btn-primary h-11 flex-1"
              disabled={submitting}
            >
              {submitting
                ? (mode === 'create' ? 'Creating…' : 'Saving…')
                : (mode === 'create' ? 'Create Tournament' : 'Save Changes')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
