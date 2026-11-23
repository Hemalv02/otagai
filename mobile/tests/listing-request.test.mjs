import assert from "node:assert/strict";
import test from "node:test";

import {
  buildListingRequest,
  isListingRequestKind,
  listingRequestError,
  listingRequestState,
  singleFlight,
} from "../src/lib/listing-request.ts";

const owner = { id: "owner-1", display_name: "Owner" };
const listing = (over = {}) => ({
  id: "listing-1",
  owner,
  status: "active",
  lend_mode: "lend",
  ...over,
});

test("actions follow the lend mode", () => {
  assert.deepEqual(listingRequestState(listing(), "me"), {
    mode: "actions",
    actions: ["borrow"],
  });
  assert.deepEqual(
    listingRequestState(listing({ lend_mode: "help_only" }), "me"),
    { mode: "actions", actions: ["help"] },
  );
  assert.deepEqual(
    listingRequestState(listing({ lend_mode: "lend_or_help" }), "me"),
    { mode: "actions", actions: ["borrow", "help"] },
  );
});

test("read-only reasons", () => {
  assert.deepEqual(listingRequestState(listing({ owner: null }), "me"), {
    mode: "readOnly",
    reason: "noOwner",
  });
  assert.deepEqual(listingRequestState(listing(), "owner-1"), {
    mode: "readOnly",
    reason: "own",
  });
  assert.deepEqual(
    listingRequestState(listing({ status: "paused" }), "owner-1"),
    { mode: "readOnly", reason: "own" },
  );
  assert.deepEqual(listingRequestState(listing({ status: "paused" }), "me"), {
    mode: "readOnly",
    reason: "paused",
  });
  assert.deepEqual(listingRequestState(listing({ status: "lent_out" }), "me"), {
    mode: "readOnly",
    reason: "lent_out",
  });
});

test("kind guard", () => {
  assert.equal(isListingRequestKind("borrow"), true);
  assert.equal(isListingRequestKind("help"), true);
  assert.equal(isListingRequestKind("borrow_with_help"), false);
  assert.equal(isListingRequestKind(undefined), false);
});

test("buildListingRequest validates and trims", () => {
  assert.equal(buildListingRequest(listing(), "borrow", "   ", "en"), null);
  assert.equal(
    buildListingRequest(listing(), "borrow", "a".repeat(2001), "en"),
    null,
  );
  assert.notEqual(
    buildListingRequest(listing(), "borrow", "a".repeat(2000), "en"),
    null,
  );
  assert.equal(buildListingRequest(listing(), "help", "Hi", "en"), null);
  assert.equal(
    buildListingRequest(listing({ owner: null }), "borrow", "Hi", "en"),
    null,
  );
  assert.deepEqual(buildListingRequest(listing(), "borrow", "  Hi  ", "ja"), {
    kind: "borrow",
    raw_text: "Hi",
    lang: "ja",
    listing_id: "listing-1",
    direct_to_user_id: "owner-1",
    ripple_max_stage: "direct",
  });
});

test("error mapping", () => {
  const map = (status) => listingRequestError({ status });
  assert.equal(map(0), "transient");
  assert.equal(map(400), "invalid");
  assert.equal(map(422), "invalid");
  assert.equal(map(401), "auth");
  assert.equal(map(403), "auth");
  assert.equal(map(404), "unavailable");
  assert.equal(map(409), "unavailable");
  assert.equal(map(429), "transient");
  assert.equal(map(500), "transient");
  assert.equal(map(418), "error");
  assert.equal(listingRequestError("boom"), "error");
  assert.equal(listingRequestError(null), "error");
});

test("singleFlight runs once while pending and resets after settling", async () => {
  let calls = 0;
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  const send = singleFlight(async () => {
    calls += 1;
    await gate;
    return "ok";
  });
  const first = send();
  assert.equal(await send(), undefined);
  release();
  assert.equal(await first, "ok");
  assert.equal(calls, 1);
  assert.equal(await send(), "ok");
  assert.equal(calls, 2);

  let attempts = 0;
  const flaky = singleFlight(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("fail");
    return "fine";
  });
  await assert.rejects(flaky());
  assert.equal(await flaky(), "fine");
});
