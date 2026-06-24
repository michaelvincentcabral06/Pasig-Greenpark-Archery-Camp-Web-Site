# Dynamic Pricing & Programs (sub-project C) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the content model server-backed (db-v15) and add program-rate + capacity editing to the admin Pricing tab, so price/package changes reach every customer and device.

**Architecture:** Backend Google Apps Script (`backend/Code.gs`, db-v14 → db-v15) gains content get/set stored in Script Properties. The frontend (one SuperConductor component in `index.html`, mirrored in the `.dc.html`) moves rates/capacity into the existing content model, reads them in `rateFor`/`capacity`, loads content from the backend on mount, pushes edits on save, and adds rate/capacity fields to the Pricing tab.

**Tech Stack:** Apps Script (ES5 `.gs`); SuperConductor + `support.js`; playwright-core + cached Chromium for the frontend.

## Global Constraints
- **Backend is untestable here** (Apps Script runs only in Google). Backend tasks are **review-gated** + a user deploy checklist — no runtime "tests pass" claim.
- **Backend file sync:** `backend/Code.gs`, `backend/Code.LATEST.gs`, and a new `backend/Code.v15.gs` byte-identical.
- **Frontend mirror rule:** `index.html` ≡ `Pasig Greenpark Archery Camp.dc.html` (byte-identical). Mirror by editing `index.html` then `cp index.html "Pasig Greenpark Archery Camp.dc.html"`; verify `diff … && echo IDENTICAL`.
- **Apps Script style:** ES5 (`var`/`function`, no arrow/`const`/`let`), trailing-underscore privates.
- **Defaults fallback:** Open Range 400, session 600, Private 1200, capacity 6 — `rateFor`/`capacity` must never yield 0/NaN when content is missing/empty.
- **db-v15 contracts:** `GET ?action=content` → `{ content: {…} }`; `POST {action:'setContent', content:{…}}` → `{ ok:true }`; `?action=version` includes `"version":"db-v15"` + `contentStore:true`.
- **Stored content keys:** `packages`, `schedule`, `scheduleNote`, `funShoot`, `rates:{openRange,session,private}`, `capacity`.
- **Locate by content, not absolute line numbers.**

---

### Task 1: Backend db-v15 — content storage, routes, version, file sync, checklist

**Files:** `backend/Code.gs`, `backend/Code.LATEST.gs`, `backend/Code.v15.gs` (new), `backend/SETUP.md`. **No runtime test** — review-gated.

- [ ] **Step 1: Add the content helpers.** Insert near other Script-Properties helpers:
```js
function getContent_() {
  var raw = PropertiesService.getScriptProperties().getProperty('CONTENT');
  var c = {}; if (raw) { try { c = JSON.parse(raw); } catch (e) { c = {}; } }
  return json_({ content: c });
}
function setContent_(body) {
  var c = body.content || {};
  PropertiesService.getScriptProperties().setProperty('CONTENT', JSON.stringify(c));
  return json_({ ok: true });
}
```

- [ ] **Step 2: Route them.** In `doGet`, alongside the other `if (action === ...)`:
```js
    if (action === 'content') return getContent_();
```
In `doPost`, alongside the other `if (body.action === ...)`:
```js
    if (body.action === 'setContent') return setContent_(body);
```

- [ ] **Step 3: Bump the version.** Change the `version` response from `db-v14` to `db-v15` and append `, contentStore: true` to the flags object (keep all existing flags including `refLookup`/`emailMerge`).

- [ ] **Step 4: Sync the backend files** (Git Bash):
```bash
cp backend/Code.gs backend/Code.LATEST.gs
cp backend/Code.gs backend/Code.v15.gs
diff backend/Code.gs backend/Code.LATEST.gs && diff backend/Code.gs backend/Code.v15.gs && echo SYNCED
```

- [ ] **Step 5: Deploy checklist.** Append a "## db-v15 deploy & verify" section to `backend/SETUP.md`: paste `Code.gs` into Apps Script → Deploy → manage the existing deployment → New version → Deploy (same `/exec`); confirm `…/exec?action=version` shows `db-v15` with `contentStore:true`; edit a price in the admin Pricing tab; confirm `…/exec?action=content` returns it; open the public site on another device and confirm the new price shows.

