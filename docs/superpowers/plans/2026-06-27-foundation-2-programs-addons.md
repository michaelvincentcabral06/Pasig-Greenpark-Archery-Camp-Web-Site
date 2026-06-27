# Booking Foundation #2 — Multi-day Programs & Add-ons — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every program multi-day (remove the session-count stepper), remove the "Professional coach" add-on, and add an admin-editable per-program add-ons list (name, price, per-archer/per-booking scope).

**Architecture:** Frontend-only changes to `index.html` (a ~5700-line custom "SuperConductor" template app), mirrored byte-for-byte to `Pasig Greenpark Archery Camp.dc.html`. Programs are an existing editable content array; add-ons become a nested array on each program, edited in the Pricing-tab Programs editor (same pattern as the discounts editor). The backend already trusts the computed `amount`, so **no backend change, no redeploy**.

**Tech Stack:** SuperConductor template, plain class-component JS, Playwright-core for verification.

## Global Constraints

- **Mirror rule:** every `index.html` edit is mirrored verbatim to `Pasig Greenpark Archery Camp.dc.html`. End each task with `diff "index.html" "Pasig Greenpark Archery Camp.dc.html" && echo IDENTICAL`. The files are byte-identical now.
- **Frontend-only. No backend change, no redeploy.** Pushes to GitHub Pages.
- **SuperConductor:** NO JS expressions inside style/attribute `{{ }}` — precompute every value in the data layer (`renderVals`); straight ASCII quotes in HTML attributes; per-item `<sc-for>` rows carry their own values + closures, built in the data layer.
- **Add-on scope** is exactly one of the two string literals `'perArcher'` or `'perBooking'`.
- **Stable ids:** add-on `id` is a slug generated once from the name (via the existing `slugify_`) and frozen on rename, like discount ids.
- **Coach/session scope (this plan):** only the **desktop booking form** (~lines 900–1160) contains the session stepper and the coach add-on; the mobile form copy (~1290–1380) has neither. Touch only what each task names.
- **Verification:** Playwright-core driving the real DOM. Chromium at `C:\Users\Michael Cabral\AppData\Local\ms-playwright\chromium-1228\chrome-win64\chrome.exe`; if missing, `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright-core --no-save`. **Serve over HTTP, not `file://`** (file:// triggers CORS that breaks the dc runtime). Minimal server (scratch `_srv.mjs`):
  ```js
  import http from 'http'; import fs from 'fs'; import path from 'path';
  const root = process.cwd();
  http.createServer((req,res)=>{ let p=decodeURIComponent(req.url.split('?')[0]); if(p==='/')p='/index.html';
    fs.readFile(path.join(root,p),(e,d)=>{ if(e){res.writeHead(404);res.end('nf');return;}
      const ext=path.extname(p); res.writeHead(200,{'Content-Type': ext==='.html'?'text/html':'text/plain'}); res.end(d); }); })
    .listen(8099,'127.0.0.1',()=>console.log('UP'));
  ```
  Load `http://127.0.0.1:8099/index.html`. Drive the **real UI** (click the "Book a Session" nav, `selectOption` on the program `<select>`, read the DOM) and assert via `document.querySelectorAll`/visibility (`el.offsetParent !== null`). Capture `console`/`pageerror`. Use one scratch `_verify.mjs` (gitignored), deleted before finishing along with `_srv.mjs`, `node_modules`, `package.json`, `package-lock.json`. Do NOT commit any scratch file.

---

### Task 1: Remove the "Professional coach" add-on

**Files:**
- Modify: `index.html` — the Add-ons card (~1107–1118); initial state `coachAddon` (~2614); `resetForm` (~4437); the coach-addon data-layer bindings (~5492, 5494–5497).
- Mirror: `Pasig Greenpark Archery Camp.dc.html`

**Interfaces:**
- Produces: removal only — after this task no `coachAddon`, `toggleCoachAddon`, `coachAddonOn`, `coachAddonCheck`, `coachAddonBox`, or `showCoachAddon` identifiers remain in `index.html`.

- [ ] **Step 1: Delete the Add-ons card.** Remove the entire block from `<sc-if value="{{ showCoachAddon }}" …>` through its closing `</sc-if>` (the `<!-- CARD: Add-ons … -->` comment at ~1106 and lines 1107–1118). It renders the "Professional coach ₱1,200" add-on.

- [ ] **Step 2: Remove the state field.** In the initial state object delete the line:
```js
    coachAddon: false,
```
(~2614).

- [ ] **Step 3: Remove from `resetForm`.** In `resetForm` (~4437) delete the `coachAddon: false,` key from the `setState({...})` argument (leave every other key intact).

- [ ] **Step 4: Remove the data-layer bindings.** In `renderVals` delete these lines:
```js
      showCoachAddon: !this.programByName(this.state.form.program).needsCoach,
      coachAddonOn: !!this.state.coachAddon,
      coachAddonCheck: this.state.coachAddon ? '✓' : '',
      coachAddonBox: this.state.coachAddon ? '#7fb43f' : 'transparent',
      toggleCoachAddon: () => this.setState({ coachAddon: !this.state.coachAddon }),
```
(~5492 and ~5494–5497; keep the `programOpts:` line that sits between them).

- [ ] **Step 5: Mirror + verify.** Copy `index.html` over the mirror; `diff … && echo IDENTICAL`. Build `_verify.mjs` (serve over HTTP per Global Constraints). Assert: navigating to the booking form and selecting **Open Range** (a `needsCoach=false` program, which previously showed the add-on) renders **no** "Professional coach" text anywhere (`document.body.innerText` does not include `Professional coach`); 0 `pageerror`s. Also grep the file: `grep -nE "coachAddon|showCoachAddon|Professional coach" index.html` returns nothing. Run `node _verify.mjs`.

- [ ] **Step 6: Commit.**
```bash
git add "index.html" "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Foundation #2: remove the Professional coach add-on"
```

---

### Task 2: All programs multi-day (drop the session stepper)

**Files:**
- Modify: `index.html` — `multiDateMode` (~4566); the session stepper block (~906–920); `confirmBooking` session-target check (~4554–4555); `effSessions` (~4647); `bumpSession`/`setSession` (~4638–4645); session data-layer bindings (~5482–5485); initial state `sessionTarget` (~2613); `resetForm` (~4437); the admin "Multiple days" toggle (button ~2306, bindings `multiBg`/`multiFg` ~4695, `toggleMulti` ~4699).
- Mirror: `Pasig Greenpark Archery Camp.dc.html`

**Interfaces:**
- Consumes: nothing new.
- Produces: `multiDateMode` is always `true`; `effSessions === slotCount`; no `sessionTarget`/`sessionMismatch`/`bumpSession`/`setSession*` identifiers remain; the admin Programs editor has no "Multiple days" toggle (`toggleMulti`/`multiBg`/`multiFg` gone).

- [ ] **Step 1: Force multi-day everywhere.** Replace (~4566):
```js
    const multiDateMode = this.programByName(this.state.form.program).multiDay;
```
with:
```js
    const multiDateMode = true; // Foundation #2: every program is multi-day
```

- [ ] **Step 2: Delete the session stepper UI.** Remove the `<div>` block that renders "How many sessions?" — the wrapper `<div>` opening at ~906 through its closing `</div>` at ~920 (the label, the −/+ stepper with `{{ sessionTargetLabel }}`, the `setSession1/3/5/10` grid, and the `{{ sessionsChosenLabel }}` paragraph). Leave the program `<select>` block above (closing at ~905) and the `<!-- ARCHER DETAILS -->` block below (~922) untouched.

- [ ] **Step 3: Drop the session-mismatch gate in `confirmBooking`.** Remove these two lines (~4554–4555):
```js
      const target = Math.max(1, this.state.sessionTarget || 1);
      if (this.state.page === 'book' && sc !== target) { this.setState({ bookingStatus: 'sessionMismatch' }); return; }
```
The `const sc = …` line just above becomes unused; delete it too if present on its own line (`const sc = isMulti ? mPairs : (this.state.slotTimes || []).length;`).

- [ ] **Step 4: Simplify `effSessions`.** Replace (~4647):
```js
    const effSessions = Math.max(slotCount, Math.max(1, st.sessionTarget || 1));
```
with:
```js
    const effSessions = slotCount;
```

- [ ] **Step 5: Remove the session-target helpers + bindings.** Delete `bumpSession` and `setSession` (~4638–4645):
```js
    const bumpSession = (delta) => () => {
      const cur = Math.max(1, st.sessionTarget || 1);
      const floor = Math.max(1, slotCount); // can't drop below slots already chosen
      let next = Math.min(20, Math.max(floor, cur + delta));
      if (next === cur) { if (delta < 0 && cur <= floor) this.setState({ bookingStatus: 'sessionFloor' }); return; }
      this.setState({ sessionTarget: next, bookingStatus: '' });
    };
    const setSession = (n) => () => this.setState({ sessionTarget: Math.min(20, Math.max(Math.max(1, slotCount), n)), bookingStatus: '' });
```
And delete these data-layer bindings (~5482–5485):
```js
      sessionTarget: Math.max(1, st.sessionTarget || 1),
      sessionTargetLabel: String(Math.max(1, st.sessionTarget || 1)) + (Math.max(1, st.sessionTarget||1) === 1 ? ' session' : ' sessions'),
      incSession: bumpSession(1), decSession: bumpSession(-1),
      setSession1: setSession(1), setSession3: setSession(3), setSession5: setSession(5), setSession10: setSession(10),
```
Also find and delete the `sessionsChosenLabel:` binding in `renderVals` (its only consumer, the `{{ sessionsChosenLabel }}` paragraph, was removed in Step 2). Search: `grep -n "sessionsChosenLabel" index.html`.

- [ ] **Step 6: Remove `sessionTarget` state.** Delete `sessionTarget: 1,` from the initial state (~2613) and the `sessionTarget: 1,` key from `resetForm`'s `setState({...})` (~4437).

- [ ] **Step 7: Drop the admin "Multiple days" toggle.** In the Programs editor row delete the button (~2306):
```html
                    <button onClick="{{ pg.toggleMulti }}" style="background:{{ pg.multiBg }};color:{{ pg.multiFg }};border:1px solid rgba(36,66,50,0.3);cursor:pointer;font-family:'Hanken Grotesk',sans-serif;font-size:12px;font-weight:700;padding:7px 14px;border-radius:999px;">Multiple days</button>
```
In the `programEdits` builder delete the `multiBg`/`multiFg` line (~4695):
```js
      multiBg: p.multiDay ? '#244232' : '#fffdf6', multiFg: p.multiDay ? '#f4efe4' : '#244232',
```
and remove `toggleMulti: toggleProg(i, 'multiDay'),` from the line at ~4699 (keep `toggleCoach` and `toggleDisc`).

- [ ] **Step 8: Mirror + verify.** Mirror; `diff … && echo IDENTICAL`. Extend `_verify.mjs`: on the booking form, for **Adult Beginners (18+)** (a former single-date program) assert the **multi-date picker shows** (text "Pick your dates" is present and visible) and the session stepper is **gone** (`document.body.innerText` does not include "How many sessions"); switch to **Open Range** and assert the same; drive the admin (set authed + Pricing tab as the Phase-2 verification did, or assert on the editor markup) and confirm the Programs editor rows have **no** "Multiple days" button (innerText excludes "Multiple days"); 0 `pageerror`s. `grep -nE "sessionTarget|sessionsChosenLabel|setSession|bumpSession|toggleMulti|multiBg" index.html` returns nothing. Run `node _verify.mjs`.

- [ ] **Step 9: Commit.**
```bash
git add "index.html" "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Foundation #2: all programs multi-day; remove session-count stepper + admin Multiple-days toggle"
```

---

### Task 3: Add-ons data model

**Files:**
- Modify: `index.html` — `defaultPrograms()` (~3494–3503); `normalizePrograms()` (~3504–3513); add `programAddons()` helper next to `programByName` (~3519).
- Mirror: `Pasig Greenpark Archery Camp.dc.html`
- Test: `_verify.mjs`

**Interfaces:**
- Consumes: existing `slugify_(s)` (from Phase 2).
- Produces: program objects gain `addons: [ { id:string, name:string, price:number, scope:'perArcher'|'perBooking' } ]`; `normalizeAddons(list)` returns the normalized array; `programAddons(programName)` returns the selected program's normalized add-ons (or `[]`).

- [ ] **Step 1: Seed empty add-ons in `defaultPrograms`.** In each of the 6 program literals (~3496–3501) add `addons: []` as the final field. Example for the first:
```js
      { name: 'Little Archers (6–10)', price: 600, needsCoach: true,  multiDay: false, offerDiscounts: false, minAge: 6,  maxAge: 10,  blurb: '', addons: [] },
```
Do the same (`addons: []`) for Youth Squad, Adult Beginners, Open Range, Private Coaching, and Group & Corporate.

- [ ] **Step 2: Add `normalizeAddons` + normalize in `normalizePrograms`.** Add this method right before `normalizePrograms` (~3504):
```js
  normalizeAddons(list) {
    var src = (list && list.length) ? list : [];
    var seen = {};
    return src.map((a, i) => {
      var id = a.id ? String(a.id) : this.slugify_(a.name);
      while (seen[id]) { id = id + '-' + i; }
      seen[id] = true;
      return { id: id, name: a.name || 'Add-on', price: Number(a.price) || 0, scope: (a.scope === 'perBooking' ? 'perBooking' : 'perArcher') };
    });
  }
```
Then in `normalizePrograms`'s `.map(p => ({ … }))` return object (~3506–3512) add a final field:
```js
      blurb: p.blurb || '', addons: this.normalizeAddons(p.addons)
```
(replace the existing `blurb: p.blurb || ''` line — append `, addons: this.normalizeAddons(p.addons)`).

- [ ] **Step 3: Add `programAddons` helper.** Right after `programByName` (~3519) add:
```js
  programAddons(name) { return this.programByName(name).addons || []; }
```

- [ ] **Step 4: Mirror + verify.** Mirror; `diff … && echo IDENTICAL`. In `_verify.mjs`, reach the component instance the way the Phase-2 verification did (walk the page root's `__reactContainer$…` fiber to the instance exposing `programList`); if that proves unreliable, instead seed via the admin editor in Task 4's verify and assert there. Minimum assertions here: `logic.programAddons('Open Range')` is `[]`; `logic.normalizeAddons([{name:'Bow rental',price:'150',scope:'perArcher'},{name:'Target face',price:50,scope:'perBooking'}])` equals `[{id:'bow-rental',name:'Bow rental',price:150,scope:'perArcher'},{id:'target-face',name:'Target face',price:50,scope:'perBooking'}]`; an add-on with a missing/unknown scope normalizes to `scope:'perArcher'`. If the fiber reach is unavailable, assert these by reading them through the admin editor in Task 4 and note it here. Run `node _verify.mjs`.

- [ ] **Step 5: Commit.**
```bash
git add "index.html" "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Foundation #2: per-program add-ons data model (defaultPrograms + normalizeAddons + programAddons)"
```

---

### Task 4: Admin add-ons editor (Pricing tab)

**Files:**
- Modify: `index.html` — add-on handlers next to the program-editor handlers (~4690 region, where `setProgField`/`toggleProg`/`programEdits` live); the `programEdits` row builder (~4690–4700); the Programs editor row markup (~2309, before the "Remove this program" button).
- Mirror: `Pasig Greenpark Archery Camp.dc.html`
- Test: `_verify.mjs`

**Interfaces:**
- Consumes: `normalizeAddons` (Task 3); existing `saveCM`, `setProgField`, `toggleProg` patterns; `programList()`.
- Produces: per-program-row `addonRows` (each `{ name, price, scope, scopeLabel, scopeBg, scopeFg, setName, setPrice, toggleScope, remove }`) and `addAddon` closures; handlers `setAddonField`, `setAddonNum`, `toggleAddonScope`, `removeAddon`, `addAddon` mutating `programs[pi].addons` via `saveCM`.

- [ ] **Step 1: Add the add-on handlers.** Immediately after the `addProgram = …` definition and before `const programEdits = …` (~4689), add (note `cm` and `saveCM` are already in scope here):
```js
    const progAddons = (pi) => ((cm.programs || this.defaultPrograms())[pi].addons || []);
    const writeAddons = (pi, addons) => { const ps = (cm.programs || this.defaultPrograms()).map((p, idx) => idx === pi ? { ...p, addons: addons } : p); saveCM({ programs: ps }); };
    const setAddonField = (pi, ai, key) => (e) => { const v = e.target.value; writeAddons(pi, progAddons(pi).map((a, j) => j === ai ? { ...a, [key]: v } : a)); };
    const setAddonNum   = (pi, ai) => (e) => { const v = (e.target.value === '' ? 0 : (Number(e.target.value) || 0)); writeAddons(pi, progAddons(pi).map((a, j) => j === ai ? { ...a, price: v } : a)); };
    const toggleAddonScope = (pi, ai) => () => { writeAddons(pi, progAddons(pi).map((a, j) => j === ai ? { ...a, scope: (a.scope === 'perBooking' ? 'perArcher' : 'perBooking') } : a)); };
    const removeAddon = (pi, ai) => () => writeAddons(pi, progAddons(pi).filter((_, j) => j !== ai));
    const addAddon = (pi) => () => writeAddons(pi, this.normalizeAddons(progAddons(pi).concat([{ name: 'New add-on', price: 0, scope: 'perArcher' }])));
```

- [ ] **Step 2: Extend `programEdits` rows.** In the `programEdits` builder (~4690–4700), inside the per-program `.map((p, i) => ({ … }))` object, add these two fields (before the closing `}))`):
```js
      addAddon: addAddon(i),
      addonRows: this.normalizeAddons(p.addons).map((a, ai) => ({
        name: a.name, price: a.price, scope: a.scope,
        scopeLabel: a.scope === 'perBooking' ? 'Per booking' : 'Per archer',
        scopeBg: a.scope === 'perBooking' ? '#fffdf6' : '#244232',
        scopeFg: a.scope === 'perBooking' ? '#244232' : '#f4efe4',
        setName: setAddonField(i, ai, 'name'), setPrice: setAddonNum(i, ai),
        toggleScope: toggleAddonScope(i, ai), remove: removeAddon(i, ai)
      })),
```

- [ ] **Step 3: Add the editor markup.** In the Programs editor row, immediately **before** the `<button onClick="{{ pg.remove }}" …>Remove this program</button>` line (~2310), insert:
```html
                  <div style="border-top:1px solid rgba(36,66,50,0.12);padding-top:10px;">
                    <div style="font-size:12px;font-weight:700;color:#56664f;margin-bottom:8px;">Add-ons</div>
                    <div style="display:flex;flex-direction:column;gap:8px;">
                      <sc-for list="{{ pg.addonRows }}" as="ad" hint-placeholder-count="0">
                        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                          <input value="{{ ad.name }}" onInput="{{ ad.setName }}" placeholder="Add-on name" style="flex:1;min-width:120px;background:#f4efe4;border:1px solid rgba(36,66,50,0.16);border-radius:8px;padding:8px 10px;font-family:'Hanken Grotesk',sans-serif;font-size:13.5px;color:#1b2a1f;outline:none;" />
                          <input value="{{ ad.price }}" onInput="{{ ad.setPrice }}" type="number" min="0" style="width:84px;background:#f4efe4;border:1px solid rgba(36,66,50,0.16);border-radius:8px;padding:8px 10px;font-family:'Hanken Grotesk',sans-serif;font-size:13.5px;font-weight:700;color:#1b2a1f;outline:none;" />
                          <button onClick="{{ ad.toggleScope }}" style="background:{{ ad.scopeBg }};color:{{ ad.scopeFg }};border:1px solid rgba(36,66,50,0.3);cursor:pointer;font-family:'Hanken Grotesk',sans-serif;font-size:11.5px;font-weight:700;padding:7px 12px;border-radius:999px;white-space:nowrap;">{{ ad.scopeLabel }}</button>
                          <button onClick="{{ ad.remove }}" style="background:none;border:1px solid rgba(180,81,47,0.4);cursor:pointer;font-family:'Hanken Grotesk',sans-serif;font-size:11.5px;font-weight:700;color:#b4512f;padding:7px 11px;border-radius:999px;">Remove</button>
                        </div>
                      </sc-for>
                    </div>
                    <button onClick="{{ pg.addAddon }}" style="margin-top:10px;background:#244232;border:none;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;font-size:12px;font-weight:700;color:#f4efe4;padding:8px 14px;border-radius:999px;">+ Add add-on</button>
                  </div>
```

- [ ] **Step 4: Mirror + verify.** Mirror; `diff … && echo IDENTICAL`. Extend `_verify.mjs`: drive the admin Pricing tab; for a program, click "+ Add add-on" → a row appears; set its name (`setName` to "Bow rental") and price ("150") and click the scope toggle → confirm a `setContent` POST fires (intercept the fetch, as the Phase-2 discounts-editor verify did) and that the program's `addons` now contains `{name:'Bow rental',price:150,scope:'perBooking'}` (scope flips on toggle); add a second add-on and confirm both persist with distinct frozen ids; renaming an add-on keeps its id; "Remove" drops it. If POST interception is impractical headless, spy `persistContent` (as the Phase-2 verify did) and assert the in-memory `programList()[i].addons`. Run `node _verify.mjs` (all tasks' assertions green, 0 real console errors). Then delete scratch: `rm -f _verify.mjs _srv.mjs package.json package-lock.json && rm -rf node_modules`.

- [ ] **Step 5: Commit.**
```bash
git add "index.html" "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Foundation #2: admin add-ons editor in the Programs editor (add/remove/edit, per-archer/per-booking scope)"
```

---

## Self-Review

**Spec coverage** (against `2026-06-27-booking-foundation-design.md`, Part A):
- All programs multi-day; remove session stepper → Task 2. ✓
- Drop `multiDay` admin toggle → Task 2 Step 7. ✓
- Keep `needsCoach`, ages, price, offerDiscounts → untouched. ✓
- Remove "Professional coach" add-on → Task 1. ✓
- Add-ons data model `{ id, name, price, scope }` on each program; seed `addons: []`; normalize → Task 3. ✓
- Admin add-ons editor (name/price/scope toggle/add/remove) in the Programs editor → Task 4. ✓
- Frontend-only, no redeploy; mirror rule; SuperConductor rules; frozen ids → Global Constraints + per-task. ✓
- **Deferred (correctly NOT in this plan):** the booker-facing add-on *selection* step (that's #4); per-archer concessions (#3); per-archer events (#5). Add-ons here are defined + admin-edited only.

**Placeholder scan:** no TBD/TODO; every code change shows complete before/after; the one soft spot (Task 3 fiber-reach fallback) is explicit and resolves to "assert via the Task-4 admin editor" — not a placeholder.

**Type/name consistency:** `normalizeAddons`/`programAddons`/`addons` field, add-on shape `{id,name,price,scope}`, scope literals `'perArcher'`/`'perBooking'`, and the editor closures (`setAddonField`/`setAddonNum`/`toggleAddonScope`/`removeAddon`/`addAddon`, `addonRows`) are used identically across Tasks 3–4.
