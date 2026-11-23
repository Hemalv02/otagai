import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import type { Page } from "@/lib/api";

export function useCurrentTime() {
  const [now, setNow] = useState(() => Date.now());
  useFocusEffect(
    useCallback(() => {
      setNow(Date.now());
      const timer = setInterval(() => setNow(Date.now()), 60_000);
      return () => clearInterval(timer);
    }, []),
  );
  return now;
}

export function useLiveResource<T>(loader: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const generation = useRef(0);
  const active = useRef(false);
  const reload = useCallback(async () => {
    const ticket = ++generation.current;
    setLoading(true);
    setError(false);
    try {
      const result = await loader();
      if (active.current && ticket === generation.current) setData(result);
      return result;
    } catch {
      if (active.current && ticket === generation.current) setError(true);
      return undefined;
    } finally {
      if (active.current && ticket === generation.current) setLoading(false);
    }
  }, [loader]);
  useFocusEffect(
    useCallback(() => {
      active.current = true;
      setData(null);
      void reload();
      return () => {
        active.current = false;
        generation.current++;
      };
    }, [reload]),
  );
  return { data, loading, error, reload };
}

export function usePagedResource<T extends { id: string }>(
  loader: (cursor?: string | null) => Promise<Page<T>>,
) {
  const [items, setItems] = useState<T[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [failedPage, setFailedPage] = useState(false);
  const active = useRef(false);
  const generation = useRef(0);
  const busy = useRef(false);
  const run = useCallback(
    async (next?: string | null) => {
      if (next && busy.current) return;
      const ticket = ++generation.current;
      busy.current = true;
      setLoading(true);
      setError(false);
      try {
        const page = await loader(next);
        if (active.current && ticket === generation.current) {
          setItems((previous) =>
            next
              ? [
                  ...previous,
                  ...page.items.filter(
                    (item) =>
                      !previous.some((existing) => existing.id === item.id),
                  ),
                ]
              : page.items,
          );
          setCursor(page.next_cursor);
          setFailedPage(false);
        }
      } catch {
        if (active.current && ticket === generation.current) {
          setError(true);
          setFailedPage(Boolean(next));
        }
      } finally {
        if (active.current && ticket === generation.current) {
          busy.current = false;
          setLoading(false);
        }
      }
    },
    [loader],
  );
  const reload = useCallback(() => run(), [run]);
  useFocusEffect(
    useCallback(() => {
      active.current = true;
      setItems([]);
      setCursor(null);
      void reload();
      return () => {
        active.current = false;
        generation.current++;
        busy.current = false;
      };
    }, [reload]),
  );
  return {
    items,
    cursor,
    loading,
    error,
    reload,
    loadMore: () => run(cursor),
    retry: () => (failedPage ? run(cursor) : run()),
  };
}
