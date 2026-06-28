# Sub-project C — Per-Hour / Per-Day / Per-Unit add-ons & concessions

**Date:** 2026-06-28
**Scope:** Frontend (`index.html` + `.dc.html` mirror) + backend (`backend/Code.gs`, new `db-v32`).
**Part of:** the post-redesign batch (A→B→C→D→E). This is C.

## Goal (from the owner's request)

Let admin classify each add-on **and** each concession discount as **Per Hour**, **Per Day**, or
**Per Unit/Pcs**. For Per-Unit items the booker enters a quantity. Charges scale accordingly:

- Booking example: Tue Jun 30 5PM; Wed Jul 1 5PM & 6PM → **2 days, 3 hours**.
- Per Day = price × 2; Per Hour = price × 3; Per Unit = price × (booker quantity).
- Concession discounts follow the same logic.

## Confirmed decisions

- **Base session rate stays per-hour** (× number of time-slots). Only add-ons/concessions classified.
- **Hour** = each booked (date,time) slot. **Day** = distinct calendar date in the booking.
- **Per-Unit is flat** (× quantity only — not also × days/hours).
- **Existing add-ons/concessions default to Per Hour** → today's totals are preserved exactly.
- **Per-Unit quantity granularity follows scope**: per-archer item → per-archer qty; per-booking
  add-on → one qty for the booking. Concessions are per-archer → per-archer qty.
- **Classification applies to both add-ons and concessions.**
- **Per-unit qty defaults to 1**; the qty input only appears once the item is checked.
- **Include the pre-existing per-booking add-on undercount fix** (see §5).

## Current behavior (baseline)

- `priceFor(program, party, sessions)` multiplies base, concessions, and add-ons all by `sessions`
  (= slot count = hours). So every item is implicitly **per-hour** today.
- Per-archer line items: `addons:[{id,name,price}]`, `concession:{items:[{id,name,amount,proof}],total}`,
  `amount` = `(round(rate×(1−pct)) − concPerSlot + addonPerSlot) × slots`.
- Backend `bookMulti_`/`book_`: split each archer's `amount` evenly across their slots
  (`splitAmount_`); write the per-archer add-on line `Name (₱price)` on **every** slot event;
  write the per-booking add-on line `Name (₱price ×slots)` **once** on the first event.
- **Pre-existing bug:** per-archer `amount`s sum to `total − perBookingAddons`, so per-booking add-on
  pesos are recorded in the description (and counted into `addonBuckets`) but are NOT in any event
  `Amount`. Earnings (`earnTotal = Σ amount`) therefore *undercount* per-booking add-ons, and the
  first slot's `baseAmount = max(0, amount − addonTotal)` clamps lower than it should.
- Accounting read path: `addonBreakdown_(desc,...)` parses `Name (₱price[ ×n])` → peso totals by
  bucket; `listBookings_` sums per slot-group `(ref,date,time)` and sets
  `baseAmount = max(0, amount − addonTotal)` (clamp is per slot-group).

## Design

### 1. Data model

- **Add-on** `{ id, name, price, scope:'perArcher'|'perBooking', bucket:'coach'|'equip'|'range',
  rateType:'perHour'|'perDay'|'perUnit' }`. `normalizeAddons` defaults `rateType` to `'perHour'`
  and sanitizes to the three allowed values.
- **Discount** `{ id, name, amount, proofRequired, proofLabel, rateType:'perHour'|'perDay'|'perUnit' }`.
  `defaultDiscounts` + a normalize step default `rateType` to `'perHour'`.

### 2. Admin editors (Pricing tab)

- Add-on editor: third cycle-chip **"Rate: Per hour / Per day / Per unit"** beside the existing
  scope + bucket chips (`toggleAddonScope`/`toggleAddonBucket` siblings; add `toggleAddonRate`).
- Discount editor: same Rate cycle-chip per concession.

### 3. Booker UI (booking flow)

- New state: `archers[i].addonQty{}`, `archers[i].concQty{}`, `perBookingAddonQty{}` (numbers ≥ 1).
- For any **checked** item with `rateType === 'perUnit'`, render a small number input (min 1,
  default 1) next to it. Setters clamp to integers ≥ 1. Non-perUnit items show no qty input.

### 4. Calculation refactor

Derive counts from the current selection:
- `bookingDayHourCounts()` → `{ hours, days }`. Single-date path: `hours = slotTimes.length`,
  `days = 1`. Multi-date path: `hours = Σ multiTimes[d].length`, `days = #dates with ≥1 time`.
