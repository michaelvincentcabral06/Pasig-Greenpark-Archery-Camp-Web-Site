# Activity Log + Admin Tab Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename two admin tab labels and enrich the activity log with an actor (client/admin), more logged events, before→after details, and friendlier wording.

**Architecture:** One additive backend column (`db-v17` Actor) plus frontend changes in the single SuperConductor component in `index.html` (mirrored to `Pasig Greenpark Archery Camp.dc.html`). The log's `label` stays a stable short action type (pill + per-action filter); actor is a real field; friendly wording is derived at display time. Tab "renames" change visible labels/copy only — internal `adminTab` keys stay.

**Tech Stack:** SuperConductor template (`{{ }}`, `<sc-if>`, `<sc-for>`), plain class-component JS (modern JS OK in index.html), Google Apps Script backend (ES5 only), Playwright-core for frontend verification with stubbed `fetch`.

## Global Constraints

- **Mirror rule:** every `index.html` edit applied identically to `Pasig Greenpark Archery Camp.dc.html`; after each frontend task `diff index.html "Pasig Greenpark Archery Camp.dc.html"` prints nothing (IDENTICAL).
- **Backend ES5 only:** `var`/`function`, no arrow/`const`/`let`/template-literals, trailing-underscore privates. Three `.gs` files byte-identical: `backend/Code.gs`, `backend/Code.LATEST.gs`, new `backend/Code.v17.gs`. Apps Script cannot be tested here — backend is review-gated + a `backend/SETUP.md` checklist.
- **Version response:** `db-v17`, keeping EVERY prior flag (incl. `reschedule`, `contentStore`) and adding `activityActor: true`.
- **Deploy ordering:** db-v17 deploys before the frontend is pushed; the frontend degrades gracefully on db-v16 (actor dropped → blank badge, no breakage).
- **`label` stays a stable short action type** (used by the pill + per-action filter); friendly wording is derived at display, never stored. Actor values are exactly `'client'` or `'admin'` (or `''` for legacy).
- **Verification:** Playwright-core driving the running component with `fetch` stubbed; chromium at `C:\Users\Michael Cabral\AppData\Local\ms-playwright\chromium-1228\chrome-win64\chrome.exe`; install once if missing: `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright-core --no-save`. Frontend harness `_verify_act.mjs` (scratch; deleted in the final task). Real console errors must be 0.

---

### Task 1: Backend db-v17 — additive `Actor` column

Add `Actor` to the Activity log so the frontend can store/filter who did each action. Review-gated; verified live via the SETUP.md checklist.

**Files:**
- Modify: `backend/Code.gs` (schema, `dbLog_`, `logAction_`, `listActivity_`, version)
- Sync: `backend/Code.LATEST.gs` (identical), create `backend/Code.v17.gs` (identical)
- Modify: `backend/SETUP.md` (append db-v17 checklist)

**Interfaces:**
- Produces: `logAction` POST now accepts `actor`; `?action=activity` entries include `actor`; `?action=version` returns `db-v17` + `activityActor:true`. Tasks 3-4 (frontend) rely on these.

- [ ] **Step 1: Add the Actor column to the Activity schema.** In `backend/Code.gs` (~line 87), change the activity headers:
```js
  activity: { name: 'Activity',      headers: ['At','Ref','Action','Detail','Name','Email','Actor'] }
```

- [ ] **Step 2: Thread `actor` through `dbLog_`.** Replace the `dbLog_` function (~line 113):
```js
function dbLog_(ref, action, detail, name, email, actor) { dbAppend_('activity', [nowStr_(), ref || '', action || '', detail || '', name || '', email || '', actor || '']); }
```

- [ ] **Step 3: Pass `body.actor` in `logAction_`.** In `logAction_` (~line 847), change the `dbLog_` call:
```js
function logAction_(body) {
  dbLog_(body.ref || '', body.label || '', body.detail || '', body.name || '', body.email || '', body.actor || '');
  return json_({ ok: true });
}
```

- [ ] **Step 4: Return `actor` from `listActivity_`.** In `listActivity_` (~line 840), add the field to each pushed object:
```js
      out.push({ at: String(row[0] || ''), ref: String(row[1] || ''), action: String(row[2] || ''), detail: String(row[3] || ''), name: String(row[4] || ''), email: String(row[5] || ''), actor: String(row[6] || '') });
```

- [ ] **Step 5: Bump the version.** Find the version response object (the one returning `version: 'db-v16'` with its flags). Change `version` to `'db-v17'` and add `activityActor: true`, keeping ALL existing flags. Example shape (keep whatever flags already exist):
```js
  return json_({ version: 'db-v17', /* ...all existing flags... */ reschedule: true, contentStore: true, activityActor: true });
```

