# Split Contact & Book a Session Pages — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the public booking form off the Contact page onto a new dedicated `book` page; make Contact info-only; add a "Book" nav link; repoint all booking CTAs and the `confirmBooking` gate to the new page.

**Architecture:** The site is one SuperConductor component in `index.html`, mirrored byte-for-byte in `Pasig Greenpark Archery Camp.dc.html`. Pages are `<sc-if value="{{ isX }}">` blocks switched by `this.state.page`; bindings live in a `render()` return object; handlers are class methods / render-local closures. We relocate the booking-form markup verbatim into a new `isBook` block, reflow Contact to a single info column, add routing bindings + a nav link, and repoint CTAs and the gate. Frontend-only.

**Tech Stack:** Vanilla SuperConductor template + `support.js`; playwright-core + cached Chromium for verification; Git Bash + PowerShell on Windows.

## Global Constraints
- **Mirror rule:** every edit to `index.html` is applied IDENTICALLY to `Pasig Greenpark Archery Camp.dc.html`; the two are byte-identical. After each task verify: `diff "index.html" "Pasig Greenpark Archery Camp.dc.html"` → empty (`IDENTICAL`).
- **No logic/pricing/backend changes:** the booking form's internal markup, `priceFor`/`bookSlot`/availability, the sessions stepper, emails, and the backend are unchanged. Only relocation + routing/nav/CTA wiring + the gate's page name change.
- **Gate preservation:** `confirmBooking`'s slots-vs-target gate must keep firing ONLY on the public booking page (now `book`), NEVER on My Bookings (`account`). It currently reads `this.state.page === 'contact'`; it becomes `'book'`.
- **Scope:** do not touch the My Bookings (`isAccount`) booking form.
- **Brand:** dark-green `#244232`/`#1b3325`, accent `#7fb43f`, cream `#f4efe4`; fonts Hanken Grotesk / Spline Sans Mono. Match existing nav-button styling exactly.
- **Locate by content, not absolute line numbers** — they shift as edits land.

## File structure
Only two files change, identically: `index.html` and `Pasig Greenpark Archery Camp.dc.html`. No new files.

---

## Verification harness (shared — build in Task 1, reuse/extend, delete in Task 3)

