# Accounting Correctness (Plan A) — Backend Breakdown (db-v29)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `listBookings_` emit, per booking, a financial breakdown — `baseAmount` (charged amount minus add-on pesos) and `addonBuckets: {coach, equip, range}` (add-on pesos grouped by each add-on's configured destination bucket) — so the frontend Earnings dashboard can allocate money correctly.

**Architecture:** Backend-only changes to `backend/Code.gs` (Google Apps Script, ES5-ish — `var`/`function`, no arrows/`const`/`let`). Two new pure helpers parse the add-on text lines already written into each event description (`Add-ons: Name (₱150)`, `Booking add-ons: Name (₱50 ×2)`) and look up each add-on's `bucket` from the program config in the `CONTENT` script property. `listBookings_` accumulates the breakdown per `(ref,date,time)` slot. **Needs a manual `db-v29` redeploy.**

**Tech Stack:** Google Apps Script (ES5-ish); verified by Node unit tests of the extractable helpers (the live `/exec` runs old code until redeploy) + the user's post-redeploy checklist.

## Global Constraints

- **Backend-only.** No `index.html`/`.dc.html`/frontend change. **Requires one manual `db-v29` redeploy** (edit the EXISTING deployment — never "New deployment").
- **ES5-ish GAS style:** `var` + `function(...)`, NOT arrows/`const`/`let`.
- **Additive & back-compatible:** the new fields are added to each booking item; nothing existing is removed or renamed. A frontend that ignores them is unaffected; the frontend plan (Plan B) falls back to the whole-`amount` split when they're absent.
- **Add-on line formats (already produced by `addonLine_`/`bookingAddonLine_`):** per-archer `\nAdd-ons: Name (₱150), Name2 (₱50)`; per-booking `\nBooking add-ons: Name (₱50 ×2)` (the `×N` is the slot count). Each add-on entry is `Name (₱<price>[ ×<n>])`. No other description line contains the `(₱…)` token (Concession/Coach/Amount lines do not), so a single regex over the whole description captures exactly the add-on entries.
- **Bucket source:** each add-on's destination is read from `CONTENT` → `programs[].addons[].bucket` (`'coach'|'equip'|'range'`). The `bucket` field is added by the frontend Plan B; until then every add-on is untagged → **defaults to `equip`**. Matching is by add-on **name within the booking's program**.
- **Per-archer events (db-v27):** each archer's event carries its own `Add-ons:` line; the booking's first event also carries the `Booking add-ons:` line. Summing the breakdown across all of a slot's events captures both.
- **Verification:** Node unit tests of the extractable helpers with stubbed config; `cp backend/Code.gs /tmp/_c.js && node --check /tmp/_c.js && echo SYNTAX_OK`. Do NOT live-`curl` (deployed endpoint runs old code). True end-to-end = the user's post-redeploy `db-v29` checklist. Delete scratch; commit only `backend/Code.gs` (+ `SETUP.md` in Task 2).

---

### Task 1: Add-on breakdown helpers + `listBookings_` emits `baseAmount`/`addonBuckets`

**Files:** Modify `backend/Code.gs` — add two helpers; extend `listBookings_`.

**Interfaces:**
- Produces: `addonBucketByName_(programsCfg, programName, name)` → `'coach'|'equip'|'range'` (default `'equip'`); `addonBreakdown_(desc, programName, programsCfg)` → `{ total, buckets:{coach,equip,range} }`. `listBookings_` items each gain `baseAmount` (number) and `addonBuckets` (`{coach,equip,range}`).
- Consumes: the `CONTENT` script property (`programs[].addons[].bucket`); existing `listBookings_` grouping.

