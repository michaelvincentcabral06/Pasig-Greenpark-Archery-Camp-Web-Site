# Editable Concession Discounts (Dynamic Programs Phase 2) — Design

## Summary

Make the concession **discounts** admin-editable. Today they are three hardcoded options — Pasig City resident, PAC member, Greenpark/RHS student, ₱100 off each, stackable, each with a proof field — shown on any program where `offerDiscounts` is on (Phase 1). After this change the admin defines the discount list (name, amount, whether proof is required, proof label) in the **Pricing** admin tab, stored in site content like `programs`/`packages`. The booking form renders the discount checkboxes + proof inputs from that list, and pricing computes from it.

Unlike Phase 1 (dynamic programs), this is **not** frontend-only: the backend round-trips the concession through the Google Calendar event description with hardcoded discount names, so a small **generic backend change + one manual Apps Script redeploy** is required.

## Decisions locked during brainstorming

- **Pricing model: stackable flat amounts.** Each discount is a flat ₱ amount off per archer; checked discounts add up. The old special perk — "PAC + Greenpark together → extra time-slots in a day are free (billed per day, not per slot)" — is **dropped**. Pricing always bills per time-slot. (Owner-approved; changes pricing only for the rare both-discounts-stacked multi-slot case.)
- **Amount type: flat ₱ only.** No percentages. Matches today; simplest editor and math.
- **Scope: global discount list.** Every program with `offerDiscounts` on shows all discounts (matches today — Open Range was the only such program). Per-program discount selection is deferred.

## Data model — `discounts` array in CONTENT

Editable like `programs` (persisted via the existing admin-authed `setContent`). Each discount:

```
{ id (string slug), name (string), amount (number, ₱), proofRequired (bool), proofLabel (string) }
```

- `id` is a **stable slug**; bookings reference it, so a rename does not orphan past selections. Generated once from the initial name when a discount is created, then frozen.
- `proofLabel` is the placeholder shown in the proof input (only when `proofRequired`).

`defaultDiscounts()` seeds today's three with those exact ids → nothing changes on launch:

| id | name | amount | proofRequired | proofLabel |
|---|---|---|---|---|
| pasig | Pasig City resident | 100 | true | Pasig City address or ID number |
| pac | PAC member | 100 | true | WAP ID No. (World Archery Philippines) |
| local | Greenpark resident or RHS | 100 | true | Greenpark address or RHS ID number |

Wiring mirrors `programs`:
- `mergedContent(...)` defaults gain `discounts: this.defaultDiscounts()`; `mergedContent` returns `discounts: c.discounts || defaults.discounts`.
- `normalizeDiscounts()` coerces fields for resilience against partial/legacy content (`amount`→Number, `proofRequired`→bool, missing `proofLabel`→`''`, missing/duplicate `id`→slug from `name`).
- `discountList()` → normalized `mergedContent(...).discounts`, used to build the booking-form rows and the admin editor.

## Selection state + dynamic booking form

Replace the three fixed booleans + three proof strings (and their `edit*` mirrors) with **id-keyed maps**:

```
eligSel:  { [id]: bool }     eligProof:  { [id]: string }   // customer booking form
editSel:  { [id]: bool }     editProof:  { [id]: string }   // admin / My-Bookings edit panel
```

Initial state: `eligSel: {}`, `eligProof: {}`, `editSel: {}`, `editProof: {}` (absent key = unchecked / empty).

Removed state keys: `eligPasig`, `eligPac`, `eligLocal`, `pasigProof`, `wapId`, `localProof`, `editPasig`, `editPac`, `editLocal`. Removed handlers: `togglePasig/togglePac/toggleLocal`, `setPasigProof/setWapId/setLocalProof`, `toggleEditPasig/toggleEditPac/toggleEditLocal`.

**Rendering.** The two customer booking forms (~1088–1124, ~1339–1374) and the admin edit panel (~1639) each replace their hardcoded checkbox-and-proof blocks with a single `<sc-for>` over a built list (`discountRows` for the booking form, `editDiscountRows` for the edit panel). Each item carries its own values and closures — the exact per-item-closure pattern the bookings list already uses (`b.edit`, `b.cancel`):

