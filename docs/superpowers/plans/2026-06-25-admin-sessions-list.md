# Admin Sessions List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A single admin list of every booked session (single + pass) inside the Bookings tab, behind a [Sessions | Passes] toggle, paginated + filtered, with per-row Cancel and assign/change coach.

**Architecture:** All in the single SuperConductor component in `index.html` (mirrored to `Pasig Greenpark Archery Camp.dc.html`). The list reads the already-loaded `state.allBookings` (`?action=bookings`). Reuses `assignBookingCoach`, admin `cancelBooking('admin')`, `coachById`, `isSessionUsed`. No backend change, no deploy.

**Tech Stack:** SuperConductor template (`{{ }}`, `<sc-if>`, `<sc-for>`), plain class-component JS (modern JS OK), Playwright-core with stubbed `fetch`.

## Global Constraints

- **Mirror rule:** every `index.html` edit applied identically to `Pasig Greenpark Archery Camp.dc.html`; end with `diff index.html "Pasig Greenpark Archery Camp.dc.html" && echo IDENTICAL`.
- **No backend change, no deploy** — `?action=bookings` already returns every booking.
- **Independent state:** new `bkView` + `sess*` keys — do NOT reuse the Activity tab's `bkFilter`/`bkSearch`/`bkPage` or the dashboard's `dashUp*`.
- **Pending status match:** selecting "Pending" matches any status that is NOT `approved`/`cancelled` (incl. `booked`/blank) — not a literal `=== 'pending'`.
- Every filter setter resets `sessPage: 0`; `sessPage` is clamped to `[0, sessPageCount-1]`.
- **Verification:** Playwright-core with stubbed `fetch`; chromium at `C:\Users\Michael Cabral\AppData\Local\ms-playwright\chromium-1228\chrome-win64\chrome.exe`; install if missing: `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright-core --no-save`. Scratch harness `_verify_sess.mjs` (deleted in the final task). 0 real console errors.

---

### Task 1: State + `sessionRows` builder + cancel handler + render bindings

Logic only (no markup yet — consumed by Task 2). Verified by driving the builder via the fiber.

**Files:**
- Modify: `index.html` — initial state (~2540); `adminSetTab` (~4524); the admin render section (add the `sessionRows` builder + opt lists + setters); add `cancelSessionBooking` (~3525, near `assignBookingCoach`); the render return object
- Mirror: `Pasig Greenpark Archery Camp.dc.html`
- Test: `_verify_sess.mjs`

**Interfaces:**
- Consumes: `state.allBookings`, `coachById`, `coaches()`, `isSessionUsed`, `assignBookingCoach`, `cancelBooking`, `loadAllBookings`.
- Produces: render-return `bkView`/`bkViewSessions`/`bkViewPasses`/`goSessions`/`goPasses`/`bkSessTabBg`.../`sessionRows`/`sessCount`/`sessNone`/`sessFiltered`/`sess*` values/`sess*Opts`/`setSess*`/`clearSessFilters`/`sessMultiPage`/`sessHasPrev`/`sessHasNext`/`sessPageLabel`/`sessPrev`/`sessNext`. Task 2's markup consumes these.

- [ ] **Step 1: Add state.** Near `acctReschedIdx: null,` (~index.html:2540):
```js
    bkView: 'sessions',
    sessSearch: '', sessStatus: 'all', sessCoach: 'all', sessRange: 'all', sessPage: 0,
```

- [ ] **Step 2: Load bookings when the Bookings tab opens.** In `adminSetTab` (~4524), change the `'plans'` branch to also load all bookings:
```js
      if (t === 'plans') { this.loadRemotePlans(); this.loadAllBookings(); }
```

- [ ] **Step 3: Add `cancelSessionBooking`** near `assignBookingCoach` (~index.html:3525):
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

- [ ] **Step 4: Add the `sessionRows` builder.** In the admin render section (place it near the other admin list builders — e.g. right after the dashboard `bkStatusInfo`/`upcoming` block, before `adminPlanRows`), add:
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
        if (sessStatus === 'pending') { if (st === 'approved' || st === 'cancelled') return false; }
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
        amountLabel: b.amount ? ('₱' + Number(b.amount).toLocaleString('en-PH')) : '', hasAmount: !!b.amount,
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
    const goSessions = () => this.setState({ bkView: 'sessions' });
    const goPasses = () => this.setState({ bkView: 'passes' });
    const bkViewSessions = this.state.bkView !== 'passes';
