/**
 * PASIG GREENPARK ARCHERY CAMP — Unified Booking Backend
 * Google Apps Script web app that makes the camp's Google Calendar
 * the single source of truth for bookings, AND emails the customer a receipt.
 *
 *  • GET  ?action=availability&date=YYYY-MM-DD
 *        → { date, capacity, slots:[{time,hour,booked,left}] }
 *
 *  • POST { action:"book", name, phone, email, program, date,
 *           times:["9:00 AM",...] (or single time), party, amount }
 *        → { ok:true, ref, booked:[...labels], eventIds:[...], party, date, emailed }
 *          (books every hour if room for the whole party, else ok:false + alternatives)
 *
 *  • POST { action:"cancel", eventId, ref, date, time, name, email, notify }
 *        → { ok:true, deleted, emailed }   (removes the event from the calendar)
 *
 * Capacity is enforced HERE (server-side) so it can't be bypassed from the website.
 * Receipts are sent with MailApp from the Google account that owns this script.
 * See backend/SETUP.md for deployment + re-deployment steps.
 */

// ====================== CONFIG — EDIT THESE ======================
var CALENDAR_ID = 'e7b1f8a1c7cca06323051fa6e73b4416387715424871d07bb20cc22fe0046564@group.calendar.google.com';
var CAPACITY    = 6;             // max archers per hour
var TIMEZONE    = 'Asia/Manila'; // used for reading/writing times

// Pricing (per archer, per 1-hour session) — used only for the receipt total
// when the website doesn't pass an "amount". Keep in sync with the site's Tweaks.
var SESSION_RATE = 600;          // standard programs
var PRIVATE_RATE = 1200;         // "Private Coaching"
var OPEN_RANGE_RATE = 400;       // "Open Range" (per archer, per session)

// Business details shown on the emailed receipt.
var BUSINESS_NAME   = 'Pasig Greenpark Archery Camp';
var RANGE_ADDRESS   = 'Pasig Greenpark Village Clubhouse, Pasig, Metro Manila';
var CONTACT_NUMBER  = '0917 127 6677';
var RESCHEDULE_NOTE = 'Need to reschedule or cancel? Reply to this email or text/call us at '
                    + CONTACT_NUMBER + ' at least a day before your session — no fees.';

// Opening hours = the START hour (24h) of each bookable 1-hour slot, per weekday.
// 0=Sun, 1=Mon, ... 6=Sat. An empty list means CLOSED that day.
var OPEN_HOURS = {
  0: [9, 10, 11, 12, 13, 14],              // Sunday 9am–3pm
  1: [],                                    // Monday CLOSED
  2: [16, 17, 18, 19],                      // Tuesday 4pm–8pm
  3: [16, 17, 18, 19],                      // Wednesday
  4: [16, 17, 18, 19],                      // Thursday
  5: [16, 17, 18, 19],                      // Friday
  6: [9, 10, 11, 12, 13, 14, 15, 16, 17]    // Saturday 9am–6pm
};

// COACHES — each coach has their own portal passcode and sets their own per-date
// hours from the website's Coach portal. Keep these passcodes in sync with the
// site (the `coaches()` list in the front-end). Open Range is drop-in (no coach);
// every other program is coach-led and shows only hours the chosen coach opened.
var COACHES = [
  { id: 'michael', name: 'Michael Cabral', pass: 'michael2026' },
  { id: 'james',   name: 'James Victoria', pass: 'james2026' },
  { id: 'rotsen',  name: 'Rotsen Vinluan', pass: 'rotsen2026' }
];
// ================================================================

// ====================== DATABASE (Google Sheet) ======================
// Every booking, pass, and cancellation is recorded in one Google Sheet so the
// owner has a single place to see everything (Calendar stays the scheduling view).
// The sheet is created automatically the first time it's needed and its ID saved
// in Script Properties. Run `setupDatabase` once to create it now and print its link.
var DB_PROP_KEY = 'DB_SPREADSHEET_ID';
var DB_NAME = 'Greenpark Archery — Database';
var DB_SHEETS = {
  bookings: { name: 'Bookings',      headers: ['Booked At','Ref','Status','Date','Time','Program','Name','Email','Mobile','Archers','Amount','Coach','Concession','Roster','Event ID'] },
  passes:   { name: 'Passes',        headers: ['Saved At','Email','Holder','Pass','Coach','Sessions','Plan ID'] },
  cancels:  { name: 'Cancellations', headers: ['Cancelled At','Ref','Date','Time','Program','Name','Email','Cancelled By','Event ID'] }
};

