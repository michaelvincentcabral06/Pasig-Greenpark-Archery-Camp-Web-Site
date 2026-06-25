# Admin Mobile Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Light mobile polish of the admin screens — hide the customer Call/Book bar in admin, stop "Sign out" wrapping, raise admin/coach calendar arrow tap targets to 40px, and a 360px sweep — no structural change.

**Architecture:** Inline-style edits + one render-return binding inside the single SuperConductor component in `index.html` (mirrored to `Pasig Greenpark Archery Camp.dc.html`). Verified via Playwright at 360/390/430px driving the admin tabs through the React-fiber `logic` instance.

**Tech Stack:** SuperConductor template, inline-styled markup, Playwright-core.

## Global Constraints

- **Mirror rule:** every `index.html` edit applied identically to `Pasig Greenpark Archery Camp.dc.html`; finish with `diff index.html "Pasig Greenpark Archery Camp.dc.html" && echo IDENTICAL`.
- **No backend change, no deploy.** Frontend-only.
- **Customer-facing pages, structural breakpoints, and new features are OUT of scope** — polish admin only.
- **Preserve existing visuals.** Straight ASCII quotes in HTML; no JS ternaries inside style `{{ }}` interpolations.
- **Verification:** Playwright-core at 360/390/430px, deviceScaleFactor 2. Chromium at `C:\Users\Michael Cabral\AppData\Local\ms-playwright\chromium-1228\chrome-win64\chrome.exe`; install if missing: `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright-core --no-save`. Scratch `_verify_admin.mjs` (gitignored `_*.mjs`), deleted before finishing.

---

### Task 1: Admin mobile polish

**Files:**
- Modify: `index.html` (bar gate ~2578 + render-return ~5364; Sign-out group ~1814-1816; admin calendar arrows ~2146/2148; coach calendar arrows ~2240/2242/2468/2470)
- Mirror: `Pasig Greenpark Archery Camp.dc.html`
- Test: `_verify_admin.mjs` (scratch)

**Interfaces:** No code interfaces — one new render-return binding (`showMobileBar`) + inline-style edits. The harness reaches the live component via the React fiber (`stateNode.logic`), driving admin with `setState({ page:'admin', authed:true, adminTab })`.

- [ ] **Step 1: Add the `showMobileBar` binding.** In the render-return, on the line `isMobile, isDesktop: !isMobile, navOpen,` (~index.html:5364), append `showMobileBar: isMobile && page !== 'admin',` so the line reads:
```js
      isMobile, isDesktop: !isMobile, navOpen, showMobileBar: isMobile && page !== 'admin',
```
(`isMobile` and `page` are already destructured from state in this render scope — confirm via the `const { page, …, isMobile, navOpen } = this.state;` line ~4221.)

- [ ] **Step 2: Gate the Call/Book bar to non-admin.** Change the bar's `<sc-if>` (~index.html:2578) from:
```html
  <sc-if value="{{ isMobile }}" hint-placeholder-val="{{ false }}">
```
to:
```html
  <sc-if value="{{ showMobileBar }}" hint-placeholder-val="{{ false }}">
```
(This is the `<!-- STICKY MOBILE CALL/BOOK BAR -->` block — the spacer `<div>` and the fixed bar are both inside it. Do NOT change the mobile-nav `<sc-if value="{{ isMobile }}">` at ~line 58.)

- [ ] **Step 3: Stop "Sign out" wrapping.** In the admin header (~index.html:1814-1816):
  - Inner group (~1814): change `<div style="display:flex;align-items:center;gap:10px;">` to `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end;">`.
  - Sign-out button (~1816): in its style string, add `white-space:nowrap;` (e.g. change `…padding:9px 16px;border-radius:999px;">Sign out</button>` to `…padding:9px 16px;border-radius:999px;white-space:nowrap;">Sign out</button>`).

- [ ] **Step 4: Admin calendar arrows 36→40px.** Replace-all the substring `width:36px;height:36px;border-radius:8px` with `width:40px;height:40px;border-radius:8px`. Expected count: **2** (the admin-calendar `calViewPrev`/`calViewNext` at ~2146/2148, `background:#fffdf6`). The public-calendar arrows are already 40px so they don't match. Verify the count is 2.

- [ ] **Step 5: Coach calendar arrows 34→40px.** Replace-all the substring `width:34px;height:34px;flex:none;border-radius:8px;border:1px solid rgba(36,66,50,0.14)` with `width:40px;height:40px;flex:none;border-radius:8px;border:1px solid rgba(36,66,50,0.14)`. Expected count: **4** (`coachCalPrev`/`coachCalNext` at ~2240/2242/2468/2470). The booking date-picker arrows use `border:none` (already 40px) so they don't match. Verify the count is 4.

