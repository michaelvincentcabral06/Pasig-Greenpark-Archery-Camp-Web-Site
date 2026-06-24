# Reliable Booking Sync + Login (sub-project A) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a customer find all their bookings from any device by **reference OR email**, see which email each booking is under, and **merge multiple emails** into one My Bookings view — all server-resolved.

**Architecture:** Backend is Google Apps Script (`backend/Code.gs`, currently db-v13) — bookings live in a Google Calendar (+ a durable Bookings sheet). We add a server-side **email-group** map (Script Properties `aliases:<email>`), make `lookup_` accept email-or-ref and union across the group, and add an `addEmailAlias` POST. The frontend (one SuperConductor component in `index.html`, mirrored in the `.dc.html`) gets ref-or-email login, a per-booking email label, and an "add another email" form. The new backend is **db-v14**, deployed manually by the user.

**Tech Stack:** Apps Script (ES5-style `.gs`); SuperConductor template + `support.js`; playwright-core + cached Chromium for frontend verification.

## Global Constraints
- **Backend is untestable here.** Apps Script runs only in Google. Backend tasks are gated by **code review** + a **user post-deploy checklist** — not by a runtime test in this environment. Do not claim a backend task "passes tests"; claim it is review-clean and ship the checklist.
- **Backend file sync:** the deployed file is `backend/Code.gs`; keep `backend/Code.LATEST.gs` byte-identical to it, and add a `backend/Code.v14.gs` byte-identical copy (the repo keeps one `Code.vN.gs` per version). All three identical.
- **Frontend mirror rule:** every `index.html` edit is applied IDENTICALLY to `Pasig Greenpark Archery Camp.dc.html` (byte-identical). Verify each task: `diff "index.html" "Pasig Greenpark Archery Camp.dc.html"` → `IDENTICAL`. Mirror by editing `index.html` then `cp index.html "Pasig Greenpark Archery Camp.dc.html"`.
- **Apps Script style:** match the existing `.gs` — `var`, `function`, no arrow functions, no `const`/`let`, trailing-`_` for private helpers.
- **db-v14 response contracts (frontend depends on these EXACT shapes):**
  - `GET ?action=lookup&email=<e>` and `GET ?action=lookup&ref=<r>` → `{ bookings:[ {name,phone,email,program,date,time,party,amount,coachName,ref,eventId,concession,ts} ... ], name:<string>, emails:[<lowercased emails>], primary:<email> }`
  - `POST {action:'addEmailAlias', email, addEmail, ref}` → `{ ok:true, emails:[...] }` or `{ ok:false, reason:<string> }`
  - `GET ?action=version` → includes `"version":"db-v14"` and flags `refLookup:true, emailMerge:true`.
- **Bookings sheet** headers (for ref→email): `['Booked At','Ref','Status','Date','Time','Program','Name','Email','Mobile','Archers','Amount','Coach','Concession','Roster','Event ID']`.
- **Locate by content, not absolute line numbers.**

## Frontend verification harness (shared — build in Task 3, reuse, delete in Task 6)
`_verify_sync.mjs` at repo root (git-ignored). Serves the repo, launches cached Chromium, and **stubs `fetch` to emulate a db-v14 backend** (no real Google calls). The stub's canned data is the contract.

