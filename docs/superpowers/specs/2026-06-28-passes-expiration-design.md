# Sub-project B — Passes/Memberships expiration

**Date:** 2026-06-28
**Scope:** Frontend (`index.html` + `.dc.html` mirror) + backend (`backend/Code.gs`, new `db-v31`).
**Part of:** the post-redesign batch (A→B→C→D→E). This is B.

## Goals (from the owner's request)

1. Do not allow bookers to **edit or remove** expired passes/memberships.
2. When a session **expires unused**, send an **email notification** to the user.
3. Expired sessions should be **accounted as ₱0 value**.

## #1 — Block edit/remove of expired passes (frontend only)

Current state:
- **Per-session reschedule/cancel is already blocked.** `sessionEditableByCustomer(date,time,plan)`
  returns false when `isPlanExpired(plan)`, so each session row renders locked
  ("Pass expired · contact us to change"). The action handlers
  (`cancelAcctPlanSession`, `startPassSessionReschedule`) also guard on it.
- **Scheduling new sessions is already blocked** — `canSchedule` excludes expired.
- **The remaining gap is the whole-pass "Remove" button** (`index.html:1761`), gated only on
  `canRemove: sess.length === 0`. An expired pass with no scheduled sessions is still removable.

Changes:
- In `acctPlanRows` (≈`index.html:5469`): `canRemove: sess.length === 0 && !expired`.
- Guard `removeAcctPlan(ts)` (≈`index.html:4404`): if the plan is expired, show a brief message
  ("This pass has expired and can no longer be changed online — please contact us.") and return
  before doing any work.

Result: an expired pass stays visible in My Bookings (its `expiredNote` already renders) but the
customer cannot remove or edit it. Admin paths (`adminCancelPlan`, `removePlan` with `by:'admin'`)
are unaffected. **Frontend-only** — no backend reject is added for #1 (the button is the only path).

## #3 — Expired sessions = ₱0 value

This rule **already holds by construction** and needs no accounting math. Only *scheduled* pass
sessions become calendar events / bookings, and `acctAllocate` (≈`index.html:2850`) consumes only
those. Unscheduled / forfeited capacity never becomes an event, so it never enters earnings or
"owed" — it is already ₱0. (Owner chose "keep ₱0, make it explicit", not upfront revenue
recognition.)

Change: add a documenting comment at `acctAllocate` recording the invariant ("forfeited/unused
expired pass sessions are never bookings, so they contribute ₱0 by construction"). The expiry email
(below) words unused sessions as forfeited / ₱0. **No revenue-recognition change.**

## #2 — Email when a pass expires unused (backend — new `db-v31`)

Passes are stored as the full plan JSON under `plan:<email>:<ts>` (Script Properties), carrying
`cap`, `validDays`/`expiry`, `sessions[]`, `holder`, `status`, `ref`, `name`, `ts`. A daily scan has
everything it needs; results dedupe via a new `expiryNotified` flag written back to the property.

New backend code in `Code.gs`:

- **`notifyExpiredPasses_()`** — run by a **daily time-driven trigger** (installed once). It:
  1. Iterates all `plan:*` Script Properties.
  2. Skips cancelled passes (`status==='cancelled'`) and legacy passes (no `validDays` →
     no expiry → never fires) and already-notified passes (`expiryNotified` truthy).
  3. Computes `expiry` = stored `plan.expiry`, else `addDays(tsToDate(plan.ts), validDays)`,
     in `TIMEZONE` (Manila). Reuses/adds small date helpers as needed.
  4. If `today > expiry` AND `unused = max(0, cap − (sessions||[]).length) > 0`:
     send **one** email to the holder (via `sendPassExpiry_`) noting the unused count, worded as
     forfeited / ₱0 value, with a gentle "contact us" line; then set `plan.expiryNotified = true`
     (and `expiryNotifiedAt`) and write the plan JSON back with `setProperty`.
- **`sendPassExpiry_(o)`** — email helper modeled on `sendPlanReceipt_` / `sendPlanCancellation_`
  (same plaintext + HTML receipt-card style). Fields: holder, plan name, ref, unused count, expiry
  date.

Versioning:
- Bump `version` to `db-v31`, add flag `passExpiryEmail:true` to the `?action=version` response.
- Append a `SETUP.md` section for `db-v31` covering the usual redeploy **plus the one-time trigger
  install** (Apps Script → Triggers → Add Trigger → function `notifyExpiredPasses_`, event source
  Time-driven, Day timer). The trigger install is the only manual step beyond the redeploy.

## Deploy

- Frontend (#1 + #3 comment): edit `index.html`, copy byte-for-byte over
  `Pasig Greenpark Archery Camp.dc.html`, push `main` (Pages rebuilds ~15s).
- Backend (#2): paste `Code.gs` into Apps Script → Save → Deploy → Manage deployments → edit the
  existing deployment → New version → Deploy; confirm `?action=version` shows `db-v31`; then install
  the daily trigger once.
