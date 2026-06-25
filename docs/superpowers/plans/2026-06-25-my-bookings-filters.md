# My Bookings Upcoming Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add search / program / timeframe / booked-under-email filters to the customer My Bookings → Upcoming list (already paginated 5/page), applied before pagination, with a count line, filter-aware empty state, and page-reset on change.

**Architecture:** All in the single SuperConductor component in `index.html` (mirrored to `Pasig Greenpark Archery Camp.dc.html`). Filters the already-built `acctUpcoming` list before the existing pagination slice. No backend change, no deploy.

**Tech Stack:** SuperConductor template (`{{ }}`, `<sc-if>`, `<sc-for>`), plain class-component JS (modern JS OK), Playwright-core with stubbed `fetch`.

## Global Constraints

- **Mirror rule:** every `index.html` edit applied identically to `Pasig Greenpark Archery Camp.dc.html`; end with `diff index.html "Pasig Greenpark Archery Camp.dc.html" && echo IDENTICAL`.
- **No backend change, no deploy.**
- Scope is ONLY the Upcoming list — Past list and the Passes card untouched.
- `acctHasUpcoming` MUST remain based on the **unfiltered** `acctUpcoming.length > 0` so the filter bar + "clear filters" stay reachable when filters exclude everything.
- Every filter setter resets `acctUpPage: 0`; the existing `acctUpPage` clamp now applies to the filtered list.
- **Verification:** Playwright-core with stubbed `fetch`; chromium at `C:\Users\Michael Cabral\AppData\Local\ms-playwright\chromium-1228\chrome-win64\chrome.exe`; install if missing: `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright-core --no-save`. Scratch harness `_verify_mb.mjs` (deleted at the end). 0 real console errors.

---

### Task 1: Upcoming filters (state + builder + fmtSession coach + bindings + markup)

**Files:**
- Modify: `index.html` — initial state (~2588); account-login `setState` (~3637) + `accountLogout` (~3681) resets; `fmtSession` (~4543); the filter builder before `const acctUpAll = acctUpcoming` (~4828) + that line; the render return; the Upcoming markup (~1547-1551)
- Mirror: `Pasig Greenpark Archery Camp.dc.html`
- Test: `_verify_mb.mjs`

**Interfaces:**
- Consumes: `acctUpcoming` (the mapped upcoming list), `addDaysStr`, `todayStr`, `coachById`, `state.acctEmails`.
- Produces: render-return `acctUpSearch`/`acctUpProgram`/`acctUpRange`/`acctUpEmailF` + opts + setters + `clearAcctUpFilters` + `acctUpShowEmailFilter` + `acctUpFilterActive` + `acctUpCount` + `acctUpNoneFiltered`; `acctUpAll` now filtered.

- [ ] **Step 1: Add filter state.** Near `acctUpPage: 0, acctPastPage: 0, acctPassPage: 0,` (~index.html:2588), add a line:
```js
    acctUpSearch: '', acctUpProgram: 'all', acctUpRange: 'all', acctUpEmailF: 'all',
```

- [ ] **Step 2: Reset filters on login/logout.** In BOTH the account-login `setState({ acctIn: true, … acctUpPage: 0, … })` (~3637) and `accountLogout` (~3681), add the four filter resets alongside the existing `acctUpPage: 0`:
```js
      acctUpSearch: '', acctUpProgram: 'all', acctUpRange: 'all', acctUpEmailF: 'all',
```

- [ ] **Step 3: Add `coachName` to `fmtSession`.** In the `fmtSession` return object (~index.html:4543), add (so search can match coach):
```js
        coachName: (b.coach ? ((this.coachById(b.coach) || {}).name || '') : ''),
```

- [ ] **Step 4: Add the filter builder.** Immediately BEFORE `const acctUpAll = acctUpcoming, acctPastAll = acctPast, acctPassAll = acctPlanRows;` (~index.html:4828), insert:
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
Then change the existing line (~4828) to use the filtered list:
```js
    const acctUpAll = acctUpFiltered, acctPastAll = acctPast, acctPassAll = acctPlanRows;
```
(Leave `acctUpPageCount`/`acctUpPage`/`acctUpPaged` ~4829-4831 unchanged — they now operate on the filtered list.)