function getDb_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty(DB_PROP_KEY);
  var ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) { ss = SpreadsheetApp.create(DB_NAME); props.setProperty(DB_PROP_KEY, ss.getId()); }
  return ss;
}
function dbSheet_(key) {
  var def = DB_SHEETS[key];
  var ss = getDb_();
  var sh = ss.getSheetByName(def.name);
  if (!sh) {
    sh = ss.insertSheet(def.name);
    sh.appendRow(def.headers);
    sh.setFrozenRows(1);
    var first = ss.getSheets()[0];
    if (first && first.getName() === 'Sheet1' && first.getLastRow() === 0) { try { ss.deleteSheet(first); } catch (e) {} }
  }
  return sh;
}
function dbAppend_(key, row) { try { dbSheet_(key).appendRow(row); } catch (e) {} } // never let logging break a booking
function nowStr_() { return Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd HH:mm:ss'); }
function concSummary_(body) { var l = concLine_(body); return l ? l.replace(/^\nConcession:\s*/, '') : ''; }

// Record one booked hour in the Bookings tab.
function dbRecordBooking_(o) {
  dbAppend_('bookings', [nowStr_(), o.ref, 'booked', o.date, o.time, o.program || '', o.name || '', o.email || '', o.phone || '', o.party, o.amount, o.coach || '', o.concession || '', o.roster || '', o.eventId || '']);
}
// Mark a booking row cancelled (by event id, else by ref+date+time).
function dbMarkCancelled_(eventId, ref, dateStr, time) {
  try {
    var sh = dbSheet_('bookings');
    var data = sh.getDataRange().getValues();
    var h = data[0];
    var evCol = h.indexOf('Event ID'), stCol = h.indexOf('Status'), refCol = h.indexOf('Ref'), dCol = h.indexOf('Date'), tCol = h.indexOf('Time');
    for (var r = 1; r < data.length; r++) {
      var match = (eventId && data[r][evCol] === eventId) || (!eventId && data[r][refCol] === ref && data[r][dCol] === dateStr && data[r][tCol] === time);
      if (match) { sh.getRange(r + 1, stCol + 1).setValue('cancelled'); break; }
    }
  } catch (e) {}
}
// Mirror a pass to the Passes tab (upsert by email + plan id).
function dbUpsertPass_(email, plan) {
  try {
    var sh = dbSheet_('passes');
    var data = sh.getDataRange().getValues();
    var h = data[0], emCol = h.indexOf('Email'), tsCol = h.indexOf('Plan ID');
    var sessions = (plan.sessions || []).map(function (s) { return s.date + ' ' + s.time; }).join('; ');
    var row = [nowStr_(), email, plan.holder || '', plan.name || '', plan.coach || '', sessions, plan.ts];
    for (var r = 1; r < data.length; r++) {
      if (String(data[r][tsCol]) === String(plan.ts) && String(data[r][emCol]).toLowerCase() === email) { sh.getRange(r + 1, 1, 1, row.length).setValues([row]); return; }
    }
    sh.appendRow(row);
  } catch (e) {}
}
function dbRemovePass_(email, ts) {
  try {
    var sh = dbSheet_('passes');
    var data = sh.getDataRange().getValues();
    var h = data[0], emCol = h.indexOf('Email'), tsCol = h.indexOf('Plan ID');
    for (var r = data.length - 1; r >= 1; r--) {
      if (String(data[r][tsCol]) === String(ts) && String(data[r][emCol]).toLowerCase() === email) sh.deleteRow(r + 1);
    }
  } catch (e) {}
}

// RUN THIS ONCE from the editor to create the database sheet and print its link.
function setupDatabase() {
  var ss = getDb_();
  dbSheet_('bookings'); dbSheet_('passes'); dbSheet_('cancels');
  Logger.log('✅ Database ready. Open/bookmark it here:\n' + ss.getUrl());
}
// ================================================================

/**
 * RUN THIS ONCE to grant the email permission and send yourself a test receipt.
 * In the Apps Script editor: pick "authorizeAndTestEmail" in the function
 * dropdown → click ▶ Run → approve the permission prompt (it will now ask to
 * "Send email as you"). Check your inbox — if the sample receipt arrives,
 * real booking receipts will send too. You only need to do this once.
 *
 * After running, open "Execution log" (View → Logs) to see where the email went
 * or read the exact error if something is wrong.
 */
function authorizeAndTestEmail() {
  // Where to send the test. Falls back to the script owner if the active user
  // isn't resolvable (common with consumer Gmail accounts).
  var me = Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail();
  if (!me) throw new Error('Could not resolve your email automatically. Set TEST_EMAIL below to your address and run again.');
  // var me = 'you@example.com';  // ← uncomment & set this if the line above fails

  Logger.log('Daily email quota remaining before send: ' + MailApp.getRemainingDailyQuota());
  sendReceipt_({
    email: me,
    name: 'Test Archer',
    program: 'Adult Beginners (18+)',
    dateStr: Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd'),
    times: ['9:00 AM', '10:00 AM'],
    party: 2,
    amount: SESSION_RATE * 2 * 2,
    ref: 'PGA-TEST-0001'
  });
  Logger.log('✅ Test receipt sent to ' + me + ' — check your inbox AND your Spam/Promotions folders.');
}

function getCalendar_() {
  var cal = CalendarApp.getCalendarById(CALENDAR_ID);
  if (!cal) throw new Error('Calendar not found — check CALENDAR_ID and that the script account can see it.');
  return cal;
}

function fmtLabel_(h) {
  var ap = h >= 12 ? 'PM' : 'AM';
  var hh = h % 12; if (hh === 0) hh = 12;
  return hh + ':00 ' + ap;
}
function peso_(n) {
  n = Math.round(Number(n) || 0);
  return '\u20B1' + n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
// Group discount on the same session: 2 → 10%, 3–4 → 20%, 5–6 → 30%.
function groupDiscount_(party) {
  party = Math.max(1, party || 1);
  if (party >= 5) return 0.30;
  if (party >= 3) return 0.20;
  if (party === 2) return 0.10;
  return 0;
}

// Sum how many ARCHERS (seats) are already booked in each open hour.
// Each event stores its party size as "Archers: N" in the description; a coach can also
// write "(xN)" in the title to block N seats. Anything unmarked counts as 1.
function seatsOf_(ev) {
  var text = (ev.getTitle() || '') + ' ' + (ev.getDescription() || '');
  var m = text.match(/Archers:\s*(\d+)/i) || text.match(/\(x\s*(\d+)\)/i);
  return m ? parseInt(m[1], 10) : 1;
}
function countByHour_(dateStr) {
  var parts = dateStr.split('-');
  var y = parseInt(parts[0], 10), m = parseInt(parts[1], 10) - 1, d = parseInt(parts[2], 10);
  var dayStart = new Date(y, m, d, 0, 0, 0);
  var dayEnd   = new Date(y, m, d, 23, 59, 59);
  var events = getCalendar_().getEvents(dayStart, dayEnd);
  var counts = {};
  events.forEach(function (ev) {
    var hr = parseInt(Utilities.formatDate(ev.getStartTime(), TIMEZONE, 'H'), 10);
    counts[hr] = (counts[hr] || 0) + seatsOf_(ev);
  });
  return counts;
}

// ---------- COACH AVAILABILITY (per-coach, per-date custom hours) ----------
// Stored in Script Properties under "avail:<coachId>:<YYYY-MM-DD>" as a JSON array
// of start-hours. A stored entry (even []) overrides the weekday template; no entry
// means the coach keeps the standard hours for that weekday.
function coachKey_(coachId, dateStr) { return 'avail:' + coachId + ':' + dateStr; }
function coachById_(id) {
  for (var i = 0; i < COACHES.length; i++) if (COACHES[i].id === id) return COACHES[i];
  return null;
}
function coachHoursFor_(coachId, dateStr, dow) {
  var raw = PropertiesService.getScriptProperties().getProperty(coachKey_(coachId, dateStr));
  if (raw != null) { try { return JSON.parse(raw) || []; } catch (e) { return []; } }
  return OPEN_HOURS[dow] || [];
}
// Hours to show for an availability request:
//   • a known coach id → that coach's hours for the date
//   • "any"            → union of every coach's hours (≥1 coach free)
//   • anything else / blank (e.g. Open Range) → the standard weekday template
function hoursForRequest_(dateStr, dow, coachId) {
  if (coachId && coachById_(coachId)) return coachHoursFor_(coachId, dateStr, dow);
  if (coachId === 'any') {
    var set = {};
    COACHES.forEach(function (c) {
      coachHoursFor_(c.id, dateStr, dow).forEach(function (h) { set[h] = true; });
    });
    return Object.keys(set).map(function (h) { return parseInt(h, 10); }).sort(function (a, b) { return a - b; });
  }
  return OPEN_HOURS[dow] || [];
}

function buildSlots_(dateStr, coachId) {
  var parts = dateStr.split('-');
  var dow = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)).getDay();
  var hours = hoursForRequest_(dateStr, dow, coachId);
  var counts = countByHour_(dateStr);
  // Drop hours that have already started/passed when the date is today.
  var todayStr = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd');
  if (dateStr === todayStr) {
    var nowH = parseInt(Utilities.formatDate(new Date(), TIMEZONE, 'H'), 10);
    var nowM = parseInt(Utilities.formatDate(new Date(), TIMEZONE, 'm'), 10);
    hours = hours.filter(function (h) { return h * 60 > nowH * 60 + nowM; });
  }
  return hours.map(function (h) {
    var booked = Math.min(CAPACITY, counts[h] || 0);
    return { time: fmtLabel_(h), hour: h, booked: booked, left: CAPACITY - booked };
  });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function makeRef_(dateStr) {
  var compact = (dateStr || '').replace(/-/g, '').slice(2); // YYMMDD
  var rnd = '';
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (var i = 0; i < 4; i++) rnd += chars.charAt(Math.floor(Math.random() * chars.length));
  return 'PGA-' + compact + '-' + rnd;
}

function prettyDate_(dateStr) {
  try {
    var p = dateStr.split('-');
    var d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
    return Utilities.formatDate(d, TIMEZONE, 'EEEE, MMMM d, yyyy');
  } catch (e) { return dateStr; }
}

// ---------- RECEIPT EMAIL ----------
function sendReceipt_(o) {
  // o: { email, name, program, dateStr, times[], party, amount, ref }
  if (!o.email) return false;
  var when = prettyDate_(o.dateStr);
  var timeList = (o.times || []).join(', ');
  var partyTxt = o.party + (o.party === 1 ? ' archer' : ' archers');
  var hasDisc = (o.discountRate || 0) > 0 && (o.discountAmount || 0) > 0;
  var discPct = Math.round((o.discountRate || 0) * 100);
  var subject = BUSINESS_NAME + ' — Booking confirmed (' + o.ref + ')';
  var lines = [
    'Hi ' + (o.name || 'there') + ',',
    '',
    'Your archery session is booked. Here is your receipt:',
    '',
    'Booking reference : ' + o.ref,
    'Name              : ' + (o.name || ''),
    'Program           : ' + (o.program || ''),
    'Date              : ' + when,
    'Time(s)           : ' + timeList,
    'Archers           : ' + partyTxt
  ];
  if (o.roster && o.roster.length) {
    lines.push('Who\u2019s shooting  : ' + o.roster.join('; '));
  }
  if (hasDisc) {
    lines.push('Subtotal          : ' + peso_(o.subtotal));
    lines.push('Group discount    : -' + peso_(o.discountAmount) + '  (' + discPct + '% off)');
  }
  lines.push('Total to pay      : ' + peso_(o.amount) + '  (pay at the range on arrival)');
  if (hasDisc) lines.push('You saved         : ' + peso_(o.discountAmount) + ' with the group discount');
  lines = lines.concat([
    '',
    'Where:',
    '  ' + RANGE_ADDRESS,
    '  ' + CONTACT_NUMBER,
    '',
    RESCHEDULE_NOTE,
    '',
    'See you on the range!',
    BUSINESS_NAME
  ]);
  var body = lines.join('\n');
  var discHtml = hasDisc
    ? receiptRow_('Subtotal', peso_(o.subtotal))
      + '<tr><td style="padding:6px 0;color:#3c6b48;">Group discount (' + discPct + '% off)</td>'
      + '<td style="padding:6px 0;text-align:right;font-weight:bold;color:#3c6b48;">-' + peso_(o.discountAmount) + '</td></tr>'
    : '';
  var html = '<div style="font-family:Arial,Helvetica,sans-serif;color:#1b2a1f;max-width:520px;">'
    + '<h2 style="color:#244232;margin:0 0 4px;">Booking confirmed</h2>'
    + '<p style="color:#56664f;margin:0 0 18px;">Thanks, ' + escapeHtml_(o.name || 'there') + ' — your spot is reserved.</p>'
    + '<table style="border-collapse:collapse;width:100%;font-size:14px;">'
    + receiptRow_('Reference', o.ref)
    + receiptRow_('Program', o.program || '')
    + receiptRow_('Date', when)
    + receiptRow_('Time(s)', timeList)
    + receiptRow_('Archers', partyTxt)
    + ((o.roster && o.roster.length) ? receiptRow_('Who\u2019s shooting', o.roster.join('; ')) : '')
    + discHtml
    + '<tr><td style="padding:10px 0;border-top:2px solid #244232;font-weight:bold;">Total to pay at the range</td>'
    + '<td style="padding:10px 0;border-top:2px solid #244232;font-weight:bold;text-align:right;color:#244232;font-size:18px;">' + peso_(o.amount) + '</td></tr>'
    + (hasDisc ? '<tr><td colspan="2" style="padding:6px 0 0;text-align:right;color:#3c6b48;font-weight:bold;font-size:13px;">You saved ' + peso_(o.discountAmount) + ' with the group discount</td></tr>' : '')
    + '</table>'
    + '<p style="font-size:13px;color:#56664f;margin:18px 0 4px;"><strong>Where</strong><br>' + escapeHtml_(RANGE_ADDRESS) + '<br>' + escapeHtml_(CONTACT_NUMBER) + '</p>'
    + '<p style="font-size:13px;color:#8a9579;margin:14px 0 0;">' + escapeHtml_(RESCHEDULE_NOTE) + '</p>'
    + '<p style="font-size:13px;color:#244232;margin:18px 0 0;font-weight:bold;">' + escapeHtml_(BUSINESS_NAME) + '</p>'
    + '</div>';
  MailApp.sendEmail({ to: o.email, subject: subject, body: body, htmlBody: html, name: BUSINESS_NAME });
  return true;
}
function receiptRow_(k, v) {
  return '<tr><td style="padding:6px 0;color:#8a9579;">' + escapeHtml_(k) + '</td>'
    + '<td style="padding:6px 0;text-align:right;font-weight:bold;">' + escapeHtml_(v) + '</td></tr>';
}
function sendCancellation_(o) {
  // o: { email, name, program, dateStr, time, ref }
  if (!o.email) return false;
  var when = prettyDate_(o.dateStr);
  var subject = BUSINESS_NAME + ' — Booking cancelled' + (o.ref ? ' (' + o.ref + ')' : '');
  var body = [
    'Hi ' + (o.name || 'there') + ',',
    '',
    'Your archery booking has been cancelled:',
    '',
    (o.ref ? 'Reference : ' + o.ref : ''),
    'Program   : ' + (o.program || ''),
    'Date      : ' + when,
    (o.time ? 'Time      : ' + o.time : ''),
    '',
    'If this was a mistake or you\'d like to rebook, just reply or text/call ' + CONTACT_NUMBER + '.',
    '',
    BUSINESS_NAME
  ].filter(function (l) { return l !== ''; }).join('\n');
  MailApp.sendEmail({ to: o.email, subject: subject, body: body, name: BUSINESS_NAME });
  return true;
}
function escapeHtml_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------- PASS EMAILS ----------
// Sent once when a customer buys a pass/membership — confirms it with the total.
function sendPlanReceipt_(o) {
  if (!o.email) return false;
  var who = o.holder || 'there';
  var totalTxt = (o.amount != null && o.amount !== '') ? peso_(o.amount) : (o.price || '');
  var subject = BUSINESS_NAME + ' — Pass confirmed' + (o.ref ? ' (' + o.ref + ')' : '');
  var lines = [
    'Hi ' + who + ',',
    '',
    'Thanks for getting a pass with us! Here are the details:',
    '',
    (o.ref ? 'Reference : ' + o.ref : ''),
    'Pass      : ' + (o.plan || ''),
    'Holder    : ' + (o.holder || ''),
    (totalTxt ? 'Total     : ' + totalTxt + '  (pay at the range)' : ''),
    '',
    'Our team will assign your coach and schedule your sessions — you’ll get a separate email with the dates. You can also see everything anytime in My Bookings on our website.',
    '',
    'See you on the range!',
    BUSINESS_NAME
  ].filter(function (l) { return l !== ''; });
  var html = '<div style="font-family:Arial,Helvetica,sans-serif;color:#1b2a1f;max-width:520px;">'
    + '<h2 style="color:#244232;margin:0 0 4px;">Pass confirmed</h2>'
    + '<p style="color:#56664f;margin:0 0 18px;">Thanks, ' + escapeHtml_(who) + ' — your pass is ready.</p>'
    + '<table style="border-collapse:collapse;width:100%;font-size:14px;">'
    + (o.ref ? receiptRow_('Reference', o.ref) : '')
    + receiptRow_('Pass', o.plan || '')
    + receiptRow_('Holder', o.holder || '')
    + (totalTxt ? ('<tr><td style="padding:10px 0;border-top:2px solid #244232;font-weight:bold;">Total to pay at the range</td><td style="padding:10px 0;border-top:2px solid #244232;font-weight:bold;text-align:right;color:#244232;font-size:18px;">' + escapeHtml_(totalTxt) + '</td></tr>') : '')
    + '</table>'
    + '<p style="font-size:13px;color:#56664f;margin:18px 0 4px;">We’ll assign your coach and schedule your sessions, then email you the dates. Track it all in <strong>My Bookings</strong>.</p>'
    + '<p style="font-size:13px;color:#244232;margin:18px 0 0;font-weight:bold;">' + escapeHtml_(BUSINESS_NAME) + '</p>'
    + '</div>';
  MailApp.sendEmail({ to: o.email, subject: subject, body: lines.join('\n'), htmlBody: html, name: BUSINESS_NAME });
  return true;
}
// Sent once after the admin schedules a pass's sessions — lists all the dates.
function sendPlanSchedule_(o) {
  if (!o.email) return false;
  var who = o.holder || 'there';
  var sess = (o.sessions || []).slice().sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); });
  if (!sess.length) return false;
  var rows = sess.map(function (s) { return '  • ' + prettyDate_(s.date) + ' · ' + s.time; });
  var subject = BUSINESS_NAME + ' — Your sessions are scheduled' + (o.ref ? ' (' + o.ref + ')' : '');
  var lines = [
    'Hi ' + who + ',',
    '',
    'Good news — your ' + (o.plan || 'pass') + ' sessions are scheduled:',
    '',
  ].concat(rows).concat([
    '',
    (o.coachName ? ('Coach: ' + o.coachName) : ''),
    (o.ref ? ('Reference: ' + o.ref) : ''),
    '',
    'Need to change a date? Reply to this email or text/call ' + CONTACT_NUMBER + '.',
    '',
    BUSINESS_NAME
  ]).filter(function (l) { return l !== ''; });
  var htmlRows = sess.map(function (s) { return '<tr><td style="padding:6px 0;color:#244232;font-weight:bold;">' + escapeHtml_(prettyDate_(s.date)) + '</td><td style="padding:6px 0;text-align:right;">' + escapeHtml_(s.time) + '</td></tr>'; }).join('');
  var html = '<div style="font-family:Arial,Helvetica,sans-serif;color:#1b2a1f;max-width:520px;">'
    + '<h2 style="color:#244232;margin:0 0 4px;">Your sessions are scheduled</h2>'
    + '<p style="color:#56664f;margin:0 0 18px;">Hi ' + escapeHtml_(who) + ', here are your ' + escapeHtml_(o.plan || 'pass') + ' dates:</p>'
    + '<table style="border-collapse:collapse;width:100%;font-size:14px;">' + htmlRows + '</table>'
    + (o.coachName ? ('<p style="font-size:13px;color:#56664f;margin:16px 0 0;"><strong>Coach:</strong> ' + escapeHtml_(o.coachName) + '</p>') : '')
    + (o.ref ? ('<p style="font-size:12.5px;color:#8a9579;margin:6px 0 0;">Reference: ' + escapeHtml_(o.ref) + '</p>') : '')
    + '<p style="font-size:13px;color:#56664f;margin:16px 0 0;">Need to change a date? Reply here or text/call ' + escapeHtml_(CONTACT_NUMBER) + '.</p>'
    + '<p style="font-size:13px;color:#244232;margin:18px 0 0;font-weight:bold;">' + escapeHtml_(BUSINESS_NAME) + '</p>'
    + '</div>';
  MailApp.sendEmail({ to: o.email, subject: subject, body: lines.join('\n'), htmlBody: html, name: BUSINESS_NAME });
  return true;
}

