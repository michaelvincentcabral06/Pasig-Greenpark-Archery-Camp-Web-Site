# Pass scope control (sub-project E)

**Date:** 2026-06-25
**Goal:** Give every pass an explicit **session-count cap** and a **validity window**,
**enforce both at scheduling**, and let admin **add/remove passes and edit each pass's
feature bullets, cap, and validity** — all synced to every device.

**Problem today:**
- A pass's session cap is *derived by regex* from its name/unit string (`planCapFor`:
  `"4 sessions"` → 4; `"Monthly"`/`"Unlimited"` → no cap; everything else → 1). Admin can't
  set it as a real number, and **Monthly Member is literally uncapped** — a member can
  schedule unlimited sessions.
- **Validity/expiry is not enforced at all.** "Valid for 2 months" is display-only copy;
  nothing stops a customer scheduling a session months later or beyond the membership period.
- Admin can edit only **name / price / unit / description** of *existing* passes — no
  add/remove passes, no editing the **feature bullets**, no cap or validity fields.

Constraints:
- Mirror rule: every `index.html` edit applied identically to
  `Pasig Greenpark Archery Camp.dc.html` (byte-identical).
- **No backend change.** Passes already live in the server-backed content store (db-v15
  `setContent`/`content`). This sub-project rides on it — **no Apps Script version bump.**
- Frontend verified with Playwright (backend stubbed), per the established harness.

## Decisions (from brainstorming)
- **Validity = rolling days from purchase.** Each pass is valid for N days counted from the
  purchase date. Expiry date = purchase date + N days.
- **Cap = always a required number** (no "unlimited" option). Monthly defaults to 10.
- **Rules are stamped onto each pass when bought** — the cap and the computed expiry date are
  copied onto the customer's pass at purchase, so later admin edits never retroactively change
  an existing customer's pass, and a pass keeps working even if the offering is renamed/removed.
- **Expired/full passes stay visible (greyed)** with a short note; the Schedule button is
  hidden. History (already-scheduled sessions) remains intact.

## Data model

### Package definition (in content; the editable offering)
Each entry in `cm.packages` gains two numbers and keeps its bullets:
```js
{ name, price, unit, desc,
  features: ['1 guided session', 'All equipment provided', ...],  // editable bullets
  sessions: 4,        // NEW — max sessions (required, integer ≥ 1)
  validDays: 60,      // NEW — validity window in days (required, integer ≥ 1)
  popular, bg, fg, border, tick, btnBg, btnFg }                    // unchanged display fields
```

**Defaults** (applied in the `defaultPackages` literal at index.html ~3811 and in the
`mergedContent` defaults at ~3825) — every default pass gets explicit `sessions` + `validDays`:

| Pass | `sessions` | `validDays` |
|---|---|---|
| Day Pass | 1 | 30 |
| Starter Pack | 4 | 60 |
| Monthly Member | **10** | 30 |
| Private Coaching | 1 | 60 |

(The existing `features` arrays are unchanged in content but become admin-editable.)

### Customer pass (the purchased plan)
On purchase, stamp the cap + expiry onto the plan object (created in `purchasePlan` ~3515 and
`addAcctPlan` ~3527). New fields:
```js
{ name, ts, holder, phone, price, ref, sessions:[...], coach, status, updatedAt,
  cap: 10,                 // NEW — stamped from the package's sessions at purchase
  validDays: 30,           // NEW — stamped from the package at purchase
  expiry: '2026-07-25' }   // NEW — computed: purchase-date + validDays, as YYYY-MM-DD
```
`expiry` is the last day the pass is valid (inclusive). Computed from the purchase date
(`new Date(ts)` → local Y/M/D) plus `validDays`.

## Resolver helpers (read cap + expiry, with safe fallbacks)

Replace the cap logic and add an expiry resolver. Both prefer the **stamped plan value**,
then the **live package value**, then a **legacy fallback**, so old passes and removed
offerings never break.

