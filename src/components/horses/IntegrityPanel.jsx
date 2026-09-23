/**
 * INTEGRITY, Phase 5.
 *
 * Detector health is the first answer on every section. An empty list never
 * decides that the platform is clean, and a finding never decides a case.
 * Queue rows are grouped and ranked by the server before pagination so direct
 * chip-flow evidence stays reachable beneath the much larger timing set.
 *
 * Horses are players. Their identity is disclosed beside every human identity
 * and there is no control, query or predicate that removes them.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import KpiTile from './KpiTile';
import Pager from './Pager';
import StatusPill from './StatusPill';
import styles from './shared.module.css';
import { num, when } from '../../lib/horsesAdminTokens';
import { hasPermission } from './operatorPermissions';
import {
  CASE_DECISIONS,
  CASE_ITEM_TYPES,
  INTEGRITY_ADMIN,
  INTEGRITY_PATTERNS,
  QUEUE_TIERS,
  SANCTION_KINDS,
  addItemBody,
  assignBody,
  caseItemsOf,
  caseOf,
  caseUrl,
  decideBody,
  flagsUrl,
  handsUrl,
  healthOf,
  healthUrl,
  listMeta,
  newIntegrityOpId,
  openCaseBody,
  pairsUrl,
  payloadOf,
  pendingSanctionsOf,
  queueMeta,
  queueUrl,
  rowsOf,
  sanctionBody,
  timingRowsOf,
  handSearchCoverage,
  timingUrl,
} from './integrityAdmin';
import {
  classifyDetectorHealth,
  compositionLabel,
  integrityEmptyState,
  patternLabel,
  severityTone,
  tierLabel,
  tierTone,
} from './integrityModel';

const SECTIONS = [
  ['queue', 'Queue'],
  ['case', 'Case'],
  ['pairs', 'Pairs'],
  ['flags', 'Flags'],
  ['timing', 'Timing'],
  ['hands', 'Hands'],
  ['health', 'Health'],
];

const PAGE_SIZE = 25;
const HEALTH_REFRESH_MS = 60000;

function first(row, ...keys) {
  for (const key of keys) {
    if (row && row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
  }
  return null;
}

function arrayOf(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return [];
  return [value];
}

function toInstant(value) {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : '';
}

function subjectIdsOf(row) {
  const direct = first(row, 'subject_ids', 'subjectIds', 'player_ids', 'playerIds');
  if (Array.isArray(direct)) return direct.filter(Boolean);
  return [
    first(row, 'player_a_id', 'playerAId', 'subject_a_id', 'subjectAId'),
    first(row, 'player_b_id', 'playerBId', 'subject_b_id', 'subjectBId'),
  ].filter(Boolean);
}

function caseIdOf(row) {
  return first(row, 'case_id', 'caseId', 'integrity_case_id', 'integrityCaseId')
    || first(row?.case, 'id', 'case_id', 'caseId');
}

function participantName(row, side) {
  const prefix = side === 'a' ? ['player_a', 'playerA', 'subject_a', 'subjectA']
    : ['player_b', 'playerB', 'subject_b', 'subjectB'];
  for (const base of prefix) {
    const value = first(row, `${base}_name`, `${base}Name`, `${base}_username`, `${base}Username`);
    if (value) return value;
  }
  return side === 'a'
    ? first(row, 'player_a_id', 'playerAId', 'subject_a_id', 'subjectAId') || 'Player A'
    : first(row, 'player_b_id', 'playerBId', 'subject_b_id', 'subjectBId') || 'Player B';
}

function participantIsHorse(row, side) {
  return side === 'a'
    ? first(row, 'player_a_is_horse', 'playerAIsHorse', 'subject_a_is_horse', 'subjectAIsHorse') === true
    : first(row, 'player_b_is_horse', 'playerBIsHorse', 'subject_b_is_horse', 'subjectBIsHorse') === true;
}

function patternsOf(row) {
  const values = first(row, 'patterns', 'pattern_types', 'patternTypes', 'pattern_type', 'patternType');
  return arrayOf(values).filter(Boolean);
}

function reasonsOf(row) {
  const values = first(
    row,
    'tier_reason',
    'tierReason',
    'rank_reasons',
    'rankReasons',
    'ranking_reasons',
    'rankingReasons',
    'reasons',
  );
  return arrayOf(values).filter(Boolean);
}

function toneClass(tone) {
  if (tone === 'danger') return styles.errorNote;
  if (tone === 'warn') return styles.warnNote;
  if (tone === 'good') return styles.goodNote;
  return styles.infoNote;
}

function booleanLabel(value) {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  return 'Unknown';
}

function Fact({ label, children, mono = false }) {
  return (
    <div>
      <dt className={styles.factLabel}>{label}</dt>
      <dd className={mono ? styles.mono : styles.factValue}>{children ?? 'Unknown'}</dd>
    </div>
  );
}

function EmptyNotice({ model }) {
  if (!model) return null;
  return (
    <div className={toneClass(model.tone)} role={model.tone === 'danger' ? 'alert' : 'status'}>
      <strong>{model.title}. </strong>
      {model.detail}
    </div>
  );
}

/**
 * One abortable, sequence-guarded read. Extra response metadata stays attached
 * to `data`, so the explicit empty state cannot be lost beside the rows.
 */
function useIntegrityRead({ active, authFetch, url, retainData = false }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [reload, setReload] = useState(0);
  const seqRef = useRef(0);

  useEffect(() => {
    if (!active || !url) return undefined;
    const seq = ++seqRef.current;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    setLoading(true);
    setError(null);
    if (!retainData) {
      setData(null);
      setLoaded(false);
    }

    authFetch(url, { signal: controller ? controller.signal : undefined })
      .then((body) => {
        if (seq !== seqRef.current) return;
        setData(body);
        setLoaded(true);
      })
      .catch((err) => {
        if (seq !== seqRef.current || err?.name === 'AbortError') return;
        setError(err?.message || 'That Integrity Read Failed');
        setLoaded(true);
      })
      .finally(() => {
        if (seq === seqRef.current) setLoading(false);
      });

    return () => {
      seqRef.current += 1;
      if (controller) {
        try { controller.abort(); } catch { /* already settled */ }
      }
    };
  }, [active, authFetch, reload, retainData, url]);

  const refresh = useCallback(() => setReload((value) => value + 1), []);
  return { data, loading, loaded, error, refresh };
}