```js
import http from 'http'; import { readFile } from 'fs/promises'; import path from 'path';
import { chromium } from 'playwright-core';
const ROOT = process.cwd();
const EXE = "C:\\Users\\Michael Cabral\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe";
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.ico':'image/x-icon','.json':'application/json' };
const server = http.createServer(async (req,res)=>{ try{ let p=decodeURIComponent(req.url.split('?')[0]); if(p==='/')p='/index.html'; const b=await readFile(path.join(ROOT,p)); res.writeHead(200,{'Content-Type':MIME[path.extname(p).toLowerCase()]||'application/octet-stream'}); res.end(b);}catch(e){res.writeHead(404);res.end('nf');}});
await new Promise(r=>server.listen(0,r)); const PORT=server.address().port;
const browser=await chromium.launch({executablePath:EXE,headless:true});
const ctx=await browser.newContext({viewport:{width:1280,height:1700}}); const page=await ctx.newPage();
page.on('dialog',async d=>{await d.accept();});
// db-v14 stub: ref RJD2 -> alice@x.com; that email has 2 bookings. addEmailAlias ok only if ref matches addEmail.
await page.addInitScript(()=>{
  const A='alice@x.com', B='bob@y.com';
  const bk=(email,ref,date)=>({name:'Alice A',phone:'0917',email,program:'Open Range',date,time:'9:00 AM',party:1,amount:400,coachName:'',ref,eventId:'ev-'+ref,concession:null,ts:Date.parse(date+'T01:00:00Z')});
  const aliceB=[bk(A,'PGA-1','2026-07-01'),bk(A,'PGA-2','2026-07-02')];
  const bobB=[bk(B,'PGA-9','2026-07-09')];
  window.__calls=[];
  window.fetch=(u,o)=>{ const url=String(u); let body={}; try{body=JSON.parse((o&&o.body)||'{}');}catch(e){}
    window.__calls.push(body.action||url);
    const J=(x)=>Promise.resolve(new Response(JSON.stringify(x),{status:200,headers:{'Content-Type':'application/json'}}));
    if(url.includes('action=availability')) return Promise.reject(new Error('stub'));
    if(url.includes('action=lookup')){
      const qs=new URLSearchParams(url.split('?')[1]||''); let email=(qs.get('email')||'').toLowerCase(); const ref=(qs.get('ref')||'').toUpperCase();
      if(!email && ref==='RJD2') email=A;            // ref-only resolves to alice
      if(!email && ref) return J({bookings:[],emails:[],primary:''});
      const grp = (window.__merged&&email===A)?[A,B]:[email];
      const list = grp.flatMap(e=> e===A?aliceB : e===B?bobB : []);
      return J({bookings:list,name:'Alice A',emails:grp,primary:email||A});
    }
    if(url.includes('action=plans')) return J({plans:[]});
    if(body.action==='addEmailAlias'){ if(body.ref==='PGA-9' && (body.addEmail||'').toLowerCase()===B){ window.__merged=true; return J({ok:true,emails:[A,B]}); } return J({ok:false,reason:'ref does not match that email'}); }
    return J({});
  };
});
await page.goto(`http://localhost:${PORT}/index.html`,{waitUntil:'networkidle'});
let PASS=true; const check=(n,c,x='')=>{ console.log((c?'PASS':'FAIL')+' — '+n+(x?'  ['+x+']':'')); if(!c) PASS=false; };
// ... per-task assertions ...
```
Run: `node _verify_sync.mjs`. Install once: `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright-core --no-save`.

---

### Task 1: Backend db-v14 — email-group helpers, ref→email, lookup union, plans union

**Files:** `backend/Code.gs` (then mirrored in Task 2). **No runtime test** — review-gated.

**Interfaces — Produces:** `groupFor_(email)→[emails]`, `mergeEmails_(a,b)→[emails]`, `emailForRef_(ref)→email|''`; `lookup_(email,ref)` returns `{bookings,name,emails,primary}`.

- [ ] **Step 1: Add the helper functions.** Insert near the other db helpers (after `dbRecordBooking_`):
```js
// ---------- EMAIL GROUPS (db-v14) ----------
function aliasKey_(email){ return 'aliases:' + (email || '').trim().toLowerCase(); }
function groupFor_(email){
  email = (email || '').trim().toLowerCase();
  if (!email) return [];
  try { var raw = PropertiesService.getScriptProperties().getProperty(aliasKey_(email));
    if (raw) { var a = JSON.parse(raw); if (a && a.length) return a; } } catch (e) {}
  return [email];
}
function mergeEmails_(a, b){
  a = (a || '').trim().toLowerCase(); b = (b || '').trim().toLowerCase();
  if (!a || !b) return groupFor_(a || b);
  var set = {}, out = [];
  groupFor_(a).concat(groupFor_(b)).forEach(function (e) { e = (e || '').trim().toLowerCase(); if (e && !set[e]) { set[e] = 1; out.push(e); } });
  var props = PropertiesService.getScriptProperties();
  out.forEach(function (m) { props.setProperty(aliasKey_(m), JSON.stringify(out)); });
  return out;
}
function emailForRef_(ref){
  ref = (ref || '').trim().toUpperCase();
  if (!ref) return '';
  try { var sh = dbSheet_('bookings'); var data = sh.getDataRange().getValues(); var h = data[0];
    var refCol = h.indexOf('Ref'), emCol = h.indexOf('Email');
    if (refCol < 0 || emCol < 0) return '';
    for (var r = 1; r < data.length; r++) { if (String(data[r][refCol] || '').trim().toUpperCase() === ref) return String(data[r][emCol] || '').trim().toLowerCase(); }
  } catch (e) {}
  return '';
}
```

- [ ] **Step 2: Rewrite `lookup_` to accept email OR ref and union across the group.** Replace the existing `lookup_` function body with:
```js
function lookup_(email, ref) {
  email = (email || '').trim().toLowerCase();
  ref = (ref || '').trim().toUpperCase();
  if (!email && ref) email = emailForRef_(ref);   // ref-only login
  if (!email) return json_({ bookings: [], name: '', emails: [], primary: '' });
  var group = groupFor_(email);
  var inGroup = {}; group.forEach(function (e) { inGroup[e] = 1; });
  var cal = getCalendar_();
  var from = new Date(); from.setDate(from.getDate() - 120);
  var to = new Date(); to.setDate(to.getDate() + 240);
  var events = cal.getEvents(from, to);
  var out = [], name = '';
  function field(d, key) { var m = new RegExp(key + ':\\s*(.+)', 'i').exec(d); return m ? m[1].trim() : ''; }
  events.forEach(function (ev) {
    var d = ev.getDescription() || '';
    var em = field(d, 'Email').toLowerCase();
    if (!inGroup[em]) return;                       // any email in the group (was: single email)
    if (/\(plan\)\s*$/i.test(field(d, 'Program'))) return;
    var conc = field(d, 'Concession');
    var c = conc ? { pasig: /Pasig/i.test(conc), local: /Greenpark|RHS/i.test(conc), pac: /PAC/i.test(conc) } : null;
    var st = ev.getStartTime();
    var nm = field(d, 'Name'); if (nm) name = nm;
    out.push({ name: nm, phone: field(d, 'Mobile'), email: em, program: field(d, 'Program'),
      date: Utilities.formatDate(st, TIMEZONE, 'yyyy-MM-dd'),
      time: fmtLabel_(parseInt(Utilities.formatDate(st, TIMEZONE, 'H'), 10)),
      party: parseInt(field(d, 'Archers') || '1', 10) || 1,
      amount: parseInt(field(d, 'Amount') || '0', 10) || 0,
      coachName: field(d, 'Coach'), ref: field(d, 'Ref').toUpperCase(),
      eventId: ev.getId(), concession: c, ts: st.getTime(), __remote: true });
  });
  return json_({ bookings: out, name: name, emails: group, primary: email });
}
```
Note: `ref` no longer filters the result list — it only resolves the email. Each booking carries its own `email`.

- [ ] **Step 3: Union passes across the group in the `plans` action.** Find the `plans` action handler (`if (action === 'plans')` near line 573) and its function. Where it gathers `plan:<email>:*` for one email, iterate over `groupFor_(email)` instead and concatenate. Show the implementer the exact existing plans function and have them wrap its per-email scan in `groupFor_(email).forEach(...)`, deduping by `plan id (ts)`.

- [ ] **Step 4: Review-gate (no runtime).** This task ships as part of db-v14 (version bump + routing in Task 2). Do NOT attempt to run Apps Script. In the report, include: the three helper functions, the new `lookup_`, and the plans-union edit, with a note that correctness is verified by review + the Task 6 user checklist.

- [ ] **Step 5: Commit (backend only; Task 2 syncs the mirror files + version).**
```bash
git add backend/Code.gs
git commit -m "db-v14 (wip): email-group helpers, ref->email, lookup+plans union"
```

---

### Task 2: Backend db-v14 — addEmailAlias action, version bump, file sync, deploy checklist

**Files:** `backend/Code.gs`, `backend/Code.LATEST.gs`, `backend/Code.v14.gs` (new), `backend/SETUP.md`. **No runtime test** — review-gated.

**Interfaces — Consumes** Task 1 helpers. **Produces** `addEmailAlias` POST + db-v14 version.

- [ ] **Step 1: Add the `addEmailAlias_` function.** Insert near the other POST handlers:
```js
function addEmailAlias_(body){
  var email = (body.email || '').trim().toLowerCase();
  var addEmail = (body.addEmail || '').trim().toLowerCase();
  var ref = (body.ref || '').trim().toUpperCase();
  if (!email || !addEmail || !ref) return json_({ ok: false, reason: 'missing fields' });
  if (emailForRef_(ref) !== addEmail) return json_({ ok: false, reason: 'ref does not match that email' });
  var emails = mergeEmails_(email, addEmail);
  return json_({ ok: true, emails: emails });
}
```

- [ ] **Step 2: Route it in `doPost`.** Add alongside the other `if (body.action === ...)` lines:
```js
    if (body.action === 'addEmailAlias') return addEmailAlias_(body);
