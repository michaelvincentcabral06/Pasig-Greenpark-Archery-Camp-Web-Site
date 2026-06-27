# Coach Assignment (Plan B) — Frontend Sessions Multi-Coach Picker

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the admin **Sessions** view's single-coach `<select>` with a multi-coach **chip picker** capped at `ceil(archers/2)`, pre-populated from the booking's `Coach` field, sending `coaches:[ids]` (+ back-compat `coach:ids[0]`) to the live db-v28 backend.

**Architecture:** Frontend-only edits to `index.html` (SuperConductor custom template engine), mirrored byte-for-byte to `Pasig Greenpark Archery Camp.dc.html`. The backend (db-v28, already LIVE) accepts the coach list and enforces the cap; this plan is the admin UI that drives it. No backend redeploy.

**Tech Stack:** SuperConductor (`{{ }}` bindings, `<sc-if>`, `<sc-for>`, `renderVals()` data layer, ES2015 class component). Verified by Node unit tests of the pure helpers + Playwright-over-HTTP of the rendered picker + mirror-IDENTICAL check.

## Global Constraints

- **Mirror rule:** every `index.html` edit is copied byte-for-byte to `Pasig Greenpark Archery Camp.dc.html`. Finish each task with `diff "index.html" "Pasig Greenpark Archery Camp.dc.html" && echo IDENTICAL`.
- **SuperConductor:** NO JS expressions inside `{{ }}` — precompute every chip's `bg`/`fg`/`toggle`/label in the data layer (`renderVals`). Straight ASCII quotes only. Per-item `<sc-for>` closures are built in the data layer.
- **No backend change / no redeploy.** db-v28 is already live (`multiCoach:true`); the picker sends `coaches` + `coach:ids[0]` so it also degrades gracefully if the backend were ever rolled back.
- **Data shapes (verified live):** `this.state.allBookings` items carry `coachName` (the `Coach` field as a comma-joined NAME string, e.g. `"Michael Cabral, James Victoria"`) and `party` (archer count, integer ≥1). They do NOT carry a coach id. `this.coaches()` → `[{id,name,…}]` (defaults: `michael`/`james`/`rotsen`). `this.coachById(id)`.
- **Cap formula:** `maxCoachesFor(party) = Math.max(1, Math.ceil((party||1)/2))` — must match the backend's `ceil(archers/2)`.
- **Scope:** ONLY the Sessions view (the `<select>` at `index.html:2047` + its `sessionRows` data + the `assignBookingCoach` method). Do NOT touch the Plans & Sessions per-plan coach dropdown (`assignPlanCoach`, the `setBookingCoach` call at ~`index.html:4448`) — that is a plan/pass single coach, out of scope, and the db-v28 back-compat path keeps it working.

---

### Task 1: Pure helpers — `maxCoachesFor` + `coachIdsFromNames`

**Files:**
- Modify: `index.html` — add two class methods next to `coachById` (~`index.html:2819`).
- Mirror: `Pasig Greenpark Archery Camp.dc.html`.

**Interfaces:**
- Produces: `maxCoachesFor(party)` → integer cap (`Math.max(1, Math.ceil((Number(party)||1)/2))`); `coachIdsFromNames(coachName)` → array of coach ids resolved from the comma-joined `Coach` name string via `this.coaches()` (unmatched names dropped, order preserved, deduped). Task 2 consumes both.

- [ ] **Step 1: Add the two methods.** Immediately AFTER the `coachById(id) { … }` line (`index.html:2819`), insert:
```js
  // #6: max coaches the admin may assign to a booking = ceil(archers / 2) (1-2->1, 3-4->2, 5-6->3).
  maxCoachesFor(party) { return Math.max(1, Math.ceil((Number(party) || 1) / 2)); }
  // Resolve a stored Coach field ("Coach A, Coach B") back to coach ids, matching by exact name.
  coachIdsFromNames(coachName) {
    if (!coachName) return [];
    const all = this.coaches();
    const out = [];
    String(coachName).split(',').map(s => s.trim()).filter(Boolean).forEach(nm => {
      const c = all.find(x => x.name === nm);
      if (c && out.indexOf(c.id) === -1) out.push(c.id);
    });
    return out;
  }
```

