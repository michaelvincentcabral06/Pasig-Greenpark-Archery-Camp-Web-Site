# My Bookings Pagination (sub-project D) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Paginate the three customer My Bookings lists (Upcoming, Past, Passes) at 5 per page, reusing the existing admin pagination control.

**Architecture:** One SuperConductor component in `index.html`, mirrored byte-for-byte in `Pasig Greenpark Archery Camp.dc.html`. The fix slices the three already-built render arrays to a 5-item page, exposes the slice under the existing `<sc-for>` binding names, adds per-list pagination bindings (mirroring the admin `plPage` pattern), and inserts the admin prev/next control after each list. Frontend-only.

**Tech Stack:** SuperConductor template + `support.js`; playwright-core + cached Chromium for verification.

## Global Constraints
- **Mirror rule:** every `index.html` edit applied IDENTICALLY to `Pasig Greenpark Archery Camp.dc.html`; byte-identical. Verify: `diff "index.html" "Pasig Greenpark Archery Camp.dc.html"` → `IDENTICAL`. Mirror by editing `index.html` then `cp index.html "Pasig Greenpark Archery Camp.dc.html"`.
- **Page size = 5** for all three lists.
- **Empty-state/count flags use the FULL list, not the paged slice** (`hasAcctPlans` etc.).
- **No backend / pricing / booking-logic changes**; only the three My Bookings lists; admin lists untouched.
- **Reuse the admin control verbatim** (cream buttons `#fffdf6`, green text `#244232`, centered, "Page X of Y").
- **Locate by content, not absolute line numbers.**

## Existing pattern to copy (admin Plans)
- Render slice (~4154): `const PL_PAGE=8; const plPageCount=Math.max(1,Math.ceil(total/PL_PAGE)); const plPage=Math.min(Math.max(0,this.state.plPage||0),plPageCount-1); const allPlans=filtered.slice(plPage*PL_PAGE, plPage*PL_PAGE+PL_PAGE);`
- Bindings (~4847): `plPageLabel:'Page '+(plPage+1)+' of '+plPageCount, plHasPrev:plPage>0, plHasNext:plPage<plPageCount-1, plMultiPage:plPageCount>1, plPrev:()=>this.setState(s=>({plPage:Math.max(0,(s.plPage||0)-1)})), plNext:()=>this.setState(s=>({plPage:(s.plPage||0)+1}))`
- Control markup (~1995): `<sc-if value="{{ plMultiPage }}"><div style="display:flex;align-items:center;justify-content:center;gap:14px;margin-top:18px;"><sc-if value="{{ plHasPrev }}"><button onClick="{{ plPrev }}" style="background:#fffdf6;border:1px solid rgba(36,66,50,0.2);cursor:pointer;font-family:'Hanken Grotesk',sans-serif;font-size:13px;font-weight:700;color:#244232;padding:9px 16px;border-radius:999px;">← Prev</button></sc-if><span style="font-size:13px;color:#56664f;font-family:'Spline Sans Mono',monospace;">{{ plPageLabel }}</span><sc-if value="{{ plHasNext }}"><button onClick="{{ plNext }}" style="…same…">Next →</button></sc-if></div></sc-if>`

---

### Task 1: Paginate the three My Bookings lists

**Files:** `index.html` + mirror.

- [ ] **Step 1: Add page state.** Find the state defaults near `plPage: 0,` / `bkPage: 0,` and add:
```js
    acctUpPage: 0, acctPastPage: 0, acctPassPage: 0,
```

- [ ] **Step 2: Slice the three render arrays.** In `render()`, the full arrays already exist: `acctUpcoming` (mapped upcoming sessions), `acctPast` (mapped past sessions), and `acctPlanRows` (passes). Immediately AFTER all three are built (after the `acctPast` line and after the `acctPlanRows` block — read them to confirm names/order), add:
```js
    const ACCT_PAGE = 5;
    const acctUpAll = acctUpcoming, acctPastAll = acctPast, acctPassAll = acctPlanRows;
    const acctUpPageCount = Math.max(1, Math.ceil(acctUpAll.length / ACCT_PAGE));
    const acctUpPage = Math.min(Math.max(0, this.state.acctUpPage || 0), acctUpPageCount - 1);
    const acctUpPaged = acctUpAll.slice(acctUpPage * ACCT_PAGE, acctUpPage * ACCT_PAGE + ACCT_PAGE);
    const acctPastPageCount = Math.max(1, Math.ceil(acctPastAll.length / ACCT_PAGE));
    const acctPastPage = Math.min(Math.max(0, this.state.acctPastPage || 0), acctPastPageCount - 1);
    const acctPastPaged = acctPastAll.slice(acctPastPage * ACCT_PAGE, acctPastPage * ACCT_PAGE + ACCT_PAGE);
    const acctPassPageCount = Math.max(1, Math.ceil(acctPassAll.length / ACCT_PAGE));
    const acctPassPage = Math.min(Math.max(0, this.state.acctPassPage || 0), acctPassPageCount - 1);
    const acctPassPaged = acctPassAll.slice(acctPassPage * ACCT_PAGE, acctPassPage * ACCT_PAGE + ACCT_PAGE);
```

