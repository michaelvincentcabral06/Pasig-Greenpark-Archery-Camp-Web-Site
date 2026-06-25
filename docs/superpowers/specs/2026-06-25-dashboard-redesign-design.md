# Admin dashboard redesign — direction A (sub-project D)

**Date:** 2026-06-25
**Goal:** Reorganize the admin Dashboard to look professional. **Same data, no new metrics** —
a prominent "at a glance" hero row, then clean grouped sections with uniform cards. Direction A
was chosen in the visual companion.

## Problem today
The Dashboard already shows everything (booking counts, earnings week/month/year/all, the
coach/equipment/range split, per-coach payments + split editor, and the upcoming schedule), but
the layout reads as a flat stack of mixed-style cards with no hierarchy — it doesn't look
professional. This is a **visual/layout** change, not a data change.

## Decisions (direction A, approved via the visual companion)
Top-to-bottom:
1. **At a glance** — a 3-card hero row of the daily-check numbers:
   - **Earnings this week** (dark-green hero card) — reuses `earnWeekLabel`.
   - **Upcoming sessions** — reuses `upCount`, with a one-line **next session** preview.
   - **Needs your attention** (amber card) — reuses `dashPending` ("pending approvals").
2. **Earnings** — section header + the four uniform cards (`earnWeekLabel`/`earnMonthLabel`/
   `earnYearLabel`/`earnTotalLabel`) + a slim **split bar** ("where the money goes": coach /
   equipment / range) with a legend using `coachTotalLabel`/`equipTotalLabel`/`rangeTotalLabel`.
3. **Booking status** — compact pill chips: `dashApproved` approved · `dashPending` pending ·
   `dashCancelled` cancelled · `coachCount` coaches (replaces the four big count cards).
4. **Coach payments & split** — the existing per-coach rows, redesigned with an **avatar
   (initials)** + name/role + pay, **keeping the split % inputs + Save + the 100% sum check**
   (full editing preserved).
5. **Upcoming schedule** — the existing filtered + paginated upcoming list (sub-project I),
   kept as the last section with a lightly restyled header.

## Constraints
- Mirror rule: every `index.html` edit applied identically to
  `Pasig Greenpark Archery Camp.dc.html` (byte-identical).
- Frontend-only; **no backend change, no deploy.** All earnings/split/count logic is unchanged —
  this reorganizes markup and adds a few small display-only bindings.
- Preserve functionality: the coach split editor (inputs/save/sum warning) and the upcoming
  filters + pagination must keep working.
- Reuse existing bindings exactly: `earnWeekLabel`/`earnMonthLabel`/`earnYearLabel`/
  `earnTotalLabel`, `coachTotalLabel`/`equipTotalLabel`/`rangeTotalLabel`, raw `coachTotal`/
  `equipTotal`/`rangeTotal`, `dashApproved`/`dashPending`/`dashCancelled`, `coachCount`,
  `upCount`, `coachPayRows`, and the `dashUp*`/`upcoming`/pagination bindings.

## New (small, display-only) builders
In the dashboard render section (near the existing earnings/coach builders):
```js
    // Slim split-bar widths (guard divide-by-zero)
    const splitSum = (coachTotal + equipTotal + rangeTotal) || 0;
    const pct = (n) => splitSum > 0 ? Math.round((n / splitSum) * 100) : 0;
    const splitCoachPct = pct(coachTotal), splitEquipPct = pct(equipTotal), splitRangePct = pct(rangeTotal);
    // Next upcoming session preview (soonest first) — `upAllFiltered`/`upcoming` are date-sorted ascending
    const nextUp = (upcoming && upcoming.length) ? upcoming[0] : null;
    const nextUpcomingLabel = nextUp ? ((nextUp.when || nextUp.date || '') + ' ' + (nextUp.time || '') + ' · ' + (nextUp.who || nextUp.name || '')) : '';
```
- Confirm `upcoming[0]` is the soonest (the dashboard upcoming list sorts date+time ascending); if
  it sorts descending, use the last element or sort a copy ascending for the preview.
- Add `initials: this.coachInitials(c.name)` to each `coachPayRows` row (for the avatar).
- Render-return: `splitCoachPct`/`splitEquipPct`/`splitRangePct` (numbers, used as `width:{{ }}%`),
  `nextUpcomingLabel`, `hasNextUpcoming: !!nextUp`. (`coachPayRows` already returned.)

