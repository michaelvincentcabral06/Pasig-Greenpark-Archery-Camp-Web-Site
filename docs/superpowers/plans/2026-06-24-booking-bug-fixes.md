# Booking Bug Fixes (batch) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four bugs — reschedule duplicates a session, past slots stay bookable, self-scheduled pass sessions don't show in admin, and self-scheduling sends no confirmation email.

**Architecture:** Backend Google Apps Script (`backend/Code.gs`, db-v15 → db-v16) gains a `reschedule` action (move event in place) and a `planScheduleEmail_` body-fallback. Frontend (one SuperConductor component in `index.html`, mirrored in `.dc.html`) filters past slots defensively, calls the new `reschedule` action, passes holder/plan into the schedule email, and ensures self-scheduled sessions reach admin.

**Tech Stack:** Apps Script (ES5 `.gs`); SuperConductor + `support.js`; playwright-core + cached Chromium.

## Global Constraints
- **Backend untestable here** (db-v16 tasks review-gated + `SETUP.md` checklist; no "tests pass" claim).
- **Backend file sync:** `Code.gs`/`Code.LATEST.gs`/`Code.v16.gs` byte-identical.
- **Frontend mirror rule:** `index.html` ≡ `Pasig Greenpark Archery Camp.dc.html` (byte-identical; mirror via `cp index.html "Pasig Greenpark Archery Camp.dc.html"`; `diff … && echo IDENTICAL`).
- **Apps Script style:** ES5 (`var`/`function`, no arrow/`const`/`let`/template literals).
- **db-v16:** version `db-v16`, keep all db-v15 flags incl. `contentStore`, add `reschedule:true`. Contract: `POST {action:'reschedule', eventId, ref, date, time, newDate, newTime, name, email}` → `{ok:true, eventId, ref}` (or `{ok:false}`); `planScheduleEmail_` uses `body.holder`/`body.plan`/`body.sessions` when the stored plan is missing.
- **Locate by content, not absolute line numbers.**

---

### Task 1: Backend db-v16 — `reschedule` action + `planScheduleEmail_` fallback

**Files:** `backend/Code.gs` (+ `Code.LATEST.gs`, new `Code.v16.gs`), `backend/SETUP.md`. **No runtime test** — review-gated.

- [ ] **Step 1: Add `reschedule_`.** Insert near `cancel_`/`book_`:
```js
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
  return json_({ ok: true, eventId: ev.getId(), ref: body.ref || '' });
}
function hourFromLabel_(label) {
  var m = /(\d+):(\d+)\s*(AM|PM)/i.exec(label || ''); if (!m) return null;
  var h = parseInt(m[1], 10) % 12; if (/PM/i.test(m[3])) h += 12; return h;
}
```

- [ ] **Step 2: Route `reschedule`.** In `doPost`, add: `if (body.action === 'reschedule') return reschedule_(body);`.

- [ ] **Step 3: `planScheduleEmail_` body fallback (Bug 4).** In `planScheduleEmail_`, replace the `if (!raw) return json_({ ok:false, reason:'plan not found' });` early-return so that when the stored plan is missing it composes from the body instead:
```js
  var plan;
  if (raw) { try { plan = JSON.parse(raw); } catch (e) { plan = null; } }
  if (!plan) { plan = { holder: body.holder || '', name: body.plan || '', ref: body.ref || '', coach: '', sessions: [] }; }
```
(Leave the rest — it already prefers `body.sessions`.)

- [ ] **Step 4: Version bump.** Change the `version` response from `db-v15` to `db-v16`, keep all flags incl. `contentStore: true`, add `reschedule: true`.

- [ ] **Step 5: Sync the 3 `.gs` files** (`cp backend/Code.gs backend/Code.LATEST.gs && cp backend/Code.gs backend/Code.v16.gs && diff … && echo SYNCED`).

- [ ] **Step 6: SETUP.md checklist** — append "## db-v16 deploy & verify": deploy, confirm `?action=version`=`db-v16` with `reschedule:true`; then on the live site reschedule a session (it moves, no duplicate) and self-schedule a pass session (a confirmation email arrives + it shows in admin Plans & Sessions).

- [ ] **Step 7: Commit.**
```bash
git add backend/Code.gs backend/Code.LATEST.gs backend/Code.v16.gs backend/SETUP.md
git commit -m "db-v16: reschedule action (move in place) + planScheduleEmail body fallback"
```

---

### Task 2: Bug 2 — defensively filter past slots (frontend)

**Files:** `index.html` + mirror.

- [ ] **Step 1: Filter `loadSlots` results.** Find `loadSlots(dateStr)`; in its `.then(data => {...})`, after building `slots`, change the `this.setState({ slots, … })` to use `slots.filter(function (s) { return !this.isPastSlot(dateStr, s.time); }.bind(this))`. (Or assign `slots = slots.filter(...)` before setState.)

- [ ] **Step 2: Filter `loadEditSlots` results** the same way (its `editSlots` mapping).

- [ ] **Step 3: Mirror** (`cp …`; `diff … && echo IDENTICAL`).

- [ ] **Step 4: Verify (Playwright stub).** Create `_verify_bug.mjs` (reuse across tasks). Stub `?action=availability` to return slots INCLUDING a clearly-past hour for today's date (compute via the page's clock) and a future hour; pick today's date in the booking form → assert the past hour's button is absent and the future hour present. Reuse the harness skeleton from prior plans (serve repo, cached chromium, stub fetch). Run `node _verify_bug.mjs`; expected PASS. Mirror IDENTICAL.

