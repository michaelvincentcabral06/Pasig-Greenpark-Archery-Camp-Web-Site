# Admin Dashboard Redesign (direction A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the admin Dashboard to look professional (direction A): an "at a glance" hero row, then clean grouped sections — same data, layout-only, plus 3 small display-only bindings.

**Architecture:** All in the single SuperConductor component in `index.html` (mirrored to `Pasig Greenpark Archery Camp.dc.html`). Reuses all existing dashboard bindings; adds split-bar %, a next-session preview, and coach-avatar initials. No backend change, no deploy.

**Tech Stack:** SuperConductor template (`{{ }}`, `<sc-if>`, `<sc-for>`), plain class-component JS (modern JS OK), Playwright-core with stubbed `fetch`.

## Global Constraints

- **Mirror rule:** every `index.html` edit applied identically to `Pasig Greenpark Archery Camp.dc.html`; end with `diff index.html "Pasig Greenpark Archery Camp.dc.html" && echo IDENTICAL`.
- **No backend change, no deploy.** All earnings/split/count logic unchanged — reuse existing bindings; only 3 new display-only bindings.
- **Preserve functionality:** the coach split editor (`cp.setCoachPct`/`setEquipPct`/`setRangePct`/`saveSplit`/`sumBad`) and the Upcoming-schedule block (`dashUp*` filters + pagination) must keep working.
- **Verification:** Playwright-core with stubbed `fetch`; chromium at `C:\Users\Michael Cabral\AppData\Local\ms-playwright\chromium-1228\chrome-win64\chrome.exe`; install if missing: `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright-core --no-save`. Scratch harness `_verify_dash2.mjs` (deleted at the end). 0 real console errors.

---

### Task 1: Dashboard redesign (small builders + bindings + markup)

**Files:**
- Modify: `index.html` — dashboard render builders (add split-% + next-upcoming near the earnings/coach builders ~4929-4946; `coachPayRows` gains `initials`); the render return; the dashboard markup (`<sc-if value="{{ tabDashboard }}">` ~1798, sections ~1800-1879)
- Mirror: `Pasig Greenpark Archery Camp.dc.html`
- Test: `_verify_dash2.mjs`

**Interfaces:**
- Consumes existing: `earnWeekLabel`/`earnMonthLabel`/`earnYearLabel`/`earnTotalLabel`, raw `coachTotal`/`equipTotal`/`rangeTotal`, `coachTotalLabel`/`equipTotalLabel`/`rangeTotalLabel`, `dashApproved`/`dashPending`/`dashCancelled`, `coachCount`, `upCount`, `coachPayRows`, `upcoming`, `coachInitials`, `hasUnassignedPay`/`coachUnassignedLabel`, the `dashUp*` upcoming bindings.
- Produces: `splitCoachPct`/`splitEquipPct`/`splitRangePct`, `nextUpcomingLabel`, `hasNextUpcoming`; `coachPayRows[].initials`.

- [ ] **Step 1: Add the small builders.** Near the split totals / `coachPayRows` (~index.html:4929-4946), add:
```js
    const splitSum = (coachTotal + equipTotal + rangeTotal) || 0;
    const splitPctOf = (n) => splitSum > 0 ? Math.round((n / splitSum) * 100) : 0;
    const splitCoachPct = splitPctOf(coachTotal), splitEquipPct = splitPctOf(equipTotal), splitRangePct = splitPctOf(rangeTotal);
    const nextUp = (upcoming && upcoming.length) ? upcoming[0] : null;
    const hasNextUpcoming = !!nextUp;
    const nextUpcomingLabel = nextUp ? (((nextUp.date || '') + ' ' + (nextUp.time || '') + ' · ' + (nextUp.who || nextUp.name || '')).trim()) : '';
```
NOTE: `upcoming` is defined later in render than the coach builders — place this block AFTER `upcoming` is built (search for `const upcoming =` / the `upAllFiltered` block ~4952+ and put the `nextUp`/`splitPctOf` lines just after it; `coachTotal`/`equipTotal`/`rangeTotal` are available from the earlier earnings block). Confirm `upcoming` is sorted soonest-first (ascending date+time); if it sorts descending, use `upcoming[upcoming.length-1]` or sort a copy ascending for the preview.

- [ ] **Step 2: Add `initials` to `coachPayRows`.** In the `coachPayRows` map return (~4936-4944), add:
```js
        initials: this.coachInitials(c.name),
```

