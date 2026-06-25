# Session Edit/Cancel Permissions + Pass-Session Self-Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Customers may edit/cancel/reschedule a session only while it's upcoming on a non-expired pass; used/expired sessions are admin-only. Add per-session Reschedule/Cancel to the pass card.

**Architecture:** All in the single SuperConductor component in `index.html` (mirrored to `Pasig Greenpark Archery Camp.dc.html`). One Manila-correct "used" check + an eligibility rule, enforced in the UI and re-checked in every customer handler. Pass-session cancel reuses the `cancel` action; reschedule reuses the pass slot-picker + the in-place `reschedule` action. No backend change, no deploy.

**Tech Stack:** SuperConductor template (`{{ }}`, `<sc-if>`, `<sc-for>`), plain class-component JS (modern JS OK), Playwright-core for verification with stubbed `fetch`.

## Global Constraints

- **Mirror rule:** every `index.html` edit applied identically to `Pasig Greenpark Archery Camp.dc.html`; end with `diff index.html "Pasig Greenpark Archery Camp.dc.html" && echo IDENTICAL`.
- **No backend change, no deploy** — reuses the existing `cancel` + `reschedule` POST actions (already live).
- **Admin is never restricted** — only the customer-facing handlers carry the eligibility guard; admin `cancelBooking('admin')` / `removePlanSession` / admin reschedule stay open.
- **Reschedule moves, never duplicates** — use the in-place `reschedule` action and update only the one `sessions[idx]`.
- **`isSessionUsed` is the single source of truth** for "past" (Manila time, handles past dates AND past-times-today); `sessionIsPast` (render-local) is aligned to it.
- **Verification:** Playwright-core with stubbed `fetch`; chromium at `C:\Users\Michael Cabral\AppData\Local\ms-playwright\chromium-1228\chrome-win64\chrome.exe`; install if missing: `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright-core --no-save`. Scratch harness `_verify_perm.mjs` (deleted in the final task). 0 real console errors.

---

### Task 1: Eligibility helpers + standalone handler guards

**Files:**
- Modify: `index.html` — add `isSessionUsed`/`sessionEditableByCustomer` methods (near `isPastSlot` ~3009); align the render-local `sessionIsPast` (~4537); guard `cancelAcctBooking` (~3613), `startEdit` (~3644), `saveEdit` (~3661)
- Mirror: `Pasig Greenpark Archery Camp.dc.html`
- Test: `_verify_perm.mjs`

**Interfaces:**
- Produces: `isSessionUsed(dateStr, timeLabel)→bool`, `sessionEditableByCustomer(dateStr, timeLabel, plan)→bool`. Task 2 consumes both.

- [ ] **Step 1: Add the two helper methods.** Near `isPastSlot` (~index.html:3014, right after it):
```js
  isSessionUsed(dateStr, timeLabel) {
    if (!dateStr) return false;
    const now = this.nowManila();
    if (dateStr < now.date) return true;
    if (dateStr > now.date) return false;
    const h = this.slotHour24(timeLabel);
    return (h != null) ? (h * 60 <= now.hour * 60 + now.minute) : false;
  }
  sessionEditableByCustomer(dateStr, timeLabel, plan) {
    if (this.isSessionUsed(dateStr, timeLabel)) return false;
    if (plan && this.isPlanExpired(plan)) return false;
    return true;
  }
```

- [ ] **Step 2: Align the render-local `sessionIsPast`.** Replace the `const sessionIsPast = (b) => { ... };` block (~index.html:4537-4542) with a delegate so Upcoming/Past uses the Manila-correct check:
```js
    const sessionIsPast = (b) => this.isSessionUsed(b.date, b.time);
```
(Removes the device-time `acctNowMin` discrepancy. Leave the `acctNow`/`acctNowMin` locals if other code uses them — grep first; if `sessionIsPast` was their only consumer, remove them too.)

- [ ] **Step 3: Guard the three standalone handlers.** At the TOP of each (after the opening brace, before any work):
  - `cancelAcctBooking(entry)` (~3613), `startEdit(entry)` (~3644), and `saveEdit(entry)` (~3661):
```js
    if (!this.sessionEditableByCustomer(entry.date, entry.time, null)) {
      if (typeof alert !== 'undefined') alert('This session has already taken place — please contact us to change it.');
      return;
    }
```
  (In `saveEdit`, place it first so a session that lapsed while the edit panel was open is refused.)

