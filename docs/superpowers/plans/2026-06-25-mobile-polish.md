# Mobile Polish (Customer-Facing) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A light, low-risk mobile polish of the customer-facing pages — iOS safe-area for the fixed Call/Book bar, tap-target minimums on customer controls, and a 360px tightness sweep — without any structural responsive refactor.

**Architecture:** Inline-style / local-markup edits inside the single SuperConductor component in `index.html` (mirrored byte-identically to `Pasig Greenpark Archery Camp.dc.html`). No new state, bindings, or helpers. Verification drives the real DOM with Playwright at 360/390/430px.

**Tech Stack:** SuperConductor template, plain inline-styled markup, Playwright-core.

## Global Constraints

- **Mirror rule:** every edit to `index.html` is applied identically to `Pasig Greenpark Archery Camp.dc.html`; finish with `diff index.html "Pasig Greenpark Archery Camp.dc.html" && echo IDENTICAL`. Both must be IDENTICAL.
- **No backend change, no deploy.** Frontend-only.
- **Preserve existing visuals** — polish only; do not redesign components or change colors/spacing beyond the specific edits below.
- **Customer-facing only.** Do NOT touch coach-portal or admin controls: the coach calendar nav arrows (~2224/2226/2445/2447), the admin calendar nav arrows (~2130/2132), or the decorative 38px avatar span (~1780) are OUT of scope.
- **SuperConductor:** no JS ternaries inside style `{{ }}` interpolations.
- **Verification:** Playwright-core at 360/390/430px, deviceScaleFactor 2. Chromium at `C:\Users\Michael Cabral\AppData\Local\ms-playwright\chromium-1228\chrome-win64\chrome.exe`; install if missing: `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright-core --no-save`. Scratch harness `_verify_mobile.mjs` (gitignored `_*.mjs`), deleted before finishing.

---

### Task 1: Mobile polish — safe-area, tap targets, 360px sweep

**Files:**
- Modify: `index.html` (anchors below)
- Mirror: `Pasig Greenpark Archery Camp.dc.html`
- Test: `_verify_mobile.mjs` (scratch)

**Interfaces:** No code interfaces — inline-style edits only. The Playwright harness reaches the live component via the React fiber (`logic` on a fiber `stateNode`), the same pattern used by prior tasks in this repo.

- [ ] **Step 1: iOS safe-area on the fixed Call/Book bar.**
  The bar lives inside `<sc-if value="{{ isMobile }}">` (~index.html:2555). Two edits:
  - The flow spacer at ~2557 — change `<div style="height:74px;"></div>` to:
    ```html
    <div style="height:calc(74px + env(safe-area-inset-bottom, 0px));"></div>
    ```
  - The fixed bar at ~2558 — in its style, change `padding:12px 16px;` to:
    ```
    padding:12px 16px calc(12px + env(safe-area-inset-bottom, 0px));
    ```
    (Leave everything else in that style string — `position:fixed;bottom:0;…box-shadow:…` — unchanged.)

- [ ] **Step 2: Steppers 38px → 44px (customer-facing − / + buttons).**
  These six buttons share the style prefix `width:38px;height:38px;flex:none;border-radius:8px;border:none;background:rgba(244,239,228,0.1);`: the sessions stepper (~900 `decSession`, ~902 `incSession`), the single-session party stepper (~1064 `decParty`, ~1069 `incParty`), and the multi-date party stepper (~1320 `decParty`, ~1325 `incParty`). Replace the substring `width:38px;height:38px;flex:none;border-radius:8px;border:none;background:rgba(244,239,228,0.1);` with `width:44px;height:44px;flex:none;border-radius:8px;border:none;background:rgba(244,239,228,0.1);` (replace-all — this matches exactly those six stepper buttons; it does NOT match the decorative avatar span at ~1780, which is `width:38px;height:38px;border-radius:50%`). Verify the replacement count is 6.

- [ ] **Step 3: Account edit-quantity stepper 34px → 44px.**
  The reschedule/edit quantity stepper in My Bookings: ~1622 `editDec` and ~1624 `editInc`, style `width:34px;height:34px;border-radius:7px;border:none;background:rgba(244,239,228,0.1);`. Replace that substring with `width:44px;height:44px;border-radius:7px;border:none;background:rgba(244,239,228,0.1);` (replace-all — matches exactly these two; the booking date-picker arrows in Step 4 have a different prefix `width:34px;height:34px;flex:none;border-radius:8px`). Verify count is 2.

- [ ] **Step 4: Customer month-nav arrows 34px/36px → 40px.**
  - Booking date-picker arrows (`calPrev`/`calNext`), rendered twice (~984/986 and ~1443/1445), style prefix `width:34px;height:34px;flex:none;border-radius:8px;border:none;background:rgba(244,239,228,0.08);`. Replace that substring with `width:40px;height:40px;flex:none;border-radius:8px;border:none;background:rgba(244,239,228,0.08);` (replace-all — matches exactly these four; coach-portal arrows use `background:#f4efe4` and are excluded). Verify count is 4.
  - Public availability calendar arrows on Programs (`calViewPrev`/`calViewNext`), ~537/539, style prefix `width:36px;height:36px;border-radius:8px` with `background:#f4efe4`. These two have the SAME style string as the admin calendar arrows (~2130/2132, which use `background:#fffdf6`) — distinguish by `background:#f4efe4`. Edit ONLY lines ~537 and ~539: change their `width:36px;height:36px;border-radius:8px;` to `width:40px;height:40px;border-radius:8px;`. Do a unique-match edit per button (include enough surrounding style to bind to the `#f4efe4` Programs arrows, NOT the `#fffdf6` admin ones). Confirm the admin calendar arrows at ~2130/2132 are unchanged.