// ---------- AVAILABILITY (GET) ----------
function doGet(e) {
  try {
    var action = (e.parameter.action || 'availability');
    if (action === 'availability') {
      var date = e.parameter.date;
      if (!date) return json_({ error: 'Missing date' });
      return json_({ date: date, capacity: CAPACITY, slots: buildSlots_(date, e.parameter.coach) });
    }
    if (action === 'lookup') {
      return lookup_(e.parameter.email, e.parameter.ref);
    }
    if (action === 'plans') {
      return listPlans_(e.parameter.email);
    }
    if (action === 'cancellations') {
      return listCancellations_();
    }
    if (action === 'version') {
      // Lets the website (and support) confirm which backend is actually deployed.
      return json_({ version: 'db-v3', database: true, cancelLog: true, planEmails: true });
    }
    return json_({ error: 'Unknown action' });
  } catch (err) {
    return json_({ error: String(err) });
  }
}

// Find a customer's sessions by email (+ optional booking reference) for the My Bookings page.
// Scans calendar events in a window and reads the structured description we write at booking time.
function lookup_(email, ref) {
  email = (email || '').trim().toLowerCase();
  ref = (ref || '').trim().toUpperCase();
  if (!email) return json_({ bookings: [] });
  var cal = getCalendar_();
  var from = new Date(); from.setDate(from.getDate() - 120);
  var to = new Date(); to.setDate(to.getDate() + 240);
  var events = cal.getEvents(from, to);
  var out = [], name = '';
  function field(d, key) { var m = new RegExp(key + ':\\s*(.+)', 'i').exec(d); return m ? m[1].trim() : ''; }
  events.forEach(function (ev) {
    var d = ev.getDescription() || '';
    if (field(d, 'Email').toLowerCase() !== email) return;
    var rf = field(d, 'Ref').toUpperCase();
    if (ref && rf !== ref) return;
    // Admin-scheduled pass sessions are shown under the customer's pass, not as
    // standalone session bookings — skip them here so they don't appear twice.
    if (/\(plan\)\s*$/i.test(field(d, 'Program'))) return;
    var conc = field(d, 'Concession');
    var c = conc ? { pasig: /Pasig/i.test(conc), local: /Greenpark|RHS/i.test(conc), pac: /PAC/i.test(conc) } : null;
    var st = ev.getStartTime();
    var nm = field(d, 'Name');
    if (nm) name = nm;
    out.push({
      name: nm, phone: field(d, 'Mobile'), email: email, program: field(d, 'Program'),
      date: Utilities.formatDate(st, TIMEZONE, 'yyyy-MM-dd'),
      time: fmtLabel_(parseInt(Utilities.formatDate(st, TIMEZONE, 'H'), 10)),
      party: parseInt(field(d, 'Archers') || '1', 10) || 1,
      amount: parseInt(field(d, 'Amount') || '0', 10) || 0,
      coachName: field(d, 'Coach'),
      ref: rf, eventId: ev.getId(), concession: c, ts: st.getTime(), __remote: true,
    });
  });
  return json_({ bookings: out, name: name });
}

