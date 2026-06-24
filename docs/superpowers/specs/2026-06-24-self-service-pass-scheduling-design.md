# Self-service pass scheduling (sub-project B)

**Date:** 2026-06-24
**Problem:** A customer's passes show read-only in My Bookings ("X of N scheduled", "Coach: to
be assigned by our team"). Only the admin can schedule a pass's sessions. Customers can't book
the sessions they already paid for.

**Goal:** Let a customer schedule their own pass sessions from My Bookings — pick a date + an
available time, drawing down the pass's cap, reserving a real calendar slot — reusing existing
code. **Frontend-only; the backend stays db-v14.**

Mirror rule: every `index.html` edit is applied identically to
`Pasig Greenpark Archery Camp.dc.html` (byte-identical).

## Decisions (from brainstorming)
- **Coach:** the customer never picks a coach; the pass keeps "coach to be assigned by our
  team"; the admin assigns/confirms later (existing `assignPlanCoach` updates the events).
- **Add-only:** customers can schedule but NOT remove their own pass sessions (removal stays
  admin-only — the existing customer "Remove" button removes a *pass with no sessions*, unchanged).
- **Email:** send a confirmation email to the customer for each session they schedule (reuse
  the existing pass-schedule email).

## Why this is frontend-only (existing mechanics)
- `addPlanSession(email, ts, date, time, cap)` (~3649) already: enforces the cap
  (`cap != null && curCount >= cap` → no-op), appends `{date,time}` to `plan.sessions`,
  calls `syncPlanSessionToCalendar` which POSTs the existing `book` action (program
  "<pass> (plan)", party 1, amount 0), stores the returned `eventId`/`ref` on the session,
  and `pushPlan` persists the pass server-side (Script Properties) so it shows on any device
  and in admin. It also logs "Session scheduled".
- `loadSlots(dateStr)` (~2868) loads capacity-aware availability into `this.state.slots`
  (each slot has seats `left`), the same source the public booking uses.
- `emailPlanSchedule(email, ts, opts)` (~3107) emails the pass holder (backend
  `planScheduleEmail`). Reuse with `{ mode:'scheduled', sessions:[{date,time}] }`.
- `lookup_` skips `(plan)` events, so pass sessions show on the pass card (via `plan.sessions`),
  not as duplicate standalone bookings.

## Design (frontend)
### State
`acctSchedKey: ''` — identifies which pass's scheduler is open, as `email + '|' + ts`
(empty = none open). Reuse the existing `slotDate` / `slots` / `slotsLoading` / `onPickDate` /
`loadSlots` for the date+times (only one scheduler is open at a time).

### New method `addAcctPlanSession(email, ts, date, time, cap)`
```js
addAcctPlanSession(email, ts, date, time, cap) {
  if (!date || !time) return;
  const plan = this.findPlan(email, ts);
  const curCount = (plan && plan.sessions) ? plan.sessions.length : 0;
  if (cap != null && curCount >= cap) { this.setState({ acctSchedMsg: 'All sessions on this pass are scheduled.' }); return; }
  this.addPlanSession(email, ts, date, time, cap);                 // add + reserve calendar slot + cap + log
  this.emailPlanSchedule(email, ts, { mode: 'scheduled', sessions: [{ date: date, time: time }] }); // confirm to customer
  this.setState({ slotDate: '', slots: [], acctSchedMsg: 'Scheduled — a confirmation is on its way.' });
}
```
Add state `acctSchedMsg: ''`.

### Open/close handlers (avoid colliding with the "+ Book a session" acct form)
- `openAcctSched(key)`: `this.setState({ acctSchedKey: key, acctBookingOpen: false, slotDate: '', slots: [], acctSchedMsg: '' })`.
- `closeAcctSched()`: `this.setState({ acctSchedKey: '', slotDate: '', slots: [], acctSchedMsg: '' })`.
- In `addSession`/`openAcctBooking` (the "+ Book a session" flow), also set `acctSchedKey: ''` so the two pickers are mutually exclusive.

