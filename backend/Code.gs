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
var EMAIL_LOGO_URL  = 'https://michaelvincentcabral06.github.io/Pasig-Greenpark-Archery-Camp-Web-Site/assets/email-logo.png';
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
  { id: 'michael', name: 'Michael Cabral', first: 'Michael', role: 'Head Coach',          pass: 'michael2026' },
  { id: 'james',   name: 'James Victoria', first: 'James',   role: 'Youth Program Lead',   pass: 'james2026' },
  { id: 'rotsen',  name: 'Rotsen Vinluan', first: 'Rotsen',  role: 'Range Coach',          pass: 'rotsen2026' }
];

// The live coach roster is stored in Script Properties so the admin can add/edit/remove
// coaches from the website (Coaches tab). It seeds from the COACHES constant above the
// first time it's read. Every coach lookup below goes through getCoaches_().
var COACHES_PROP_KEY = 'COACHES_JSON';
function getCoaches_() {
  var raw = PropertiesService.getScriptProperties().getProperty(COACHES_PROP_KEY);
  if (raw) { try { var arr = JSON.parse(raw); if (arr && arr.length) return arr; } catch (e) {} }
  return COACHES;
}
function saveCoaches_(list) {
  PropertiesService.getScriptProperties().setProperty(COACHES_PROP_KEY, JSON.stringify(list || []));
}
function coachPhotoMap_() {
  var map = {};
  try {
    var sh = dbSheet_('coachPhotos');
    var data = sh.getDataRange().getValues();
    for (var r = 1; r < data.length; r++) { var id = String(data[r][0] || ''); if (id) map[id] = String(data[r][1] || ''); }
  } catch (e) {}
  return map;
}
function setCoachPhotoCell_(id, dataUrl) {
  var sh = dbSheet_('coachPhotos');
  var data = sh.getDataRange().getValues();
  var rowIndex = -1;
  for (var r = 1; r < data.length; r++) { if (String(data[r][0] || '') === String(id)) { rowIndex = r + 1; break; } }
  if (!dataUrl) { if (rowIndex > 0) sh.deleteRow(rowIndex); return; }
  if (rowIndex > 0) { sh.getRange(rowIndex, 2).setValue(dataUrl); }
  else { sh.appendRow([id, dataUrl]); }
}
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
  cancels:  { name: 'Cancellations', headers: ['Cancelled At','Ref','Date','Time','Program','Name','Email','Cancelled By','Event ID'] },
  activity:    { name: 'Activity',      headers: ['At','Ref','Action','Detail','Name','Email','Actor'] },
  coachPhotos: { name: 'CoachPhotos',  headers: ['Id','Photo'] }
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
// Append one entry to the Activity log (the admin Bookings tab shows this).
function dbLog_(ref, action, detail, name, email, actor) { dbAppend_('activity', [nowStr_(), ref || '', action || '', detail || '', name || '', email || '', actor || '']); }
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

// ---------- CONTENT STORE (db-v15) ----------
// Admin-managed content (packages, rates, capacity, schedule) saved server-side
// so every device and every customer reads the same values.
function cap_() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty('CONTENT');
    if (raw) { var c = JSON.parse(raw); var n = Number(c && c.capacity); if (n > 0) return n; }
  } catch (e) {}
  return CAPACITY;
}
function getContent_() {
  var raw = PropertiesService.getScriptProperties().getProperty('CONTENT');
  var c = {}; if (raw) { try { c = JSON.parse(raw); } catch (e) { c = {}; } }
  return json_({ content: c });
}
function setContent_(body) {
  var c = body.content || {};
  PropertiesService.getScriptProperties().setProperty('CONTENT', JSON.stringify(c));
  return json_({ ok: true });
}

// ---------- EMAIL GROUPS (db-v14) ----------
function aliasKey_(email){ return 'aliases:' + (email || '').trim().toLowerCase(); }
function groupFor_(email){
  email = (email || '').trim().toLowerCase();
  if (!email) return [];
  try { var raw = PropertiesService.getScriptProperties().getProperty(aliasKey_(email));
    if (raw) { var a = JSON.parse(raw); if (a && a.length) return a; } } catch (e) {}
  return [email];
}
function mergeEmails_(a, b){
  a = (a || '').trim().toLowerCase(); b = (b || '').trim().toLowerCase();
  if (!a || !b) return groupFor_(a || b);
  var set = {}, out = [];
  groupFor_(a).concat(groupFor_(b)).forEach(function (e) { e = (e || '').trim().toLowerCase(); if (e && !set[e]) { set[e] = 1; out.push(e); } });
  var props = PropertiesService.getScriptProperties();
  out.forEach(function (m) { props.setProperty(aliasKey_(m), JSON.stringify(out)); });
  return out;
}
function emailForRef_(ref){
  ref = (ref || '').trim().toUpperCase();
  if (!ref) return '';
  try { var sh = dbSheet_('bookings'); var data = sh.getDataRange().getValues(); var h = data[0];
    var refCol = h.indexOf('Ref'), emCol = h.indexOf('Email');
    if (refCol < 0 || emCol < 0) return '';
    for (var r = 1; r < data.length; r++) { if (String(data[r][refCol] || '').trim().toUpperCase() === ref) return String(data[r][emCol] || '').trim().toLowerCase(); }
  } catch (e) {}
  return '';
}

// RUN THIS ONCE from the editor to create the database sheet and print its link.
function setupDatabase() {
  var ss = getDb_();
  dbSheet_('bookings'); dbSheet_('passes'); dbSheet_('cancels');
  Logger.log('✅ Database ready. Open/bookmark it here:\n' + ss.getUrl());
}

// RUN FROM THE EDITOR to wipe Bookings + Cancellations history (keeps Passes/plans).
// Pick "clearBookingHistory" in the function dropdown → Run. Headers are preserved.
function clearBookingHistory() {
  ['bookings', 'cancels'].forEach(function (key) {
    var sh = dbSheet_(key);
    var last = sh.getLastRow();
    if (last > 1) sh.getRange(2, 1, last - 1, sh.getLastColumn()).clearContent();
  });
  Logger.log('✅ Cleared all Bookings + Cancellations history (Passes/plans kept).');
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
// Split an integer total into n parts that sum exactly to total (remainder on the last part).
function splitAmount_(total, n) {
  total = Math.round(Number(total) || 0); n = Math.max(1, n | 0);
  var base = Math.floor(total / n), out = [];
  for (var i = 0; i < n - 1; i++) out.push(base);
  out.push(total - base * (n - 1));
  return out;
}
// Always return exactly `party` archer slots. Pad from body.archers; fill missing with "Archer k".
function archerListFor_(body, party) {
  var src = (body.archers && body.archers.length) ? body.archers : [];
  var out = [];
  for (var i = 0; i < party; i++) {
    var a = src[i] || {};
    out.push({ name: (a && a.name) ? String(a.name) : ('Archer ' + (i + 1)),
               dob: (a && a.dob) ? String(a.dob) : '', age: (a && a.age != null && a.age !== '') ? a.age : '' });
  }
  return out;
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
  var list = getCoaches_();
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
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
    getCoaches_().forEach(function (c) {
      coachHoursFor_(c.id, dateStr, dow).forEach(function (h) { set[h] = true; });
    });
    return Object.keys(set).map(function (h) { return parseInt(h, 10); }).sort(function (a, b) { return a - b; });
  }
  return OPEN_HOURS[dow] || [];
}

function buildSlots_(dateStr, coachId) {
  var cap = cap_();
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
    var booked = Math.min(cap, counts[h] || 0);
    return { time: fmtLabel_(h), hour: h, booked: booked, left: cap - booked };
  });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------- AUTH HELPERS ----------
