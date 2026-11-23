import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";

import { ApiError, api, type FamilyLink, type ProxyGrant } from "@/lib/api";
import {
  buildFamilyOverview,
  failureResult,
  type FamilyAccount,
  type FamilyLinkRow,
  nextRequestsEntry,
  type RequestsEntry,
  type RequestsResult,
  requestsViewFor,
  retainSelection,
  selectAccount,
} from "@/lib/family-state";
import { useSession } from "@/lib/session";

type SourcesState =
  | { status: "loading" }
  | { status: "error" }
  | {
      status: "ready";
      links: FamilyLink[];
      grants: ProxyGrant[];
      refreshFailed: boolean;
    };

export type FamilyState =
  | { status: "loading" }
  | { status: "error" }
  | {
      status: "ready";
      accounts: FamilyAccount[];
      links: FamilyLinkRow[];
      selected: FamilyAccount;
      requests: ReturnType<typeof requestsViewFor>;
      refreshFailed: boolean;
    };

function toResult(error: unknown): RequestsResult {
  return failureResult(
    error instanceof ApiError ? error.status : 0,
    error instanceof Error ? error.message : "",
  );
}

export function useFamily() {
  const { profile } = useSession();
  const selfId = profile.status === "ready" ? profile.profile.id : null;
  const selfName =
    profile.status === "ready" ? profile.profile.display_name : null;
  const [sources, setSources] = useState<SourcesState>({ status: "loading" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [entry, setEntry] = useState<RequestsEntry | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [lostAccess, setLostAccess] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const sourcesVersion = useRef(0);

  const overview = useMemo(
    () =>
      selfId !== null && selfName !== null && sources.status === "ready"
        ? buildFamilyOverview(
            { id: selfId, display_name: selfName },
            sources.links,
            sources.grants,
          )
        : null,
    [selfId, selfName, sources],
  );
  const selected = overview
    ? selectAccount(overview.accounts, selectedId)
    : null;
  const selectedKey = selected?.id ?? null;
  const selectedName = selected?.name ?? "";
  const canView = selected?.canViewActivity ?? false;
  const isSelf = selected?.isSelf ?? true;

  const loadSources = useCallback(async () => {
    if (selfId === null) return;
    const current = ++sourcesVersion.current;
    try {
      const [links, grants] = await Promise.all([
        api.listFamilyLinks(),
        api.listCaretakerGrants(),
      ]);
      if (current === sourcesVersion.current) {
        const { accounts } = buildFamilyOverview(
          { id: selfId, display_name: "" },
          links,
          grants,
        );
        setSelectedId((selection) => retainSelection(accounts, selection));
        setSources({ status: "ready", links, grants, refreshFailed: false });
      }
    } catch {
      if (current === sourcesVersion.current) {
        setSources((previous) =>
          previous.status === "ready"
            ? { ...previous, refreshFailed: true }
            : { status: "error" },
        );
      }
    }
  }, [selfId]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setReloadToken((token) => token + 1);
    try {
      await loadSources();
    } finally {
      setRefreshing(false);
    }
  }, [loadSources]);

  useFocusEffect(
    useCallback(() => {
      const initial = setTimeout(() => void refresh(), 0);
      const subscription = AppState.addEventListener("change", (status) => {
        if (status === "active") void refresh();
      });
      return () => {
        clearTimeout(initial);
        subscription.remove();
      };
    }, [refresh]),
  );

  useEffect(() => {
    if (selectedKey === null || !canView) return;
    const controller = new AbortController();
    let active = true;
    api
      .listOpenRequests({
        actingFor: isSelf ? undefined : selectedKey,
        signal: controller.signal,
      })
      .then(
        (items): RequestsResult => ({ ok: true, items }),
        (error: unknown) => toResult(error),
      )
      .then((result) => {
        if (!active) return;
        setEntry((previous) =>
          nextRequestsEntry(previous, selectedKey, result),
        );
        if (!result.ok && result.denied) {
          setLostAccess({ id: selectedKey, name: selectedName });
          void loadSources();
        }
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [selectedKey, selectedName, canView, isSelf, reloadToken, loadSources]);

  function select(accountId: string) {
    if (accountId === selectedKey) return;
    setSelectedId(accountId);
    setEntry(null);
    setLostAccess(null);
  }

  const retryRequests = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  const state: FamilyState =
    overview && selected && sources.status === "ready"
      ? {
          status: "ready",
          accounts: overview.accounts,
          links: overview.links,
          selected,
          requests: requestsViewFor(entry, selected),
          refreshFailed: sources.refreshFailed,
        }
      : { status: sources.status === "error" ? "error" : "loading" };

  const fellBackFrom =
    lostAccess && lostAccess.id !== selectedKey ? lostAccess.name : null;

  return {
    state,
    lostAccess: fellBackFrom,
    refreshing,
    refresh,
    select,
    retryRequests,
  };
}
