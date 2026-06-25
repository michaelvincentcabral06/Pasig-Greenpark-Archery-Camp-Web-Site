# On-brand calendar — public availability + admin bookings (sub-project C/calendar)

**Date:** 2026-06-25
**Goal:** Replace the generic Google Calendar iframe with a custom, on-brand **month calendar
+ day detail**, in two modes from one shared component: **public** (Programs page — availability
only, no names) and **admin** (Bookings tab — real booked sessions).

## Decisions (from brainstorming + visual companion)
- **Layout: Month grid + day-detail** (direction A) — a month grid you navigate by month; tap a
  day to see its detail below.
- **Public mode** (Programs page, replaces the iframe ~index.html:537): month cells show
  **open / closed** per day (from the range's weekday hours); tapping a day fetches that day's
  live availability via `?action=availability&date=` and lists each open hour as **open / few
  spots / full**, with a **Book** link. **No customer names** (the availability endpoint returns
  only slot counts — verified).
- **Admin mode** (Bookings tab — extend the existing `[Sessions | Passes]` toggle to
  `[Sessions | Passes | Calendar]`): month cells show the **session count** that day (from the
  already-loaded `allBookings`); tapping a day lists that day's sessions (time · who · program ·
  coach · status). **View-only** — actions stay in the Sessions list.
- The Programs **"When to come shoot"** weekly grid stays; only the iframe is replaced.
- **No backend change, no deploy** — admin uses `allBookings` (already loaded for the Bookings
  tab); public uses the existing PII-free `?action=availability` (one fetch per day-tap).

## Constraints
- Mirror rule: every `index.html` edit applied identically to
  `Pasig Greenpark Archery Camp.dc.html` (byte-identical).
- Frontend-only; reuses `startHours(dow)`, `capacity()`/`cap_`, `coachById`, `isSessionUsed`,
  `allBookings`, `?action=availability`, `addDaysStr`/`todayStr`/`nowManila`, the `bkView` toggle.
- Calendar is **view-only** (no editing from the grid). Privacy: the public calendar must never
  request or render `?action=bookings` (which carries names) — only `?action=availability`.

## Shared calendar state (added to initial state)
```js
    calMonth: '',        // 'YYYY-MM' displayed month; '' → current month (computed in render)
    calSel: '',          // 'YYYY-MM-DD' selected day; '' → none
    calDayAvail: [],     // public: fetched availability slots for calSel
    calAvailLoading: false,
```

## Shared month-grid builder (render section)
```js
    const calCur = this.state.calMonth || this.todayStr().slice(0, 7);           // 'YYYY-MM'
    const calY = parseInt(calCur.slice(0, 4), 10), calM = parseInt(calCur.slice(5, 7), 10);
    const calFirstDow = new Date(calY, calM - 1, 1).getDay();                    // 0=Sun
    const calDays = new Date(calY, calM, 0).getDate();                           // days in month
    const calToday = this.todayStr();
    const pad2 = (n) => ('0' + n).slice(-2);
    const calGrid = [];
    for (let i = 0; i < calFirstDow; i++) calGrid.push({ blank: true });
    for (let d = 1; d <= calDays; d++) {
      const ds = calY + '-' + pad2(calM) + '-' + pad2(d);
      calGrid.push({ blank: false, date: ds, day: d, isToday: ds === calToday, selected: ds === this.state.calSel });
    }
    const calMonthLabel = new Date(calY, calM - 1, 1).toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
    const calShift = (delta) => { let y = calY, m = calM + delta; if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; } this.setState({ calMonth: y + '-' + pad2(m), calSel: '', calDayAvail: [] }); };
    const calPrev = () => calShift(-1), calNext = () => calShift(1);
    const calSelLabel = this.state.calSel ? (() => { try { return new Date(this.state.calSel + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric' }); } catch (e) { return this.state.calSel; } })() : '';
    const calDowHeads = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
```

## Admin mode (in the Bookings tab, `bkView === 'calendar'`)
1. **Toggle:** extend `bkView` to allow `'calendar'`; add a third toggle button "Calendar"
   (`goCalendar: () => this.setState({ bkView: 'calendar' })`) + its active colors; `bkViewCalendar
   = this.state.bkView === 'calendar'`. The Sessions/Passes views are gated to hide when calendar
   is active.
