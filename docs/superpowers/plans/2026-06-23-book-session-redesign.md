# Book a Session (public) Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the public "Book a Session" panel (Contact page) into the reference's card + sticky-quote layout, in the existing dark-green brand, adding a real sessions-count stepper and a visual-only coach add-on — without changing pricing math, the booking backend, or the My Bookings form.

**Architecture:** The page is one SuperConductor component embedded in a `<script type="text/x-dc">` block inside `index.html`, mirrored byte-for-byte in `Pasig Greenpark Archery Camp.dc.html`. Markup uses `{{ binding }}`, `<sc-if>`, `<sc-for>`; bindings are computed in the component's `render()` return object and handlers are class methods / render-local closures. We add `sessionTarget` state + handlers, regroup the existing booking-form markup into four cards, and gate booking on `slotCount === sessionTarget`. Verification is runtime via Playwright (chromium cached locally) with `window.fetch` stubbed — the established method for this repo.

**Tech Stack:** Vanilla SuperConductor template + `support.js` runtime; playwright-core + cached Chromium for verification; Git Bash + PowerShell on Windows.

## Global Constraints
- **Mirror rule:** every edit to `index.html` is applied identically to `Pasig Greenpark Archery Camp.dc.html`. Both files are currently byte-identical (389,805 bytes); the public booking block is at the SAME line numbers in both. After each task, verify parity: `diff <(...) <(...)` of the two files must be empty.
- **Scope:** only the public booking panel inside `<sc-if value="{{ isContact }}">` (index.html lines 747–1115). Do NOT touch the My Bookings account booking form (inside `<sc-if value="{{ isAccount }}">`, ~1120–1637) even though it shares state/handlers.
- **No backend / pricing-math changes:** do not edit `priceFor`, `rateFor`, `discountFor`, `eligPerArcher`, `bothConcessions`, `bookSlot`, the booking payloads, emails, or the Apps Script.
- **Brand tokens:** panel `#244232`, inset `#1b3325`, accent `#7fb43f` (hover `#93c75c`), cream text `#f4efe4`, muted `#cdd6c5`/`#9aa890`; fonts `'Hanken Grotesk'` (body) and `'Spline Sans Mono'` (labels). No light palette, no Tabler icons.
- **Coach add-on is visual only:** never feed it into `priceFor`, the booking payload, or any email. Show it only when `needsCoach(program)` is false (i.e. Open Range).
- **Sessions rule:** `sessionTarget` (default 1, range 1–20) drives the quote multiplier; **Book now** is disabled until the number of chosen slots equals `sessionTarget`; decrementing `sessionTarget` below the current chosen-slot count is blocked with a hint.

---

## Verification harness (shared — build once, reuse every task)

**File:** Create `_verify_book.mjs` at repo root (git-ignored scratch; delete in the final task).

This is the test cycle for every task below. It serves the repo over HTTP, launches cached Chromium, stubs `fetch` (no backend/emails), navigates to the Contact page's booking form, and exposes helpers. Build it in Task 1, extend per task.

