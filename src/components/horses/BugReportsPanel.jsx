import React, { useCallback, useEffect, useState } from 'react';
import { T, when } from '../../lib/horsesAdminTokens';
import { hasPermission } from './operatorPermissions';
import DataTable from './DataTable';
import Pager from './Pager';
import StatusPill from './StatusPill';
import usePagedList from './usePagedList';
import styles from '../../../pages/horses/horses.module.css';

const PAGE = 50;
export default function BugReportsPanel({ authFetch, showNotification, permissions }) {
  const [search, setSearch] = useState('');
  const canWrite = hasPermission(permissions, 'support.write');
  const fetchPage = useCallback(async ({ limit, offset, filters, signal }) => {
    const query = new URLSearchParams({ section: 'tickets', limit: String(limit), offset: String(offset) });
    if (filters.status && filters.status !== 'all') query.set('status', filters.status);
    if (filters.q) query.set('q', filters.q);
    const body = await authFetch(`/api/horses/club-arena-admin?${query}`, { signal });
    return { rows: body.rows || [], total: typeof body.total === 'number' ? body.total : null, hasMore: typeof body.hasMore === 'boolean' ? body.hasMore : undefined };
  }, [authFetch]);
  const tickets = usePagedList({ fetchPage, limit: PAGE, initialFilters: { status: 'open', q: '' }, auto: true });
  const setTicketFilter = tickets.setFilter;
  useEffect(() => { const id = window.setTimeout(() => setTicketFilter('q', search.trim()), 300); return () => window.clearTimeout(id); }, [search, setTicketFilter]);
  const update = async (id, status) => {
    if (!canWrite) return;
    try {
      await authFetch('/api/horses/stable-admin', { method: 'POST', body: JSON.stringify({ action: 'set_ticket_status', id, status }) });
      showNotification?.(`Ticket Marked ${status === 'resolved' ? 'Resolved' : 'Open'}`); tickets.refresh();
    } catch (cause) { showNotification?.(`Could Not Update Ticket: ${cause.message}`, 'error'); }
  };
  return <div className={styles.statsView}><h2>Bug Reports And Support Tickets</h2><div className={styles.filterBar}>{[['open', 'Open'], ['in_progress', 'In Progress'], ['resolved', 'Resolved'], ['closed', 'Closed'], ['all', 'All']].map(([value, label]) => <button key={value} type="button" className={`${styles.filterBtn} ${tickets.filters.status === value ? styles.active : ''}`} onClick={() => tickets.setFilter('status', value)}>{label}</button>)}<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search Subject Or Description" className={styles.searchInput} aria-label="Search Tickets" /><button className={styles.filterBtn} onClick={tickets.refresh} disabled={tickets.loading}>Refresh</button></div>{!canWrite ? <div className={styles.warnBanner}>Support Write Permission Is Required To Change Ticket Status.</div> : null}{tickets.error ? <div className={styles.errorState} role="alert">Tickets Unavailable: {tickets.error}<button className={styles.actionBtn} onClick={tickets.refresh}>Retry</button></div> : <><DataTable caption="Support Tickets, Newest First" loading={tickets.loading} loadingLabel="Loading Tickets" empty={tickets.filters.q ? 'No Tickets Match That Search.' : 'No Tickets In This View.'} rows={tickets.rows} columns={[
    { key: 'user', header: 'User', render: (ticket) => { const who = ticket.reporter || ticket.profiles; return <div><strong>{who?.display_name || who?.username || 'Anonymous'}</strong><div style={{ color: T.muted }}>@{who?.username || 'unknown'}</div></div>; } },
    { key: 'subject', header: 'Subject', render: (ticket) => <div><strong>{ticket.subject}</strong><div style={{ color: T.dim }}>{ticket.description}</div></div> },
    { key: 'priority', header: 'Priority', render: (ticket) => <StatusPill status={ticket.priority || 'medium'} /> },
    { key: 'status', header: 'Status', render: (ticket) => <StatusPill status={ticket.status} /> },
    { key: 'date', header: 'Date', render: (ticket) => when(ticket.created_at) },
    { key: 'actions', header: 'Actions', render: (ticket) => <div><label className={styles.srOnly} htmlFor={`ticket-status-${ticket.id}`}>Set Status For {ticket.subject || ticket.id}</label><select id={`ticket-status-${ticket.id}`} className={styles.filterSelect} disabled={!canWrite} value={['open', 'resolved'].includes(ticket.status) ? ticket.status : ''} onChange={(event) => { if (event.target.value) update(ticket.id, event.target.value); }}>{!['open', 'resolved'].includes(ticket.status) ? <option value="">{ticket.status || 'unknown'} (Set To)</option> : null}<option value="open">Open</option><option value="resolved">Resolved</option></select>{ticket.conversation_id ? <a href={`/hub/messenger?conversation=${ticket.conversation_id}`} target="_blank" rel="noreferrer">Chat</a> : null}</div> },
  ]} /><Pager offset={tickets.offset} limit={tickets.limit} count={tickets.rows.length} total={tickets.total} hasMore={tickets.hasMore} loading={tickets.loading} noun="Tickets" onPrevious={tickets.previous} onNext={tickets.next} /></>}</div>;
}
