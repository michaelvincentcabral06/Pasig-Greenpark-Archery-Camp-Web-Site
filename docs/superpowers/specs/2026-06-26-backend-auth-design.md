# Backend Auth Hardening — Design

## Problem / current state

The Apps Script web app is wide open:
- The admin password `greenpark2026` is **hardcoded in the public `index.html`** (`tryLogin`, ~line 2969); coach passcodes ship to every browser via the coach list and via `?action=coaches` (`listCoaches_` returns `pass`, Code.gs ~1014).
- **`doPost` performs no admin auth.** Every admin action (`setContent`, `clearAll`, `savePlan`/`removePlan`, `setSplit`, `setBookingStatus`/`approveSession`/`setBookingCoach`, `addCoach`/`updateCoach`/`deleteCoach`/`setCoachProfile`, `addEmailAlias`, `logAction`, plan-email actions) executes for anyone who POSTs the URL.
- **`doGet` leaks admin data with no auth:** `bookings` (all customer name/email/phone), `activity`, `cancellations`, `settings`, and all-`plans` (empty email = every plan).
- Coach write actions (`setCoachAvail`) do check the passcode server-side, but the passcode is public.

## Model (owner-approved)

A server-verified **shared secret**, appropriate for a static site on Apps Script (no sessions/cookies; the public booking flow must stay anonymous; OAuth is not viable):
- `ADMIN_SECRET` and coach passcodes live **only in the backend** (Script Properties). Nothing secret ships to the browser.
- The admin/coach types their code at login → a single `staffLogin` endpoint verifies it server-side and returns the role → the browser holds the code in memory for the session and sends it **in the request body** with every privileged request, over HTTPS.
- Sensitive reads move to **POST** so the secret never appears in a URL (owner-approved).
- Secrets are **rotated** by the owner at deploy (the old ones are public); the owner sets them, never shared with the assistant.

## Backend changes (`backend/Code.gs`, ES5 only — var/function, no arrow/const/let/template-literals)

1. **Secret accessor:** `adminSecret_()` → `PropertiesService.getScriptProperties().getProperty('ADMIN_SECRET')` (may be empty if unconfigured).
2. **Guard:** `assertAdmin_(body)` → returns `true` iff a non-empty `ADMIN_SECRET` is set AND `String(body.secret||'') === ADMIN_SECRET`. Privileged handlers call it first and, on failure, return `json_({ ok:false, reason:'unauthorized' })` — **fail closed** (if `ADMIN_SECRET` is unset, all admin actions are rejected; the deploy steps set it first).
3. **`staffLogin` action (doPost):** `{action:'staffLogin', code}` →
   - if `ADMIN_SECRET` unset → `{ ok:false, reason:'not-configured' }`.
   - if `code === ADMIN_SECRET` → `{ ok:true, role:'admin' }`.
   - else if `code` matches a coach's `pass` → `{ ok:true, role:'coach', id, name }`.
   - else → `{ ok:false, reason:'bad-credentials' }`.
   (Keep the existing `coachLogin_` for the dedicated Coach-portal path, or have it delegate; both must verify server-side.)
4. **Gate writes:** every admin write handler in `doPost` calls `assertAdmin_(body)` first. Coach write handlers (`setCoachAvail_`) keep their existing passcode check. Customer actions (`book`, `cancel`, `reschedule`) stay ungated.
5. **Move sensitive reads to POST + gate them:** add `doPost` cases for `bookings`, `activity`, `cancellations`, `settings`, `plans` (admin-all), `coachavail`, each gated — `assertAdmin_(body)` for the first five; `coachavail` accepts a valid admin secret **or** the matching coach passcode.
6. **Close the open GET reads:** in `doGet`, **remove** `bookings`, `activity`, `cancellations`, `settings`, `coachavail`; make `plans` **require** a non-empty `email` (return `{ ok:false, reason:'unauthorized' }` / empty for the no-email admin-all case — that path is POST-only now). Keep public GETs: `availability`, `lookup`, `content`, `coaches`, `version`.
7. **Strip passcodes from coach output:** `listCoaches_()` (and any coach payload returned to the browser) must NOT include `pass`. The admin sets/edits a passcode write-only via `updateCoach`/`addCoach` (those still accept `body.pass`), but the value is never returned.
8. **Never log the secret** (no `Logger.log(body)` that dumps `secret`/`pass`).

