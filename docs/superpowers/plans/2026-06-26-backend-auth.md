# Backend Auth Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real server-side auth — a verified shared secret — to all admin (and coach) endpoints; remove every secret from the browser bundle; gate the PII-leaking reads.

**Architecture:** Apps Script backend (`backend/Code.gs` + identical copies) gains `staffLogin` + `assertAdmin_`; admin writes and the six sensitive reads require the secret (reads move to POST). The single SuperConductor frontend (`index.html`, mirrored) verifies login server-side, holds the code in memory, and injects it into every privileged request through one chokepoint. Owner sets `ADMIN_SECRET` + new coach passcodes and redeploys.

**Tech Stack:** Google Apps Script (ES5 only), SuperConductor frontend, Playwright-core (frontend), curl (backend smoke test).

## Global Constraints

- **Mirror rule:** every `index.html` edit applied identically to `Pasig Greenpark Archery Camp.dc.html`; finish with `diff index.html "Pasig Greenpark Archery Camp.dc.html" && echo IDENTICAL`.
- **Backend ES5 only** (var/function; no arrow/const/let/template-literals/trailing-comma). Keep `backend/Code.gs` and `backend/Code.LATEST.gs` byte-identical, and add `backend/Code.v19.gs` as an identical snapshot (repo convention). Bump the `version` action marker to `db-v19` with an `auth:true` flag.
- **No secret in the public bundle, in any URL, or in logs.**
- **Fail closed:** if `ADMIN_SECRET` is unset, all privileged actions are rejected. Do not break public flows (`book`/`cancel`/`reschedule`/`availability`/`lookup`/own-`plans?email=`/`content`/public `coaches`/`version`).
- **No deploy during implementation.** The owner deploys after the branch is merged; backend changes are verified by review + a post-deploy smoke test.
- **Verification:** frontend via Playwright-core (chromium at `C:\Users\Michael Cabral\AppData\Local\ms-playwright\chromium-1228\chrome-win64\chrome.exe`; install if missing `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright-core --no-save`); scratch `_*.mjs` gitignored, deleted before finishing.

---

### Task 1: Backend auth layer (`backend/Code.gs` + copies)

**Files:**
- Modify: `backend/Code.gs` (then copy to `backend/Code.LATEST.gs`; create `backend/Code.v19.gs`)
- Create: `docs/superpowers/backend-auth-smoke-test.md` (curl checks for post-deploy)

**Interfaces:**
- Produces (consumed by the frontend tasks): the `staffLogin` action (`{action:'staffLogin', code}` → `{ok, role, id?, name?, reason?}`); every admin write + the reads `bookings`/`activity`/`cancellations`/`settings`/`plans`(admin-all)/`coachavail` now require `body.secret` via POST; `listCoaches_` no longer returns `pass`.

- [ ] **Step 1: Secret accessor + guard.** Near the other helpers (e.g. after `json_` ~line 374), add:
```js
function adminSecret_() {
  return PropertiesService.getScriptProperties().getProperty('ADMIN_SECRET') || '';
}
function assertAdmin_(body) {
  var s = adminSecret_();
  return !!s && String((body && body.secret) || '') === s;
}
function unauthorized_() { return json_({ ok: false, reason: 'unauthorized' }); }
```

- [ ] **Step 2: `staffLogin` action.** Add a handler that identifies the caller from a single code:
```js
function staffLogin_(body) {
  var s = adminSecret_();
  if (!s) return json_({ ok: false, reason: 'not-configured' });
  var code = String((body && body.code) || '');
  if (code && code === s) return json_({ ok: true, role: 'admin' });
  var list = getCoaches_();
  for (var i = 0; i < list.length; i++) {
    if (code && list[i].pass && code === list[i].pass) {
      return json_({ ok: true, role: 'coach', id: list[i].id, name: list[i].name });
    }
  }
  return json_({ ok: false, reason: 'bad-credentials' });
}
```
Wire it in `doPost`: `if (body.action === 'staffLogin') return staffLogin_(body);` (place it first, before the gated actions).