- [ ] **Step 2: Mirror + verify (Node unit test).**
  Mirror: `cp "index.html" "Pasig Greenpark Archery Camp.dc.html"` then `diff "index.html" "Pasig Greenpark Archery Camp.dc.html" && echo IDENTICAL`.
  Write scratch `_t.mjs` that defines a fake `self` with `coaches()` returning `[{id:'michael',name:'Michael Cabral'},{id:'james',name:'James Victoria'},{id:'rotsen',name:'Rotsen Vinluan'}]` and the two methods bound to it (paste the method bodies). Assert:
  - `maxCoachesFor(1)===1`, `maxCoachesFor(2)===1`, `maxCoachesFor(3)===2`, `maxCoachesFor(4)===2`, `maxCoachesFor(5)===3`, `maxCoachesFor(6)===3`, `maxCoachesFor(0)===1`, `maxCoachesFor(undefined)===1`.
  - `coachIdsFromNames('')` → `[]`; `coachIdsFromNames('Michael Cabral')` → `['michael']`; `coachIdsFromNames('Michael Cabral, James Victoria')` → `['michael','james']`; `coachIdsFromNames('James Victoria, Nobody')` → `['james']` (unknown dropped); `coachIdsFromNames('Michael Cabral, Michael Cabral')` → `['michael']` (deduped).
  Run `node _t.mjs`; all green; delete scratch (`rm -f _t.mjs`).

- [ ] **Step 3: Commit.**
```bash
git add "index.html" "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Sessions coach picker: maxCoachesFor + coachIdsFromNames helpers"
```

---

### Task 2: Sessions row chip picker — data layer + method + HTML

**Files:**
- Modify: `index.html` — the `sessionRows` builder (`index.html:5134-5149`); add a `setBookingCoaches` method and REMOVE the now-unused `assignBookingCoach` (`index.html:4021-4026`); replace the `<select>` markup (`index.html:2047`).
- Mirror: `Pasig Greenpark Archery Camp.dc.html`.

**Interfaces:**
- Consumes: `maxCoachesFor`, `coachIdsFromNames` (Task 1), `this.coaches()`, `this.adminPost`, `this.loadAllBookings`.
- Produces: each `sessionRows` item gains `coachCapLabel` (string) and `coachChips` (array of `{name, bg, fg, toggle}` — `toggle` is a 0-arg closure; disabled chips get a no-op toggle + greyed colors). The Sessions `<sc-for as="r">` row renders these.

- [ ] **Step 1: Replace `assignBookingCoach` with `setBookingCoaches`.** Replace the whole method block at `index.html:4021-4026`:
```js
  // Assign / change the coach on a booking (updates the calendar event + Bookings sheet).
  assignBookingCoach(b, coachId) {
    if (!b) return;
    this.adminPost({ action: 'setBookingCoach', eventId: b.eventId || '', ref: b.ref || '', date: b.date || '', time: b.time || '', coach: coachId })
      .then(() => this.loadAllBookings()).catch(() => {});
  }
```
with:
```js
  // #6: assign a LIST of coaches to a booking (multi-coach; backend caps at ceil(archers/2)).
  // Sends `coaches` (full id list) + `coach: ids[0]` so it also works against a pre-db-v28 backend.
  setBookingCoaches(b, ids) {
    if (!b) return;
    const list = (ids || []).filter(Boolean);
    this.adminPost({ action: 'setBookingCoach', eventId: b.eventId || '', ref: b.ref || '', date: b.date || '', time: b.time || '', coaches: list, coach: list[0] || '' })
      .then(() => this.loadAllBookings()).catch(() => {});
  }
```

