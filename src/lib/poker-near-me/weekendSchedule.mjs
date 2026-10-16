/**
 * Intent-Based Weekend Schedule Utilities
 * 
 * Provides deterministic calculation of upcoming/current weekend dates (Friday, Saturday, Sunday)
 * in US Eastern Time (the canonical schedule anchor for Smarter.Poker tournament schedules).
 */

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Get the Friday, Saturday, and Sunday dates for the upcoming/active weekend.
 * If today is Friday, Saturday, or Sunday, it returns the active weekend.
 * If today is Monday through Thursday, it returns the upcoming weekend starting this Friday.
 *
 * @param {Date|string|number} [referenceTime]
 * @param {string} [timeZone='America/New_York']
 * @returns {{
 *   friday: string,
 *   saturday: string,
 *   sunday: string,
 *   dates: string[],
 *   referenceDay: string,
 *   isCurrentlyWeekend: boolean,
 *   weekendRangeLabel: string
 * }}
 */
export function getWeekendDates(referenceTime = new Date(), timeZone = 'America/New_York') {
  const dateObj = referenceTime instanceof Date ? referenceTime : new Date(referenceTime);
  const localStr = dateObj.toLocaleString('en-US', { timeZone });
  const localDate = new Date(localStr);

  const dayOfWeek = localDate.getDay(); // 0 = Sun, 1 = Mon, ..., 5 = Fri, 6 = Sat
  const dayName = DAYS[dayOfWeek];

  let diffToFriday = 0;
  if (dayOfWeek === 5) {
    diffToFriday = 0; // It's Friday
  } else if (dayOfWeek === 6) {
    diffToFriday = -1; // It's Saturday, Friday was yesterday
  } else if (dayOfWeek === 0) {
    diffToFriday = -2; // It's Sunday, Friday was 2 days ago
  } else {
    diffToFriday = 5 - dayOfWeek; // Mon(1)->4, Tue(2)->3, Wed(3)->2, Thu(4)->1
  }

  const fri = new Date(localDate);
  fri.setDate(localDate.getDate() + diffToFriday);

  const sat = new Date(fri);
  sat.setDate(fri.getDate() + 1);

  const sun = new Date(fri);
  sun.setDate(fri.getDate() + 2);

  const toYMD = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const friYMD = toYMD(fri);
  const satYMD = toYMD(sat);
  const sunYMD = toYMD(sun);

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const friMonth = monthNames[fri.getMonth()];
  const sunMonth = monthNames[sun.getMonth()];
  const friDay = fri.getDate();
  const sunDay = sun.getDate();
  const year = sun.getFullYear();

  const weekendRangeLabel = friMonth === sunMonth
    ? `${friMonth} ${friDay} – ${sunDay}, ${year}`
    : `${friMonth} ${friDay} – ${sunMonth} ${sunDay}, ${year}`;

  return {
    friday: friYMD,
    saturday: satYMD,
    sunday: sunYMD,
    dates: [friYMD, satYMD, sunYMD],
    referenceDay: dayName,
    isCurrentlyWeekend: dayOfWeek === 5 || dayOfWeek === 6 || dayOfWeek === 0,
    weekendRangeLabel,
  };
}