function adminSecret_() {
  return PropertiesService.getScriptProperties().getProperty('ADMIN_SECRET') || '';
}
function assertAdmin_(body) {
  var s = adminSecret_();
  return !!s && String((body && body.secret) || '') === s;
}
function unauthorized_() { return json_({ ok: false, reason: 'unauthorized' }); }
function coachPassOk_(coachId, pass) {
  var c = coachById_(coachId);
  return !!c && c.pass === String(pass || '');
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

// Fetch the small email logo (cached ~6h) as a Blob for inline embedding. Null-safe:
// any failure returns null so the email still sends, just without the logo.
function logoBlob_() {
  try {
    var cache = CacheService.getScriptCache();
    var b64 = cache ? cache.get('emailLogoB64') : null;
    if (!b64) {
      var resp = UrlFetchApp.fetch(EMAIL_LOGO_URL, { muteHttpExceptions: true });
      if (resp.getResponseCode() !== 200) return null;
      b64 = Utilities.base64Encode(resp.getBlob().getBytes());
      if (cache && b64.length < 95000) cache.put('emailLogoB64', b64, 21600);
    }
    return Utilities.newBlob(Utilities.base64Decode(b64), 'image/png', 'logo');
  } catch (e) { return null; }
}

// One branded wrapper for every transactional email: header band (logo + name),
// body card (title in `accent` + innerHtml), footer (where/contact/business name).
function emailShell_(title, accent, innerHtml, hasLogo) {
  var logoCell = hasLogo
    ? '<td style="padding-right:12px;vertical-align:middle;"><img src="cid:logo" width="40" height="40" alt="" style="display:block;border-radius:8px;" /></td>'
    : '';
  return '<div style="background:#eef1e6;padding:24px 0;font-family:Arial,Helvetica,sans-serif;">'
    + '<div style="max-width:520px;margin:0 auto;background:#fffdf6;border-radius:14px;overflow:hidden;border:1px solid rgba(36,66,50,0.12);">'
    +   '<div style="background:#244232;padding:18px 22px;">'
    +     '<table role="presentation" cellpadding="0" cellspacing="0"><tr>' + logoCell
    +       '<td style="vertical-align:middle;color:#f4efe4;font-size:16px;font-weight:bold;">' + escapeHtml_(BUSINESS_NAME) + '</td>'
    +     '</tr></table>'
    +   '</div>'
    +   '<div style="padding:24px 22px;color:#1b2a1f;">'
    +     '<h2 style="margin:0 0 8px;font-size:20px;color:' + accent + ';">' + escapeHtml_(title) + '</h2>'
    +     innerHtml
    +   '</div>'
    +   '<div style="padding:18px 22px;border-top:1px solid rgba(36,66,50,0.1);font-size:12.5px;color:#56664f;line-height:1.6;">'
    +     '<strong>Where</strong><br>' + escapeHtml_(RANGE_ADDRESS) + '<br>' + escapeHtml_(CONTACT_NUMBER) + '<br><br>'
    +     escapeHtml_(RESCHEDULE_NOTE) + '<br><br>'
    +     '<strong style="color:#244232;">' + escapeHtml_(BUSINESS_NAME) + '</strong>'
    +   '</div>'
    + '</div></div>';
}

// o: { to, subject, plainText, title, accent, innerHtml }
function sendBranded_(o) {
  if (!o || !o.to) return false;
  var blob = logoBlob_();
  var html = emailShell_(o.title || BUSINESS_NAME, o.accent || '#244232', o.innerHtml || '', !!blob);
  var opts = { to: o.to, subject: o.subject, body: o.plainText || '', htmlBody: html, name: BUSINESS_NAME };
  if (blob) opts.inlineImages = { logo: blob };
  MailApp.sendEmail(opts);
  return true;
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
  var innerHtml = '<p style="color:#56664f;margin:0 0 18px;">Thanks, ' + escapeHtml_(o.name || 'there') + ' — your spot is reserved.</p>'
    + '<table style="border-collapse:collapse;width:100%;font-size:14px;">'
    + receiptRow_('Reference', o.ref)
    + receiptRow_('Program', o.program || '')
    + receiptRow_('Date', when)
    + receiptRow_('Time(s)', timeList)
    + receiptRow_('Archers', partyTxt)
    + ((o.roster && o.roster.length) ? receiptRow_('Who’s shooting', o.roster.join('; ')) : '')
    + discHtml
    + '<tr><td style="padding:10px 0;border-top:2px solid #244232;font-weight:bold;">Total to pay at the range</td>'
    + '<td style="padding:10px 0;border-top:2px solid #244232;font-weight:bold;text-align:right;color:#244232;font-size:18px;">' + peso_(o.amount) + '</td></tr>'
    + (hasDisc ? '<tr><td colspan="2" style="padding:6px 0 0;text-align:right;color:#3c6b48;font-weight:bold;font-size:13px;">You saved ' + peso_(o.discountAmount) + ' with the group discount</td></tr>' : '')
    + '</table>';
  return sendBranded_({ to: o.email, subject: subject, plainText: body, title: 'Booking confirmed', accent: '#3c6b48', innerHtml: innerHtml });
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
  var rows = (o.ref ? receiptRow_('Reference', o.ref) : '')
    + receiptRow_('Program', o.program || '')
    + receiptRow_('Date', when)
    + (o.time ? receiptRow_('Time', o.time) : '');
  return sendBranded_({ to: o.email, subject: subject,
    plainText: body, title: 'Booking cancelled', accent: '#b4512f',
    innerHtml: '<p style="color:#56664f;margin:0 0 16px;">Hi ' + escapeHtml_(o.name || 'there') + ', your session has been cancelled.</p>'
      + '<table style="border-collapse:collapse;width:100%;font-size:14px;">' + rows + '</table>' });
}
// Sent when a single session booking is moved to a new date/time (self-service or admin).
function sendReschedule_(o) {
  // o: { email, name, program, oldDate, oldTime, newDate, newTime, ref }
  if (!o.email) return false;
  var subject = BUSINESS_NAME + ' — Booking rescheduled' + (o.ref ? ' (' + o.ref + ')' : '');
  var body = [
    'Hi ' + (o.name || 'there') + ',',
    '',
    'Your archery session has been rescheduled:',
    '',
    (o.ref ? 'Reference : ' + o.ref : ''),
    'Program   : ' + (o.program || ''),
    'Was       : ' + prettyDate_(o.oldDate) + (o.oldTime ? ' · ' + o.oldTime : ''),
    'Now       : ' + prettyDate_(o.newDate) + (o.newTime ? ' · ' + o.newTime : ''),
    '',
    'If you didn\'t request this or need another change, just reply or text/call ' + CONTACT_NUMBER + '.',
    '',
    'See you at the range!',
    BUSINESS_NAME
  ].filter(function (l) { return l !== ''; }).join('\n');
  var rows = (o.ref ? receiptRow_('Reference', o.ref) : '')
    + receiptRow_('Program', o.program || '')
    + receiptRow_('Was', prettyDate_(o.oldDate) + (o.oldTime ? ' · ' + o.oldTime : ''))
    + receiptRow_('Now', prettyDate_(o.newDate) + (o.newTime ? ' · ' + o.newTime : ''));
  return sendBranded_({ to: o.email, subject: subject,
    plainText: body, title: 'Booking rescheduled', accent: '#8a6a1f',
    innerHtml: '<p style="color:#56664f;margin:0 0 16px;">Hi ' + escapeHtml_(o.name || 'there') + ', your session has been rescheduled.</p>'
      + '<table style="border-collapse:collapse;width:100%;font-size:14px;">' + rows + '</table>' });
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
  var innerHtml = '<p style="color:#56664f;margin:0 0 18px;">Thanks, ' + escapeHtml_(who) + ' — your pass is ready.</p>'
    + '<table style="border-collapse:collapse;width:100%;font-size:14px;">'
    + (o.ref ? receiptRow_('Reference', o.ref) : '')
    + receiptRow_('Pass', o.plan || '')
    + receiptRow_('Holder', o.holder || '')
    + (totalTxt ? ('<tr><td style="padding:10px 0;border-top:2px solid #244232;font-weight:bold;">Total to pay at the range</td><td style="padding:10px 0;border-top:2px solid #244232;font-weight:bold;text-align:right;color:#244232;font-size:18px;">' + escapeHtml_(totalTxt) + '</td></tr>') : '')
    + '</table>'
    + '<p style="font-size:13px;color:#56664f;margin:18px 0 4px;">We’ll assign your coach and schedule your sessions, then email you the dates. Track it all in <strong>My Bookings</strong>.</p>';
  return sendBranded_({ to: o.email, subject: subject, plainText: lines.join('\n'), title: 'Pass confirmed', accent: '#3c6b48', innerHtml: innerHtml });
}
// Notify the customer about their pass's schedule and/or assigned coach.
// o.mode controls the wording:
//   'scheduled'    → first-time schedule confirmation (lists all dates)
//   'rescheduled'  → schedule changed (lists the full updated set of dates)
//   'coachAssigned'→ a coach was assigned (no coach before): "Your assigned coach is X"
//   'coachChanged' → the coach was swapped: "Your assigned coach is now X (previously Y)"
// Schedule modes need ≥1 session; coach modes always send (dates listed if any).
function sendPlanSchedule_(o) {
  if (!o.email) return false;
  var who = o.holder || 'there';
  var mode = o.mode || 'scheduled';
  var isCoach = (mode === 'coachAssigned' || mode === 'coachChanged');
  var sess = (o.sessions || []).slice().sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); });
  if (!sess.length && !isCoach) return false;

  var headline, introTxt, subjTail;
  if (mode === 'coachAssigned') {
    subjTail = ' — Your coach is assigned';
    headline = 'Your coach is assigned';
    introTxt = 'Your assigned coach is ' + (o.coachName || 'your coach') + '.';
  } else if (mode === 'coachChanged') {
    subjTail = ' — Your coach has changed';
    headline = 'Your coach has changed';
    introTxt = 'Your assigned coach is now ' + (o.coachName || 'your coach')
             + (o.prevCoachName ? (' (previously ' + o.prevCoachName + ')') : '') + '.';
  } else if (mode === 'rescheduled') {
    subjTail = ' — Your sessions have been rescheduled';
    headline = 'Your sessions have been rescheduled';
    introTxt = 'Your ' + (o.plan || 'pass') + ' booking has been updated. Here is your current schedule:';
  } else {
    subjTail = ' — Your sessions are scheduled';
    headline = 'Your sessions are scheduled';
    introTxt = 'Good news — your ' + (o.plan || 'pass') + ' sessions are scheduled:';
  }
  // For coach modes, follow the coach line with the dates (or a "to follow" note).
  var listIntro = isCoach ? (sess.length ? 'Your scheduled sessions:' : 'We’ll email your session dates as soon as they’re set.') : '';

  var rows = sess.map(function (s) { return '  • ' + prettyDate_(s.date) + ' · ' + s.time; });
  var subject = BUSINESS_NAME + subjTail + (o.ref ? ' (' + o.ref + ')' : '');
  var lines = [ 'Hi ' + who + ',', '', introTxt ];
  if (listIntro) { lines.push(''); lines.push(listIntro); }
  else if (!isCoach) { lines.push(''); }
  lines = lines.concat(sess.length ? rows : []).concat([
    '',
    (!isCoach && o.coachName ? ('Coach: ' + o.coachName) : ''),
    (o.ref ? ('Reference: ' + o.ref) : ''),
    '',
    'Need to change something? Reply to this email or text/call ' + CONTACT_NUMBER + '.',
    '',
    BUSINESS_NAME
  ]).filter(function (l) { return l !== ''; });

  var htmlRows = sess.map(function (s) { return '<tr><td style="padding:6px 0;color:#244232;font-weight:bold;">' + escapeHtml_(prettyDate_(s.date)) + '</td><td style="padding:6px 0;text-align:right;">' + escapeHtml_(s.time) + '</td></tr>'; }).join('');
  var innerHtml = '<p style="color:#56664f;margin:0 0 14px;">Hi ' + escapeHtml_(who) + ' — ' + escapeHtml_(introTxt) + '</p>'
    + (listIntro ? ('<p style="font-size:13px;color:#56664f;margin:0 0 6px;">' + escapeHtml_(listIntro) + '</p>') : '')
    + (sess.length ? ('<table style="border-collapse:collapse;width:100%;font-size:14px;">' + htmlRows + '</table>') : '')
    + (isCoach ? '' : (o.coachName ? ('<p style="font-size:13px;color:#56664f;margin:16px 0 0;"><strong>Coach:</strong> ' + escapeHtml_(o.coachName) + '</p>') : ''))
    + (o.ref ? ('<p style="font-size:12.5px;color:#8a9579;margin:6px 0 0;">Reference: ' + escapeHtml_(o.ref) + '</p>') : '')
    + '<p style="font-size:13px;color:#56664f;margin:16px 0 0;">Need to change something? Reply here or text/call ' + escapeHtml_(CONTACT_NUMBER) + '.</p>';
  return sendBranded_({ to: o.email, subject: subject, plainText: lines.join('\n'), title: headline, accent: '#3c6b48', innerHtml: innerHtml });
}
// Sent ONCE when a whole pass is cancelled (its sessions are removed silently).
function sendPlanCancellation_(o) {
  if (!o.email) return false;
  var who = o.holder || 'there';
  var sess = (o.sessions || []).slice().sort(function (a, b) { return (a.date + a.time).localeCompare(b.date + b.time); });
  var subject = BUSINESS_NAME + ' — Pass cancelled' + (o.ref ? ' (' + o.ref + ')' : '');
  var lines = [
    'Hi ' + who + ',',
    '',
    'Your pass has been cancelled:',
    '',
    (o.ref ? 'Reference : ' + o.ref : ''),
    'Pass      : ' + (o.plan || '')
  ];
  if (sess.length) {
    lines.push('');
    lines.push('These scheduled sessions were also cancelled:');
    sess.forEach(function (s) { lines.push('  • ' + prettyDate_(s.date) + ' · ' + s.time); });
  }
  lines = lines.concat(['', 'If this was a mistake or you’d like to rebook, just reply or text/call ' + CONTACT_NUMBER + '.', '', BUSINESS_NAME]).filter(function (l) { return l !== ''; });
  var htmlRows = sess.map(function (s) { return '<tr><td style="padding:5px 0;color:#56664f;">' + escapeHtml_(prettyDate_(s.date)) + '</td><td style="padding:5px 0;text-align:right;color:#56664f;">' + escapeHtml_(s.time) + '</td></tr>'; }).join('');
  var innerHtml = '<p style="color:#56664f;margin:0 0 14px;">Hi ' + escapeHtml_(who) + ', your ' + escapeHtml_(o.plan || 'pass') + (o.ref ? ' (' + escapeHtml_(o.ref) + ')' : '') + ' has been cancelled.</p>'
    + (sess.length ? ('<p style="font-size:13px;color:#56664f;margin:0 0 6px;">These scheduled sessions were also cancelled:</p><table style="border-collapse:collapse;width:100%;font-size:14px;">' + htmlRows + '</table>') : '')
    + '<p style="font-size:13px;color:#56664f;margin:16px 0 0;">If this was a mistake or you’d like to rebook, reply here or text/call ' + escapeHtml_(CONTACT_NUMBER) + '.</p>';
  return sendBranded_({ to: o.email, subject: subject, plainText: lines.join('\n'), title: 'Pass cancelled', accent: '#b4512f', innerHtml: innerHtml });
}

