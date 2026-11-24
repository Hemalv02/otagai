import assert from "node:assert/strict";
import test from "node:test";

import { thankYouHref, thankYouPayload } from "../src/lib/thank-you.ts";

const exchange = {
  id: "exchange",
  mode: "help",
  status: "completed",
  requester_user_id: "requester",
  helper_user_id: "helper",
};

test("completed help and loans open their own thank-you entry point", () => {
  assert.deepEqual(thankYouHref(exchange, "requester"), {
    pathname: "/exchanges/[id]/thank-you",
    params: { id: exchange.id },
  });
  assert.deepEqual(thankYouHref({ ...exchange, mode: "loan" }, "helper"), {
    pathname: "/loans/[id]/thank-you",
    params: { id: exchange.id },
  });
  assert.equal(thankYouHref(exchange, "other"), null);
  assert.equal(thankYouHref({ ...exchange, status: "active" }, "requester"), null);
});

test("demo checkout submits only the edited private note", () => {
  assert.deepEqual(
    thankYouPayload(exchange.id, "  Thanks for the boxes!  ", "en", true, "demo"),
    {
      exchange_id: exchange.id,
      gift_type: "note",
      note: "Thanks for the boxes!",
      lang: "en",
      ai_drafted: true,
    },
  );
});

test("points attach to the note as a thank-you gift", () => {
  const result = thankYouPayload(exchange.id, "Thanks!", "en", false, "points");
  assert.equal(result.gift_type, "points");
  assert.equal(result.points_amount, 5);
});
