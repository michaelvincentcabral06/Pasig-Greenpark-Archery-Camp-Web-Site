# Booking system fixes — design (2026-06-23)

Scope: five changes to the Pasig Greenpark Archery Camp site (`index.html` front-end + `backend/Code.gs` Apps Script). User redeploys the backend themselves. Backend version bumps `db-v11` → `db-v12`.

## 1. My Bookings duplicate (`PGA-260626-LGF5` twice)
**Root cause:** the per-customer session dedupe key includes `program`, so the same booking arriving from the calendar (lookup) vs. the device cache with a slightly different program string yields two cards.
**Fix:** dedupe by `date + time` (prefer `eventId`, then `ref`), dropping `program`. Applied at the login merge (`accountLogin`) and the render merge (`acctMerged`).

## 2. Schedule change in Plans & Sessions → calendar + "rescheduled" email
Adding/removing sessions already syncs the calendar and emails on editor close. Make that email read as a reschedule/update: `planScheduleEmail`/`emailPlanSchedule` take an `updated` flag; backend `sendPlanSchedule_` uses an "rescheduled/updated" subject + heading when `updated`.

## 3. Coach change → calendar + email (real gap)
`assignPlanCoach` changes the coach + emails, but does NOT update already-created calendar events. Fix: for every existing session, POST `setBookingCoach` (updates the event's Coach line + sheet), then email the client the updated coach + schedule (`updated: true`).

## 4. Reflect the client's contact number (admin)
Show the client's phone on each Plans & Sessions card (visible text) and on each Activity-log row (joined from plans/bookings by email on the front-end — no sheet schema change).

## 5. Coaches tab CRUD (backend-stored w/ passcode), logged to Activity
- **Backend:** coach list stored in Script Properties (`COACHES_JSON`), seeded from the built-in 3. `getCoaches_()` replaces all `COACHES` reads. New `GET ?action=coaches`; `POST addCoach/updateCoach/deleteCoach`. Each change writes to the Activity log.
- **Front-end:** `coaches()` reads the backend list (cached in `localStorage`/state, seeded built-in). Coaches tab gets an Add form + per-card Edit/Delete. Hardcoded coach `<option>`s in Plans become dynamic (`coachSelectOpts`).

## Plus — "Reset all bookings" admin button
New `POST clearAll`: deletes every website-created calendar event, wipes Bookings/Cancellations/Activity/Passes sheets, removes all `plan:*` properties (keeps coaches, splits, availability). Double-confirmed "Reset all bookings" button in the admin Dashboard danger zone; also clears local caches.

## Files
- `backend/Code.LATEST.gs` + `backend/Code.gs` updated to v12; `backend/Code.v12.gs` archive added; `Code.v11.gs` left as historical.
- `index.html` (and its `.dc.html` mirror kept in sync if present).