- [ ] **Step 6: Commit.**
```bash
git add backend/Code.gs backend/Code.LATEST.gs backend/Code.v15.gs backend/SETUP.md
git commit -m "db-v15: content store (getContent/setContent), version bump, file sync, checklist"
```

---

### Task 2: Frontend — content-backed rates/capacity, server load+save, Pricing-tab fields

**Files:** `index.html` + mirror.

- [ ] **Step 1: Content model gains rates + capacity.** In `mergedContent(defaults)` (search `mergedContent`), add to the returned object:
```js
      rates: c.rates || defaults.rates,
      capacity: c.capacity != null ? c.capacity : defaults.capacity,
```
And in the `const cm = this.mergedContent({ packages: …, funShoot: '₱10' });` call (search `mergedContent({`), add to the defaults: `rates: { openRange: 400, session: 600, private: 1200 }, capacity: 6,`.

- [ ] **Step 2: `cfgRates` helper + content-aware `rateFor`/`capacity`.** Add a method and rewrite the two readers (search `rateFor(program)` and `capacity()`):
```js
  cfgRates() {
    var c = (this.state.content && this.state.content.rates) || {};
    return {
      openRange: Number(c.openRange) || Number(this.props.openRangeRate) || 400,
      session: Number(c.session) || Number(this.props.sessionRate) || 600,
      priv: Number(c.priv != null ? c.priv : c.private) || Number(this.props.privateRate) || 1200,
    };
  }
```
Rewrite `rateFor`:
```js
  rateFor(program) {
    var r = this.cfgRates();
    if (/Open Range/i.test(program || '')) return r.openRange;
    return /Private/i.test(program || '') ? r.priv : r.session;
  }
```
Rewrite `capacity`:
```js
  capacity() { var c = this.state.content; return (c && c.capacity != null ? Number(c.capacity) : (Number(this.props.capacityPerHour) || 6)) || 6; }
```

- [ ] **Step 3: Load content from the backend on mount.** Add a method and call it from `componentDidMount` (after the existing localStorage `setState`):
```js
  loadContentRemote() {
    var ep = this.endpoint(); if (!ep) return;
    fetch(ep + '?action=content').then(function (r) { return r.json(); }).then(function (res) {
      if (res && res.content && Object.keys(res.content).length) {
        try { localStorage.setItem('pgac_content', JSON.stringify(res.content)); } catch (e) {}
        this.setState({ content: res.content });
      }
    }.bind(this)).catch(function () {});
  }
```
In `componentDidMount`, add `this.loadContentRemote();` right after `this.loadCoaches();`.

- [ ] **Step 4: Save propagates to the backend.** In `persistContent(content)` (search `persistContent`), after the existing `localStorage.setItem` + `this.setState({ content })`, add:
```js
    var ep = this.endpoint();
    if (ep) { try { fetch(ep, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'setContent', content: content }) }).catch(function () {}); } catch (e) {} }
```

- [ ] **Step 5: Pricing-tab rate + capacity fields — bindings.** Near the existing pricing bindings (search `setFunShoot:` / `updatePackage`), add:
```js
      rateOpenEdit: String((cm.rates && cm.rates.openRange) != null ? cm.rates.openRange : 400),
      rateSessionEdit: String((cm.rates && cm.rates.session) != null ? cm.rates.session : 600),
      ratePrivateEdit: String((cm.rates && cm.rates.private) != null ? cm.rates.private : 1200),
      capacityEdit: String(cm.capacity != null ? cm.capacity : 6),
      setRateOpen: (e) => saveCM({ rates: { ...(cm.rates || {}), openRange: Number(e.target.value) || 0 } }),
      setRateSession: (e) => saveCM({ rates: { ...(cm.rates || {}), session: Number(e.target.value) || 0 } }),
      setRatePrivate: (e) => saveCM({ rates: { ...(cm.rates || {}), private: Number(e.target.value) || 0 } }),
      setCapacity: (e) => saveCM({ capacity: Number(e.target.value) || 6 }),
```