```js
import http from 'http'; import { readFile } from 'fs/promises'; import path from 'path';
import { chromium } from 'playwright-core';
const ROOT = process.cwd();
const EXE = "C:\\Users\\Michael Cabral\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe";
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.ico':'image/x-icon','.json':'application/json' };
const server = http.createServer(async (req,res)=>{ try{ let p=decodeURIComponent(req.url.split('?')[0]); if(p==='/')p='/index.html'; const b=await readFile(path.join(ROOT,p)); res.writeHead(200,{'Content-Type':MIME[path.extname(p).toLowerCase()]||'application/octet-stream'}); res.end(b);}catch(e){res.writeHead(404);res.end('nf');}});
await new Promise(r=>server.listen(0,r)); const PORT=server.address().port;
const browser=await chromium.launch({executablePath:EXE,headless:true});
const ctx=await browser.newContext({viewport:{width:1280,height:1700}}); const page=await ctx.newPage();
page.on('dialog',async d=>{await d.accept();});
await page.addInitScript(()=>{ window.__f=[]; window.fetch=(u,o)=>{let a='';try{a=JSON.parse((o&&o.body)||'{}').action||'';}catch(e){} window.__f.push(a); return Promise.resolve(new Response('{}',{status:200}));}; });
await page.goto(`http://localhost:${PORT}/index.html`,{waitUntil:'networkidle'});
// reach the public booking form: nav "Book a Session" -> Contact page
await page.getByRole('button',{name:'Book a Session'}).first().click();
await page.waitForTimeout(500);
// ... per-task assertions/screenshots here ...
await browser.close(); server.close();
```

Run with: `node _verify_book.mjs`

---

### Task 1: Add `sessionTarget` state, stepper handlers, and bindings

**Files:**
- Modify: `index.html` — state defaults (line 2298, `party: 1`), render-local handlers (near `bumpParty` ~3726–3745), bindings block (~4504), `resetForm` (line 3718).
- Mirror: `Pasig Greenpark Archery Camp.dc.html` — same edits.
- Test: `_verify_book.mjs`

**Interfaces:**
- Produces (state): `sessionTarget` (number, default 1).
- Produces (bindings, consumed by Task 2 markup): `sessionTarget` (number), `sessionTargetLabel` (string), `incSession` (fn), `decSession` (fn), `setSession1`/`setSession3`/`setSession5`/`setSession10` (fns), `slotCount` (number — already computed at render line 3917; expose it), `sessionsChosenLabel` (string like `"2 / 3 slots chosen"`), `sessionTargetReached` (bool).

- [ ] **Step 1: Add state default.** In `index.html`, change line 2298 from:
```js
    party: 1,
```
to:
```js
    party: 1,
    sessionTarget: 1,
```

- [ ] **Step 2: Add stepper handlers** near the existing `bumpParty` closure in `render()` (just after it, ~line 3745). `decSession` must not go below `slotCount` or below 1:
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
Note: `slotCount` is defined at line 3917, AFTER this point. Move the `bumpSession`/`setSession` definitions to just below the `slotCount` definition (after line 3917) so `slotCount` is in scope. Verify by reading the surrounding lines before inserting.

- [ ] **Step 3: Add bindings** in the render return object next to `incParty`/`decParty` (line 4504):
```js
      incParty: bumpParty(1), decParty: bumpParty(-1),
      sessionTarget: Math.max(1, st.sessionTarget || 1),
      sessionTargetLabel: String(Math.max(1, st.sessionTarget || 1)) + (Math.max(1, st.sessionTarget||1) === 1 ? ' session' : ' sessions'),
      incSession: bumpSession(1), decSession: bumpSession(-1),
      setSession1: setSession(1), setSession3: setSession(3), setSession5: setSession(5), setSession10: setSession(10),
      slotCountVal: slotCount,
      sessionsChosenLabel: slotCount + ' / ' + Math.max(1, st.sessionTarget || 1) + ' slot' + (Math.max(1, st.sessionTarget||1) === 1 ? '' : 's') + ' chosen',
      sessionTargetReached: slotCount === Math.max(1, st.sessionTarget || 1),