- [ ] **Step 4: Mirror.** `cp index.html "Pasig Greenpark Archery Camp.dc.html"`; `diff … && echo IDENTICAL`.

- [ ] **Step 5: Verify.** Create `_verify_perm.mjs`: reach the instance via the React fiber, patch `nowManila` to a fixed Manila time (so "today" is deterministic). Assert:
  - `isSessionUsed('<yesterday>', '9:00 AM')` === true; `isSessionUsed('<tomorrow>', '9:00 AM')` === false; same-day before/after the patched clock → false/true.
  - `sessionEditableByCustomer('<future>', '9:00 AM', null)` === true; `sessionEditableByCustomer('<past>', '9:00 AM', null)` === false; `sessionEditableByCustomer('<future>', '9:00 AM', { expiry:'2000-01-01' })` === false (expired pass).
  - Standalone guard: stub `fetch`; call `cancelAcctBooking({ date:'<past>', time:'9:00 AM', ts:1 })` → NO `cancel` POST fires (guard alert); call with a future date → it proceeds (cancel POST fires).
  Run `node _verify_perm.mjs`; expected PASS, 0 real console errors. Confirm mirror IDENTICAL.

- [ ] **Step 6: Commit.**
```bash
git add index.html "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Session perms T1: Manila-correct isSessionUsed + sessionEditableByCustomer; guard standalone cancel/edit handlers"
```

---

### Task 2: Pass-session self-service (Reschedule + Cancel) + cleanup

**Files:**
- Modify: `index.html` — initial state (`acctReschedIdx`, ~2535); the `acctPlanRows` `sess` mapping (~4601); new methods `cancelAcctPlanSession`, `startPassSessionReschedule`, `confirmPassSlot`; `closeAcctSched` (~3934); the slot-tap `add` handler (~4984); the pass-card session-chip markup (~1680-1690)
- Mirror: `Pasig Greenpark Archery Camp.dc.html`
- Test: `_verify_perm.mjs`

**Interfaces:**
- Consumes: `sessionEditableByCustomer`, `isSessionUsed`, `isPlanExpired` (Task 1); `findPlan`, `mutatePlan`, `ensurePlanRef`, `openAcctSched`, `addAcctPlanSession`, `prettyDateStr`, `endpoint` (existing).
- Produces: each `acctPlanRows` session gains `canChange`/`locked`/`lockLabel`/`reschedule`/`cancel`; `confirmPassSlot` replaces the slot-tap add.

- [ ] **Step 1: Add `acctReschedIdx` state.** In the initial state (near `acctUpPage: 0, acctPastPage: 0, acctPassPage: 0,` ~2535):
```js
    acctReschedIdx: null,
```

- [ ] **Step 2: Enrich the `acctPlanRows` session mapping.** Replace the `const sess = (p.sessions || []).map(s => { ... });` block (~index.html:4601-4605) with an index-aware version that adds the per-session fields:
```js
      const sess = (p.sessions || []).map((s, i) => {
        let lbl = s.date; try { lbl = new Date(s.date + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' }); } catch (e) {}
        const editable = this.sessionEditableByCustomer(s.date, s.time, p);
        return {
          label: lbl + ' · ' + s.time, onCalendar: !!s.eventId,
          canChange: editable, locked: !editable,
          lockLabel: this.isSessionUsed(s.date, s.time) ? 'Used' : 'Pass expired',
          reschedule: () => this.startPassSessionReschedule(p.email, p.ts, i),
          cancel: () => this.cancelAcctPlanSession(p.email, p.ts, i),
        };
      });
```
(`p.email` is present on each plan row; for the customer view it equals the account email.)

- [ ] **Step 3: Add `cancelAcctPlanSession`.** Near `removePlanSession` (~index.html:3981):
```js
  cancelAcctPlanSession(email, ts, idx) {
    const plan = this.findPlan(email, ts);
    const s = (plan && plan.sessions) ? plan.sessions[idx] : null;
    if (!s) return;
    if (!this.sessionEditableByCustomer(s.date, s.time, plan)) { if (typeof alert !== 'undefined') alert('This session can no longer be changed online — please contact us.'); return; }
    if (typeof confirm !== 'undefined' && !confirm('Cancel this session? It frees the slot and returns the session to your pass.')) return;
    this.mutatePlan(email, ts, p => ({ ...p, sessions: (p.sessions || []).filter((_, i) => i !== idx) }));
    const ep = this.endpoint();
    if (ep && s.eventId) {
      fetch(ep, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'cancel', eventId: s.eventId, ref: s.ref || '', date: s.date, time: s.time, email: email, notify: true, by: 'customer' }) }).catch(() => {});
    }
    const planRef = this.ensurePlanRef(email, ts);
    this.logAction(planRef, 'Session removed', s.date + ' · ' + s.time + ' · ' + ((plan && plan.holder) || ''), (plan && plan.holder) || email, email, 'client');
  }
```

