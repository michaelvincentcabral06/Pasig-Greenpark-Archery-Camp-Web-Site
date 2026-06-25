# Session edit/cancel permissions + pass-session self-service (sub-project J)

**Date:** 2026-06-25
**Goal:** Customers may edit/cancel/reschedule a session **only while it is upcoming on a
non-expired pass**. Once a session is **used (past)** or its **pass is expired**, only the
**admin** can change it. Add per-session **Reschedule/Cancel** to the pass card for upcoming
sessions (locked for used/expired).

## Problem today
- My Bookings standalone cards already split Upcoming (editable) vs Past (display-only), but the
  rule is **only enforced by hiding buttons** — the action handlers (`cancelAcctBooking`,
  `startEdit`, `saveEdit`) don't re-check, so an edge (odd timezone, a stale card) can still
  cancel/edit a used session.
- The "past" check has two weaknesses: the render-local `sessionIsPast` (index.html ~4537) uses
  `acctNowMin` = **device** local time (`new Date().getHours()`), not Manila; and `isPastSlot`
  (~3009) only flags past **times today** (returns `false` for any past **date**). Neither is a
  reliable "is this session used" test on its own.
- **Pass/membership sessions** can't be self-managed at all (read-only chips). The owner wants
  customers to manage their own **upcoming** pass sessions, with used/expired locked to admin.

## Decisions (from brainstorming)
- One rule, defined once; enforced in **two layers** (UI hides controls; handlers re-check and
  refuse) so it can't slip.
- **Standalone booking:** editable iff **not used (past)**.
- **Pass session:** editable iff **not used AND the pass is not expired**.
- **Admin is never restricted** (admin cancel/edit/remove paths unchanged).
- **Pass card gains per-session Reschedule + Cancel** for eligible sessions; Cancel frees the
  session back to the pass (re-bookable within cap/validity); used/expired show a "contact us"
  lock note.
- Reuse existing machinery: the pass slot-picker (`openAcctSched`) + the `reschedule` calendar
  action + the `cancel` action. **No backend change, no deploy** (frontend-only).

## Constraints
- Mirror rule: every `index.html` edit applied identically to
  `Pasig Greenpark Archery Camp.dc.html` (byte-identical).
- Frontend-only; reuses the existing `reschedule`/`cancel` backend actions (db-v16+, already live).
- Follow existing patterns (the standalone edit panel, the pass scheduler).

## Core helpers (new instance methods)
Placed near `isPastSlot`/`isPlanExpired` (~index.html:3009).
```js
  // True if a session at this date+time has already started/passed (Manila-correct; handles past DATES).
  isSessionUsed(dateStr, timeLabel) {
    if (!dateStr) return false;
    const now = this.nowManila();
    if (dateStr < now.date) return true;
    if (dateStr > now.date) return false;
    const h = this.slotHour24(timeLabel);
    return (h != null) ? (h * 60 <= now.hour * 60 + now.minute) : false;
  }
  // May a CUSTOMER still edit/cancel this session? (admin is never restricted; pass is optional)
  sessionEditableByCustomer(dateStr, timeLabel, plan) {
    if (this.isSessionUsed(dateStr, timeLabel)) return false;     // used / past
    if (plan && this.isPlanExpired(plan)) return false;           // expired pass
    return true;
  }
```
The render-local `sessionIsPast` (~4537) is updated to delegate to `isSessionUsed` so the
Upcoming/Past split uses the same Manila-correct logic (removes the device-time discrepancy and
the `acctNowMin` local).

## A. Standalone My Bookings — enforce in the handlers (defense-in-depth)
The Upcoming/Past UI split stays (Past is already display-only). Add a guard at the TOP of each
customer action so a blocked session can never be changed:
```js
  // cancelAcctBooking(entry), startEdit(entry), saveEdit(entry):
  if (!this.sessionEditableByCustomer(entry.date, entry.time, null)) {
    this.setState({ acctSchedMsg: '' });
    if (typeof alert !== 'undefined') alert('This session has already taken place — please contact us to change it.');
    return;
  }
```
(`saveEdit` re-checks because the edit panel may have been open when the slot passed.)

## B. Pass card — per-session Reschedule/Cancel (new)
In the `acctPlanRows` `sess` mapping (~index.html:4601), each session row gains an index + state:
```js
      const sess = (p.sessions || []).map((s, i) => {
        let lbl = s.date; try { lbl = new Date(s.date + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' }); } catch (e) {}
        const editable = this.sessionEditableByCustomer(s.date, s.time, p);
        const used = this.isSessionUsed(s.date, s.time);
        return {
          label: lbl + ' · ' + s.time, onCalendar: !!s.eventId,
          canChange: editable, locked: !editable,
          lockLabel: used ? 'Used' : 'Pass expired', // shown with "· contact us to change"
          reschedule: () => this.startPassSessionReschedule(p.email, p.ts, i),
          cancel: () => this.cancelAcctPlanSession(p.email, p.ts, i),
        };
      });
```
**Markup** (the pass-card session chips, ~index.html:1693): each session renders its label, and
- when `canChange`: small **Reschedule** + **Cancel** buttons,
- when `locked`: a muted note "`{{ lockLabel }}` · contact us to change" (no buttons).
`p.email` is available on each plan row (admin) / falls back to the account email (customer view).

