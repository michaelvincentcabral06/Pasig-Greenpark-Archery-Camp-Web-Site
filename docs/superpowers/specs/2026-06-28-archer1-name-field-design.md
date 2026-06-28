# Sub-project A — Archer 1 name field

**Date:** 2026-06-28
**Scope:** Frontend only (`index.html` + `.dc.html` mirror). No backend redeploy.
**Part of:** the post-redesign batch (A→B→C→D→E). This is A.

## Problem

In the booking flow's "Who's shooting?" section, the lead-archer (Archer 1) name logic
is inverted relative to the checkbox **"Archer 1 is me (same as booker)"**:

- **Unchecked (default):** Archer 1 shows the booker's name in a *read-only* box
  (`showLeadDiv`) — a name is displayed even though the booker hasn't said Archer 1 is them.
- **Checked:** Archer 1 becomes an *editable* input pre-filled with the name — editable,
  which is wrong (if it's the booker, the name should be locked).

## Desired behavior

| "Archer 1 is me" checkbox | Archer 1 name field |
|---|---|
| **Unchecked (default)** | Empty, **editable** input — type any archer's name (same as Archers 2+) |
| **Checked** | Booker's name shown in a **read-only** box (not editable) |

## Implementation

The change is confined to the `archerRows` loop (≈`index.html:4911-4924`). The two markup
copies (≈lines 927 and 1342, plus their `.dc.html` mirrors) already bind
`ar.showNameInput` / `ar.showLeadDiv` / `ar.name` / `ar.leadName`, so **no HTML changes**.

For the lead archer (`isLead`):

- `showLeadDiv = isLead && sameAsBooker` — read-only box only when checked.
- `showNameInput = !isLead || !sameAsBooker` — editable input when unchecked.
- `leadName = this.state.form.name` — booker name shown in the read-only box.
- `name` (input value) `= a.name` — the archer's own typed name; blank by default.
- `effName = sameAsBooker ? this.state.form.name : a.name` (for the lead).

`effName` already feeds `resolvedArchers`, `archersComplete`, and the submission payload, so an
unchecked, untyped Archer 1 reads as incomplete and blocks submit — same as an empty Archer 2.
Toggle handler (`toggleSameAsBooker`) needs no change; `a.name` persists across toggles.

## Deploy

Edit `index.html`, copy byte-for-byte over `Pasig Greenpark Archery Camp.dc.html`, push `main`
(GitHub Pages rebuilds in ~15s). Frontend-only; no Apps Script redeploy.
