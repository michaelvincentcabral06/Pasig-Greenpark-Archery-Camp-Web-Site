# Editable coaches + testimonials (sub-project G)

**Date:** 2026-06-25
**Goal:** Give each coach an editable **photo** + **bio**, surface the roster publicly on the
About page and in the Coach portal, let coaches self-edit their photo/bio, and make the
"What our archers say" **testimonials** admin-editable — all synced to every device.

## Problems today
- The coach record is `{ id, name, first, role, pass }` — **no photo, no bio**. Admin can edit
  only name/role/passcode (Coaches tab). The About page has **no coach showcase** at all (just a
  "3 certified coaches" stat). The Coach portal shows a coach their schedule but not a profile.
- **Testimonials** are a hardcoded array in render (`What our archers say`) — not editable.

## Decisions (from brainstorming)
- **Photos:** admin/coach picks a file → browser shrinks + center-crops to a ~200px square JPEG
  → stored server-side. No external hosting/links. No-photo → a **circular initials avatar**.
- **Storage:** coach `bio` rides in the existing coach record (small text); **photos live in a
  new `CoachPhotos` sheet** (one row per coach) because the coach Script Property caps at ~9KB
  and a sheet cell holds ~50KB — room for a ~200px avatar.
- **Coach portal self-edit:** a logged-in coach can change **their own photo + bio**; name /
  role / passcode stay admin-only.
- **About page:** new **"Meet your coaches"** section (avatar, name, role, bio) before the
  testimonials, reading the live roster.
- **Testimonials:** move into the existing **content store** (no backend change), admin-editable
  add/edit/remove, public cards read from it.
