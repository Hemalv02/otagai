import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";

import { api, type Circle, type CircleMembership } from "@/lib/api";
import { getCircleAccess } from "@/lib/onboarding-state";
import { useSession } from "@/lib/session";

type MembershipState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; items: CircleMembership[]; refreshFailed: boolean };

type Entry = { profileId: string; state: MembershipState };

type MembershipContextValue = {
  state: MembershipState;
  access: ReturnType<typeof getCircleAccess>;
  refreshing: boolean;
  refresh: () => Promise<void>;
  record: (circle: Circle, membership: CircleMembership) => void;
};

const loading: MembershipState = { status: "loading" };
const MembershipContext = createContext<MembershipContextValue | null>(null);

export function MembershipProvider({ children }: PropsWithChildren) {
  const { profile } = useSession();
  const profileId = profile.status === "ready" ? profile.profile.id : null;
  const [entry, setEntry] = useState<Entry | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const version = useRef(0);
  const state =
    profileId && entry?.profileId === profileId ? entry.state : loading;

  const refresh = useCallback(async () => {
    if (!profileId) return;
    const current = ++version.current;
    setRefreshing(true);
    try {
      const items = await api.listMemberships();
      if (current === version.current) {
        setEntry({
          profileId,
          state: { status: "ready", items, refreshFailed: false },
        });
      }
    } catch {
      if (current === version.current) {
        setEntry((previous) => ({
          profileId,
          state:
            previous?.profileId === profileId &&
            previous.state.status === "ready"
              ? { ...previous.state, refreshFailed: true }
              : { status: "error" },
        }));
      }
    } finally {
      if (current === version.current) setRefreshing(false);
    }
  }, [profileId]);

  useEffect(() => {
    const initial = setTimeout(() => void refresh(), 0);
    const subscription = AppState.addEventListener("change", (status) => {
      if (status === "active") void refresh();
    });
    return () => {
      clearTimeout(initial);
      version.current += 1;
      subscription.remove();
    };
  }, [refresh]);

  const record = useCallback(
    (circle: Circle, membership: CircleMembership) => {
      if (!profileId) return;
      version.current += 1;
      setRefreshing(false);
      setEntry((previous) => {
        const items =
          previous?.profileId === profileId && previous.state.status === "ready"
            ? previous.state.items
            : [];
        return {
          profileId,
          state: {
            status: "ready",
            items: [
              { ...membership, circle },
              ...items.filter((item) => item.circle_id !== circle.id),
            ],
            refreshFailed: false,
          },
        };
      });
    },
    [profileId],
  );

  const access = getCircleAccess(
    state.status === "ready" ? state.items.map((row) => row.status) : [],
  );
  const value = useMemo<MembershipContextValue>(
    () => ({ state, access, refreshing, refresh, record }),
    [state, access, refreshing, refresh, record],
  );

  return (
    <MembershipContext.Provider value={value}>
      {children}
    </MembershipContext.Provider>
  );
}

export function useMemberships() {
  const value = useContext(MembershipContext);
  if (!value)
    throw new Error("useMemberships must be used inside MembershipProvider.");
  return value;
}