```
{ id, name, amountLabel,        // "−₱100"
  checked, box, border,         // checkbox visual state
  toggle,                       // () => flip eligSel[id]
  proofRequired, proofShown,    // proofRequired && checked
  proof, setProof,              // value + onInput closure → eligProof[id]
  proofLabel, proofBorder }     // placeholder + error border
```

`toggle` flips `eligSel[id]` (and clears `formError`); `setProof` writes `eligProof[id]` (and clears `formError`). `border`/`box`/`proofBorder` are computed strings (no JS ternaries inside `{{ }}` — SuperConductor rule), matching how the current `pasigBorder`/`wapBorder` etc. are computed in the data layer (~5453).

**Generic copy.** The section label/help that hardcodes "Open Range concessions — base ₱400, less ₱100 per concession" (~1088, ~1339) and the stacked-perk note (~1122, ~1373, which described the dropped perk) become generic — e.g. "Concession discounts — tick any that apply and add your proof." The form-error hint that names "WAP ID or Greenpark address / RHS ID" (~1065, ~1522) becomes generic ("…your concession proof…").

## Pricing

- `eligPerArcher()` → if the selected program's `offerDiscounts` is on, return the **sum of `amount`** over every discount whose `eligSel[id]` is true (look each id up in `discountList()`); else 0.
- `bothConcessions(program)` and the per-day billing branch in `priceFor` are **removed**. `priceFor` always bills per time-slot: `billable = sessions`. The rate × party × billable × group-discount math, then minus `eligPerArcher() * party * billable`, is otherwise unchanged.
- `editAmount(entry)` sums `amount` over `editSel[id]` true (gated on `offerDiscounts`), same as before but id-keyed.

## Concession object sent to the backend / stored on bookings

Replace the fixed-shape object (`{pasig, pasigProof, pac, wapId, local, localProof}`) with a **self-describing** object:

```
concession = { items: [ { id, name, amount, proof } ], total }   // or null when offerDiscounts is off
```

- Built from `eligSel`/`eligProof` filtered to checked discounts; `proof` is the trimmed `eligProof[id]` when `proofRequired`, else `''`.
- Sent on every booking path (multi-date local/remote, single-date local/remote — the existing `concession:` fields at ~3361/3371/3381/3406/3417/3424) and rebuilt the same way in `saveEdit` (~3888) from `editSel`/`editProof`. `startEdit` (~3863) seeds `editSel`/`editProof` from `entry.concession` (handling both shapes — see Backward compatibility).

## Backend change (requires manual redeploy)

The backend writes the concession into the Google Calendar event description and reads it back when listing remote bookings. Both are hardcoded to the three discounts and must become discount-agnostic.

- **`concLine_(body)` (~796–802):** instead of `if (c.pasig) push('Pasig')` etc., join `body.concession.items` into the summary string generically — each item as `name` (+ `: proof` when proof present). Produces e.g. `\nConcession: Pasig City resident: 1234, PAC member: WAP-99`.
- **`concSummary_(body)` (~135):** unchanged in shape (strips the `\nConcession: ` prefix), works off the generalized `concLine_`.
- **`lookup_` (~779–780):** stop regex-deriving `{pasig, local, pac}`. Store the read-back summary string as an **opaque label**: `concession = conc ? { label: <summary text> } : null`. Keep the legacy regex as a **fallback** so historical events (written by the old backend with `Pasig`/`Greenpark/RHS`/`PAC`) still populate recognizable booleans for old rows.
- The Bookings-sheet `Concession` column (~139, ~1441, ~1537) keeps storing `concSummary_(body)` — now a generic string. No schema change.

This is the one part needing a **manual Apps Script redeploy** (the user deploys manually).

## Backward compatibility

