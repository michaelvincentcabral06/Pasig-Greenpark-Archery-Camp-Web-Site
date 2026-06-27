# Coach Assignment (Plan A) — Backend Multi-Coach (db-v28)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `setBookingCoach_` accept a **list** of coaches, write the joined list to **all** of a booking's per-archer events + sheet rows, and reject more coaches than `ceil(archers/2)`.

**Architecture:** Backend-only changes to `backend/Code.gs` (Google Apps Script, ES5-ish — `var`/`function`, no arrows/`const`/`let`). Reuses the existing `Coach` field/column as a comma-joined name list (no schema change). The frontend picker (Plan B) sends `coaches:[ids]` (+ `coach:ids[0]` back-compat); this backend resolves them, writes to every event for the `(ref,date,time)` slot via the existing `eventsForSlot_`, and enforces the cap. **Needs a manual `db-v28` redeploy.**

**Tech Stack:** Google Apps Script (ES5-ish); verified by Node unit tests of the extractable logic (the live `/exec` runs old code until redeploy) + the user's post-redeploy checklist.

## Global Constraints

- **Backend-only.** No `index.html`/`.dc.html` change, no Pages push. **Requires one manual `db-v28` redeploy** (edit the EXISTING deployment — never "New deployment").
- **ES5-ish GAS style:** `var` + `function(...)`, NOT arrows/`const`/`let`.
- **Already in the codebase (use, don't redefine):** `coachById_(id)` → coach object (`{name,…}`) or null; `eventsForSlot_(cal, ref, dateStr, timeLabel)` → all calendar events for that slot (from #5); `seatsOf_(ev)` → the event's `Archers` count (default 1); `asDateStr_(v)`; `dbSheet_('bookings')`; `getCalendar_()`.
- **Back-compat:** accept both `body.coaches` (array of ids) and the old single `body.coach`; an empty list clears the coach.
- **Reuse the `Coach` field/column** (`\nCoach: …` in event descriptions; the `Coach` Bookings-sheet column) as a comma-joined name list — read paths (`lookup_`/`listBookings_`) already read it as a string.
- **Verification:** Node unit tests of the extractable logic with stubbed GAS APIs; `cp backend/Code.gs /tmp/_c.js && node --check /tmp/_c.js && echo SYNTAX_OK`. Do NOT live-`curl` (deployed endpoint runs old code). True end-to-end = the user's post-redeploy `db-v28` checklist. Delete scratch; commit only `backend/Code.gs` (+ `SETUP.md` in Task 2).

---

### Task 1: `setBookingCoach_` — multi-coach, all-slot-events, cap check

**Files:** Modify `backend/Code.gs` — replace `setBookingCoach_(body)`.

**Interfaces:**
- Consumes: `coachById_`, `eventsForSlot_`, `seatsOf_`, `asDateStr_`, `dbSheet_`, `getCalendar_`.
- Produces: `setBookingCoach_(body)` accepts `body.coaches:[ids]` (or single `body.coach`), joins resolved names, writes `\nCoach: <joined>` to every event for the `(ref,date,time)` slot and the `Coach` column on every matching sheet row; rejects when `names.length > ceil(archers/2)`; empty list clears; returns `{ok:true, coach:<joined>, coaches:[names]}`.

- [ ] **Step 1: Replace `setBookingCoach_`.** Replace the whole function with:
```js
function setBookingCoach_(body) {
  try {
    // Coach list: new `coaches` array of ids, or back-compat single `coach`.
    var ids = (body.coaches && body.coaches.length) ? body.coaches : (body.coach ? [body.coach] : []);
    var names = [];
    for (var i = 0; i < ids.length; i++) { var c = coachById_(ids[i]); var nm = c ? c.name : String(ids[i]); if (nm) names.push(nm); }
    var coachName = names.join(', ');
    var cal = getCalendar_();

    // Gather the booking's events for the slot (all per-archer events); fall back to the single event by id.
    var slotEvents = [];
    if (body.ref && body.date && body.time) slotEvents = eventsForSlot_(cal, body.ref, body.date, body.time);
    if (!slotEvents.length && body.eventId) { try { var one = cal.getEventById(body.eventId); if (one) slotEvents = [one]; } catch (e1) {} }

    // Defensive cap: max coaches = ceil(archers / 2); archers = sum of the slot events' Archers (default 1 each).
    var archerCount = 0;
    for (var a = 0; a < slotEvents.length; a++) archerCount += seatsOf_(slotEvents[a]);
    if (archerCount > 0 && names.length > Math.ceil(archerCount / 2)) {
      return json_({ ok: false, reason: 'too many coaches', max: Math.ceil(archerCount / 2) });
    }

    // Write the Coach line to every slot event.
    for (var e = 0; e < slotEvents.length; e++) {
      var ev = slotEvents[e];
      var d = ev.getDescription() || '';
      if (/\nCoach:[^\n]*/i.test(d)) d = d.replace(/\nCoach:[^\n]*/i, coachName ? ('\nCoach: ' + coachName) : '');
      else if (coachName) d = d + '\nCoach: ' + coachName;
      try { ev.setDescription(d); } catch (e2) {}
    }

    // Write the Coach column to every matching sheet row (ref+date+time, or eventId fallback).
    try {
      var sh = dbSheet_('bookings');
      var data = sh.getDataRange().getValues();
      var h = data[0];
      var evCol = h.indexOf('Event ID'), cCol = h.indexOf('Coach'), refCol = h.indexOf('Ref'), dCol = h.indexOf('Date'), tCol = h.indexOf('Time');
      for (var r = 1; r < data.length; r++) {
        var match = (body.ref && String(data[r][refCol]) === String(body.ref) && asDateStr_(data[r][dCol]) === String(body.date || '') && String(data[r][tCol]) === String(body.time || ''))
          || (body.eventId && String(data[r][evCol]) === String(body.eventId));
        if (match && cCol >= 0) sh.getRange(r + 1, cCol + 1).setValue(coachName);
      }
    } catch (e3) {}

    return json_({ ok: true, coach: coachName, coaches: names });
  } catch (e) { return json_({ ok: false, error: String(e) }); }
}
```

- [ ] **Step 2: Verify (Node unit test — do NOT curl).** `cp backend/Code.gs /tmp/_c.js && node --check /tmp/_c.js && echo SYNTAX_OK`. Scratch `_t.mjs`: extract `setBookingCoach_` with stubs — `coachById_` (`{c1:{name:'Coach A'},c2:{name:'Coach B'},c3:{name:'Coach C'}}`), `eventsForSlot_` returning 3 fake per-archer events (each `getDescription`/`setDescription` recording, `seatsOf_`→1 each), a fake `dbSheet_('bookings')` with a header row + 3 rows for the slot, `asDateStr_`, `Math`, `json_` (identity). Cases:
  (a) `{coaches:['c1','c2'], ref:'R', date:'2026-07-10', time:'4:00 PM'}` (3 archers → cap 2) → `ok:true`, `coach==='Coach A, Coach B'`; all 3 events' descriptions now contain `\nCoach: Coach A, Coach B`; all 3 sheet rows' Coach column set to `'Coach A, Coach B'`.
  (b) back-compat single `{coach:'c1', ref:'R', …}` → `ok:true`, `coach==='Coach A'`, written to all events/rows.
  (c) cap exceeded `{coaches:['c1','c2','c3'], …}` (3 archers, cap 2) → `ok:false`, `reason:'too many coaches'`, `max:2`, and NO event/row was modified.
  (d) empty `{coaches:[], ref:'R', …}` → `ok:true`, `coach===''`, the `\nCoach:` line replaced with empty / column cleared.
  Run `node _t.mjs`; all green; delete scratch (`rm -f _t.mjs /tmp/_c.js`).

- [ ] **Step 3: Commit.**
```bash
git add backend/Code.gs
git commit -m "Coach assignment: setBookingCoach_ multi-coach + all-slot-events + ceil(archers/2) cap"
```

---

### Task 2: `db-v28` version flag + SETUP checklist

**Files:** Modify `backend/Code.gs` — the `?action=version` return; `backend/SETUP.md`.

- [ ] **Step 1: Bump version.** In the `if (action === 'version')` `json_({ version: 'db-v27', …, perArcherExtras: true })`, change `'db-v27'` → `'db-v28'` and append `, multiCoach: true` before the closing `})`.

- [ ] **Step 2: SETUP section.** Append a `## db-v28 deploy & verify` section to `backend/SETUP.md` (mirror the existing per-version format): the standard Part-C deploy steps (edit existing deployment → New version), then a checklist — (a) `?action=version` shows `"version":"db-v28"`, `"multiCoach":true`, all prior flags; (b) in the admin Sessions view assign **2 coaches** to a **3-archer** booking → both coach names show on the booking and on every one of its calendar events; (c) try to assign a **3rd** coach to that 3-archer booking → rejected (cap is `ceil(3/2)=2`); (d) a **1–2-archer** booking caps at 1 coach; (e) clearing all coaches empties the Coach field; (f) a pre-db-v28 single-coach booking still displays its coach.

- [ ] **Step 3: Commit.**
```bash
git add backend/Code.gs backend/SETUP.md
git commit -m "Coach assignment: db-v28 version flag (multiCoach) + SETUP checklist"
```

- [ ] **Step 4: Redeploy reminder.** After merge, tell the user to **redeploy the Apps Script** (edit existing deployment → New version) and walk the db-v28 checklist. The frontend multi-coach picker (Plan B) sends `coaches` + `coach:ids[0]`, so until `db-v28` is live only the first coach is assigned.

---

## Self-Review

**Spec coverage** (against `2026-06-27-coach-assignment-design.md`, Section 2):
- `setBookingCoach_` accepts a coach list, joins resolved names → Task 1. ✓
- Updates all of the booking's per-archer events via `eventsForSlot_` → Task 1. ✓
- Updates all matching sheet rows (ref+date+time, eventId fallback) → Task 1. ✓
- Defensive cap check `ceil(archers/2)` (archers = Σ slot events' `Archers`) → Task 1. ✓
- Empty list clears the coach → Task 1 (Step 2 case d). ✓
- Back-compat single `coach` → Task 1. ✓
- Reuse `Coach` field/column (no schema change); read paths unchanged → Task 1 (only `setBookingCoach_` touched). ✓
- `db-v28` flag + SETUP → Task 2. ✓
- **Out of scope (correctly):** the frontend multi-coach picker → Plan B; coach-fee split → #7.

**Placeholder scan:** no TBD/TODO; Task 1 shows the complete replacement function; the verify step names concrete cases (a–d) with computed expected values.

**Type/name consistency:** `setBookingCoach_(body)` reads `body.coaches`/`body.coach`/`body.ref`/`body.date`/`body.time`/`body.eventId` (matching what the frontend sends today + Plan B); `coachById_`/`eventsForSlot_`/`seatsOf_`/`asDateStr_`/`dbSheet_` are existing helpers; the cap `Math.ceil(archerCount/2)` matches the spec's `ceil(archers/2)`; returns `{ok, coach, coaches}` consumed by the frontend.