// Compact concession summary written into the calendar event so lookup_ can read it back.
function concLine_(body) {
  var c = body.concession;
  if (!c) return '';
  var p = [];
  if (c.pasig) p.push('Pasig');
  if (c.local) p.push('Greenpark/RHS');
  if (c.pac) p.push('PAC');
  return p.length ? ('\nConcession: ' + p.join(',')) : '';
}

// Coach line written into the calendar event (coach-led programs only).
function coachLine_(body) {
  var nm = body.coachName || '';
  if (!nm && body.coach) {
    var c = coachById_(body.coach);
    nm = c ? c.name : (body.coach === 'any' ? 'Any available coach' : '');
  }
  return nm ? ('\nCoach: ' + nm) : '';
}
// Short coach suffix for the calendar event title (named coach only).
function coachTitle_(body) {
  var nm = body.coachName || '';
  if (nm && !/Any available/i.test(nm)) return ' · Coach ' + nm.split(' ')[0];
  return '';
}

// ---------- BOOK / CANCEL (POST) ----------
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.action === 'cancel') return cancel_(body);
    if (body.action === 'book')   return book_(body);
    if (body.action === 'setCoachAvail') return setCoachAvail_(body);
    if (body.action === 'coachLogin')    return coachLogin_(body);
    if (body.action === 'savePlan')      return savePlan_(body);
    if (body.action === 'removePlan')    return removePlan_(body);
    if (body.action === 'planScheduleEmail') return planScheduleEmail_(body);
    return json_({ ok: false, reason: 'unknown action' });
  } catch (err) {
    return json_({ ok: false, reason: 'error', message: String(err) });
  }
}