2. **Cells with counts** (from `allBookings`, non-cancelled, by date):
```js
    const calCountByDate = {};
    (this.state.allBookings || []).forEach(b => { if (b.date && String(b.status||'').toLowerCase() !== 'cancelled') calCountByDate[b.date] = (calCountByDate[b.date]||0) + 1; });
    const calAdminCells = calGrid.map(c => c.blank ? c : ({ ...c, count: calCountByDate[c.date] || 0, hasCount: (calCountByDate[c.date] || 0) > 0, pick: () => this.setState({ calSel: c.date }) }));
```
3. **Day detail** (sessions on `calSel`, sorted by time):
```js
    const calAdminDay = (this.state.calSel ? (this.state.allBookings || []).filter(b => b.date === this.state.calSel) : [])
      .sort((a,b) => (a.time||'').localeCompare(b.time||''))
      .map(b => { const c = b.coach ? this.coachById(b.coach) : null; const si = sessStatusInfo(b.status); return { time: b.time || '', name: b.name || 'Guest', program: b.program || '', coachName: c ? c.name : 'Any coach', statusLabel: si.label, statusBg: si.bg, statusFg: si.fg }; });
```
Render-return: `bkViewCalendar`, `goCalendar`, `bkCalTabBg/Fg`, `calAdminCells`, `calAdminDay`,
`calMonthLabel`, `calPrev`, `calNext`, `calSel`, `calSelLabel`, `calDowHeads`, `calHasSel: !!this.state.calSel`.

