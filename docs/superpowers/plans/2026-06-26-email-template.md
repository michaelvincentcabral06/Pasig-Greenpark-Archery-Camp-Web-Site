# Unified Branded Email Template Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every transactional email shares one branded HTML shell (header logo + consistent footer), with the logo embedded inline.

**Architecture:** A small email-logo asset + three new backend helpers (`logoBlob_`, `emailShell_`, `sendBranded_`) in `backend/Code.gs`; all six `send*_` functions refactored to build only their content and route through `sendBranded_`. No `index.html` logic change.

**Tech Stack:** Google Apps Script (ES5), jimp (Node, for the asset), Playwright-core (render-verify the HTML).

## Global Constraints

- **Backend ES5 only** (var/function; no arrow/const/let/template-literals/trailing-comma). Keep `backend/Code.gs` ≡ `backend/Code.LATEST.gs`, and add `backend/Code.v21.gs` as an identical snapshot. Bump the `version` marker to `db-v21` + add `brandedEmail: true`.
- **Embedded logo must be the small `assets/email-logo.png` (< 30 KB)**, never the 1 MB `assets/logo.png`.
- **Graceful degradation:** a missing/unfetchable logo must NEVER block or error an email — it sends without the image.
- **Reuse existing constants/helpers:** `BUSINESS_NAME`, `RANGE_ADDRESS`, `CONTACT_NUMBER`, `RESCHEDULE_NOTE`, `escapeHtml_`, `receiptRow_`, `peso_`, `prettyDate_`.
- **No deploy during implementation** (owner deploys after merge). Verified by render + review + a post-deploy test-email.
- **Mirror rule** still applies to `index.html`/`.dc.html` — but this work only ADDS `assets/email-logo.png`; it must NOT change the HTML files.

---

### Task 1: Email-optimized logo asset

**Files:** Create `assets/email-logo.png` (downscaled from `assets/logo.png`).

- [ ] **Step 1: Generate the small logo.** Install jimp if needed (`npm i jimp --no-save`), then a one-off Node script: read `assets/logo.png`, scale to fit ~160×160, max PNG compression, write `assets/email-logo.png`:
```js
import { Jimp } from 'jimp'; // or require('jimp') depending on version
const img = await Jimp.read('assets/logo.png');
img.scaleToFit({ w: 160, h: 160 });
if (img.deflateLevel) img.deflateLevel(9);
await img.write('assets/email-logo.png');
```
(Match the jimp API of the installed version — the session previously used jimp for coach photos.)

- [ ] **Step 2: Verify size + dimensions.** `ls -la assets/email-logo.png` → must be **< 30 KB**. If larger, re-run at 120×120 / higher compression until under 30 KB. Confirm it's a valid PNG (e.g. `file assets/email-logo.png`).

- [ ] **Step 3: Commit.**
```bash
git add assets/email-logo.png && git commit -m "Email: add small email-optimized logo asset (<30KB) for inline embedding in transactional emails"
```
(This asset must be live on Pages before the backend can fetch it — pushed at finish; the backend degrades gracefully until then.)

---

### Task 2: Branded email shell + refactor all six emails (`backend/Code.gs`)

**Files:**
- Modify: `backend/Code.gs` (add the constant + 3 helpers near the other email helpers ~line 400; refactor `sendReceipt_`, `sendCancellation_`, `sendReschedule_`, `sendPlanReceipt_`, `sendPlanSchedule_`, `sendPlanCancellation_`; bump version ~706)
- Then copy to `backend/Code.LATEST.gs`; create `backend/Code.v21.gs`
- Test: `_email_preview.mjs` (scratch, render the HTML)

**Interfaces:** Produces `logoBlob_()`, `emailShell_(title, accent, innerHtml, hasLogo)`, `sendBranded_(o)`; each `send*_` keeps its existing `o` params.

- [ ] **Step 1: Add the logo URL constant.** Near the other constants (~line 34, after `BUSINESS_NAME`):
```js
var EMAIL_LOGO_URL = 'https://michaelvincentcabral06.github.io/Pasig-Greenpark-Archery-Camp-Web-Site/assets/email-logo.png';
```

