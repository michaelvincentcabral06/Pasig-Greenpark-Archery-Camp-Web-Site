# Dynamic pricing & programs (sub-project C)

**Date:** 2026-06-24
**Problem:** Package/schedule/fun-shoot content is editable in the admin Pricing tab but saved
only to the admin device's localStorage, so customers and other devices never see changes.
The per-program rates (Open Range ₱400 / session ₱600 / Private ₱1,200) and per-hour capacity
live in config props and aren't editable at all. There's no backend content storage.

**Goal:** Make the content model **server-backed** (so admin edits reach every customer + device)
and add **rate + capacity editing** to the admin Pricing tab. New backend **db-v15**.

Constraints:
- Mirror rule: every `index.html` edit applied identically to
  `Pasig Greenpark Archery Camp.dc.html` (byte-identical).
- Backend is Google Apps Script (`backend/Code.gs`, currently db-v14) — db-v15 is **deployed
  manually**; I cannot test Apps Script live. Backend is review-gated + a deploy checklist;
  the frontend is verified with a stubbed db-v15.
- Apps Script style: ES5 (`var`/`function`, no arrow/`const`/`let`), trailing-underscore privates.

## Decisions (from brainstorming)
- Editable + synced: **packages + the 3 program rates + per-hour capacity** (plus the
  already-in-content schedule/scheduleNote/funShoot ride along for free).
- Server is the source of truth; the public site loads content on every visit; baked defaults
  are the fallback if the backend is unreachable / nothing saved.
- `setContent` is unauthenticated, consistent with every other POST in this backend (book,
  savePlan, clearAll…) — a **pre-existing** limitation, not introduced here; the admin UI is
  gated client-side. (Noted, not fixed.)

## Backend changes (db-v15: `backend/Code.gs` + keep `Code.LATEST.gs`/new `Code.v15.gs` identical)
1. **Content storage helpers + actions:**
```js
function getContent_() {
  var raw = PropertiesService.getScriptProperties().getProperty('CONTENT');
  var c = {}; if (raw) { try { c = JSON.parse(raw); } catch (e) { c = {}; } }
  return json_({ content: c });
}
function setContent_(body) {
  var c = body.content || {};
  PropertiesService.getScriptProperties().setProperty('CONTENT', JSON.stringify(c));
  return json_({ ok: true });
}
```
2. **Route:** `doGet` → `if (action === 'content') return getContent_();`. `doPost` → `if (body.action === 'setContent') return setContent_(body);`.
3. **Version:** bump the `version` response to `db-v15` and add `contentStore: true`.
4. Sync the three `.gs` files byte-identical.

## Frontend changes (`index.html` + mirror)
1. **Content model gains `rates` + `capacity`** (`mergedContent`, ~2665):
```js
      rates: c.rates || defaults.rates,
      capacity: c.capacity != null ? c.capacity : defaults.capacity,
```
And the `cm = this.mergedContent({...})` call (~3787) defaults gain:
`rates: { openRange: 400, session: 600, private: 1200 }, capacity: 6`.
2. **`rateFor` / `capacity()` read from the content model**, falling back to props/defaults:
```js
  cfgRates() {
    var c = (this.state.content && this.state.content.rates) || {};
    return {
      openRange: Number(c.openRange) || Number(this.props.openRangeRate) || 400,
      session: Number(c.session) || Number(this.props.sessionRate) || 600,
      priv: Number(c.priv != null ? c.priv : c.private) || Number(this.props.privateRate) || 1200,
    };
  }
  // rateFor: var r = this.cfgRates(); Open Range -> r.openRange; /Private/ -> r.priv; else r.session.
  // capacity(): var c = this.state.content; return (c && c.capacity != null ? Number(c.capacity) : (Number(this.props.capacityPerHour) || 6)) || 6;
```
(Use key `priv` internally to avoid the reserved-ish word; the stored JSON key is `private`,
read via `c.private` — keep both readable: `c.priv != null ? c.priv : c.private`.)
3. **Load content from the backend on mount.** In `componentDidMount` (~2641), after the
   existing localStorage `setState`, call a new `loadContentRemote()`:
```js
  loadContentRemote() {
    var ep = this.endpoint(); if (!ep) return;
    fetch(ep + '?action=content').then(function (r) { return r.json(); }).then(function (res) {
      if (res && res.content && Object.keys(res.content).length) {
        try { localStorage.setItem('pgac_content', JSON.stringify(res.content)); } catch (e) {}
        this.setState({ content: res.content });
      }
    }.bind(this)).catch(function () {});
  }
```
4. **Save propagates to the backend.** In `persistContent` (~2657), after the localStorage
   write + setState, POST it:
```js
    var ep = this.endpoint();
    if (ep) { try { fetch(ep, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'setContent', content: content }) }).catch(function () {}); } catch (e) {} }
```
5. **Admin Pricing tab: rate + capacity fields.** In the `tabPricing` section (~2171), add a
   "Booking rates" group with number inputs for Open Range rate, session rate, Private rate,
   and per-hour capacity. Bindings (near `updatePackage`/the pricing bindings ~4126):
   - values `rateOpenEdit/rateSessionEdit/ratePrivateEdit/capacityEdit` from `cm.rates`/`cm.capacity`;
   - setters that `saveCM({ rates: { ...cm.rates, openRange|session|private: Number(v)||0 } })` and `saveCM({ capacity: Number(v) || 6 })`.
6. The Passes page (`cm.packages`) and the booking quote (`rateFor`/`capacity`) already consume
   the merged content, so they reflect edits automatically once content loads.

## Out of scope
- Editing the ₱100 eligibility concession amount (hardcoded `eligPerArcher`) — leave as-is.
- Per-program rate beyond the existing 3 buckets; backend auth (pre-existing).
- Real-time push (content refreshes on page load, which is sufficient).

## Risks / watch-items
- `rateFor`/`capacity` are hot paths (used by the quote + availability). Changing their source
  must keep the exact fallback to props/defaults so a missing/empty content value can never
  yield 0 or NaN.
- Content load is async; the public site renders defaults first, then re-renders when the
  backend content arrives (acceptable; same pattern as plans/coaches load).
- index.html and the .dc.html mirror byte-identical; the three `.gs` files byte-identical.
- I cannot live-test Apps Script — backend rests on review + the deploy checklist.

## Verification
- **Frontend (Playwright, stubbed db-v15):** stub `?action=content` to return
  `{ content: { rates: { openRange: 555 }, capacity: 4 } }`; confirm the booking quote uses ₱555
  for Open Range and the capacity copy shows 4. Edit a rate in the admin Pricing tab → confirm
  a `setContent` POST fires with the new value and the quote updates. Edit a package price →
  `setContent` fires. Mirror parity IDENTICAL.
- **Backend (cannot run here): deploy checklist in `backend/SETUP.md`** — deploy db-v15,
  confirm `?action=version` = `db-v15` with `contentStore:true`; edit a price in admin; confirm
  `?action=content` returns it; load the public site on another device and confirm the new
  price shows.