```

- [ ] **Step 3: Bump the version response.** Find the `version` action `json_({ version: 'db-v13', ... })` and change to:
```js
      return json_({ version: 'db-v14', database: true, cancelLog: true, planEmails: true, singleCancelEmail: true, dashboard: true, coachAvail: true, clearHistory: true, approveUpsert: true, bookingsFromCalendar: true, assignCoach: true, activityLog: true, coachCrud: true, clearAll: true, rescheduleEmail: true, coachEmail: true, fullScheduleEmail: true, refLookup: true, emailMerge: true });
```

- [ ] **Step 4: Sync the backend files.** Make `Code.LATEST.gs` and a new `Code.v14.gs` byte-identical to `Code.gs` (Git Bash):
```bash
cp backend/Code.gs backend/Code.LATEST.gs
cp backend/Code.gs backend/Code.v14.gs
diff backend/Code.gs backend/Code.LATEST.gs && diff backend/Code.gs backend/Code.v14.gs && echo SYNCED
```

- [ ] **Step 5: Write the deploy + verify checklist** into `backend/SETUP.md` (append a "## db-v14 deploy & verify" section): paste `Code.gs` into the Apps Script project, Deploy → manage the existing deployment → redeploy the same `/exec`; confirm `…/exec?action=version` shows `db-v14`; then verify `…/exec?action=lookup&ref=PGA-260625-9RJD` returns the booking with its email; log in by that ref in My Bookings; add a second email with one of its refs; confirm both appear on a different device.

- [ ] **Step 6: Commit.**
```bash
git add backend/Code.gs backend/Code.LATEST.gs backend/Code.v14.gs backend/SETUP.md
git commit -m "db-v14: addEmailAlias action, version bump, file sync, deploy checklist"
```

---

### Task 3: Frontend — login by email OR reference, persist the group identity

**Files:** `index.html` + mirror. **Test:** `_verify_sync.mjs`.

**Interfaces — Produces** `acctEmails` state (the group); consumes the db-v14 `lookup` contract.

- [ ] **Step 1: Add `acctEmails` state.** Near `acctEmail: '',` / `acctRef: '',` add `acctEmails: [],`.

- [ ] **Step 2: Rewrite `accountLogin` to accept email OR ref.** Locate `accountLogin()` and replace its validation + fetch so that: (a) if neither a valid email nor a non-empty ref is present → set `acctError` and return; (b) build the lookup URL with whichever is present (`email=` and/or `ref=`); (c) in the `.then(data=>…)` success path, set `acctEmail` to `data.primary || email`, set `acctEmails: data.emails || [data.primary || email]`, persist `localStorage.setItem('pgac_acct_emails', JSON.stringify(data.emails||[]))`, then proceed with the existing merge/finish logic. Exact new validation guard:
```js
    const email = (this.state.acctEmail || '').trim();
    const ref = (this.state.acctRef || '').trim().toUpperCase();
    const hasEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!hasEmail && !ref) { this.setState({ acctError: 'Enter your email or a booking reference.' }); return; }
    this.setState({ acctLoading: true, acctError: '' });
    const ep = this.endpoint();
    const qs = (hasEmail ? ('&email=' + encodeURIComponent(email)) : '') + (ref ? ('&ref=' + encodeURIComponent(ref)) : '');