```js
// Max sessions for a purchased plan: stamped → live package → legacy name-regex → 1.
planCapFor2(plan) {
  if (plan && plan.cap != null && plan.cap !== '') return Math.max(1, parseInt(plan.cap, 10) || 1);
  var pk = this.packageByName(plan && plan.name);
  if (pk && pk.sessions != null && pk.sessions !== '') return Math.max(1, parseInt(pk.sessions, 10) || 1);
  return this.legacyCapFromName(plan && plan.name);   // existing regex: "N sessions" → N; month/unlimited → null; else 1
}
// Expiry (YYYY-MM-DD inclusive) for a purchased plan, or '' if none resolvable.
planExpiry(plan) {
  if (!plan) return '';
  if (plan.expiry) return plan.expiry;
  var days = (plan.validDays != null && plan.validDays !== '') ? parseInt(plan.validDays, 10) : null;
  if (days == null) { var pk = this.packageByName(plan.name); days = pk && pk.validDays != null ? parseInt(pk.validDays, 10) : null; }
  if (days == null || isNaN(days) || !plan.ts) return '';     // unknown → no expiry enforced (legacy-safe)
  return this.addDaysStr(this.tsToDateStr(plan.ts), days);    // 'YYYY-MM-DD'
}
isPlanExpired(plan) { var e = this.planExpiry(plan); return !!e && this.todayStr() > e; }     // string compare on YYYY-MM-DD
```
- `packageByName(name)` — `(this.state.content.packages || defaults).find(p => p.name === name)`.
- `tsToDateStr(ts)` — local `YYYY-MM-DD` for a purchase timestamp.
- `addDaysStr(dateStr, n)` — add n days to a `YYYY-MM-DD`, return `YYYY-MM-DD`.
- `legacyCapFromName(name)` — the *current* `planCapFor` body (regex), kept as the final fallback
  so passes bought before this ships still resolve a cap.

(Names `planCapFor2`/`legacyCapFromName` are illustrative; the plan may keep the name
`planCapFor` and change its signature to take a plan. The contract is: **prefer stamped, then
package, then legacy**, never return 0/NaN.)

## Enforcement (the actual fix)

Apply at **every** scheduling entry point — the customer self-schedule and the admin
scheduling on a customer's behalf:

1. **Cap** — block scheduling when `plan.sessions.length >= planCapFor2(plan)`. (Already wired
   via `atCap`/`canSchedule` in `acctPlanRows` ~4394-4409 and the admin `adminPlanRows`
   ~4249-4280 / `addPlanSession` cap guard ~3721 — repoint them at the new resolver.)
2. **Validity** — the **chosen session date must be ≤ `planExpiry(plan)`**. Enforce in:
   - `addPlanSession(email, ts, date, time, cap)` (~3717) and `addAcctPlanSession` (~3706):
     reject when `date > expiry` (guard returns, sets a message, no calendar write).
   - The self-schedule **slot/date picker** (`openAcctSched` flow → `loadSlots`/date input,
     ~4700-4714): dates after expiry are not selectable / yield no slots, with a note
     "This pass is valid through Jul 20."
   - The admin per-plan schedule date picker (`adminPlanRows[].slotChoices`, the
     `planEditDate`-driven add at ~4266): same `date > expiry` block.
3. **Card status copy:**
   - Customer pass card (`acctPlanRows` ~4395-4415): `schedLabel` → `"3 of 10 scheduled"`;
     add `expiryLabel` → `"Expires Jul 20"` (or `"Expired Jul 20"` when past). When
     `atCap` **or** `isPlanExpired`, hide the Schedule button and show a short note
     (`capFullLabel` already exists for the full case; add an expired case).
   - Expired/full passes **remain visible, greyed** — do not hide; already-scheduled sessions
     still render.

## Admin: add / remove passes + edit everything (Pricing tab)

