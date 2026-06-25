# Dashboard Upcoming-Schedule Pagination + Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add coach / timeframe / search filters and 8-per-page pagination to the admin Dashboard's "Upcoming schedule" list (today a hardcoded cap of 14, no paging, no filter).

**Architecture:** Purely client-side in the single SuperConductor component in `index.html` (mirrored to `Pasig Greenpark Archery Camp.dc.html`). The `upcoming` builder gains filters + pagination; new independent `dashUp*` state; a filter bar + Prev/Next markup mirroring the Activity tab. No backend change.

**Tech Stack:** SuperConductor template (`{{ }}`, `<sc-if>`, `<sc-for>`), plain class-component JS (modern JS OK), Playwright-core for verification with stubbed `fetch`.

## Global Constraints

- **Mirror rule:** `index.html` ≡ `Pasig Greenpark Archery Camp.dc.html` (byte-identical); end with `diff index.html "Pasig Greenpark Archery Camp.dc.html" && echo IDENTICAL`.
- **No backend change**, no deploy — operates over `this.state.allBookings` already loaded for the Dashboard.
- **Independent state:** use NEW `dashUpCoach`/`dashUpRange`/`dashUpSearch`/`dashUpPage` keys — do NOT reuse the Bookings tab's `bkCoach`/`bkSearch`/`bkPage`.
- Reuse existing helpers `this.addDaysStr(dateStr, n)`, `this.todayStr()`, `this.coaches()`.
- Every filter setter resets `dashUpPage: 0`; `upPage` is clamped to `[0, upPageCount-1]`.
- **Verification:** Playwright-core driving the running component with `fetch` stubbed; chromium at `C:\Users\Michael Cabral\AppData\Local\ms-playwright\chromium-1228\chrome-win64\chrome.exe`; install once if missing: `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright-core --no-save`. Scratch harness `_verify_dash.mjs` (deleted at the end). 0 real console errors.

---

### Task 1: Filters + pagination on the Dashboard upcoming list

**Files:**
- Modify: `index.html` — initial state (~2500); the `upcoming` builder (~4692); the render return (`upcoming`/`noUpcoming` already there — update + add the new keys); the "UPCOMING SCHEDULE" markup (~1867-1885)
- Mirror: `Pasig Greenpark Archery Camp.dc.html`
- Test: `_verify_dash.mjs`

**Interfaces:**
- Consumes: `this.state.allBookings`, `this.addDaysStr`, `this.todayStr`, `this.coaches()`, and the existing render locals `dashBookings`/`matchCoach`/`fmtSessionDate`/`pesoRound`.
- Produces: render-return `upcoming` (paged), `noUpcoming`, `upCount`, `upFiltered`, `upEmptyLabel`, `dashUpCoach`, `dashUpRange`, `dashUpSearch`, `dashUpCoachOpts`, `dashUpRangeOpts`, `setDashUpCoach`, `setDashUpRange`, `setDashUpSearch`, `clearDashUpFilters`, `upMultiPage`, `upHasPrev`, `upHasNext`, `upPageLabel`, `dashUpPrev`, `dashUpNext`.

- [ ] **Step 1: Add the state keys.** In the initial state object (near `allBookings: [],` ~2500), add:
```js
    dashUpCoach: 'all',
    dashUpRange: 'all',
    dashUpSearch: '',
    dashUpPage: 0,
```

- [ ] **Step 2: Replace the `upcoming` builder.** Replace the current `const upcoming = dashBookings.filter(...).sort(...).slice(0,14).map(...)` (~index.html:4692-4705) with the filtered + paginated version:
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
    const dashUpCoachOpts = [{ id: 'all', name: 'All coaches' }].concat(
      this.coaches().map(c => ({ id: c.id, name: c.name })));
    const dashUpRangeOpts = [
      { id: 'all', name: 'All upcoming' }, { id: '7', name: 'Next 7 days' }, { id: '30', name: 'Next 30 days' },
    ];
    const dashUpIsFiltered = (dashUpCoach !== 'all' || dashUpRange !== 'all' || !!dashUpSearch);
    const setDashUpCoach = (e) => this.setState({ dashUpCoach: e.target.value, dashUpPage: 0 });
    const setDashUpRange = (e) => this.setState({ dashUpRange: e.target.value, dashUpPage: 0 });
    const setDashUpSearch = (e) => this.setState({ dashUpSearch: e.target.value, dashUpPage: 0 });
    const clearDashUpFilters = () => this.setState({ dashUpCoach: 'all', dashUpRange: 'all', dashUpSearch: '', dashUpPage: 0 });
    const dashUpPrev = () => this.setState({ dashUpPage: Math.max(0, upPage - 1) });
    const dashUpNext = () => this.setState({ dashUpPage: Math.min(upPageCount - 1, upPage + 1) });
```
(Confirm `todayStr`, `dashBookings`, `matchCoach`, `fmtSessionDate`, `pesoRound` are already in scope at this point in render — they are, from the existing builder.)

- [ ] **Step 3: Update the render return.** The return already has `upcoming: upcoming, ... noUpcoming: ...`. Update those and add the new keys (place near the existing `upcoming:`/`noUpcoming:` entries, ~5196):
```js
      upcoming: upcoming,
      noUpcoming: upTotal === 0,
      upCount: upTotal,
      upFiltered: dashUpIsFiltered,
      upEmptyLabel: dashUpIsFiltered ? 'No sessions match these filters.' : 'No upcoming sessions.',
      dashUpCoach: dashUpCoach, dashUpRange: dashUpRange, dashUpSearch: this.state.dashUpSearch || '',
      dashUpCoachOpts: dashUpCoachOpts, dashUpRangeOpts: dashUpRangeOpts,
      setDashUpCoach: setDashUpCoach, setDashUpRange: setDashUpRange, setDashUpSearch: setDashUpSearch, clearDashUpFilters: clearDashUpFilters,
      upMultiPage: upPageCount > 1, upHasPrev: upPage > 0, upHasNext: upPage < upPageCount - 1,
      upPageLabel: ('Page ' + (upPage + 1) + ' of ' + upPageCount),
      dashUpPrev: dashUpPrev, dashUpNext: dashUpNext,
