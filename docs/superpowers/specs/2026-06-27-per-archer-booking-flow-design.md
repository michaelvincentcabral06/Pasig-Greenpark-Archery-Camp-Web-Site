# Per-Archer Booking Flow (#4 + #3) — Design

## Summary

Rebuild the customer booking into a **reordered, progressive single-page flow** centered on the individual archer, and fold in **per-archer concessions** and an **admin-configurable group discount** (#3). The booker enters their details, then each archer's name + birthday, then picks one age-appropriate program, then dates, then per-archer concessions + add-ons, then confirms. Each archer carries their own concessions and add-ons, which ride on that archer's calendar event (the per-archer events from #5).

**Mostly frontend** (`index.html`, mirrored), with **one backend change** (`db-v27`) so each archer's event stores that archer's own concession/add-ons/amount instead of the booking-level even-split.

## Decisions locked during brainstorming

- **Fold #3 into #4** — per-archer concessions + the admin group-discount config are designed together with the flow, since both attach to the per-archer step.
- **One program per booking, fits-all-archers** — the program list shows only programs whose age range fits *every* archer (no-age-limit programs always show); the whole booking is one program.
- **Progressive single page** — one scrolling page; each section unlocks when the prior is valid (not a step-by-step wizard).
- **Per-archer extras come after program + dates** — concessions and per-archer add-ons both depend on the chosen program, so they live in a per-archer section *after* the program is selected, not in "Who's shooting."
- **Add-ons are billed per session** (× slots), consistent with the base rate and concessions.
- **Group discount config is frontend-only** (changes the computed `amount`, which the backend trusts); per-archer event wiring is the only backend change.

## Section 1 — The reordered flow

Progressive single-page reveal, six sections top-to-bottom; each unlocks once the prior is valid (later sections dimmed/disabled until then). Keeps the existing single SuperConductor form structure (and its desktop/mobile dual copy); reorders the sections and adds per-section "unlock when complete" gating. The program-first ordering of today is inverted to **archers-first**.

1. **Your details** — Name\*, Mobile\*, Email\* (the first gate).
2. **Who's shooting** — a "how many archers" stepper (the existing `party` control, moved here), then one row per archer: **Name + Birthday**. Archer 1 has a **"Same as booker"** checkbox that prefills its *name* from the booker (birthday still entered — each archer's age is required). Valid when every archer has a name + a parseable DOB.
3. **Choose a program** — the program list, **filtered to programs whose `[minAge,maxAge]` fits every archer's age** (programs with no age limit always show). Computed from each archer's DOB on the chosen dates.
4. **Pick your dates** — the existing multi-day date + per-day time picker (unchanged; all programs are multi-day since #2).
5. **Per-archer extras + add-ons** — Section 2.
6. **Summary / estimated total → Confirm** — the running quote + confirm button.

## Section 2 — Per-archer extras + pricing

**Section 5 of the flow** (after program + dates are known). Lists each archer by name; for each:
- **Concessions** — the admin-defined discount list (shown only if the chosen program `offerDiscounts`). Each archer ticks the discounts that apply to *them* and enters **their own proof** for any proof-required discount. (Per-archer: archer 1 = PAC only; archer 2 = Pasig + RHS + PAC.)
- **Per-archer add-ons** — the program's `perArcher`-scoped add-ons; each archer ticks the ones they want.

Then once for the whole booking:
- **Per-booking add-ons** — the program's `perBooking`-scoped add-ons.

If the program offers no discounts and has no add-ons, this section collapses to nothing.

**Pricing — the estimated total** (everything billed per time-slot):
- **Base:** `rate × archers × slots`
- **− Group discount:** the configurable tier % (Section 3), applied only if the program is in the group-discount list, on the base.
- **− Concessions:** for each archer, `Σ(their ticked concession amounts) × that archer's slots`.
- **+ Per-archer add-ons:** for each archer, `Σ(their ticked per-archer add-on prices) × their slots`.
- **+ Per-booking add-ons:** `Σ(ticked per-booking add-on prices) × slots`.

`amount = base − groupDiscount − concessions + perArcherAddons + perBookingAddons`, never below 0. The frontend computes this and the per-archer share (each archer's `rate×slots − their concessions + their add-ons − their share of group discount`); the per-archer shares + per-booking add-ons sum to the booking total.

## Section 3 — Admin group-discount config (#3's other half)

Today the group discount is hardcoded (2→10%, 3–4→20%, 5–6→30%) on all programs. This makes the rate and which-programs admin-editable; **frontend-only** (changes `amount`, backend trusts it; config lives in the content store like `programs`/`discounts`/`addons`).

**Data model (content):**
- **`groupTiers`** — admin-editable **min-threshold tiers** `[{ minParty, pct }]`, seeded `[{2,10},{3,20},{5,30}]`. The % for a party = the `pct` of the highest tier whose `minParty ≤ party` (reproduces today exactly: 1→0, 2→10, 3–4→20, 5+→30; no fixed max). Added to `mergedContent` defaults; a `normalizeGroupTiers()` coerces (`minParty`/`pct`→Number, sorted by `minParty`).
- **Per-program `groupDiscount` toggle** — a new boolean on each program (default **on**, so launch behavior is unchanged), normalized in `normalizePrograms`.

**Admin editors (Pricing tab):**
- In the **Programs editor**: a **"Group discount"** toggle button per program (next to "Needs a coach"/"Discounts"), via `toggleProg(i,'groupDiscount')`.
- A new **"Group discount tiers"** editor: rows of **Min archers · % off** with add/remove/edit (mirrors the discounts/add-ons editor pattern; handlers `setTierNum`/`addTier`/`removeTier` → `saveCM({ groupTiers })`).

**Frontend pricing change:**
- `discountFor(party, program)` becomes `programByName(program).groupDiscount ? tierPctFor(party) : 0`, where `tierPctFor` reads the configurable `groupTiers`. Used in the Section-2 math and in `priceFor`/`editAmount`.

## Section 4 — Backend wiring (`db-v27`)

Today's per-archer events (`db-v25/26`) all carry the booking-level concession (`concLine_(body)`) and an even-split amount. For real per-archer data, each archer's event must carry that archer's own concession/add-ons/amount.

**Request shape (frontend → backend):**
```
archers: [ { name, dob, concession:{items:[{id,name,amount,proof}],total}|null, addons:[{id,name,price}], amount } ]
perBookingAddons: [ { id, name, price } ]
total
```

**`Code.gs` changes:**
- **`bookMulti_`/`book_`:** create each archer's event from `archers[i]` — write that archer's `Amount`, a `Concession:` line from `archers[i].concession`, and an `Add-ons:` line from `archers[i].addons`. Per-booking add-ons are recorded **once** (a booking-level `Booking add-ons:` field on the first archer's event + sheet row). **Back-compat fallback:** if an archer lacks per-archer fields (older client), use the `db-v25` behavior (even-split `splitAmount_`, booking-level `concLine_`), so nothing breaks mid-rollout.
- **`concLine_`/`concSummary_`:** accept a concession object passed per-archer (not only `body.concession`) — generalize to format any `{items}` concession (already generic since the editable-discounts work).
- **`sendReceipt_`:** the receipt email summarizes each archer's concessions + add-ons and the per-booking add-ons, with the total.
- **Read paths (`lookup_`/`listBookings_`):** amount aggregation already correct (sum per-event `Amount` → per-archer shares sum to total). Concession display stays a **combined summary** (the distinct concessions across the booking) for now; the full per-archer breakdown in admin is **deferred to #6**, where per-archer detail is consumed.
- **Version:** bump to `db-v27` + `perArcherExtras: true` flag; add a SETUP checklist.

## Data model summary

- **Content additions:** `groupTiers: [{minParty,pct}]` (top-level); per-program `groupDiscount: bool` (already-existing program objects gain it via normalize default `true`). Reuses `programs[].addons` (#2) and `discounts` (Phase 2).
- **Frontend booking request:** `archers[]` enriched with per-archer `concession`/`addons`/`amount`; new `perBookingAddons`/`total`.
- **Calendar event (per archer):** carries `Archers: 1`, the archer name, that archer's `Amount`, `Concession:`, `Add-ons:`; the first event also carries `Booking add-ons:`.

## Constraints

- **Mirror rule:** every `index.html` edit mirrored to `Pasig Greenpark Archery Camp.dc.html`; finish with `diff … && echo IDENTICAL`.
- **SuperConductor:** no JS expressions inside `{{ }}` (precompute in the data layer); straight ASCII quotes; per-item `<sc-for>` closures built in the data layer.
- **Backend:** Section 4 needs a manual **`db-v27` redeploy** (edit the existing deployment — never "New deployment"). Sections 1–3 are frontend-only (no redeploy).
- **Backward compatibility:** the backend accepts both the enriched `archers[]` shape and the current shape (falls back to even-split + booking concession). Legacy bookings (pre-#5 single-events, and `db-v25/26` per-archer events) keep displaying/cancelling/rescheduling. Existing CONTENT without `groupTiers` → seeded default; programs without `groupDiscount` → default `true`.
- **Preserve pricing on launch:** with the seeded tiers + all programs `groupDiscount:true`, the group discount is identical to today; concessions/add-ons math matches the locked #2 rules.

## Sequencing

1. **Frontend** (Sections 1–3): reordered progressive flow, archers-first + age-filter, per-archer concessions + add-ons selection, admin group-discount config, add-ons-per-session pricing. Frontend-only; works against `db-v26` immediately (the *total* is correct; the old backend just even-splits internally). Likely **two plans** — (a) the flow rebuild + per-archer selection, (b) the admin group-discount config — given the size.
2. **Backend** (Section 4): `db-v27` so each archer's event stores their own concession/add-ons/amount. Its own plan; verified live.

Each plan produces working, testable software on its own.

## Verification

**Frontend (Playwright over local HTTP, mirror IDENTICAL):**
- Progressive gating: later sections locked until prior valid; "Same as booker" prefills archer-1 name.
- Age filter: archers 7+9 → Little Archers (6–10) appears; archers 8+30 → only no-age-limit programs; the program list updates from archer DOBs.
- Per-archer extras: each archer picks distinct concessions (+proof) and per-archer add-ons; per-booking add-ons chosen once; the estimated total matches the Section-2 formula (incl. per-session add-on multiplication and per-program group-discount on/off).
- Admin: group-discount tiers editor add/remove/edit persists; per-program "Group discount" toggle persists; turning it off for a program zeroes its group discount in the estimate.

**Backend (`db-v27`, live, scratch date, `noEmail` + cleanup):**
- Book a 2-archer session with **different** concessions per archer → each archer's calendar event carries that archer's own `Concession:`/`Add-ons:`/`Amount:`; the amounts sum to the booking total; one email/ref.
- Per-booking add-on recorded once (not duplicated per archer).
- `?action=version` → `db-v27`, `perArcherExtras:true`, all prior flags.
- Back-compat: a booking sent in the current (non-enriched) shape still books (even-split fallback).

## Out of scope (later sub-projects)

- **#6** — admin coach assignment by archer count + the full per-archer breakdown display in admin Sessions.
- **#7** — accounting/ledger (per-archer amounts, add-on allocation, coach-fee split) + admin cleanup.
- Per-archer *different programs* in one booking (rejected: one program per booking).
- A step-by-step wizard (rejected: progressive single page).
