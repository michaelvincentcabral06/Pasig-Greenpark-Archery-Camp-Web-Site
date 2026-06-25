# Admin "Sessions" list — all booked sessions (sub-project E)

**Date:** 2026-06-25
**Goal:** Give admin a single, paginated, filtered list of **every booked session** (single
bookings + pass sessions) inside the **Bookings** tab, via a **[Sessions | Passes]** toggle —
fixing "bookings not showing the sessions booked." Each row supports **Cancel** and **assign/
change coach**.

## Problem today
- `?action=bookings` (`listBookings_`) already returns **every** booking across the business
  (calendar + sheet, single + `(plan)` sessions) with `{ bookedAt, ref, status, date, time,
  program, name, email, phone, archers, amount, coach, eventId }`. The frontend loads it into
  `state.allBookings`, but the only place it's shown is the **dashboard "upcoming"** (future,
  capped). The `bookingRows` builder (~index.html:4485) exists but is **never rendered**.
- The admin **"Bookings"** tab (internal key `'plans'`) shows **passes** (`adminPlanRows`), not
  booked sessions — which is exactly why bookings "weren't showing."

## Decisions (from brainstorming)
- A **[Sessions | Passes]** toggle at the top of the Bookings tab; **Sessions** (the new
  all-bookings list) is the default; **Passes** is the existing pass-management UI, unchanged.
- The Sessions list reads `state.allBookings` (loaded when the tab opens). Columns: **date ·
  time · name · program · coach · amount · status**, plus **phone** (call link) and **ref**.
- Filters: **search** (name/program/ref/email), **status** (All/Pending/Approved/Cancelled),
  **coach** (All + each coach), **timeframe** (All/Upcoming/Past). **10 per page**, Prev/Next +
  count, sorted **most-recent-first** (date+time desc). Changing a filter resets to page 1.
- Per-row actions: **assign/change coach** (a `<select>` → `assignBookingCoach`) and **Cancel**
  (admin `cancelBooking('admin')` + reload). Reuses existing handlers.
- **No backend change, no deploy** — frontend list over existing data.

## Constraints
- Mirror rule: every `index.html` edit applied identically to
  `Pasig Greenpark Archery Camp.dc.html` (byte-identical).
- Frontend-only; reuses `assignBookingCoach(b, coachId)` (~3525), the admin `cancelBooking(entry,
  true, 'admin')`, and `isSessionUsed(date, time)` (Manila-correct, from sub-project J).
- Independent state (`bkView`, `sess*`) — do NOT reuse the Activity tab's `bkFilter`/`bkSearch`/
  `bkPage` or the dashboard's `dashUp*`.

## State (added to the initial state)
```js
    bkView: 'sessions',     // 'sessions' | 'passes' — the Bookings-tab toggle
    sessSearch: '', sessStatus: 'all', sessCoach: 'all', sessRange: 'all', sessPage: 0,
```

## Load trigger
In `adminSetTab` (~index.html:4328), the `'plans'` branch currently calls `loadRemotePlans()`;
add `this.loadAllBookings();` so the Sessions list is populated when the Bookings tab opens.

