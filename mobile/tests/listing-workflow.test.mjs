import assert from "node:assert/strict";
import test from "node:test";

import {
  buildListingPatch,
  createLatestRequest,
  mergeListingPages,
  prepareListingMedia,
  rebaseListingDraft,
  reconcileListingRows,
} from "../src/lib/listing-workflow.ts";

test("editing only the title preserves an existing availability note with whitespace", () => {
  assert.deepEqual(
    buildListingPatch(
      { title: "Drill", availability_note: "  Weekends  " },
      " Cordless drill ",
      "  Weekends  ",
    ),
    { title: "Cordless drill" },
  );
});

test("clearing availability sends null and preserves an untouched title", () => {
  assert.deepEqual(
    buildListingPatch(
      { title: "  Drill  ", availability_note: "Weekends" },
      "  Drill  ",
      "   ",
    ),
    { availability_note: null },
  );
});

test("a lent-out detail removes the former paused row from the paused filter", () => {
  const otherRow = {
    id: "saw",
    owner_user_id: "owner",
    kind: "tool",
    title: "Saw",
    status: "paused",
    photo_url: null,
    available_again_at: null,
  };
  const rows = [{ ...otherRow, id: "drill", title: "Drill" }, otherRow];

  const visible = reconcileListingRows(
    rows,
    { id: "drill", kind: "tool", title: "Drill", status: "lent_out" },
    "tool",
    "paused",
  );

  assert.deepEqual(visible, [otherRow]);
});

test("a successful resume updates the row visible before reloading", () => {
  const paused = {
    id: "drill",
    owner_user_id: "owner",
    kind: "tool",
    title: "Drill",
    status: "paused",
    photo_url: "https://photos.example.invalid/drill.png",
    available_again_at: null,
  };

  const visible = reconcileListingRows(
    [paused],
    { id: "drill", kind: "tool", title: "Cordless drill", status: "active" },
    "all",
    "all",
  );

  assert.deepEqual(visible, [
    { ...paused, status: "active", title: "Cordless drill" },
  ]);
});

test("after a status action, an unchanged draft title follows the server title", () => {
  const original = { title: "Old title", availability_note: "Weekends" };
  const updated = { title: "New title", availability_note: "Weekends" };
  const draft = rebaseListingDraft(original, updated, {
    title: "Old title",
    availability: "After 5",
  });

  assert.deepEqual(
    buildListingPatch(updated, draft.title, draft.availability),
    {
      availability_note: "After 5",
    },
  );
});

test("after a status action, a draft title survives and untouched availability follows the server", () => {
  const original = { title: "Drill", availability_note: "Weekends" };
  const updated = { title: "Drill", availability_note: null };
  const draft = rebaseListingDraft(original, updated, {
    title: "Cordless drill",
    availability: "Weekends",
  });

  assert.deepEqual(
    buildListingPatch(updated, draft.title, draft.availability),
    {
      title: "Cordless drill",
    },
  );
});

test("a processing photo is ready only after the server returns ready", async () => {
  const statuses = ["processing", "ready"];
  const reads = [];
  let accepted;

  const id = await prepareListingMedia({
    mediaId: null,
    upload: async () => ({ id: "photo-1", status: "processing" }),
    onAccepted: (id) => {
      accepted = id;
    },
    getMedia: async (id) => {
      assert.equal(accepted, id);
      reads.push(id);
      return { id, status: statuses.shift() };
    },
    wait: async () => {},
  });

  assert.equal(id, "photo-1");
  assert.deepEqual(reads, ["photo-1", "photo-1"]);
});

test("confirms a ready upload with a media read before attachment", async () => {
  const reads = [];

  const id = await prepareListingMedia({
    mediaId: null,
    upload: async () => ({ id: "photo-1", status: "ready" }),
    onAccepted: () => {},
    getMedia: async (id) => {
      reads.push(id);
      return { id, status: "ready" };
    },
    wait: async () => {},
  });

  assert.equal(id, "photo-1");
  assert.deepEqual(reads, ["photo-1"]);
});

