import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import BankrollHeaderAdd from './BankrollHeaderAdd';
import {
  fetchCalendarEvents,
  createCalendarEvent,
  deleteCalendarEvent,
} from '../../lib/bankroll/calendarSelectors';
import { acquireScrollLock } from '../../lib/scrollLock';
import { localDay } from '../../lib/bankroll/localDates.mjs';
import toast from '../../stores/toastStore';
import { supabase } from '../../lib/supabase';
import styles from './toke/VenueConsole.module.css';

function CalendarDialog({ id, title, onClose, busy = false, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    const trigger = document.activeElement;
    const unlock = acquireScrollLock('TokeCalendar');
    dialog.showModal();
    dialog.querySelector('[data-initial-focus]')?.focus({ preventScroll: true });
    return () => {
      if (dialog.open) dialog.close();
      unlock();
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(
    <dialog
      ref={ref}
      aria-labelledby={id}
      className={'smarterdesign sd-panel ' + styles.dialog}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(event) => {
        if (busy || event.target !== event.currentTarget) return;
        const box = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < box.left ||
          event.clientX > box.right ||
          event.clientY < box.top ||
          event.clientY > box.bottom
        )
          onClose();
      }}
    >
      <div className={styles.dialogHead}>
        <CalendarDays aria-hidden="true" size={23} />
        <h2 id={id}>{title}</h2>
        <button
          className={styles.close}
          type="button"
          aria-label="Close"
          disabled={busy}
          onClick={onClose}
        >
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      {children}
    </dialog>,
    document.body
  );
}

function dateKey(year, month, day) {
  return [year, String(month + 1).padStart(2, '0'), String(day).padStart(2, '0')].join('-');
}
function displayDate(date) {
  return new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getCalendarDays(year, month) {
  // month is 0-indexed
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);
  return days;
}

