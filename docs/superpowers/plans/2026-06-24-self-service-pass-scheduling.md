# Self-service Pass Scheduling (sub-project B) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a customer schedule their own pass sessions from My Bookings — pick a date + an available time, drawing down the pass cap — reusing existing scheduling/availability/email code.

**Architecture:** One SuperConductor component in `index.html`, mirrored in `Pasig Greenpark Archery Camp.dc.html`. The customer pass card (`acctPlanRows`) gains a cap-aware, capacity-aware scheduler that calls a thin new `addAcctPlanSession` (which reuses `addPlanSession` for cap+calendar, then `emailPlanSchedule` for the confirmation). Reuses `loadSlots`/`slots`/`onPickDate`. Frontend-only — backend stays db-v14.

**Tech Stack:** SuperConductor template + `support.js`; playwright-core + cached Chromium for verification.

## Global Constraints
- **Mirror rule:** every `index.html` edit applied IDENTICALLY to `Pasig Greenpark Archery Camp.dc.html`; byte-identical. Verify: `diff "index.html" "Pasig Greenpark Archery Camp.dc.html"` → `IDENTICAL`. Mirror by editing `index.html` then `cp index.html "Pasig Greenpark Archery Camp.dc.html"`.
- **Frontend-only; no backend/pricing change.** Reuse `addPlanSession`, `loadSlots`, `emailPlanSchedule`, `planCapFor`.
- **Add-only:** customers do NOT remove their own pass sessions (the existing customer "Remove" pass button is unchanged).
- **Coach:** customer never picks a coach (pass keeps "to be assigned by our team").
- **Pass email resolution:** `const pEmail = (p.email || this.state.acctEmail || '').trim().toLowerCase();` — used for booking, `mutatePlan`, and the email.
- **Cap enforced in both `addAcctPlanSession` and `addPlanSession`** (double-tap safe).
- **Locate by content, not absolute line numbers.**

---

### Task 1: Self-service scheduler — state, method, handlers, bindings, markup

**Files:** `index.html` + mirror.

- [ ] **Step 1: Add state.** Near the account state defaults (e.g. by `acctBookingOpen: false,`), add:
```js
    acctSchedKey: '', acctSchedMsg: '',
```

- [ ] **Step 2: Add `addAcctPlanSession` + open/close handlers.** Insert as class methods near `addPlanSession`:
```js
  // Customer self-schedules one session onto their pass (reuses addPlanSession for cap +
  // calendar reservation, then emails them a confirmation).
  addAcctPlanSession(email, ts, date, time, cap) {
    if (!date || !time) return;
    const plan = this.findPlan(email, ts);
    const curCount = (plan && plan.sessions) ? plan.sessions.length : 0;
    if (cap != null && curCount >= cap) { this.setState({ acctSchedMsg: 'All sessions on this pass are scheduled.' }); return; }
    this.addPlanSession(email, ts, date, time, cap);                // add + reserve calendar slot + cap + activity log
    this.emailPlanSchedule(email, ts, { mode: 'scheduled', sessions: [{ date: date, time: time }] });
    this.setState({ slotDate: '', slots: [], acctSchedMsg: 'Scheduled — a confirmation is on its way.' });
  }
  openAcctSched(key) { this.setState({ acctSchedKey: key, acctBookingOpen: false, slotDate: '', slots: [], slotTimes: [], acctSchedMsg: '' }); }
  closeAcctSched() { this.setState({ acctSchedKey: '', slotDate: '', slots: [], acctSchedMsg: '' }); }
```

- [ ] **Step 3: Make the two account pickers mutually exclusive.** Find the `addSession` binding/handler (the "+ Book a session" opener, sets `acctBookingOpen: true`). Add `acctSchedKey: ''` to its `setState({...})` so opening the booking form closes any open pass scheduler.

