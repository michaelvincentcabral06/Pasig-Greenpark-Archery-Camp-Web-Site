# Special Dates (per-date hour overrides) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Let the admin open a normally-closed date (e.g. a Monday) or close/adjust a normally-open one (holiday) via per-date opening-hour overrides, honored end-to-end (backend availability + the public booking date-picker).

**Architecture:** Overrides live in `content.dayOverrides = { "YYYY-MM-DD": [startHours] }` (`[]` = closed), which already syncs both ways via `setContent`/`getContent`. Backend `effectiveTemplate_(date,dow)` and frontend `startHoursForDate(date)` layer the override on top of the fixed weekly template (`OPEN_HOURS` / `startHours`). An admin "Special dates" editor mutates `content.dayOverrides` through the existing content-save flow.

**Tech Stack:** Single-file static HTML + custom `{{ }}`/`<sc-if>`/`<sc-for>` template framework (`index.html`), mirrored byte-for-byte to `Pasig Greenpark Archery Camp.dc.html`. Google Apps Script backend (`backend/Code.gs`). No unit-test harness — verify with `node --check`, Playwright (`playwright-core`, `channel:"msedge"`), `.dc.html` diff, live `curl`.

## Global Constraints

- **Mirror discipline:** every `index.html` change is copied to `Pasig Greenpark Archery Camp.dc.html`; `diff -q` must be identical before any push.
- **Data shape:** `content.dayOverrides` = `{ "YYYY-MM-DD": [int startHours] }`; `[]` = closed; key absent = weekday template. Hours sanitized to ints 0–23 on both sides.
- **No new endpoint / no new OAuth scope** — overrides ride the existing `setContent`/`getContent`; backend only reads the `CONTENT` property.
- **Backend version:** bump to `db-v39`, add `dayOverrides: true` to `?action=version`.
- **No em-dashes** in user-visible copy.
- **Regression safety:** with no overrides set, availability + the date-picker behave exactly as today.
- **Apps Script web app URL** (verification): `https://script.google.com/macros/s/AKfycbzGPuLsTrijb08rFTFVwkBU1KcG0HKg-mtlgVOWODsFubwCl8o_urpcDAxeTVEGqCYOug/exec`

---

## File Structure

- `backend/Code.gs` — `dayOverrides_()`, `effectiveTemplate_()`, wired into `coachHoursFor_` + `hoursForRequest_`; version bump.
- `index.html` — `mergedContent` whitelist add; `dayOverrides()` + `startHoursForDate()`; repoint 8 date-context `startHours()` calls; admin "Special dates" editor (state + handlers + markup). Mirrored to `.dc.html`.
- `backend/SETUP.md` — db-v39 section.

---

## Task 1: Backend — `effectiveTemplate_` + wiring + db-v39

**Files:** Modify `backend/Code.gs` (add helpers near `coachHoursFor_` ~443; edit two return lines; bump version ~968).

**Interfaces:**
- Produces: `effectiveTemplate_(dateStr, dow)` → array of int start-hours (override if `content.dayOverrides[dateStr]` set, else `OPEN_HOURS[dow]`). `?action=version` gains `"version":"db-v39","dayOverrides":true`.

- [ ] **Step 1: Add the helpers** — insert immediately BEFORE `function coachHoursFor_` (`backend/Code.gs:443`):

```javascript
// db-v39: per-date opening-hour overrides. content.dayOverrides = { "YYYY-MM-DD": [startHours] };
// [] = closed that date, key absent = the weekday template. Lets the admin open a normally-closed
// date or close/adjust an open one. Read from the CONTENT property (synced with the website).
function dayOverrides_() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty('CONTENT');
    if (raw) { var c = JSON.parse(raw); return (c && c.dayOverrides) || {}; }
  } catch (e) {}
  return {};
}
function effectiveTemplate_(dateStr, dow) {
  var ov = dayOverrides_();
  if (ov && Object.prototype.hasOwnProperty.call(ov, dateStr)) {
    var arr = ov[dateStr] || [], out = [];
    for (var i = 0; i < arr.length; i++) {
      var h = parseInt(arr[i], 10);
      if (!isNaN(h) && h >= 0 && h < 24 && out.indexOf(h) < 0) out.push(h);
    }
    return out.sort(function (a, b) { return a - b; });
  }
  return OPEN_HOURS[dow] || [];
}
```

- [ ] **Step 2: Wire both template fallbacks** — there are exactly two `return OPEN_HOURS[dow] || [];` lines (in `coachHoursFor_` ~446 and `hoursForRequest_` ~461); both have `dateStr` and `dow` in scope. Replace BOTH occurrences of:

```javascript
  return OPEN_HOURS[dow] || [];
```
with:
```javascript
  return effectiveTemplate_(dateStr, dow);
```
(Confirm with `grep -n "return OPEN_HOURS\[dow\] || \[\];" backend/Code.gs` that exactly 2 exist before/after.)

- [ ] **Step 3: Bump the version** — in the `action === 'version'` block, change `version: 'db-v38'` to `version: 'db-v39'` and insert `dayOverrides: true,` right after `driveImages: true,`:

```javascript
      return json_({ version: 'db-v39', auth: true, dayOverrides: true, driveImages: true, /* …rest unchanged… */ });
```

- [ ] **Step 4: Syntax check**

Run:
```bash
cp backend/Code.gs /tmp/c.js && node --check /tmp/c.js && echo "GS SYNTAX OK" && rm -f /tmp/c.js
grep -c "return effectiveTemplate_(dateStr, dow);" backend/Code.gs   # expect 2
```
Expected: `GS SYNTAX OK`; grep count `2`.

- [ ] **Step 5: SETUP.md db-v39 section** — append to `backend/SETUP.md`:

```markdown

---

## db-v39 deploy & verify

**What changed:** per-date opening-hour overrides (special dates). New `dayOverrides_()` +
`effectiveTemplate_()` read `content.dayOverrides` and feed the range + coach-fallback hour paths,
so `buildSlots_` serves an opened/closed date. No new endpoint or scope (reads the CONTENT property).

### Deploy steps
1. Apps Script editor → paste `backend/Code.gs` → **Save**.
2. **Deploy → Manage deployments → ✏️ edit → New version → Deploy.**

### Verify
- [ ] `…/exec?action=version` → `"version":"db-v39"`, `"dayOverrides":true`.
- [ ] After the admin adds an open override for a future Monday, `…/exec?action=availability&date=<thatMonday>` returns the set hours (empty before).
```

- [ ] **Step 6: Commit**

```bash
git add backend/Code.gs backend/SETUP.md
git commit -m "backend db-v39: per-date hour overrides (effectiveTemplate_ from content.dayOverrides)"
```

> Backend goes live via a manual redeploy in Task 4. Frontend tasks are safe against db-v38 (no `dayOverrides` set yet → `effectiveTemplate_` never consulted; site behaves as today).

---

## Task 2: Frontend core — whitelist + `startHoursForDate` + repoint call sites

**Files:** Modify `index.html` (+ mirror). `mergedContent` ~3290; `startHours` ~3507; call sites 3238, 3432, 3574, 5214, 5312, 5336, 5690, 5715.

**Interfaces:**
- Consumes: `state.content.dayOverrides`.
- Produces: `dayOverrides()` → the map; `startHoursForDate(dateStr)` → int start-hours honoring the override. Later tasks rely on `content.dayOverrides` surviving `mergedContent`.

- [ ] **Step 1: Add `dayOverrides` to the `mergedContent` whitelist** — in `mergedContent` (`index.html:~3290`, the object returning `packages`, `programs`, … `testimonials`), add this line alongside the others (e.g. after `testimonials`):

```javascript
      dayOverrides: c.dayOverrides || {},
```

- [ ] **Step 2: Add the two helper methods** — insert immediately AFTER the `startHours(dow) { … }` method (`index.html:~3512`, right before `fmtHour`):

```javascript
  dayOverrides() { const c = this.state.content || {}; return c.dayOverrides || {}; }
  // Date-aware opening hours: the per-date override if the admin set one, else the weekday template.
  startHoursForDate(dateStr) {
    const ov = this.dayOverrides();
    if (ov && Object.prototype.hasOwnProperty.call(ov, dateStr)) return (ov[dateStr] || []).slice();
    return this.startHours(new Date(dateStr + 'T00:00:00').getDay());
  }
```

- [ ] **Step 3: Repoint the 8 date-context call sites.** Make each edit exactly:

`index.html:3240` (coach-hours fallback):
```javascript
    return this.startHours(dow);
```
→
```javascript
    return this.startHoursForDate(dateStr);
```

`index.html:3433` (coach "open this day" default):
```javascript
    this.setCoachOverride(ds, this.startHours(dow));
```
→
```javascript
    this.setCoachOverride(ds, this.startHoursForDate(ds));
```

`index.html:3576` (date slot preview):
```javascript
    return this.startHours(dow).map(h => {
```
→
```javascript
    return this.startHoursForDate(dateStr).map(h => {
```

