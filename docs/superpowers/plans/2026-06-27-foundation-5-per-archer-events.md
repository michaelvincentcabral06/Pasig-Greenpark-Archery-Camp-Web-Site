# Booking Foundation #5 — One Calendar Event Per Archer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every booking create one Google Calendar event **per archer per slot** (instead of one event holding N seats), while keeping one email + one booking ref, correct capacity, and unchanged customer/admin booking views.

**Architecture:** Backend-only changes to `backend/Code.gs` (Google Apps Script). The event-creation paths (`book_`, `bookMulti_`) emit one `Archers: 1` event per archer per slot with an even-split per-event amount. The read paths (`lookup_`, `listBookings_`) **group events by `(ref, date, time)` and sum the `Archers` and `Amount` fields**, which unifies legacy single-events (`Archers: N`, one row) and new per-archer events (`Archers: 1` × N) into one booking-per-slot — so the frontend (which already dedupes by date+time) needs **no change**. `cancel_`/`reschedule_` operate on **all** events sharing a `(ref, date, time)`. Capacity is unchanged (`seatsOf_` already sums the `Archers` field). **Needs a manual Apps Script redeploy (`db-v25`).**

**Tech Stack:** Google Apps Script (ES5-ish: `var` + `function`, no arrow functions / `const`/`let`); verified against the live `/exec` backend with `curl`.

## Global Constraints

- **Backend-only.** No `index.html` / `.dc.html` change, no GitHub Pages push. **Requires one manual Apps Script redeploy** (Part C in `backend/SETUP.md`): paste `Code.gs` → Save → Deploy → Manage deployments → ✏️ → New version. Bump the version flag to `db-v25` (`perArcherEvents: true`) and add a SETUP checklist (Task 5).
- **ES5-ish GAS style:** `var` and `function(...)`, NOT arrow functions, `const`, or `let` — match the existing file.
- **Capacity invariant:** a slot's used seats = `Σ seatsOf_(event)` over events in that hour; `seatsOf_` reads the `Archers: N` field (default 1). Per-archer events use `Archers: 1`. Do NOT change `seatsOf_`/`countByHour_`/`buildSlots_`.
- **Amount invariant:** `Σ (per-archer-event Amount) over a (ref,date,time) slot == the slot's share of the booking total`; across all slots == booking total. Even split with the rounding remainder on the **last** archer-event.
- **Back-compat:** legacy single-events (`Archers: N`, one per slot) must still display (My Bookings + admin), cancel, and reschedule correctly. The read-path grouping handles both because legacy slots are singleton groups.
- **One email, one ref:** unchanged — `makeRef_` issues one ref; the single receipt email still summarizes the whole booking. Only the number of calendar events changes.
- **Verification:** drive the **live `/exec` backend** with `curl` on a **scratch future date**, using `noEmail: true` on bookings and `notify: false` on cancels (no emails sent), then clean up (cancel the test booking). The endpoint URL is the `bookingEndpoint` in `index.html`'s `data-props` (`…/macros/s/AKfycb…/exec`). For Apps Script POST: `curl -sL` (let curl follow the 302 as GET — do NOT use `--post302`, which re-POSTs to the redirect and 404s). Pure GAS string/amount helpers can also be unit-tested by pasting them into a scratch Node `.js` and running `node`.

---

### Task 1: Per-archer event creation (`bookMulti_`, `book_`) + amount split

**Files:**
- Modify: `backend/Code.gs` — add `splitAmount_` + `archerListFor_` helpers; rewrite the event-creation + sheet-recording loops in `bookMulti_` and `book_`.

**Interfaces:**
- Produces: `splitAmount_(total, n)` → array of `n` integers summing to `total` (remainder on last). `archerListFor_(body, party)` → array of length `party` of `{ name, dob, age }` (from `body.archers`, padded with `{name:'Archer N'}`). After this task, a booking of A archers across S slots creates **A×S** calendar events (`Archers: 1` each) and A×S sheet rows.

- [ ] **Step 1: Add helpers.** Near the other small helpers (e.g. after `seatsOf_`), add:
```js
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
```

