# Accounting Correctness (Plan B) — Frontend Dashboard + Add-on Bucket Tag

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the admin Earnings dashboard allocate money correctly — base fee splits by each assigned coach's %, add-ons go 100% to their tagged bucket, the coach bucket divides equally among a booking's coaches, and passes feed the same split — by consuming the `db-v29` breakdown (`baseAmount`/`addonBuckets`). Add a per-add-on "Goes to" bucket tag in the Pricing editor, and fix the #6 Sessions chips that read the wrong coach field.

**Architecture:** Frontend-only edits to `index.html` (SuperConductor class component), mirrored byte-for-byte to `Pasig Greenpark Archery Camp.dc.html`. The accounting math is extracted into one pure, unit-testable method `acctAllocate(items, todayStr)` that the dashboard data layer calls. The add-on bucket reuses the existing add-on `scope`-toggle editor pattern. No backend change (db-v29 already surfaces the breakdown).

**Tech Stack:** SuperConductor (`{{ }}` bindings, `<sc-if>`, `<sc-for>`, `renderVals()` data layer, ES2015 class). Verified by Node unit tests of `acctAllocate` + `normalizeAddons` + Playwright-over-HTTP of the rendered dashboard/editor + mirror-IDENTICAL.

## Global Constraints

- **Mirror rule:** every `index.html` edit is copied byte-for-byte to `Pasig Greenpark Archery Camp.dc.html`; finish each task with `diff "index.html" "Pasig Greenpark Archery Camp.dc.html" && echo IDENTICAL`.
- **SuperConductor:** NO JS expressions inside `{{ }}` — precompute the add-on "Goes to" chip label/colors and all dashboard labels in the data layer. Straight ASCII quotes. Per-item `<sc-for>` closures built in the data layer.
- **No backend change / no redeploy.** db-v29 (`acctBreakdown`) is already live, so each booking carries `baseAmount` + `addonBuckets {coach,equip,range}`. **Back-compat fallback:** when `baseAmount` is absent (older payload), treat `base = amount` and `addonBuckets = {0,0,0}` — the dashboard still works, just without add-on separation.
- **Field correction (critical):** the admin booking payload (`allBookings`, from `listBookings_`) exposes the joined coach NAMES under key **`b.coach`** (NOT `b.coachName`). Resolve it to coach ids with the existing `coachIdsFromNames(b.coach)` helper (#6). The coach bucket of a booking divides **equally** among those ids; **0 coaches → the "unassigned" share** at the default split.
- **Split model:** the base fee is divided equally among the booking's coaches; **each coach's portion splits by THAT coach's own coach/equip/range %** (from `coachSplits`, default `splitDefault`). Add-on pesos go 100% to their bucket (`addonBuckets.equip`→equipment, `.range`→range, `.coach`→split equally among the coaches, or unassigned if none).
- **Passes:** approved passes already arrive in `allBookings` as `(plan)`-program bookings, so they flow through the same reducer — no separate pass iteration.
- **Scope:** the Earnings reducer, the Pricing add-on "Goes to" tag, the `dashUpCoach` upcoming-filter fix, and the #6 Sessions-chip field fix. Do NOT rewrite the upcoming-schedule per-coach display/count (`matchCoach`-based, lines ~5577/5592/5687) — that is Phase 2.

---

### Task 1: Pricing add-on "Goes to" bucket tag

**Files:**
- Modify: `index.html` — `normalizeAddons` (~`index.html:3750-3758`); the Pricing add-on editor data layer (~`index.html:4995-5019`); the add-on row markup (~`index.html:2397`).
- Mirror: `Pasig Greenpark Archery Camp.dc.html`.

**Interfaces:**
- Produces: each add-on object gains a `bucket: 'coach'|'equip'|'range'` (default `'equip'`), persisted in the program config the backend reads. Each Pricing add-on row gains `bucketLabel`/`bucketBg`/`bucketFg`/`toggleBucket`.

- [ ] **Step 1: Default the bucket in `normalizeAddons`.** Change the returned object (the line `return { id: id, name: a.name || 'Add-on', price: Number(a.price) || 0, scope: (a.scope === 'perBooking' ? 'perBooking' : 'perArcher') };`) to append the bucket:
```js
      return { id: id, name: a.name || 'Add-on', price: Number(a.price) || 0, scope: (a.scope === 'perBooking' ? 'perBooking' : 'perArcher'), bucket: ((a.bucket === 'coach' || a.bucket === 'range') ? a.bucket : 'equip') };
```

- [ ] **Step 2: Add the bucket-cycle handler + row fields.** In the Pricing data layer, immediately after the `toggleAddonScope` definition (~`index.html:4997`), add:
```js
    const nextBucket = (b) => (b === 'equip' ? 'coach' : (b === 'coach' ? 'range' : 'equip'));
    const toggleAddonBucket = (pi, ai) => () => { writeAddons(pi, progAddons(pi).map((a, j) => j === ai ? { ...a, bucket: nextBucket(a.bucket || 'equip') } : a)); };
    const bucketLabelOf = (b) => 'Goes to: ' + (b === 'coach' ? 'Coach' : (b === 'range' ? 'Range' : 'Equipment'));
```
Then in the `addonRows` map (the `this.normalizeAddons(p.addons).map((a, ai) => ({ … }))` block), add these fields to each row object (alongside `toggleScope`/`remove`):
```js
        bucketLabel: bucketLabelOf(a.bucket),
        bucketBg: '#fffdf6', bucketFg: '#244232',
        toggleBucket: toggleAddonBucket(i, ai),
```

- [ ] **Step 3: Render the "Goes to" chip.** In the add-on row markup, immediately AFTER the scope `<button onClick="{{ ad.toggleScope }}" …>{{ ad.scopeLabel }}</button>` line (~`index.html:2397`), add:
```html
                          <button onClick="{{ ad.toggleBucket }}" style="background:{{ ad.bucketBg }};color:{{ ad.bucketFg }};border:1px solid rgba(36,66,50,0.3);cursor:pointer;font-family:'Hanken Grotesk',sans-serif;font-size:11.5px;font-weight:700;padding:7px 12px;border-radius:999px;white-space:nowrap;">{{ ad.bucketLabel }}</button>
```

- [ ] **Step 4: Mirror + verify.**
  Mirror: `cp "index.html" "Pasig Greenpark Archery Camp.dc.html"` then `diff "index.html" "Pasig Greenpark Archery Camp.dc.html" && echo IDENTICAL`.
  Node unit test `_t.mjs`: define a `self` with `normalizeAddons` (paste the method body) — it calls `this.normalizeAddons` recursively? No; it only maps `list`. Stub any helper it needs. Assert:
  - `normalizeAddons([{name:'Bow',price:150}])[0].bucket === 'equip'` (default).
  - `normalizeAddons([{name:'X',price:0,bucket:'coach'}])[0].bucket === 'coach'`; `…bucket:'range'…` → `'range'`; `…bucket:'nonsense'…` → `'equip'` (sanitized).
  - `nextBucket`: `'equip'→'coach'`, `'coach'→'range'`, `'range'→'equip'`, `undefined→'coach'` (since `b||'equip'` then cycle... note `nextBucket(undefined)` = `'coach'` because `undefined!=='equip'`/`'coach'` → returns `'equip'`; but the handler passes `a.bucket || 'equip'`, so test `nextBucket('equip')==='coach'` etc.). Assert the four explicit transitions.
  Run `node _t.mjs`; all green; delete scratch.

- [ ] **Step 5: Commit.**
```bash
git add "index.html" "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Pricing: per-add-on 'Goes to' bucket tag (Coach/Equipment/Range, default Equipment)"
```

---

### Task 2: Earnings reducer (`acctAllocate`) + coach-field fixes

**Files:**
- Modify: `index.html` — add the `acctAllocate` method (near `coachIdsFromNames`, ~`index.html:2832`); rewrite the dashboard accounting block in `renderVals` (~`index.html:5452-5493`); fix the `dashUpCoach` filter (~`index.html:5517`); fix the #6 Sessions chip field (~`index.html:5159`).
- Mirror: `Pasig Greenpark Archery Camp.dc.html`.

**Interfaces:**
- Consumes: `this.state.coachSplits`, `this.state.splitDefault`, `this.coaches()`, `this.coachIdsFromNames` (#6), and per-item `baseAmount`/`addonBuckets`/`amount`/`coach`/`date`/`status`.
- Produces: `acctAllocate(items, todayStr)` → `{ counts:{approved,pending,cancelled}, earnWeek, earnMonth, earnYear, earnTotal, coachTotal, equipTotal, rangeTotal, coachUnassigned, coachPay:{<id>:peso} }`. The dashboard data layer destructures it into the existing variable names so all downstream labels (`coachPayRows`, `splitPctOf`, the return object at ~`index.html:6026-6033`) are unchanged.

- [ ] **Step 1: Add the `acctAllocate` method.** Immediately AFTER the `coachIdsFromNames(coachName) { … }` method (~`index.html:2832`), add:
```js
  // #7: allocate booking/pass revenue into coach / equipment / range buckets.
  // Base fee splits by each assigned coach's own %; the base is divided equally among the
  // booking's coaches; add-ons go 100% to their tagged bucket; 0 coaches -> unassigned share.
  acctAllocate(items, todayStr) {
    const splits = this.state.coachSplits || {};
    const splitDef = this.state.splitDefault || { coach: 80, equip: 10, range: 10 };
    const coaches = this.coaches() || [];
    const known = {}; coaches.forEach(c => { known[c.id] = true; });
    const fmtYmd = (d) => { const y = d.getFullYear(), m = ('0' + (d.getMonth() + 1)).slice(-2), da = ('0' + d.getDate()).slice(-2); return y + '-' + m + '-' + da; };
    const tParts = String(todayStr || '').split('-');
    const periodYear = tParts[0] || '';
    const periodMonth = (tParts[0] || '') + '-' + (tParts[1] || '');
    const dThis = new Date((todayStr || '1970-01-01') + 'T00:00:00');
    const dowMon = (dThis.getDay() + 6) % 7;
    const weekStart = new Date(dThis); weekStart.setDate(dThis.getDate() - dowMon);
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);
    const weekStartStr = fmtYmd(weekStart), weekEndStr = fmtYmd(weekEnd);
    const coachPay = {}; coaches.forEach(c => { coachPay[c.id] = 0; });
    let cApproved = 0, cPending = 0, cCancelled = 0;
    let earnWeek = 0, earnMonth = 0, earnYear = 0, earnTotal = 0;
    let coachTotal = 0, equipTotal = 0, rangeTotal = 0, coachUnassigned = 0;
    (items || []).forEach(b => {
      const st = String(b.status || 'booked').toLowerCase();
      if (st === 'cancelled') { cCancelled++; return; }
      if (st === 'approved') cApproved++; else cPending++;
      const amt = Number(b.amount) || 0; if (!amt) return;
      const ds = b.date || '';
      earnTotal += amt;
      if (ds.slice(0, 4) === periodYear) earnYear += amt;
      if (ds.slice(0, 7) === periodMonth) earnMonth += amt;
      if (ds >= weekStartStr && ds <= weekEndStr) earnWeek += amt;
      const base = (b.baseAmount != null ? Number(b.baseAmount) : amt) || 0;
      const ab = b.addonBuckets || { coach: 0, equip: 0, range: 0 };
      const ids = this.coachIdsFromNames(b.coach).filter(id => known[id]);
      if (ids.length) {
        const portion = base / ids.length;
        const addonCoachEach = (Number(ab.coach) || 0) / ids.length;
        ids.forEach(id => {
          const sp = splits[id] || splitDef;
          const cShare = portion * (Number(sp.coach) || 0) / 100 + addonCoachEach;
          coachPay[id] = (coachPay[id] || 0) + cShare; coachTotal += cShare;
          equipTotal += portion * (Number(sp.equip) || 0) / 100;
          rangeTotal += portion * (Number(sp.range) || 0) / 100;
        });
      } else {
        const cShare = base * (Number(splitDef.coach) || 0) / 100 + (Number(ab.coach) || 0);
        coachUnassigned += cShare; coachTotal += cShare;
        equipTotal += base * (Number(splitDef.equip) || 0) / 100;
        rangeTotal += base * (Number(splitDef.range) || 0) / 100;
      }
      equipTotal += Number(ab.equip) || 0;
      rangeTotal += Number(ab.range) || 0;
    });
    return { counts: { approved: cApproved, pending: cPending, cancelled: cCancelled },
      earnWeek: earnWeek, earnMonth: earnMonth, earnYear: earnYear, earnTotal: earnTotal,
      coachTotal: coachTotal, equipTotal: equipTotal, rangeTotal: rangeTotal,
      coachUnassigned: coachUnassigned, coachPay: coachPay };
  }
```

- [ ] **Step 2: Call the reducer in `renderVals`; delete the inline math.** In the dashboard data layer, DELETE these now-superseded lines: the `fmtYmd` const (~`index.html:5452`), the `splitForCoach` const (~`5463`), the period-boundary block (`const tParts …` through `const weekStartStr …`, ~`5464-5472`), and the entire inline reducer (`let cApproved … ` through the closing `});` of `dashBookings.forEach`, ~`5473-5493`). KEEP `splits`, `splitDef`, `splitDraft`, and `matchCoach` (still used by the upcoming-schedule rows). Replace the deleted reducer with:
```js
    const _acct = this.acctAllocate(dashBookings, todayStr);
    const cApproved = _acct.counts.approved, cPending = _acct.counts.pending, cCancelled = _acct.counts.cancelled;
    const earnWeek = _acct.earnWeek, earnMonth = _acct.earnMonth, earnYear = _acct.earnYear, earnTotal = _acct.earnTotal;
    const coachTotal = _acct.coachTotal, equipTotal = _acct.equipTotal, rangeTotal = _acct.rangeTotal;
    const coachUnassigned = _acct.coachUnassigned;
    const coachPay = _acct.coachPay;
```
(Downstream `splitSum`/`splitPctOf`/`splitCoachPct`, `coachPayRows` (`coachPay[c.id]`), and the return object at ~`index.html:6026-6033` keep working unchanged.)

- [ ] **Step 3: Fix the `dashUpCoach` upcoming filter.** The upcoming-schedule coach filter compares a coach id to the joined names string. Change `.filter(b => dashUpCoach === 'all' ? true : (String(b.coach || '') === dashUpCoach))` (~`index.html:5517`) to:
```js
      .filter(b => dashUpCoach === 'all' ? true : (this.coachIdsFromNames(b.coach).indexOf(dashUpCoach) !== -1))
```

- [ ] **Step 4: Fix the #6 Sessions chip field.** In the `sessionRows` builder, change `const selIds = this.coachIdsFromNames(b.coachName);` (~`index.html:5159`) to:
```js
      const selIds = this.coachIdsFromNames(b.coach);
```
(`b.coachName` is undefined on admin bookings; the field is `b.coach`. This restores chip pre-population from existing assignments.)

- [ ] **Step 5: Mirror.** `cp "index.html" "Pasig Greenpark Archery Camp.dc.html"` then `diff "index.html" "Pasig Greenpark Archery Camp.dc.html" && echo IDENTICAL`.

- [ ] **Step 6: Verify (Node unit test of `acctAllocate` + Playwright).**
  **Node unit test** `_t.mjs`: build a `self` with `state.coachSplits = { michael:{coach:80,equip:10,range:10}, james:{coach:50,equip:25,range:25} }`, `state.splitDefault={coach:80,equip:10,range:10}`, `coaches()` → `[{id:'michael',name:'Michael Cabral'},{id:'james',name:'James Victoria'}]`, and the real `coachIdsFromNames` + `acctAllocate` bodies bound to it. With `todayStr='2026-06-28'`, assert (use a date in-range for totals, e.g. `date:'2026-06-28'`):
  - 1-coach, `{amount:400, baseAmount:400, addonBuckets:{coach:0,equip:0,range:0}, coach:'Michael Cabral', status:'approved', date:'2026-06-28'}` → `coachPay.michael===320`, `equipTotal===40`, `rangeTotal===40`, `coachTotal===320`, `earnTotal===400`, counts.approved===1.
  - 2-coach equal split, `coach:'Michael Cabral, James Victoria'`, base 400, both via their OWN %: michael portion 200×0.8=160, james 200×0.5=100 → `coachPay.michael===160`, `coachPay.james===100`, `coachTotal===260`, `equipTotal===200×.1 + 200×.25 = 70`, `rangeTotal===70`.
  - add-on bucket: `{amount:550, baseAmount:400, addonBuckets:{coach:0,equip:150,range:0}, coach:'Michael Cabral'}` → `coachPay.michael===320` (add-on NOT in coach pay), `equipTotal===40+150=190`.
  - no coach: `{amount:400, baseAmount:400, addonBuckets:{coach:0,equip:0,range:0}, coach:''}` → `coachUnassigned===320`, `coachPay.michael===0`, `equipTotal===40`.
  - back-compat (no breakdown): `{amount:400, coach:'Michael Cabral', status:'approved', date:'2026-06-28'}` (no `baseAmount`) → base falls back to 400 → `coachPay.michael===320`.
  - cancelled excluded: a `status:'cancelled'` item adds to `counts.cancelled` and contributes 0 to earnings/buckets.
  Run `node _t.mjs`; all green; delete scratch.
  **Playwright over HTTP** (serve, NOT file://; `_srv.mjs` on 127.0.0.1:8099; Chromium at `C:\Users\Michael Cabral\AppData\Local\ms-playwright\chromium-1228\chrome-win64\chrome.exe`; write `.mjs` with the Write tool, not heredoc): load `http://127.0.0.1:8099/index.html`; reach the instance via the page-root `__reactContainer$…` fiber (`stateNode.logic`); `setState` to the admin Dashboard view and inject `allBookings` + `coachSplits`; assert the per-coach "Earned" row shows a non-zero, correctly-attributed peso (NOT all in "unassigned"), the coach/equip/range labels are non-zero, and that the Pricing add-on editor shows the "Goes to" chip and cycles Equipment→Coach→Range on click. Also confirm the Sessions chips pre-select for a booking whose `coach` field names a coach. Screenshot the dashboard. 0 real console errors. If fiber injection fails after real effort, fall back to a static-render screenshot + report the limitation. Delete scratch.

- [ ] **Step 7: Commit.**
```bash
git add "index.html" "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Earnings: acctAllocate reducer (base-fee split per coach, add-on buckets, equal multi-coach split); fix b.coach attribution + upcoming filter + #6 Sessions chip field"
```

---

## Self-Review

**Spec coverage** (against `2026-06-28-accounting-correctness-design.md`, Section 3 + Section 1):
- Base fee splits by coach/equip/range % → `acctAllocate` (Task 2). ✓
- Add-ons 100% to their bucket; only base splits → `acctAllocate` uses `baseAmount` + `addonBuckets`; Task 1 add-on "Goes to" tag feeds the backend's bucketing. ✓
- Coach bucket divides equally among the booking's coaches (via `coachIdsFromNames(b.coach)`); 0 → unassigned → Task 2. ✓
- Each coach's portion uses THAT coach's own split % → `acctAllocate` per-id loop. ✓
- Passes feed the same split → approved passes are in `allBookings`, so the same reducer covers them (Global Constraints). ✓
- Pricing add-on "Goes to" select, default Equipment, persisted → Task 1. ✓
- Back-compat fallback when breakdown absent → `base = amount`, `ab = {0,0,0}` (Task 2). ✓
- **Fold-in:** #6 Sessions chip field fix (`b.coachName`→`b.coach`) → Task 2 Step 4; `dashUpCoach` filter fix → Task 2 Step 3.
- **Out of scope (correctly):** the upcoming-schedule per-coach `matchCoach` display/count → Phase 2; backend (db-v29 shipped) → Plan A.

**Placeholder scan:** no TBD/TODO; every code step shows the full insertion/replacement; the verify steps name concrete assertions with computed expected values.

**Type/name consistency:** `acctAllocate(items, todayStr)` returns the exact keys the dashboard destructures (Task 2 Step 2) into `cApproved`/`earnWeek`/`coachTotal`/`coachPay`/etc., which downstream `splitPctOf`/`coachPayRows`/the return object already consume; `bucket` added in `normalizeAddons` (Task 1) is the field `addonBucketByName_` reads in Plan A's backend; `coachIdsFromNames(b.coach)` uses the corrected field across the reducer, the upcoming filter, and the Sessions chips.
