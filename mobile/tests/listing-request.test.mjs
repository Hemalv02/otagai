import assert from "node:assert/strict";
import test from "node:test";

import {
  buildListingRequest,
  listingRequestError,
  listingRequestState,
  singleFlight,
} from "../src/lib/listing-request.ts";

const listing = {
  id: "listing-id",
  owner: { id: "owner-id", display_name: "Neighbour" },
  status: "active",
  lend_mode: "lend",
};

test("listing actions respect lending modes and read-only states", () => {
  for (const [mode, actions] of [
    ["lend", ["borrow"]],
    ["help_only", ["help"]],
    ["lend_or_help", ["borrow", "help"]],
  ]) {
    assert.deepEqual(
      listingRequestState({ ...listing, lend_mode: mode }, "me"),
      { mode: "actions", actions },
    );
  }
  for (const [patch, profile, reason] of [
    [{ owner: null }, "me", "noOwner"],
    [{ status: "paused" }, "owner-id", "own"],
    [{ status: "paused" }, "me", "paused"],
    [{ status: "lent_out" }, "me", "lent_out"],
  ]) {
    assert.deepEqual(listingRequestState({ ...listing, ...patch }, profile), {
      mode: "readOnly",
      reason,
    });
  }
});

test("request payload preserves the selected listing and recipient", () => {
  assert.deepEqual(
    buildListingRequest(listing, "borrow", "  May I borrow it?  ", "en"),
    {
      kind: "borrow",
      raw_text: "May I borrow it?",
      lang: "en",
      listing_id: "listing-id",
      direct_to_user_id: "owner-id",
      ripple_max_stage: "direct",
    },
  );
  for (const text of ["   ", "x".repeat(2001)])
    assert.equal(buildListingRequest(listing, "borrow", text, "en"), null);
  assert.equal(buildListingRequest(listing, "help", "Please help", "en"), null);
  assert.equal(
    buildListingRequest(
      { ...listing, status: "paused" },
      "borrow",
      "Please",
      "en",
    ),
    null,
  );
});

test("request errors map to recoverable localized states", () => {
  for (const [status, expected] of [
    [0, "transient"],
    [400, "invalid"],
    [401, "auth"],
    [403, "auth"],
    [404, "unavailable"],
    [409, "unavailable"],
    [422, "invalid"],
    [429, "transient"],
    [500, "transient"],
  ])
    assert.equal(listingRequestError({ status }), expected);
  assert.equal(listingRequestError(null), "error");
});

test("rapid sends run once and failure releases the send guard", async () => {
  let release;
  let calls = 0;
  const send = singleFlight(async () => {
    calls++;
    await new Promise((resolve) => {
      release = resolve;
    });
    return "sent";
  });
  const first = send();
  assert.equal(await send(), undefined);
  assert.equal(calls, 1);
  release();
  assert.equal(await first, "sent");
  const failed = singleFlight(async () => {
    calls++;
    throw new Error("offline");
  });
  await assert.rejects(failed(), /offline/);
  await assert.rejects(failed(), /offline/);
  assert.equal(calls, 3);
});