## Markup (the dashboard tab, `<sc-if value="{{ tabDashboard }}">` ~index.html:1798)
Replace the current **booking-counts + earnings + earnings-split + coach-payments** markup
(~1800-1881) with the direction-A layout below; **keep the Upcoming-schedule block (~1882 to the
tab close) intact** (only restyle its `<h3>` header to match):
1. **At a glance** — eyebrow label + a `repeat(auto-fit,minmax(180px,1fr))` grid of three cards:
   the dark-green "Earnings this week" (`earnWeekLabel`), "Upcoming sessions" (`upCount` + a
   `hasNextUpcoming`-gated "next: {{ nextUpcomingLabel }}" sub-line), and the amber "Needs your
   attention" (`dashPending` + "pending approvals").
2. **Earnings** — `<h3>` + the four uniform `earn*Label` cards + the split bar: a flex row of three
   colored segments with inline `width` from `splitCoachPct`/`splitEquipPct`/`splitRangePct`,
   then a legend (coach/equip/range swatches + the `*TotalLabel` amounts).
3. **Booking status** — a flex-wrap row of pill chips for approved/pending/cancelled/coaches.
4. **Coach payments & split** — `<h3>` + the `<sc-for list="{{ coachPayRows }}">` rows, redesigned:
   avatar circle (`{{ cp.initials }}`) + name/role on the left, pay (`{{ cp.pay }}`) prominent,
   and the EXISTING split-% inputs (`cp.setCoachPct`/`setEquipPct`/`setRangePct`), Save
   (`cp.saveSplit`), and the `cp.sumBad`-gated 100% warning — all preserved.
5. **Upcoming schedule** — unchanged block (filter bar + list + pagination from sub-project I).
(Use the brand palette already in the file: cards `#fffdf6` + `rgba(36,66,50,0.12)` border; dark
`#244232`/`#f4efe4`; amber `#fff8ec`/`#8a6a1f`; greens `#4d7327`/`#7fb43f`; mono labels.)

## Out of scope
- Changing any computation (earnings, splits, counts) — display/layout only.
- Mobile/responsive (sub-project F) — though the redesign uses responsive `auto-fit` grids so it
  degrades reasonably; a full mobile pass is separate.
- Other admin tabs; the public site.

## Risks / watch-items
- **Preserve the split editor:** the per-coach `setCoachPct`/`setEquipPct`/`setRangePct`/
  `saveSplit`/`sumBad` wiring must remain functional in the redesigned rows — verify saving a
  split still posts and the 100% warning still shows.
- **Preserve the upcoming block:** don't touch its `dashUp*` filters/pagination logic; only its
  header styling.
- **Reuse, don't recompute:** all the money/count bindings already exist — the redesign must not
  re-derive them; only `splitCoachPct`/`nextUpcomingLabel`/`initials` are new (display-only).
- **Split-bar divide-by-zero:** `pct()` guards `splitSum === 0` (no earnings yet → empty bar).
- **Next-upcoming sort:** confirm `upcoming` is ascending before using `[0]`.
- `index.html` ≡ the `.dc.html` mirror byte-identical. No backend change, no deploy.

## Verification (Playwright, stubbed backend)
- Open the admin Dashboard with stubbed `allBookings`/`coachSplits` producing non-zero earnings +
  a few coaches + several upcoming sessions.
- **Layout:** the hero row shows three cards — Earnings this week (= `earnWeekLabel`), Upcoming
  sessions (= `upCount`) with the next-session sub-line, and Needs attention (= `dashPending`).
- **Earnings:** the four cards show `earn*Label`; the split bar's three segment widths equal
  `splitCoachPct`/`splitEquipPct`/`splitRangePct` (sum ≈ 100), legend shows the `*TotalLabel`s.
- **Status chips** show the approved/pending/cancelled/coaches counts.
- **Coach rows:** each shows an initials avatar + name + pay; the split inputs still update and
  **Save still fires** `saveCoachSplit`; a non-100% sum still shows the warning.
- **Upcoming block** still renders with working filters + pagination.
- **Empty earnings:** with zero earnings the split bar is empty (no NaN widths) and the hero "this
  week" shows ₱0.
- Mirror parity `diff index.html "Pasig Greenpark Archery Camp.dc.html"` → IDENTICAL.
