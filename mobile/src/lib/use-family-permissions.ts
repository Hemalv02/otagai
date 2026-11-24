import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { AppState } from "react-native";

import type { FamilyLink, ProxyGrant } from "@/lib/api";
import { familyApi } from "@/lib/family-api";
import { useSession } from "@/lib/session";

export type PermissionSources =
  | { status: "loading" }
  | { status: "error" }
  | {
      status: "ready";
      links: FamilyLink[];
      asMember: ProxyGrant[];
      asCaretaker: ProxyGrant[];
      refreshFailed: boolean;
    };

type Entry = { owner: string; state: PermissionSources };

const loading: PermissionSources = { status: "loading" };

export function useFamilyPermissions() {
  const { session, profile } = useSession();
  const authUserId = session?.user.id ?? null;
  const selfId = profile.status === "ready" ? profile.profile.id : null;
  const selfName =
    profile.status === "ready" ? profile.profile.display_name : null;
  const [entry, setEntry] = useState<Entry | null>(null);
  const version = useRef(0);
  const sources =
    authUserId && entry?.owner === authUserId ? entry.state : loading;

  const refresh = useCallback(async () => {
    if (!authUserId) return;
    const owner = authUserId;
    const current = ++version.current;
    try {
      const [links, asMember, asCaretaker] = await Promise.all([
        familyApi.links(),
        familyApi.grants("member"),
        familyApi.grants("caretaker"),
      ]);
      if (current === version.current) {
        setEntry({
          owner,
          state: {
            status: "ready",
            links,
            asMember,
            asCaretaker,
            refreshFailed: false,
          },
        });
      }
    } catch {
      if (current === version.current) {
        setEntry((previous) => ({
          owner,
          state:
            previous?.owner === owner && previous.state.status === "ready"
              ? { ...previous.state, refreshFailed: true }
              : { status: "error" },
        }));
      }
    }
  }, [authUserId]);

  useFocusEffect(
    useCallback(() => {
      const initial = setTimeout(() => void refresh(), 0);
      const subscription = AppState.addEventListener("change", (status) => {
        if (status === "active") void refresh();
      });
      return () => {
        clearTimeout(initial);
        subscription.remove();
        version.current += 1;
      };
    }, [refresh]),
  );

  return { sources, refresh, authUserId, selfId, selfName };
}