```
Remove the OLD `hasUpcoming:`/`noUpcoming:` line if it duplicates (there is currently `upcoming: upcoming, hasUpcoming: upcoming.length > 0, noUpcoming: upcoming.length === 0,` — replace it with the block above; `hasUpcoming` is not used by the markup, but grep for it first and keep it if referenced).

- [ ] **Step 4: Add the filter bar + count line.** In the "UPCOMING SCHEDULE" block, AFTER the intro `<p>…The next sessions across all coaches.</p>` (~1869) and BEFORE the `noUpcoming` empty-state line, insert:
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

- [ ] **Step 5: Make the empty state filter-aware.** Replace the existing `noUpcoming` empty-state line (~1870) with:
```html
          <sc-if value="{{ noUpcoming }}" hint-placeholder-val="{{ true }}"><div style="background:#fffdf6;border:1px dashed rgba(36,66,50,0.2);border-radius:12px;padding:24px;text-align:center;color:#8a9579;font-size:14px;">{{ upEmptyLabel }}</div></sc-if>
```

- [ ] **Step 6: Add the pagination.** AFTER the list `</div>` that closes the `<sc-for list="{{ upcoming }}">` wrapper (~1885), insert:
```html
          <sc-if value="{{ upMultiPage }}" hint-placeholder-val="{{ false }}">
          <div style="display:flex;align-items:center;justify-content:center;gap:14px;margin-top:16px;">
            <sc-if value="{{ upHasPrev }}" hint-placeholder-val="{{ true }}"><button onClick="{{ dashUpPrev }}" style="background:#fffdf6;border:1px solid rgba(36,66,50,0.2);cursor:pointer;font-family:'Hanken Grotesk',sans-serif;font-size:13px;font-weight:700;color:#244232;padding:9px 16px;border-radius:999px;">← Prev</button></sc-if>
            <span style="font-size:13px;color:#56664f;font-family:'Spline Sans Mono',monospace;">{{ upPageLabel }}</span>
            <sc-if value="{{ upHasNext }}" hint-placeholder-val="{{ true }}"><button onClick="{{ dashUpNext }}" style="background:#fffdf6;border:1px solid rgba(36,66,50,0.2);cursor:pointer;font-family:'Hanken Grotesk',sans-serif;font-size:13px;font-weight:700;color:#244232;padding:9px 16px;border-radius:999px;">Next →</button></sc-if>
          </div>
          </sc-if>
```

- [ ] **Step 7: Mirror.** `cp index.html "Pasig Greenpark Archery Camp.dc.html"`; `diff … && echo IDENTICAL`.

- [ ] **Step 8: Verify.** Build `_verify_dash.mjs`: reach the admin Dashboard (set admin auth + `adminTab:'dashboard'` via the React fiber as prior harnesses did), seed `state.allBookings` (via the fiber `setState`) with ~20 upcoming sessions across two coach ids, varied dates (several within 7 days, several within 30, several beyond 30) and programs/names, all non-cancelled and dated today-or-later. Assert:
  - **Pagination:** with defaults (All upcoming) the rendered list shows 8 rows and "Page 1 of N"; clicking Next shows the next page's rows; Prev returns; the count line reads the full total.
  - **Coach filter:** selecting coach B (via the coach `<select>`) shows only coach B's sessions; count updates; page resets to 1.
  - **Timeframe:** "Next 7 days" shows only sessions with `date <= today+7`; "Next 30 days" only `<= today+30`; "All upcoming" shows all.
  - **Search:** typing a unique client name narrows to that client; combined with a coach filter both apply.
  - **Empty state:** a no-match filter combo shows "No sessions match these filters."; "clear filters" restores the full list and page 1.
  - 0 real console errors. Then delete scratch: `rm -f _verify_dash.mjs _dash*.png && rm -rf node_modules package.json package-lock.json && git status --short` (should show only the two HTML files + possibly pre-existing `.claude/settings.local.json`).

- [ ] **Step 9: Commit.**
```bash
git add index.html "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Dashboard: paginate + filter (coach/timeframe/search) the upcoming-schedule list"
```

---

## Self-review notes

- **Spec coverage:** state (Step 1); filtered+paginated builder + option lists + setters (Step 2); render-return keys incl. `upEmptyLabel` (Step 3); filter bar + count (Step 4); filter-aware empty state (Step 5); Prev/Next pagination (Step 6). All spec sections map to a step.
- **State isolation:** new `dashUp*` keys only; no `bk*` reuse.
- **Page safety:** `upPage` clamped; every setter resets `dashUpPage:0`.
- **Type/name consistency:** every `{{ binding }}` in Steps 4-6 (`dashUpCoach`, `dashUpRange`, `dashUpSearch`, `dashUpCoachOpts`, `dashUpRangeOpts`, `setDashUp*`, `upCount`, `upFiltered`, `clearDashUpFilters`, `noUpcoming`, `upEmptyLabel`, `upMultiPage`, `upHasPrev`, `upHasNext`, `upPageLabel`, `dashUpPrev`, `dashUpNext`, and the per-row `o.id`/`o.name`, `u.*`) is produced in Step 2/3.
- **Mirror discipline:** ends with `cp` + `diff … && echo IDENTICAL`; scratch removed in Step 8.
- **No backend / deploy:** single frontend change; merge + push directly when done.
