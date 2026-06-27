# Per-Archer Booking Flow (Plan A) — Flow Rebuild + Per-Archer Selection

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the customer booking into the reordered progressive single-page flow (your details → who's shooting → age-filtered program → dates → per-archer concessions + add-ons → confirm), with each archer carrying their own concessions and add-ons.

**Architecture:** Frontend-only changes to `index.html` (custom "SuperConductor" template app), mirrored byte-for-byte to `Pasig Greenpark Archery Camp.dc.html`. The booking form has two responsive copies (desktop ~885–1160, mobile ~1257–1460) with different internal section orders; both are reordered into the same six-section flow. Per-archer concession/add-on selection state moves from the old booking-level `eligSel`/`eligProof` onto each archer object. The total `amount` stays frontend-computed, so this works against the live `db-v26` backend immediately (Plan C / `db-v27` only changes how per-archer detail is *stored*). This plan also adds the group-discount **data model + defaults + pricing reads** (the admin **editor** for it is Plan B).

**Tech Stack:** SuperConductor template, plain class-component JS, Playwright-core (served over **HTTP**, not file://) for verification.

## Global Constraints

- **Mirror rule:** every `index.html` edit mirrored verbatim to `Pasig Greenpark Archery Camp.dc.html`; end each task with `diff "index.html" "Pasig Greenpark Archery Camp.dc.html" && echo IDENTICAL`. (Both *form copies* live in each file and stay different from each other; the two *files* stay identical.)
- **Frontend-only. No backend change, no redeploy** in this plan. Pushes to GitHub Pages.
- **SuperConductor:** NO JS expressions inside style/attribute `{{ }}` — precompute in the data layer (`renderVals`); straight ASCII quotes; per-item `<sc-for>` rows carry their own values + closures built in the data layer.
- **Verification:** Playwright-core driving the real DOM, **served over HTTP** (file:// breaks the dc runtime). Chromium at `C:\Users\Michael Cabral\AppData\Local\ms-playwright\chromium-1228\chrome-win64\chrome.exe`; install `playwright-core` if missing (`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright-core --no-save`). Minimal node static server (scratch `_srv.mjs` on 127.0.0.1:8099); load `http://127.0.0.1:8099/index.html`; drive the real UI (click "Book a Session", `selectOption`, fill inputs, read DOM via `document.querySelectorAll`/visibility). The component instance is reachable by walking the page root's `__reactContainer$…` fiber (prior subagents called `logic.setState(...)` / its methods this way). Scratch files (`_srv.mjs`, `_verify.mjs`, `node_modules`, `package.json`, `package-lock.json`) must NOT be committed.
- **Pricing rules (locked):** flat stackable per-archer concessions; add-ons billed **per session** (× slots); group discount = min-threshold tiers `[{minParty,pct}]` (seeded `[{2,10},{3,20},{5,30}]`), applied only when the program's `groupDiscount` is on (default on). Everything per time-slot.
- **Preserve on launch:** with seeded tiers + all programs `groupDiscount:true` and no add-ons defined, pricing equals today's.

---

### Task 1: Data model — group discount config + per-archer selection state

**Files:** Modify `index.html` — `mergedContent` defaults + the `mergedContent({…})` call; `normalizePrograms` (+`defaultPrograms`); add `normalizeGroupTiers`/`groupTiers`/`tierPctFor` helpers near `discountList`; initial state + `resetForm`. Mirror. Test `_verify.mjs`.

**Interfaces:**
- Produces: content `groupTiers: [{minParty:number, pct:number}]` (sorted) via `groupTiers()`; `tierPctFor(party)` → decimal (e.g. `0.20`); per-program `groupDiscount:boolean` (normalized, default `true`); state `archers: [{name, dob, sel:{}, proof:{}, addons:{}}]` and `sameAsBooker:boolean`. Removes booking-level `eligSel`/`eligProof` from state.

- [ ] **Step 1: Seed `groupTiers` + per-program `groupDiscount`.** Add `defaultGroupTiers()` near `defaultDiscounts()`:
```js
  defaultGroupTiers() { return [ { minParty: 2, pct: 10 }, { minParty: 3, pct: 20 }, { minParty: 5, pct: 30 } ]; }
  normalizeGroupTiers(list) {
    var src = (list && list.length) ? list : this.defaultGroupTiers();
    return src.map(function (t) { return { minParty: Math.max(1, parseInt(t.minParty, 10) || 1), pct: Math.max(0, Number(t.pct) || 0) }; })
      .sort(function (a, b) { return a.minParty - b.minParty; });
  }
  groupTiers() { var c = this.state.content || {}; return this.normalizeGroupTiers(c.groupTiers); }
  tierPctFor(party) { party = Math.max(1, party || 1); var ts = this.groupTiers(), pct = 0; for (var i = 0; i < ts.length; i++) { if (party >= ts[i].minParty) pct = ts[i].pct; } return pct / 100; }
```
In `mergedContent`'s return add `groupTiers: c.groupTiers || defaults.groupTiers,`; in the `mergedContent({ … })` call add `groupTiers: this.defaultGroupTiers(),`. In `normalizePrograms`'s mapped object add `groupDiscount: (p.groupDiscount === undefined ? true : !!p.groupDiscount),` and add `groupDiscount: true` to every `defaultPrograms()` entry and to the `addProgram` default object and the `programByName` stub.

- [ ] **Step 2: Move concession state onto each archer; add `sameAsBooker`.** In the initial state, replace `archers: [{ name: '', dob: '' }],` with `archers: [{ name: '', dob: '', sel: {}, proof: {}, addons: {} }],` and add `sameAsBooker: false,`. Remove the top-level `eligSel: {},` and `eligProof: {},` state lines. In `resetForm`, mirror these changes (archers element shape, add `sameAsBooker: false`, drop `eligSel`/`eligProof`).

- [ ] **Step 3: Mirror + verify.** Mirror; `diff … && echo IDENTICAL`. `_verify.mjs`: assert `logic.tierPctFor(1)===0`, `tierPctFor(2)===0.1`, `tierPctFor(4)===0.2`, `tierPctFor(5)===0.3`, `tierPctFor(7)===0.3`; `logic.groupTiers().length===3`; `logic.programByName('Open Range').groupDiscount===true`; `logic.normalizeGroupTiers([{minParty:'4',pct:'25'}])` → `[{minParty:4,pct:25}]`; `logic.state.archers[0]` has `sel`/`proof`/`addons` objects and no top-level `eligSel` in state. 0 page errors.

- [ ] **Step 4: Commit.**
```bash
git add "index.html" "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Per-archer flow: group-discount config data model + per-archer concession state"
```

---

### Task 2: Pricing rework + per-archer booking request

**Files:** Modify `index.html` — `discountFor` (~the `discountFor(party)` method); `eligPerArcher`/`priceFor`/`editAmount`; the cost-estimate block (`renderVals`, ~4577–4675); `buildConcession`/`discountRows` to be per-archer; `confirmBooking`/`bookSlot` request `archers[]` + `perBookingAddons`. Mirror. Test.

**Interfaces:**
- Consumes: `tierPctFor` (Task 1), `programAddons` (#2), `discountList` (Phase 2).
- Produces: `discountFor(party, program)` honoring `groupDiscount`+tiers; per-archer `archerConcession(archer)` and `archerAddonTotal(archer, slots)`; `priceFor` using the new formula; `bookSlot` sends `archers:[{name,dob,concession,addons,amount}]` + `perBookingAddons` + `total`.

- [ ] **Step 1: Group discount from config.** Replace `discountFor(party)`:
```js
  discountFor(party, program) {
    if (program != null && !this.programByName(program).groupDiscount) return 0;
    return this.tierPctFor(party);
  }
```
Update its callers in the cost-estimate block and `priceFor`/`editAmount` to pass the program (`this.discountFor(party, this.state.form.program)`).

- [ ] **Step 2: Per-archer concession + add-on helpers.** Add:
```js
  archerConcessionPerSlot(archer) {
    if (!this.programByName(this.state.form.program).offerDiscounts) return 0;
    var sel = (archer && archer.sel) || {};
    return this.discountList().reduce(function (s, d) { return s + (sel[d.id] ? d.amount : 0); }, 0);
  }
  archerAddonPerSlot(archer) {
    var sel = (archer && archer.addons) || {};
    var per = this.programAddons(this.state.form.program).filter(function (a) { return a.scope === 'perArcher'; });
    return per.reduce(function (s, a) { return s + (sel[a.id] ? a.price : 0); }, 0);
  }
  perBookingAddonPerSlot() {
    var sel = this.state.perBookingAddons || {};
    var pb = this.programAddons(this.state.form.program).filter(function (a) { return a.scope === 'perBooking'; });
    return pb.reduce(function (s, a) { return s + (sel[a.id] ? a.price : 0); }, 0);
  }
```
Add `perBookingAddons: {}` to initial state + `resetForm`.

- [ ] **Step 3: New `priceFor`.** Replace `priceFor` so total = Σ over archers of `(rate − their concessions + their per-archer add-ons) × slots × (1−groupPct)`-on-the-rate-portion + per-booking add-ons × slots. Concretely, compute per slot then × slots:
```js
  priceFor(program, party, sessions) {
    party = Math.max(1, party); sessions = Math.max(0, sessions);
    var rate = this.rateFor(program), pct = this.discountFor(party, program);
    var archers = this.state.archers || [];
    var per = 0;
    for (var i = 0; i < party; i++) {
      var a = archers[i] || {};
      per += Math.round(rate * (1 - pct)) - this.archerConcessionPerSlot(a) + this.archerAddonPerSlot(a);
    }
    per += this.perBookingAddonPerSlot();
    return Math.max(0, Math.round(per * sessions));
  }
```
(The `eligPerArcher`/`bothConcessions` booking-level concession logic is replaced by the per-archer sum here.) Update `editAmount` similarly (single-session). Update the cost-estimate `renderVals` block to display base/group/concession/add-on lines from these helpers (keep the existing label bindings, recompute their values).

- [ ] **Step 4: Per-archer booking request.** In `bookSlot`, build `archers` line-items and send them. Replace the `concession`/`archerList` payload with:
```js
    const slots = times.length; // (single-date) or pairs.length (multi-date)
    const rate = this.rateFor(form.program), pct = this.discountFor(this.state.party, form.program);
    const archerItems = (this.state.archers || []).slice(0, this.state.party).map((a) => ({
      name: (a.name || '').trim(), dob: a.dob || '',
      concession: this.programByName(form.program).offerDiscounts ? this.buildConcession(a.sel, a.proof) : null,
      addons: this.programAddons(form.program).filter(x => x.scope === 'perArcher' && (a.addons || {})[x.id]).map(x => ({ id: x.id, name: x.name, price: x.price })),
      amount: Math.max(0, Math.round((Math.round(rate * (1 - pct)) - this.archerConcessionPerSlot(a) + this.archerAddonPerSlot(a)) * slots))
    }));
    const perBookingAddons = this.programAddons(form.program).filter(x => x.scope === 'perBooking' && (this.state.perBookingAddons || {})[x.id]).map(x => ({ id: x.id, name: x.name, price: x.price }));
```
Send `archers: archerItems, perBookingAddons: perBookingAddons, total: amount` in BOTH the POST body and the local-entry construction (every booking path: multi-date local/remote, single-date local/remote). (`buildConcession(sel, proof)` already exists from Phase 2 — it now takes a per-archer `sel`/`proof`.) The backend (`db-v26`) ignores the extra per-archer fields and even-splits `total` until Plan C; the customer-visible total is correct.

- [ ] **Step 5: Mirror + verify.** Mirror; `diff … && echo IDENTICAL`. `_verify.mjs`: set a program with a perArcher add-on (₱150) and a perBooking add-on (₱50) seeded via `setState({content:{programs:[…]}})`; set 2 archers, one with a concession ticked; pick 2 slots; assert `logic.priceFor(program, 2, 2)` equals the hand-computed total (base − group − concessions + add-ons, ×2 slots); assert `discountFor(2, programWithGroupOff)===0`. 0 page errors.

- [ ] **Step 6: Commit.**
```bash
git add "index.html" "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Per-archer flow: per-archer pricing (per-session add-ons, configurable group discount) + per-archer booking request"
```

---

### Task 3: Section reorder + progressive gating

**Files:** Modify `index.html` — both booking-form copies (desktop ~885–1160, mobile ~1257–1460): reorder into the six sections and wrap each in a gate `<sc-if>`; add the gate computed flags in `renderVals`. Mirror. Test.

**Interfaces:**
- Produces: `renderVals` flags `stepDetailsDone`, `stepArchersDone`, `stepProgramDone`, `stepDatesDone` (booleans), used as `<sc-if>` gates so each section shows only when the prior is complete.

- [ ] **Step 1: Gate flags.** In `renderVals` add (compute from existing locals):
```js
      stepDetailsDone: !!(f.name && f.name.trim() && f.phone && f.phone.trim() && validEmail(f.email)),
      stepArchersDone: archersComplete,
      stepProgramDone: !!this.state.form.program && !ageMismatch,
      stepDatesDone: (multiDateMode ? multiPairCount > 0 : chosenTimes.length > 0),
```
(These reuse `archersComplete`, `ageMismatch`, `multiPairCount`, `chosenTimes`, `validEmail`, `f` already computed in `renderVals`.)

- [ ] **Step 2: Reorder the desktop copy (~885–1160) into six gated sections, in order:** (1) Your details [name/phone/email] — always shown; (2) Who's shooting [party stepper + archer rows] wrapped in `<sc-if value="{{ stepDetailsDone }}">`; (3) Choose program [the `<select>`] wrapped in `<sc-if value="{{ stepArchersDone }}">`; (4) Pick dates [the multi-date picker] wrapped in `<sc-if value="{{ stepProgramDone }}">`; (5) Per-archer extras [Task 4 placeholder — leave a `<sc-if value="{{ stepDatesDone }}"><div data-test="card-extras"></div></sc-if>` empty container for now]; (6) Your quote [estimated total + confirm] wrapped in `<sc-if value="{{ stepDatesDone }}">`. Move the existing markup blocks (identified by their `data-test`/labels) into this order; do not change their internals yet. Keep the status-message blocks (`statusFull`/`statusError`/`formError`/etc.) just above the quote.

- [ ] **Step 3: Reorder the mobile copy (~1257–1460) into the identical six-section order** with the same gate `<sc-if>`s. (The mobile copy currently has party/concessions before archers — reorder to match.)

- [ ] **Step 4: Mirror + verify.** Mirror; `diff … && echo IDENTICAL`. `_verify.mjs`: load the book page; assert the Who's-shooting section is hidden until name+phone+valid email are filled; after filling them it appears; the program select stays hidden until each archer has name+DOB; the date picker stays hidden until a program is chosen; the quote stays hidden until a slot is picked. 0 page errors.

- [ ] **Step 5: Commit.**
```bash
git add "index.html" "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Per-archer flow: reorder booking into 6-section progressive flow with unlock gating (both copies)"
```

---

### Task 4: Age-filtered program list + Same-as-booker

**Files:** Modify `index.html` — the `programOpts` builder (`renderVals`); the program `<select>` (both copies); the archer rows builder + the Who's-shooting markup (both copies) for the "Same as booker" checkbox. Mirror. Test.

**Interfaces:**
- Consumes: `archerRows`/age logic (existing), `programList` (#1 of dynamic programs).
- Produces: `programOpts` filtered to programs fitting all archers; archer-row `sameAsBooker` toggle that prefills archer-1 name.

- [ ] **Step 1: Age-fit program filter.** Replace the `programOpts` binding with a filtered list: a program fits if it has no age range OR every archer's age (computed on the chosen date via the existing `ageOnDate`/age logic) is within `[minAge, maxAge]`. Add a helper `programsFittingArchers()` that returns the `programList()` filtered, and `programOpts: this.programsFittingArchers().map(p => ({ name: p.name }))`. When archers have no DOB yet, show all programs (no filter). If the currently-selected `form.program` is filtered out, leave it selected but the existing `ageMismatch` warning still shows.

- [ ] **Step 2: Same-as-booker.** Add `toggleSameAsBooker` to `renderVals` (`() => this.setState(s => { var ar = (s.archers||[]).slice(); ar[0] = { ...(ar[0]||{}), name: !s.sameAsBooker ? (s.form.name||'') : (ar[0]&&ar[0].name||'') }; return { sameAsBooker: !s.sameAsBooker, archers: ar }; })`) and the computed `sameAsBookerOn`/`sameAsBookerBox`/`sameAsBookerCheck`. In the Who's-shooting markup (both copies), above the archer rows, add a checkbox button bound to `{{ toggleSameAsBooker }}` labelled "Archer 1 is me (same as booker)". When on, archer-1's name input shows the booker's name (still editable; DOB always entered).

- [ ] **Step 3: Mirror + verify.** Mirror; `diff … && echo IDENTICAL`. `_verify.mjs`: fill booker name "Jdoe"; set 1 archer; click "same as booker" → archer-1 name input value === "Jdoe". Set 2 archers with DOBs making them 7 and 9 → program list includes "Little Archers (6–10)" and excludes "Adult Beginners (18+)"; set ages 8 and 30 → only no-age-limit programs (Open Range etc.) listed. 0 page errors.

- [ ] **Step 4: Commit.**
```bash
git add "index.html" "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Per-archer flow: age-filtered program list + same-as-booker prefill"
```

---

### Task 5: Per-archer extras section (concessions + add-ons selection)

**Files:** Modify `index.html` — the `data-test="card-extras"` container (both copies); add `archerExtraRows`/`perBookingAddonRows` builders + per-archer toggle handlers in `renderVals`. Mirror. Test.

**Interfaces:**
- Consumes: `discountList` (Phase 2), `programAddons` (#2), per-archer `sel`/`proof`/`addons` state (Task 1), the `card-extras` gate (Task 3).
- Produces: `archerExtraRows` (one per archer, each with its concession rows + per-archer add-on rows + closures), `perBookingAddonRows`; handlers `toggleArcherConc_(i,id)`/`setArcherProof_(i,id,v)`/`toggleArcherAddon_(i,id)`/`toggleBookingAddon_(id)`.

- [ ] **Step 1: Builders + handlers.** Add to the class: `archerExtraRows()` returning, per archer `i`, `{ name, concRows:[…], addonRows:[…], hasAny }` where `concRows` come from `discountList()` (only when the program `offerDiscounts`) with per-archer checked/proof/border (mirroring the existing `discountRows()` shape but keyed to `archers[i].sel`/`.proof`), and `addonRows` from `programAddons(program)` filtered to `scope==='perArcher'` with checked state from `archers[i].addons`; and `perBookingAddonRows()` from `programAddons(program)` filtered to `scope==='perBooking'`. Add the four immutable `setState` handlers that update `archers[i].sel`/`.proof`/`.addons` and `state.perBookingAddons` (spread-copy the archers array + the nested object). Bind `archerExtraRows: this.archerExtraRows(), perBookingAddonRows: this.perBookingAddonRows()` in `renderVals`.

- [ ] **Step 2: Markup.** In the `card-extras` container (both copies), render `<sc-for list="{{ archerExtraRows }}" as="ax">`: the archer's name heading, then its concession checkboxes+proof inputs (reusing the existing concession-row visual from `discountRows`, now per-archer via `ax.concRows`), then its per-archer add-on checkboxes (`ax.addonRows`). Below the archer loop, a per-booking add-ons block from `<sc-for list="{{ perBookingAddonRows }}" as="pa">`. Use precomputed styles only (no `{{ }}` expressions); straight ASCII quotes.

- [ ] **Step 3: Mirror + verify.** Mirror; `diff … && echo IDENTICAL`. `_verify.mjs`: seed a program with `offerDiscounts:true` + a perArcher add-on + a perBooking add-on; drive to the extras section with 2 archers; tick a concession for archer 1 only and a per-archer add-on for archer 2 only; assert `logic.state.archers[0].sel` has the concession and `archers[1].addons` has the add-on (independent per archer); tick the per-booking add-on → `logic.state.perBookingAddons` has it; the estimated total updates to match `priceFor`. Run `node _verify.mjs`; then delete scratch (`rm -f _verify.mjs _srv.mjs package.json package-lock.json && rm -rf node_modules`).

- [ ] **Step 4: Commit.**
```bash
git add "index.html" "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Per-archer flow: per-archer concessions + add-ons selection section"
```

---

## Self-Review

**Spec coverage** (against `2026-06-27-per-archer-booking-flow-design.md`, Sections 1–2 + the group-discount data model of Section 3):
- Reordered 6-section progressive flow with gating → Task 3. ✓
- Archers-first (Who's shooting: party + name/DOB) + same-as-booker → Tasks 3–4. ✓
- Age-filtered program list (fits all archers) → Task 4. ✓
- Multi-day date picker reused, unchanged → Task 3 (moved, not modified). ✓
- Per-archer concessions (+proof) + per-archer add-ons + per-booking add-ons → Tasks 1, 2, 5. ✓
- Per-session add-on pricing + configurable group discount + per-archer concession sum → Task 2. ✓
- Group-discount **data model + defaults + pricing reads** → Task 1 (admin **editor** = Plan B). ✓
- Per-archer booking request (`archers[]`+`perBookingAddons`+`total`) → Task 2. ✓
- **Deferred (correctly not here):** admin group-discount/tiers **editor** UI → Plan B; backend per-archer event wiring (`db-v27`) → Plan C; admin per-archer breakdown display → #6.

**Placeholder scan:** Task 3 Step 2 leaves an intentionally-empty `card-extras` container that Task 5 fills — this is a real, named hand-off (not a TODO): the container + its gate exist and are testable in Task 3; Task 5 populates it. Every code step shows complete code or an exact, anchored transformation; verify steps name concrete assertions with computed expected values.

**Type/name consistency:** `tierPctFor`/`discountFor(party,program)`/`groupTiers`/`groupDiscount`; per-archer state `archers[i].{sel,proof,addons}` + `perBookingAddons`; `archerConcessionPerSlot`/`archerAddonPerSlot`/`perBookingAddonPerSlot`; `archerExtraRows`/`perBookingAddonRows` + the four toggle handlers; the gate flags `stepDetailsDone`/`stepArchersDone`/`stepProgramDone`/`stepDatesDone` — all used consistently across Tasks 1–5. The booking request `archers:[{name,dob,concession,addons,amount}]`/`perBookingAddons`/`total` matches the spec's Section-4 interface (consumed by Plan C).
