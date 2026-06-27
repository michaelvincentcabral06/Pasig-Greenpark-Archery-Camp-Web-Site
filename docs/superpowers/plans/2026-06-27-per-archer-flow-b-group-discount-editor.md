# Per-Archer Booking Flow (Plan B) — Admin Group-Discount Editor

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the admin a Pricing-tab editor for the group discount — a per-program "Group discount" on/off toggle and an editable list of tiers (Min archers · % off).

**Architecture:** Frontend-only changes to `index.html` (custom "SuperConductor" template app), mirrored to `Pasig Greenpark Archery Camp.dc.html`. The data model (`groupTiers` content array, per-program `groupDiscount` boolean) and the pricing that reads them already shipped in Plan A; this plan only adds the admin editor UI, mirroring the existing Programs / Concession-discounts editors. No backend change, no redeploy.

**Tech Stack:** SuperConductor template, plain class-component JS, Playwright-core (HTTP-served) for verification.

## Global Constraints

- **Mirror rule:** every `index.html` edit mirrored verbatim to `Pasig Greenpark Archery Camp.dc.html`; end each task with `diff "index.html" "Pasig Greenpark Archery Camp.dc.html" && echo IDENTICAL`.
- **Frontend-only. No backend change, no redeploy.** Pushes to GitHub Pages.
- **SuperConductor:** NO JS expressions inside style/attribute `{{ }}` — precompute in the data layer; straight ASCII quotes; per-item `<sc-for>` rows carry their own values + closures built in the data layer.
- **Already in the codebase (Plan A):** `groupTiers()` (normalized `[{minParty,pct}]`), `normalizeGroupTiers(list)`, `defaultGroupTiers()`, `tierPctFor(party)`; per-program `groupDiscount` (normalized, default true). The admin content-save helper is `saveCM(patch)` = `this.persistContent({...cm, ...patch})`; `cm` = `mergedContent(...)`. The Programs editor uses `toggleProg(i,key)` + `programEdits`; the Concession-discounts editor uses `setDiscNum`/`addDiscount`/`discountEdits` (mirror these).
- **Verification:** Playwright-core, **served over HTTP** (file:// breaks the dc runtime). Chromium at `C:\Users\Michael Cabral\AppData\Local\ms-playwright\chromium-1228\chrome-win64\chrome.exe`; install `playwright-core` if missing (`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i playwright-core --no-save`). Minimal node static server (scratch `_srv.mjs` on 127.0.0.1:8099); reach the component instance via the page root `__reactContainer$…` fiber; drive the admin Pricing tab (set authed + `adminTab:'pricing'` via `setState`); spy `persistContent` (file:// CORS blocks the real `setContent` POST) as the Concession-discounts editor verify did. Scratch files (`_srv.mjs`, `_verify.mjs`, `node_modules`, `package*.json`) must NOT be committed.

---

### Task 1: Per-program "Group discount" toggle

**Files:** Modify `index.html` — the `programEdits` builder (~4966–4970, where `coachBg`/`discBg`/`toggleCoach`/`toggleDisc` are); the Programs-editor row markup (~2378–2379, the toggle-button row). Mirror. Test `_verify.mjs`.

**Interfaces:**
- Consumes: `toggleProg(i,key)` (existing), per-program `groupDiscount` (Plan A).
- Produces: per-row `groupBg`/`groupFg` + `toggleGroup` on each `programEdits` entry; a "Group discount" toggle button in each program row.

- [ ] **Step 1: Builder bindings.** In the `programEdits` `.map((p,i)=>({…}))` object, beside the existing `coachBg`/`coachFg` and `discBg`/`discFg` lines, add:
```js
      groupBg: p.groupDiscount ? '#244232' : '#fffdf6', groupFg: p.groupDiscount ? '#f4efe4' : '#244232',
```
and beside `toggleCoach`/`toggleDisc` add:
```js
      toggleGroup: toggleProg(i, 'groupDiscount'),
```

- [ ] **Step 2: Markup.** In the Programs-editor row toggle-button group, immediately AFTER the `<button onClick="{{ pg.toggleDisc }}" …>Discounts</button>` line, add:
```html
                    <button onClick="{{ pg.toggleGroup }}" style="background:{{ pg.groupBg }};color:{{ pg.groupFg }};border:1px solid rgba(36,66,50,0.3);cursor:pointer;font-family:'Hanken Grotesk',sans-serif;font-size:12px;font-weight:700;padding:7px 14px;border-radius:999px;">Group discount</button>
```

- [ ] **Step 3: Mirror + verify.** Mirror; `diff … && echo IDENTICAL`. `_verify.mjs`: drive the admin Pricing tab; assert each Programs-editor row shows a "Group discount" button; clicking it on a program flips that program's `groupDiscount` (re-read `logic.programList()[i].groupDiscount`) and fires `persistContent`; the button color reflects on/off (`groupBg` `#244232` when on, `#fffdf6` when off). 0 real page errors.

- [ ] **Step 4: Commit.**
```bash
git add "index.html" "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Plan B: per-program Group discount toggle in the Programs editor"
```

---

### Task 2: Group-discount tiers editor

**Files:** Modify `index.html` — add tier-editor handlers next to the discounts-editor handlers (~4983–4990); expose `tierEdits`/`addTier` in the data-layer return (~6035, beside `discountEdits, addDiscount`); add the editor markup in the Pricing tab after the Concession-discounts section (~2421, after the "+ Add discount" button's wrapping `</div>`). Mirror. Test.

**Interfaces:**
- Consumes: `groupTiers()`/`normalizeGroupTiers` (Plan A), `saveCM`.
- Produces: locals `setTierNum`, `addTier`, `removeTier`, `tierEdits`; data bindings `tierEdits`, `addTier`.

- [ ] **Step 1: Handlers.** Immediately after the `const discountEdits = …` block (and before `pkgEdits`), add:
```js
    const setTierNum = (i, key) => (e) => { const v = (e.target.value === '' ? 0 : (Number(e.target.value) || 0)); const ts = this.groupTiers().map((t, idx) => idx === i ? { ...t, [key]: v } : t); saveCM({ groupTiers: ts }); };
    const removeTier = (i) => () => saveCM({ groupTiers: this.groupTiers().filter((_, idx) => idx !== i) });
    const addTier = () => saveCM({ groupTiers: this.normalizeGroupTiers(this.groupTiers().concat([{ minParty: 2, pct: 10 }])) });
    const tierEdits = this.groupTiers().map((t, i) => ({
      minParty: t.minParty, pct: t.pct,
      setMinParty: setTierNum(i, 'minParty'), setPct: setTierNum(i, 'pct'), remove: removeTier(i)
    }));
```

- [ ] **Step 2: Expose in the data layer.** In the `renderVals` return where `…discountEdits, addDiscount, …` are listed, add `tierEdits, addTier,`.

- [ ] **Step 3: Markup.** In the Pricing tab, immediately AFTER the Concession-discounts section's closing `</div>` (after the `+ Add discount` button, ~line 2422) and before the next sibling block, insert:
```html
          <div style="margin-top:28px;">
            <div style="font-size:15px;font-weight:800;color:#1b2a1f;margin-bottom:4px;">Group discount tiers</div>
            <p style="font-size:13px;color:#56664f;margin:0 0 12px;">Applies to programs with Group discount on. A group of N gets the % of the highest tier whose &ldquo;min archers&rdquo; it reaches.</p>
            <div style="display:flex;flex-direction:column;gap:10px;">
              <sc-for list="{{ tierEdits }}" as="tr" hint-placeholder-count="3">
                <div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;background:#fffdf6;border:1px solid rgba(36,66,50,0.12);border-radius:12px;padding:14px 16px;">
                  <label style="font-size:11.5px;font-weight:600;color:#56664f;">Min archers<input value="{{ tr.minParty }}" onInput="{{ tr.setMinParty }}" type="number" min="1" style="display:block;margin-top:4px;width:90px;background:#f4efe4;border:1px solid rgba(36,66,50,0.16);border-radius:8px;padding:9px 11px;font-family:'Hanken Grotesk',sans-serif;font-size:14px;font-weight:700;color:#1b2a1f;outline:none;" /></label>
                  <label style="font-size:11.5px;font-weight:600;color:#56664f;">% off<input value="{{ tr.pct }}" onInput="{{ tr.setPct }}" type="number" min="0" max="100" style="display:block;margin-top:4px;width:90px;background:#f4efe4;border:1px solid rgba(36,66,50,0.16);border-radius:8px;padding:9px 11px;font-family:'Hanken Grotesk',sans-serif;font-size:14px;font-weight:700;color:#1b2a1f;outline:none;" /></label>
                  <button onClick="{{ tr.remove }}" style="background:none;border:1px solid rgba(180,81,47,0.4);cursor:pointer;font-family:'Hanken Grotesk',sans-serif;font-size:12px;font-weight:700;color:#b4512f;padding:8px 14px;border-radius:999px;">Remove</button>
                </div>
              </sc-for>
            </div>
            <button onClick="{{ addTier }}" style="margin-top:14px;background:#244232;border:none;cursor:pointer;font-family:'Hanken Grotesk',sans-serif;font-size:13px;font-weight:700;color:#f4efe4;padding:10px 18px;border-radius:999px;">+ Add tier</button>
          </div>
```

- [ ] **Step 4: Mirror + verify.** Mirror; `diff … && echo IDENTICAL`. `_verify.mjs`: drive the admin Pricing tab; assert `tierEdits` renders 3 rows (the seeded 2/3/5 tiers); calling a row's `setPct` with `'25'` re-reads `logic.groupTiers()[i].pct === 25` and fires `persistContent`; `setMinParty` updates `minParty`; `addTier()` appends a tier (and re-normalizes/sorts); `removeTier` drops one; after editing, `logic.tierPctFor(party)` reflects the new tiers (e.g. set the 3-tier to 25% → `tierPctFor(3) === 0.25`). Run `node _verify.mjs`; then delete scratch (`rm -f _verify.mjs _srv.mjs package.json package-lock.json && rm -rf node_modules`).

- [ ] **Step 5: Commit.**
```bash
git add "index.html" "Pasig Greenpark Archery Camp.dc.html"
git commit -m "Plan B: Group discount tiers editor in the Pricing tab"
```

---

## Self-Review

**Spec coverage** (against `2026-06-27-per-archer-booking-flow-design.md`, Section 3 — the admin editor half; the data model + pricing already shipped in Plan A):
- Per-program "Group discount" toggle in the Programs editor → Task 1. ✓
- "Group discount tiers" editor (Min archers · % off, add/remove/edit) in the Pricing tab → Task 2. ✓
- Persists via `saveCM`→`persistContent`→authed `setContent` (same path as discounts) → both tasks. ✓
- Frontend-only, mirror rule, SuperConductor rules → Global Constraints. ✓
- **Out of scope (correctly):** the data model + `tierPctFor`/`discountFor` pricing (already live in Plan A); backend per-archer wiring (Plan C).

**Placeholder scan:** no TBD/TODO; every code step shows complete code or an exact anchored insertion; verify steps name concrete assertions with computed expected values (e.g. `tierPctFor(3)===0.25` after editing).

**Type/name consistency:** `toggleGroup`/`groupBg`/`groupFg` (Task 1); `setTierNum`/`addTier`/`removeTier`/`tierEdits` + row fields `minParty`/`pct`/`setMinParty`/`setPct`/`remove` (Task 2) — consistent with the Plan-A `groupTiers()`/`normalizeGroupTiers` shape `{minParty,pct}` and the existing `discountEdits`/`programEdits` editor patterns.
