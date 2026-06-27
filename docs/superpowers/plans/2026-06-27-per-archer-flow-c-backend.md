# Per-Archer Booking Flow (Plan C) — Backend Per-Archer Event Wiring (db-v27)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each per-archer calendar event store **that archer's own** concession, add-ons, and amount (instead of the booking-level concession + even-split), and record per-booking add-ons once — consuming the enriched `archers[]` request the frontend already sends (Plan A).

**Architecture:** Backend-only changes to `backend/Code.gs` (Google Apps Script, ES5-ish — `var`/`function`, no arrows/`const`/`let`). The frontend (live) already POSTs `archers:[{name,dob,concession,addons,amount}]` + `perBookingAddons` + `total`. `bookMulti_`/`book_` (which since #5 create one event per archer per slot) change to read per-archer fields; a **back-compat fallback** keeps the #5 even-split + booking-level concession when an archer lacks the enriched fields. The read paths (`lookup_`/`listBookings_`) already aggregate by `(ref,date,time)` summing `Amount`, so they need no change. **Needs a manual `db-v27` redeploy.**

**Tech Stack:** Google Apps Script (ES5-ish); verified by Node unit tests of extractable logic (the live `/exec` runs the old deployed code until redeploy) + the user's post-redeploy checklist.

## Global Constraints

- **Backend-only.** No `index.html`/`.dc.html` change, no Pages push. **Requires one manual `db-v27` redeploy** (edit the EXISTING deployment — never "New deployment").
- **ES5-ish GAS style:** `var` + `function(...)`, NOT arrows/`const`/`let`.
- **Amount invariant:** `Σ(per-archer event Amount) + per-booking-add-on total == booking total`. Each archer's `amount` (their across-all-slots total, from the frontend) is split evenly across that archer's slots with the remainder on the last slot.
- **Concession is generic:** a concession object is `{ items:[{id,name,amount,proof}], total }` or `null` (Phase-2 `buildConcession` shape). The existing `concLine_` already formats the `{items}` shape.
- **Back-compat:** the backend accepts BOTH the enriched `archers[]` (per-archer `amount`/`concession`/`addons`) and the pre-Plan-A shape (no per-archer fields → fall back to #5 even-split `splitAmount_(amount, totalEvents)` + booking-level `concLine_(body)`). Legacy single-event and db-v25/26 per-archer bookings keep displaying/cancelling/rescheduling. Capacity unchanged (`Archers: 1` per event).
- **Verification:** Node unit tests of the extractable string/loop logic with stubbed GAS APIs (`cal.createEvent`, `dbRecordBooking_`); `cp backend/Code.gs /tmp/_c.js && node --check /tmp/_c.js && echo SYNTAX_OK`. Do NOT live-`curl` (the deployed endpoint runs old code). True end-to-end = the user's post-redeploy `db-v27` checklist. Delete scratch; commit only `backend/Code.gs` (+ `SETUP.md` in Task 3).

---

### Task 1: Generic concession/add-on formatters

**Files:** Modify `backend/Code.gs` — refactor `concLine_` (~826) into `concLineOf_(c)` + a thin `concLine_(body)`; add `addonLine_(addons)` and `bookingAddonLine_(addons, slots)`.

**Interfaces:**
- Produces: `concLineOf_(c)` → `'\nConcession: …'` or `''` for any concession object (`{items}` or legacy booleans) or null; `concLine_(body)` = `concLineOf_(body.concession)`; `addonLine_(addons)` → `'\nAdd-ons: Bow rental (₱150)'` or `''` from `[{name,price}]`; `bookingAddonLine_(addons, slots)` → `'\nBooking add-ons: Target face (₱50 ×2)'` or `''`.

- [ ] **Step 1: Refactor `concLine_` → `concLineOf_`.** Replace the `concLine_(body)` function (~826–838) with:
```js
// Format any concession object (Phase-2 {items} shape, or legacy booleans) into a Concession line.
function concLineOf_(c) {
  if (!c) return '';
  if (c.items && c.items.length) {
    var parts = c.items.map(function (it) { return (it.name || '') + (it.proof ? (' (' + it.proof + ')') : ''); });
    return parts.length ? ('\nConcession: ' + parts.join(', ')) : '';
  }
  var p = [];
  if (c.pasig) p.push('Pasig');
  if (c.local) p.push('Greenpark/RHS');
  if (c.pac) p.push('PAC');
  return p.length ? ('\nConcession: ' + p.join(',')) : '';
}
function concLine_(body) { return concLineOf_(body.concession); }
```
(`concSummary_(body)` is unchanged — it strips the prefix from `concLine_(body)`.)

- [ ] **Step 2: Add add-on formatters.** Right after, add:
```js
// Per-archer add-ons line from [{name, price}]. e.g. "\nAdd-ons: Bow rental (₱150)"
function addonLine_(addons) {
  if (!addons || !addons.length) return '';
  var parts = addons.map(function (a) { return (a.name || '') + ' (₱' + (Number(a.price) || 0) + ')'; });
  return '\nAdd-ons: ' + parts.join(', ');
}
// Per-booking add-ons line (recorded once on the booking), priced × slots. e.g. "\nBooking add-ons: Target face (₱50 ×2)"
function bookingAddonLine_(addons, slots) {
  if (!addons || !addons.length) return '';
  slots = Math.max(1, slots || 1);
  var parts = addons.map(function (a) { return (a.name || '') + ' (₱' + (Number(a.price) || 0) + ' ×' + slots + ')'; });
  return '\nBooking add-ons: ' + parts.join(', ');
}
```

- [ ] **Step 3: Verify (Node unit test — do NOT curl).** `cp backend/Code.gs /tmp/_c.js && node --check /tmp/_c.js && echo SYNTAX_OK`. Scratch `_t.mjs`: paste the three functions; assert `concLineOf_({items:[{name:'Pasig City resident',proof:'addr-1'}]})` === `'\nConcession: Pasig City resident (addr-1)'`; `concLineOf_(null)` === `''`; `concLineOf_({pasig:true})` === `'\nConcession: Pasig'`; `addonLine_([{name:'Bow rental',price:150}])` === `'\nAdd-ons: Bow rental (₱150)'`; `addonLine_([])` === `''`; `bookingAddonLine_([{name:'Target face',price:50}],2)` === `'\nBooking add-ons: Target face (₱50 ×2)'`. Run `node _t.mjs`; delete scratch.

- [ ] **Step 4: Commit.**
```bash
git add backend/Code.gs
git commit -m "Plan C: generic concession + add-on line formatters (concLineOf_/addonLine_/bookingAddonLine_)"
```

---

### Task 2: Per-archer event wiring in `bookMulti_` + `book_`

**Files:** Modify `backend/Code.gs` — the per-archer creation loops in `bookMulti_` and `book_`.

**Interfaces:**
- Consumes: `concLineOf_`/`addonLine_`/`bookingAddonLine_` (Task 1), `splitAmount_`/`archerListFor_` (#5).
- Produces: each archer's event carries that archer's `Amount` (their total split across their slots), `Concession:` (from `body.archers[i].concession`), `Add-ons:` (from `body.archers[i].addons`); the booking's first event also carries `Booking add-ons:`; back-compat fallback intact.

- [ ] **Step 1: `bookMulti_` per-archer wiring.** In `bookMulti_`, replace the creation block (the `var archers = archerListFor_(body, party); ... var shares = splitAmount_(amount, totalEvents); ... shareIdx ...` loop) with a per-archer-aware version. Detect the enriched shape and precompute each archer's per-slot shares:
```js
  var archers = archerListFor_(body, party);
  var srcArchers = (body.archers && body.archers.length) ? body.archers : [];
  var perArcher = srcArchers.some(function (a) { return a && a.amount != null; });
  // Per-archer slot shares: each archer's total split evenly across their pairCount slots (remainder on last).
  var archerSlotShares = [];
  for (var ai = 0; ai < party; ai++) {
    var src = srcArchers[ai] || {};
    archerSlotShares.push(perArcher ? splitAmount_(Number(src.amount) || 0, pairCount) : null);
  }
  var fallbackShares = perArcher ? null : splitAmount_(amount, party * pairCount);
  var fbIdx = 0, slotIdx = 0, firstEvent = true;
  var bookedPairs = [], eventIds = [], allLabels = [];
  dates.forEach(function (d) {
    var parts = d.date.split('-');
    var slots = slotsByDate[d.date];
    (d.times || []).forEach(function (label) {
      var slot = null; for (var i = 0; i < slots.length; i++) { if (slots[i].time === label) { slot = slots[i]; break; } }
      var start = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), slot.hour, 0, 0);
      var end = new Date(start.getTime() + 60 * 60 * 1000);
      var slotEventId = null;
      for (var k = 0; k < party; k++) {
        var ar = archers[k];
        var src2 = srcArchers[k] || {};
        var per = perArcher ? archerSlotShares[k][slotIdx] : fallbackShares[fbIdx++];
        var concObj = perArcher ? src2.concession : body.concession;
        var addonsArr = perArcher ? src2.addons : null;
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
            + concLineOf_(concObj)
            + addonLine_(addonsArr)
            + (firstEvent ? bookingAddonLine_(body.perBookingAddons, pairCount) : '')
        });
        if (slotEventId === null) slotEventId = ev.getId();
        dbRecordBooking_({ ref: ref, date: d.date, time: label, program: body.program, name: body.name, email: body.email, phone: body.phone, party: 1, amount: per, coach: (body.coachName || body.coach || ''), concession: concSummary_({ concession: concObj }), roster: ar.name + (ar.dob ? (' (b. ' + ar.dob + ')') : ''), eventId: ev.getId() });
        firstEvent = false;
      }
      bookedPairs.push({ date: d.date, time: label, eventId: slotEventId });
      eventIds.push(slotEventId);
      allLabels.push(prettyDate_(d.date) + ' · ' + label);
      slotIdx++;
    });
  });
```
Leave the rest of `bookMulti_` (availability checks, `amount`/`ref`/`roster`, the receipt email block, the return) unchanged. `concSummary_({concession: concObj})` reuses the existing helper for the sheet's Concession column.

- [ ] **Step 2: `book_` per-archer wiring (single-date path).** Apply the SAME pattern to `book_`'s loop: `srcArchers`/`perArcher` detection; `archerSlotShares[k] = perArcher ? splitAmount_(Number(srcArchers[k].amount)||0, requested.length) : null`; `fallbackShares = perArcher ? null : splitAmount_(amount, party*requested.length)`; in the `requested.forEach(label)` → inner `for k<party` loop, `per = perArcher ? archerSlotShares[k][slotIdx] : fallbackShares[fbIdx++]`, `concLineOf_(perArcher?srcArchers[k].concession:body.concession)`, `addonLine_(perArcher?srcArchers[k].addons:null)`, `firstEvent?bookingAddonLine_(body.perBookingAddons, requested.length):''`, and `concSummary_({concession: …})` in `dbRecordBooking_`. Keep `coachLine_(body)` on the title/description as today (book_ is the coach-program path). Increment `slotIdx` per label; keep `booked.push(label)` once per label and the slot-level `eventIds.push(firstArcherEventId)`.

- [ ] **Step 3: Verify (Node unit test — do NOT curl).** `node --check` the `.js` copy. Scratch `_t.mjs`: extract the `bookMulti_` creation loop into a testable function with stubbed `cal.createEvent` (records `{title, desc}`), stubbed `dbRecordBooking_` (records calls), `splitAmount_`/`concLineOf_`/`addonLine_`/`bookingAddonLine_` pasted. Feed `body` with 2 archers in ONE slot (pairCount=1), each with a DIFFERENT `concession` and per-archer `addons`, and `amount` (archer0=300, archer1=450), `perBookingAddons:[{name:'Target face',price:50}]`. Assert: **2** events; archer0's event description has archer0's `Concession:` + `Add-ons:` + `Amount: 300`; archer1's has archer1's (DIFFERENT) `Concession:`/`Add-ons:` + `Amount: 450`; ONLY the first event has the `Booking add-ons: Target face (₱50 ×1)` line; `dbRecordBooking_` called twice with the matching per-archer concession summaries. Add a multi-slot case (2 archers × 2 slots, archer0 amount=600) → archer0's two events have `Amount: 300` each (splitAmount_(600,2)); 4 events; only 1 has Booking add-ons. Add a **back-compat** case (body.archers with NO `amount`/`concession` fields) → falls back to even-split + `body.concession` on all events. Run `node _t.mjs`; delete scratch.

- [ ] **Step 4: Commit.**
```bash
git add backend/Code.gs
git commit -m "Plan C: per-archer event wiring in bookMulti_/book_ (per-archer concession/add-ons/amount + per-booking add-ons once; back-compat fallback)"
```

---

### Task 3: `db-v27` version flag + SETUP checklist

**Files:** Modify `backend/Code.gs` — the `?action=version` return; `backend/SETUP.md`.

- [ ] **Step 1: Bump version.** In the `if (action === 'version')` `json_({ version: 'db-v26', …, multiDayNoEmail: true })`, change `'db-v26'` → `'db-v27'` and append `, perArcherExtras: true` before the closing `})`.

- [ ] **Step 2: SETUP section.** Append a `## db-v27 deploy & verify` section to `backend/SETUP.md` (mirror the existing per-version format): the standard Part-C deploy steps (edit existing deployment → New version), then a checklist — (a) `?action=version` shows `"version":"db-v27"`, `"perArcherExtras":true`, all prior flags; (b) book a **2-archer** Open Range session where the two archers pick **different** concessions/add-ons → in Google Calendar each archer's event description shows **that archer's own** Concession/Add-ons line and Amount; (c) the per-event amounts + per-booking add-on total sum to the booking total; (d) only ONE event carries the "Booking add-ons:" line; (e) one confirmation email, one ref; (f) a booking made before db-v27 still displays/cancels/reschedules.

- [ ] **Step 3: Commit.**
```bash
git add backend/Code.gs backend/SETUP.md
git commit -m "Plan C: db-v27 version flag (perArcherExtras) + SETUP checklist"
```

- [ ] **Step 4: Redeploy reminder.** After merge, tell the user to **redeploy the Apps Script** (edit existing deployment → New version) and walk the db-v27 checklist; per-archer extras storage only takes effect post-redeploy. The customer-facing total/flow are already correct on db-v26.

---

## Self-Review

**Spec coverage** (against `2026-06-27-per-archer-booking-flow-design.md`, Section 4):
- Request shape consumed (`archers[]` per-archer concession/addons/amount + perBookingAddons) → Task 2. ✓
- Each archer's event carries their own Amount/Concession/Add-ons → Task 2. ✓
- Per-booking add-ons recorded once (first event) → Task 2. ✓
- Back-compat fallback (even-split + booking concession) → Task 2 (`perArcher` detect). ✓
- `concLine_`/`concSummary_` generalized to format any concession object → Task 1. ✓
- Read paths already aggregate by ref+date+time (sum Amount) → no change needed (#5). ✓
- `db-v27` redeploy + checklist → Task 3. ✓
- **Deferred (per spec):** the receipt email's per-archer concession/add-on *summary* (kept minimal — the receipt already lists party/total/roster; the per-archer event detail is now stored, which is what #6/#7 consume; a richer email summary is an optional later polish). Full per-archer breakdown DISPLAY in admin → #6.

**Placeholder scan:** no TBD/TODO; Task 2 Step 2 (`book_`) references Task 2 Step 1's `bookMulti_` pattern but gives the exact per-path variances (slot count `requested.length`, `coachLine_`, slot-level eventId) — the shared loop body is identical, so this is a precise parallel, not a placeholder. Verify steps name concrete assertions with computed values.

**Type/name consistency:** `concLineOf_`/`addonLine_`/`bookingAddonLine_` (Task 1) used in Task 2; `perArcher`/`archerSlotShares`/`fallbackShares`/`srcArchers`/`slotIdx` consistent across `bookMulti_`+`book_`; the request shape `archers:[{name,dob,concession,addons,amount}]`/`perBookingAddons`/`total` matches what Plan A's frontend sends; `concSummary_({concession:…})` reuses the existing sheet-column helper. `splitAmount_` (remainder-on-last) gives the amount invariant.
