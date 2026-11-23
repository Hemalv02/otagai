import assert from "node:assert/strict";
import test from "node:test";

import {
  applyCommunityAction,
  requestSeed,
} from "../src/lib/community-demo-state.ts";

test("a new request needs a different neighbour and the requester to start an exchange", () => {
  const initial = [requestSeed];
  const request = { ...requestSeed, id: "new", createdBy: "member" };
  const created = applyCommunityAction(initial, { type: "create", request });

  assert.equal(created[0].id, "new");
  assert.equal(
    applyCommunityAction(created, {
      type: "offer",
      id: "new",
      actor: "member",
    }),
    created,
  );

  const offered = applyCommunityAction(created, {
    type: "offer",
    id: "new",
    actor: "neighbour",
  });
  assert.deepEqual(offered[0].offer, { by: "neighbour" });
  assert.equal(
    applyCommunityAction(offered, {
      type: "accept",
      id: "new",
      actor: "neighbour",
    }),
    offered,
  );

  const matched = applyCommunityAction(offered, {
    type: "accept",
    id: "new",
    actor: "member",
  });
  assert.equal(matched[0].status, "matched");
  assert.equal(matched[1], requestSeed);
});

test("messages, confirmation, and thank-you follow the exchange state", () => {
  const id = requestSeed.id;
  const message = {
    id: "message",
    by: "member",
    text: " I can meet by the steps. ",
  };
  const requested = [requestSeed];
  assert.equal(
    applyCommunityAction(requested, { type: "message", id, message }),
    requested,
  );

  const offered = applyCommunityAction(requested, {
    type: "offer",
    id,
    actor: "member",
  });
  const matched = applyCommunityAction(offered, {
    type: "accept",
    id,
    actor: "neighbour",
  });
  const messaged = applyCommunityAction(matched, {
    type: "message",
    id,
    message,
  });
  assert.equal(messaged[0].messages.at(-1).text, message.text.trim());

  const confirmed = applyCommunityAction(messaged, {
    type: "confirm",
    id,
    actor: "member",
  });
  assert.equal(confirmed[0].status, "matched");
  assert.equal(
    applyCommunityAction(confirmed, { type: "confirm", id, actor: "member" }),
    confirmed,
  );
  assert.equal(
    applyCommunityAction(confirmed, {
      type: "thanks",
      id,
      actor: "neighbour",
      note: "Thanks!",
    }),
    confirmed,
  );

  const completed = applyCommunityAction(confirmed, {
    type: "confirm",
    id,
    actor: "neighbour",
  });
  assert.equal(completed[0].status, "completed");
  assert.equal(
    applyCommunityAction(completed, {
      type: "thanks",
      id,
      actor: "member",
      note: "Thanks!",
    }),
    completed,
  );

  const thanked = applyCommunityAction(completed, {
    type: "thanks",
    id,
    actor: "neighbour",
    note: " Thank you! ",
  });
  assert.equal(thanked[0].thankYou, "Thank you!");
});

test("both sides confirm the same pickup checklist, and an unresolved difference blocks pickup", () => {
  const id = "drill-loan";
  const items = [
    { id: "tool", label: "Drill" },
    { id: "bit", label: "Two bits" },
  ];
  const current = [
    {
      ...requestSeed,
      id,
      listingId: "hammer-drill",
      status: "matched",
      createdBy: "member",
      offer: { by: "neighbour" },
    },
  ];
  const confirm = (records, actor, checked = ["tool", "bit"]) =>
    applyCommunityAction(records, {
      type: "confirmPickup",
      id,
      actor,
      items,
      checked,
    });

  assert.equal(confirm(current, "member", ["tool"]), current);
  const first = confirm(current, "member");
  assert.deepEqual(first[0].pickup.confirmedBy, ["member"]);

  const reported = applyCommunityAction(first, {
    type: "flagPickup",
    id,
    actor: "neighbour",
    items,
    note: " One bit is missing. ",
  });
  assert.deepEqual(reported[0].pickup.confirmedBy, []);
  assert.deepEqual(reported[0].pickup.issue, {
    by: "neighbour",
    note: "One bit is missing.",
  });
  assert.equal(confirm(reported, "member"), reported);

  const updatedItems = [
    { id: "tool", label: "Drill" },
    { id: "bit", label: "One bit" },
  ];
  const revised = applyCommunityAction(reported, {
    type: "savePickup",
    id,
    actor: "neighbour",
    items: updatedItems,
  });
  assert.equal(revised[0].pickup.issue, undefined);
  assert.equal(confirm(revised, "member"), revised);
  const borrower = applyCommunityAction(revised, {
    type: "confirmPickup",
    id,
    actor: "member",
    items: updatedItems,
    checked: ["tool", "bit"],
  });
  const both = applyCommunityAction(borrower, {
    type: "confirmPickup",
    id,
    actor: "neighbour",
    items: updatedItems,
    checked: ["tool", "bit"],
  });
  assert.deepEqual(both[0].pickup.confirmedBy, ["member", "neighbour"]);
  assert.equal(
    applyCommunityAction(both, {
      type: "savePickup",
      id,
      actor: "member",
      items,
    }),
    both,
  );
});