## Frontend changes (`index.html`; mirror to `Pasig Greenpark Archery Camp.dc.html`)

1. **`tryLogin`:** POST `staffLogin{code}`; on `role:'admin'` → set `authed:true` + store the code as the session secret (`this.state.authSecret`), run the admin loads; on `role:'coach'` → set the coach-authed state with `coachId`/`name` from the response + store the coach passcode as the coach session secret; on failure → `adminError`. **Remove** the hardcoded `'greenpark2026'` comparison and the `this.coaches().find(c => c.pass === pass)` client-side matching.
2. **Attach the secret to every privileged request:** every admin write POST body gains `secret: this.state.authSecret`; the six sensitive reads (`loadAllBookings`, `loadActivity`, `loadCancellations`, `loadRemotePlans` [admin-all], `loadSettings`, and the admin coachavail read) become **POST** `{action, secret}` instead of GET. Coach requests send the coach passcode as today.
3. **Coaches-tab passcode field → write-only:** show a "Set a new passcode (leave blank to keep)" input that only sends a value when filled; never display an existing passcode (the API no longer returns it). Update the coach-edit handlers accordingly.
4. **Remove passcodes from frontend coach data:** the `coaches()`/default coach seed must not contain `pass`; coach identity for the portal comes from the `staffLogin`/`coachLogin` response.
5. **Unauthorized handling:** if any privileged response is `{ ok:false, reason:'unauthorized' }`, clear `authed`/secret and show a "Please sign in again" prompt (re-login), rather than silently failing.
6. Customer flows (`book`, `cancel`, `reschedule`, `availability`, `lookup`, own-`plans`, `content`, public `coaches`) are unchanged.

## Backward-compatibility & migration

- **Fail-closed** means: after deploying this backend, admin/coach actions are rejected until `ADMIN_SECRET` (and coach passcodes) are set. The deploy steps set them first, so there's no lockout window in practice. `staffLogin` returns `not-configured` to make a misconfiguration obvious.
- Existing customer data (bookings, plans, content) is untouched; only access control changes.
- The frontend gracefully shows the login/error states if the backend is older (no `staffLogin`) or unconfigured.

## Constraints

- **Mirror rule:** `index.html` ≡ `Pasig Greenpark Archery Camp.dc.html` (byte-identical; `diff … && echo IDENTICAL`).
- **Backend ES5 only**; keep `Code.gs` and its identical copies (`Code.LATEST.gs`, versioned `Code.vN.gs`) in sync per existing repo convention; bump the db-version marker.
- **No secret in the public bundle, in URLs, or in logs.**
- Do not break the anonymous customer booking/lookup flow or the public `coaches`/`content`/`availability` reads.

## Verification

- **Frontend (Playwright, real DOM via the React-fiber `logic` instance, stubbed `fetch`):**
  - `staffLogin` stub returning `role:'admin'` → login succeeds, `authSecret` stored; returning `bad-credentials` → error shown, not authed.
  - Capture outgoing requests: every admin write **and** each of the six reads includes `secret` in its POST body; no admin read is sent as a GET; no `secret` appears in any request URL.
  - An `unauthorized` response clears auth and surfaces re-login.
  - Coach login via `staffLogin{role:'coach'}` sets the coach state from the response (no client-side passcode list).
- **Backend:** rigorous code review (cannot run GAS locally) **+ a post-deploy smoke-test script** (provided to the owner) that hits the live endpoint: (a) POST `setContent` with no/wrong secret → `unauthorized`; (b) POST `bookings` with no secret → `unauthorized`; (c) `GET ?action=bookings` → no longer returns data; (d) POST `staffLogin` with the real secret → `role:'admin'`; (e) an authenticated `setContent` → `ok`. The owner runs it once after setting `ADMIN_SECRET` + redeploying.

## Deploy & rotation steps (owner — provided at hand-off)

1. In the Apps Script project: **Project Settings → Script Properties** → add `ADMIN_SECRET` = a new strong value (NOT `greenpark2026`).
2. Redeploy the web app (new version).
3. In the site admin → **Coaches** tab, set a **new passcode** for each coach (the old ones were public).
4. Run the provided smoke test to confirm the lock works.

## Out of scope (future)

- Customer `cancel`/`reschedule` ownership validation (ref+email match).
- Brute-force lockout / rate-limiting on `staffLogin` (Apps Script quotas provide a soft ceiling).
- Splitting the `index.html` monolith.