```
Then the fetch becomes `fetch(ep + '?action=lookup' + qs)`. In the success handler, before `finish(...)`, add:
```js
        const primary = (data && data.primary) || email;
        const emails = (data && data.emails && data.emails.length) ? data.emails : (primary ? [primary] : []);
        try { localStorage.setItem('pgac_acct_emails', JSON.stringify(emails)); } catch (e) {}
        this.setState({ acctEmail: primary, acctEmails: emails });
```
Keep the existing `finish(merged, data.name)` and the "no bookings or plans found" guard. (Reference no longer narrows results — the backend returns the whole group.)

- [ ] **Step 3: Update the login copy + make the ref a real alternative.** In the login form: change the ref label from "Booking reference — optional" to "Booking reference", and add a one-line helper under the heading: "Enter your email **or** a booking reference — either one finds your sessions."

- [ ] **Step 4: Apply identical edits to the mirror** (`cp index.html "Pasig Greenpark Archery Camp.dc.html"`).

- [ ] **Step 5: Verify with the stub.** Build `_verify_sync.mjs` (shared harness) and add:
```js
const go=async(sel)=>{await page.getByRole('button',{name:'My Bookings'}).first().click();await page.waitForTimeout(400);};
// ref-only login
await page.getByRole('button',{name:'My Bookings'}).first().click(); await page.waitForTimeout(400);
await page.locator('input[placeholder^="PGA-"]').fill('RJD2');
await page.getByRole('button',{name:/Find my bookings/}).click(); await page.waitForTimeout(600);
const bodyTxt = await page.evaluate(()=>document.body.innerText);
check('Ref-only login loads the dashboard', /Hi Alice|PGA-1|My Bookings/.test(bodyTxt));
check('Lookup was called with ref', await page.evaluate(()=>window.__calls.some(c=>String(c).includes('lookup'))));
```
Run `node _verify_sync.mjs`. Expected: both PASS. Confirm `diff` mirror IDENTICAL.

- [ ] **Step 6: Commit.**
```bash
git add index.html "Pasig Greenpark Archery Camp.dc.html"
git commit -m "My Bookings: log in by email OR booking reference; persist email group"
```

---

### Task 4: Frontend — show "Booked under: <email>" on each booking

**Files:** `index.html` + mirror. **Test:** `_verify_sync.mjs`.

**Interfaces — Consumes** the per-booking `email` field from lookup.

- [ ] **Step 1: Find the account bookings row builder** (`acctBookings`/the My Bookings session list mapping) and ensure each row exposes `email` (it comes from lookup). Add a binding `underEmail: b.email || ''` and `hasUnderEmail: !!(b.email)`.

- [ ] **Step 2: Render the label.** In the My Bookings session card markup, under the program/party line, add:
```html
<sc-if value="{{ b.hasUnderEmail }}" hint-placeholder-val="{{ false }}"><div style="font-size:12px;color:#8a9579;font-family:'Spline Sans Mono',monospace;margin-top:4px;">Booked under: {{ b.underEmail }}</div></sc-if>
```
Match the surrounding card's existing label styling.

- [ ] **Step 3: Apply identical edits to the mirror.**

- [ ] **Step 4: Verify.** Extend `_verify_sync.mjs` after the ref-login: `check('booking shows its email', /Booked under:\s*alice@x.com/i.test(await page.evaluate(()=>document.body.innerText)))`. Run `node _verify_sync.mjs`; expected PASS + mirror IDENTICAL.

- [ ] **Step 5: Commit.**
```bash
git add index.html "Pasig Greenpark Archery Camp.dc.html"
git commit -m "My Bookings: show the email each booking was made under"
```

---

### Task 5: Frontend — "Add another email" merge UI

**Files:** `index.html` + mirror. **Test:** `_verify_sync.mjs`.

**Interfaces — Consumes** db-v14 `addEmailAlias` contract + Task 3's `acctEmails`.

- [ ] **Step 1: Add state + handlers.** Add state `mergeEmail: '', mergeRef: '', mergeMsg: ''`. Add render bindings: `mergeEmail`/`mergeRef` values, `setMergeEmail`/`setMergeRef` setters (`(e)=>this.setState({mergeEmail:e.target.value, mergeMsg:''})` etc.), `mergeMsg`, and `addEmailAlias: () => this.addAcctEmail()`.

- [ ] **Step 2: Add the `addAcctEmail` method.** Insert near `accountLogin`:
```js
  addAcctEmail() {
    const email = (this.state.acctEmail || '').trim().toLowerCase();
    const addEmail = (this.state.mergeEmail || '').trim().toLowerCase();
    const ref = (this.state.mergeRef || '').trim().toUpperCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addEmail) || !ref) { this.setState({ mergeMsg: 'Enter the other email and one of its booking references.' }); return; }
    const ep = this.endpoint(); if (!ep) { this.setState({ mergeMsg: 'Backend not connected.' }); return; }
    this.setState({ mergeMsg: 'Linking…' });
    fetch(ep, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'addEmailAlias', email: email, addEmail: addEmail, ref: ref }) })
      .then(r => r.json()).then(data => {
        if (!data || !data.ok) { this.setState({ mergeMsg: (data && data.reason) || 'That reference doesn’t match that email.' }); return; }
        try { localStorage.setItem('pgac_acct_emails', JSON.stringify(data.emails || [])); } catch (e) {}
        this.setState({ acctEmails: data.emails || [], mergeEmail: '', mergeRef: '', mergeMsg: 'Merged — showing all your bookings.' });
        this.accountLogin(); // re-run lookup for the group to refresh bookings + passes
      })
      .catch(() => this.setState({ mergeMsg: 'Something went wrong. Please try again.' }));
  }
