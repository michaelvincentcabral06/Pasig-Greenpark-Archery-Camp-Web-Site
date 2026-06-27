# Accounting Correctness (#7 Phase 1) — Design

## Summary

The admin **Earnings** dashboard already exists (week/month/year/all-time totals, a coach/equipment/range "where the money goes" bar, a per-coach editable split, and an unassigned-share line) — but its money math is wrong. It attributes coach pay by reading `b.coach` (a coach **id**), while the bookings payload only carries `coachName` (the joined coach **names**), so `matchCoach` always returns null and **every coach's share lands in "unassigned."** This sub-project fixes the accounting so coach pay is attributed correctly, the coach share splits across the multiple coaches a booking can now have (#6), add-on revenue is allocated to the right bucket instead of inflating the coach share, and passes feed the same split. **Admin cleanup is explicitly deferred to a separate Phase 2.**

## Decisions locked during brainstorming

- **Scope = accounting correctness only.** Fix the money math (attribution, multi-coach split, add-on allocation, passes). The admin cleanup (latent `b.coach`-id reads in the calendar-day/account views, dead concession bindings, admin-edit-panel concession, `formError` copy) is a separate Phase 2, NOT this spec.
- **Multi-coach: split equally.** A booking's coach bucket divides evenly among its assigned coaches (2 coaches → 50% each, 3 → ⅓ each). Matches the #6 spec's "equally among assigned coaches."
- **Add-ons: per-add-on bucket tag.** Each add-on gets a "goes to" bucket (Coach / Equipment / Range). Add-on revenue goes 100% to its bucket; only the **base session fee** splits by the configured coach/equip/range %.
- **Passes: include & split like sessions,** attributed to the pass's single assigned coach (pass price spread across its sessions, as the existing plan logic already does).
- **Breakdown source = backend.** A backend change (`db-v29`) surfaces a per-booking/per-pass financial breakdown (`baseAmount` + `addonBuckets` + the coach list); the frontend only applies the split %. Chosen over fragile frontend re-derivation from add-on name strings.

## Section 1 — Model (how the money divides)

For each **session booking** and each **pass**, revenue divides into three buckets — **Coach / Equipment / Range**:

- **Base session fee** = the charged amount *after* concession + group discount, *minus* the booking's add-on pesos. This splits by the per-coach **coach % / equip % / range %** (the existing editor; the three must total 100%). The split percentages now apply to the **base fee only**, not the add-ons.
- **Add-ons** do not split: each add-on's pesos go **100% to its tagged bucket** (Coach / Equipment / Range).
- The **Coach bucket** of a booking divides **equally** among the booking's assigned coaches, resolved from `coachName` (the comma-joined names) to coach ids via the existing `coachIdsFromNames` helper (added in #6). A booking with **no resolvable coach** → its coach bucket accrues to the existing **"unassigned" share**, not to any coach.
- **Passes** feed the same split: a pass's price, spread evenly across its sessions (the existing `splitPlanAcrossSessions` / plan-earnings logic), is a base fee whose coach bucket is attributed to the **pass's single assigned coach**. Passes normally carry no add-ons (`addonBuckets` all zero).

Period totals (week/month/year/all-time) and booking-status counts are unchanged in definition — they continue to sum the full charged `amount`; only the **bucket attribution** changes.

## Section 2 — Backend (`db-v29`)

The bookings read path (`listBookings_`) and the pass/plan payload each emit, per item, a **financial breakdown** alongside the existing fields:

- `baseAmount` — the item's charged amount net of concession/discount, **minus** its add-on pesos (the session/pass fee that the split % applies to).
- `addonBuckets: { coach, equip, range }` — the item's add-on pesos already grouped by destination bucket. The backend reads each add-on's `bucket` from the stored program/add-on config (the content store the admin Pricing editor writes). Any add-on with no `bucket` tag defaults to **`equip`** (Equipment).
- `coachName` — unchanged (the comma-joined assigned-coach names); the frontend resolves it to ids.

Per-archer events (db-v27) already store each archer's own concession, add-ons, and amount, so the backend has the data to compute `baseAmount` and `addonBuckets` per `(ref, date, time)` slot. The breakdown is **additive and back-compatible**: a payload that lacks `baseAmount`/`addonBuckets` (older deploy, or an event missing the fields) makes the frontend fall back to the current whole-`amount` split, so nothing breaks mid-rollout.

Version bumps to `db-v29` with an `acctBreakdown: true` flag (all prior flags preserved) and a matching `SETUP.md` deploy & verify checklist. **One manual Apps Script redeploy** (edit the existing deployment).

## Section 3 — Frontend (Earnings dashboard + Pricing add-on editor)

