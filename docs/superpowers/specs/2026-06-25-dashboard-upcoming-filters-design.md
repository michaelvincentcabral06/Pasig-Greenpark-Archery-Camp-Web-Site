# Dashboard upcoming-schedule pagination + filters (sub-project I)

**Date:** 2026-06-25
**Goal:** Add **pagination** and **three filters** (coach, timeframe, search) to the admin
Dashboard's "Upcoming schedule" list, which today is a hardcoded cap of 14 with no paging or
filtering.

## Problem today
`index.html` ~4692 builds `upcoming` = all bookings (non-cancelled, today-onward),
sorted soonest-first, then `.slice(0, 14)` — a hard cap, no pagination, no filter. The
markup (~1867-1885) renders `{{ upcoming }}` with a `noUpcoming` empty state.

## Decisions (from brainstorming)
- **Three filters:** by **coach** (one coach or all), by **timeframe** (next 7 days / next 30
  days / all upcoming), and a **search** (client name or program).
- **Defaults:** timeframe = **All upcoming** (preserves today's "see everything" behavior, just
  paged instead of capped); coach = **all**; search = empty.
- **Pagination:** **8 per page**, Prev/Next + page label, styled like the Activity tab.
- **Independent state** — does NOT reuse the Bookings tab's `bkCoach`/`bkSearch`/`bkPage` (those
  are a different list); new `dashUp*` state keys so the two lists don't interfere.
- Changing any filter resets to page 1.
- **Frontend-only** — purely client-side over `this.state.allBookings` already loaded for the
  Dashboard; no backend change, no deploy.

## Constraints
- Mirror rule: every `index.html` edit applied identically to
  `Pasig Greenpark Archery Camp.dc.html` (byte-identical).
- Reuse the existing date helper `addDaysStr(dateStr, n)` and `todayStr()` (both already in the
  component) for the timeframe bound; reuse `this.coaches()` for the coach dropdown options.
