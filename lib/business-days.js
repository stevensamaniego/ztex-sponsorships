// Business-day arithmetic for the reminder policy. A business day is Monday–Friday in the
// given time zone (America/Denver by default); public holidays are not excluded.
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TZ = 'America/Denver';

// Calendar day of `ms` in `tz`, as a whole number of days since 1970-01-01.
function dayIndex(ms, tz) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(ms));
  const get = type => parseInt(parts.find(p => p.type === type).value, 10);
  return Math.floor(Date.UTC(get('year'), get('month') - 1, get('day')) / DAY_MS);
}

// 1970-01-01 was a Thursday. 0 = Sunday … 6 = Saturday.
function weekdayOf(dayIdx) {
  return (((dayIdx + 4) % 7) + 7) % 7;
}

function isBusinessDay(dayIdx) {
  const w = weekdayOf(dayIdx);
  return w >= 1 && w <= 5;
}

// Whole weekdays elapsed from the calendar day of `fromMs` to the calendar day of `toMs`:
// the number of Monday–Friday dates after `from`'s date, up to and including `to`'s date.
// Fri→Mon = 1, Fri→Wed = 3, Thu→Tue = 3, same day = 0, Sat→Mon = 1. Never negative.
function businessDaysBetween(fromMs, toMs, tz = DEFAULT_TZ) {
  const from = dayIndex(fromMs, tz);
  const to = dayIndex(toMs, tz);
  if (!(to > from)) return 0;
  const span = to - from;
  const fullWeeks = Math.floor(span / 7);
  let count = fullWeeks * 5;
  for (let d = from + fullWeeks * 7 + 1; d <= to; d++) {
    if (isBusinessDay(d)) count++;
  }
  return count;
}

module.exports = { businessDaysBetween, DEFAULT_TZ };
