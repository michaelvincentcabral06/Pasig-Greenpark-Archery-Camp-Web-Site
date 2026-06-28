# Per-Archer My-Bookings Edit Panel — Design

## Summary

In **My Bookings**, a customer can edit an upcoming session. Today the panel reschedules (date/time) and exposes a single **booking-level** concession plus an archer-count stepper — but the concession, party, and amount changes are applied **locally only** (never written to the calendar; only the date/time reschedule is sent to the backend). The customer booking flow, by contrast, captures concessions **per archer**. This project makes the edit panel **per-archer for concessions** and makes those changes **actually persist** to the calendar, while removing the non-functional party stepper. It spans a backend read change (surface per-archer concessions to My Bookings), a frontend rebuild of the concession part of the panel, and a backend write change (rewrite each archer's event). This is the last deferred piece of the booking redesign (#1–#7).

## Decisions locked during brainstorming

- **Per-archer concessions only.** Each archer gets their own concession selectors; add-ons, names/DOB, and reschedule are unchanged.
- **Proof required.** Proof-required discounts (Pasig, PWD, etc.) show a proof input per archer and must be filled before saving — same rule as the booking flow.
- **Party stepper removed** from the edit panel. It doesn't persist today; archer-count changes happen by contacting the camp. The per-archer concession rows equal the booking's real archer count.
- **Edits apply to the edited slot only** (one `ref + date + time`). A multi-day booking is edited per-slot (each date is its own My-Bookings entry).
- **Concession-only change is silent** (no email); only an actual date/time reschedule emails the customer (as today).

## Section 1 — Model & scope

The edit panel operates on the **slot being edited** — the per-archer calendar events for one `(ref, date, time)`. It rewrites those events' concessions and amounts.

- **Per-archer concession blocks:** the panel shows one concession block per archer (the slot's actual archer count, surfaced from the backend), each a set of toggleable discount chips plus a **proof input** for each proof-required discount, seeded from the archer's current selection. Proof must be present for every selected proof-required discount before Save is allowed.
- **No add-ons / no name/DOB editing / no party stepper** in this panel. Reschedule (date/time) stays exactly as it is.
- **Amount recompute:** the new total is `Σ archers [ rate × (1 − groupDiscount(party)) − archerConcessionPerSlot(archer) ]` for the slot, shown live as "New total". Each archer's event receives its own recomputed `Amount` (its share), so the per-archer breakdown (used by the Earnings dashboard and accounting) stays correct.
- `groupDiscount` and `rate` come from the booking's program (`programByName`), exactly as the booking flow computes them; `party` is the slot's archer count.

## Section 2 — Backend (`db-v30`)

Two additive, back-compatible changes; one manual redeploy:

- **`lookup_` surfaces per-archer concessions.** Each My-Bookings slot entry gains an `archers: [{ name, concession }]` array, parsed from that slot's per-archer events. Each archer's `concession` carries the same shape the frontend uses (the selected discount items **including stored proof**, parsed from the event's `Concession:` line). The existing aggregated `concession` field on the entry is preserved (additive), so nothing that reads it breaks. This lets the frontend seed each archer's current selection + proof.
- **`reschedule_` accepts per-archer data.** It already finds and moves **all** of a slot's per-archer events (`eventsForSlot_`). Extend it to also accept `body.archers: [{ concession, amount }]` (the same per-archer shape `book_`/`bookMulti_` already consume) and, for each slot event, rewrite its `Concession:` line (via `concLineOf_`) and its `Amount`. Behavior:
  - **Concession-only edit** (the frontend sends `newDate === date` and `newTime === time`, with `notify: false`): the move is a no-op; rewrite concessions/amounts in place; **no reschedule email, no "Rescheduled" activity log**.
  - **Reschedule (date/time changed):** move the events as today, rewrite the per-archer concessions/amounts, and email + log the reschedule as today.
  - When `body.archers` is absent (older frontend), `reschedule_` behaves exactly as it does now (move only) — back-compatible.
- **Version:** bump to `db-v30` + a `perArcherEdit: true` flag (all prior flags preserved); add a matching `SETUP.md` deploy & verify checklist.

## Section 3 — Frontend (the edit panel)

- **`startEdit(entry)`** seeds a new `editArchers` state array — one entry per archer from `entry.archers`, each `{ sel, proof }` derived from that archer's surfaced concession (reusing `concToSel_`). Replaces the single `editSel`/`editProof`.
- **Render:** the panel shows one concession block per archer (toggle chips + per-discount proof inputs), reusing the booking flow's per-archer discount/proof component pattern (`archers[].sel/proof`, `archerConcessionPerSlot`, the proof-required + proof-border logic). **Remove** the archer-count stepper (`editPartyLabel`/`editInc`/`editDec`) and the single booking-level concession block.
- **`editAmount`** recomputes from `editArchers` (per-archer), feeding "New total" live.
- **`saveEdit`** validates that every selected proof-required discount has proof across all archers (inline error if not); then sends `action:'reschedule'` with `archers: [{ concession, amount }]` (built per archer via `buildConcession` + the per-archer amount), the `newDate/newTime` (unchanged for a concession-only edit), and `notify` = whether the slot actually changed. On success, update the local booking entry's per-archer concessions + total (so My Bookings reflects it without a reload).
- **Mirror** every `index.html` edit to `Pasig Greenpark Archery Camp.dc.html`.

## Constraints

- **Mirror rule:** every `index.html` edit mirrored byte-for-byte to `Pasig Greenpark Archery Camp.dc.html`; finish with `diff … && echo IDENTICAL`.
- **SuperConductor:** no JS expressions inside `{{ }}` — precompute per-archer chip/proof state (selected, proof value, proof-required, error border) in the data layer; straight ASCII quotes; per-item `<sc-for>` closures in the data layer (nested: per-archer block × per-discount chip).
- **Backend (GAS, ES5-ish):** `var`/`function`; the `db-v30` change needs a manual redeploy (edit the existing deployment). Reuse `eventsForSlot_`, `concLineOf_`, `archerListFor_`, and the per-archer amount handling already in `book_`/`bookMulti_`.
- **Back-compatibility:** both backend changes are additive — `lookup_`'s new `archers` array is extra; `reschedule_` without `body.archers` is unchanged. The frontend, until `db-v30` is live, would send `archers` that an old backend ignores (move-only) — so ship backend first.
- **Reuse, don't rebuild:** the booking flow's per-archer concession/proof UI + `archerConcessionPerSlot` + `buildConcession` + `concToSel_` already exist; this adapts them into the edit panel rather than inventing new concession UI.

## Sequencing

1. **Backend (`db-v30`)** — `lookup_` per-archer concessions + `reschedule_` per-archer write + version/SETUP. Ship first (additive/back-compatible). Its own plan; one redeploy.
2. **Frontend** — per-archer concession edit panel (seed from surfaced data, per-archer proof, recompute, remove party stepper, per-archer save). Its own plan; mirror; no redeploy.

Each plan produces working, testable software on its own.

## Verification

**Backend (`db-v30`, Node unit tests + live):**
- `lookup_` returns, for a 2-archer slot where the archers have different concessions, an `archers` array with each archer's own concession + proof.
- `reschedule_` with `body.archers:[{concession, amount}]` and an unchanged slot rewrites each event's `Concession:` + `Amount` in place, sends NO email when `notify:false`, and leaves the events at the same time.
- `reschedule_` with a changed slot moves the events AND rewrites concessions/amounts AND emails once.
- `reschedule_` without `body.archers` behaves exactly as before (move only).
- `?action=version` → `db-v30`, `perArcherEdit:true`, all prior flags.

**Frontend (Playwright over HTTP + Node unit checks, mirror IDENTICAL):**
- Opening edit on a 2-archer booking shows two concession blocks, each pre-selected from that archer's surfaced concession.
- A proof-required discount with empty proof blocks Save (inline error); filling proof allows it.
- Toggling an archer's discount updates the "New total" to the per-archer-correct figure.
- Saving a concession-only change sends `archers[]` + `notify:false` and updates the local entry; saving with a new slot sends `notify:true`.
- The party stepper is gone from the panel.
- 0 real console errors.

## Out of scope (later / not in this project)

- **Per-archer add-ons** editing in My Bookings (only concessions here).
- **Archer name/DOB** editing, and **archer-count** changes (the removed stepper) — persisting count changes would be a re-book-style backend path.
- The **admin** booking edit (this is the customer My-Bookings panel).
- Any redesign of the reschedule/date-time picker.