```

- [ ] **Step 5: Add the render-return bindings.** In the admin render return object, add (near the existing `tabPlans`/`adminPlanRows` keys):
```js
      bkView: this.state.bkView || 'sessions', bkViewSessions: bkViewSessions, bkViewPasses: !bkViewSessions,
      goSessions: goSessions, goPasses: goPasses,
      bkSessTabBg: bkViewSessions ? '#244232' : '#fffdf6', bkSessTabFg: bkViewSessions ? '#f4efe4' : '#244232',
      bkPassTabBg: !bkViewSessions ? '#244232' : '#fffdf6', bkPassTabFg: !bkViewSessions ? '#f4efe4' : '#244232',
      sessionRows: sessionRows, sessCount: sessTotal, sessNone: sessTotal === 0,
      sessFiltered: sessFilteredActive,
      sessEmptyLabel: sessFilteredActive ? 'No sessions match these filters.' : 'No sessions booked yet.',
      sessSearch: this.state.sessSearch || '', sessStatus: sessStatus, sessCoach: sessCoach, sessRange: sessRange,
      sessStatusOpts: sessStatusOpts, sessRangeOpts: sessRangeOpts, sessCoachOpts: sessCoachOpts, sessAssignOpts: sessAssignOpts,
      setSessSearch: setSess('sessSearch'), setSessStatus: setSess('sessStatus'), setSessCoach: setSess('sessCoach'), setSessRange: setSess('sessRange'),
      clearSessFilters: clearSessFilters,
      sessMultiPage: sessPageCount > 1, sessHasPrev: sessPage > 0, sessHasNext: sessPage < sessPageCount - 1,
      sessPageLabel: ('Page ' + (sessPage + 1) + ' of ' + sessPageCount), sessPrev: sessPrev, sessNext: sessNext,