- [ ] **Step 6: Sync the three `.gs` files byte-identical.**
```bash
cp backend/Code.gs backend/Code.LATEST.gs
cp backend/Code.gs backend/Code.v17.gs
diff backend/Code.gs backend/Code.LATEST.gs && diff backend/Code.gs backend/Code.v17.gs && echo IDENTICAL
```

- [ ] **Step 7: Append the deploy checklist to `backend/SETUP.md`.** Add a "## db-v17 deploy & verify" section: paste `Code.gs` into Apps Script → Manage deployments → edit the existing deployment → New version → Deploy (same `/exec`); confirm `?action=version` shows `db-v17` + `activityActor:true` (and all prior flags); do one admin action + one client action on the live site and confirm both appear in the Activity tab with the right badge and the `Actor` column populated in the sheet.

- [ ] **Step 8: Commit.**
```bash
git add backend/Code.gs backend/Code.LATEST.gs backend/Code.v17.gs backend/SETUP.md
git commit -m "db-v17: add Actor column to Activity log (dbLog_/logAction_/listActivity_ + version)"
```

---

### Task 2: Frontend — tab label + copy rename

Rename the two visible tab labels and the copy that names them. Labels only; internal `adminTab` keys (`'bookings'`, `'plans'`) and variable names stay.

**Files:**
- Modify: `index.html` (tab button labels ~1789-1790; Activity-tab copy ~1906, ~1918; any other user-visible "Plans & Sessions")
- Mirror: `Pasig Greenpark Archery Camp.dc.html`
- Test: `_verify_act.mjs`

**Interfaces:**
- Consumes: nothing. Produces: visible labels "Activity" and "Bookings"; no behavior change.

- [ ] **Step 1: Rename the two tab buttons.** In `index.html`:
  - The button bound to `goTabBookings` (~1789) — change its visible text `Bookings` to `Activity`.
  - The button bound to `goTabPlans` (~1790) — change its visible text `Plans &amp; Sessions` to `Bookings`.
  Do NOT change the `onClick` bindings, `adminTab` keys, or `tabBookings`/`tabPlans` variable names.

- [ ] **Step 2: Update the Activity-tab copy.** In `index.html`:
  - ~1906: `…All managing is done in the Plans &amp; Sessions tab.` → `…All managing is done in the Bookings tab.`
  - ~1918 (empty state): `…cancelling, or scheduling in Plans &amp; Sessions will be logged here.` → `…cancelling, or scheduling in Bookings will be logged here.`

- [ ] **Step 3: Catch any remaining user-visible mentions.** Grep `Plans &amp; Sessions` and `Plans & Sessions` in `index.html`. For each match that is **visible admin UI text**, rename to `Bookings`. Leave code/comments and internal keys alone. Record what you changed.
```bash
grep -n "Plans &amp; Sessions\|Plans & Sessions" index.html
```

- [ ] **Step 4: Mirror.** `cp index.html "Pasig Greenpark Archery Camp.dc.html"`; `diff … && echo IDENTICAL`.

