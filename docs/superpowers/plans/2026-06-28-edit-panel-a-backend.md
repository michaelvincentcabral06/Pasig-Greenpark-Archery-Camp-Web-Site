# Per-Archer Edit Panel (Plan A) — Backend (db-v30)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface each archer's concession to My Bookings (`lookup_` gains a per-slot `archers:[{name, concession}]`), and make `reschedule_` accept `body.archers:[{concession, amount}]` and rewrite each per-archer event's `Concession` line + `Amount` (calendar event + Bookings sheet), so a customer's per-archer concession edit actually persists.

**Architecture:** Backend-only changes to `backend/Code.gs` (Google Apps Script, ES5-ish — `var`/`function`, no arrows/`const`/`let`). Two pure helpers (`parseConcItems_`, `applyArcherToDesc_`) carry the testable logic; `lookup_` and `reschedule_` integrate them. Additive and back-compatible. **Needs a manual `db-v30` redeploy.**

**Tech Stack:** Google Apps Script (ES5-ish); verified by Node unit tests of the extractable helpers (the live `/exec` runs old code until redeploy) + the user's post-redeploy checklist.

## Global Constraints

- **Backend-only.** No frontend change. **Requires one manual `db-v30` redeploy** (edit the EXISTING deployment — never "New deployment").
- **ES5-ish GAS style:** `var` + `function(...)`, NOT arrows/`const`/`let`.
- **Additive & back-compatible:** `lookup_`'s new `archers` array is extra (the existing aggregated `concession` field stays); `reschedule_` without `body.archers` behaves exactly as today (move-only). Nothing existing is removed or renamed.
- **Concession line format (written by `concLineOf_`):** items shape `\nConcession: Name (proof), Name2 (proof2)`; legacy boolean shape `\nConcession: Pasig,Greenpark/RHS,PAC` (no proof). Each per-archer event carries that archer's own `Concession:` line and `Name:` line (the archer's name).
- **Reuse (don't redefine):** `concLineOf_(c)` (formats a concession object → `\nConcession: …`), `eventsForSlot_(cal, ref, dateStr, timeLabel)`, `dbSheet_('bookings')`, `fmtLabel_`, `field(...)` (local in `lookup_`), `json_`.
- **Verification:** Node unit tests of the two pure helpers with stubs; `cp backend/Code.gs /tmp/_c.js && node --check /tmp/_c.js && echo SYNTAX_OK`. Do NOT live-`curl`. True end-to-end = the user's post-redeploy `db-v30` checklist. Delete scratch; commit only `backend/Code.gs` (+ `SETUP.md` in Task 3).

---

### Task 1: `lookup_` surfaces per-archer concessions

**Files:** Modify `backend/Code.gs` — add `parseConcItems_`; extend `lookup_`.

**Interfaces:**
- Produces: `parseConcItems_(concStr)` → `[{name, proof}]` (parses one `Concession:` value, items or legacy). Each `lookup_` booking gains `archers: [{ name, concession: { items: [{name, proof}] } }]`, one entry per per-archer event in the slot.
- Consumes: the per-event `Concession:` and `Name:` lines.

- [ ] **Step 1: Add `parseConcItems_`.** Insert ABOVE `function lookup_(` (so it's defined before use):
```js
// Parse one stored "Concession:" value into [{name, proof}]. Handles the items shape
// ("Name (proof), Name2 (proof2)") and the legacy boolean shape ("Pasig,Greenpark/RHS,PAC").
function parseConcItems_(concStr) {
  if (!concStr) return [];
  return concStr.split(',').map(function (s) { return s.trim(); }).filter(function (s) { return s; }).map(function (part) {
    var m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(part);
    return m ? { name: m[1].trim(), proof: m[2].trim() } : { name: part, proof: '' };
  });
}
```

- [ ] **Step 2: Add `archers: []` to the group initializer.** In `lookup_`, the `groups[key] = { … }` object (currently ends `ts: st.getTime(), __remote: true }`) — add `archers: [],` to it (e.g. right after `concession: (…),`).

- [ ] **Step 3: Push each event's archer concession.** Immediately AFTER `groups[key].amount += amt;` add:
```js
    groups[key].archers.push({ name: field(d, 'Name'), concession: { items: parseConcItems_(field(d, 'Concession')) } });
```

- [ ] **Step 4: Verify (Node unit test — do NOT curl).** `cp backend/Code.gs /tmp/_c.js && node --check /tmp/_c.js && echo SYNTAX_OK`. Scratch `_t.mjs`: extract `parseConcItems_` verbatim. Assert:
  - `parseConcItems_('')` → `[]`.
  - `parseConcItems_('Pasig City resident (PSG-123)')` → `[{name:'Pasig City resident', proof:'PSG-123'}]`.
  - `parseConcItems_('Pasig City resident (PSG-123), PAC member (WAP9)')` → two items with the right names + proofs.
  - `parseConcItems_('Pasig,Greenpark/RHS,PAC')` → `[{name:'Pasig',proof:''},{name:'Greenpark/RHS',proof:''},{name:'PAC',proof:''}]` (legacy, no proof).
  - `parseConcItems_('Senior')` → `[{name:'Senior', proof:''}]`.
  Run `node _t.mjs`; all green; delete scratch (`rm -f _t.mjs /tmp/_c.js`).

- [ ] **Step 5: Commit.**
```bash
git add backend/Code.gs
git commit -m "Edit panel: lookup_ surfaces per-archer concessions (archers[] + parseConcItems_)"
```

---

### Task 2: `reschedule_` rewrites each archer's concession + amount

**Files:** Modify `backend/Code.gs` — add `applyArcherToDesc_`; extend `reschedule_`.

**Interfaces:**
- Produces: `applyArcherToDesc_(desc, concObj, amount)` → new description with the `Concession:` line replaced/added (via `concLineOf_`) and the `Amount:` line replaced/added. `reschedule_` accepts `body.archers:[{concession, amount}]` and applies it to each slot event (calendar + Bookings sheet row by Event ID).
- Consumes: `concLineOf_`, `eventsForSlot_` (already used by `reschedule_`), `dbSheet_`.

- [ ] **Step 1: Add `applyArcherToDesc_`.** Insert ABOVE `function reschedule_(`:
```js
// Rewrite one event description's Concession + Amount lines for an edited archer.
function applyArcherToDesc_(desc, concObj, amount) {
  desc = desc || '';
  var concLine = concLineOf_(concObj); // '' or '\nConcession: ...'
  if (/\nConcession:[^\n]*/i.test(desc)) desc = desc.replace(/\nConcession:[^\n]*/i, concLine);
  else if (concLine) desc = desc + concLine;
  if (amount != null) {
    var amtLine = '\nAmount: ' + (parseInt(amount, 10) || 0);
    if (/\nAmount:[^\n]*/i.test(desc)) desc = desc.replace(/\nAmount:[^\n]*/i, amtLine);
    else desc = desc + amtLine;
  }
  return desc;
}
```

- [ ] **Step 2: Apply per-archer edits in `reschedule_`.** After the move block (right after `if (!moveOk) return json_({ ok: false, reason: 'move failed' });`, ~`backend/Code.gs:1760`) and BEFORE the notify/email block, insert:
```js
  // Per-archer concession/amount edit (db-v30): rewrite each slot event + its sheet row.
  if (body.archers && body.archers.length) {
    var esh = null, edata = null, eh = null, eEvCol = -1, eAmtCol = -1, eConcCol = -1;
    try { esh = dbSheet_('bookings'); edata = esh.getDataRange().getValues(); eh = edata[0]; eEvCol = eh.indexOf('Event ID'); eAmtCol = eh.indexOf('Amount'); eConcCol = eh.indexOf('Concession'); } catch (eSh) {}
    for (var ai = 0; ai < slotEvs.length; ai++) {
      var aRow = body.archers[ai]; if (!aRow) continue;
      var aEv = slotEvs[ai];
      try { aEv.setDescription(applyArcherToDesc_(aEv.getDescription() || '', aRow.concession, aRow.amount)); } catch (xD) {}
      if (esh && eEvCol >= 0) {
        var aId = aEv.getId();
        for (var er = 1; er < edata.length; er++) {
          if (String(edata[er][eEvCol]) === String(aId)) {
            if (eAmtCol >= 0 && aRow.amount != null) esh.getRange(er + 1, eAmtCol + 1).setValue(parseInt(aRow.amount, 10) || 0);
            if (eConcCol >= 0) esh.getRange(er + 1, eConcCol + 1).setValue(concLineOf_(aRow.concession).replace(/^\nConcession:\s*/i, ''));
            break;
          }
        }
      }
    }
  }
```
(`slotEvs` is already computed above in `reschedule_`. The rewrite runs regardless of `notify`, so a concession-only edit with `notify:false` still persists, just without the reschedule email/log.)

- [ ] **Step 3: Verify (Node unit test — do NOT curl).** `cp backend/Code.gs /tmp/_c.js && node --check /tmp/_c.js && echo SYNTAX_OK`. Scratch `_t.mjs`: extract `applyArcherToDesc_` + a stub `concLineOf_` (items shape → `'\nConcession: ' + items.map(i => i.name + (i.proof?' ('+i.proof+')':'')).join(', ')`; falsy → `''`). Assert:
  - Replacing an existing line: `applyArcherToDesc_('Program: Open Range\nConcession: Old (x)\nAmount: 400\nArchers: 1', {items:[{name:'Pasig City resident',proof:'PSG-1'}]}, 300)` → contains `\nConcession: Pasig City resident (PSG-1)`, contains `\nAmount: 300`, no longer contains `Old (x)` or `Amount: 400`, and the untouched lines (`Program:`, `Archers: 1`) remain.
  - Clearing a concession: `applyArcherToDesc_('...\nConcession: Pasig (p)\nAmount: 400', null, 400)` → the `\nConcession:` line removed (empty), `Amount: 400` intact.
  - Appending when absent: `applyArcherToDesc_('Program: X\nArchers: 1', {items:[{name:'PAC member',proof:'W1'}]}, 250)` → gains `\nConcession: PAC member (W1)` and `\nAmount: 250`.
  - `amount` omitted (null) leaves the existing `Amount:` line unchanged.
  Run `node _t.mjs`; all green; delete scratch (`rm -f _t.mjs /tmp/_c.js`).

- [ ] **Step 4: Commit.**
```bash
git add backend/Code.gs
git commit -m "Edit panel: reschedule_ rewrites each archer's Concession + Amount (event + sheet); applyArcherToDesc_"
```

---

### Task 3: `db-v30` version flag + SETUP checklist

**Files:** Modify `backend/Code.gs` — the `?action=version` return; `backend/SETUP.md`.

- [ ] **Step 1: Bump version.** In the `if (action === 'version')` `json_({ version: 'db-v29', …, acctBreakdown: true })`, change `'db-v29'` → `'db-v30'` and append `, perArcherEdit: true` before the closing ` })`. Preserve every existing flag.

- [ ] **Step 2: SETUP section.** Append a `## db-v30 deploy & verify` section to `backend/SETUP.md`, mirroring the EXACT format of the existing `## db-v29` section: a `**What changed:**` paragraph, the standard `### Deploy steps` (paste Code.gs → Save → Deploy→Manage deployments→edit EXISTING→New version→Deploy), and a `### Verification checklist` of `- [ ]` items:
  - `?action=version` shows `"version":"db-v30"`, `"perArcherEdit":true`, and all prior flags (`acctBreakdown:true`, `multiCoach:true`, etc.) still present.
  - In **My Bookings**, open edit on a **2-archer** booking → each archer's current concession is surfaced (the panel will show them once the frontend ships; pre-frontend, confirm `lookup_` returns an `archers` array with per-archer concessions).
  - Change one archer's concession and Save **without** changing date/time → that archer's calendar event `Concession:` + `Amount:` update, the other archer's event is untouched, the events stay at the same time, and **no reschedule email** is sent.
  - Reschedule (change date/time) on a per-archer booking → events move AND the per-archer concessions/amounts persist AND one reschedule email is sent.
  - A reschedule from an OLD frontend (no `archers` in the request) still moves the events normally.
  What-changed paragraph: `lookup_` now surfaces a per-slot `archers:[{name,concession}]` (each archer's own concession + proof, parsed from their event); `reschedule_` now accepts `body.archers:[{concession,amount}]` and rewrites each slot event's `Concession:` line + `Amount` (calendar event + Bookings sheet row), so a customer's per-archer concession edit in My Bookings actually persists. Additive/back-compatible. Backend-only.

- [ ] **Step 3: Commit.**
```bash
git add backend/Code.gs backend/SETUP.md
git commit -m "Edit panel: db-v30 version flag (perArcherEdit) + SETUP checklist"
```

- [ ] **Step 4: Redeploy reminder.** After merge, tell the user to **redeploy the Apps Script** (edit existing deployment → New version) and walk the db-v30 checklist. The frontend (Plan B) consumes `lookup_`'s `archers` and sends `reschedule`'s `archers`; until db-v30 is live the panel falls back to today's behavior.

---

## Self-Review

**Spec coverage** (against `2026-06-28-per-archer-edit-panel-design.md`, Section 2):
- `lookup_` surfaces per-archer concessions (with proof) → Task 1. ✓
- `reschedule_` accepts `body.archers` and rewrites each event's `Concession` + `Amount` → Task 2. ✓
- Concession-only edit (`notify:false`, same slot) persists in place with no email; reschedule still moves + emails → Task 2 (rewrite runs before/regardless of the notify block) + existing `reschedule_` notify gating. ✓
- Sheet stays in sync (Amount/Concession by Event ID) so accounting/admin amounts are correct → Task 2 Step 2. ✓
- Additive / back-compatible (no `body.archers` → move only; new `archers` array is extra) → Global Constraints + Task 1/2. ✓
- `db-v30` flag + SETUP → Task 3. ✓
- **Out of scope (correctly):** per-archer add-ons, name/DOB, archer-count persistence, the frontend panel → Plan B / not in this project.

**Placeholder scan:** no TBD/TODO; both helpers shown in full; verify steps name concrete cases with expected values.

**Type/name consistency:** `parseConcItems_(concStr)` → `[{name,proof}]` used to build `archers[].concession.items`; `applyArcherToDesc_(desc, concObj, amount)` consumes the `{items:[...]}` concession shape via `concLineOf_` (which already handles it) and the per-archer `amount`; `body.archers:[{concession, amount}]` matches the shape `book_`/`bookMulti_` already accept and the shape Plan B's frontend will send; sheet columns `Event ID`/`Amount`/`Concession` match the Bookings headers.
