# Admin Mobile Polish — Design

## Summary

The deferred second half of the responsive work: polish the owner-facing **admin** screens for phones. A phone-width audit (Playwright 390px across dashboard, Bookings/Sessions, Pricing, Coaches, Schedule, Activity) found the admin already in good shape — no horizontal overflow, the 6-button tab bar wraps cleanly to two rows, dense editors/tables stack and wrap. So this is **light targeted polish**, same philosophy as the customer-facing pass: fix the few concrete rough edges, no structural change.

## Scope

**In scope (admin/owner + coach-portal screens):** the customer Call/Book bar's presence on admin, the admin header's "Sign out" control, the admin-calendar and coach-portal month-nav arrow tap targets, and a 360px tightness sweep of the admin tabs.

**Out of scope (explicitly):**
- Customer-facing pages — already done in the prior pass.
- Any structural responsive refactor (the single `@media (max-width:760px)` rule stays).
- New admin features or layout redesigns — polish only.
- No backend change, no deploy.

## Global constraints

- **Mirror rule:** every `index.html` edit mirrored to `Pasig Greenpark Archery Camp.dc.html`; finish with `diff … && echo IDENTICAL`.
- **No backend change, no deploy.** Frontend-only.
- **Preserve existing visuals** — polish, not redesign.
- **SuperConductor:** no JS ternaries inside style `{{ }}` interpolations; pre-compute booleans/strings; straight ASCII quotes in HTML attributes.
- **Verification:** Playwright-core at 360/390/430px (deviceScaleFactor 2), driving the admin via the React-fiber `logic` instance (`setState({ page:'admin', authed:true, adminTab:… })`, stub backend `fetch`). Scratch `_*.mjs` (gitignored), deleted before finishing.

## The fixes

### 1. Hide the customer Call/Book bar in admin

The fixed mobile Call/Book bar (`<sc-if value="{{ isMobile }}">`, ~index.html:2578) renders on every screen, including admin — irrelevant and slightly unprofessional while managing the site, and it covers content. Gate it to non-admin:
- Add a render-return binding `showMobileBar: isMobile && page !== 'admin'` (both `isMobile` and `page` are already in the render scope, ~line 5364).
- Change the bar's gate from `value="{{ isMobile }}"` to `value="{{ showMobileBar }}"` (the inner spacer + fixed bar are inside this `<sc-if>`, so both vanish on admin together).

**Acceptance:** on admin pages at mobile widths the bar + its spacer are absent; on customer pages (home/programs/book/account) the bar still shows.

### 2. "Sign out" must not wrap

In the admin header (~index.html:1814-1816), the `[LIVE badge + Sign out]` flex group (`display:flex;align-items:center;gap:10px;`) squeezes "Sign out" onto two lines at phone width.
- Inner group (~1814): add `flex-wrap:wrap;justify-content:flex-end;` so the button can drop below the badge instead of being crushed.
- Sign-out button (~1816): add `white-space:nowrap;` so its label stays on one line.

**Acceptance:** at 360/390px the "Sign out" button text renders on a single line.

### 3. Admin & coach month-nav arrow tap targets → 40px

These are the arrows deferred from the customer tap-target pass (they live in admin/coach screens). Raise to 40px (matching the public calendar arrows):
- **Admin calendar** nav (`calViewPrev`/`calViewNext`, ~index.html:2146/2148): style `background:#fffdf6;…;width:36px;height:36px;border-radius:8px`. Change `width:36px;height:36px;border-radius:8px` → `width:40px;height:40px;border-radius:8px` (replace-all; expected count 2 — the public-calendar `#f4efe4` arrows are already 40px, so 36px now matches only these two).
- **Coach-portal calendar** nav (`coachCalPrev`/`coachCalNext`, ~index.html:2240/2242/2468/2470): style prefix `width:34px;height:34px;flex:none;border-radius:8px;border:1px solid rgba(36,66,50,0.14)`. Change `width:34px;height:34px;flex:none;border-radius:8px;border:1px solid rgba(36,66,50,0.14)` → `width:40px;height:40px;flex:none;border-radius:8px;border:1px solid rgba(36,66,50,0.14)` (replace-all; expected count 4 — this `border:1px solid rgba(36,66,50,0.14)` prefix is unique to the coach arrows; the booking date-picker arrows were already bumped and use `border:none`).

**Acceptance:** Playwright measures each named arrow's rendered box ≥40px; no other 34/36px control is altered (verify the booking date-picker arrows stay 40px and no decorative element changed).

### 4. 360px admin tightness sweep

At 360px, verify the densest admin spots and fix only genuine cramping/overflow: the tab bar (6 pills, two rows), the dashboard at-a-glance cards, the Bookings→Sessions filter bar + session cards (incl. the per-row coach `<select>`), the Pricing/Coaches editors, and the Activity log rows. Any element wider than the viewport at 360px is a defect to fix locally (narrow change, no global rule).

**Acceptance:** at 360px, zero horizontal page overflow on each admin tab; no clipped text/controls in the named dense spots.

## Architecture notes

All changes are inline-style / one render-return binding inside the single component; no new state, no backend. Each fix is independently verifiable and low-risk. Small enough for **one implementation task**, verification as its deliverable.

## Verification plan

A single Playwright harness (`_verify_admin.mjs`) at 360/390/430px that, for each admin tab (`dashboard`/`bookings`/`plans`/`coaches`/`pricing`/`schedule`) seeded with sample `allBookings` and a stubbed backend `fetch`:
1. No element wider than the viewport (no h-overflow) on any tab.
2. The Call/Book bar is ABSENT on admin (and a control case: present on a customer page like `home`).
3. The admin-calendar and coach-calendar nav arrows measure ≥40px.
4. The "Sign out" button text is on one line (rendered height ≈ single line).
5. 0 real console errors (favicon/`file://`/`net::`/CORS noise excluded).
Expected: all pass at all three widths. Capture before/after screenshots of an admin tab (showing no bar) + the header for the report.