- [ ] **Step 2: Build `coachChips` in `sessionRows`.** In the `sessionRows` map (`index.html:5134`), replace the three coach-related row fields. Change the body so it reads:
```js
    const sessionRows = sessFiltered.slice(sessPage * SESS_PAGE, sessPage * SESS_PAGE + SESS_PAGE).map(b => {
      const si = sessStatusInfo(b.status);
      let when = b.date; try { when = new Date(b.date + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' }); } catch (e) {}
      const selIds = this.coachIdsFromNames(b.coachName);
      const maxC = this.maxCoachesFor(b.party);
      const atCap = selIds.length >= maxC;
      const coachChips = this.coaches().map(c => {
        const selected = selIds.indexOf(c.id) !== -1;
        const disabled = !selected && atCap;
        const nextIds = selected ? selIds.filter(id => id !== c.id) : selIds.concat([c.id]);
        return {
          name: c.name,
          bg: selected ? '#244232' : (disabled ? '#ece7d8' : '#f4efe4'),
          fg: selected ? '#f4efe4' : (disabled ? '#b8c0ad' : '#244232'),
          toggle: disabled ? (() => {}) : (() => this.setBookingCoaches(b, nextIds)),
        };
      });
      return {
        when: when, time: b.time || '', name: b.name || 'Guest', program: b.program || '',
        coachCapLabel: 'Coaches · up to ' + maxC, coachChips: coachChips,
        amountLabel: b.amount ? ('₱' + Number(b.amount).toLocaleString('en-PH')) : '', hasAmount: !!b.amount,
        statusLabel: si.label, statusBg: si.bg, statusFg: si.fg,
        ref: b.ref || '', hasRef: !!b.ref,
        phone: b.phone || '', hasPhone: !!b.phone, callHref: 'tel:' + (b.phone || '').replace(/[^0-9+]/g, ''),
        cancel: () => this.cancelSessionBooking(b),
        isCancelled: String(b.status || '').toLowerCase() === 'cancelled',
      };
    });
```
(This drops the old `const c = …coachById`, and the `coachName`/`coachId`/`setCoach` row fields — they are no longer rendered.)

- [ ] **Step 3: Replace the `<select>` with the chip group.** Replace the single `<select …>{{ r.coachId }}…</select>` line at `index.html:2047` with:
```html
                  <div style="display:flex;flex-direction:column;gap:5px;min-width:150px;">
                    <span style="font-size:10px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#8a9579;font-family:'Spline Sans Mono',monospace;">{{ r.coachCapLabel }}</span>
                    <div style="display:flex;gap:6px;flex-wrap:wrap;">
                      <sc-for list="{{ r.coachChips }}" as="ch" hint-placeholder-count="0">
                        <button onClick="{{ ch.toggle }}" style="background:{{ ch.bg }};color:{{ ch.fg }};border:1px solid rgba(36,66,50,0.2);cursor:pointer;font-family:'Hanken Grotesk',sans-serif;font-size:12px;font-weight:700;padding:6px 12px;border-radius:999px;">{{ ch.name }}</button>
                      </sc-for>
                    </div>
                  </div>
```

- [ ] **Step 4: Mirror.** `cp "index.html" "Pasig Greenpark Archery Camp.dc.html"` then `diff "index.html" "Pasig Greenpark Archery Camp.dc.html" && echo IDENTICAL`.