// ---------- COACH PORTAL (login + set own hours) ----------
// A coach signs in with their passcode and saves which hours they can coach on a
// given date. hours = array of start-hours (e.g. [9,10,17]); hours = null reverts
// that date to the standard weekday template.
function coachLogin_(body) {
  var c = coachById_(body.coach);
  if (!c || c.pass !== (body.pass || '')) return json_({ ok: false, reason: 'bad credentials' });
  return json_({ ok: true, id: c.id, name: c.name });
}
function setCoachAvail_(body) {
  var c = coachById_(body.coach);
  if (!c || c.pass !== (body.pass || '')) return json_({ ok: false, reason: 'bad credentials' });
  if (!body.date) return json_({ ok: false, reason: 'missing date' });
  var props = PropertiesService.getScriptProperties();
  if (body.hours == null) {
    props.deleteProperty(coachKey_(c.id, body.date)); // revert to standard hours
    return json_({ ok: true, coach: c.id, date: body.date, reverted: true });
  }
  var hours = (body.hours || []).map(function (h) { return parseInt(h, 10); })
    .filter(function (h) { return !isNaN(h); });
  props.setProperty(coachKey_(c.id, body.date), JSON.stringify(hours));
  return json_({ ok: true, coach: c.id, date: body.date, hours: hours });
}