```

- [ ] **Step 4: Reset `sessionTarget`** in `resetForm` (line 3718): add `sessionTarget: 1,` to the `setState({...})` object (next to `party: 1`).

- [ ] **Step 5: Apply identical edits to the mirror** `Pasig Greenpark Archery Camp.dc.html` (same line numbers).

- [ ] **Step 6: Verify state + handler logic via Playwright.** Add to `_verify_book.mjs` after navigation:
```js
const get = (k)=>page.evaluate((k)=>window.__sc_app ? window.__sc_app.state[k] : null, k).catch(()=>null);
// sessionTarget exists and defaults to 1
console.log('sessionTarget default =', await page.evaluate(()=>{const el=document.querySelector('[data-test=session-target]'); return el?el.textContent:'(no UI yet)';}));
```
Since the stepper UI doesn't exist until Task 2, this task's verification is limited to "no console errors and the page still renders the booking form". Run `node _verify_book.mjs`; expected: page loads, booking form heading "Reserve a session" present, zero console errors.

Run: `node _verify_book.mjs`
Expected: prints booking form reached, no red `[console.error]`.

- [ ] **Step 7: Verify mirror parity.**
Run (Git Bash): `diff "index.html" "Pasig Greenpark Archery Camp.dc.html" && echo IDENTICAL`
Expected: `IDENTICAL`.

- [ ] **Step 8: Commit.**
```bash
git add index.html "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Book a Session: add sessionTarget state + stepper handlers/bindings"
```

---

### Task 2: Restructure the booking form into cards + always-visible sticky quote

**Files:**
- Modify: `index.html` lines 755–1114 (the `<section>` grid + booking form). Mirror the same.
- Test: `_verify_book.mjs`

**Interfaces:**
- Consumes: all existing booking bindings + Task 1's `sessionTargetLabel`, `incSession`, `decSession`, `setSession1/3/5/10`, `sessionsChosenLabel`.
- Produces: new card containers `data-test="card-core" | "card-group" | "card-quote"` used by later verification.

This task only **regroups** existing markup into styled card wrappers and makes the quote panel always visible (sticky). No control is removed. The left info/map column (lines 756–792) is unchanged.

- [ ] **Step 1: Convert the form's flat `<div style="display:flex;flex-direction:column;gap:16px;">` (line 851) into three brand cards.** Wrap groups of existing children in card wrappers. Card wrapper markup (reuse for each, changing the title):
```html
<div data-test="card-core" style="background:#1b3325;border:1px solid rgba(244,239,228,0.14);border-radius:12px;padding:18px;display:flex;flex-direction:column;gap:16px;">
  <div style="font-family:'Spline Sans Mono',monospace;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#7fb43f;">Core booking</div>
  <!-- existing children moved here unchanged -->
</div>
```
- **Core booking** card holds: name/phone/email (lines 852–863), Program select (864–874), the new **sessions stepper** (Step 2), and the date/slots blocks (`singleDateMode` 961–994 and `multiDateMode` 996–1052).
- **Group & Discounts** card (title "Group & discounts") holds: the "How many archers?" party stepper (876–887) and the Open Range concessions block (`isOpenRange` 889–929).
- Keep **Archer details** (`showArcherDetails` 932–959) inside the Core booking card, right after the date/slots, as today's order.

- [ ] **Step 2: Insert the sessions stepper** inside the Core booking card, directly under the Program select. Exact markup:
```html
<div>
  <label style="display:block;font-size:13px;font-weight:600;color:#cdd6c5;margin-bottom:7px;">How many sessions?</label>
  <div style="display:flex;align-items:center;justify-content:space-between;background:#244232;border:1px solid rgba(244,239,228,0.18);border-radius:8px;padding:7px 10px;">
    <button onClick="{{ decSession }}" aria-label="Fewer sessions" style="width:38px;height:38px;flex:none;border-radius:8px;border:none;background:rgba(244,239,228,0.1);color:#f4efe4;cursor:pointer;font-size:22px;font-weight:700;line-height:1;display:flex;align-items:center;justify-content:center;">−</button>
    <div data-test="session-target" style="font-size:17px;font-weight:800;color:#f4efe4;">{{ sessionTargetLabel }}</div>
    <button onClick="{{ incSession }}" aria-label="More sessions" style="width:38px;height:38px;flex:none;border-radius:8px;border:none;background:rgba(244,239,228,0.1);color:#f4efe4;cursor:pointer;font-size:22px;font-weight:700;line-height:1;display:flex;align-items:center;justify-content:center;">+</button>
  </div>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:8px;">
    <button onClick="{{ setSession1 }}" style="padding:9px;background:#244232;border:1px solid rgba(244,239,228,0.18);border-radius:8px;color:#cdd6c5;font-family:'Hanken Grotesk',sans-serif;font-size:12.5px;font-weight:700;cursor:pointer;">1</button>
    <button onClick="{{ setSession3 }}" style="padding:9px;background:#244232;border:1px solid rgba(244,239,228,0.18);border-radius:8px;color:#cdd6c5;font-family:'Hanken Grotesk',sans-serif;font-size:12.5px;font-weight:700;cursor:pointer;">3</button>
    <button onClick="{{ setSession5 }}" style="padding:9px;background:#244232;border:1px solid rgba(244,239,228,0.18);border-radius:8px;color:#cdd6c5;font-family:'Hanken Grotesk',sans-serif;font-size:12.5px;font-weight:700;cursor:pointer;">5</button>
    <button onClick="{{ setSession10 }}" style="padding:9px;background:#244232;border:1px solid rgba(244,239,228,0.18);border-radius:8px;color:#cdd6c5;font-family:'Hanken Grotesk',sans-serif;font-size:12.5px;font-weight:700;cursor:pointer;">10</button>
  </div>
  <p style="font-size:11.5px;color:#8a9579;margin:6px 2px 0;font-family:'Spline Sans Mono',monospace;">{{ sessionsChosenLabel }}</p>