- [ ] **Step 5: Verify (Playwright over HTTP).** Serve over HTTP (NOT file:// — it breaks the dc runtime). Use the static server `_srv.mjs` on `127.0.0.1:8099`; Chromium at `C:\Users\Michael Cabral\AppData\Local\ms-playwright\chromium-1228\chrome-win64\chrome.exe` (install once: `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright-core --no-save`). Write the `.mjs` driver with the **Write tool** (heredocs mangle the `\\` Chromium path). The driver: load `http://127.0.0.1:8099/index.html`; reach the component instance via the page-root `__reactContainer$…` fiber; `setState` to force the admin Bookings→Sessions view AND inject `allBookings` with two fake bookings — `{ref:'T1',date:'2026-07-10',time:'4:00 PM',name:'Three Archers',program:'Open Range',party:3,status:'approved',coachName:'Michael Cabral'}` and `{ref:'T2',date:'2026-07-10',time:'5:00 PM',name:'Solo',program:'Open Range',party:1,status:'approved',coachName:''}`. Then assert from the DOM:
  - The 3-archer row shows cap label text `Coaches · up to 2`; the `Michael Cabral` chip is selected (dark bg `#244232`); selecting a 2nd coach leaves the 3rd chip greyed/disabled (its `toggle` is a no-op — clicking it does not change selection count beyond 2).
  - The 1-archer row shows `Coaches · up to 1`; once one coach is selected the other two chips are disabled.
  - Clicking an unselected chip on the 3-archer row (under cap) calls `setBookingCoaches` — stub `this.adminPost` to record the last payload and assert it carries `coaches:[…]` (the toggled list) AND `coach` === `coaches[0]`.
  - 0 real console errors (ignore network/adminPost failures from the stub).
  Screenshot the Sessions list. If the fiber-reach injection fails (known flakiness), fall back to: log in to the live admin (the user can provide the passcode is NOT available to you — instead drive via injected state only) — if injection is impossible, capture a static render screenshot of the Sessions view with whatever bookings load and report the limitation explicitly. Delete scratch driver/server after.

- [ ] **Step 6: Commit.**
```bash
git add "index.html" "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Sessions view: multi-coach chip picker (capped at ceil(archers/2), pre-populated from Coach field)"
```

---

## Self-Review

**Spec coverage** (against `2026-06-27-coach-assignment-design.md`, Section 3):
- `maxCoachesFor(archers) = ceil(archers/2)` helper → Task 1. ✓
- Per-booking "Coaches (up to N)" toggleable chips from `coachList()` → Task 2 (Steps 2-3). ✓
- Currently-assigned coaches start selected, parsed from the `Coach` field (names → ids) → Task 1 `coachIdsFromNames` + Task 2 `selIds`. ✓
- Clicking toggles; once N selected, unselected chips disabled → Task 2 (`atCap`/`disabled`, no-op toggle + greyed colors). ✓
- Hint shows the cap → Task 2 `coachCapLabel` ("Coaches · up to N"). ✓
- On change calls `setBookingCoach` with `coaches:[ids]` PLUS `coach: ids[0]||''` → Task 2 `setBookingCoaches`. ✓
- Selection state per-booking seeded from `Coach` field on render → Task 2 derives `selIds` from `b.coachName` each render (the loaded booking is the source of truth; toggle → backend → reload), so no separate state to desync. ✓
- Replaces the Sessions single-coach UI (and leaves the Plans per-plan dropdown alone) → Task 2 Step 3 + scope constraint. ✓
- **Out of scope (correctly):** #7 fee split; per-archer→coach mapping; the `assignPlanCoach` plan-level dropdown.

**Placeholder scan:** no TBD/TODO; every code step shows the full replacement; verification names concrete assertions and fake-data values.

**Type/name consistency:** `maxCoachesFor`/`coachIdsFromNames` defined in Task 1, consumed in Task 2; `setBookingCoaches(b, ids)` replaces `assignBookingCoach` and is the only coach-mutation entry for sessions; row fields `coachChips`/`coachCapLabel` are produced in Task 2 Step 2 and consumed by the Task 2 Step 3 markup; `b.coachName` (string) + `b.party` (int) match the verified backend `listBookings_` output (`coachName: field(d,'Coach')`, `party += seats`). The picker sends `coaches` + `coach`, matching db-v28's `setBookingCoach_` input contract.
