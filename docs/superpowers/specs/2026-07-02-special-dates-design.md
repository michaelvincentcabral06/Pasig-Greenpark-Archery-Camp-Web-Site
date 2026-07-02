# Special dates (per-date hour overrides) — design

**Date:** 2026-07-02
**Status:** Approved (design); spec under review
**Backend version target:** db-v39 (flag `dayOverrides`)

## Goal

Let the admin open a normally-closed date (e.g. a Monday), or close/adjust a normally-open date
(e.g. a holiday), by setting per-date opening hours that override the fixed weekly template — end to
end, so the public booking calendar lets the customer pick the opened date and books the right hours.

## Background (current model)

- Weekly template is duplicated: backend `OPEN_HOURS` (`Code.gs:43`, Mon `[]` = closed) and frontend
  `startHours(dow)` (`index.html:3507`).
- Backend availability: `buildSlots_(date, coach)` → `hoursForRequest_(date, dow, coach)`
  (`Code.gs:452`) → for a coach, `coachHoursFor_` (per-date coach override, else `OPEN_HOURS[dow]`);
  for `"any"`, the union of coaches; else (range / Open Range) `OPEN_HOURS[dow]`.
- Frontend uses `startHours(dow)` to grey out closed days in the **public booking date-picker**
  (`calPubCells`, `index.html:5690`) and for availability messaging — independent of the backend, so
  both sides must honor overrides or an opened day stays greyed out.

## Data model

Per-date exceptions live in **`content.dayOverrides`** — a map `{ "YYYY-MM-DD": [startHours] }`:
- `[16,17,18,19]` = open those 1-hour slots (start hours, 24h).
- `[]` = closed that date.
- key absent = use the weekly template.

CONTENT already syncs both ways (backend reads the `CONTENT` Script Property; frontend reads
`state.content`), so overrides ride the existing `setContent`/`getContent` — **no new endpoint**, and
the admin editor just mutates content like programs/discounts do. A handful of dates is tiny; no size
concern.

## Backend changes (`backend/Code.gs`) — db-v39

- **`dayOverrides_()`** — read `CONTENT.dayOverrides` (parse the `CONTENT` property, return `{}` on
  any failure).
- **`effectiveTemplate_(dateStr, dow)`** — if `dayOverrides_()` has `dateStr`, return its hours
  sanitized (ints 0–23, deduped, sorted; `[]` stays `[]` = closed); else `OPEN_HOURS[dow] || []`.
- Wire it into the two template fallbacks:
  - `coachHoursFor_` (`Code.gs:443`): the no-coach-override branch returns
    `effectiveTemplate_(dateStr, dow)` instead of `OPEN_HOURS[dow]`. (So an opened day makes a coach
    with no per-date setting bookable those hours; a coach's own `avail:` setting still wins.)
  - `hoursForRequest_` else branch (`Code.gs:461`): return `effectiveTemplate_(dateStr, dow)`.
- `buildSlots_` is unchanged (it already calls `hoursForRequest_`; the today-past-hours cutoff and
  capacity logic still apply on top).
- **No new action** — overrides are saved through the existing `setContent`. Version bump to
  `db-v39`, add `dayOverrides: true` to `?action=version`. No new OAuth scope (CONTENT read only).

## Frontend changes (`index.html`)

- **`mergedContent` whitelist (essential):** `mergedContent` (`index.html:~3290`) rebuilds content
  from a fixed set of fields, so any field not listed is dropped on every reload. Add
  `dayOverrides: c.dayOverrides || {}` to it. Without this, the admin editor's `cm.dayOverrides` would
  be stripped and saves wouldn't round-trip. (The saved/merged content — now including `dayOverrides`
  — is what `setContent` persists and what `state.content` holds, so both the public site and the
  backend see it.)
- **`dayOverrides()`** → `(this.state.content || {}).dayOverrides || {}`.
- **`startHoursForDate(dateStr)`** — if `dayOverrides()` has `dateStr`, return its hours (`.slice()`);
  else `this.startHours(new Date(dateStr + 'T00:00:00').getDay())`. This is the date-aware version of
  `startHours`.
- Repoint every **date-context** `startHours(dow)` call to `startHoursForDate(<thatDate>)` (each of
  these already has a concrete date in scope):
  - `3238` (frontend coach-hours fallback) · `3432` (coach "open this day" default) ·
    `3574` (date slot preview) · `5214` (`slotDayHasHours`) · `5312` (admin/coach calendar cell
    closed) · `5336` (multi-date calendar cell closed) · `5690` (**public booking date-picker** —
    the key one) · `5715` (plan-editor base hours, non-coach branch).
  - The pure weekly-template display (`scheduleDays`, driven by `content.schedule`, `index.html:5122`)
    is unchanged — the weekly grid keeps showing the standard week.
- **Picker hint:** on `calPubCells`, mark dates present in `dayOverrides()` so the picker can show a
  small "special hours" dot/label (open override) — opened dates are pickable, closed overrides grey
  out like any closed day.

## Admin UI — "Special dates" editor

A new card in the admin schedule/hours area (near the schedule-note editor, `index.html:~2572`):
- **Date** `<input type="date">` (bound to a working state field, e.g. `dayOvDate`).
- **Hour chips** for start hours 9–19 (each a 1-hour slot), toggling a working `dayOvHours` set.
- **Save open date** (writes the selected hours for the date) and **Mark closed** (writes `[]`).
- **List** of current overrides (sorted by date): formatted date + summary (`4:00 PM – 8:00 PM`, or
  **Closed** for `[]`) + **Remove**.
- Handlers (mutate `content.dayOverrides`, save via the existing `saveCM`, `index.html:5406`):
  - `setDayOverride(date, hoursArray)` → `saveCM({ dayOverrides: { ...cm.dayOverrides, [date]: hoursArray } })`.
  - `removeDayOverride(date)` → copy `cm.dayOverrides`, `delete [date]`, `saveCM({ dayOverrides: … })`.

## Behavior / edge cases

- **Open a closed Monday:** add `"<mondayDate>": [16,17,18,19]` → picker allows it, backend serves
  those slots, coaches without their own setting are bookable those hours.
- **Close a normally-open date (holiday):** add `"<date>": []` → picker greys it out, backend returns
  no slots.
- **Today cutoff / capacity:** unchanged — `buildSlots_` still drops past hours today and subtracts
  booked seats.
- **Validation:** hours sanitized to ints 0–23 on both sides; a malformed/empty override is treated
  as closed. Past dates can be added but are harmless (past dates aren't pickable anyway).
- **Coach own-availability precedence preserved:** `avail:<coach>:<date>` still overrides the
  template (including a date override) for that coach.

## Verification

1. Add an open override for a future Monday → the public date-picker lets you select it and shows the
   set hours; a booking on that Monday succeeds (calendar event created).
2. Add a `[]` override for a future open date → the picker greys it out; `?action=availability` for
   that date returns no slots.
3. Remove an override → the date reverts to its weekly default.
4. Un-overridden dates behave exactly as before (regression check on a normal Tue/Sat).
5. `?action=version` → `db-v39`, `dayOverrides:true`. `.dc.html` mirror byte-identical.

## Deploy

- Frontend: commit + push + mirror `.dc.html`.
- Backend: manual redeploy to db-v39 (paste → Save → Deploy → Manage deployments → edit existing →
  New version), then verify `?action=version`. No new permission.
