import assert from "node:assert/strict";
import test from "node:test";

import {
  helpExchangeStage,
  helpSchedulePatch,
} from "../src/lib/help-exchange-state.ts";

const exchange = {
  mode: "help",
  status: "scheduled",
  requester_user_id: "requester",
  helper_user_id: "helper",
  requester_confirmed_at: null,
  helper_confirmed_at: null,
};

test("each participant starts and independently confirms live help", () => {
  const active = { ...exchange, status: "active" };
  for (const account of ["requester", "helper"]) {
    assert.equal(helpExchangeStage(exchange, account), "scheduled");
    assert.equal(helpExchangeStage(active, account), "confirm");
    assert.equal(
      helpExchangeStage({ ...active, status: "completed" }, account),
      "completed",
    );
  }
  assert.equal(helpExchangeStage(active, "other"), null);
  assert.equal(helpExchangeStage({ ...active, mode: "loan" }, "helper"), null);
  assert.equal(
    helpExchangeStage({ ...active, status: "disputed" }, "helper"),
    null,
  );

  const checked = { ...active, requester_confirmed_at: "saved" };
  assert.equal(helpExchangeStage(checked, "requester"), "waiting");
  assert.equal(helpExchangeStage(checked, "helper"), "confirm");
});

test("schedule patches omit unchanged fields and an unset time", () => {
  const now = Date.parse("2030-01-01T00:00:00Z");
  const old = {
    scheduled_at: "2029-12-30T06:00:00+06:00",
    meet_place_note: "Library",
  };
  assert.deepEqual(
    helpSchedulePatch(
      old,
      new Date("2029-12-30T00:00:00Z"),
      " Community hall ",
      now,
    ),
    { meet_place_note: "Community hall" },
  );
  assert.deepEqual(
    helpSchedulePatch(
      old,
      new Date("2030-01-03T10:00:00+06:00"),
      "Library",
      now,
    ),
    { scheduled_at: "2030-01-03T04:00:00.000Z" },
  );
  assert.deepEqual(
    helpSchedulePatch({ ...old, scheduled_at: null }, null, "  ", now),
    {
      meet_place_note: null,
    },
  );
  assert.deepEqual(
    helpSchedulePatch(old, new Date(old.scheduled_at), "Library", now),
    {},
  );
});

test("new schedule times must be valid and future", () => {
  const now = Date.parse("2030-01-01T00:00:00Z");
  const unset = { scheduled_at: null, meet_place_note: null };
  assert.equal(helpSchedulePatch(unset, new Date(now), "", now), null);
  assert.equal(helpSchedulePatch(unset, new Date(""), "", now), null);
});