```

- [ ] **Step 6: Mirror.** `cp index.html "Pasig Greenpark Archery Camp.dc.html"`; `diff … && echo IDENTICAL`.

- [ ] **Step 7: Verify (builder logic via fiber).** Create `_verify_sess.mjs`: reach the instance via the React fiber; patch `nowManila` to a fixed clock; set `state.allBookings` (via `setState`) to ~20 bookings across two coach ids, varied statuses (`approved`/`booked`/`cancelled`), dates (past + future), programs/names. Read the instance's render output / call into the builder by setting `sess*` state and reading the produced `sessionRows` (drive via `inst.setState` then read the rendered bindings, or call the builder path the harness used for the dashboard). Assert:
  - default (`sessStatus/sessCoach/sessRange='all'`): `sessionRows.length` === min(10, total); `sessCount` === total; sorted date+time descending.
  - `sessStatus='approved'` → only approved; `sessStatus='pending'` → none are approved/cancelled (booked/blank included); `sessStatus='cancelled'` → only cancelled.
  - `sessCoach=<id>` → only that coach; `sessRange='upcoming'` → none `isSessionUsed`; `sessRange='past'` → all `isSessionUsed`.
  - `sessSearch='<name>'` → narrows; combined coach+status applies.
  - pagination: `sessNext` advances `sessPage`; clamps; `setSess*` resets `sessPage` to 0; `clearSessFilters` resets all.
  - a row's `setCoach({target:{value:'<id>'}})` triggers an `assignBookingCoach`→`setBookingCoach` POST (stub fetch); a row's `cancel()` (auto-confirm) triggers a `cancel` POST `by:'admin'`.
  Run `node _verify_sess.mjs`; expected PASS, 0 real console errors. Confirm mirror IDENTICAL.

- [ ] **Step 8: Commit.**
```bash
git add index.html "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Admin Sessions T1: sessionRows builder (filter/sort/paginate allBookings) + cancelSessionBooking + bkView/sess* state + bindings"
```

---

### Task 2: Markup — [Sessions | Passes] toggle + Sessions view + wrap Passes

**Files:**
- Modify: `index.html` — the Bookings tab markup (`<sc-if value="{{ tabPlans }}">` ~1958, through its close before the Coaches tab ~2062)
- Mirror: `Pasig Greenpark Archery Camp.dc.html`
- Test: `_verify_sess.mjs`

**Interfaces:**
- Consumes: all Task 1 render-return bindings.

- [ ] **Step 1: Wrap the existing Passes content.** The Bookings tab content currently lives directly inside `<sc-if value="{{ tabPlans }}">` (open ~1958) and ends just before `<!-- COACHES TAB -->` (~2062). Wrap ALL of that existing content (the `adminPlanRows` intro, filters, list, and pagination — everything between the tab's opening container and its close) in a new `<sc-if value="{{ bkViewPasses }}" hint-placeholder-val="{{ false }}"> … </sc-if>`. Do not change the content itself — only nest it. (Find the tab's opening `<div>` right after the `tabPlans` `<sc-if>`; insert the toggle + Sessions `<sc-if>` (Step 2) before the passes content, then open `bkViewPasses` around the passes content.)

- [ ] **Step 2: Add the toggle + Sessions view.** Immediately inside the tab (before the wrapped Passes content), insert the toggle and the Sessions list:
```html
          <div style="display:flex;gap:8px;margin-bottom:18px;">
            <button onClick="{{ goSessions }}" style="background:{{ bkSessTabBg }};color:{{ bkSessTabFg }};border:1px solid rgba(36,66,50,0.16);cursor:pointer;font-family:'Hanken Grotesk',sans-serif;font-size:14px;font-weight:700;padding:9px 18px;border-radius:999px;">Sessions</button>
            <button onClick="{{ goPasses }}" style="background:{{ bkPassTabBg }};color:{{ bkPassTabFg }};border:1px solid rgba(36,66,50,0.16);cursor:pointer;font-family:'Hanken Grotesk',sans-serif;font-size:14px;font-weight:700;padding:9px 18px;border-radius:999px;">Passes</button>
          </div>
          <sc-if value="{{ bkViewSessions }}" hint-placeholder-val="{{ true }}">
          <div>
            <h3 style="font-size:16px;font-weight:800;color:#1b2a1f;margin:0 0 4px;">All booked sessions</h3>
            <p style="font-size:13px;color:#56664f;margin:0 0 14px;">Every session booked across the business — single bookings and pass sessions. Assign a coach or cancel right here.</p>
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap;">
              <input type="text" value="{{ sessSearch }}" onInput="{{ setSessSearch }}" placeholder="Search name, program, reference…" style="flex:1;min-width:200px;padding:10px 14px;border:1px solid rgba(36,66,50,0.2);border-radius:10px;font-size:14px;font-family:'Hanken Grotesk',sans-serif;">
              <select value="{{ sessStatus }}" onChange="{{ setSessStatus }}" style="padding:10px 14px;border:1px solid rgba(36,66,50,0.2);border-radius:10px;font-size:14px;font-family:'Hanken Grotesk',sans-serif;background:#fffdf6;"><sc-for list="{{ sessStatusOpts }}" as="o" hint-placeholder-count="0"><option value="{{ o.id }}">{{ o.name }}</option></sc-for></select>
              <select value="{{ sessRange }}" onChange="{{ setSessRange }}" style="padding:10px 14px;border:1px solid rgba(36,66,50,0.2);border-radius:10px;font-size:14px;font-family:'Hanken Grotesk',sans-serif;background:#fffdf6;"><sc-for list="{{ sessRangeOpts }}" as="o" hint-placeholder-count="0"><option value="{{ o.id }}">{{ o.name }}</option></sc-for></select>
              <select value="{{ sessCoach }}" onChange="{{ setSessCoach }}" style="padding:10px 14px;border:1px solid rgba(36,66,50,0.2);border-radius:10px;font-size:14px;font-family:'Hanken Grotesk',sans-serif;background:#fffdf6;"><sc-for list="{{ sessCoachOpts }}" as="o" hint-placeholder-count="0"><option value="{{ o.id }}">{{ o.name }}</option></sc-for></select>
            </div>
            <div style="font-size:13px;color:#56664f;margin-bottom:12px;">{{ sessCount }} session(s)<sc-if value="{{ sessFiltered }}" hint-placeholder-val="{{ false }}"> · <button onClick="{{ clearSessFilters }}" style="background:none;border:none;cursor:pointer;color:#4d7327;font-weight:700;font-size:13px;font-family:'Hanken Grotesk',sans-serif;text-decoration:underline;padding:0;">clear filters</button></sc-if></div>
            <sc-if value="{{ sessNone }}" hint-placeholder-val="{{ true }}"><div style="background:#fffdf6;border:1px dashed rgba(36,66,50,0.2);border-radius:12px;padding:24px;text-align:center;color:#8a9579;font-size:14px;">{{ sessEmptyLabel }}</div></sc-if>
            <div style="display:flex;flex-direction:column;gap:8px;">
              <sc-for list="{{ sessionRows }}" as="r" hint-placeholder-count="0">
                <div style="background:#fffdf6;border:1px solid rgba(36,66,50,0.12);border-radius:10px;padding:12px 16px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;">
                  <div style="min-width:120px;">
                    <div style="font-size:14px;font-weight:800;color:#1b2a1f;">{{ r.when }}</div>
                    <div style="font-size:12.5px;color:#56664f;font-family:'Spline Sans Mono',monospace;">{{ r.time }}</div>
                  </div>
                  <div style="flex:1;min-width:160px;">
                    <div style="font-size:14px;font-weight:700;color:#1b2a1f;">{{ r.name }}</div>
                    <div style="font-size:12.5px;color:#56664f;">{{ r.program }}</div>
                    <sc-if value="{{ r.hasPhone }}" hint-placeholder-val="{{ false }}"><div style="font-size:12px;color:#3c6b48;font-family:'Spline Sans Mono',monospace;margin-top:2px;">📞 <a href="{{ r.callHref }}" style="color:#3c6b48;text-decoration:none;font-weight:700;">{{ r.phone }}</a></div></sc-if>
                    <sc-if value="{{ r.hasRef }}" hint-placeholder-val="{{ false }}"><div style="font-size:11.5px;color:#a6b09a;font-family:'Spline Sans Mono',monospace;margin-top:2px;">{{ r.ref }}</div></sc-if>
                  </div>
                  <span style="font-family:'Spline Sans Mono',monospace;font-size:10.5px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;background:{{ r.statusBg }};color:{{ r.statusFg }};padding:5px 11px;border-radius:999px;">{{ r.statusLabel }}</span>
                  <sc-if value="{{ r.hasAmount }}" hint-placeholder-val="{{ false }}"><span style="font-size:13px;font-weight:700;color:#4d7327;font-family:'Spline Sans Mono',monospace;">{{ r.amountLabel }}</span></sc-if>
                  <select value="{{ r.coachId }}" onChange="{{ r.setCoach }}" style="padding:8px 11px;border:1px solid rgba(36,66,50,0.2);border-radius:8px;font-size:12.5px;font-family:'Hanken Grotesk',sans-serif;background:#f4efe4;color:#244232;"><sc-for list="{{ sessAssignOpts }}" as="o" hint-placeholder-count="0"><option value="{{ o.id }}">{{ o.name }}</option></sc-for></select>
                  <button onClick="{{ r.cancel }}" style="background:none;border:1px solid rgba(180,81,47,0.35);cursor:pointer;font-family:'Hanken Grotesk',sans-serif;font-size:12.5px;font-weight:700;color:#b4512f;padding:7px 13px;border-radius:999px;">Cancel</button>
                </div>
              </sc-for>
            </div>
            <sc-if value="{{ sessMultiPage }}" hint-placeholder-val="{{ false }}">
            <div style="display:flex;align-items:center;justify-content:center;gap:14px;margin-top:16px;">
              <sc-if value="{{ sessHasPrev }}" hint-placeholder-val="{{ true }}"><button onClick="{{ sessPrev }}" style="background:#fffdf6;border:1px solid rgba(36,66,50,0.2);cursor:pointer;font-family:'Hanken Grotesk',sans-serif;font-size:13px;font-weight:700;color:#244232;padding:9px 16px;border-radius:999px;">← Prev</button></sc-if>
              <span style="font-size:13px;color:#56664f;font-family:'Spline Sans Mono',monospace;">{{ sessPageLabel }}</span>
              <sc-if value="{{ sessHasNext }}" hint-placeholder-val="{{ true }}"><button onClick="{{ sessNext }}" style="background:#fffdf6;border:1px solid rgba(36,66,50,0.2);cursor:pointer;font-family:'Hanken Grotesk',sans-serif;font-size:13px;font-weight:700;color:#244232;padding:9px 16px;border-radius:999px;">Next →</button></sc-if>
            </div>
            </sc-if>
          </div>
          </sc-if>