- **Existing stored bookings** carry the old `{pasig, pac, local, ...proof}` shape. The display helpers — `concessionLabel` (~4697), `concLabel`/`hasConc` (~4914), the `b.hasConc`/`b.concLabel` row at ~1595 — read **either** shape:
  - new: render from `concession.items` (names, optionally proof), `hasConc = items.length > 0`;
  - legacy booleans: map `pasig/pac/local` → the seeded discount names;
  - remote `label`-only: show the stored `label` string.
- **`startEdit`** seeds `editSel`/`editProof` from `entry.concession`: from `items[]` when present, else from legacy booleans (→ ids `pasig`/`pac`/`local`) with their proof fields.
- **Legacy CONTENT without `discounts`** → `defaultDiscounts()` seeds the current three; the booking flow behaves exactly as today.
- **Unknown id** in a stored booking (a discount later removed by the admin) → render its stored `name`/`label` from the booking itself (the concession object is self-describing), so it never shows blank.

## Admin "Discounts" editor (Pricing tab)

A new section in the **Pricing** admin tab beside the Programs editor, mirroring its pattern (`programs`/`addProgram`/`removeProgram`/`setProgramField` → `discounts`/`addDiscount`/`removeDiscount`/`setDiscountField`). Each discount row edits:

- **Name** (text), **Amount** (₱, number).
- **"Proof required"** toggle button (on/off, brand-styled).
- **Proof label** (text) — shown only when proof is required.
- **Remove** + a **+ Add discount** button. New-discount default: `{ id: <slug from name, generated once>, name: 'New discount', amount: 100, proofRequired: true, proofLabel: 'Proof / ID number' }`.

Handlers go through `saveCM({ discounts: … })` → `persistContent` → the admin-authed `setContent` (same path as programs). No new backend action. Editing name/amount/proof updates `discountList()` and persists; the booking form reflects changes immediately.

## Constraints

- **Mirror rule:** every `index.html` edit mirrored to `Pasig Greenpark Archery Camp.dc.html`; finish with `diff … && echo IDENTICAL`.
- **Backend:** generic change to `concLine_`/`concSummary_`/`lookup_` + **one manual Apps Script redeploy** (unlike Phase 1, which needed none).
- **SuperConductor:** no JS ternaries inside style/attr `{{ }}` (compute strings in the data layer); straight ASCII quotes in HTML attributes; per-item closures built in the data layer for `<sc-for>` rows.
- **Backward compatibility:** legacy CONTENT without `discounts` → defaults seed the current three; existing bookings (old concession shape) and legacy calendar events still render and stay editable; an unknown/removed discount id still renders from the booking's self-describing data.
- **Preserve current behavior on launch:** with the seeded defaults the booking flow behaves exactly as today — three discounts, ₱100 each, stackable, same proof placeholders — except the dropped both-concessions per-day perk.

## Verification (Playwright, real DOM via the React-fiber `logic`)

- Booking form on an `offerDiscounts` program renders one checkbox + proof row per seeded discount; toggling stacks ₱100 each in the receipt total; proof input binds per id.
- Proof validation: checking a `proofRequired` discount with an empty proof blocks confirm (red border), matching today.
- Pricing: two slots with two discounts checked bills per slot (no per-day perk); amount = `(rate × party × slots, less group %) − (sum of checked amounts × party × slots)`.
- Admin editor: editing a discount's name/amount/proof updates `discountList()` and persists (a `setContent` POST fires); `addDiscount`/`removeDiscount` work; id stays frozen across a rename.
- Backward compat: a booking stored with the legacy `{pasig:true,...}` shape still shows its concession label and seeds the edit panel; an unknown id renders from the booking's own data without blanks.
- Backend: `concLine_`/`lookup_` round-trip a generic two-discount concession through an event description and back without loss; legacy-format event still parses via the fallback.
- 0 real console errors; mirror IDENTICAL.

## Out of scope (later)

- **Percentage discounts** — flat ₱ only (locked).
- **The both-concessions per-day perk** — dropped (locked).
- **Per-program discount selection** — the list is global to all `offerDiscounts` programs.
- **Public Programs marketing cards** — still hand-coded HTML; their static "₱100" concession copy (~274, ~290) stays as-is and is a known follow-up to reconcile if amounts change.
