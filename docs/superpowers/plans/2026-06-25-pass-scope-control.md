# Pass Scope Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every pass an explicit session-count cap and a rolling-days validity window, stamp both onto each pass at purchase, enforce them at scheduling, and let admin add/remove passes and edit each pass's bullets, cap, and validity.

**Architecture:** All changes live in the single SuperConductor component in `index.html` (mirrored byte-for-byte to `Pasig Greenpark Archery Camp.dc.html`). Passes already live in the server-backed content store (`cm.packages`); we extend that model and add resolver methods that read a stamped value → live package → legacy regex, never returning 0/NaN. No backend/Apps Script change — it rides on the existing db-v15 `setContent`/`content`.

**Tech Stack:** SuperConductor template framework (`{{ }}` bindings, `<sc-if>`, `<sc-for>`), plain class-component JS (modern JS is fine here — the ES5 restriction is backend-only), Playwright-core for verification with a stubbed `fetch`.

## Global Constraints

- **Mirror rule:** every `index.html` edit is applied identically to `Pasig Greenpark Archery Camp.dc.html`; after each task `diff index.html "Pasig Greenpark Archery Camp.dc.html"` prints nothing (IDENTICAL).
- **No backend change.** No Apps Script edit, no version bump. Persistence is the existing content store via `persistContent`/`saveCM` and the existing `pushPlan`/`savePlan`.
- **Validity = rolling days from purchase.** Expiry date = purchase date + `validDays`, inclusive.
- **Cap = a required number** (no "unlimited" option in the admin UI). Monthly Member default = 10.
- **Rules are stamped at purchase** (`cap`, `validDays`, `expiry` copied onto the plan) so later admin edits never retroactively change an existing customer's pass.
- **Resolvers must never return 0/NaN.** A missing/blank field degrades to "no expiry / legacy cap", never to "blocked" or accidental "unlimited".
- **Expired/full passes stay visible (greyed)** with a short note; the Schedule button is hidden. Already-scheduled sessions still render.
- **Date math** uses the codebase's existing local `YYYY-MM-DD` convention (string compare is chronological for that format), consistent with `todayStr()` and `new Date(str + 'T00:00:00')` parsing used elsewhere.
- **Verification** is Playwright-core driving the running component with `fetch` stubbed; the chromium binary is at `C:\Users\Michael Cabral\AppData\Local\ms-playwright\chromium-1228\chrome-win64\chrome.exe`. Install once if missing: `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright-core --no-save`. The harness file is `_verify_pass.mjs` (scratch; deleted in the final task). Real console errors must be 0 (favicon 404 / OSM-iframe noise may be filtered).

---

### Task 1: Pass model defaults + resolver helpers

Adds the data fields and the read-side resolvers everything else depends on. No behavior change yet — just new methods returning correct values, plus `sessions`/`validDays` on the default packages.

**Files:**
- Modify: `index.html` (add ~7 instance methods; move the `defaultPackages` literal into a method; add `sessions`/`validDays` to the 4 defaults)
- Mirror: `Pasig Greenpark Archery Camp.dc.html`
- Test: `_verify_pass.mjs` (scratch)

**Interfaces:**
- Produces (instance methods on the component, used by Tasks 2-5):
  - `defaultPackages()` → array of the 4 default package objects, each now including `sessions` (int) and `validDays` (int).
  - `mergedPackages()` → `(this.state.content && this.state.content.packages && this.state.content.packages.length) ? this.state.content.packages : this.defaultPackages()`.
  - `packageByName(name)` → the matching package object from `mergedPackages()`, or `null`.
  - `tsToDateStr(ts)` → local `'YYYY-MM-DD'` for a purchase timestamp, or `''`.
  - `addDaysStr(dateStr, n)` → `'YYYY-MM-DD'` n days after `dateStr`, or `''`.
  - `legacyCapFromName(name)` → the *current* regex cap logic (`"N session|class|visit"` → N; `month|unlimited` → `null`; else `1`).
  - `planCap(plan)` → stamped `plan.cap` → package `sessions` → `legacyCapFromName`; integer ≥ 1, or `null` only via the legacy month/unlimited path.
  - `planExpiry(plan)` → stamped `plan.expiry` → compute from `plan.validDays`/package `validDays` + `plan.ts`; `'YYYY-MM-DD'` or `''`.
  - `isPlanExpired(plan)` → `!!planExpiry(plan) && this.todayStr() > planExpiry(plan)`.

