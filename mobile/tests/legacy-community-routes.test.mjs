import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/uuid") {
      return {
        url: new URL("../src/lib/uuid.ts", import.meta.url).href,
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
});

const { legacyReceiptHref, resolveLegacyExchangeHref } = await import(
  "../src/lib/legacy-community-routes.ts"
).finally(() => hooks.deregister());

const id = "c3d91c57-038f-47a8-9743-d25587be29df";
const exchange = {
  requester_user_id: "requester",
  helper_user_id: "helper",
};

test("a legacy receipt opens real delivery history or falls back to Requests", () => {
  assert.deepEqual(legacyReceiptHref(id), {
    pathname: "/requests/[id]/ripple",
    params: { id },
  });
  for (const invalid of ["shelf-request", [id], undefined, `${id}/../`]) {
    assert.equal(legacyReceiptHref(invalid), "/requests");
  }
});

test("legacy exchange links open the appropriate live action for either participant", async () => {
  const paths = {
    help: {
      chat: "/exchanges/[id]/messages",
      complete: "/exchanges/[id]",
      pickup: "/exchanges/[id]",
      "thank-you": "/exchanges/[id]/thank-you",
    },
    loan: {
      chat: "/loans/[id]/messages",
      complete: "/loans/[id]",
      pickup: "/loans/[id]/pickup",
      "thank-you": "/loans/[id]/thank-you",
    },
  };

  for (const [mode, routes] of Object.entries(paths)) {
    for (const [screen, pathname] of Object.entries(routes)) {
      for (const viewer of ["requester", "helper"]) {
        const href = await resolveLegacyExchangeHref(
          screen,
          id,
          viewer,
          async (found) => {
            assert.equal(found, id);
            return { ...exchange, mode };
          },
        );
        assert.deepEqual(href, { pathname, params: { id } });
      }
    }
  }
});

test("sample IDs and missing viewers return to Requests without a lookup", async () => {
  const load = async () => assert.fail("unexpected exchange lookup");
  for (const invalid of ["rice-carry", [id], undefined, `${id}/../`]) {
    assert.equal(
      await resolveLegacyExchangeHref("chat", invalid, "requester", load),
      "/requests",
    );
  }
  assert.equal(
    await resolveLegacyExchangeHref("pickup", id, null, load),
    "/requests",
  );
});

test("unrecognized mode and nonparticipants cannot open a legacy exchange", async () => {
  assert.equal(
    await resolveLegacyExchangeHref("pickup", id, "other", async () => ({
      ...exchange,
      mode: "loan",
    })),
    "/requests",
  );
  assert.equal(
    await resolveLegacyExchangeHref("chat", id, "helper", async () => ({
      ...exchange,
      mode: "unknown",
    })),
    "/requests",
  );
});

test("exchange route lookup keeps temporary failures available for retry", async () => {
  const unavailable = await resolveLegacyExchangeHref(
    "thank-you",
    id,
    "requester",
    async () => null,
  );
  assert.equal(unavailable, "/requests");

  const connectionError = new Error("Connection error");
  await assert.rejects(
    resolveLegacyExchangeHref("chat", id, "requester", async () => {
      throw connectionError;
    }),
    (error) => error === connectionError,
  );
});