- [ ] **Step 6: Pricing-tab rate + capacity fields — markup.** In the `tabPricing` section (search `tabPricing`), add a "Booking rates" group (match the existing pricing-field styling, e.g. the fun-shoot input):
```html
<div style="margin-top:22px;">
  <div style="font-size:13px;font-weight:700;color:#1b2a1f;margin-bottom:10px;">Booking rates (per session)</div>
  <div style="display:flex;flex-wrap:wrap;gap:14px;">
    <label style="font-size:12.5px;font-weight:600;color:#56664f;">Open Range ₱<input value="{{ rateOpenEdit }}" onInput="{{ setRateOpen }}" type="number" min="0" style="display:block;margin-top:4px;width:120px;background:#f4efe4;border:1px solid rgba(36,66,50,0.16);border-radius:8px;padding:10px 12px;font-family:'Hanken Grotesk',sans-serif;font-size:15px;font-weight:700;color:#1b2a1f;outline:none;" /></label>
    <label style="font-size:12.5px;font-weight:600;color:#56664f;">Session ₱<input value="{{ rateSessionEdit }}" onInput="{{ setRateSession }}" type="number" min="0" style="display:block;margin-top:4px;width:120px;background:#f4efe4;border:1px solid rgba(36,66,50,0.16);border-radius:8px;padding:10px 12px;font-family:'Hanken Grotesk',sans-serif;font-size:15px;font-weight:700;color:#1b2a1f;outline:none;" /></label>
    <label style="font-size:12.5px;font-weight:600;color:#56664f;">Private ₱<input value="{{ ratePrivateEdit }}" onInput="{{ setRatePrivate }}" type="number" min="0" style="display:block;margin-top:4px;width:120px;background:#f4efe4;border:1px solid rgba(36,66,50,0.16);border-radius:8px;padding:10px 12px;font-family:'Hanken Grotesk',sans-serif;font-size:15px;font-weight:700;color:#1b2a1f;outline:none;" /></label>
    <label style="font-size:12.5px;font-weight:600;color:#56664f;">Capacity / hour<input value="{{ capacityEdit }}" onInput="{{ setCapacity }}" type="number" min="1" max="20" style="display:block;margin-top:4px;width:120px;background:#f4efe4;border:1px solid rgba(36,66,50,0.16);border-radius:8px;padding:10px 12px;font-family:'Hanken Grotesk',sans-serif;font-size:15px;font-weight:700;color:#1b2a1f;outline:none;" /></label>
  </div>
</div>
```

- [ ] **Step 7: Apply identical edits to the mirror** (`cp …`; `diff … && echo IDENTICAL`).