// ---------- PASSES / MEMBERSHIPS (server-stored so every device + the admin see them) ----------
// Each pass is stored in Script Properties under "plan:<email>:<ts>" as the full
// plan object the website uses: { name, holder, ts, coach, sessions:[{date,time,...}] }.
// This makes a customer's pass visible on any device, and lets the admin (on any
// computer) assign a coach and schedule the pass's sessions.
function planKey_(email, ts) { return 'plan:' + (email || '').trim().toLowerCase() + ':' + ts; }
function savePlan_(body) {
  var email = (body.email || '').trim().toLowerCase();
  var plan = body.plan;
  if (!email || !plan || plan.ts == null) return json_({ ok: false, reason: 'missing email or plan' });
  PropertiesService.getScriptProperties().setProperty(planKey_(email, plan.ts), JSON.stringify(plan));
  dbUpsertPass_(email, plan); // mirror to the Passes tab for the owner
  // Email the buyer a purchase confirmation with the total (only when the website asks,
  // i.e. on a brand-new purchase — not on every later edit/coach assignment).
  if (body.sendReceipt) {
    try { sendPlanReceipt_({ email: email, holder: plan.holder, plan: plan.name, ref: plan.ref || '', amount: body.amount, price: body.price }); } catch (e) {}
  }
  return json_({ ok: true });
}
// One summary email of a pass's scheduled sessions (sent once, after the admin schedules).
function planScheduleEmail_(body) {
  var email = (body.email || '').trim().toLowerCase();
  if (!email || body.ts == null) return json_({ ok: false, reason: 'missing email or ts' });
  var raw = PropertiesService.getScriptProperties().getProperty(planKey_(email, body.ts));
  if (!raw) return json_({ ok: false, reason: 'plan not found' });
  var plan; try { plan = JSON.parse(raw); } catch (e) { return json_({ ok: false, reason: 'bad plan' }); }
  var coachName = '';
  if (plan.coach) { var c = coachById_(plan.coach); coachName = c ? c.name : ''; }
  var emailed = false;
  try { emailed = sendPlanSchedule_({ email: email, holder: plan.holder, plan: plan.name, ref: plan.ref || '', sessions: plan.sessions || [], coachName: coachName }); } catch (e) {}
  return json_({ ok: true, emailed: emailed });
}
// Cancellation history for the admin dashboard (newest first).
function listCancellations_() {
  try {
    var sh = dbSheet_('cancels');
    var data = sh.getDataRange().getValues();
    var out = [];
    for (var r = 1; r < data.length; r++) {
      var row = data[r];
      out.push({ when: String(row[0] || ''), ref: String(row[1] || ''), date: String(row[2] || ''), time: String(row[3] || ''), program: String(row[4] || ''), name: String(row[5] || ''), email: String(row[6] || ''), by: String(row[7] || '') });
    }
    out.reverse();
    return json_({ cancellations: out });
  } catch (e) { return json_({ cancellations: [], error: String(e) }); }
}
function removePlan_(body) {
  var email = (body.email || '').trim().toLowerCase();
  if (!email || body.ts == null) return json_({ ok: false, reason: 'missing email or ts' });
  // Read the pass first so the cancellation log can name it.
  var planName = '', holder = '';
  var raw = PropertiesService.getScriptProperties().getProperty(planKey_(email, body.ts));
  if (raw) { try { var pl = JSON.parse(raw); planName = pl.name || ''; holder = pl.holder || ''; } catch (e) {} }
  PropertiesService.getScriptProperties().deleteProperty(planKey_(email, body.ts));
  dbRemovePass_(email, body.ts); // remove from the Passes tab too
  // Audit: record who removed the pass and when.
  dbAppend_('cancels', [nowStr_(), '', '', '', ('Pass: ' + planName), holder, email, (body.by || 'customer'), '']);
  return json_({ ok: true });
}
// GET ?action=plans            → every pass across all customers (for the admin)
// GET ?action=plans&email=x    → just that customer's passes (for My Bookings)
function listPlans_(email) {
  email = (email || '').trim().toLowerCase();
  var props = PropertiesService.getScriptProperties().getProperties();
  var out = [];
  for (var key in props) {
    if (key.indexOf('plan:') !== 0) continue;
    var rest = key.slice('plan:'.length);
    var cut = rest.lastIndexOf(':');
    var keyEmail = cut >= 0 ? rest.slice(0, cut) : rest;
    if (email && keyEmail !== email) continue;
    var plan; try { plan = JSON.parse(props[key]); } catch (e) { continue; }
    if (!plan) continue;
    plan.email = keyEmail;
    out.push(plan);
  }
  out.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
  return json_({ plans: out });
}

