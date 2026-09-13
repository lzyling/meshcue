import test from "node:test";
import assert from "node:assert/strict";
import { latestVersion, viewingBehindLatest } from "../src/versions.js";

/* Every number here is real. They are the published versions of one XR camera
   housing review on 2026-09-13, in which the Agent published seventeen versions
   and activated none of them after the first exploded view. `active` stayed on
   bca341d1 — 12:58 — while the reviewer worked his way to v0.9 at 17:41, and
   for all seventeen the page told him he was looking at an earlier version and
   offered to send him back to 12:58. Nothing failed; it just read backwards. */
const REVIEW = [
  { id: "cf45f837", version: "v0.1", publishedAt: 1789273436879 },
  { id: "bca341d1", version: "v0.1-exploded-01", publishedAt: 1789275483132 },
  { id: "342ac27a", version: "v0.2-exploded-01", publishedAt: 1789276698755 },
  { id: "e68d2798", version: "v0.3-exploded-01", publishedAt: 1789280377493 },
  { id: "740a6d01", version: "v0.4-exploded-01", publishedAt: 1789282162068 },
  { id: "1118dba7", version: "v0.5-bed-layout", publishedAt: 1789284122185 },
  { id: "b81355bf", version: "v0.5-exploded-01", publishedAt: 1789284122216 },
  { id: "47044b8a", version: "v0.6-appearance", publishedAt: 1789286581130 },
  { id: "037c4ec2", version: "v0.6-exploded-01", publishedAt: 1789286581166 },
  { id: "4d30dab2", version: "v0.7", publishedAt: 1789289160298 },
  { id: "5428daa8", version: "v0.7.1", publishedAt: 1789289574669 },
  { id: "42440889", version: "v0.7.1-exploded-01", publishedAt: 1789289574703 },
  {
    id: "70f0542b",
    version: "v0.8-bed-interior-01",
    publishedAt: 1789291766097,
  },
  { id: "d70afe80", version: "v0.8-exploded-01", publishedAt: 1789291766136 },
  { id: "9e1c19a6", version: "v0.9-assembly", publishedAt: 1789292484059 },
  { id: "c2355da2", version: "v0.9-exploded-01", publishedAt: 1789292484098 },
  {
    id: "9f553b56",
    version: "v0.9-bed-interior-01",
    publishedAt: 1789292484134,
  },
];
const ACTIVE_ID = "bca341d1"; // where the Agent's pointer actually sat

test("the newest version is the one published last, not the one activated", () => {
  assert.equal(latestVersion(REVIEW).id, "9f553b56");
  assert.notEqual(latestVersion(REVIEW).id, ACTIVE_ID);
});

test("a reviewer on the newest version is never called behind", () => {
  assert.equal(viewingBehindLatest(REVIEW, "9f553b56"), false);
});

test("a reviewer sitting on the stale pointer is told he is behind", () => {
  // The inverse of the bug: matching `active` used to read as "current version".
  assert.equal(viewingBehindLatest(REVIEW, ACTIVE_ID), true);
});

test("every version the reviewer passed through reads as behind except the last", () => {
  const behind = REVIEW.filter((v) => viewingBehindLatest(REVIEW, v.id));
  assert.equal(behind.length, REVIEW.length - 1);
  assert.ok(!behind.some((v) => v.id === "9f553b56"));
});

test("versions published in the same batch are separated by position", () => {
  // v0.9's three views are 39ms apart; a clock alone cannot order them.
  const batch = REVIEW.slice(-3);
  assert.equal(batch[2].publishedAt - batch[0].publishedAt, 75);
  assert.equal(latestVersion(batch).id, "9f553b56");
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
