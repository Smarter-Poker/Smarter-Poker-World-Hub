/**
 * ════════════════════════════════════════════════════════════════════════
 *  TournamentList — reusable tournament display for home-games surfaces
 * ════════════════════════════════════════════════════════════════════════
 *
 *  Tournaments are commander_home_games rows with format='tournament'.
 *  This component renders them in two modes:
 *
 *    mode="public"  — read-only cards for the public group / code pages.
 *                     Each card optionally links to its event detail page.
 *
 *    mode="host"    — same cards with Edit + Cancel buttons. Used on the
 *                     host detail and manage pages.
 *
 *  Expected tournament shape (from rpc_hg_list_tournaments or
 *  rpc_hg_list_public_tournaments):
 *    {
 *      id, name, description,
 *      buy_in, starting_stack, structure,
 *      scheduled_date, start_time, scheduled_at_iso,
 *      entries_cap, rsvp_yes, status (host mode only),
 *      address, neighborhood (public mode if visibility allows)
 *    }
 *
 *  Or the public-API shape from `upcoming_games` where each row has
 *  `format='tournament'` along with the home-game fields:
 *    { id, title, format, buyin_min, starting_stack, structure,
 *      scheduled_date, start_time, max_players, rsvp_yes, status, ... }
 *
 *  The component normalizes both shapes via `normalizeTournament()`.
 */
import { useState } from 'react';
import { Trophy, Calendar, Clock, Coins, Users, Pencil, Trash2, ExternalLink } from 'lucide-react';

// ─── Normalize either shape into a single internal record ───────────────
function normalizeTournament(t) {
  if (!t) return null;
  return {
    id: t.id,
    name: t.name || t.title || 'Tournament',
    description: t.description || '',
    buy_in: t.buy_in ?? t.buyin_min ?? 0,
    starting_stack: t.starting_stack ?? null,
    structure: t.structure || 'standard',
    scheduled_date: t.scheduled_date,
    start_time: t.start_time,
    // TIMEZONE (audit 2026-08-12, M-9): do NOT append 'Z' here.
    //
    // commander_home_games.start_time is a bare SQL TIME — the host's local
    // wall clock, with no zone attached. Appending 'Z' declared it UTC, and
    // formatDate() then re-rendered it in the VIEWER's zone. A tournament
    // scheduled for Aug 15 at 00:30 displayed as "Aug 14" to every US
    // viewer, and late-night home games are the common case, not the edge.
    //
    // Omitting the suffix yields a floating local time, which is what the
    // value actually means and matches formatDate's own convention of
    // appending T00:00:00 (local) to bare dates.
    //
    // The real fix is a timezone column on commander_home_groups plus
    // Intl.DateTimeFormat({ timeZone }); until then, floating-local is
    // correct for the overwhelmingly common case of a viewer in the same
    // zone as the game they are looking at.
    scheduled_at_iso: t.scheduled_at_iso
      || (t.scheduled_date && t.start_time
        ? `${t.scheduled_date}T${String(t.start_time).slice(0,8) || '00:00:00'}`
        : null),
    entries_cap: t.entries_cap ?? t.max_players ?? null,
    rsvp_yes: typeof t.rsvp_yes === 'number' ? t.rsvp_yes : 0,
    status: t.status || 'scheduled',
    address: t.address || null,
    neighborhood: t.neighborhood || null,
  };
}

const STRUCTURE_LABELS = {
  turbo:    { label: 'Turbo',    color: '#F97316' },
  standard: { label: 'Standard', color: '#22D3EE' },
  deep:     { label: 'Deep',     color: '#A78BFA' },
  bounty:   { label: 'Bounty',   color: '#EF4444' },
  rebuy:    { label: 'Rebuy',    color: '#10B981' },
};

function formatDate(iso) {
  if (!iso) return '';
  try {
    // If the value is a plain date string (no 'T'), append T00:00:00 so it
    // parses as LOCAL midnight instead of UTC midnight (which shows the
    // previous calendar day in all US timezones).
    const normalized = typeof iso === 'string' && !iso.includes('T') ? `${iso}T00:00:00` : iso;
    const d = new Date(normalized);
    if (isNaN(d.getTime())) return String(iso);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  } catch (_e) { return String(iso); }
}

function formatTime(time) {
  if (!time) return '';
  // Time is a 'HH:MM:SS' or 'HH:MM' string
  const t = String(time);
  const [h, m] = t.split(':');
  if (h == null || m == null) return t;
  const hh = parseInt(h, 10);
  if (Number.isNaN(hh)) return t;
  const period = hh >= 12 ? 'PM' : 'AM';
  const display = hh === 0 ? 12 : (hh > 12 ? hh - 12 : hh);
  return `${display}:${m} ${period}`;
}

function formatBuyIn(amount) {
  if (amount == null) return 'Free';
  const n = Number(amount);
  if (!Number.isFinite(n) || n === 0) return 'Free';
  return `$${n.toLocaleString()}`;
}

function StructurePill({ structure }) {
  const meta = STRUCTURE_LABELS[structure] || STRUCTURE_LABELS.standard;
  return (
    <span
      className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full"
      style={{
        background: `${meta.color}22`,
        color: meta.color,
        border: `1px solid ${meta.color}66`,
      }}
    >
      {meta.label}
    </span>
  );
}