- [ ] **Step 4: Extend the `acctPlanRows` row builder.** Find the `acctPlanRows = (this.state.acctPlans || [])…map(p => {` block. At the top of the map callback add:
```js
      const pEmail = (p.email || this.state.acctEmail || '').trim().toLowerCase();
      const schedKey = pEmail + '|' + p.ts;
```
And add these fields to the returned row object (alongside `schedLabel`/`remove`):
```js
        schedKey: schedKey,
        atCap: cap != null && sess.length >= cap,
        canSchedule: !(cap != null && sess.length >= cap) && String(p.status || '').toLowerCase() !== 'cancelled',
        scheduling: this.state.acctSchedKey === schedKey,
        openSched: () => this.openAcctSched(schedKey),
        capFullLabel: cap != null ? ('All ' + cap + ' session' + (cap === 1 ? '' : 's') + ' scheduled — see you at the range.') : '',
```

- [ ] **Step 5: Add the shared scheduler bindings.** In the render return object (near where `acctPlanRows`/`minDate` are exposed), add — note this computes the open pass once (only one scheduler open at a time):
```js
      acctSchedKey: this.state.acctSchedKey, acctSchedMsg: this.state.acctSchedMsg,
      acctSchedDate: this.state.slotDate || '', acctSchedLoading: !!this.state.slotsLoading,
      closeAcctSched: () => this.closeAcctSched(),
```
And just BEFORE the return object (where other render locals live), compute the open scheduler's times:
```js
    const _schedOpen = this.state.acctSchedKey || '';
    const _schedParts = _schedOpen.split('|');
    const _schedEmail = _schedParts[0] || '';
    const _schedTs = parseInt(_schedParts[1], 10) || 0;
    const _schedPlan = _schedOpen ? this.findPlan(_schedEmail, _schedTs) : null;
    const _schedCap = _schedPlan ? planCapFor(_schedPlan.name) : null;
    const acctSchedTimes = (_schedOpen && this.state.slotDate)
      ? (this.state.slots || []).filter(s => !s.full && (s.left == null || s.left > 0)).map(s => ({
          time: s.time, leftLabel: (s.left != null ? (s.left + ' open') : 'open'),
          add: () => this.addAcctPlanSession(_schedEmail, _schedTs, this.state.slotDate, s.time, _schedCap),
        }))
      : [];
```
Then expose `acctSchedTimes: acctSchedTimes, acctSchedHasTimes: acctSchedTimes.length > 0,` in the return object. (`planCapFor` is defined in render above `acctPlanRows`; make sure these lines are AFTER it.)

- [ ] **Step 6: Add the scheduler markup in the pass card.** Inside the `acctPlanRows` `<sc-for list="{{ acctPlanRows }}" as="pl">`, in the row's action area (where the "Remove"/"Scheduled · contact us to change" controls are), add:
```html
<sc-if value="{{ pl.canSchedule }}" hint-placeholder-val="{{ true }}">
  <sc-if value="{{ pl.scheduling }}" hint-placeholder-val="{{ false }}">
    <div style="margin-top:10px;width:100%;background:#fffdf6;border:1px solid rgba(36,66,50,0.14);border-radius:10px;padding:12px;">
      <div style="font-size:12.5px;font-weight:700;color:#244232;margin-bottom:8px;">Pick a date, then an open time</div>
      <input value="{{ acctSchedDate }}" onInput="{{ onPickDate }}" min="{{ minDate }}" type="date" style="width:100%;box-sizing:border-box;background:#fff;border:1px solid rgba(36,66,50,0.2);border-radius:8px;padding:10px 12px;font-family:'Hanken Grotesk',sans-serif;font-size:14px;color:#1b2a1f;outline:none;" />
      <sc-if value="{{ acctSchedLoading }}" hint-placeholder-val="{{ false }}"><div style="font-size:12.5px;color:#8a9579;margin-top:8px;">Checking availability…</div></sc-if>
      <sc-if value="{{ acctSchedHasTimes }}" hint-placeholder-val="{{ false }}">
        <div style="display:flex;flex-wrap:wrap;gap:7px;margin-top:10px;">
          <sc-for list="{{ acctSchedTimes }}" as="t" hint-placeholder-count="3">
            <button onClick="{{ t.add }}" style="background:#244232;color:#f4efe4;border:none;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;font-size:13px;font-weight:700;padding:8px 13px;border-radius:999px;">{{ t.time }}</button>
          </sc-for>
        </div>
      </sc-if>
      <sc-if value="{{ acctSchedMsg }}" hint-placeholder-val="{{ false }}"><div style="font-size:12.5px;color:#4d7327;margin-top:8px;">{{ acctSchedMsg }}</div></sc-if>
      <button onClick="{{ closeAcctSched }}" style="background:none;border:none;cursor:pointer;color:#56664f;font-family:'Hanken Grotesk',sans-serif;font-size:12.5px;font-weight:700;margin-top:8px;">Done</button>
    </div>
  </sc-if>
  <sc-if value="{{ pl.notScheduling }}" hint-placeholder-val="{{ true }}">
    <button onClick="{{ pl.openSched }}" style="background:#7fb43f;color:#1b2a1f;border:none;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;font-size:13px;font-weight:700;padding:9px 16px;border-radius:999px;">Schedule a session</button>
  </sc-if>
</sc-if>
<sc-if value="{{ pl.atCap }}" hint-placeholder-val="{{ false }}"><span style="font-size:11.5px;color:#8a9579;font-family:'Spline Sans Mono',monospace;">{{ pl.capFullLabel }}</span></sc-if>
```
Add `notScheduling: this.state.acctSchedKey !== schedKey,` to the row builder (Step 4) so the "Schedule a session" button shows only when this pass's scheduler is closed. Keep the existing "Remove"/"Scheduled · contact us to change" controls; this block is additive.