// ---------- STAFF LOGIN ----------
function staffLogin_(body) {
  var s = adminSecret_();
  if (!s) return json_({ ok: false, reason: 'not-configured' });
  var code = String((body && body.code) || '');
  if (code && code === s) return json_({ ok: true, role: 'admin' });
  var list = getCoaches_();
  for (var i = 0; i < list.length; i++) {
    if (code && list[i].pass && code === list[i].pass) {
      return json_({ ok: true, role: 'coach', id: list[i].id, name: list[i].name });
    }
  }
  return json_({ ok: false, reason: 'bad-credentials' });
}

// ---------- AVAILABILITY (GET) ----------
function doGet(e) {
  try {
    var action = (e.parameter.action || 'availability');
    if (action === 'availability') {
      var date = e.parameter.date;
      if (!date) return json_({ error: 'Missing date' });
      return json_({ date: date, capacity: cap_(), slots: buildSlots_(date, e.parameter.coach) });
    }
    if (action === 'lookup') {
      return lookup_(e.parameter.email, e.parameter.ref);
    }
    if (action === 'plans') {
      var em = (e.parameter.email || '').trim();
      if (!em) return json_({ ok: false, reason: 'unauthorized' });
      return listPlans_(em);
    }
    if (action === 'coaches') {
      return listCoaches_();
    }
    if (action === 'content') return getContent_();
    if (action === 'version') {
      // Lets the website (and support) confirm which backend is actually deployed.
      return json_({ version: 'db-v24', auth: true, noDoubleBook: true, rescheduleNotify: true, database: true, cancelLog: true, planEmails: true, singleCancelEmail: true, dashboard: true, coachAvail: true, clearHistory: true, approveUpsert: true, bookingsFromCalendar: true, assignCoach: true, activityLog: true, coachCrud: true, clearAll: true, rescheduleEmail: true, coachEmail: true, fullScheduleEmail: true, refLookup: true, emailMerge: true, contentStore: true, reschedule: true, activityActor: true, coachProfiles: true, brandedEmail: true, editableDiscounts: true, timeCellFix: true });
    }
    return json_({ error: 'Unknown action' });
  } catch (err) {
    return json_({ error: String(err) });
  }
}