function TokeCalendar({ userId, headerAction = false }) {
  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [readError, setReadError] = useState(false);
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [expandedMonth, setExpandedMonth] = useState(() => new Date().getMonth()); // 0-indexed
  const [selectedDate, setSelectedDate] = useState(null); // 'YYYY-MM-DD'
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEventDetail, setShowEventDetail] = useState(null); // event object
  const [addForm, setAddForm] = useState({
    title: '',
    venue_name: '',
    notes: '',
    alert_enabled: true,
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [formError, setFormError] = useState('');
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadEvents = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    setReadError(false);
    try {
      const data = await fetchCalendarEvents(userId);
      if (isMountedRef.current) setEvents(data);
    } catch (err) {
      if (isMountedRef.current) setReadError(true);
      console.warn('Calendar load error:', err);
    } finally {
      if (isMountedRef.current) setIsLoading(false);
    }
  }, [userId]);

  const realtimeTimerRef = useRef(null);
  const debouncedLoadEvents = useCallback(() => {
    if (realtimeTimerRef.current) clearTimeout(realtimeTimerRef.current);
    realtimeTimerRef.current = setTimeout(() => {
      if (isMountedRef.current) loadEvents();
    }, 500);
  }, [loadEvents]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // ── Supabase Realtime — debounced auto-refresh ──
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`toke-calendar-${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'dealer_calendar_events',
          filter: `user_id=eq.${userId}`,
        },
        debouncedLoadEvents
      )
      .subscribe();
    return () => {
      clearTimeout(realtimeTimerRef.current);
      supabase.removeChannel(channel);
    };
  }, [userId, debouncedLoadEvents]);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && isMountedRef.current) {
        loadEvents();
      }
    });
    return () => subscription?.unsubscribe();
  }, [loadEvents]);

  // Build a fast lookup: 'YYYY-MM-DD' → [events]
  const eventMap = {};
  events.forEach((ev) => {
    eventMap[ev.event_date] = eventMap[ev.event_date] || [];
    eventMap[ev.event_date].push(ev);
  });

  const today = new Date();
  const todayStr = localDay(today);
  const upcoming = events.filter(
    (ev) => ev.event_date.startsWith(String(currentYear) + '-') && ev.event_date >= todayStr
  );
  function openNewEvent(date) {
    setFormError('');
    setSelectedDate(date);
    setAddForm({ title: '', venue_name: '', notes: '', alert_enabled: true });
    setShowAddModal(true);
  }

  const handleDateClick = (year, month, day) => {
    const dateStr = dateKey(year, month, day);

    // A day with events opens its first event; the dialog lists the others on
    // that day and offers another event, which a booked day could not get.
    if (eventMap[dateStr]?.length > 0) {
      setShowEventDetail(eventMap[dateStr][0]);
    } else {
      // Only allow future (or today)
      if (dateStr < todayStr) {
        toast.error('Cannot add events to past dates');
        return;
      }
      openNewEvent(dateStr);
    }
  };

  const handleAddEvent = async (e) => {
    e.preventDefault();
    if (!userId || saving) return;
    if (!addForm.title.trim()) {
      setFormError('Enter An Event Title.');
      e.currentTarget.elements.namedItem('title')?.focus();
      return;
    }
    if (!selectedDate || selectedDate < todayStr) {
      setFormError('Choose Today Or A Future Date.');
      return;
    }
    setFormError('');
    setSaving(true);
    try {
      await createCalendarEvent(userId, {
        title: addForm.title.trim(),
        venue_name: addForm.venue_name.trim() || undefined,
        event_date: selectedDate,
        notes: addForm.notes.trim() || undefined,
        alert_enabled: addForm.alert_enabled,
      });

      // Request notification permission if alert enabled safely (fire-and-forget)
      if (addForm.alert_enabled && 'Notification' in window) {
        try {
          if (Notification.permission === 'default') {
            const req = Notification.requestPermission();
            if (req && typeof req.then === 'function') {
              req.catch((e) => console.warn('[App] Handled promise rejection:', e?.message || e)); // prevent unhandled rejections
            }
          }
        } catch (e) {
          console.warn('[App] Handled exception:', e?.message || e);
        }
      }

      toast.success('Event added to calendar!');
      setShowAddModal(false);
      await loadEvents();
      window.dispatchEvent(new CustomEvent('toke-calendar-updated'));
    } catch (err) {
      setFormError(err.message || 'The Calendar Event Could Not Be Saved.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEvent = async (eventId) => {
    if (deleting || !confirm('Delete this calendar event?')) return;
    setDeleting(true);
    try {
      await deleteCalendarEvent(eventId);
      toast.success('Event deleted');
      setShowEventDetail(null);
      await loadEvents();
      window.dispatchEvent(new CustomEvent('toke-calendar-updated'));
    } catch (err) {
      toast.error(err.message || 'Failed to delete event');
    } finally {
      if (isMountedRef.current) setDeleting(false);
    }
  };

  const handleShare = async (ev) => {
    const text = `${ev.title}${ev.venue_name ? ` @ ${ev.venue_name}` : ''}\n${new Date(ev.event_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}${ev.notes ? `\n${ev.notes}` : ''}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: ev.title, text });
      } else {
        await navigator.clipboard.writeText(text);
        toast.success('Copied to clipboard!');
      }
    } catch (error) {
      if (error?.name !== 'AbortError') toast.error('Unable To Share This Calendar Event.');
    }
  };

  const monthEvents =
    expandedMonth === null
      ? []
      : events.filter((event) =>
          event.event_date.startsWith(dateKey(currentYear, expandedMonth, 1).slice(0, 7))
        );
  const chooseYear = (delta) => {
    setCurrentYear((year) => year + delta);
    setExpandedMonth(null);
  };
  return (
    <section className={'sd-panel ' + styles.panel} aria-label="Event Calendar">
      {userId && headerAction && (
        <BankrollHeaderAdd label="New Calendar Event" onClick={() => openNewEvent(todayStr)} />
      )}
      <div className={styles.calendarHeading}>
        <h2>
          <CalendarDays size={23} aria-hidden="true" />
          Event Calendar
        </h2>
        <div className={styles.yearControls} role="group" aria-label="Calendar Year">
          <button
            type="button"
            className="sd-button"
            aria-label="Previous Year"
            onClick={() => chooseYear(-1)}
          >
            <ChevronLeft size={17} />
          </button>
          <strong aria-live="polite">{currentYear}</strong>
          <button
            type="button"
            className="sd-button"
            aria-label="Next Year"
            onClick={() => chooseYear(1)}
          >
            <ChevronRight size={17} />
          </button>
          <button
            type="button"
            className="sd-button"
            onClick={() => {
              setCurrentYear(today.getFullYear());
              setExpandedMonth(today.getMonth());
            }}
          >
            Today
          </button>
        </div>
      </div>
      {!userId ? (
        <p className={styles.empty}>Sign In To View Your Shift Calendar.</p>
      ) : isLoading ? (
        <p role="status" className={styles.empty}>
          Loading Calendar…
        </p>
      ) : readError ? (
        <div role="alert" className={styles.empty}>
          The Shift Calendar Could Not Be Loaded.{' '}
          <button type="button" className="sd-button" onClick={loadEvents}>
            Retry
          </button>
        </div>
      ) : (
        <>
          <p className={styles.upcoming}>
            {upcoming.length} Upcoming {upcoming.length === 1 ? 'Event' : 'Events'} In {currentYear}
          </p>
          <div className={styles.monthRail} role="group" aria-label="Choose A Month">
            {MONTHS.map((month, index) => {
              const count = events.filter((event) =>
                event.event_date.startsWith(dateKey(currentYear, index, 1).slice(0, 7))
              ).length;
              const selected = expandedMonth === index;
              return (
                <button
                  type="button"
                  key={month}
                  aria-expanded={selected}
                  aria-controls="toke-calendar-month"
                  onClick={() => setExpandedMonth(selected ? null : index)}
                >
                  {month}
                  {count > 0 && <small aria-label={count + ' Events'}>{count}</small>}
                </button>
              );
            })}
          </div>
          <div id="toke-calendar-month" hidden={expandedMonth === null}>
            {expandedMonth !== null && (
              <div className={styles.monthView}>
                <h3>
                  {MONTHS[expandedMonth]} {currentYear}
                </h3>
                <div className={styles.dayGrid}>
                  {WEEKDAYS.map((day) => (
                    <span className={styles.weekday} key={day}>
                      {day}
                    </span>
                  ))}
                  {getCalendarDays(currentYear, expandedMonth).map((day, index) => {
                    if (day === null) return <i key={'blank-' + index} aria-hidden="true" />;
                    const key = dateKey(currentYear, expandedMonth, day),
                      list = eventMap[key] || [];
                    return (
                      <button
                        key={key}
                        type="button"
                        aria-label={
                          displayDate(key) +
                          (list.length ? ', ' + list.length + (list.length === 1 ? ' Event' : ' Events') : '')
                        }
                        aria-current={todayStr === key ? 'date' : undefined}
                        disabled={key < todayStr && !list.length}
                        data-event={list.length > 0 || undefined}
                        title={list.map((event) => event.title).join(', ') || undefined}
                        onClick={() => handleDateClick(currentYear, expandedMonth, day)}
                      >
                        {day}
                        {list.length > 0 && <i aria-hidden="true" />}
                      </button>
                    );
                  })}
                </div>
                {monthEvents.length > 0 ? (
                  <ul className={styles.agenda} aria-label="Scheduled Events">
                    {monthEvents.map((event) => (
                      <li key={event.id}>
                        <button
                          type="button"
                          onClick={() => setShowEventDetail(event)}
                          aria-label={event.title}
                        >
                          <time dateTime={event.event_date}>
                            {new Date(event.event_date + 'T12:00:00').toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </time>
                          <span>
                            <strong>{event.title}</strong>
                            {event.venue_name && <small>{event.venue_name}</small>}
                          </span>
                          <ChevronRight size={17} aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.empty}>No Events Scheduled This Month.</p>
                )}
              </div>
            )}
          </div>
        </>
      )}
      {showAddModal && (
        <CalendarDialog
          id="toke-calendar-create-title"
          title="New Calendar Event"
          busy={saving}
          onClose={() => setShowAddModal(false)}
        >
          <form onSubmit={handleAddEvent} className={styles.form}>
            <div className={styles.formBody}>
              <fieldset>
                <legend>Event Details</legend>
                <label htmlFor="toke-event-title">Event Title</label>
                <input
                  id="toke-event-title"
                  name="title"
                  type="text"
                  required
                  data-initial-focus
                  value={addForm.title}
                  placeholder="e.g. Summer Dealer Shift"
                  onChange={(event) => {
                    setAddForm({ ...addForm, title: event.target.value });
                    setFormError('');
                  }}
                />
                <label htmlFor="toke-event-date">Event Date</label>
                <input
                  id="toke-event-date"
                  type="date"
                  required
                  min={todayStr}
                  value={selectedDate || ''}
                  onChange={(event) => {
                    setSelectedDate(event.target.value);
                    setFormError('');
                  }}
                />
                <label htmlFor="toke-event-venue">
                  Venue <small>Optional</small>
                </label>
                <input
                  id="toke-event-venue"
                  value={addForm.venue_name}
                  placeholder="Room Or Casino"
                  onChange={(event) => setAddForm({ ...addForm, venue_name: event.target.value })}
                />
              </fieldset>
              <fieldset>
                <legend>Notes And Alerts</legend>
                <label htmlFor="toke-event-notes">
                  Notes <small>Optional</small>
                </label>
                <textarea
                  id="toke-event-notes"
                  rows="2"
                  value={addForm.notes}
                  placeholder="Dress Code, Contact Or Shift Details"
                  onChange={(event) => setAddForm({ ...addForm, notes: event.target.value })}
                />
                <div className={styles.alertRow}>
                  <span>
                    <Bell size={16} aria-hidden="true" />
                    Day-Of Alert
                  </span>
                  <button
                    className="sd-button"
                    type="button"
                    aria-label="Day-Of Alert"
                    aria-pressed={addForm.alert_enabled}
                    onClick={() => setAddForm((f) => ({ ...f, alert_enabled: !f.alert_enabled }))}
                  >
                    {addForm.alert_enabled ? 'On' : 'Off'}
                  </button>
                </div>
              </fieldset>
              {formError && (
                <p role="alert" className={styles.formError}>
                  {formError}
                </p>
              )}
            </div>
            <div className={styles.actions}>
              <button
                type="button"
                className="sd-button"
                disabled={saving}
                onClick={() => setShowAddModal(false)}
              >
                Cancel
              </button>
              <button type="submit" disabled={saving} className="sd-button sd-primary">
                {saving ? 'Saving…' : 'Add Event'}
              </button>
            </div>
          </form>
        </CalendarDialog>
      )}
      {showEventDetail && (
        <CalendarDialog
          id="toke-calendar-detail-title"
          title={showEventDetail.title}
          busy={deleting}
          onClose={() => setShowEventDetail(null)}
        >
          <div className={styles.formBody}>
            <dl className={styles.details}>
              <div>
                <dt>Event Date</dt>
                <dd>{displayDate(showEventDetail.event_date)}</dd>
              </div>
              {showEventDetail.venue_name && (
                <div>
                  <dt>Venue</dt>
                  <dd>{showEventDetail.venue_name}</dd>
                </div>
              )}
              {showEventDetail.notes && (
                <div>
                  <dt>Notes</dt>
                  <dd>{showEventDetail.notes}</dd>
                </div>
              )}
              <div>
                <dt>Day-Of Alert</dt>
                <dd>{showEventDetail.alert_enabled ? 'On' : 'Off'}</dd>
              </div>
            </dl>
          </div>
          {(eventMap[showEventDetail.event_date] || []).length > 1 && (
            <ul className={styles.agenda} aria-label="Also On This Day">
              {eventMap[showEventDetail.event_date]
                .filter((event) => event.id !== showEventDetail.id)
                .map((event) => (
                  <li key={event.id}>
                    <button type="button" onClick={() => setShowEventDetail(event)} aria-label={event.title}>
                      <span>
                        <strong>{event.title}</strong>
                        {event.venue_name && <small>{event.venue_name}</small>}
                      </span>
                      <ChevronRight size={17} aria-hidden="true" />
                    </button>
                  </li>
                ))}
            </ul>
          )}
          <div className={styles.actions}>
            <button
              type="button"
              className="sd-button"
              disabled={deleting}
              onClick={() => handleDeleteEvent(showEventDetail.id)}
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
            {showEventDetail.event_date >= todayStr && (
              <button
                type="button"
                className="sd-button"
                disabled={deleting}
                onClick={() => {
                  const date = showEventDetail.event_date;
                  setShowEventDetail(null);
                  openNewEvent(date);
                }}
              >
                Add Event
              </button>
            )}
            <button
              type="button"
              className="sd-button sd-primary"
              onClick={() => handleShare(showEventDetail)}
            >
              Share
            </button>
          </div>
        </CalendarDialog>
      )}
    </section>
  );
}
export default memo(TokeCalendar);
