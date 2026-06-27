# Booking Foundation — Multi-day Programs, Add-ons & Per-archer Events — Design

## Summary

The foundation layer of the larger booking/admin/accounting redesign. Two coupled sub-projects:

- **#2 Program setup** *(frontend-only)* — every program becomes multi-day (the "How many sessions?" stepper and single-date path go away); programs gain an admin-editable **add-ons** list (target face, bow rental…) with a per-add-on **scope**; the booker-facing "Professional coach" add-on is removed.
- **#5 Per-archer calendar events** *(backend — needs redeploy)* — a booking of A archers across S slots creates **A×S calendar events** (one per archer per slot, `Archers: 1` each) instead of one event holding N seats, so each time slot shows the true archer count. Still **one email + one ref** per booking. Capacity counting is unchanged.

These two are the base that the later sub-projects build on: per-archer concessions + admin group-discount config (#3), the reordered booker flow (#4), admin coach-assignment by archer count (#6), and accounting/ledger + admin cleanup (#7). Each of those is its own spec.

## Decisions locked during brainstorming

- **All programs multi-day.** No per-program single-vs-multi distinction; the session-count stepper is removed; the `multiDay` admin toggle is dropped (every program uses the multi-date picker).
- **`needsCoach` stays** as program metadata (marks "this program expects coaches" for #6), but the booker no longer picks a coach — the "Professional coach" add-on is removed.
- **Add-ons are per-program, admin-editable**, each with a **scope**: `perArcher` (× archers, e.g. bow rental) or `perBooking` (once, e.g. target face).
- **Per-archer add-ons are selected individually per archer** (archer 1 rents a bow, archer 2 doesn't) and ride on that archer's event. Per-booking add-ons are chosen once for the booking.
- **#5 backend is backward-compatible**: it accepts both the new per-archer line-item request shape and today's shape, so the foundation ships and works with the *current* booking flow (later phases enrich per-archer data).

## Part A — Program model & add-ons (#2) — frontend-only

### All programs multi-day

- Remove the "How many sessions?" stepper, `sessionTarget`, and the single-date booking path; every program uses the existing multi-date picker (pick day(s) + time(s)).
- Drop the **multiDay** toggle from the admin Programs editor and from the program data model's behavioral use; the booking flow treats every program as multi-day. `normalizePrograms` may keep the field for back-compat but nothing reads it as a gate.
- Keep `needsCoach`, `minAge`, `maxAge`, `price`, `name`, `offerDiscounts`, `blurb`.

### Remove the "Professional coach" add-on

- Delete the booker-facing optional-coach add-on UI (`showCoachAddon`, `coachAddon`, `toggleCoachAddon`, and the Add-ons card that renders it). Coaches are assigned by the admin later (#6).

### Add-ons data model

A new per-program, admin-editable list, mirroring how `programs`/`discounts` already work (content array, persisted via the admin-authed `setContent`; backend stores the computed amounts/labels the site sends). Add-ons live **on each program** (a program owns its add-on list):

```
program.addons = [ { id, name, price (number), scope: 'perArcher' | 'perBooking' } ]
```

- `id` is a stable slug (frozen on rename, like discount ids).
- `defaultPrograms()` seeds an empty `addons: []` per program (no add-ons until the admin creates them); `normalizePrograms` coerces/normalizes `addons` (price→Number, scope→one of the two values, id→slug).

### Admin add-ons editor (Pricing tab)

Inside each program's row in the existing Programs editor, an **Add-ons** sub-section: a `<sc-for>` of add-on rows (name, price number, a **scope** toggle `perArcher`/`perBooking`, remove) + a "+ Add add-on" button. Handlers mirror the discounts editor (`setAddonField`/`setAddonNum`/`toggleAddonScope`/`removeAddon`/`addAddon` → `saveCM({ programs })`). No new backend action.

### Pricing shape (foundation level)

Booking total = Σ over archers of (rate × slots − that archer's concessions) + Σ `perArcher` add-ons (per archer who selected them, × their slots) + Σ `perBooking` add-ons (once) − group discount. The **detailed** per-archer pricing UI and concession selection are #3/#4; the foundation only needs add-on definitions + scope and the per-archer event interface to carry amounts. The frontend continues to compute `amount` (the backend trusts it).

## Part B — Per-archer calendar events & capacity (#5) — backend, needs redeploy

### Event creation

`book_` / `bookMulti_` change from "one event per slot holding N seats" to **one event per archer per slot**. A booking of A archers across S (date, time) slots creates **A×S events**, each:
- `Archers: 1`
- titled with the archer's name (+ the program), e.g. `Maria Cruz — Open Range`
- description carrying the shared booking `Ref`, the booker's `Email` + `Mobile`, `Program`, the archer's `Amount` (price share), the archer's `Concession`, and the archer's per-archer add-ons.

### Capacity — unchanged (verified)

`countByHour_` already sums each event's `Archers` field via `seatsOf_` (default 1). Per-archer events (`Archers: 1`) sum to the true archer count; **legacy `Archers: N` events still sum correctly**. So `buildSlots_`/`countByHour_`/`seatsOf_` need **no change**, and old + new bookings coexist. A slot's `left = capacity − Σ archers`, and the slot visibly holds N events.

### One email, one ref — unchanged

`makeRef_` issues one ref per booking; `sendReceipt_` sends one summary email (all archers, all slots, the total). Only the number of calendar events changes.

### Backend request interface

The frontend sends a per-archer line-item array plus booking-level fields:

```
{ action: 'book', ref?, name, phone, email, program,
  date(s)/time(s) as today,
  archers: [ { name, dob, concession, addons:[{id,name,price}], amount } ],
  perBookingAddons: [ { id, name, price } ],
  total }
```

**Backward compatibility (key):** when the request arrives in *today's* shape (`party` + `archers:[{name,dob}]` + a single booking-level `concession` + one `amount`, no per-archer `amount`/`addons`), `book_` still creates one event per archer by: splitting `amount` evenly across archers (last archer absorbs the rounding remainder so the per-event amounts sum to the booking total), applying the booking-level `concession` to each archer's event, and no per-archer add-ons. This lets #5 ship against the current frontend; #3/#4 later send the richer shape.

### Sheet recording

One Bookings-sheet row **per archer-event** (granular), carrying the shared `Ref`, the archer's name, per-archer `Amount`, concession, add-ons, plus the booking's `Date`/`Time`/`Program`/`Email`. **Per-booking add-ons** are recorded **once** at booking level (a single booking-level note/field on the booking's first archer-event and/or a dedicated handling in #7) — never split across or duplicated per archer. The admin Sessions view groups rows by `Ref` (+ date/time) into one booking for coach assignment (#6) and accounting (#7). `seatsOf_`-based availability is independent of the sheet.

### Cancel / reschedule

A booking's archer-events for a slot are cancelled/rescheduled **together** (matched by `Ref` + date/time): cancel removes all archer-events for that booking-slot; reschedule moves them as a group. `cancel_`/`reschedule_` extend their event-matching from "one event" to "all events sharing this ref+slot." One customer-facing email per booking action, as today.

### Backend rollout

`db-v25` redeploy with a `perArcherEvents: true` version flag and a SETUP.md checklist. Verify on a scratch future date using `noEmail` + auto-cleanup (the round-trip-test pattern).

## Integration & sequencing

1. **Ship #2 first** (frontend-only, low risk): multi-day-everywhere, remove coach add-on, add-ons data model + admin editor. Mirror `index.html` ↔ `.dc.html`. No redeploy.
2. **Then ship #5** (backend, riskier): per-archer events + back-compat request handling + cancel/reschedule grouping. `db-v25` redeploy.

Each piece is its own spec → plan → build cycle; this document is the shared design for both.

## Constraints

- **Mirror rule:** every `index.html` edit mirrored verbatim to `Pasig Greenpark Archery Camp.dc.html`; finish with `diff … && echo IDENTICAL`.
- **SuperConductor:** no JS expressions inside `{{ }}` (precompute in the data layer); straight ASCII quotes; per-item `<sc-for>` closures built in the data layer.
- **Backend:** #5 changes the booking engine and **requires a manual `db-v25` redeploy**; #2 is frontend-only (no redeploy).
- **Backward compatibility:** legacy single-event bookings (`Archers: N`) keep working in availability, My Bookings, admin, cancel, and reschedule. Legacy CONTENT without `addons` → programs seed `addons: []`. `book_` accepts both the old and new request shapes.
- **No double-charge:** `Σ per-archer event Amounts + Σ per-booking add-on amounts = booking total`. Per-booking add-ons are recorded exactly once. For the back-compat path (old request shape, no add-ons), the per-archer Amounts are an even split of the booking total with the rounding remainder on the last archer, so they sum to the total exactly.

## Verification

**#2 (Playwright UI-driving via the dc runtime; mirror IDENTICAL):**
- Every program shows the multi-date picker; no "How many sessions?" stepper anywhere; no "Professional coach" add-on.
- Admin Pricing → a program → add an add-on (name/price/scope), toggle scope, remove; it persists (`setContent` fires) and appears in that program's booking add-on step.
- Add-on ids stay frozen across a rename.

**#5 (live backend on a scratch date, `noEmail` + cleanup):**
- Booking A archers in one slot creates **A events**, each `Archers: 1`, each titled with an archer name; one `ref`; A event ids returned.
- A multi-day booking (A archers × S slots) creates **A×S events**.
- `?action=availability` for the slot shows `left = capacity − A`; a legacy `Archers: N` event still subtracts `N`.
- `Σ per-archer event Amounts + Σ per-booking add-on amounts = booking total` (back-compat even-split verified, including the rounding remainder on the last archer).
- One summary email per booking (verify with email on, or assert `emailed:true` once).
- Cancel the booking → all A (or A×S) archer-events removed; slot returns to full; one cancel action.
- `?action=version` → `"version":"db-v25"`, `"perArcherEvents":true`, all prior flags present.
- 0 real console errors (frontend); legacy bookings still render in My Bookings + admin.

## Out of scope (later sub-projects)

- **#3** — per-archer concession selection + admin-configurable group-discount (which programs, the 10/20/30% tiers).
- **#4** — reordered booker flow (details → archers w/ "same as booker" → age-filtered program list → multi-day picker → add-ons → estimate → confirm) and the full per-archer selection UX that sends the rich request shape.
- **#6** — admin coach assignment by archer count (2→1, 3–4→2, 5–6→3) in the Sessions view.
- **#7** — accounting/ledger (per-archer amounts, add-on allocation to an add-ons account, coach-fee split among assigned coaches; passes split into coaches/range/equipment) + dashboard cleanup of dead fields.
