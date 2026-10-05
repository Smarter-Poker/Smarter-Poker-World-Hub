import React, { useCallback, useEffect, useRef, useState } from 'react';
import ConfirmDialog from './ConfirmDialog';
import styles from './shared.module.css';
import { clubArenaLink, clubsUrl, clubUrl, fundClub, pageOf, setClubStatus, unionsUrl, unionUrl } from './floorAdmin';

const LIMIT = 100;

const SMALL = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
function underThousand(value) {
  const parts = [];
  if (value >= 100) { parts.push(`${SMALL[Math.floor(value / 100)]} Hundred`); value %= 100; }
  if (value >= 20) { parts.push(TENS[Math.floor(value / 10)]); value %= 10; }
  if (value > 0) parts.push(SMALL[value]);
  return parts.join(' ');
}
export function chipAmountWords(raw) {
  if (!/^\d{1,15}(?:\.\d{1,2})?$/.test(String(raw || '').trim())) return 'Invalid Amount';
  const [wholeText, fractionText = ''] = String(raw).trim().split('.');
  let whole = BigInt(wholeText);
  const scales = [[1000000000000n, 'Trillion'], [1000000000n, 'Billion'], [1000000n, 'Million'], [1000n, 'Thousand']];
  const parts = [];
  for (const [size, label] of scales) {
    if (whole >= size) { const group = Number(whole / size); parts.push(`${underThousand(group)} ${label}`); whole %= size; }
  }
  if (whole > 0n || parts.length === 0) parts.push(underThousand(Number(whole)) || 'Zero');
  const cents = Number(fractionText.padEnd(2, '0'));
  return `${parts.join(' ')}${cents ? ` And ${underThousand(cents)} Hundredths` : ''} Chips`;
}

