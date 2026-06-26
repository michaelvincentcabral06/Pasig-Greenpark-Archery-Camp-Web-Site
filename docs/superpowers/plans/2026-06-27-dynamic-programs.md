# Dynamic Programs (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Programs become an editable content list with per-program toggles (price/coach/multi-day/discounts/age); the booking flow reads each program's settings instead of matching its name; an admin editor manages them.

**Architecture:** Frontend-only in the single SuperConductor component (`index.html`, mirrored). A `programs` CONTENT array + two lookups (`programList`/`programByName`) replace every `/Open Range/`/`/Private/`/`PROGRAM_AGE` name-check. **No backend change, no redeploy** (the backend drives off the request shape + amount).

**Tech Stack:** SuperConductor template, plain class-component JS, Playwright-core.

## Global Constraints

- **Mirror rule:** every `index.html` edit mirrored to `Pasig Greenpark Archery Camp.dc.html`; finish with `diff index.html "Pasig Greenpark Archery Camp.dc.html" && echo IDENTICAL`.
- **Frontend-only. No backend change, no redeploy.** Pushes to GitHub Pages.
- **SuperConductor:** NO JS ternaries inside style `{{ }}`; **straight ASCII quotes** in HTML attributes (a recurring pitfall — verify after editing).
- **Preserve launch behavior:** with the seeded defaults, the booking flow behaves exactly as today.
- **Backward compatibility:** legacy CONTENT without `programs` → defaults; `programByName` returns a safe default (coach-required, ₱600, no age limit, single-day, no discounts) for any unknown name.
- **Verification:** Playwright-core driving the real DOM via the React-fiber `logic` instance. Chromium at `C:\Users\Michael Cabral\AppData\Local\ms-playwright\chromium-1228\chrome-win64\chrome.exe`; install if missing `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright-core --no-save`. Scratch `_verify_prog.mjs` (gitignored), deleted before finishing.

---

### Task 1: Program data model + booking-flow lookups

**Files:** Modify `index.html` (methods near `defaultPackages` ~3480; `rateFor`/`eligPerArcher`/`bothConcessions` ~3279-3300; `needsCoach` ~2850; `mergedContent` ~2942 + the `mergedContent({...})` call ~4247; the `PROGRAM_AGE` block ~4399; `editAmount` ~3834/3848; `bookSlot` ~3326; `confirmBooking` ~4464; `multiDateMode`/`isOpenRange` render-locals/bindings ~4481/5388; the program `<select>` ~902 & ~1324; render-return). Mirror. Test `_verify_prog.mjs`.

**Interfaces:** Produces `defaultPrograms()`, `normalizePrograms()`, `programList()`, `programByName(name)`, and the `programOpts` binding (consumed by Task 2 + the dropdown).

- [ ] **Step 1: Add the data-model methods** (near `defaultPackages`):
```js
  defaultPrograms() {
    return [
      { name: 'Little Archers (6–10)', price: 600, needsCoach: true,  multiDay: false, offerDiscounts: false, minAge: 6,  maxAge: 10,  blurb: '' },
      { name: 'Youth Squad (11–17)',   price: 600, needsCoach: true,  multiDay: false, offerDiscounts: false, minAge: 11, maxAge: 17,  blurb: '' },
      { name: 'Adult Beginners (18+)',      price: 600, needsCoach: true,  multiDay: false, offerDiscounts: false, minAge: 18, maxAge: null, blurb: '' },
      { name: 'Open Range',                 price: 400, needsCoach: false, multiDay: true,  offerDiscounts: true,  minAge: null, maxAge: null, blurb: '' },
      { name: 'Private Coaching',           price: 1200, needsCoach: true, multiDay: false, offerDiscounts: false, minAge: null, maxAge: null, blurb: '' },
      { name: 'Group & Corporate',          price: 600, needsCoach: true,  multiDay: false, offerDiscounts: false, minAge: null, maxAge: null, blurb: '' }
    ];
  }
  normalizePrograms(progs) {
    var list = (progs && progs.length) ? progs : this.defaultPrograms();
    return list.map(p => ({
      name: p.name || 'Program', price: Number(p.price) || 0,
      needsCoach: !!p.needsCoach, multiDay: !!p.multiDay, offerDiscounts: !!p.offerDiscounts,
      minAge: (p.minAge == null || p.minAge === '') ? null : (parseInt(p.minAge, 10) || null),
      maxAge: (p.maxAge == null || p.maxAge === '') ? null : (parseInt(p.maxAge, 10) || null),
      blurb: p.blurb || ''
    }));
  }
  programList() { var c = this.state.content || {}; return this.normalizePrograms(c.programs); }
  programByName(name) {
    var list = this.programList();
    for (var i = 0; i < list.length; i++) { if (list[i].name === name) return list[i]; }
    return { name: name || '', price: 600, needsCoach: true, multiDay: false, offerDiscounts: false, minAge: null, maxAge: null, blurb: '' };
  }
```

