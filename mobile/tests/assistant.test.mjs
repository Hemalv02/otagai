import assert from "node:assert/strict";
import test from "node:test";

import {
  confirmationBody,
  makeReview,
  mergeTurns,
} from "../src/lib/assistant-conversation.ts";

const turn = {
  id: "turn",
  text: "Borrow a drill on Saturday",
  draft: {
    title: "Borrow a drill",
    kind: "borrow",
    description: "Could I borrow a drill?",
    when_text: "Saturday",
    status: "awaiting_confirmation",
  },
};

test("review includes the selected listing and the member's edited timing", () => {
  const pick = {
    listing: { id: "drill", title: "Hammer drill" },
    owner: { id: "neighbour", display_name: "Jun" },
    action: "borrow",
  };
  const review = makeReview(turn, pick);
  assert.equal(review.turnId, "turn");
  assert.equal(review.recipient, "Jun");
  assert.deepEqual(confirmationBody(review, "Could I borrow it?", "Sunday"), {
    kind: "borrow",
    text: "Could I borrow it?\n\nSunday",
    listing_id: "drill",
  });
});

test("a help-only listing stays a help request even if the chat drafted a loan", () => {
  const review = makeReview(turn, {
    listing: { id: "skill", title: "Carpentry" },
    owner: { id: "neighbour", display_name: "Jun" },
    action: "ask_for_help",
  });
  assert.equal(review.kind, "help");
  assert.equal(review.text, "");
});

test("choosing a search result starts with a message to its owner", () => {
  const review = makeReview(
    { ...turn, draft: null },
    {
      listing: { id: "drill", title: "Hammer drill" },
      owner: { id: "neighbour", display_name: "Jun" },
      action: "borrow",
    },
    "Could I borrow your hammer drill?",
  );
  assert.equal(review.text, "Could I borrow your hammer drill?");
});

test("already stated timing is not repeated and blank requests cannot post", () => {
  const review = makeReview(turn);
  assert.equal(confirmationBody(review, "   ", "Saturday"), null);
  assert.equal(
    confirmationBody(review, "Could I borrow it Saturday?", "saturday").text,
    "Could I borrow it Saturday?",
  );
});

test("editing the suggested time updates the prefilled request sentence", () => {
  const review = makeReview({
    ...turn,
    draft: {
      ...turn.draft,
      description: "Could I borrow a drill on Saturday?",
    },
  });
  assert.equal(
    confirmationBody(review, review.text, "Sunday afternoon").text,
    "Could I borrow a drill on Sunday afternoon?",
  );
});

test("merging saved turns restores chronological order without duplicate widgets", () => {
  const first = { id: "one", created_at: "2026-11-23T10:00:00Z" };
  const second = { id: "two", created_at: "2026-11-23T11:00:00Z" };
  const posted = { ...second, request_id: "request" };
  assert.deepEqual(mergeTurns([second], [posted, first]), [first, posted]);
});