// Find a customer's sessions by email (+ optional booking reference) for the My Bookings page.
// Scans calendar events in a window and reads the structured description we write at booking time.
// db-v14: accepts email OR ref (ref-only resolves the email via the Bookings sheet);
// unions events across the whole email group; ref no longer filters results.
function lookup_(email, ref) {
  email = (email || '').trim().toLowerCase();
  ref = (ref || '').trim().toUpperCase();
  if (!email && ref) email = emailForRef_(ref);   // ref-only login
  if (!email) return json_({ bookings: [], name: '', emails: [], primary: '' });
  var group = groupFor_(email);
  var inGroup = {}; group.forEach(function (e) { inGroup[e] = 1; });
  var cal = getCalendar_();
  var from = new Date(); from.setDate(from.getDate() - 120);
  var to = new Date(); to.setDate(to.getDate() + 240);
  var events = cal.getEvents(from, to);
  var out = [], name = '';
  function field(d, key) { var m = new RegExp(key + ':\\s*(.+)', 'i').exec(d); return m ? m[1].trim() : ''; }
  var groups = {};
  events.forEach(function (ev) {
    var d = ev.getDescription() || '';
    var em = field(d, 'Email').toLowerCase();
    if (!inGroup[em]) return;
    if (/\(plan\)\s*$/i.test(field(d, 'Program'))) return;
    var ref = field(d, 'Ref').toUpperCase();
    var st = ev.getStartTime();
    var dateStr = Utilities.formatDate(st, TIMEZONE, 'yyyy-MM-dd');
    var timeLbl = fmtLabel_(parseInt(Utilities.formatDate(st, TIMEZONE, 'H'), 10));
    var seats = parseInt(field(d, 'Archers') || '1', 10) || 1;
    var amt = parseInt(field(d, 'Amount') || '0', 10) || 0;
    var key = ref + '|' + dateStr + '|' + timeLbl;
    var nm = field(d, 'Name'); if (nm) name = nm;
    if (!groups[key]) {
      var conc = field(d, 'Concession');
      groups[key] = { name: nm, phone: field(d, 'Mobile'), email: em, program: field(d, 'Program'),
        date: dateStr, time: timeLbl, party: 0, amount: 0,
        coachName: field(d, 'Coach'), ref: ref,
        eventId: ev.getId(), concession: (conc ? { label: conc, pasig: /Pasig/i.test(conc), local: /Greenpark|RHS/i.test(conc), pac: /PAC/i.test(conc) } : null),
        ts: st.getTime(), __remote: true };
    }
    groups[key].party += seats;
    groups[key].amount += amt;
  });
  for (var k in groups) out.push(groups[k]);
  return json_({ bookings: out, name: name, emails: group, primary: email });
}

