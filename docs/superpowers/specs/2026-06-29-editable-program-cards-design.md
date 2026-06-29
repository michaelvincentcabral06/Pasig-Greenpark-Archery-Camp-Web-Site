# Editable Program marketing cards

**Date:** 2026-06-29
**Scope:** Frontend only (`index.html` + `.dc.html` mirror). No backend; fields ride `CONTENT`.

## Goal

Make the Program marketing cards editable from the admin **Pricing → Programs** editor (like the Pass
cards already are), instead of being hard-coded HTML. Two card sets are affected:

- **Home page** "Programs for every age" — 3 featured cards: photo, title, age badge, short description.
- **Programs page** — a card per program: SVG icon, title, age badge + **duration** badge ("45 min"),
  longer description, "Book this →".

**Overriding constraint (owner): retain the existing visual design as closely as possible.** This is a
data-binding change, not a redesign — same layout, fonts, spacing, badges, the existing SVG icons, and
the Home photos. The default render must look **identical** to today until the owner edits something.

## Confirmed decisions

- **Icon:** a **preset icon picker** — admin picks from the existing hand-drawn SVGs (no SVG editing,
  no look change). Programs-page cards keep the icon style; Home cards keep their photos.
- **Home featured:** a per-program **"Show on Home"** toggle controls which programs appear in the Home
  grid (defaults to today's three).
- **Card format:** unchanged — icon/photo, title, age, duration, description paragraph, Book button.
  No ✓ features checklist (that's a Pass-card thing).
- **Descriptions:** **two fields** kept exact — short **`homeDesc`** (Home card) + longer **`blurb`**
  (Programs card), seeded to today's exact sentences.
- **Image:** a **path/URL text field** (e.g. `assets/coaching-o.jpg` or a full URL). No file upload
  (the site has none).

## Current state (baseline)

- Home cards: hard-coded at ≈`index.html:137-166` (3 cards, each `<img src="assets/…jpg">` + title +
  age badge + short `<p>`).
- Programs-page cards: hard-coded at ≈`index.html:397-470+` (per program: 64×64 icon box with an inline
  `<svg>`, title `<h3>`, age badge, duration badge, `<p>`, "Book this →" button bound to per-program
  handlers `bookLittle`/`bookYouth`/`bookAdult`/…).
- Program data (`defaultPrograms` ≈`index.html:3989`, `normalizePrograms` ≈`index.html:3810`) has
  `name, price, needsCoach, multiDay, offerDiscounts, groupDiscount, minAge, maxAge, blurb, addons,
  coachFee, rangeFee, equipFee` — but **no** `duration`, `icon`, `image`, `homeDesc`, `showOnHome`.

## Design

### 1. Data model

`normalizePrograms` + `defaultPrograms` gain:
- `duration` (string, e.g. `'45 min'`; `''` → no duration badge),
- `icon` (preset key string; default `'target'`),
- `image` (string path/URL for the Home photo; `''` → omit/placeholder),
- `homeDesc` (string short description for the Home card),
- `badge` (string age/tag pill text shown on BOTH cards),
- `showOnHome` (bool; default `false`).
`blurb` stays the Programs-card description.

**Why `badge` is an editable field, not derived:** the current pills are *not* purely a function of
`minAge`/`maxAge` — age-bounded programs show "Ages 6–10" / "Ages 11–17" / "Ages 18+", but the others
show custom text ("All levels" for Open Range, "All ages" for Private Coaching, "Teams" for Group &
Corporate). So `badge` is editable text seeded to today's exact pill; when blank it falls back to a
derived label (`minAge&maxAge → 'Ages X–Y'`; `minAge only → 'Ages X+'`; neither → `'All levels'`).
`minAge`/`maxAge` still drive booking age-gating independently.

**No-regression per-name defaults:** mirror `normalizePackages` — when a card field is missing, fall
back to a default keyed by program **name** from `defaultPrograms`. `defaultPrograms` is seeded to the
CURRENT card content exactly (e.g. *Little Archers (6–10)* → `duration:'45 min'`, `icon:'arrow'`,
`image:'assets/arrows-target-o.jpg'`, `homeDesc:'Playful first steps with the bow: safety, stance, and
the joy of hitting the target.'`, `blurb:'Playful first steps with the bow — safety, stance, and the
thrill of a target struck. Built for short attention spans and big smiles.'`, `showOnHome:true`). The
three current Home programs (Little Archers, Adult Beginners, Open Range) get `showOnHome:true`; the
rest `false`. Unknown/new programs get generic defaults (no duration, `'target'` icon, no image,
`showOnHome:false`).

### 2. Preset icons

Define a named SVG set reusing the existing card drawings: `arrow` (Little Archers), `youth`
(Youth Squad 3-circles), `bow` (Adult Beginners), `target` (Open Range), plus the icons currently used
for Private Coaching and Group & Corporate (named e.g. `coach`, `group`). A helper `programIconKeys()`
lists them. Because the template engine escapes `{{ }}` text, the card renders the selected icon via a
short `<sc-if>` chain (one branch per preset key, e.g. `iconArrow`/`iconYouth`/…) holding the inline
`<svg>` — the same SVGs as today.

### 3. Admin editor (Pricing → Programs)

Add to each program's editor row (`programEdits` + markup ≈`index.html:2408`):
- **Duration** text input (`setProgField(i,'duration')`),
- **Image path** text input (`setProgField(i,'image')`),
- **Home description** text input (`setProgField(i,'homeDesc')`),
- **Icon** cycle-chip over `programIconKeys()` (`toggleProgIcon(i)` → next key),
- **Show on Home** toggle (`toggleProg(i,'showOnHome')`).
Alongside the existing name/price/age/fees/blurb fields. Match the existing editor styling.

### 4. Data-driven cards

Build two arrays in `renderVals` from `programList()`:
- `programCards` — every program: `{ name, title (name with a trailing "(…)" stripped), badge,
  duration, hasDuration, blurb, icon flags (iconArrow/…), book: () => bookProgram(name) }`.
- `homeProgramCards` — programs with `showOnHome`: `{ title, badge, homeDesc, image, hasImage }`.

`badge` = the program's `badge` field, else the derived label (`minAge&maxAge → 'Ages X–Y'`;
`minAge only → 'Ages X+'`; neither → `'All levels'`). `bookProgram(name)` = `this.go('book', name)`
(generalizes the existing `bookLittle`/etc.). Editor also gets a **Badge** text input.

Replace the hard-coded Home 3-card block with `<sc-for list="{{ homeProgramCards }}">` and the
hard-coded Programs-page block with `<sc-for list="{{ programCards }}">`, reusing the **existing card
markup verbatim** with bindings swapped in (title, age, duration `sc-if`, description, image/icon,
Book button). Remove the now-dead per-program `bookLittle`/`bookYouth`/`bookAdult` bindings if unused
elsewhere (keep any still referenced).

### 5. Deploy

Frontend-only: edit `index.html`, copy byte-for-byte to `Pasig Greenpark Archery Camp.dc.html`, push
`main`. No Apps Script redeploy.

## Implementation plans

1. **P1 — data model + preset icons:** `normalizePrograms`/`defaultPrograms` new fields + per-name
   defaults; `programIconKeys()` + the named SVG set.
2. **P2 — admin editor:** Duration / Image / Home-description inputs, Icon cycle-chip, Show-on-Home
   toggle in the Programs editor.
3. **P3 — data-driven cards:** `programCards` + `homeProgramCards` reducers; convert both hard-coded
   card blocks to `<sc-for>` loops preserving the exact markup; `bookProgram` generic handler.