- [ ] **Step 3: Gate every admin write in `doPost`.** For each admin write action, call the guard first. Replace the dispatch lines (Code.gs ~743-763) so each admin action is guarded, e.g.:
```js
    if (body.action === 'setContent')        return assertAdmin_(body) ? setContent_(body)        : unauthorized_();
    if (body.action === 'clearAll')          return assertAdmin_(body) ? clearAll_(body)          : unauthorized_();
    if (body.action === 'savePlan')          return assertAdmin_(body) ? savePlan_(body)          : unauthorized_();
    if (body.action === 'removePlan')        return assertAdmin_(body) ? removePlan_(body)        : unauthorized_();
    if (body.action === 'setSplit')          return assertAdmin_(body) ? setSplit_(body)          : unauthorized_();
    if (body.action === 'setBookingStatus')  return assertAdmin_(body) ? setBookingStatus_(body)  : unauthorized_();
    if (body.action === 'approveSession')    return assertAdmin_(body) ? approveSession_(body)    : unauthorized_();
    if (body.action === 'setBookingCoach')   return assertAdmin_(body) ? setBookingCoach_(body)   : unauthorized_();
    if (body.action === 'logAction')         return assertAdmin_(body) ? logAction_(body)         : unauthorized_();
    if (body.action === 'planScheduleEmail') return assertAdmin_(body) ? planScheduleEmail_(body) : unauthorized_();
    if (body.action === 'planCancelEmail')   return assertAdmin_(body) ? planCancelEmail_(body)   : unauthorized_();
    if (body.action === 'addCoach')          return assertAdmin_(body) ? addCoach_(body)          : unauthorized_();
    if (body.action === 'updateCoach')       return assertAdmin_(body) ? updateCoach_(body)       : unauthorized_();
    if (body.action === 'deleteCoach')       return assertAdmin_(body) ? deleteCoach_(body)       : unauthorized_();
    if (body.action === 'setCoachProfile')   return assertAdmin_(body) ? setCoachProfile_(body)   : unauthorized_();
    if (body.action === 'addEmailAlias')     return assertAdmin_(body) ? addEmailAlias_(body)     : unauthorized_();
```
(The `setContent` line at the top of this block is the same pattern — ensure it appears exactly once.) Leave `cancel`, `reschedule`, `book`, `coachLogin`, `setCoachAvail` (keeps its own passcode check), and `staffLogin` UNGATED by `assertAdmin_`. (Verify no admin action is left ungated — cross-check against the doPost list.)

- [ ] **Step 4: Add gated POST reads.** In `doPost` (after staffLogin, alongside the writes), add the six sensitive reads as POST, gated:
```js
    if (body.action === 'bookings')       return assertAdmin_(body) ? listBookings_()       : unauthorized_();
    if (body.action === 'activity')       return assertAdmin_(body) ? listActivity_()       : unauthorized_();
    if (body.action === 'cancellations')  return assertAdmin_(body) ? listCancellations_()  : unauthorized_();
    if (body.action === 'settings')       return assertAdmin_(body) ? getSettings_()        : unauthorized_();
    if (body.action === 'plans')          return assertAdmin_(body) ? listPlans_('')        : unauthorized_();
    if (body.action === 'coachavail')     return (assertAdmin_(body) || coachPassOk_(body.coach, body.pass)) ? listCoachAvail_(body.coach) : unauthorized_();
```
Add the coach-pass helper near `assertAdmin_`:
```js
function coachPassOk_(coachId, pass) {
  var c = coachById_(coachId);
  return !!c && c.pass === String(pass || '');
}
```

- [ ] **Step 5: Close the open GET reads.** In `doGet` (~635-665): **remove** the `bookings`, `activity`, `cancellations`, `settings`, and `coachavail` cases. Change `plans` to require an email:
```js
    if (action === 'plans') {
      var em = (e.parameter.email || '').trim();
      if (!em) return json_({ ok: false, reason: 'unauthorized' });
      return listPlans_(em);
    }
```
Keep public: `availability`, `lookup`, `content`, `coaches`, `version`. (After this, the only way to read all bookings/activity/etc. is an authenticated POST.)