- [ ] **Step 3: Expose the paged slices + add the pagination bindings.** Find the binding lines that expose `acctUpcoming: acctUpcoming, acctPast: acctPast,` and `acctPlanRows: acctPlanRows, hasAcctPlans: acctPlanRows.length > 0,`. Change the exposed arrays to the PAGED slices, and keep `hasAcctPlans` on the FULL list:
```js
      acctUpcoming: acctUpPaged, acctPast: acctPastPaged,
```
```js
      acctPlanRows: acctPassPaged, hasAcctPlans: acctPassAll.length > 0, planChoices: planChoices,
```
Then add the pagination bindings (place next to the other acct bindings):
```js
      acctUpPageLabel: 'Page ' + (acctUpPage + 1) + ' of ' + acctUpPageCount, acctUpHasPrev: acctUpPage > 0, acctUpHasNext: acctUpPage < acctUpPageCount - 1, acctUpMultiPage: acctUpPageCount > 1,
      acctUpPrev: () => this.setState(s => ({ acctUpPage: Math.max(0, (s.acctUpPage || 0) - 1) })), acctUpNext: () => this.setState(s => ({ acctUpPage: (s.acctUpPage || 0) + 1 })),
      acctPastPageLabel: 'Page ' + (acctPastPage + 1) + ' of ' + acctPastPageCount, acctPastHasPrev: acctPastPage > 0, acctPastHasNext: acctPastPage < acctPastPageCount - 1, acctPastMultiPage: acctPastPageCount > 1,
      acctPastPrev: () => this.setState(s => ({ acctPastPage: Math.max(0, (s.acctPastPage || 0) - 1) })), acctPastNext: () => this.setState(s => ({ acctPastPage: (s.acctPastPage || 0) + 1 })),
      acctPassPageLabel: 'Page ' + (acctPassPage + 1) + ' of ' + acctPassPageCount, acctPassHasPrev: acctPassPage > 0, acctPassHasNext: acctPassPage < acctPassPageCount - 1, acctPassMultiPage: acctPassPageCount > 1,
      acctPassPrev: () => this.setState(s => ({ acctPassPage: Math.max(0, (s.acctPassPage || 0) - 1) })), acctPassNext: () => this.setState(s => ({ acctPassPage: (s.acctPassPage || 0) + 1 })),
```

- [ ] **Step 4: Insert the control after each list's `<sc-for>`.** After the Upcoming `<sc-for list="{{ acctUpcoming }}">…</sc-for>` closes, insert the admin control markup (from "Existing pattern" above) with names `acctUpMultiPage / acctUpHasPrev / acctUpPrev / acctUpPageLabel / acctUpHasNext / acctUpNext`. Repeat after the Past `<sc-for list="{{ acctPast }}">` with `acctPast*` names, and after the Passes `<sc-for list="{{ acctPlanRows }}">` with `acctPass*` names. Place each control inside the same container as its list (so it sits directly under that list).

- [ ] **Step 5: Reset pages on login/logout.** In `accountLogin`'s success `this.setState({ acctEmail: primary, acctEmails: emails })` (or the nearby `acctIn: true` setState), add `acctUpPage: 0, acctPastPage: 0, acctPassPage: 0`. In `accountLogout()`'s `setState`, add the same three resets.

- [ ] **Step 6: Apply identical edits to the mirror** (`cp index.html "Pasig Greenpark Archery Camp.dc.html"`; `diff … && echo IDENTICAL`).