- [ ] **Step 1: Add the resolver + helper methods.** Place these methods next to the existing pass helpers (near `acctPlansKey`/`findPlan`, ~index.html:3142-3160). Use exactly these bodies:

```js
  defaultPackages() {
    return [
      { name: 'Day Pass', price: '₱600', unit: '', desc: 'A single guided session with all gear included.', features: ['1 guided session', 'All equipment provided', 'Beginner-friendly'], sessions: 1, validDays: 30, popular: false, bg: '#fffdf6', fg: '#1b2a1f', border: 'rgba(36,66,50,0.12)', tick: '#3c6b48', btnBg: '#244232', btnFg: '#f4efe4' },
      { name: 'Starter Pack', price: '₱2,000', unit: '/ 4 sessions', desc: 'Four sessions to build a real foundation.', features: ['4 sessions', 'Equipment included', 'Progress card', 'Valid for 2 months'], sessions: 4, validDays: 60, popular: true, bg: '#244232', fg: '#f4efe4', border: '#244232', tick: '#7fb43f', btnBg: '#7fb43f', btnFg: '#1b2a1f' },
      { name: 'Monthly Member', price: '₱3,500', unit: '/ month', desc: 'Unlimited open range plus two classes a week.', features: ['Unlimited open range', '2 classes / week', 'Member events', '10% off pro-shop'], sessions: 10, validDays: 30, popular: false, bg: '#fffdf6', fg: '#1b2a1f', border: 'rgba(36,66,50,0.12)', tick: '#3c6b48', btnBg: '#244232', btnFg: '#f4efe4' },
      { name: 'Private Coaching', price: '₱1,200', unit: '/ hour', desc: 'Personalized one-on-one coaching.', features: ['1:1 with a coach', 'Video form review', 'Custom training plan'], sessions: 1, validDays: 60, popular: false, bg: '#fffdf6', fg: '#1b2a1f', border: 'rgba(36,66,50,0.12)', tick: '#3c6b48', btnBg: '#244232', btnFg: '#f4efe4' },
    ];
  }
  mergedPackages() {
    const c = this.state.content || {};
    return (c.packages && c.packages.length) ? c.packages : this.defaultPackages();
  }
  packageByName(name) {
    return this.mergedPackages().filter(p => p.name === name)[0] || null;
  }
  tsToDateStr(ts) {
    try { const d = new Date(ts); if (isNaN(d.getTime())) return ''; return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); } catch (e) { return ''; }
  }
  addDaysStr(dateStr, n) {
    if (!dateStr) return '';
    const p = String(dateStr).split('-'); if (p.length !== 3) return '';
    const d = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
    d.setDate(d.getDate() + (parseInt(n, 10) || 0));
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  legacyCapFromName(name) {
    const pk = this.packageByName(name);
    const hay = ((pk && pk.unit) || '') + ' ' + (name || '');
    const m = /(\d+)\s*(session|class|visit)/i.exec(hay);
    if (m) return parseInt(m[1], 10);
    if (/month|unlimited/i.test(hay)) return null;
    return 1;
  }
  planCap(plan) {
    if (plan && plan.cap != null && plan.cap !== '') { const c = parseInt(plan.cap, 10); return (c > 0) ? c : 1; }
    const pk = this.packageByName(plan && plan.name);
    if (pk && pk.sessions != null && pk.sessions !== '') { const s = parseInt(pk.sessions, 10); return (s > 0) ? s : 1; }
    return this.legacyCapFromName(plan && plan.name);
  }
  planExpiry(plan) {
    if (!plan) return '';
    if (plan.expiry) return plan.expiry;
    let days = (plan.validDays != null && plan.validDays !== '') ? parseInt(plan.validDays, 10) : null;
    if (days == null) { const pk = this.packageByName(plan.name); days = (pk && pk.validDays != null && pk.validDays !== '') ? parseInt(pk.validDays, 10) : null; }
    if (days == null || isNaN(days) || !plan.ts) return '';
    return this.addDaysStr(this.tsToDateStr(plan.ts), days);
  }
  isPlanExpired(plan) { const e = this.planExpiry(plan); return !!e && this.todayStr() > e; }
```