// Compact concession summary written into the calendar event so lookup_ can read it back.
function concLine_(body) {
  var c = body.concession;
  if (!c) return '';
  if (c.items && c.items.length) {
    var parts = c.items.map(function (it) { return (it.name || '') + (it.proof ? (' (' + it.proof + ')') : ''); });
    return parts.length ? ('\nConcession: ' + parts.join(', ')) : '';
  }
  // legacy shape (pre-Phase-2 requests)
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
    // --- Public / customer actions (no admin secret required) ---
    if (body.action === 'staffLogin')    return staffLogin_(body);
    if (body.action === 'cancel')        return cancel_(body);
    if (body.action === 'reschedule')    return reschedule_(body);
    if (body.action === 'book')          return book_(body);
    if (body.action === 'coachLogin')    return coachLogin_(body);
    if (body.action === 'setCoachAvail') return setCoachAvail_(body);
    // --- Gated sensitive reads (moved to POST) ---
    if (body.action === 'bookings')      return assertAdmin_(body) ? listBookings_()      : unauthorized_();
    if (body.action === 'activity')      return assertAdmin_(body) ? listActivity_()      : unauthorized_();
    if (body.action === 'cancellations') return assertAdmin_(body) ? listCancellations_() : unauthorized_();
    if (body.action === 'settings')      return assertAdmin_(body) ? getSettings_()       : unauthorized_();
    if (body.action === 'plans')         return assertAdmin_(body) ? listPlans_('')       : unauthorized_();
    if (body.action === 'coachavail')    return (assertAdmin_(body) || coachPassOk_(body.coach, body.pass)) ? listCoachAvail_(body.coach) : unauthorized_();
    // --- Admin writes (all gated) ---
    if (body.action === 'setContent')        return assertAdmin_(body) ? setContent_(body)        : unauthorized_();
    if (body.action === 'clearAll')          return assertAdmin_(body) ? clearAll_(body)          : unauthorized_();
    if (body.action === 'savePlan')          return assertAdmin_(body) ? savePlan_(body)          : unauthorized_();
    if (body.action === 'removePlan')        return assertAdmin_(body) ? removePlan_(body)        : unauthorized_();
    if (body.action === 'setSplit')          return assertAdmin_(body) ? setSplit_(body)          : unauthorized_();
    if (body.action === 'setBookingStatus')  return assertAdmin_(body) ? setBookingStatus_(body)  : unauthorized_();
    if (body.action === 'approveSession')    return assertAdmin_(body) ? approveSession_(body)    : unauthorized_();
    if (body.action === 'setBookingCoach')   return assertAdmin_(body) ? setBookingCoach_(body)   : unauthorized_();
    if (body.action === 'logAction')         return assertAdmin_(body) ? logAction_(body)         : unauthorized_();
    if (body.action === 'planScheduleEmail') return assertAdmin_(body) ? planScheduleEmail_(body) : unauthorized_();
    if (body.action === 'planCancelEmail')   return assertAdmin_(body) ? planCancelEmail_(body)   : unauthorized_();
    if (body.action === 'addCoach')          return assertAdmin_(body) ? addCoach_(body)          : unauthorized_();
    if (body.action === 'updateCoach')       return assertAdmin_(body) ? updateCoach_(body)       : unauthorized_();
    if (body.action === 'deleteCoach')       return assertAdmin_(body) ? deleteCoach_(body)       : unauthorized_();
    if (body.action === 'setCoachProfile')   return assertAdmin_(body) ? setCoachProfile_(body)   : unauthorized_();
    if (body.action === 'addEmailAlias')     return assertAdmin_(body) ? addEmailAlias_(body)     : unauthorized_();
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
  if (!c || !c.pass || c.pass !== (body.pass || '')) return json_({ ok: false, reason: 'bad credentials' });
  return json_({ ok: true, id: c.id, name: c.name });
}
function setCoachAvail_(body) {
  var c = coachById_(body.coach);
  if (!c || !c.pass || c.pass !== (body.pass || '')) return json_({ ok: false, reason: 'bad credentials' });
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
  var plan;
  if (raw) { try { plan = JSON.parse(raw); } catch (e) { plan = null; } }
  if (!plan) { plan = { holder: body.holder || '', name: body.plan || '', ref: body.ref || '', coach: '', sessions: [] }; }
  var coachName = body.coachName || '';
  if (!coachName && plan.coach) { var c = coachById_(plan.coach); coachName = c ? c.name : ''; }
  // Prefer the sessions sent by the website (its live copy) so the email always lists the
  // COMPLETE set — reading them back from the stored plan can race a just-saved update.
  var sessions = (body.sessions && body.sessions.length != null) ? body.sessions : (plan.sessions || []);
  // Back-compat: old callers passed only `updated` (true → reschedule).
  var mode = body.mode || (body.updated ? 'rescheduled' : 'scheduled');
  var emailed = false;
  try {
    emailed = sendPlanSchedule_({
      email: email, holder: plan.holder, plan: plan.name, ref: plan.ref || '',
      sessions: sessions, coachName: coachName, prevCoachName: body.prevCoachName || '', mode: mode
    });
  } catch (e) {}
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

// Activity log for the admin Bookings tab (newest first): every approve/cancel/coach change.
function listActivity_() {
  try {
    var sh = dbSheet_('activity');
    var data = sh.getDataRange().getValues();
    var out = [];
    for (var r = 1; r < data.length; r++) {
      var row = data[r];
      out.push({ at: String(row[0] || ''), ref: String(row[1] || ''), action: String(row[2] || ''), detail: String(row[3] || ''), name: String(row[4] || ''), email: String(row[5] || ''), actor: String(row[6] || '') });
    }
    out.reverse();
    return json_({ activity: out });
  } catch (e) { return json_({ activity: [], error: String(e) }); }
}
// Record an admin action (approve / cancel / coach change / schedule) from the website.
function logAction_(body) {
  dbLog_(body.ref || '', body.label || '', body.detail || '', body.name || '', body.email || '', body.actor || '');
  return json_({ ok: true });
}
// Email a pass-cancelled notice WITHOUT deleting the plan (the plan stays, marked cancelled).
function planCancelEmail_(body) {
  var email = (body.email || '').trim().toLowerCase();
  if (!email || body.ts == null) return json_({ ok: false });
  var raw = PropertiesService.getScriptProperties().getProperty(planKey_(email, body.ts));
  var plan = null; if (raw) { try { plan = JSON.parse(raw); } catch (e) {} }
  if (!plan) return json_({ ok: false, reason: 'not found' });
  var emailed = false;
  try { emailed = sendPlanCancellation_({ email: email, holder: plan.holder, plan: plan.name, ref: plan.ref || '', sessions: plan.sessions || [] }); } catch (e) {}
  return json_({ ok: true, emailed: emailed });
}

// Coerce a sheet cell that may be a Date back to 'yyyy-MM-dd'.
function asDateStr_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TIMEZONE, 'yyyy-MM-dd');
  return String(v || '');
}
// Time column may be auto-coerced by Sheets into a time-typed cell (a Date at the
// 1899-12-30 epoch). Format Date cells as a clean "7:00 PM" label; pass text through.
function asTimeStr_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TIMEZONE, 'h:mm a');
  return String(v || '');
}
// All bookings for the admin dashboard + bookings tab. The CALENDAR is the source of
// truth for live sessions (exactly what My Bookings shows); the sheet overlays status
// (approved / cancelled) and amount. This keeps the admin list in sync with My Bookings.
function listBookings_() {
  try {
    // 1) Read the sheet (status, amount, cancelled records) and index by event id.
    var sheetRows = [], sheetByEvent = {};
    try {
      var sh = dbSheet_('bookings');
      var data = sh.getDataRange().getValues();
      var h = data[0]; var ix = {}; h.forEach(function (n, i) { ix[n] = i; });
      for (var r = 1; r < data.length; r++) {
        var row = data[r];
        var rec = {
          bookedAt: (row[ix['Booked At']] instanceof Date) ? Utilities.formatDate(row[ix['Booked At']], TIMEZONE, 'yyyy-MM-dd HH:mm') : String(row[ix['Booked At']] || ''),
          ref: String(row[ix['Ref']] || ''), status: String(row[ix['Status']] || 'booked'),
          date: asDateStr_(row[ix['Date']]), time: asTimeStr_(row[ix['Time']]),
          program: String(row[ix['Program']] || ''), name: String(row[ix['Name']] || ''),
          email: String(row[ix['Email']] || ''), phone: String(row[ix['Mobile']] || ''),
          archers: Number(row[ix['Archers']] || 0) || 0, amount: Number(row[ix['Amount']] || 0) || 0,
          coach: String(row[ix['Coach']] || ''), eventId: String(row[ix['Event ID']] || '')
        };
        sheetRows.push(rec);
        if (rec.eventId) sheetByEvent[rec.eventId] = rec;
      }
    } catch (e) {}

    var out = [], usedEvent = {};
    function field(d, key) { var m = new RegExp(key + ':\\s*(.+)', 'i').exec(d); return m ? m[1].trim() : ''; }
    function isPlan(p) { return /\(plan\)\s*$/i.test(p || ''); }

    // 2) Scan the calendar for every booking event (same window/source as My Bookings).
    //    Group by (ref, date, time) so N per-archer events for the same slot become ONE
    //    admin row with archers = N and amount = sum. Legacy single-event bookings pass
    //    through unchanged (they form a singleton group). Every contributing event id is
    //    marked usedEvent so step (3) does not re-append them.
    try {
      var cal = getCalendar_();
      var from = new Date(); from.setDate(from.getDate() - 180);
      var to = new Date(); to.setDate(to.getDate() + 365);
      var events = cal.getEvents(from, to);
      var byKey = {};
      events.forEach(function (ev) {
        var d = ev.getDescription() || '';
        var ref = field(d, 'Ref');
        if (d.indexOf('Booked via website') === -1 && !ref) return; // ignore non-booking events
        var id = ev.getId();
        var srow = sheetByEvent[id];
        var program = field(d, 'Program') || (srow ? srow.program : '');
        // Pending plan sessions live in the Plans tab; only surface them here once approved.
        if (isPlan(program) && !(srow && String(srow.status).toLowerCase() === 'approved')) return;
        // Mark EVERY contributing event as used so step (3) never double-appends.
        usedEvent[id] = true;
        var stt = ev.getStartTime();
        var dateStr = Utilities.formatDate(stt, TIMEZONE, 'yyyy-MM-dd');
        var timeLbl = fmtLabel_(parseInt(Utilities.formatDate(stt, TIMEZONE, 'H'), 10));
        var seats = parseInt(field(d, 'Archers') || '1', 10) || 1;
        var amt = srow ? srow.amount : (parseInt(field(d, 'Amount') || '0', 10) || 0);
        var key = (ref || (srow ? srow.ref : '')) + '|' + dateStr + '|' + timeLbl;
        if (!byKey[key]) {
          byKey[key] = {
            bookedAt: srow ? srow.bookedAt : '',
            ref: ref || (srow ? srow.ref : ''),
            status: srow ? srow.status : 'booked',
            date: dateStr,
            time: timeLbl,
            program: program,
            name: field(d, 'Name') || (srow ? srow.name : ''),
            email: field(d, 'Email') || (srow ? srow.email : ''),
            phone: field(d, 'Mobile') || (srow ? srow.phone : ''),
            archers: 0,
            amount: 0,
            coach: field(d, 'Coach') || (srow ? srow.coach : ''),
            eventId: id
          };
        }
        byKey[key].archers += seats;
        byKey[key].amount += amt;
      });
      for (var k in byKey) out.push(byKey[k]);
    } catch (e) {}

    // 3) Add sheet rows that aren't on the live calendar (cancelled events were deleted;
    // plus any approved/upserted rows without an event), skipping pending plan sessions.
    sheetRows.forEach(function (rec) {
      if (rec.eventId && usedEvent[rec.eventId]) return;
      var stl = String(rec.status).toLowerCase();
      if (isPlan(rec.program) && stl !== 'approved' && stl !== 'cancelled') return;
      out.push(rec);
    });

    return json_({ bookings: out });
  } catch (e) { return json_({ bookings: [], error: String(e) }); }
}