- [ ] **Step 3: Add render-return bindings.** Near the existing dashboard keys (`earnWeekLabel`/`coachPayRows`/`upCount` ~5478-5487), add:
```js
      splitCoachPct: splitCoachPct, splitEquipPct: splitEquipPct, splitRangePct: splitRangePct,
      nextUpcomingLabel: nextUpcomingLabel, hasNextUpcoming: hasNextUpcoming,
```

- [ ] **Step 4: Redesign the dashboard markup.** Replace the markup from the booking-counts block through the coach-payments block (~index.html:1800-1879 — i.e. from `<!-- BOOKING COUNTS -->` through the `hasUnassignedPay` note, INCLUSIVE) with the direction-A layout below. **Keep the `<!-- UPCOMING SCHEDULE -->` block (~1881 to the tab close) unchanged** (optionally leave its `<h3>` as-is). New markup:
```html
          <!-- AT A GLANCE -->
          <div style="font-family:'Spline Sans Mono',monospace;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#3c6b48;margin-bottom:10px;">At a glance</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:26px;">
            <div style="background:#244232;border-radius:14px;padding:20px 22px;color:#f4efe4;">
              <div style="font-family:'Spline Sans Mono',monospace;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.7;">Earnings this week</div>
              <div style="font-size:34px;font-weight:800;line-height:1.05;margin-top:6px;">{{ earnWeekLabel }}</div>
              <div style="font-size:12.5px;opacity:0.7;margin-top:4px;">confirmed + pending</div>
            </div>
            <div style="background:#fffdf6;border:1px solid rgba(36,66,50,0.12);border-radius:14px;padding:20px 22px;">
              <div style="font-family:'Spline Sans Mono',monospace;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#8a9579;">Upcoming sessions</div>
              <div style="font-size:34px;font-weight:800;line-height:1.05;margin-top:6px;color:#244232;">{{ upCount }}</div>
              <sc-if value="{{ hasNextUpcoming }}" hint-placeholder-val="{{ false }}"><div style="font-size:12.5px;color:#56664f;margin-top:4px;">Next: {{ nextUpcomingLabel }}</div></sc-if>
            </div>
            <div style="background:#fff8ec;border:1px solid rgba(202,168,74,0.5);border-radius:14px;padding:20px 22px;">
              <div style="font-family:'Spline Sans Mono',monospace;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#8a6a1f;">Needs your attention</div>
              <div style="font-size:34px;font-weight:800;line-height:1.05;margin-top:6px;color:#8a6a1f;">{{ dashPending }}</div>
              <div style="font-size:12.5px;color:#8a6a1f;margin-top:4px;">pending approvals</div>
            </div>
          </div>

          <!-- EARNINGS -->
          <div style="display:flex;align-items:baseline;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
            <h3 style="font-size:17px;font-weight:800;margin:0;color:#1b2a1f;">Earnings</h3>
            <span style="font-size:12.5px;color:#56664f;">confirmed + pending, by session date</span>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:14px;">
            <div style="background:#fffdf6;border:1px solid rgba(36,66,50,0.12);border-radius:12px;padding:15px 17px;"><div style="font-family:'Spline Sans Mono',monospace;font-size:10.5px;letter-spacing:0.08em;text-transform:uppercase;color:#8a9579;">This week</div><div style="font-size:23px;font-weight:800;color:#244232;margin-top:4px;">{{ earnWeekLabel }}</div></div>
            <div style="background:#fffdf6;border:1px solid rgba(36,66,50,0.12);border-radius:12px;padding:15px 17px;"><div style="font-family:'Spline Sans Mono',monospace;font-size:10.5px;letter-spacing:0.08em;text-transform:uppercase;color:#8a9579;">This month</div><div style="font-size:23px;font-weight:800;color:#244232;margin-top:4px;">{{ earnMonthLabel }}</div></div>
            <div style="background:#fffdf6;border:1px solid rgba(36,66,50,0.12);border-radius:12px;padding:15px 17px;"><div style="font-family:'Spline Sans Mono',monospace;font-size:10.5px;letter-spacing:0.08em;text-transform:uppercase;color:#8a9579;">This year</div><div style="font-size:23px;font-weight:800;color:#244232;margin-top:4px;">{{ earnYearLabel }}</div></div>
            <div style="background:#fffdf6;border:1px solid rgba(36,66,50,0.12);border-radius:12px;padding:15px 17px;"><div style="font-family:'Spline Sans Mono',monospace;font-size:10.5px;letter-spacing:0.08em;text-transform:uppercase;color:#8a9579;">All time</div><div style="font-size:23px;font-weight:800;color:#244232;margin-top:4px;">{{ earnTotalLabel }}</div></div>
          </div>
          <div style="background:#fffdf6;border:1px solid rgba(36,66,50,0.12);border-radius:12px;padding:16px 18px;">
            <div style="font-family:'Spline Sans Mono',monospace;font-size:10.5px;letter-spacing:0.08em;text-transform:uppercase;color:#8a9579;margin-bottom:10px;">Where the money goes</div>
            <div style="display:flex;height:14px;border-radius:999px;overflow:hidden;background:#eef1ea;">
              <div style="width:{{ splitCoachPct }}%;background:#4d7327;"></div><div style="width:{{ splitEquipPct }}%;background:#caa84a;"></div><div style="width:{{ splitRangePct }}%;background:#2f6b73;"></div>
            </div>
            <div style="display:flex;gap:20px;flex-wrap:wrap;margin-top:10px;font-size:12.5px;color:#1b2a1f;">
              <span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:#4d7327;margin-right:6px;"></span>Coach payments <strong>{{ coachTotalLabel }}</strong></span>
              <span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:#caa84a;margin-right:6px;"></span>Equipment <strong>{{ equipTotalLabel }}</strong></span>
              <span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:#2f6b73;margin-right:6px;"></span>Range fee <strong>{{ rangeTotalLabel }}</strong></span>
            </div>
          </div>

          <!-- BOOKING STATUS -->
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin:22px 0;">
            <span style="background:#e6efd6;color:#4d7327;border-radius:999px;padding:7px 15px;font-size:13px;font-weight:700;">✓ {{ dashApproved }} approved</span>
            <span style="background:#fff1cf;color:#8a6a1f;border-radius:999px;padding:7px 15px;font-size:13px;font-weight:700;">⏳ {{ dashPending }} pending</span>
            <span style="background:#f3e2e0;color:#b4512f;border-radius:999px;padding:7px 15px;font-size:13px;font-weight:700;">✕ {{ dashCancelled }} cancelled</span>
            <span style="background:#fffdf6;border:1px solid rgba(36,66,50,0.16);color:#244232;border-radius:999px;padding:7px 15px;font-size:13px;font-weight:700;">👤 {{ coachCount }} coaches</span>
          </div>

          <!-- PER-COACH PAYMENTS + SPLIT EDITOR -->
          <h3 style="font-size:17px;font-weight:800;color:#1b2a1f;margin:28px 0 4px;">Coach payments &amp; split</h3>
          <p style="font-size:13px;color:#56664f;margin:0 0 14px;">Each coach earns a share of every booking they take. Adjust the split per coach — coach % + equipment % + range % should total 100%.</p>
          <div style="display:flex;flex-direction:column;gap:10px;">
            <sc-for list="{{ coachPayRows }}" as="cp" hint-placeholder-count="0">
              <div style="background:#fffdf6;border:1px solid rgba(36,66,50,0.12);border-radius:12px;padding:16px 18px;display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
                <span style="width:42px;height:42px;border-radius:50%;flex:none;background:#244232;color:#f4efe4;display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;">{{ cp.initials }}</span>
                <div style="flex:1;min-width:150px;">
                  <div style="font-size:16px;font-weight:800;color:#1b2a1f;">{{ cp.name }}</div>
                  <div style="font-size:12.5px;color:#8a9579;">{{ cp.role }}</div>
                  <div style="font-size:13px;font-weight:700;color:#4d7327;margin-top:4px;">Earned: {{ cp.pay }}</div>
                </div>
                <div style="display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap;">
                  <label style="font-size:11px;color:#56664f;font-family:'Spline Sans Mono',monospace;">Coach %<br><input type="number" min="0" max="100" value="{{ cp.coachPct }}" onInput="{{ cp.setCoachPct }}" style="width:64px;margin-top:3px;padding:7px 9px;border:1px solid rgba(36,66,50,0.2);border-radius:8px;font-size:14px;"></label>
                  <label style="font-size:11px;color:#56664f;font-family:'Spline Sans Mono',monospace;">Equip %<br><input type="number" min="0" max="100" value="{{ cp.equipPct }}" onInput="{{ cp.setEquipPct }}" style="width:64px;margin-top:3px;padding:7px 9px;border:1px solid rgba(36,66,50,0.2);border-radius:8px;font-size:14px;"></label>
                  <label style="font-size:11px;color:#56664f;font-family:'Spline Sans Mono',monospace;">Range %<br><input type="number" min="0" max="100" value="{{ cp.rangePct }}" onInput="{{ cp.setRangePct }}" style="width:64px;margin-top:3px;padding:7px 9px;border:1px solid rgba(36,66,50,0.2);border-radius:8px;font-size:14px;"></label>
                  <button onClick="{{ cp.saveSplit }}" style="background:#244232;color:#f4efe4;border:none;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;font-size:13px;font-weight:700;padding:9px 16px;border-radius:999px;">Save</button>
                </div>
                <sc-if value="{{ cp.sumBad }}" hint-placeholder-val="{{ false }}"><div style="width:100%;font-size:12px;color:#b4512f;font-family:'Spline Sans Mono',monospace;">⚠ Totals {{ cp.sumLabel }} — should be 100% before saving.</div></sc-if>
              </div>
            </sc-for>
          </div>
          <sc-if value="{{ hasUnassignedPay }}" hint-placeholder-val="{{ false }}"><div style="font-size:12.5px;color:#8a9579;margin-top:10px;">Unassigned-coach share (bookings with no coach yet, at the default split): <strong>{{ coachUnassignedLabel }}</strong></div></sc-if>
```
The `<!-- UPCOMING SCHEDULE -->` block immediately after (the `dashUp*` filter bar + `upcoming` list + pagination) is UNCHANGED.

