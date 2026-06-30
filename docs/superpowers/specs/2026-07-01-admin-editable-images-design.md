# Admin-editable site images — design

**Date:** 2026-07-01
**Status:** Approved (design); spec under review
**Backend version target:** db-v37 (flag `siteImages`)

## Goal

Let the admin replace the site's prominent photos by **uploading their own files** from the
admin panel — no code edits, no needing the file to already exist as an asset. Today only coach
photos support true upload; program images are a text-path field; hero/section photos are
hardcoded.

## Scope

**In scope — three "true upload" slots:**
1. **Home hero photo** — `index.html:91`, currently `assets/arrows-target-o.jpg` (full-bleed,
   sits under a near-opaque green gradient).
2. **About portrait photo** — `index.html:571`, currently `assets/coaching-o.jpg` (4:5, the one
   cleanly-visible photo on the site).
3. **Program card images** — the home program cards (`index.html:170`, bound to `hp.image` from
   `homeProgramRows`/`programList`, `index.html:~4054`). Upgrade the existing admin path field
   (`index.html:2436`) from path-only to **path *or* upload**, per program.

**Out of scope (unchanged):** the faint texture bands on Programs/About/Contact/Book/Why-Greenpark
(barely visible behind the green — low value to edit); coach photos (already uploadable); the logo.

## Storage design

Reuse the proven coach-photo mechanism: resize + compress the file to a base64 JPEG **in the
browser**, send to the backend, store it. Decisions:

- **One backend key per image**, NOT inside CONTENT: `img:hero`, `img:about`, `img:prog:<programName>`.
  Keeps CONTENT lean (content saves don't ship image blobs) and lets image saves be independent.
  Stored as individual Script Properties (same store coach photos use).
- **The constraint:** the Apps Script Script-Properties store is capped at ~500KB total (shared by
  CONTENT, coach photos `COACHES_PROP_KEY`, `plan:*`, alias keys, etc.). Two safeguards:
  - **Per-slot compression caps** enforced client-side in `resizeImageFile` (chosen so the realistic
    set — hero + about + ~6 home programs — fits the budget below):
    - hero: max width 1100px, cap ~48KB base64 (heavy gradient hides compression artifacts)
    - about portrait: 4:5, ~560×700, cap ~48KB
    - program card: 4:3, ~560×420, cap ~24KB each
    (Cap = step JPEG quality down until `dataURL.length` ≤ the per-slot limit, mirroring the
    existing `while (url.length > 46000 …)` loop.)
  - **Budget math.** Total store ≈ 500KB, shared. Worst-case reservations: coach photos
    `COACHES_PROP_KEY` ≤ ~138KB (3 × 46KB), CONTENT ~40KB, runtime (`plan:*`/alias/booking keys)
    ~70KB → ~248KB reserved. That leaves **~250KB for the `img:*` namespace**. The realistic set
    (48 + 48 + 6×24 = 240KB) fits; a very photo-heavy config sits near the line, which is exactly
    what the guard is for.
  - **Backend budget guard** in `setImage_`: before writing, sum the byte length of all existing
    `img:*` properties (excluding the key being replaced) + the incoming blob; if it would exceed
    **250KB** for the `img:*` namespace, reject with `{ ok:false, reason:'storage-full' }`. The
    admin UI shows a friendly "storage almost full — remove a photo or use a smaller one" message.
    Defense-in-depth so an upload never silently corrupts/half-writes.
- **Upgrade path (documented, not built):** if the curated set ever outgrows the budget, move blobs
  to Google Drive hosting (store a URL instead of base64). No UI rework required.

## Backend changes (`backend/Code.gs`)

- **`getImages_()`** — public (no auth), mirrors `getContent_`. Returns
  `{ hero, about, programs: { "<name>": dataURL, … } }`, reading the `img:*` properties. Omits
  unset slots. Wired into `doGet` as `action === 'images'`.
- **`setImage_(body)`** — admin-only (`assertAdmin_`). Body: `{ slot, data }` where `slot` is
  `'hero'` | `'about'` | `'prog:<name>'` and `data` is a base64 dataURL (or `''`/null to reset →
  `deleteProperty`). Runs the budget guard; on pass, `setProperty('img:'+slot, data)`; returns
  `{ ok:true }` or `{ ok:false, reason }`. Wired into `doPost`.
- **Budget guard helper** `imgBudgetOk_(incomingLen, replacingKey)` — sums existing `img:*` value
  lengths (excluding the key being replaced) + `incomingLen`; returns whether ≤ 430KB.
- **Version bump** to `db-v37`, add `siteImages: true` to the `?action=version` flags.

## Frontend changes (`index.html`)

1. **`resizeImageFile(file, cb, opts)`** (`index.html:3024`) — add an `opts` param
   `{ w, h, maxLen }`; default to the current `400×500 / 46000` so the existing coach call is
   unchanged. Add named presets used by the new slots (hero/about/program dimensions + caps above).
2. **Public bindings (fall back to current defaults so the site is unchanged when nothing is set):**
   - Hero `<img src>` (`:91`) → `{{ heroImg }}` where `heroImg = state.images.hero || 'assets/arrows-target-o.jpg'`.
   - About portrait `<img src>` (`:571`) → `{{ aboutImg }}` (`|| 'assets/coaching-o.jpg'`).
   - Program card image: in `homeProgramRows` the resolved image becomes
     `img = images.programs[p.name] || p.image || ''` (uploaded wins, then the typed path), and
     `hasImage` is recomputed as `!!(img && String(img).trim())` so an uploaded image lights up the
     `<sc-if hp.hasImage>` even when no path was typed.
3. **Load path:** fetch `?action=images` on init (alongside the existing content/coaches loads),
   store in `state.images`, cache in `localStorage` (same pattern as coaches) for instant paint.
4. **Admin UI** — new "Photos" group in the Pricing tab:
   - Hero + About: a thumbnail of the current image, an **Upload** button
     (`<input type=file>` → `resizeImageFile` with the slot preset → `setImage`), and **Reset to
     default** (sends `data:''`).
   - Program rows: keep the path `<input>`, add an **Upload** button beside it (writes
     `prog:<name>`). Uploaded image visibly overrides the path.
   - Handlers mirror the coach pattern (`onPhotoFile` at `index.html:6054`): on success, update
     `state.images` so the admin preview and the public view refresh immediately.

## Data flow

```
Admin picks file → resizeImageFile(preset) → base64 dataURL
   → adminPost{ action:'setImage', slot, data }
   → backend budget guard → setProperty('img:'+slot, data) → { ok:true }
   → frontend updates state.images[slot] → <img> re-renders

Public load → GET ?action=images → state.images → each <img src> = images[slot] || default
```

## Error handling

- File not an image / read error → `resizeImageFile` no-ops (existing guard).
- Compressed blob still over cap after min quality → show "couldn't compress this photo small
  enough — try a smaller/simpler image."
- Budget guard reject (`storage-full`) → friendly inline message; no write performed.
- Backend unreachable → public site falls back to default asset paths (no broken images); admin
  shows the existing network-error handling.

## Verification

1. Admin-upload each slot (hero, About portrait, ≥1 program) → confirm it renders live on the
   public pages.
2. **Reset to default** on each → reverts to the shipped photo.
3. Oversized/huge file → compresses under cap, or guard message fires; store not corrupted.
4. With nothing uploaded, every page looks identical to today (defaults).
5. `.dc.html` mirror byte-identical; `?action=version` → `db-v37`, `siteImages:true`.
6. Reduced-motion / contrast unaffected (no motion or color changes).

## Deploy notes

- Frontend: commit + push + mirror `.dc.html` as usual.
- Backend: manual redeploy to db-v37 (paste → Save → Deploy → Manage deployments → edit existing →
  New version), then verify `?action=version`. No new OAuth scope (Properties only).
