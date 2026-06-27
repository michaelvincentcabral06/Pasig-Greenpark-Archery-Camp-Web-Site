# Booking ↔ Google Calendar — Setup Guide

This connects the website's booking form to your Google Calendar so that:

- Visitors see **real-time availability** (e.g. "4 of 6 left"),
- A booking **creates a real calendar event**,
- The customer is **emailed a receipt** (reference no., date/times, program, total to pay, address),
- Admin can **cancel a booking** from the Manage dashboard — which **deletes the calendar event** and **emails the customer a cancellation notice**,
- The **6-archers-per-hour cap is enforced** and can't be bypassed,
- Coaches see everything in the one Google Calendar they already use.

The website front-end is **already built** for this. Until you finish the steps below it runs in **preview mode** (sample availability, no real email). Once you paste in the web-app URL, it goes live against your real calendar — no website changes needed.

> ⚠️ **If you already deployed an earlier version**, you must **re-deploy** (Part C) for the new **email receipts** and **admin cancel** to work — the old deployment doesn't have them.

---

## Part A — Deploy the backend (~15 min, one time)

1. Go to **[script.google.com](https://script.google.com)** → **New project**.
2. Delete the sample code, then **paste the entire contents of `backend/Code.gs`**.
3. At the top, check the **CONFIG** block:
   - `CALENDAR_ID` is already set to your camp calendar.
   - `CAPACITY` = `6` (archers per hour) — change if needed.
   - `SESSION_RATE` / `PRIVATE_RATE` — the per-archer prices used on the receipt total. Keep these in sync with the site's Tweaks (`sessionRate` / `privateRate`).
   - `BUSINESS_NAME`, `RANGE_ADDRESS`, `CONTACT_NUMBER` — shown on the receipt email. Edit to taste.
   - `OPEN_HOURS` matches your current hours (Mon closed, Tue–Fri 4–8pm, Sat 9–6, Sun 9–3). Edit if your hours change.
4. Click **Save** (💾).
5. Click **Deploy → New deployment** → gear icon → **Web app**.
   - **Description:** Booking backend
   - **Execute as:** **Me** (your Google account)
   - **Who has access:** **Anyone**
6. Click **Deploy**. Google will ask you to **authorize** — approve it. It needs permission to **manage your calendar** *and* to **send email as you** (`MailApp`); both are on the same consent screen.
7. Copy the **Web app URL** (ends in `/exec`).

> Receipts are sent from the **Google account that owns this script** (the one you authorize). Free Gmail allows ~100 emails/day, which is plenty for bookings.

> Why "Execute as: Me" + "Anyone": the script runs as *you*, so it can read/write your calendar securely. Visitors never get any credentials — they only ever reach this script.

---

## Part B — Connect the website (~1 min)

The deployed site reads its endpoint from a **hardcoded fallback in the HTML**, *not* from the editor's Tweaks panel. (Tweak/prop values only apply inside the editor — the standalone runtime renders with empty props, so the URL must live in the code.)

1. Open **`Pasig Greenpark Archery Camp.dc.html`** in a text editor.
2. Find the `endpoint()` method (search for `bookingEndpoint`). It looks like:
   ```js
   endpoint() {
     var ep = this.props.bookingEndpoint;
     if (ep == null) ep = 'https://script.google.com/macros/s/AKfyc…/exec';  // ← live URL
     return (ep || '').trim();
   }
   ```
3. Replace the URL on the `if (ep == null) ep = '…'` line with your **Web-app URL** (ends in `/exec`).
4. For consistency, also paste the same URL into the `bookingEndpoint` **`default`** in the `data-props` of the `<script data-dc-script …>` tag — so the editor preview matches the live site.
5. Done. The booking form now reads live availability and books real events.

> Because the runtime keeps using the **same `/exec` URL** as long as you *update the existing deployment* (Part C), you normally only do this once. You only need to edit the URL again if you create a brand-new deployment.

(To force preview/sample mode for a demo, set the fallback URL to an empty string `''`.)

---

## How it behaves once live

| Visitor / admin action | What happens |
|---|---|
| Picks a date | Form calls the script, shows each open hour with spots left |
| Picks a full hour | It's greyed out and not selectable |
| Confirms a booking | Script re-checks capacity, creates the calendar event(s), and **emails the customer a receipt** |
| Hour just filled up | Booking is rejected and the form suggests open times |
| Admin clicks **Cancel** on a booking | Script **deletes that calendar event** and **emails the customer a cancellation notice**, then it's removed from the dashboard |

---

## Part C — Re-deploying after edits (IMPORTANT)

Whenever you change `Code.gs` (including upgrading to this version with **email receipts + cancel**):

1. Paste the new `Code.gs`, **Save**.
2. **Deploy → Manage deployments → edit (✏️) → Version: New version → Deploy.**
   - This keeps the **same `/exec` URL**, so you don't need to touch the website.
3. If you added email for the first time, Google may ask you to **re-authorize** (to grant the send-email permission). Approve it.

> If you instead create a *brand-new* deployment you'll get a *new* URL — then you must paste that new URL into the site's `bookingEndpoint` Tweak.

---

## Part D — Turn on email receipts (do this once) 🔑

The calendar permission and the **send-email** permission are **separate**. A booking can succeed (event created) while the receipt silently fails because email was never authorized. To grant it:

1. In the Apps Script editor, open the **function dropdown** (top toolbar, next to ▶ Run) and choose **`authorizeAndTestEmail`**.
2. Click **▶ Run**.
3. A permission dialog appears — approve it. This time it asks to **“Send email as you”** (`MailApp`). Click **Allow**.
4. Check your inbox (and Spam) — a **sample receipt** should arrive. If it does, real booking receipts will send too.

> You only need to do this once per script. After this, every booking emails the customer automatically.
> If no email arrives: confirm you ran `authorizeAndTestEmail` (not another function), check Spam, and make sure your Google account isn't over the ~100 emails/day free limit.

---

## Part D½ — Turn on the database sheet (do this once) 🗂️

Every booking, pass, and cancellation is now also recorded in **one Google Sheet** so you have a single place to see everything (the calendar stays your scheduling view). The sheet is created automatically — you just run a one-time setup so you get its link.

1. In the Apps Script editor, open the **function dropdown** (next to ▶ Run) and choose **`setupDatabase`**.
2. Click **▶ Run** and approve the permission prompt (this time it asks for **Spreadsheets/Drive** access — click **Allow**).
3. Open **View → Logs** (or **Execution log**). It prints a line like *"✅ Database ready. Open/bookmark it here: https://docs.google.com/spreadsheets/…"* — **open that link and bookmark it.** That's your database.

It has three tabs:
- **Bookings** — every booked hour, with status (`booked` / `cancelled`), ref, name, email, program, archers, amount, coach.
- **Passes** — every pass a customer buys, with the holder, assigned coach, and scheduled sessions.
- **Cancellations** — an audit log of every cancellation: when, which booking, and **who cancelled** (`customer`, `admin`, `reschedule`, or `plan removed`).

> Writes to the sheet are best-effort: if the sheet ever fails, the booking + calendar event + email still go through. Nothing is lost.
> This requires a **re-deploy** (Part C) so the new backend is live.

---

## Part E — Cleaning up extra deployments

If you clicked **“New deployment”** several times, you now have **many deployments** (each with its own `/exec` URL) cluttering the activity list. You only need **one**. To tidy up:

1. **Deploy → Manage deployments.**
2. Note which deployment's URL matches the one in the site's **`bookingEndpoint`** Tweak — **that's the one to keep.** (Easiest: keep the newest one that has the latest code, and if its URL differs from the site's, paste the new URL into `bookingEndpoint`.)
3. For every *other* deployment: click it → **🗑️ Archive**. Archiving disables that URL.