- [ ] **Step 2: Seed defaults in `mergedContent`.** Add `programs: c.programs || defaults.programs,` to the `mergedContent` return (~2942, beside `packages:`), and add `programs: this.defaultPrograms(),` to the `mergedContent({ … })` call args (~4247, beside `packages: defaultPackages`).

- [ ] **Step 3: Price → program price.** `rateFor` (~3279-3281) becomes:
```js
  rateFor(program) { return this.programByName(program).price; }
```
(`cfgRates` stays for any other use; programs no longer read it.)

- [ ] **Step 4: Coach → toggle.** `needsCoach` (~2850):
```js
  needsCoach(program) { return !!this.programByName(program).needsCoach; }
```

- [ ] **Step 5: Discounts → toggle.** Replace the `/Open Range/i` discount gates with `offerDiscounts`:
  - `eligPerArcher` (~3285): `if (!this.programByName(this.state.form.program).offerDiscounts) return 0;`
  - `bothConcessions(program)` (~3298): `return this.programByName(program).offerDiscounts && this.state.eligPac && this.state.eligLocal;`
  - `editAmount` `open` (~3834): `const open = this.programByName(program).offerDiscounts;`
  - `editAmount` concession object (~3848): `const concession = this.programByName(program).offerDiscounts ? {` … (keep the object body).