function DetectorHealthBanner({ resource, onRefresh, onViewHealth, showingHealth }) {
  const model = classifyDetectorHealth(
    resource.data ? healthOf(resource.data) : null,
    { loading: resource.loading, error: resource.error },
  );
  const health = healthOf(resource.data);
  const lastSuccess = first(health, 'last_success_at', 'lastSuccessAt');
  const role = model.loud ? 'alert' : 'status';

  return (
    <div className={toneClass(model.tone)} role={role} aria-live={model.loud ? 'assertive' : 'polite'}>
      <strong>{model.title}. </strong>
      {model.detail}
      {lastSuccess ? ` Last Successful Run: ${when(lastSuccess, true)}.` : ''}
      <div className={styles.rowActions}>
        <button type="button" className={styles.btn} onClick={onRefresh} disabled={resource.loading}>
          {resource.loading ? 'Refreshing Health' : 'Refresh Health'}
        </button>
        {!showingHealth && (
          <button type="button" className={styles.btn} onClick={onViewHealth}>
            View Health Details
          </button>
        )}
      </div>
    </div>
  );
}

function Participant({ name, horse }) {
  return (
    <span className={styles.pillRow}>
      <span>{name}</span>
      <StatusPill status={horse ? 'horse' : 'human'} label={horse ? 'Horse' : 'Human'} tone={horse ? 'info' : 'neutral'} />
    </span>
  );
}

function QueueCard({ row, canModerate, busy, onOpenCase, onViewCase }) {
  const tier = first(row, 'rank_tier', 'rankTier', 'tier');
  const severity = first(row, 'severity', 'max_severity', 'maxSeverity');
  const composition = first(row, 'participant_composition', 'participantComposition', 'composition');
  const caseId = caseIdOf(row);
  const patterns = patternsOf(row);
  const reasons = reasonsOf(row);
  const observations = first(row, 'observation_count', 'observationCount', 'total_observations');
  const sources = first(row, 'source_count', 'sourceCount', 'detector_source_count');
  const maxScore = first(row, 'max_score', 'maxScore', 'suspicion_score', 'suspicionScore');
  const netFlow = first(row, 'absolute_net_flow', 'absoluteNetFlow', 'net_flow', 'netFlow');

  return (
    <article className={styles.card}>
      <div className={styles.panelHead}>
        <div>
          <h3 className={styles.cardTitle}>{tierLabel(tier)}</h3>
          <div className={styles.pillRow}>
            <StatusPill status={tier || 'unranked'} label={tierLabel(tier)} tone={tierTone(tier)} />
            {severity ? <StatusPill status={severity} tone={severityTone(severity)} /> : null}
            {patterns.map((pattern) => (
              <StatusPill key={String(pattern)} status={pattern} label={patternLabel(pattern)} tone={pattern === 'CHIP_DUMP' ? 'danger' : 'info'} />
            ))}
          </div>
        </div>
        <div className={styles.rowActions}>
          {caseId ? (
            <button type="button" className={styles.btn} onClick={() => onViewCase(caseId)}>
              View Case
            </button>
          ) : (
            <button
              type="button"
              className={`${styles.btn} ${styles.btnGo}`}
              onClick={() => onOpenCase(row)}
              disabled={busy || !canModerate || subjectIdsOf(row).length === 0}
            >
              Open Case
            </button>
          )}
        </div>
      </div>

      <dl className={styles.factGrid}>
        <Fact label="Player A">
          <Participant name={participantName(row, 'a')} horse={participantIsHorse(row, 'a')} />
        </Fact>
        <Fact label="Player B">
          <Participant name={participantName(row, 'b')} horse={participantIsHorse(row, 'b')} />
        </Fact>
        <Fact label="Participant Composition">{compositionLabel(composition)}</Fact>
        <Fact label="Observations">{num(observations, 'Unknown')}</Fact>
        <Fact label="Detector Sources">{num(sources, 'Unknown')}</Fact>
        <Fact label="Maximum Source Score">{num(maxScore, 'Unknown')}</Fact>
        <Fact label="Absolute Net Flow">{num(netFlow, 'Unknown')}</Fact>
        <Fact label="Last Seen">{when(first(row, 'last_seen', 'lastSeen'), true)}</Fact>
      </dl>

      <div className={styles.infoNote}>
        <strong>Why This Pair Is Here. </strong>
        {reasons.length ? reasons.map(String).join('. ') : 'The Route Did Not Return Its Ranking Reasons.'}
      </div>
    </article>
  );
}

