# Admin-Editable Site Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the admin upload their own photos for the Home hero, the About portrait, and each program card — replacing the current hardcoded/path-only images.

**Architecture:** Reuse the proven coach-photo path (browser-side resize+compress to base64). Each image is stored as its own Apps Script Script-Property key (`img:hero`, `img:about`, `img:prog:<name>`), served publicly via a new `?action=images` and written via an admin `setImage` action guarded by a 250KB budget check. Every public `<img>` binds to `uploaded || currentDefault`, so an un-customized site is pixel-identical to today.

**Tech Stack:** Single-file static HTML + custom `{{ }}`/`<sc-if>`/`<sc-for>` template framework (`index.html`), mirrored byte-for-byte to `Pasig Greenpark Archery Camp.dc.html`. Google Apps Script backend (`backend/Code.gs`). No build system, no unit-test framework — verification is `node --check`, Playwright (`playwright-core`, `channel:"msedge"`), `.dc.html` diff, and live `curl` of the Apps Script web app.

## Global Constraints

- **Mirror discipline:** every `index.html` change must be copied to `Pasig Greenpark Archery Camp.dc.html` (`cp index.html "Pasig Greenpark Archery Camp.dc.html"`); `diff -q` must report identical before any push.
- **Graceful fallback:** with no uploaded image, each slot MUST render the current default asset (`assets/arrows-target-o.jpg` hero, `assets/coaching-o.jpg` About portrait, the program's typed path). Backend unreachable ⇒ defaults, never a broken image.
- **Storage ceiling:** Script-Properties store ≈ 500KB total. The `img:*` namespace budget guard rejects writes that would push `img:*` past **250000** bytes. Per-slot client caps: hero 48000, about 48000, program 24000 (base64 char length).
- **Backend deploy is manual** (owner only): paste `Code.gs` → Save → Deploy → Manage deployments → edit existing → New version. No new OAuth scope (Properties only).
- **No em-dashes** in any user-visible copy (— banned); use commas/periods.
- **Backend version flag:** bump to `db-v37`, add `siteImages: true`.
- **Apps Script web app URL** (for verification): `https://script.google.com/macros/s/AKfycbzGPuLsTrijb08rFTFVwkBU1KcG0HKg-mtlgVOWODsFubwCl8o_urpcDAxeTVEGqCYOug/exec`

---

## File Structure

- `index.html` — all frontend: `resizeImageFile` (parameterized), `loadSiteImages`/`applySiteImages`/`saveSiteImage`/`resetSiteImage`, `state.images`, public bindings (hero/about/program), admin "Photos" UI. Mirrored to `Pasig Greenpark Archery Camp.dc.html`.
- `backend/Code.gs` — `getImages_`, `setImage_`, `imgBudgetOk_`, `doGet`/`doPost` wiring, version bump.
- `backend/SETUP.md` — db-v37 deploy/verify section.

---

## Task 1: Ship the pending Passes-spacing fix

Independent, already-edited-locally change (gap added above the Passes "how it works" strip). Commit it first so it isn't lost in the feature work.

**Files:**
- Modify: `index.html` (already edited — `HOW IT WORKS` section padding/margin) + mirror `Pasig Greenpark Archery Camp.dc.html`

- [ ] **Step 1: Confirm the edit is present and mirrored**

Run:
```bash
cd "C:/Users/Michael Cabral/OneDrive/Documents/Code/Pasig Greenpark Archery Camp Web Site"
grep -n "padding:clamp(34px,4.5vw,52px) clamp(20px,5vw,64px) 0;max-width:1320px;margin:0 auto clamp(28px,4vw,44px)" index.html
diff -q index.html "Pasig Greenpark Archery Camp.dc.html"
```
Expected: one grep match; `diff` prints nothing (identical).

- [ ] **Step 2: Commit + push**

```bash
git add index.html "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Passes page: add breathing room above the how-it-works steps

The 3-step strip was hugging the bottom of the green intro band. Add top padding +
larger bottom margin so it no longer touches the band.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main
```
Expected: push succeeds.

---

## Task 2: Backend — `getImages_` / `setImage_` / budget guard / db-v37

**Files:**
- Modify: `backend/Code.gs` — add three functions near `getContent_`/`setContent_` (~line 192-199); wire `doGet` (~`action === 'content'`, line ~870) and `doPost` (~`body.action === 'setContent'`, line ~1013); bump version (~line 892).

**Interfaces:**
- Produces (HTTP):
  - `GET ?action=images` → `{ hero: <dataURL|''>, about: <dataURL|''>, programs: { "<programName>": <dataURL>, … } }`
  - `POST { action:'setImage', slot, data, ...adminAuth }` → `{ ok:true }` | `{ ok:true, cleared:true }` | `{ ok:false, reason:'bad-slot'|'bad-data'|'storage-full' }`. `slot` ∈ `'hero' | 'about' | 'prog:<name>'`; `data` = base64 `data:image/...` dataURL, or `''`/absent to clear.
  - `GET ?action=version` → now includes `"version":"db-v37"`, `"siteImages":true`.

- [ ] **Step 1: Add the three functions**

Insert after `setContent_` (after the line `PropertiesService.getScriptProperties().setProperty('CONTENT', JSON.stringify(c)); ... }`, ~line 200):

```javascript
// db-v37: per-slot uploaded site images (hero, About portrait, program cards), stored one per
// Script Property under the img: namespace. Public read so the live site can fetch them.
function getImages_() {
  var all = PropertiesService.getScriptProperties().getProperties();
  var out = { hero: '', about: '', programs: {} };
  for (var k in all) {
    if (k.indexOf('img:') !== 0) continue;
    var slot = k.slice(4);
    if (slot === 'hero') out.hero = all[k];
    else if (slot === 'about') out.about = all[k];
    else if (slot.indexOf('prog:') === 0) out.programs[slot.slice(5)] = all[k];
  }
  return json_(out);
}

// Budget guard: keep the img: namespace under 250KB so the ~500KB Properties store can't overflow
// (coach photos + CONTENT + runtime keys share it). replaceKey is excluded (it's being overwritten).
function imgBudgetOk_(incomingLen, replaceKey) {
  var all = PropertiesService.getScriptProperties().getProperties();
  var total = incomingLen || 0;
  for (var k in all) {
    if (k.indexOf('img:') !== 0) continue;
    if (k === replaceKey) continue;
    total += String(all[k]).length;
  }
  return total <= 250000;
}

// Admin: store or clear one image slot. Empty/absent data clears the slot (reverts to default).
function setImage_(body) {
  var slot = String((body && body.slot) || '').trim();
  if (!/^(hero|about|prog:.+)$/.test(slot)) return json_({ ok: false, reason: 'bad-slot' });
  var key = 'img:' + slot;
  var data = (body && body.data != null) ? String(body.data) : '';
  var props = PropertiesService.getScriptProperties();
  if (!data) { props.deleteProperty(key); return json_({ ok: true, cleared: true }); }
  if (data.indexOf('data:image/') !== 0) return json_({ ok: false, reason: 'bad-data' });
  if (!imgBudgetOk_(data.length, key)) return json_({ ok: false, reason: 'storage-full' });
  props.setProperty(key, data);
  return json_({ ok: true });
}
```

- [ ] **Step 2: Wire `doGet`**

Find `if (action === 'content') return getContent_();` (~line 870). Add immediately after it:

```javascript
    if (action === 'images') return getImages_();
```

- [ ] **Step 3: Wire `doPost`**

Find `if (body.action === 'setContent')        return assertAdmin_(body) ? setContent_(body)        : unauthorized_();` (~line 1013). Add immediately after it:

```javascript
    if (body.action === 'setImage')          return assertAdmin_(body) ? setImage_(body)          : unauthorized_();
```

- [ ] **Step 4: Bump the version line**

In the `action === 'version'` block (~line 892), change `version: 'db-v36'` to `version: 'db-v37'` and insert `siteImages: true,` right after `triggerStatus: true,`:

```javascript
      return json_({ version: 'db-v37', auth: true, siteImages: true, triggerStatus: true, expiryTrigger: expiryTriggerActive_(), lastExpiryRun: lastExpiryRun, lastExpirySent: lastExpirySent, expiryInstaller: true, expiryRunnable: true, clientPaid: true, /* …rest unchanged… */ });
```

(Keep every other existing flag exactly as-is; only the version string changes and `siteImages: true` is added.)

- [ ] **Step 5: Syntax-check**

Run:
```bash
cp backend/Code.gs /tmp/c.js && node --check /tmp/c.js && echo "SYNTAX OK" && rm -f /tmp/c.js
```
Expected: `SYNTAX OK`.

- [ ] **Step 6: Add the SETUP.md db-v37 section**

Append to `backend/SETUP.md` (after the db-v36 section):

```markdown

---

## db-v37 deploy & verify

**What changed:** admin-uploadable site images. New `getImages_` (public `?action=images`),
`setImage_` (admin POST), `imgBudgetOk_` guard. Images live under the `img:` Script-Property
namespace, capped at 250KB total. No new OAuth scope.

### Deploy steps
1. Apps Script editor → paste `backend/Code.gs` → **Save**.
2. **Deploy → Manage deployments → ✏️ edit → New version → Deploy.**

### Verify
- [ ] `…/exec?action=version` → `"version":"db-v37"`, `"siteImages":true`.
- [ ] `…/exec?action=images` → `{"hero":"","about":"","programs":{}}` before any upload.
```

- [ ] **Step 7: Commit**

```bash
git add backend/Code.gs backend/SETUP.md
git commit -m "backend db-v37: admin-uploadable site images (getImages/setImage + budget guard)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

> **Note:** going live requires the owner's manual redeploy (see Task 7). Frontend tasks below are safe without it (they fall back to defaults).

---

## Task 3: Frontend — parameterize `resizeImageFile`

**Files:**
- Modify: `index.html:3024-3045` (`resizeImageFile`) + mirror.

**Interfaces:**
- Produces: `resizeImageFile(file, cb, opts?)` where `opts = { w, h, maxLen }` (defaults `400/500/46000` — unchanged for existing coach calls). Callback signature becomes `cb(dataURL, ok)` where `ok` = `dataURL.length <= maxLen` (existing coach callers ignore the 2nd arg).

- [ ] **Step 1: Replace `resizeImageFile`**

Replace the whole method (`index.html:3024-3045`) with:

```javascript
  resizeImageFile(file, cb, opts) {
    if (!file || !/^image\//.test(file.type || '')) return;
    opts = opts || {};
    const W = opts.w || 400, H = opts.h || 500, maxLen = opts.maxLen || 46000, ar = W / H;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let sw, sh;
        if (img.width / img.height > ar) { sh = img.height; sw = Math.round(sh * ar); }
        else { sw = img.width; sh = Math.round(sw / ar); }
        const sx = Math.round((img.width - sw) / 2), sy = Math.round((img.height - sh) / 2);
        const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, W, H);
        let q = 0.82, url = canvas.toDataURL('image/jpeg', q);
        while (url.length > maxLen && q > 0.3) { q -= 0.08; url = canvas.toDataURL('image/jpeg', q); }
        cb(url, url.length <= maxLen);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }
```

- [ ] **Step 2: Mirror + syntax check (Playwright load, 0 page errors)**

Run:
```bash
cp index.html "Pasig Greenpark Archery Camp.dc.html"
cat > /tmp/chk.cjs <<'EOF'
const pw=require("playwright-core");
const URL="file:///C:/Users/Michael%20Cabral/OneDrive/Documents/Code/Pasig%20Greenpark%20Archery%20Camp%20Web%20Site/index.html";
(async()=>{const b=await pw.chromium.launch({channel:"msedge"});const pg=await b.newPage();const errs=[];pg.on("pageerror",e=>errs.push(e.message));await pg.goto(URL,{waitUntil:"domcontentloaded",timeout:30000});await pg.waitForTimeout(1800);require("fs").writeFileSync("C:/tmp/chk.txt","pageErrors:"+errs.length+(errs.length?(" "+JSON.stringify(errs.slice(0,3))):""));await b.close();})();
EOF
node /tmp/chk.cjs; cat "C:/tmp/chk.txt"
```
Expected: `pageErrors:0`.

- [ ] **Step 3: Commit**

```bash
git add index.html "Pasig Greenpark Archery Camp.dc.html"
git commit -m "images: parameterize resizeImageFile (per-slot dims + cap), back-compat default

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Frontend — `state.images` load + cache

**Files:**
- Modify: `index.html` — add `loadSiteImages`/`applySiteImages` methods (next to `loadCoaches`/`applyCoaches`, ~line 3056-3069); seed `state.images` at init and call `loadSiteImages()` where `loadCoaches()` is called.

**Interfaces:**
- Produces: `state.images = { hero:'', about:'', programs:{} }`; `loadSiteImages()` (fetch `?action=images`); `applySiteImages(res)` (normalize + cache to `localStorage['pgac_images']` + `setState`).

- [ ] **Step 1: Add the two methods**

Insert after `applyCoaches` (the method ending ~line 3069, right before the next method):

```javascript
  loadSiteImages() {
    const ep = this.endpoint(); if (!ep) return;
    fetch(ep + '?action=images').then(r => r.json()).then(res => {
      if (res && typeof res === 'object') this.applySiteImages(res);
    }).catch(() => {});
  }
  applySiteImages(res) {
    const imgs = { hero: res.hero || '', about: res.about || '', programs: res.programs || {} };
    try { localStorage.setItem('pgac_images', JSON.stringify(imgs)); } catch (e) {}
    this.setState({ images: imgs });
  }
```

- [ ] **Step 2: Seed `state.images` at init**

Find the initial-state object where `coachList` is seeded from `localStorage` (search `pgac_coaches`). Add a sibling that seeds `images`. Locate the constructor/`getInitialState`-style block containing `coachList:` and add:

```javascript
      images: (function () { try { return JSON.parse(localStorage.getItem('pgac_images')) || { hero:'', about:'', programs:{} }; } catch (e) { return { hero:'', about:'', programs:{} }; } })(),
```

(Place it right after the `coachList:` initializer line, matching its indentation. If `coachList` is seeded via a helper rather than inline, mirror that exact pattern for `images`.)

- [ ] **Step 3: Call `loadSiteImages()` on init**

Find where `this.loadCoaches()` is called (search `loadCoaches(`). Add on the next line, same indentation:

```javascript
    this.loadSiteImages();
```

- [ ] **Step 4: Mirror + verify state present (no page errors)**

Run:
```bash
cp index.html "Pasig Greenpark Archery Camp.dc.html"
cat > /tmp/chk4.cjs <<'EOF'
const pw=require("playwright-core");
const URL="file:///C:/Users/Michael%20Cabral/OneDrive/Documents/Code/Pasig%20Greenpark%20Archery%20Camp%20Web%20Site/index.html";
(async()=>{const b=await pw.chromium.launch({channel:"msedge"});const pg=await b.newPage();const errs=[];pg.on("pageerror",e=>errs.push(e.message));await pg.goto(URL,{waitUntil:"domcontentloaded",timeout:30000});await pg.waitForTimeout(1800);const has=await pg.evaluate(()=>!!window.localStorage);require("fs").writeFileSync("C:/tmp/chk4.txt","pageErrors:"+errs.length+" ls:"+has);await b.close();})();
EOF
node /tmp/chk4.cjs; cat "C:/tmp/chk4.txt"
```
Expected: `pageErrors:0 ls:true`.

- [ ] **Step 5: Commit**

```bash
git add index.html "Pasig Greenpark Archery Camp.dc.html"
git commit -m "images: load + cache state.images from ?action=images

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Frontend — public bindings with default fallback

**Files:**
- Modify: `index.html:91` (hero img), `index.html:571` (About portrait img), the render-return object (~line 6116, add `heroImg`/`aboutImg`), and `homeProgramRows`/`programList` map (~line 4051-4057, program image resolution).

**Interfaces:**
- Consumes: `state.images` (Task 4).
- Produces: bindings `{{ heroImg }}`, `{{ aboutImg }}`; program-card `image`/`hasImage` resolved from `images.programs[name] || p.image`.

- [ ] **Step 1: Add `heroImg`/`aboutImg` to the render-return object**

Find the big object returned by `render()` (search the line containing `isHome: page === 'home',`). Add these two properties inside that object (any position, matching indentation):

```javascript
      heroImg: (this.state.images && this.state.images.hero) || 'assets/arrows-target-o.jpg',
      aboutImg: (this.state.images && this.state.images.about) || 'assets/coaching-o.jpg',
```

- [ ] **Step 2: Bind the hero `<img>`**

At `index.html:91`, change:
```html
      <img src="assets/arrows-target-o.jpg" alt="Arrows grouped in the gold on the Greenpark range" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;z-index:0;" />
```
to:
```html
      <img src="{{ heroImg }}" alt="Arrows grouped in the gold on the Greenpark range" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;z-index:0;" />
```

- [ ] **Step 3: Bind the About portrait `<img>`**

At `index.html:571`, change `src="assets/coaching-o.jpg"` to `src="{{ aboutImg }}"` (leave the alt text and styles unchanged):
```html
          <img src="{{ aboutImg }}" alt="A coach setting up a young archer on the line at Greenpark" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover;display:block;" />
```

- [ ] **Step 4: Resolve program image from uploads**

In the `programList().filter(...).map(...)` block (~line 4051-4057), replace the `image`/`hasImage` line. Change:
```javascript
        image: p.image || '', hasImage: !!(p.image && String(p.image).trim()),
```
to:
```javascript
        image: (function () { var up = (self.state.images && self.state.images.programs && self.state.images.programs[p.name]) || ''; return up || p.image || ''; })(),
        hasImage: !!(((self.state.images && self.state.images.programs && self.state.images.programs[p.name]) || p.image || '').toString().trim()),
```

(`self` is already the captured `this` in this map per the existing code; confirm the surrounding map uses `self` and not `this`.)

- [ ] **Step 5: Mirror + verify the site is visually unchanged (defaults)**

Run:
```bash
cp index.html "Pasig Greenpark Archery Camp.dc.html"
cat > /tmp/chk5.cjs <<'EOF'
const pw=require("playwright-core");
const URL="file:///C:/Users/Michael%20Cabral/OneDrive/Documents/Code/Pasig%20Greenpark%20Archery%20Camp%20Web%20Site/index.html";
(async()=>{const b=await pw.chromium.launch({channel:"msedge"});const pg=await b.newPage();await pg.setViewportSize({width:1280,height:900});const errs=[];pg.on("pageerror",e=>errs.push(e.message));await pg.goto(URL,{waitUntil:"domcontentloaded",timeout:30000});await pg.waitForTimeout(1800);const hero=await pg.evaluate(()=>{const i=document.querySelector('section img');return i?i.getAttribute('src'):'';});await pg.screenshot({path:"C:/tmp/img_home.png"});await pg.getByRole("button",{name:"About",exact:true}).first().click().catch(()=>{});await pg.waitForTimeout(1200);await pg.screenshot({path:"C:/tmp/img_about.png"});require("fs").writeFileSync("C:/tmp/chk5.txt","pageErrors:"+errs.length+" heroSrc:"+hero);await b.close();})();
EOF
node /tmp/chk5.cjs; cat "C:/tmp/chk5.txt"
```
Expected: `pageErrors:0 heroSrc:assets/arrows-target-o.jpg`. View `C:/tmp/img_home.png` + `C:/tmp/img_about.png` — must look identical to the current live site (hero photo + About portrait present).

- [ ] **Step 6: Commit**

```bash
git add index.html "Pasig Greenpark Archery Camp.dc.html"
git commit -m "images: bind hero/About/program <img> to uploads with default fallback

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Frontend — admin "Photos" UI + save/reset handlers

**Files:**
- Modify: `index.html` — add `saveSiteImage`/`resetSiteImage` methods (next to `saveCoachProfile`, ~line 3046); add the "Photos" markup block inside the admin Pricing tab (near the program editor, ~line 2436); add upload handlers + `imgBusy`/`imgMsg` render values to the admin render block.

**Interfaces:**
- Consumes: `resizeImageFile(file, cb, opts)` (Task 3), `state.images`/`applySiteImages` (Task 4), `this.adminPost` (existing), `setImage` action (Task 2).
- Produces: admin controls calling `saveSiteImage(slot, dataURL)` and `resetSiteImage(slot)`.

- [ ] **Step 1: Add the two methods**

Insert after `saveCoachProfile` (~line 3055):

```javascript
  saveSiteImage(slot, data) {
    this.setState({ imgBusy: true, imgMsg: '' });
    this.adminPost({ action: 'setImage', slot: slot, data: data })
      .then(res => {
        if (res && res.ok) {
          const imgs = JSON.parse(JSON.stringify(this.state.images || { hero: '', about: '', programs: {} }));
          if (slot === 'hero') imgs.hero = data;
          else if (slot === 'about') imgs.about = data;
          else if (slot.indexOf('prog:') === 0) { imgs.programs = imgs.programs || {}; imgs.programs[slot.slice(5)] = data; }
          this.applySiteImages(imgs);
          this.setState({ imgBusy: false });
        } else {
          this.setState({ imgBusy: false, imgMsg: (res && res.reason === 'storage-full') ? 'Storage almost full. Remove a photo or use a smaller one.' : 'Could not save the image.' });
        }
      })
      .catch(() => this.setState({ imgBusy: false, imgMsg: 'Could not save. Check the connection.' }));
  }
  resetSiteImage(slot) {
    this.setState({ imgBusy: true, imgMsg: '' });
    this.adminPost({ action: 'setImage', slot: slot, data: '' })
      .then(res => {
        const imgs = JSON.parse(JSON.stringify(this.state.images || { hero: '', about: '', programs: {} }));
        if (slot === 'hero') imgs.hero = '';
        else if (slot === 'about') imgs.about = '';
        else if (slot.indexOf('prog:') === 0 && imgs.programs) delete imgs.programs[slot.slice(5)];
        this.applySiteImages(imgs);
        this.setState({ imgBusy: false });
      })
      .catch(() => this.setState({ imgBusy: false, imgMsg: 'Could not reset. Check the connection.' }));
  }
```

- [ ] **Step 2: Add hero/About render values + handlers to the admin render block**

In the admin render section (the object that builds the Pricing tab — search where `pg.setImage` / program fields are produced, ~line 5350-5356), add these render values near them:

```javascript
      imgBusy: this.state.imgBusy, imgMsg: this.state.imgMsg || '',
      heroImgPreview: (this.state.images && this.state.images.hero) || 'assets/arrows-target-o.jpg',
      aboutImgPreview: (this.state.images && this.state.images.about) || 'assets/coaching-o.jpg',
      onHeroFile: (e) => { const f = e.target.files && e.target.files[0]; if (f) this.resizeImageFile(f, (url, ok) => { if (!ok) { this.setState({ imgMsg: "Could not compress that photo small enough. Try a simpler image." }); return; } this.saveSiteImage('hero', url); }, { w: 1100, h: 620, maxLen: 48000 }); },
      onAboutFile: (e) => { const f = e.target.files && e.target.files[0]; if (f) this.resizeImageFile(f, (url, ok) => { if (!ok) { this.setState({ imgMsg: "Could not compress that photo small enough. Try a simpler image." }); return; } this.saveSiteImage('about', url); }, { w: 560, h: 700, maxLen: 48000 }); },
      resetHero: () => this.resetSiteImage('hero'),
      resetAbout: () => this.resetSiteImage('about'),
```

- [ ] **Step 3: Add the per-program upload handler to the program-row render**

In the per-program map that produces `setImage: setProgField(i, 'image')` (~line 5356), add an upload handler in the same returned object:

```javascript
      onProgImageFile: (function (nm) { return function (e) { const f = e.target.files && e.target.files[0]; if (f) self.resizeImageFile(f, (url, ok) => { if (!ok) { self.setState({ imgMsg: "Could not compress that photo small enough. Try a simpler image." }); return; } self.saveSiteImage('prog:' + nm, url); }, { w: 560, h: 420, maxLen: 24000 }); }; })(np.name),
      resetProgImage: (function (nm) { return function () { self.resetSiteImage('prog:' + nm); }; })(np.name),
```

(Confirm the program map exposes the program name as `np.name`; if the loop variable differs, use that name. Confirm `self` is the captured `this` for this map.)

- [ ] **Step 4: Add the "Photos" markup block in the Pricing tab**

In the admin Pricing tab, immediately above the program list (just before the `<sc-for>` that renders program rows / near `index.html:2436`), insert:

```html
<div style="background:#fffdf6;border:1px solid rgba(36,66,50,0.1);border-radius:12px;padding:20px;margin-bottom:20px;">
  <div style="font-family:'Spline Sans Mono',monospace;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#3c6b48;margin-bottom:14px;">Photos</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
    <div>
      <div style="font-size:13px;font-weight:700;color:#1b2a1f;margin-bottom:8px;">Home hero photo</div>
      <img src="{{ heroImgPreview }}" alt="Hero preview" style="width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:8px;border:1px solid rgba(36,66,50,0.14);display:block;margin-bottom:10px;" />
      <div style="display:flex;gap:8px;align-items:center;">
        <label style="cursor:pointer;background:#244232;color:#f4efe4;font-size:13px;font-weight:700;padding:9px 16px;border-radius:999px;">Upload<input type="file" accept="image/*" onChange="{{ onHeroFile }}" style="display:none;" /></label>
        <button onClick="{{ resetHero }}" style="background:none;border:1px solid rgba(36,66,50,0.2);cursor:pointer;font-family:'Hanken Grotesk',sans-serif;font-size:12.5px;font-weight:700;color:#244232;padding:8px 14px;border-radius:999px;">Reset</button>
      </div>
    </div>
    <div>
      <div style="font-size:13px;font-weight:700;color:#1b2a1f;margin-bottom:8px;">About portrait photo</div>
      <img src="{{ aboutImgPreview }}" alt="About portrait preview" style="width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:8px;border:1px solid rgba(36,66,50,0.14);display:block;margin-bottom:10px;" />
      <div style="display:flex;gap:8px;align-items:center;">
        <label style="cursor:pointer;background:#244232;color:#f4efe4;font-size:13px;font-weight:700;padding:9px 16px;border-radius:999px;">Upload<input type="file" accept="image/*" onChange="{{ onAboutFile }}" style="display:none;" /></label>
        <button onClick="{{ resetAbout }}" style="background:none;border:1px solid rgba(36,66,50,0.2);cursor:pointer;font-family:'Hanken Grotesk',sans-serif;font-size:12.5px;font-weight:700;color:#244232;padding:8px 14px;border-radius:999px;">Reset</button>
      </div>
    </div>
  </div>
  <sc-if value="{{ imgMsg }}" hint-placeholder-val="{{ false }}"><div style="margin-top:12px;font-size:13px;color:#b4512f;background:rgba(180,81,47,0.08);border:1px solid rgba(180,81,47,0.2);border-radius:8px;padding:9px 12px;">{{ imgMsg }}</div></sc-if>
</div>
```

- [ ] **Step 5: Add the per-program Upload control to each program row**

In the program-row markup (the `<sc-for>` body that renders the `pg.setImage` path `<input>` at `index.html:2436`), add right after that input, inside the same row:

```html
<label style="cursor:pointer;background:#244232;color:#f4efe4;font-size:12px;font-weight:700;padding:8px 13px;border-radius:999px;white-space:nowrap;align-self:start;">Upload<input type="file" accept="image/*" onChange="{{ pg.onProgImageFile }}" style="display:none;" /></label>
<button onClick="{{ pg.resetProgImage }}" style="background:none;border:1px solid rgba(36,66,50,0.2);cursor:pointer;font-family:'Hanken Grotesk',sans-serif;font-size:11.5px;font-weight:700;color:#244232;padding:7px 12px;border-radius:999px;white-space:nowrap;align-self:start;">Reset</button>
```

(Ensure these are inside the same flex/grid container as the path input so they sit beside it; adjust the wrapper only if the input is not already in a row container.)

- [ ] **Step 6: Mirror + syntax/parse check**

Run:
```bash
cp index.html "Pasig Greenpark Archery Camp.dc.html"
diff -q index.html "Pasig Greenpark Archery Camp.dc.html"
cat > /tmp/chk6.cjs <<'EOF'
const pw=require("playwright-core");
const URL="file:///C:/Users/Michael%20Cabral/OneDrive/Documents/Code/Pasig%20Greenpark%20Archery%20Camp%20Web%20Site/index.html";
(async()=>{const b=await pw.chromium.launch({channel:"msedge"});const pg=await b.newPage();const errs=[];pg.on("pageerror",e=>errs.push(e.message));await pg.goto(URL,{waitUntil:"domcontentloaded",timeout:30000});await pg.waitForTimeout(1800);require("fs").writeFileSync("C:/tmp/chk6.txt","pageErrors:"+errs.length+(errs.length?(" "+JSON.stringify(errs.slice(0,3))):""));await b.close();})();
EOF
node /tmp/chk6.cjs; cat "C:/tmp/chk6.txt"
```
Expected: `diff` identical; `pageErrors:0`.

- [ ] **Step 7: Commit**

```bash
git add index.html "Pasig Greenpark Archery Camp.dc.html"
git commit -m "images: admin Photos panel (hero + About uploaders, per-program upload, reset)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Push, deploy backend, end-to-end live verification

**Files:** none (deploy + verify). Depends on Tasks 2-6.

- [ ] **Step 1: Push all frontend commits**

```bash
git push origin main
```

- [ ] **Step 2: Owner redeploys the backend to db-v37**

Hand off to the owner: Apps Script editor → paste `backend/Code.gs` → Save → Deploy → Manage deployments → edit existing → New version → Deploy. Wait for the owner to confirm "done."

- [ ] **Step 3: Verify backend live**

Run:
```bash
curl -s -L -m 25 "https://script.google.com/macros/s/AKfycbzGPuLsTrijb08rFTFVwkBU1KcG0HKg-mtlgVOWODsFubwCl8o_urpcDAxeTVEGqCYOug/exec?action=version" | grep -o '"version":"db-v37"' ; echo "---" ; curl -s -L -m 25 "https://script.google.com/macros/s/AKfycbzGPuLsTrijb08rFTFVwkBU1KcG0HKg-mtlgVOWODsFubwCl8o_urpcDAxeTVEGqCYOug/exec?action=images"
```
Expected: `"version":"db-v37"`; images endpoint returns `{"hero":"","about":"","programs":{}}`.

- [ ] **Step 4: Live end-to-end (Playwright, against production)**

After the GitHub Pages CDN settles (poll past ~60-90s lag), drive the live admin (passcode `greenpark2026`): open admin → Pricing → Photos → upload a test image for hero, About, and one program. Confirm each appears on the public Home/About pages. Then Reset each → confirm revert to the default photo. Capture screenshots as evidence. (Use the established live-poll pattern from prior sessions; the admin passcode and Apps Script URL are above.)
Expected: uploaded images render live; Reset reverts; no page errors; oversized file triggers the "storage-full"/compress message rather than a broken write.

- [ ] **Step 5: Update memory**

Append to `.../memory/post-redesign-batch.md` (or a new `site-images.md`) + `MEMORY.md`: db-v37 shipped, the `img:*` namespace + 250KB guard, `?action=images`, the 3 editable slots, defaults-fallback. Note `resizeImageFile(file, cb, opts)` is now parameterized.

---

## Self-Review

**Spec coverage:**
- 3 upload slots (hero/About/program) → Tasks 5 (bindings) + 6 (admin UI). ✓
- Per-slot keys `img:hero`/`img:about`/`img:prog:<name>` → Task 2 `setImage_`/`getImages_`. ✓
- Per-slot caps (48k/48k/24k) → Task 6 handler opts; `resizeImageFile` enforces → Task 3. ✓
- 250KB budget guard + `storage-full` message → Task 2 `imgBudgetOk_` + Task 6 `saveSiteImage`. ✓
- Public read `?action=images`, admin `setImage` → Task 2. ✓
- Default fallback (site unchanged when unset) → Task 5 (`|| default`). ✓
- `resizeImageFile` parameterized, coach call unchanged → Task 3 (defaults 400/500/46000). ✓
- Reset reverts (clear → deleteProperty) → Task 2 `setImage_` empty-data branch + Task 6 `resetSiteImage`. ✓
- db-v37 + `siteImages` flag + SETUP.md → Task 2. ✓
- Mirror discipline + manual redeploy → Global Constraints + Tasks 3-7. ✓
- Passes spacing fix shipped → Task 1. ✓
- Error handling (bad-slot/bad-data/network/compress-fail) → Task 2 validation + Task 6 callbacks. ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. The few "confirm the loop variable is `np.name`/`self`" notes are verification instructions against existing code, not missing content. ✓

**Type consistency:** `saveSiteImage(slot, data)`/`resetSiteImage(slot)`/`applySiteImages(res)`/`loadSiteImages()` used consistently across Tasks 4 and 6. `state.images` shape `{hero,about,programs:{}}` consistent in Tasks 4/5/6. `resizeImageFile(file, cb, opts)` + `cb(url, ok)` consistent Tasks 3/6. Slot strings `'hero'|'about'|'prog:<name>'` consistent Tasks 2/6. ✓
