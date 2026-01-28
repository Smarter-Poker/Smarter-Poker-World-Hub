/**
 * GameCalendar Component - Calendar view for home games
 * Reference: SCOPE_LOCK.md - Phase 4 Components
 * UI: Facebook color scheme, no emojis, Inter font
 */
import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, MapPin, Users, Clock, Calendar } from 'lucide-react';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay();
}

function isSameDay(d1, d2) {
  if (!d1 || !d2) return false;
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

function formatTime(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}

export default function GameCalendar({
  events = [],
  onEventClick,
  onDateClick,
  selectedDate = null,
  showListView = false
}) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState(showListView ? 'list' : 'calendar');

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Navigate months
  const goToPrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  // Group events by date
  const eventsByDate = useMemo(() => {
    const grouped = {};
    events.forEach((event) => {
      const eventDate = new Date(event.start_time || event.scheduled_at);
      const key = `${eventDate.getFullYear()}-${eventDate.getMonth()}-${eventDate.getDate()}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(event);
    });
    return grouped;
  }, [events]);

  // Get events for a specific date
  const getEventsForDate = (date) => {
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    return eventsByDate[key] || [];
  };

  // Build calendar grid
  const calendarDays = useMemo(() => {
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const days = [];

    // Previous month padding
    const prevMonthDays = getDaysInMonth(year, month - 1);
    for (let i = firstDay - 1; i >= 0; i--) {
      days.push({
        date: new Date(year, month - 1, prevMonthDays - i),
        isCurrentMonth: false
      });
    }

    // Current month
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({
        date: new Date(year, month, i),
        isCurrentMonth: true
      });
    }

    // Next month padding
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      days.push({
        date: new Date(year, month + 1, i),
        isCurrentMonth: false
      });
    }

    return days;
  }, [year, month]);

  // Get upcoming events for list view
  const upcomingEvents = useMemo(() => {
    const now = new Date();
    return events
      .filter((e) => new Date(e.start_time || e.scheduled_at) >= now)
      .sort((a, b) =>
        new Date(a.start_time || a.scheduled_at) - new Date(b.start_time || b.scheduled_at)
      );
  }, [events]);

  const today = new Date();

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={goToPrevMonth}
              className="p-1 hover:bg-gray-200 rounded"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-5 w-5 text-gray-600" />
            </button>
            <h2 className="text-lg font-semibold text-gray-900 min-w-[160px] text-center">
              {MONTHS[month]} {year}
            </h2>
            <button
              onClick={goToNextMonth}
              className="p-1 hover:bg-gray-200 rounded"
              aria-label="Next month"
            >
              <ChevronRight className="h-5 w-5 text-gray-600" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={goToToday}
              className="px-3 py-1 text-sm text-[#1877F2] hover:bg-blue-50 rounded"
            >
              Today
            </button>
            <div className="flex border border-gray-300 rounded overflow-hidden">
              <button
                onClick={() => setViewMode('calendar')}
                className={`px-3 py-1 text-sm ${
                  viewMode === 'calendar'
                    ? 'bg-[#1877F2] text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Calendar className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-3 py-1 text-sm ${
                  viewMode === 'list'
                    ? 'bg-[#1877F2] text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                List
              </button>
            </div>
          </div>
        </div>
      </div>

      {viewMode === 'calendar' ? (
        <>
          {/* Day Headers */}
          <div className="grid grid-cols-7 border-b border-gray-200">
            {DAYS.map((day) => (
              <div
                key={day}
                className="py-2 text-center text-sm font-medium text-gray-500 bg-gray-50"
              >
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7">
            {calendarDays.map(({ date, isCurrentMonth }, idx) => {
              const dayEvents = getEventsForDate(date);
              const isToday = isSameDay(date, today);
              const isSelected = selectedDate && isSameDay(date, selectedDate);

              return (
                <div
                  key={idx}
                  onClick={() => onDateClick?.(date)}
                  className={`min-h-[100px] border-b border-r border-gray-100 p-1 cursor-pointer transition hover:bg-gray-50 ${
                    !isCurrentMonth ? 'bg-gray-50' : ''
                  } ${isSelected ? 'ring-2 ring-inset ring-[#1877F2]' : ''}`}
                >
                  <div
                    className={`text-sm font-medium mb-1 h-6 w-6 flex items-center justify-center rounded-full ${
                      isToday
                        ? 'bg-[#1877F2] text-white'
                        : isCurrentMonth
                        ? 'text-gray-900'
                        : 'text-gray-400'
                    }`}
                  >
                    {date.getDate()}
                  </div>

                  {/* Events */}
                  <div className="space-y-1">
                    {dayEvents.slice(0, 3).map((event) => (
                      <button
                        key={event.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onEventClick?.(event);
                        }}
                        className="w-full text-left text-xs px-1 py-0.5 rounded bg-[#1877F2] text-white truncate hover:bg-[#1664d9]"
                      >
                        {formatTime(event.start_time || event.scheduled_at)} {event.name || event.title}
                      </button>
                    ))}
                    {dayEvents.length > 3 && (
                      <div className="text-xs text-gray-500 px-1">
                        +{dayEvents.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        /* List View */
        <div className="divide-y divide-gray-100 max-h-[500px] overflow-y-auto">
          {upcomingEvents.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Calendar className="h-12 w-12 mx-auto mb-2 text-gray-300" />
              <p>No upcoming games</p>
            </div>
          ) : (
            upcomingEvents.map((event) => {
              const eventDate = new Date(event.start_time || event.scheduled_at);
              return (
                <button
                  key={event.id}
                  onClick={() => onEventClick?.(event)}
                  className="w-full p-4 text-left hover:bg-gray-50 transition"
                >
                  <div className="flex gap-4">
                    {/* Date Badge */}
                    <div className="flex-shrink-0 w-14 text-center">
                      <div className="text-xs font-medium text-[#1877F2] uppercase">
                        {MONTHS[eventDate.getMonth()].slice(0, 3)}
                      </div>
                      <div className="text-2xl font-bold text-gray-900">
                        {eventDate.getDate()}
                      </div>
                      <div className="text-xs text-gray-500">
                        {DAYS[eventDate.getDay()]}
                      </div>
                    </div>

                    {/* Event Details */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate">
                        {event.name || event.title}
                      </h3>
                      <div className="mt-1 flex flex-wrap gap-3 text-sm text-gray-500">
                        <span className="flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          {formatTime(event.start_time || event.scheduled_at)}
                        </span>
                        {event.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-4 w-4" />
                            {event.location}
                          </span>
                        )}
                        {(event.current_players !== undefined || event.rsvp_count !== undefined) && (
                          <span className="flex items-center gap-1">
                            <Users className="h-4 w-4" />
                            {event.current_players || event.rsvp_count || 0}
                            {event.max_players && `/${event.max_players}`}
                          </span>
                        )}
                      </div>
                      {event.game_type && (
                        <div className="mt-2">
                          <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded">
                            {event.game_type}
                          </span>
                          {event.stakes && (
                            <span className="inline-block ml-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded">
                              {event.stakes}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}

      {/* Legend */}
      {viewMode === 'calendar' && events.length > 0 && (
        <div className="p-3 border-t border-gray-200 bg-gray-50 text-xs text-gray-500">
          <span className="inline-block w-3 h-3 bg-[#1877F2] rounded mr-1"></span>
          {events.length} game{events.length !== 1 ? 's' : ''} scheduled
        </div>
      )}
    </div>
  );
}