- [ ] **Step 6: Strip passcodes from coach output.** In `listCoaches_` (~1014), remove `pass: c.pass || ''` from the pushed object so the response is `{ id, name, first, role, bio, photo }`. Confirm no other browser-bound payload includes `pass` (grep for `pass:` in read/list functions).

- [ ] **Step 7: Bump the version marker.** In the `version` doGet case (~667), change `version: 'db-v18'` → `version: 'db-v19'` and add `auth: true` to the flags object.

- [ ] **Step 8: Sync copies + write the smoke test.** `cp backend/Code.gs backend/Code.LATEST.gs`; `cp backend/Code.gs backend/Code.v19.gs`; verify `diff backend/Code.gs backend/Code.LATEST.gs && diff backend/Code.gs backend/Code.v19.gs && echo IDENTICAL`. Create `docs/superpowers/backend-auth-smoke-test.md` with curl checks (placeholders for `$URL` and `$SECRET`): (a) `POST {action:'setContent',content:{}}` with no secret → expect `{"ok":false,"reason":"unauthorized"}`; (b) `POST {action:'bookings'}` no secret → `unauthorized`; (c) `GET ?action=bookings` → no booking data (unauthorized/empty); (d) `POST {action:'staffLogin',code:'$SECRET'}` → `{"ok":true,"role":"admin"}`; (e) `POST {action:'setContent',content:{},secret:'$SECRET'}` → `ok`. Mark which the owner runs (those needing `$SECRET`) vs which the assistant can run post-deploy without it (a/b/c).

- [ ] **Step 9: Review note + commit.** Self-review: every admin write/read gated; public flows untouched; ES5 only; copies identical; no `pass` in browser output. Commit:
```bash
git add backend/Code.gs backend/Code.LATEST.gs backend/Code.v19.gs docs/superpowers/backend-auth-smoke-test.md
git commit -m "Auth T1 (backend): staffLogin + assertAdmin_; gate all admin writes + sensitive reads (POST); close open GET reads; strip coach passcodes; db-v19"
```
(No frontend yet, no deploy — backend verified by review + the smoke test after the owner deploys.)

---

### Task 2: Frontend login + secret plumbing (`index.html`)

**Files:**
- Modify: `index.html` (login `tryLogin` ~2967; new helpers near other fetch methods; the admin write call sites + the six read methods; state ~2607)
- Mirror: `Pasig Greenpark Archery Camp.dc.html`
- Test: `_verify_auth.mjs`

**Interfaces:**
- Consumes Task 1's `staffLogin` + gated endpoints.
- Produces: `this.state.authSecret` (the verified code held in memory); `this.adminPost(bodyObj)` chokepoint used by all privileged requests; `handleUnauthorized()`.

- [ ] **Step 1: Add state.** In initial state (~2607, near `authed: false`), add `authSecret: '',`.

- [ ] **Step 2: Add the secret-injecting chokepoint.** Near `persistContent`/the other fetch methods, add:
```js
  adminPost(bodyObj) {
    var ep = this.endpoint();
    if (!ep) return Promise.resolve({ ok: false, reason: 'no-endpoint' });
    var body = Object.assign({ secret: this.state.authSecret || '' }, bodyObj);
    return fetch(ep, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json(); })
      .then(function (res) { if (res && res.ok === false && res.reason === 'unauthorized') { this.handleUnauthorized(); } return res; }.bind(this))
      .catch(function () { return { ok: false, reason: 'network' }; });
  }
  handleUnauthorized() {
    this.setState({ authed: false, authSecret: '', adminError: true });
  }
```