- [ ] **Step 7: Verify with Playwright (stub).** Create `_verify_pg.mjs`:
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
  const E='alice@x.com';
  const mk=(ref,date)=>({name:'Alice A',phone:'0917',email:E,program:'Open Range',date,time:'9:00 AM',party:1,amount:400,coachName:'',ref,eventId:'ev'+ref,concession:null,ts:Date.parse(date+'T01:00:00Z')});
  const up=[],pa=[]; for(let i=1;i<=12;i++){up.push(mk('U'+i,'2026-07-'+String(i).padStart(2,'0')));pa.push(mk('P'+i,'2026-05-'+String(i).padStart(2,'0')));}
  window.fetch=(u,o)=>{const url=String(u);let b={};try{b=JSON.parse((o&&o.body)||'{}');}catch(e){}
    const J=x=>Promise.resolve(new Response(JSON.stringify(x),{status:200}));
    if(url.includes('action=availability'))return Promise.reject(new Error('stub'));
    if(url.includes('action=lookup'))return J({bookings:up.concat(pa),name:'Alice A',emails:[E],primary:E});
    if(url.includes('action=plans'))return J({plans:[]}); return J({});
  };
  // 7 passes in localStorage so the passes list has 2 pages
  const plans=[];for(let i=1;i<=7;i++)plans.push({name:'Day Pass',ts:1000+i,holder:'Alice A',price:'₱600',ref:'PASS'+i,updatedAt:1000+i});
  try{localStorage.setItem('pgac_plans_alice@x.com',JSON.stringify(plans));}catch(e){}
});
await page.goto(`http://localhost:${PORT}/index.html`,{waitUntil:'networkidle'});
let PASS=true;const check=(n,c,x='')=>{console.log((c?'PASS':'FAIL')+' — '+n+(x?'  ['+x+']':''));if(!c)PASS=false;};
await page.getByRole('button',{name:'My Bookings'}).first().click();await page.waitForTimeout(400);
await page.locator('input[type=email]').first().fill('alice@x.com');
await page.getByRole('button',{name:/Find my bookings/}).click();await page.waitForTimeout(800);
const txt=()=>page.evaluate(()=>document.body.innerText);
const count=(re)=>page.evaluate((s)=>{const m=document.body.innerText.match(new RegExp(s,'g'));return m?m.length:0;},re);
check('Upcoming shows a page of 5 (U-refs)', (await count('U\\\\d+'))<=5 && (await count('U\\\\d+'))>0, 'count='+await count('U\\\\d+'));
check('Upcoming control: Page 1 of 3', /Page 1 of 3/.test(await txt()));
// advance upcoming
await page.getByRole('button',{name:/Next →/}).first().click();await page.waitForTimeout(300);
check('Upcoming advanced to Page 2 of 3', /Page 2 of 3/.test(await txt()));
check('Passes paginate (Page 1 of 2 somewhere)', /Page 1 of 2/.test(await txt()));
await page.screenshot({path:'_pg.png',fullPage:true});
console.log(PASS?'\nPAGINATION VERIFY PASS':'\nPAGINATION VERIFY FAIL');if(!PASS)process.exitCode=1;
await browser.close();server.close();
```
Install once: `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright-core --no-save`. Run `node _verify_pg.mjs`. Expected: all PASS. Read `_pg.png` to confirm each list shows ≤5 rows with a "Page X of Y" control beneath it, and the three controls are independent. Confirm mirror IDENTICAL.

- [ ] **Step 8: Commit.**
```bash
git add index.html "Pasig Greenpark Archery Camp.dc.html"
git commit -m "My Bookings: paginate Upcoming/Past/Passes at 5 per page"
```

---

### Task 2: End-to-end check + cleanup

**Files:** `_verify_pg.mjs` (deleted at end).

- [ ] **Step 1: Independence + edge checks.** Extend/confirm with `_verify_pg.mjs`: advancing Upcoming does NOT change the Past or Passes page; Next is hidden on the last page and Prev hidden on the first; a list of ≤5 (e.g. log in with a stub returning 3 upcoming) shows NO control. Capture a screenshot.
- [ ] **Step 2: Mirror parity.** `diff "index.html" "Pasig Greenpark Archery Camp.dc.html" && echo IDENTICAL`.
- [ ] **Step 3: Delete scratch.**
```bash
rm -f _verify_pg.mjs _pg.png
rm -rf node_modules package.json package-lock.json
git status --short
```
- [ ] **Step 4: Commit (if any final tweak).**
```bash
git add index.html "Pasig Greenpark Archery Camp.dc.html"
git commit -m "My Bookings pagination: verified end-to-end"
```

---

## Self-review notes
- **Spec coverage:** state (T1 S1); slicing all three lists (S2); paged exposure + bindings + `hasAcctPlans` on full list (S3); controls after each `<sc-for>` (S4); reset on login/logout + render clamp (S5 + the `Math.min` clamp in S2); 5/page (ACCT_PAGE); mirror (S6); independence/edge/empty-state verified (T2). All covered.
- **`hasAcctPlans` uses `acctPassAll.length`** (full), not the slice — explicit in S3, preventing a false empty-state on page 2.
- **No backend** touched; verification stubs `fetch`.
- **Frequent-commit / TDD note:** SuperConductor markup isn't unit-testable; the test cycle is the Playwright stub, the repo's established method.
