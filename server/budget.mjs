/* What a round of marking may hold.

   The page keeps a round under three megabytes so that it and the recovery copy
   an unsynced draft is entitled to both fit in the storage a browser gives an
   origin. The service has to hold a line of its own — nothing about a request
   proves it came from our page — but the two must not cross: if the service
   refused first, a reviewer would meet a failed save instead of the toast that
   tells them to submit, which is the exact failure the byte budget replaced.

   These live apart from the service so that a test can read them without
   starting one. `tests/round-budget.test.mjs` holds them to `MAX_MARK_BYTES`
   and `WHOLE_FACE_BYTES` in `src/main.js`. */
export const MAX_ROUND_BYTES = 3_600_000;
export const MARK_WHOLE_FACE_BYTES = 8;

/* A region's label is the name the page gives it in the reviewer's language —
   "violette Fläche", "Zone violette" — so it is as long as the longest
   translation, not as long as a letter. Twelve held every name but those two,
   and a German or French reviewer painting purple got a failed save.
   `scripts/check-i18n.mjs` puts every catalogue's region names against it. */
export const MAX_REGION_LABEL = 32;

/* A mark's note is the reviewer saying, in their own words, what should change
   where the mark is. Two hundred is room for a sentence or three in any of the
   six languages without becoming a second conversation; the page holds the
   text box to the same number (`MAX_NOTE` in `src/main.js`). Counted the way a
   browser counts `maxlength`, in UTF-16 code units, so the two cannot disagree
   about an emoji. */
export const MAX_NOTE = 200;

/* Where the reviewer was looking from when they last placed, painted, moved or
   wrote on a mark: two points, a direction and two numbers, rounded to six
   significant figures. Measured at about 190 bytes as JSON; the page charges
   this much for every mark that carries one (`VIEW_BYTES` in `src/main.js`). */
export const MARK_VIEW_BYTES = 240;