- [ ] **Step 5: Commit.**
```bash
git add index.html "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Bug2: never show past time slots — filter loadSlots/loadEditSlots via isPastSlot"
```

---

### Task 3: Bug 1 + Bug 4 — reschedule-in-place wiring + schedule-email holder/plan

**Files:** `index.html` + mirror.

- [ ] **Step 1: Bug 1 — `saveEdit` calls `reschedule`.** In `saveEdit(entry)`, replace the `this.cancelBooking(entry, false, 'reschedule').then(() => fetch(book …))` block with a single `reschedule` POST:
```js
    fetch(ep, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'reschedule', eventId: entry.eventId || '', ref: entry.ref || '', date: entry.date || '', time: entry.time || '', newDate: date, newTime: time, name: entry.name || '', email: entry.email || '' })
    }).then(function (r) { return r.json(); }).then(function (res) {
      if (res && res.ok) { applyLocal((res.eventId || entry.eventId), (res.ref || entry.ref)); }
      else { applyLocal(entry.eventId, entry.ref); }   // backend lacks reschedule → no-op move; keep one entry
    }.bind(this)).catch(function () { applyLocal(entry.eventId, entry.ref); });
```
This moves the existing event (no cancel+rebook), so no duplicate. (`applyLocal` already replaces the single local entry by `ts`.)

- [ ] **Step 2: Bug 4 — pass `holder`+`plan` into the schedule email.** In `emailPlanSchedule(email, ts, opts)`, add `holder` and `plan` (pass name) to the `payload` from the live plan copy:
```js
      holder: (plan.holder || ''), plan: (plan.name || ''),
```
(So the backend can compose the email even if its stored copy is momentarily missing.)

- [ ] **Step 3: Mirror.**

- [ ] **Step 4: Verify (stub).** Extend `_verify_bug.mjs`: (a) Bug 1 — stub `reschedule` to return `{ok:true, eventId:'ev2', ref:'R1'}`; in My Bookings, reschedule a seeded session to a new time → assert the page calls `action:'reschedule'` and the My Bookings list shows exactly ONE session (the moved one), not two. (b) Bug 4 — self-schedule a pass session → assert the `planScheduleEmail` POST body includes non-empty `holder` and `plan`. Run; expected PASS. Mirror IDENTICAL.

- [ ] **Step 5: Commit.**
```bash
git add index.html "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Bug1: reschedule moves the event in place (no duplicate); Bug4: send holder+plan in schedule email"
```

---

### Task 4: Bug 3 — self-scheduled session reaches admin; end-to-end verify + cleanup

**Files:** `index.html` + mirror; `_verify_bug.mjs` (deleted at end).

- [ ] **Step 1: Reproduce.** With `_verify_bug.mjs`: as a customer, self-schedule a pass session (cap-aware, from sub-project B); capture the `savePlan` POST body and assert it carries the new session in `plan.sessions`. Then simulate the admin view: stub `?action=plans` to return that updated plan and confirm the admin **Plans & Sessions** (`adminPlanRows`/`remotePlans`) renders the session. This pins whether the gap is the SAVE (session not sent) or the READ (admin not refreshing).
- [ ] **Step 2: Fix the identified gap (minimal).**
  - If the save omits the session: ensure `addAcctPlanSession`→`addPlanSession`→`pushPlan` serializes the updated `plan.sessions` (it should — confirm and fix only if broken).
  - If it's a refresh gap: after a successful self-schedule, call `this.loadRemotePlans()` so the admin's next read includes it, and ensure the admin Plans tab triggers `loadRemotePlans` on open. Add the smallest change that makes the reproduced gap pass.
  Show the exact diff you applied in the report.
- [ ] **Step 3: Mirror** (`cp …`; `diff … && echo IDENTICAL`).
- [ ] **Step 4: Full run.** One `node _verify_bug.mjs` green across Bug2 (past slot filtered), Bug1 (single moved entry + `reschedule` called), Bug4 (holder/plan in email body), Bug3 (savePlan carries the session + admin renders it). 0 real console errors.
- [ ] **Step 5: Confirm the db-v16 deploy checklist** exists in `backend/SETUP.md` (Task 1 Step 6).
- [ ] **Step 6: Delete scratch.**
```bash
rm -f _verify_bug.mjs _bug*.png
rm -rf node_modules package.json package-lock.json
git status --short
```
- [ ] **Step 7: Commit (the Bug3 fix + any final tweak).**
```bash
git add index.html "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Bug3: self-scheduled pass session reaches admin Plans & Sessions"
```

---

## Self-review notes
- **Spec coverage:** Bug1 (db-v16 reschedule action T1 + saveEdit wiring T3); Bug2 (frontend filter T2); Bug3 (reproduce+fix T4); Bug4 (db-v16 email fallback T1 + holder/plan payload T3). All covered.
- **Backend review-gated** — bugs 1 & 4's backend halves can't be runtime-tested here; the `SETUP.md` checklist is the live proof (reschedule moves, email arrives).
- **db-v16 contract** fixed in Global Constraints; the frontend stub mirrors the `reschedule` + email shapes.
- **Bug 3 is reproduce-first** (its exact trigger wasn't statically certain) — Task 4 pins save-vs-read before the minimal fix.
- **Deploy ordering:** db-v16 first (frontend degrades gracefully on db-v15 — `reschedule` falls back to no-op move keeping one entry; the email just won't send until db-v16), then push the frontend.