- [ ] **Step 6: Mirror + static checks.** `cp index.html "Pasig Greenpark Archery Camp.dc.html"`; `diff … && echo IDENTICAL`. Confirm: `grep -c "width:36px;height:36px;border-radius:8px" index.html` is 0; `grep -c "width:34px;height:34px;flex:none;border-radius:8px;border:1px solid rgba(36,66,50,0.14)" index.html` is 0; the booking date-picker arrows (`width:40px;height:40px;flex:none;border-radius:8px;border:none;background:rgba(244,239,228,0.08)`) and public calendar arrows (`#f4efe4` 40px) are unchanged.

- [ ] **Step 7: Build the verification harness `_verify_admin.mjs`.** Playwright-core; for each viewport in [360, 390, 430] (height 800, dsf 2): goto `file:///…/index.html`; reach the component via the React fiber (`__reactFiber$…` → walk `.return` to `stateNode.logic`); stub `window.fetch` so admin loads return benign JSON (`{ok:true, content:{}, bookings:[], plans:[], activity:[], settings:{}}`). Seed `setState({ allBookings:[…3 sample bookings…] })`. Assert:
  - For each admin tab `setState({ page:'admin', authed:true, adminTab:t })` (t in dashboard/bookings/plans/coaches/pricing/schedule): no element wider than viewport (`scrollWidth <= clientWidth+1`).
  - **Bar gating:** on admin (`page:'admin'`) there is NO fixed `bottom:0` bar with a `tel:` link (remember: `offsetParent` is null for fixed elements — detect via `getBoundingClientRect().height>0`); control case: `go('home')` → the bar IS present.
  - **Tap targets:** on `adminTab:'plans'` with `bkView:'calendar'`, the admin calendar `‹`/`›` measure ≥40px. Drive the coach portal calendar (set the coach-authed state the app uses; inspect keys — e.g. `authed:true` + the coach view/page) and assert the coach `‹`/`›` ≥40px. If the coach calendar can't be reached in the harness, assert statically that zero `width:34px;height:34px;flex:none;border-radius:8px;border:1px solid rgba(36,66,50,0.14)` remain (done in Step 6) and note it.
  - **Sign out:** on admin, the "Sign out" button's rendered height is ≈ one line (e.g. < 44px / not double-height).
  - 0 real console errors (favicon/`file://`/`net::`/CORS excluded).
  Run `node _verify_admin.mjs`; iterate to green at all three widths. Note harness pitfalls: `offsetParent` is null for `position:fixed`; inline `style` serializes with a space after the colon.

- [ ] **Step 8: 360px conditional fix (only if Step 7 flags it).** If any admin tab shows horizontal overflow or a clipped control at 360px, make a NARROW local fix on that spot (e.g. `flex-wrap`, a `min-width`, or letting a row stack). No global rule. Re-mirror + re-run to green. If nothing crowds, skip and note it.

- [ ] **Step 9: Final verify + cleanup + commit.** Confirm `node _verify_admin.mjs` passes at 360/390/430 with 0 real console errors and mirror IDENTICAL. Capture before/after screenshots of an admin tab (no bar) + the header into the report. Delete scratch: `rm -f _verify_admin.mjs _adm*.png && rm -rf node_modules package.json package-lock.json`. Commit:
```bash
git add index.html "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Admin mobile polish: hide customer Call/Book bar in admin; Sign-out no-wrap; admin/coach calendar arrows 40px; 360px verified"
```

---

## Self-review notes

- **Spec coverage:** Fix #1 (hide bar) → Steps 1-2; Fix #2 (Sign-out) → Step 3; Fix #3 (arrows) → Steps 4-5; Fix #4 (360px sweep) → Steps 7-8. Verification → Steps 7 & 9. All map.
- **Scope discipline:** each edit anchored with a unique substring + expected replace count; the customer-page bar behaviour preserved (control case in Step 7); the mobile-nav `<sc-if isMobile>` at ~58 and already-bumped customer arrows explicitly excluded and re-checked in Step 6.
- **Replace-all safety:** Steps 4-5 name expected counts (2 and 4) to catch over-broad matches.
- **Conditional work:** Step 8 only fires if 360px shows real crowding (YAGNI).
- **Mirror discipline:** Step 6 mirrors after edits; Step 9 re-confirms IDENTICAL and removes scratch.
- **Binding consistency:** `showMobileBar` produced in Step 1 (render-return), consumed in Step 2 (markup); `isMobile`/`page` confirmed in-scope.