- [ ] **Step 4: Add `startPassSessionReschedule` + `confirmPassSlot`.** Near `cancelAcctPlanSession`:
```js
  startPassSessionReschedule(email, ts, idx) {
    const plan = this.findPlan(email, ts);
    const s = (plan && plan.sessions) ? plan.sessions[idx] : null;
    if (!s) return;
    if (!this.sessionEditableByCustomer(s.date, s.time, plan)) { if (typeof alert !== 'undefined') alert('This session can no longer be changed online — please contact us.'); return; }
    this.setState({ acctReschedIdx: idx });
    this.openAcctSched(email + '|' + ts);
  }
  confirmPassSlot(email, ts, date, time, cap) {
    const idx = this.state.acctReschedIdx;
    if (idx == null) { this.addAcctPlanSession(email, ts, date, time, cap); return; }   // normal add
    const plan = this.findPlan(email, ts);
    const s = (plan && plan.sessions) ? plan.sessions[idx] : null;
    if (!s) { this.setState({ acctReschedIdx: null }); this.addAcctPlanSession(email, ts, date, time, cap); return; }
    if (!this.sessionEditableByCustomer(s.date, s.time, plan)) { this.setState({ acctReschedIdx: null, acctSchedMsg: 'That session can no longer be changed.' }); return; }
    const ep = this.endpoint();
    if (ep && s.eventId) {
      fetch(ep, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'reschedule', eventId: s.eventId, ref: s.ref || '', date: s.date, time: s.time, newDate: date, newTime: time, name: (plan.holder || ''), email: email }) })
        .then(r => r.json()).then(res => {
          const newEid = (res && res.ok && res.eventId) ? res.eventId : s.eventId;
          this.mutatePlan(email, ts, p => ({ ...p, sessions: (p.sessions || []).map((x, i) => i === idx ? { ...x, date: date, time: time, eventId: newEid } : x).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)) }));
          const planRef = this.ensurePlanRef(email, ts);
          this.logAction(planRef, 'Rescheduled', this.prettyDateStr(s.date) + ' ' + s.time + ' → ' + this.prettyDateStr(date) + ' ' + time + ' · ' + ((plan.holder) || ''), (plan.holder) || email, email, 'client');
        }).catch(() => {});
    } else {
      this.mutatePlan(email, ts, p => ({ ...p, sessions: (p.sessions || []).map((x, i) => i === idx ? { ...x, date: date, time: time } : x) }));
    }
    this.setState({ acctReschedIdx: null, slotDate: '', slots: [], acctSchedKey: '', acctSchedMsg: 'Rescheduled — see you then.' });
  }
```

- [ ] **Step 5: Clear reschedule mode on close.** Update `closeAcctSched` (~index.html:3934) to also clear `acctReschedIdx`:
```js
  closeAcctSched() { this.setState({ acctSchedKey: '', slotDate: '', slots: [], acctSchedMsg: '', acctReschedIdx: null }); }
```

- [ ] **Step 6: Route the slot-tap through `confirmPassSlot`.** In the `acctSchedTimes` builder (~index.html:4984), change the `add` callback:
```js
          add: () => this.confirmPassSlot(_schedEmail, _schedTs, this.state.slotDate, s.time, _schedCap),
```