- [ ] **Step 2: Rewrite the `bookMulti_` creation loop.** In `bookMulti_`, the block that loops `dates → times` creating ONE `cal.createEvent(...)` per pair (with `'\nArchers: ' + party`) and the subsequent `bookedPairs.forEach(... dbRecordBooking_ ...)` recording loop. Replace BOTH with per-archer creation. Compute the per-archer-per-slot amounts up front, then emit one event + one sheet row per archer per slot:
```js
  var cal = getCalendar_();
  var archers = archerListFor_(body, party);
  var totalEvents = party * pairCount;
  var shares = splitAmount_(amount, totalEvents);   // amount = booking total (frontend-trusted)
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
        bookedPairs.push({ date: d.date, time: label, eventId: ev.getId() });
        eventIds.push(ev.getId());
        dbRecordBooking_({ ref: ref, date: d.date, time: label, program: body.program, name: body.name, email: body.email, phone: body.phone, party: 1, amount: per, coach: (body.coachName || body.coach || ''), concession: concSummary_(body), roster: ar.name + (ar.dob ? (' (b. ' + ar.dob + ')') : ''), eventId: ev.getId() });
      });
      allLabels.push(prettyDate_(d.date) + ' · ' + label);
    });
  });
```
Delete the old single-event-per-pair `cal.createEvent` block AND the old `bookedPairs.forEach(... dbRecordBooking_ ...)` block it replaces (the new loop records inline). Leave the availability checks, `amount`/`ref`/`roster` computation, and the email block (which follows) intact. The receipt email still sends once with the whole-booking summary.

- [ ] **Step 3: Rewrite the `book_` single-date creation loop the same way.** `book_` (the non-`dates` path) has the same shape — a `requested.forEach(label => cal.createEvent(... 'Archers: ' + party ...))` loop and a `for (bi …) dbRecordBooking_(...)` loop. Replace with the per-archer pattern: compute `var archers = archerListFor_(body, party); var shares = splitAmount_(amount, party * booked.length); var k = 0;` then for each booked label, for each archer, create one `Archers: 1` event (title `ar.name + ' — ' + program`, `Amount: shares[k++]`, `Archer:` line, `concLine_(body)`) and one `dbRecordBooking_({ …, party: 1, amount: that share, roster: ar.name … })`. Keep `eventIds`/`booked` populated (push the per-archer event ids). The receipt email and `return json_({ ok:true, ref, booked, eventIds, … })` stay.

- [ ] **Step 4: Verify (live, scratch date, noEmail).** Find an open future date via `GET …/exec?action=availability&date=YYYY-MM-DD`. POST a booking with `noEmail:true`, `party:3`, `archers:[{name:'A1'},{name:'A2'},{name:'A3'}]`, one date with one time, `amount:900`. Then `GET …/exec?action=lookup&ref=<ref>` (raw, pre-Task-2) — assert it returns **3** events for that slot, each `Archers` description = 1, titles A1/A2/A3, and the three `Amount`s are `[300,300,300]` summing to 900. Re-run availability for the slot → `left` dropped by **3**. Also unit-test `splitAmount_(901,3)` === `[300,300,301]` (paste into a scratch Node `.js`). Then **cancel** every created event (POST `action:'cancel', notify:false, eventId:<each>`), or leave for Task 4's grouped cancel test. Confirm the slot returns to full.

- [ ] **Step 5: Commit.**
```bash
git add backend/Code.gs
git commit -m "Foundation #5: create one calendar event per archer per slot (bookMulti_/book_) + amount split"
```

---

### Task 2: `lookup_` aggregation (My Bookings)

**Files:**
- Modify: `backend/Code.gs` — `lookup_` (the `events.forEach(... out.push ...)` loop).

**Interfaces:**
- Consumes: per-archer events from Task 1.
- Produces: `lookup_` returns **one** booking object per `(ref, date, time)` group, with `party = Σ Archers field` and `amount = Σ Amount field` over the group; other fields from the group's first event. Legacy singleton groups are unchanged.

- [ ] **Step 1: Group instead of one-per-event.** In `lookup_`, replace the `events.forEach(function (ev) { … out.push({ … party: parseInt(field(d,'Archers')||'1'), amount: parseInt(field(d,'Amount')||'0'), … }); })` body with a grouping pass keyed by `ref|date|time`:
```js
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
```
(`field`, `inGroup`, `name`, `out` are already declared in `lookup_`; keep them. This replaces only the per-event `out.push`.)

- [ ] **Step 2: Verify (live).** Reuse a Task-1-style booking (3 archers, `noEmail`). `GET …/exec?action=lookup&ref=<ref>` → assert exactly **one** booking object for the slot with `party === 3` and `amount === 900`. Book a 1-archer legacy-style check is unnecessary (legacy events are singleton groups → `party = Archers field`). Clean up (cancel). 

- [ ] **Step 3: Commit.**
```bash
git add backend/Code.gs
git commit -m "Foundation #5: lookup_ groups per-archer events by ref+date+time (party/amount summed)"
```

---

### Task 3: `listBookings_` aggregation (admin)

**Files:**
- Modify: `backend/Code.gs` — `listBookings_` (the calendar-scan `events.forEach(... out.push ...)` that builds admin rows).

**Interfaces:**
- Consumes: per-archer events (Task 1).
- Produces: admin booking rows grouped by `(ref, date, time)`: `archers = Σ Archers field`, `amount = Σ Amount field`; other fields from the group's first event/sheet row. Legacy rows unchanged.