test("retry after an interrupted media read reuses the accepted ID", async () => {
  let mediaId = null;
  let uploads = 0;
  const interrupted = new Error("Connection interrupted");
  const upload = async () => {
    uploads += 1;
    return { id: "photo-1", status: "processing" };
  };
  const onAccepted = (id) => {
    mediaId = id;
  };
  const wait = async () => {};

  await assert.rejects(
    prepareListingMedia({
      mediaId,
      upload,
      onAccepted,
      getMedia: async () => {
        throw interrupted;
      },
      wait,
    }),
    interrupted,
  );
  assert.equal(mediaId, "photo-1");

  const id = await prepareListingMedia({
    mediaId,
    upload,
    onAccepted,
    getMedia: async (id) => ({ id, status: "ready" }),
    wait,
  });
  assert.equal(id, "photo-1");
  assert.equal(uploads, 1);
});

test("a rejected accepted photo cannot be attached to a listing", async () => {
  await assert.rejects(
    prepareListingMedia({
      mediaId: "photo-1",
      upload: async () => ({ id: "another-photo", status: "ready" }),
      onAccepted: () => {},
      getMedia: async (id) => ({ id, status: "rejected" }),
      wait: async () => {},
    }),
  );
});

test("leaving during an upload discards its late response before reading or retaining the photo", async () => {
  const latest = createLatestRequest();
  const request = latest.start();
  const upload = Promise.withResolvers();
  let accepted;
  const reads = [];
  const pending = prepareListingMedia({
    mediaId: null,
    signal: request.signal,
    upload: () => upload.promise,
    onAccepted: (id) => {
      accepted = id;
    },
    getMedia: async (id) => {
      reads.push(id);
      return { id, status: "ready" };
    },
  });

  latest.cancel();
  upload.resolve({ id: "photo-1", status: "processing" });

  await assert.rejects(pending);
  assert.equal(accepted, undefined);
  assert.deepEqual(reads, []);
});

test("leaving during a media polling delay prevents the next read", async () => {
  const latest = createLatestRequest();
  const request = latest.start();
  const waiting = Promise.withResolvers();
  const release = Promise.withResolvers();
  const reads = [];
  const pending = prepareListingMedia({
    mediaId: "photo-1",
    signal: request.signal,
    upload: async () => ({ id: "new-photo", status: "processing" }),
    onAccepted: () => {},
    getMedia: async (id) => {
      reads.push(id);
      return { id, status: reads.length === 1 ? "processing" : "ready" };
    },
    wait: () => {
      waiting.resolve();
      return release.promise;
    },
  });

  await waiting.promise;
  latest.cancel();
  release.resolve();

  await assert.rejects(pending);
  assert.deepEqual(reads, ["photo-1"]);
});

test("a slower request cannot override results for the current filter", async () => {
  const latest = createLatestRequest();
  const firstResponse = Promise.withResolvers();
  let visible;

  async function load(response) {
    const request = latest.start();
    const value = await response;
    if (request.isCurrent()) visible = value;
  }

  const olderLoad = load(firstResponse.promise);
  await load(Promise.resolve(["Cooking"]));
  firstResponse.resolve(["Drill"]);
  await olderLoad;

  assert.deepEqual(visible, ["Cooking"]);
});

test("cancel invalidates an in-flight request when its account signs out", () => {
  const latest = createLatestRequest();
  const previousAccountRequest = latest.start();
  assert.equal(previousAccountRequest.isCurrent(), true);

  latest.cancel();

  assert.equal(previousAccountRequest.signal.aborted, true);
  assert.equal(previousAccountRequest.isCurrent(), false);
});

test("paging keeps row order and updates overlapping listings in place", () => {
  const existing = [
    { id: "drill", status: "active" },
    { id: "saw", status: "active" },
  ];
  const incoming = [
    { id: "saw", status: "lent_out" },
    { id: "ladder", status: "paused" },
  ];

  assert.deepEqual(mergeListingPages(existing, incoming), [
    { id: "drill", status: "active" },
    { id: "saw", status: "lent_out" },
    { id: "ladder", status: "paused" },
  ]);
});
