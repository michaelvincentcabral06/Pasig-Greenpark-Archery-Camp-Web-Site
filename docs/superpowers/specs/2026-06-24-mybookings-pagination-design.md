# My Bookings pagination (sub-project D)

**Date:** 2026-06-24
**Problem:** The customer My Bookings lists — Upcoming sessions, Past sessions, Your passes —
render every item with no pagination, so they grow into an endless scroll (Past sessions
especially accumulates forever). The admin Plans/Bookings/Activity lists already paginate.

**Goal:** Paginate all three My Bookings lists at **5 items per page**, reusing the existing
admin pagination control. Frontend-only; no backend or pricing/booking-logic changes.

Mirror rule: every `index.html` edit is applied identically to
`Pasig Greenpark Archery Camp.dc.html` (byte-identical).

## Decisions (from brainstorming)
- Paginate all three customer lists: **Upcoming**, **Past**, **Passes**.
- **5 items per page** each.
- Reuse the admin prev/next + "Page X of Y" control verbatim (cream buttons, green text,
  centered), shown only when a list has more than one page.

## Existing pattern to reuse (admin Plans, for reference)
- Render (index.html ~4154): `const PL_PAGE = 8; const plPageCount = Math.max(1, Math.ceil(total/PL_PAGE)); const plPage = Math.min(Math.max(0, this.state.plPage || 0), plPageCount-1); const allPlans = filtered.slice(plPage*PL_PAGE, plPage*PL_PAGE+PL_PAGE);`
- Bindings (~4847): `plPageLabel: 'Page '+(plPage+1)+' of '+plPageCount`, `plHasPrev: plPage>0`, `plHasNext: plPage<plPageCount-1`, `plMultiPage: plPageCount>1`, `plPrev`/`plNext` (setState ∓1, clamped ≥0).
- Control markup (~1995): `<sc-if value="{{ plMultiPage }}"><div …center…><sc-if plHasPrev><button plPrev>← Prev</button></sc-if><span>{{ plPageLabel }}</span><sc-if plHasNext><button plNext>Next →</button></sc-if></div></sc-if>`.

## Design
### State (add near `plPage: 0` / `bkPage: 0`)
`acctUpPage: 0, acctPastPage: 0, acctPassPage: 0`.

### Render (My Bookings section)
The full arrays already exist: `acctUpcoming` (mapped from upcoming sessions, ~4262),
`acctPast` (~4263), `acctPlanRows` (passes, ~4245). For each, after the full array is built,
add `const ACCT_PAGE = 5;` and compute page count + clamped page + the sliced page, then
expose the SLICED array under the SAME binding name the `<sc-for>` already uses (so row markup
is unchanged). Example for upcoming:
```js
const acctUpAll = acctUpcoming;                 // full mapped list
const acctUpPageCount = Math.max(1, Math.ceil(acctUpAll.length / ACCT_PAGE));
const acctUpPage = Math.min(Math.max(0, this.state.acctUpPage || 0), acctUpPageCount - 1);
const acctUpPaged = acctUpAll.slice(acctUpPage * ACCT_PAGE, acctUpPage * ACCT_PAGE + ACCT_PAGE);
```
Repeat for `acctPast*` and `acctPass*` (passes use `acctPlanRows`). The binding block exposes
the paged slices: `acctUpcoming: acctUpPaged, acctPast: acctPastPaged, acctPlanRows: acctPassPaged`.

### Bindings (one set per list, mirroring the admin pattern)
For each of up/past/pass:
`<x>PageLabel: 'Page '+(<x>Page+1)+' of '+<x>PageCount`, `<x>HasPrev: <x>Page>0`,
`<x>HasNext: <x>Page<<x>PageCount-1`, `<x>MultiPage: <x>PageCount>1`,
`<x>Prev: () => this.setState(s => ({ <x>Page: Math.max(0, (s.<x>Page||0)-1) }))`,
`<x>Next: () => this.setState(s => ({ <x>Page: (s.<x>Page||0)+1 }))`.
Names: `acctUp…`, `acctPast…`, `acctPass…`.

### Markup (insert one control after each list's `<sc-for>`)
After the Upcoming `<sc-for list="{{ acctUpcoming }}">…</sc-for>` (~1591), the Past
`<sc-for list="{{ acctPast }}">` (~1643), and the Passes `<sc-for list="{{ acctPlanRows }}">`
(~1664), insert the admin control markup with the per-list binding names (e.g. `acctUpMultiPage`,
`acctUpHasPrev`, `acctUpPrev`, `acctUpPageLabel`, `acctUpHasNext`, `acctUpNext`).

### Page reset
- On `accountLogin` success and `accountLogout`, reset `acctUpPage: 0, acctPastPage: 0, acctPassPage: 0` (fresh view starts at page 1).
- The render clamp (`Math.min(…, pageCount-1)`) auto-corrects the page if a list shrinks (e.g. after a cancel), so no empty-page dead-end.

## Out of scope
- Admin lists (already paginate); the admin dashboard "Upcoming schedule" strip; booking/pricing/backend.
- Per-list filters/search on My Bookings (not requested).

## Risks / watch-items
- **Empty-state / count flags use the FULL list, not the paged slice.** `hasAcctPlans`
  (`acctPlanRows.length > 0`, ~4778) and any "no upcoming/past" empty-state checks must be
  computed from the full arrays (`acctUpAll`/`acctPastAll`/`acctPlanRows` full), then expose
  the paged slice under the binding name. Otherwise an empty 2nd page would wrongly trigger
  the empty state.
- `<sc-for>` row markup must stay unchanged — only the array it iterates is now a 5-item slice.
- Keep `<sc-if>` nesting balanced around the three new controls.
- index.html and the .dc.html mirror byte-identical.

## Verification
Playwright with the backend stubbed to return 12 sessions (so 3 pages) + 12 past + 7 passes:
- Each list shows ≤5 items; its control reads "Page 1 of N".
- Next advances the page (different items shown), Prev goes back; clamps at the ends.
- A list with ≤5 items shows NO control.
- The three lists paginate independently (advancing Upcoming doesn't move Past).
- Mirror parity IDENTICAL.