- `mult(rateType, qty) = rateType==='perDay' ? days : rateType==='perUnit' ? qty : hours`.

Replace per-slot helpers with totals:
- `archerConcessionTotal(a, hours, days)` = `Σ_selected discount.amount × mult(d.rateType, concQty)`
  (only when program `offerDiscounts`).
- `archerAddonTotal(a, hours, days)` = `Σ_selected perArcher addon.price × mult(rateType, addonQty)`.
- `perBookingAddonTotal(hours, days)` = `Σ_selected perBooking addon.price × mult(rateType, qty)`.
- per archer: `base = round(rate×(1−groupPct)) × hours`;
  `archerTotal = max(0, base − archerConcessionTotal + archerAddonTotal)`.
- `priceFor(...)` / live price display: `Σ archerTotal + perBookingAddonTotal`.

Line items sent to backend now carry per-item `qty` and `rateType`:
- `addons:[{id,name,price,qty,rateType}]` (per archer); `perBookingAddons:[{id,name,price,qty,rateType}]`.
- `concession.items:[{id,name,amount,proof,qty,rateType}]` (qty/rateType for display + edit recompute).
- `amount` per archer = `archerTotal`; booking `total`/`amount` = booking total (incl. per-booking).

### 5. Backend (`db-v32`) — distribution + line multipliers

`addonLine_(addons)`: write `Name (₱price ×qty)` when `qty>1`, else `Name (₱price)`; accepts `qty`
per add-on (default 1).

`bookMulti_` / `book_` per-archer write loop:
- `addonPortion = Σ (price × qty)` over the archer's add-ons; `basePortion = archerAmount − addonPortion`.
- Split **basePortion** evenly across the archer's slots (`splitAmount_(basePortion, slots)`); the
  archer's **first** slot event `Amount = baseShare + addonPortion`, others `Amount = baseShare`.
- Write the per-archer add-on line **once** on the archer's first slot event (not every slot).
- Per-booking add-ons: write the line once on the booking's first event as `Name (₱price ×qty)` AND
  **add `Σ price×qty` to that event's `Amount`** (the undercount fix).
- Net invariants: every slot's `Amount ≥ Σ its add-on lines` (no `baseAmount` clamp loss);
  `Σ event Amounts = booking total` exactly; `addonBreakdown_` sums to the true add-on charge.

Read path (`addonBreakdown_`, `listBookings_`) is **unchanged** and back-compatible: it already
parses `(₱price ×n)`, and legacy events (no `×`, line repeated per slot) still sum correctly.

Version: bump `version` to `db-v32`, add flag `addonRateTypes:true`; append a `SETUP.md` db-v32
section (standard redeploy; no trigger).

### 6. My Bookings edit panel

`editAmount` (per-archer concession recompute on the edit panel) becomes rate-type/qty aware: it
must recompute the archer amount using `mult(rateType, qty)` for each concession and the edited
slot's hours/days. `reschedule_` already rewrites per-archer `Amount` + `Concession`; the edit
panel sends `archers:[{concession,amount}]` with the recomputed amount. (Concession items already
carry `rateType`/`qty` from §4, so the panel has what it needs.)

### 7. Deploy

- Frontend: edit `index.html`, mirror byte-for-byte to `Pasig Greenpark Archery Camp.dc.html`,
  push `main`.
- Backend: paste `Code.gs` → Save → Deploy → Manage deployments → edit existing → New version →
  Deploy; confirm `?action=version` shows `db-v32` + `addonRateTypes:true`.

## Implementation plans (split for reviewability)

1. **C1 — data model + admin editors**: `normalizeAddons`/discount normalize + `defaultDiscounts`
   gain `rateType`; Rate cycle-chip in both Pricing editors.
2. **C2 — booking calc + per-unit qty UI**: `bookingDayHourCounts`, `mult`, the three total helpers,
   `priceFor`, qty state + inputs, line items carry `qty`/`rateType`.
3. **C3 — backend distribution + line multipliers (`db-v32`)**: `addonLine_` qty, per-archer
   base/addon split, per-booking amount inclusion (undercount fix), version + SETUP.
4. **C4 — edit-panel recompute consistency**: `editAmount` rate-type/qty aware.

Each plan is frontend-only except C3 (backend). C2 depends on C1; C3 consumes C2's line-item shape;
C4 depends on C1/C2.
