import assert from "node:assert/strict";
import test from "node:test";

import {
  actingRequestBody,
  buildPermissions,
  classifySendFailure,
  DEFAULT_SCOPES,
  explicitScopes,
  grantCandidates,
  normalizeMemberId,
  scopeChanges,
  scopesOf,
  validateActingDraft,
} from "../src/lib/family-consent.ts";

const selfId = "11111111-1111-4111-8111-111111111111";
const mumId = "22222222-2222-4222-8222-222222222222";
const sonId = "33333333-3333-4333-8333-333333333333";
const grandpaId = "44444444-4444-4444-8444-444444444444";

function grant(overrides) {
  return {
    id: "grant-1",
    member_user_id: selfId,
    caretaker_user_id: sonId,
    caretaker_role: "family",
    can_post_requests: true,
    can_chat: false,
    can_thank_and_pay: false,
    can_view_activity: true,
    can_manage_listings: false,
    consent_method: "in_person",
    consented_at: "2026-11-24T08:00:00Z",
    created_at: "2026-11-24T08:00:00Z",
    other: { id: sonId, display_name: "Son", kind: "self" },
    can_change_scopes: true,
    ...overrides,
  };
}

function link(overrides) {
  return {
    id: "link-1",
    user_id: selfId,
    relative_user_id: sonId,
    relation: "child",
    status: "accepted",
    other: { id: sonId, display_name: "Son", kind: "self" },
    created_at: "2026-11-24T08:00:00Z",
    decided_at: "2026-11-24T08:00:00Z",
    ...overrides,
  };
}

test("every scope is sent explicitly and listings stay off", () => {
  assert.deepEqual(explicitScopes({ can_view_activity: true }), {
    can_post_requests: false,
    can_chat: false,
    can_thank_and_pay: false,
    can_view_activity: true,
    can_manage_listings: false,
  });
  assert.deepEqual(explicitScopes(DEFAULT_SCOPES), {
    can_post_requests: true,
    can_chat: true,
    can_thank_and_pay: false,
    can_view_activity: true,
    can_manage_listings: false,
  });
  assert.deepEqual(scopesOf(grant()), {
    can_post_requests: true,
    can_chat: false,
    can_thank_and_pay: false,
    can_view_activity: true,
  });
});

test("the server decides who edits a caretaker's scopes", () => {
  const permissions = buildPermissions(
    selfId,
    [grant()],
    [
      grant({
        id: "grant-2",
        member_user_id: mumId,
        caretaker_user_id: selfId,
        other: { id: mumId, display_name: "Mum", kind: "self" },
        can_change_scopes: false,
      }),
      grant({
        id: "grant-3",
        member_user_id: grandpaId,
        caretaker_user_id: selfId,
        other: { id: grandpaId, display_name: "Grandpa", kind: "managed" },
      }),
      grant({
        id: "grant-4",
        member_user_id: "55555555-5555-4555-8555-555555555555",
        caretaker_user_id: selfId,
        other: {
          id: "55555555-5555-4555-8555-555555555555",
          display_name: "Aunt",
          kind: "managed",
        },
        can_change_scopes: false,
      }),
      grant({ id: "grant-ghost", member_user_id: "x", other: null }),
    ],
  );

  assert.deepEqual(
    permissions.actsForMe.map((row) => [row.grantId, row.name, row.canEdit]),
    [["grant-1", "Son", true]],
  );
  assert.deepEqual(
    permissions.iHelp.map((row) => [row.grantId, row.name, row.canEdit]),
    [
      ["grant-2", "Mum", false],
      ["grant-3", "Grandpa", true],
      ["grant-4", "Aunt", false],
    ],
  );
  assert.equal(permissions.actsForMe[0].memberName, null);
  assert.equal(permissions.iHelp[0].memberName, "Mum");
});

test("changes list each scope that flips, in a stable order", () => {
  const before = scopesOf(grant());
  assert.deepEqual(scopeChanges(before, before), []);
  assert.deepEqual(
    scopeChanges(before, {
      ...before,
      can_view_activity: false,
      can_chat: true,
    }),
    [
      { scope: "can_chat", enabled: true },
      { scope: "can_view_activity", enabled: false },
    ],
  );
});

test("saving an edited scope preserves a different scope changed during refresh", () => {
  const refreshed = scopesOf(grant({ can_chat: false }));
  assert.deepEqual(scopeChanges(refreshed, { can_view_activity: false }), [
    { scope: "can_view_activity", enabled: false },
  ]);
});

test("access can be offered only to accepted links without a grant", () => {
  const candidates = grantCandidates(
    [
      link(),
      link({
        id: "link-2",
        relative_user_id: mumId,
        other: { id: mumId, display_name: "Mum", kind: "self" },
      }),
      link({
        id: "link-3",
        relative_user_id: grandpaId,
        status: "pending",
        other: { id: grandpaId, display_name: "Grandpa", kind: "self" },
      }),
      link({ id: "link-4", relative_user_id: "gone", other: null }),
    ],
    [grant()],
  );
  assert.deepEqual(candidates, [{ id: mumId, name: "Mum" }]);
});

test("member ids are trimmed, lower-cased and validated", () => {
  assert.equal(normalizeMemberId(` ${mumId.toUpperCase()} `), mumId);
  assert.equal(normalizeMemberId("not-an-id"), null);
  assert.equal(normalizeMemberId(""), null);
});

test("an acting request needs a need and a destination", () => {
  const draft = { need: "  ", when: "", details: "", circleId: null };
  assert.deepEqual(validateActingDraft(draft), ["need", "circle"]);
  assert.deepEqual(
    validateActingDraft({ ...draft, need: "Medicine", circleId: "c-1" }),
    [],
  );
  assert.deepEqual(
    validateActingDraft({
      ...draft,
      need: "x".repeat(201),
      details: "y".repeat(1501),
      when: "z".repeat(121),
      circleId: "c-1",
    }),
    ["need", "when", "details"],
  );
});

test("the acting request body carries only the reviewed wording and circle", () => {
  assert.deepEqual(
    actingRequestBody(
      {
        need: " Pick up medicine ",
        when: "Today, before 5 pm",
        details: "Lakeside Pharmacy, sealed bag.",
        circleId: "c-1",
      },
      "en",
      "When",
    ),
    {
      kind: "help",
      raw_text:
        "Pick up medicine\nWhen: Today, before 5 pm\n\nLakeside Pharmacy, sealed bag.",
      lang: "en",
      home_circle_id: "c-1",
    },
  );
  assert.equal(
    actingRequestBody(
      { need: "お米", when: "", details: "", circleId: "c-2" },
      "ja",
      "日時",
    ).raw_text,
    "お米",
  );
});

test("send failures map to what the caretaker can do next", () => {
  assert.equal(classifySendFailure(403), "revoked");
  assert.equal(classifySendFailure(400), "destination");
  assert.equal(classifySendFailure(404), "failed");
  assert.equal(classifySendFailure(0), "unconfirmed");
  assert.equal(classifySendFailure(408), "unconfirmed");
  assert.equal(classifySendFailure(401), "session");
  assert.equal(classifySendFailure(500), "unconfirmed");
  assert.equal(classifySendFailure(502), "unconfirmed");
});