- [ ] **Step 5: Add render-return bindings.** First `grep -n "acctHasUpcoming" index.html` and CONFIRM the render return defines `acctHasUpcoming` from the UNFILTERED `acctUpcoming` (e.g. `acctUpcoming.length > 0`) — if it currently references `acctUpAll`/`acctUpPaged`, change it back to the unfiltered `acctUpcoming` so the filter bar stays visible when filtered to zero. Then add to the render return (near the existing `acctUpcoming`/`acctUpPageLabel` keys):
```js
      acctUpSearch: this.state.acctUpSearch || '', acctUpProgram: acctUpProgram, acctUpRange: acctUpRange, acctUpEmailF: acctUpEmailF,
      acctUpProgramOpts: acctUpProgramOpts, acctUpRangeOpts: acctUpRangeOpts, acctUpEmailOpts: acctUpEmailOpts,
      setAcctUpSearch: setAcctUp('acctUpSearch'), setAcctUpProgram: setAcctUp('acctUpProgram'), setAcctUpRange: setAcctUp('acctUpRange'), setAcctUpEmail: setAcctUp('acctUpEmailF'),
      clearAcctUpFilters: clearAcctUpFilters, acctUpShowEmailFilter: acctUpShowEmailFilter, acctUpFilterActive: acctUpFilterActive,
      acctUpCount: acctUpFiltered.length, acctUpNoneFiltered: acctUpFiltered.length === 0,
```

- [ ] **Step 6: Add the filter-bar markup.** In the Upcoming section, AFTER the "Upcoming sessions" `<h2>` (~index.html:1549) and BEFORE the list `<div style="display:flex;flex-direction:column;gap:12px;">` (~1550), insert:
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
(The existing `<sc-for list="{{ acctUpcoming }}">` list and the pagination block ~1624 below are unchanged.)

- [ ] **Step 7: Mirror.** `cp index.html "Pasig Greenpark Archery Camp.dc.html"`; `diff … && echo IDENTICAL`.

- [ ] **Step 8: Verify + cleanup.** Build `_verify_mb.mjs`: reach the instance via the React fiber; patch `nowManila` to a fixed clock; log into an account (set `acctIn:true`, `acctEmails`, and seed `acctBookings` so `acctUpcoming` has ~12 future sessions across 2+ programs, varied dates — some ≤ today+7, some ≤ today+30, some beyond; for the email test set `acctEmails` to 2 emails and tag bookings' `email`). Reach the My Bookings (account) view. Assert:
  - **Filter bar** shows only when there are upcoming sessions; the **email dropdown** shows only with `acctEmails.length > 1` (single email → hidden).
  - **Program** filter → only that program; **Timeframe=Next 7 days** → only `date <= today+7`, **Next 30** → `<= today+30`, **All** → all; **Search** by a program/coach/ref substring narrows; **Booked-under** email → only that email's sessions; combined filters apply; `acctUpCount` reflects the filtered total.
  - **Page reset:** changing any filter sets `acctUpPage` to 0; **pagination** still works over the filtered list (filter to >5 → pager shows; Next/Prev page through filtered).
  - **Empty state:** a no-match filter shows "No upcoming sessions match these filters."; **clear filters** restores the full list + page 1.
  - **acctHasUpcoming unfiltered:** with filters excluding all, the section + filter bar still render (the bar isn't hidden).
  Run `node _verify_mb.mjs`; expected PASS, 0 real console errors. Confirm mirror IDENTICAL. Then delete scratch:
```bash
rm -f _verify_mb.mjs _mb*.png && rm -rf node_modules package.json package-lock.json
git status --short
```

- [ ] **Step 9: Commit.**
```bash
git add index.html "Pasig Greenpark Archery Camp.dc.html"
git commit -m "My Bookings: filter Upcoming by search/program/timeframe/email (before pagination, page-reset, filter-aware empty)"
```

---

## Self-review notes

- **Spec coverage:** four filters + page reset (Steps 1/4/5/6); coach in search via `fmtSession.coachName` (Step 3); email filter gated on 2+ emails (Steps 4/6); filter-aware empty + count + clear (Steps 5/6); state reset on login/logout (Step 2); `acctHasUpcoming` stays unfiltered (Step 5). All spec sections map to a step.
- **Pagination reuse:** only `acctUpAll` changes source (to `acctUpFiltered`); the existing `acctUpPageCount`/`acctUpPage`/`acctUpPaged` are untouched and now operate on the filtered list.
- **Type/name consistency:** every `{{ binding }}` in Step 6 (`acctUpSearch`/`acctUpProgram`/`acctUpRange`/`acctUpEmailF`, `setAcctUp*`, `acctUp*Opts`, `acctUpShowEmailFilter`, `acctUpFilterActive`, `clearAcctUpFilters`, `acctUpCount`, `acctUpNoneFiltered`, and the existing `acctUpcoming`/`acctUpPageLabel`) is produced in Steps 4-5; `coachName` produced in Step 3 and consumed by the search in Step 4.
- **Mirror discipline:** ends with `cp` + `diff … && echo IDENTICAL`; scratch removed in Step 8.
- **No backend/deploy:** frontend-only; merge + push when done.