- [ ] **Step 2: Repoint the render to the new `defaultPackages()` method.** At the existing `const defaultPackages = [ ... ]` literal (index.html ~3811-3815, inside the big render method), replace the whole literal with:

```js
    const defaultPackages = this.defaultPackages();
```
Leave the `const cm = this.mergedContent({ packages: defaultPackages, ... })` line (~3825) unchanged — it still passes `defaultPackages` as the fallback, now sourced from the method.

- [ ] **Step 3: Mirror.** `cp index.html "Pasig Greenpark Archery Camp.dc.html"` then `diff index.html "Pasig Greenpark Archery Camp.dc.html" && echo IDENTICAL`.

- [ ] **Step 4: Verify the resolvers (write the harness assertion, see it pass).** Create `_verify_pass.mjs`: serve the repo, load the page, and `page.evaluate` against the live component instance (reach it via the React fiber on the root node, the same technique the bug-batch harness used). Drive these assertions:
  - `planCap({ name: 'Monthly Member' })` === `10` (package default).
  - `planCap({ cap: 3, name: 'Monthly Member' })` === `3` (stamped wins).
  - `planCap({ name: 'Day Pass' })` === `1`.
  - `planCap({ name: 'Totally Unknown Pass' })` === `1` (legacy fallback, no package, no digits).
  - `planExpiry({ ts: <fixed ms for 2026-06-01>, validDays: 30 })` === `'2026-07-01'`.
  - `planExpiry({ expiry: '2026-08-15' })` === `'2026-08-15'` (stamped wins).
  - `planExpiry({ name: 'Day Pass' })` === `''` (no ts → not resolvable, legacy-safe).
  - `isPlanExpired({ expiry: '2000-01-01' })` === `true`; `isPlanExpired({ expiry: '2999-01-01' })` === `false`.
  Pin "today" by patching the instance's `nowManila`/`todayStr` if needed (the bug-batch harness patched the instance, not the prototype). Run `node _verify_pass.mjs`; expected: all assertions pass, 0 real console errors.

- [ ] **Step 5: Commit.**
```bash
git add index.html "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Pass scope T1: pass cap/validity defaults + planCap/planExpiry resolvers (stamped→package→legacy)"
```

---

### Task 2: Stamp cap + validity + expiry at purchase

Every newly bought pass carries its own `cap`, `validDays`, and computed `expiry`, so later admin edits never change it.

**Files:**
- Modify: `index.html` — `purchasePlan` (~3508-3524) and `addAcctPlan` (~3525-3531)
- Mirror: `Pasig Greenpark Archery Camp.dc.html`
- Test: `_verify_pass.mjs`

**Interfaces:**
- Consumes: `packageByName`, `tsToDateStr`, `addDaysStr` (Task 1).
- Produces: purchased plan objects now include `cap` (int), `validDays` (int or `null`), `expiry` (`'YYYY-MM-DD'` or `''`). Tasks 3-4 read these via `planCap`/`planExpiry` (which already prefer stamped values).

- [ ] **Step 1: Add a stamping helper next to the purchase methods** (just above `purchasePlan`, ~index.html:3507):

```js
  stampPassScope(name, ts) {
    const pk = this.packageByName(name) || {};
    const cap = (pk.sessions != null && pk.sessions !== '') ? (parseInt(pk.sessions, 10) || 1) : this.planCap({ name: name });
    const validDays = (pk.validDays != null && pk.validDays !== '') ? (parseInt(pk.validDays, 10) || null) : null;
    const expiry = (validDays != null) ? this.addDaysStr(this.tsToDateStr(ts), validDays) : '';
    return { cap: cap, validDays: validDays, expiry: expiry };
  }
```

- [ ] **Step 2: Stamp in `purchasePlan`.** Replace the `const newPlan = { ... }` line (index.html ~3515) with:

```js
    const _pts = Date.now();
    const _scope = this.stampPassScope(pick, _pts);
    const newPlan = { name: pick, ts: _pts, holder: name, phone: (this.state.planPhone || '').trim(), price: this.passPrice(pick), ref: this.bookingRef(this.todayStr()), cap: _scope.cap, validDays: _scope.validDays, expiry: _scope.expiry, updatedAt: _pts };
```
(The subsequent `this.pushPlan(email, newPlan, ...)` already serializes the whole plan, so `cap`/`validDays`/`expiry` reach the backend/admin unchanged.)