## Public mode (Programs page, replaces the iframe ~537)
1. **Cells with open/closed** (from the range's weekday hours):
```js
    const calPubCells = calGrid.map(c => { if (c.blank) return c; const dow = new Date(c.date + 'T00:00:00').getDay(); const open = this.startHours(dow).length > 0; const past = c.date < calToday; return { ...c, open: open && !past, closed: !open, past: past, pick: () => this.pickCalDayPublic(c.date) }; });
```
2. **Day-tap fetches availability** (PII-free):
```js
  pickCalDayPublic(date) {
    this.setState({ calSel: date, calDayAvail: [], calAvailLoading: true });
    const ep = this.endpoint(); if (!ep) { this.setState({ calAvailLoading: false }); return; }
    fetch(ep + '?action=availability&date=' + encodeURIComponent(date)).then(r => r.json()).then(res => {
      this.setState({ calDayAvail: (res && res.slots) || [], calAvailLoading: false });
    }).catch(() => this.setState({ calAvailLoading: false }));
  }
```
3. **Day detail** (the fetched slots → open/few/full + Book link):
```js
    const calPubDay = ((this.state.calDayAvail) || []).map(s => {
      const left = (s.left != null) ? s.left : (s.full ? 0 : this.capacity());
      const status = s.full || left <= 0 ? { label: 'Full', bg: '#f3e2e0', fg: '#b4512f' }
                   : left <= 2 ? { label: left + ' left', bg: '#fff1cf', fg: '#8a6a1f' }
                   : { label: 'Open', bg: '#e6efd6', fg: '#4d7327' };
      return { time: s.time || '', statusLabel: status.label, statusBg: status.bg, statusFg: status.fg, isOpen: !(s.full || left <= 0), book: () => this.go('book') };
    });
```
Render-return: `calPubCells`, `calPubDay`, `calAvailLoading`, plus the shared `calMonthLabel`/
`calPrev`/`calNext`/`calSel`/`calSelLabel`/`calDowHeads`/`calHasSel`.

## Markup

### A) Programs page — replace the iframe (~index.html:537)
Replace the `<iframe ... src="{{ calendarEmbedSrc }}" ...>` (and keep the surrounding "Live
calendar" heading / "Add to your calendar" link) with the month calendar:
- A card: header row `‹ {{ calMonthLabel }} ›` (prev/next buttons), a 7-col `calDowHeads` row, then
  a 7-col grid of `calPubCells` — blank cells empty; day cells show the day number + an
  availability dot (green when `co.open`, muted when `co.closed`), `co.past` dimmed, `co.isToday`
  outlined, `co.selected` highlighted, `onClick="{{ co.pick }}"`.
- Below: a `calHasSel` day-detail panel — `{{ calSelLabel }}`, a `calAvailLoading` spinner, then
  `<sc-for list="{{ calPubDay }}">` rows (time + status pill + a **Book** button gated by
  `s.isOpen`), or "Closed / no open times" when empty.
- Keep the existing "Add to your calendar →" link (the Google subscribe link) below as a secondary
  action.

### B) Admin Bookings tab — `[Sessions | Passes | Calendar]`
- Add the third toggle button "Calendar" (active = filled green) next to Sessions/Passes.
- Add `<sc-if value="{{ bkViewCalendar }}">` containing the same month-grid card (header + dow row
  + `calAdminCells` grid — day cells show the day number + a small "{{ cc.count }}" badge when
  `cc.hasCount`, today outlined, selected highlighted, `onClick="{{ cc.pick }}"`) and a `calHasSel`
  day-detail panel listing `<sc-for list="{{ calAdminDay }}">` rows (time · name · program ·
  coach + status pill). The existing Sessions and Passes `<sc-if>`s gate OUT when calendar is
  active (i.e. `bkViewSessions`/`bkViewPasses` already false when `bkView==='calendar'` — confirm
  `bkViewSessions = bkView === 'sessions'` etc., not "!== passes", so calendar hides both).

## Out of scope
- Editing from the calendar (cancel/assign coach/reschedule) — view-only; actions live in the
  Sessions list / booking flow.
- A week view; multi-month range fetch for public (we fetch per day-tap to stay PII-free + cheap).
- The Google "Add to your calendar" subscribe link is kept as-is (a separate, optional feature).
- Backend changes; mobile pass (separate — but the grid uses responsive units).

## Risks / watch-items
- **Privacy:** the public calendar must use ONLY `?action=availability` (no names); never
  `?action=bookings`. The admin calendar uses `allBookings` (admin-only, already gated).
- **`bkView` gating:** changing the toggle to three states means `bkViewSessions`/`bkViewPasses`
  must be exact equality (`=== 'sessions'`/`=== 'passes'`), so selecting Calendar hides both —
  the Sessions-list sub-project defined `bkViewSessions = this.state.bkView !== 'passes'`; CHANGE
  it to `=== 'sessions'` and add `bkViewCalendar = === 'calendar'` so the three are mutually
  exclusive. (Default `bkView:'sessions'` unchanged.)
- **Grid math:** leading blanks from `getDay()` of the 1st; days-in-month via `new Date(y,m,0)`;
  local-date strings consistent with `todayStr`/`isSessionUsed`. Selecting a day re-renders cells
  (`selected`); changing month clears `calSel`.
- **Availability shape:** `?action=availability` returns `{ slots: buildSlots_(date) }`; each slot
  has `time` and `left`/`full` — map defensively (`left` may be null → derive from `capacity()`).
- **Admin counts** exclude cancelled bookings; cells with 0 show no badge.
- `index.html` ≡ the `.dc.html` mirror byte-identical. No backend change, no deploy.

## Verification (Playwright, stubbed backend)
- **Shared grid:** for a fixed month, the grid has the right leading blanks + day count; `‹`/`›`
  change `calMonthLabel` and clear the selection; today is outlined.
- **Admin calendar:** stub `allBookings` (several dates, some cancelled); open Bookings →
  **Calendar**: day cells show non-cancelled counts; tapping a day lists that day's sessions
  (time/name/program/coach/status), cancelled excluded; Sessions/Passes views hidden while
  Calendar is active; switching back to Sessions restores the list.
- **Public calendar:** on Programs, the iframe is gone; cells show open (dot) vs closed (rest day)
  per the weekday hours; past days dimmed; tapping an open day fires a `?action=availability&date=`
  GET (stubbed) and renders each slot as open/few/full with a Book button on open slots; NO
  `?action=bookings` request is ever made from the public page.
- Mirror parity `diff index.html "Pasig Greenpark Archery Camp.dc.html"` → IDENTICAL.
