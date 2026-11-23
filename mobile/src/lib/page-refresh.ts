import type { Page } from "@/lib/api";

export function mergeRefreshedPage<T extends { id: string }>(
  previous: Page<T>,
  newest: Page<T>,
): Page<T> {
  const boundary = newest.items.at(-1);
  if (!boundary || !newest.next_cursor) return newest;

  const overlap = previous.items.findIndex((item) => item.id === boundary.id);
  const tail = overlap >= 0 ? previous.items.slice(overlap + 1) : [];
  if (!tail.length) return newest;

  const refreshedIds = new Set(newest.items.map((item) => item.id));
  return {
    items: [
      ...newest.items,
      ...tail.filter((item) => !refreshedIds.has(item.id)),
    ],
    next_cursor: previous.next_cursor,
  };
}