- **Pricing → Programs add-on editor:** each add-on row gains a **"Goes to"** select with options Coach / Equipment / Range, defaulting to **Equipment**. The chosen bucket is persisted on the add-on in the program data model (so the backend can read it back) — mirroring how the existing add-on `scope` (perArcher / perBooking) is already edited and stored.
- **Earnings dashboard data layer:** replace the broken single-coach attribution (`matchCoach(b.coach)` → `coachPay`/`coachUnassigned`) with the breakdown-driven math from Section 1:
  - For each booking/pass: `base = item.baseAmount` (fallback: `amount` when the breakdown is absent). `coachBucket = base × coach% (+ addonBuckets.coach)`, `equipBucket = base × equip% + addonBuckets.equip`, `rangeBucket = base × range% + addonBuckets.range`.
  - `coachBucket` divides equally among `coachIdsFromNames(item.coachName)`; if none, it accrues to `coachUnassigned`.
  - Passes are merged into the same accumulation (over the plan/pass list), attributed to the pass's coach.
- The per-coach `Earned`, the coach/equip/range bar, the four period totals, and the unassigned-share line all become correct. **No UI redesign** — same cards/editor, corrected math plus the one new add-on field.

## Constraints

- **Mirror rule:** every `index.html` edit is mirrored byte-for-byte to `Pasig Greenpark Archery Camp.dc.html`; finish with `diff … && echo IDENTICAL`.
- **SuperConductor:** no JS expressions inside `{{ }}` — precompute the add-on "Goes to" select state and all dashboard labels in the data layer; straight ASCII quotes; per-item `<sc-for>` closures built in the data layer.
- **Backend (GAS, ES5-ish):** `var`/`function` only. The `db-v29` change needs a manual redeploy (edit the existing deployment). Code.gs is cumulative.
- **Back-compatibility:** the breakdown is additive; absent `baseAmount`/`addonBuckets` → frontend falls back to the whole-`amount` split. Existing add-ons without a `bucket` default to Equipment. The split-% editor and its totals-100% rule are unchanged.
- **Reuse, don't rebuild:** the coach/equip/range split editor, the earnings totals scaffold, `coachIdsFromNames` (#6), `programByName`/the add-on editor pattern, and `splitPlanAcrossSessions` already exist — this sub-project corrects their inputs, it does not redesign them.

## Sequencing

1. **Backend (`db-v29`)** — `listBookings_` + pass payload emit `baseAmount` + `addonBuckets`; read add-on buckets from the content store; version flag + SETUP. Ship first (back-compatible, so the frontend degrades gracefully until it is live). Its own plan; one redeploy.
2. **Frontend** — the Pricing add-on "Goes to" tag + the dashboard accounting math. Its own plan; mirror; no redeploy. Until `db-v29` is live, the dashboard falls back to the whole-`amount` split (but with corrected `coachName`-based attribution, which is already an improvement).

Each plan produces working, testable software on its own.

## Verification

**Backend (`db-v29`, Node unit tests + live):**
- `listBookings_` emits `baseAmount` = amount − add-on pesos and `addonBuckets` summing to the add-on total, with each add-on routed to its configured bucket (untagged → equip).
- A booking with a coach + an equipment add-on: `baseAmount` excludes the add-on; `addonBuckets.equip` equals the add-on pesos.
- `?action=version` → `db-v29`, `acctBreakdown: true`, all prior flags.

**Frontend (Node unit tests of the pure accounting reducer + Playwright over HTTP, mirror IDENTICAL):**
- A 1-coach booking attributes its full coach bucket to that coach (not "unassigned").
- A 2-coach booking splits its coach bucket 50/50 between the two coaches.
- An add-on tagged Equipment adds to the equipment bucket and is absent from any coach's pay.
- A pass attributes its coach bucket to the pass's coach and adds to the period totals.
- A booking with no coach accrues to the unassigned share.
- The Pricing add-on editor shows the "Goes to" select, defaults to Equipment, and persists the choice.
- 0 real console errors.

## Out of scope (Phase 2 / later)

- **Admin cleanup:** the latent `b.coach`-id reads in the calendar-day view (~`index.html:5222`) and account view (~`5303`); dead `discountRows`/`eligPerArcher`/`toggleElig_` concession bindings; the admin edit-booking panel's booking-level concession; the stale `formError` proof copy.
- **Per-archer → coach mapping** (the coach list stays a flat booking-level list).
- **Tax / external bookkeeping export**, payroll runs, or a transaction-level ledger view — this sub-project corrects the existing dashboard's attribution, it does not add a new ledger surface.
- **Coach-side payout notifications / coach-portal earnings views.**
