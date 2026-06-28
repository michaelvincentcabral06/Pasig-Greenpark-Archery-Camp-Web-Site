# Admin / Booking Cleanup (#7 Phase 2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three frontend-only cleanups — convert the remaining single-coach `matchCoach(b.coach)` reads to multi-coach `coachIdsFromNames`, fix the eligible-discount label (then remove the orphaned booking-level concession code), and add the concession-proof clause to the booking-form error copy.

**Architecture:** Edits to `index.html` (SuperConductor class component), mirrored byte-for-byte to `Pasig Greenpark Archery Camp.dc.html`. No backend change, no redeploy. Reuses `coachIdsFromNames` (#6), `discountList`, `archers[].sel`.

**Tech Stack:** SuperConductor (`{{ }}` bindings, `renderVals()` data layer, ES2015 class). Verified by grep-assertions for removals/copy, a Node unit check of the extractable discount-union logic, Playwright-over-HTTP for the display-affecting changes, and mirror-IDENTICAL.

## Global Constraints

- **Mirror rule:** every `index.html` edit copied byte-for-byte to `Pasig Greenpark Archery Camp.dc.html`; finish each task with `diff "index.html" "Pasig Greenpark Archery Camp.dc.html" && echo IDENTICAL`.
- **SuperConductor:** NO JS expressions inside `{{ }}` — precompute display strings in the data layer; straight ASCII quotes; per-item `<sc-for>` closures in the data layer.
- **Frontend-only.** No backend, no redeploy. Preserve existing empty-state strings exactly (`'Any coach'`, `'No coach yet'`, the `'unassigned'` filter meaning).
- **`b.coach`** on admin bookings is the comma-joined coach NAMES; resolve with `this.coachIdsFromNames(b.coach)` → array of ids.
- **No behavior change** beyond the corrected discount label + the deletion of unreachable code; the discount-row AMOUNT math is untouched.

---

### Task 1: Multi-coach display consistency

**Files:** Modify `index.html` (4 `matchCoach(b.coach)` sites + remove the `matchCoach` helper); mirror to `Pasig Greenpark Archery Camp.dc.html`.

**Interfaces:** Consumes `this.coachIdsFromNames(b.coach)`. After this task, `matchCoach` has zero references and is deleted.

- [ ] **Step 1: Upcoming-schedule row coach name.** In the `upcoming` map (~`index.html:5571`), delete the `const c = matchCoach(b.coach);` line and change `coach: c ? c.name : 'Any coach',` to:
```js
          coach: b.coach || 'Any coach',
```

- [ ] **Step 2: Bookings-tab coach filter.** In `bkFiltered` (~`index.html:5616`), replace the block:
```js
        const c = matchCoach(b.coach);
        if (bkCoach === 'unassigned') { if (c) return false; }
        else if (!c || c.id !== bkCoach) return false;
```
with:
```js
        const ids = this.coachIdsFromNames(b.coach);
        if (bkCoach === 'unassigned') { if (ids.length) return false; }
        else if (ids.indexOf(bkCoach) === -1) return false;
```

- [ ] **Step 3: Bookings-tab row coach label.** In `dbBookingRows` (~`index.html:5631`), delete the `const c = matchCoach(b.coach);` line and change `coachLabel: c ? c.name : 'No coach yet',` to:
```js
        coachLabel: b.coach || 'No coach yet',
```
(Confirm `c` is not used elsewhere in that row object before deleting — grep the row block; only `coachLabel` used it.)

- [ ] **Step 4: Per-coach upcoming count.** Replace `const c = matchCoach(b.coach); if (c) coachUpcomingCount[c.id]++;` (~`index.html:5726`) with:
```js
      this.coachIdsFromNames(b.coach).forEach(id => { if (coachUpcomingCount[id] != null) coachUpcomingCount[id]++; });
```

- [ ] **Step 5: Remove the dead `matchCoach` helper.** Delete the whole declaration (~`index.html:5522-5526`):
```js
    const matchCoach = (coachVal) => {
      const cv = String(coachVal || '').trim().toLowerCase();
      if (!cv || cv === 'any') return null;
      return dashCoaches.find(c => c.id.toLowerCase() === cv || (c.name || '').toLowerCase() === cv) || null;
    };
```
(`dashCoaches` stays — still used by `coachUpcomingCount` init and `adminCoachCards`.)

- [ ] **Step 6: Mirror + verify.**
  Mirror: `cp "index.html" "Pasig Greenpark Archery Camp.dc.html"` then `diff "index.html" "Pasig Greenpark Archery Camp.dc.html" && echo IDENTICAL`.
  Grep: `grep -c "matchCoach" index.html` → **0**.
  **Playwright over HTTP** (serve, NOT file://; `_srv.mjs` on 127.0.0.1:8099; Chromium `C:\Users\Michael Cabral\AppData\Local\ms-playwright\chromium-1228\chrome-win64\chrome.exe`; write `.mjs` with the Write tool, not heredoc): load `http://127.0.0.1:8099/index.html`; reach the instance via the page-root `__reactContainer$…` fiber (`stateNode.logic`); `setState` to the admin Dashboard + inject `allBookings` with a booking `{coach:'Michael Cabral, James Victoria', date:<future>, time:'4:00 PM', name:'Two Coaches', program:'Open Range', amount:400, status:'approved', archers:2, party:2}` and `coachList` of those two coaches. Assert: the upcoming-schedule row shows `Michael Cabral, James Victoria` (not "Any coach"); switch to the Bookings tab and the row shows both names; the per-coach "upcoming" count is ≥1 for BOTH coaches; filtering Bookings by either coach keeps the booking. Screenshot. 0 real console errors. If fiber injection fails after real effort, fall back to a static-render screenshot + report the limitation. Delete scratch.

- [ ] **Step 7: Commit.**
```bash
git add "index.html" "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Cleanup: multi-coach display consistency (upcoming/Bookings filter+row+count); remove dead matchCoach"
```

---

### Task 2: Eligible-discount label fix + dead concession-code removal

**Files:** Modify `index.html` — the `eligParts` source (~`index.html:5021-5022`); delete `eligPerArcher` (~`3448-3452`), `discountRows` (~`3496-3512`), `toggleElig_` (~`3513`), `setEligProof_` (~`3514`), and the `discountRows: this.discountRows(),` binding (~`5861`); mirror.

**Interfaces:** `eligParts`/`eligDiscountLabel` now derive from the union of per-archer `archers[].sel`. After this task, `discountRows`/`eligPerArcher`/`toggleElig_`/`setEligProof_`/`eligSel`/`eligProof` have zero references.

- [ ] **Step 1: Re-point `eligParts` to the per-archer selections.** Replace these two lines (~`index.html:5021-5022`):
```js
    const sel = this.state.eligSel || {};
    const eligParts = this.discountList().filter(d => sel[d.id]).map(d => d.name);
```
with:
```js
    const eligSelUnion = {};
    archersList.slice(0, party).forEach(a => { const s = (a && a.sel) || {}; Object.keys(s).forEach(id => { if (s[id]) eligSelUnion[id] = true; }); });
    const eligParts = this.discountList().filter(d => eligSelUnion[d.id]).map(d => d.name);
```
(`archersList` is defined just above at ~`index.html:5014`; `party` is in scope. The `eligDiscountLabel`/`eligDiscountAmount` lines below are unchanged — only the name source moves to per-archer.)

- [ ] **Step 2: Delete the `discountRows: this.discountRows(),` binding** (~`index.html:5861`) from the `renderVals` return object.

- [ ] **Step 3: Delete the four dead methods.** Remove in full:
  - `eligPerArcher()` (~`index.html:3448-3452`) — the comment line `// Flat per-archer concessions …` above it too.
  - `discountRows()` (~`index.html:3496-3512`).
  - `toggleElig_(id) { … }` (~`index.html:3513`).
  - `setEligProof_(id, v) { … }` (~`index.html:3514`).
  (Do NOT touch `archerConcessionPerSlot`, `discountList`, `discountFor`, `toggleEditSel_`/`editSel`/`editProof` — those are live.)

- [ ] **Step 4: Mirror + verify.**
  Mirror: `cp "index.html" "Pasig Greenpark Archery Camp.dc.html"` then `diff … && echo IDENTICAL`.
  Grep (each → **0**): `grep -cE "discountRows|eligPerArcher|toggleElig_|setEligProof_|eligSel|eligProof" index.html`.
  **Node unit check** of the union logic: scratch `_t.mjs` with `discountList()` → `[{id:'pasig',name:'Pasig resident'},{id:'pac',name:'PAC member'},{id:'local',name:'Greenpark/RHS'}]`, and a small function mirroring Step 1 (union over `archers[].sel` → `eligParts`). Assert: archers `[{sel:{pasig:true}},{sel:{pac:true}}]`, party 2 → `eligParts` = `['Pasig resident','PAC member']` (order follows `discountList`); `[{sel:{pasig:true}},{sel:{pasig:true}}]` → `['Pasig resident']` (deduped by union); `[{sel:{}}]` → `[]`. Run `node _t.mjs`; green; delete scratch.
  **Playwright over HTTP** (same harness as Task 1): drive the customer booking flow to a program with `offerDiscounts` (Open Range), select a per-archer discount for one archer, and assert the cost-summary eligible-discount row shows the discount NAME (e.g. "Pasig resident") followed by the amount — NOT a blank name. Screenshot. (If driving the full flow is impractical, inject `archers`/`form`/`party`/`slot` state via the fiber to reach the summary, or fall back to a static-render screenshot + report.) 0 real console errors. Delete scratch.

- [ ] **Step 5: Commit.**
```bash
git add "index.html" "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Cleanup: eligible-discount label reads per-archer selections; remove orphaned booking-level concession code"
```

---

### Task 3: `formError` copy

**Files:** Modify `index.html` — both `formError` message blocks (~`index.html:1139` and ~`index.html:1549`); mirror.

- [ ] **Step 1: Update both messages.** Both blocks currently read (identical):
```html
              <div style="font-size:13.5px;color:#f0b48a;">Please complete your name, mobile number, a valid email, every archer's name &amp; birthdate, and pick an available time.</div>
```
Change the text in BOTH to:
```html
              <div style="font-size:13.5px;color:#f0b48a;">Please complete your name, mobile number, a valid email, every archer's name &amp; birthdate, attach proof for any selected discount, and pick an available time.</div>
```
(Use `Edit` with `replace_all` or edit each occurrence; keep the surrounding markup identical. Straight ASCII; the existing `&amp;` entity stays.)

- [ ] **Step 2: Mirror + verify.**
  Mirror: `cp "index.html" "Pasig Greenpark Archery Camp.dc.html"` then `diff … && echo IDENTICAL`.
  Grep: `grep -c "attach proof for any selected discount" index.html` → **2** (both flow variants).

- [ ] **Step 3: Commit.**
```bash
git add "index.html" "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Cleanup: booking-form error copy mentions concession-proof requirement"
```

---

## Self-Review

**Spec coverage** (against `2026-06-28-admin-cleanup-design.md`):
- §1 four `matchCoach(b.coach)` sites converted + `matchCoach` removed → Task 1. ✓
- §1 upcoming name / Bookings filter / Bookings row / per-coach count specifics → Task 1 Steps 1-4. ✓
- §2 `eligParts`/`eligDiscountLabel` re-pointed to per-archer union → Task 2 Step 1. ✓
- §2 remove `discountRows`(+binding)/`toggleElig_`/`setEligProof_`/`eligPerArcher`/`eligSel`/`eligProof` → Task 2 Steps 2-3. ✓
- §3 both `formError` messages get the proof clause → Task 3. ✓
- **Out of scope (correctly):** per-archer My-Bookings edit panel; layout/UX; backend.

**Placeholder scan:** no TBD/TODO; every step shows the exact before/after; verifications give concrete grep counts and assertions.

**Type/name consistency:** `coachIdsFromNames(b.coach)` returns an id array used consistently (`.length`, `.indexOf`, `.forEach`); the empty-state strings (`'Any coach'`/`'No coach yet'`/`'unassigned'`) are preserved; `eligParts` stays a string array feeding the unchanged `eligDiscountLabel`; `archersList`/`party` are in scope at the Step-1 edit; the removed symbols are confirmed unreferenced by the Task-2 grep gate.
