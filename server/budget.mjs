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