- [ ] **Step 3: Server-verified login.** Replace the hardcoded check in `tryLogin` (~2967-2990). Instead of `if (pass === 'greenpark2026')` and `this.coaches().find(c => c.pass === pass)`, POST `staffLogin`:
```js
  tryLogin() {
    var code = (this.state.adminPass || '').trim();
    var ep = this.endpoint();
    if (!ep || !code) { this.setState({ adminError: true }); return; }
    fetch(ep, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'staffLogin', code: code }) })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res && res.ok && res.role === 'admin') {
          this.setState({ authed: true, authSecret: code, adminError: false, adminPass: '' });
          this.loadRemotePlans(); this.loadCancellations(); this.loadAllBookings(); this.loadActivity(); this.loadSettings(); this.loadCoaches();
        } else if (res && res.ok && res.role === 'coach') {
          this.setState({ adminPass: '', adminError: false, coachAuthed: true, coachId: res.id, authSecret: code,
            coachEditDate: this.todayStr(), coachCalMonth: this.todayStr().slice(0, 7), coachAvail: this.loadAllCoachAvail() });
        } else {
          this.setState({ adminError: true });
        }
      }.bind(this)).catch(function () { this.setState({ adminError: true }); }.bind(this));
  }
```
(Match the exact coach-authed state keys the existing code sets — read the current `tryLogin` coach branch and preserve every key it set, just sourcing `coachId`/name from `res` and adding `authSecret: code`. If a separate Coach-portal login method exists, give it the same server-verified treatment.)

- [ ] **Step 4: Route every admin WRITE through `adminPost`.** Convert each admin write `fetch(ep, {... body: JSON.stringify({action:'X', …})})` to `this.adminPost({action:'X', …})`, dropping the manual `fetch`/headers. Call sites (confirm by grep): `setContent` (~2926, inside `persistContent`), `clearAll` (~2842), `addCoach` (~2796), `updateCoach` (~2813), `deleteCoach` (~2827), `setCoachProfile` (~2763 region), `savePlan` (~3424), `setSplit` (~3601), `setBookingStatus` (~3616), `logAction` (~3646), `setBookingCoach` (~3667 and ~4085), `addEmailAlias` (~3760), `approveSession` (~3987), plus `removePlan`, `planScheduleEmail`, `planCancelEmail` if present. Preserve each call's `.then(...)` follow-up logic. (`persistContent` keeps its localStorage write; only its network POST routes through `adminPost`.)

- [ ] **Step 5: Convert the six admin READS to POST via `adminPost`.** Change these from `fetch(ep + '?action=…')` GET to `this.adminPost({action:'…'})`, keeping their `.then` result handling:
  - `loadAllBookings` (~3570) → `this.adminPost({action:'bookings'})`
  - `loadActivity` (~3652) → `this.adminPost({action:'activity'})`
  - `loadCancellations` (~3563) → `this.adminPost({action:'cancellations'})`
  - `loadRemotePlans` (~3557) → `this.adminPost({action:'plans'})`
  - `loadSettings` (~3577) → `this.adminPost({action:'settings'})`
  - the admin/coach `coachavail` read (~3070) → `this.adminPost({action:'coachavail', coach: coachId, pass: this.state.authSecret})` (sends both `secret` (via chokepoint) and `pass`, so it works for admin or coach).
  Customer reads (`availability`, `lookup`, own `plans?email=`, `content`, public `coaches`) stay GET, unchanged.

- [ ] **Step 6: Mirror + verify.** `cp` + `diff … && echo IDENTICAL`. Build `_verify_auth.mjs` (Playwright; reach `logic` via the React fiber; stub `window.fetch` to record every request and to script responses). Assert:
  - Submitting the login with a code POSTs `{action:'staffLogin', code}`; a `{ok:true,role:'admin'}` response sets `logic.state.authed===true` and `authSecret===code`; a `{ok:false,reason:'bad-credentials'}` response leaves `authed` false and shows the error.
  - After admin login, trigger representative admin actions (e.g. a content save, a booking approve, `loadAllBookings`) and assert **every** captured request to the endpoint is a POST whose JSON body contains `secret` equal to the code; assert NO request URL contains `secret=` and NO admin read is a GET with `action=bookings`/`activity`/`cancellations`/`settings`.
  - An `{ok:false,reason:'unauthorized'}` response to any `adminPost` flips `authed` to false (re-login).
  - Run `node _verify_auth.mjs`; iterate to green; 0 real console errors. Keep the harness for Task 3.