</div>
```

- [ ] **Step 3: Make the quote panel always visible.** Currently the quote+confirm (lines 1074–1111) sit inside `<sc-if value="{{ slotChosen }}">`. Remove that `slotChosen` gate so the **Your quote** block + Book button render persistently. Wrap them in a third card titled "Your quote" with `data-test="card-quote"`, keeping every existing inner binding (`costBreakdown`, `costSubtotalLabel`, `hasDiscount`, `costTotalLabel`, `savedLabel`, `confirmBooking`, etc.) unchanged. The "Selected: {{ chosenLabel }}" line (1075) stays but wrap it in its own `<sc-if value="{{ slotChosen }}">` so it only shows once a slot is chosen.

- [ ] **Step 4: Two-column inner layout for the form (desktop).** The outer page grid (line 755, `grid-template-columns:1fr 1fr`) stays: left = info/map, right = booking form. Inside the booking form, stack the three cards vertically (cards are full width of the right column). The "sticky" behaviour already exists on `#booking-form` (line 795, `position:sticky;top:90px`) — keep it. (Single right column of stacked cards keeps the existing mobile behaviour for free.)

- [ ] **Step 5: Apply identical edits to the mirror.**

- [ ] **Step 6: Verify render + screenshots.** Extend `_verify_book.mjs`:
```js
await page.getByRole('button',{name:'Book a Session'}).first().click(); await page.waitForTimeout(500);
console.log('core card:', await page.locator('[data-test=card-core]').count());
console.log('group card:', await page.locator('[data-test=card-group]').count());
console.log('quote card:', await page.locator('[data-test=card-quote]').count());
console.log('session stepper:', await page.locator('[data-test=session-target]').textContent());
await page.screenshot({path:'_book_desktop.png'});
await page.setViewportSize({width:390,height:1700}); await page.waitForTimeout(300);
await page.screenshot({path:'_book_mobile.png'});
```
Run: `node _verify_book.mjs`. Expected: each card count = 1, stepper shows "1 session", zero console errors. Read `_book_desktop.png` and `_book_mobile.png` — all controls present, brand colors intact, quote panel visible before any slot is chosen.

- [ ] **Step 7: Mirror parity check** (`diff … && echo IDENTICAL`).

- [ ] **Step 8: Commit.**
```bash
git add index.html "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Book a Session: card layout + sessions stepper + always-on sticky quote"
```

---

### Task 3: Quote uses `sessionTarget`; gate Book on slots == target

**Files:**
- Modify: `index.html` — `confirmBooking` (3829–3841), the cost binding that feeds the quote (find where `priceFor` is called for the public quote, near `costTotalLabel`/`costBreakdown` getters ~3940–3960), the Book button markup (line 1106), and add a `sessionFloor` hint message. Mirror the same.
- Test: `_verify_book.mjs`