> ⚠️ **Don't archive the deployment the website is using** — that breaks booking. Keep exactly one active deployment, and make sure the site's `bookingEndpoint` points to its `/exec` URL.
>
> Going forward, **always update the existing deployment** (Part C: *Manage deployments → ✏️ → New version*) instead of creating a new one — that reuses the same URL and won't pile up.

---

## Testing it

- In a browser, open your `/exec` URL with `?action=availability&date=2026-06-20` on the end — you should get JSON with the day's slots.
- Make a test booking on the site using **your own email**, then check: (1) the event appears on your Google Calendar, and (2) the receipt lands in your inbox.
- In the **Manage** dashboard, click **Cancel** on that test booking — confirm the calendar event disappears and a cancellation email arrives. (Delete any leftover test events.)

---

## Coaches & per-coach availability (NEW)

Coach-led programs (everything except **Open Range**) now let the customer pick a **specific coach** or **“Any available coach.”** The booking form only shows hours that coach has opened for the chosen date.

Each coach manages their own hours from the website's **Coach portal** (footer → “Coach portal”). They sign in with a personal passcode and tap a date, then tap the hours they can coach. Changes save instantly.

- Coaches and their passcodes live in the **`COACHES`** array near the top of `Code.gs` (and must match the site's `coaches()` list). Edit names or codes there.
- A coach's custom hours are stored in **Script Properties** as `avail:<coachId>:<date>` — no spreadsheet needed. If a coach hasn't customized a date, they keep the **standard weekday hours** (`OPEN_HOURS`).
- The backend gains two POST actions, both passcode-checked:
  - `{action:"setCoachAvail", coach, pass, date, hours}` → save that coach's hours for the date (`hours:null` reverts to standard).
  - `{action:"coachLogin", coach, pass}` → verify a coach's code.
- Availability is coach-aware: `?action=availability&date=…&coach=<id>` returns just that coach's open hours; `coach=any` returns the union across coaches; no `coach` param keeps the standard template (used by Open Range).
- Bookings record the coach in the calendar **event title** (`· Coach <First>`) and **description** (`Coach: <Name>`), so coaches can see who's assigned.

> Until the backend is deployed, the Coach portal and coach filtering run in **preview mode** against this browser's local storage — fully usable for demos. Once the web-app URL is set in the site's `bookingEndpoint` Tweak, coach hours and bookings sync through the script.

## Passes & memberships sync (NEW — re-deploy required)

Passes (Day Pass, Starter Pack, Monthly Member, Private Coaching) bought on the website now **sync to the backend**, so a customer's pass is visible on **any device** and the **admin can assign a coach + schedule sessions from any computer** (previously passes lived only in the buyer's browser).

