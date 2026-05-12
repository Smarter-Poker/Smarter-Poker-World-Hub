/**
 * Create Home Game Group Page
 * Allows players to create and host their own poker home games
 * UI: Dark industrial sci-fi gaming theme, no emojis, Inter font
 */
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/router';
import SEOHead from '../../../../src/components/seo/SEOHead';
import {
  ArrowLeft,
  Home,
  MapPin,
  Lock,
  Globe,
  DollarSign,
  Calendar,
  Loader2,
  Check,
  ChevronRight,
  Share2,
  Users,
  Clock,
  Image as ImageIcon,
  FileText,
  Upload,
  AlertCircle,
  X,
  Trophy,
  Plus
} from 'lucide-react';
// SSR-TDZ-FIX: CreateGameForm re-exports from @smarter-poker/commander-shared
// which pulls in its own authUtils/supabase modules. When statically imported
// those create a circular-dep chain with World Hub's src/lib/* modules,
// producing `ReferenceError: Cannot access 'O' before initialization` during
// Next.js static prerendering. Dynamic import with ssr:false breaks the chain.
// CreateGameForm is only rendered at Step 4 (after group creation succeeds),
// so lazy loading is semantically correct with zero UX impact.
import dynamic from 'next/dynamic';
const CreateGameForm = dynamic(
  () => import('../../../../src/components/commander/home-games/CreateGameForm'),
  { ssr: false }
);
// Dan-fix/maps-leaflet: swapped from GoogleMapPicker (which needs Google Maps
// Platform billing) to LeafletLocationPicker. Same stack Poker Near Me uses —
// Leaflet + CartoDB tiles + Nominatim geocoding. Zero cost, no API key, no
// Google Cloud project dependency. The component exposes the same prop
// interface as GoogleMapPicker so this is a drop-in replacement.
// SSR-TDZ-FIX: Leaflet is a browser-only CDN library. Static import pulls it
// into the SSR bundle even though ensureLeaflet() guards server-side execution.
// Dynamic import with ssr:false excludes it from the SSR bundle entirely,
// eliminating any residual TDZ risk from the Leaflet module tree.
const LeafletLocationPicker = dynamic(
  () => import('../../../../src/components/maps/LeafletLocationPicker'),
  { ssr: false }
);
import { getAccessToken } from '../../../../src/lib/authUtils';

const GAME_TYPES = [
  { value: 'nlhe', label: "No Limit Hold'em" },
  { value: 'plo', label: 'Pot Limit Omaha' },
  { value: 'mixed', label: 'Mixed Games' },
  { value: 'tournament', label: 'Tournament' }
];

const STAKES_OPTIONS = [
  '$0.25/$0.50',
  '$0.50/$1',
  '$1/$2',
  '$1/$3',
  '$2/$5',
  '$5/$10',
  'Custom'
];

const DAYS_OF_WEEK = [
  { value: 'monday', label: 'Mon', full: 'Monday' },
  { value: 'tuesday', label: 'Tue', full: 'Tuesday' },
  { value: 'wednesday', label: 'Wed', full: 'Wednesday' },
  { value: 'thursday', label: 'Thu', full: 'Thursday' },
  { value: 'friday', label: 'Fri', full: 'Friday' },
  { value: 'saturday', label: 'Sat', full: 'Saturday' },
  { value: 'sunday', label: 'Sun', full: 'Sunday' },
];