- [ ] **Step 6: Multi-day + discounts in the booking handlers.**
  - `bookSlot` (~3326): `const openRange = this.programByName(form.program).multiDay;` (this var drives the multi-date booking path — it's multi-day).
  - `bookSlot` concession object (~3848 region inside bookSlot, if a second `/Open Range/i` exists there): gate on `this.programByName(form.program).offerDiscounts`.
  - `confirmBooking` (~4464): split the overloaded flag —
    ```js
    const isMulti = this.programByName(f.program).multiDay;
    const offersDisc = this.programByName(f.program).offerDiscounts;
    const proofBlock = offersDisc && ((this.state.eligPac && !this.state.wapId.trim()) || (this.state.eligLocal && !this.state.localProof.trim()) || (this.state.eligPasig && !this.state.pasigProof.trim()));
    ```
    then replace the remaining `openRange ?` uses (mPairs/noSlot/sc) with `isMulti ?`. Remove the old `const openRange = /Open Range/i.test(...)`.

- [ ] **Step 7: Age range → program min/max.** Replace the `PROGRAM_AGE` constant + lookup (~4399-4404) with:
```js
    var _pg = this.programByName(this.state.form.program);
    const ageRange = (_pg.minAge != null) ? [_pg.minAge, (_pg.maxAge != null ? _pg.maxAge : 120)] : null;
```
(`ageRangeLabel`, `showArcherDetails`, and the age-fit check downstream are unchanged.)

- [ ] **Step 8: Bindings.** In the render-return: redefine `multiDateMode` (~4481 render-local) and `isOpenRange` (~5388) to read the toggles, and add `programOpts`:
```js
    const multiDateMode = this.programByName(this.state.form.program).multiDay;
    ...
      isOpenRange: this.programByName(this.state.form.program).offerDiscounts,
      programOpts: this.programList().map(function (p) { return { name: p.name }; }),
```
**Verify the three `{{ isOpenRange }}` markup sites (~1091, ~1135, ~1347) are all discount/concession sections** (they should be). If any gates a multi-day element instead, gate that one on a new `isMultiDay` binding rather than `isOpenRange`.

- [ ] **Step 9: Booking dropdown from the list.** Replace the hardcoded `<option>` list inside BOTH program `<select>`s (~902-909 and ~1324-1331) with:
```html
                  <sc-for list="{{ programOpts }}" as="po" hint-placeholder-count="5"><option value="{{ po.name }}">{{ po.name }}</option></sc-for>
```
(Keep the `<select value="{{ fProgram }}" onChange="{{ setProgram }}" …>` wrapper.)

- [ ] **Step 10: Mirror + verify.** `cp` + `diff … && echo IDENTICAL`. Build `_verify_prog.mjs` (reach `logic` via the fiber). Assert:
  - `programList()` returns the 6 seeded names; the dropdown renders them.
  - **Defaults match today:** with `form.program='Adult Beginners (18+)'` → `needsCoach` true, `multiDateMode` false, `isOpenRange` false, `rateFor` 600, `ageRange` [18,120]. With `'Open Range'` → `needsCoach` false, `multiDateMode` true, `isOpenRange` true, `rateFor` 400, `ageRange` null. `'Private Coaching'` → 1200.
  - **Custom program flips behavior:** `setState({ content:{ programs:[{name:'Drop-in', price:500, needsCoach:false, multiDay:true, offerDiscounts:false, minAge:null, maxAge:null}] } })`; `setState({form:{...form, program:'Drop-in'}})` → `needsCoach('Drop-in')` false, `multiDateMode` true, `isOpenRange` false, `rateFor` 500, and `priceFor('Drop-in',2,1,1)` = 1000 (no discounts).
  - **Unknown name** (`programByName('Legacy Thing')`) → safe default (needsCoach true, price 600, ageRange null) — no crash.
  - 0 real console errors. Mirror IDENTICAL.

- [ ] **Step 11: Commit.**
```bash
git add index.html "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Dynamic programs T1: programs as content data; booking flow reads per-program toggles (price/coach/multi-day/discounts/age) via programByName, replacing Open Range/Private/PROGRAM_AGE name-checks; dropdown from the list"
```

---

### Task 2: Admin Programs editor (Pricing tab)

**Files:** Modify `index.html` (handlers near the pass editor ~4599-4610; render-return ~5640; the Pricing-tab markup near the pass-editor block). Mirror. Test `_verify_prog.mjs` (extend).

**Interfaces:** Consumes Task 1 (`programList`, the `programs` CONTENT key, `saveCM`). Produces `programEdits`, `addProgram`, `removeProgram`, and the per-field setters; persists via the admin-authed content path.

- [ ] **Step 1: Editor handlers** (beside `updatePackage`/`addPass`/`removePass`, ~4599-4610):
```js
    const setProgField = (i, key) => (e) => { const v = e.target.value; const ps = (cm.programs || this.defaultPrograms()).map((p, idx) => idx === i ? { ...p, [key]: v } : p); saveCM({ programs: ps }); };
    const setProgNum   = (i, key) => (e) => { const v = (e.target.value === '' ? null : (Number(e.target.value) || 0)); const ps = (cm.programs || this.defaultPrograms()).map((p, idx) => idx === i ? { ...p, [key]: v } : p); saveCM({ programs: ps }); };
    const toggleProg   = (i, key) => () => { const ps = (cm.programs || this.defaultPrograms()).map((p, idx) => idx === i ? { ...p, [key]: !p[key] } : p); saveCM({ programs: ps }); };
    const removeProgram = (i) => () => saveCM({ programs: (cm.programs || this.defaultPrograms()).filter((_, idx) => idx !== i) });
    const addProgram = () => saveCM({ programs: (cm.programs || this.defaultPrograms()).concat([{ name: 'New program', price: 600, needsCoach: true, multiDay: false, offerDiscounts: false, minAge: null, maxAge: null, blurb: '' }]) });
    const programEdits = (cm.programs || this.defaultPrograms()).map((p, i) => ({
      name: p.name, price: p.price, blurb: p.blurb || '',
      minAge: (p.minAge == null ? '' : p.minAge), maxAge: (p.maxAge == null ? '' : p.maxAge),
      needsCoach: !!p.needsCoach, multiDay: !!p.multiDay, offerDiscounts: !!p.offerDiscounts,
      coachBg: p.needsCoach ? '#244232' : '#fffdf6', coachFg: p.needsCoach ? '#f4efe4' : '#244232',
      multiBg: p.multiDay ? '#244232' : '#fffdf6', multiFg: p.multiDay ? '#f4efe4' : '#244232',
      discBg: p.offerDiscounts ? '#244232' : '#fffdf6', discFg: p.offerDiscounts ? '#f4efe4' : '#244232',
      setName: setProgField(i, 'name'), setPrice: setProgNum(i, 'price'),
      setMinAge: setProgNum(i, 'minAge'), setMaxAge: setProgNum(i, 'maxAge'), setBlurb: setProgField(i, 'blurb'),
      toggleCoach: toggleProg(i, 'needsCoach'), toggleMulti: toggleProg(i, 'multiDay'), toggleDisc: toggleProg(i, 'offerDiscounts'),
      remove: removeProgram(i)
    }));
```
(Pre-compute the toggle button colors as fields — no ternaries in style bindings.)

- [ ] **Step 2: Render-return.** Add `programEdits, addProgram` (beside `pkgEdits`/`addPass`, ~5640).

- [ ] **Step 3: Editor markup.** In the Pricing tab, before or after the pass-editor block, add a "Programs (classes customers book)" section: a `<sc-for list="{{ programEdits }}" as="pg">` of rows, each with — name (text, `value="{{ pg.name }}" onInput="{{ pg.setName }}"`), price (number, `pg.setPrice`), three toggle `<button>`s (`onClick="{{ pg.toggleCoach }}"` etc., `style="background:{{ pg.coachBg }};color:{{ pg.coachFg }};…"` with labels "Needs a coach"/"Multiple days"/"Discounts"), Min age + Max age (number inputs, `pg.setMinAge`/`pg.setMaxAge`, placeholder "—"), a Blurb textarea (`pg.setBlurb`), and a **Remove** button — followed by a **+ Add program** button (`onClick="{{ addProgram }}"`). Match the pass-editor styling (straight ASCII quotes; no style ternaries — use the pre-computed `*Bg`/`*Fg`).

- [ ] **Step 4: Mirror + verify + cleanup.** `cp` + `diff … && echo IDENTICAL`. Extend `_verify_prog.mjs`: drive the admin (set authed + `adminTab:'pricing'`); assert `programEdits` renders a row per program; editing a price (`setPrice`) and toggling a flag updates `programList()` and fires a `setContent` POST; `addProgram` appends a row; `removeProgram` drops one; a new program then appears in the booking dropdown (`programOpts`). Run `node _verify_prog.mjs` (all T1+T2 green, 0 real console errors). Delete scratch: `rm -f _verify_prog.mjs && rm -rf node_modules package.json package-lock.json`.

- [ ] **Step 5: Commit.**
```bash
git add index.html "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Dynamic programs T2: admin Programs editor in the Pricing tab (name/price/toggles/age/blurb, add/remove) persisting via the authed content path"
```

---

## Self-review notes

- **Spec coverage:** data model + defaults (T1 S1-2); price/coach/discount/multi-day/age replacements (T1 S3-8) — every enumerated name-check (`rateFor`, `eligPerArcher`, `bothConcessions`, `needsCoach`, `editAmount`, `bookSlot`, `confirmBooking`, `PROGRAM_AGE`, `multiDateMode`, `isOpenRange`); dropdown from list (T1 S9); admin editor (T2). All spec sections map.
- **Overload split:** `confirmBooking` and `bookSlot` separate `multiDay` (booking path / slot count) from `offerDiscounts` (proof/concession) — the key correctness point.
- **No markup churn risk:** `multiDateMode`/`isOpenRange` bindings are redefined so existing `{{ }}` sites keep working; only the dropdown markup + the new editor change. T1 S8 verifies the `isOpenRange` sites are all discount-related.
- **Backend untouched:** no `Code.gs` change; the booking request shape (amount, coach, dates-vs-date) already carries everything; `programByName` safe-defaults protect legacy names.
- **No style ternaries:** editor toggle colors pre-computed (`coachBg` etc.); price/age via number inputs.
- **Mirror discipline:** each task ends `cp` + `diff … && echo IDENTICAL`; scratch removed in T2.
