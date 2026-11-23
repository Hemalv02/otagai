import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks, stripTypeScriptTypes } from "node:module";
import test from "node:test";

import {
  availabilityLabel,
  detailView,
  isCurrentDetail,
  isListingId,
  isListingOwner,
  photoUrls,
} from "../src/lib/listing-workflow.ts";

const apiUrl = new URL("../src/lib/api.ts", import.meta.url);
const readUrl = new URL("../src/lib/listing-read.ts", import.meta.url);
const supabaseStub = `data:text/javascript,${encodeURIComponent(`
export const supabase = { auth: {
  getSession: async () => ({ data: { session: {
    access_token: "test-token", user: { id: "account-1" }
  } } })
} };
`)}`;

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL === apiUrl.href && specifier === "@/lib/supabase") {
      return { url: supabaseStub, shortCircuit: true };
    }
    if (context.parentURL === readUrl.href && specifier === "./api") {
      return { url: apiUrl.href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === apiUrl.href) {
      return {
        format: "module",
        source: stripTypeScriptTypes(readFileSync(apiUrl, "utf8"), {
          mode: "transform",
        }),
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});
const originalApiUrl = process.env.EXPO_PUBLIC_API_URL;
process.env.EXPO_PUBLIC_API_URL = "https://api.example.invalid";
const { api } = await import(apiUrl.href);
const { requestApiError } = await import(readUrl.href).finally(() => {
  hooks.deregister();
  if (originalApiUrl === undefined) delete process.env.EXPO_PUBLIC_API_URL;
  else process.env.EXPO_PUBLIC_API_URL = originalApiUrl;
});

const ID = "1c614075-e85a-4f5c-8b49-6f76a7744154";

test("a legacy fixture id is not a listing id and a UUID is", () => {
  assert.equal(isListingId("drill"), false);
  assert.equal(isListingId(""), false);
  assert.equal(isListingId(ID), true);
});

const here = { account: "account-1", id: ID };
const listing = (over = {}) => ({
  id: ID,
  owner: { id: "owner-1", display_name: "Tanaka" },
  category_id: "c",
  description: null,
  safety_notes: null,
  lend_mode: "lend",
  available_again_at: null,
  parts: [],
  title: "Drill",
  kind: "tool",
  status: "active",
  availability_note: null,
  photos: [],
  ...over,
});

test("a malformed route id is unavailable without waiting for a fetch", () => {
  const state = { account: "account-1", id: "drill", status: "loading" };
  assert.equal(detailView(state, { account: "account-1", id: "drill" }), "unavailable");
});

test("a pending read for the current account and route is loading", () => {
  assert.equal(detailView({ ...here, status: "loading" }, here), "loading");
});

test("a loaded listing for the current account and route is loaded", () => {
  assert.equal(detailView({ ...here, status: "loaded", listing: listing() }, here), "loaded");
});

test("a response from a previous route or account never renders", () => {
  const other = "2f2ea9d6-0c0c-4f4e-9b4a-0a52e4a8d3f1";
  const state = { ...here, status: "loaded", listing: listing() };
  assert.equal(detailView(state, { account: "account-1", id: other }), "loading");
  assert.equal(detailView(state, { account: "account-2", id: ID }), "loading");
  assert.equal(detailView(state, { account: "", id: ID }), "loading");
});

test("a late response is applied only when account and route id both match", () => {
  const other = "2f2ea9d6-0c0c-4f4e-9b4a-0a52e4a8d3f1";
  assert.equal(isCurrentDetail(here, { account: "account-1", id: ID }), true);
  assert.equal(isCurrentDetail(here, { account: "account-2", id: ID }), false);
  assert.equal(isCurrentDetail(here, { account: "account-1", id: other }), false);
});

async function failWith(status) {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ message: "no" }, { status });
  try {
    await api.getListing(ID, undefined, "account-1");
  } catch (error) {
    return requestApiError(error);
  } finally {
    globalThis.fetch = original;
  }
  throw new Error("expected a failure");
}

async function failedView(status) {
  const errorKind = await failWith(status);
  return detailView({ ...here, status: "error", errorKind }, here);
}

test("an API 404 for a hidden or deleted listing is unavailable", async () => {
  assert.equal(await failedView(404), "unavailable");
});

test("a server failure and a rate limit are retryable", async () => {
  assert.equal(await failedView(503), "retryable");
  assert.equal(await failedView(429), "retryable");
});

test("an unauthorized read is its own state and is not retryable", async () => {
  assert.equal(await failedView(401), "auth");
});

test("an unexpected failure shows an error that is not retryable", async () => {
  assert.equal(await failedView(409), "error");
});

test("a dropped connection is retryable", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new TypeError("network down");
  };
  try {
    const error = await api.getListing(ID, undefined, "account-1").catch((e) => e);
    assert.equal(
      detailView({ ...here, status: "error", errorKind: requestApiError(error) }, here),
      "retryable",
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("the owner link shows only when the listing owner is the profile", () => {
  assert.equal(isListingOwner(listing(), "owner-1"), true);
  assert.equal(isListingOwner(listing(), "someone-else"), false);
});

test("an ownerless listing never has an owner link, even without a profile", () => {
  assert.equal(isListingOwner(listing({ owner: null }), "owner-1"), false);
  assert.equal(isListingOwner(listing({ owner: null }), undefined), false);
  assert.equal(isListingOwner(listing(), undefined), false);
});

const labels = {
  lend: "Available to lend",
  help_only: "Help offered",
  lend_or_help: "Lending or help offered",
  lentOut: "Lent out",
};

test("a lend listing reads as available to lend", () => {
  assert.equal(availabilityLabel(listing(), labels), "Available to lend");
});

test("a help-only listing reads as help offered, not borrowing", () => {
  assert.equal(availabilityLabel(listing({ lend_mode: "help_only" }), labels), "Help offered");
});

test("a lend-or-help listing reads as both", () => {
  assert.equal(
    availabilityLabel(listing({ lend_mode: "lend_or_help" }), labels),
    "Lending or help offered",
  );
});

test("a lent-out listing reads as lent out in every lend mode", () => {
  for (const lend_mode of ["lend", "help_only", "lend_or_help"]) {
    assert.equal(availabilityLabel(listing({ lend_mode, status: "lent_out" }), labels), "Lent out");
  }
});

test("no photos yields no photo urls so the empty treatment shows", () => {
  assert.deepEqual(photoUrls(listing({ photos: [] })), []);
});

test("a photo uses its display url and falls back to the thumbnail", () => {
  const photos = [
    { media_id: "m1", display_url: "https://img.example/d1", thumb_url: "https://img.example/t1" },
    { media_id: "m2", display_url: null, thumb_url: "https://img.example/t2" },
    { media_id: "m3", display_url: null, thumb_url: null },
  ];
  assert.deepEqual(photoUrls(listing({ photos })), [
    { id: "m1", url: "https://img.example/d1" },
    { id: "m2", url: "https://img.example/t2" },
  ]);
});