- Each pass is stored in **Script Properties** as `plan:<email>:<ts>` — the full plan object (`name`, `holder`, `coach`, `sessions[]`). No spreadsheet needed.
- New endpoints:
  - `POST {action:"savePlan", email, plan}` → create/update a pass (called whenever a customer buys one, or the admin assigns a coach / schedules a session).
  - `POST {action:"removePlan", email, ts}` → delete a pass.
  - `GET ?action=plans` → every customer's passes (admin Plans tab).
  - `GET ?action=plans&email=<email>` → one customer's passes (My Bookings).
- Scheduling a pass session still creates a real **calendar event** (via the existing `book` action with `noEmail:true`), so coaches see it on the shared calendar.

> ⚠️ This needs a **re-deploy** (SETUP Part C: *Manage deployments → ✏️ → New version*) so the new actions go live. Until then, passes fall back to **browser-local** mode (visible only on the device they were created on).

## Group sessions (important)

Capacity is counted in **archers (seats)**, not bookings — so a group is counted correctly:

- On the website, the visitor picks **how many archers** are in their group. A group of 4 takes **4 of the 6** hourly seats. Slots without enough room show "Only X left" and can't be picked.
- The script records the group as **one calendar event** that holds all its seats. The event title reads `Name (group of 4) — Program`, and the description carries `Archers: 4`.
- **When you (a coach) add an event by hand** in Google Calendar, it counts as **1 seat** by default. To make a manual event hold more, put `Archers: N` in its description **or** `(xN)` in its title — e.g. a private "Coach block (x6)" fills the whole hour.

## Notes & limits

- **Time zone** is set to `Asia/Manila` in the script.
- Each 1-hour slot holds **6 archers**; bookings add up by party size until the hour is full.
- **Receipts** are plain-text + HTML email sent via `MailApp` from the script owner's account (~100/day on free Gmail).
- **SMS receipts** aren't included — Google can't send SMS on its own. If you later want automatic texts, that needs a paid gateway (e.g. Semaphore in the Philippines); tell me and I'll wire it.
- If you later add online **payment**, that's a separate step (e.g. a payment link in the receipt) — tell me and I'll wire it.
- **Re-deploying after edits:** see **Part C** above — always use **Manage deployments → New version** so the same URL keeps working.

---

## db-v14 deploy & verify

### Deploy steps