function book_(body) {
  if (body.dates && body.dates.length) return bookMulti_(body);
  var date = body.date;
  // Accept either a single "time" or an array "times"
  var requested = body.times && body.times.length ? body.times : (body.time ? [body.time] : []);
  if (!requested.length) return json_({ ok: false, reason: 'no time selected' });
  var party = Math.max(1, parseInt(body.party, 10) || 1);  // archers in this booking

  var slots = buildSlots_(date);
  function findSlot(label) { for (var i = 0; i < slots.length; i++) { if (slots[i].time === label) return slots[i]; } return null; }

  // All-or-nothing: every requested slot must have room for the whole party
  var unavailable = [];
  requested.forEach(function (label) { var s = findSlot(label); if (!s || s.left < party) unavailable.push(label); });
  if (unavailable.length) {
    var alts = slots.filter(function (s) { return s.left >= party && requested.indexOf(s.time) === -1; })
                    .map(function (s) { return s.time; }).slice(0, 3);
    return json_({ ok: false, reason: 'full', unavailable: unavailable, alternatives: alts });
  }

  // Amount: trust the website's figure if present, else compute from the rate
  // table WITH the group discount (2 → 10%, 3–4 → 20%, 5–6 → 30%).
  var rate = /Private/i.test(body.program || '') ? PRIVATE_RATE : SESSION_RATE;
  var subtotal = rate * party * requested.length;
  var discRate = groupDiscount_(party);
  var amount = (body.amount != null && body.amount !== '')
    ? Number(body.amount)
    : Math.round(subtotal * (1 - discRate));
  var ref = makeRef_(date);

  // Roster: "Name (age)" per archer, for the event description + receipt.
  var roster = (body.archers && body.archers.length)
    ? body.archers.map(function (a) {
        var nm = (a && a.name ? a.name : 'Archer');
        var ag = (a && a.age != null && a.age !== '') ? (' (' + a.age + ' yrs, b. ' + (a.dob || '?') + ')') : (a && a.dob ? (' (b. ' + a.dob + ')') : '');
        return nm + ag;
      })
    : [];

  // Create one event per requested hour. A group of N is a single event that holds N seats.
  var parts = date.split('-');
  var cal = getCalendar_();
  var booked = [];
  var eventIds = [];
  var who = (body.name || 'Archer') + (party > 1 ? ' (group of ' + party + ')' : '');
  requested.forEach(function (label) {
    var slot = findSlot(label);
    var start = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), slot.hour, 0, 0);
    var end   = new Date(start.getTime() + 60 * 60 * 1000);
    var title = who + ' — ' + (body.program || 'Session') + coachTitle_(body);
    var ev = cal.createEvent(title, start, end, {
      description: 'Booked via website'
        + '\nRef: ' + ref
        + '\nArchers: ' + party
        + '\nName: ' + (body.name || '')
        + '\nMobile: ' + (body.phone || '')
        + '\nEmail: ' + (body.email || '')
        + '\nProgram: ' + (body.program || '')
        + (roster.length ? '\nRoster: ' + roster.join('; ') : '')
        + '\nAmount: ' + amount
        + concLine_(body)
        + coachLine_(body)
    });
    booked.push(label);
    eventIds.push(ev.getId());
  });

  // Record each booked hour in the database sheet.
  for (var bi = 0; bi < booked.length; bi++) {
    dbRecordBooking_({ ref: ref, date: date, time: booked[bi], program: body.program, name: body.name, email: body.email, phone: body.phone, party: party, amount: amount, coach: (body.coachName || body.coach || ''), concession: concSummary_(body), roster: roster.join('; '), eventId: eventIds[bi] || '' });
  }

  // One receipt email for the whole booking.
  var emailed = false;
  try {
    if (body.noEmail) {
      emailed = false; // admin-scheduled plan session — skip the customer receipt
    } else {
      emailed = sendReceipt_({
        email: (body.email || '').trim(), name: body.name, program: body.program,
        dateStr: date, times: booked, party: party, amount: amount, ref: ref,
        subtotal: subtotal, discountRate: discRate, discountAmount: subtotal - amount,
        roster: roster
      });
    }
  } catch (mailErr) {
    emailed = false; // booking still succeeds even if the email fails
  }

  return json_({ ok: true, ref: ref, booked: booked, eventIds: eventIds, party: party, date: date, amount: amount, emailed: emailed });
}