- [ ] **Step 1: Add the two helpers.** Insert ABOVE `function listBookings_() {` (so they're defined before use):
```js
// ---------- ACCOUNTING: add-on bucket breakdown (db-v29) ----------
// Resolve an add-on's destination bucket from the saved program config (CONTENT).
// Matches by add-on NAME within the booking's program. Untagged/unknown -> 'equip'.
function addonBucketByName_(programsCfg, programName, name) {
  var progs = programsCfg || [];
  for (var i = 0; i < progs.length; i++) {
    if (String(progs[i].name) === String(programName)) {
      var ad = progs[i].addons || [];
      for (var j = 0; j < ad.length; j++) {
        if (String(ad[j].name) === String(name)) {
          var b = String(ad[j].bucket || 'equip').toLowerCase();
          return (b === 'coach' || b === 'range') ? b : 'equip';
        }
      }
    }
  }
  return 'equip';
}
// Parse the "Add-ons:" / "Booking add-ons:" lines from an event description into
// peso totals grouped by bucket. Each entry is "Name (₱<price>[ ×<n>])".
function addonBreakdown_(desc, programName, programsCfg) {
  var buckets = { coach: 0, equip: 0, range: 0 }, total = 0;
  if (!desc) return { total: 0, buckets: buckets };
  var re = /([^,(\n]+?)\s*\(₱\s*(\d+)\s*(?:×\s*(\d+))?\)/g, m;
  while ((m = re.exec(desc)) !== null) {
    var name = String(m[1] || '').replace(/^(?:booking\s+)?add-ons?\s*:\s*/i, '').trim();
    if (!name) continue;
    var amt = (parseInt(m[2], 10) || 0) * (m[3] ? (parseInt(m[3], 10) || 1) : 1);
    if (!amt) continue;
    total += amt;
    buckets[addonBucketByName_(programsCfg, programName, name)] += amt;
  }
  return { total: total, buckets: buckets };
}
```

- [ ] **Step 2: Read the program config once in `listBookings_`.** At the start of the `try {` in `listBookings_` (just after `function listBookings_() {` and its `try {`), add:
```js
    var programsCfg = [];
    try { var rawC = PropertiesService.getScriptProperties().getProperty('CONTENT'); if (rawC) { var cc = JSON.parse(rawC); programsCfg = cc.programs || []; } } catch (eC) {}
```

- [ ] **Step 3: Accumulate the breakdown in the calendar-grouping loop.** In the `events.forEach` group block, add the breakdown fields to the `byKey[key]` initializer (alongside `archers: 0, amount: 0,`):
```js
            archers: 0,
            amount: 0,
            baseAmount: 0,
            addonBuckets: { coach: 0, equip: 0, range: 0 },
            __addonTotal: 0,
```
and immediately AFTER `byKey[key].amount += amt;` add:
```js
        var bd = addonBreakdown_(d, program, programsCfg);
        byKey[key].__addonTotal += bd.total;
        byKey[key].addonBuckets.coach += bd.buckets.coach;
        byKey[key].addonBuckets.equip += bd.buckets.equip;
        byKey[key].addonBuckets.range += bd.buckets.range;
```

- [ ] **Step 4: Finalize `baseAmount` when flushing groups.** Replace `for (var k in byKey) out.push(byKey[k]);` with:
```js
      for (var k in byKey) { byKey[k].baseAmount = Math.max(0, (byKey[k].amount || 0) - (byKey[k].__addonTotal || 0)); delete byKey[k].__addonTotal; out.push(byKey[k]); }
```

- [ ] **Step 5: Give sheet-only rows the same shape.** In step (3)'s `sheetRows.forEach`, set the fields before `out.push(rec);` (sheet-only rows — cancelled / no live event — have no description to parse, so base = amount, no add-on buckets):
```js
      rec.baseAmount = rec.amount; rec.addonBuckets = { coach: 0, equip: 0, range: 0 };
      out.push(rec);
```

- [ ] **Step 6: Verify (Node unit test — do NOT curl).** `cp backend/Code.gs /tmp/_c.js && node --check /tmp/_c.js && echo SYNTAX_OK`. Scratch `_t.mjs`: extract `addonBucketByName_` and `addonBreakdown_` verbatim; stub `programsCfg = [{ name:'Open Range', addons:[ {name:'Bow rental',price:150,bucket:'equip'}, {name:'Coaching tip',price:100,bucket:'coach'}, {name:'Lane fee',price:50,bucket:'range'}, {name:'Untagged',price:30} ] }]`. Assert:
  - `addonBucketByName_(cfg,'Open Range','Bow rental')==='equip'`; `…'Coaching tip')==='coach'`; `…'Lane fee')==='range'`; `…'Untagged')==='equip'` (no bucket → default); `…'Nope')==='equip'` (unknown); `addonBucketByName_(cfg,'Other Program','Bow rental')==='equip'` (wrong program → default).
  - `addonBreakdown_('Program: Open Range\nAdd-ons: Bow rental (₱150)', 'Open Range', cfg)` → `{total:150, buckets:{coach:0,equip:150,range:0}}`.
  - `addonBreakdown_('\nAdd-ons: Coaching tip (₱100), Bow rental (₱150)', 'Open Range', cfg)` → `{total:250, buckets:{coach:100,equip:150,range:0}}`.
  - `addonBreakdown_('\nBooking add-ons: Lane fee (₱50 ×2)', 'Open Range', cfg)` → `{total:100, buckets:{coach:0,equip:0,range:100}}` (price × slots).
  - `addonBreakdown_('\nAdd-ons: Untagged (₱30)', 'Open Range', cfg)` → `{total:30, buckets:{equip:30,...}}` (untagged → equip).
  - `addonBreakdown_('\nConcession: Pasig\nCoach: Michael Cabral\nAmount: 620', 'Open Range', cfg)` → `{total:0, buckets:{0,0,0}}` (no (₱…) entries → nothing matched).
  - `addonBreakdown_('', 'Open Range', cfg)` → `{total:0,…}`.
  - Base-amount math sanity: for an event with `Amount: 620` and the `Bow rental (₱150)` add-on, `amount - breakdown.total === 470`.
  Run `node _t.mjs`; all green; delete scratch (`rm -f _t.mjs /tmp/_c.js`).

- [ ] **Step 7: Commit.**
```bash
git add backend/Code.gs
git commit -m "Accounting: listBookings_ emits baseAmount + addonBuckets (per-add-on bucket breakdown)"
```

---

### Task 2: `db-v29` version flag + SETUP checklist

**Files:** Modify `backend/Code.gs` — the `?action=version` return; `backend/SETUP.md`.

- [ ] **Step 1: Bump version.** In the `if (action === 'version')` `json_({ version: 'db-v28', …, multiCoach: true })`, change `'db-v28'` → `'db-v29'` and append `, acctBreakdown: true` before the closing ` })`. Preserve every existing flag.

- [ ] **Step 2: SETUP section.** Append a `## db-v29 deploy & verify` section to `backend/SETUP.md`, mirroring the EXACT format of the existing `## db-v28` section: a `**What changed:**` paragraph, the standard `### Deploy steps` (paste Code.gs → Save → Deploy→Manage deployments→edit EXISTING→New version→Deploy), and a `### Verification checklist` of `- [ ]` items:
  - `?action=version` shows `"version":"db-v29"`, `"acctBreakdown":true`, and all prior flags (`multiCoach:true`, `perArcherExtras:true`, etc.) still present.
  - Book a session with an **equipment add-on** (e.g. bow rental): in the admin Earnings dashboard the booking's add-on pesos appear in the **Equipment** bucket, and the **Coach** share is computed on the base fee only (the coach does NOT earn a % of the add-on).
  - A booking with **no add-ons** shows `baseAmount === amount` (coach/equip/range split unchanged from before).
  - A booking with **2 coaches** has its coach share split between them (verified live once the frontend Plan B is also deployed; pre-frontend, confirm the payload carries the breakdown).
  What-changed paragraph: `listBookings_` now emits a per-booking `baseAmount` (charged amount minus add-ons) and `addonBuckets {coach,equip,range}` (add-on pesos grouped by each add-on's configured bucket, read from the program config; untagged → Equipment), so the Earnings dashboard can allocate add-on revenue correctly and split the coach share across multiple coaches. Additive/back-compatible; the frontend falls back to the whole-amount split until it ships. Backend-only.

- [ ] **Step 3: Commit.**
```bash
git add backend/Code.gs backend/SETUP.md
git commit -m "Accounting: db-v29 version flag (acctBreakdown) + SETUP checklist"
```

- [ ] **Step 4: Redeploy reminder.** After merge, tell the user to **redeploy the Apps Script** (edit existing deployment → New version) and walk the db-v29 checklist. The frontend Plan B consumes `baseAmount`/`addonBuckets`; until db-v29 is live it falls back to the current whole-`amount` split.

---

## Self-Review

**Spec coverage** (against `2026-06-28-accounting-correctness-design.md`, Section 2):
- `listBookings_` emits `baseAmount` (amount − add-on pesos) → Task 1 (Steps 3-5). ✓
- `addonBuckets {coach,equip,range}` from each add-on's configured bucket → Task 1 (helpers + Step 3). ✓
- Bucket read from the content store; untagged → Equipment → `addonBucketByName_` default. ✓
- Sums across per-archer events for a slot → Task 1 (accumulate in the grouping loop). ✓
- Additive / back-compatible (absent → frontend whole-amount fallback) → Global Constraints + sheet-only rows still carry the shape. ✓
- `db-v29` flag + SETUP → Task 2. ✓
- **Out of scope (correctly):** the dashboard math, the per-add-on "Goes to" editor, and the passes/multi-coach frontend split → Plan B; the admin cleanup → Phase 2. (Approved passes already surface through `listBookings_` as `(plan)`-program bookings, so they receive the breakdown automatically — no separate pass payload needed.)

**Placeholder scan:** no TBD/TODO; helpers shown in full; the verify step lists concrete cases with computed expected values.

**Type/name consistency:** `addonBreakdown_(desc, programName, programsCfg)` and `addonBucketByName_(programsCfg, programName, name)` are used with matching argument order in `listBookings_` (Step 3 passes `(d, program, programsCfg)`); the emitted keys `baseAmount`/`addonBuckets` match what Plan B's dashboard will read; `addonBuckets` is always `{coach,equip,range}` on every out item (calendar groups AND sheet-only rows). The regex targets the `(₱<price>[ ×<n>])` entry format produced by `addonLine_`/`bookingAddonLine_`.

> **Note for Plan B (frontend):** the admin booking payload exposes the joined coach names under key **`coach`** (NOT `coachName`). The dashboard's existing `matchCoach(b.coach)` works for single-coach but fails for multi-coach (joined names); Plan B must resolve `b.coach` via `coachIdsFromNames` and split equally. Plan B must also fix the #6 Sessions chips, which currently read the undefined `b.coachName` (should be `b.coach`).
