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

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL === apiUrl.href && specifier === "@/lib/supabase") {
      return { url: sessionModule, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === apiUrl.href) {
      const source = readFileSync(apiUrl, "utf8");
      return {
        format: "module",
        source: stripTypeScriptTypes(source, { mode: "transform" }),
        shortCircuit: true,
      };
    }
    return nextLoad(url, context);
  },
});
const { supabase } = await import(sessionModule);

const skill = {
  kind: "skill",
  category_id: "c3d91c57-038f-47a8-9743-d25587be29df",
  title: "Cooking",
  lang: "en",
  lend_mode: "help_only",
  media_ids: [],
};

const originalApiUrl = process.env.EXPO_PUBLIC_API_URL;
process.env.EXPO_PUBLIC_API_URL = "https://api.example.invalid";
const { api, ApiError } = await import(apiUrl.href).finally(() => {
  hooks.deregister();
  if (originalApiUrl === undefined) delete process.env.EXPO_PUBLIC_API_URL;
  else process.env.EXPO_PUBLIC_API_URL = originalApiUrl;
});

test("uploads a listing photo with an authenticated multipart boundary", async (t) => {
  const media = {
    id: "1c614075-e85a-4f5c-8b49-6f76a7744154",
    kind: "image",
    purpose: "listing",
    status: "processing",
    width: null,
    height: null,
    duration_ms: null,
    blurhash: null,
    urls: {},
    created_at: "2026-11-23T10:00:00Z",
  };

  let request;
  t.mock.method(globalThis, "fetch", async (input, init) => {
    request = new Request(input, init);
    return Response.json(media, {
      status: 202,
      headers: { Location: `/media/${media.id}` },
    });
  });

  const form = new FormData();
  form.append("purpose", "listing");
  form.append(
    "file",
    new Blob(["photo bytes"], { type: "image/png" }),
    "drill.png",
  );
  assert.deepEqual(await api.uploadListingPhoto(form), media);
  assert.equal(request.url, "https://api.example.invalid/media");
  assert.equal(request.method, "POST");
  assert.equal(request.headers.get("authorization"), "Bearer test-token");
  assert.match(
    request.headers.get("content-type"),
    /^multipart\/form-data; boundary=.+$/,
  );
  const payload = await request.formData();
  assert.equal(payload.get("purpose"), "listing");
  const file = payload.get("file");
  assert.equal(file.name, "drill.png");
  assert.equal(file.type, "image/png");
});

test("an owner page sends both filters and preserves an opaque cursor", async (t) => {
  const cursor = "example+/=cursor";
  const controller = new AbortController();
  let request;
  t.mock.method(globalThis, "fetch", async (input, init) => {
    request = { url: new URL(input), signal: init.signal };
    return Response.json({ items: [], next_cursor: null });
  });

  const page = await api.listMyListings(
    {
      kind: "skill",
      status: "paused",
      cursor,
      limit: 5,
    },
    controller.signal,
  );
  assert.deepEqual(page, { items: [], next_cursor: null });
  assert.equal(request.url.pathname, "/users/me/listings");
  assert.equal(request.url.searchParams.get("kind"), "skill");
  assert.equal(request.url.searchParams.get("status"), "paused");
  assert.equal(request.url.searchParams.get("cursor"), cursor);
  assert.equal(request.url.searchParams.get("limit"), "5");
  assert.equal(request.signal, controller.signal);
});

test("a Browse page preserves filters and cursor in an authenticated GET", async (t) => {
  const controller = new AbortController();
  const page = { items: [], next_cursor: "next+/=cursor" };
  let request;
  let signal;
  t.mock.method(globalThis, "fetch", async (input, init) => {
    request = new Request(input, init);
    signal = init.signal;
    return Response.json(page);
  });

  assert.deepEqual(
    await api.listListings(
      {
        q: "料理 & রান্না",
        kind: "skill",
        category_id: "c3d91c57-038f-47a8-9743-d25587be29df",
        cursor: "example+/=cursor",
        limit: 5,
      },
      { authUserId: "account-1", signal: controller.signal },
    ),
    page,
  );
  const url = new URL(request.url);
  assert.equal(url.pathname, "/listings");
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    q: "料理 & রান্না",
    kind: "skill",
    category_id: "c3d91c57-038f-47a8-9743-d25587be29df",
    cursor: "example+/=cursor",
    limit: "5",
    status: "active,lent_out",
  });
  assert.equal(request.method, "GET");
  assert.equal(request.headers.get("authorization"), "Bearer test-token");
  assert.equal(signal, controller.signal);
});

test("a Browse page omits unset filters from the query", async (t) => {
  let url;
  t.mock.method(globalThis, "fetch", async (input) => {
    url = new URL(input);
    return Response.json({ items: [], next_cursor: null });
  });

  await api.listListings({});

  assert.deepEqual([...url.searchParams], [["status", "active,lent_out"]]);
});

test("a Browse page for the previous account sends no request under the new account", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () =>
    Response.json({ items: [], next_cursor: null }),
  );

  await assert.rejects(
    api.listListings({}, { authUserId: "previous-account" }),
    (error) => error instanceof ApiError && error.status === 401,
  );
  assert.equal(fetch.mock.callCount(), 0);
});

test("a listing delete accepts an empty 204 response", async (t) => {
  let request;
  t.mock.method(globalThis, "fetch", async (input, init) => {
    request = new Request(input, init);
    return new Response(null, { status: 204 });
  });

  assert.equal(await api.deleteListing("listing-1"), undefined);
  assert.equal(new URL(request.url).pathname, "/listings/listing-1");
  assert.equal(request.method, "DELETE");
});

test("a lent-out delete conflict preserves the server status and message", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ message: "This item is lent out." }, { status: 409 }),
  );

  await assert.rejects(api.deleteListing("listing-1"), (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 409);
    assert.equal(error.message, "This item is lent out.");
    return true;
  });
});

test("publishing for the previous account sends no request under the new account", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () =>
    Response.json({}),
  );

  await assert.rejects(
    api.createListing(skill, { authUserId: "previous-account" }),
    (error) => error instanceof ApiError && error.status === 401,
  );
  assert.equal(fetch.mock.callCount(), 0);
});

test("canceling while the session is resolving prevents the publish request", async (t) => {
  const controller = new AbortController();
  const session = Promise.withResolvers();
  t.mock.method(supabase.auth, "getSession", () => session.promise);
  const fetch = t.mock.method(globalThis, "fetch", async () =>
    Response.json({}),
  );

  const pending = api.createListing(skill, {
    authUserId: "account-1",
    signal: controller.signal,
  });
  controller.abort();
  session.resolve({
    data: {
      session: { access_token: "test-token", user: { id: "account-1" } },
    },
  });

  await assert.rejects(pending);
  assert.equal(fetch.mock.callCount(), 0);
});