1. Open the Apps Script project in your browser.
2. Paste the entire contents of `backend/Code.gs` (overwriting the old code), then click **Save** (💾).
3. Click **Deploy → Manage deployments → edit (✏️) → Version: New version → Deploy.**
   - This keeps the same `/exec` URL — no changes needed in the website.

### Verification checklist

- [ ] Open `…/exec?action=version` in a browser — confirm the response shows `"version":"db-v14"` and both `"refLookup":true` and `"emailMerge":true`.
- [ ] Open `…/exec?action=lookup&ref=PGA-260625-9RJD` — confirm it returns the booking for that reference with its associated email address in the `emails` array.
- [ ] In My Bookings on the website, log in using reference `PGA-260625-9RJD` (no email required) — confirm the booking appears.
- [ ] While logged in, use the "Add email alias" flow: enter a second email address and one of its booking references — confirm the request succeeds (`ok:true`) and both addresses appear in the returned `emails` list.
- [ ] Open My Bookings on a **different device** using the second email address — confirm all bookings from both addresses appear.

---

## db-v15 deploy & verify

### Deploy steps

1. Open the Apps Script project in your browser.
2. Paste the entire contents of `backend/Code.gs` (overwriting the old code), then click **Save** (💾).
3. Click **Deploy → Manage deployments → edit (✏️) → Version: New version → Deploy.**
   - This keeps the same `/exec` URL — no changes needed in the website.

### Verification checklist

- [ ] Open `…/exec?action=version` in a browser — confirm the response shows `"version":"db-v15"` and `"contentStore":true` (all previous flags must still be present).
- [ ] In the website's **admin Pricing tab**, edit a price (e.g. change a session rate) and save — the admin page should POST `{action:"setContent", content:{…}}` to the backend.
- [ ] Open `…/exec?action=content` in a browser — confirm the response shows `{"content":{…}}` with the price you just edited.
- [ ] Open the **public site on a different device** (or incognito window) — confirm the updated price is shown (the frontend fetches `?action=content` on load once Task 2 is wired up).
- [ ] In the admin **Tweaks / Pricing tab**, edit the **Capacity / hour** field and save — then open `…/exec?action=availability&date=<any-open-date>` and confirm the returned `capacity` value and each slot's `left` count reflect the new number (not the hardcoded 6).

---

## db-v17 deploy & verify

### Deploy steps

1. Open the Apps Script project in your browser.
2. Paste the entire contents of `backend/Code.gs` (overwriting the old code), then click **Save** (💾).
3. Click **Deploy → Manage deployments → edit (✏️) → Version: New version → Deploy.**
   - This keeps the same `/exec` URL — no changes needed in the website.

### Verification checklist

- [ ] Open `…/exec?action=version` in a browser — confirm the response shows `"version":"db-v17"`, `"activityActor":true`, and all prior flags (`reschedule:true`, `contentStore:true`, etc.) still present.
- [ ] **Admin action logged with actor:** On the live site, approve or cancel a booking as admin. Open the Activity tab and confirm the new row has a non-empty `Actor` column in the Google Sheet (column G).
- [ ] **Client action logged with actor:** Simulate a client-side logAction call (e.g. a reschedule from My Bookings). Confirm the Activity tab shows `actor: 'client'` (or whatever the frontend passes) in column G.
- [ ] Confirm the Activity tab column headers in the Sheet now read: `At | Ref | Action | Detail | Name | Email | Actor` (7 columns). If the sheet pre-exists with 6 columns, add the `Actor` header to G1 manually.

---

## db-v16 deploy & verify

### Deploy steps

1. Open the Apps Script project in your browser.
2. Paste the entire contents of `backend/Code.gs` (overwriting the old code), then click **Save** (💾).
3. Click **Deploy → Manage deployments → edit (✏️) → Version: New version → Deploy.**
   - This keeps the same `/exec` URL — no changes needed in the website.

### Verification checklist

- [ ] Open `…/exec?action=version` in a browser — confirm the response shows `"version":"db-v16"`, `"reschedule":true`, and all previous flags (`contentStore:true`, etc.) still present.
- [ ] **Reschedule moves (no duplicate):** On the live site, open My Bookings, reschedule an existing session to a different date/time. Confirm: (a) the original calendar event moves to the new slot — it does **not** get cancelled and re-created, and (b) only one calendar event exists for that booking (no duplicate).
- [ ] **Self-schedule email (Bug 4):** Have a customer with an active pass self-schedule one of their sessions (Plans & Sessions page). Confirm: (a) a confirmation email arrives in their inbox listing the newly scheduled date/time, and (b) the session appears in the admin Plans & Sessions tab.

