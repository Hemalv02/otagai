import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFamilyOverview,
  failureResult,
  formatNeededWindow,
  nextRequestsEntry,
  retainSelection,
  requestsViewFor,
  selectAccount,
} from "../src/lib/family-state.ts";

const self = { id: "u-yuki", display_name: "Yuki" };

function link(overrides) {
  return {
    id: "link-1",
    user_id: self.id,
    relative_user_id: "u-mum",
    relation: "child",
    status: "accepted",
    other: { id: "u-mum", display_name: "Mum" },
    created_at: "2026-11-20T09:00:00Z",
    decided_at: "2026-11-20T10:00:00Z",
    ...overrides,
  };
}

function grant(overrides) {
  return {
    id: "grant-1",
    member_user_id: "u-mum",
    caretaker_user_id: self.id,
    caretaker_role: "family",
    can_post_requests: true,
    can_chat: true,
    can_thank_and_pay: false,
    can_view_activity: true,
    can_manage_listings: false,
    consent_method: "in_person",
    consented_at: "2026-11-20T10:00:00Z",
    created_at: "2026-11-20T10:00:00Z",
    other: { id: "u-mum", display_name: "Mum" },
    ...overrides,
  };
}

function openRequest(overrides) {
  return {
    id: "req-1",
    requester_user_id: "u-mum",
    kind: "help",
    status: "open",
    polite_text: "Could someone carry rice up the stairs?",
    lang: "ja",
    listing_id: null,
    direct_to_user_id: null,
    needed_from: null,
    needed_until: null,
    ripple_stage: "han",
    ripple_max_stage: "han",
    created_at: "2026-11-21T08:00:00Z",
    ...overrides,
  };
}

test("the signed-in account comes first, then everyone with an active grant", () => {
  const overview = buildFamilyOverview(
    self,
    [link()],
    [
      grant(),
      grant({
        id: "grant-2",
        member_user_id: "u-grandpa",
        can_view_activity: false,
        other: { id: "u-grandpa", display_name: "Grandpa" },
      }),
    ],
  );

  assert.deepEqual(overview.accounts, [
    { id: "u-yuki", name: "Yuki", isSelf: true, canViewActivity: true },
    { id: "u-mum", name: "Mum", isSelf: false, canViewActivity: true },
    {
      id: "u-grandpa",
      name: "Grandpa",
      isSelf: false,
      canViewActivity: false,
    },
  ]);
});

test("grants without a profile, for someone else, or duplicated are skipped", () => {
  const overview = buildFamilyOverview(
    self,
    [],
    [
      grant(),
      grant({ id: "grant-dup" }),
      grant({ id: "grant-ghost", member_user_id: "u-ghost", other: null }),
      grant({
        id: "grant-foreign",
        member_user_id: "u-other",
        caretaker_user_id: "u-someone-else",
        other: { id: "u-other", display_name: "Other" },
      }),
      grant({
        id: "grant-self",
        member_user_id: self.id,
        other: { id: self.id, display_name: "Yuki" },
      }),
    ],
  );

  assert.deepEqual(
    overview.accounts.map((account) => account.id),
    ["u-yuki", "u-mum"],
  );
});

test("links show pending direction, grant permission, or a missing grant", () => {
  const overview = buildFamilyOverview(
    self,
    [
      link(),
      link({
        id: "link-2",
        relative_user_id: "u-cousin",
        status: "pending",
        decided_at: null,
        other: { id: "u-cousin", display_name: "Cousin" },
      }),
      link({
        id: "link-3",
        user_id: "u-aunt",
        relative_user_id: self.id,
        status: "pending",
        decided_at: null,
        other: { id: "u-aunt", display_name: "Aunt" },
      }),
      link({
        id: "link-4",
        relative_user_id: "u-brother",
        other: { id: "u-brother", display_name: "Brother" },
      }),
      link({
        id: "link-5",
        relative_user_id: "u-grandpa",
        other: { id: "u-grandpa", display_name: "Grandpa" },
      }),
      link({
        id: "link-6",
        relative_user_id: "u-ex",
        status: "revoked",
        other: { id: "u-ex", display_name: "Former link" },
      }),
      link({ id: "link-7", relative_user_id: "u-gone", other: null }),
    ],
    [
      grant(),
      grant({
        id: "grant-2",
        member_user_id: "u-grandpa",
        can_view_activity: false,
        other: { id: "u-grandpa", display_name: "Grandpa" },
      }),
    ],
  );

  assert.deepEqual(overview.links, [
    { id: "link-1", personId: "u-mum", name: "Mum", standing: "can-view" },
    {
      id: "link-2",
      personId: "u-cousin",
      name: "Cousin",
      standing: "pending-outgoing",
    },
    {
      id: "link-3",
      personId: "u-aunt",
      name: "Aunt",
      standing: "pending-incoming",
    },
    {
      id: "link-4",
      personId: "u-brother",
      name: "Brother",
      standing: "no-permission",
    },
    {
      id: "link-5",
      personId: "u-grandpa",
      name: "Grandpa",
      standing: "activity-hidden",
    },
  ]);
});