export default function CreateHomeGamePage() {
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [createdGroup, setCreatedGroup] = useState(null);
  const [createdSocialPage, setCreatedSocialPage] = useState(null);
  const [eventSubmitting, setEventSubmitting] = useState(false);
  // Dan-fix/first-game-collapse (2026-05-12): the "Schedule First Game" panel
  // now collapses behind a toggle and prefills every overlapping field from
  // the group the user just created. Most of the form previously duplicated
  // info they had already entered — confusing UX. Default closed so the
  // success screen is clean; user opts in to scheduling a game right away.
  const [showFirstGameForm, setShowFirstGameForm] = useState(false);
  // Audit-fix/event-error-ui (2026-05-12): the Schedule First Game submission
  // path previously swallowed every error in a console.warn — user saw no
  // feedback when the API rejected the request (which it always does because
  // of field-name mismatches between CreateGameForm and /api/home-games/events).
  // Surface failures inline so the host knows what to fix.
  const [firstGameError, setFirstGameError] = useState(null);
  // Phase 41/audit-fix-B9 + Audit-fix/event-idempotency: shared token factory.
  // Moved here (before first use) to avoid TDZ — `const` arrow functions are
  // not hoisted; calling makeToken() before this line was a runtime
  // `ReferenceError: Cannot access 'makeToken' before initialization`.
  // Used for both the group submission token (submissionTokenRef) and the
  // per-event submission token (eventSubmissionTokenRef) below.
  const makeToken = () => (typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : 'tok_' + Math.random().toString(36).slice(2) + Date.now().toString(36));

  // Audit-fix/event-idempotency (2026-05-12): per-submission idempotency token
  // so a double-click never creates two events. Rotated after a 2xx or
  // parseable 4xx (server processed and rejected).
  const eventSubmissionTokenRef = useRef(makeToken());

  // Dan-fix/banner-existing-host (2026-05-11): track whether the user
  // already owns at least one home group. `null` = still checking, `0` = new
  // host (show welcome banner), `>0` = existing host (suppress banner +
  // switch wizard copy from "first" to "additional"). Loaded once on mount
  // from the user's own auth session — no PII leakage since the query is
  // restricted to caller via RLS.
  const [existingGroupCount, setExistingGroupCount] = useState(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { ensureAuthReady } = await import('../../../../src/lib/authUtils');
        const { supabase: sb } = await import('../../../../src/lib/supabase');
        const authUser = await ensureAuthReady(sb);
        if (!authUser || !authUser.id) return; // unauthenticated — submit path handles redirect
        const { count, error: cntErr } = await sb
          .from('commander_home_groups')
          .select('id', { count: 'exact', head: true })
          .eq('owner_id', authUser.id);
        if (cancelled) return;
        if (cntErr) {
          console.warn('[home-games-create] existing group count failed:', cntErr.message);
          setExistingGroupCount(0); // fall back to "new host" copy on error
        } else {
          setExistingGroupCount(count || 0);
        }
      } catch (ex) {
        if (!cancelled) {
          console.warn('[home-games-create] existing group count threw:', ex);
          setExistingGroupCount(0);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Dan-fix/error-visibility (2026-05-11): when a submit fails on step 3
  // and the error message renders in the top of <main>, the user is
  // typically scrolled near the bottom (where the Create button lives) and
  // never sees the failure. Scrolling top on error so the failure surfaces.
  const errorRef = useRef(null);

  // Dan-fix/error-visibility (2026-05-11): whenever an error message appears,
  // scroll it into view smoothly. Without this, submit failures on step 3
  // are invisible because the user is scrolled near the Create button at the
  // bottom and the error renders at the top of <main>.
  useEffect(() => {
    if (error && errorRef.current && typeof errorRef.current.scrollIntoView === 'function') {
      errorRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [error]);

  // ── PHASE 17 — hard logo requirement ──────────────────────────────
  // profile_photo_url is filled in by the Supabase Storage upload
  // before the user is allowed to click "Create Group". See the Logo
  // panel on step 3 below.
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoError, setLogoError] = useState(null);
  const logoInputRef = useRef(null);

  // Phase 41/audit-fix-B9: idempotency token kept stable across retries.
  // We rotate it after the server confirms a 2xx OR returns a parseable 4xx
  // (= it processed our input and rejected it). Network errors / 5xx keep
  // the token so a retry doesn't create a duplicate group if the original
  // request actually succeeded server-side.
  // NOTE: makeToken is declared above, before eventSubmissionTokenRef, to avoid TDZ.
  const submissionTokenRef = useRef(makeToken());

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    game_type: 'nlhe',
    stakes: '$1/$2',
    custom_stakes: '',
    min_buyin: 100,
    max_buyin: 500,
    max_players: 9,
    visibility: 'private',
    requires_approval: true,
    city: '',
    state: '',
    neighborhood: '',
    approximate_lat: null,
    approximate_lng: null,
    recurring: false,
    schedule_days: [],
    start_time: '19:00',
    end_time: '',
    profile_photo_url: '',   // Phase 17: required, uploaded on step 3
    // Phase 41: multi-table support. tables_count===1 keeps the legacy
    // single-game flow (top-level game_type/stakes apply). When >1, the
    // per-table `tables` array carries each table's { game_type, stakes,
    // custom_stakes } and is shipped under settings.tables.
    tables_count: 1,
    tables: [],
    // Dan-fix/tournaments: optional tournament schedule. host_a_home_game
    // step 3 surfaces a Yes/No toggle; when on, the host adds 1+ tournaments
    // with name + buy-in + starting stack + structure + date/time + entries
    // cap. Persisted to commander_home_groups.settings.tournaments.
    schedules_tournaments: false,
    tournaments: [],
  });

  // Toggle a day in the schedule_days array
  function toggleDay(day) {
    setFormData(prev => {
      const days = prev.schedule_days.includes(day)
        ? prev.schedule_days.filter(d => d !== day)
        : [...prev.schedule_days, day];
      return { ...prev, schedule_days: days };
    });
  }

  // Build schedule summary text
  function getScheduleSummary() {
    if (!formData.recurring || formData.schedule_days.length === 0) return '';
    const dayLabels = formData.schedule_days
      .sort((a, b) => DAYS_OF_WEEK.findIndex(d => d.value === a) - DAYS_OF_WEEK.findIndex(d => d.value === b))
      .map(d => DAYS_OF_WEEK.find(x => x.value === d)?.full || d);
    const daysStr = dayLabels.length > 1
      ? dayLabels.slice(0, -1).join(', ') + ' & ' + dayLabels[dayLabels.length - 1]
      : dayLabels[0];
    const startStr = formData.start_time ? new Date(`2000-01-01T${formData.start_time}`).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
    const endStr = formData.end_time ? new Date(`2000-01-01T${formData.end_time}`).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
    return `Every ${daysStr}${startStr ? `, ${startStr}` : ''}${endStr ? ` - ${endStr}` : ''}`;
  }

  function updateField(field, value) {
    setFormData(prev => ({ ...prev, [field]: value }));
  }

  // Phase 41/audit-fix-B1+B3: gate the Step 2 Continue button so users
  // can't advance with broken Game Setup. Server would reject these too,
  // but failing fast at the step boundary keeps the UX honest.
  function isStep2Valid() {
    const min = Number(formData.min_buyin);
    const max = Number(formData.max_buyin);
    if (!Number.isFinite(min) || min < 0) return false;
    if (!Number.isFinite(max) || max <= 0) return false;
    if (max <= min) return false;
    if (formData.tables_count === 1) {
      if (formData.stakes === 'Custom' && !(formData.custom_stakes || '').trim()) return false;
      return true;
    }
    if (!Array.isArray(formData.tables) || formData.tables.length !== formData.tables_count) return false;
    return formData.tables.every(t =>
      !!t && !!t.game_type && !!t.stakes &&
      (t.stakes !== 'Custom' || (t.custom_stakes || '').trim().length > 0)
    );
  }

  // ── PHASE 17: LOGO UPLOAD HANDLER ─────────────────────────────────
  // Uses the SAME /api/social/upload endpoint Club Commander's
  // ClubPageDashboard and Social Pages use for logo/avatar uploads.
  // Server-side handles auth, file-type/size validation, and writes to
  // the social-media bucket via service role. We just forward the file
  // and store the returned publicUrl.
  async function handleLogoSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingLogo(true);
    setLogoError(null);
    try {
      const token = getAccessToken();
      if (!token) {
        setLogoError('Please sign in again before uploading');
        setUploadingLogo(false);
        return;
      }

      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', 'logos');
      fd.append('prefix', `home-group-pending-${Date.now()}`);

      // bug-hunt-zero/B-CREATE-LOGO-1: idempotency for the logo upload.
      // A retry of a successful upload creates an orphaned file in the
      // storage bucket. Server can use this header to dedupe.
      const idemKey = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'idem_' + Math.random().toString(36).slice(2) + Date.now().toString(36);

      const res = await fetch('/api/social/upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Idempotency-Key': idemKey,
        },
        body: fd,
      });
      const json = await res.json();

      if (!json.success || !json.url) {
        throw new Error(json.error || 'Upload failed');
      }

      updateField('profile_photo_url', json.url);
    } catch (err) {
      console.warn('Logo upload failed:', err);
      setLogoError(err?.message || 'Upload failed — please try again');
    } finally {
      setUploadingLogo(false);
      e.target.value = '';  // Reset so the same file can be re-picked if needed
    }
  }

  async function handleSubmit() {
    if (!formData.name.trim()) {
      setError('Please enter a group name');
      return;
    }

    // Phase 17: hard gate — logo upload required before we even call the API.
    // Server will reject anyway, but failing fast here gives a clearer UX.
    if (!formData.profile_photo_url) {
      setError('Please upload a logo before creating your group');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const { ensureAuthReady } = await import('../../../../src/lib/authUtils');
      const { supabase: sb } = await import('../../../../src/lib/supabase');
      // Dan-fix/no-auth-redirect (2026-05-12): the previous router.push triggered
      // PageErrorBoundary remount (keyed on router.asPath) which wiped form state
      // and looked like a silent submit reset. Instead: log the auth state, use
      // sync localStorage fallback, and let the SERVER decide via 401 response.
      const authUser = await ensureAuthReady(sb);
      console.log('[home-games-create] ensureAuthReady returned:', authUser ? `user ${authUser.id || authUser.user_id}` : 'NULL');
      if (!authUser) {
        // Fall back to sync localStorage read — if user is genuinely logged in,
        // smarter-poker-auth localStorage entry has their session even if the
        // Supabase client failed to validate it.
        let lsUser = null;
        try {
          const lsRaw = typeof localStorage !== 'undefined' ? localStorage.getItem('smarter-poker-auth') : null;
          lsUser = lsRaw ? JSON.parse(lsRaw).user : null;
          console.log('[home-games-create] localStorage fallback user:', lsUser ? `id ${lsUser.id}` : 'NULL');
        } catch (lsErr) {
          console.error('[home-games-create] localStorage parse failed:', lsErr);
        }
        if (!lsUser) {
          setError('Cannot verify your session. Please sign in again and try once more. If this keeps happening, send a screenshot of DevTools console.');
          setSubmitting(false);
          return;
        }
        console.warn('[home-games-create] proceeding with localStorage user despite ensureAuthReady=null');
      }
      // Dan-fix/diag-no-redirect (2026-05-12): the PR #491 hard-redirect on
      // null token was the silent submit reset. PageErrorBoundary keys on
      // router.asPath — any router.push remounts the page and wipes form state.
      // Strategy: gather the token best-effort, never redirect from submit,
      // and surface every failure inline + console for diagnosis.
      let token = null;
      try {
        const { getFreshAccessToken } = await import('../../../../src/lib/authUtils');
        token = await getFreshAccessToken();
        console.log('[home-games-create] getFreshAccessToken returned:', token ? `${token.substring(0,20)}... (length ${token.length})` : 'NULL');
      } catch (tokenErr) {
        console.error('[home-games-create] getFreshAccessToken threw:', tokenErr);
      }
      if (!token) {
        // Fall back to sync token; might be stale but at least makes the network call
        token = getAccessToken();
        console.warn('[home-games-create] using sync getAccessToken fallback:', token ? 'ok' : 'NULL');
      }
      if (!token) {
        setError('Could not retrieve authentication token. Open DevTools console for details, then try again.');
        console.error('[home-games-create] BOTH token paths returned null. Auth state:', { authUser, hasLocalStorage: typeof localStorage !== 'undefined', localStorageAuth: typeof localStorage !== 'undefined' ? localStorage.getItem('smarter-poker-auth')?.slice(0,80) : 'n/a' });
        return;
      }

      // Map form fields to API/DB column names.
      // Phase 41/audit-fix-B4: when multi-table, the "default" surfaced on
      // group cards is whatever Table 1 carries — keep it in sync so the rest
      // of the app doesn't show a stale single-table value.
      const isMultiTable = formData.tables_count > 1 && Array.isArray(formData.tables) && formData.tables.length > 0;
      const primaryGameType = isMultiTable ? formData.tables[0].game_type : formData.game_type;
      const primaryStakesRaw = isMultiTable ? formData.tables[0].stakes : formData.stakes;
      const primaryCustomStakes = isMultiTable ? (formData.tables[0].custom_stakes || '') : formData.custom_stakes;
      const resolvedStakes = primaryStakesRaw === 'Custom' ? primaryCustomStakes : primaryStakesRaw;
      const payload = {
        name: formData.name.trim(),
        description: formData.description,
        is_private: formData.visibility !== 'public',
        requires_approval: formData.requires_approval,
        city: formData.city,
        state: formData.state,
        zip_code: formData.zip_code || undefined,
        latitude: formData.approximate_lat || undefined,
        longitude: formData.approximate_lng || undefined,
        default_game_type: primaryGameType,
        default_stakes: resolvedStakes,
        typical_buyin_min: formData.min_buyin,
        typical_buyin_max: formData.max_buyin,
        max_players: formData.max_players,
        typical_day: formData.recurring && formData.schedule_days.length > 0 ? formData.schedule_days.join(',') : undefined,
        typical_time: formData.start_time || undefined,
        frequency: formData.recurring ? 'weekly' : undefined,
        profile_photo_url: formData.profile_photo_url,   // Phase 17: mandatory logo URL
        settings: {
          schedule_summary: getScheduleSummary(),
          end_time: formData.end_time || undefined,
          // Phase 41: per-table breakdown when host runs multiple tables.
          // Single-table groups omit the array (top-level default_game_type
          // and default_stakes already capture the same info).
          tables_count: formData.tables_count,
          tables: formData.tables_count > 1
            ? formData.tables.map((t) => ({
                game_type: t.game_type,
                stakes: t.stakes === 'Custom' ? (t.custom_stakes || '') : t.stakes,
              }))
            : undefined,
          // Dan-fix/tournaments: persist host's tournament schedule into
          // commander_home_groups.settings.tournaments. Only ship rows with
          // a non-empty name (silently drop empty draft rows). Coerce numeric
          // inputs to numbers; leave entries_cap null when blank = unlimited.
          schedules_tournaments: !!formData.schedules_tournaments,
          tournaments: formData.schedules_tournaments && Array.isArray(formData.tournaments) && formData.tournaments.length > 0
            ? formData.tournaments
                .filter((t) => t && typeof t.name === 'string' && t.name.trim().length > 0)
                .map((t) => ({
                  name: t.name.trim().slice(0, 120),
                  buy_in: Number(t.buy_in) || 0,
                  starting_stack: Number(t.starting_stack) || 0,
                  structure: t.structure || 'standard',
                  scheduled_date: t.scheduled_date || null,
                  scheduled_time: t.scheduled_time || null,
                  entries_cap: t.entries_cap === '' || t.entries_cap == null ? null : (Number(t.entries_cap) || null),
                }))
            : undefined,
        },
      };

      console.log('[home-games-create] About to POST to /api/commander/home-games/groups', { payloadKeys: Object.keys(payload), tokenLen: token ? token.length : 0 });
      let res;
      try {
        res = await fetch('/api/commander/home-games/groups', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            'X-Idempotency-Key': submissionTokenRef.current,
          },
          body: JSON.stringify(payload)
        });
        console.log('[home-games-create] fetch returned:', { status: res.status, ok: res.ok, url: res.url });
      } catch (fetchErr) {
        console.error('[home-games-create] fetch threw:', fetchErr);
        setError(`Network error: ${fetchErr.message || fetchErr}. Check DevTools Network tab for details.`);
        setSubmitting(false);
        return;
      }

      // Rotate the token on 2xx (success) or 4xx (server saw & rejected our input).
      // Keep it on 5xx / network errors so a safe retry doesn't duplicate.
      if (res.ok || (res.status >= 400 && res.status < 500)) {
        submissionTokenRef.current = makeToken();
      }

      // Phase 41/audit-fix-B8: surface the server's error message when present,
      // not a generic "Connection error" that hides 400s from the user.
      if (!res.ok) {
        let serverMsg = '';
        try {
          const errBody = await res.json();
          serverMsg = errBody?.error?.message || (typeof errBody?.error === 'string' ? errBody.error : '') || errBody?.message || '';
        } catch (_) { /* not JSON */ }
        throw new Error(serverMsg || `Request failed (${res.status})`);
      }
      const data = await res.json();

      if (data.success || data.group) {
        setCreatedGroup(data.group);

        // The commander-groups API auto-creates the linked social_pages
        // row via trg_autocreate_home_group_social_page and attaches it
        // to the response as `group.social_page`. Historical code here
        // did a second POST to /api/social/pages which produced an
        // orphan (non-linked) duplicate page — that's been removed.
        if (data.group && data.group.social_page) {
          setCreatedSocialPage(data.group.social_page);
        }

        // Dan-fix/tournaments-wiring: create each planned tournament as a
        // real commander_home_games row via rpc_hg_create_tournament. The
        // jsonb shadow in commander_home_groups.settings.tournaments stays
        // as the host's original schedule-at-signup; these rows are the
        // canonical event surface for RSVPs, public pages, and host
        // management.
        //
        // Non-fatal: if any tournament INSERT fails, group is still created
        // and host can re-add via the manage page. We log to console for
        // observability but advance to step 4 regardless.
        if (formData.schedules_tournaments &&
            Array.isArray(formData.tournaments) &&
            formData.tournaments.length > 0 &&
            data.group?.id) {
          const validRows = formData.tournaments.filter(
            (t) => t && typeof t.name === 'string' && t.name.trim().length > 0
                   && t.scheduled_date && t.scheduled_time
          );
          if (validRows.length > 0) {
            try {
              const results = await Promise.allSettled(
                validRows.map((t) =>
                  sb.rpc('rpc_hg_create_tournament', {
                    p_group_id:       data.group.id,
                    p_name:           t.name.trim().slice(0, 120),
                    p_buy_in:         Number(t.buy_in) || 0,
                    p_starting_stack: t.starting_stack === '' || t.starting_stack == null
                                        ? null : (Number(t.starting_stack) || null),
                    p_structure:      t.structure || 'standard',
                    p_scheduled_date: t.scheduled_date,
                    p_scheduled_time: t.scheduled_time,
                    p_entries_cap:    (t.entries_cap === '' || t.entries_cap == null)
                                        ? null : (Number(t.entries_cap) || null),
                  })
                )
              );
              const failures = results.filter(
                (r) => r.status === 'rejected' ||
                       (r.status === 'fulfilled' && r.value?.error)
              );
              if (failures.length > 0) {
                console.warn(
                  '[home-games-create] tournament create failures:',
                  failures.length, 'of', validRows.length,
                  failures.map((f) => f.reason || f.value?.error?.message || 'unknown')
                );
              }
            } catch (tErr) {
              console.warn('[home-games-create] tournament batch failed:', tErr);
            }
          }
        }

        setStep(4);
      } else {
        setError(data.error?.message || (typeof data.error === 'string' ? data.error : null) || 'Failed to create group');
      }
    } catch (err) {
      // Phase 41/audit-fix-B8: keep the specific message when we have one;
      // fall back to generic only on true network errors (no message).
      setError(err && err.message ? err.message : 'Connection error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <SEOHead
        title="Create Home Game"
        description="Smarter.Poker — The Future Of The Game."
        noindex={true}
      />

      <div className="cmd-page">
        {/* Dan-fix/header-pin-v2 (2026-05-12): switched from `sticky top-0` to
            `fixed top-0 left-0 right-0` because an ancestor (likely the layout
            wrapper) was breaking the sticky containing block on long forms,
            unsticking the header mid-scroll. Fixed positioning is immune to
            ancestor overflow/transform. A spacer below reserves height so
            page content doesn't jump under the pinned bar. */}
        {/* Dan-fix/header-overlap (2026-05-12): cmd-header-bar uses inline-flex
            which shrunk the header to content width, exposing the page behind it.
            Removed that class and added an opaque background to the fixed wrapper
            so content never bleeds through. Spacer bumped from 61 to 80 to match
            real rendered height (header + progress bar). */}
        <div className="fixed top-0 left-0 right-0 z-50 bg-[#0F1C32] border-b border-[#4A5E78]">
          <header className="bg-[#0F1C32]">
            <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
              <button
                onClick={() => router.back()}
                className="p-2 hover:bg-[#132240] rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-[#64748B]" />
              </button>
              <div>
                <h1 className="font-bold text-white">Host A Home Game</h1>
                <p className="text-sm text-[#64748B]">{step <= 3 ? `Step ${step} of 3` : 'Schedule First Game'}</p>
              </div>
            </div>
          </header>

          {/* Progress Bar */}
          <div className="bg-[#0F1C32] border-b border-[#4A5E78]">
            <div className="max-w-2xl mx-auto px-4">
              <div className="flex">
                {[1, 2, 3].map((s) => (
                  <div
                    key={s}
                    className={`flex-1 h-1 ${s <= step ? 'bg-[#22D3EE]' : 'bg-[#4A5E78]'}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
        {/* Dan-fix/header-overlap (2026-05-12): spacer matches header+progress bar */}
        <div style={{ height: 80 }} aria-hidden="true" />

        {/* ── Club Commander Home Games — Unified Signup Banner ──
            Shown identically whether the user arrived from Poker Near Me,
            Social Pages, or Club Commander. The `from` query param (set by
            the redirect links in each entry port) is surfaced as a small
            badge so the user sees continuity, not a cold cut-over.

            Dan-fix/banner-existing-host (2026-05-11): only show the
            "Signup complete / first home game" copy when the user is
            genuinely new to hosting (existingGroupCount === 0). Existing
            hosts who already have 1+ groups get a different, non-misleading
            banner. While we're still checking (existingGroupCount === null)
            we show nothing to avoid a flash of misleading copy. */}
        {step === 1 && existingGroupCount === 0 && (
          <div className="max-w-2xl mx-auto px-4 pt-4">
            <div className="rounded-lg border border-[#22D3EE]/30 bg-[#0F1C32] p-4">
              <div className="flex items-start gap-3">
                <div className="shrink-0 w-10 h-10 rounded-md bg-[#22D3EE]/10 flex items-center justify-center">
                  <Home className="w-5 h-5 text-[#22D3EE]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-semibold text-white">Your Club Commander Home Games host account is active</h2>
                    {(() => {
                      const from = router?.query?.from;
                      if (!from) return null;
                      const label = from === 'social_pages' ? 'via Social Pages'
                                  : from === 'poker_near_me' ? 'via Poker Near Me'
                                  : from === 'club_commander' ? 'via Club Commander'
                                  : null;
                      if (!label) return null;
                      return (
                        <span className="text-[10px] font-bold uppercase tracking-wide text-[#22D3EE] bg-[#22D3EE]/10 px-2 py-0.5 rounded-full border border-[#22D3EE]/30">
                          {label}
                        </span>
                      );
                    })()}
                  </div>
                  <p className="text-sm text-[#94A3B8] mt-1">
                    Signup complete. Let's create your first home game — this 3-step form sets up your group details, location, and schedule. The same flow no matter where you started.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Dan-fix/banner-existing-host (2026-05-11): existing-host banner.
            Shown to users who already have 1+ home groups. Honest about what
            this flow does — creates an additional home game, no "signup
            complete" misnomer. Links back to their existing groups list so
            they can manage what they already have instead of starting over. */}
        {step === 1 && existingGroupCount !== null && existingGroupCount > 0 && (
          <div className="max-w-2xl mx-auto px-4 pt-4">
            <div className="rounded-lg border border-[#22D3EE]/30 bg-[#0F1C32] p-4">
              <div className="flex items-start gap-3">
                <div className="shrink-0 w-10 h-10 rounded-md bg-[#22D3EE]/10 flex items-center justify-center">
                  <Plus className="w-5 h-5 text-[#22D3EE]" />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="font-semibold text-white">
                    Add another home game
                  </h2>
                  <p className="text-sm text-[#94A3B8] mt-1">
                    You already host {existingGroupCount === 1 ? '1 home group' : `${existingGroupCount} home groups`}.
                    This 3-step form will create an additional group with its own location, schedule, and members.
                    {' '}
                    <button
                      type="button"
                      onClick={() => router.push('/hub/commander/home-games')}
                      className="text-[#22D3EE] hover:underline"
                    >
                      Or manage your existing groups
                    </button>.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Form Content */}
        <main className="max-w-2xl mx-auto px-4 py-6">
          {/* Dan-fix/error-visibility (2026-05-11): wrap the error banner with
              a ref so handleSubmit can scrollIntoView on failure. On step 3 the
              error renders at the top of <main> but the user is typically
              scrolled near the bottom (where the Create button lives) and
              never sees the failure. */}
          {error && (
            <div
              ref={errorRef}
              className="mb-4 p-3 bg-[#EF4444]/10 border border-[#EF4444]/40 rounded-lg"
              role="alert"
            >
              <p className="text-sm font-semibold text-[#EF4444]">Submission failed</p>
              <p className="text-sm text-[#FCA5A5] mt-1">{error}</p>
            </div>
          )}

          {/* Step 1: Basic Info */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="cmd-panel p-6 space-y-4">
                <h2 className="font-semibold text-white flex items-center gap-2">
                  <Home className="w-5 h-5 text-[#22D3EE]" />
                  Group Details
                </h2>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Group Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => updateField('name', e.target.value)}
                    placeholder="e.g., Friday Night Poker Club"
                    className="cmd-input w-full h-12 px-4"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => updateField('description', e.target.value)}
                    placeholder="Tell Players About Your Game..."
                    rows={3}
                    className="cmd-input w-full px-4 py-3 resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Visibility
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => updateField('visibility', 'private')}
                      className={`p-4 rounded-lg border text-left transition-colors ${formData.visibility === 'private'
                          ? 'border-[#22D3EE] bg-[#22D3EE]/10'
                          : 'border-[#4A5E78] hover:bg-[#132240]'
                        }`}
                    >
                      <Lock className={`w-5 h-5 mb-2 ${formData.visibility === 'private' ? 'text-[#22D3EE]' : 'text-[#64748B]'}`} />
                      <p className="font-medium text-white">Private</p>
                      <p className="text-sm text-[#64748B]">Invite Only</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => updateField('visibility', 'public')}
                      className={`p-4 rounded-lg border text-left transition-colors ${formData.visibility === 'public'
                          ? 'border-[#22D3EE] bg-[#22D3EE]/10'
                          : 'border-[#4A5E78] hover:bg-[#132240]'
                        }`}
                    >
                      <Globe className={`w-5 h-5 mb-2 ${formData.visibility === 'public' ? 'text-[#22D3EE]' : 'text-[#64748B]'}`} />
                      <p className="font-medium text-white">Public</p>
                      <p className="text-sm text-[#64748B]">Anyone Can Find</p>
                    </button>
                  </div>
                </div>

                {formData.visibility === 'public' && (
                  <div className="flex items-center justify-between p-4 bg-[#0D192E] rounded-lg">
                    <div>
                      <p className="font-medium text-white">Require Approval</p>
                      <p className="text-sm text-[#64748B]">Review Join Requests Before Accepting</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => updateField('requires_approval', !formData.requires_approval)}
                      className={`w-12 h-6 rounded-full transition-colors ${formData.requires_approval ? 'bg-[#22D3EE]' : 'bg-[#4A5E78]'
                        }`}
                    >
                      <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${formData.requires_approval ? 'translate-x-6' : 'translate-x-0.5'
                        }`} />
                    </button>
                  </div>
                )}
              </div>

              <button
                onClick={() => setStep(2)}
                disabled={!formData.name.trim()}
                className="cmd-btn cmd-btn-primary w-full h-12 transition-colors disabled:opacity-50"
              >
                Continue
              </button>
            </div>
          )}

          {/* Step 2: Game Setup */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="cmd-panel p-6 space-y-4">
                <h2 className="font-semibold text-white flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-[#10B981]" />
                  Game Setup
                </h2>

                {/* Phase 41: Number-of-tables selector. Single table keeps the
                    legacy single-game flow; multi-table reveals a per-table
                    editor below where each table picks its own game/stakes. */}
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Number of Tables Running
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => {
                          setFormData((prev) => {
                            // Phase 41/audit-fix-B2/B5: stable IDs for React keys (prevents
                            // focus-jump and state-bleed when array length shrinks). Existing
                            // rows are preserved; only new slots get a fresh ID.
                            const makeId = () => (typeof crypto !== 'undefined' && crypto.randomUUID
                              ? crypto.randomUUID()
                              : 'tbl_' + Math.random().toString(36).slice(2) + Date.now().toString(36));
                            const nextTables = n > 1
                              ? Array.from({ length: n }, (_, i) => prev.tables[i] || {
                                  id: makeId(),
                                  game_type: i === 0 ? prev.game_type : 'nlhe',
                                  stakes: i === 0 ? prev.stakes : '$1/$2',
                                  custom_stakes: '',
                                })
                              : [];
                            return { ...prev, tables_count: n, tables: nextTables };
                          });
                        }}
                        className={`flex-1 min-w-[44px] h-10 rounded-lg border font-medium transition-colors ${formData.tables_count === n
                            ? 'border-[#22D3EE] bg-[#22D3EE]/10 text-[#22D3EE]'
                            : 'border-[#4A5E78] text-[#64748B] hover:bg-[#132240]'
                          }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-[#64748B] mt-2">
                    {formData.tables_count === 1
                      ? 'Single table — pick the game type and stakes below.'
                      : `Running ${formData.tables_count} tables — set the game type and stakes for each table below.`}
                  </p>
                  {formData.tables_count > 1 && (
                    <p className="text-[10px] text-[#64748B]/70 mt-1 italic">
                      Tip: reducing the count will discard the higher-numbered tables' settings.
                    </p>
                  )}
                </div>

                {formData.tables_count === 1 && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-white mb-2">
                        Game Type
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {GAME_TYPES.map(({ value, label }) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => updateField('game_type', value)}
                            className={`p-3 rounded-lg border text-sm font-medium transition-colors ${formData.game_type === value
                                ? 'border-[#22D3EE] bg-[#22D3EE]/10 text-[#22D3EE]'
                                : 'border-[#4A5E78] text-[#64748B] hover:bg-[#132240]'
                              }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-white mb-2">
                        Stakes
                      </label>
                      <div className="grid grid-cols-4 gap-2">
                        {STAKES_OPTIONS.map((stake) => (
                          <button
                            key={stake}
                            type="button"
                            onClick={() => updateField('stakes', stake)}
                            className={`p-2 rounded-lg border text-sm font-medium transition-colors ${formData.stakes === stake
                                ? 'border-[#22D3EE] bg-[#22D3EE]/10 text-[#22D3EE]'
                                : 'border-[#4A5E78] text-[#64748B] hover:bg-[#132240]'
                              }`}
                          >
                            {stake}
                          </button>
                        ))}
                      </div>
                      {formData.stakes === 'Custom' && (
                        <input
                          type="text"
                          value={formData.custom_stakes}
                          onChange={(e) => updateField('custom_stakes', e.target.value)}
                          placeholder="e.g., $2/$5/$10"
                          className="cmd-input mt-2 w-full h-10 px-4"
                        />
                      )}
                    </div>
                  </>
                )}

                {formData.tables_count > 1 && (
                  <div className="space-y-3">
                    {formData.tables.map((tbl, idx) => (
                      <div key={tbl.id || `tbl-fallback-${idx}`} className="p-4 rounded-lg border border-[#4A5E78]/40 bg-[#0D192E] space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-[#22D3EE]">Table {idx + 1}</span>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[#94A3B8] mb-1.5">
                            Game Type
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            {GAME_TYPES.map(({ value, label }) => (
                              <button
                                key={value}
                                type="button"
                                onClick={() => {
                                  setFormData((prev) => {
                                    const next = [...prev.tables];
                                    next[idx] = { ...next[idx], game_type: value };
                                    return { ...prev, tables: next };
                                  });
                                }}
                                className={`p-2.5 rounded-lg border text-xs font-medium transition-colors ${tbl.game_type === value
                                    ? 'border-[#22D3EE] bg-[#22D3EE]/10 text-[#22D3EE]'
                                    : 'border-[#4A5E78] text-[#64748B] hover:bg-[#132240]'
                                  }`}
                              >
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[#94A3B8] mb-1.5">
                            Stakes
                          </label>
                          <div className="grid grid-cols-4 gap-2">
                            {STAKES_OPTIONS.map((stake) => (
                              <button
                                key={stake}
                                type="button"
                                onClick={() => {
                                  setFormData((prev) => {
                                    const next = [...prev.tables];
                                    next[idx] = { ...next[idx], stakes: stake };
                                    return { ...prev, tables: next };
                                  });
                                }}
                                className={`p-2 rounded-lg border text-xs font-medium transition-colors ${tbl.stakes === stake
                                    ? 'border-[#22D3EE] bg-[#22D3EE]/10 text-[#22D3EE]'
                                    : 'border-[#4A5E78] text-[#64748B] hover:bg-[#132240]'
                                  }`}
                              >
                                {stake}
                              </button>
                            ))}
                          </div>
                          {tbl.stakes === 'Custom' && (
                            <input
                              type="text"
                              value={tbl.custom_stakes || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setFormData((prev) => {
                                  const next = [...prev.tables];
                                  next[idx] = { ...next[idx], custom_stakes: val };
                                  return { ...prev, tables: next };
                                });
                              }}
                              placeholder="e.g., $2/$5/$10"
                              className="cmd-input mt-2 w-full h-9 px-4 text-sm"
                            />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    {/* Dan-fix/dollar-prefix-overlap (2026-05-12): removed DollarSign icon (was overlapping value text) */}
                    <label className="block text-sm font-medium text-white mb-2">
                      Min Buy-in
                    </label>
                    <input
                      type="number"
                      value={formData.min_buyin}
                      onChange={(e) => updateField('min_buyin', parseInt(e.target.value) || 0)}
                      className="cmd-input w-full h-10 px-4"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      Max Buy-in
                    </label>
                    <input
                      type="number"
                      value={formData.max_buyin}
                      onChange={(e) => updateField('max_buyin', parseInt(e.target.value) || 0)}
                      className="cmd-input w-full h-10 px-4"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Max Players
                  </label>
                  <div className="flex gap-2">
                    {[6, 8, 9, 10].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => updateField('max_players', num)}
                        className={`flex-1 h-10 rounded-lg border font-medium transition-colors ${formData.max_players === num
                            ? 'border-[#22D3EE] bg-[#22D3EE]/10 text-[#22D3EE]'
                            : 'border-[#4A5E78] text-[#64748B] hover:bg-[#132240]'
                          }`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="cmd-btn cmd-btn-secondary flex-1 h-12 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={!isStep2Valid()}
                  title={isStep2Valid() ? '' : 'Fix the highlighted fields to continue'}
                  className="cmd-btn cmd-btn-primary flex-1 h-12 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continue
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Location & Schedule */}
          {step === 3 && (
            <div className="space-y-6">
              <div className="cmd-panel p-6 space-y-4">
                <h2 className="font-semibold text-white flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-[#EF4444]" />
                  Approximate Location
                </h2>
                <div className="p-3 bg-[#0D192E] rounded-lg border border-[#4A5E78]/40 flex items-start gap-3">
                  <MapPin className="w-4 h-4 text-[#EF4444] mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm text-[#94A3B8]">
                      Drag the pin to set your approximate area. Your exact address is never shared.
                    </p>
                    {formData.neighborhood && (
                      <p className="text-sm text-[#22D3EE] mt-1 font-medium">Selected Area: {formData.neighborhood}{formData.city ? `, ${formData.city}` : ''}</p>
                    )}
                  </div>
                </div>

                <LeafletLocationPicker
                  value={{ city: formData.city, state: formData.state }}
                  onChange={(loc) => {
                    if (loc.city) updateField('city', loc.city);
                    if (loc.state) updateField('state', loc.state);
                    if (loc.lat) updateField('approximate_lat', loc.lat);
                    if (loc.lng) updateField('approximate_lng', loc.lng);
                    if (loc.neighborhood) updateField('neighborhood', loc.neighborhood);
                    if (loc.zipCode) updateField('zip_code', loc.zipCode);
                  }}
                  approximateOnly={true}
                  height={350}
                />

                {/* Fallback manual inputs always visible below map */}
                <div className="grid grid-cols-2 gap-4 mt-2">
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      City
                    </label>
                    <input
                      type="text"
                      value={formData.city}
                      onChange={(e) => updateField('city', e.target.value)}
                      placeholder="Las Vegas"
                      className="cmd-input w-full h-10 px-4"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      State
                    </label>
                    <input
                      type="text"
                      value={formData.state}
                      onChange={(e) => updateField('state', e.target.value)}
                      placeholder="NV"
                      maxLength={2}
                      className="cmd-input w-full h-10 px-4 uppercase"
                    />
                  </div>
                </div>
              </div>

              <div className="cmd-panel p-6 space-y-4">
                <h2 className="font-semibold text-white flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-[#8B5CF6]" />
                  Schedule
                </h2>

                <div className="flex items-center justify-between p-4 bg-[#0D192E] rounded-lg">
                  <div>
                    <p className="font-medium text-white">Recurring Game</p>
                    <p className="text-sm text-[#64748B]">Set A Regular Schedule</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => updateField('recurring', !formData.recurring)}
                    className={`w-12 h-6 rounded-full transition-colors ${formData.recurring ? 'bg-[#22D3EE]' : 'bg-[#4A5E78]'
                      }`}
                  >
                    <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${formData.recurring ? 'translate-x-6' : 'translate-x-0.5'
                      }`} />
                  </button>
                </div>

                {formData.recurring && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-white mb-2">
                        Game Days (Select All That Apply)
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {DAYS_OF_WEEK.map(({ value, label }) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => toggleDay(value)}
                            className={`px-4 py-2 rounded-lg border text-sm font-semibold transition-all ${formData.schedule_days.includes(value)
                                ? 'border-[#8B5CF6] bg-[#8B5CF6]/15 text-[#C4B5FD] shadow-[0_0_8px_rgba(139,92,246,0.2)]'
                                : 'border-[#4A5E78] text-[#64748B] hover:bg-[#132240]'
                              }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-white mb-2">
                          Start Time
                        </label>
                        <input
                          type="time"
                          value={formData.start_time}
                          onChange={(e) => updateField('start_time', e.target.value)}
                          className="cmd-input w-full h-10 px-4"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-white mb-2">
                          End Time (Optional)
                        </label>
                        <input
                          type="time"
                          value={formData.end_time}
                          onChange={(e) => updateField('end_time', e.target.value)}
                          className="cmd-input w-full h-10 px-4"
                        />
                      </div>
                    </div>
                    {getScheduleSummary() && (
                      <div className="p-3 bg-[#8B5CF6]/10 rounded-lg border border-[#8B5CF6]/25 flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-[#C4B5FD]" />
                        <span className="text-sm text-[#C4B5FD] font-medium">{getScheduleSummary()}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Dan-fix/tournaments: Schedule Tournaments panel.
                  Yes/No toggle. When on, host adds one or more tournaments
                  with name/buy-in/starting stack/structure/date+time/cap.
                  Persists to settings.tournaments as an array of objects. */}
              <div className="cmd-panel p-6 space-y-4">
                <h2 className="font-semibold text-white flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-[#F59E0B]" />
                  Schedule Tournaments
                  <span className="text-xs font-normal text-[#64748B]">· Optional</span>
                </h2>

                <div className="flex items-center justify-between p-4 bg-[#0D192E] rounded-lg">
                  <div>
                    <p className="font-medium text-white">Tournaments?</p>
                    <p className="text-sm text-[#64748B]">Run Scheduled Tournaments At This Home Game</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !formData.schedules_tournaments;
                      updateField('schedules_tournaments', next);
                      // Seed an empty tournament row when turning on so the
                      // host doesn't see an empty panel + no obvious action.
                      if (next && (!formData.tournaments || formData.tournaments.length === 0)) {
                        updateField('tournaments', [{
                          name: '',
                          buy_in: '',
                          starting_stack: '',
                          structure: 'standard',
                          scheduled_date: '',
                          scheduled_time: formData.start_time || '19:00',
                          entries_cap: '',
                          recurring: false,
                          recurring_days: [],
                        }]);
                      }
                    }}
                    aria-pressed={formData.schedules_tournaments}
                    className={`w-12 h-6 rounded-full transition-colors ${formData.schedules_tournaments ? 'bg-[#22D3EE]' : 'bg-[#4A5E78]'}`}
                  >
                    <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${formData.schedules_tournaments ? 'translate-x-6' : 'translate-x-0.5'}`} />
                  </button>
                </div>

                {formData.schedules_tournaments && Array.isArray(formData.tournaments) && (
                  <div className="space-y-4">
                    {formData.tournaments.map((t, idx) => (
                      <div key={idx} className="p-4 bg-[#0D192E] rounded-lg border border-[#4A5E78]/40 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-white">Tournament {idx + 1}</p>
                          {formData.tournaments.length > 1 && (
                            <button
                              type="button"
                              onClick={() => {
                                updateField('tournaments', formData.tournaments.filter((_, i) => i !== idx));
                              }}
                              className="text-xs text-[#EF4444] hover:text-[#FBBF24]"
                            >
                              Remove
                            </button>
                          )}
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-white mb-1">Tournament Name</label>
                          <input
                            type="text"
                            value={t.name}
                            onChange={(e) => {
                              const arr = [...formData.tournaments];
                              arr[idx] = { ...arr[idx], name: e.target.value };
                              updateField('tournaments', arr);
                            }}
                            placeholder="e.g. Friday Night Freezeout"
                            maxLength={120}
                            className="cmd-input w-full h-10 px-4"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-sm font-medium text-white mb-1">Buy-In ($)</label>
                            <input
                              type="number"
                              min="0"
                              value={t.buy_in}
                              onChange={(e) => {
                                const arr = [...formData.tournaments];
                                arr[idx] = { ...arr[idx], buy_in: e.target.value };
                                updateField('tournaments', arr);
                              }}
                              placeholder="100"
                              className="cmd-input w-full h-10 px-4"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-white mb-1">Starting Stack</label>
                            <input
                              type="number"
                              min="0"
                              value={t.starting_stack}
                              onChange={(e) => {
                                const arr = [...formData.tournaments];
                                arr[idx] = { ...arr[idx], starting_stack: e.target.value };
                                updateField('tournaments', arr);
                              }}
                              placeholder="15000"
                              className="cmd-input w-full h-10 px-4"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-white mb-1">Blind Structure</label>
                          <select
                            value={t.structure}
                            onChange={(e) => {
                              const arr = [...formData.tournaments];
                              arr[idx] = { ...arr[idx], structure: e.target.value };
                              updateField('tournaments', arr);
                            }}
                            className="cmd-input w-full h-10 px-4"
                          >
                            <option value="turbo">Turbo (10 min levels)</option>
                            <option value="standard">Standard (15-20 min levels)</option>
                            <option value="deep">Deep Stack (25-30 min levels)</option>
                            <option value="bounty">Bounty</option>
                            <option value="rebuy">Rebuy</option>
                          </select>
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-sm font-medium text-white mb-1">Date</label>
                            <input
                              type="date"
                              value={t.scheduled_date}
                              onChange={(e) => {
                                const arr = [...formData.tournaments];
                                arr[idx] = { ...arr[idx], scheduled_date: e.target.value };
                                updateField('tournaments', arr);
                              }}
                              className="cmd-input w-full h-10 px-4"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-white mb-1">Start Time</label>
                            <input
                              type="time"
                              value={t.scheduled_time}
                              onChange={(e) => {
                                const arr = [...formData.tournaments];
                                arr[idx] = { ...arr[idx], scheduled_time: e.target.value };
                                updateField('tournaments', arr);
                              }}
                              className="cmd-input w-full h-10 px-4"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-white mb-1">
                            Max Entries <span className="text-xs text-[#64748B]">(blank = unlimited)</span>
                          </label>
                          <input
                            type="number"
                            min="2"
                            value={t.entries_cap}
                            onChange={(e) => {
                              const arr = [...formData.tournaments];
                              arr[idx] = { ...arr[idx], entries_cap: e.target.value };
                              updateField('tournaments', arr);
                            }}
                            placeholder="e.g. 30"
                            className="cmd-input w-full h-10 px-4"
                          />
                        </div>

                        {/* Dan-fix/tournament-recurring (2026-05-12) */}
                        <div className="flex items-center justify-between p-3 bg-[#101D33] rounded-lg">
                          <div>
                            <p className="text-sm font-medium text-white">Recurring Tournament</p>
                            <p className="text-xs text-[#64748B]">Set A Regular Schedule</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const arr = [...formData.tournaments];
                              arr[idx] = { ...arr[idx], recurring: !arr[idx].recurring };
                              updateField('tournaments', arr);
                            }}
                            aria-pressed={!!t.recurring}
                            className={`w-12 h-6 rounded-full transition-colors ${t.recurring ? 'bg-[#22D3EE]' : 'bg-[#4A5E78]'}`}
                          >
                            <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${t.recurring ? 'translate-x-6' : 'translate-x-0.5'}`} />
                          </button>
                        </div>

                        {t.recurring && (
                          <div>
                            <label className="block text-sm font-medium text-white mb-2">
                              Tournament Days (Select All That Apply)
                            </label>
                            <div className="flex flex-wrap gap-2">
                              {DAYS_OF_WEEK.map(({ value, label }) => {
                                const sel = Array.isArray(t.recurring_days) && t.recurring_days.includes(value);
                                return (
                                  <button
                                    key={value}
                                    type="button"
                                    onClick={() => {
                                      const arr = [...formData.tournaments];
                                      const cur = Array.isArray(arr[idx].recurring_days) ? arr[idx].recurring_days : [];
                                      arr[idx] = {
                                        ...arr[idx],
                                        recurring_days: sel ? cur.filter((d) => d !== value) : [...cur, value],
                                      };
                                      updateField('tournaments', arr);
                                    }}
                                    className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${sel
                                      ? 'border-[#8B5CF6] bg-[#8B5CF6]/15 text-[#C4B5FD] shadow-[0_0_8px_rgba(139,92,246,0.2)]'
                                      : 'border-[#4A5E78] text-[#64748B] hover:bg-[#132240]'
                                    }`}
                                  >
                                    {label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}

                    <button
                      type="button"
                      onClick={() => {
                        updateField('tournaments', [
                          ...(formData.tournaments || []),
                          {
                            name: '',
                            buy_in: '',
                            starting_stack: '',
                            structure: 'standard',
                            scheduled_date: '',
                            scheduled_time: formData.start_time || '19:00',
                            entries_cap: '',
                            recurring: false,
                            recurring_days: [],
                          },
                        ]);
                      }}
                      className="w-full h-10 rounded-lg border-2 border-dashed border-[#4A5E78] text-[#94A3B8] hover:border-[#22D3EE] hover:text-[#22D3EE] flex items-center justify-center gap-2 transition"
                    >
                      <Plus className="w-4 h-4" /> Add Another Tournament
                    </button>
                  </div>
                )}
              </div>

              <div className="cmd-panel p-6 space-y-4">
                <h2 className="font-semibold text-white flex items-center gap-2">
                  <ImageIcon className="w-5 h-5 text-[#F59E0B]" />
                  Group Logo <span className="text-xs font-normal text-[#F59E0B]">· Required</span>
                </h2>
                <p className="text-sm text-[#94A3B8]">
                  Upload a logo that represents your home game. This appears on your public page, in push notifications to followers, and across Poker Near Me / Daily Tournaments when your games surface there. A real image is required before you can finish creating your group.
                </p>

                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleLogoSelected}
                />

                {!formData.profile_photo_url ? (
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    disabled={uploadingLogo}
                    className="cmd-btn cmd-btn-secondary w-full h-14 flex items-center justify-center gap-2 border-dashed border-2 border-[#F59E0B]/50 hover:border-[#F59E0B] transition-colors"
                  >
                    {uploadingLogo ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin text-[#F59E0B]" />
                        <span>Uploading…</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-5 h-5 text-[#F59E0B]" />
                        <span>Choose Logo Image</span>
                      </>
                    )}
                  </button>
                ) : (
                  <div className="p-3 bg-[#0D192E] rounded-lg border border-[#10B981]/40 flex items-center gap-3">
                    <img
                      src={formData.profile_photo_url}
                      alt="Group logo preview"
                      style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[#10B981] flex items-center gap-1.5">
                        <Check className="w-4 h-4" />
                        Logo uploaded
                      </p>
                      <p className="text-xs text-[#64748B] truncate">Click replace to pick a different image</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => logoInputRef.current?.click()}
                      disabled={uploadingLogo}
                      className="cmd-btn cmd-btn-secondary h-9 px-3 text-xs flex items-center gap-1.5 flex-shrink-0"
                    >
                      {uploadingLogo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                      Replace
                    </button>
                  </div>
                )}

                {logoError && (
                  <div className="p-3 bg-[#EF4444]/10 rounded-lg border border-[#EF4444]/40 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-[#EF4444] mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-[#FECACA]">{logoError}</p>
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(2)}
                  className="cmd-btn cmd-btn-secondary flex-1 h-12 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting || uploadingLogo || !formData.profile_photo_url}
                  title={!formData.profile_photo_url ? 'Upload a logo to continue' : ''}
                  className="cmd-btn cmd-btn-primary flex-1 h-12 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Creating...
                    </>
                  ) : !formData.profile_photo_url ? (
                    <>
                      <ImageIcon className="w-5 h-5" />
                      Upload Logo First
                    </>
                  ) : (
                    <>
                      <Check className="w-5 h-5" />
                      Create Group
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
          {/* Step 4 fallback — Dan-fix/post-submit (2026-05-11)
              If we reached step 4 but `createdGroup` happens to be null
              (API returned success without the group payload, or a race
              cleared it), still show a minimal success screen so the user
              isn't dropped onto a blank page. They can navigate to their
              home groups list to see what was created. Previously: step 4
              with null createdGroup → empty <main> → looked like the
              wizard reset. */}
          {step === 4 && !createdGroup && (
            <div className="space-y-6">
              <div className="cmd-panel p-6 text-center">
                <div className="w-16 h-16 rounded-full bg-[#10B981]/20 flex items-center justify-center mx-auto mb-4">
                  <Check className="w-8 h-8 text-[#10B981]" />
                </div>
                <h2 className="text-xl font-bold text-white">Group Created</h2>
                <p className="text-[#64748B] mt-1">
                  Your home game group has been created. View it in your dashboard to add tournaments, photos, and invite members.
                </p>
                <button
                  type="button"
                  onClick={() => router.push('/hub/commander/home-games')}
                  className="mt-4 cmd-btn cmd-btn-primary h-12 px-6"
                >
                  Go to My Home Games
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Group Created + Social Page + Schedule */}
          {step === 4 && createdGroup && (
            <div className="space-y-6">
              <div className="cmd-panel p-6 text-center">
                <div className="w-16 h-16 rounded-full bg-[#10B981]/20 flex items-center justify-center mx-auto mb-4">
                  <Check className="w-8 h-8 text-[#10B981]" />
                </div>
                <h2 className="text-xl font-bold text-white">Game Created</h2>
                <p className="text-[#64748B] mt-1">{createdGroup.name} is live. Your Social Page was auto-created.</p>
              </div>

              {/* Social Page Progress Bar */}
              {createdSocialPage && (() => {
                const sp = createdSocialPage;
                const checks = [
                  { label: 'Name & Description', icon: FileText, done: !!(sp.name && sp.description) },
                  { label: 'Profile Photo', icon: ImageIcon, done: !!sp.avatar_url },
                  { label: 'Cover Photo', icon: ImageIcon, done: !!(sp.cover_url || sp.metadata?.cover_photo_url) },
                  { label: 'Location', icon: MapPin, done: !!(sp.location_city) },
                  { label: 'Schedule Set', icon: Clock, done: formData.schedule_days.length > 0 },
                ];
                const completed = checks.filter(c => c.done).length;
                const pct = Math.round((completed / checks.length) * 100);
                return (
                  <div className="cmd-panel p-5 space-y-4">
                    <div className="flex items-center gap-3">
                      <Share2 className="w-5 h-5 text-[#8B5CF6]" />
                      <div className="flex-1">
                        <h3 className="font-semibold text-white text-sm">Social Page: {sp.name}</h3>
                        <p className="text-xs text-[#64748B] mt-0.5">Complete your page so players can follow and find your game</p>
                      </div>
                      <span className="text-xs font-bold text-[#C4B5FD]">{pct}%</span>
                    </div>
                    {/* Progress bar */}
                    <div className="h-2 bg-[#1E293B] rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700" style={{
                        width: `${pct}%`,
                        background: pct === 100 ? 'linear-gradient(90deg, #10B981, #22D3EE)' : 'linear-gradient(90deg, #8B5CF6, #C4B5FD)',
                      }} />
                    </div>
                    {/* Checklist */}
                    <div className="space-y-2">
                      {checks.map((item, idx) => (
                        <div key={idx} className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                          item.done ? 'bg-[#10B981]/10' : 'bg-[#0D192E] hover:bg-[#132240] cursor-pointer'
                        }`}
                          onClick={() => {
                            // Dan-fix/manage-redirect (2026-05-12): home-game social
                            // pages are quarantined from /api/social/pages (Phase 15).
                            // Send users to the home-group native manage page instead.
                            if (!item.done && createdGroup?.id) {
                              router.push(`/hub/commander/home-games/${createdGroup.id}/manage`);
                            }
                          }}
                        >
                          {item.done ? (
                            <Check className="w-4 h-4 text-[#10B981]" />
                          ) : (
                            <item.icon className="w-4 h-4 text-[#64748B]" />
                          )}
                          <span className={`text-sm ${item.done ? 'text-[#10B981] line-through' : 'text-white'}`}>{item.label}</span>
                          {!item.done && <ChevronRight className="w-3 h-3 text-[#64748B] ml-auto" />}
                        </div>
                      ))}
                    </div>
                    {/* Dan-fix/manage-redirect (2026-05-12): redirect to the
                        home-group native manage page, not the quarantined
                        social-pages route which returns 404 for home_game pages. */}
                    <button
                      onClick={() => router.push(`/hub/commander/home-games/${createdGroup.id}/manage`)}
                      className="cmd-btn cmd-btn-secondary w-full h-10 text-sm flex items-center justify-center gap-2"
                    >
                      <Share2 className="w-4 h-4" />
                      Complete Your Home Group Setup
                    </button>
                  </div>
                );
              })()}

              {/* Dan-fix/first-game-collapse (2026-05-12): toggle disclosure.
                  Closed by default. When opened, the form is fully prefilled
                  from the group data the user already entered. */}
              <button
                type="button"
                onClick={() => setShowFirstGameForm(v => !v)}
                className="cmd-btn cmd-btn-secondary w-full h-10 text-sm flex items-center justify-center gap-2"
              >
                <Calendar className="w-4 h-4" />
                {showFirstGameForm ? 'Hide First Game Schedule' : 'Schedule Your First Game (Optional)'}
              </button>

              {showFirstGameForm && firstGameError && (
                <div className="mb-3 p-3 bg-[#EF4444]/10 border border-[#EF4444]/40 rounded-lg" role="alert">
                  <p className="text-sm font-semibold text-[#EF4444]">Could not schedule the first game</p>
                  <p className="text-sm text-[#FCA5A5] mt-1">{firstGameError}</p>
                </div>
              )}
              {showFirstGameForm && (
              <CreateGameForm
                groupId={createdGroup.id}
                isLoading={eventSubmitting}
                initialData={{
                  // Title: seed with group name so user just appends a label like "Night 1"
                  title: createdGroup?.name || formData.name || '',
                  // Game type: pass-through. 'tournament' isn't in CreateGameForm's
                  // GAME_TYPES list, so map it to empty so the user picks a valid one.
                  game_type: formData.game_type === 'tournament' ? '' : (formData.game_type || 'nlhe'),
                  // Stakes: resolve Custom to the typed-in value
                  stakes: formData.stakes === 'Custom' ? (formData.custom_stakes || '') : (formData.stakes || ''),
                  // Buy-ins: pass numbers as strings (text input expects strings)
                  buy_in_min: formData.min_buyin !== '' && formData.min_buyin != null ? String(formData.min_buyin) : '',
                  buy_in_max: formData.max_buyin !== '' && formData.max_buyin != null ? String(formData.max_buyin) : '',
                  max_players: formData.max_players || 9,
                  // Start/end time: prefill from group's typical schedule
                  start_time: formData.start_time || '',
                  end_time: formData.end_time || '',
                  // City/state/zip: prefill from group address. Street address must come
                  // from the user — group only stores approximate location, no exact street.
                  city: formData.city || '',
                  state: formData.state || '',
                  zip: formData.zip_code || '',
                  // requires_approval: carry the group setting forward
                  requires_approval: !!formData.requires_approval,
                }}
                onSubmit={async (eventData) => {
                  // Audit-fix/event-field-mapping (2026-05-12): the shared
                  // CreateGameForm component uses field names that DO NOT match
                  // /api/home-games/events. Without this remap, every submit
                  // returns 400 (missing scheduled_date) and the form silently
                  // does nothing. Map names here at the integration boundary so
                  // the shared component stays generic.
                  setEventSubmitting(true);
                  setFirstGameError(null);
                  try {
                    const token = getAccessToken();
                    if (!token) {
                      setFirstGameError('Please sign in again — your session expired.');
                      return;
                    }
                    const fullAddress = [eventData.address, eventData.city, eventData.state, eventData.zip]
                      .filter(v => v && String(v).trim().length > 0)
                      .join(', ');
                    const apiPayload = {
                      group_id: eventData.group_id,
                      title: eventData.title,
                      description: eventData.description,
                      game_type: eventData.game_type,
                      stakes: eventData.stakes,
                      // API expects buyin_min/buyin_max, NOT buy_in_min/buy_in_max.
                      buyin_min: eventData.buy_in_min,
                      buyin_max: eventData.buy_in_max,
                      // API expects scheduled_date, NOT event_date.
                      scheduled_date: eventData.event_date,
                      start_time: eventData.start_time,
                      end_time: eventData.end_time,
                      // CreateGameForm collects 4 separate address fields; API
                      // takes one combined string.
                      address: fullAddress || undefined,
                      max_players: eventData.max_players,
                      allow_guests: !!eventData.allow_guests,
                      // API expects special_rules, NOT notes.
                      special_rules: eventData.notes || undefined,
                    };
                    const res = await fetch('/api/commander/home-games/events', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                        'X-Idempotency-Key': eventSubmissionTokenRef.current,
                      },
                      body: JSON.stringify(apiPayload)
                    });
                    // Rotate idempotency on 2xx or parseable 4xx (server saw
                    // and rejected our input — safe to retry with new key).
                    if (res.ok || (res.status >= 400 && res.status < 500)) {
                      eventSubmissionTokenRef.current = makeToken();
                    }
                    if (!res.ok) {
                      let serverMsg = '';
                      try {
                        const errBody = await res.json();
                        serverMsg = errBody?.error?.message
                          || (typeof errBody?.error === 'string' ? errBody.error : '')
                          || errBody?.message || '';
                      } catch (_) { /* not JSON */ }
                      throw new Error(serverMsg || `Request failed (${res.status})`);
                    }
                    const data = await res.json();
                    if (data.success || data.event) {
                      router.push(`/hub/commander/home-games/${createdGroup.id}`);
                    } else {
                      setFirstGameError('Game created but the response was unexpected. Refresh the group page to see it.');
                    }
                  } catch (err) {
                    console.warn('Schedule event error:', err);
                    setFirstGameError(err && err.message ? err.message : 'Failed to schedule. Check your details and try again.');
                  } finally {
                    setEventSubmitting(false);
                  }
                }}
                onCancel={() => router.push(`/hub/commander/home-games/${createdGroup.id}`)}
              />
              )}

              <button
                onClick={() => router.push(`/hub/commander/home-games/${createdGroup.id}`)}
                className="w-full text-center text-sm text-[#64748B] hover:text-white transition-colors py-2 flex items-center justify-center gap-2"
              >
                Skip - Go to Group
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </main>
      </div>
    </>
  );
}