---

## db-v18 deploy & verify

### Deploy steps

1. Open the Apps Script project in your browser.
2. Paste the entire contents of `backend/Code.gs` (overwriting the old code), then click **Save** (💾).
3. Click **Deploy → Manage deployments → edit (✏️) → Version: New version → Deploy.**
   - This keeps the same `/exec` URL — no changes needed in the website.

### Verification checklist

- [ ] Open `…/exec?action=version` in a browser — confirm the response shows `"version":"db-v18"`, `"coachProfiles":true`, and all prior flags (`activityActor:true`, `reschedule:true`, `contentStore:true`, etc.) still present.
- [ ] **CoachPhotos tab auto-creates on first photo write:** In the admin Coaches tab, set a photo for any coach — confirm a new `CoachPhotos` tab appears in the Google Sheet (it does not exist until the first write).
- [ ] **Bio persists:** Add or edit a coach's bio in admin and save. Open `…/exec?action=coaches` — confirm the returned coach object has a non-empty `bio` field.
- [ ] **Photo persists:** Set a coach photo (data URL) via admin. Open `…/exec?action=coaches` — confirm the returned coach object has a non-empty `photo` field. Reload on a different device — photo still present.
- [ ] **Photo and bio appear on About page:** Confirm the About / Coaches section on the live site renders the updated bio and photo.
- [ ] **Delete coach clears CoachPhotos row:** Remove a coach in admin. Open the `CoachPhotos` sheet — confirm their row is gone (a re-added coach with the same id starts with no stale photo).

---

## db-v23 deploy & verify

**What changed:** concession discounts are now admin-editable (Pricing tab). The backend's `concLine_`/`lookup_` were generalized so any admin-defined discount — not just the original Pasig/PAC/Greenpark three — survives the calendar round-trip as a self-describing label. **Frontend ships via GitHub Pages; this re-deploy makes the backend half live.** Until you re-deploy, custom discounts beyond the original three are dropped when a booking round-trips through the calendar.

### Deploy steps

1. Open the Apps Script project in your browser.
2. Paste the entire contents of `backend/Code.gs` (overwriting the old code), then click **Save** (💾).
3. Click **Deploy → Manage deployments → edit (✏️) → Version: New version → Deploy.**
   - This keeps the same `/exec` URL — no changes needed in the website.

### Verification checklist

> ✅ **Verified live 2026-06-27.** `?action=version` returned `"version":"db-v23","editableDiscounts":true`. The custom-discount round-trip was confirmed against the live backend via the public API: a booking sent with a non-seeded discount (`ZZ-TEST Senior citizen (TEST-RT-001)`) was read back by `lookup_` as `concession.label:"ZZ-TEST Senior citizen (TEST-RT-001)"` (with `pasig/local/pac:false`) — i.e. the custom name survived `concLine_` → calendar → `lookup_` (the old backend would have returned no label). The test booking was cancelled (`notify:false`, no emails) and its Sheet rows deleted, leaving no residue.

- [x] Open `…/exec?action=version` in a browser — confirm the response shows `"version":"db-v23"`, `"editableDiscounts":true`, and all prior flags (`coachProfiles:true`, `brandedEmail:true`, `contentStore:true`, etc.) still present.
- [ ] **Seeded discounts still work:** On the live site, book an **Open Range** session, tick **Pasig City resident** (+ enter proof), and confirm. In admin (and My Bookings), confirm the booking shows the **Pasig City resident** concession and the ₱100 discount applied to the total.
- [x] **Custom discount survives the round-trip (the key fix):** In admin **Pricing → Concession discounts**, add a new discount (e.g. `Senior citizen`, ₱150, proof required). Book an Open Range session with **only that new discount** ticked. Confirm the calendar event is created, then reload admin / My Bookings — the booking must still display **Senior citizen** (not blank, not a fallback). Before this re-deploy the custom name would vanish on round-trip. *(Verified 2026-06-27 via API — see note above.)*
- [ ] **Legacy bookings still display:** Open an older Open Range booking made before this change (one with a Pasig/PAC/Greenpark concession) — confirm its concession label still renders correctly in admin and My Bookings.
- [ ] **Stackable + per-slot pricing:** Book Open Range with **two** discounts ticked across **two** time slots — confirm the receipt subtracts both amounts **per slot** (no "extra slots free" perk; that was removed in Phase 2).

