import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { AppState } from "react-native";
import { ApiError, type Page } from "@/lib/api";
import { mergeRefreshedPage } from "@/lib/page-refresh";

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
  refreshInterval?: number,
) {
  const [page, setPage] = useState<Page<T>>({ items: [], next_cursor: null });
  const cursor = page.next_cursor;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [failedPage, setFailedPage] = useState(false);
  const active = useRef(false);
  const generation = useRef(0);
  const busy = useRef(false);
  const run = useCallback(
    async (next?: string | null, background = false) => {
      if ((next || background) && busy.current) return;
      const ticket = ++generation.current;
      busy.current = true;
      if (!background) {
        setLoading(true);
        setError(false);
      }
      try {
        const result = await loader(next);
        if (active.current && ticket === generation.current) {
          setPage((previous) =>
            next
              ? {
                  items: [
                    ...previous.items,
                    ...result.items.filter(
                      (item) =>
                        !previous.items.some(
                          (existing) => existing.id === item.id,
                        ),
                    ),
                  ],
                  next_cursor: result.next_cursor,
                }
              : background
                ? mergeRefreshedPage(previous, result)
                : result,
          );
          setError(false);
          setFailedPage(false);
        }
      } catch (cause) {
        if (active.current && ticket === generation.current) {
          const accessLost =
            cause instanceof ApiError && [401, 403, 404].includes(cause.status);
          if (refreshInterval && accessLost) {
            setPage({ items: [], next_cursor: null });
          }
          if (!background || accessLost) {
            setError(true);
            setFailedPage(Boolean(next));
          }
        }
      } finally {
        if (active.current && ticket === generation.current) {
          busy.current = false;
          setLoading(false);
        }
      }
    },
    [loader, refreshInterval],
  );
  const reload = useCallback(() => run(), [run]);
  useFocusEffect(
    useCallback(() => {
      active.current = true;
      setPage({ items: [], next_cursor: null });
      void reload();
      const timer = refreshInterval
        ? setInterval(() => {
            if (AppState.currentState === "active") void run(null, true);
          }, refreshInterval)
        : undefined;
      return () => {
        if (timer) clearInterval(timer);
        active.current = false;
        generation.current++;
        busy.current = false;
      };
    }, [refreshInterval, reload, run]),
  );
  return {
    items: page.items,
    cursor,
    loading,
    error,
    reload,
    loadMore: () => run(cursor),
    retry: () => (failedPage ? run(cursor) : run()),
  };
}