- [ ] **Step 3: Stamp in `addAcctPlan`.** Replace the `const newPlan = { ... }` line (index.html ~3527) with:

```js
    const _pts = Date.now();
    const _scope = this.stampPassScope(name, _pts);
    const newPlan = { name: name, ts: _pts, holder: this.state.acctName || '', price: this.passPrice(name), ref: this.bookingRef(this.todayStr()), cap: _scope.cap, validDays: _scope.validDays, expiry: _scope.expiry, updatedAt: _pts };
```

- [ ] **Step 4: Mirror.** `cp` + `diff … && echo IDENTICAL`.

- [ ] **Step 5: Verify (stamping reaches the saved plan).** Extend `_verify_pass.mjs`: stub `fetch` to capture POST bodies. Stub `?action=content` to return packages including `Monthly Member { sessions: 2, validDays: 5 }`. Drive a purchase of Monthly Member (the Passes page `purchasePlan` flow, or call the instance method with the form state set). Assert:
  - the captured `savePlan` POST body's `plan` has `cap === 2`, `validDays === 5`, and a non-empty `expiry` string equal to purchase-date + 5 days.
  - Then simulate an admin edit changing the package's `validDays` to 99 (`setContent`/state.content update) and re-read the *already-bought* plan: `planExpiry(boughtPlan)` is unchanged (still the stamped value, not 99 days). 
  Run `node _verify_pass.mjs`; expected PASS.

- [ ] **Step 6: Commit.**
```bash
git add index.html "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Pass scope T2: stamp cap/validDays/expiry onto each pass at purchase"
```

---

### Task 3: Enforce cap + validity at scheduling (logic)

Repoint the cap lookups to the new resolver and reject session dates past expiry, in both the customer and admin scheduling writers.

**Files:**
- Modify: `index.html` — remove local `capFor` (~4222-4229) and `planCapFor` (~4377-4384); update their 3 call sites; add expiry guards in `addPlanSession` (~3717) and `addAcctPlanSession` (~3706)
- Mirror: `Pasig Greenpark Archery Camp.dc.html`
- Test: `_verify_pass.mjs`

**Interfaces:**
- Consumes: `planCap(plan)`, `planExpiry(plan)` (Task 1).
- Produces: `addPlanSession`/`addAcctPlanSession` now refuse to write a session whose `date > planExpiry(plan)`; all cap math flows through `this.planCap(plan)`.

- [ ] **Step 1: Add a date-pretty helper** (next to `tsToDateStr`, Task 1 location) for the friendly message:

```js
  prettyDateStr(dateStr) {
    try { return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' }); } catch (e) { return dateStr; }
  }
```

- [ ] **Step 2: Replace the two local cap consts with direct resolver calls.**
  - Delete the `const capFor = (name) => { ... };` block (index.html ~4222-4229).
  - At its sole call site in `adminPlanRows` (~4258), change `const cap = capFor(p.name);` to `const cap = this.planCap(p);`.
  - Delete the `const planCapFor = (name) => { ... };` block (~4377-4384).
  - At its call site in `acctPlanRows` (~4394), change `const cap = planCapFor(p.name);` to `const cap = this.planCap(p);`.
  - At its call site for the self-schedule cap (~4714), change `const _schedCap = _schedPlan ? planCapFor(_schedPlan.name) : null;` to `const _schedCap = _schedPlan ? this.planCap(_schedPlan) : null;`.

- [ ] **Step 3: Add the expiry guard to the writer `addPlanSession`** (the function used by both admin and customer paths). At the top of `addPlanSession(email, ts, date, time, cap)` (index.html ~3718), immediately after the existing `if (!date || !time) return;`, insert:

```js
    const _planForExp = this.findPlan(email, ts);
    const _exp = this.planExpiry(_planForExp);
    if (_exp && date > _exp) { this.setState({ acctSchedMsg: 'This pass is valid through ' + this.prettyDateStr(_exp) + '.' }); return; }
```

- [ ] **Step 4: Add a friendly pre-check in `addAcctPlanSession`** (customer entry point) so the message shows even before the writer runs. After the existing cap check (the `if (cap != null && curCount >= cap) { ... return; }` line, index.html ~3710), insert:

```js
    const _exp2 = this.planExpiry(plan);
    if (_exp2 && date > _exp2) { this.setState({ acctSchedMsg: 'This pass is valid through ' + this.prettyDateStr(_exp2) + '. Pick an earlier date.' }); return; }
```

- [ ] **Step 5: Mirror.** `cp` + `diff … && echo IDENTICAL`.

- [ ] **Step 6: Verify (cap + validity block writes).** Extend `_verify_pass.mjs`:
  - **Cap:** seed a customer plan for a pass with `cap: 2` already holding 2 sessions; call `addAcctPlanSession(email, ts, <valid future date ≤ expiry>, '9:00 AM', 2)`; assert no `savePlan`/`book` write fired and the plan still has 2 sessions.
  - **Validity:** seed a plan with `expiry` 5 days out; call `addPlanSession(email, ts, <date 10 days out>, '9:00 AM', 5)`; assert no session was added and no calendar `book` POST fired; then call with `<date 3 days out>` and assert the session WAS added (one `book` POST, sessions length +1).
  Run `node _verify_pass.mjs`; expected PASS.

- [ ] **Step 7: Commit.**
```bash
git add index.html "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Pass scope T3: enforce cap (planCap) + reject sessions past expiry in both schedulers"
```

---

### Task 4: Scheduling UI — block past-expiry dates + status copy

Surface expiry to customers and admin, hide the Schedule button on expired/full passes, and cap the date pickers at the expiry date.

**Files:**
- Modify: `index.html` — `acctPlanRows` (~4385-4416), `adminPlanRows` (~4255-4293+), the render return object (~4722, add `acctSchedMax`), the customer pass-card markup (~1688-1722), the self-schedule date input (~1705), the admin per-plan date input (~2017)
- Mirror: `Pasig Greenpark Archery Camp.dc.html`
- Test: `_verify_pass.mjs`

**Interfaces:**
- Consumes: `planExpiry(plan)`, `isPlanExpired(plan)` (Task 1).
- Produces: `acctPlanRows[]` gains `expiryLabel` (string), `expired` (bool), `expiredNote` (string); `canSchedule` now also excludes expired. `adminPlanRows[]` gains `maxDate` (string). Render return gains `acctSchedMax` (string).

- [ ] **Step 1: Extend `acctPlanRows`.** In the row object returned by the `acctPlanRows` map (index.html ~4395-4415), add these fields (compute `const expired = this.isPlanExpired(p); const expDate = this.planExpiry(p);` just before the `return`):

```js
        expired: expired,
        expiryLabel: expDate ? ((expired ? 'Expired ' : 'Expires ') + this.prettyDateStr(expDate)) : '',
        hasExpiry: !!expDate,
        expiredNote: expired ? ('This pass expired ' + this.prettyDateStr(expDate) + '.') : '',
```
And change the existing `canSchedule:` line so it also excludes expired:
```js
        canSchedule: !(cap != null && sess.length >= cap) && !expired && String(p.status || '').toLowerCase() !== 'cancelled',
```

- [ ] **Step 2: Show expiry + expired note in the pass card.** In the customer card markup:
  - After the `schedLabel` line (index.html ~1688), add an expiry line:
```html
                  <sc-if value="{{ pl.hasExpiry }}" hint-placeholder-val="{{ false }}"><div style="padding-left:25px;"><span style="font-size:11.5px;color:{{ pl.expired ? '#b4512f' : '#8a9579' }};font-family:'Spline Sans Mono',monospace;">{{ pl.expiryLabel }}</span></div></sc-if>
```
  - After the `pl.atCap` note (~1722), add the expired note:
```html
                <sc-if value="{{ pl.expired }}" hint-placeholder-val="{{ false }}"><span style="font-size:11.5px;color:#b4512f;font-family:'Spline Sans Mono',monospace;">{{ pl.expiredNote }}</span></sc-if>
```
  (The `pl.canSchedule` gate at ~1701 already hides the Schedule UI when `expired` is true because Step 1 folded `!expired` into `canSchedule`.)