```

- [ ] **Step 3: Add the merge form markup** in the My Bookings dashboard (near the account header), styled to match the dark account panels:
```html
<div style="background:#1b3325;border:1px solid rgba(244,239,228,0.16);border-radius:12px;padding:16px;margin-bottom:18px;">
  <div style="font-size:13px;font-weight:700;color:#cdd6c5;margin-bottom:8px;">Booked under another email? Add it here</div>
  <div style="display:flex;gap:8px;flex-wrap:wrap;">
    <input value="{{ mergeEmail }}" onInput="{{ setMergeEmail }}" type="email" placeholder="other@email.com" style="flex:1;min-width:160px;background:#244232;border:1px solid rgba(244,239,228,0.18);border-radius:8px;padding:11px 13px;font-family:'Hanken Grotesk',sans-serif;font-size:14px;color:#f4efe4;outline:none;" />
    <input value="{{ mergeRef }}" onInput="{{ setMergeRef }}" placeholder="a ref from it · PGA-…" style="flex:1;min-width:150px;background:#244232;border:1px solid rgba(244,239,228,0.18);border-radius:8px;padding:11px 13px;font-family:'Spline Sans Mono',monospace;font-size:14px;color:#f4efe4;outline:none;" />
    <button onClick="{{ addEmailAlias }}" style="background:#7fb43f;color:#1b2a1f;border:none;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;font-size:14px;font-weight:700;padding:11px 18px;border-radius:999px;">Add</button>
  </div>
  <sc-if value="{{ mergeMsg }}" hint-placeholder-val="{{ false }}"><div style="font-size:12.5px;color:#9aa890;margin-top:8px;">{{ mergeMsg }}</div></sc-if>