**Interfaces:**
- Consumes: Task 1 `slotCountVal`, `sessionTargetReached`, `sessionsChosenLabel`; existing `priceFor`.
- Produces: `bookDisabled` (bool), `bookHint` (string) bindings used by the Book button.

- [ ] **Step 1: Quote multiplier uses `sessionTarget`.** Locate the public quote's `priceFor(...)` call in render (the one feeding `costTotalLabel`/`costSubtotalLabel`, near line 3945). Change the `sessions` argument from the live slot count to `Math.max(slotCount, st.sessionTarget||1)` so the quote reflects the target even before all slots are picked. Read the exact call first; it looks like `this.priceFor(form.program, party, <sessions>, <days>)`. Replace `<sessions>` with `Math.max(slotCount, Math.max(1, st.sessionTarget||1))`. Do NOT change `bookSlot`'s own `priceFor` calls (those bill actual booked slots).

- [ ] **Step 2: Gate `confirmBooking`.** At the top of the `confirmBooking` closure (line 3829), after the existing `noSlot` computation (~3835), add:
```js
      const target = Math.max(1, st.sessionTarget || 1);
      if (slotCount !== target) { this.setState({ bookingStatus: 'sessionMismatch' }); return; }
```
(`slotCount` is in scope at 3917 but `confirmBooking` is defined earlier at 3829 — define `confirmBooking` to read `this.state` freshly, or move the gate using a re-derived count. Simplest: recompute inside the closure: `const sc = (this.state.form && /Open Range/i.test(this.state.form.program)) ? <multiPairCount expr> : (this.state.slotTimes||[]).length;` Read lines 3829–3845 and 3915–3920 first and reuse the exact slot-count expression.)

- [ ] **Step 3: Add `bookDisabled` + `bookHint` bindings** near `confirmLabel` (line 4542):
```js
      bookDisabled: slotCount !== Math.max(1, st.sessionTarget || 1),
      bookHint: slotCount < Math.max(1, st.sessionTarget||1)
        ? ('Pick ' + (Math.max(1, st.sessionTarget||1) - slotCount) + ' more slot' + ((Math.max(1, st.sessionTarget||1)-slotCount)===1?'':'s') + ' to book')
        : (slotCount > Math.max(1, st.sessionTarget||1) ? 'Remove a slot or raise the session count' : ''),
```

- [ ] **Step 4: Reflect disabled state on the Book button** (line 1106). Add an opacity/cursor bound to disabled and show the hint under it:
```html
<button onClick="{{ confirmBooking }}" style="background:#7fb43f;color:#1b2a1f;border:none;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;font-size:16px;font-weight:700;padding:15px;border-radius:999px;margin-top:4px;opacity:{{ bookOpacity }};" style-hover="background:#93c75c;">
```
Add binding `bookOpacity: (slotCount !== Math.max(1, st.sessionTarget||1)) ? '0.5' : '1',`. After the button, add:
```html
<sc-if value="{{ bookDisabled }}" hint-placeholder-val="{{ true }}"><p style="font-size:12px;color:#f0b48a;text-align:center;margin:6px 0 0;">{{ bookHint }}</p></sc-if>
```
(Note: `confirmBooking` already early-returns on mismatch, so even if the user clicks the dimmed button nothing books — the opacity is the visual cue.)

- [ ] **Step 5: Add the `sessionMismatch`/`sessionFloor` status messages.** Near the other status `<sc-if>` blocks (statusFull 1054, formError 1070), add:
```html
<sc-if value="{{ statusSessionMismatch }}" hint-placeholder-val="{{ false }}"><div style="font-size:13.5px;color:#f0b48a;">{{ bookHint }}</div></sc-if>
```
and binding `statusSessionMismatch: st.bookingStatus === 'sessionMismatch',`.

- [ ] **Step 6: Apply identical edits to the mirror.**

