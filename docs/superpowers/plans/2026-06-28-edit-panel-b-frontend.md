# Per-Archer Edit Panel (Plan B) — Frontend

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the My-Bookings edit panel edit **each archer's concession** (with required proof) and persist it via the live `db-v30` backend; remove the non-persisting party stepper.

**Architecture:** Frontend-only edits to `index.html` (SuperConductor class component), mirrored byte-for-byte to `Pasig Greenpark Archery Camp.dc.html`. Replaces the single booking-level concession (`editSel`/`editProof`) with a per-archer `editArchers` model, seeded from `lookup_`'s surfaced `entry.archers` (db-v30) and saved as `archers:[{concession, amount}]` **in the surfaced order**. Reuses the booking flow's per-archer concession components. No backend change (db-v30 already live).

**Tech Stack:** SuperConductor (`{{ }}` bindings, `<sc-if>`, `<sc-for>`, `renderVals()` data layer, ES2015 class). Verified by Node unit tests of the pure helpers + Playwright-over-HTTP + mirror-IDENTICAL.

## Global Constraints

- **Mirror rule:** every `index.html` edit copied byte-for-byte to `Pasig Greenpark Archery Camp.dc.html`; finish each task with `diff "index.html" "Pasig Greenpark Archery Camp.dc.html" && echo IDENTICAL`.
- **SuperConductor:** NO JS expressions inside `{{ }}` — precompute each chip/proof row (checked, box/border colors, proofShown, proofBorder, toggle/setProof closures) in the data layer; straight ASCII quotes; per-item `<sc-for>` closures built in the data layer (nested: per-archer block × per-discount row).
- **No backend change / no redeploy.** db-v30 is live: `entry.archers = [{name, concession:{items:[{name,proof}]}}]` per slot; `reschedule_` accepts `body.archers:[{concession,amount}]`.
- **POSITIONAL CONTRACT (critical):** `reschedule_` pairs `body.archers[i]` with the slot's event at index `i`. The frontend MUST seed `editArchers` from `entry.archers` in order and send `archers` back in that SAME order — never reorder. (`lookup_`'s `archers[]` and `reschedule_`'s `slotEvs[]` share calendar-read order.)
- **Concession name↔id:** `entry.archers[i].concession.items` carry discount **names** (+ proof), not ids. Map names → discount ids via `discountList()` (matching `d.name`) to build `sel`/`proof` — unmatched names are dropped (rare legacy bookings seed empty).
- **Reuse (don't rebuild):** `concToSel_`, `buildConcession`, `discountList`, `rateFor`, `discountFor`, `programByName`, and the booking flow's concession-row markup (`index.html:1073-1084`) + builder shape (`archerExtraRows`, `index.html:3527`) already exist.

---

### Task 1: Per-archer concession editing (model + render + save)

**Files:** Modify `index.html` — state init (~`2787`); methods `startEdit`/`editAmount`/`saveEdit` (~`4237`/`4250`/`4274`), add `concItemsToSel_`/`toggleEditArcherConc_`/`setEditArcherProof_`/`editArcherRows`/`editArcherAmounts`, remove `editDiscountRows`/`toggleEditSel_`; the `renderVals` edit bindings (~`5953`); the edit-panel concession HTML (~`1664-1671`). Mirror.

**Interfaces:**
- Produces: `editArchers` state (`[{sel, proof}]`); `editArcherRows(entry)` → `[{name, hasConcRows, concRows:[{…toggle,setProof}]}]`; `editArcherAmounts(entry)` → `[number]`; `saveEdit` sends `archers:[{concession, amount}]` (surfaced order) + `notify`.

- [ ] **Step 1: State init.** In the component state object, replace `editSel: {},` and `editProof: {},` (~`index.html:2787-2788`) with:
```js
    editArchers: [],
    editFormError: false,
```

- [ ] **Step 2: Add `concItemsToSel_`.** Immediately AFTER `concToSel_(c) { … }` (~`index.html:4236`), add:
```js
  // Seed {sel, proof} from a surfaced per-archer concession ({items:[{name,proof}]}),
  // mapping discount NAMES back to ids via discountList(). Falls back to concToSel_ for the legacy shape.
  concItemsToSel_(concession) {
    if (concession && concession.items && concession.items.length) {
      const sel = {}, proof = {}, dl = this.discountList();
      concession.items.forEach(it => { const d = dl.find(x => x.name === (it && it.name)); if (d) { sel[d.id] = true; proof[d.id] = (it.proof || ''); } });
      return { sel: sel, proof: proof };
    }
    return this.concToSel_(concession || {});
  }
```

- [ ] **Step 3: Rewrite `startEdit`.** Replace the `const c = entry.concession || {}; const seed = this.concToSel_(c); this.setState({ … editSel: seed.sel, editProof: seed.proof, … });` body (~`index.html:4242-4247`) with:
```js
    const archersSrc = (entry.archers && entry.archers.length) ? entry.archers : [{ concession: entry.concession }];
    const editArchers = archersSrc.map(a => { const s = this.concItemsToSel_((a && a.concession) || {}); return { sel: s.sel, proof: s.proof }; });
    this.setState({
      editTs: entry.ts, editDate: entry.date || '', editTime: entry.time || '', editParty: Math.max(1, entry.party || archersSrc.length || 1),
      editArchers: editArchers, editFormError: false, editSlots: [], editLoading: false,
    });
```
(Keep the `sessionEditableByCustomer` guard above and the `if (entry.date) this.loadEditSlots(...)` below unchanged.)

- [ ] **Step 4: Add per-archer mutators.** After `setArcherProof_` (~`index.html:3500`), add:
```js
  toggleEditArcherConc_(i, id) {
    this.setState(s => { const ar = (s.editArchers || []).slice(); const a = { sel: { ...((ar[i] && ar[i].sel) || {}) }, proof: { ...((ar[i] && ar[i].proof) || {}) } }; a.sel[id] = !a.sel[id]; ar[i] = a; return { editArchers: ar, editFormError: false }; });
  }
  setEditArcherProof_(i, id, v) {
    this.setState(s => { const ar = (s.editArchers || []).slice(); const a = { sel: { ...((ar[i] && ar[i].sel) || {}) }, proof: { ...((ar[i] && ar[i].proof) || {}) } }; a.proof[id] = v; ar[i] = a; return { editArchers: ar, editFormError: false }; });
  }
```

- [ ] **Step 5: Add `editArcherAmounts` + rewrite `editAmount`.** Replace the whole `editAmount(entry) { … }` method (~`index.html:4250-4259`) with:
```js
  editArcherAmounts(entry) {
    const program = (entry && entry.program) || '';
    const open = this.programByName(program).offerDiscounts;
    const editArchers = this.state.editArchers || [];
    const party = Math.max(1, editArchers.length || (entry && entry.party) || 1);
    const base = this.rateFor(program) * (1 - this.discountFor(party, program));
    const dl = open ? this.discountList() : [];
    return editArchers.map(a => {
      const sel = a.sel || {};
      const conc = dl.reduce((s, d) => s + (sel[d.id] ? d.amount : 0), 0);
      return Math.max(0, Math.round(base - conc));
    });
  }
  editAmount(entry) { return this.editArcherAmounts(entry).reduce((s, n) => s + n, 0); }
```

- [ ] **Step 6: Add `editArcherRows`; remove `editDiscountRows`/`toggleEditSel_`.** Replace the `editDiscountRows() { … }` and `toggleEditSel_(id) { … }` methods (~`index.html:4260-4273`) with `editArcherRows`:
```js
  editArcherRows(entry) {
    const program = (entry && entry.program) || '';
    const dList = this.programByName(program).offerDiscounts ? this.discountList() : [];
    const editArchers = this.state.editArchers || [];
    const err = this.state.editFormError;
    const self = this;
    return editArchers.map((a, idx) => {
      const sel = a.sel || {}, proof = a.proof || {};
      const concRows = dList.map(d => {
        const on = !!sel[d.id];
        const missing = err && d.proofRequired && on && !String(proof[d.id] || '').trim();
        return {
          id: d.id, name: d.name, amountLabel: '−₱' + d.amount,
          box: on ? '#7fb43f' : 'transparent', border: on ? '#7fb43f' : 'rgba(244,239,228,0.18)', check: on ? '✓' : '',
          proofShown: d.proofRequired && on, proof: String(proof[d.id] || ''), proofLabel: d.proofLabel,
          proofBorder: missing ? '#e8674a' : 'rgba(244,239,228,0.18)',
          toggle: () => self.toggleEditArcherConc_(idx, d.id),
          setProof: (e) => self.setEditArcherProof_(idx, d.id, e.target.value),
        };
      });
      return { name: 'Archer ' + (idx + 1), hasConcRows: concRows.length > 0, concRows: concRows };
    });
  }
```

- [ ] **Step 7: Rewrite `saveEdit`.** Replace the body of `saveEdit(entry)` between the `sessionEditableByCustomer` guard and the `applyLocal` definition — i.e. the lines computing `date`/`time`/`program`/`concession`/`amount` (~`index.html:4276-4283`) — with proof validation + per-archer build:
```js
    const date = this.state.editDate, time = this.state.editTime;
    if (!date || !time) { return; }
    const program = entry.program || '';
    const open = this.programByName(program).offerDiscounts;
    const editArchers = this.state.editArchers || [];
    if (open) {
      const dl = this.discountList();
      const missing = editArchers.some(a => dl.some(d => d.proofRequired && (a.sel || {})[d.id] && !String((a.proof || {})[d.id] || '').trim()));
      if (missing) { this.setState({ editFormError: true }); return; }
    }
    const amounts = this.editArcherAmounts(entry);
    const archers = editArchers.map((a, i) => ({ concession: open ? this.buildConcession(a.sel, a.proof) : null, amount: amounts[i] }));
    const amount = amounts.reduce((s, n) => s + n, 0);
    const slotChanged = (date !== entry.date) || (time !== entry.time);
```
Then update the `applyLocal` `updated` object to carry the new per-archer concessions + amount: change its `concession: concession, amount: amount,` to `amount: amount, archers: editArchers.map((a, i) => ({ name: (entry.archers && entry.archers[i] && entry.archers[i].name) || '', concession: (open ? this.buildConcession(a.sel, a.proof) : null) })),` (drop the old single `concession:`). And change the `fetch` body (~`index.html:4302`) to send the per-archer data + notify:
```js
      body: JSON.stringify({ action: 'reschedule', eventId: entry.eventId || '', ref: entry.ref || '', date: entry.date || '', time: entry.time || '', newDate: date, newTime: time, name: entry.name || '', email: entry.email || '', archers: archers, notify: slotChanged })
```

- [ ] **Step 8: renderVals binding swap.** In the `renderVals` return, replace `editDiscountRows: this.editDiscountRows(),` (~`index.html:5953`) with:
```js
      editArcherRows: editingEntry ? this.editArcherRows(editingEntry) : [],
      editFormError: this.state.editFormError,
```
(Leave `editAmountLabel`, `editIsOpen`, `editParty*`, `editInc/editDec` for now — the party stepper is removed in Task 2.)

- [ ] **Step 9: HTML — per-archer concession blocks.** Replace the single concession block (the `<sc-if value="{{ editIsOpen }}">…<sc-for list="{{ editDiscountRows }}" as="d">…</sc-for>…</sc-if>`, ~`index.html:1664-1671`) with:
```html
                  <sc-if value="{{ editIsOpen }}" hint-placeholder-val="{{ false }}">
                  <div style="display:flex;flex-direction:column;gap:12px;">
                    <sc-for list="{{ editArcherRows }}" as="ar">
                      <div style="background:#1b3325;border:1px solid rgba(244,239,228,0.18);border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:10px;">
                        <div style="font-size:13px;font-weight:700;color:#cdd6c5;">{{ ar.name }}</div>
                        <sc-for list="{{ ar.concRows }}" as="d">
                          <div style="display:flex;flex-direction:column;gap:6px;">
                            <button onClick="{{ d.toggle }}" style="display:flex;align-items:center;gap:10px;text-align:left;width:100%;background:#244232;border:1.5px solid {{ d.border }};border-radius:9px;padding:9px 12px;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;">
                              <span style="width:18px;height:18px;flex:none;border-radius:5px;border:1.5px solid {{ d.border }};background:{{ d.box }};color:#1b2a1f;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;">{{ d.check }}</span>
                              <span style="flex:1;font-size:13.5px;color:#f4efe4;">{{ d.name }}</span>
                              <span style="font-family:'Spline Sans Mono',monospace;font-size:12px;color:#7fb43f;">{{ d.amountLabel }}</span>
                            </button>
                            <sc-if value="{{ d.proofShown }}" hint-placeholder-val="{{ false }}">
                            <input value="{{ d.proof }}" onInput="{{ d.setProof }}" placeholder="{{ d.proofLabel }}" style="width:100%;background:#1b3325;border:1px solid {{ d.proofBorder }};border-radius:8px;padding:10px 12px;font-family:'Hanken Grotesk',sans-serif;font-size:13.5px;color:#f4efe4;outline:none;box-sizing:border-box;" />
                            </sc-if>
                          </div>
                        </sc-for>
                      </div>
                    </sc-for>
                    <sc-if value="{{ editFormError }}" hint-placeholder-val="{{ false }}"><div style="font-size:12.5px;color:#f0b48a;">Add proof for each selected discount before saving.</div></sc-if>
                  </div>
                  </sc-if>
```

- [ ] **Step 10: Mirror + verify.**
  Mirror: `cp "index.html" "Pasig Greenpark Archery Camp.dc.html"` then `diff "index.html" "Pasig Greenpark Archery Camp.dc.html" && echo IDENTICAL`.
  Grep: `grep -cE "editDiscountRows|toggleEditSel_|editSel|editProof" index.html` → **0**.
  **Node unit test** `_t.mjs`: stub a `self` with `discountList()` → `[{id:'pasig',name:'Pasig City resident',amount:100,proofRequired:true,proofLabel:'ID'},{id:'pac',name:'PAC member',amount:100,proofRequired:true,proofLabel:'WAP'}]`, `programByName()` → `{offerDiscounts:true}`, `rateFor()` → 400, `discountFor()` → 0, and the real `concItemsToSel_`/`editArcherAmounts` bound to it. Assert:
  - `concItemsToSel_({items:[{name:'Pasig City resident',proof:'PSG-1'}]})` → `{sel:{pasig:true}, proof:{pasig:'PSG-1'}}`; an unknown name → `{sel:{},proof:{}}`.
  - With `state.editArchers=[{sel:{pasig:true},proof:{pasig:'x'}},{sel:{},proof:{}}]`, `editArcherAmounts({program:'Open Range'})` → `[300, 400]` (archer 1: 400−100; archer 2: 400), and `editAmount` sum → `700`.
  - Proof-validation logic (replicate the `missing` check): `[{sel:{pasig:true},proof:{}}]` → missing true; `[{sel:{pasig:true},proof:{pasig:'x'}}]` → missing false.
  Run `node _t.mjs`; green; delete scratch.
  **Playwright over HTTP** (serve, NOT file://; `_srv.mjs`/`_drv.mjs` via the Write tool, Chromium at `C:\Users\Michael Cabral\AppData\Local\ms-playwright\chromium-1228\chrome-win64\chrome.exe`): reach the instance via the page-root fiber; inject `page='account'` + an account booking into `acctBookings` with `archers:[{name:'A',concession:{items:[{name:'Pasig City resident',proof:'PSG-1'}]}},{name:'B',concession:{items:[]}}]`, `party:2`, `program:'Open Range'`, a future date/time; call `instance.startEdit(thatEntry)` (or click Edit). Assert: TWO archer concession blocks render; archer A's "Pasig City resident" chip is pre-selected with proof "PSG-1"; toggling archer B's chip ON then attempting Save (stub `adminPost`/`endpoint`) with empty proof sets the inline error; filling proof clears it; the save payload's `archers` array is in the surfaced order with `coach`… (here `concession`+`amount`) and `notify:false` for an unchanged slot. Screenshot. 0 real console errors. If injection fails after real effort, fall back to a static render + report. Delete scratch.

- [ ] **Step 11: Commit.**
```bash
git add "index.html" "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Edit panel: per-archer concession editing (seed from entry.archers, proof required, persist via reschedule archers[])"
```

---

### Task 2: Remove the party stepper

**Files:** Modify `index.html` — the `renderVals` party bindings (~`index.html:5952`, `5959-5960`); the edit-panel stepper HTML (~`index.html:1656-1663`). Mirror.

**Interfaces:** Removes `editPartyLabel`/`editInc`/`editDec` from the panel; the per-archer rows already reflect the booking's real archer count (Task 1), so nothing depends on the stepper.

- [ ] **Step 1: Remove the stepper HTML.** Delete the archer-count stepper block (the `<div>` containing `<label>…Archers</label>` with the `{{ editDec }}` / `{{ editPartyLabel }}` / `{{ editInc }}` controls, ~`index.html:1656-1663`).

- [ ] **Step 2: Remove the party bindings.** In the `renderVals` return, delete `editParty: editPartyN, editPartyLabel: editPartyN + (editPartyN === 1 ? ' archer' : ' archers'),` (~`index.html:5952`) and the `editInc: …,` / `editDec: …,` lines (~`index.html:5959-5960`). Keep `editParty` in component STATE (used by `startEdit`/`editArcherAmounts` party fallback) — only the renderVals binding + the `editInc/editDec` setters are removed. If `editPartyN` becomes unused after this, remove its `const editPartyN = …` line too (grep to confirm no other use).

- [ ] **Step 3: Mirror + verify.**
  Mirror: `cp "index.html" "Pasig Greenpark Archery Camp.dc.html"` then `diff … && echo IDENTICAL`.
  Grep: `grep -cE "editPartyLabel|editInc|editDec" index.html` → **0**.
  **Playwright over HTTP** (same harness as Task 1): open edit on a 2-archer booking; assert the archer-count stepper is GONE and the two per-archer concession blocks still render and Save still works. Screenshot. 0 real console errors. Delete scratch.

- [ ] **Step 4: Commit.**
```bash
git add "index.html" "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Edit panel: remove the non-persisting archer-count stepper"
```

---

## Self-Review

**Spec coverage** (against `2026-06-28-per-archer-edit-panel-design.md`, Section 3 + 1):
- Per-archer concession blocks seeded from `entry.archers` (names→ids) → Task 1 (`concItemsToSel_`, `startEdit`, `editArcherRows`, HTML). ✓
- Proof required per archer; inline error blocks Save → Task 1 (`saveEdit` validation + `editFormError` + HTML message). ✓
- Live per-archer total recompute → Task 1 (`editArcherAmounts`/`editAmount`). ✓
- Save sends `archers:[{concession, amount}]` in surfaced order + `notify`=(slot changed) → Task 1 Step 7 (positional contract honored: `editArchers` built and sent in `entry.archers` order). ✓
- Party stepper removed → Task 2. ✓
- Reschedule (date/time) preserved; concession-only edit is silent (`notify:false`) → Task 1 Step 7 (`slotChanged`). ✓
- **Out of scope (correctly):** per-archer add-ons, name/DOB, count persistence, admin edit, backend (db-v30 shipped in Plan A).

**Placeholder scan:** no TBD/TODO; every step shows the full code/markup; verify steps name concrete cases with computed values.

**Type/name consistency:** `editArchers` (`[{sel,proof}]`) is produced in `startEdit`, mutated by `toggleEditArcherConc_`/`setEditArcherProof_`, read by `editArcherRows`/`editArcherAmounts`/`saveEdit`; `concItemsToSel_` consumes the surfaced `{items:[{name,proof}]}` and emits `{sel,proof}` keyed by discount id; `buildConcession(sel,proof)` produces the `{items:[{id,name,amount,proof}]}` shape `reschedule_`/`concLineOf_` consume; `archers[i]` is sent in the same order `entry.archers` (and the slot's events) use. The removed `editDiscountRows`/`toggleEditSel_`/`editSel`/`editProof` are confirmed unreferenced by the Task-1 grep gate.