// Multi-date booking (Open Range): body.dates = [{ date, times:[] }, ...].
// Books every (date, time) pair, all-or-nothing, and sends ONE combined receipt.
function bookMulti_(body) {
  var party = Math.max(1, parseInt(body.party, 10) || 1);
  var dates = body.dates || [];
  var slotsByDate = {};
  var unavailable = [];
  dates.forEach(function (d) {
    var slots = buildSlots_(d.date);
    slotsByDate[d.date] = slots;
    (d.times || []).forEach(function (label) {
      var s = null; for (var i = 0; i < slots.length; i++) { if (slots[i].time === label) { s = slots[i]; break; } }
      if (!s || s.left < party) unavailable.push(d.date + ' ' + label);
    });
  });
  if (unavailable.length) return json_({ ok: false, reason: 'full', unavailable: unavailable });

  var rate = /Open Range/i.test(body.program || '') ? OPEN_RANGE_RATE : (/Private/i.test(body.program || '') ? PRIVATE_RATE : SESSION_RATE);
  var pairCount = dates.reduce(function (n, d) { return n + ((d.times || []).length); }, 0);
  if (!pairCount) return json_({ ok: false, reason: 'no time selected' });
  var subtotal = rate * party * pairCount;
  var discRate = groupDiscount_(party);
  var amount = (body.amount != null && body.amount !== '') ? Number(body.amount) : Math.round(subtotal * (1 - discRate));
  var ref = makeRef_(dates[0].date);

  var roster = (body.archers && body.archers.length)
    ? body.archers.map(function (a) {
        var nm = (a && a.name ? a.name : 'Archer');
        var ag = (a && a.age != null && a.age !== '') ? (' (' + a.age + ' yrs, b. ' + (a.dob || '?') + ')') : (a && a.dob ? (' (b. ' + a.dob + ')') : '');
        return nm + ag;
      })
    : [];

  var cal = getCalendar_();
  var who = (body.name || 'Archer') + (party > 1 ? ' (group of ' + party + ')' : '');
  var bookedPairs = [];
  var eventIds = [];
  var allLabels = [];
  dates.forEach(function (d) {
    var parts = d.date.split('-');
    var slots = slotsByDate[d.date];
    (d.times || []).forEach(function (label) {
      var slot = null; for (var i = 0; i < slots.length; i++) { if (slots[i].time === label) { slot = slots[i]; break; } }
      var start = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), slot.hour, 0, 0);
      var end = new Date(start.getTime() + 60 * 60 * 1000);
      var title = who + ' — ' + (body.program || 'Session');
      var ev = cal.createEvent(title, start, end, {
        description: 'Booked via website'
          + '\nRef: ' + ref
          + '\nArchers: ' + party
          + '\nName: ' + (body.name || '')
          + '\nMobile: ' + (body.phone || '')
          + '\nEmail: ' + (body.email || '')
          + '\nProgram: ' + (body.program || '')
          + (roster.length ? '\nRoster: ' + roster.join('; ') : '')
          + '\nAmount: ' + amount
          + concLine_(body)
      });
      bookedPairs.push({ date: d.date, time: label, eventId: ev.getId() });
      eventIds.push(ev.getId());
      allLabels.push(prettyDate_(d.date) + ' · ' + label);
    });
  });

  // Record each booked (date, time) pair in the database sheet.
  bookedPairs.forEach(function (bp) {
    dbRecordBooking_({ ref: ref, date: bp.date, time: bp.time, program: body.program, name: body.name, email: body.email, phone: body.phone, party: party, amount: amount, coach: (body.coachName || body.coach || ''), concession: concSummary_(body), roster: roster.join('; '), eventId: bp.eventId || '' });
  });

  var emailed = false;
  try {
    emailed = sendReceipt_({
      email: (body.email || '').trim(), name: body.name, program: body.program,
      dateStr: dates[0].date, times: allLabels, party: party, amount: amount, ref: ref,
      subtotal: subtotal, discountRate: discRate, discountAmount: subtotal - amount,
      roster: roster
    });
  } catch (mailErr) {
    emailed = false;
  }

  return json_({ ok: true, ref: ref, bookedPairs: bookedPairs, eventIds: eventIds, party: party, amount: amount, emailed: emailed });
}

function cancel_(body) {
  var cal = getCalendar_();
  var ev = null;

  // Primary: cancel by the event id the website stored at booking time.
  if (body.eventId) {
    try { ev = cal.getEventById(body.eventId); } catch (e1) { ev = null; }
  }
  // Fallback: find the event by date + time (+ optional ref/name) if no id.
  if (!ev && body.date && body.time) {
    var parts = body.date.split('-');
    var dayStart = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 0, 0, 0);
    var dayEnd   = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 23, 59, 59);
    var evs = cal.getEvents(dayStart, dayEnd);
    for (var i = 0; i < evs.length; i++) {
      var lbl = fmtLabel_(parseInt(Utilities.formatDate(evs[i].getStartTime(), TIMEZONE, 'H'), 10));
      var desc = evs[i].getDescription() || '';
      var refOk = !body.ref || desc.indexOf(body.ref) !== -1;
      var nameOk = !body.name || (evs[i].getTitle() || '').indexOf(body.name) !== -1;
      if (lbl === body.time && refOk && nameOk) { ev = evs[i]; break; }
    }
  }

  if (!ev) return json_({ ok: false, reason: 'not found' });

  // Pull the customer's email from the event so we can notify even if the
  // website didn't send one.
  var desc = ev.getDescription() || '';
  var emailMatch = desc.match(/Email:\s*([^\n\r]+)/i);
  var refMatch   = desc.match(/Ref:\s*([^\n\r]+)/i);
  var progMatch  = desc.match(/Program:\s*([^\n\r]+)/i);
  var custEmail  = (body.email || (emailMatch ? emailMatch[1].trim() : '')).trim();
  var ref        = body.ref || (refMatch ? refMatch[1].trim() : '');
  var program    = progMatch ? progMatch[1].trim() : '';
  var time       = body.time || fmtLabel_(parseInt(Utilities.formatDate(ev.getStartTime(), TIMEZONE, 'H'), 10));
  var dateStr    = body.date || Utilities.formatDate(ev.getStartTime(), TIMEZONE, 'yyyy-MM-dd');

  var evId = ev.getId();
  ev.deleteEvent();

  // Record the cancellation (who + when) and mark the booking row cancelled.
  dbMarkCancelled_(evId, ref, dateStr, time);
  dbAppend_('cancels', [nowStr_(), ref, dateStr, time, program, body.name || '', custEmail, (body.by || 'customer'), evId]);

  var emailed = false;
  if (body.notify !== false && custEmail) {
    try {
      emailed = sendCancellation_({ email: custEmail, name: body.name, program: program, dateStr: dateStr, time: time, ref: ref });
    } catch (mailErr) { emailed = false; }
  }

  return json_({ ok: true, deleted: true, emailed: emailed });
}
