import assert from "node:assert/strict";
import test from "node:test";

import { loanStage } from "../src/lib/loan-state.ts";

const loan = {
  requester_user_id: "borrower",
  helper_user_id: "lender",
  requester_confirmed_at: null,
  helper_confirmed_at: null,
};

test("pickup and return are available to both loan participants", () => {
  for (const account of ["borrower", "lender"]) {
    assert.equal(
      loanStage({ ...loan, status: "scheduled" }, account),
      "pickup",
    );
    assert.equal(loanStage({ ...loan, status: "active" }, account), "return");
  }
  assert.equal(loanStage({ ...loan, status: "active" }, "other"), "closed");
});

test("a returned loan waits for each participant's own confirmation", () => {
  const returned = { ...loan, status: "returned" };
  assert.equal(loanStage(returned, "borrower"), "confirm");
  assert.equal(loanStage(returned, "lender"), "confirm");

  const borrowerConfirmed = { ...returned, requester_confirmed_at: "saved" };
  assert.equal(loanStage(borrowerConfirmed, "borrower"), "waiting");
  assert.equal(loanStage(borrowerConfirmed, "lender"), "confirm");
  assert.equal(
    loanStage({ ...borrowerConfirmed, status: "completed" }, "lender"),
    "completed",
  );
});
