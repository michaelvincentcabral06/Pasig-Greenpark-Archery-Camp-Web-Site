# Split Contact and Book a Session into separate pages

**Date:** 2026-06-24
**Scope:** The `contact` page currently holds BOTH contact info (location/phone/hours/map/
Facebook) and the public booking form. Split them: a new `book` page holds the booking form;
`contact` becomes info-only. Frontend-only. No pricing/backend/booking-logic changes.

Mirror rule: every change is applied identically to `index.html` **and**
`Pasig Greenpark Archery Camp.dc.html` (byte-identical).

## Decisions (from brainstorming)
- **Nav:** add a dedicated **Book** text link (desktop + mobile) with the active-underline,
  AND keep the top-right "Book a Session" button. Nav order: Home · Programs · Passes ·
  About · Book · Contact · My Bookings.
- **Contact page:** info + map only (Location, Call us, Range hours, Map, Facebook). No
  booking CTA on the Contact page.
- **Book page:** the booking intro + the entire booking form (card layout), moved verbatim.

## Current structure (index.html, current line numbers)
- `isContact` section: lines **747–1161**.
  - 749–753: intro (`<section>` with "Visit & book" / "Come shoot with us" / "Reserve a
    single session below…").
  - 755: two-column grid `<section>` (`grid-template-columns:1fr 1fr`).
  - 756–792: INFO + MAP left column (`<div style="display:flex;flex-direction:column;gap:22px;">…</div>`).
  - 794–1158: BOOKING FORM right column (`<div id="booking-form" …position:sticky…>…</div>`).
  - 1159–1161: close grid `</section>`, outer `</div>`, `</sc-if>`.

## Target structure
### `contact` page (info-only)
- Keep the `isContact` `<sc-if>` wrapper and intro `<section>`, but change the intro copy to
  contact-focused: eyebrow "Visit us" (was "Visit & book"); keep/adjust the H1; replace the
  "Reserve a single session below…" paragraph with a plain contact line (e.g. "Find us at
  Greenpark Village, call ahead, or message us on Facebook — we'd love to have you on the
  range.") with NO booking link or CTA (per the "info + map only" decision).
- Replace the two-column grid `<section>` with a single-column info `<section>` (max-width ~
  760px, centered) containing ONLY the INFO + MAP block (lines 756–792, moved verbatim). The
  inner `<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">` for the
  Location/Call cards stays as-is.
- Remove the BOOKING FORM block (794–1158) from `isContact`.

### `book` page (new)
- Add `<sc-if value="{{ isBook }}">…</sc-if>` (place it immediately after the `isContact`
  block closes, before the `<!-- ============ ACCOUNT ============ -->` marker).
- Contains: a booking intro `<section>` (the "Reserve a single session… grab a pass or
  membership… Have a pass already?…" copy, including the existing `goPlans` link) + a
  centered `<section>` (max-width ~640px) wrapping the BOOKING FORM block moved VERBATIM from
  794–1158 (keep its inner markup, bindings, and `id="booking-form"` unchanged; the
  `position:sticky` is harmless standalone and may stay).

## Routing & wiring
- New bindings (near the existing route bindings ~4536–4537):
  - `isBook: page === 'book'`
  - `goBook: () => this.go('book')`
- Repoint booking helpers (currently `this.go('contact', …)`) to `this.go('book', …)`:
  `bookProgram`, `bookLittle`, `bookYouth`, `bookAdult`, `bookOpen`, `bookPrivate`,
  `bookGroup` (lines ~4538–4544).
- `go(p, program)` scroll-to-form special-case (line ~2603): change `p === 'contact'` to
  `p === 'book'`.
- **`confirmBooking` gate (line ~3884):** change `this.state.page === 'contact'` to
  `this.state.page === 'book'` — the slots-vs-target gate must keep firing only on the public
  booking page (NOT My Bookings), preserving the prior regression fix.
- Repoint these booking CTA buttons from `goContact` to `goBook`:
  - desktop top-right "Book a Session" (line ~54)
  - mobile "Book a Session" (line ~73)
  - home hero "Book your first session →" (line ~91)
  - programs "Book a session →" (line ~364)
  - "book a single session" inline links (lines ~638, ~680)
  - mobile sticky-bar "Book a Session" (line ~2313)
  - "Book this →" already uses `bookOpen` (line ~455) — repointed via the `bookOpen` binding.
- Keep on `goContact` (info page): desktop nav "Contact" (line ~52), mobile nav "Contact"
  (line ~71), footer "Contact" (line ~2282).

## Navigation markup
- Desktop nav: insert a **Book** `<button onClick="{{ goBook }}">` with the `isBook`
  active-underline, between "About" and "Contact" (matching the existing nav-button styling).
- Mobile nav dropdown: insert a **Book** link between "About" and "Contact" (matching the
  existing mobile link styling).

## What is NOT changing
- The booking form's internal markup, the card layout, the sessions stepper, the gate logic,
  `priceFor`/`bookSlot`/availability, emails, the backend.
- The My Bookings (`isAccount`) booking form.
- Brand colors/fonts; all other pages.

## Risks / watch-items
- Moving ~365 lines of the booking form verbatim between `<sc-if>` blocks: keep `<sc-if>`/
  `<sc-for>` nesting balanced; the page blanks if a tag is orphaned.
- The `confirmBooking` gate change is load-bearing — verify the public gate still blocks AND
  the My Bookings multi-slot path still books after the move.
- index.html and the .dc.html mirror must stay byte-identical.

## Verification
Drive the live-style flow in Playwright (served locally, backend stubbed):
- Nav: "Book" link → book page renders the form; "Contact" link → contact page renders
  info+map only (no booking form / no `data-test=card-core`).
- A program "Book" CTA (e.g. "Book this →") lands on the book page with the form.
- Gate still works on the book page (target 2 + <2 slots → Book dimmed) and My Bookings
  multi-slot booking still fires `book` (gate scoped to `page==='book'`).
- Screenshot contact (info-only) + book (form) at desktop and mobile widths.
- Mirror parity IDENTICAL.
