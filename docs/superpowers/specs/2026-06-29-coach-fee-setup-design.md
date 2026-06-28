# Sub-project D — Coach fee setup (replace the % split)

**Date:** 2026-06-29
**Scope:** Frontend only (`index.html` + `.dc.html` mirror). No backend change, no `db-vNN` bump.
**Part of:** the post-redesign batch (A→B→C→D→E). This is D; E (coach payments dashboard) builds on it.

## Goal (from the owner's request)

Replace the current per-coach **Coach% / Equip% / Range%** split with explicit **peso fees per program
and per pass**: each program/pass defines a **Coach Fee**, **Range Fee**, **Equipment Fee**, plus its
**Total Price**. Example — Day Pass: Coach 400 + Range 200 + Equip 200, Total 900 (₱100 margin).
Little Archers: Coach 800 + Range 400, Total 1200 (₱0 margin).

## Confirmed decisions

- **Total Price is entered separately**; `margin = price − (coach+range+equip)` is the business share.
- Fees are **per archer per session**.
- **Discount absorption order:** business margin first, then range, then equip; **coach is always paid
  the full Coach Fee** (protected).
- Fees on **both programs (hourly) and passes (per session)**. Add-ons keep their coach/equip/range
  bucket tag on top. **Multiple coaches split the Coach Fee equally.**
- **Pass sessions recognized per delivered session** (their per-session fees count toward earnings AND
  coach pay). Unused/expired sessions stay ₱0 (sub-project B). Passes contribute ₱0 today.
- **Migration default:** programs/passes without explicit fees default to **80% coach / 10% equip /
  10% range** of price, so dashboard numbers don't jump until fees are set.
- **The per-coach % customization is removed** — every assigned coach earns the same program-defined
  Coach Fee (split equally if shared).

## Current behavior (baseline)

- `acctAllocate(items, todayStr)` (≈`index.html:2850`) is **frontend** and reads `state.allBookings`
  (from `listBookings_`, which already provides `baseAmount` + `addonBuckets` + `program` + `archers`).
- It splits each booking's `base` (= `baseAmount`, else `amount`) into coach/equip/range using each
  assigned coach's **percentage** split `coachSplits[id]` (default `splitDefault {80,10,10}`); add-ons
  go 100% to their bucket; base divides equally among coaches; 0 coaches → `coachUnassigned`.
- Pass/plan sessions book with `amount: 0` (`syncPlanSessionToCalendar`, ≈`index.html:4698`) and
  program `"<Pass name> (plan)"`, so they currently contribute **nothing** to the dashboard.
- The dashboard (`coachPayRows`, ≈`index.html:5551`) renders editable %/%/% inputs per coach
  (`setSplitField`/`saveCoachSplit` → backend `setSplit`). Fees/% live in Script Properties.

## Design

### 1. Data model

- `normalizePrograms` (≈`index.html:3810`) + `normalizePackages` gain `coachFee`, `rangeFee`,
  `equipFee` (numbers). When all three are unset, default from price: `coachFee=round(price×0.8)`,
  `equipFee=round(price×0.1)`, `rangeFee=round(price×0.1)`.
- Packages store `price` as a string (e.g. `'₱900'`); add a `parsePeso_(v)` helper (reuse
  `passPrice` semantics) for parsing. Pass fees are **per session**.
- Fees live in `CONTENT.programs` / `CONTENT.packages` and ride the existing `setContent` round-trip.

### 2. `feeFor(programString)` lookup

- Strip a trailing `" (plan)"`. Match a **package** by name first (passes), else a **program** by name.
- Return `{ coach, range, equip, price, isPass }` per archer per session, applying the 80/10/10 default
  when the matched item has no explicit fees. Unknown name → safe default off `programByName` price.

### 3. `acctAllocate` rewrite

For each booking `b` (skip cancelled):
- `fees = feeFor(b.program)`; `n = archers (seats)`; `ab = b.addonBuckets`.
- **Plan/pass session** (`/\(plan\)\s*$/` on program): allocate **full** per-session fees —
  `coachBase = n×fees.coach`, `equipBase = n×fees.equip`, `rangeBase = n×fees.range`. Earnings
  recognized = `coachBase+equipBase+rangeBase` (since the event amount is 0).
- **Regular booking:** `rem = baseAmount`; priority fill capped at pool:
  `coachBase = min(n×fees.coach, rem); rem −= ; equipBase = min(n×fees.equip, rem); rem −= ;
  rangeBase = min(n×fees.range, rem); rem −=;` remainder = margin (untracked). Earnings use `b.amount`.
- Coach portion (`coachBase` + `ab.coach`) splits **equally** among assigned coaches
  (`coachIdsFromNames`); 0 coaches → `coachUnassigned`. `equipTotal += equipBase + ab.equip`;
  `rangeTotal += rangeBase + ab.range`.
- `earnWeek/Month/Year/Total`: for regular bookings use `b.amount` (unchanged); for plan sessions
  add the recognized fee sum (so passes appear in earnings). Period bucketing by `b.date` as today.
- Remove all use of `splits`/`splitDef`/`coachSplits`.

### 4. Admin UI

- **Pricing → Programs editor:** add `Coach fee`, `Range fee`, `Equip fee` number inputs per program
  (`setProgNum(i,'coachFee')` etc.) + a computed **"Margin: ₱X"** label (`price − sum`, red if negative).
- **Pricing → Packages editor:** add the same three inputs per pass + a **per-session** margin hint
  (`parsePeso_(price)/sessions − sum`).
- **Dashboard:** remove the per-coach %/%/% inputs + Save button from `coachPayRows`; keep the
  computed `pay` display. Remove `setSplitField`/`saveCoachSplit`/`splitDraft` and the
  `coachSplits`/`splitDefault` reads (frontend). Leave the backend `setSplit` action in place (dead).

### 5. Deploy

Frontend-only: edit `index.html`, copy byte-for-byte to `Pasig Greenpark Archery Camp.dc.html`,
push `main`. No Apps Script redeploy.

## Implementation plans

1. **D1** — data model: `normalizePrograms`/`normalizePackages` fee defaults, `parsePeso_`, `feeFor`.
2. **D2** — admin editors: program + pass fee inputs + margin hints.
3. **D3** — `acctAllocate` rewrite (priority fill + plan-session fee recognition) + remove the
   %-split editor/state.