## Builder (`sessionRows`, in the admin render section)
```js
    const sessStatusInfo = (st) => {
      st = String(st || 'booked').toLowerCase();
      if (st === 'approved') return { label: 'Approved', bg: '#e6efd6', fg: '#4d7327' };
      if (st === 'cancelled') return { label: 'Cancelled', bg: '#f3e2e0', fg: '#b4512f' };
      return { label: 'Pending', bg: '#fff1cf', fg: '#8a6a1f' };
    };
    const sessSearch = (this.state.sessSearch || '').trim().toLowerCase();
    const sessStatus = this.state.sessStatus || 'all';
    const sessCoach = this.state.sessCoach || 'all';
    const sessRange = this.state.sessRange || 'all';
    const sessFiltered = (this.state.allBookings || []).filter(b => {
      const st = String(b.status || 'booked').toLowerCase();
      if (sessStatus !== 'all') {
        if (sessStatus === 'pending') { if (st === 'approved' || st === 'cancelled') return false; }   // pending = anything not approved/cancelled (incl. 'booked'/blank)
        else if (st !== sessStatus) return false;
      }
      if (sessCoach !== 'all' && String(b.coach || '') !== sessCoach) return false;
      if (sessRange === 'upcoming' && this.isSessionUsed(b.date, b.time)) return false;
      if (sessRange === 'past' && !this.isSessionUsed(b.date, b.time)) return false;
      if (sessSearch) {
        const hay = ((b.name || '') + ' ' + (b.program || '') + ' ' + (b.ref || '') + ' ' + (b.email || '')).toLowerCase();
        if (hay.indexOf(sessSearch) === -1) return false;
      }
      return true;
    }).sort((a, b) => (((b.date || '') + (b.time || '')).localeCompare((a.date || '') + (a.time || ''))));
    const SESS_PAGE = 10;
    const sessTotal = sessFiltered.length;
    const sessPageCount = Math.max(1, Math.ceil(sessTotal / SESS_PAGE));
    const sessPage = Math.min(Math.max(0, this.state.sessPage || 0), sessPageCount - 1);
    const sessionRows = sessFiltered.slice(sessPage * SESS_PAGE, sessPage * SESS_PAGE + SESS_PAGE).map(b => {
      const c = b.coach ? this.coachById(b.coach) : null;
      const si = sessStatusInfo(b.status);
      let when = b.date; try { when = new Date(b.date + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' }); } catch (e) {}
      return {
        when: when, time: b.time || '', name: b.name || 'Guest', program: b.program || '',
        coachName: c ? c.name : 'Any coach', coachId: b.coach || '',
        amountLabel: b.amount ? ('₱' + Number(b.amount).toLocaleString('en-PH')) : '',
        statusLabel: si.label, statusBg: si.bg, statusFg: si.fg,
        ref: b.ref || '', hasRef: !!b.ref,
        phone: b.phone || '', hasPhone: !!b.phone, callHref: 'tel:' + (b.phone || '').replace(/[^0-9+]/g, ''),
        setCoach: (e) => this.assignBookingCoach(b, e.target.value),
        cancel: () => this.cancelSessionBooking(b),
        isCancelled: String(b.status || '').toLowerCase() === 'cancelled',
      };
    });
    const sessFilteredActive = (sessStatus !== 'all' || sessCoach !== 'all' || sessRange !== 'all' || !!sessSearch);
    const sessStatusOpts = [{ id: 'all', name: 'All statuses' }, { id: 'approved', name: 'Approved' }, { id: 'pending', name: 'Pending' }, { id: 'cancelled', name: 'Cancelled' }];
    const sessRangeOpts = [{ id: 'all', name: 'All time' }, { id: 'upcoming', name: 'Upcoming' }, { id: 'past', name: 'Past' }];
    const sessCoachOpts = [{ id: 'all', name: 'All coaches' }].concat(this.coaches().map(c => ({ id: c.id, name: c.name })));
    const sessAssignOpts = [{ id: '', name: 'Any coach' }].concat(this.coaches().map(c => ({ id: c.id, name: c.name })));
    const setSess = (key) => (e) => this.setState({ [key]: e.target.value, sessPage: 0 });
    const sessPrev = () => this.setState({ sessPage: Math.max(0, sessPage - 1) });
    const sessNext = () => this.setState({ sessPage: Math.min(sessPageCount - 1, sessPage + 1) });
    const clearSessFilters = () => this.setState({ sessSearch: '', sessStatus: 'all', sessCoach: 'all', sessRange: 'all', sessPage: 0 });
```
**Status filter note:** the backend default status is `'booked'`; the badge maps non-approved /
non-cancelled to "Pending". The `pending` filter id matches by treating `booked`/`pending` as
Pending — implement the status match so selecting **Pending** shows rows whose status is neither
`approved` nor `cancelled` (i.e. `st !== 'approved' && st !== 'cancelled'`), rather than a strict
`=== 'pending'`. (Update the `sessStatus !== 'all' && st !== sessStatus` line accordingly.)

## New handler
```js
  cancelSessionBooking(b) {
    const msg = b.eventId
      ? ('Cancel this booking? This removes the calendar event' + (b.email ? ' and emails ' + b.email : '') + '.')
      : 'Cancel this booking?';
    if (typeof confirm !== 'undefined' && !confirm(msg)) return;
    this.cancelBooking({ eventId: b.eventId, ref: b.ref, date: b.date, time: b.time, name: b.name, email: b.email }, true, 'admin')
      .then(() => this.loadAllBookings());
  }
```
(`assignBookingCoach` already POSTs `setBookingCoach` and calls `loadAllBookings()` — reuse as-is.)

## Render return additions
`bkView`, `bkViewSessions: this.state.bkView !== 'passes'`, `bkViewPasses: this.state.bkView === 'passes'`,
`goSessions`/`goPasses` (set `bkView`), `bkSessTabBg/Fg` + `bkPassTabBg/Fg` (active-state colors),
`sessionRows`, `sessCount: sessTotal`, `sessNone: sessTotal === 0`, `sessFiltered: sessFilteredActive`,
`sessSearch`/`sessStatus`/`sessCoach`/`sessRange` (values), `sessStatusOpts`/`sessRangeOpts`/`sessCoachOpts`/`sessAssignOpts`,
`setSessSearch`/`setSessStatus`/`setSessCoach`/`setSessRange` (= `setSess('sessSearch')` etc.), `clearSessFilters`,
`sessMultiPage: sessPageCount > 1`, `sessHasPrev: sessPage > 0`, `sessHasNext: sessPage < sessPageCount - 1`,
`sessPageLabel: 'Page ' + (sessPage + 1) + ' of ' + sessPageCount`, `sessPrev`, `sessNext`.