- [ ] **Step 7: Commit.**
```bash
git add index.html "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Auth T2 (frontend): server-verified staffLogin; hold secret in memory; route all admin writes + sensitive reads through adminPost (secret in body); unauthorized→re-login"
```

---

### Task 3: Coach passcode write-only + remove frontend passcodes (`index.html`)

**Files:**
- Modify: `index.html` (Coaches-tab passcode field + edit handlers ~2763-2820; the `coaches()`/default coach seed wherever `pass` appears)
- Mirror: `Pasig Greenpark Archery Camp.dc.html`
- Test: `_verify_auth.mjs` (extend)

**Interfaces:** Consumes Task 1 (`listCoaches_` no longer returns `pass`) + Task 2 (`adminPost`). The coach roster the frontend renders no longer carries `pass`.

- [ ] **Step 1: Remove passcodes from frontend coach data.** Find the frontend coach seed/`coaches()` data that includes `pass` (grep `pass:` in `index.html` coach context) and remove the `pass` values, OR ensure `coaches()` derives solely from the (now passcode-free) backend `coaches` response + a passcode-free default. The frontend must never hold a coach passcode except transiently in an edit input.

- [ ] **Step 2: Passcode field → write-only.** In the Coaches-tab editor (~2796 add / ~2813 update), change the passcode input to a "Set a new passcode (leave blank to keep)" field bound to a transient edit-state value, NOT prefilled from coach data. On save: `addCoach` sends the typed passcode; `updateCoach` sends `pass` only when the field is non-blank (so blank = keep existing). Update the edit-open handler to NOT populate the passcode field. These writes go through `this.adminPost` (from Task 2).

- [ ] **Step 3: Mirror + verify + cleanup.** `cp` + `diff … && echo IDENTICAL`. Extend `_verify_auth.mjs`: assert the rendered coach roster/edit state contains no `pass` value (e.g. seed a backend `coaches` response without `pass` and confirm nothing in the DOM/state exposes a passcode); editing a coach with a blank passcode field omits `pass` from the `updateCoach` body, and a filled field includes it. Run `node _verify_auth.mjs` (all Task 2 + Task 3 assertions green, 0 real console errors). Delete scratch: `rm -f _verify_auth.mjs _auth*.png && rm -rf node_modules package.json package-lock.json`. Then commit:
```bash
git add index.html "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Auth T3 (frontend): coach passcode write-only; remove coach passcodes from the browser bundle"
```

---

## Self-review notes

- **Spec coverage:** server secret + guard (T1 S1), staffLogin (T1 S2), gate writes (T1 S3), gate+move reads (T1 S4-5), strip pass (T1 S6), version bump (T1 S7), copies+smoke test (T1 S8); frontend login (T2 S3), secret chokepoint + write routing (T2 S2,S4), reads-as-POST (T2 S5), unauthorized handling (T2 S2), coach write-only passcode + no frontend secrets (T3). Deploy/rotation steps live in the spec + the smoke-test doc. All spec sections map.
- **Type/name consistency:** `assertAdmin_`/`adminSecret_`/`unauthorized_`/`coachPassOk_`/`staffLogin_` (backend) defined in T1 and used there; `adminPost`/`handleUnauthorized`/`authSecret` defined in T2 S1-2 and consumed in T2 S4-5 + T3 S2.
- **Fail-closed & public flows:** T1 S3 explicitly leaves `book`/`cancel`/`reschedule`/`coachLogin`/`setCoachAvail`/`staffLogin` ungated; T1 S5 keeps the public GETs; assertAdmin_ returns false when `ADMIN_SECRET` unset.
- **No secret leakage:** reads are POST (no `secret=` in URLs — asserted T2 S6); `listCoaches_` strips `pass` (T1 S6); frontend holds the code only in memory (`authSecret`), never in the seed data (T3 S1).
- **Mirror/ES5/copies:** each frontend task ends with `cp`+`diff`; T1 keeps the three `.gs` copies identical and ES5-only.
- **No deploy in-branch:** backend correctness rests on review + the post-deploy smoke test (T1 S8); the owner sequences `ADMIN_SECRET` before the lock matters.