```
Then the wrapped `<sc-if value="{{ bkViewPasses }}">…existing passes content…</sc-if>` follows (Step 1).

- [ ] **Step 3: Mirror.** `cp` + `diff … && echo IDENTICAL`.

- [ ] **Step 4: Verify (end-to-end) + cleanup.** Extend `_verify_sess.mjs`; reach the admin Bookings tab (set `page:'admin'`, `authed:true`, `adminTab:'plans'`; stub `?action=bookings` with the seeded set). Assert:
  - **Toggle:** defaults to Sessions — the "All booked sessions" list renders; clicking **Passes** shows the existing pass-management UI (e.g. the `adminPlanRows` content) and hides the list; clicking **Sessions** returns.
  - **List + pagination:** 10 rows + "Page 1 of N"; Next/Prev work; count line = total.
  - **Filters drive the list:** Status=Approved → only approved rows; Status=Pending → no approved/cancelled; Coach=X → only X; Timeframe=Upcoming → only future; search narrows; "clear filters" restores all.
  - **Actions:** changing a row's coach `<select>` fires a `setBookingCoach` POST with the chosen id; clicking **Cancel** (auto-accept confirm) fires a `cancel` POST `by:'admin'`.
  - **Empty state:** a no-match filter shows "No sessions match these filters."
  Run `node _verify_sess.mjs`; expected ALL PASS (Task 1 assertions still green), 0 real console errors. Mirror IDENTICAL. Then delete scratch:
```bash
rm -f _verify_sess.mjs _sess*.png && rm -rf node_modules package.json package-lock.json
git status --short
```

- [ ] **Step 5: Commit.**
```bash
git add index.html "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Admin Sessions T2: [Sessions|Passes] toggle + all-sessions list (filters, pagination, per-row coach-assign + cancel) in the Bookings tab"
```

---

## Self-review notes

- **Spec coverage:** toggle + Sessions default (T1 state + T2 markup); list from allBookings with status/coach/timeframe/search + 10/page (T1 builder); per-row cancel + assign-coach reusing existing handlers (T1 `cancelSessionBooking` + `assignBookingCoach`; T2 markup); load on tab open (T1 Step 2); Passes view preserved (T2 Step 1). All spec sections map to a step.
- **State isolation:** new `bkView`/`sess*` only; `bk*` (Activity) and `dashUp*` (dashboard) untouched.
- **Pending match:** the builder treats `pending` as not-approved/not-cancelled (Global Constraints + T1 Step 4).
- **Type/name consistency:** every `{{ binding }}` in T2 markup (`bkSessTabBg`, `bkViewSessions`/`bkViewPasses`, `goSessions`/`goPasses`, `sessSearch`/`sessStatus`/`sessRange`/`sessCoach`, `setSess*`, `sess*Opts`, `sessAssignOpts`, `sessCount`, `sessFiltered`, `clearSessFilters`, `sessNone`, `sessEmptyLabel`, `sessionRows`, `r.*`, `sessMultiPage`/`sessHasPrev`/`sessHasNext`/`sessPageLabel`/`sessPrev`/`sessNext`) is produced in T1 Step 5.
- **Mirror discipline:** each task ends with `cp` + `diff … && echo IDENTICAL`; scratch removed in T2 Step 4.
- **No backend/deploy:** frontend-only; merge + push when done.