### Cancel a pass session (customer)
New `cancelAcctPlanSession(email, ts, idx)` — modeled on the admin `removePlanSession` but
customer-gated and actor `'client'`:
```js
  cancelAcctPlanSession(email, ts, idx) {
    const plan = this.findPlan(email, ts);
    const s = (plan && plan.sessions) ? plan.sessions[idx] : null;
    if (!s) return;
    if (!this.sessionEditableByCustomer(s.date, s.time, plan)) { if (typeof alert !== 'undefined') alert('This session can no longer be changed online — please contact us.'); return; }
    if (typeof confirm !== 'undefined' && !confirm('Cancel this session? It frees the slot and returns the session to your pass.')) return;
    this.mutatePlan(email, ts, p => ({ ...p, sessions: (p.sessions || []).filter((_, i) => i !== idx) }));
    const ep = this.endpoint();
    if (ep && s.eventId) {
      fetch(ep, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'cancel', eventId: s.eventId, ref: s.ref || '', date: s.date, time: s.time, email: email, notify: true, by: 'customer' }) }).catch(() => {});
    }
    const planRef = this.ensurePlanRef(email, ts);
    this.logAction(planRef, 'Session removed', s.date + ' · ' + s.time + ' · ' + ((plan && plan.holder) || ''), (plan && plan.holder) || email, email, 'client');
  }
```
Removing the session from `plan.sessions` automatically returns it to the pass (the cap is
`sessions.length`-based), so the customer can re-book within the cap/validity.

### Reschedule a pass session (customer)
Reuse the existing pass slot-picker in "move" mode (no new picker machinery, no premature cancel).
- `startPassSessionReschedule(email, ts, idx)`: re-check eligibility; open the pass scheduler
  (`openAcctSched(email + '|' + ts)`) and set a new state field `acctReschedIdx = idx` (the
  session being moved). The picker UI (date input + slot buttons, ~index.html:1705) is unchanged.
- When a slot is tapped, branch in the slot-tap handler (currently
  `addAcctPlanSession(_schedEmail, _schedTs, slotDate, time, _schedCap)`):
  - if `acctReschedIdx != null` → **move** the existing session: POST `action:'reschedule'`
    (eventId from `plan.sessions[idx]`, old date/time → new date/time), then `mutatePlan` to set
    `sessions[idx] = { ...sessions[idx], date, time, eventId: res.eventId || old }`, log
    `'Rescheduled'` actor `'client'`, clear `acctReschedIdx`, close the picker.
  - else (normal add) → unchanged `addAcctPlanSession`.
- The picker's date input `max` is already capped to the pass expiry (`acctSchedMax`), so a
  reschedule stays within the validity window. Re-check `sessionEditableByCustomer` before the
  move (the original session must still be upcoming).

## C. Admin — unchanged
Admin cancel (`cancelBooking` by `'admin'`), admin `removePlanSession`, and the admin reschedule
paths are **not** gated by `sessionEditableByCustomer` — the admin can edit/cancel any session,
used or expired included. Only the customer-facing handlers above carry the guard.

## Out of scope
- The other Round-1 items (admin all-sessions list, My Bookings filters) — separate sub-projects.
- Backend-enforced permissions (the backend can't distinguish admin from customer — POSTs are
  unauthenticated; a pre-existing limitation, noted not fixed here).
- Editing a used session's details for record-keeping — admin handles via existing tools.

## Risks / watch-items
- **`isSessionUsed` is the single source of truth** for "past" — it must handle past dates AND
  past-times-today in Manila time; align `sessionIsPast` to it so Upcoming/Past and the guards
  never disagree.
- **Reschedule must move, not duplicate:** use the in-place `reschedule` action (as the standalone
  fix did) — never cancel+rebook — and only update the one `sessions[idx]`.
- **Free-back semantics:** cancelling an upcoming pass session removes it from `sessions` so the
  cap frees up; confirm the customer can then re-schedule (within cap + validity).
- **Admin paths stay open:** verify no admin cancel/edit path accidentally inherits the customer
  guard.
- `index.html` ≡ the `.dc.html` mirror byte-identical. No backend change, no deploy.

## Verification (Playwright, stubbed backend)
- **Standalone guard:** seed an account with a PAST session and a FUTURE session. The future
  card shows Edit/Cancel and they work; the past session is in Past (display-only). Force-call
  `cancelAcctBooking`/`saveEdit` on the past entry → it's refused (no `cancel`/`reschedule` POST,
  alert shown).
- **Pass session — upcoming:** seed a pass with a future session on a non-expired pass → the chip
  shows Reschedule + Cancel. Cancel → a `cancel` POST (`by:'customer'`) fires, the session leaves
  `plan.sessions`, and the pass's "N of M" count drops. Reschedule → pick a new slot → a
  `reschedule` POST fires (not cancel+book) and `sessions[idx]` updates to the new date/time;
  exactly one session remains (no duplicate).
- **Pass session — used:** seed a pass with a PAST session → the chip is locked ("Used · contact
  us"), no buttons; force-calling `cancelAcctPlanSession` on it is refused.
- **Pass session — expired pass:** seed an expired pass (its sessions) → all chips locked ("Pass
  expired · contact us"); customer cancel/reschedule refused.
- **Admin not restricted:** admin `removePlanSession` / admin cancel on a used/expired session
  still works (no guard).
- Mirror parity `diff index.html "Pasig Greenpark Archery Camp.dc.html"` → IDENTICAL.
