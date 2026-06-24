# Activity log + admin tab rename (sub-project F)

**Date:** 2026-06-25
**Goal:** Rename two admin tab labels and make the activity log show **who did what** — an
actor (client vs admin), more logged events, before→after details, and friendlier wording.

## Problems today
- Admin tab labels are confusing: the **"Bookings"** tab is actually the activity log, and
  **"Plans & Sessions"** is where bookings/passes are managed.
- The activity log records Approved / Cancelled / Coach changed / Session scheduled / Session
  removed, each with ref + name + a short detail + timestamp — but:
  - every entry looks the same whether the **client** self-served or the **admin** did it;
  - some client actions aren't logged at all (pass purchased, pass removed, reschedule);
  - "Coach changed" shows only the new coach, not the previous one;
  - the terse labels don't read in plain language.

## Decisions (from brainstorming)
- **Rename labels only** (not internal `adminTab` keys): "Bookings" → **"Activity"**;
  "Plans & Sessions" → **"Bookings"**. Keys stay `'bookings'` (activity) and `'plans'`
  (bookings) to avoid churn.
- Add **all four** enrichments: actor (client/admin), more events, before→after detail,
  friendlier wording.
- Store the **actor as a real backend column** (db-v17) so it can be filtered reliably.
- **Deploy ordering:** merge → user deploys db-v17 → push frontend. Frontend degrades
  gracefully on db-v16 (actor simply dropped → blank → no badge).

## Constraints
- Mirror rule: every `index.html` edit applied identically to
  `Pasig Greenpark Archery Camp.dc.html` (byte-identical).
- Backend is Google Apps Script, **ES5 only** (var/function; no arrow/const/let/template
  literals; trailing-underscore privates). Three `.gs` files byte-identical:
  `backend/Code.gs`, `backend/Code.LATEST.gs`, new `backend/Code.v17.gs`.
- Apps Script can't be tested here — backend is review-gated + a `backend/SETUP.md` checklist.
  Frontend verified with Playwright (backend stubbed).

## Backend — db-v17 (additive `Actor` column)
File: `backend/Code.gs` (+ identical `Code.LATEST.gs` + new `Code.v17.gs`).
1. **Activity schema** (line ~87): append `'Actor'` to the headers array →
   `['At','Ref','Action','Detail','Name','Email','Actor']`.
2. **`dbLog_`** (line ~113): add an `actor` param and a 7th cell:
   `function dbLog_(ref, action, detail, name, email, actor) { dbAppend_('activity', [nowStr_(), ref||'', action||'', detail||'', name||'', email||'', actor||'']); }`
3. **`logAction_`** (line ~847): pass `body.actor` →
   `dbLog_(body.ref||'', body.label||'', body.detail||'', body.name||'', body.email||'', body.actor||'');`
4. **`listActivity_`** (line ~833): add `actor: String(row[6] || '')` to each returned object.
5. **Version**: bump the `version` response to `db-v17`, keep every prior flag (incl.
   `reschedule`, `contentStore`), add `activityActor: true`.
6. Sync the three `.gs` files byte-identical; append a "db-v17 deploy & verify" checklist to
   `backend/SETUP.md`.
- **Migration:** existing 6-column rows read back `actor:''` (Sheets pads ragged rows). A
  blank actor renders as "unknown" — no badge, friendly text falls back to the plain action.

## Frontend — `index.html` + mirror

### A. Tab label + copy rename
- The tab button labelled `Bookings` (the one bound to `goTabBookings`, ~line 1789) → text
  **`Activity`**. The button labelled `Plans &amp; Sessions` (bound to `goTabPlans`, ~1790) →
  text **`Bookings`**.
- Update user-facing copy that names the old tabs:
  - Activity-tab subhead (~1906) "All managing is done in the Plans &amp; Sessions tab." →
    "All managing is done in the **Bookings** tab."
  - Activity empty state (~1918) "…scheduling in Plans &amp; Sessions will be logged here." →
    "…scheduling in **Bookings** will be logged here."
  - Scan the file for any other user-visible "Plans & Sessions" / "Plans &amp; Sessions" string
    and rename to "Bookings"; leave internal `adminTab === 'plans'` / `'bookings'` keys and
    variable names unchanged.

### B. `logAction` gains an actor + richer callers
- Signature: `logAction(ref, label, detail, name, email, actor)` — add `actor` to the POST body
  (`actor: actor || ''`).
- Existing callers (tag the actor; enrich detail where noted):
  - **Approved** (~3704) → actor `'admin'`.
  - **Cancelled** (~3667) → actor `'admin'`.
  - **Coach changed** (~3784) → actor `'admin'`; detail becomes **prev→new**:
    `(prevName || 'Unassigned') + ' → ' + (newName || 'Unassigned') + ' · ' + holder`
    (`assignPlanCoach` already computes `prevName`/`newName`).
  - **Session removed** (~3878) → actor `'admin'`.
  - **Session scheduled** (~3839, in `addPlanSession`) → actor passed in: thread a new
    `actor` parameter through `addPlanSession(email, ts, date, time, cap, actor)` defaulting to
    `'admin'`; `addAcctPlanSession` (the customer path) calls it with `'client'`.
