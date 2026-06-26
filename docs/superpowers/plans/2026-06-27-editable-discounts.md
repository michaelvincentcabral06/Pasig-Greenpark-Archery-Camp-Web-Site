# Editable Concession Discounts (Dynamic Programs Phase 2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the three hardcoded concession discounts (Pasig / PAC / Greenpark-RHS) into an admin-editable list stored in site content, rendered dynamically in the booking form, with flat stackable per-archer amounts.

**Architecture:** A new `discounts` array in CONTENT (seeded with today's three) drives the booking-form checkboxes, proof inputs, pricing, and the concession object stored on each booking. Selection state moves from three fixed booleans to id-keyed maps (`eligSel`/`eligProof`, `editSel`/`editProof`). The concession object becomes self-describing (`{ items:[{id,name,amount,proof}], total }`). The backend's calendar round-trip (`concLine_`/`lookup_`) is generalized to store/read an opaque label. Frontend is `index.html` (mirrored to the `.dc.html` copy); backend is `backend/Code.gs` (needs one manual redeploy).

**Tech Stack:** SuperConductor template, plain class-component JS, Google Apps Script backend, Playwright-core for verification.

## Global Constraints

- **Mirror rule:** every `index.html` edit is mirrored verbatim to `Pasig Greenpark Archery Camp.dc.html`. End each index.html task with `diff "index.html" "Pasig Greenpark Archery Camp.dc.html" && echo IDENTICAL`. The files are byte-identical today.
- **SuperConductor:** NO JavaScript ternaries or expressions inside style/attribute `{{ }}` — precompute every value in the data layer. Use **straight ASCII quotes** in HTML attributes (a recurring pitfall — verify after editing). Per-item `<sc-for>` rows carry their own values and closures, built in the data layer (the established `programEdits`/`acctUpcoming` pattern).
- **Pricing model (locked):** each discount is a flat ₱ amount off per archer; checked discounts add up; bill **per time-slot** always. The old "both concessions → extra slots free / per-day billing" perk is removed.
- **Amount type (locked):** flat ₱ only. No percentages.
- **Scope (locked):** the discount list is **global** — every program with `offerDiscounts` on shows all discounts.
- **Backward compatibility:** legacy CONTENT without `discounts` → defaults seed the three; existing bookings carrying the old `{pasig,pac,local,...proof}` concession shape, and legacy calendar events, still render and stay editable; an unknown/removed discount id still renders from the booking's own self-describing data.
- **Stable ids:** discount `id` is a slug generated once from the name and then frozen; renaming a discount never changes its id (bookings reference it).
- **Verification:** Playwright-core driving the real DOM via the React-fiber `logic` instance. Chromium at `C:\Users\Michael Cabral\AppData\Local\ms-playwright\chromium-1228\chrome-win64\chrome.exe`; if missing, install with `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright-core --no-save`. Use a single scratch `_verify_disc.mjs` (gitignored), extended per task, deleted before finishing. Reach `logic` the same way the Phase 1 `_verify_prog.mjs` did (load `file://…/index.html`, grab the root fiber's component instance, call its methods / `setState`).

---

### Task 1: Discount data model

**Files:**
- Modify: `index.html` — add methods next to `defaultPrograms`/`programList` (~3494–3519); `mergedContent` return (~2960); the `mergedContent({ … })` call (~4287).
- Mirror: `Pasig Greenpark Archery Camp.dc.html`
- Test: `_verify_disc.mjs` (scratch, gitignored)

**Interfaces:**
- Produces: `defaultDiscounts()`, `normalizeDiscounts(list)`, `discountList()`, `discountById(id)`, `slugify_(s)`, `hashStr_(s)`. Discount shape: `{ id:string, name:string, amount:number, proofRequired:bool, proofLabel:string }`. `discountList()` returns the normalized array; `discountById` returns the object or `null`.

- [ ] **Step 1: Add the data-model methods.** Immediately after `defaultPrograms()`/`normalizePrograms()`/`programList()`/`programByName()` (after line 3519, before `defaultPackages()`), insert:

```js
  defaultDiscounts() {
    return [
      { id: 'pasig', name: 'Pasig City resident',      amount: 100, proofRequired: true, proofLabel: 'Pasig City address or ID number' },
      { id: 'pac',   name: 'PAC member',               amount: 100, proofRequired: true, proofLabel: 'WAP ID No. (World Archery Philippines)' },
      { id: 'local', name: 'Greenpark resident or RHS', amount: 100, proofRequired: true, proofLabel: 'Greenpark address or RHS ID number' }
    ];
  }
  hashStr_(s) { var h = 0; for (var i = 0; i < s.length; i++) { h = ((h << 5) - h + s.charCodeAt(i)) | 0; } return h; }
  slugify_(s) {
    var base = String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return base || ('d' + Math.abs(this.hashStr_(String(s || ''))).toString(36));
  }
  normalizeDiscounts(list) {
    var src = (list && list.length) ? list : this.defaultDiscounts();
    var seen = {};
    return src.map((d, i) => {
      var id = d.id ? String(d.id) : this.slugify_(d.name);
      while (seen[id]) { id = id + '-' + i; }
      seen[id] = true;
      return { id: id, name: d.name || 'Discount', amount: Number(d.amount) || 0, proofRequired: !!d.proofRequired, proofLabel: d.proofLabel || '' };
    });
  }
  discountList() { var c = this.state.content || {}; return this.normalizeDiscounts(c.discounts); }
  discountById(id) { var l = this.discountList(); for (var i = 0; i < l.length; i++) { if (l[i].id === id) return l[i]; } return null; }
```

- [ ] **Step 2: Seed defaults in `mergedContent`.** In the `mergedContent` return (~2960, beside `programs: c.programs || defaults.programs,`) add:

```js
      discounts: c.discounts || defaults.discounts,
```

And in the `mergedContent({ … })` call args (~4287, beside `programs: this.defaultPrograms(),`) add:

```js
      discounts: this.defaultDiscounts(),
```

- [ ] **Step 3: Mirror + verify.** Copy index.html over the `.dc.html` mirror; `diff … && echo IDENTICAL`. Create `_verify_disc.mjs` reaching `logic`. Assert: `logic.discountList()` has length 3 with ids `['pasig','pac','local']` and each `amount===100` and `proofRequired===true`; `logic.discountById('pac').name==='PAC member'`; `logic.discountById('nope')===null`; `logic.normalizeDiscounts([{name:'Senior, 60+',amount:'150'}])` yields `[{id:'senior-60',name:'Senior, 60+',amount:150,proofRequired:false,proofLabel:''}]`; `logic.mergedContent(logic.defaultContentArg_||{}).discounts` (or however Phase 1 obtained defaults) falls back to the seeded three when `content.discounts` is absent. Run `node _verify_disc.mjs`; expect all green, 0 real console errors.

- [ ] **Step 4: Commit.**

```bash
git add "index.html" "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Editable discounts: discount data model (defaultDiscounts/normalize/list/byId + content seed)"
```

---

### Task 2: Customer booking form — dynamic discounts end-to-end

**Files:**
- Modify: `index.html` — initial state (~2640–2645); `eligPerArcher` (~3298–3301); remove `bothConcessions` (~3310–3313) and simplify `priceFor` (~3318–3325); the `concession` builder in `bookSlot` (~3341–3345); `confirmBooking` proofBlock (~4502); the two booking-form concession HTML blocks (~1086–1126 and ~1337–1377); the booking-form data-layer bindings (~5441, 5449–5467); add helper methods.
- Mirror: `Pasig Greenpark Archery Camp.dc.html`
- Test: `_verify_disc.mjs` (extend)

**Interfaces:**
- Consumes: `discountList()` (Task 1).
- Produces: state `eligSel:{[id]:bool}`, `eligProof:{[id]:string}`; methods `buildConcession(sel, proof)` → `{items:[{id,name,amount,proof}], total}|null`, `discountRows()`, `toggleElig_(id)`, `setEligProof_(id,v)`. Data binding `discountRows`. Concession object on bookings is now `{items,total}|null`.

- [ ] **Step 1: Swap the selection state.** In the initial state object, replace these six lines (~2640–2645):

```js
    eligPac: false,
    eligLocal: false,
    eligPasig: false,
    wapId: '',
    localProof: '',
    pasigProof: '',
```

with:

```js
    eligSel: {},
    eligProof: {},
```

- [ ] **Step 2: Sum-based `eligPerArcher`.** Replace `eligPerArcher()` (~3298–3301) with:

```js
  eligPerArcher() {
    if (!this.programByName(this.state.form.program).offerDiscounts) return 0;
    var sel = this.state.eligSel || {};
    return this.discountList().reduce((sum, d) => sum + (sel[d.id] ? d.amount : 0), 0);
  }
```

- [ ] **Step 3: Remove the both-concessions perk and bill per slot.** Delete the `bothConcessions(program)` method and its comment (~3310–3313). Replace `priceFor` (~3318–3325) with:

```js
  // Final price = (rate × archers × time-slots, less group discount) − per-archer concessions.
  priceFor(program, party, sessions, days) {
    party = Math.max(1, party); sessions = Math.max(0, sessions);
    var billable = sessions;
    var afterGroup = this.rateFor(program) * party * billable * (1 - this.discountFor(party));
    var elig = this.eligPerArcher() * party * billable;
    return Math.max(0, Math.round(afterGroup - elig));
  }
```

(The `days` parameter stays in the signature so existing callers at ~3339/3354 still pass without error; it is now ignored.)

- [ ] **Step 4: Add the concession builder.** Add this method next to `eligPerArcher` (after the `priceFor` method):

```js
  buildConcession(sel, proof) {
    sel = sel || {}; proof = proof || {};
    var items = this.discountList().filter(d => sel[d.id]).map(d => ({
      id: d.id, name: d.name, amount: d.amount,
      proof: d.proofRequired ? String(proof[d.id] || '').trim() : ''
    }));
    if (!items.length) return null;
    return { items: items, total: items.reduce((s, it) => s + it.amount, 0) };
  }
```

- [ ] **Step 5: Use the builder in `bookSlot`.** Replace the `const concession = …` block (~3341–3345) with:

```js
    const concession = this.programByName(form.program).offerDiscounts ? this.buildConcession(this.state.eligSel, this.state.eligProof) : null;
```

(Every booking path in `bookSlot` already reuses this single `concession` const — no other change needed there.)

- [ ] **Step 6: Generalize the proof validation.** Replace the `proofBlock` line in `confirmBooking` (~4502) with:

```js
      const proofBlock = offersDisc && this.discountList().some(d => d.proofRequired && (this.state.eligSel || {})[d.id] && !String((this.state.eligProof || {})[d.id] || '').trim());
```

- [ ] **Step 7: Add the row builder + handlers.** Add these methods (next to `discountRows`'s consumers, e.g. after `buildConcession`):

```js
  discountRows() {
    if (!this.programByName(this.state.form.program).offerDiscounts) return [];
    var sel = this.state.eligSel || {}, proof = this.state.eligProof || {}, err = this.state.formError;
    return this.discountList().map(d => {
      var on = !!sel[d.id];
      var missing = err && d.proofRequired && on && !String(proof[d.id] || '').trim();
      return {
        id: d.id, name: d.name, amountLabel: '−₱' + d.amount,
        checked: on, box: on ? '#7fb43f' : 'transparent',
        border: on ? '#7fb43f' : 'rgba(244,239,228,0.18)', check: on ? '✓' : '',
        toggle: () => this.toggleElig_(d.id),
        proofRequired: d.proofRequired, proofShown: d.proofRequired && on,
        proof: String(proof[d.id] || ''), setProof: (e) => this.setEligProof_(d.id, e.target.value),
        proofLabel: d.proofLabel, proofBorder: missing ? '#e8674a' : 'rgba(244,239,228,0.18)'
      };
    });
  }
  toggleElig_(id) { this.setState(s => ({ eligSel: { ...(s.eligSel || {}), [id]: !((s.eligSel || {})[id]) }, formError: false })); }
  setEligProof_(id, v) { this.setState(s => ({ eligProof: { ...(s.eligProof || {}), [id]: v }, formError: false })); }
```

- [ ] **Step 8: Rewire the booking-form data layer.** In the render data object: delete the line `eligPac: this.state.eligPac, eligLocal: this.state.eligLocal, eligPasig: this.state.eligPasig,` (~5441) and the entire block of old concession bindings (~5449–5467: `wapId`/`localProof`/`pasigProof`, `setWapId`/`setLocalProof`/`setPasigProof`, `wapBorder`/`localProofBorder`/`pasigProofBorder`, `togglePac`/`toggleLocal`/`togglePasig`, `pasigBorder`/`pasigBox`/`pasigCheck`, `pacBorder`/`pacBox`/`pacCheck`, `localBorder`/`localBox`/`localCheck`). Keep the `isOpenRange:` line (~5442). In their place add one binding:

```js
      discountRows: this.discountRows(),
```

- [ ] **Step 9: Replace both booking-form HTML blocks.** Replace the first concession block (lines ~1086–1126, the `<sc-if value="{{ isOpenRange }}">…</sc-if>` wrapping the three hardcoded buttons + proofs + the unlimited-slots note) with:

```html
              <sc-if value="{{ isOpenRange }}" hint-placeholder-val="{{ false }}">
              <div>
                <label style="display:block;font-size:13px;font-weight:600;color:#cdd6c5;margin-bottom:3px;">Concession discounts</label>
                <p style="font-size:11.5px;color:#8a9579;margin:0 0 9px;line-height:1.5;">Tick any that apply and add your proof below.</p>
                <div style="display:flex;flex-direction:column;gap:8px;">
                  <sc-for list="{{ discountRows }}" as="d" hint-placeholder-count="3">
                    <button onClick="{{ d.toggle }}" role="checkbox" aria-checked="{{ d.checked }}" style="display:flex;align-items:center;gap:11px;text-align:left;background:#1b3325;border:1.5px solid {{ d.border }};border-radius:9px;padding:11px 13px;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;">
                      <span style="width:20px;height:20px;flex:none;border-radius:5px;border:1.5px solid {{ d.border }};background:{{ d.box }};color:#1b2a1f;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;">{{ d.check }}</span>
                      <span style="flex:1;font-size:14px;color:#f4efe4;">{{ d.name }}</span>
                      <span style="font-family:'Spline Sans Mono',monospace;font-size:12.5px;font-weight:700;color:#7fb43f;white-space:nowrap;">{{ d.amountLabel }}</span>
                    </button>
                    <sc-if value="{{ d.proofShown }}" hint-placeholder-val="{{ false }}">
                      <input value="{{ d.proof }}" onInput="{{ d.setProof }}" placeholder="{{ d.proofLabel }}" style="width:100%;background:#1b3325;border:1px solid {{ d.proofBorder }};border-radius:8px;padding:11px 13px;font-family:'Hanken Grotesk',sans-serif;font-size:14px;color:#f4efe4;outline:none;" />
                    </sc-if>
                  </sc-for>
                </div>
              </div>
              </sc-if>
```

Replace the second block (lines ~1337–1377, same structure) with the identical markup above. Both copies become byte-for-byte the same inner template.

- [ ] **Step 10: Mirror + verify.** Mirror; `diff … && echo IDENTICAL`. Extend `_verify_disc.mjs`: select an `offerDiscounts` program (`setState({form:{…program:'Open Range'}})`); assert `logic.discountRows()` has 3 rows, each unchecked (`box==='transparent'`); call `logic.toggleElig_('pasig')` then assert `discountRows()[0].checked===true` and `logic.eligPerArcher()===100`; toggle `pac` too → `eligPerArcher()===200`; `logic.priceFor('Open Range', 2, 3, 1)` equals `(400*2*3*(1-0.20)) - (200*2*3)` = `1920 - 1200` = `720` (per-slot, no per-day perk); `logic.buildConcession({pasig:true,pac:true},{pasig:'addr-1',pac:'WAP-9'})` returns `{items:[{id:'pasig',…,proof:'addr-1'},{id:'pac',…,proof:'WAP-9'}], total:200}`; with `formError:true` and `pasig` checked but empty proof, `discountRows()[0].proofBorder==='#e8674a'`. Run `node _verify_disc.mjs`; all green, 0 real console errors.

- [ ] **Step 11: Commit.**

```bash
git add "index.html" "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Editable discounts: dynamic booking-form discounts, sum pricing, self-describing concession object (drop both-concessions perk)"
```

---

### Task 3: Admin / My-Bookings edit panel — dynamic discounts

**Files:**
- Modify: `index.html` — initial state (~2708–2710); `startEdit` (~3863–3868); `editAmount` (~3870–3878); `saveEdit` concession build (~3887–3892); the edit-panel concession HTML (~1638–1643); edit-panel data-layer bindings (~5578, 5586–5591); add helper methods.
- Mirror: `Pasig Greenpark Archery Camp.dc.html`
- Test: `_verify_disc.mjs` (extend)

**Interfaces:**
- Consumes: `discountList()` (Task 1), `buildConcession` (Task 2).
- Produces: state `editSel:{[id]:bool}`, `editProof:{[id]:string}`; methods `concToSel_(c)` → `{sel,proof}`, `editDiscountRows()`, `toggleEditSel_(id)`. Data binding `editDiscountRows`.

- [ ] **Step 1: Swap the edit state.** In the initial state object, replace (~2708–2710):

```js
    editPac: false,
    editLocal: false,
    editPasig: false,
```

with:

```js
    editSel: {},
    editProof: {},
```

- [ ] **Step 2: Add the legacy-aware seeder.** Add this method (next to `startEdit`):

```js
  concToSel_(c) {
    var sel = {}, proof = {};
    if (c && c.items && c.items.length) {
      c.items.forEach(it => { if (it && it.id) { sel[it.id] = true; proof[it.id] = it.proof || ''; } });
    } else if (c) {
      if (c.pasig) { sel.pasig = true; proof.pasig = c.pasigProof || ''; }
      if (c.pac)   { sel.pac = true;   proof.pac = c.wapId || ''; }
      if (c.local) { sel.local = true; proof.local = c.localProof || ''; }
    }
    return { sel: sel, proof: proof };
  }
```

(A remote, label-only concession seeds empty selections — a documented edge: the admin re-ticks if needed. The amount is recomputed on save regardless.)

- [ ] **Step 3: Seed selections in `startEdit`.** Replace the `const c = entry.concession || {};` + `this.setState({ … editPac … })` block (~3863–3867) with:

```js
    const c = entry.concession || {};
    const seed = this.concToSel_(c);
    this.setState({
      editTs: entry.ts, editDate: entry.date || '', editTime: entry.time || '', editParty: Math.max(1, entry.party || 1),
      editSel: seed.sel, editProof: seed.proof, editSlots: [], editLoading: false,
    });
```

- [ ] **Step 4: Sum-based `editAmount`.** Replace `editAmount` (~3870–3878) with:

```js
  editAmount(entry) {
    const program = entry.program || '';
    const party = Math.max(1, this.state.editParty || 1);
    const rate = this.rateFor(program);
    const open = this.programByName(program).offerDiscounts;
    var sel = this.state.editSel || {};
    const elig = open ? this.discountList().reduce((s, d) => s + (sel[d.id] ? d.amount : 0), 0) : 0;
    const gross = rate * party * (1 - this.discountFor(party)); // single session (1 day)
    return Math.max(0, Math.round(gross - elig * party));
  }
```

- [ ] **Step 5: Build the concession in `saveEdit`.** Replace the `const concession = … { pasig … } : null;` block (~3887–3892) with:

```js
    const concession = this.programByName(program).offerDiscounts ? this.buildConcession(this.state.editSel, this.state.editProof) : null;
```

(The unused `const oc = entry.concession || {};` line just above, ~3887, can be removed.)

- [ ] **Step 6: Add the edit-row builder + handler.** Add these methods (next to `editAmount`):

```js
  editDiscountRows() {
    var sel = this.state.editSel || {};
    return this.discountList().map(d => {
      var on = !!sel[d.id];
      return {
        id: d.id, name: d.name, amountLabel: '−₱' + d.amount,
        box: on ? '#7fb43f' : 'transparent',
        border: on ? '#7fb43f' : 'rgba(244,239,228,0.2)', check: on ? '✓' : '',
        toggle: () => this.toggleEditSel_(d.id)
      };
    });
  }
  toggleEditSel_(id) { this.setState(s => ({ editSel: { ...(s.editSel || {}), [id]: !((s.editSel || {})[id]) } })); }
```

- [ ] **Step 7: Rewire the edit-panel data layer.** Delete the line `editPac: this.state.editPac, editLocal: this.state.editLocal, editPasig: this.state.editPasig,` (~5578) and the three `toggleEdit*` lines (~5586–5588) and the three `editPacBox/Border/Check` etc. lines (~5589–5591). Add:

```js
      editDiscountRows: this.editDiscountRows(),
```

- [ ] **Step 8: Replace the edit-panel HTML.** Replace the concession block inside the edit panel (lines ~1638–1643: the `<label>Concessions (₱100 off each)</label>` + three hardcoded `toggleEdit*` buttons) with:

```html
                  <div style="display:flex;flex-direction:column;gap:8px;">
                    <label style="font-size:12.5px;font-weight:600;color:#cdd6c5;">Concessions</label>
                    <sc-for list="{{ editDiscountRows }}" as="d" hint-placeholder-count="3">
                      <button onClick="{{ d.toggle }}" style="display:flex;align-items:center;gap:10px;text-align:left;background:#1b3325;border:1.5px solid {{ d.border }};border-radius:9px;padding:9px 12px;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;"><span style="width:18px;height:18px;flex:none;border-radius:5px;border:1.5px solid {{ d.border }};background:{{ d.box }};color:#1b2a1f;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;">{{ d.check }}</span><span style="flex:1;font-size:13.5px;color:#f4efe4;">{{ d.name }}</span><span style="font-family:'Spline Sans Mono',monospace;font-size:12px;color:#7fb43f;">{{ d.amountLabel }}</span></button>
                    </sc-for>
                  </div>
```

- [ ] **Step 9: Mirror + verify.** Mirror; `diff … && echo IDENTICAL`. Extend `_verify_disc.mjs`: call `logic.concToSel_({items:[{id:'pac',proof:'WAP-1'}]})` → `{sel:{pac:true},proof:{pac:'WAP-1'}}`; `logic.concToSel_({pasig:true,pasigProof:'addr'})` (legacy) → `{sel:{pasig:true},proof:{pasig:'addr'}}`; set `editSel:{pasig:true}` and `editParty:2` and assert `logic.editAmount({program:'Open Range'})` equals `(400*2*(1-0.10)) - (100*2)` = `720 - 200` = `520`; `logic.editDiscountRows()[0].check==='✓'` after `toggleEditSel_('pasig')`; `logic.buildConcession(logic.state.editSel, logic.state.editProof)` returns items for the checked ids. Run `node _verify_disc.mjs`; all green.

- [ ] **Step 10: Commit.**

```bash
git add "index.html" "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Editable discounts: dynamic edit-panel concessions, legacy-aware seeding, sum-based editAmount"
```

---

### Task 4: Concession display helpers (back-compat)

**Files:**
- Modify: `index.html` — admin booking-list helper `concessionLabel`/`hasConcession` (~4697–4702); My-Bookings `fmtSession` label `cl` (~4914); add two helper methods.
- Mirror: `Pasig Greenpark Archery Camp.dc.html`
- Test: `_verify_disc.mjs` (extend)

**Interfaces:**
- Produces: `concLabelFull_(c)` (names + proof, for admin), `concLabelShort_(c)` (names only, for My-Bookings). Both accept new `{items}`, remote `{label}`, or legacy `{pasig,pac,local,...proof}` shapes; return `''` for null/empty.

- [ ] **Step 1: Add the helpers.** Add these methods (next to `fmtSession` or near the other formatting helpers):

```js
  concLabelFull_(c) {
    if (!c) return '';
    if (c.items && c.items.length) return c.items.map(it => it.name + (it.proof ? (' · ' + it.proof) : '')).join('  ·  ');
    if (c.label) return c.label;
    return [
      c.pasig ? ('Pasig resident · ' + (c.pasigProof || '—')) : '',
      c.local ? ('Greenpark/RHS · ' + (c.localProof || '—')) : '',
      c.pac ? ('PAC · WAP ID ' + (c.wapId || '—')) : ''
    ].filter(Boolean).join('  ·  ');
  }
  concLabelShort_(c) {
    if (!c) return '';
    if (c.items && c.items.length) return c.items.map(it => it.name).join(' + ');
    if (c.label) return c.label;
    return [c.pasig ? 'Pasig' : '', c.local ? 'Greenpark/RHS' : '', c.pac ? 'PAC' : ''].filter(Boolean).join(' + ');
  }
```

- [ ] **Step 2: Rewire the admin booking-list helper.** Replace the `concessionLabel: … hasConcession: …` block (~4697–4702) with:

```js
      concessionLabel: this.concLabelFull_(b.concession),
      hasConcession: !!this.concLabelFull_(b.concession),
```

- [ ] **Step 3: Rewire the My-Bookings label.** Replace the `const cl = b.concession ? [ … ].filter(Boolean).join(' + ') : '';` line (~4914) with:

```js
      const cl = this.concLabelShort_(b.concession);
```

(The existing `concLabel: cl, hasConc: !!cl` at ~4920 stays.)

- [ ] **Step 4: Mirror + verify.** Mirror; `diff … && echo IDENTICAL`. Extend `_verify_disc.mjs`: `logic.concLabelShort_({items:[{id:'pac',name:'PAC member'},{id:'pasig',name:'Pasig City resident'}]})` === `'PAC member + Pasig City resident'`; `logic.concLabelFull_({pasig:true,pasigProof:'addr-9'})` (legacy) === `'Pasig resident · addr-9'`; `logic.concLabelShort_({label:'Senior (60+)'})` === `'Senior (60+)'`; `logic.concLabelFull_(null)` === `''`. Run `node _verify_disc.mjs`; all green.

- [ ] **Step 5: Commit.**

```bash
git add "index.html" "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Editable discounts: concession display helpers handle items/label/legacy shapes"
```

---

### Task 5: Admin "Concession discounts" editor (Pricing tab)

**Files:**
- Modify: `index.html` — editor handlers next to `programEdits`/`addProgram` (~4646–4659); data-layer exposure (~5730); editor markup in the Pricing tab after the Programs section (~2361).
- Mirror: `Pasig Greenpark Archery Camp.dc.html`
- Test: `_verify_disc.mjs` (extend)

**Interfaces:**
- Consumes: `discountList()`/`normalizeDiscounts()` (Task 1), `saveCM` (existing).
- Produces: locals `setDiscField`, `setDiscNum`, `toggleDiscProof`, `removeDiscount`, `addDiscount`, `discountEdits`. Data bindings `discountEdits`, `addDiscount`.

- [ ] **Step 1: Editor handlers.** Immediately after the `addProgram = …` / `programEdits = …` block (after line 4659, before `pkgEdits`), add:

```js
    const setDiscField = (i, key) => (e) => { const v = e.target.value; const ds = this.discountList().map((d, idx) => idx === i ? { ...d, [key]: v } : d); saveCM({ discounts: ds }); };
    const setDiscNum   = (i, key) => (e) => { const v = (e.target.value === '' ? 0 : (Number(e.target.value) || 0)); const ds = this.discountList().map((d, idx) => idx === i ? { ...d, [key]: v } : d); saveCM({ discounts: ds }); };
    const toggleDiscProof = (i) => () => { const ds = this.discountList().map((d, idx) => idx === i ? { ...d, proofRequired: !d.proofRequired } : d); saveCM({ discounts: ds }); };
    const removeDiscount = (i) => () => saveCM({ discounts: this.discountList().filter((_, idx) => idx !== i) });
    const addDiscount = () => { const ds = this.normalizeDiscounts(this.discountList().concat([{ name: 'New discount', amount: 100, proofRequired: true, proofLabel: 'Proof / ID number' }])); saveCM({ discounts: ds }); };
    const discountEdits = this.discountList().map((d, i) => ({
      name: d.name, amount: d.amount, proofLabel: d.proofLabel, proofRequired: !!d.proofRequired,
      proofBg: d.proofRequired ? '#244232' : '#fffdf6', proofFg: d.proofRequired ? '#f4efe4' : '#244232',
      setName: setDiscField(i, 'name'), setAmount: setDiscNum(i, 'amount'), setProofLabel: setDiscField(i, 'proofLabel'),
      toggleProof: toggleDiscProof(i), remove: removeDiscount(i)
    }));
```

(Id stays frozen: `discountList()` returns normalized objects carrying their `id`; `setDiscField(i,'name')` spreads `{...d, name:v}`, preserving `id`. `addDiscount` runs the concat through `normalizeDiscounts` so the new row gets a slug id once.)

- [ ] **Step 2: Expose in the data layer.** Where `programEdits, addProgram` are returned (~5730, beside `pkgEdits`), add:

```js
      discountEdits, addDiscount,
```

- [ ] **Step 3: Editor markup.** In the Pricing tab, immediately after the Programs section's closing (after the `+ Add program` button's wrapping `</div>`, ~2361) and before the next block (~2363), insert:

```html
          <div style="margin-top:28px;">
            <div style="font-size:15px;font-weight:800;color:#1b2a1f;margin-bottom:4px;">Concession discounts</div>
            <p style="font-size:13px;color:#56664f;margin:0 0 12px;">Shown on any program with Discounts on. Each is a flat &#8369; amount off per archer; customers can stack them.</p>
            <div style="display:flex;flex-direction:column;gap:14px;">
              <sc-for list="{{ discountEdits }}" as="dc" hint-placeholder-count="3">
                <div style="background:#fffdf6;border:1px solid rgba(36,66,50,0.12);border-radius:12px;padding:20px;display:flex;flex-direction:column;gap:10px;">
                  <input value="{{ dc.name }}" onInput="{{ dc.setName }}" style="background:#f4efe4;border:1px solid rgba(36,66,50,0.16);border-radius:8px;padding:10px 12px;font-family:'Hanken Grotesk',sans-serif;font-size:15px;font-weight:700;color:#1b2a1f;outline:none;" />
                  <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;">
                    <label style="font-size:11.5px;font-weight:600;color:#56664f;">Amount (&#8369;)<input value="{{ dc.amount }}" onInput="{{ dc.setAmount }}" type="number" min="0" style="display:block;margin-top:4px;width:100px;background:#f4efe4;border:1px solid rgba(36,66,50,0.16);border-radius:8px;padding:9px 11px;font-family:'Hanken Grotesk',sans-serif;font-size:14px;font-weight:700;color:#1b2a1f;outline:none;" /></label>
                    <button onClick="{{ dc.toggleProof }}" style="background:{{ dc.proofBg }};color:{{ dc.proofFg }};border:1px solid rgba(36,66,50,0.3);cursor:pointer;font-family:'Hanken Grotesk',sans-serif;font-size:12px;font-weight:700;padding:8px 14px;border-radius:999px;">Proof required</button>
                  </div>
                  <sc-if value="{{ dc.proofRequired }}" hint-placeholder-val="{{ true }}">
                    <label style="font-size:11.5px;font-weight:600;color:#56664f;">Proof label (placeholder)<input value="{{ dc.proofLabel }}" onInput="{{ dc.setProofLabel }}" style="display:block;margin-top:4px;width:100%;background:#f4efe4;border:1px solid rgba(36,66,50,0.16);border-radius:8px;padding:9px 11px;font-family:'Hanken Grotesk',sans-serif;font-size:14px;color:#1b2a1f;outline:none;" /></label>
                  </sc-if>
                  <button onClick="{{ dc.remove }}" style="align-self:flex-start;background:none;border:1px solid rgba(180,81,47,0.4);cursor:pointer;font-family:'Hanken Grotesk',sans-serif;font-size:12px;font-weight:700;color:#b4512f;padding:7px 14px;border-radius:999px;">Remove this discount</button>
                </div>
              </sc-for>
            </div>
            <button onClick="{{ addDiscount }}" style="margin-top:14px;background:#244232;border:none;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;font-size:13px;font-weight:700;color:#f4efe4;padding:10px 18px;border-radius:999px;">+ Add discount</button>
          </div>
```

- [ ] **Step 4: Mirror + verify.** Mirror; `diff … && echo IDENTICAL`. Extend `_verify_disc.mjs`: drive the admin (set authed + `adminTab:'pricing'` as Phase 1's verify did); assert `discountEdits` renders 3 rows; calling a row's `setAmount` with `'150'` then re-reading `logic.discountList()` shows that amount and fires a `setContent` POST (intercept like Phase 1); `addDiscount()` appends a 4th row whose id is a frozen slug; renaming via `setName` keeps the same id; `removeDiscount(3)()` drops it. Run `node _verify_disc.mjs`; all green; then delete scratch: `rm -f _verify_disc.mjs && rm -rf node_modules package.json package-lock.json`.

- [ ] **Step 5: Commit.**

```bash
git add "index.html" "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Editable discounts: admin Discounts editor in Pricing tab (add/remove/edit, frozen ids)"
```

---

### Task 6: Backend generic concession round-trip

**Files:**
- Modify: `backend/Code.gs` — `concLine_` (~795–803); `lookup_` concession parse (~779–780).
- Test: `_verify_backend.mjs` (scratch Node, gitignored — pure string functions).

**Interfaces:**
- Consumes: the booking POST `body.concession` = `{items:[{id,name,amount,proof}], total}` (Task 2) — or, for legacy/replayed requests, the old `{pasig,pac,local,...}` shape.
- Produces: a generic `Concession:` line in the calendar event description; `lookup_` returns `concession: { label, pasig, local, pac }` (label = the raw stored string; booleans = legacy regex fallback).

- [ ] **Step 1: Generalize `concLine_`.** Replace `concLine_` (~795–803) with:

```js
// Compact concession summary written into the calendar event so lookup_ can read it back.
function concLine_(body) {
  var c = body.concession;
  if (!c) return '';
  if (c.items && c.items.length) {
    var parts = c.items.map(function (it) { return (it.name || '') + (it.proof ? (' (' + it.proof + ')') : ''); });
    return parts.length ? ('\nConcession: ' + parts.join(', ')) : '';
  }
  // legacy shape (pre-Phase-2 requests)
  var p = [];
  if (c.pasig) p.push('Pasig');
  if (c.local) p.push('Greenpark/RHS');
  if (c.pac) p.push('PAC');
  return p.length ? ('\nConcession: ' + p.join(',')) : '';
}
```

- [ ] **Step 2: Read it back as a label.** Replace the concession parse in `lookup_` (~779–780) with:

```js
    var conc = field(d, 'Concession');
    var c = conc ? { label: conc, pasig: /Pasig/i.test(conc), local: /Greenpark|RHS/i.test(conc), pac: /PAC/i.test(conc) } : null;
```

(The `label` carries the full generic string for new bookings; the regex booleans keep legacy events rendering. The frontend `concLabelFull_`/`concLabelShort_` prefer `items` → `label` → booleans, so new remote bookings show their full label.)

- [ ] **Step 3: Verify the round-trip.** Create `_verify_backend.mjs`: paste the new `concLine_` and a minimal `field(desc, key)` (reads the `key: value` line up to newline, matching the GAS helper) plus the `lookup_` parse expression. Assert: for `body.concession = {items:[{name:'Pasig City resident',proof:'addr-1'},{name:'PAC member',proof:'WAP-9'}]}`, `concLine_` returns `'\nConcession: Pasig City resident (addr-1), PAC member (WAP-9)'`; feeding that line's value back through the parse yields `label` equal to the stored string and `pasig===true && pac===true`; a legacy event value `'Pasig,Greenpark/RHS'` parses to `pasig===true && local===true`. Run `node _verify_backend.mjs`; all green; delete it: `rm -f _verify_backend.mjs`.

- [ ] **Step 4: Commit.**

```bash
git add "backend/Code.gs"
git commit -m "Editable discounts: generic concession round-trip in concLine_/lookup_ (label-based, legacy fallback)"
```

- [ ] **Step 5: Redeploy reminder.** This task changes the deployed Apps Script. After merge, tell the user to **redeploy the Apps Script Web App manually** (their standard deploy step) so live bookings store/read the generic concession label. Until redeploy, new admin-defined discounts (beyond the seeded three) won't survive the calendar round-trip on the live system.

---

## Self-Review

**Spec coverage:**
- Data model (`discounts` array, defaults, normalize, list, byId, content seed) → Task 1. ✓
- Selection state maps + dynamic booking form + sum pricing + drop both-concessions perk + self-describing concession object + proof validation → Task 2. ✓
- Edit-panel dynamic concessions + legacy-aware seeding + editAmount + saveEdit → Task 3. ✓
- Display helpers for items/label/legacy → Task 4. ✓
- Admin Discounts editor (add/remove/edit, frozen ids) → Task 5. ✓
- Generic backend round-trip + redeploy → Task 6. ✓
- Mirror rule → every index.html task ends with mirror + `diff … && echo IDENTICAL`. ✓
- Out-of-scope items (percentages, per-program selection, marketing cards) → not implemented, per spec. ✓

**Type/name consistency:** `eligSel`/`eligProof`/`editSel`/`editProof` (maps), `buildConcession(sel,proof)→{items,total}|null`, `discountRows()`, `editDiscountRows()`, `concToSel_`, `concLabelFull_`/`concLabelShort_`, `discountEdits`/`addDiscount`, `discountList()`/`discountById()`/`normalizeDiscounts()` — used identically across tasks. Concession item shape `{id,name,amount,proof}` is consistent between `buildConcession` (Task 2), `concToSel_` (Task 3), display helpers (Task 4), and backend `concLine_` (Task 6, reads `name`/`proof`).

**Placeholder scan:** no TBD/TODO; every code step shows complete code; every verify step names concrete assertions with computed expected values.
