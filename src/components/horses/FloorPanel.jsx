import EngineControlPanel from './EngineControlPanel';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import DataTable from './DataTable';
import Pager from './Pager';
import exportAllCsv from './exportAllCsv';
import styles from './shared.module.css';
import {
  FLOOR_COLUMNS, clubArenaLink, compositionOf, engineOf, exportState,
  floorDisclosure, floorUrl, pageOf, recordExportCompletion, tableUrl,
} from './floorAdmin';

const LIMIT = 100;

function scopeText(row = {}) {
  const club = row.club_name || row.club_id || 'Unknown Club';
  return row.union_name ? `${row.union_name} / ${club}` : club;
}

export default function FloorPanel({ authFetch, permissions = [] }) {
  const [body, setBody] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exportResult, setExportResult] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [offset, setOffset] = useState(0);
  const sequence = useRef(0);
  const detailSequence = useRef(0);
  useEffect(() => () => { sequence.current += 1; detailSequence.current += 1; }, []);

  const load = useCallback(async () => {
    const current = ++sequence.current;
    setLoading(true);
    setError('');
    try {
      const next = await authFetch(floorUrl({ tablesLimit: LIMIT, tablesOffset: offset }));
      if (current === sequence.current) setBody(next);
    } catch (readError) {
      console.warn('Live floor read failed', readError);
      if (current === sequence.current) setError('The Live Floor Could Not Be Read. Retry.');
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  }, [authFetch, offset]);

  useEffect(() => { load(); }, [load]);

  const tables = pageOf(body, 'tables');
  const disclosure = floorDisclosure(body);
  const engine = engineOf(body);
  const runExport = async () => {
    setExportResult({ running: true, fetched: 0, total: tables.total });
    try {
      const result = await exportAllCsv({
        filenamePrefix: 'stable-live-floor',
        authFetch, artifactSurface: 'stable-live-floor', artifactFilters: {},
        columns: FLOOR_COLUMNS,
        fetchPage: async (offset, limit) => {
          const page = await authFetch(floorUrl({ tablesLimit: limit, tablesOffset: offset }));
          const result = pageOf(page, 'tables');
          return { ...result, rows: result.rows.map((row) => ({ ...row, occupied_seats: compositionOf(row).occupied, capacity: row.max_players, horse_count: compositionOf(row).horses, human_count: compositionOf(row).humans, stakes: row.small_blind !== null && row.small_blind !== undefined && row.big_blind !== null && row.big_blind !== undefined ? `${row.small_blind} / ${row.big_blind}` : 'Unknown' })) };
        },
        onProgress: (progress) => setExportResult({ running: true, ...progress }),
        recordCompletion: (receipt) => recordExportCompletion(authFetch, { section: 'floor', filters: { status: 'live' }, ...receipt }),
      });
      setExportResult(result);
    } catch (exportError) {
      console.warn('Live floor export failed', exportError);
      setExportResult({ error: true });
    }
  };
  const exportView = exportState(exportResult);

  const openTable = async (row) => {
    const tableId = row.id || row.table_id;
    if (!tableId) return;
    const current = ++detailSequence.current;
    setDetailLoading(true); setDetailError(''); setDetail(null);
    try {
      const next = await authFetch(tableUrl(tableId, { seatsLimit: 200, seatsOffset: 0 }));
      if (current === detailSequence.current) setDetail(next);
    } catch (readError) {
      console.warn('Table drill-down read failed', readError);
      if (current === detailSequence.current) setDetailError('The Table Detail Could Not Be Read. Retry From The Table Row.');
    } finally {
      if (current === detailSequence.current) setDetailLoading(false);
    }
  };

  const closeDetail = () => { detailSequence.current += 1; setDetail(null); setDetailError(''); setDetailLoading(false); };

  const columns = [
    { key: 'name', header: 'Table', render: (row) => row.name || row.table_name || row.id },
    { key: 'club', header: 'Owner Scope', render: (row) => scopeText(row) },
    { key: 'stakes', header: 'Stakes', render: (row) => row.small_blind !== null && row.small_blind !== undefined && row.big_blind !== null && row.big_blind !== undefined ? `${row.small_blind} / ${row.big_blind}` : 'Unknown' },
    { key: 'seats', header: 'Seats', render: (row) => `${compositionOf(row).occupied} / ${row.max_players ?? 'Unknown'}` },
    { key: 'horses', header: 'Horses', render: (row) => compositionOf(row).horses ?? 'Unknown' },
    { key: 'humans', header: 'Humans', render: (row) => compositionOf(row).humans ?? 'Unknown' },
    { key: 'detail', header: 'Detail', render: (row) => <button type="button" className={styles.btn} onClick={() => openTable(row)}>View Seats</button> },
    { key: 'manage', header: 'Club Arena', render: (row) => <a className={styles.opsLink} href={clubArenaLink('table', row)}>Open Owner Game Management</a> },
  ];

  const detailSeats = pageOf(detail, 'seats');
  const detailComposition = detail?.composition || {};

  return (
    <section className={styles.panel} aria-labelledby="floor-title">
      <EngineControlPanel authFetch={authFetch} domain="floor" permissions={permissions} />
      <div className={styles.panelHead}>
        <div><h2 id="floor-title" className={styles.panelTitle}>Live Floor</h2><p className={styles.panelIntro}>A Read-Only View Of Every Live Table. Owner Pause, Resume And Empty-Table Close Stay In Club Arena. Platform Park And Occupied-Table Boundary Close Are Not Available.</p></div>
        <button type="button" className={styles.btn} onClick={load} disabled={loading}>Refresh</button>
      </div>
      <div className={styles.opsDisclosure} role={disclosure.tone === 'danger' ? 'alert' : 'status'}><strong>{disclosure.title}</strong><span>{disclosure.body}</span></div>
      {error ? <div className={styles.errorNote} role="alert">{error}</div> : null}
      {detailLoading ? <div className={styles.stateNote} role="status">Reading Table Seats...</div> : null}
      {detailError ? <div className={styles.errorNote} role="alert">{detailError}</div> : null}
      {detail ? <section className={styles.opsDetail} aria-labelledby="table-detail-title">
        <div className={styles.opsDetailHead}><div><h3 id="table-detail-title" className={styles.opsCardTitle}>{detail.table?.name || 'Table Detail'}</h3><span className={styles.fieldHint}>Seat-Level Read. Owner Controls Require The Scoped Club Arena Authority.</span></div><button type="button" className={styles.btn} onClick={closeDetail}>Close Detail</button></div>
        <div className={styles.opsDetailGrid}><div><span className={styles.opsFactLabel}>State</span><span className={styles.opsFactValue}>{detail.table?.status || 'Unknown'}</span></div><div><span className={styles.opsFactLabel}>Occupied</span><span className={styles.opsFactValue}>{detailComposition.occupied ?? 'Unknown'} / {detail.table?.max_players ?? 'Unknown'}</span></div><div><span className={styles.opsFactLabel}>Player Types</span><span className={styles.opsFactValue}>{detailComposition.horses ?? 'Unknown'} Horses, {detailComposition.humans ?? 'Unknown'} Humans, {detailComposition.unknown ?? 'Unknown'} Unknown</span></div></div>
        {detailSeats.rows.length ? <ul className={styles.opsSeatList} aria-label="Current Seats">{detailSeats.rows.map((seat) => <li className={styles.opsSeat} key={`${seat.table_id}-${seat.seat_number}-${seat.user_id}`}><strong>Seat {seat.seat_number ?? 'Unknown'}</strong><span>{seat.user_id || 'Player Unknown'}</span><span>{seat.playerType === 'horse' ? 'Horse' : seat.playerType === 'human' ? 'Human' : 'Type Unknown'}</span></li>)}</ul> : <div className={styles.stateNote}>No Occupied Seats Were Reported.</div>}
        {detailSeats.truncated ? <div className={styles.exportStatus} role="alert">The Seat List Is Incomplete. Use Club Arena For The Authoritative Table View.</div> : null}
        <a className={styles.opsLink} href={clubArenaLink('table', detail.table || {})}>Open Owner Game Management</a>
      </section> : null}
      <div className={styles.opsToolbar}><span className={styles.fieldHint}>Horses And Humans Are Counted And Labelled Separately.</span><button type="button" className={`${styles.btn} ${styles.btnGo}`} onClick={runExport} disabled={exportResult?.running === true}>Export Full Floor</button></div>
      {exportView.message ? <div className={styles.exportStatus} role={exportView.state === 'export.truncated' ? 'alert' : 'status'}>{exportView.message}</div> : null}
      <div className={styles.opsLayout}>
        <div>
          <div className={styles.opsCards}>
            {!loading && tables.rows.length === 0 ? <div className={styles.stateNote}>{body?.state === 'floor.empty_no_live_tables' ? 'No Live Tables Were Reported.' : 'No Table Rows Are Available.'}</div> : null}
            {tables.rows.map((row) => { const composition = compositionOf(row); return <article className={styles.opsCard} key={row.id || row.table_id}><div className={styles.opsCardHead}><h3 className={styles.opsCardTitle}>{row.name || row.table_name || 'Unnamed Table'}</h3><span>{row.status || 'Unknown'}</span></div><div className={styles.opsFacts}><div><span className={styles.opsFactLabel}>Owner Scope</span><span className={styles.opsFactValue}>{scopeText(row)}</span></div><div><span className={styles.opsFactLabel}>Stakes</span><span className={styles.opsFactValue}>{row.small_blind !== null && row.small_blind !== undefined && row.big_blind !== null && row.big_blind !== undefined ? `${row.small_blind} / ${row.big_blind}` : 'Unknown'}</span></div><div><span className={styles.opsFactLabel}>Seats</span><span className={styles.opsFactValue}>{composition.occupied ?? 'Unknown'} / {row.max_players ?? 'Unknown'}</span></div><div><span className={styles.opsFactLabel}>Horses</span><span className={styles.opsFactValue}>{composition.horses ?? 'Unknown'}</span></div><div><span className={styles.opsFactLabel}>Humans</span><span className={styles.opsFactValue}>{composition.humans ?? 'Unknown'}</span></div></div><div className={styles.opsActions}><button type="button" className={styles.btn} onClick={() => openTable(row)}>View Seats</button><a className={styles.opsLink} href={clubArenaLink('table', row)}>Open Owner Game Management</a></div></article>; })}
          </div>
          <div className={styles.opsDesktop}><DataTable rows={tables.rows} columns={columns} loading={loading} empty="No Live Tables Were Reported." caption="Database Live Tables, With Horses And Humans Included" /></div>
          <Pager offset={tables.offset} limit={tables.limit || LIMIT} count={tables.rows.length} total={tables.total} hasMore={tables.hasMore} loading={loading} noun="Tables" onPrevious={() => setOffset(Math.max(0, offset - LIMIT))} onNext={() => setOffset(offset + LIMIT)} />
        </div>
        <aside className={`${styles.opsSide} ${styles.opsCard}`} aria-label="Engine Floor View"><h3 className={styles.opsCardTitle}>Engine Floor View</h3><div className={styles.opsFacts}><div><span className={styles.opsFactLabel}>Active Tables</span><span className={styles.opsFactValue}>{engine?.activeTables ?? 'Unknown'}</span></div><div><span className={styles.opsFactLabel}>Dealable</span><span className={styles.opsFactValue}>{engine?.dealableTableCount ?? 'Unknown'}</span></div><div><span className={styles.opsFactLabel}>Stalled</span><span className={styles.opsFactValue}>{engine?.stalledTableCount ?? 'Unknown'}</span></div><div><span className={styles.opsFactLabel}>Hands Per Hour</span><span className={styles.opsFactValue}>{engine?.avgHandsPerHour ?? 'Unknown'}</span></div></div></aside>
      </div>
    </section>
  );
}