function StatusBadge({ status }) {
  const map = {
    scheduled:   { label: 'Scheduled',   color: '#22D3EE' },
    confirmed:   { label: 'Confirmed',   color: '#10B981' },
    in_progress: { label: 'Live',        color: '#EF4444' },
    completed:   { label: 'Completed',   color: '#64748B' },
    cancelled:   { label: 'Cancelled',   color: '#F97316' },
    draft:       { label: 'Draft',       color: '#A78BFA' },
  };
  const meta = map[status] || map.scheduled;
  return (
    <span
      className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full"
      style={{ background: `${meta.color}22`, color: meta.color }}
    >
      {meta.label}
    </span>
  );
}

function TournamentCard({ tournament, mode, onEdit, onCancel, onView, hostHref }) {
  const t = tournament;
  const [busy, setBusy] = useState(false);
  const isHost = mode === 'host';
  const isCancelled = t.status === 'cancelled';
  const capDisplay = t.entries_cap ? `${t.rsvp_yes} / ${t.entries_cap}` : `${t.rsvp_yes} registered`;

  return (
    <div
      className="cmd-panel p-4 rounded-lg border"
      style={{
        background: '#0F1C32',
        borderColor: isCancelled ? '#4A5E78' : '#22D3EE33',
        opacity: isCancelled ? 0.6 : 1,
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="shrink-0 w-9 h-9 rounded-md flex items-center justify-center"
               style={{ background: '#22D3EE15' }}>
            <Trophy className="w-5 h-5" style={{ color: '#22D3EE' }} />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-white truncate" title={t.name}>{t.name}</h3>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <StructurePill structure={t.structure} />
              {isHost && <StatusBadge status={t.status} />}
            </div>
          </div>
        </div>
      </div>

      {t.description && (
        <p className="text-sm text-[#94A3B8] mb-3 line-clamp-2">{t.description}</p>
      )}

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="flex items-center gap-1.5 text-sm text-[#94A3B8]">
          <Calendar className="w-4 h-4 shrink-0" />
          <span>{formatDate(t.scheduled_at_iso || t.scheduled_date)}</span>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-[#94A3B8]">
          <Clock className="w-4 h-4 shrink-0" />
          <span>{formatTime(t.start_time)}</span>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-[#94A3B8]">
          <Coins className="w-4 h-4 shrink-0" />
          <span>{formatBuyIn(t.buy_in)}</span>
          {t.starting_stack ? (
            <span className="text-[#64748B] text-xs">· {Number(t.starting_stack).toLocaleString()} stack</span>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5 text-sm text-[#94A3B8]">
          <Users className="w-4 h-4 shrink-0" />
          <span>{capDisplay}</span>
        </div>
      </div>

      {isHost ? (
        <div className="flex gap-2 mt-3 pt-3 border-t border-[#4A5E78]">
          {!isCancelled && onEdit && (
            <button
              type="button"
              onClick={() => { if (!busy) onEdit(t); }}
              className="flex-1 cmd-btn h-9 text-sm flex items-center justify-center gap-1.5"
              disabled={busy}
            >
              <Pencil className="w-4 h-4" /> Edit
            </button>
          )}
          {!isCancelled && onCancel && (
            <button
              type="button"
              onClick={async () => {
                if (busy) return;
                if (!confirm(`Cancel "${t.name}"? This will notify any RSVPs.`)) return;
                setBusy(true);
                try { await onCancel(t); } finally { setBusy(false); }
              }}
              className="cmd-btn h-9 text-sm flex items-center justify-center gap-1.5 px-3"
              style={{ background: '#EF444422', color: '#EF4444' }}
              disabled={busy}
            >
              <Trash2 className="w-4 h-4" /> {busy ? 'Cancelling…' : 'Cancel'}
            </button>
          )}
          {isCancelled && (
            <p className="text-xs text-[#64748B] italic">
              Cancelled — restore by recreating from the manage page.
            </p>
          )}
        </div>
      ) : (
        (hostHref || onView) && (
          <div className="mt-3 pt-3 border-t border-[#4A5E78]">
            {hostHref ? (
              <a
                href={hostHref}
                className="cmd-btn cmd-btn-primary w-full h-9 text-sm flex items-center justify-center gap-1.5"
              >
                View Details <ExternalLink className="w-3.5 h-3.5" />
              </a>
            ) : (
              <button
                type="button"
                onClick={() => onView(t)}
                className="cmd-btn cmd-btn-primary w-full h-9 text-sm"
              >
                View Details
              </button>
            )}
          </div>
        )
      )}
    </div>
  );
}

export default function TournamentList({
  tournaments,
  mode = 'public',
  onEdit,
  onCancel,
  onView,
  hostHrefForTournament,
  emptyState,
  title = 'Upcoming Tournaments',
  showTitle = true,
}) {
  const normalized = (tournaments || [])
    .map(normalizeTournament)
    .filter(Boolean);

  // Public mode hides cancelled + past silently. Host mode shows everything.
  const visible = mode === 'host'
    ? normalized
    : normalized.filter((t) => t.status !== 'cancelled');

  if (visible.length === 0) {
    return emptyState || null;
  }

  return (
    <section>
      {showTitle && (
        <div className="flex items-center gap-2 mb-3">
          <Trophy className="w-5 h-5" style={{ color: '#22D3EE' }} />
          <h2 className="text-lg font-bold text-white">{title}</h2>
          <span className="text-sm text-[#64748B]">({visible.length})</span>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {visible.map((t) => (
          <TournamentCard
            key={t.id}
            tournament={t}
            mode={mode}
            onEdit={onEdit}
            onCancel={onCancel}
            onView={onView}
            hostHref={hostHrefForTournament ? hostHrefForTournament(t) : null}
          />
        ))}
      </div>
    </section>
  );
}

// Named exports for callers that want to render a single card or normalize
export { TournamentCard, normalizeTournament, formatBuyIn, formatDate, formatTime };
