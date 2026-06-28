# Sub-project E — Coach payments dashboard

**Date:** 2026-06-29
**Scope:** Frontend (`index.html` + `.dc.html` mirror) + backend (`backend/Code.gs`, new `db-v33`).
**Part of:** the post-redesign batch (A→B→C→D→E). This is E; builds on D's fee model.

## Goal (from the owner's request)

- Coach payments: **weekly / monthly / yearly** filters.
- **Group coach payments by plan and session.**
- A **Paid / Not-Paid** button per booked session/plan.
- **Not-Paid → not counted as earnings.**
- Dashboard shows the **exact amount owed by the client** (not approximations).

## Confirmed decisions

- **Paid/Not-Paid tracks CLIENT payment** of a session. Default = **Paid** (existing bookings stay
  counted; admin marks exceptions Not-Paid).
- A Not-Paid session contributes **nothing** — excluded from earnings AND coach pay — and its client
  amount adds to **amount owed by client**.
- Layout: **per-coach rows, expandable to plan/session lines**, each line with its Paid/Not-Paid button.
- The period filter (week/month/year/all) **scopes the Coach Payments section only**; the top Earnings
  cards keep showing all periods.
- Paid/Not-Paid is **per session** (each slot-group / each plan session), not one toggle per pass.

## Current baseline

- No "paid" concept exists; booking status is only booked/approved/cancelled.
- `acctAllocate(items, todayStr)` (frontend, post-D) allocates each booking via `feeFor(program)`:
  regular bookings priority-fill the paid base (coach→equip→range→margin); plan sessions (amount 0)
  recognize per-session fees. `coachPay[id]` accumulates per coach.
- The dashboard renders Earnings period cards, a "where the money goes" split, and a flat per-coach
  pay list (`coachPayRows`, just name + total).
- `setBookingStatus_` marks all rows of a slot-group (by eventId, or ref+date+time). The Paid flag
  follows the same slot-group keying but stores in Script Properties (no sheet-column migration).

## Design

### Backend (`db-v33`, flag `clientPaid`)

- **`setPaid_(body)`** `{ ref, date, time, paid }` (admin-gated): if `paid === false` set Script
  Property `unpaid:<ref>|<date>|<time>` = `'1'`; else delete it. Stores only Not-Paid **exceptions**
  (absence = paid), keyed by slot-group so it covers all per-archer rows at once.
- **`listBookings_`**: read all `unpaid:*` properties once; for each group set
  `paid: !unpaid[ref + '|' + date + '|' + time]` (default **true**).
- Dispatch: `if (body.action === 'setPaid') return assertAdmin_(body) ? setPaid_(body) : unauthorized_();`
- Version → `db-v33`, add flag `clientPaid:true`; append a `SETUP.md` db-v33 section (standard redeploy,
  no trigger).

### Frontend

**`acctAllocate`** — paid-aware:
- Add an `owedTotal` accumulator. A booking with `b.paid === false`:
  - is **excluded** from `earnWeek/Month/Year/Total`, `coachPay`, `coachTotal/equipTotal/rangeTotal`,
    `coachUnassigned`;
  - adds its client value to `owedTotal` — `b.amount` for regular bookings, or the recognized
    per-session fee sum for plan sessions (amount 0).
- Default (`b.paid !== false`) allocates exactly as post-D. Return `owedTotal` in the result.

**Dashboard summary:** add an **"Owed by clients"** card showing `owedTotal` (exact).

**Coach Payments section** (replaces the flat list):
- Period toggle `coachPayPeriod` ∈ `week|month|year|all` (buttons), filtering by session date using the
  same week/month/year bounds as `acctAllocate`.
- New reducer **`coachPayBreakdown(items, period)`** → for each known coach: `{ id, name, total, lines }`
  where each line is a **paid** session/plan the coach is on: `{ ref, date, time, label (program/plan +
  client), amount (this coach's share of the coach fee), paid }`. Also a `lines`-level set for the
  **Paid/Not-Paid toggle** which lists ALL sessions in the period (paid + unpaid) so unpaid ones can be
  flipped back. (Unpaid lines show in the breakdown greyed with their would-be amount, but don't add to
  `total`.)
- UI: period toggle at top; each coach row shows period total, expandable (`expandedCoach` state) to its
  lines; each line has a **Paid / Not-Paid** button → `setPaidFor(b, paid)` posts `setPaid` then
  `loadAllBookings()`. Plan sessions appear as individual lines under their plan name.

**`setPaidFor(b, paid)`**: `adminPost({action:'setPaid', ref, date, time, paid}).then(loadAllBookings)`.

### Deploy

- Frontend: edit `index.html`, mirror to `Pasig Greenpark Archery Camp.dc.html`, push `main`.
- Backend: paste `Code.gs`, edit-existing redeploy; confirm `?action=version` → `db-v33` + `clientPaid`.

## Implementation plans

1. **E1 — backend (`db-v33`)**: `setPaid_` + dispatch + `listBookings_` `paid` emit + version + SETUP.
2. **E2 — frontend**: `acctAllocate` paid/owed awareness; "Owed by clients" card; `coachPayBreakdown` +
   period toggle + expandable per-coach lines + Paid/Not-Paid toggle wiring (`setPaidFor`).
