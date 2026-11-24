import assert from "node:assert/strict";
import test from "node:test";

import {
  clearLoanMessageDraft,
  loadExchangeConversation,
  peekLoanMessageDraft,
  stageLoanMessageDraft,
} from "../src/lib/exchange-conversation.ts";
import { mergeRefreshedPage } from "../src/lib/page-refresh.ts";

const exchange = {
  request_id: "request",
  response_id: "accepted",
  requester_user_id: "requester",
  helper_user_id: "helper",
  mode: "help",
};

function conversation(id, responseId, other = "helper") {
  return {
    id,
    request_id: "request",
    response_id: responseId,
    participants: [{ user_id: "requester" }, { user_id: other }],
    status: "open",
  };
}

test("both participants resolve the accepted help conversation across pages", async () => {
  const accepted = conversation("shared-chat", "accepted");
  const api = {
    getExchange: async () => exchange,
    listConversations: async (cursor) =>
      cursor
        ? { items: [accepted], next_cursor: null }
        : {
            items: [
              conversation("other-offer", "earlier"),
              conversation("other-pair", "accepted", "other"),
            ],
            next_cursor: "next",
          },
    getPublicProfile: async (id) => ({ display_name: id }),
  };
  assert.deepEqual(
    await loadExchangeConversation(api, "exchange", "requester", "help"),
    { conversation: accepted, partnerName: "helper" },
  );
  assert.deepEqual(
    await loadExchangeConversation(api, "exchange", "helper", "help"),
    { conversation: accepted, partnerName: "requester" },
  );
});

test("the other mode and nonparticipants cannot load messages", async () => {
  const api = {
    getExchange: async () => exchange,
    listConversations: async () => assert.fail("conversation lookup leaked"),
    getPublicProfile: async () => assert.fail("profile lookup leaked"),
  };
  await assert.rejects(
    loadExchangeConversation(api, "exchange", "requester", "loan"),
  );
  await assert.rejects(
    loadExchangeConversation(api, "exchange", "other", "help"),
  );
});

test("loan mode resolves the same way and missing profile names do not hide chat", async () => {
  const accepted = conversation("loan-chat", "accepted");
  const api = {
    getExchange: async () => ({ ...exchange, mode: "loan" }),
    listConversations: async () => ({ items: [accepted], next_cursor: null }),
    getPublicProfile: async () => {
      throw Object.assign(new Error("Hidden"), { status: 404 });
    },
  };
  assert.deepEqual(
    await loadExchangeConversation(api, "exchange", "requester", "loan"),
    { conversation: accepted, partnerName: null },
  );
});

test("background chat refresh keeps loaded history and its older cursor", () => {
  const previous = { items: [{ id: "b" }, { id: "a" }], next_cursor: "older" };
  const head = { items: [{ id: "c" }, { id: "b" }], next_cursor: "from-b" };
  assert.deepEqual(mergeRefreshedPage(previous, head), {
    items: [{ id: "c" }, { id: "b" }, { id: "a" }],
    next_cursor: "older",
  });
  const disjoint = { items: [{ id: "z" }], next_cursor: "from-z" };
  assert.deepEqual(mergeRefreshedPage(previous, disjoint), disjoint);
});

test("an edited reminder is handed to its participant and loan chat only once", () => {
  const draft = "Could you return the trowel by six? Thanks!";
  stageLoanMessageDraft("helper", "loan-a", draft);
  assert.equal(peekLoanMessageDraft("requester", "loan-a"), null);
  assert.equal(peekLoanMessageDraft("helper", "loan-b"), null);
  assert.equal(peekLoanMessageDraft("helper", "loan-a"), draft);
  clearLoanMessageDraft("helper", "loan-a");
  assert.equal(peekLoanMessageDraft("helper", "loan-a"), null);
});