function SimpleRecordCard({ row, kind }) {
  const id = first(row, 'id', 'flag_id', 'flagId', 'hand_id', 'handId', 'pair_id', 'pairId');
  const pattern = first(row, 'pattern_type', 'patternType', 'pattern');
  const severity = first(row, 'severity', 'risk_level', 'riskLevel');
  const title = kind === 'pairs'
    ? `${participantName(row, 'a')} And ${participantName(row, 'b')}`
    : kind === 'flags'
      ? patternLabel(first(row, 'flag_type', 'flagType') || 'Integrity Flag')
    : kind === 'hands'
      ? `Hand ${id || 'Unknown'}`
      : kind === 'timing'
        ? `${compositionLabel(first(row, 'composition'))} Timing`
        : first(row, 'title', 'reason', 'flag_type', 'flagType') || 'Integrity Flag';

  return (
    <article className={styles.card}>
      <div className={styles.panelHead}>
        <h3 className={styles.cardTitle}>{title}</h3>
        <div className={styles.pillRow}>
          {pattern ? <StatusPill status={pattern} label={patternLabel(pattern)} tone="info" /> : null}
          {severity ? <StatusPill status={severity} tone={severityTone(severity)} /> : null}
        </div>
      </div>
      <dl className={styles.factGrid}>
        {kind === 'pairs' && (
          <>
            <Fact label="Player A"><Participant name={participantName(row, 'a')} horse={participantIsHorse(row, 'a')} /></Fact>
            <Fact label="Player B"><Participant name={participantName(row, 'b')} horse={participantIsHorse(row, 'b')} /></Fact>
            <Fact label="Gross Flow">{num(first(row, 'gross_flow', 'grossFlow'), 'Unknown')}</Fact>
            <Fact label="Absolute Net Flow">{num(first(row, 'absolute_net_flow', 'absoluteNetFlow'), 'Unknown')}</Fact>
          </>
        )}
        {kind === 'flags' && (
          <>
            <Fact label="Player">
              <Participant
                name={first(row, 'player_name', 'playerName', 'player_id', 'playerId') || 'Unknown'}
                horse={first(row, 'player_is_horse', 'playerIsHorse') === true}
              />
            </Fact>
            <Fact label="Status">{first(row, 'status') || 'Unknown'}</Fact>
            <Fact label="Flagged">{when(first(row, 'flagged_at', 'flaggedAt', 'created_at', 'createdAt'), true)}</Fact>
            <Fact label="Flag Type">{patternLabel(first(row, 'flag_type', 'flagType') || 'Unknown')}</Fact>
            <Fact label="Events In Thirty Days">{num(first(row, 'event_count_30d', 'eventCount30d'), 'Unknown')}</Fact>
          </>
        )}
        {kind === 'timing' && (
          <>
            <Fact label="Participant Composition">{compositionLabel(first(row, 'composition'))}</Fact>
            <Fact label="Adjacent Action Pairs">{num(first(row, 'adjacent_pairs', 'adjacentPairs'), 'Unknown')}</Fact>
            <Fact label="Distinct Hands">{num(first(row, 'distinct_hands', 'distinctHands'), 'Unknown')}</Fact>
            <Fact label="Median Decision Time">{num(first(row, 'median_ms', 'medianMs'), 'Unknown')} Milliseconds</Fact>
            <Fact label="Pairs Under 500 Milliseconds">{num(first(row, 'under_500ms', 'under500ms'), 'Unknown')}</Fact>
          </>
        )}
        {kind === 'hands' && (
          <>
            <Fact label="Table" mono>{first(row, 'table_id', 'tableId') || 'Unknown'}</Fact>
            <Fact label="Played">{when(first(row, 'created_at', 'createdAt', 'played_at', 'playedAt'), true)}</Fact>
            <Fact label="Pot">{num(first(row, 'pot', 'pot_size', 'potSize'), 'Unknown')}</Fact>
            <Fact label="Players">{num(arrayOf(first(row, 'player_ids', 'playerIds', 'players')).length, 'Unknown')}</Fact>
          </>
        )}
      </dl>
      {first(row, 'detail', 'description', 'note', 'summary') ? (
        <p className={styles.cardNote}>{String(first(row, 'detail', 'description', 'note', 'summary'))}</p>
      ) : null}
    </article>
  );
}

function CursorPager({ resource, cursor, history, setCursor, setHistory, noun }) {
  const rows = rowsOf(resource.data, noun.toLowerCase());
  const meta = listMeta(resource.data, rows.length);
  return (
    <Pager
      offset={history.length * PAGE_SIZE}
      limit={PAGE_SIZE}
      count={rows.length}
      total={meta.total}
      hasMore={meta.hasMore ?? Boolean(meta.nextCursor)}
      loading={resource.loading}
      noun={noun}
      onPrevious={() => setHistory((entries) => {
        const previous = entries[entries.length - 1] || '';
        setCursor(previous);
        return entries.slice(0, -1);
      })}
      onNext={() => {
        if (!meta.nextCursor) return;
        setHistory((entries) => [...entries, cursor]);
        setCursor(meta.nextCursor);
      }}
    />
  );
}