- [ ] **Step 1: Group the calendar scan.** In `listBookings_`, the calendar `events.forEach` currently does `out.push({ …, archers: parseInt(field(d,'Archers')||'1'), amount: srow ? srow.amount : (parseInt(field(d,'Amount')||'0')), … })` once per event. Convert it to accumulate into a `byKey` map keyed by `ref|date|time`, summing `archers` (from the `Archers` field) and `amount` (prefer the sheet row's amount per event, else the event's `Amount`), taking other fields from the first event in the group; after the loop, push the grouped values into `out`. Keep the existing sheet-merge (`sheetByEvent`, `usedEvent`) semantics: mark each contributing `eventId` used, and after the calendar pass append any sheet rows whose event was never seen (cancelled/again unchanged). Mirror the exact grouping key + sum approach from Task 2 (`ref + '|' + dateStr + '|' + timeLbl`, `seats`/`amt`). Preserve `bookedAt`, `status`, `coach`, `program`, `name`, `email`, `phone`, `eventId` (first event's) on the grouped row.

- [ ] **Step 2: Verify (live, admin auth).** With the admin secret available (the same `pass` used by other admin actions), POST `action:'bookings'` (admin-authed) and confirm a 3-archer test booking appears as **one** row with `archers === 3` and the summed amount; a legacy single-event booking still shows its `Archers: N` row unchanged. (If the admin secret is not available to the implementer, assert the grouping logic via a Node unit test of the extracted grouping function over synthetic event descriptions, and note the live admin check as deferred.) Clean up test bookings.

- [ ] **Step 3: Commit.**
```bash
git add backend/Code.gs
git commit -m "Foundation #5: listBookings_ groups per-archer events by ref+date+time for the admin view"
```

---

### Task 4: `cancel_` + `reschedule_` operate on all events for a slot

**Files:**
- Modify: `backend/Code.gs` — add `eventsForSlot_` helper; `cancel_` and `reschedule_` event-matching/action.

**Interfaces:**
- Produces: `eventsForSlot_(cal, ref, dateStr, timeLabel)` → array of all calendar events whose description `Ref` matches and whose start hour matches `timeLabel` on `dateStr`. `cancel_` deletes all of them; `reschedule_` moves all of them.

- [ ] **Step 1: Add `eventsForSlot_`.** Near `cancel_`:
```js
// All calendar events for a booking slot (ref + date + time-label). Used so a cancel/reschedule
// affects every per-archer event in that slot, not just one.
function eventsForSlot_(cal, ref, dateStr, timeLabel) {
  var parts = dateStr.split('-');
  var ds = new Date(parseInt(parts[0],10), parseInt(parts[1],10)-1, parseInt(parts[2],10), 0,0,0);
  var de = new Date(parseInt(parts[0],10), parseInt(parts[1],10)-1, parseInt(parts[2],10), 23,59,59);
  var evs = cal.getEvents(ds, de), out = [];
  var want = (ref || '').toUpperCase();
  for (var i = 0; i < evs.length; i++) {
    var d = evs[i].getDescription() || '';
    var lbl = fmtLabel_(parseInt(Utilities.formatDate(evs[i].getStartTime(), TIMEZONE, 'H'), 10));
    if (lbl !== timeLabel) continue;
    var evRef = (function (s) { var m = /Ref:\s*([^\n\r]+)/i.exec(s); return m ? m[1].trim().toUpperCase() : ''; })(d);
    if (want && evRef !== want) continue;
    out.push(evs[i]);
  }
  return out;
}
```

- [ ] **Step 2: `cancel_` deletes all slot events.** In `cancel_`, after resolving `ref`/`dateStr`/`time` (it already derives these from the body or the found event), gather the full set and delete all: when a `ref` + `date` + `time` are known, use `var slotEvents = eventsForSlot_(cal, ref, dateStr, time);` and if non-empty, `slotEvents.forEach(function (e) { try { e.deleteEvent(); } catch (x) {} });` instead of deleting only the single `ev`. Keep the single-event fallback (delete `ev`) when no `ref` is available. The sheet-mark (`dbMarkCancelled_`), cancels-log, activity-log, and email logic stay (one cancel record/email per booking-slot, as today — guard with `body.notify`). Ensure `dbMarkCancelled_` marks all rows for the ref+slot (it matches by eventId else ref+date+time — confirm it cancels the group; if it only marks by eventId, also mark by ref+date+time).

- [ ] **Step 3: `reschedule_` moves all slot events.** In `reschedule_`, after computing the new `start`/`end` and resolving `ref`/`date`/`time`, replace the single `ev.setTime(start, end)` with: gather `var slotEvents = eventsForSlot_(cal, ref, body.date, body.time);` (fall back to `[ev]` if empty) and `slotEvents.forEach(function (e) { try { e.setTime(start, end); } catch (x) {} });`. One activity-log + one reschedule email per booking-slot (unchanged, guarded by `body.notify`).

- [ ] **Step 4: Verify (live, scratch date, noEmail/notify:false).** Book 3 archers in one slot (`noEmail`). `GET …/exec?action=availability` → `left` down by 3. POST `action:'reschedule', notify:false, ref:<ref>, date, time, newDate, newTime` → assert the original slot returns to full and the new slot drops by 3 (all 3 events moved). Then POST `action:'cancel', notify:false, ref:<ref>, date:<newDate>, time:<newTime>` → assert the new slot returns to full and `lookup_` by ref returns no bookings (all 3 deleted). No emails sent.

- [ ] **Step 5: Commit.**
```bash
git add backend/Code.gs
git commit -m "Foundation #5: cancel_/reschedule_ act on all per-archer events in a slot (eventsForSlot_)"
```

---

### Task 5: Version flag `db-v25` + SETUP checklist

**Files:**
- Modify: `backend/Code.gs` — the `?action=version` response (~line 749); `backend/SETUP.md`.

**Interfaces:** none (release bookkeeping).

- [ ] **Step 1: Bump the version flag.** In the `if (action === 'version')` return `json_({ version: 'db-v24', …, timeCellFix: true })`, change `'db-v24'` → `'db-v25'` and append `, perArcherEvents: true` before the closing `})`.

- [ ] **Step 2: Add the SETUP section.** Append a `## db-v25 deploy & verify` section to `backend/SETUP.md` mirroring the existing per-version format: the standard Part-C deploy steps, then a checklist — (a) `?action=version` shows `"version":"db-v25"`, `"perArcherEvents":true`, all prior flags; (b) booking N archers in a slot creates **N** calendar events (one per archer, each visible in the owner's Google Calendar) and the slot's availability drops by N; (c) one confirmation email with one ref (not N); (d) My Bookings shows the booking once with the correct archer count; (e) the admin Bookings view shows it as one row with N archers; (f) cancelling/rescheduling that booking moves/removes all N events together; (g) a legacy pre-db-v25 booking still displays, cancels, and reschedules correctly.

- [ ] **Step 3: Commit.**
```bash
git add backend/Code.gs backend/SETUP.md
git commit -m "Foundation #5: db-v25 version flag (perArcherEvents) + SETUP checklist"
```

- [ ] **Step 4: Redeploy reminder.** After merge, tell the user to **redeploy the Apps Script** (Part C) and walk the db-v25 checklist; per-archer events only take effect after redeploy.

---

## Self-Review

**Spec coverage** (against `2026-06-27-booking-foundation-design.md`, Part B):
- One event per archer per slot (`Archers: 1`); A×S events → Task 1. ✓
- Capacity unchanged (`seatsOf_` sums) → Global Constraints (no change). ✓
- One email/ref → Task 1 keeps the single receipt + `makeRef_`. ✓
- Per-event amount split summing to total (remainder on last) → Task 1 `splitAmount_`. ✓
- Back-compat: legacy bookings display/cancel/reschedule → grouping handles singleton legacy groups (Tasks 2–4); `eventsForSlot_` falls back to single event. ✓
- Read-path display correct (party/amount) → `lookup_` (Task 2) + `listBookings_` (Task 3) group by ref+date+time. ✓
- Cancel/reschedule act on all archer-events for the slot → Task 4. ✓
- Sheet: one row per archer-event → Task 1 `dbRecordBooking_({party:1, amount:per})`. ✓
- `db-v25` redeploy + checklist → Task 5. ✓
- **Deferred (correctly NOT here):** per-archer *concessions/add-ons selection* (each event currently carries the booking-level concession, even split — #3/#4 enrich it); admin coach-per-archer (#6); accounting (#7).

**Placeholder scan:** Task 3 Step 1 describes the grouping by reference to Task 2's exact key/sum rather than re-pasting the whole `listBookings_` body (that function's full text wasn't reproduced); the implementer must apply the same `ref+'|'+dateStr+'|'+timeLbl` key and `seats`/`amt` sums shown verbatim in Task 2 Step 1. This is the one spot that leans on a sibling task; the exact key and sum expressions are given. Task 3 Step 2 also names a Node-unit-test fallback if the admin secret is unavailable.

**Type/name consistency:** `splitAmount_(total,n)`, `archerListFor_(body,party)`, `eventsForSlot_(cal,ref,dateStr,timeLabel)`, the grouping key `ref|date|time`, and `Archers: 1` / `Amount: <share>` event fields are used consistently across Tasks 1–4. The `Archers`/`Amount` field names match the existing `field(d,'Archers')`/`field(d,'Amount')` readers.
