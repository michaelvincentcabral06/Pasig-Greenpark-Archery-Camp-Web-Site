# Part B Deploy — Reschedule email + activity log (db-v20)

Backend change: `reschedule_` now (a) writes a **Rescheduled** entry to the admin Activity log and (b) sends the customer a **reschedule confirmation email** — both via the same path `cancel_` already uses. New `sendReschedule_()` email function. No new Script Property needed; `ADMIN_SECRET` from the previous deploy still applies.

## Deploy steps (owner)

1. In the Apps Script editor, paste the full updated `backend/Code.gs` over the existing file → **Ctrl+S** (wait for "Saved").
2. **Deploy → Manage deployments → edit the active deployment (pencil) → Version: New version → Deploy** (same `/exec` URL).

That's the whole deploy — no property changes.

## Verify after deploy

- **Version (assistant can run, no secret):** `GET ?action=version` → should report `"version":"db-v20"` and `"rescheduleNotify":true`. Confirms the new code is live.
- **End-to-end (owner):** in **My Bookings**, reschedule a real upcoming session to a new date. Expect:
  1. The session shows **once** with the new date (Part A — already live).
  2. A **reschedule email** arrives at the booking's email ("Booking rescheduled — Was: … / Now: …").
  3. Admin → **Bookings → Activity** shows a new **Rescheduled** entry.

## Notes

- Emails/logs are skipped only when a caller passes `notify:false` (none do today; reserved for future silent moves).
- The frontend no longer calls the admin-gated `logAction` on reschedule — the backend logs it server-side instead, so customer reschedules appear in Activity again.
- `cancel_` already logged + emailed server-side; unchanged.