- New log calls (events not logged today):
  - **Pass purchased** — in `purchasePlan` (~3515, public buy) and `addAcctPlan` (~3525,
    account-page add): actor `'client'`, label `'Pass purchased'`, detail
    `passName + ' ' + price + ' · ' + holder`. Use the plan's `ref` (call `ensurePlanRef` or the
    just-created `newPlan.ref`).
  - **Pass removed** — in `removeAcctPlan` (~3532, customer removes their own pass): actor
    `'client'`, label `'Pass removed'`, detail `passName + ' · ' + holder`.
  - **Rescheduled** — in `saveEdit` (~3463, My Bookings reschedule), on success: actor
    `'client'`, label `'Rescheduled'`, detail
    `oldDate oldTime + ' → ' + newDate newTime + ' · ' + name` (use `prettyDateStr` for dates).
- Keep `label` values as the **stable short action type** (used by the pill + the per-action
  filter). Friendly wording is derived at display time, NOT stored.

### C. Display — friendly line, actor badge, filter
In the activity-rows mapping (the `activityRows` builder feeding the markup at ~1921-1931):
- Compute an **actor badge**: `actor === 'client'` → `{ text: 'by client', bg:'#dce9f5', fg:'#2c5b86' }`;
  `'admin'` → `{ text: 'by you', bg:'#e6efd6', fg:'#4d7327' }`; else (blank/legacy) → no badge
  (`hasActor: false`).
- Compute a **friendly line** from `(action, actor)` — a small lookup, falling back to the raw
  action label when unknown:
  | action | client | admin |
  |---|---|---|
  | Session scheduled | Client booked a session | You booked a session |
  | Rescheduled | Client rescheduled a session | You rescheduled a session |
  | Pass purchased | Client bought a pass | You added a pass |
  | Pass removed | Client removed a pass | You removed a pass |
  | Session removed | Client removed a session | You removed a session |
  | Cancelled | Client cancelled | You cancelled a pass |
  | Approved | — | You approved a pass |
  | Coach changed | — | You changed the coach |
  (Unknown action or blank actor → show the raw `action` label as the friendly line.)
- **Markup** (mirror the existing entry layout, ~1922-1930): keep the colored action pill
  (`a.action`); add the actor badge pill beside it (gated by `a.hasActor`); make the bold line
  the **friendly line** (`a.friendly`); keep the `ref · name`, the before→after `detail`, the
  phone, and the timestamp lines. New `<sc-if>` for the badge carries `hint-placeholder-val`.
- **Filter:** extend `actFilterOpts` with `{ id:'actor:client', name:'By client' }` and
  `{ id:'actor:admin', name:'By you (admin)' }` (in addition to the existing per-action
  options). The activity filter predicate: when the selected filter id starts with `actor:`,
  match `entry.actor === <suffix>`; otherwise keep the current per-action matching. The text
  search continues to match ref / name / action (and may also match the friendly line).

## Out of scope
- Editable coaches/testimonials, dashboard pagination (sub-projects G/I).
- Per-admin identity (there is a single admin/owner — "by you" suffices; no login-per-staff).
- Back-filling actor onto historical entries (they render badge-less; acceptable).
- Changing what any action DOES — only what is recorded and how it reads.

## Risks / watch-items
- **Graceful degradation:** on db-v16 (pre-deploy) the backend ignores `actor`; entries still
  log, just without an actor → blank badge. No breakage. New entries written before the deploy
  permanently lack actor (acceptable).
- **Filter integrity:** the per-action filter must keep working; the `actor:` filter is a new
  branch, not a replacement. Confirm "clear filters" resets both.
- **Friendly fallback:** any unmapped action or blank actor must still render a sensible line
  (the raw action), never blank.
- **ES5 backend**, three `.gs` files byte-identical; `index.html` ≡ `.dc.html` mirror.
- Single low-risk schema change (append a column) — old rows stay valid.

## Verification
- **Frontend (Playwright, stubbed backend):**
  - Tab labels read "Activity" and "Bookings"; clicking them shows the activity log and the
    bookings (ex–Plans & Sessions) panels respectively; no stray "Plans & Sessions" text in the
    admin UI.
  - Stub `?action=activity` to return entries with `actor:'client'`, `actor:'admin'`, and
    `actor:''` → assert the client entry shows "by client" + its friendly line, the admin entry
    shows "by you", and the legacy (blank) entry shows the raw action with no badge.
  - Selecting **By client** filters to only client entries; **By you (admin)** to only admin;
    a per-action filter still works; "clear filters" restores all.
  - Drive a customer pass purchase, a self-schedule, a reschedule, and a pass removal → assert
    each fires a `logAction` POST with the right `label` and `actor:'client'` (+ before→after
    detail for reschedule). Drive an admin coach change → `actor:'admin'` with a "prev → new"
    detail.
  - Mirror parity `diff index.html "Pasig Greenpark Archery Camp.dc.html"` → IDENTICAL.
- **Backend (cannot run here): `backend/SETUP.md` db-v17 checklist** — deploy db-v17, confirm
  `?action=version` = `db-v17` with `activityActor:true` (and all prior flags); perform one
  admin action + one client action on the live site; confirm both appear in the Activity tab
  with the correct "by you" / "by client" badge, and the `Actor` column is populated in the
  sheet.
