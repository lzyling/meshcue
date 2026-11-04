import test from "node:test";
import assert from "node:assert/strict";
import { latestVersion, viewingBehindLatest } from "../src/versions.js";

/* This list copies the shape of one real review session, not its values:
   the ids, names and times are synthetic. The Agent published seventeen
   versions and activated none of them after the first alternate view.
   `active` stayed on the second entry while the reviewer worked their way to
   v0.9 about five hours later, and for all seventeen the page said they were
   looking at an earlier version and offered to send them back to the second
   one. Nothing failed; it just read backwards. Versions published together
   keep the original millisecond gaps between them. */
const REVIEW = [
  { id: "a1000001", version: "v0.1", publishedAt: 1700000000000 },
  { id: "a1000002", version: "v0.1-view-a", publishedAt: 1700001800000 },
  { id: "a1000003", version: "v0.2-view-a", publishedAt: 1700003000000 },
  { id: "a1000004", version: "v0.3-view-a", publishedAt: 1700006600000 },
  { id: "a1000005", version: "v0.4-view-a", publishedAt: 1700008400000 },
  { id: "a1000006", version: "v0.5-view-b", publishedAt: 1700010500000 },
  { id: "a1000007", version: "v0.5-view-a", publishedAt: 1700010500031 },
  { id: "a1000008", version: "v0.6-view-c", publishedAt: 1700012900000 },
  { id: "a1000009", version: "v0.6-view-a", publishedAt: 1700012900036 },
  { id: "a1000010", version: "v0.7", publishedAt: 1700015400000 },
  { id: "a1000011", version: "v0.7.1", publishedAt: 1700015820000 },
  { id: "a1000012", version: "v0.7.1-view-a", publishedAt: 1700015820034 },
  { id: "a1000013", version: "v0.8-view-d", publishedAt: 1700018040000 },
  { id: "a1000014", version: "v0.8-view-a", publishedAt: 1700018040039 },
  { id: "a1000015", version: "v0.9", publishedAt: 1700018760000 },
  { id: "a1000016", version: "v0.9-view-a", publishedAt: 1700018760039 },
  { id: "a1000017", version: "v0.9-view-d", publishedAt: 1700018760075 },
];
const ACTIVE_ID = "a1000002"; // where the Agent's pointer actually sat

test("the newest version is the one published last, not the one activated", () => {
  assert.equal(latestVersion(REVIEW).id, "a1000017");
  assert.notEqual(latestVersion(REVIEW).id, ACTIVE_ID);
});

test("a reviewer on the newest version is never called behind", () => {
  assert.equal(viewingBehindLatest(REVIEW, "a1000017"), false);
});

test("a reviewer sitting on the stale pointer is told he is behind", () => {
  // The inverse of the bug: matching `active` used to read as "current version".
  assert.equal(viewingBehindLatest(REVIEW, ACTIVE_ID), true);
});

test("every version the reviewer passed through reads as behind except the last", () => {
  const behind = REVIEW.filter((v) => viewingBehindLatest(REVIEW, v.id));
  assert.equal(behind.length, REVIEW.length - 1);
  assert.ok(!behind.some((v) => v.id === "a1000017"));
});

test("versions published in the same batch are separated by position", () => {
  // v0.9's three views are 39 ms and 36 ms apart; a clock alone cannot
  // order them.
  const batch = REVIEW.slice(-3);
  assert.equal(batch[2].publishedAt - batch[0].publishedAt, 75);
  assert.equal(latestVersion(batch).id, "a1000017");
  const tied = [
    { id: "first", publishedAt: 5 },
    { id: "second", publishedAt: 5 },
  ];
  assert.equal(latestVersion(tied).id, "second");
});

test("an empty or unloaded review claims nothing", () => {
  assert.equal(latestVersion([]), null);
  assert.equal(latestVersion(undefined), null);
  assert.equal(viewingBehindLatest([], "anything"), false);
  assert.equal(viewingBehindLatest(REVIEW, null), false);
});
