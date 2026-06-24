# Editable Coaches + Testimonials Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each coach an editable photo + bio (admin + coach-portal self-edit), show the roster on the About page, and make testimonials admin-editable — all synced to every device.

**Architecture:** A small additive backend (`db-v18`: coach `bio` + a `CoachPhotos` sheet + `setCoachProfile`) plus frontend changes in the single SuperConductor component in `index.html` (mirrored to `Pasig Greenpark Archery Camp.dc.html`). Photos are client-shrunk to ~200px JPEG avatars before upload. Testimonials ride the existing content store (no backend change).

**Tech Stack:** SuperConductor template (`{{ }}`, `<sc-if>`, `<sc-for>`), plain class-component JS (modern JS OK in index.html), browser canvas for image resize, Google Apps Script backend (ES5 only), Playwright-core for verification with stubbed `fetch`.

## Global Constraints

- **Mirror rule:** every `index.html` edit applied identically to `Pasig Greenpark Archery Camp.dc.html`; after each frontend task `diff index.html "Pasig Greenpark Archery Camp.dc.html"` prints nothing (IDENTICAL).
- **Backend ES5 only:** `var`/`function`, no arrow/`const`/`let`/template-literals, trailing-underscore privates. Three `.gs` files byte-identical: `backend/Code.gs`, `backend/Code.LATEST.gs`, new `backend/Code.v18.gs`. Apps Script can't be tested here — backend review-gated + a `backend/SETUP.md` checklist.
- **Version response:** `db-v18`, keeping EVERY prior flag (incl. `activityActor`, `reschedule`, `contentStore`) and adding `coachProfiles: true`.
- **Deploy ordering:** db-v18 deploys before the frontend is pushed; the frontend degrades gracefully on db-v17 (coaches render name/role + initials avatar; photo/bio just don't persist). Testimonials editing works without the deploy (content store).
- **Photos:** always client-shrunk to a ~200px square JPEG (`resizeImageFile`) BEFORE upload; never send the raw file. A missing photo ALWAYS yields the initials avatar (never a broken `<img>`).
- **Coach record shape** (returned by `?action=coaches`): `{ id, name, first, role, pass, bio, photo }`.
- **Verification:** Playwright-core driving the running component with `fetch` stubbed; chromium at `C:\Users\Michael Cabral\AppData\Local\ms-playwright\chromium-1228\chrome-win64\chrome.exe`; install once if missing: `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright-core --no-save`. Frontend harness `_verify_coach.mjs` (scratch; deleted in the final task). Real console errors must be 0.

---

### Task 1: Backend db-v18 — coach bio + CoachPhotos sheet + `setCoachProfile`

Additive backend so coaches carry a bio + photo. Review-gated; verified live via SETUP.md.

**Files:**
- Modify: `backend/Code.gs` (sheet registry, coach helpers, `addCoach_`/`updateCoach_`/`deleteCoach_`/`listCoaches_`, new `setCoachProfile_`, doPost route, version)
- Sync: `backend/Code.LATEST.gs` (identical), create `backend/Code.v18.gs` (identical)
- Modify: `backend/SETUP.md` (append db-v18 checklist)

**Interfaces:**
- Produces: `?action=coaches` entries gain `bio` + `photo`; new POST `setCoachProfile` `{id,bio?,photo?}`; `?action=version` = `db-v18` + `coachProfiles:true`. Tasks 2-5 rely on these.

- [ ] **Step 1: Register the `CoachPhotos` sheet.** In the sheet registry (near the `activity` entry ~line 87), add:
```js
  coachPhotos: { name: 'CoachPhotos', headers: ['Id','Photo'] }
```

- [ ] **Step 2: Photo cell helpers.** Add near `getCoaches_`/`saveCoaches_` (~line 66-72):
```js
function coachPhotoMap_() {
  var map = {};
  try {
    var sh = dbSheet_('coachPhotos');
    var data = sh.getDataRange().getValues();
    for (var r = 1; r < data.length; r++) { var id = String(data[r][0] || ''); if (id) map[id] = String(data[r][1] || ''); }
  } catch (e) {}
  return map;
}
function setCoachPhotoCell_(id, dataUrl) {
  var sh = dbSheet_('coachPhotos');
  var data = sh.getDataRange().getValues();
  var rowIndex = -1;
  for (var r = 1; r < data.length; r++) { if (String(data[r][0] || '') === String(id)) { rowIndex = r + 1; break; } }
  if (!dataUrl) { if (rowIndex > 0) sh.deleteRow(rowIndex); return; }
  if (rowIndex > 0) { sh.getRange(rowIndex, 2).setValue(dataUrl); }
  else { sh.appendRow([id, dataUrl]); }
}
```

- [ ] **Step 3: Coaches carry bio + photo on read.** In `listCoaches_`, merge photo + ensure bio. Replace its body so it returns enriched coaches:
```js
function listCoaches_() {
  var list = getCoaches_();
  var photos = coachPhotoMap_();
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var c = list[i];
    out.push({ id: c.id, name: c.name, first: c.first || '', role: c.role || '', pass: c.pass || '', bio: c.bio || '', photo: photos[c.id] || '' });
  }
  return json_({ coaches: out });
}
```

- [ ] **Step 4: `addCoach_`/`updateCoach_` persist `bio`.** Where each builds/updates the coach record, include `bio: body.bio || ''` (add coach) and, on update, set `rec.bio = (body.bio != null ? body.bio : rec.bio)`. (Locate the record-construction lines in `addCoach_`/`updateCoach_` and add the `bio` field — keep all existing fields.)

- [ ] **Step 5: `setCoachProfile_` action.** Add the function + route:
```js
function setCoachProfile_(body) {
  var id = String(body.id || ''); if (!id) return json_({ ok: false, reason: 'no id' });
  if (body.bio != null) {
    var list = getCoaches_();
    for (var i = 0; i < list.length; i++) { if (list[i].id === id) { list[i].bio = String(body.bio || ''); break; } }
    saveCoaches_(list);
  }
  if (body.photo != null) { setCoachPhotoCell_(id, String(body.photo || '')); }
  return listCoaches_();
}
```
In `doPost`, add (near the other coach routes): `if (body.action === 'setCoachProfile') return setCoachProfile_(body);`.

- [ ] **Step 6: `deleteCoach_` clears the photo.** In `deleteCoach_`, after the coach is removed from the list, call `setCoachPhotoCell_(id, '');` so a re-added id can't inherit a stale photo.

- [ ] **Step 7: Version → db-v18.** In the version response, change `version` to `'db-v18'`, keep ALL prior flags, add `coachProfiles: true`.

- [ ] **Step 8: Sync the three `.gs` files.**
```bash
cp backend/Code.gs backend/Code.LATEST.gs && cp backend/Code.gs backend/Code.v18.gs
diff backend/Code.gs backend/Code.LATEST.gs && diff backend/Code.gs backend/Code.v18.gs && echo IDENTICAL
```

- [ ] **Step 9: SETUP.md checklist.** Append "## db-v18 deploy & verify": deploy (edit existing deployment → New version → same /exec); confirm `?action=version` = `db-v18` + `coachProfiles:true` + prior flags; the `CoachPhotos` tab auto-creates on the first photo write; set a coach photo+bio in admin and confirm it shows on About and persists; remove a coach and confirm its `CoachPhotos` row is gone.

- [ ] **Step 10: ES5 scan + commit.** Confirm added lines use no `=>`/`const`/`let`/backticks. Then:
```bash
git add backend/Code.gs backend/Code.LATEST.gs backend/Code.v18.gs backend/SETUP.md
git commit -m "db-v18: coach bio + CoachPhotos sheet + setCoachProfile (listCoaches merges photo/bio)"
```

---

### Task 2: Frontend foundation — coach model carries bio/photo + shared helpers

The model + helper methods every consumer (admin, About, portal) uses. No UI yet.

**Files:**
- Modify: `index.html` — `applyCoaches` (~2553); add `coachInitials`, `coachAvatar`, `resizeImageFile`, `saveCoachProfile` methods near the coach helpers (~2545-2560); add `coachBioDrafts: {}` to initial state (~2514)
- Mirror: `Pasig Greenpark Archery Camp.dc.html`
- Test: `_verify_coach.mjs`

**Interfaces:**
- Produces: `coachList` entries carry `bio`/`photo`; `coachInitials(name)→string`; `coachAvatar(c)→{hasPhoto,photo,initials}`; `resizeImageFile(file,cb)`; `saveCoachProfile(id,patch)`. Tasks 3-5 consume these.

- [ ] **Step 1: Carry bio/photo through `applyCoaches`.** In the `.map` (~2554-2557), add the two fields:
```js
    const list = (raw || []).map(c => ({
      id: c.id, name: c.name, first: c.first || (c.name || '').split(' ')[0],
      role: c.role || 'Coach', pass: c.pass || '', bio: c.bio || '', photo: c.photo || '',
    }));
```

- [ ] **Step 2: Add the helpers.** Near the coach helpers (after `coachById`, ~2545):
```js
  coachInitials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    const a = parts[0][0] || '';
    const b = parts.length > 1 ? (parts[parts.length - 1][0] || '') : '';
    return (a + b).toUpperCase();
  }
  coachAvatar(c) {
    c = c || {};
    return { hasPhoto: !!c.photo, photo: c.photo || '', initials: this.coachInitials(c.name) };
  }
  resizeImageFile(file, cb) {
    if (!file || !/^image\//.test(file.type || '')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const S = 200;
        const canvas = document.createElement('canvas'); canvas.width = S; canvas.height = S;
        const ctx = canvas.getContext('2d');
        const min = Math.min(img.width, img.height);
        const sx = (img.width - min) / 2, sy = (img.height - min) / 2;
        ctx.drawImage(img, sx, sy, min, min, 0, 0, S, S);
        let q = 0.7, url = canvas.toDataURL('image/jpeg', q);
        while (url.length > 40000 && q > 0.4) { q -= 0.1; url = canvas.toDataURL('image/jpeg', q); }
        cb(url);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }
  saveCoachProfile(id, patch) {
    const ep = this.endpoint(); if (!ep || !id) return;
    const body = { action: 'setCoachProfile', id: id };
    if (patch.bio != null) body.bio = patch.bio;
    if (patch.photo != null) body.photo = patch.photo;
    this.setState({ coachBusy: true });
    fetch(ep, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
      .then(r => r.json()).then(res => { if (res && res.coaches) this.applyCoaches(res.coaches); this.setState({ coachBusy: false }); })
      .catch(() => this.setState({ coachBusy: false }));
  }
```

- [ ] **Step 3: Add `coachBioDrafts` to initial state.** Near `coachAuthed: false,` (~2514) or the other coach state, add: `coachBioDrafts: {},`.

- [ ] **Step 4: Mirror.** `cp` + `diff … && echo IDENTICAL`.

- [ ] **Step 5: Verify (helpers).** Create `_verify_coach.mjs`: reach the instance via the React fiber and assert:
  - `coachInitials('Michael Cabral')` === 'MC'; `coachInitials('Madonna')` === 'M'; `coachInitials('')` === '?'.
  - `coachAvatar({name:'Ana Reyes', photo:'data:image/jpeg;base64,xxx'})` → `{hasPhoto:true, photo:'data:…', initials:'AR'}`; `coachAvatar({name:'Ana Reyes'})` → `{hasPhoto:false, initials:'AR'}`.
  - `resizeImageFile`: build a File from a canvas-generated PNG (e.g. 600×400), call it, and assert the callback receives a `data:image/jpeg` string whose length is < 40000 and smaller than the source.
  - After `applyCoaches([{id:'x',name:'Ann Lee',role:'Coach',bio:'hi',photo:'data:…'}])`, `coachById('x').bio==='hi'` and `.photo` is set.
  Run `node _verify_coach.mjs`; expected PASS, 0 real console errors. Confirm mirror IDENTICAL.

- [ ] **Step 6: Commit.**
```bash
git add index.html "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Coaches T2: model carries bio/photo + coachInitials/coachAvatar/resizeImageFile/saveCoachProfile helpers"
```

---

### Task 3: Admin Coaches tab — photo upload/remove + bio

**Files:**
- Modify: `index.html` — `adminCoachCards` builder (find where it `.map`s coaches into `cc` rows) + the admin coach card markup (~2057-2081)
- Mirror: `Pasig Greenpark Archery Camp.dc.html`
- Test: `_verify_coach.mjs`

**Interfaces:**
- Consumes: `coachAvatar`, `resizeImageFile`, `saveCoachProfile`, `coachBioDrafts` (Task 2).
- Produces: each `adminCoachCards` row gains `hasPhoto`, `photo`, `initials`, `bioValue`, `setBio`, `saveBio`, `onPhotoFile`, `removePhoto`.

- [ ] **Step 1: Enrich `adminCoachCards` rows.** In the `adminCoachCards` map callback, add (using the coach object `c` for that row):
```js
        hasPhoto: !!c.photo, photo: c.photo || '', initials: this.coachInitials(c.name),
        bioValue: (this.state.coachBioDrafts[c.id] != null ? this.state.coachBioDrafts[c.id] : (c.bio || '')),
        setBio: (e) => { const v = e.target.value; this.setState(s => ({ coachBioDrafts: { ...s.coachBioDrafts, [c.id]: v } })); },
        saveBio: () => this.saveCoachProfile(c.id, { bio: (this.state.coachBioDrafts[c.id] != null ? this.state.coachBioDrafts[c.id] : (c.bio || '')) }),
        onPhotoFile: (e) => { const f = e.target.files && e.target.files[0]; if (f) this.resizeImageFile(f, (url) => this.saveCoachProfile(c.id, { photo: url })); },
        removePhoto: () => this.saveCoachProfile(c.id, { photo: '' }),
```

- [ ] **Step 2: Add the avatar + photo + bio controls to the card markup.** Inside the `<sc-for list="{{ adminCoachCards }}" as="cc">` card `<div>` (~2058), at the TOP of the card (before the `cc.notEditing` block), add the avatar + photo controls; and after the name/role display, a bio editor. Insert:
```html
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
                  <sc-if value="{{ cc.hasPhoto }}" hint-placeholder-val="{{ false }}"><img src="{{ cc.photo }}" alt="{{ cc.name }}" style="width:54px;height:54px;border-radius:50%;object-fit:cover;flex:none;" /></sc-if>
                  <sc-if value="{{ cc.noPhoto }}" hint-placeholder-val="{{ true }}"><span style="width:54px;height:54px;border-radius:50%;flex:none;background:#244232;color:#f4efe4;display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;font-family:'Hanken Grotesk',sans-serif;">{{ cc.initials }}</span></sc-if>
                  <div style="display:flex;flex-direction:column;gap:6px;">
                    <label style="background:#f4efe4;border:1px solid rgba(36,66,50,0.18);cursor:pointer;font-family:'Hanken Grotesk',sans-serif;font-size:12px;font-weight:700;color:#244232;padding:7px 12px;border-radius:999px;">Change photo<input type="file" accept="image/*" onChange="{{ cc.onPhotoFile }}" style="display:none;" /></label>
                    <sc-if value="{{ cc.hasPhoto }}" hint-placeholder-val="{{ false }}"><button onClick="{{ cc.removePhoto }}" style="background:none;border:none;cursor:pointer;color:#b4512f;font-family:'Hanken Grotesk',sans-serif;font-size:12px;font-weight:700;padding:0;text-align:left;">Remove photo</button></sc-if>
                  </div>
                </div>
                <label style="font-size:11.5px;font-weight:700;color:#244232;">Bio<textarea value="{{ cc.bioValue }}" onInput="{{ cc.setBio }}" rows="2" placeholder="A short line shown on the About page" style="display:block;width:100%;box-sizing:border-box;margin-top:3px;padding:9px 11px;border:1px solid rgba(36,66,50,0.2);border-radius:8px;font-size:13px;font-family:'Hanken Grotesk',sans-serif;resize:vertical;"></textarea></label>
                <button onClick="{{ cc.saveBio }}" style="align-self:flex-start;background:#4d7327;color:#f4efe4;border:none;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;font-size:12px;font-weight:700;padding:7px 14px;border-radius:999px;margin:8px 0 4px;">Save bio</button>
```
Add `noPhoto: !c.photo` to the row (Step 1) so the initials branch has a clean gate (`cc.hasPhoto` gates the `<img>`, `cc.noPhoto` gates the initials span).

- [ ] **Step 3: Mirror.** `cp` + `diff … && echo IDENTICAL`.

- [ ] **Step 4: Verify (admin editor).** Extend `_verify_coach.mjs`; reach the admin Coaches tab; stub `fetch` to capture POSTs and return an updated `coaches` list. Assert:
  - choosing a photo file on a coach card fires a `setCoachProfile` POST whose `photo` is a `data:image/jpeg` string < 40000 chars (and the card then shows the `<img>`);
  - typing a bio + clicking "Save bio" fires `setCoachProfile` with the typed `bio`;
  - "Remove photo" fires `setCoachProfile` with `photo:''`;
  - a coach with no photo shows the initials avatar.
  Run `node _verify_coach.mjs`; expected PASS, 0 real console errors. Mirror IDENTICAL.

- [ ] **Step 5: Commit.**
```bash
git add index.html "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Coaches T3: admin Coaches tab — photo upload/remove + bio per coach"
```

---

### Task 4: About page — "Meet your coaches" showcase

**Files:**
- Modify: `index.html` — add `aboutCoaches` to the render return; add the section markup before "What our archers say" (~line 335)
- Mirror: `Pasig Greenpark Archery Camp.dc.html`
- Test: `_verify_coach.mjs`

**Interfaces:**
- Consumes: `this.coaches()`, `coachAvatar` (Task 2). Produces: `aboutCoaches` render-return list.

- [ ] **Step 1: Build `aboutCoaches`.** In render (near other public lists like `testimonials`), add:
```js
    const aboutCoaches = this.coaches().map(c => {
      const av = this.coachAvatar(c);
      return { name: c.name, role: c.role || 'Coach', bio: c.bio || '', hasBio: !!(c.bio && String(c.bio).trim()), hasPhoto: av.hasPhoto, photo: av.photo, initials: av.initials };
    });
```
Add `aboutCoaches,` to the render return object (near `testimonials,`).

- [ ] **Step 2: Add the section markup.** Immediately BEFORE the `<section>` that holds "What our archers say" (~line 335, on the About page), insert:
```html
    <section style="padding:clamp(56px,7vw,96px) clamp(20px,5vw,64px);max-width:1320px;margin:0 auto;width:100%;">
      <div style="font-family:'Spline Sans Mono',monospace;font-size:12px;letter-spacing:0.2em;text-transform:uppercase;color:#3c6b48;margin-bottom:12px;">Your team</div>
      <h2 style="font-size:clamp(28px,4vw,44px);font-weight:800;letter-spacing:-0.02em;margin:0 0 44px;color:#1b2a1f;">Meet your coaches</h2>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:24px;">
        <sc-for list="{{ aboutCoaches }}" as="co" hint-placeholder-count="3">
          <div style="background:#fffdf6;border:1px solid rgba(36,66,50,0.1);border-radius:14px;padding:28px;display:flex;flex-direction:column;align-items:center;text-align:center;gap:14px;">
            <sc-if value="{{ co.hasPhoto }}" hint-placeholder-val="{{ false }}"><img src="{{ co.photo }}" alt="{{ co.name }}" style="width:108px;height:108px;border-radius:50%;object-fit:cover;" /></sc-if>
            <sc-if value="{{ co.noPhoto }}" hint-placeholder-val="{{ true }}"><span style="width:108px;height:108px;border-radius:50%;background:#244232;color:#f4efe4;display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:38px;font-family:'Hanken Grotesk',sans-serif;">{{ co.initials }}</span></sc-if>
            <div>
              <div style="font-size:19px;font-weight:800;color:#1b2a1f;">{{ co.name }}</div>
              <div style="font-size:13.5px;color:#3c6b48;font-family:'Spline Sans Mono',monospace;margin-top:3px;">{{ co.role }}</div>
            </div>
            <sc-if value="{{ co.hasBio }}" hint-placeholder-val="{{ false }}"><p style="font-size:14.5px;line-height:1.55;color:#46563f;margin:0;">{{ co.bio }}</p></sc-if>
          </div>
        </sc-for>
      </div>
    </section>
```
Add `noPhoto: !av.hasPhoto` to the `aboutCoaches` row (Step 1) for the initials gate.

- [ ] **Step 3: Mirror.** `cp` + `diff … && echo IDENTICAL`.

- [ ] **Step 4: Verify (About showcase).** Extend `_verify_coach.mjs`; stub `?action=coaches` to return one coach WITH photo+bio and one WITHOUT; navigate to the About page and assert: the first card renders an `<img>` with the photo + the bio text; the second renders an initials avatar and NO bio line; both show name + role. Run `node _verify_coach.mjs`; expected PASS, 0 real console errors. Mirror IDENTICAL.

- [ ] **Step 5: Commit.**
```bash
git add index.html "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Coaches T4: About page 'Meet your coaches' showcase (avatar/name/role/bio)"
```

---

### Task 5: Coach portal — self-edit own photo + bio

**Files:**
- Modify: `index.html` — render bindings for the logged-in coach profile; the portal header markup (~2283-2290)
- Mirror: `Pasig Greenpark Archery Camp.dc.html`
- Test: `_verify_coach.mjs`

**Interfaces:**
- Consumes: `coachById(this.state.coachId)`, `coachAvatar`, `resizeImageFile`, `saveCoachProfile`, `coachBioDrafts` (Task 2). Produces: render-return fields `portalHasPhoto`, `portalPhoto`, `portalInitials`, `portalBioValue`, `portalSetBio`, `portalSaveBio`, `portalOnPhotoFile`, `portalRemovePhoto`.

- [ ] **Step 1: Build the portal profile bindings.** In render, where `coachUser`/`coachFirst` are derived (~4955-4965), add (using the logged-in coach `coachUser = this.coachById(this.state.coachId)`):
```js
    const _pc = this.coachById(this.state.coachId) || {};
    const _pcAv = this.coachAvatar(_pc);
    const _pcId = _pc.id || '';
    const portalBioValue = (this.state.coachBioDrafts[_pcId] != null ? this.state.coachBioDrafts[_pcId] : (_pc.bio || ''));
```
And add to the render return object:
```js
      portalHasPhoto: _pcAv.hasPhoto, portalNoPhoto: !_pcAv.hasPhoto, portalPhoto: _pcAv.photo, portalInitials: _pcAv.initials,
      portalBioValue: portalBioValue,
      portalSetBio: (e) => { const v = e.target.value; this.setState(s => ({ coachBioDrafts: { ...s.coachBioDrafts, [_pcId]: v } })); },
      portalSaveBio: () => this.saveCoachProfile(_pcId, { bio: (this.state.coachBioDrafts[_pcId] != null ? this.state.coachBioDrafts[_pcId] : (_pc.bio || '')) }),
      portalOnPhotoFile: (e) => { const f = e.target.files && e.target.files[0]; if (f) this.resizeImageFile(f, (url) => this.saveCoachProfile(_pcId, { photo: url })); },
      portalRemovePhoto: () => this.saveCoachProfile(_pcId, { photo: '' }),
```

- [ ] **Step 2: Add the profile editor to the portal header.** In the logged-in portal header block (inside `<sc-if value="{{ coachAuthed }}">`, near the `Hi {{ coachFirst }}` heading ~2286), add an avatar + change-photo + bio editor. Insert after the heading `<div>` (before the Sign-out button or below the intro `<p>`):
```html
        <div style="display:flex;align-items:center;gap:16px;margin:8px 0 20px;flex-wrap:wrap;">
          <sc-if value="{{ portalHasPhoto }}" hint-placeholder-val="{{ false }}"><img src="{{ portalPhoto }}" alt="You" style="width:72px;height:72px;border-radius:50%;object-fit:cover;flex:none;" /></sc-if>
          <sc-if value="{{ portalNoPhoto }}" hint-placeholder-val="{{ true }}"><span style="width:72px;height:72px;border-radius:50%;flex:none;background:#244232;color:#f4efe4;display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:24px;font-family:'Hanken Grotesk',sans-serif;">{{ portalInitials }}</span></sc-if>
          <div style="display:flex;flex-direction:column;gap:6px;">
            <label style="background:#fffdf6;border:1px solid rgba(36,66,50,0.18);cursor:pointer;font-family:'Hanken Grotesk',sans-serif;font-size:12.5px;font-weight:700;color:#244232;padding:8px 14px;border-radius:999px;align-self:flex-start;">Change photo<input type="file" accept="image/*" onChange="{{ portalOnPhotoFile }}" style="display:none;" /></label>
            <sc-if value="{{ portalHasPhoto }}" hint-placeholder-val="{{ false }}"><button onClick="{{ portalRemovePhoto }}" style="background:none;border:none;cursor:pointer;color:#b4512f;font-family:'Hanken Grotesk',sans-serif;font-size:12px;font-weight:700;padding:0;text-align:left;">Remove photo</button></sc-if>
          </div>
        </div>
        <div style="max-width:60em;margin:0 0 24px;">
          <label style="font-size:12px;font-weight:700;color:#244232;">Your bio (shown on the About page)<textarea value="{{ portalBioValue }}" onInput="{{ portalSetBio }}" rows="2" style="display:block;width:100%;box-sizing:border-box;margin-top:4px;padding:10px 12px;border:1px solid rgba(36,66,50,0.2);border-radius:8px;font-size:14px;font-family:'Hanken Grotesk',sans-serif;resize:vertical;"></textarea></label>
          <button onClick="{{ portalSaveBio }}" style="margin-top:8px;background:#4d7327;color:#f4efe4;border:none;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;font-size:13px;font-weight:700;padding:8px 16px;border-radius:999px;">Save bio</button>
        </div>
```

- [ ] **Step 3: Mirror.** `cp` + `diff … && echo IDENTICAL`.

- [ ] **Step 4: Verify (portal self-edit).** Extend `_verify_coach.mjs`; sign a coach into the portal (set `coachAuthed:true, coachId:'<id>'` and stub the roster); assert the portal shows that coach's avatar/initials; choosing a photo fires `setCoachProfile` with THAT coach's id + a shrunken photo; saving a bio fires `setCoachProfile` with that id + the bio; there is NO name/role/passcode editor in the portal. Run `node _verify_coach.mjs`; expected PASS, 0 real console errors. Mirror IDENTICAL.

- [ ] **Step 5: Commit.**
```bash
git add index.html "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Coaches T5: coach portal self-edit (own photo + bio)"
```

---

### Task 6: Editable testimonials (content store) + final cleanup

**Files:**
- Modify: `index.html` — `mergedContent` (~2707); the `cm = this.mergedContent({...})` defaults (~3942); the `const testimonials = [...]` (~3960); add a Testimonials editor to the Pricing tab markup + its builder
- Mirror: `Pasig Greenpark Archery Camp.dc.html`
- Test: `_verify_coach.mjs`

**Interfaces:**
- Consumes: `saveCM`/`persistContent` + content store (existing). Produces: `cm.testimonials`; render-return `testimonialEdits` + `addTestimonial`.

- [ ] **Step 1: Content model gains `testimonials`.** In `mergedContent` (~2709 return object) add:
```js
      testimonials: c.testimonials || defaults.testimonials,
```
In the `cm = this.mergedContent({...})` call (~3942), add to the defaults object:
```js
      testimonials: [
        { quote: 'My two kids beg to come back every weekend. The coaches make it safe and genuinely fun.', name: 'Liza M.', role: 'parent' },
        { quote: "Walked in never having held a bow. Six weeks later I'm hooked and hitting golds.", name: 'Daniel R.', role: 'adult beginner' },
        { quote: 'Cleanest, friendliest range in the metro. The Greenpark setting is unbeatable.', name: 'Coach Pia', role: 'visiting club' },
      ],
```

- [ ] **Step 2: Public cards read the content list.** Replace the hardcoded `const testimonials = [ ... ];` (~3960) with:
```js
    const testimonials = (cm.testimonials || []).map(t => ({ quote: t.quote, name: t.name, role: t.role }));
```
(The public `<sc-for list="{{ testimonials }}">` markup is unchanged.)

- [ ] **Step 3: Admin Testimonials editor builder.** In the admin render section (near `pkgEdits`/`saveCM`), add:
```js
    const setTestimonial = (i, key) => (e) => { const v = e.target.value; const ts = cm.testimonials.map((t, idx) => idx === i ? { ...t, [key]: v } : t); saveCM({ testimonials: ts }); };
    const removeTestimonial = (i) => () => saveCM({ testimonials: cm.testimonials.filter((_, idx) => idx !== i) });
    const addTestimonial = () => saveCM({ testimonials: cm.testimonials.concat([{ quote: 'New testimonial', name: 'Name', role: 'role' }]) });
    const testimonialEdits = cm.testimonials.map((t, i) => ({
      quote: t.quote, name: t.name, role: t.role,
      setQuote: setTestimonial(i, 'quote'), setName: setTestimonial(i, 'name'), setRole: setTestimonial(i, 'role'), remove: removeTestimonial(i),
    }));
```
Add `testimonialEdits,` and `addTestimonial,` to the render return.

- [ ] **Step 4: Admin Testimonials editor markup.** In the Pricing tab (`<sc-if value="{{ tabPricing }}">`), after the packages/rates blocks and before the "Reset all content" button, add:
```html
          <div style="margin-top:26px;">
            <div style="font-size:15px;font-weight:800;color:#1b2a1f;margin-bottom:4px;">Testimonials</div>
            <p style="font-size:13px;color:#56664f;margin:0 0 12px;">The "What our archers say" cards on your home page.</p>
            <div style="display:flex;flex-direction:column;gap:12px;">
              <sc-for list="{{ testimonialEdits }}" as="tm" hint-placeholder-count="3">
                <div style="background:#fffdf6;border:1px solid rgba(36,66,50,0.12);border-radius:12px;padding:16px 18px;display:flex;flex-direction:column;gap:8px;">
                  <textarea value="{{ tm.quote }}" onInput="{{ tm.setQuote }}" rows="2" placeholder="Quote" style="background:#f4efe4;border:1px solid rgba(36,66,50,0.16);border-radius:8px;padding:10px 12px;font-family:'Hanken Grotesk',sans-serif;font-size:13.5px;color:#1b2a1f;outline:none;resize:vertical;"></textarea>
                  <div style="display:flex;gap:8px;flex-wrap:wrap;">
                    <input value="{{ tm.name }}" onInput="{{ tm.setName }}" placeholder="Name" style="flex:1;min-width:120px;background:#f4efe4;border:1px solid rgba(36,66,50,0.16);border-radius:8px;padding:9px 11px;font-family:'Hanken Grotesk',sans-serif;font-size:13.5px;color:#1b2a1f;outline:none;" />
                    <input value="{{ tm.role }}" onInput="{{ tm.setRole }}" placeholder="Role (e.g. parent)" style="flex:1;min-width:120px;background:#f4efe4;border:1px solid rgba(36,66,50,0.16);border-radius:8px;padding:9px 11px;font-family:'Hanken Grotesk',sans-serif;font-size:13.5px;color:#56664f;outline:none;" />
                    <button onClick="{{ tm.remove }}" style="background:none;border:1px solid rgba(180,81,47,0.4);cursor:pointer;font-family:'Hanken Grotesk',sans-serif;font-size:12px;font-weight:700;color:#b4512f;padding:8px 14px;border-radius:999px;">Remove</button>
                  </div>
                </div>
              </sc-for>
            </div>
            <button onClick="{{ addTestimonial }}" style="margin-top:12px;background:#244232;border:none;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;font-size:13px;font-weight:700;color:#f4efe4;padding:10px 18px;border-radius:999px;">+ Add testimonial</button>
          </div>
```

- [ ] **Step 5: Mirror.** `cp` + `diff … && echo IDENTICAL`.

- [ ] **Step 6: Verify (testimonials) + full run.** Extend `_verify_coach.mjs`:
  - stub `?action=content` to return a custom `testimonials` list → the public "What our archers say" cards render it;
  - in the admin Pricing tab, edit a testimonial's quote and click "+ Add testimonial" → a `setContent` POST fires whose `testimonials` reflects the edit + the new entry; "Remove" fires `setContent` without that entry.
  Then run the WHOLE `_verify_coach.mjs` (Tasks 2-6 green). Confirm mirror IDENTICAL. Delete scratch:
```bash
rm -f _verify_coach.mjs _coach*.png
rm -rf node_modules package.json package-lock.json
git status --short
```
(Working tree should show only the two HTML files, plus possibly pre-existing `.claude/settings.local.json` — do NOT commit that.)

- [ ] **Step 7: Commit.**
```bash
git add index.html "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Coaches T6: editable testimonials (content store) + admin Testimonials editor"
```

---

## Self-review notes

- **Spec coverage:** db-v18 coach bio + CoachPhotos + setCoachProfile (T1); model + resize/avatar/initials/saveCoachProfile helpers (T2); admin photo/bio editor (T3); About "Meet your coaches" (T4); portal self-edit (T5); testimonials content-store + editor (T6). All spec sections map to a task.
- **Deploy ordering:** T1 backend deploys first (db-v18); frontend (T2-T6) merges but pushes after deploy; degrades on db-v17 (initials avatars, no persisted photo/bio). Testimonials (T6) needs no deploy.
- **Fallbacks:** missing photo → initials avatar everywhere (`hasPhoto`/`noPhoto` gates in T3/T4/T5); missing bio → bio line hidden (`hasBio`). `resizeImageFile` always shrinks (caps the dataURL < 40000 chars) before upload.
- **Type/name consistency:** `coachInitials`/`coachAvatar`/`resizeImageFile`/`saveCoachProfile` defined in T2 and consumed in T3/T4/T5; coach record `{id,name,first,role,pass,bio,photo}` produced by T1 backend + T2 `applyCoaches`; `coachBioDrafts` keyed by coach id, written in T3 (admin) and T5 (portal); `cm.testimonials` produced in T6 Step 1 and consumed in T6 Step 2/3.
- **Mirror discipline:** every frontend task ends with `cp` + `diff … && echo IDENTICAL`; the three `.gs` files byte-identical (T1 Step 8); scratch removed in T6 Step 6.
