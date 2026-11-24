import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks, stripTypeScriptTypes } from "node:module";
import test from "node:test";

const apiUrl = new URL("../src/lib/api.ts", import.meta.url);
const sessionModule = `data:text/javascript,${encodeURIComponent(`
export const supabase = { auth: {
  getSession: async () => ({ data: { session: {
    access_token: "test-token", user: { id: "account-1" }
  } } })
} };
`)}`;
const platformStubs = {
  "expo/fetch": `data:text/javascript,${encodeURIComponent("export const fetch = (...args) => globalThis.fetch(...args);")}`,
  "react-native": `data:text/javascript,${encodeURIComponent('export const Platform = { OS: "web" };')}`,
};

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL === apiUrl.href && platformStubs[specifier]) {
      return { url: platformStubs[specifier], shortCircuit: true };
    }
    if (context.parentURL === apiUrl.href && specifier === "@/lib/supabase") {
      return { url: sessionModule, shortCircuit: true };
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
const { request, ApiError } = await import(apiUrl.href).finally(() => {
  hooks.deregister();
  if (originalApiUrl === undefined) delete process.env.EXPO_PUBLIC_API_URL;
  else process.env.EXPO_PUBLIC_API_URL = originalApiUrl;
});

const originalFetch = globalThis.fetch;
test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

async function failure(status, body) {
  globalThis.fetch = async () =>
    new Response(body, {
      status,
      headers: { "Content-Type": "application/json" },
    });
  try {
    await request("/requests");
  } catch (error) {
    return error;
  }
  assert.fail("request should have failed");
}

test("an error body with message, code and request_id fills the ApiError", async () => {
  const error = await failure(
    409,
    JSON.stringify({
      message: "You already have an open request for this listing.",
      code: "open_request_exists",
      request_id: "0b9e4c1e-6a1c-4c53-9a63-1f3f8f2d5b11",
    }),
  );
  assert.ok(error instanceof ApiError);
  assert.equal(error.status, 409);
  assert.equal(
    error.message,
    "You already have an open request for this listing.",
  );
  assert.equal(error.code, "open_request_exists");
  assert.equal(error.requestId, "0b9e4c1e-6a1c-4c53-9a63-1f3f8f2d5b11");
});

test("wrong-typed code and request_id are ignored", async () => {
  const error = await failure(
    409,
    JSON.stringify({ message: "Nope.", code: 7, request_id: 42 }),
  );
  assert.equal(error.message, "Nope.");
  assert.equal(error.code, undefined);
  assert.equal(error.requestId, undefined);
});

test("a null body falls back to a generic message", async () => {
  const error = await failure(500, "null");
  assert.equal(error.status, 500);
  assert.equal(error.message, "Request failed (500).");
  assert.equal(error.code, undefined);
  assert.equal(error.requestId, undefined);
});

test("a non-JSON body falls back to a generic message", async () => {
  const error = await failure(502, "<html>bad gateway</html>");
  assert.equal(error.message, "Request failed (502).");
  assert.equal(error.code, undefined);
});