</div>
```

- [ ] **Step 4: Apply identical edits to the mirror.**

- [ ] **Step 5: Verify the merge (match + mismatch).** Extend `_verify_sync.mjs` after ref-login: fill merge email `bob@y.com` + ref `PGA-9` → Add → assert bob's booking `PGA-9` now appears and `__merged` true; then a fresh run with ref `WRONG` → assert the error message shows and no merge. Concretely:
```js
await page.locator('input[placeholder="other@email.com"]').fill('bob@y.com');
await page.locator('input[placeholder^="a ref"]').fill('PGA-9');
await page.getByRole('button',{name:'Add',exact:true}).click(); await page.waitForTimeout(700);
check('merge with matching ref pulls in the other email\'s booking', /PGA-9/.test(await page.evaluate(()=>document.body.innerText)));
```
Run `node _verify_sync.mjs`; expected PASS + mirror IDENTICAL.

- [ ] **Step 6: Commit.**
```bash
git add index.html "Pasig Greenpark Archery Camp.dc.html"
git commit -m "My Bookings: add-another-email merge (requires a ref from that email)"
```

---

### Task 6: Frontend end-to-end verification + deploy handoff + cleanup

**Files:** `_verify_sync.mjs` (deleted at end).

- [ ] **Step 1: Full run.** One `node _verify_sync.mjs` run green across: ref-only login, email-only login, per-booking "Booked under:", merge-with-matching-ref pulls in the second email, merge-with-wrong-ref shows the error and does NOT merge. 0 real console errors. Screenshot the merged dashboard.
- [ ] **Step 2: Confirm the backend deploy checklist** exists in `backend/SETUP.md` (Task 2 Step 5) and references the real ref `PGA-260625-9RJD`.
- [ ] **Step 3: Mirror parity.** `diff "index.html" "Pasig Greenpark Archery Camp.dc.html" && echo IDENTICAL`.
- [ ] **Step 4: Delete scratch.**
```bash
rm -f _verify_sync.mjs _sync_*.png
rm -rf node_modules package.json package-lock.json
git status --short
```
- [ ] **Step 5: Commit any final tweak.**
```bash
git add index.html "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Booking sync + login: frontend verified end-to-end (against stubbed db-v14)"
```

---

## Self-review notes
- **Spec coverage:** email-group model + `aliases:` (T1 Step1); ref→email via bookings sheet (T1 Step1); lookup email-or-ref + group union + per-booking email (T1 Step2); plans union (T1 Step3); `addEmailAlias` with ref-ownership (T2); version db-v14 + flags + file sync + deploy checklist (T2); login by email or ref + persist group (T3); show email per booking (T4); merge UI (T5); end-to-end verify + checklist (T6). All covered.
- **Backend is review-gated only** — stated in Global Constraints and each backend task; no false "tests pass" claims. The user's `SETUP.md` checklist is the live verification, using the real `PGA-260625-9RJD`.
- **db-v14 contract** is fixed in Global Constraints; the frontend stub mirrors it exactly, so frontend tasks are fully verifiable without the live backend.
- **Mirror discipline** on every frontend task; backend keeps `Code.gs`/`Code.LATEST.gs`/`Code.v14.gs` identical.
- **No reversible-merge / very-old-ref handling** — intentionally out of scope per the spec.
