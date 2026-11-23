import type {
  ListingDetail,
  ListingKind,
  ListingStatus,
  ListingSummary,
} from "./api";

type MediaState = { id: string; status: string };
type ListingEditFields = Pick<ListingDetail, "title" | "availability_note">;

export function buildListingPatch(
  listing: ListingEditFields,
  title: string,
  availability: string,
) {
  const patch: { title?: string; availability_note?: string | null } = {};
  if (title !== listing.title) patch.title = title.trim();
  if (availability !== (listing.availability_note ?? "")) {
    patch.availability_note = availability.trim() || null;
  }
  return patch;
}

export function rebaseListingDraft(
  previous: ListingEditFields,
  updated: ListingEditFields,
  draft: { title: string; availability: string },
) {
  return {
    title: draft.title === previous.title ? updated.title : draft.title,
    availability:
      draft.availability === (previous.availability_note ?? "")
        ? (updated.availability_note ?? "")
        : draft.availability,
  };
}

export function reconcileListingRows(
  rows: ListingSummary[],
  listing: Pick<ListingDetail, "id" | "title" | "kind" | "status">,
  kind: "all" | ListingKind,
  status: "all" | ListingStatus,
) {
  if (
    (kind !== "all" && listing.kind !== kind) ||
    (status !== "all" && listing.status !== status)
  ) {
    return rows.filter((row) => row.id !== listing.id);
  }
  return rows.map((row) =>
    row.id === listing.id
      ? {
          ...row,
          title: listing.title,
          kind: listing.kind,
          status: listing.status,
        }
      : row,
  );
}

export async function prepareListingMedia({
  mediaId,
  upload,
  getMedia,
  onAccepted,
  signal,
  wait = () => new Promise<void>((resolve) => setTimeout(resolve, 1000)),
}: {
  mediaId: string | null;
  upload: () => Promise<MediaState>;
  getMedia: (id: string) => Promise<MediaState>;
  onAccepted: (id: string) => void;
  signal?: AbortSignal;
  wait?: () => Promise<void>;
}): Promise<string> {
  function checkCanceled() {
    if (signal?.aborted) throw new Error("Photo preparation canceled");
  }

  checkCanceled();
  let media = mediaId ? await getMedia(mediaId) : await upload();
  checkCanceled();
  onAccepted(media.id);
  if (!mediaId) media = await getMedia(media.id);
  for (let count = 0; count < 15; count++) {
    checkCanceled();
    if (media.status === "ready") return media.id;
    if (media.status !== "processing") throw new Error("Photo rejected");
    await wait();
    checkCanceled();
    media = await getMedia(media.id);
  }
  checkCanceled();
  if (media.status === "ready") return media.id;
  throw new Error("Photo is still processing");
}

export function createLatestRequest() {
  let generation = 0;
  let controller: AbortController | null = null;
  return {
    start() {
      controller?.abort();
      const own = ++generation;
      const current = new AbortController();
      controller = current;
      return {
        signal: current.signal,
        isCurrent: () => own === generation && !current.signal.aborted,
      };
    },
    cancel() {
      generation++;
      controller?.abort();
      controller = null;
    },
  };
}

export function mergeListingPages<T extends { id: string }>(
  existing: T[],
  incoming: T[],
): T[] {
  const result = [...existing];
  for (const row of incoming) {
    const index = result.findIndex((item) => item.id === row.id);
    if (index < 0) result.push(row);
    else result[index] = row;
  }
  return result;
}