- [ ] **Step 5: Mirror.** `cp index.html "Pasig Greenpark Archery Camp.dc.html"`; `diff … && echo IDENTICAL`.

- [ ] **Step 6: Verify + cleanup.** Build `_verify_dash2.mjs`: reach the admin Dashboard via the React fiber; patch `nowManila`; stub `allBookings` (varied statuses + dates + coaches → non-zero earnings + several upcoming) and `coachSplits`. Assert:
  - **Hero:** three cards — "Earnings this week" shows `earnWeekLabel`, "Upcoming sessions" shows `upCount` with a "Next:" sub-line when there are upcoming, "Needs your attention" shows `dashPending`.
  - **Earnings:** four cards show `earn*Label`; the split bar's three segments have `width` = `splitCoachPct`/`splitEquipPct`/`splitRangePct` (sum ≈ 100); legend shows the `*TotalLabel`s.
  - **Status chips:** approved/pending/cancelled/coaches counts render.
  - **Coach rows:** each shows an initials avatar + name + "Earned: ₱…"; typing in a split input updates it and clicking **Save** fires `saveCoachSplit` (stub fetch / spy); a non-100% sum shows the ⚠ warning.
  - **Upcoming block** still renders with working filters (`setDashUpRange` etc.) + pagination.
  - **Empty earnings:** with zero earnings, the split bar widths are 0 (no NaN) and "this week" shows ₱0.
  Run `node _verify_dash2.mjs`; expected PASS, 0 real console errors. Confirm mirror IDENTICAL. Then delete scratch:
```bash
rm -f _verify_dash2.mjs _dash2*.png && rm -rf node_modules package.json package-lock.json
git status --short
```

- [ ] **Step 7: Commit.**
```bash
git add index.html "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Dashboard redesign (A): at-a-glance hero + earnings split bar + status chips + coach avatars (split editor + upcoming preserved)"
```

---

## Self-review notes

- **Spec coverage:** at-a-glance hero (Step 4); earnings cards + split bar (Steps 1/3/4); status chips (Step 4); coach rows with avatars KEEPING the split editor (Steps 2/4); upcoming block preserved (Step 4 note). All spec sections map to a step.
- **Reuse not recompute:** only `splitCoachPct`/`splitEquipPct`/`splitRangePct`, `nextUpcomingLabel`/`hasNextUpcoming`, and `cp.initials` are new — everything else reuses existing bindings.
- **Functionality preserved:** the coach split inputs/save/sum-warning markup is carried over verbatim (only an avatar + layout added); the upcoming block is untouched.
- **Edge safety:** `splitPctOf` guards `splitSum === 0`; `nextUp` guards an empty upcoming list (`hasNextUpcoming` gates the sub-line).
- **Ordering:** the `nextUp`/`splitPctOf` builder block must be placed AFTER `upcoming` is defined (Step 1 note).
- **Mirror discipline:** ends with `cp` + `diff … && echo IDENTICAL`; scratch removed in Step 6.
- **No backend/deploy:** frontend-only; merge + push when done.