`_verify_split.mjs` at repo root (git-ignored scratch). Serves the repo over HTTP, launches cached Chromium, stubs `window.fetch` (no backend/emails), and drives nav.

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
const errs=[]; page.on('console',m=>{ if(m.type()==='error'){ const t=m.text(); if(!/404|Not Found|openstreetmap|could not be decoded/.test(t)) errs.push(t);} });
await page.addInitScript(()=>{ window.__f=[]; window.fetch=(u,o)=>{ const url=String(u); let a='';try{a=JSON.parse((o&&o.body)||'{}').action||'';}catch(e){} window.__f.push(a||(url.includes('availability')?'avail':'')); if(url.includes('action=availability')) return Promise.reject(new Error('stub')); return Promise.resolve(new Response('{}',{status:200})); }; });
await page.goto(`http://localhost:${PORT}/index.html`,{waitUntil:'networkidle'});
let PASS=true; const check=(n,c,x='')=>{ console.log((c?'PASS':'FAIL')+' — '+n+(x?'  ['+x+']':'')); if(!c) PASS=false; };
const hasForm = ()=> page.evaluate(()=>!!document.querySelector('[data-test=card-core]'));
// ... per-task assertions ...
```
Run: `node _verify_split.mjs`. Install driver once: `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright-core --no-save`.

---

### Task 1: Move the booking form to a new `book` page; Contact info-only; wire routing/CTAs/gate

**Files:** `index.html` + mirror.

**Interfaces:**
- Produces (bindings): `isBook` (bool), `goBook` (fn). Consumed by Task 2's nav link.

This is the functional split. After it the app fully works: Book page shows the form, Contact shows info only, every booking CTA reaches the form, the gate is preserved.

- [ ] **Step 1: Add `isBook` / `goBook` bindings.** In the render return object, find `isContact: page === 'contact',` and add `isBook: page === 'book',` next to it. Find `goContact: () => this.go('contact'),` and add `goBook: () => this.go('book'),` next to it.

- [ ] **Step 2: Repoint the program/book helpers** from `'contact'` to `'book'`. These bindings currently read `this.go('contact', …)` — change each `'contact'` to `'book'`:
  `bookProgram`, `bookLittle`, `bookYouth`, `bookAdult`, `bookOpen`, `bookPrivate`, `bookGroup`. (Search for `this.go('contact'` — every match in the bindings block becomes `this.go('book'`.)

- [ ] **Step 3: Move the `go()` scroll-to-form special-case.** Find `if (program && p === 'contact') {` (in the `go(p, program)` method) and change `p === 'contact'` to `p === 'book'`.

- [ ] **Step 4: Move the `confirmBooking` gate.** Find `if (this.state.page === 'contact' && sc !== target)` and change `'contact'` to `'book'`.

- [ ] **Step 5: Cut the booking-form block out of the Contact page.** In the `isContact` section, the right-column booking form is the `<div id="booking-form" …>` … `</div>` block (from the `<!-- BOOKING FORM -->` comment through the `</div>` that closes that div — it ends right before the `</section>` that closes the two-column grid). CUT this entire block (comment + div) to your clipboard for Step 8. Do NOT alter its inner markup.

- [ ] **Step 6: Reflow the Contact page to a single info column.** The two-column grid `<section style="…display:grid;grid-template-columns:1fr 1fr;…">` now contains only the INFO + MAP `<div>`. Change that section's style so it's a centered single column: replace `display:grid;grid-template-columns:1fr 1fr;gap:clamp(28px,4vw,48px);align-items:start;` with `max-width:760px;` (keep the existing `padding`/`margin:0 auto`/`width:100%`). Remove the now-empty `<!-- BOOKING FORM -->` comment if it wasn't cut in Step 5.

- [ ] **Step 7: Rewrite the Contact intro copy (info-focused).** In the Contact intro `<section>`: change the eyebrow `Visit & book` to `Visit us`; keep the H1 (`Come shoot with us` is fine, or `Come see us`); replace the paragraph that begins `Reserve a single session below,` with this plain contact line (no booking link/CTA):
```html
<p style="font-size:18px;line-height:1.55;color:#46563f;max-width:38em;margin:0;">Find us at Greenpark Village, call ahead, or message us on Facebook — we'd love to have you on the range.</p>
```

- [ ] **Step 8: Add the new `book` page with the moved form.** Immediately AFTER the `isContact` block closes (its final `</sc-if>`) and BEFORE the `<!-- ============ ACCOUNT ============ -->` marker, insert:
```html
  <!-- ============ BOOK A SESSION ============ -->
  <sc-if value="{{ isBook }}" hint-placeholder-val="{{ false }}">
  <div>
    <section style="padding:clamp(48px,6vw,72px) clamp(20px,5vw,64px) clamp(20px,3vw,28px);max-width:1320px;margin:0 auto;width:100%;">
      <div style="font-family:'Spline Sans Mono',monospace;font-size:12px;letter-spacing:0.2em;text-transform:uppercase;color:#3c6b48;margin-bottom:14px;">Book a session</div>
      <h1 style="font-size:clamp(34px,5vw,60px);font-weight:800;letter-spacing:-0.025em;margin:0 0 14px;color:#1b2a1f;">Reserve your spot</h1>
      <p style="font-size:18px;line-height:1.55;color:#46563f;max-width:38em;margin:0;">Reserve a single session below, or grab a <button onClick="{{ goPlans }}" style="background:none;border:none;padding:0;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;font-size:18px;font-weight:700;color:#244232;text-decoration:underline;text-underline-offset:3px;">pass or membership</button> to save on regular visits. Have a pass already? Book here and draw from it in My Bookings.</p>
    </section>
    <section style="padding:clamp(20px,3vw,28px) clamp(20px,5vw,64px) clamp(56px,6vw,88px);max-width:680px;margin:0 auto;width:100%;">
      <!-- PASTE the booking-form block cut in Step 5 here, verbatim -->
    </section>
  </div>
  </sc-if>
```
Paste the Step 5 block into the inner `<section>` where the comment indicates.

- [ ] **Step 9: Repoint the booking CTA buttons** from `goContact` to `goBook`. Change `onClick="{{ goContact }}"` to `onClick="{{ goBook }}"` for THESE buttons only (identify by their visible text / context):
  - desktop top-right "Book a Session" (the `background:#244232` nav button)
  - mobile "Book a Session" (the `margin-top:10px;background:#244232` button in the mobile menu)
  - home hero "Book your first session →"
  - programs page "Book a session →"
  - the two inline "book a single session" text links (in the Passes-page paragraphs)
  - the mobile sticky-bar "Book a Session" (`flex:1.4;background:#244232`)
  **Do NOT change** the nav "Contact" links (desktop + mobile) or the footer "Contact" link — those stay `goContact`.

- [ ] **Step 10: Apply every edit identically to the mirror** `Pasig Greenpark Archery Camp.dc.html`.

- [ ] **Step 11: Build & run the verification harness.** Create `_verify_split.mjs` (from the shared harness) and add:
```js
// Contact = info only (no form)
await page.getByRole('button',{name:'Contact'}).first().click(); await page.waitForTimeout(500);
check('Contact has NO booking form', !(await hasForm()));
check('Contact shows info (Range hours)', await page.evaluate(()=>/Range hours/.test(document.body.innerText)));
// Book page = the form
await page.getByRole('button',{name:'Book a Session'}).first().click(); await page.waitForTimeout(500);
check('Book page shows the booking form', await hasForm());
// a program CTA reaches the form: "Book this ->" on Programs page
await page.getByRole('button',{name:'Programs'}).first().click(); await page.waitForTimeout(400);
const bt = page.getByRole('button',{name:/Book this/}); if(await bt.count()){ await bt.first().click(); await page.waitForTimeout(500); check('"Book this ->" reaches the form', await hasForm()); }
// gate still works on the book page
await page.getByRole('button',{name:'Book a Session'}).first().click(); await page.waitForTimeout(400);
await page.locator('[aria-label="More sessions"]').click(); await page.waitForTimeout(200);
const op = await page.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>/Confirm booking|Confirm .* slots/.test(x.textContent));return b?getComputedStyle(b).opacity:'?';});
check('Gate on book page: target 2 + 0 slots -> dimmed', op==='0.5', 'opacity='+op);
await page.screenshot({path:'_split_book.png'});
await page.getByRole('button',{name:'Contact'}).first().click(); await page.waitForTimeout(400); await page.screenshot({path:'_split_contact.png'});
console.log('errs:', errs.length, PASS?'\nPASS':'\nFAIL'); if(!PASS||errs.length) process.exitCode=1;
await browser.close(); server.close();
```
Run `node _verify_split.mjs`. Expected: all PASS, 0 errs. Read `_split_book.png` (form present) and `_split_contact.png` (info+map, no form).

- [ ] **Step 12: Mirror parity check.** `diff "index.html" "Pasig Greenpark Archery Camp.dc.html" && echo IDENTICAL` → `IDENTICAL`.

- [ ] **Step 13: Commit.**
```bash
git add index.html "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Split Contact/Book: move booking form to new book page; Contact info-only; repoint CTAs + gate"
```

---

### Task 2: Add the "Book" nav link (desktop + mobile)

**Files:** `index.html` + mirror.
**Interfaces:** Consumes `isBook`, `goBook` (Task 1).

- [ ] **Step 1: Desktop nav "Book" link.** In the desktop nav, find the "About" `<button onClick="{{ goAbout }}" …>About<sc-if value="{{ isAbout }}"…>` and the "Contact" button after it. Insert a "Book" button BETWEEN them, copying the exact styling of the sibling nav buttons (the `position:relative;background:none;border:none;…font-size:15px;font-weight:600;…` style with the active-underline `<sc-if>`):
```html
      <button onClick="{{ goBook }}" style="position:relative;background:none;border:none;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;font-size:15px;font-weight:600;color:#1b2a1f;padding:4px 0;" style-hover="opacity:0.6;">Book<sc-if value="{{ isBook }}" hint-placeholder-val="{{ false }}"><span style="position:absolute;left:0;right:0;bottom:-4px;height:2px;background:#7fb43f;border-radius:2px;"></span></sc-if></button>
```

- [ ] **Step 2: Mobile nav "Book" link.** In the mobile menu, find the "About" link (`<button onClick="{{ goAbout }}" …>About</button>`) and the "Contact" link after it. Insert a "Book" link between them, copying the mobile link styling (`font-size:18px;font-weight:700;…padding:14px 4px;border-bottom:1px solid rgba(36,66,50,0.08);`):
```html
    <button onClick="{{ goBook }}" style="background:none;border:none;cursor:pointer;text-align:left;font-family:'Hanken Grotesk',sans-serif;font-size:18px;font-weight:700;color:#1b2a1f;padding:14px 4px;border-bottom:1px solid rgba(36,66,50,0.08);">Book</button>
```

- [ ] **Step 3: Apply identical edits to the mirror.**

- [ ] **Step 4: Verify the nav link.** Extend `_verify_split.mjs` (or a fresh check):
```js
await page.getByRole('button',{name:'Book',exact:true}).first().click(); await page.waitForTimeout(500);
check('Desktop "Book" nav link -> book page form', await hasForm());
```
Run `node _verify_split.mjs`. Expected: the new check PASSes, all others still PASS, 0 errs.

- [ ] **Step 5: Mirror parity check** (`diff … && echo IDENTICAL`).

- [ ] **Step 6: Commit.**
```bash
git add index.html "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Split Contact/Book: add Book nav link (desktop + mobile)"
```

---

### Task 3: End-to-end verification + cleanup

**Files:** `_verify_split.mjs` (then deleted).

- [ ] **Step 1: Full regression run.** With `_verify_split.mjs`, confirm in one run: Contact = info only (no `card-core`); Book page (via nav link, via top-right button, and via a program "Book" CTA) = form present; the gate dims on the book page (target 2 + 0 slots → opacity 0.5).

- [ ] **Step 2: My Bookings multi-slot still books (gate scoped correctly).** Add a check: seed `localStorage.pgac_bookings` with one booking for `test@pgac.test`, go My Bookings, login with that email, "+ Book a session", fill the archer DOB (`2000-01-01`), pick a future slot date (`2026-07-15`, the non-Birthdate date input), click two time slots, click the account Book button, and assert `window.__f` includes `'book'` (the gate, now scoped to `page==='book'`, must NOT block the account path). Reference the prior `_fix_verify.mjs` approach for the account-login sequence.

- [ ] **Step 3: Mobile screenshots.** Capture Contact and Book at 390px width; read them to confirm Contact is info-only and Book shows the full form, brand intact.

- [ ] **Step 4: Final mirror parity.** `diff "index.html" "Pasig Greenpark Archery Camp.dc.html" && echo IDENTICAL`.

- [ ] **Step 5: Delete scratch.**
```bash
rm -f _verify_split.mjs _split_book.png _split_contact.png _split_*_mobile.png
rm -rf node_modules package.json package-lock.json
git status --short   # expect clean of feature scratch
```

- [ ] **Step 6: Commit (if any final tweak).**
```bash
git add index.html "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Split Contact/Book: verified end-to-end (frontend only)"
```

---

## Self-review notes
- **Spec coverage:** new `book` page + moved form (Task 1 Steps 5,8); Contact info-only + reflow + copy (Steps 6,7); `isBook`/`goBook` (Step 1); CTA repointing (Steps 2,9); `go()` special-case (Step 3); gate move (Step 4); nav "Book" link desktop+mobile (Task 2); footer/nav Contact unchanged (Step 9 caveat); mirror discipline (every task); My Bookings untouched + gate-scope regression check (Task 3 Step 2). All covered.
- **Gate regression** is explicitly re-verified (Task 3 Step 2) since this is the second time this gate's page-scope is load-bearing.
- **No backend hit** in verification (`fetch` stubbed) — no real emails/calendar.
- **Deployment:** frontend-only; after merge, push to `origin` for GitHub Pages (the user deploys from `main`).