Extend `pkgEdits` (~4166) and the Pricing-tab markup (~2173 region) so each pass row exposes,
in addition to the existing name/price/unit/desc:
- **Max sessions** — number input → `saveCM({ packages: ps with sessions: Number(v)||1 })`.
- **Valid for __ days** — number input → `saveCM({ packages: ps with validDays: Number(v)||1 })`.
- **Feature bullets** — a list of text inputs with **add** / **remove** per bullet
  (`saveCM({ packages: ps with features: [...] })`), mirroring the class-schedule editor's
  add/remove pattern (`scheduleEdit` ~4170-4179).
- **Remove this pass** button per row → `saveCM({ packages: cm.packages.filter((_,idx)=>idx!==i) })`.

Add an **"Add a pass"** button below the list → appends a new package with safe placeholders:
```js
{ name: 'New pass', price: '₱0', unit: '', desc: '', features: ['1 session'],
  sessions: 1, validDays: 30, popular: false,
  bg:'#fffdf6', fg:'#1b2a1f', border:'rgba(36,66,50,0.12)', tick:'#3c6b48', btnBg:'#244232', btnFg:'#f4efe4' }
```
All edits flow through the existing `saveCM`/`persistContent` → content store → every device
and the public Passes page (which already renders `cm.packages` + `pk.features`).

## Out of scope
- Tab renames + richer activity log, editable coaches/testimonials, dashboard pagination
  (separate sub-projects F/G/I).
- Per-pass concession/discount rules, proration, or payment changes.
- Real-time expiry push (expiry is evaluated on each page load / scheduling action — sufficient).
- Backend/Apps Script changes — none; this rides on the existing content store.

## Risks / watch-items
- **Never return 0/NaN** from the cap or expiry resolvers — the stamped→package→legacy fallback
  must always yield a usable value; a missing/blank field must degrade to "no expiry / legacy
  cap", never to "blocked" or "unlimited-by-accident".
- **Date comparison** is string compare on `YYYY-MM-DD` (lexicographic == chronological for that
  format) and uses the site's existing local-date helpers (`todayStr`, the `isPastSlot` date
  basis) — keep the same timezone basis to avoid off-by-one at midnight.
- **Legacy passes** (bought before this ships) have no `cap`/`expiry`; they resolve via the
  package def or legacy regex, and `planExpiry` returns `''` (no expiry enforced) when nothing
  is resolvable — they keep working, never get locked out.
- **Removed offering:** a customer holding a pass whose package was deleted still resolves cap
  from the stamped value and expiry from the stamped value — fully self-contained.
- `index.html` ≡ the `.dc.html` mirror byte-identical.

## Verification (Playwright, stubbed content)
- **Cap:** stub content with `Monthly Member { sessions: 2 }`; buy it; schedule 2 sessions →
  the 3rd is blocked (Schedule hidden, "All 2 scheduled"). Confirm the card reads "2 of 2".
- **Validity:** stub `Monthly Member { validDays: 5 }`; buy it (purchase date stamped); in the
  self-schedule picker, a date 10 days out is **not** bookable while a date 3 days out **is**;
  the card shows "Expires <date>".
- **Stamping:** after buying, the saved plan (savePlan POST body) carries `cap`, `validDays`,
  and an `expiry` string; then change the package's `validDays` in admin → the *existing*
  bought pass keeps its original expiry (not retroactively shortened).
- **Expired:** stub a plan whose `expiry` < today → card greyed, "Expired <date>", no Schedule
  button; its already-scheduled sessions still render.
- **Admin editor:** add a pass → it appears on the public Passes page with its bullets; edit a
  bullet / Max sessions / Valid-days → a `setContent` POST fires and the Passes page reflects it;
  remove a pass → it disappears from the public list.
- **Mirror parity** `diff index.html "Pasig Greenpark Archery Camp.dc.html"` → IDENTICAL.