- **Deploy ordering:** db-v18 deploys before the frontend is pushed; the frontend degrades
  gracefully on db-v17 (coaches show name/role + initials avatar; bio/photo just don't persist).

## Constraints
- Mirror rule: every `index.html` edit applied identically to
  `Pasig Greenpark Archery Camp.dc.html` (byte-identical).
- Backend ES5 only (`var`/`function`, no arrow/`const`/`let`/template-literals,
  trailing-underscore privates). Three `.gs` files byte-identical: `backend/Code.gs`,
  `backend/Code.LATEST.gs`, new `backend/Code.v18.gs`. Apps Script can't be tested here —
  backend review-gated + a `backend/SETUP.md` checklist. Frontend Playwright-verified (stubbed).

## Backend — db-v18 (`backend/Code.gs` + identical `Code.LATEST.gs`/new `Code.v18.gs`)
Coaches are stored as one Script Property `COACHES_JSON` (array). Photos get a new sheet.
1. **Coach record gains `bio`.** `addCoach_`/`updateCoach_` accept and persist `body.bio` (default
   `''`). `getCoaches_` records carry `bio`.
2. **`CoachPhotos` sheet** — schema `{ name:'CoachPhotos', headers:['Id','Photo'] }` (added to the
   sheet registry like the other tabs). Helpers:
   - `getCoachPhoto_(id)` → the `Photo` cell for that id, or `''`.
   - `setCoachPhotoCell_(id, dataUrl)` → upsert the row (replace if `id` exists, append if not);
     `dataUrl === ''` deletes the row.
   - `coachPhotoMap_()` → `{ id: dataUrl }` for all rows (one read).
3. **`setCoachProfile_(body)`** (new action) — `{ id, bio?, photo? }`:
   - if `'bio' in body`, update that coach's `bio` in `COACHES_JSON`;
   - if `'photo' in body`, `setCoachPhotoCell_(id, body.photo)` (`''` removes);
   - return `json_({ ok:true, coaches: <list with photo+bio merged> })`.
   (Unauthenticated, consistent with every other POST here; the admin UI is client-gated and the
   portal is passcode-gated — a pre-existing limitation, noted not fixed.)
4. **`listCoaches_`** merges photo + bio into each returned coach:
   `{ id, name, first, role, pass, bio, photo }` (photo from `coachPhotoMap_()`, bio from the
   record). Route the new action in `doPost`: `if (body.action === 'setCoachProfile') return setCoachProfile_(body);`.
5. **`deleteCoach_`** also clears the coach's photo row (`setCoachPhotoCell_(id, '')`).
6. **Version** → `db-v18`, keep every prior flag (incl. `activityActor`), add `coachProfiles: true`.
7. Sync the three `.gs` files byte-identical; append a "db-v18 deploy & verify" checklist to
   `backend/SETUP.md` (note the `CoachPhotos` tab auto-creates on first write).

## Frontend — `index.html` + mirror

### A. Coach model carries bio + photo
`applyCoaches` (~2553) maps `bio: c.bio || ''` and `photo: c.photo || ''` onto each coach (kept in
`coachList` + localStorage). `coachById`/`coaches()` unchanged otherwise.

### B. Shared avatar + image helpers
- `coachInitials(name)` → up to two uppercase initials (e.g. "Michael Cabral" → "MC").
- `resizeImageFile(file, cb)` — load the file into an `Image`, draw center-cropped onto a 200×200
  canvas, `cb(canvas.toDataURL('image/jpeg', 0.7))`. Reused by admin + portal. (Guard: only
  `image/*` files; if the result is improbably large, recompress at q0.5 — keep well under the
  sheet cell limit.)
- `saveCoachProfile(id, patch)` — POST `setCoachProfile` with `{ id, ...patch }` (patch may carry
  `bio` and/or `photo`), then `applyCoaches(res.coaches)`.
- An **avatar render helper** producing, per coach: either an `<img>` (when `photo`) or an
  initials circle. Encapsulated as row fields (`hasPhoto`, `photo`, `initials`) so the markup is
  declarative; the same fields feed About, admin, and portal.

### C. Admin Coaches tab (`adminCoachCards` ~2057)
Each coach card gains: an avatar preview, a **photo `<input type=file>`** ("Change photo" →
`resizeImageFile` → `saveCoachProfile(id,{photo})`), a **Remove photo** button
(`saveCoachProfile(id,{photo:''})`), and a **bio** `<textarea>` with an explicit **Save bio**
button → `saveCoachProfile(id,{bio})`. Existing name/role/pass editing (via
`saveEditCoach`/`updateCoach`) is unchanged.

### D. About page — "Meet your coaches"
A new section (placed before the "What our archers say" block, ~line 335) with a heading
**"Meet your coaches"** and an `<sc-for>` over a new `aboutCoaches` row list (built from
`this.coaches()`): each card shows the avatar (photo or initials), `name`, `role`, and `bio`
(bio line hidden when empty). Reads the live roster so admin/coach edits appear publicly.

### E. Coach portal self-edit
In the logged-in portal header (~2285, where `coachRole` shows), add the coach's avatar + name +
role and a **profile editor for their own record**: a "Change photo" file input
(`resizeImageFile` → `saveCoachProfile(loggedInCoachId,{photo})`), a "Remove photo" button, and an
editable **bio** textarea with Save (`saveCoachProfile(loggedInCoachId,{bio})`). The logged-in
coach id is the one matched at portal sign-in (the `pass`-matched coach). Name/role/passcode are
NOT editable here.

### F. Editable testimonials (content store, no backend change)
1. **Content model gains `testimonials`** (`mergedContent` ~ defaults, and the `cm = this.mergedContent({...})`
   call defaults): `testimonials: c.testimonials || defaults.testimonials`, default = the current
   three `{ quote, name, role }`. Move the hardcoded `const testimonials = [...]` (~3960) to read
   `cm.testimonials` mapped for the public cards.
2. **Public "What our archers say"** (`<sc-for list="{{ testimonials }}">` ~337) now renders the
   content-backed list (unchanged markup).
3. **Admin Testimonials editor** — a section in the Pricing tab (alongside packages), mirroring
   the schedule/bullets add-remove pattern: a list of rows (quote `<textarea>`, name + role
   inputs) each with a **Remove**, plus **+ Add testimonial**, all via `saveCM({ testimonials: [...] })`.
   Syncs through the existing content store to every device.

## Out of scope
- Dashboard pagination (sub-project I); the deferred cosmetic-polish items.
- Full-resolution coach photos (avatars are the chosen tradeoff); photo cropping UI beyond
  center-crop; per-coach galleries.
- Backend auth for coach/testimonial writes (pre-existing limitation, consistent with all POSTs).

## Risks / watch-items
- **Payload size:** the coaches GET now includes base64 photos (~15-25KB each × a few coaches ≈
  ~100KB) on each public load. Acceptable one-time cost; keep avatars ~200px / q0.7 so a cell
  stays well under the 50KB limit. The resize helper must always shrink before upload (never send
  the raw file).
- **Graceful degradation:** on db-v17 (pre-deploy) `setCoachProfile` is an unknown action →
  the write no-ops, photo/bio don't persist, and coaches render with name/role + initials avatar.
  No breakage. Testimonials editing (content store) works without the deploy.
- **Fallback everywhere:** a missing photo must always yield the initials avatar (never a broken
  `<img>`); a missing bio hides the bio line; an empty roster still renders the section heading
  gracefully (or hides it).
- **Backend ES5**, three `.gs` byte-identical; `index.html` ≡ `.dc.html` mirror.
- `deleteCoach` must clear the photo row so a re-added id can't inherit a stale photo.

## Verification
- **Frontend (Playwright, stubbed backend):**
  - Stub `?action=coaches` to return coaches with a `photo` dataURL + `bio` for one and none for
    another → About "Meet your coaches" shows the photo avatar + bio for the first and an initials
    avatar (no bio line) for the second.
  - Admin Coaches tab: choosing a photo file fires a `setCoachProfile` POST whose `photo` is a
    shrunken `data:image/jpeg` dataURL (much smaller than the original); editing a bio fires
    `setCoachProfile` with the new `bio`; "Remove photo" sends `photo:''`.
  - Coach portal (logged in): the coach sees their avatar/name/role; changing photo / saving bio
    fires `setCoachProfile` for THEIR id only; name/role/pass not editable there.
  - Testimonials: stub `?action=content` with a custom `testimonials` list → the public cards show
    it; in admin, add/edit/remove a testimonial → a `setContent` POST fires with the new list and
    the public cards update. Mirror parity IDENTICAL.
- **Backend (cannot run here): `backend/SETUP.md` db-v18 checklist** — deploy db-v18, confirm
  `?action=version` = `db-v18` with `coachProfiles:true` (+ all prior flags); on the live site set a
  coach photo + bio in admin, confirm it appears on About and persists across devices; have a coach
  set their own photo in the portal; remove a coach and confirm its photo row is cleared.