- [ ] **Step 7: Verify gating via Playwright.** Extend `_verify_book.mjs`: pick a single-date slot scenario.
```js
// set sessionTarget to 2 via stepper, then confirm Book is disabled with 0-1 slots
await page.getByRole('button',{name:'Book a Session'}).first().click(); await page.waitForTimeout(400);
// raise target to 2
await page.locator('[aria-label="More sessions"]').click(); await page.waitForTimeout(200);
console.log('target label:', await page.locator('[data-test=session-target]').textContent()); // "2 sessions"
console.log('book opacity:', await page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>/Confirm booking|Confirm .* slots/.test(x.textContent)); return b?getComputedStyle(b).opacity:'(none)';}));
console.log('chosen label:', await page.locator('text=/ slots chosen/').first().textContent());
```
Run `node _verify_book.mjs`. Expected: target label "2 sessions", book opacity "0.5", chosen label "0 / 2 slots chosen". (Driving the real date picker to actually choose 2 slots is exercised in Task 5's happy-path.)

- [ ] **Step 8: Mirror parity check.**

- [ ] **Step 9: Commit.**
```bash
git add index.html "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Book a Session: quote uses session target; gate Book until slots == target"
```

---

### Task 4: Coach add-on card (visual only, Open Range)

**Files:**
- Modify: `index.html` — add an Add-ons card inside the booking form (after the Group & Discounts card), shown only when `isOpenRange`. Mirror the same.
- Test: `_verify_book.mjs`

**Interfaces:**
- Consumes: existing `isOpenRange` binding (line 4507).
- Produces: `coachAddonOn` (bool, local UI state `coachAddon`), `toggleCoachAddon` (fn) — purely cosmetic; never read by pricing/booking.

- [ ] **Step 1: Add cosmetic state.** Add `coachAddon: false,` to state defaults next to `sessionTarget` (line 2299). Add to `resetForm`: `coachAddon: false,`.

- [ ] **Step 2: Add binding + toggle** near the session bindings (line 4504):
```js
      coachAddonOn: !!st.coachAddon,
      coachAddonCheck: st.coachAddon ? '✓' : '',
      toggleCoachAddon: () => this.setState({ coachAddon: !this.state.coachAddon }),
```

- [ ] **Step 3: Add the Add-ons card** inside the booking form, after the Group & Discounts card, gated to Open Range:
```html
<sc-if value="{{ isOpenRange }}" hint-placeholder-val="{{ false }}">
<div data-test="card-addons" style="background:#1b3325;border:1px solid rgba(244,239,228,0.14);border-radius:12px;padding:18px;display:flex;flex-direction:column;gap:12px;">
  <div style="font-family:'Spline Sans Mono',monospace;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#7fb43f;">Add-ons</div>
  <button onClick="{{ toggleCoachAddon }}" role="checkbox" aria-checked="{{ coachAddonOn }}" style="display:flex;align-items:flex-start;gap:11px;text-align:left;background:#244232;border:1.5px solid rgba(244,239,228,0.18);border-radius:9px;padding:13px;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;">
    <span style="width:20px;height:20px;flex:none;margin-top:2px;border-radius:5px;border:1.5px solid #7fb43f;background:{{ coachAddonBox }};color:#1b2a1f;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;">{{ coachAddonCheck }}</span>
    <span style="flex:1;">
      <span style="display:flex;justify-content:space-between;gap:10px;"><span style="font-size:14px;font-weight:700;color:#f4efe4;">Professional coach</span><span style="font-family:'Spline Sans Mono',monospace;font-size:13px;font-weight:700;color:#9aa890;">₱1,200</span></span>
      <span style="display:block;font-size:12px;color:#9aa890;margin-top:4px;line-height:1.45;">1-on-1 guidance for your session. <span style="color:#f0b48a;">Ask staff to add a coach — not charged online yet.</span></span>
    </span>
  </button>
</div>
</sc-if>
```
Add binding `coachAddonBox: st.coachAddon ? '#7fb43f' : 'transparent',`.

- [ ] **Step 4: Apply identical edits to the mirror.**

- [ ] **Step 5: Verify the add-on changes no price.** Extend `_verify_book.mjs`: on Open Range, read the quote total, toggle the coach add-on, read it again — must be unchanged.
```js
// ensure program = Open Range (bookOpen preset) then read + toggle
const total1 = await page.locator('[data-test=card-quote]').innerText();
await page.locator('[data-test=card-addons] button[role=checkbox]').click(); await page.waitForTimeout(200);
const total2 = await page.locator('[data-test=card-quote]').innerText();
console.log('addon present:', await page.locator('[data-test=card-addons]').count());
console.log('quote unchanged by coach add-on:', total1 === total2);
```
Run `node _verify_book.mjs`. Expected: `addon present: 1`, `quote unchanged by coach add-on: true`. Switch program to a non-Open-Range one and confirm `card-addons` count = 0.

- [ ] **Step 6: Mirror parity check.**

- [ ] **Step 7: Commit.**
```bash
git add index.html "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Book a Session: visual-only coach add-on card (Open Range)"
```

---

### Task 5: End-to-end happy path, regression, mirror parity, cleanup

**Files:**
- Test: `_verify_book.mjs` (final form), then delete it.

- [ ] **Step 1: Drive a full Open Range booking with `sessionTarget` satisfied.** In `_verify_book.mjs`: set target to 2, pick a valid future date, choose 2 time slots, fill name/phone/email, confirm Book becomes enabled (opacity 1, `2 / 2 slots chosen`), click Book, and assert the stubbed `window.__f` recorded a `"book"` action and the confirmed view (`You're booked`) renders. Screenshot the confirmed state.

- [ ] **Step 2: Regression — non-Open-Range program.** Switch program to "Adult Beginners (18+)": confirm concessions card hidden, add-ons card hidden, archer-details age check still present, single-date slot picker works, quote uses ₱600 rate × sessionTarget.

- [ ] **Step 3: Decrement-floor probe.** Choose 2 slots with target 2, then press the sessions "−" button: confirm target does not drop below 2 (blocked) and a hint/`sessionFloor` cue appears.

- [ ] **Step 4: Final mirror parity.**
Run: `diff "index.html" "Pasig Greenpark Archery Camp.dc.html" && echo IDENTICAL`
Expected: `IDENTICAL`.

- [ ] **Step 5: Delete scratch + screenshots.**
```bash
rm -f _verify_book.mjs _book_desktop.png _book_mobile.png _book_confirmed.png
rm -rf node_modules package.json package-lock.json
git status --short   # expect only index.html + .dc.html changes already committed; working tree clean
```

- [ ] **Step 6: Commit (if any final tweaks were needed).**
```bash
git add index.html "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Book a Session: redesign verified end-to-end (frontend only)"
```

---

## Self-review notes
- **Spec coverage:** card layout (Task 2), sticky always-on quote (Task 2 Step 3), sessions stepper real (Tasks 1–3), Book gated on slots==N + block-on-decrement (Tasks 1 Step 2, 3 Steps 2–4, 5 Step 3), coach add-on visual-only Open-Range (Task 4), keep all programs + pricing math (Tasks honor `priceFor`/program select untouched), brand kept (brand tokens in every card), mirror discipline (every task Steps for both files + parity diff), My Bookings untouched (scope constraint). All covered.
- **`slotCount` scope caveat** is called out in Task 1 Step 2 and Task 3 Step 2 — implementer must read the exact `slotCount`/`multiPairCount` expressions (render lines ~3917–3949) before wiring, since `confirmBooking` (3829) is defined above `slotCount` (3917).
- **No real backend is hit** in any verification (`fetch` stubbed) — no emails/calendar writes.
- **Deployment:** frontend-only; after merge the user refreshes the site (and redeploys the .dc mirror per their normal flow). No db version bump.