- [ ] **Step 3: Cap the self-schedule date picker at expiry.** Add `acctSchedMax` to the render return object (index.html ~4785, near `slotDate: ..., minDate: todayStr`):
```js
      acctSchedMax: this.planExpiry(_schedPlan) || '',
```
Then on the self-schedule date `<input>` (~1705), add a `max` attribute:
```html
                      <input value="{{ acctSchedDate }}" onInput="{{ onPickDate }}" min="{{ minDate }}" max="{{ acctSchedMax }}" type="date" style="width:100%;box-sizing:border-box;background:#fff;border:1px solid rgba(36,66,50,0.2);border-radius:8px;padding:10px 12px;font-family:'Hanken Grotesk',sans-serif;font-size:14px;color:#1b2a1f;outline:none;" />
```

- [ ] **Step 4: Cap the admin per-plan date picker at expiry.** In `adminPlanRows` (the returned row object, near the existing `minDate`/`editDate` fields), add:
```js
        maxDate: this.planExpiry(p) || '',
```
Then on the admin per-plan date `<input>` (index.html ~2017), add `max="{{ pr.maxDate }}"` alongside the existing `min="{{ pr.minDate }}"`:
```html
                    <input value="{{ pr.editDate }}" onInput="{{ pr.setEditDate }}" min="{{ pr.minDate }}" max="{{ pr.maxDate }}" type="date" style="background:#fffdf6;border:1px solid rgba(36,66,50,0.18);border-radius:8px;padding:11px 13px;font-family:'Hanken Grotesk',sans-serif;font-size:14px;color:#1b2a1f;outline:none;" />
```

- [ ] **Step 5: Mirror.** `cp` + `diff … && echo IDENTICAL`.

- [ ] **Step 6: Verify (UI reflects expiry).** Extend `_verify_pass.mjs`, driving the My Bookings account view:
  - Seed an account plan with `expiry` in the past → assert the card shows "Expired <date>", the "Schedule a session" button is ABSENT, and the expired note renders; its already-scheduled session chips still render.
  - Seed an account plan with `expiry` ~5 days out and not at cap → assert the "Schedule a session" button is PRESENT; open it and assert the date `<input>` has a `max` attribute equal to the expiry date.
  - Seed a plan at cap (sessions.length === cap) → Schedule button absent, "All N sessions scheduled" note present.
  Run `node _verify_pass.mjs`; expected PASS, 0 real console errors.

- [ ] **Step 7: Commit.**
```bash
git add index.html "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Pass scope T4: show expiry/expired state, hide Schedule when expired/full, cap date pickers at expiry"
```

---

### Task 5: Admin Pricing editor — caps, validity, editable bullets, add/remove passes

Give admin full control over the offering: Max sessions, Valid-for-days, editable feature bullets (add/remove), remove-a-pass, and add-a-pass.

**Files:**
- Modify: `index.html` — `pkgEdits` (~4166-4169) and the Pricing-tab packages markup (~2174-2185)
- Mirror: `Pasig Greenpark Archery Camp.dc.html`
- Test: `_verify_pass.mjs`

**Interfaces:**
- Consumes: `saveCM(patch)` and `cm.packages` (existing render locals, ~4164); the content store round-trip (`persistContent` → `setContent`).
- Produces: each `pkgEdits[]` entry gains `sessions`, `validDays`, `featureRows[]` (each `{ value, set, remove }`), `addFeature`, `removePass`. Render return gains `addPass`.

- [ ] **Step 1: Extend `pkgEdits` + add `addPass`.** Replace the `pkgEdits` block (index.html ~4165-4169) with:

```js
    const updatePackage = (i, key) => (e) => { const v = e.target.value; const ps = cm.packages.map((p, idx) => idx === i ? { ...p, [key]: v } : p); saveCM({ packages: ps }); };
    const setPkgNum = (i, key) => (e) => { const v = Math.max(1, parseInt(e.target.value, 10) || 1); const ps = cm.packages.map((p, idx) => idx === i ? { ...p, [key]: v } : p); saveCM({ packages: ps }); };
    const setFeature = (i, fi) => (e) => { const v = e.target.value; const ps = cm.packages.map((p, idx) => idx === i ? { ...p, features: (p.features || []).map((f, k) => k === fi ? v : f) } : p); saveCM({ packages: ps }); };
    const addFeature = (i) => () => { const ps = cm.packages.map((p, idx) => idx === i ? { ...p, features: (p.features || []).concat(['New feature']) } : p); saveCM({ packages: ps }); };
    const removeFeature = (i, fi) => () => { const ps = cm.packages.map((p, idx) => idx === i ? { ...p, features: (p.features || []).filter((_, k) => k !== fi) } : p); saveCM({ packages: ps }); };
    const removePass = (i) => () => { saveCM({ packages: cm.packages.filter((_, idx) => idx !== i) }); };
    const addPass = () => { const np = { name: 'New pass', price: '₱0', unit: '', desc: '', features: ['1 session'], sessions: 1, validDays: 30, popular: false, bg: '#fffdf6', fg: '#1b2a1f', border: 'rgba(36,66,50,0.12)', tick: '#3c6b48', btnBg: '#244232', btnFg: '#f4efe4' }; saveCM({ packages: cm.packages.concat([np]) }); };
    const pkgEdits = cm.packages.map((p, i) => ({
      name: p.name, price: p.price, unit: p.unit, desc: p.desc,
      sessions: (p.sessions != null ? p.sessions : ''), validDays: (p.validDays != null ? p.validDays : ''),
      setName: updatePackage(i, 'name'), setPrice: updatePackage(i, 'price'), setUnit: updatePackage(i, 'unit'), setDesc: updatePackage(i, 'desc'),
      setSessions: setPkgNum(i, 'sessions'), setValidDays: setPkgNum(i, 'validDays'),
      featureRows: (p.features || []).map((f, fi) => ({ value: f, set: setFeature(i, fi), remove: removeFeature(i, fi) })),
      addFeature: addFeature(i), removePass: removePass(i),
    }));
```
Then add `addPass` to the render return object (index.html ~4734, near `packages, testimonials, ...`):
```js
      addPass,
```

- [ ] **Step 2: Extend the Pricing-tab markup.** Inside the per-package card (index.html, the `<div>` at ~2176 that holds the name/price/unit/desc inputs), AFTER the `<textarea ... p.setDesc ...></textarea>` line (~2182) and BEFORE the card's closing `</div>` (~2183), insert the cap/validity inputs, the bullet editor, and the remove button:

```html
                <div style="display:flex;gap:10px;">
                  <label style="flex:1;font-size:11.5px;font-weight:600;color:#56664f;">Max sessions<input value="{{ p.sessions }}" onInput="{{ p.setSessions }}" type="number" min="1" style="display:block;margin-top:4px;width:100%;box-sizing:border-box;background:#f4efe4;border:1px solid rgba(36,66,50,0.16);border-radius:8px;padding:9px 11px;font-family:'Hanken Grotesk',sans-serif;font-size:14px;font-weight:700;color:#1b2a1f;outline:none;" /></label>
                  <label style="flex:1;font-size:11.5px;font-weight:600;color:#56664f;">Valid for (days)<input value="{{ p.validDays }}" onInput="{{ p.setValidDays }}" type="number" min="1" style="display:block;margin-top:4px;width:100%;box-sizing:border-box;background:#f4efe4;border:1px solid rgba(36,66,50,0.16);border-radius:8px;padding:9px 11px;font-family:'Hanken Grotesk',sans-serif;font-size:14px;font-weight:700;color:#1b2a1f;outline:none;" /></label>
                </div>
                <div style="font-size:11.5px;font-weight:700;color:#56664f;">Features</div>
                <div style="display:flex;flex-direction:column;gap:6px;">
                  <sc-for list="{{ p.featureRows }}" as="f" hint-placeholder-count="3">
                    <div style="display:flex;gap:6px;align-items:center;">
                      <input value="{{ f.value }}" onInput="{{ f.set }}" placeholder="Feature" style="flex:1;background:#f4efe4;border:1px solid rgba(36,66,50,0.16);border-radius:8px;padding:8px 11px;font-family:'Hanken Grotesk',sans-serif;font-size:13px;color:#1b2a1f;outline:none;" />
                      <button onClick="{{ f.remove }}" aria-label="Remove feature" style="background:none;border:1px solid rgba(36,66,50,0.16);cursor:pointer;font-size:13px;color:#8a9579;padding:6px 10px;border-radius:8px;">✕</button>
                    </div>
                  </sc-for>
                  <button onClick="{{ p.addFeature }}" style="align-self:flex-start;background:#e6efd6;border:none;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;font-size:12px;font-weight:700;color:#4d7327;padding:6px 12px;border-radius:999px;">+ Add feature</button>
                </div>
                <button onClick="{{ p.removePass }}" style="align-self:flex-start;background:none;border:1px solid rgba(180,81,47,0.4);cursor:pointer;font-family:'Hanken Grotesk',sans-serif;font-size:12px;font-weight:700;color:#b4512f;padding:7px 14px;border-radius:999px;">Remove this pass</button>
```