export default function ClubsUnionsPanel({ authFetch }) {
  const [clubs, setClubs] = useState(null); const [unions, setUnions] = useState(null);
  const [detail, setDetail] = useState(null); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [clubOffset, setClubOffset] = useState(0); const [unionOffset, setUnionOffset] = useState(0);
  const [action, setAction] = useState({ reason: '', amount: '', running: false, message: '', error: '' });
  const [confirmAction, setConfirmAction] = useState(null);
  const sequence = useRef(0); const detailSequence = useRef(0);
  useEffect(() => () => { sequence.current += 1; detailSequence.current += 1; }, []);
  const load = useCallback(async () => {
    const current = ++sequence.current; setLoading(true); setError('');
    const result = await Promise.allSettled([authFetch(clubsUrl({ clubsLimit: LIMIT, clubsOffset: clubOffset })), authFetch(unionsUrl({ unionsLimit: LIMIT, unionsOffset: unionOffset }))]);
    if (current !== sequence.current) return;
    setClubs(result[0].status === 'fulfilled' ? result[0].value : null);
    setUnions(result[1].status === 'fulfilled' ? result[1].value : null);
    if (result.some((entry) => entry.status === 'rejected')) setError(result.every((entry) => entry.status === 'rejected') ? 'Club And Union Oversight Could Not Be Read.' : 'One Oversight Source Could Not Be Read. The Available Source Is Shown.');
    setLoading(false);
  }, [authFetch, clubOffset, unionOffset]);
  useEffect(() => { load(); }, [load]);
  const openDetail = async (kind, row) => {
    const id = row.id; if (!id) return;
    const current = ++detailSequence.current; setDetail({ loading: true, kind }); setAction({ reason: '', amount: '', running: false, message: '', error: '' });
    try {
      const value = await authFetch(kind === 'club' ? clubUrl(id, { membersLimit: 100, membersOffset: 0 }) : unionUrl(id, { unionRowsLimit: 100, unionRowsOffset: 0 }));
      if (current === detailSequence.current) setDetail({ loading: false, kind, value });
    } catch (readError) {
      console.warn(`${kind} detail read failed`, readError);
      if (current === detailSequence.current) setDetail({ loading: false, kind, error: true });
    }
  };
  const clubPage = pageOf(clubs, 'clubs'); const unionPage = pageOf(unions, 'unions');
  const clubRows = clubPage.rows; const unionRows = unionPage.rows;
  const closeDetail = () => { detailSequence.current += 1; setDetail(null); };
  const requestClubAction = (kind) => {
    const club = detail?.value?.club;
    if (!club?.id || action.running) return;
    const amount = action.amount.trim(); const reason = action.reason.trim();
    if (reason.length < 10 || (kind === 'fund' && chipAmountWords(amount) === 'Invalid Amount')) return;
    setConfirmAction({ kind, clubName: club.name || club.id, amount, reason });
  };
  const actOnClub = async () => {
    const kind = confirmAction?.kind;
    const club = detail?.value?.club;
    if (!kind || !club?.id || action.running) return;
    const amount = confirmAction.amount; const reason = confirmAction.reason;
    setAction((value) => ({ ...value, running: true, message: '', error: '' }));
    try {
      const result = kind === 'fund'
        ? await fundClub(authFetch, { clubId: club.id, amount, reason, opId: globalThis.crypto?.randomUUID?.() })
        : await setClubStatus(authFetch, { clubId: club.id, status: club.status === 'suspended' ? 'active' : 'suspended', reason });
      const pending = result?.pending === true || result?.data?.pending === true;
      setConfirmAction(null);
      setAction({ reason: '', amount: '', running: false, error: '', message: pending ? 'Sent For Approval. Nothing Has Moved.' : kind === 'fund' ? 'Club Funding Completed. Check The Treasury And Ledger.' : 'Club Status Updated. Existing Tables Were Not Changed.' });
      const refreshed = await authFetch(clubUrl(club.id, { membersLimit: 100, membersOffset: 0 }));
      setDetail({ loading: false, kind: 'club', value: refreshed });
      load();
    } catch (writeError) {
      setAction((value) => ({ ...value, running: false, error: writeError?.message || 'The Action Could Not Be Confirmed. Check The Audit Trail Before Retrying.' }));
    }
  };
  const Pager = ({ page, offset, setOffset, label }) => page.total !== null && page.total > LIMIT ? <div className={styles.opsActions} aria-label={`${label} Pages`}><button type="button" className={styles.btn} disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - LIMIT))}>Previous {label}</button><span className={styles.fieldHint}>{offset + 1} To {Math.min(offset + page.rows.length, page.total)} Of {page.total}</span><button type="button" className={styles.btn} disabled={!page.hasMore || loading} onClick={() => setOffset(offset + LIMIT)}>Next {label}</button></div> : null;
  return <section className={styles.panel} aria-labelledby="clubs-unions-title">{confirmAction ? <ConfirmDialog title={confirmAction.kind === 'fund' ? 'Confirm Club Funding' : 'Confirm Club Status'} busy={action.running} sticky={action.running} blockEscape={action.running} confirmLabel={confirmAction.kind === 'fund' ? 'Confirm Club Funding' : 'Confirm Status Change'} onConfirm={actOnClub} onCancel={() => setConfirmAction(null)} tone={confirmAction.kind === 'fund' ? 'go' : 'danger'} requireTyped={confirmAction.kind === 'fund' ? 'FUND' : null}><p><strong>{confirmAction.clubName}</strong></p><p>{confirmAction.kind === 'fund' ? `${chipAmountWords(confirmAction.amount)} Will Move Into This Club Treasury. There Is No Automatic Rollback.` : `${detail?.value?.club?.status === 'suspended' ? 'The Club Will Be Reactivated' : 'The Club Will Be Suspended'}. Existing Tables Will Not Be Closed.`}</p><p>Recorded Reason: {confirmAction.reason}</p></ConfirmDialog> : null}<div className={styles.panelHead}><div><h2 id="clubs-unions-title" className={styles.panelTitle}>Clubs And Unions</h2><p className={styles.panelIntro}>Platform-Wide Read Pairs With Existing Club Arena Configuration, Funding, Membership And Settlement Authority.</p></div><button type="button" className={styles.btn} onClick={load} disabled={loading}>Refresh</button></div>
    <div className={styles.opsDisclosure} role={error ? 'alert' : 'status'}><strong>{error ? 'Oversight Coverage Is Partial Or Unknown' : 'Existing Authority Is Preserved'}</strong><span>Stable Admin Reads The Platform View. Configuration, Funding, Membership And Settlement Actions Open Their Authoritative Club Arena Surfaces.</span></div>{error ? <div className={styles.errorNote} role="alert">{error}</div> : null}
    {detail ? <section className={styles.opsDetail} aria-label={`${detail.kind} detail`}><div className={styles.opsDetailHead}><h3 className={styles.opsCardTitle}>{detail.kind === 'club' ? detail.value?.club?.name || 'Club Detail' : detail.value?.union?.name || 'Union Detail'}</h3><button type="button" className={styles.btn} onClick={closeDetail}>Close Detail</button></div>{detail.loading ? <div className={styles.stateNote}>Reading Detail...</div> : detail.error ? <div className={styles.errorNote} role="alert">This Detail Could Not Be Read.</div> : detail.kind === 'club' ? <><div className={styles.opsDetailGrid}><div><span className={styles.opsFactLabel}>Members</span><span className={styles.opsFactValue}>{pageOf(detail.value, 'members').total ?? 'Unknown'}</span></div><div><span className={styles.opsFactLabel}>Treasury</span><span className={styles.opsFactValue}>{detail.value?.club?.chip_treasury ?? 'Unknown'}</span></div><div><span className={styles.opsFactLabel}>All Member Chips</span><span className={styles.opsFactValue}>{detail.value?.memberChips?.state === 'ready' ? detail.value.memberChips.amount : 'Unavailable'}</span></div><div><span className={styles.opsFactLabel}>Figures As Of</span><span className={styles.opsFactValue}>{detail.value?.memberChips?.asOf || detail.value?.asOf || 'Unknown'}</span></div><div><span className={styles.opsFactLabel}>Latest Settlement</span><span className={styles.opsFactValue}>{detail.value?.settlement?.status || 'None Recorded'}</span></div><div><span className={styles.opsFactLabel}>Stop-Loss Versus Deposit</span><span className={styles.opsFactValue}>{detail.value?.stopLossVsDeposit?.state === 'ready' ? detail.value.stopLossVsDeposit.value : 'No Authoritative Source'}</span></div><div><span className={styles.opsFactLabel}>Club Health</span><span className={styles.opsFactValue}>{detail.value?.clubHealth?.state === 'ready' ? detail.value.clubHealth.value : 'Owner-Scoped, Unavailable Here'}</span></div></div>{detail.value?.state === 'club.partial' ? <div className={styles.errorNote} role="alert">Club Detail Is Partial. Missing Sources Remain Unavailable, Never Zero.</div> : null}<div className={styles.opsToolbar}><label className={styles.field}><span className={styles.fieldLabel}>Reason</span><textarea className={styles.textarea} value={action.reason} minLength={10} maxLength={500} onChange={(event) => setAction((value) => ({ ...value, reason: event.target.value }))} placeholder="Required, At Least 10 Characters" /></label><label className={styles.field}><span className={styles.fieldLabel}>Funding Amount</span><input className={styles.input} inputMode="decimal" value={action.amount} onChange={(event) => setAction((value) => ({ ...value, amount: event.target.value }))} placeholder="0.00" /></label></div><div className={styles.opsActions}>{['active', 'suspended'].includes(detail.value?.club?.status) ? <button type="button" className={styles.btn} disabled={action.running || action.reason.trim().length < 10} onClick={() => requestClubAction('status')}>{detail.value?.club?.status === 'suspended' ? 'Reactivate Club' : 'Suspend Club'}</button> : <span className={styles.fieldHint}>Terminal Or Deleted Clubs Cannot Be Reactivated Here.</span>}<button type="button" className={`${styles.btn} ${styles.btnGo}`} disabled={action.running || action.reason.trim().length < 10 || chipAmountWords(action.amount.trim()) === 'Invalid Amount' || !['active', 'suspended'].includes(detail.value?.club?.status)} onClick={() => requestClubAction('fund')}>Review And Fund Club</button></div>{action.message ? <div className={styles.stateNote} role="status">{action.message}</div> : null}{action.error ? <div className={styles.errorNote} role="alert">{action.error}</div> : null}</> : <><div className={styles.opsDetailGrid}><div><span className={styles.opsFactLabel}>Member Clubs</span><span className={styles.opsFactValue}>{pageOf(detail.value, 'memberClubs').total ?? 'Unknown'}</span></div><div><span className={styles.opsFactLabel}>Rake Share, 30 Days</span><span className={styles.opsFactValue}>{detail.value?.rakeShareState === 'ready' ? `${Array.isArray(detail.value.rakeShare) ? detail.value.rakeShare.length : 0} Club Rows` : detail.value?.rakeShareState === 'permission_required' ? 'Money Read Permission Required' : 'Unavailable'}</span></div><div><span className={styles.opsFactLabel}>Settlement Rounds</span><span className={styles.opsFactValue}>{pageOf(detail.value, 'settlementRounds').total ?? 'Unknown'}</span></div><div><span className={styles.opsFactLabel}>Applications</span><span className={styles.opsFactValue}>{pageOf(detail.value, 'applications').total ?? 'Unknown'}</span></div><div><span className={styles.opsFactLabel}>Leave Requests</span><span className={styles.opsFactValue}>{pageOf(detail.value, 'leaveRequests').total ?? 'Unknown'}</span></div></div>{Array.isArray(detail.value?.rakeShare) && detail.value.rakeShare.length ? <div className={styles.opsCardsAlways}>{detail.value.rakeShare.map((row, index) => <article className={styles.opsCard} key={row.club_id || index}><div className={styles.opsCardHead}><h4 className={styles.opsCardTitle}>{row.club_name || row.club_id || `Club ${index + 1}`}</h4><span>Rake Share</span></div><div className={styles.opsFacts}><div><span className={styles.opsFactLabel}>Rake</span><span className={styles.opsFactValue}>{row.rake ?? 'Unknown'}</span></div><div><span className={styles.opsFactLabel}>Players</span><span className={styles.opsFactValue}>{row.players ?? 'Unknown'}</span></div><div><span className={styles.opsFactLabel}>Player Hands</span><span className={styles.opsFactValue}>{row.player_hands ?? 'Unknown'}</span></div></div></article>)}</div> : null}</>}</section> : null}
    <div className={styles.opsSplit}><section><h3 className={styles.cardTitle}>Clubs</h3>{!loading && clubs && clubRows.length === 0 ? <div className={styles.stateNote}>No Club Was Reported.</div> : null}<div className={styles.opsCardsAlways}>{clubRows.map((row) => <article className={styles.opsCard} key={row.id}><div className={styles.opsCardHead}><h4 className={styles.opsCardTitle}>{row.name || row.code || row.id}</h4><span>{row.status || 'Unknown'}</span></div><div className={styles.opsFacts}><div><span className={styles.opsFactLabel}>Members</span><span className={styles.opsFactValue}>{row.member_count ?? 'Unknown'}</span></div><div><span className={styles.opsFactLabel}>Tables</span><span className={styles.opsFactValue}>{row.table_count ?? 'Unknown'}</span></div><div><span className={styles.opsFactLabel}>Union</span><span className={styles.opsFactValue}>{row.union_id || 'Independent'}</span></div><div><span className={styles.opsFactLabel}>Treasury</span><span className={styles.opsFactValue}>{row.chip_treasury ?? 'Unknown'}</span></div></div><div className={styles.opsActions}><button type="button" className={styles.btn} onClick={() => openDetail('club', row)}>Read Club Detail</button><a className={styles.opsLink} href={clubArenaLink('club', { ...row, club_id: row.id })}>Open Club Authority</a></div></article>)}</div><Pager page={clubPage} offset={clubOffset} setOffset={setClubOffset} label="Clubs" /></section>
      <section><h3 className={styles.cardTitle}>Unions</h3>{!loading && unions && unionRows.length === 0 ? <div className={styles.stateNote}>No Union Was Reported.</div> : null}<div className={styles.opsCardsAlways}>{unionRows.map((row) => <article className={styles.opsCard} key={row.id}><div className={styles.opsCardHead}><h4 className={styles.opsCardTitle}>{row.name || row.union_code || row.id}</h4><span>{row.union_code || row.code || 'No Code'}</span></div><div className={styles.opsFacts}><div><span className={styles.opsFactLabel}>Clubs</span><span className={styles.opsFactValue}>{row.club_count ?? 'Unknown'}</span></div><div><span className={styles.opsFactLabel}>Members</span><span className={styles.opsFactValue}>{row.member_count ?? 'Unknown'}</span></div><div><span className={styles.opsFactLabel}>Chip Balance</span><span className={styles.opsFactValue}>{row.chip_balance ?? 'Unknown'}</span></div></div><div className={styles.opsActions}><button type="button" className={styles.btn} onClick={() => openDetail('union', row)}>Read Union Detail</button><a className={styles.opsLink} href={clubArenaLink('union', row)}>Open Union Authority</a></div></article>)}</div><Pager page={unionPage} offset={unionOffset} setOffset={setUnionOffset} label="Unions" /></section></div>
  </section>;
}