- [ ] **Step 7: Apply identical edits to the mirror** (`cp index.html "Pasig Greenpark Archery Camp.dc.html"`; `diff … && echo IDENTICAL`).

- [ ] **Step 8: Verify with Playwright (stub).** Create `_verify_b.mjs`:
```js
import http from 'http'; import { readFile } from 'fs/promises'; import path from 'path';
import { chromium } from 'playwright-core';
const ROOT=process.cwd();
const EXE="C:\\Users\\Michael Cabral\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe";
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.ico':'image/x-icon','.json':'application/json'};
const server=http.createServer(async(req,res)=>{try{let p=decodeURIComponent(req.url.split('?')[0]);if(p==='/')p='/index.html';const b=await readFile(path.join(ROOT,p));res.writeHead(200,{'Content-Type':MIME[path.extname(p).toLowerCase()]||'application/octet-stream'});res.end(b);}catch(e){res.writeHead(404);res.end('nf');}});
await new Promise(r=>server.listen(0,r));const PORT=server.address().port;
const browser=await chromium.launch({executablePath:EXE,headless:true});
const ctx=await browser.newContext({viewport:{width:1280,height:2200}});const page=await ctx.newPage();
page.on('dialog',async d=>{await d.accept();});
await page.addInitScript(()=>{
  const E='alice@x.com'; window.__f=[];
  window.fetch=(u,o)=>{const url=String(u);let bd={};try{bd=JSON.parse((o&&o.body)||'{}');}catch(e){}window.__f.push(bd.action||(url.includes('availability')?'avail':url.includes('lookup')?'lookup':url.includes('plans')?'plans':''));
    const J=x=>Promise.resolve(new Response(JSON.stringify(x),{status:200}));
    if(url.includes('action=availability')){return J({capacity:6,slots:[{label:'9:00 AM',booked:0,left:6},{label:'10:00 AM',booked:0,left:6},{label:'11:00 AM',booked:0,left:6}]});}
    if(url.includes('action=lookup'))return J({bookings:[],name:'Alice A',emails:[E],primary:E});
    if(url.includes('action=plans'))return J({plans:[]});
    if(bd.action==='book')return J({ok:true,ref:'PGA-X',eventIds:['ev1']});
    return J({ok:true});};
  // seed a 3-session pass (no coach, no sessions yet)
  try{localStorage.setItem('pgac_plans_alice@x.com',JSON.stringify([{name:'Starter Pack',ts:5000,holder:'Alice A',price:'P2,000',ref:'PASS-1',sessions:[],updatedAt:5000}]));}catch(e){}
});
await page.goto(`http://localhost:${PORT}/index.html`,{waitUntil:'networkidle'});
let PASS=true;const check=(n,c,x='')=>{console.log((c?'PASS':'FAIL')+' — '+n+(x?'  ['+x+']':''));if(!c)PASS=false;};
await page.getByRole('button',{name:'My Bookings'}).first().click();await page.waitForTimeout(400);
await page.locator('input[type=email]').first().fill('alice@x.com');
await page.getByRole('button',{name:/Find my bookings/}).click();await page.waitForTimeout(800);
check('Pass shows "0 of 3 scheduled"', /0 of 3 scheduled/.test(await page.evaluate(()=>document.body.innerText)));
await page.getByRole('button',{name:'Schedule a session'}).first().click();await page.waitForTimeout(300);
// the scheduler's date input is the one with min set to today inside the pass card; pick a Wednesday
const dateInput=page.locator('input[type=date]').last();
await dateInput.fill('2026-07-15');await page.waitForTimeout(600);
const timeBtn=page.getByRole('button',{name:/^\d{1,2}:\d{2}\s*(AM|PM)$/}).first();
check('Available times rendered', await timeBtn.count()>0);
await timeBtn.click();await page.waitForTimeout(500);
const f=await page.evaluate(()=>window.__f);
check('book action fired', f.includes('book'), JSON.stringify(f));
check('planScheduleEmail action fired', f.includes('planScheduleEmail'), JSON.stringify(f));
check('counter now "1 of 3 scheduled"', /1 of 3 scheduled/.test(await page.evaluate(()=>document.body.innerText)));
await page.screenshot({path:'_b.png',fullPage:true});
console.log(PASS?'\nSELF-SCHED VERIFY PASS':'\nSELF-SCHED VERIFY FAIL');if(!PASS)process.exitCode=1;
await browser.close();server.close();
```
Install once: `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright-core --no-save`. Run `node _verify_b.mjs`. Expected: all PASS. Read `_b.png` to confirm the pass card shows the scheduler + the scheduled session chip + "1 of 3 scheduled". Confirm mirror IDENTICAL.

- [ ] **Step 9: Commit.**
```bash
git add index.html "Pasig Greenpark Archery Camp.dc.html"
git commit -m "My Bookings: self-service pass scheduling (cap- and capacity-aware)"
```

---

### Task 2: Edge cases + cleanup

**Files:** `_verify_b.mjs` (deleted at end).

- [ ] **Step 1: Cap + mutual-exclusion checks.** Extend `_verify_b.mjs`:
  - Seed a **cap-1** pass (`sessions:[]`, name `'Day Pass'`); schedule one → confirm the scheduler is replaced by "All 1 session scheduled — see you at the range." and a second `book` does not fire.
  - With the pass scheduler open, click the My Bookings "+ Book a session" button → confirm the pass scheduler closes (its date input disappears).
  - Schedule up to the cap on the 3-session pass → "3 of 3 scheduled" + the all-scheduled message, no scheduler.
- [ ] **Step 2: Mirror parity.** `diff "index.html" "Pasig Greenpark Archery Camp.dc.html" && echo IDENTICAL`.
- [ ] **Step 3: Delete scratch.**
```bash
rm -f _verify_b.mjs _b.png
rm -rf node_modules package.json package-lock.json
git status --short
```
- [ ] **Step 4: Commit (if any final tweak).**
```bash
git add index.html "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Self-service pass scheduling: verified end-to-end"
```

---

## Self-review notes
- **Spec coverage:** state (T1 S1); `addAcctPlanSession` cap+add+email (S2); open/close + mutual exclusion (S2,S3); pass-email resolution + row fields (S4); shared scheduler times binding incl. capacity filter (S5); markup with date+times+done+cap-full (S6); mirror (S7); verify book+email+counter+cap (S8, T2). All covered.
- **Reuse:** `addPlanSession` (cap+calendar+log), `loadSlots`/`onPickDate`/`slots` (capacity-aware availability), `emailPlanSchedule` (confirmation), `planCapFor` (cap). No duplication of those.
- **Cap double-guard** in both `addAcctPlanSession` and `addPlanSession`.
- **No backend** touched; verification stubs `fetch` (availability returns slots; `book`/`planScheduleEmail` accepted) — no real reservations/emails.
- **Deploy:** frontend-only; merge → push to GitHub Pages (no db deploy).
