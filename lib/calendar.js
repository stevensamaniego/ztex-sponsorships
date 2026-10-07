// Event date/time handling and the calendar invite sent to approvers and marketing
// when a request is approved. Times are wall-clock Mountain Time (ZTEX is in El Paso).
const TZID = 'America/Denver';
const DURATION_MINUTES = 60;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

// Returns { eventDate, eventTime } or { error }. Both are required on new requests.
function parseEventWhen(dateValue, timeValue) {
  const date = typeof dateValue === 'string' ? dateValue.trim() : '';
  const time = typeof timeValue === 'string' ? timeValue.trim().slice(0, 5) : '';
  const d = DATE_RE.exec(date);
  if (!d) return { error: 'Please enter the event date.', field: 'eventDate' };
  const check = new Date(Date.UTC(+d[1], +d[2] - 1, +d[3]));
  if (check.getUTCFullYear() !== +d[1] || check.getUTCMonth() !== +d[2] - 1 || check.getUTCDate() !== +d[3]
      || +d[1] < 2000 || +d[1] > 2100) {
    return { error: 'Please enter a valid event date.', field: 'eventDate' };
  }
  if (!TIME_RE.test(time)) return { error: 'Please enter the event start time.', field: 'eventTime' };
  return { eventDate: date, eventTime: time };
}

// "Saturday, November 14, 2026 at 6:00 PM" (formatted from the parts; no time zone shifts).
// Older requests may have no time or no date.
function formatEventWhen(date, time, { weekday = true } = {}) {
  const d = DATE_RE.exec(String(date || ''));
  if (!d) return '';
  const day = new Date(Date.UTC(+d[1], +d[2] - 1, +d[3])).toLocaleDateString('en-US', {
    timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric', ...(weekday ? { weekday: 'long' } : {})
  });
  const t = TIME_RE.exec(String(time || ''));
  if (!t) return day;
  const h = +t[1];
  return `${day} at ${((h + 11) % 12) + 1}:${t[2]} ${h < 12 ? 'AM' : 'PM'}`;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function localStamp(date, time, addMinutes = 0) {
  const [y, mo, da] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const t = new Date(Date.UTC(y, mo - 1, da, h, mi + addMinutes));
  return `${t.getUTCFullYear()}${pad(t.getUTCMonth() + 1)}${pad(t.getUTCDate())}T${pad(t.getUTCHours())}${pad(t.getUTCMinutes())}00`;
}

function utcStamp(ms) {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function escapeText(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

// Lines longer than 75 octets are folded with CRLF + space (RFC 5545 3.1), never splitting a character.
function fold(line) {
  const out = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const size = Buffer.byteLength(ch);
    if (bytes + size > (out.length ? 74 : 75)) {
      out.push(current);
      current = '';
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join('\r\n ');
}

function safeAddress(email) {
  return String(email || '').replace(/[^A-Za-z0-9.!#$%&'*+/=?^_`{|}~@-]/g, '');
}

const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  `TZID:${TZID}`,
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:-0700',
  'TZOFFSETTO:-0600',
  'TZNAME:MDT',
  'DTSTART:19700308T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:-0600',
  'TZOFFSETTO:-0700',
  'TZNAME:MST',
  'DTSTART:19701101T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
  'END:STANDARD',
  'END:VTIMEZONE'
];

// A 1-hour event shown as Free, no replies requested, with a reminder 1 day before.
// Without a start time (older requests) it becomes an all-day event.
function buildInvite({ uid, summary, description, date, time, organizer, attendees, now = Date.now() }) {
  if (!DATE_RE.test(String(date || ''))) return null;
  const timed = TIME_RE.test(String(time || ''));
  const when = timed
    ? [`DTSTART;TZID=${TZID}:${localStamp(date, time)}`, `DTEND;TZID=${TZID}:${localStamp(date, time, DURATION_MINUTES)}`]
    : [`DTSTART;VALUE=DATE:${date.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${localStamp(date, '00:00', 24 * 60).slice(0, 8)}`];

  const lines = [
    'BEGIN:VCALENDAR',
    'PRODID:-//ZTEX Construction//Sponsorship Portal//EN',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    ...(timed ? VTIMEZONE : []),
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${utcStamp(now)}`,
    ...when,
    `SUMMARY:${escapeText(summary)}`,
    `DESCRIPTION:${escapeText(description)}`,
    `ORGANIZER;CN=ZTEX Sponsorships:mailto:${safeAddress(organizer)}`,
    ...attendees.map(a => `ATTENDEE;ROLE=OPT-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=FALSE:mailto:${safeAddress(a)}`),
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    'TRANSP:TRANSPARENT',
    'X-MICROSOFT-CDO-BUSYSTATUS:FREE',
    'X-MICROSOFT-CDO-INTENDEDSTATUS:FREE',
    'X-MICROSOFT-DISALLOW-COUNTER:TRUE',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText(summary)}`,
    'TRIGGER:-P1D',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}

module.exports = { TZID, DURATION_MINUTES, parseEventWhen, formatEventWhen, buildInvite, escapeText, fold };
