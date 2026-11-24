import assert from "node:assert/strict";
import test from "node:test";

import { todayPeople, todayRows } from "../src/lib/home-today.ts";

const request = (id, overrides = {}) => ({
  id,
  requester_user_id: "neighbour",
  kind: "borrow",
  status: "open",
  polite_text: `Request ${id}`,
  ...overrides,
});

const exchange = (id, overrides = {}) => ({
  id,
  requester_user_id: "me",
  helper_user_id: "lender",
  listing_id: "listing-1",
  due_at: "2026-11-25T09:00:00Z",
  ...overrides,
});

test("due items come first and point at the other participant", () => {
  const rows = todayRows(
    {
      received_requests: [request("r1")],
      active_exchanges: [],
      due_soon: [
        exchange("e1"),
        exchange("e2", { requester_user_id: "x", helper_user_id: "me" }),
      ],
    },
    "me",
  );
  assert.deepEqual(
    rows.map((row) => [row.type, row.id]),
    [
      ["due", "e1"],
      ["due", "e2"],
      ["request", "r1"],
    ],
  );
  assert.equal(rows[0].partnerId, "lender");
  assert.equal(rows[0].borrowing, true);
  assert.equal(rows[1].partnerId, "x");
  assert.equal(rows[1].borrowing, false);
});

test("closed requests, own requests and foreign exchanges are hidden", () => {
  const rows = todayRows(
    {
      received_requests: [
        request("cancelled", { status: "cancelled" }),
        request("own", { requester_user_id: "me" }),
      ],
      active_exchanges: [],
      due_soon: [
        exchange("foreign", { requester_user_id: "a", helper_user_id: "b" }),
      ],
    },
    "me",
  );
  assert.deepEqual(rows, []);
});

test("people are looked up once each", () => {
  const rows = todayRows(
    {
      received_requests: [
        request("r1"),
        request("r2", { requester_user_id: "lender" }),
      ],
      active_exchanges: [],
      due_soon: [exchange("e1")],
    },
    "me",
  );
  assert.deepEqual(todayPeople(rows), ["lender", "neighbour"]);
});
