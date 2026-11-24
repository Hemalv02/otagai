import assert from "node:assert/strict";
import test from "node:test";

import { extensionDraftDays } from "../src/lib/activity-copy.ts";

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

test("AI extension days count from today for an overdue loan", () => {
  const dates = {
    now: new Date(2026, 10, 24, 1).getTime(),
    overdue: new Date(2026, 9, 24, 23),
    due: new Date(2026, 10, 26, 23),
    tomorrow: new Date(2026, 10, 25, 23),
    newDue: new Date(2026, 10, 28, 23),
    tooFar: new Date(2027, 1, 2, 23),
  };
  assert.equal(extensionDraftDays(dates.tomorrow, dates.overdue, dates.now), 1);
  assert.equal(extensionDraftDays(dates.newDue, dates.due, dates.now), 2);
  assert.equal(extensionDraftDays(dates.tooFar, dates.due, dates.now), undefined);
  assert.equal(extensionDraftDays(dates.tomorrow, dates.due, dates.now), undefined);
});