// ---------- SETTINGS: per-coach payment split (coach % / equipment % / range %) ----------
var DEFAULT_SPLIT = { coach: 80, equip: 10, range: 10 };
function splitKey_(id) { return 'split:' + id; }
function getSettings_() {
  var props = PropertiesService.getScriptProperties();
  var splits = {};
  var coaches = getCoaches_();
  coaches.forEach(function (c) {
    var raw = props.getProperty(splitKey_(c.id));
    var s = null; if (raw) { try { s = JSON.parse(raw); } catch (e) {} }
    splits[c.id] = s || { coach: DEFAULT_SPLIT.coach, equip: DEFAULT_SPLIT.equip, range: DEFAULT_SPLIT.range };
  });
  return json_({ splits: splits, defaultSplit: DEFAULT_SPLIT, coaches: coaches.map(function (c) { return { id: c.id, name: c.name }; }) });
}
// Every saved availability override for one coach, so the admin (or the coach on a
// new device) sees their real custom hours, not just the standard weekday template.
// Returns { coach, overrides: { 'YYYY-MM-DD': [startHours...] } }.
function listCoachAvail_(coachId) {
  var c = coachById_(coachId);
  if (!c) return json_({ overrides: {} });
  var props = PropertiesService.getScriptProperties().getProperties();
  var prefix = 'avail:' + coachId + ':';
  var out = {};
  for (var k in props) {
    if (k.indexOf(prefix) !== 0) continue;
    var date = k.slice(prefix.length);
    try { out[date] = JSON.parse(props[k]) || []; } catch (e) { out[date] = []; }
  }
  return json_({ coach: coachId, overrides: out });
}
function setSplit_(body) {
  var c = coachById_(body.coach);
  if (!c) return json_({ ok: false, reason: 'unknown coach' });
  var s = { coach: Number(body.coachPct) || 0, equip: Number(body.equipPct) || 0, range: Number(body.rangePct) || 0 };
  PropertiesService.getScriptProperties().setProperty(splitKey_(c.id), JSON.stringify(s));
  return json_({ ok: true, coach: c.id, split: s });
}

// ---------- COACHES: admin add / edit / remove (stored in Script Properties) ----------
// The list (incl. passcodes) is returned so the website behaves the same on any device —
// this matches the existing model where coach passcodes already live in the public site.
// Browser-safe projection of the coach roster — NEVER includes the passcode.
function coachesPublic_(list) {
  var photos = coachPhotoMap_();
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var c = list[i];
    out.push({ id: c.id, name: c.name, first: c.first || '', role: c.role || '', bio: c.bio || '', photo: photos[c.id] || '' });
  }
  return out;
}
function listCoaches_() {
  return json_({ coaches: coachesPublic_(getCoaches_()) });
}
function slugifyCoachId_(name) {
  var base = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'coach';
  var list = getCoaches_(); var id = base, n = 2;
  while (list.some(function (c) { return c.id === id; })) { id = base + '-' + n; n++; }
  return id;
}
function addCoach_(body) {
  var name = (body.name || '').trim();
  if (!name) return json_({ ok: false, reason: 'missing name' });
  var list = getCoaches_().slice();
  var id = (body.id && String(body.id).trim()) ? String(body.id).trim() : slugifyCoachId_(name);
  if (list.some(function (c) { return c.id === id; })) return json_({ ok: false, reason: 'duplicate id' });
  var coach = {
    id: id, name: name, first: name.split(' ')[0],
    role: (body.role || '').trim() || 'Coach',
    pass: (body.pass || '').trim() || (id + '2026'),
    bio: body.bio || ''
  };
  list.push(coach);
  saveCoaches_(list);
  dbLog_('', 'Coach added', coach.name + (coach.role ? (' · ' + coach.role) : ''), coach.name, '', 'admin');
  return json_({ ok: true, coach: coachesPublic_([coach])[0], coaches: coachesPublic_(list) });
}
function updateCoach_(body) {
  var id = (body.id || '').trim();
  var list = getCoaches_().slice();
  var i = -1; for (var k = 0; k < list.length; k++) if (list[k].id === id) { i = k; break; }
  if (i < 0) return json_({ ok: false, reason: 'not found' });
  var c = list[i];
  if (body.name != null && String(body.name).trim()) { c.name = String(body.name).trim(); c.first = c.name.split(' ')[0]; }
  if (body.role != null) c.role = String(body.role).trim();
  if (body.pass != null && String(body.pass).trim()) c.pass = String(body.pass).trim();
  c.bio = (body.bio != null ? body.bio : c.bio);
  list[i] = c;
  saveCoaches_(list);
  dbLog_('', 'Coach updated', c.name + (c.role ? (' · ' + c.role) : ''), c.name, '', 'admin');
  return json_({ ok: true, coach: coachesPublic_([c])[0], coaches: coachesPublic_(list) });
}
function deleteCoach_(body) {
  var id = (body.id || '').trim();
  var list = getCoaches_().slice();
  var removed = null;
  var next = list.filter(function (c) { if (c.id === id) { removed = c; return false; } return true; });
  if (!removed) return json_({ ok: false, reason: 'not found' });
  saveCoaches_(next);
  setCoachPhotoCell_(id, '');
  dbLog_('', 'Coach removed', removed.name, removed.name, '', 'admin');
  return json_({ ok: true, coaches: coachesPublic_(next) });
}

function setCoachProfile_(body) {
  var id = String(body.id || ''); if (!id) return json_({ ok: false, reason: 'no id' });
  if (body.bio != null) {
    var list = getCoaches_();
    for (var i = 0; i < list.length; i++) { if (list[i].id === id) { list[i].bio = String(body.bio || ''); break; } }
    saveCoaches_(list);
  }
  if (body.photo != null) { setCoachPhotoCell_(id, String(body.photo || '')); }
  return listCoaches_();
}

// ---------- RESET: wipe every booking so the owner can test from scratch ----------
// Deletes all website-created calendar events, clears the data sheets (keeps headers),
// and removes all stored plans. Coaches, payment splits, and coach availability are kept.
function clearAll_(body) {
  var deletedEvents = 0;
  try {
    var cal = getCalendar_();
    var from = new Date(); from.setDate(from.getDate() - 400);
    var to = new Date(); to.setDate(to.getDate() + 540);
    var events = cal.getEvents(from, to);
    events.forEach(function (ev) {
      var d = ev.getDescription() || '';
      if (d.indexOf('Booked via website') !== -1 || /Ref:\s*PGA-/i.test(d)) {
        try { ev.deleteEvent(); deletedEvents++; } catch (e) {}
      }
    });
  } catch (e) {}
  ['bookings', 'cancels', 'activity', 'passes'].forEach(function (key) {
    try {
      var sh = dbSheet_(key);
      var last = sh.getLastRow();
      if (last > 1) sh.getRange(2, 1, last - 1, sh.getLastColumn()).clearContent();
    } catch (e) {}
  });
  try {
    var props = PropertiesService.getScriptProperties();
    var all = props.getProperties();
    for (var pk in all) { if (pk.indexOf('plan:') === 0) props.deleteProperty(pk); }
  } catch (e) {}
  return json_({ ok: true, deletedEvents: deletedEvents });
}

// ---------- EMAIL ALIAS / MERGE (db-v14) ----------
// Link two email addresses so My Bookings shows all bookings under either address.
// Validates that `addEmail` is the address on file for the given `ref`; on success
// merges the two addresses into one group in Script Properties.
function addEmailAlias_(body){
  var email = (body.email || '').trim().toLowerCase();
  var addEmail = (body.addEmail || '').trim().toLowerCase();
  var ref = (body.ref || '').trim().toUpperCase();
  if (!email || !addEmail || !ref) return json_({ ok: false, reason: 'missing fields' });
  if (emailForRef_(ref) !== addEmail) return json_({ ok: false, reason: 'ref does not match that email' });
  var emails = mergeEmails_(email, addEmail);
  return json_({ ok: true, emails: emails });
}