### Render — extend the `acctPlanRows` row builder (~4311)
Add to each row object (`p` is the pass, `cap = planCapFor(p.name)`):
- **Pass email resolution:** `const pEmail = (p.email || this.state.acctEmail || '').trim().toLowerCase();` — a pass may come from a merged email (with `p.email`) or from the logged-in account's own store (no per-item email → falls back to `acctEmail`). Use `pEmail` everywhere below (the calendar booking, `mutatePlan`, the confirmation email).
- `schedKey: pEmail + '|' + p.ts`
- `atCap: cap != null && sess.length >= cap`
- `canSchedule: !(cap != null && sess.length >= cap) && String(p.status||'').toLowerCase() !== 'cancelled'`
- `scheduling: this.state.acctSchedKey === <schedKey>`
- `openSched: () => this.openAcctSched(<schedKey>)`
- `addAt: (time) => this.addAcctPlanSession(<email>, p.ts, this.state.slotDate, time, cap)`
- `capFullLabel: 'All ' + cap + ' session' + (cap===1?'':'s') + ' scheduled — see you at the range.'` (used when `atCap`)

Build a single top-level `acctSchedTimes` binding (only one scheduler open at a time): from
`this.state.slots`, keep slots with `left > 0`, map to `{ time: s.time, leftLabel: …, add: () => this.addAcctPlanSession(<email of acctSchedKey>, <ts of acctSchedKey>, this.state.slotDate, s.time, <cap>) }`. Also expose `acctSchedDate: this.state.slotDate`, `acctSchedLoading: this.state.slotsLoading`, `acctSchedMsg`, `minDate`, `closeAcctSched`, and `acctSchedHasTimes`.

### Markup — in the pass card (~1664, inside the `acctPlanRows` `<sc-for>`)
- Replace/augment the current bottom row so that:
  - When `pl.canSchedule` and NOT `pl.scheduling`: a **"Schedule a session"** button → `pl.openSched`.
  - When `pl.scheduling`: a small panel — a `<input type=date value="{{ acctSchedDate }}" onInput="{{ onPickDate }}" min="{{ minDate }}">`, a "Checking availability…" line when `acctSchedLoading`, the available times (`<sc-for list="{{ acctSchedTimes }}">` → a tappable chip per `t.time` calling `t.add`), an `acctSchedMsg` line, and a "Done" button → `closeAcctSched`.
  - When `pl.atCap`: show `pl.capFullLabel` (no scheduler).
  - Keep the existing sessions chips + "Scheduled · contact us to change" line.
- Style to match the existing pass card (cream/green). The customer "Remove" pass button stays as-is.

## Out of scope
- Customer removing/rescheduling individual pass sessions (admin-only, unchanged).
- Coach selection by the customer; any backend change; admin Plans & Sessions flow.

## Risks / watch-items
- **Picker collision:** the account page already has the "+ Book a session" form using
  `slotDate`/`slots`. Opening a pass scheduler must close that form (and vice versa) — handled
  by the mutual-exclusion in the open handlers.
- **Cap enforcement** is in both `addAcctPlanSession` and `addPlanSession` — keep both so a
  double-tap can't exceed the cap.
- `<sc-if>` nesting balanced; index.html and the .dc.html mirror byte-identical.
- Unlimited/monthly passes (`cap === null`) → no cap limit; `canSchedule` stays true (always
  schedulable), `atCap` false. Acceptable.

## Verification
Playwright (backend stubbed: availability returns open times; `savePlan`/`book`/
`planScheduleEmail` accepted; seed a pass with cap 3 in `pgac_plans_<email>`):
- Pass shows "0 of 3 scheduled" + a "Schedule a session" button.
- Click it → pick a date → available times render → tap one → session appears on the card,
  counter → "1 of 3", `window.__f` recorded a `book` action and a `planScheduleEmail` action.
- Schedule up to 3 → the scheduler is replaced by the "all scheduled" message; a `book` past
  the cap does not fire.
- A cap-1 pass blocks a 2nd session.
- Opening the pass scheduler closes the "+ Book a session" form.
- Mirror parity IDENTICAL.
