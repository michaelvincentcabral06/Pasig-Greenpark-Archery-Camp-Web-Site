# Dynamic Programs (Phase 1) — Design

## Summary

Let the admin create/edit/remove booking **programs** (the classes a customer books), stored in site content like passes already are. "Open Range" stops being a hardcoded special program: its behaviors become **per-program toggles** so any program — including new ones — can mix them. **Frontend-only** (`index.html`, mirrored): the backend already drives off the booking request's shape (amount, coach field, single-vs-multi dates) and never needs the program name behaviorally, so **no backend change, no Apps Script redeploy.**

Owner-approved scope: booking flow + pricing/behavior only (the public Programs *marketing* cards stay hand-designed); concession discounts stay the existing fixed set, toggled on/off per program (editable discounts = Phase 2).

## Why frontend-only

The backend's only program-name logic is a price **fallback** (`/Private/i`, `/Open Range/i` → a rate) used *only when `body.amount` is missing*. The website always sends the computed `amount`, the coach field, and `dates` (multi) vs `date` (single). Coach/slot filtering is driven by the `coach` request param, not the program. So replacing the frontend's name-checks with toggle lookups is sufficient; the backend keeps working unchanged (the fallback remains a harmless safety default).

## Data model — `programs` array in CONTENT

Editable like `packages` (persisted via the existing admin content-save path, which is admin-authed). Each program:

```
{ name, price (number), needsCoach (bool), multiDay (bool), offerDiscounts (bool), ageNote (string, optional), blurb (string, optional) }
```

`defaultPrograms()` seeds the current line-up so nothing changes on launch:

| name | price | needsCoach | multiDay | offerDiscounts |
|---|---|---|---|---|
| Little Archers (6–10) | 600 | true | false | false |
| Youth Squad (11–17) | 600 | true | false | false |
| Adult Beginners (18+) | 600 | true | false | false |
| Open Range | 400 | false | true | true |
| Private Coaching | 1200 | true | false | false |
| Group & Corporate | 600 | true | false | false |

Added to `mergedContent(...)` defaults: `programs: this.defaultPrograms()`. `mergedContent` returns `programs: c.programs || defaults.programs` (mirrors `packages`). A `normalizePrograms()` coerces fields (price→Number, toggles→bool, default missing) for resilience against partial/legacy content.

## Lookups that replace the name-checks

Two helpers:
- `programList()` → `this.mergedContent(...).programs` (normalized), used to build the dropdown + the admin editor.
- `programByName(name)` → the matching program object, or a safe default `{ price: (content rate or 600), needsCoach: true, multiDay: false, offerDiscounts: false }` when not found (so an unknown/legacy name still behaves sanely).

Replace every frontend program-name check with a lookup of the **selected** program (`programByName(this.state.form.program)`):
- `needsCoach(program)` → `!!programByName(program).needsCoach` (was `!/Open Range/i`).
- multi-date mode (`multiDateMode`, the `/Open Range/i` test ~line 4467) → `programByName(form.program).multiDay`.
- concession UI + eligibility (the `/Open Range/i` checks ~3285/3298/3848 + the "Open Range concessions" label/gating ~1093) → `programByName(form.program).offerDiscounts`.
- `priceFor(program, …)` rate (the `/Open Range/i`/`/Private/i` bucket ~3279-3280) → `programByName(program).price` as the base rate; the party × sessions × group-discount × concession math is unchanged.

(Any user-facing copy that hardcodes "Open Range" — e.g. the concession label/help text — becomes generic, e.g. "Concession discounts" / "This program offers …", since it's now toggle-driven.)

## Booking dropdown

The hardcoded `<option>` list (~lines 903-909) becomes a `<sc-for>` over `programList()` names (binding `programOpts` → `[{name}]`). `setProgram`/`fProgram` unchanged (still set/read `form.program` by name). When the selected program isn't coach/multi-day/discount, those UI sections hide via the toggle lookups above.

## Admin "Programs" editor (Pricing tab)

A new section in the **Pricing** admin tab, beside the pass editor, mirroring its pattern (`packages`/`addPass`/`removePass`/`updatePackage` → `programs`/`addProgram`/`removeProgram`/`setProgramField`). Each program row edits:
- **Name** (text), **Price** (number).
- Three **toggle buttons** (on/off, brand-styled): "Needs a coach", "Book multiple days", "Offer concession discounts".
- **Age note** (text, optional), **Blurb** (textarea, optional).
- **Remove** + a **+ Add program** button (new program default: `{ name:'New program', price:600, needsCoach:true, multiDay:false, offerDiscounts:false, ageNote:'', blurb:'' }`).

Handlers go through `saveCM({ programs: … })` → `persistContent` → the admin-authed `setContent` (sends the secret; same as passes). No new backend action.

## Constraints

- **Mirror rule:** every `index.html` edit mirrored to `Pasig Greenpark Archery Camp.dc.html`; finish `diff … && echo IDENTICAL`.
- **Frontend-only. No backend change, no redeploy.** Pushes to GitHub Pages.
- **SuperConductor:** no JS ternaries inside style `{{ }}`; straight ASCII quotes in HTML attributes.
- **Backward compatibility:** legacy CONTENT without `programs` → defaults seed the current line-up; existing bookings keep their stored program-name strings (the list only drives *new* bookings); `programByName` returns a safe default for any name not in the list.
- **Preserve current behavior on launch:** with the seeded defaults, the booking flow behaves exactly as today (same dropdown, same prices, Open Range still multi-day + discounts + no coach).

## Verification (Playwright, real DOM via the React-fiber `logic`)

- Dropdown renders the seeded program names; default behavior matches today (Adult Beginners → coach shown, single date, ₱600; Open Range → multi-date picker + discounts + no coach + ₱400).
- Switching the selected program flips the form behavior per its toggles (seed a custom program via `setState({content:{programs:[…]}})` — e.g. a "no-coach, multi-day, no-discount, ₱500" program — and assert the coach section hides, multi-date picker shows, discounts hidden, price computes at 500×party).
- `programByName` returns a safe default for an unknown name (legacy booking) — no crash, coach-required default.
- Admin editor: editing a program's price/toggles updates `programList()` and persists (a `setContent` POST fires); `addProgram`/`removeProgram` work.
- 0 real console errors; mirror IDENTICAL.

## Out of scope (later)

- **Phase 2:** admin-editable concession discounts (names/amounts/proof) — this phase keeps the fixed three (Pasig / PAC / Greenpark-RHS, ₱100 each, stackable), toggled on/off per program.
- Generating the public Programs *marketing* cards from the list (kept hand-designed for now).
- Per-program schedules/hours (programs still use the shared weekly schedule + coach availability).