- [ ] **Step 5: Verify (labels + tabs).** Create `_verify_act.mjs` (the shared frontend harness): serve the repo, reach the admin view (set `state.admin`/`adminTab` as the prior sub-projects' harnesses did, or log in through the admin gate), and assert: the tab bar shows a button reading exactly `Activity` and one reading exactly `Bookings`; clicking `Activity` shows the activity log panel (the "Activity log" heading) and clicking `Bookings` shows the bookings panel (the ex–Plans & Sessions content); `page.content()` has no remaining `Plans & Sessions` in admin-visible text. Run `node _verify_act.mjs`; expected PASS, 0 real console errors. Confirm mirror IDENTICAL.

- [ ] **Step 6: Commit.**
```bash
git add index.html "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Activity F2: rename admin tabs (Bookings→Activity, Plans & Sessions→Bookings) + copy"
```

---

### Task 3: Frontend — `logAction` actor + enriched callers + new events

Add an `actor` argument to `logAction`, tag every existing caller, enrich coach detail, and log three events that aren't recorded today.

**Files:**
- Modify: `index.html` — `logAction` (~3374); `addPlanSession` (~3717) signature; `addAcctPlanSession` (~3706); the existing `logAction` callers (~3667, 3704, 3784, 3839, 3878); `purchasePlan` (~3515); `addAcctPlan` (~3525); `removeAcctPlan` (~3532); `saveEdit` (~3463)
- Mirror: `Pasig Greenpark Archery Camp.dc.html`
- Test: `_verify_act.mjs`

**Interfaces:**
- Consumes: db-v17 `logAction` accepting `actor` (Task 1).
- Produces: every `logAction` POST carries `actor` (`'client'`/`'admin'`); three new event types logged (`Pass purchased`, `Pass removed`, `Rescheduled`); `Coach changed` detail is `prev → new`.

- [ ] **Step 1: Add `actor` to `logAction`.** Replace `logAction` (~3374):
```js
  logAction(ref, label, detail, name, email, actor) {
    const ep = this.endpoint(); if (!ep) return;
    try {
      fetch(ep, {
        method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'logAction', ref: ref || '', label: label || '', detail: detail || '', name: name || '', email: email || '', actor: actor || '' }),
      }).then(() => setTimeout(() => this.loadActivity(), 600)).catch(() => {});
    } catch (e) {}
  }
```

- [ ] **Step 2: Tag the admin callers `'admin'`.** Append `, 'admin'` to these existing `logAction` calls:
  - Cancelled (~3667), Approved (~3704), Session removed (~3878).
  For **Coach changed** (~3784), also rewrite the detail to before→after (the function already has `prevName` and `newName` in scope):
```js
    this.logAction(planRef, 'Coach changed', (prevName || 'Unassigned') + ' → ' + (newName || 'Unassigned') + ' · ' + ((plan && plan.holder) || ''), (plan && plan.holder) || email, email, 'admin');
```

- [ ] **Step 3: Thread `actor` through `addPlanSession` (default admin) and pass `'client'` from the customer path.**
  - Change the signature and the scheduling log line in `addPlanSession` (~3717):
```js
  addPlanSession(email, ts, date, time, cap, actor) {
```
    and its `logAction` call (~3839):
```js
    this.logAction(planRef, 'Session scheduled', date + ' · ' + time + ' · ' + ((existing && existing.holder) || ''), (existing && existing.holder) || email, email, actor || 'admin');
```
  - In `addAcctPlanSession` (~3706), pass `'client'` when it calls `addPlanSession`:
```js
    this.addPlanSession(email, ts, date, time, cap, 'client');
```

- [ ] **Step 4: Log pass purchases (`'client'`).**
  - In `purchasePlan` (~3515), after `this.pushPlan(email, newPlan, ...)`:
```js
    this.logAction(newPlan.ref || '', 'Pass purchased', pick + ' ' + (newPlan.price || '') + ' · ' + name, name, email, 'client');
```
  - In `addAcctPlan` (~3525), after `this.pushPlan(email, newPlan);`:
```js
    this.logAction(newPlan.ref || '', 'Pass purchased', name + ' ' + (newPlan.price || '') + ' · ' + (newPlan.holder || ''), newPlan.holder || '', email, 'client');
```
  (Note: in `addAcctPlan` the variable `name` is the pass name; the holder is `newPlan.holder`.)

- [ ] **Step 5: Log client pass removal (`'client'`).** In `removeAcctPlan` (~3532), after the plan is removed (after `this.pushRemovePlan(email, ts, 'customer')`), using the `plan` it already looked up:
```js
    if (plan) this.logAction(plan.ref || '', 'Pass removed', (plan.name || 'Pass') + ' · ' + (plan.holder || ''), plan.holder || '', email, 'client');
```

- [ ] **Step 6: Log reschedules (`'client'`).** In `saveEdit` (~3463), inside the success path where the single local entry is updated after a successful `reschedule` (the `res.ok` branch that calls `applyLocal`), add — using the old `entry.date`/`entry.time` and the new `date`/`time`:
```js
        this.logAction(entry.ref || '', 'Rescheduled', this.prettyDateStr(entry.date) + ' ' + entry.time + ' → ' + this.prettyDateStr(date) + ' ' + time + ' · ' + (entry.name || ''), entry.name || '', entry.email || '', 'client');
```
  Place it once, only on a confirmed reschedule (not on the `!ep` local-only early return).

- [ ] **Step 7: Mirror.** `cp` + `diff … && echo IDENTICAL`.

- [ ] **Step 8: Verify (each event logs the right label + actor).** Extend `_verify_act.mjs`; stub `fetch` to capture POST bodies. Reach the relevant flows (reuse the account/admin states from prior sub-projects' harnesses):
  - Customer buys a pass → a `logAction` POST with `label:'Pass purchased'`, `actor:'client'`.
  - Customer self-schedules a session → `label:'Session scheduled'`, `actor:'client'`.
  - Customer reschedules a My-Bookings session → `label:'Rescheduled'`, `actor:'client'`, detail contains `→`.
  - Customer removes a pass → `label:'Pass removed'`, `actor:'client'`.
  - Admin changes a coach → `label:'Coach changed'`, `actor:'admin'`, detail contains `→`.
  - Admin schedules on a plan (the `adminPlanRows` add path) → `label:'Session scheduled'`, `actor:'admin'`.
  Run `node _verify_act.mjs`; expected PASS, 0 real console errors. Confirm mirror IDENTICAL.

- [ ] **Step 9: Commit.**
```bash
git add index.html "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Activity F3: logAction gains actor; tag callers, add pass purchased/removed + reschedule, coach before→after"
```

---

### Task 4: Frontend — display (friendly line + actor badge + filter)

Show a plain-language line and a "by client / by you" badge per entry, and add actor filters. Legacy (blank-actor) entries render the raw action with no badge.

**Files:**
- Modify: `index.html` — `activityRows` builder (~4700-4716), `actFilterOpts` (~4717), the activity filter predicate (~4680-4691), the activity entry markup (~1922-1930)
- Mirror: `Pasig Greenpark Archery Camp.dc.html`
- Test: `_verify_act.mjs`

**Interfaces:**
- Consumes: activity entries with `actor` (Task 1 backend; stubbed in tests).
- Produces: each `activityRows` row gains `actor`, `hasActor`, `actorText`, `actorBg`, `actorFg`, `friendly`; `actFilterOpts` gains two actor options; the filter predicate honors `actor:*` ids.

- [ ] **Step 1: Add a friendly-wording helper.** Add this method near `logAction`/`loadActivity` (~3383):
```js
  activityFriendly(action, actor) {
    const map = {
      'Session scheduled': { client: 'Client booked a session', admin: 'You booked a session' },
      'Rescheduled': { client: 'Client rescheduled a session', admin: 'You rescheduled a session' },
      'Pass purchased': { client: 'Client bought a pass', admin: 'You added a pass' },
      'Pass removed': { client: 'Client removed a pass', admin: 'You removed a pass' },
      'Session removed': { client: 'Client removed a session', admin: 'You removed a session' },
      'Cancelled': { client: 'Client cancelled', admin: 'You cancelled a pass' },
      'Approved': { admin: 'You approved a pass' },
      'Coach changed': { admin: 'You changed the coach' },
    };
    const m = map[action];
    if (m && actor && m[actor]) return m[actor];
    return action || '';   // unknown action or blank actor → raw label
  }
```

- [ ] **Step 2: Enrich the `activityRows` rows.** In the `activityRows` map (~4708-4715 returned object), add these fields (compute `const actor = String(a.actor || '');` at the top of the map callback):
```js
        actor: actor,
        hasActor: actor === 'client' || actor === 'admin',
        actorText: actor === 'client' ? 'by client' : (actor === 'admin' ? 'by you' : ''),
        actorBg: actor === 'client' ? '#dce9f5' : '#e6efd6',
        actorFg: actor === 'client' ? '#2c5b86' : '#4d7327',
        friendly: this.activityFriendly(a.action || '', actor),
```

- [ ] **Step 3: Add the actor filter options.** Replace `actFilterOpts` (~4717-4720):
```js
    const actFilterOpts = [
      { id: 'all', name: 'All actions' }, { id: 'approved', name: 'Approved' },
      { id: 'cancelled', name: 'Cancelled' }, { id: 'coach', name: 'Coach changes' }, { id: 'scheduled', name: 'Scheduling' },
      { id: 'actor:client', name: 'By client' }, { id: 'actor:admin', name: 'By you (admin)' },
    ];
```

- [ ] **Step 4: Honor `actor:*` in the filter predicate.** In the `actFiltered` filter (~4680-4691), add an actor branch at the top of the callback (before the per-action checks):
```js
      if (actFilter.indexOf('actor:') === 0) { if (String(a.actor || '') !== actFilter.slice(6)) return false; }
```
  (The existing per-action `if (actFilter === 'approved' …)` checks stay; they simply don't match an `actor:` id. The text-search block stays as-is.)

- [ ] **Step 5: Update the entry markup.** In the activity entry (`<sc-for list="{{ activityRows }}" as="a">`, ~1922-1930):
  - Keep the existing colored action pill (`{{ a.action }}`).
  - Immediately after it, add the actor badge (gated):
```html
                <sc-if value="{{ a.hasActor }}" hint-placeholder-val="{{ false }}"><span style="font-family:'Spline Sans Mono',monospace;font-size:10.5px;font-weight:700;letter-spacing:0.04em;background:{{ a.actorBg }};color:{{ a.actorFg }};padding:5px 11px;border-radius:999px;">{{ a.actorText }}</span></sc-if>
```
  - Make the bold line show the friendly wording: change the existing bold `<div>` that currently renders the ref/name so the **friendly line** is the bold line and the ref · name sits beneath it. Replace the block at ~1924-1926:
```html
                <div style="flex:1;min-width:180px;">
                  <div style="font-size:14px;font-weight:700;color:#1b2a1f;">{{ a.friendly }}</div>
                  <div style="font-size:12.5px;color:#56664f;font-family:'Spline Sans Mono',monospace;margin-top:2px;"><sc-if value="{{ a.hasRef }}" hint-placeholder-val="{{ true }}">{{ a.ref }}</sc-if><sc-if value="{{ a.hasName }}" hint-placeholder-val="{{ false }}"> · {{ a.name }}</sc-if></div>
                  <sc-if value="{{ a.hasDetail }}" hint-placeholder-val="{{ false }}"><div style="font-size:12.5px;color:#56664f;font-family:'Spline Sans Mono',monospace;margin-top:2px;">{{ a.detail }}</div></sc-if>
                  <sc-if value="{{ a.hasPhone }}" hint-placeholder-val="{{ false }}"><div style="font-size:12.5px;color:#3c6b48;font-family:'Spline Sans Mono',monospace;margin-top:2px;">📞 <a href="{{ a.callHref }}" style="color:#3c6b48;text-decoration:none;font-weight:700;">{{ a.phone }}</a></div></sc-if>
                </div>
```

- [ ] **Step 6: Mirror.** `cp` + `diff … && echo IDENTICAL`.

- [ ] **Step 7: Verify (badges, friendly line, filter).** Extend `_verify_act.mjs`; stub `?action=activity` to return three entries — `{action:'Session scheduled', actor:'client', ref, name, detail}`, `{action:'Coach changed', actor:'admin', detail:'Maria → John · Juan'}`, and a legacy `{action:'Approved', actor:'', ...}`. Reach the Activity tab and assert:
  - the client entry shows a "by client" badge and the friendly line "Client booked a session";
  - the admin entry shows "by you" and "You changed the coach", detail contains `→`;
  - the legacy entry shows NO actor badge and the raw "Approved" as its line;
  - selecting **By client** leaves only the client entry; **By you (admin)** only the admin entry; a per-action filter (e.g. Scheduling) still works; "clear filters" restores all three.
  Run `node _verify_act.mjs`; expected PASS, 0 real console errors. Confirm mirror IDENTICAL.

- [ ] **Step 8: Full run + cleanup.** Run the whole `_verify_act.mjs` once (Tasks 2-4 assertions green); confirm mirror IDENTICAL. Then delete scratch:
```bash
rm -f _verify_act.mjs _act*.png
rm -rf node_modules package.json package-lock.json
git status --short
```
(Working tree should show only the two HTML files modified across the frontend tasks, plus possibly a pre-existing `.claude/settings.local.json` — do NOT commit that.)

- [ ] **Step 9: Commit.**
```bash
git add index.html "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Activity F4: friendly wording + actor badge per entry, By client / By you filters"
```

---

## Self-review notes

- **Spec coverage:** tab rename labels+copy (T2); db-v17 Actor column + version (T1); logAction actor + 3 new events + coach/reschedule before→after (T3); friendly line + actor badge + actor filter + legacy fallback (T4). All spec sections map to a task.
- **Deploy ordering:** T1 backend deploys first (db-v17); frontend (T2-T4) merges but pushes after deploy; degrades on db-v16 (actor blank). Stated in Global Constraints.
- **Stable label / friendly-at-display:** T3 keeps `label` as the action type; T4 derives friendly wording and never stores it — the per-action filter and pill keep working.
- **Legacy safety:** blank-actor entries → no badge, raw action as the friendly line (T4 Step 1 fallback + Step 2 `hasActor`).
- **Type/name consistency:** `actor` values `'client'`/`'admin'`/`''` are produced in T1 (backend) + T3 (POST) and consumed in T4 (display/filter); `activityFriendly(action, actor)` defined and used in T4; row fields `hasActor`/`actorText`/`actorBg`/`actorFg`/`friendly` produced in T4 Step 2 and consumed in T4 Step 5 markup; `addPlanSession(…, actor)` defined in T3 Step 3 and called with `'client'`/default `'admin'`.
- **Mirror discipline:** every frontend task ends with `cp` + `diff … && echo IDENTICAL`; the three `.gs` files byte-identical (T1 Step 6); scratch removed in T4 Step 8.