test("a vanished selection falls back to the signed-in account", () => {
  const { accounts } = buildFamilyOverview(self, [], [grant()]);

  assert.equal(selectAccount(accounts, "u-mum").id, "u-mum");
  assert.equal(selectAccount(accounts, "u-revoked").id, self.id);
  assert.equal(selectAccount(accounts, null).id, self.id);
});

test("rows for another account are never shown after a switch", () => {
  const mum = {
    id: "u-mum",
    name: "Mum",
    isSelf: false,
    canViewActivity: true,
  };
  const me = { id: self.id, name: "Yuki", isSelf: true, canViewActivity: true };
  const entry = nextRequestsEntry(null, "u-mum", {
    ok: true,
    items: [openRequest()],
  });

  assert.equal(requestsViewFor(entry, mum).status, "ready");
  assert.deepEqual(requestsViewFor(entry, me), { status: "loading" });
});

test("an account without the activity scope never shows rows", () => {
  const hidden = {
    id: "u-mum",
    name: "Mum",
    isSelf: false,
    canViewActivity: false,
  };
  const entry = nextRequestsEntry(null, "u-mum", {
    ok: true,
    items: [openRequest()],
  });

  assert.deepEqual(requestsViewFor(entry, hidden), {
    status: "no-permission",
  });
});

test("only open requests owned by the selected account are kept", () => {
  const entry = nextRequestsEntry(null, "u-mum", {
    ok: true,
    items: [
      openRequest(),
      openRequest({ id: "req-2", status: "matched" }),
      openRequest({ id: "req-3", requester_user_id: "u-someone-else" }),
    ],
  });

  assert.equal(entry.view.status, "ready");
  assert.deepEqual(
    entry.view.items.map((item) => item.id),
    ["req-1"],
  );
});

test("a denied fetch discards rows even when a refresh had data", () => {
  const ready = nextRequestsEntry(null, "u-mum", {
    ok: true,
    items: [openRequest()],
  });
  const denied = nextRequestsEntry(ready, "u-mum", failureResult(403, "No"));

  assert.deepEqual(denied, { accountId: "u-mum", view: { status: "denied" } });
});

test("a failed refresh keeps the same account's rows and flags it", () => {
  const ready = nextRequestsEntry(null, "u-mum", {
    ok: true,
    items: [openRequest()],
  });
  const failed = nextRequestsEntry(
    ready,
    "u-mum",
    failureResult(0, "Could not reach Otagai."),
  );

  assert.equal(failed.view.status, "ready");
  assert.equal(failed.view.refreshFailed, true);
  assert.equal(failed.view.items.length, 1);

  const otherAccount = nextRequestsEntry(
    ready,
    self.id,
    failureResult(500, "Something went wrong."),
  );
  assert.deepEqual(otherAccount.view, {
    status: "error",
    message: "Something went wrong.",
  });
});

test("only a 403 counts as a denied grant", () => {
  assert.deepEqual(failureResult(403, "Denied"), {
    ok: false,
    denied: true,
    message: "Denied",
  });
  assert.equal(failureResult(401, "Sign in").denied, false);
  assert.equal(failureResult(0, "Offline").denied, false);
});

test("needed times read naturally and say when there is no time set", () => {
  const options = { timeZone: "Asia/Tokyo" };
  assert.equal(formatNeededWindow(null, null, "en", options), null);
  assert.match(
    formatNeededWindow("2026-11-24T08:00:00Z", null, "en", options),
    /Nov/,
  );
  const window = formatNeededWindow(
    "2026-11-24T08:00:00Z",
    "2026-11-24T10:00:00Z",
    "ja",
    options,
  );
  assert.match(window, /11月24日/);
  assert.match(window, /–/);
});

test("a same-day window shows the date once", () => {
  const options = { timeZone: "Asia/Tokyo" };
  const sameDay = formatNeededWindow(
    "2026-11-24T08:00:00Z",
    "2026-11-24T09:30:00Z",
    "en",
    options,
  );
  assert.equal(sameDay.match(/Nov/g).length, 1);
  assert.match(sameDay, /17:00 – 18:30$/);

  const overnight = formatNeededWindow(
    "2026-11-24T08:00:00Z",
    "2026-11-25T09:00:00Z",
    "en",
    options,
  );
  assert.equal(overnight.match(/Nov/g).length, 2);
});

test("a selection is kept only while that account is still available", () => {
  const { accounts } = buildFamilyOverview(self, [], [grant()]);

  assert.equal(retainSelection(accounts, "u-mum"), "u-mum");
  assert.equal(retainSelection(accounts, "u-revoked"), null);
  assert.equal(retainSelection(accounts, null), null);
});