export default function IntegrityPanel({
  authFetch,
  showNotification,
  permissions = null,
  operatorId = null,
  permissionsDegraded = false,
}) {
  const [section, setSection] = useState('queue');
  const [busy, setBusy] = useState(false);
  const canModerate = hasPermission(permissions, 'moderation.write');
  const canMoveMoney = canModerate && hasPermission(permissions, 'money.write');

  const health = useIntegrityRead({
    active: true,
    authFetch,
    url: healthUrl(),
    retainData: true,
  });

  useEffect(() => {
    const timer = setInterval(health.refresh, HEALTH_REFRESH_MS);
    return () => clearInterval(timer);
  }, [health.refresh]);

  const [queueTier, setQueueTier] = useState('');
  const [queuePattern, setQueuePattern] = useState('');
  const [queueCursor, setQueueCursor] = useState('');
  const [queueBack, setQueueBack] = useState([]);
  const queueRequestUrl = useMemo(
    () => queueUrl({ tier: queueTier, pattern: queuePattern, cursor: queueCursor, limit: PAGE_SIZE }),
    [queueCursor, queuePattern, queueTier],
  );
  const queue = useIntegrityRead({
    active: section === 'queue',
    authFetch,
    url: queueRequestUrl,
  });

  const [selectedCaseId, setSelectedCaseId] = useState('');
  const [caseQuery, setCaseQuery] = useState('');
  const selectedCaseUrl = selectedCaseId ? caseUrl(selectedCaseId) : null;
  const caseRead = useIntegrityRead({
    active: section === 'case' && Boolean(selectedCaseId),
    authFetch,
    url: selectedCaseUrl,
  });

  const [pairCursor, setPairCursor] = useState('');
  const [pairBack, setPairBack] = useState([]);
  const pairRequestUrl = useMemo(
    () => pairsUrl({ cursor: pairCursor, limit: PAGE_SIZE }),
    [pairCursor],
  );
  const pairs = useIntegrityRead({
    active: section === 'pairs',
    authFetch,
    url: pairRequestUrl,
  });

  const [flagCursor, setFlagCursor] = useState('');
  const [flagBack, setFlagBack] = useState([]);
  const flagRequestUrl = useMemo(
    () => flagsUrl({ cursor: flagCursor, limit: PAGE_SIZE }),
    [flagCursor],
  );
  const flags = useIntegrityRead({
    active: section === 'flags',
    authFetch,
    url: flagRequestUrl,
  });

  const [timingDraft, setTimingDraft] = useState({ since: '', asOf: '' });
  const [timingFilters, setTimingFilters] = useState({ since: '', asOf: '' });
  const timingRequestUrl = useMemo(
    () => timingUrl({ ...timingFilters, handLimit: 200 }),
    [timingFilters],
  );
  const timing = useIntegrityRead({
    active: section === 'timing',
    authFetch,
    url: timingRequestUrl,
  });

  const [handDraft, setHandDraft] = useState({ playerId: '', pairPlayerId: '', asOf: '' });
  const [handFilters, setHandFilters] = useState(null);
  const [handCursor, setHandCursor] = useState('');
  const [handBack, setHandBack] = useState([]);
  const handRequestUrl = useMemo(
    () => handFilters ? handsUrl({ ...handFilters, cursor: handCursor, limit: PAGE_SIZE }) : null,
    [handCursor, handFilters],
  );
  const hands = useIntegrityRead({
    active: section === 'hands' && Boolean(handFilters),
    authFetch,
    url: handRequestUrl,
  });

  const [itemType, setItemType] = useState('note');
  const [itemRef, setItemRef] = useState('');
  const [itemNote, setItemNote] = useState('');
  const [decision, setDecision] = useState('no_action');
  const [decisionNote, setDecisionNote] = useState('');
  const [sanctionDraft, setSanctionDraft] = useState(() => ({
    kind: 'warning', subjectId: '', amount: '', restrictionId: '', note: '', opId: newIntegrityOpId(),
  }));
  const [localPending, setLocalPending] = useState(null);

  const casePayload = caseRead.data;
  const caseRecord = caseOf(casePayload);
  const caseItems = caseItemsOf(casePayload);
  const caseSubjects = arrayOf(first(caseRecord, 'subject_ids', 'subjectIds')).filter(Boolean);
  const caseStatus = first(caseRecord, 'status');
  const caseDecision = first(caseRecord, 'decision');
  const expectedSanction = {
    warned: 'warning',
    restricted: 'restriction',
    confiscated: 'confiscation',
  }[caseDecision] || null;
  const sanctionReady = caseStatus === 'decided' && sanctionDraft.kind === expectedSanction;

  useEffect(() => {
    if (!caseSubjects.length || sanctionDraft.subjectId) return;
    setSanctionDraft((draft) => ({ ...draft, subjectId: String(caseSubjects[0]), opId: newIntegrityOpId() }));
  }, [caseSubjects.join('|'), sanctionDraft.subjectId]);

  const post = useCallback(async (body, successMessage) => {
    setBusy(true);
    try {
      const data = await authFetch(INTEGRITY_ADMIN, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      showNotification(data?.message || successMessage, data?.pending ? 'info' : 'success');
      return data;
    } catch (err) {
      showNotification(err?.message || 'That Integrity Action Failed', 'error');
      return null;
    } finally {
      setBusy(false);
    }
  }, [authFetch, showNotification]);

  const viewCase = useCallback((caseId) => {
    const id = String(caseId || '').trim();
    if (!id) return;
    setSelectedCaseId(id);
    setCaseQuery(id);
    setSection('case');
  }, []);

  const openQueueCase = useCallback(async (row) => {
    const existing = caseIdOf(row);
    if (existing) { viewCase(existing); return; }
    const patterns = patternsOf(row);
    const kind = patterns.includes('CHIP_DUMP') ? 'chip_dumping' : 'collusion';
    const data = await post(openCaseBody({
      subjectIds: subjectIdsOf(row),
      kind,
      severity: first(row, 'severity', 'max_severity', 'maxSeverity') || '',
      note: 'Opened From The Ranked Integrity Queue.',
    }), 'Case Opened');
    if (!data) return;
    const root = payloadOf(data);
    const id = first(root, 'caseId', 'case_id') || first(root.case, 'id');
    queue.refresh();
    if (id) viewCase(id);
  }, [post, queue.refresh, viewCase]);

  const resetQueuePage = useCallback(() => {
    setQueueCursor('');
    setQueueBack([]);
  }, []);

  const queueRows = rowsOf(queue.data, 'groups', 'queue');
  const queueInfo = queueMeta(queue.data);
  const queueEmpty = queue.loading && !queue.loaded
    ? null
    : integrityEmptyState({
      state: queueInfo.state,
      error: queue.error,
      rowCount: queueRows.length,
    });
  const pendingSanctions = pendingSanctionsOf(casePayload);
  const visiblePending = localPending ? [localPending, ...pendingSanctions] : pendingSanctions;

  const mutateCase = useCallback(async (body, message) => {
    const data = await post(body, message);
    if (data) caseRead.refresh();
    return data;
  }, [caseRead.refresh, post]);

  const rotateSanction = useCallback((patch) => {
    setSanctionDraft((draft) => ({ ...draft, ...patch, opId: newIntegrityOpId() }));
    setLocalPending(null);
  }, []);

  const submitSanction = useCallback(async (draft = sanctionDraft) => {
    if (!selectedCaseId || !draft.subjectId) return;
    const data = await mutateCase(sanctionBody({ caseId: selectedCaseId, ...draft }), 'Sanction Recorded');
    if (!data) return;
    if (data.pending) {
      const root = payloadOf(data);
      setLocalPending({
        ...draft,
        ...root,
        caseId: selectedCaseId,
        opId: first(root, 'opId', 'op_id') || draft.opId,
      });
    } else {
      setLocalPending(null);
      setSanctionDraft((current) => ({
        ...current,
        amount: '',
        restrictionId: '',
        note: '',
        opId: newIntegrityOpId(),
      }));
    }
  }, [mutateCase, sanctionDraft, selectedCaseId]);

  const renderListState = (resource, rows, emptyCopy) => {
    if (resource.loading && !resource.loaded) return <div className={styles.stateNote}>Loading Integrity Records</div>;
    if (resource.error) return <div className={styles.errorNote} role="alert">{resource.error}</div>;
    if (resource.loaded && rows.length === 0) {
      return (
        <div className={styles.infoNote} role="status">
          <strong>{emptyCopy.title}. </strong>{emptyCopy.detail}
        </div>
      );
    }
    return null;
  };

  const pairRows = rowsOf(pairs.data, 'pairs');
  const flagRows = rowsOf(flags.data, 'flags');
  const timingRows = timingRowsOf(timing.data);
  const timingCoverage = first(payloadOf(timing.data), 'coverage') || {};
  const handRows = rowsOf(hands.data, 'hands');
  const handCoverage = handSearchCoverage(hands.data);
  const liveHealth = healthOf(health.data);

  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <div>
          <h2 className={styles.panelTitle}>Integrity</h2>
          <p className={styles.panelIntro}>
            Ranked Detector Evidence, Append-Only Cases, And Human Decisions. A Signal Is Never A Verdict.
          </p>
        </div>
      </div>

      <DetectorHealthBanner
        resource={health}
        onRefresh={health.refresh}
        showingHealth={section === 'health'}
        onViewHealth={() => setSection('health')}
      />

      <div className={styles.sectionNav} role="tablist" aria-label="Integrity Sections">
        {SECTIONS.map(([id, label]) => (
          <button
            key={id}
            id={`integrity-tab-${id}`}
            type="button"
            role="tab"
            aria-selected={section === id}
            aria-controls={`integrity-panel-${id}`}
            className={`${styles.btn} ${styles.sectionNavItem}`}
            onClick={() => setSection(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {permissionsDegraded && canModerate && (
        <div className={styles.warnNote} role="alert">
          <strong>Your Permissions Could Not Be Read. </strong>
          Write Controls Are Shown Conservatively, But The Server Makes Every Permission Decision.
        </div>
      )}

      {section === 'queue' && (
        <section id="integrity-panel-queue" role="tabpanel" aria-labelledby="integrity-tab-queue">
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Ranked Review Queue</h3>
            <p className={styles.cardNote}>
              One Row Per Canonical Player Pair. Direct Money Flow Ranks First, Corroborated Evidence Next, And Timing-Only Evidence Remains Reachable.
            </p>
            <div className={styles.filterRow}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Evidence Tier</span>
                <select
                  className={styles.select}
                  value={queueTier}
                  onChange={(event) => {
                    setQueueTier(event.target.value);
                    resetQueuePage();
                  }}
                >
                  <option value="">All Evidence Tiers</option>
                  {QUEUE_TIERS.map((tier) => <option key={tier} value={tier}>{tierLabel(tier)}</option>)}
                </select>
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Pattern</span>
                <select
                  className={styles.select}
                  value={queuePattern}
                  onChange={(event) => {
                    setQueuePattern(event.target.value);
                    resetQueuePage();
                  }}
                >
                  <option value="">All Patterns</option>
                  {INTEGRITY_PATTERNS.map((pattern) => (
                    <option key={pattern} value={pattern}>{patternLabel(pattern)}</option>
                  ))}
                </select>
              </label>
              <button type="button" className={styles.btn} onClick={queue.refresh} disabled={queue.loading}>
                Refresh Queue
              </button>
            </div>
          </div>

          <div className={styles.kpiGrid}>
            {QUEUE_TIERS.map((tier) => (
              <KpiTile
                key={tier}
                label={`${tierLabel(tier)} Pairs`}
                value={num(
                  first(queueInfo.tierTotals, tier),
                  queue.loaded && !queue.error ? 0 : 'Unknown',
                )}
                tone={tierTone(tier) === 'danger' ? 'danger' : tierTone(tier) === 'warn' ? 'warn' : undefined}
              />
            ))}
            <KpiTile label="Pairs In This View" value={num(queueInfo.filteredTotal ?? queueInfo.total, 'Unknown')} tone="accent" />
          </div>

          <EmptyNotice model={queueEmpty} />
          {queue.loading && !queue.loaded && <div className={styles.stateNote}>Loading Ranked Pairs</div>}
          {queueRows.map((row, index) => (
            <QueueCard
              key={String(first(row, 'pair_key', 'pairKey', 'id') || `${subjectIdsOf(row).join('-')}-${index}`)}
              row={row}
              canModerate={canModerate}
              busy={busy}
              onOpenCase={openQueueCase}
              onViewCase={viewCase}
            />
          ))}
          {queueRows.length > 0 && (
            <Pager
              offset={queueBack.length * PAGE_SIZE}
              limit={PAGE_SIZE}
              count={queueRows.length}
              total={queueInfo.filteredTotal ?? queueInfo.total}
              hasMore={queueInfo.hasMore ?? Boolean(queueInfo.nextCursor)}
              loading={queue.loading}
              noun="Pairs"
              onPrevious={() => setQueueBack((history) => {
                const previous = history[history.length - 1] || '';
                setQueueCursor(previous);
                return history.slice(0, -1);
              })}
              onNext={() => {
                if (!queueInfo.nextCursor) return;
                setQueueBack((history) => [...history, queueCursor]);
                setQueueCursor(queueInfo.nextCursor);
              }}
            />
          )}
        </section>
      )}

      {section === 'case' && (
        <section id="integrity-panel-case" role="tabpanel" aria-labelledby="integrity-tab-case">
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Case Record</h3>
            <p className={styles.cardNote}>
              Evidence Is Appended And Never Rewritten. A Human Decision Is The Only Verdict On This Screen.
            </p>
            <div className={styles.filterRow}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Case ID</span>
                <input
                  className={styles.input}
                  value={caseQuery}
                  onChange={(event) => setCaseQuery(event.target.value)}
                  placeholder="Case ID"
                />
              </label>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnGo}`}
                onClick={() => viewCase(caseQuery)}
                disabled={!caseQuery.trim()}
              >
                Open Case Record
              </button>
            </div>
          </div>

          {!selectedCaseId && (
            <div className={styles.infoNote} role="status">
              <strong>No Case Is Open. </strong>Choose A Pair From The Queue Or Enter A Case ID.
            </div>
          )}
          {caseRead.loading && !caseRead.loaded && <div className={styles.stateNote}>Loading Case Record</div>}
          {caseRead.error && <div className={styles.errorNote} role="alert">{caseRead.error}</div>}

          {caseRecord && (
            <>
              <div className={styles.card}>
                <div className={styles.panelHead}>
                  <div>
                    <h3 className={styles.cardTitle}>{patternLabel(first(caseRecord, 'kind') || 'Integrity Case')}</h3>
                    <div className={styles.pillRow}>
                      <StatusPill status={first(caseRecord, 'status') || 'unknown'} label={patternLabel(first(caseRecord, 'status') || 'unknown')} />
                      {first(caseRecord, 'severity') ? <StatusPill status={first(caseRecord, 'severity')} label={patternLabel(first(caseRecord, 'severity'))} tone={severityTone(first(caseRecord, 'severity'))} /> : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={styles.btn}
                    disabled={!canModerate || busy || !operatorId}
                    onClick={() => mutateCase(assignBody({ caseId: selectedCaseId, assignedTo: operatorId }), 'Case Assigned')}
                  >
                    Assign To Me
                  </button>
                </div>
                <dl className={styles.factGrid}>
                  <Fact label="Case ID" mono>{first(caseRecord, 'id') || selectedCaseId}</Fact>
                  <Fact label="Subjects">{caseSubjects.length ? caseSubjects.join(', ') : 'Unknown'}</Fact>
                  <Fact label="Opened">{when(first(caseRecord, 'opened_at', 'openedAt'), true)}</Fact>
                  <Fact label="Assigned To" mono>{first(caseRecord, 'assigned_to', 'assignedTo') || 'Unassigned'}</Fact>
                  <Fact label="Decision">{patternLabel(first(caseRecord, 'decision') || 'No Decision')}</Fact>
                  <Fact label="Decided">{when(first(caseRecord, 'decided_at', 'decidedAt'), true)}</Fact>
                </dl>
              </div>

              <div className={styles.card}>
                <h3 className={styles.cardTitle}>Evidence Timeline</h3>
                {caseItems.length === 0 ? (
                  <p className={styles.cardNote}>No Evidence Has Been Attached To This Case Yet.</p>
                ) : caseItems.map((item, index) => (
                  <article key={String(first(item, 'id') || index)} className={styles.trailEntry}>
                    <div className={styles.trailHead}>
                      <StatusPill status={first(item, 'item_type', 'itemType') || 'evidence'} tone="info" />
                      {first(item, 'retracted_at', 'retractedAt') ? <StatusPill status="retracted" tone="warn" /> : null}
                      <span>{when(first(item, 'added_at', 'addedAt'), true)}</span>
                    </div>
                    <div className={styles.mono}>{first(item, 'item_ref', 'itemRef') || 'No External Reference'}</div>
                    {first(item, 'detail') ? <pre className={styles.trailBlock}>{JSON.stringify(first(item, 'detail'), null, 2)}</pre> : null}
                  </article>
                ))}
              </div>

              {canModerate && caseStatus !== 'decided' && (
                <div className={styles.infoNote} role="status">
                  <strong>Record A Human Decision First. </strong>
                  A Sanction Cannot Be Applied Until This Case Has A Recorded Verdict.
                </div>
              )}

              {canModerate && caseStatus === 'decided' && !expectedSanction && (
                <div className={styles.infoNote} role="status">
                  <strong>No Sanction Is Authorized. </strong>
                  The Recorded Decision Is No Action.
                </div>
              )}

              {canModerate && caseStatus === 'decided' && expectedSanction && (
                <div className={styles.card}>
                  <h3 className={styles.cardTitle}>Attach Evidence</h3>
                  <div className={styles.filterRow}>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Evidence Type</span>
                      <select className={styles.select} value={itemType} onChange={(event) => setItemType(event.target.value)}>
                        {CASE_ITEM_TYPES.map((type) => <option key={type} value={type}>{patternLabel(type)}</option>)}
                      </select>
                    </label>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Evidence Reference</span>
                      <input className={styles.input} value={itemRef} onChange={(event) => setItemRef(event.target.value)} placeholder="Record ID Or Hand ID" />
                    </label>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Operator Note</span>
                      <textarea className={styles.textarea} value={itemNote} onChange={(event) => setItemNote(event.target.value)} placeholder="Why This Evidence Belongs On The Case" />
                    </label>
                  </div>
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnGo}`}
                    disabled={busy || (!itemRef.trim() && !itemNote.trim())}
                    onClick={async () => {
                      const data = await mutateCase(addItemBody({
                        caseId: selectedCaseId,
                        itemType,
                        itemRef,
                        detail: itemNote ? { note: itemNote.trim() } : {},
                      }), 'Evidence Attached');
                      if (data) { setItemRef(''); setItemNote(''); }
                    }}
                  >
                    Attach Evidence
                  </button>
                </div>
              )}

              {canModerate && (
                <div className={styles.card}>
                  <h3 className={styles.cardTitle}>Record Human Decision</h3>
                  <p className={styles.cardNote}>This Records The Verdict. It Does Not Apply A Sanction By Itself.</p>
                  <div className={styles.filterRow}>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Decision</span>
                      <select className={styles.select} value={decision} onChange={(event) => setDecision(event.target.value)}>
                        {CASE_DECISIONS.map((value) => <option key={value} value={value}>{patternLabel(value)}</option>)}
                      </select>
                    </label>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Decision Note</span>
                      <textarea className={styles.textarea} value={decisionNote} onChange={(event) => setDecisionNote(event.target.value)} placeholder="Evidence And Reason For The Decision" />
                    </label>
                  </div>
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnGo}`}
                    disabled={busy || decisionNote.trim().length < 10}
                    onClick={async () => {
                      const data = await mutateCase(decideBody({ caseId: selectedCaseId, decision, decisionNote }), 'Decision Recorded');
                      if (data) setDecisionNote('');
                    }}
                  >
                    Record Decision
                  </button>
                </div>
              )}

              {visiblePending.map((pending, index) => {
                const opId = first(pending, 'op_id', 'opId');
                const pendingDraft = {
                  kind: first(pending, 'kind') || 'warning',
                  subjectId: first(pending, 'subject_id', 'subjectId'),
                  amount: first(pending, 'amount'),
                  restrictionId: first(pending, 'restriction_id', 'restrictionId'),
                  note: first(pending, 'note'),
                  opId,
                };
                return (
                  <div key={String(first(pending, 'approval_id', 'approvalId') || opId || index)} className={styles.warnNote} role="status">
                    <strong>A Sanction Is Waiting For A Second Operator. </strong>
                    The Approval Queue Records The Decision And Does Not Apply It. Return Here With The Same Operation ID After Approval.
                    <div className={styles.rowActions}>
                      <button
                        type="button"
                        className={styles.btn}
                        disabled={busy || !canModerate || !opId}
                        onClick={() => submitSanction(pendingDraft)}
                      >
                        Check Approval And Apply
                      </button>
                    </div>
                  </div>
                );
              })}

              {canModerate && (
                <div className={styles.card}>
                  <h3 className={styles.cardTitle}>Apply A Sanction</h3>
                  <p className={styles.cardNote}>
                    A Finding Never Reaches This Control By Itself. Confiscation Also Requires Money Permission And A Second Operator.
                  </p>
                  <div className={styles.filterRow}>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Sanction</span>
                      <select className={styles.select} value={sanctionDraft.kind} onChange={(event) => rotateSanction({ kind: event.target.value })}>
                        {SANCTION_KINDS.map((kind) => <option key={kind} value={kind}>{patternLabel(kind)}</option>)}
                      </select>
                    </label>
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Subject</span>
                      <select className={styles.select} value={sanctionDraft.subjectId} onChange={(event) => rotateSanction({ subjectId: event.target.value })}>
                        <option value="">Choose A Subject</option>
                        {caseSubjects.map((id) => <option key={String(id)} value={String(id)}>{String(id)}</option>)}
                      </select>
                    </label>
                    {sanctionDraft.kind === 'confiscation' && (
                      <label className={styles.field}>
                        <span className={styles.fieldLabel}>Chip Amount</span>
                        <input className={styles.input} type="number" min="1" step="1" value={sanctionDraft.amount} onChange={(event) => rotateSanction({ amount: event.target.value })} />
                      </label>
                    )}
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Sanction Note</span>
                      <textarea className={styles.textarea} value={sanctionDraft.note} onChange={(event) => rotateSanction({ note: event.target.value })} placeholder="Why This Sanction Follows The Human Decision" />
                    </label>
                  </div>
                  {sanctionDraft.kind === 'confiscation' && !canMoveMoney && (
                    <div className={styles.warnNote}>Money Permission Is Required For Confiscation.</div>
                  )}
                  {sanctionDraft.kind === 'restriction' && (
                    <label className={styles.field}>
                      <span className={styles.fieldLabel}>Restriction ID</span>
                      <input
                        className={styles.input}
                        value={sanctionDraft.restrictionId}
                        onChange={(event) => rotateSanction({ restrictionId: event.target.value })}
                        placeholder="Existing Restriction ID"
                      />
                      <span className={styles.fieldHint}>Phase 4 Owns The Restriction Record. This Ledger Links To It.</span>
                    </label>
                  )}
                  <button
                    type="button"
                    className={`${styles.btn} ${sanctionDraft.kind === 'confiscation' ? styles.btnDanger : styles.btnGo}`}
                    disabled={busy || !sanctionReady || !sanctionDraft.subjectId || sanctionDraft.note.trim().length < 10
                      || (sanctionDraft.kind === 'confiscation' && (!canMoveMoney || Number(sanctionDraft.amount) <= 0))
                      || (sanctionDraft.kind === 'restriction' && !sanctionDraft.restrictionId.trim())}
                    onClick={() => submitSanction()}
                  >
                    {sanctionDraft.kind === 'confiscation' ? 'Request Confiscation' : 'Apply Sanction'}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {section === 'pairs' && (
        <section id="integrity-panel-pairs" role="tabpanel" aria-labelledby="integrity-tab-pairs">
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Pairwise Chip Flow</h3>
            <p className={styles.cardNote}>Detector Direction Is Preserved While Canonical Pairs Keep Repeated Observations Together.</p>
            <button type="button" className={styles.btn} onClick={pairs.refresh} disabled={pairs.loading}>Refresh Pairs</button>
          </div>
          {renderListState(pairs, pairRows, { title: 'No Pair Records Match This View', detail: 'Change The Pattern Or Check Detector Health Before Treating The Result As Quiet.' })}
          {pairRows.map((row, index) => <SimpleRecordCard key={String(first(row, 'pair_key', 'pairKey', 'id') || index)} row={row} kind="pairs" />)}
          {pairRows.length > 0 && (
            <CursorPager resource={pairs} cursor={pairCursor} history={pairBack} setCursor={setPairCursor} setHistory={setPairBack} noun="Pairs" />
          )}
        </section>
      )}

      {section === 'flags' && (
        <section id="integrity-panel-flags" role="tabpanel" aria-labelledby="integrity-tab-flags">
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Anti-Cheat Flags</h3>
            <p className={styles.cardNote}>The Complete Flag Feed, Ordered By The Server And Paged With A Stable Cursor.</p>
            <button type="button" className={styles.btn} onClick={flags.refresh} disabled={flags.loading}>Refresh Flags</button>
          </div>
          <div className={styles.infoNote}>
            <strong>Multi-Accounting Is Deferred. </strong>
            The Device And Signup Sources Have No Edges Yet, So An Empty Link Graph Would Not Be An Honest Product.
          </div>
          {renderListState(flags, flagRows, { title: 'No Flags Match This View', detail: 'The Flag Source Was Read, But The Current Filters Returned No Records.' })}
          {flagRows.map((row, index) => <SimpleRecordCard key={String(first(row, 'id') || index)} row={row} kind="flags" />)}
          {flagRows.length > 0 && (
            <CursorPager resource={flags} cursor={flagCursor} history={flagBack} setCursor={setFlagCursor} setHistory={setFlagBack} noun="Flags" />
          )}
        </section>
      )}

      {section === 'timing' && (
        <section id="integrity-panel-timing" role="tabpanel" aria-labelledby="integrity-tab-timing">
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Decision Timing Distribution</h3>
            <p className={styles.cardNote}>
              Horse And Human Rows Stay Beside One Another. Coverage Counts State What The Current Data Can Actually Compare.
            </p>
            <div className={styles.filterRow}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Since</span>
                <input className={styles.input} type="datetime-local" value={timingDraft.since} onChange={(event) => setTimingDraft((draft) => ({ ...draft, since: event.target.value }))} />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>As Of</span>
                <input className={styles.input} type="datetime-local" value={timingDraft.asOf} onChange={(event) => setTimingDraft((draft) => ({ ...draft, asOf: event.target.value }))} />
              </label>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnGo}`}
                onClick={() => setTimingFilters({ since: toInstant(timingDraft.since), asOf: toInstant(timingDraft.asOf) })}
              >
                Apply Timing Window
              </button>
            </div>
          </div>
          {renderListState(timing, timingRows, { title: 'No Timing Distribution Was Produced', detail: 'The Selected Window Contains No Comparable Actions. This Does Not Mean No Integrity Risk Exists.' })}
          {timing.loaded && !timing.error && (
            <div className={styles.card}>
              <h3 className={styles.cardTitle}>Timing Sample Coverage</h3>
              <dl className={styles.factGrid}>
                <Fact label="Since">{when(first(timingCoverage, 'since'), true)}</Fact>
                <Fact label="As Of">{when(first(timingCoverage, 'as_of', 'asOf'), true)}</Fact>
                <Fact label="Hands Sampled">{num(first(timingCoverage, 'hands_sampled', 'handsSampled'), 'Unknown')}</Fact>
                <Fact label="Actions Sampled">{num(first(timingCoverage, 'actions_sampled', 'actionsSampled'), 'Unknown')}</Fact>
                <Fact label="Adjacent Pairs">{num(first(timingCoverage, 'adjacent_pairs', 'adjacentPairs'), 'Unknown')}</Fact>
                <Fact label="Sample Truncated">{booleanLabel(first(timingCoverage, 'truncated'))}</Fact>
              </dl>
            </div>
          )}
          {timingRows.map((row, index) => <SimpleRecordCard key={String(first(row, 'composition') || index)} row={row} kind="timing" />)}
        </section>
      )}

      {section === 'hands' && (
        <section id="integrity-panel-hands" role="tabpanel" aria-labelledby="integrity-tab-hands">
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Investigator Hand Search</h3>
            <p className={styles.cardNote}>Search By One Player Or A Player Pair. No Unbounded Hand-History Read Runs On Page Load.</p>
            <div className={styles.filterRow}>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Player ID</span>
                <input className={styles.input} value={handDraft.playerId} onChange={(event) => setHandDraft((draft) => ({ ...draft, playerId: event.target.value }))} placeholder="Player ID" />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Pair Player ID</span>
                <input className={styles.input} value={handDraft.pairPlayerId} onChange={(event) => setHandDraft((draft) => ({ ...draft, pairPlayerId: event.target.value }))} placeholder="Optional Second Player ID" />
              </label>
              <label className={styles.field}>
                <span className={styles.fieldLabel}>As Of</span>
                <input className={styles.input} type="datetime-local" value={handDraft.asOf} onChange={(event) => setHandDraft((draft) => ({ ...draft, asOf: event.target.value }))} />
              </label>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnGo}`}
                disabled={!handDraft.playerId.trim()}
                onClick={() => {
                  setHandCursor('');
                  setHandBack([]);
                  setHandFilters({ ...handDraft, asOf: toInstant(handDraft.asOf) });
                }}
              >
                Search Hands
              </button>
            </div>
          </div>
          {!handFilters && (
            <div className={styles.infoNote} role="status">
              <strong>No Hand Search Has Run. </strong>Enter A Player ID To Begin.
            </div>
          )}
          {handFilters && handCoverage.incomplete && handRows.length > 0 && (
            <div className={styles.infoNote} role="status">
              <strong>This Search Did Not Reach The End Of History. </strong>
              Older Hands Remain Unscanned. Use Next To Continue The Search.
            </div>
          )}
          {handFilters && renderListState(hands, handRows, handCoverage.incomplete
            ? {
                title: 'This Search Did Not Reach The End Of History',
                detail: `The Hand-History Source Is Read In Windows. This Window Returned No Matching Records${handCoverage.scannedCount == null ? '' : `, After ${handCoverage.scannedCount} Hands Scanned`}, And Older Hands Remain Unscanned. Use Next To Continue The Search Before Treating This As No Evidence.`,
              }
            : { title: 'No Hands Match That Search', detail: 'The Hand-History Source Was Read To The End Of History And Returned No Matching Records.' })}
          {handRows.map((row, index) => <SimpleRecordCard key={String(first(row, 'id', 'hand_id', 'handId') || index)} row={row} kind="hands" />)}
          {(handRows.length > 0 || handCoverage.hasMore) && (
            <CursorPager resource={hands} cursor={handCursor} history={handBack} setCursor={setHandCursor} setHistory={setHandBack} noun="Hands" />
          )}
        </section>
      )}

      {section === 'health' && (
        <section id="integrity-panel-health" role="tabpanel" aria-labelledby="integrity-tab-health">
          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Detector Coverage Details</h3>
            <dl className={styles.factGrid}>
              <Fact label="Status">{first(liveHealth, 'status') || 'Unknown'}</Fact>
              <Fact label="Catching Up">{first(liveHealth, 'catching_up', 'catchingUp') === true ? 'Yes' : first(liveHealth, 'catching_up', 'catchingUp') === false ? 'No' : 'Unknown'}</Fact>
              <Fact label="Seconds Behind">{num(first(liveHealth, 'seconds_behind', 'secondsBehind'), 'Unknown')}</Fact>
              <Fact label="Last Successful Run">{when(first(liveHealth, 'last_success_at', 'lastSuccessAt'), true)}</Fact>
              <Fact label="Hands In Last Run">{num(first(liveHealth, 'last_scanned_hands', 'lastScannedHands'), 'Unknown')}</Fact>
              <Fact label="Newest Finding">{when(first(liveHealth, 'newest_finding_at', 'newestFindingAt'), true)}</Fact>
              <Fact label="Detection Span In Minutes">{num(first(liveHealth, 'detection_span_minutes', 'detectionSpanMinutes'), 'Unknown')}</Fact>
              <Fact label="Aggregates Across Runs">{booleanLabel(first(first(liveHealth, 'detection_thresholds', 'detectionThresholds'), 'aggregates_across_runs', 'aggregatesAcrossRuns'))}</Fact>
              <Fact label="Unscanned From">{when(first(liveHealth, 'unscanned_from', 'unscannedFrom'), true)}</Fact>
              <Fact label="Unscanned To">{when(first(liveHealth, 'unscanned_to', 'unscannedTo'), true)}</Fact>
            </dl>
            {first(liveHealth, 'unscanned_note', 'unscannedNote') && (
              <div className={styles.errorNote} role="alert">
                <strong>Recorded Coverage Gap. </strong>{String(first(liveHealth, 'unscanned_note', 'unscannedNote'))}
              </div>
            )}
          </div>

          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Detection Threshold Disclosure</h3>
            <p className={styles.cardNote}>
              Pair Thresholds Apply Inside The Reported Detection Span Unless The Detector Explicitly Says It Aggregates Across Runs.
            </p>
            {first(liveHealth, 'detection_thresholds', 'detectionThresholds') ? (
              <pre className={styles.trailBlock}>{JSON.stringify(first(liveHealth, 'detection_thresholds', 'detectionThresholds'), null, 2)}</pre>
            ) : (
              <div className={styles.warnNote}>The Detector Did Not Return Its Threshold Disclosure.</div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
