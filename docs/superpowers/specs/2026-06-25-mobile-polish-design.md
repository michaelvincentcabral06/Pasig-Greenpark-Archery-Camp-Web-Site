# Mobile Polish (Customer-Facing) — Design

## Summary

A **light, targeted** mobile polish of the customer-facing pages — not a responsive rewrite. A phone-width audit (Playwright at 390px across Home, Programs incl. the new calendar, the busy booking flow, and the populated My Bookings list) found the mobile layout already in good shape: fluid `clamp()` sizing + flex-wrap + a mobile Call/Book bar produce clean, legible screens with **no page-wide horizontal overflow**. So this pass fixes the few concrete rough edges rather than restructuring anything.

This is **Approach A** (chosen over a structural breakpoint refactor): keep the existing single-breakpoint + fluid architecture; fix only what's genuinely off.

## Scope

**In scope — customer-facing only:** Home, Programs (weekly grid, the public availability calendar, day-detail), the booking flow (date picker, slot grid, party stepper, concessions, quote), My Bookings (lookup + populated list with filters/cards/pagination), and the shared nav + mobile Call/Book bar.

**Out of scope (explicitly):**
- Admin dashboard and the Bookings/Sessions/Passes/Calendar/Plans/Coaches tabs — a later pass.
- Any structural responsive refactor (replacing the single `@media (max-width:760px)` rule, new breakpoint system). The current blunt rule works; leave it unless the 360px sweep proves it harms a specific customer-facing spot — and even then, fix that spot narrowly.
- The Book-page redundancy of the bar's "Book a Session" button (you're already on the booking page). Left as-is; a persistent CTA is acceptable. YAGNI.
- No backend change, no deploy.

## Global constraints

- **Mirror rule:** every edit to `index.html` is applied identically to `Pasig Greenpark Archery Camp.dc.html`; finish with `diff index.html "Pasig Greenpark Archery Camp.dc.html" && echo IDENTICAL`.
- **No backend change, no deploy.** Frontend-only.
- **Preserve existing visuals.** This is polish — do not redesign components or change colors/spacing beyond the specific fixes below. Match surrounding style.
- **SuperConductor:** no JS ternaries inside style `{{ }}` interpolations (pre-compute on data objects if a value must vary).
- **Verification:** Playwright-core driving the real DOM at **360 / 390 / 430px** (deviceScaleFactor 2). Chromium at `C:\Users\Michael Cabral\AppData\Local\ms-playwright\chromium-1228\chrome-win64\chrome.exe`; install if missing via `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright-core --no-save`. Scratch harness `_*.mjs` (gitignored), deleted before finishing.

## The three fixes

### 1. iOS safe-area for the fixed Call/Book bar

The mobile bar (index.html ~2555-2570, inside `<sc-if value="{{ isMobile }}">`) is `position:fixed;bottom:0;…;padding:12px 16px;` with a preceding flow spacer `<div style="height:74px;"></div>`. Neither accounts for the iPhone home-indicator inset, so on notched iPhones the buttons sit under the home bar and the very-bottom content can be tucked beneath it.

- **Bar:** change `padding:12px 16px;` → `padding:12px 16px calc(12px + env(safe-area-inset-bottom, 0px));` so the buttons clear the home indicator. (On devices without an inset, `env()` resolves to 0px — no visual change.)
- **Spacer:** change `height:74px;` → `height:calc(74px + env(safe-area-inset-bottom, 0px));` so the bottom-of-page clearance matches the now-taller bar.
- No change to the `isMobile` gating (already `innerWidth < 880`, line ~2874) — desktop is already correct.

**Acceptance:** bar still renders identically on non-inset viewports (Playwright can't simulate the home indicator, so verify no regression: bar visible, two buttons full-width, content scrolls fully clear of it at the page bottom). The inset benefit is confirmed by the owner on a real iPhone.

### 2. Tap-target minimums (customer-facing controls)

Raise primary interactive controls that are below a comfortable thumb size, without unbalancing the design:

- **Party steppers** `−`/`+` — currently `width:38px;height:38px` (two pairs: the single-session panel ~1064/1069 and the multi-date panel ~1320/1325). Raise to `width:44px;height:44px`. Keep the font-size and the flex layout; only the box grows.
- **Icon month-nav arrows** `‹`/`›` — the booking date-picker (~968/970/1427/1429, `34px`) and the public availability calendar (~537/539 and the admin one is out of scope; `36px`). Raise to **40px** (icon nav; 44 would look oversized next to the month label). Customer-facing only — do not touch the admin calendar nav.
- During implementation, scan other customer-facing interactive elements (pills, small text-buttons) for anything under ~40px tall that is a primary action; raise to ~40px+ where it doesn't harm layout. Decorative/secondary links (e.g. footer "Coach portal"/"Staff login") are exempt.

**Acceptance:** Playwright measures each named control's rendered box ≥ the target (44px steppers, 40px nav arrows) at 390px; no layout breakage at 360/390/430.

### 3. 360px tightness sweep

At 360px (common budget-Android width in PH), verify the densest customer-facing spots and fix only genuine cramping or overflow:

- Home hero + CTAs; Programs weekly pills; the **public calendar grid + day-detail** (7 columns at 360px); the booking **slot grid**, party stepper row, concession checkboxes, and quote breakdown; My Bookings **search + filter dropdowns + session cards + pagination**.
- **Known watch-item:** the two My-Bookings filter dropdowns ("All programs" / timeframe) sit side-by-side at 390px. If they crowd or clip their text at 360px, allow them to wrap/stack (e.g. flex-wrap or a min-width that triggers stacking) — a narrow, local change, not a global rule.
- Any element whose rendered width exceeds the viewport at 360px is a defect to fix locally.

**Acceptance:** at 360px, zero horizontal page overflow; the watch-item dropdowns and all named dense spots render without clipped text or overlap.

## Architecture / approach notes

- All changes are inline-style or local-markup edits within the single component; no new state, no new bindings, no new helpers expected (fix #3's dropdown-stacking, if needed, is a style tweak on the existing filter row).
- Each fix is independently verifiable and low-risk. The work is small enough for **one implementation task**, with verification as its deliverable; split only if the 360px sweep surfaces a non-trivial local fix worth isolating.

## Verification plan

A single Playwright harness (`_verify_mobile.mjs`) that, at viewports 360/390/430:
1. Drives each customer-facing surface via the React-fiber `logic` instance (`go('home'|'programs'|'book'|'account')`; stub `?action=availability`; seed `acctIn`+`acctBookings` for the populated list; set `party`/`archers`/`slots`/`slotTimes` for the busy booking flow).
2. Asserts: no element wider than the viewport (no h-overflow) on any surface; the named tap-targets meet their minimum box size; the Call/Book bar renders with two full-width buttons and content clears it at page bottom; the My-Bookings filter row does not clip at 360px.
3. 0 real console errors (favicon/`file://` CORS noise excluded).

Expected: all assertions pass at all three widths. Capture before/after screenshots of the bar, steppers, and the 360px My-Bookings filter row for the report.
