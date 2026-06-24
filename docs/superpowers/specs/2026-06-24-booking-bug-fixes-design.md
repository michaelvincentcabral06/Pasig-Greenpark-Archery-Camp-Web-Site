# Booking bug fixes (batch)

**Date:** 2026-06-24
**Goal:** Fix four reported bugs: reschedule duplicates a session, past time slots stay bookable,
self-scheduled pass sessions don't show in admin, and self-scheduling sends no confirmation email.

Constraints:
- Mirror rule: every `index.html` edit applied identically to
  `Pasig Greenpark Archery Camp.dc.html` (byte-identical).
- Backend is Google Apps Script (`backend/Code.gs`, currently db-v15) — bugs 1 & 4 need
  **db-v16**, deployed manually; review-gated + a deploy checklist. I cannot test Apps Script
  live. Bugs 2 & 3 are frontend (Playwright-verified, backend stubbed).
- Apps Script style: ES5 (`var`/`function`, no arrow/`const`/`let`/template-literals).
- Some root causes are confirmed by reading; where a fix's exact trigger needs runtime
  confirmation, the implementer reproduces it first (systematic-debugging) before fixing.

## Bug 1 — Rescheduling a session duplicates it (2 entries, same ref)
**Cause:** `saveEdit` (index.html ~3459) cancels the old calendar event via `cancelBooking`
(`cancel_`, which deletes by `getEventById`), then books a NEW event reusing the old `ref`
(line ~3487 `ref: entry.ref`). When `getEventById` fails to resolve the id (a known Apps Script
quirk), the old event survives; the new event has the same ref but a different date/time, and
My Bookings (which keys on date+time) shows both.
**Fix (db-v16 + frontend):** add a backend **`reschedule`** action that finds the existing event
(by `eventId`, else date+time+ref) and **moves it in place** (`setTime`/`setDescription`) — no
cancel+rebook, so a duplicate is impossible. `saveEdit` calls `action:'reschedule'` (passing the
old eventId/ref/date/time + the new date/time) instead of cancel-then-book; on success it updates
the single local entry. Falls back to the old path only if the backend lacks `reschedule`.

## Bug 2 — Past time slots still bookable today
**Cause:** the backend `buildSlots_` drops past hours for "today", and the frontend has
`isPastSlot(dateStr, label)` (~2895), but `loadSlots` (~2930, "Trust the backend") and
`loadEditSlots` (~3423) render the backend's list WITHOUT re-filtering — so any past slot the
backend returns (timing/timezone edge) shows.
**Fix (frontend-only):** in `loadSlots` and `loadEditSlots`, run the mapped slots through
`.filter(function (s) { return !this.isPastSlot(dateStr, s.time); })` before setState. Defensive;
a past slot can never appear regardless of the backend.

## Bug 3 — Self-scheduled pass session doesn't appear in admin Plans & Sessions
**Cause (to confirm at build):** the customer's self-schedule (`addAcctPlanSession` →
`addPlanSession` → `mutatePlan`→`pushPlan`/`savePlan` + `syncPlanSessionToCalendar`) persists the
updated pass (with the new session) to the backend; admin reads it via `loadRemotePlans`. The
admin view likely isn't refreshed after the customer schedules (stale `remotePlans`), and/or the
save races the read.
**Fix (frontend):** ensure the self-scheduled session reliably lands in the admin list — confirm
`pushPlan`/`savePlan` carries the new session (it serializes the full plan), and that the admin
Plans & Sessions reflects it on its next `loadRemotePlans`. If it's a refresh gap, refresh
`remotePlans` after a self-schedule and/or when the admin opens the tab. Reproduce first to
confirm the exact gap; keep the change minimal.

## Bug 4 — No confirmation email when a customer self-schedules
**Cause:** `emailPlanSchedule` (~3157) POSTs `planScheduleEmail`; the backend `planScheduleEmail_`
(Code.gs ~793) returns `plan not found` and sends nothing unless the pass is already stored under
`planKey_(email, ts)`. The self-schedule fires the email immediately, and (depending on the pass's
sync state / timing) the lookup can miss, so no email is sent.
**Fix (db-v16 + frontend):** make `planScheduleEmail_` fall back to body-provided fields when the
stored plan is missing — use `body.holder`, `body.plan` (pass name), and `body.sessions` so it can
always compose + send the email. `emailPlanSchedule` passes `holder` and `plan` (name) from the
live copy in its payload. (This also removes the save-race dependency.)

## Backend db-v16 (Code.gs + identical Code.LATEST.gs + new Code.v16.gs)
- New `reschedule` POST action (Bug 1): `{action:'reschedule', eventId, ref, date, time, newDate,
  newTime, ...}` → move the matched event to the new date/time (1-hour slot, same TIMEZONE);
  return `{ ok:true, eventId, ref }`.
- `planScheduleEmail_` body fallback (Bug 4): when the stored plan is absent, use
  `body.holder`/`body.plan`/`body.sessions` so it still emails.
- Version → `db-v16` (keep all db-v15 flags incl. `contentStore`; add `reschedule:true`).
- Deploy checklist appended to `backend/SETUP.md`.

## Out of scope
- The larger pass-scope feature (sessions cap/validity), tab renames, editable
  coaches/testimonials, dashboard pagination — separate sub-projects (E/F/G/H/I).

## Risks / watch-items
- I cannot live-test Apps Script — backend (Bugs 1, 4) is review-gated + the deploy checklist.
- `getEventById` reliability is the crux of Bug 1; the in-place `reschedule` avoids depending on a
  second delete succeeding.
- index.html ≡ .dc.html; the three `.gs` files byte-identical.
- Bug 3's exact trigger is confirmed at build (reproduce → minimal fix).

## Verification
- **Frontend (Playwright, stubbed backend):**
  - Bug 2: stub availability to include a clearly-past hour for "today" → confirm it's filtered out
    of both the booking and the reschedule pickers; a future date keeps all slots.
  - Bug 1: stub a `reschedule` action; reschedule a session → confirm exactly ONE entry remains
    (no duplicate), with the new date/time, and the frontend called `action:'reschedule'`.
  - Bug 4: self-schedule a pass session → confirm `emailPlanSchedule`/`planScheduleEmail` fires
    with `holder`+`plan` in the payload.
  - Bug 3: after a self-schedule, the pass's session count increments and (admin path) a
    `remotePlans` refresh includes it.
- **Backend (cannot run here): `SETUP.md` checklist** — deploy db-v16, confirm version, then on the
  live site: reschedule a real session → it moves (no duplicate); self-schedule a pass session →
  a confirmation email arrives and the session shows in admin Plans & Sessions.