- [ ] **Step 3: Add the "Add a pass" button.** Immediately AFTER the closing `</sc-for>` of the packages grid (index.html ~2184) and before the Fun-Shoot block (~2186), insert:

```html
          <button onClick="{{ addPass }}" style="margin-top:14px;background:#244232;border:none;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;font-size:13px;font-weight:700;color:#f4efe4;padding:10px 18px;border-radius:999px;">+ Add a pass</button>
```

- [ ] **Step 4: Mirror.** `cp` + `diff … && echo IDENTICAL`.

- [ ] **Step 5: Verify (admin editor round-trips through content).** Extend `_verify_pass.mjs`, driving the admin Pricing tab (log in to admin per the existing flow / set the admin state the bug-batch harness used):
  - Edit a package's **Max sessions** to 7 → assert a `setContent` POST fires whose `content.packages` has that pass with `sessions: 7`.
  - Edit a **Valid for (days)** to 14 → `setContent` fires with `validDays: 14`.
  - Edit a **feature** text and click **+ Add feature** → `setContent` fires with the updated `features` array (edited value + the new "New feature").
  - Click **+ Add a pass** → `setContent` fires with one more package; then load the public Passes page (state.content updated) and assert the new pass renders with its bullet.
  - Click **Remove this pass** on it → `setContent` fires with that package gone, and it disappears from the public Passes list.
  Run `node _verify_pass.mjs`; expected PASS, 0 real console errors.

- [ ] **Step 6: Full regression run + cleanup.** Run the whole `_verify_pass.mjs` once (all of T1-T5 assertions green). Confirm mirror IDENTICAL. Then delete scratch:
```bash
rm -f _verify_pass.mjs _pass*.png
rm -rf node_modules package.json package-lock.json
git status --short
```
(Working tree should show only the two HTML files as modified across the branch — nothing else tracked.)

- [ ] **Step 7: Commit.**
```bash
git add index.html "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Pass scope T5: admin can set caps/validity, edit bullets, add/remove passes"
```

---

## Self-review notes

- **Spec coverage:** data model + defaults (T1); stamping at purchase so edits don't hit existing customers (T2); enforce cap via `planCap` + reject past-expiry dates in both schedulers (T3); expired/full greyed-but-visible + Schedule hidden + date pickers capped (T4); admin add/remove passes + edit bullets/cap/validity synced via content store (T5). All spec sections map to a task.
- **No backend change:** every task touches only `index.html` + its mirror; no `.gs` file, no version bump. Persistence reuses `pushPlan`/`savePlan` (T2) and `saveCM`/`persistContent` (T5).
- **Never 0/NaN:** `planCap` clamps to ≥1 (or legacy `null` = no cap, matching today's Monthly behavior for un-stamped legacy passes); `planExpiry` returns `''` (no enforcement) when unresolvable — legacy passes keep working.
- **Type/name consistency:** `planCap`/`planExpiry`/`isPlanExpired`/`packageByName`/`mergedPackages`/`defaultPackages`/`tsToDateStr`/`addDaysStr`/`prettyDateStr`/`stampPassScope` are defined in T1-T3 and consumed by name in T2-T5; plan fields `cap`/`validDays`/`expiry` are written in T2 and read in T3-T4; bindings `expiryLabel`/`expired`/`expiredNote`/`hasExpiry`/`acctSchedMax`/`maxDate`/`featureRows`/`addPass` are produced and consumed within T4/T5.
- **Mirror discipline:** every task ends with `cp` + `diff … && echo IDENTICAL`; scratch (`_verify_pass.mjs`, PNGs, node_modules) is removed in T5 Step 6 so only the two HTML files change.
- **Deploy:** no deploy step — the content store is already live (db-v15+). After merge + push, admins set per-pass caps/validity in the Pricing tab and it propagates to every device on next load.
