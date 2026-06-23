# Book a Session — public flow redesign

**Date:** 2026-06-23
**Scope:** Restructure the **public** "Book a Session" panel to match the layout/UX of
`archery_pro_booking_ux.html` (Downloads reference), rendered in the site's existing
dark-green/cream brand. Frontend-only. No backend/Apps Script changes. No pricing-math
changes. The **My Bookings** account booking form is explicitly out of scope.

Mirror rule: every change is applied identically to `index.html` **and**
`Pasig Greenpark Archery Camp.dc.html`.

## Decisions (from brainstorming)
- **Surface:** public Book a Session only.
- **Scheduling:** keep the live calendar slot picker; restructure the layout around it.
- **Sessions stepper:** real. Stepper sets a target count **N**; the customer then fills
  **N** date/time slots. Quote multiplies by N. *Book now* stays disabled until exactly N
  slots are chosen.
- **Coach add-on (₱1,200):** **visual only** — render the toggle but do not wire it to
  price, booking payload, or email. Shown only for programs that don't already require a
  coach (`needsCoach(program)` false). Labeled so it reads as "coming soon / ask staff",
  not an active charge.
- **Programs:** keep the full program selector (Open Range / Beginners / Private / etc.).
  Rates, age checks, and Open-Range-only eligibility behave exactly as today.
- **Visual:** keep the dark-green brand (`#244232` / `#1b3325` / `#7fb43f` / cream
  `#f4efe4`) and existing fonts (Hanken Grotesk, Spline Sans Mono). Adopt the reference's
  card + sticky-quote *structure*, not its light palette or Tabler icons.

## Layout
Replace the single tall panel with the reference's two-column grid (cards left, sticky
quote right). Collapses to one column on mobile (reuse the existing `isMobile`/`isDesktop`
split already present in the component).

1. **Core booking** card
   - Program selector (`fProgram` / `setProgram`) — unchanged behavior.
   - Per-session rate display for the chosen program (`rateFor(program)`).
   - **Sessions stepper** (− / value / +), plus the reference's quick-pick chips
     (1 / 3 / 5 / 10) as shortcuts that set N. Bounds 1–20.
   - The existing date + time **slot picker** (single-date multi-time, and Open Range
     multi-date) kept as-is functionally. A live "slots chosen: x / N" indicator.

2. **Group & Discounts** card
   - Group-size stepper (`party`), 1–20.
   - Discount-tier table (2 → 10%, 3-4 → 20%, 5-6 → 30%) — static, from `discountFor`.
   - A "group discount applied" badge when `party >= 2`.
   - Eligibility checkboxes (Pasig / PAC / RHS-local, −₱100 each) — **rendered only for
     Open Range**, same as today, including the existing proof fields.

3. **Add-ons** card
   - Coach add-on toggle (₱1,200), visual only, hidden when `needsCoach(program)`.
   - Keeps the existing coach *selector* for programs that genuinely need one
     (`needsCoach` true) — that stays wired and unchanged.

4. **Your quote** (sticky, right)
   - Line items driven by the existing `priceFor()` and helper getters: sessions × rate,
     group discount, qualifications (elig), per-archer figure, big total, savings badge.
   - **Book now** CTA (`confirmBooking`) + "Pay at the range… free to reschedule a day
     ahead" note. Disabled until: required form fields valid AND slots-chosen === N.
   - Reset returns the panel to defaults (reuse existing `resetForm` state shape).

## Sessions ↔ slots integration (the one new rule)
- New state: `sessionTarget` (default 1).
- Quote uses `sessionTarget` for the multiplier in place of "slots picked so far".
- `confirmBooking` is gated: `selectedSlotCount === sessionTarget`. The existing booking
  code already books each chosen (date,time); no change to `bookSlot`/multi-date logic.
- If the user lowers `sessionTarget` below the number of already-selected slots, block the
  decrement (or trim the most recently added) and show a hint. Pick **block + hint** for
  predictability.
- `priceFor(program, party, sessions, days)` is called with `sessions = sessionTarget`
  (days derived as today). No change to the function itself.

## What is NOT changing
- `priceFor`, `rateFor`, `discountFor`, `eligPerArcher`, `bothConcessions`, `bookSlot`,
  availability/seat logic, age validation, the booking payload, emails, the backend.
- The My Bookings account booking form markup.
- Brand colors, fonts, the rest of the page.

## Risks / watch-items
- The component is a large SuperConductor template (`{{ }}` / `<sc-if>` / `<sc-for>`); the
  public block must be edited without disturbing shared state used by the account form.
- index.html and the .dc.html mirror must stay byte-identical in the edited region.
- Coach add-on must be unmistakably non-functional so no customer thinks they were charged.

## Verification
- Drive the public panel in Playwright (fetch stubbed) the way the toggle flow was
  verified: set N via stepper, confirm Book is disabled until N slots chosen, confirm the
  quote line items match `priceFor` for a few program/party/eligibility combinations,
  confirm eligibility hides off Open Range, confirm the coach add-on changes nothing in the
  quote. Screenshot desktop + mobile widths.
