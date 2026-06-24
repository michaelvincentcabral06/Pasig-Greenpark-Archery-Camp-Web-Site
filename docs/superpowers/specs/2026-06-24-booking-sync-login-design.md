# Reliable booking sync + login (sub-project A)

**Date:** 2026-06-24
**Problem:** Session bookings are findable only by an exact email (calendar lookup that
hard-requires `email`). A confirmed booking "disappears" when viewed under a different email
or on a device that never stored it locally; there is no reference-only login and no way to
unify bookings made under different emails. (Passes already work cross-device — they live in
Script Properties keyed by email.)

**Goal:** Make a customer's bookings findable from any device by **reference OR email**, show
which email each booking is under, and let a customer **merge multiple emails** into one
My Bookings view — all server-resolved so it holds across devices.

**Constraints / reality**
- Backend lives in Google Apps Script (`backend/Code.gs`, currently **db-v13**). These changes
  ship as **db-v14**, which the **user deploys manually**. I cannot run/test Apps Script
  against the live Google environment — backend is verified by code review + the user's
  post-deploy checklist; the frontend is verified with Playwright against a stubbed db-v14.
- Frontend mirror rule: every `index.html` edit is applied identically to
  `Pasig Greenpark Archery Camp.dc.html` (byte-identical).
- Keep the system login-light: no customer passwords. Ownership for a merge is proven with a
  booking reference (refs are delivered in confirmation emails to that address).

## Decisions (from brainstorming)
- Build all three together: ref-only login + show-email-per-booking + email merge.
- Merge requires a **reference from the email being added** (ownership proof), not email alone.
- The **bookings sheet** (durable, all-time log with Ref + Email columns) is the authoritative
  index for resolving a reference to its email (more reliable than the calendar's date window).

## Data model (new)
- **Email group:** Script Properties key `aliases:<email>` → JSON array of every email in that
  person's group (lowercased, includes itself). Absent ⇒ group is just `[email]`.
  - `groupFor_(email)`: return parsed `aliases:<email>` or `[email]`.
  - `mergeEmails_(a, b)`: `union = groupFor_(a) ∪ groupFor_(b)`; write `union` to
    `aliases:<m>` for every member `m` (denormalized so any member resolves the whole group).
- **Ref → email:** `emailForRef_(ref)`: scan the bookings sheet; find the row whose `Ref`
  column equals `ref` (case-insensitive, trimmed); return its `Email` column (lowercased), or
  '' if not found.

## Backend changes (db-v14, `backend/Code.gs` + keep `Code.LATEST.gs`/a new `Code.v14.gs` in sync)
1. **`lookup_(email, ref)` — accept email OR ref, union across the group:**
   - Seed email = `email` if given, else `emailForRef_(ref)`.
   - If no seed email → `{ bookings: [], emails: [], primary: '' }`.
   - `group = groupFor_(seed)`.
   - Scan the calendar window as today, but include an event when its description `Email` is in
     `group` (not just `=== one email`). **Tag each returned booking with its own event
     `email`** (today it overwrites with the query email — change to the real per-event email).
   - **Reference is for resolution only, never a result filter** (so ref-login returns *all*
     the person's bookings, not just the one ref). Drop the current `ref`-narrows-results
     behavior.
   - Return `{ bookings, name, emails: group, primary: seed }`.
2. **`plans` action — union passes across the group:** resolve `group` for the requested email
   and return passes for every `plan:<m>:*` across members (today it reads one email).
3. **New POST action `addEmailAlias`:** body `{ email, addEmail, ref }`.
   - `if (emailForRef_(ref) !== addEmail.toLowerCase()) return { ok:false, reason:'ref does not match that email' }`.
   - `mergeEmails_(email, addEmail)`; return `{ ok:true, emails: groupFor_(email) }`.
   - Route it in `doPost`.
4. **Version bump:** `version` response → `db-v14`, add flags `{ refLookup:true, emailMerge:true }`.
   Mirror all three files (`Code.gs`, `Code.LATEST.gs`, new `Code.v14.gs`).

## Frontend changes (`index.html` + mirror)
1. **Login by email OR reference** (`accountLogin`, My Bookings login form):
   - Accept either field alone. Validation: require email-format OR a non-empty ref.
   - If only ref: call `?action=lookup&ref=<ref>` (no email). Backend resolves email + group.
   - On success, set `acctEmail = primary`, store `acctEmails = emails` (the group) in state
     (+ localStorage `pgac_acct_emails`) so the merged identity persists across reloads.
   - Update the login copy: "Enter your email **or** a booking reference."
2. **Server as source of truth:** after login, My Bookings shows the lookup (server) result for
   the whole group; local `pgac_bookings` is merged in but the server list is primary. (Keeps
   the existing dedupe-by-date+time.)
3. **Show the email per booking:** each session row renders a muted "Booked under: {email}"
   line (the booking's real email from lookup). Makes mismatches obvious.
4. **"Add another email" UI** in the My Bookings dashboard:
   - A small form: *other email* + *a booking reference from it*. Submit → POST
     `addEmailAlias { email: acctEmail, addEmail, ref }`.
   - On `ok` → re-run lookup for the group, refresh bookings + passes, show "Merged — showing
     all your bookings." On failure → "That reference doesn't match that email."
5. **Passes union:** `fetchPlansForEmail`/`loadRemotePlans` for the account use the group so
   passes from all merged emails appear.

## Out of scope (later sub-projects)
- Self-service pass scheduling (B), dynamic pricing/programs (C), pagination (D).
- Customer passwords / full accounts (intentionally not built — stays reference-based).

## Risks / watch-items
- I cannot live-test Apps Script; backend correctness rests on review + the user's deploy
  checklist. Ship db-v14 to a NEW deployment URL or redeploy the same `/exec`; confirm
  `?action=version` shows `db-v14` before testing.
- `emailForRef_` depends on the bookings sheet having a populated `Ref` + `Email` column for
  past bookings; very old bookings predating the sheet won't resolve by ref (acceptable).
- Merge is irreversible in v1 (no "unmerge"); fine for now, note it.
- Privacy: a valid ref grants visibility of that email's bookings — intended (ownership proof).

## Verification
- **Frontend (Playwright, backend stubbed to mimic db-v14):**
  - Login with a reference only → dashboard loads, bookings listed, each shows "Booked under:".
  - Login with email only → same.
  - "Add another email" with a matching ref (stub returns ok) → second email's bookings appear;
    with a non-matching ref (stub returns ok:false) → error shown, no merge.
  - Mirror parity IDENTICAL.
- **Backend (cannot run here): user post-deploy checklist** — after deploying db-v14 and
  confirming `?action=version`=`db-v14`: (a) `?action=lookup&ref=PGA-260625-9RJD` returns the
  booking + its email; (b) log in by that ref in My Bookings; (c) add a second email with one
  of its refs and confirm both sets show on a different device.