---

## db-v24 deploy & verify

**What changed:** Fix for the admin Sessions/Bookings view showing a garbled time like `Sat Dec 30 1899 19:00:00 GMT+0800 (Standard na Oras sa Pilipinas)`. Root cause: Google Sheets auto-coerces the Bookings **Time** column into a time-typed cell (a Date at the 1899-12-30 epoch); `listBookings_` was reading it with a bare `String()`. New `asTimeStr_()` helper formats a Date cell as `7:00 PM` (mirrors the existing `asDateStr_()`), applied to the Time-column read. Backend-only.

### Deploy steps

1. Open the Apps Script project in your browser.
2. Paste the entire contents of `backend/Code.gs` (overwriting the old code), then click **Save** (💾).
3. Click **Deploy → Manage deployments → edit (✏️) → Version: New version → Deploy.**
   - This keeps the same `/exec` URL — no changes needed in the website.

### Verification checklist

- [ ] Open `…/exec?action=version` in a browser — confirm the response shows `"version":"db-v24"`, `"timeCellFix":true`, and all prior flags (`editableDiscounts:true`, etc.) still present.
- [ ] **Times render cleanly:** In admin, open the Bookings/Sessions view. Confirm every booking's time shows as a normal label (e.g. `7:00 PM`) — no `Sat Dec 30 1899 …` strings anywhere, including on older rows whose Time cell was coerced.

---

## db-v25 deploy & verify

**What changed:** Every booking now creates **one Google Calendar event per archer per slot** (instead of one event holding N seats), so the owner's calendar shows the exact number of archers in each time slot. One confirmation email + one reference per booking is unchanged; the read paths (`lookup_`, `listBookings_`) group the per-archer events back into one booking per slot, and cancel/reschedule act on all of a slot's events together. Capacity counting is unchanged. Backend-only.

### Deploy steps

1. Open the Apps Script project in your browser.
2. Paste the entire contents of `backend/Code.gs` (overwriting the old code), then click **Save** (💾).
3. Click **Deploy → Manage deployments → edit (✏️) → Version: New version → Deploy.**
   - This keeps the same `/exec` URL — no changes needed in the website.

### Verification checklist