// Approve one plan session: flip its Bookings row to "approved" (and set the amount),
// or INSERT an approved row if the session isn't recorded yet (e.g. history was cleared).
// This guarantees an approved plan always shows up in the Bookings list.
function approveSession_(body) {
  try {
    var sh = dbSheet_('bookings');
    var data = sh.getDataRange().getValues();
    var h = data[0];
    var evCol = h.indexOf('Event ID'), stCol = h.indexOf('Status'), refCol = h.indexOf('Ref'),
        dCol = h.indexOf('Date'), tCol = h.indexOf('Time'), amtCol = h.indexOf('Amount');
    var amt = (body.amount == null || body.amount === '') ? null : (Number(body.amount) || 0);
    for (var r = 1; r < data.length; r++) {
      var match = (body.eventId && String(data[r][evCol]) === String(body.eventId)) ||
        (!body.eventId && String(data[r][refCol]) === String(body.ref || '') && asDateStr_(data[r][dCol]) === String(body.date || '') && String(data[r][tCol]) === String(body.time || ''));
      if (match) {
        sh.getRange(r + 1, stCol + 1).setValue('approved');
        if (amt != null && amtCol >= 0) sh.getRange(r + 1, amtCol + 1).setValue(amt);
        return json_({ ok: true, updated: 1 });
      }
    }
    dbAppend_('bookings', [nowStr_(), body.ref || '', 'approved', body.date || '', body.time || '', body.program || '', body.name || '', body.email || '', body.phone || '', 1, (amt || 0), body.coach || '', '', '', body.eventId || '']);
    return json_({ ok: true, inserted: 1 });
  } catch (e) { return json_({ ok: false, error: String(e) }); }
}

// Assign/change the coach on an existing booking: update the calendar event's Coach line
// and the Bookings sheet Coach column. body: { eventId | (ref,date,time), coach: id-or-name }.
function setBookingCoach_(body) {
  try {
    var coachName = '';
    if (body.coach) { var c = coachById_(body.coach); coachName = c ? c.name : String(body.coach); }
    if (body.eventId) {
      try {
        var ev = getCalendar_().getEventById(body.eventId);
        if (ev) {
          var d = ev.getDescription() || '';
          if (/\nCoach:[^\n]*/i.test(d)) d = d.replace(/\nCoach:[^\n]*/i, coachName ? ('\nCoach: ' + coachName) : '');
          else if (coachName) d = d + '\nCoach: ' + coachName;
          ev.setDescription(d);
        }
      } catch (e) {}
    }
    try {
      var sh = dbSheet_('bookings');
      var data = sh.getDataRange().getValues();
      var h = data[0];
      var evCol = h.indexOf('Event ID'), cCol = h.indexOf('Coach'), refCol = h.indexOf('Ref'), dCol = h.indexOf('Date'), tCol = h.indexOf('Time');
      for (var r = 1; r < data.length; r++) {
        var match = (body.eventId && String(data[r][evCol]) === String(body.eventId)) ||
          (!body.eventId && String(data[r][refCol]) === String(body.ref || '') && asDateStr_(data[r][dCol]) === String(body.date || '') && String(data[r][tCol]) === String(body.time || ''));
        if (match) { if (cCol >= 0) sh.getRange(r + 1, cCol + 1).setValue(coachName); if (body.eventId) break; }
      }
    } catch (e) {}
    return json_({ ok: true, coach: coachName });
  } catch (e) { return json_({ ok: false, error: String(e) }); }
}

// Set a booking's status (e.g. 'approved') in the Bookings tab. Match by event id, else ref+date+time.
function setBookingStatus_(body) {
  try {
    var sh = dbSheet_('bookings');
    var data = sh.getDataRange().getValues();
    var h = data[0];
    var evCol = h.indexOf('Event ID'), stCol = h.indexOf('Status'), refCol = h.indexOf('Ref'), dCol = h.indexOf('Date'), tCol = h.indexOf('Time');
    var status = body.status || 'approved';
    var n = 0;
    for (var r = 1; r < data.length; r++) {
      var match = (body.eventId && String(data[r][evCol]) === String(body.eventId)) ||
        (!body.eventId && String(data[r][refCol]) === String(body.ref || '') && (!body.date || asDateStr_(data[r][dCol]) === body.date) && (!body.time || String(data[r][tCol]) === String(body.time)));
      if (match) { sh.getRange(r + 1, stCol + 1).setValue(status); n++; if (body.eventId) break; }
    }
    return json_({ ok: true, updated: n });
  } catch (e) { return json_({ ok: false, error: String(e) }); }
}
function removePlan_(body) {
  var email = (body.email || '').trim().toLowerCase();
  if (!email || body.ts == null) return json_({ ok: false, reason: 'missing email or ts' });
  // Read the pass first so we can name it in the log and the (single) email.
  var planName = '', holder = '', ref = '', sessions = [];
  var raw = PropertiesService.getScriptProperties().getProperty(planKey_(email, body.ts));
  if (raw) { try { var pl = JSON.parse(raw); planName = pl.name || ''; holder = pl.holder || ''; ref = pl.ref || ''; sessions = pl.sessions || []; } catch (e) {} }
  PropertiesService.getScriptProperties().deleteProperty(planKey_(email, body.ts));
  dbRemovePass_(email, body.ts); // remove from the Passes tab too
  // Audit: record who removed the pass and when.
  dbAppend_('cancels', [nowStr_(), ref, '', '', ('Pass: ' + planName), holder, email, (body.by || 'customer'), '']);
  // ONE cancellation email for the whole pass (its sessions are cancelled silently).
  var emailed = false;
  if (body.notify !== false) {
    try { emailed = sendPlanCancellation_({ email: email, holder: holder, plan: planName, ref: ref, sessions: sessions }); } catch (e) {}
  }
  return json_({ ok: true, emailed: emailed });
}
// GET ?action=plans            → every pass across all customers (for the admin)
// GET ?action=plans&email=x    → passes for this customer's email group (for My Bookings)
// db-v14: when a specific email is given, unions passes across groupFor_(email) and dedupes by ts.
function listPlans_(email) {
  email = (email || '').trim().toLowerCase();
  var props = PropertiesService.getScriptProperties().getProperties();
  var out = [];
  // Build the set of emails to include. For the admin (no email) include all; for a
  // customer, include every address in their email group.
  var groupSet = null;
  if (email) {
    groupSet = {};
    groupFor_(email).forEach(function (e) { groupSet[e] = 1; });
  }
  var seen = {};  // dedup by plan ts (plan id) so a plan stored under an alias isn't doubled
  for (var key in props) {
    if (key.indexOf('plan:') !== 0) continue;
    var rest = key.slice('plan:'.length);
    var cut = rest.lastIndexOf(':');
    var keyEmail = cut >= 0 ? rest.slice(0, cut) : rest;
    if (groupSet && !groupSet[keyEmail]) continue;
    var plan; try { plan = JSON.parse(props[key]); } catch (e) { continue; }
    if (!plan) continue;
    var tsKey = String(plan.ts);
    if (seen[tsKey]) continue;
    seen[tsKey] = 1;
    plan.email = keyEmail;
    out.push(plan);
  }
  out.sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); });
  return json_({ plans: out });
}