- [ ] **Step 5: Mirror + static checks.**
  `cp index.html "Pasig Greenpark Archery Camp.dc.html"`; then `diff index.html "Pasig Greenpark Archery Camp.dc.html" && echo IDENTICAL`. Confirm: `grep -c "width:38px;height:38px;flex:none" index.html` is 0; `grep -c "width:34px;height:34px;flex:none;border-radius:8px;border:none;background:rgba(244,239,228,0.08)" index.html` is 0; the admin/coach arrows (`background:#fffdf6` ~2130/2132 and `background:#f4efe4;color:#244232` coach ~2224 etc.) still read 36px/34px respectively.

- [ ] **Step 6: Build the verification harness `_verify_mobile.mjs`.**
  Playwright-core; for each viewport in [360, 390, 430] (height 800, deviceScaleFactor 2): goto `file:///…/index.html`; reach the component via the React fiber (`__reactFiber$…` key → walk `.return` to a `stateNode.logic`); stub `window.fetch` so `?action=availability` returns a mixed slots payload (`[{time:'9:00 AM',left:5},{time:'1:00 PM',left:2},{time:'3:00 PM',left:0,full:true}]`). Drive and assert:
  - **No horizontal overflow** on Home, Programs (after `pickCalDayPublic('2026-06-26')`), Book, and Account (populated): assert `document.documentElement.scrollWidth <= clientWidth + 1` on each.
  - **Tap targets:** after `go('book')` and seeding `{slotDate:'2026-06-26', slots:[…], slotsLoading:false, slotTimes:['9:00 AM'], party:3, sessionTarget:2, archers:[3 entries]}`, measure the rendered box of each `−`/`+` stepper and assert width≥44 && height≥44. After `pickCalDayPublic`, measure the Programs calendar `‹`/`›` and assert ≥40. Measure the booking date-picker `‹`/`›` and assert ≥40.
  - **Call/Book bar:** `isMobile` is true at these widths (innerWidth<880); assert the bar is present with two full-width action elements (the `tel:` Call link + the Book button), and that scrolling to page bottom leaves the footer fully above the bar (the spacer reserves room).
  - **My Bookings filter row at 360px:** seed `{acctIn:true, acctName:'Juan dela Cruz', acctEmail:'juan@email.com', acctEmails:['juan@email.com'], acctBookings:[4 future-dated entries], acctPlans:[]}`, `go('account')`; assert the search input and both `<select>`s render within the viewport width (no element wider than viewport; no select clipped to <72px).
  - 0 real console errors (ignore favicon / `file://` CORS noise).
  Run `node _verify_mobile.mjs`. Capture output.

- [ ] **Step 7: 360px conditional fix (only if Step 6 flags it).**
  If the two My-Bookings filter `<select>`s crowd/clip at 360px, make a NARROW local fix on that filter row (~index.html:1567-1569): add `flex-wrap:wrap` to the row container and/or `min-width` to the selects so they stack under the search box at narrow widths. Do NOT introduce a global rule. Re-mirror and re-run the harness until green at all three widths. If Step 6 showed no crowding, skip this step and note it.

- [ ] **Step 8: Final verify + cleanup + commit.**
  Confirm `node _verify_mobile.mjs` passes at 360/390/430 with 0 real console errors and mirror IDENTICAL. Capture before/after screenshots of the bar, a stepper, and the 360px filter row into the report. Then delete scratch: `rm -f _verify_mobile.mjs _mob*.png && rm -rf node_modules package.json package-lock.json`. Commit:
  ```bash
  git add index.html "Pasig Greenpark Archery Camp.dc.html"
  git commit -m "Mobile polish: iOS safe-area on Call/Book bar; tap-target minimums (steppers 44px, nav arrows 40px); 360px sweep"
  ```

---

## Self-review notes

- **Spec coverage:** Fix #1 safe-area → Step 1; Fix #2 tap targets → Steps 2-4 (steppers 44, arrows 40, customer-only with admin/coach excluded); Fix #3 360px sweep → Steps 6-7. Verification plan → Steps 6 & 8. All spec sections map to steps.
- **Scope discipline:** every edit is enumerated with a line anchor and a unique style substring; admin/coach/decorative look-alikes are explicitly excluded and re-checked in Step 5. No global rule changes (the 760px breakpoint is untouched), honoring "no structural refactor."
- **Replace-all safety:** Steps 2-4 each name the expected match count so an over-broad replace is caught immediately.
- **Conditional work:** Step 7 only fires if the 360px sweep finds real crowding — avoids speculative churn (YAGNI).
- **Mirror discipline:** Step 5 mirrors after the edits; Step 8 re-confirms IDENTICAL after any Step 7 change and removes scratch.
