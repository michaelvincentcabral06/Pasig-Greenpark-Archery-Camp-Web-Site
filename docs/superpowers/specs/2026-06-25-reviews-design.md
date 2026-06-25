# Reviews (curated Google reviews) — Design

## Summary

Turn the existing generic "What our archers say" testimonials block into a **curated Google-reviews** section: real reviews the owner pastes in (reviewer name, star rating, date, text), shown as Google-style cards, with an overall rating summary and a "Read all reviews on Google" link. Curated, not a live Places API — free, full control, no API key. Builds on the testimonials system that already exists; **no backend code change, no deploy** (content is a JSON blob persisted via the existing `setContent` action).

Decisions (owner-approved): curated source; Google-style card (initial avatar + name + Google mark + actual stars + date + text); overall rating summary + outbound Google link.

## Data model (CONTENT — persisted for all visitors via existing path)

CONTENT is loaded by `mergedContent(defaults)` (`?action=content`, cached in localStorage) and saved by `persistContent` (localStorage + POST `{action:'setContent', content}`). Adding fields is backward-compatible (defaults fill missing) and needs no backend change.

- **Each review** (the `testimonials` array): `{ quote, name, rating, date, role }`.
  - `quote` (string) — the review text. Existing.
  - `name` (string) — reviewer name. Existing.
  - `rating` (number 1–5, default 5) — NEW. The review's own star count.
  - `date` (string, default '') — NEW. Free text, e.g. "May 2026" or "2 months ago"; may be blank (then the date line is omitted).
  - `role` (string) — KEPT for backward-compat; NOT shown on the new card. No new UI writes it beyond what already exists; new reviews default `role:''`.
- **Section-level fields** (top-level CONTENT): NEW.
  - `reviewsRating` (string, default '5.0') — overall rating shown in the header and the hero badge.
  - `reviewsCount` (string, default '') — e.g. "23"; the "· N reviews on Google" clause is omitted when blank.
  - `reviewsUrl` (string, default '') — the owner's Google Maps reviews link; the "Read all on Google" button is omitted when blank.

Defaults in `mergedContent(...)` (~index.html:4233): add `reviewsRating:'5.0', reviewsCount:'', reviewsUrl:''`, and update the seeded `testimonials` entries to include `rating:5, date:''`.

## Rendering

### Home testimonials section (~index.html:332-345) — restructured, same visual language

- **Header:** keep the "From the range" eyebrow + "What our archers say" heading. Below the heading, add a rating-summary row: five stars in the brand green + `{{ reviewsRating }}` + (when `reviewsCount` is non-blank) `· {{ reviewsCount }} reviews on Google`. When `reviewsUrl` is non-blank, a pill button **"Read all reviews on Google →"** (`<a target="_blank" rel="noopener">`) beside/under the summary.
- **Cards** (`<sc-for list="{{ testimonials }}" as="t">`): Google-style `<figure>` reusing the existing card container (`#fffdf6`, border, radius, padding):
  - Top row: a small initial-circle avatar (the reviewer's first initial, brand colors) + the reviewer **name** (bold) + a small Google "G" mark pushed to the right.
  - A star row showing the review's `rating` (filled stars up to `rating`, faint stars for the remainder) + (when `date` non-blank) `· {{ t.date }}`.
  - The review **text** as the blockquote.
- The 3-column grid + the global ≤760px single-column collapse are unchanged (responsive already handled).

### Hero rating badge (~index.html:99-103)

Replace the hardcoded `5.0` with `{{ reviewsRating }}` so the hero badge and the reviews section share one editable source of truth. Keep the five-star glyph and the "Google reviewed" label.

### Star rendering (no JS ternaries in style)

In the testimonials builder (~index.html:4255), map each review to include pre-computed display fields: `initial` (first non-space char of `name`, uppercased; fallback "★"), `starsFull` (`'★'.repeat(clamp(rating,0,5))`), `starsEmpty` (`'☆'.repeat(5 - clamp)`), `hasDate` (`!!date`), and pass through `name`, `quote`, `date`. The header uses `reviewsRating`/`reviewsCount`/`reviewsUrl` with pre-computed `hasReviewsCount`/`hasReviewsUrl` booleans. All color/visibility decisions are pre-computed booleans or `<sc-if>` gates — never ternaries inside `style="…{{ }}…"`.

## Admin editing (Content tab — extend the existing testimonial editor, ~index.html:2342-2356)

The editor (`testimonialEdits`, `setTestimonial(i,key)`, `addTestimonial`, `removeTestimonial`) already exists. Extend it:
- Each review row gains a **rating** control (1–5; a small number `<input type="number" min=1 max=5>` or a 5-button selector — implementer's choice, must write `rating` as a number) and a **date** text input. These reuse `setTestimonial(i,'rating')` / `setTestimonial(i,'date')` (rating coerced to a clamped integer on input).
- `addTestimonial` default becomes `{ quote:'New review', name:'Name', role:'', rating:5, date:'' }`.
- Above/below the per-review list, add three inputs bound to new handlers (via `saveCM`): overall **rating** (`reviewsRating`), **count** (`reviewsCount`), and **Google Maps URL** (`reviewsUrl`), each with a short label.
- Keep add / remove / "Reset all content to defaults".

## Seeding (follow-up data step, owner-supplied)

Ship with the current three sample reviews upgraded to the new shape (`rating:5, date:''`) and placeholder section fields (`reviewsRating:'5.0'`, `reviewsCount:''`, `reviewsUrl:''`). The owner replaces them with real Google reviews + their Maps link in admin. (Optional: once the owner shares the real reviews + link, paste them in via the same content-save path — not part of this build.)

## Constraints

- **Mirror rule:** every `index.html` edit mirrored to `Pasig Greenpark Archery Camp.dc.html`; finish with `diff … && echo IDENTICAL`.
- **No backend change, no deploy.** Pure CONTENT JSON + frontend rendering/editing.
- **Preserve the visual language** — reuse existing card/section styling, brand colors, fonts; this enhances the existing block, not a redesign.
- **SuperConductor:** no JS ternaries inside style `{{ }}` interpolations; pre-compute on data objects.
- **Backward compatibility:** existing saved CONTENT (testimonials without `rating`/`date`, missing `reviews*` fields) must render fine via defaults (rating→5, date→'', reviewsRating→'5.0', count/url→'').

## Verification

Playwright driving the real DOM via the React-fiber `logic` instance:
- Seed CONTENT with reviews of mixed ratings (e.g. 5, 4) + a date on some, blank on others; set `reviewsRating`/`reviewsCount`/`reviewsUrl`. Assert the Home section renders: header summary stars + rating + count + the Google link (href = `reviewsUrl`, target `_blank`); each card shows initial avatar, name, correct filled/empty star counts, date only when present, and text.
- Assert the hero badge shows `reviewsRating`.
- Backward-compat: seed a legacy testimonial missing `rating`/`date` and CONTENT missing `reviews*`; assert it renders (5 stars, no date, default header) with no console error.
- Admin: drive the Content tab; edit a review's rating/date and the overall rating/count/url; assert `persistContent` is called and the Home rendering reflects the change.
- Mirror IDENTICAL; 0 real console errors.
