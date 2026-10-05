import React, { useCallback, useEffect, useRef, useState } from 'react';
import Pager from './Pager';
import styles from './shared.module.css';
import { announcementsUrl, clubArenaLink, pageOf } from './floorAdmin';

const LIMIT = 100;

function AnnouncementCards({ rows, kind }) {
  return <div className={styles.opsCardsAlways}>{rows.map((row) => <article className={styles.opsCard} key={`${kind}-${row.id}`}><div className={styles.opsCardHead}><h4 className={styles.opsCardTitle}>{kind === 'club' ? row.title || 'Untitled Club Announcement' : 'Union Announcement'}</h4><span>{row.created_at ? new Date(row.created_at).toLocaleString() : 'Time Unknown'}</span></div>{kind === 'club' ? <div className={styles.opsActions}><span className={styles.fieldHint}>Priority: {row.priority || 'Normal'}</span><span className={styles.fieldHint}>Pin State: {row.is_pinned === true ? 'Pinned' : row.is_pinned === false ? 'Not Pinned' : 'Unknown'}</span></div> : null}<p className={styles.fieldHint}>{kind === 'club' ? row.content : row.message}</p><a className={styles.opsLink} href={clubArenaLink(kind === 'club' ? 'club-announcement' : 'union-announcement', row)}>Compose In {kind === 'club' ? 'Club' : 'Union'} Authority</a></article>)}</div>;
}

export default function AnnouncementsPanel({ authFetch }) {
  const [body, setBody] = useState(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const sequence = useRef(0);
  const [offset, setOffset] = useState(0);
  useEffect(() => () => { sequence.current += 1; }, []);
  const load = useCallback(async () => { const current = ++sequence.current; setLoading(true); setError(''); try { const next = await authFetch(announcementsUrl({ announcementsLimit: LIMIT, announcementsOffset: offset })); if (current === sequence.current) setBody(next); } catch (readError) { console.warn('Announcement oversight read failed', readError); if (current === sequence.current) { setBody(null); setError('Announcement Oversight Could Not Be Read.'); } } finally { if (current === sequence.current) setLoading(false); } }, [authFetch, offset]);
  useEffect(() => { load(); }, [load]);
  const clubPage = pageOf(body, 'clubAnnouncements'); const unionPage = pageOf(body, 'unionAnnouncements'); const clubRows = clubPage.rows; const unionRows = unionPage.rows; const delivery = body?.delivery;
  const deliveryUnknown = !delivery || delivery.state === 'delivery.unknown';
  return <section className={styles.panel} aria-labelledby="announcements-title"><div className={styles.panelHead}><div><h2 id="announcements-title" className={styles.panelTitle}>Announcements</h2><p className={styles.panelIntro}>Published Club And Union Messages With Push Delivery Health. Platform Broadcast Remains Deferred.</p></div><button type="button" className={styles.btn} onClick={load} disabled={loading}>Refresh</button></div>
    <div className={styles.opsDisclosure} role={error || deliveryUnknown || delivery?.state === 'delivery.backlogged' ? 'alert' : 'status'}><strong>{error ? 'Announcement Sources Are Unknown' : deliveryUnknown ? 'Delivery Health Is Unknown' : delivery.state === 'delivery.backlogged' ? 'Push Delivery Is Backlogged' : 'Push Delivery Is Current'}</strong><span>Pending Deliveries: {delivery?.pending ?? 'Unknown'}. Last Drain: {delivery?.lastDrainAt || 'Unknown'}. Club And Union Composing Stays In Existing Club Arena Authority.</span></div>{error ? <div className={styles.errorNote} role="alert">{error}</div> : null}
    <div className={styles.opsSplit}><section><h3 className={styles.cardTitle}>Club Announcements</h3>{!loading && body && clubRows.length === 0 ? <div className={styles.stateNote}>No Club Announcement Has Been Published.</div> : null}<AnnouncementCards rows={clubRows} kind="club" /></section><section><h3 className={styles.cardTitle}>Union Announcements</h3>{!loading && body && unionRows.length === 0 ? <div className={styles.stateNote}>No Union Announcement Has Been Published.</div> : null}<AnnouncementCards rows={unionRows} kind="union" /></section></div>
    <Pager offset={offset} limit={LIMIT} count={Math.max(clubRows.length, unionRows.length)} total={clubPage.total === null || unionPage.total === null ? null : Math.max(clubPage.total, unionPage.total)} hasMore={clubPage.hasMore || unionPage.hasMore} loading={loading} noun="Announcement Rows Per List" onPrevious={() => setOffset(Math.max(0, offset - LIMIT))} onNext={() => setOffset(offset + LIMIT)} />
  </section>;
}
