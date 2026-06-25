# Pasig Greenpark Archery Camp — Site analysis & roadmap

**Date:** 2026-06-25
**Purpose:** Capture the full feedback batch, my recommendations, the two open design
questions (calendar, reviews), the strategic future risks, and a prioritized sequence with
live status — so nothing is lost as we work through it.

**Status legend:** ✅ done · in progress · ⬜ planned · 💡 design question

---

## 1. Functional items (the concrete bugs/features)

| # | Item | What I verified | Recommendation | Status |
|---|---|---|---|---|
| A | My Bookings → Upcoming: no pagination/filters | Pagination **exists** (5/page; pager only with 6+). **Filters missing.** | Add filters (date range / coach / search). | ⬜ |
| B | Used/expired sessions still editable by customer | Real gap — only enforced by hiding buttons, not in the handlers; pass sessions weren't self-manageable. | Rule: customer edits/cancels only **upcoming on a non-expired pass**; used/expired = **admin-only**. Add per-session Reschedule/Cancel on pass cards. | **in progress** (now) (sub-project J) |
| C | Admin Upcoming Schedule: no pagination | Pagination + filters **were added** (`dashboard-upcoming-filters`, live). | Verify on a hard refresh. The remaining ask is **dashboard design**. | ✅ (paging) / ⬜ (design) |
| D | Dashboard "doesn't look professional" | Qualitative. | A dashboard visual redesign pass. | ⬜ |
| E | Bookings not showing the sessions booked | Real gap — the admin **"Bookings"** tab shows **passes**, not individual booked sessions; there's no single all-sessions admin view. | Build an admin **"Sessions" list** (all bookings, paginated + filtered). | ⬜ |
| F | Mobile design looks off / crowding risk | Several fixed 3-col grids + dense admin panels. | A dedicated **responsive/mobile pass**. | ⬜ |

## 2. Calendar (design question 💡)
**Your idea:** a calendar styled like *"When to Come Shoot"* with Google Calendar details.
**My take — agree, with one refinement.** The backend already reads your Google Calendar, so we
don't need the generic embed. Build a **custom, on-brand calendar (month + week view)** fed by
your real Calendar events through the backend. **Refinement:** make it a beautiful **read-only
availability/schedule view** — don't rebuild Google Calendar's editing/recurring/drag. Booking
keeps using the existing flow. ~90% of the value, ~20% of the risk. **Status:** ⬜ (Round 3).

## 3. Reviews (design question 💡)
**Your idea:** pull reviews from Google Maps instead of stars.
**My take — agree the stars feel weak.** Two paths:
- **Curate real Google reviews into the existing editable Testimonials** (paste your best real
  ones with names; drop/keep a subtle accent). *Fast, authentic, no API, full control.* ← **recommended first.**
- **Live Google Places API** (backend fetches + caches). *Auto-updating, but needs an API key,
  ~5 reviews max, quotas, and Google's caching/attribution terms.* ← optional later.
**Status:** ⬜ (Round 3).

## 4. Strategic future risks (what to watch)
1. **One ~450 KB `index.html`** runs the whole site + booking + admin + coach portal. Still
   works, but every feature makes it heavier/riskier to change — the #1 long-term constraint.
2. **Mobile/crowding** as features grow — needs the responsive pass, not piecemeal tweaks.
3. **Storage ceilings:** photos in sheet cells (~50 KB), content in 9 KB Script Properties,
   passes in Script Properties. Fine now; will pinch with scale.
4. **No real backend security:** admin/coach are passcode-gated *in the browser only*; backend
   POSTs are unauthenticated. Worth closing as you handle more bookings/money.
5. **Three sources of truth** (Calendar + Sheet + Script Properties) — origin of most sync bugs.

## 5. Prioritized sequence (with status)
- **Round 1 — Correctness & control:**
  - B) edit/cancel permission rule + pass-session self-service — **in progress** (now)
  - E) admin all-sessions list (paginated/filtered) — ⬜
  - A) My Bookings filters — ⬜
- **Round 2 — Polish:** D) dashboard redesign · F) mobile/responsive pass — ⬜
- **Round 3 — Standout features:** calendar (§2) · curated Google reviews (§3) — ⬜
- **Ongoing/flagged:** backend auth · the monolith file — raised, tackle when ready.

Each item is its own design → plan → build cycle (one sub-project at a time), so we never bite
off too much at once.
