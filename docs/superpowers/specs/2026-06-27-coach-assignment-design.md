# Admin Coach Assignment by Archer Count (#6) — Design

## Summary

Extend the admin coach assignment from **one coach per booking** to **multiple coaches per booking**, capped by archer count (`maxCoaches = ceil(archers / 2)` → 1–2 archers→1, 3–4→2, 5–6→3). The admin picks the coaches in the **Sessions** view; the coaches are a flat list on the booking, stored in the existing `Coach` field/column as a comma-joined name list. **Frontend** (the multi-coach picker) + a small **backend change** (`db-v28`: `setBookingCoach_` accepts a coach list and updates all of the booking's per-archer events). Builds on the live per-archer events (#5).

## Decisions locked during brainstorming

- **Booking-level flat list** — coaches are assigned to the whole booking (group), not mapped to specific archers.
- **Cap = `ceil(archers / 2)`** — fixed formula (not admin-editable); a maximum, so the admin may assign fewer or none.
- **Reuse the existing `Coach` field/column** as a comma-joined name list — no schema change; read paths already read it as a string.
- **#7 consumes the list** — the coach-fee split (equally among assigned coaches) is accounting (#7), not this spec.

## Section 1 — Model

Each booking carries a **list of up to `N = ceil(archers / 2)` coaches**, assigned by the admin in the Sessions view. The list is flat (no per-archer coach mapping). The cap is a maximum: 0..N coaches allowed. `archers` for a booking = the booking's archer count (from the aggregated per-archer events / the `Archers` sum, already surfaced by `lookup_`/`listBookings_`).

## Section 2 — Backend (`db-v28`)

`setBookingCoach_(body)` extends to multi-coach + all-events:
- **Accepts a coach list:** `body.coaches` (array of coach ids). Resolve each via `coachById_` to its name and join (`'Coach A, Coach B'`). **Back-compat:** when only `body.coach` (a single id) is present, treat it as a 1-element list — old calls keep working.
- **Updates all of the booking's per-archer events** for the `(ref, date, time)` slot via the existing `eventsForSlot_` helper (the same one `cancel_`/`reschedule_` use): each event's `\nCoach: …` description line is set to the joined list (replacing or appending as today's single-event code does). This fixes the per-archer gap — today only one event (by `eventId`) is updated.
- **Updates all matching Bookings-sheet rows** for the ref+slot (the `Coach` column = the joined list), not just one.
- **Defensive cap check:** count the booking's archers (sum of the slot's events' `Archers`, or the matched sheet rows' `Archers`); if `coaches.length > Math.ceil(archers / 2)`, return `{ok:false, reason:'too many coaches'}`. The frontend already enforces the cap; this is belt-and-suspenders.
- **Empty list clears the coach** (sets the field to `''`) — lets the admin unassign all.
- **Reuses the `Coach` field/column** (now a comma-joined list); `lookup_`/`listBookings_`/the customer-facing displays read it as a string, so a list shows as "A, B" with **no read-path change**.
- **Version:** bump to `db-v28` + `multiCoach: true` flag; add a SETUP checklist.

## Section 3 — Admin Sessions multi-coach picker (frontend)

In the admin **Sessions** view, the per-booking coach assignment changes from a single-coach dropdown to a **multi-coach picker**:
- A **`maxCoachesFor(archers)` helper** = `Math.ceil((archers||1) / 2)`.
- Each booking row shows a **"Coaches (up to N)"** group of toggleable coach chips built from `coachList()`. A booking's **currently-assigned coaches start selected** — parsed from its `Coach` field (split the comma-joined names, match each to a coach by name → id).
- Clicking a coach chip toggles its selection. Once **N** coaches are selected, the **unselected chips are disabled** (to swap, unselect one first). A hint shows the cap (e.g. "up to 2 coaches").
- On any change, the frontend calls `setBookingCoach` with **`coaches: [ids]`** (the full selected list) **plus `coach: ids[0]||''`** (graceful degradation against an un-redeployed backend). The assigned coach names display on the row, read from the booking's `Coach` field (as today).
- Selection state is per-booking (keyed by ref+date+time / eventId), seeded from the `Coach` field on render.

This replaces the existing single-coach assignment UI in the Sessions view (and any duplicate in the Bookings view) with the multi-coach picker.

## Constraints

- **Mirror rule:** every `index.html` edit mirrored to `Pasig Greenpark Archery Camp.dc.html`; finish with `diff … && echo IDENTICAL`.
- **SuperConductor:** no JS expressions inside `{{ }}` (precompute chip state — selected/disabled/colors — in the data layer); straight ASCII quotes; per-item `<sc-for>` closures in the data layer.
- **Backend:** `setBookingCoach_` change needs a manual **`db-v28` redeploy** (edit the existing deployment). The frontend is mirror-only, no redeploy.
- **Backward compatibility:** `setBookingCoach_` accepts both the new `coaches` list and the old single `coach`; the frontend sends both (`coaches` + `coach: ids[0]`) so it degrades gracefully against `db-v27` until `db-v28` is live. Existing single-coach bookings display unchanged (a 1-name `Coach` field). Per-archer events from #5 all get the coach list once `db-v28` is live.
- **No new sheet column** — the `Coach` column is reused as a comma-joined list.

## Sequencing

1. **Backend (`db-v28`)** — `setBookingCoach_` multi-coach + all-slot-events + cap check + version flag/SETUP. Its own plan; one redeploy. Ship first (or together) — it accepts both shapes, so nothing breaks mid-rollout.
2. **Frontend** — the Sessions multi-coach picker. Its own plan; mirror; no redeploy. Until `db-v28` is live, the picker's `coach: ids[0]` fallback assigns the first coach only.

Each plan produces working, testable software on its own.

## Verification

**Backend (`db-v28`, Node unit tests + live):**
- `setBookingCoach_` with `coaches:['c1','c2']` resolves to `'Coach A, Coach B'` and writes it to all the slot's events + all matching sheet rows; with a single `coach:'c1'` still works.
- Cap check: `coaches` longer than `ceil(archers/2)` → `{ok:false}`.
- Empty `coaches:[]` clears the `Coach` field.
- Live (post-redeploy): assign 2 coaches to a 3-archer booking → `lookup_`/admin show both coach names on the booking; every per-archer event's description carries the list; assign 3 to that 3-archer booking → rejected.
- `?action=version` → `db-v28`, `multiCoach:true`, all prior flags.

**Frontend (Playwright over HTTP, mirror IDENTICAL):**
- A booking with 3 archers shows "up to 2 coaches"; selecting 2 coaches highlights them; the 3rd+ chips are disabled until one is unselected.
- A booking with 1–2 archers caps at 1 coach.
- Pre-population: a booking whose `Coach` field is "Coach A, Coach B" starts with those two chips selected.
- Toggling a chip fires `setBookingCoach` with `coaches:[ids]` (+ `coach: ids[0]`).
- 0 real console errors.

## Out of scope (later)

- **#7** — the coach-fee split (equally among the assigned coaches) and the accounting/ledger.
- Mapping specific coaches to specific archers (flat booking-level list only).
- Coach-side notifications / coach-portal changes.
- Admin-editable cap tiers (the cap is the fixed `ceil(archers/2)` formula).