- Follow the established list patterns (the Activity tab's filter bar + Prev/Next pagination).

## State (added to the initial state object)
```js
    dashUpCoach: 'all',     // 'all' | <coach id>
    dashUpRange: 'all',     // 'all' | '7' | '30'
    dashUpSearch: '',
    dashUpPage: 0,
```

## Builder (replace the `upcoming` definition, ~index.html:4692)
Keep the base filter + sort; add coach/timeframe/search filters; paginate instead of `.slice(0,14)`.
```js
    const dashUpCoach = this.state.dashUpCoach || 'all';
    const dashUpRange = this.state.dashUpRange || 'all';
    const dashUpSearch = (this.state.dashUpSearch || '').trim().toLowerCase();
    const dashUpMax = (dashUpRange === '7') ? this.addDaysStr(todayStr, 7)
                    : (dashUpRange === '30') ? this.addDaysStr(todayStr, 30) : '';
    const upAllFiltered = dashBookings
      .filter(b => String(b.status || '').toLowerCase() !== 'cancelled' && b.date && b.date >= todayStr)
      .filter(b => dashUpCoach === 'all' ? true : (String(b.coach || '') === dashUpCoach))
      .filter(b => !dashUpMax ? true : (b.date <= dashUpMax))
      .filter(b => {
        if (!dashUpSearch) return true;
        const hay = ((b.name || '') + ' ' + (b.program || '')).toLowerCase();
        return hay.indexOf(dashUpSearch) !== -1;
      })
      .sort((a, b) => ((a.date || '') + (a.time || '')).localeCompare((b.date || '') + (b.time || '')));
    const UP_PAGE = 8;
    const upTotal = upAllFiltered.length;
    const upPageCount = Math.max(1, Math.ceil(upTotal / UP_PAGE));
    const upPage = Math.min(Math.max(0, this.state.dashUpPage || 0), upPageCount - 1);
    const upcoming = upAllFiltered
      .slice(upPage * UP_PAGE, upPage * UP_PAGE + UP_PAGE)
      .map(b => {
        const c = matchCoach(b.coach);
        return {
          date: fmtSessionDate(b.date), time: b.time || '',
          who: b.name || 'Guest', program: b.program || '',
          coach: c ? c.name : 'Any coach',
          amount: b.amount ? pesoRound(b.amount) : '',
          status: String(b.status || 'booked').toLowerCase(),
        };
      });
```
(The `.map(...)` body is unchanged from today.)

## Filter option lists + setters (added near the builder)
```js
    const dashUpCoachOpts = [{ id: 'all', name: 'All coaches' }].concat(
      this.coaches().map(c => ({ id: c.id, name: c.name })));
    const dashUpRangeOpts = [
      { id: 'all', name: 'All upcoming' }, { id: '7', name: 'Next 7 days' }, { id: '30', name: 'Next 30 days' },
    ];
    const setDashUpCoach = (e) => this.setState({ dashUpCoach: e.target.value, dashUpPage: 0 });
    const setDashUpRange = (e) => this.setState({ dashUpRange: e.target.value, dashUpPage: 0 });
    const setDashUpSearch = (e) => this.setState({ dashUpSearch: e.target.value, dashUpPage: 0 });
    const clearDashUpFilters = () => this.setState({ dashUpCoach: 'all', dashUpRange: 'all', dashUpSearch: '', dashUpPage: 0 });
    const dashUpPrev = () => this.setState({ dashUpPage: Math.max(0, upPage - 1) });
    const dashUpNext = () => this.setState({ dashUpPage: Math.min(upPageCount - 1, upPage + 1) });
```

## Render return additions
```js
      upcoming: upcoming,
      noUpcoming: upTotal === 0,
      upCount: upTotal,
      upFiltered: (dashUpCoach !== 'all' || dashUpRange !== 'all' || !!dashUpSearch),
      upEmptyLabel: (dashUpCoach !== 'all' || dashUpRange !== 'all' || !!dashUpSearch) ? 'No sessions match these filters.' : 'No upcoming sessions.',
      dashUpCoach: dashUpCoach, dashUpRange: dashUpRange, dashUpSearch: this.state.dashUpSearch || '',
      dashUpCoachOpts: dashUpCoachOpts, dashUpRangeOpts: dashUpRangeOpts,
      setDashUpCoach, setDashUpRange, setDashUpSearch, clearDashUpFilters,
      upMultiPage: upPageCount > 1, upHasPrev: upPage > 0, upHasNext: upPage < upPageCount - 1,
      upPageLabel: ('Page ' + (upPage + 1) + ' of ' + upPageCount),
      dashUpPrev, dashUpNext,
```
(`upcoming`/`noUpcoming` already exist in the return — update them, don't duplicate.)

## Markup (the "UPCOMING SCHEDULE" block, ~index.html:1867-1885)
1. After the intro `<p>` (~1869), add a filter bar (mirroring the Activity-tab bar at ~1894):
```html
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap;">
            <select value="{{ dashUpCoach }}" onChange="{{ setDashUpCoach }}" style="padding:10px 14px;border:1px solid rgba(36,66,50,0.2);border-radius:10px;font-size:14px;font-family:'Hanken Grotesk',sans-serif;background:#fffdf6;">
              <sc-for list="{{ dashUpCoachOpts }}" as="o" hint-placeholder-count="0"><option value="{{ o.id }}">{{ o.name }}</option></sc-for>
            </select>
            <select value="{{ dashUpRange }}" onChange="{{ setDashUpRange }}" style="padding:10px 14px;border:1px solid rgba(36,66,50,0.2);border-radius:10px;font-size:14px;font-family:'Hanken Grotesk',sans-serif;background:#fffdf6;">
              <sc-for list="{{ dashUpRangeOpts }}" as="o" hint-placeholder-count="0"><option value="{{ o.id }}">{{ o.name }}</option></sc-for>
            </select>
            <input type="text" value="{{ dashUpSearch }}" onInput="{{ setDashUpSearch }}" placeholder="Search name or program…" style="flex:1;min-width:180px;padding:10px 14px;border:1px solid rgba(36,66,50,0.2);border-radius:10px;font-size:14px;font-family:'Hanken Grotesk',sans-serif;">
          </div>
          <div style="font-size:13px;color:#56664f;margin-bottom:12px;">{{ upCount }} upcoming<sc-if value="{{ upFiltered }}" hint-placeholder-val="{{ false }}"> · <button onClick="{{ clearDashUpFilters }}" style="background:none;border:none;cursor:pointer;color:#4d7327;font-weight:700;font-size:13px;font-family:'Hanken Grotesk',sans-serif;text-decoration:underline;padding:0;">clear filters</button></sc-if></div>
```
2. Make the empty state filter-aware (replace the `noUpcoming` line at ~1870) — render the
   single computed `upEmptyLabel` field:
```html
          <sc-if value="{{ noUpcoming }}" hint-placeholder-val="{{ true }}"><div style="background:#fffdf6;border:1px dashed rgba(36,66,50,0.2);border-radius:12px;padding:24px;text-align:center;color:#8a9579;font-size:14px;">{{ upEmptyLabel }}</div></sc-if>
```
3. After the list `</div>` (~1885), add the pagination (mirroring the Activity tab's Prev/Next at ~1935):
```html
          <sc-if value="{{ upMultiPage }}" hint-placeholder-val="{{ false }}">
          <div style="display:flex;align-items:center;justify-content:center;gap:14px;margin-top:16px;">
            <sc-if value="{{ upHasPrev }}" hint-placeholder-val="{{ true }}"><button onClick="{{ dashUpPrev }}" style="background:#fffdf6;border:1px solid rgba(36,66,50,0.2);cursor:pointer;font-family:'Hanken Grotesk',sans-serif;font-size:13px;font-weight:700;color:#244232;padding:9px 16px;border-radius:999px;">← Prev</button></sc-if>
            <span style="font-size:13px;color:#56664f;font-family:'Spline Sans Mono',monospace;">{{ upPageLabel }}</span>
            <sc-if value="{{ upHasNext }}" hint-placeholder-val="{{ true }}"><button onClick="{{ dashUpNext }}" style="background:#fffdf6;border:1px solid rgba(36,66,50,0.2);cursor:pointer;font-family:'Hanken Grotesk',sans-serif;font-size:13px;font-weight:700;color:#244232;padding:9px 16px;border-radius:999px;">Next →</button></sc-if>
          </div>
          </sc-if>
```

## Out of scope
- The rest of the Dashboard (stats, per-coach counts, payment splits) — untouched.
- Backend changes; persisting filter choices across reloads (filters reset on reload —
  acceptable, matches the other tabs).
- A coach filter on bookings that have no coach: a specific-coach filter naturally excludes
  no-coach/"any" bookings (they show only under "All coaches").

## Risks / watch-items
- **Page clamp:** `upPage` is clamped to `[0, upPageCount-1]` so an active page can't go out of
  range when filters shrink the list; filter setters also reset `dashUpPage:0`.
- **State isolation:** must NOT reuse `bkCoach`/`bkSearch`/`bkPage` — those drive the Bookings
  tab; new `dashUp*` keys only.
- **Coach id match:** filtering compares `String(b.coach||'') === dashUpCoach` (the stored coach
  id), consistent with how bookings store the coach.
- **Timeframe bound** uses `addDaysStr(todayStr, N)` (inclusive `<=`), same local-date basis as
  the existing `b.date >= todayStr` filter — no timezone drift.
- `index.html` ≡ the `.dc.html` mirror byte-identical.

## Verification (Playwright, stubbed backend)
- Seed `allBookings` with ~20 upcoming sessions across two coaches, varied dates (some within 7
  days, some within 30, some beyond) and programs; open the admin Dashboard.
- **Pagination:** with "All upcoming", the list shows 8 rows + "Page 1 of N"; Next advances and
  shows the next 8; Prev returns.
- **Coach filter:** selecting a coach shows only that coach's sessions; the count updates; page
  resets to 1.
- **Timeframe:** "Next 7 days" shows only sessions within 7 days; "Next 30 days" within 30; "All
  upcoming" shows all.
- **Search:** typing a client name / program narrows the list; combined with a coach filter,
  both apply.
- **Empty state:** a filter combination with no matches shows the filter-aware "No sessions match
  these filters." message; "clear filters" restores the full list.
- Mirror parity `diff index.html "Pasig Greenpark Archery Camp.dc.html"` → IDENTICAL.