// Does this customer already hold a booking at this date + time? Prevents the same
// email from double-booking the exact same slot (which looks like one session but
// quietly consumes two seats).
function customerHasSlot_(email, dateStr, timeLabel) {
  email = (email || '').trim().toLowerCase();
  if (!email || !dateStr || !timeLabel) return false;
  var p = dateStr.split('-');
  if (p.length !== 3) return false;
  var ds = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10), 0, 0, 0);
  var de = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10), 23, 59, 59);
  var evs = getCalendar_().getEvents(ds, de);
  for (var i = 0; i < evs.length; i++) {
    var lbl = fmtLabel_(parseInt(Utilities.formatDate(evs[i].getStartTime(), TIMEZONE, 'H'), 10));
    if (lbl !== timeLabel) continue;
    var m = (evs[i].getDescription() || '').match(/Email:\s*([^\n\r]+)/i);
    if (m && m[1].trim().toLowerCase() === email) return true;
  }
  return false;
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

  // Block the same customer from re-booking a slot they already hold (use the archer
  // count for extra people instead of a second booking).
  if (!body.noEmail) {
    var already = [];
    requested.forEach(function (label) { if (customerHasSlot_(body.email, date, label)) already.push(label); });
    if (already.length) return json_({ ok: false, reason: 'duplicate', duplicates: already });
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

  // Create one event per archer per requested hour.
  var parts = date.split('-');
  var cal = getCalendar_();
  var booked = [];
  var eventIds = [];
  var archersBook = archerListFor_(body, party);
  var sharesBook = splitAmount_(amount, party * requested.length);
  var k = 0;
  requested.forEach(function (label) {
    var slot = findSlot(label);
    var start = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), slot.hour, 0, 0);
    var end   = new Date(start.getTime() + 60 * 60 * 1000);
    var slotEventId = null;
    archersBook.forEach(function (ar) {
      var per = sharesBook[k++];
      var title = ar.name + ' — ' + (body.program || 'Session') + coachTitle_(body);
      var ev = cal.createEvent(title, start, end, {
        description: 'Booked via website'
          + '\nRef: ' + ref
          + '\nArchers: 1'
          + '\nArcher: ' + ar.name + (ar.dob ? (' (b. ' + ar.dob + ')') : '')
          + '\nName: ' + (body.name || '')
          + '\nMobile: ' + (body.phone || '')
          + '\nEmail: ' + (body.email || '')
          + '\nProgram: ' + (body.program || '')
          + '\nAmount: ' + per
          + concLine_(body)
          + coachLine_(body)
      });
      if (slotEventId === null) slotEventId = ev.getId();
      dbRecordBooking_({ ref: ref, date: date, time: label, program: body.program, name: body.name, email: body.email, phone: body.phone, party: 1, amount: per, coach: (body.coachName || body.coach || ''), concession: concSummary_(body), roster: ar.name + (ar.dob ? (' (b. ' + ar.dob + ')') : ''), eventId: ev.getId() });
    });
    eventIds.push(slotEventId);
    booked.push(label);
  });

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

  // Block slots this customer already holds (same email, same date+time).
  if (!body.noEmail) {
    var dup = [];
    dates.forEach(function (d) { (d.times || []).forEach(function (label) { if (customerHasSlot_(body.email, d.date, label)) dup.push(d.date + ' ' + label); }); });
    if (dup.length) return json_({ ok: false, reason: 'duplicate', duplicates: dup });
  }

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
  var archers = archerListFor_(body, party);
  var totalEvents = party * pairCount;
  var shares = splitAmount_(amount, totalEvents);
  var bookedPairs = [];
  var eventIds = [];
  var allLabels = [];
  var shareIdx = 0;
  dates.forEach(function (d) {
    var parts = d.date.split('-');
    var slots = slotsByDate[d.date];
    (d.times || []).forEach(function (label) {
      var slot = null; for (var i = 0; i < slots.length; i++) { if (slots[i].time === label) { slot = slots[i]; break; } }
      var start = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), slot.hour, 0, 0);
      var end = new Date(start.getTime() + 60 * 60 * 1000);
      var slotEventId = null;
      archers.forEach(function (ar) {
        var per = shares[shareIdx++];
        var title = ar.name + ' — ' + (body.program || 'Session');
        var ev = cal.createEvent(title, start, end, {
          description: 'Booked via website'
            + '\nRef: ' + ref
            + '\nArchers: 1'
            + '\nArcher: ' + ar.name + (ar.dob ? (' (b. ' + ar.dob + ')') : '')
            + '\nName: ' + (body.name || '')
            + '\nMobile: ' + (body.phone || '')
            + '\nEmail: ' + (body.email || '')
            + '\nProgram: ' + (body.program || '')
            + '\nAmount: ' + per
            + concLine_(body)
        });
        if (slotEventId === null) slotEventId = ev.getId();
        dbRecordBooking_({ ref: ref, date: d.date, time: label, program: body.program, name: body.name, email: body.email, phone: body.phone, party: 1, amount: per, coach: (body.coachName || body.coach || ''), concession: concSummary_(body), roster: ar.name + (ar.dob ? (' (b. ' + ar.dob + ')') : ''), eventId: ev.getId() });
      });
      bookedPairs.push({ date: d.date, time: label, eventId: slotEventId });
      eventIds.push(slotEventId);
      allLabels.push(prettyDate_(d.date) + ' · ' + label);
    });
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

function reschedule_(body) {
  var cal = getCalendar_();
  var ev = null;
  if (body.eventId) { try { ev = cal.getEventById(body.eventId); } catch (e1) { ev = null; } }
  if (!ev && body.date && body.time) {
    var p = body.date.split('-');
    var ds = new Date(parseInt(p[0],10), parseInt(p[1],10)-1, parseInt(p[2],10), 0,0,0);
    var de = new Date(parseInt(p[0],10), parseInt(p[1],10)-1, parseInt(p[2],10), 23,59,59);
    var evs = cal.getEvents(ds, de);
    for (var i = 0; i < evs.length; i++) {
      var lbl = fmtLabel_(parseInt(Utilities.formatDate(evs[i].getStartTime(), TIMEZONE, 'H'), 10));
      var desc = evs[i].getDescription() || '';
      var refOk = !body.ref || desc.indexOf(body.ref) !== -1;
      if (lbl === body.time && refOk) { ev = evs[i]; break; }
    }
  }
  if (!ev) return json_({ ok: false, reason: 'event not found' });
  var np = (body.newDate || '').split('-');
  var nh = hourFromLabel_(body.newTime);
  if (np.length !== 3 || nh == null) return json_({ ok: false, reason: 'bad new slot' });
  var start = new Date(parseInt(np[0],10), parseInt(np[1],10)-1, parseInt(np[2],10), nh, 0, 0);
  var end = new Date(start.getTime() + 60 * 60 * 1000);
  try { ev.setTime(start, end); } catch (e2) { return json_({ ok: false, reason: 'move failed' }); }

  // Pull booking details from the event (fallbacks) so we can notify + log even if the
  // website didn't pass them — mirrors cancel_.
  var rdesc     = ev.getDescription() || '';
  var emM       = rdesc.match(/Email:\s*([^\n\r]+)/i);
  var refM      = rdesc.match(/Ref:\s*([^\n\r]+)/i);
  var progM     = rdesc.match(/Program:\s*([^\n\r]+)/i);
  var custEmail = (body.email || (emM ? emM[1].trim() : '')).trim();
  var ref       = body.ref || (refM ? refM[1].trim() : '');
  var program   = progM ? progM[1].trim() : '';
  var nm        = body.name || (ev.getTitle() || '');

  // Log to the admin Activity feed + email the customer (skip when notify===false for silent moves).
  if (body.notify !== false) {
    dbLog_(ref, 'Rescheduled',
      (program || '') + ' · ' + (body.date || '') + (body.time ? ' ' + body.time : '') + ' → ' + (body.newDate || '') + (body.newTime ? ' ' + body.newTime : ''),
      nm, custEmail, (body.by === 'admin' ? 'admin' : 'client'));
  }
  var emailed = false;
  if (body.notify !== false && custEmail) {
    try {
      emailed = sendReschedule_({ email: custEmail, name: nm, program: program, oldDate: body.date, oldTime: body.time, newDate: body.newDate, newTime: body.newTime, ref: ref });
    } catch (mailErr) { emailed = false; }
  }
  return json_({ ok: true, eventId: ev.getId(), ref: ref, emailed: emailed });
}
function hourFromLabel_(label) {
  var m = /(\d+):(\d+)\s*(AM|PM)/i.exec(label || ''); if (!m) return null;
  var h = parseInt(m[1], 10) % 12; if (/PM/i.test(m[3])) h += 12; return h;
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
  // Log real cancellations to the activity feed (skip silent plan-session swaps where notify===false).
  if (body.notify !== false) dbLog_(ref, 'Cancelled', (program || '') + (dateStr ? (' · ' + dateStr + (time ? ' ' + time : '')) : ''), body.name || '', custEmail, (body.by === 'admin' ? 'admin' : 'client'));

  var emailed = false;
  if (body.notify !== false && custEmail) {
    try {
      emailed = sendCancellation_({ email: custEmail, name: body.name, program: program, dateStr: dateStr, time: time, ref: ref });
    } catch (mailErr) { emailed = false; }
  }

  return json_({ ok: true, deleted: true, emailed: emailed });
}