- [ ] **Step 8: Verify with Playwright (stubbed db-v15).** Create `_verify_c.mjs`:
```js
import http from 'http'; import { readFile } from 'fs/promises'; import path from 'path';
import { chromium } from 'playwright-core';
const ROOT=process.cwd();
const EXE="C:\\Users\\Michael Cabral\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe";
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.ico':'image/x-icon','.json':'application/json'};
const server=http.createServer(async(req,res)=>{try{let p=decodeURIComponent(req.url.split('?')[0]);if(p==='/')p='/index.html';const b=await readFile(path.join(ROOT,p));res.writeHead(200,{'Content-Type':MIME[path.extname(p).toLowerCase()]||'application/octet-stream'});res.end(b);}catch(e){res.writeHead(404);res.end('nf');}});
await new Promise(r=>server.listen(0,r));const PORT=server.address().port;
const browser=await chromium.launch({executablePath:EXE,headless:true});
const ctx=await browser.newContext({viewport:{width:1280,height:1700}});const page=await ctx.newPage();
page.on('dialog',async d=>{await d.accept();});
await page.addInitScript(()=>{ window.__f=[];
  window.fetch=(u,o)=>{const url=String(u);let bd={};try{bd=JSON.parse((o&&o.body)||'{}');}catch(e){}window.__f.push(bd.action||(url.includes('content')?'getcontent':url.includes('availability')?'avail':''));
    const J=x=>Promise.resolve(new Response(JSON.stringify(x),{status:200}));
    if(url.includes('action=content'))return J({content:{rates:{openRange:555,session:600,private:1200},capacity:4}});
    if(url.includes('action=availability'))return Promise.reject(new Error('s'));
    return J({ok:true});};
});
await page.goto(`http://localhost:${PORT}/index.html`,{waitUntil:'networkidle'});
await page.waitForTimeout(800); // allow loadContentRemote to land
let PASS=true;const check=(n,c,x='')=>{console.log((c?'PASS':'FAIL')+' — '+n+(x?'  ['+x+']':''));if(!c)PASS=false;};
// Open Range quote uses the stubbed 555: drive the booking quote
await page.getByRole('button',{name:'Book a Session'}).first().click();await page.waitForTimeout(400);
await page.locator('select').first().selectOption({label:'Open Range'});await page.waitForTimeout(300);
const quote=await page.evaluate(()=>document.body.innerText);
check('Booking quote uses server rate ₱555 for Open Range', /₱?555/.test(quote), quote.slice(0,0));
check('content fetched on mount', (await page.evaluate(()=>window.__f)).includes('getcontent'));
// admin: edit a rate -> setContent POST fires
await page.evaluate(()=>{}); // (login + Pricing tab drive below)
await page.getByRole('button',{name:'Staff login'}).first().click().catch(()=>{});
await page.locator('input[type=password]').first().fill('greenpark2026');await page.locator('input[type=password]').first().press('Enter');await page.waitForTimeout(500);
await page.getByRole('button',{name:'Pricing'}).first().click();await page.waitForTimeout(400);
const beforeN=(await page.evaluate(()=>window.__f)).filter(a=>a==='setContent').length;
const openInput=page.locator('input[type=number]').first();
await openInput.fill('700');await page.waitForTimeout(400);
const afterN=(await page.evaluate(()=>window.__f)).filter(a=>a==='setContent').length;
check('editing a rate POSTs setContent', afterN>beforeN, 'before='+beforeN+' after='+afterN);
await page.screenshot({path:'_c.png',fullPage:true});
console.log(PASS?'\nDYNPRICE VERIFY PASS':'\nDYNPRICE VERIFY FAIL');if(!PASS)process.exitCode=1;
await browser.close();server.close();
```
Install once: `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright-core --no-save`. Run `node _verify_c.mjs`. Expected: all PASS. Read `_c.png` to confirm the Pricing tab shows the rate/capacity fields. Confirm mirror IDENTICAL.

- [ ] **Step 9: Commit.**
```bash
git add index.html "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Dynamic pricing: content-backed rates/capacity, server load+save, Pricing-tab fields"
```

---

### Task 3: End-to-end check + cleanup

**Files:** `_verify_c.mjs` (deleted at end).

- [ ] **Step 1: Fallback + propagation checks.** Extend/confirm `_verify_c.mjs`: with `?action=content` stubbed to `{content:{}}` (empty), the Open Range quote falls back to ₱400 (no 0/NaN); editing the capacity field POSTs `setContent` with the new capacity; editing a package price still POSTs `setContent`.
- [ ] **Step 2: Mirror parity.** `diff "index.html" "Pasig Greenpark Archery Camp.dc.html" && echo IDENTICAL`.
- [ ] **Step 3: Confirm the backend deploy checklist** exists in `backend/SETUP.md` (Task 1 Step 5).
- [ ] **Step 4: Delete scratch.**
```bash
rm -f _verify_c.mjs _c.png
rm -rf node_modules package.json package-lock.json
git status --short
```
- [ ] **Step 5: Commit (if any final tweak).**
```bash
git add index.html "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Dynamic pricing: verified end-to-end (against stubbed db-v15)"
```

---

## Self-review notes
- **Spec coverage:** backend content store + routes + version + sync + checklist (T1); content model rates/capacity (T2 S1); content-aware rateFor/capacity with fallback (S2); load on mount (S3); save POST (S4); Pricing-tab fields (S5,S6); mirror (S7); verify rate-from-server + setContent-on-edit + fallback (S8, T3). All covered.
- **Backend review-gated** — no false test claims; the `SETUP.md` checklist is the live verification.
- **db-v15 contract** fixed in Global Constraints; the frontend stub mirrors it.
- **Fallback safety:** `cfgRates`/`capacity` use `Number(...) || default` so empty/missing content can't yield 0/NaN.
- **Deploy:** db-v15 deployed manually first, then push the frontend (same ordering caution as db-v14 — the new frontend reads `?action=content`, which the old backend lacks but the frontend handles gracefully via defaults).