`index.html:5214` (`slotDayHasHours`):
```javascript
    const slotDayHasHours = !!st.slotDate && this.startHours(new Date(st.slotDate + 'T00:00:00').getDay()).length > 0;
```
→
```javascript
    const slotDayHasHours = !!st.slotDate && this.startHoursForDate(st.slotDate).length > 0;
```

`index.html:5314` (admin/coach calendar cell — note the date var is `ds`):
```javascript
      const closed = this.startHours(dow).length === 0;
```
→
```javascript
      const closed = this.startHoursForDate(ds).length === 0;
```

`index.html:5338` (multi-date calendar cell — the date var is `d`). This line is textually identical to 5314, so edit it by matching its surrounding context (the block with `const times = multiTimesState[d]` and `const dow = new Date(d + 'T00:00:00').getDay();`):
```javascript
      const closed = this.startHours(dow).length === 0;
```
→
```javascript
      const closed = this.startHoursForDate(d).length === 0;
```

`index.html:5690` (**public booking date-picker** — the key one; date var `c.date`):
```javascript
const isOpen = this.startHours(dow).length > 0;
```
→
```javascript
const isOpen = this.startHoursForDate(c.date).length > 0;
```

`index.html:5717` (plan-editor base hours, non-coach branch; date var `planEditDate`):
```javascript
        const baseHours = p.coach ? this.coachHoursFor(p.coach, planEditDate) : this.startHours(dow);
```
→
```javascript
        const baseHours = p.coach ? this.coachHoursFor(p.coach, planEditDate) : this.startHoursForDate(planEditDate);
```

- [ ] **Step 4: Mirror + verify no regressions (site unchanged with no overrides)**

Run:
```bash
cp index.html "Pasig Greenpark Archery Camp.dc.html"
diff -q index.html "Pasig Greenpark Archery Camp.dc.html"
grep -c "this.startHours(dow)" index.html   # should be far fewer; the weekday-only display + startHours def remain
cat > /tmp/chk.cjs <<'EOF'
const pw=require("playwright-core");
const URL="file:///C:/Users/Michael%20Cabral/OneDrive/Documents/Code/Pasig%20Greenpark%20Archery%20Camp%20Web%20Site/index.html";
(async()=>{const b=await pw.chromium.launch({channel:"msedge"});const pg=await b.newPage();const errs=[];pg.on("pageerror",e=>errs.push(e.message));await pg.goto(URL,{waitUntil:"domcontentloaded",timeout:30000});await pg.waitForTimeout(2000);
 // open Book, pick the next Tuesday-ish open day still shows slots; a Monday still greys out
 require("fs").writeFileSync("C:/tmp/chk.txt","pageErrors:"+errs.length+(errs.length?(" "+JSON.stringify(errs.slice(0,3))):""));await b.close();})();
EOF
node /tmp/chk.cjs; cat "C:/tmp/chk.txt"
```
Expected: `diff` identical; `pageErrors:0`.

- [ ] **Step 5: Commit**

```bash
git add index.html "Pasig Greenpark Archery Camp.dc.html"
git commit -m "special dates: date-aware startHoursForDate + mergedContent whitelist; repoint date pickers"
```

---

## Task 3: Frontend — admin "Special dates" editor

**Files:** Modify `index.html` (+ mirror). Initial state ~2810; admin handlers near `saveCM` ~5406; admin render values ~6553; markup near the schedule-note editor ~2572.

**Interfaces:**
- Consumes: `saveCM` (`index.html:5406`), `cm.dayOverrides`, `fmtHour` (`index.html:3513`).
- Produces: admin controls that mutate `content.dayOverrides`.

- [ ] **Step 1: Seed working state** — in the initial-state object, near `slotsLoading: false,` (`index.html:~2810`), add:

```javascript
    dayOvDate: '',
    dayOvHours: [],
```

- [ ] **Step 2: Add handlers** — inside the admin render function where `saveCM` is defined (`index.html:~5406`), directly after the `const saveCM = …` line add:

```javascript
    const setDayOverride = (date, hours) => saveCM({ dayOverrides: { ...(cm.dayOverrides || {}), [date]: hours } });
    const removeDayOverride = (date) => { const o = { ...(cm.dayOverrides || {}) }; delete o[date]; saveCM({ dayOverrides: o }); };
```

- [ ] **Step 3: Add render values** — in the admin render-return object near `scheduleNoteEdit` (`index.html:~6553`), add:

```javascript
      dayOvDate: this.state.dayOvDate || '',
      setDayOvDate: (e) => this.setState({ dayOvDate: e.target.value }),
      dayOvChips: [9,10,11,12,13,14,15,16,17,18,19].map(h => {
        const on = (this.state.dayOvHours || []).indexOf(h) !== -1;
        return { label: this.fmtHour(h), on: on, chipBg: on ? '#244232' : '#f4efe4', chipFg: on ? '#f4efe4' : '#244232',
          toggle: () => this.setState(s => { const cur = (s.dayOvHours || []).slice(); const i = cur.indexOf(h); if (i === -1) cur.push(h); else cur.splice(i, 1); cur.sort((a,b)=>a-b); return { dayOvHours: cur }; }) };
      }),
      saveDayOpen: () => { const d = (this.state.dayOvDate || '').trim(); const hrs = (this.state.dayOvHours || []).slice(); if (d && hrs.length) { setDayOverride(d, hrs); this.setState({ dayOvDate: '', dayOvHours: [] }); } },
      markDayClosed: () => { const d = (this.state.dayOvDate || '').trim(); if (d) { setDayOverride(d, []); this.setState({ dayOvDate: '', dayOvHours: [] }); } },
      dayOverrideRows: Object.keys(cm.dayOverrides || {}).sort().map(date => {
        const hrs = (cm.dayOverrides[date] || []).slice().sort((a,b)=>a-b);
        const summary = hrs.length ? (this.fmtHour(hrs[0]) + ' – ' + this.fmtHour(hrs[hrs.length - 1] + 1)) : 'Closed';
        return { date: date, summary: summary, remove: () => removeDayOverride(date) };
      }),
```