## Markup (Bookings tab, `<sc-if value="{{ tabPlans }}">` ~index.html:1954)
1. At the TOP of the tab, add the toggle (two pill buttons, active = filled green):
```html
          <div style="display:flex;gap:8px;margin-bottom:18px;">
            <button onClick="{{ goSessions }}" style="background:{{ bkSessTabBg }};color:{{ bkSessTabFg }};border:1px solid rgba(36,66,50,0.16);cursor:pointer;font-family:'Hanken Grotesk',sans-serif;font-size:14px;font-weight:700;padding:9px 18px;border-radius:999px;">Sessions</button>
            <button onClick="{{ goPasses }}" style="background:{{ bkPassTabBg }};color:{{ bkPassTabFg }};border:1px solid rgba(36,66,50,0.16);cursor:pointer;font-family:'Hanken Grotesk',sans-serif;font-size:14px;font-weight:700;padding:9px 18px;border-radius:999px;">Passes</button>
          </div>
```
2. **Sessions view** — `<sc-if value="{{ bkViewSessions }}">`: a filter bar (search input + Status,
   Timeframe, Coach `<select>`s from the opt lists), a count line with "clear filters" (gated by
   `sessFiltered`), the rows list (`<sc-for list="{{ sessionRows }}">` — each a card showing
   `when · time`, `name`, `program · coachName`, the status badge, phone call-link, ref; plus a
   coach `<select value="{{ r.coachId }}" onChange="{{ r.setCoach }}">` over `sessAssignOpts` and
   a **Cancel** button `onClick="{{ r.cancel }}"`), a filter-aware empty state
   (`sessNone` → "No sessions match these filters." / "No sessions booked yet."), and the Prev/Next
   pagination (gated by `sessMultiPage`). Mirror the Activity-tab filter/pagination styling.
3. **Passes view** — wrap the EXISTING Bookings-tab content (the `adminPlanRows` filters, list,
   pagination — everything currently inside the tab) in `<sc-if value="{{ bkViewPasses }}">` so it
   shows only when Passes is selected. No change to that content itself.

## Out of scope
- Inline editing of booking details (date/time/party/concession) — admin uses the existing
  reschedule/cancel + the pass tools; this list is view + cancel + coach-assign.
- The dashboard redesign, My Bookings filters, mobile — separate sub-projects.
- Backend changes — `?action=bookings` already returns everything needed.

## Risks / watch-items
- **State isolation:** new `bkView`/`sess*` keys only; the Activity tab's `bk*` and the
  dashboard's `dashUp*` are untouched.
- **Page clamp + filter reset:** `sessPage` clamped to `[0, sessPageCount-1]`; every filter setter
  resets `sessPage:0`.
- **Pending status match:** selecting "Pending" must match `booked`/blank/`pending` (anything not
  approved/cancelled), not a literal `=== 'pending'`.
- **Coach value sync:** the per-row coach `<select>` value is `r.coachId` (the stored coach id, ''
  = unassigned); on change `assignBookingCoach` posts and reloads `allBookings`, re-rendering the
  row with the new coach.
- **Cancel refresh:** `cancelSessionBooking` reloads `allBookings` so the cancelled row reflects
  its new status (it stays visible with a "Cancelled" badge until filtered out).
- `index.html` ≡ the `.dc.html` mirror byte-identical. No backend change, no deploy.

## Verification (Playwright, stubbed backend)
- Stub `?action=bookings` to return ~20 bookings across two coaches, varied statuses
  (approved/booked/cancelled), dates (past + future), and programs. Open the admin Bookings tab.
- **Toggle:** defaults to Sessions (the list shows); clicking **Passes** shows the existing
  pass-management UI; clicking **Sessions** returns to the list.
- **List + pagination:** Sessions shows 10 rows + "Page 1 of N"; Next/Prev work; count = total.
- **Filters:** Status=Approved → only approved; Status=Pending → booked/blank (not approved/
  cancelled); Coach=X → only X's; Timeframe=Upcoming → only future; Search by a name narrows;
  combined filters apply; "clear filters" restores all + page 1.
- **Actions:** changing a row's coach `<select>` fires a `setBookingCoach` POST with the new
  coach id; clicking **Cancel** → confirm → a `cancel` POST (`by:'admin'`) fires and `allBookings`
  reloads.
- **Empty state:** a no-match filter shows "No sessions match these filters."
- Mirror parity `diff index.html "Pasig Greenpark Archery Camp.dc.html"` → IDENTICAL.