- [ ] **Step 2: Add `logoBlob_()`** (near the email helpers, e.g. above `sendReceipt_`):
```js
// Fetch the small email logo (cached ~6h) as a Blob for inline embedding. Null-safe:
// any failure returns null so the email still sends, just without the logo.
function logoBlob_() {
  try {
    var cache = CacheService.getScriptCache();
    var b64 = cache ? cache.get('emailLogoB64') : null;
    if (!b64) {
      var resp = UrlFetchApp.fetch(EMAIL_LOGO_URL, { muteHttpExceptions: true });
      if (resp.getResponseCode() !== 200) return null;
      b64 = Utilities.base64Encode(resp.getBlob().getBytes());
      if (cache && b64.length < 95000) cache.put('emailLogoB64', b64, 21600);
    }
    return Utilities.newBlob(Utilities.base64Decode(b64), 'image/png', 'logo');
  } catch (e) { return null; }
}
```

- [ ] **Step 3: Add `emailShell_()`:**
```js
// One branded wrapper for every transactional email: header band (logo + name),
// body card (title in `accent` + innerHtml), footer (where/contact/business name).
function emailShell_(title, accent, innerHtml, hasLogo) {
  var logoCell = hasLogo
    ? '<td style="padding-right:12px;vertical-align:middle;"><img src="cid:logo" width="40" height="40" alt="" style="display:block;border-radius:8px;" /></td>'
    : '';
  return '<div style="background:#eef1e6;padding:24px 0;font-family:Arial,Helvetica,sans-serif;">'
    + '<div style="max-width:520px;margin:0 auto;background:#fffdf6;border-radius:14px;overflow:hidden;border:1px solid rgba(36,66,50,0.12);">'
    +   '<div style="background:#244232;padding:18px 22px;">'
    +     '<table role="presentation" cellpadding="0" cellspacing="0"><tr>' + logoCell
    +       '<td style="vertical-align:middle;color:#f4efe4;font-size:16px;font-weight:bold;">' + escapeHtml_(BUSINESS_NAME) + '</td>'
    +     '</tr></table>'
    +   '</div>'
    +   '<div style="padding:24px 22px;color:#1b2a1f;">'
    +     '<h2 style="margin:0 0 8px;font-size:20px;color:' + accent + ';">' + escapeHtml_(title) + '</h2>'
    +     innerHtml
    +   '</div>'
    +   '<div style="padding:18px 22px;border-top:1px solid rgba(36,66,50,0.1);font-size:12.5px;color:#56664f;line-height:1.6;">'
    +     '<strong>Where</strong><br>' + escapeHtml_(RANGE_ADDRESS) + '<br>' + escapeHtml_(CONTACT_NUMBER) + '<br><br>'
    +     escapeHtml_(RESCHEDULE_NOTE) + '<br><br>'
    +     '<strong style="color:#244232;">' + escapeHtml_(BUSINESS_NAME) + '</strong>'
    +   '</div>'
    + '</div></div>';
}
```

- [ ] **Step 4: Add `sendBranded_()`** (the single send path):
```js
// o: { to, subject, plainText, title, accent, innerHtml }
function sendBranded_(o) {
  if (!o || !o.to) return false;
  var blob = logoBlob_();
  var html = emailShell_(o.title || BUSINESS_NAME, o.accent || '#244232', o.innerHtml || '', !!blob);
  var opts = { to: o.to, subject: o.subject, body: o.plainText || '', htmlBody: html, name: BUSINESS_NAME };
  if (blob) opts.inlineImages = { logo: blob };
  MailApp.sendEmail(opts);
  return true;
}
```

