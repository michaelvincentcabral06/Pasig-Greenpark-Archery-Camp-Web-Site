# Admin / Booking Cleanup (#7 Phase 2) — Design

## Summary

A focused, **frontend-only** cleanup that closes the loose ends left by the per-archer and multi-coach work: (1) the remaining single-coach `matchCoach(b.coach)` reads that mis-display multi-coach bookings, (2) the orphaned booking-level concession code left dead by the per-archer flow — including a **live display bug** where the eligible-discount row shows an amount with a blank discount name, and (3) the booking-form error copy that omits the enforced concession-proof requirement. No backend change, no redeploy. The per-archer "My Bookings" edit panel (a customer-facing feature with backend implications) is explicitly deferred to its own later mini-project.

## Decisions locked during brainstorming

- **Scope = three quick fixes.** Multi-coach display consistency, dead concession-code removal (with the label fix it requires), and the `formError` copy. The per-archer edit panel is OUT — its own later spec/plan.
- **Fold the eligible-discount label fix into the dead-code removal.** Removing the dead `eligSel`/`eligProof` state is only safe after the rendered `eligDiscountLabel` is re-pointed at the live per-archer selections; the two are one coherent change.
- **Single plan, ~3 tasks (one per section).** All edits are in `index.html` (+ its mirror), low-risk, same file.

## Section 1 — Multi-coach display consistency

The dashboard's coach **earnings** attribution was fixed in Phase 1, but four display/filter sites still read `b.coach` (the comma-joined coach NAMES) through `matchCoach`, which only matches a single id-or-name and so returns null for any multi-coach booking:

- **Upcoming-schedule row** coach name (~`index.html:5571`): currently `coach: c ? c.name : 'Any coach'` → show the joined `b.coach` string (or `'Any coach'` when empty).
- **Bookings-tab coach filter** (`bkCoach`, ~`index.html:5616`): `'unassigned'` → `coachIdsFromNames(b.coach).length === 0`; a specific coach → `coachIdsFromNames(b.coach).indexOf(bkCoach) !== -1`.
- **Bookings-tab row** coach label (~`index.html:5631`): `coachLabel: c ? c.name : 'No coach yet'` → show `b.coach` (or `'No coach yet'`).
- **Per-coach upcoming count** (~`index.html:5726`): increment `coachUpcomingCount[id]` for every id in `coachIdsFromNames(b.coach)` (guarding ids the map knows).

After all four are converted, the `matchCoach` helper (~`index.html:5522`) is unused and is removed. Result: a 2-coach booking shows both names everywhere, is counted toward each coach, and matches a specific-coach filter.

## Section 2 — Eligible-discount label fix + dead concession-code removal

**The live bug:** the eligible-discount **amount** (`eligPer`, ~`index.html:5015`) is summed from the per-archer selections (`archerConcessionPerSlot` over `archers[]`), so the cost-summary discount row renders whenever an archer picks a discount. But the **name** (`eligParts`/`eligDiscountLabel`, ~`index.html:5022-5023`) is built from `this.state.eligSel` — the old booking-level selection state that nothing sets anymore (its only writer, `toggleElig_`, is on a never-rendered control). So the row shows the amount with a blank discount name (e.g. "(−₱150 each)" with nothing before it).

**Fix:** derive `eligParts` from the **union of the per-archer selections** — collect every discount id selected across `archers.slice(0, party)[*].sel`, then map through `discountList()` to the names. The rendered `eligDiscountLabel` then shows the real discount name(s) alongside the (already-correct) amount.

**Remove the orphaned booking-level concession machinery** (defined/computed but, after the fix, no longer rendered or called):
- `discountRows()` (~`index.html:3496`) and its `discountRows: this.discountRows()` binding (~`index.html:5861`) — never rendered (the flow uses the per-archer `ax.concRows`).
- `toggleElig_` (~`index.html:3513`) and `setEligProof_` (~`index.html:3514`) — only used inside `discountRows()`.
- `eligPerArcher()` (~`index.html:3448`) — never called (the live per-archer amount is `archerConcessionPerSlot`).
- The `this.state.eligSel` / `this.state.eligProof` reads — once the label no longer references them, no live code remains. (They are accessed via `… || {}`, not declared in the state initializer, so removal is reference-only.)

No behavior change beyond the corrected label and the deletion of unreachable code.

## Section 3 — `formError` copy

Both booking-form error blocks (~`index.html:1139` and ~`index.html:1549`, the single-day and multi-day flow variants — identical copy) read: *"Please complete your name, mobile number, a valid email, every archer's name & birthdate, and pick an available time."* Concession **proof** is enforced (`proofBlock` in `submitForm`) but unmentioned. Update both to include it, e.g.: *"Please complete your name, mobile number, a valid email, every archer's name & birthdate, attach proof for any selected discount, and pick an available time."* (Straight ASCII; mirror both.)

## Constraints

- **Mirror rule:** every `index.html` edit mirrored byte-for-byte to `Pasig Greenpark Archery Camp.dc.html`; finish with `diff … && echo IDENTICAL`.
- **SuperConductor:** no JS expressions inside `{{ }}` — the corrected `eligDiscountLabel` and all display strings are precomputed in the data layer; straight ASCII quotes; per-item `<sc-for>` closures in the data layer.
- **Frontend-only.** No backend change, no redeploy. Reuses `coachIdsFromNames` (#6), `discountList`, `archerConcessionPerSlot`, `archers[].sel`.
- **No regressions:** the four converted coach sites must preserve their existing empty-state strings (`'Any coach'` / `'No coach yet'` / the `'unassigned'` filter semantics); the discount-row amount math is untouched (only the label source changes).

## Sequencing

One plan, three tasks (one per section), any order — they are independent and same-file:
1. **Multi-coach display consistency** — convert the four `matchCoach` sites; remove `matchCoach`.
2. **Eligible-discount label fix + dead-code removal** — re-point `eligParts` to per-archer selections, then delete the orphaned booking-level concession code.
3. **`formError` copy** — add the proof mention to both messages.

Each task produces a mirrored, independently testable change.

## Verification

**Frontend (Playwright over HTTP, Node unit checks of extractable logic, mirror IDENTICAL):**
- A booking whose `b.coach` is `"Michael Cabral, James Victoria"` shows both names in the upcoming list and the Bookings-tab row, counts toward BOTH coaches, and appears when filtering the Bookings tab by either coach.
- The `coachIdsFromNames`-based `bkCoach` filter: `'unassigned'` shows only no-coach bookings; a specific coach shows that coach's bookings (incl. multi-coach ones that include them).
- With a per-archer discount selected, the cost-summary eligible-discount row shows the discount NAME(s) plus the amount (not a blank name).
- A grep confirms `matchCoach`, `discountRows`, `eligPerArcher`, `toggleElig_`, `setEligProof_`, `eligSel`, `eligProof` have **zero** remaining references in `index.html`.
- Both booking-form `formError` messages include the proof clause.
- Mirror byte-identical; 0 real console errors.

## Out of scope (later)

- **Per-archer "My Bookings" edit panel** — a customer-facing feature (per-archer concession selectors + amount recompute + per-archer-aware save, plus surfacing per-archer concessions to the panel). Its own spec/plan.
- The upcoming-schedule and Bookings-tab **layout/UX** — only the coach-field correctness changes here, not the visual design.
- Any backend change (the read paths already return what these fixes consume).