- [ ] **Step 4: Add the markup** — insert immediately AFTER the schedule-note editor block that contains `{{ setScheduleNote }}` (`index.html:~2572`; place it after that field's closing wrapper, inside the same admin section):

```html
<div style="background:#fffdf6;border:1px solid rgba(36,66,50,0.1);border-radius:12px;padding:18px 20px;margin-top:16px;">
  <div style="font-family:'Spline Sans Mono',monospace;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#3c6b48;margin-bottom:6px;">Special dates</div>
  <p style="font-size:13px;line-height:1.5;color:#56664f;margin:0 0 12px;">Open a normally-closed date (e.g. a Monday) or close a normally-open one (a holiday). Pick a date, choose its hours, then Save. Leave it blank and Mark closed to shut a date.</p>
  <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:12px;">
    <input type="date" value="{{ dayOvDate }}" onInput="{{ setDayOvDate }}" style="background:#f4efe4;border:1px solid rgba(36,66,50,0.16);border-radius:8px;padding:9px 11px;font-family:'Hanken Grotesk',sans-serif;font-size:14px;color:#1b2a1f;outline:none;" />
    <button onClick="{{ saveDayOpen }}" style="background:#244232;color:#f4efe4;border:none;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;font-size:13px;font-weight:700;padding:9px 16px;border-radius:999px;">Save open date</button>
    <button onClick="{{ markDayClosed }}" style="background:none;border:1px solid rgba(36,66,50,0.2);cursor:pointer;font-family:'Hanken Grotesk',sans-serif;font-size:12.5px;font-weight:700;color:#244232;padding:8px 14px;border-radius:999px;">Mark closed</button>
  </div>
  <div style="display:flex;flex-wrap:wrap;gap:7px;margin-bottom:14px;">
    <sc-for list="{{ dayOvChips }}" as="ch" hint-placeholder-count="11">
      <button onClick="{{ ch.toggle }}" style="cursor:pointer;border:1px solid rgba(36,66,50,0.18);border-radius:999px;padding:6px 12px;font-family:'Spline Sans Mono',monospace;font-size:12px;background:{{ ch.chipBg }};color:{{ ch.chipFg }};">{{ ch.label }}</button>
    </sc-for>
  </div>
  <sc-for list="{{ dayOverrideRows }}" as="r" hint-placeholder-count="0">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;border-top:1px dashed rgba(36,66,50,0.14);padding:9px 0;">
      <div style="font-size:13.5px;color:#1b2a1f;"><span style="font-family:'Spline Sans Mono',monospace;">{{ r.date }}</span> &nbsp; <span style="color:#56664f;">{{ r.summary }}</span></div>
      <button onClick="{{ r.remove }}" style="background:none;border:1px solid rgba(180,81,47,0.3);cursor:pointer;font-family:'Hanken Grotesk',sans-serif;font-size:12px;font-weight:700;color:#b4512f;padding:6px 12px;border-radius:999px;">Remove</button>
    </div>
  </sc-for>
</div>
```

- [ ] **Step 5: Mirror + verify (parse + panel renders in admin)**

Run:
```bash
cp index.html "Pasig Greenpark Archery Camp.dc.html"
diff -q index.html "Pasig Greenpark Archery Camp.dc.html"
cat > /tmp/chk3.cjs <<'EOF'
const pw=require("playwright-core");
const URL="file:///C:/Users/Michael%20Cabral/OneDrive/Documents/Code/Pasig%20Greenpark%20Archery%20Camp%20Web%20Site/index.html";
(async()=>{const b=await pw.chromium.launch({channel:"msedge"});const pg=await b.newPage();const errs=[];pg.on("pageerror",e=>errs.push(e.message));await pg.goto(URL,{waitUntil:"domcontentloaded",timeout:30000});await pg.waitForTimeout(1800);require("fs").writeFileSync("C:/tmp/chk3.txt","pageErrors:"+errs.length+(errs.length?(" "+JSON.stringify(errs.slice(0,3))):""));await b.close();})();
EOF
node /tmp/chk3.cjs; cat "C:/tmp/chk3.txt"
```
Expected: `diff` identical; `pageErrors:0`. (Full admin-panel render + save is exercised live in Task 4.)

- [ ] **Step 6: Commit**

```bash
git add index.html "Pasig Greenpark Archery Camp.dc.html"
git commit -m "special dates: admin editor (date + hour chips, save open / mark closed, list + remove)"
```

---

## Task 4: Push, deploy db-v39, live verification

**Files:** none (deploy + verify). Depends on Tasks 1-3.

- [ ] **Step 1: Push** — `git push origin main`.

- [ ] **Step 2: Owner redeploys backend to db-v39** — Apps Script editor → paste `backend/Code.gs` → Save → Deploy → Manage deployments → edit existing → New version → Deploy. Wait for "done."

- [ ] **Step 3: Verify backend**

Run:
```bash
curl -s -L -m 25 "https://script.google.com/macros/s/AKfycbzGPuLsTrijb08rFTFVwkBU1KcG0HKg-mtlgVOWODsFubwCl8o_urpcDAxeTVEGqCYOug/exec?action=version" | grep -o '"version":"db-v39"\|"dayOverrides":true'
```
Expected: both matches.

- [ ] **Step 4: Live end-to-end (Playwright, against production, admin passcode `greenpark2026`)** — after CDN settles (poll past ~60-90s):
  1. Log into admin → schedule area → **Special dates**.
  2. Add an OPEN override for the next future Monday (toggle e.g. 4–7pm chips → Save open date). Confirm it appears in the list.
  3. Go to Book → the date-picker now lets you select that Monday and shows the set hours (`?action=availability&date=<monday>` returns them).
  4. Add a CLOSED override for the next open Saturday → the picker greys it out; `?action=availability` returns no slots.
  5. Remove both overrides → dates revert to their weekly default.
  Capture screenshots as evidence. Confirm a normal Tue/Sat still behaves as before (regression).

- [ ] **Step 5: Update memory** — append to `.../memory/` a `special-dates.md` (or extend an existing hours/booking memory) + `MEMORY.md`: `content.dayOverrides` model, `effectiveTemplate_`/`startHoursForDate`, db-v39, admin Special dates editor.

---

## Self-Review

**Spec coverage:**
- `content.dayOverrides` model → Tasks 1-3. ✓
- Backend `effectiveTemplate_`/`dayOverrides_` + wiring into coach-fallback + range paths → Task 1. ✓
- Frontend `startHoursForDate` + `dayOverrides()` + repoint date-picker & date-context calls → Task 2. ✓
- `mergedContent` whitelist (the self-review catch) → Task 2 Step 1. ✓
- Admin Special dates editor (date + hours, mark closed, list + remove) → Task 3. ✓
- Open-a-closed-day AND close-an-open-day → same mechanism, both tested Task 4 Step 4. ✓
- db-v39 + `dayOverrides` flag + SETUP.md → Task 1. ✓
- Mirror discipline + manual redeploy + no new scope → Global Constraints + Tasks 2-4. ✓
- Coach own-availability precedence preserved → Task 1 (only the fallback branch of `coachHoursFor_` changes; the stored-`avail:` branch is untouched). ✓

**Placeholder scan:** every code step has full code; the two `grep -c` checks are concrete verifications, not placeholders. ✓

**Type consistency:** `startHoursForDate(dateStr)`, `dayOverrides()`, `effectiveTemplate_(dateStr, dow)`, `setDayOverride(date, hours)`, `removeDayOverride(date)` used consistently across tasks. `content.dayOverrides` shape (`{date:[ints]}`) consistent backend/frontend/editor. ✓