- [ ] Open `…/exec?action=version` in a browser — confirm the response shows `"version":"db-v25"`, `"perArcherEvents":true`, and all prior flags (`timeCellFix:true`, `editableDiscounts:true`, etc.) still present.
- [ ] **One event per archer:** Book a session for **3 archers** in one time slot. In your Google Calendar, confirm **3 separate events** appear in that slot (one per archer, each titled with the archer's name) — not one "group of 3" event.
- [ ] **One email, one ref:** Confirm the booker received **one** confirmation email with **one** reference number (not three).
- [ ] **Availability reflects archers:** Re-open that slot in the booking page — its remaining capacity dropped by **3**.
- [ ] **My Bookings shows it once:** As the customer, open My Bookings — the booking appears **once** for that slot with the correct archer count (3), not three separate rows.
- [ ] **Admin shows it once:** In the admin Bookings view, the booking appears as **one row** with 3 archers and the correct total.
- [ ] **Cancel/reschedule move all together:** Cancel (or reschedule) that booking — confirm **all 3** calendar events are removed (or moved) together and the slot frees up by 3.
- [ ] **Legacy bookings still work:** Open an older booking made before this deploy — confirm it still displays (correct archer count), cancels, and reschedules correctly.

---

## db-v26 deploy & verify

**What changed:** Two small fixes surfaced by the db-v25 live verification, both backend-only:
1. **`bookMulti_` now honors `noEmail`** — multi-day bookings sent with `noEmail:true` (admin-scheduled / no-receipt) no longer send a customer receipt (it previously always sent; now mirrors `book_`). Matters because every program is multi-day, so all bookings flow through `bookMulti_`.
2. **`cancel_` name fallback** — when cancelling without an `eventId`, the booker-name check now matches the event's description `Name:` line instead of the title (titles are per-archer now). The website/admin cancel by stored `eventId` already worked; this only fixes the name-only fallback path.

### Deploy steps

1. Open the Apps Script project in your browser.
2. Paste the entire contents of `backend/Code.gs` (overwriting the old code), then click **Save** (💾).
3. Click **Deploy → Manage deployments → edit (✏️) → Version: New version → Deploy.** (Edit the EXISTING deployment so the same `/exec` URL updates — do NOT create a new deployment.)

### Verification checklist

- [ ] Open `…/exec?action=version` in a browser — confirm `"version":"db-v26"`, `"multiDayNoEmail":true`, and all prior flags (`perArcherEvents:true`, `timeCellFix:true`, etc.) still present.
- [ ] **noEmail respected:** (admin/dev) POST a booking with `noEmail:true` → the response shows `"emailed":false` and no receipt is sent. A normal customer booking (no `noEmail`) still receives its one receipt.
- [ ] **Normal booking flow unaffected:** Book a session from the website — confirm it still works end to end (one email, correct calendar events) exactly as on db-v25.

---

## db-v27 deploy & verify

**What changed:** each per-archer calendar event now stores **that archer's own** concession, add-ons, and amount (instead of an even-split of the total + a booking-level concession), and per-booking add-ons are recorded once on the booking's first event. The frontend already sends the enriched per-archer data (live since the per-archer flow shipped); this re-deploy makes the backend store it. The customer-facing total/flow were already correct on db-v26; this enables the per-archer breakdown that admin coach-assignment (#6) and accounting (#7) consume. Backend-only.

### Deploy steps

1. Open the Apps Script project in your browser.
2. Paste the entire contents of `backend/Code.gs` (overwriting the old code), then click **Save** (💾).
3. Click **Deploy → Manage deployments → edit (✏️) → Version: New version → Deploy.** (Edit the EXISTING deployment so the same `/exec` URL updates — do NOT create a new deployment.)

### Verification checklist

- [ ] Open `…/exec?action=version` in a browser — confirm `"version":"db-v27"`, `"perArcherExtras":true`, and all prior flags (`perArcherEvents:true`, `multiDayNoEmail:true`, etc.) still present.
- [ ] **Per-archer extras stored:** Book a **2-archer** Open Range session where the two archers pick **different** concessions and/or add-ons. In your Google Calendar, confirm each archer's event description shows **that archer's own** `Concession:` / `Add-ons:` line and `Amount:` — not the same on both.
- [ ] **Amounts reconcile:** the two events' `Amount:` values plus any per-booking add-on total sum to the booking total.
- [ ] **Per-booking add-ons once:** if you ticked a per-booking add-on (e.g. target face), only **one** of the events carries the `Booking add-ons:` line.
- [ ] **One email, one ref** as before.
- [ ] **Legacy bookings unaffected:** a booking made before db-v27 still displays, cancels, and reschedules correctly.

---

## db-v28 deploy & verify

**What changed:** `setBookingCoach_` now accepts a coach LIST and writes the joined names to all of a booking's per-archer events + sheet rows, capped at `ceil(archers/2)`; reuses the existing `Coach` field/column (comma-joined), no schema change; the frontend multi-coach picker (next plan) sends `coaches:[ids]` + back-compat `coach:ids[0]`. Backend-only.

### Deploy steps

1. Open the Apps Script project in your browser.
2. Paste the entire contents of `backend/Code.gs` (overwriting the old code), then click **Save** (💾).
3. Click **Deploy → Manage deployments → edit (✏️) → Version: New version → Deploy.** (Edit the EXISTING deployment so the same `/exec` URL updates — do NOT create a new deployment.)

### Verification checklist

- [ ] Open `…/exec?action=version` in a browser — confirm `"version":"db-v28"`, `"multiCoach":true`, and all prior flags (`perArcherExtras:true`, `perArcherEvents:true`, etc.) still present.
- [ ] In the admin **Sessions** view, assign **2 coaches** to a **3-archer** booking → both coach names show on the booking AND on every one of its per-archer calendar events.
- [ ] Try to assign a **3rd** coach to that 3-archer booking → rejected (cap is `ceil(3/2)=2`).
- [ ] A **1–2-archer** booking caps at **1** coach.
- [ ] Clearing all coaches empties the `Coach` field on the booking and its events.
- [ ] A pre-db-v28 single-coach booking still displays its coach.