- [ ] **Step 5: Refactor the two plain-text emails to the shell.**
  - **`sendCancellation_`** → keep guard + `var when = prettyDate_(o.dateStr);`; build `innerHtml` = a short greeting `<p>` + a `<table>` of `receiptRow_('Reference', o.ref)` / `'Program'` / `'Date', when` / (`o.time` ? `'Time', o.time`); keep the existing `body` lines as `plainText`; then:
    ```js
    return sendBranded_({ to: o.email, subject: BUSINESS_NAME + ' — Booking cancelled' + (o.ref ? ' (' + o.ref + ')' : ''),
      plainText: body, title: 'Booking cancelled', accent: '#b4512f',
      innerHtml: '<p style="color:#56664f;margin:0 0 16px;">Hi ' + escapeHtml_(o.name || 'there') + ', your session has been cancelled.</p>'
        + '<table style="border-collapse:collapse;width:100%;font-size:14px;">' + rows + '</table>' });
    ```
  - **`sendReschedule_`** → same pattern; `innerHtml` greeting + table rows `Reference` / `Program` / `Was: prettyDate_(o.oldDate) (+ o.oldTime)` / `Now: prettyDate_(o.newDate) (+ o.newTime)`; `plainText` = the existing `body`; `title: 'Booking rescheduled'`, `accent: '#8a6a1f'`. Return `sendBranded_({...})`.
  (Build the `<tr>` rows with `receiptRow_`; keep each function's existing input `o` and plain-text content.)

- [ ] **Step 6: Refactor the four HTML emails to the shell.** For `sendReceipt_`, `sendPlanReceipt_`, `sendPlanSchedule_`, `sendPlanCancellation_`: keep all their existing data prep and **inner** content (the greeting `<p>` + the `<table>…</table>` of rows). REMOVE from each: the outer `'<div style="font-family:…max-width:520px;">'` wrapper, the leading `'<h2 …>Title</h2>'`, the footer `<p>`Where/note/`BUSINESS_NAME`</p> lines, and the `MailApp.sendEmail({…})` call. Set `innerHtml` = (greeting `<p>` + the `<table>…</table>`) and finish with `return sendBranded_({ to:o.email, subject:subject, plainText:body, title:<title>, accent:<accent>, innerHtml:innerHtml });` using:
  - `sendReceipt_`: title `'Booking confirmed'`, accent `'#3c6b48'`.
  - `sendPlanReceipt_`: title `'Pass confirmed'`, accent `'#3c6b48'`.
  - `sendPlanSchedule_`: title = the existing `headline` variable, accent `'#3c6b48'`.
  - `sendPlanCancellation_`: title `'Pass cancelled'`, accent `'#b4512f'`.
  Keep each function's existing plain-text `body`/`lines` as `plainText`.

- [ ] **Step 7: Bump version.** In the `version` doGet case (~706), change `'db-v20'` → `'db-v21'` and add `brandedEmail: true` to the flags.

- [ ] **Step 8: Sync copies.** `cp backend/Code.gs backend/Code.LATEST.gs`; `cp backend/Code.gs backend/Code.v21.gs`; verify `diff backend/Code.gs backend/Code.LATEST.gs && diff backend/Code.gs backend/Code.v21.gs && echo IDENTICAL`.

- [ ] **Step 9: Render-verify the shell (build `_email_preview.mjs`).** Extract `emailShell_` into a tiny Node copy (or inline-replicate it) and render a representative email of each accent (confirmed/green, rescheduled/amber, cancelled/red) to an HTML file; open in headless Chromium (chromium at `C:\Users\Michael Cabral\AppData\Local\ms-playwright\chromium-1228\chrome-win64\chrome.exe`; install playwright-core if needed) and screenshot each. Visually confirm: identical header/footer, title tint differs, details table aligned, layout clean at email width. Use a placeholder logo box (the real `cid:logo` only resolves in a mail client). Also `grep` the new backend code for ES5 violations (`=>`, `\bconst `, `\blet `, backtick) — expect none. Delete scratch (`_email_preview.mjs`, `*.png`, `node_modules`, `package.json`, `package-lock.json`).

- [ ] **Step 10: Commit.**
```bash
git add backend/Code.gs backend/Code.LATEST.gs backend/Code.v21.gs
git commit -m "Email T2: unified branded shell (emailShell_/sendBranded_/logoBlob_); all 6 emails embed the logo + share header/footer; status-tinted titles; db-v21"
```

---

## Self-review notes

- **Spec coverage:** small logo asset (T1); `logoBlob_` null-safe embed (T2 S2); `emailShell_` header/body/footer (S3); `sendBranded_` single path + plain-text fallback + inlineImages (S4); all 6 refactored with status tints (S5-6); db-v21 + copies (S7-8); render-verify (S9). All map.
- **Graceful degradation:** `logoBlob_` try/catch → null; `sendBranded_` only adds `inlineImages` when a blob exists; `emailShell_` renders a text-only header when `!hasLogo`.
- **ES5 + copies:** all new code var/function; `.gs` copies identical (S8); ES5 grep in S9.
- **No HTML-file change:** only `assets/email-logo.png` is added; `index.html`/`.dc.html` untouched (mirror stays valid).
- **Reuse:** constants + `receiptRow_`/`peso_`/`prettyDate_`/`escapeHtml_` reused, not duplicated.
- **Deploy:** asset pushed to Pages before/with the backend deploy; backend degrades gracefully if the asset isn't live yet.