- [ ] **Step 7: Update the pass-card session markup.** Replace the session-chip block (~index.html:1680-1686) with per-session rows carrying actions/lock, and REMOVE the now-redundant global note at ~1690 (`Scheduled · contact us to change`):
```html
                  <div style="display:flex;flex-direction:column;gap:6px;padding-left:25px;margin-top:3px;">
                    <sc-for list="{{ pl.sessions }}" as="ps" hint-placeholder-count="0">
                      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                        <span style="display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:#244232;background:#fffdf6;border:1px solid rgba(36,66,50,0.14);border-radius:999px;padding:4px 11px;"><sc-if value="{{ ps.onCalendar }}" hint-placeholder-val="{{ false }}"><span style="width:6px;height:6px;border-radius:50%;background:#7fb43f;"></span></sc-if>{{ ps.label }}</span>
                        <sc-if value="{{ ps.canChange }}" hint-placeholder-val="{{ false }}">
                          <button onClick="{{ ps.reschedule }}" style="background:#e6efd6;border:none;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;font-size:11.5px;font-weight:700;color:#4d7327;padding:5px 11px;border-radius:999px;">Reschedule</button>
                          <button onClick="{{ ps.cancel }}" style="background:none;border:1px solid rgba(180,81,47,0.35);cursor:pointer;font-family:'Hanken Grotesk',sans-serif;font-size:11.5px;font-weight:700;color:#b4512f;padding:4px 10px;border-radius:999px;">Cancel</button>
                        </sc-if>
                        <sc-if value="{{ ps.locked }}" hint-placeholder-val="{{ false }}"><span style="font-size:11px;color:#8a9579;font-family:'Spline Sans Mono',monospace;">{{ ps.lockLabel }} · contact us to change</span></sc-if>
                      </div>
                    </sc-for>
                  </div>
```
Delete the line `<sc-if value="{{ pl.hasSessions }}" ...>Scheduled · contact us to change</sc-if>` (~1690). Keep the `pl.canRemove` Remove button (~1689) and the `pl.canSchedule` block (~1691) unchanged.

- [ ] **Step 8: Mirror.** `cp` + `diff … && echo IDENTICAL`.

- [ ] **Step 9: Verify + cleanup.** Extend `_verify_perm.mjs`; patch `nowManila` for a fixed clock; reach the account view with a seeded pass (`apply... acctPlans`/the account state prior harnesses used) and stub `fetch`:
  - **Upcoming pass session:** seed a non-expired pass with a FUTURE session → the chip shows Reschedule + Cancel. Click Cancel → confirm → a `cancel` POST with `by:'customer'` fires, the session leaves `plan.sessions`, the pass "N of M" count drops. Click Reschedule → the pass scheduler opens with `acctReschedIdx` set → pick a new slot → a `reschedule` POST fires (NOT `cancel`+`book`), `sessions[idx]` updates to the new date/time, and the pass still has exactly that one session (no duplicate).
  - **Used pass session:** seed a pass with a PAST session → the chip is locked ("Used · contact us to change"), no buttons; force-calling `cancelAcctPlanSession(email, ts, idx)` on it → refused (no POST).
  - **Expired pass:** seed an expired pass → its session chips locked ("Pass expired · contact us"); customer cancel/reschedule refused.
  - **Admin not restricted:** `removePlanSession(email, ts, idx)` on a used session still removes it (no guard).
  - Keep Task 1 assertions green. Run `node _verify_perm.mjs`; expected ALL PASS, 0 real console errors. Mirror IDENTICAL. Then delete scratch:
```bash
rm -f _verify_perm.mjs _perm*.png && rm -rf node_modules package.json package-lock.json
git status --short
```

- [ ] **Step 10: Commit.**
```bash
git add index.html "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Session perms T2: pass-card per-session Reschedule/Cancel (upcoming only) + used/expired lock; admin unrestricted"
```

---

## Self-review notes

- **Spec coverage:** Manila-correct used-check + eligibility rule (T1); standalone handler guards (T1); pass-session cancel + reschedule + locked UI + the rule re-checked in every handler (T2); admin paths untouched (both tasks). All spec sections map to a step.
- **Reschedule moves, not duplicates:** `confirmPassSlot` uses the `reschedule` action + updates only `sessions[idx]`; the picker's `max` (existing `acctSchedMax`) keeps it within validity.
- **Type/name consistency:** `isSessionUsed`/`sessionEditableByCustomer` defined in T1, consumed in T2; `acctReschedIdx` written in T2 Step 1/4/5 and read in `confirmPassSlot`; session row fields `canChange`/`locked`/`lockLabel`/`reschedule`/`cancel` produced in T2 Step 2 and consumed in the T2 Step 7 markup.
- **Mirror discipline:** each task ends with `cp` + `diff … && echo IDENTICAL`; scratch removed in T2 Step 9.
- **No backend/deploy:** frontend-only; merge + push when done.
