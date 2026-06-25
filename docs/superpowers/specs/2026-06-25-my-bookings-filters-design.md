# My Bookings → Upcoming filters (sub-project A)

**Date:** 2026-06-25
**Goal:** Add **search + program + timeframe + booked-under-email** filters to the customer
My Bookings **Upcoming** list. It already paginates (5/page); filters apply before pagination,
reset to page 1 on change, and have a filter-aware empty state.

## Problem today
The Upcoming list (`acctUpcoming`, ~index.html:4828) is paginated (`ACCT_PAGE = 5`, `acctUpPage`)
but has **no filters**. The customer can't narrow their own upcoming sessions.

## Decisions (from brainstorming)
- Four filters: **search** (program / coach / reference / date), **program** (only programs the
  customer actually has upcoming), **timeframe** (Next 7 / Next 30 / All upcoming), and
  **booked-under email** — the email dropdown shows **only when the account has 2+ emails**
  (`acctEmails.length > 1`).
- Filters apply to the upcoming list **before** the existing pagination; every filter change
  resets `acctUpPage` to 0.
- A **count line** ("N upcoming · clear filters") and a **filter-aware empty state** ("No upcoming
  sessions match these filters.") — the filter bar itself only appears when there ARE upcoming
  sessions (so a zero-match result still lets the customer clear filters).
- Search needs the coach name → add `coachName` to each upcoming card (internal; not displayed).
- **No backend change, no deploy** — filters the already-loaded list.

## Constraints
- Mirror rule: every `index.html` edit applied identically to
  `Pasig Greenpark Archery Camp.dc.html` (byte-identical).
- Frontend-only; reuses `addDaysStr`/`todayStr`/`coachById`. Scope is ONLY the Upcoming list —
  Past list and the Passes card are untouched.
- Independent state (`acctUp*` filter keys) — `acctUpPage` already exists.

## State (added to the initial state)
```js
    acctUpSearch: '', acctUpProgram: 'all', acctUpRange: 'all', acctUpEmailF: 'all',
```
Reset these (with `acctUpPage: 0`) wherever the account state resets — the account-login
`setState` (~index.html:3637) and `accountLogout` (~3681) already reset `acctUpPage`; add the
four filter keys to `'all'`/`''` there too.

## Card field (search needs coach)
In `fmtSession` (~index.html:4543, the builder behind `acctUpcoming`), add a coach name for
search (and available if you later want to show it):
```js
        coachName: (b.coach ? ((this.coachById(b.coach) || {}).name || '') : ''),
```

## Builder (insert before `const acctUpAll = acctUpcoming` ~index.html:4828)
```js
    const acctUpSearch = (this.state.acctUpSearch || '').trim().toLowerCase();
    const acctUpProgram = this.state.acctUpProgram || 'all';
    const acctUpRange = this.state.acctUpRange || 'all';
    const acctUpEmailF = this.state.acctUpEmailF || 'all';
    const acctUpMax = (acctUpRange === '7') ? this.addDaysStr(this.todayStr(), 7)
                    : (acctUpRange === '30') ? this.addDaysStr(this.todayStr(), 30) : '';
    const acctUpFiltered = acctUpcoming.filter(u => {
      if (acctUpProgram !== 'all' && (u.program || '') !== acctUpProgram) return false;
      if (acctUpEmailF !== 'all' && (u.underEmail || '') !== acctUpEmailF) return false;
      if (acctUpMax && (u.date || '') > acctUpMax) return false;
      if (acctUpSearch) {
        const hay = ((u.program || '') + ' ' + (u.coachName || '') + ' ' + (u.ref || '') + ' ' + (u.date || '') + ' ' + (u.pretty || '')).toLowerCase();
        if (hay.indexOf(acctUpSearch) === -1) return false;
      }
      return true;
    });
    const acctUpPrograms = [];
    acctUpcoming.forEach(u => { if (u.program && acctUpPrograms.indexOf(u.program) === -1) acctUpPrograms.push(u.program); });
    const acctUpProgramOpts = [{ id: 'all', name: 'All programs' }].concat(acctUpPrograms.map(p => ({ id: p, name: p })));
    const acctUpRangeOpts = [{ id: 'all', name: 'All upcoming' }, { id: '7', name: 'Next 7 days' }, { id: '30', name: 'Next 30 days' }];
    const acctEmailsList = (this.state.acctEmails || []);
    const acctUpEmailOpts = [{ id: 'all', name: 'All emails' }].concat(acctEmailsList.map(e => ({ id: e, name: e })));
    const acctUpShowEmailFilter = acctEmailsList.length > 1;
    const acctUpFilterActive = (acctUpProgram !== 'all' || acctUpRange !== 'all' || acctUpEmailF !== 'all' || !!acctUpSearch);
    const setAcctUp = (key) => (e) => this.setState({ [key]: e.target.value, acctUpPage: 0 });
    const clearAcctUpFilters = () => this.setState({ acctUpSearch: '', acctUpProgram: 'all', acctUpRange: 'all', acctUpEmailF: 'all', acctUpPage: 0 });
```
Then change the existing line `const acctUpAll = acctUpcoming, ...` (4828) to:
```js
    const acctUpAll = acctUpFiltered, acctPastAll = acctPast, acctPassAll = acctPlanRows;
```
The existing `acctUpPageCount`/`acctUpPage`/`acctUpPaged` (4829-4831) now operate on the filtered
list — no other pagination change.

## Render return additions
- `acctHasUpcoming` MUST stay based on the **unfiltered** `acctUpcoming.length > 0` (so the filter
  bar shows even when filters exclude everything) — confirm/keep its current definition.
- Add:
```js
      acctUpSearch: this.state.acctUpSearch || '', acctUpProgram: acctUpProgram, acctUpRange: acctUpRange, acctUpEmailF: acctUpEmailF,
      acctUpProgramOpts: acctUpProgramOpts, acctUpRangeOpts: acctUpRangeOpts, acctUpEmailOpts: acctUpEmailOpts,
      setAcctUpSearch: setAcctUp('acctUpSearch'), setAcctUpProgram: setAcctUp('acctUpProgram'), setAcctUpRange: setAcctUp('acctUpRange'), setAcctUpEmail: setAcctUp('acctUpEmailF'),
      clearAcctUpFilters: clearAcctUpFilters, acctUpShowEmailFilter: acctUpShowEmailFilter, acctUpFilterActive: acctUpFilterActive,
      acctUpCount: acctUpFiltered.length, acctUpNoneFiltered: acctUpFiltered.length === 0,
```

## Markup (the Upcoming section, ~index.html:1547-1551)
Inside `<sc-if value="{{ acctHasUpcoming }}">`, AFTER the "Upcoming sessions" `<h2>` (~1549) and
BEFORE the list `<div>` (~1550), insert the filter bar + count + empty-state:
```html
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap;">
            <input type="text" value="{{ acctUpSearch }}" onInput="{{ setAcctUpSearch }}" placeholder="Search program, coach, reference…" style="flex:1;min-width:180px;padding:10px 14px;border:1px solid rgba(36,66,50,0.2);border-radius:10px;font-size:14px;font-family:'Hanken Grotesk',sans-serif;">
            <select value="{{ acctUpProgram }}" onChange="{{ setAcctUpProgram }}" style="padding:10px 14px;border:1px solid rgba(36,66,50,0.2);border-radius:10px;font-size:14px;font-family:'Hanken Grotesk',sans-serif;background:#fffdf6;"><sc-for list="{{ acctUpProgramOpts }}" as="o" hint-placeholder-count="0"><option value="{{ o.id }}">{{ o.name }}</option></sc-for></select>
            <select value="{{ acctUpRange }}" onChange="{{ setAcctUpRange }}" style="padding:10px 14px;border:1px solid rgba(36,66,50,0.2);border-radius:10px;font-size:14px;font-family:'Hanken Grotesk',sans-serif;background:#fffdf6;"><sc-for list="{{ acctUpRangeOpts }}" as="o" hint-placeholder-count="0"><option value="{{ o.id }}">{{ o.name }}</option></sc-for></select>
            <sc-if value="{{ acctUpShowEmailFilter }}" hint-placeholder-val="{{ false }}"><select value="{{ acctUpEmailF }}" onChange="{{ setAcctUpEmail }}" style="padding:10px 14px;border:1px solid rgba(36,66,50,0.2);border-radius:10px;font-size:14px;font-family:'Hanken Grotesk',sans-serif;background:#fffdf6;"><sc-for list="{{ acctUpEmailOpts }}" as="o" hint-placeholder-count="0"><option value="{{ o.id }}">{{ o.name }}</option></sc-for></select></sc-if>
          </div>
          <div style="font-size:13px;color:#56664f;margin-bottom:12px;">{{ acctUpCount }} upcoming<sc-if value="{{ acctUpFilterActive }}" hint-placeholder-val="{{ false }}"> · <button onClick="{{ clearAcctUpFilters }}" style="background:none;border:none;cursor:pointer;color:#4d7327;font-weight:700;font-size:13px;font-family:'Hanken Grotesk',sans-serif;text-decoration:underline;padding:0;">clear filters</button></sc-if></div>
          <sc-if value="{{ acctUpNoneFiltered }}" hint-placeholder-val="{{ false }}"><div style="background:#fffdf6;border:1px dashed rgba(36,66,50,0.2);border-radius:12px;padding:24px;text-align:center;color:#8a9579;font-size:14px;">No upcoming sessions match these filters.</div></sc-if>
```
The existing list `<sc-for list="{{ acctUpcoming }}">` (the paged filtered slice) and the existing
pagination block (~1624) below it are unchanged.

## Out of scope
- The Past-sessions list and the Passes card (separate); the dashboard, mobile — separate items.
- Showing the coach on the upcoming card visually (the `coachName` field is added for search; a
  visible coach line can be a trivial follow-up if wanted).
- Backend changes.

## Risks / watch-items
- **`acctHasUpcoming` stays unfiltered** so the filter bar (and "clear filters") is reachable when
  filters exclude all — verify its definition is `acctUpcoming.length > 0`, not the filtered list.
- **Page clamp + reset:** the existing `acctUpPage` clamp now applies to the filtered list; every
  filter setter resets `acctUpPage:0`; `clearAcctUpFilters` resets all + page.
- **Email filter visibility:** only render when `acctEmails.length > 1`; the option ids are the
  raw emails, matched against `u.underEmail`.
- **Timeframe basis:** `addDaysStr(todayStr, N)` inclusive `<=`, same local-date convention as the
  rest of the app.
- **State reset on login/logout** so a prior session's filters don't persist into a new account.
- `index.html` ≡ the `.dc.html` mirror byte-identical. No backend change, no deploy.

## Verification (Playwright, stubbed backend)
- Log into an account (stub) with ~12 upcoming sessions across 2+ programs, varied dates (some
  within 7 days, some within 30, some beyond), and (for the email test) 2 emails.
- **Filter bar appears** only when there are upcoming sessions; the email dropdown appears only
  with 2+ emails (single-email account → hidden).
- **Program** → only that program; **Timeframe=Next 7 days** → only `date <= today+7`; **Search**
  by a program/coach/ref string narrows; **Booked-under** → only that email's sessions; combined
  filters apply; the count line reflects the filtered total; changing any filter resets to page 1.
- **Pagination** still works over the filtered list (filter to >5 results → pager shows; Next/Prev
  page through the filtered set).
- **Empty state:** a no-match filter combo shows "No upcoming sessions match these filters." and
  "clear filters" restores the full list + page 1.
- Mirror parity `diff index.html "Pasig Greenpark Archery Camp.dc.html"` → IDENTICAL.
